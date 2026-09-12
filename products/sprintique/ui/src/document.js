import { clone, uid, requireValue, validText, validId, assertSafeJSON } from './common.js';
export function blankDocument(title = 'Новая карта') {
  return { schema: 'iquipage.whiteboard/1', title, revision: 0, objects: [], connections: [] };
}
export function validateDocument(document) {
  assertSafeJSON(document);
  requireValue(document && Array.isArray(document.objects) && Array.isArray(document.connections), 'INVALID_DOCUMENT', 'Нужны объекты и связи карты.');
  requireValue(document.objects.length <= 600 && document.connections.length <= 1600, 'MAP_LIMIT', 'В этой версии поддерживается до 600 объектов и 1600 связей.');
  const ids = new Set();
  for (const object of document.objects) {
    requireValue(validId(object.id) && !ids.has(object.id), 'INVALID_ID', 'Идентификаторы объектов должны быть уникальными.'); ids.add(object.id);
    requireValue(['sticky', 'text', 'shape', 'frame', 'task', 'image', 'drawing'].includes(object.type), 'INVALID_OBJECT', 'Неизвестный тип объекта.');
    requireValue(validText(object.text), 'TEXT_LIMIT', 'Текст объекта: не более 10 000 символов.');
    requireValue(['x', 'y', 'width', 'height'].every(k => Number.isFinite(object[k])) && Math.abs(object.x) <= 100000 && Math.abs(object.y) <= 100000 && object.width >= 40 && object.width <= 10000 && object.height >= 32 && object.height <= 10000, 'INVALID_GEOMETRY', 'Проверьте размеры и положение объекта.');
    if (object.type === 'image') requireValue(typeof object.src === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(object.src) && object.src.length <= 7500000, 'INVALID_IMAGE', 'Допустимы встроенные PNG, JPEG и WebP до 5 МБ.');
  }
  const byId = new Map(document.objects.map(o => [o.id, o]));
  for (const object of document.objects) if (object.parentId) {
    requireValue(byId.get(object.parentId)?.type === 'frame' && object.parentId !== object.id, 'INVALID_PARENT', 'Область назначения не найдена.');
    const seen = new Set([object.id]); let parent = object;
    while (parent?.parentId) {
      requireValue(!seen.has(parent.parentId), 'PARENT_CYCLE', 'Вложенность областей не может быть циклической.');
      seen.add(parent.parentId); parent = byId.get(parent.parentId);
    }
  }
  for (const edge of document.connections) {
    requireValue(validId(edge.id) && !ids.has(edge.id), 'INVALID_ID', 'Идентификаторы связей должны быть уникальными.'); ids.add(edge.id);
    requireValue(byId.has(edge.from) && byId.has(edge.to) && edge.from !== edge.to, 'INVALID_EDGE', 'Связь должна соединять два существующих объекта.');
  }
  return clone(document);
}
export function remapDocument(document, { offsetX = 0, offsetY = 0, clearPersonal = false } = {}) {
  const next = validateDocument(document), ids = new Map(next.objects.map(o => [o.id, uid('object')]));
  next.objects = next.objects.map(o => {
    const result = { ...o, id: ids.get(o.id), x: o.x + offsetX, y: o.y + offsetY };
    if (o.parentId) result.parentId = ids.get(o.parentId);
    if (clearPersonal) { delete result.author; delete result.owner; delete result.externalTaskId; if (o.type === 'task') result.done = false; }
    return result;
  });
  next.connections = next.connections.map(e => ({ ...e, id: uid('edge'), from: ids.get(e.from), to: ids.get(e.to) }));
  next.revision = 0; return next;
}
export function insertDocument(current, incoming, { offsetX = 80, offsetY = 80 } = {}) {
  const addition = remapDocument(incoming, { offsetX, offsetY });
  return validateDocument({ ...current, objects: [...current.objects, ...addition.objects], connections: [...current.connections, ...addition.connections] });
}
export function extractSelection(document, selectedIds) {
  const ids = new Set(selectedIds); let grew = true;
  while (grew) {
    grew = false;
    for (const o of document.objects) if (o.parentId && ids.has(o.parentId) && !ids.has(o.id)) { ids.add(o.id); grew = true; }
  }
  const result = clone(document);
  result.objects = result.objects.filter(o => ids.has(o.id)).map(o => { if (o.parentId && !ids.has(o.parentId)) delete o.parentId; return o; });
  result.connections = result.connections.filter(e => ids.has(e.from) && ids.has(e.to));
  return result;
}
