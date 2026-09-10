import { clone, uid, now, requireValue, validText, validId, assertSafeJSON } from './common.js';
import { blankDocument, validateDocument, remapDocument, extractSelection } from './document.js';
export * from './common.js';
export * from './document.js';
export const MAP_SCHEMA = 'iquipage.maps/1';
export const COLLECTIONS = ['maps', 'templates', 'runs', 'tasks', 'rules'];
export function createMap({ projectId, title = 'Новая карта', kind = 'permanent', document = blankDocument(title), flow = null, templateOrigin = null }) {
  requireValue(validId(projectId), 'INVALID_PROJECT', 'Не задан проект.');
  requireValue(['permanent', 'session'].includes(kind), 'INVALID_KIND', 'Выберите постоянную или сессионную карту.');
  title = title.trim() || 'Новая карта';
  return { schema: MAP_SCHEMA, id: uid('map'), projectId, title, kind, status: kind === 'session' ? 'draft' : 'active', revision: 0,
    createdAt: now(), updatedAt: now(), document: { ...validateDocument(document), title, revision: 0 }, flow: clone(flow), templateOrigin, summary: '',
    session: kind === 'session' ? { phase: 'collect', timer: { remaining: 300, endsAt: null }, votes: {}, voteLimit: 3 } : null };
}
export function validateMap(map) {
  assertSafeJSON(map);
  requireValue(map?.schema === MAP_SCHEMA && validId(map.id) && validId(map.projectId), 'INVALID_MAP', 'Неподдерживаемый документ карты.');
  requireValue(validText(map.title, 240) && map.title.trim(), 'INVALID_TITLE', 'Введите название до 240 символов.');
  requireValue(['permanent', 'session'].includes(map.kind) && ['draft', 'active', 'paused', 'archived'].includes(map.status), 'INVALID_STATE', 'Неподдерживаемое состояние карты.');
  requireValue(Number.isInteger(map.revision) && map.revision >= 0, 'INVALID_REVISION', 'Некорректная версия карты.');
  validateDocument(map.document);
  requireValue(validText(map.summary || '', 50000), 'SUMMARY_LIMIT', 'Итог слишком большой.');
  if (map.kind === 'session') {
    const session = map.session;
    requireValue(session && ['collect', 'discuss', 'vote', 'outcomes'].includes(session.phase), 'INVALID_SESSION', 'Не задан этап сессии.');
    requireValue(session.timer && Number.isInteger(session.timer.remaining) && session.timer.remaining >= 0 && session.timer.remaining <= 14400, 'INVALID_TIMER', 'Таймер должен содержать от 0 до 240 минут.');
    requireValue(session.timer.endsAt === null || (typeof session.timer.endsAt === 'string' && Number.isFinite(Date.parse(session.timer.endsAt))), 'INVALID_TIMER', 'Некорректное время завершения таймера.');
    requireValue(Number.isInteger(session.voteLimit) && session.voteLimit > 0 && session.voteLimit <= 100, 'INVALID_VOTES', 'Проверьте лимит голосов.');
    requireValue(session.votes && !Array.isArray(session.votes) && typeof session.votes === 'object', 'INVALID_VOTES', 'Некорректные голоса.');
    const votes = Object.values(session.votes);
    requireValue(votes.every(n => Number.isInteger(n) && n >= 0) && votes.reduce((a, b) => a + b, 0) <= session.voteLimit, 'INVALID_VOTES', 'Превышен лимит голосов.');
  }
  if (map.flow !== null && map.flow !== undefined) {
    const flow = map.flow;
    requireValue(flow.schema === 'iquipage.flow/1' && Array.isArray(flow.nodes) && Array.isArray(flow.edges) && flow.nodes.length <= 100 && flow.edges.length <= 200, 'INVALID_FLOW', 'Неподдерживаемый формат сценария действий.');
    requireValue(Number.isInteger(flow.version) && flow.version >= 1, 'INVALID_FLOW', 'Не задана версия сценария.');
    for (const node of flow.nodes) requireValue(node && validId(node.id) && ['input', 'transform', 'condition', 'llm', 'approval', 'task', 'output'].includes(node.kind) && validText(node.title, 240) && Number.isFinite(node.x) && Number.isFinite(node.y) && node.config && typeof node.config === 'object', 'INVALID_FLOW', 'Не удалось прочитать один из шагов сценария.');
    for (const edge of flow.edges) requireValue(edge && validId(edge.id) && validId(edge.source) && validId(edge.target), 'INVALID_FLOW', 'Не удалось прочитать связь сценария.');
    if (flow.annotations) validateDocument(flow.annotations);
  }
  return clone(map);
}
export function transitionMap(map, action, { summary = '' } = {}) {
  validateMap(map);
  requireValue(map.status !== 'archived', 'ARCHIVED', 'Архивная карта неизменяема. Создайте продолжение.');
  const result = clone(map);
  if (action === 'archive') {
    requireValue(map.kind === 'permanent' || ['active', 'paused'].includes(map.status), 'INVALID_TRANSITION', 'Сначала начните сессию.');
    result.status = 'archived'; result.archivedAt = now(); result.summary = summary.trim();
    if (result.session) result.session.timer = { remaining: 0, endsAt: null };
  } else {
    requireValue(map.kind === 'session', 'INVALID_TRANSITION', 'Это действие относится к сессии.');
    const target = { start: { draft: 'active' }, pause: { active: 'paused' }, resume: { paused: 'active' } }[action]?.[map.status];
    requireValue(target, 'INVALID_TRANSITION', 'Переход недоступен в текущем состоянии.'); result.status = target;
    if (action === 'start') result.startedAt = now();
    if (action === 'pause' && result.session.timer.endsAt) result.session.timer = { remaining: Math.max(0, Math.ceil((Date.parse(result.session.timer.endsAt) - Date.now()) / 1000)), endsAt: null };
  }
  return result;
}
export function forkMap(source, { kind = source.kind, title = `${source.title} — продолжение` } = {}) {
  const map = createMap({ projectId: source.projectId, title, kind, document: remapDocument(source.document, { clearPersonal: true }), flow: source.flow, templateOrigin: source.templateOrigin });
  map.sourceMapId = source.id; map.sourceRevision = source.revision; return map;
}
export function templateFromMap(map, { title, description = '', when = '', scope = 'project', selectedIds = null, includeContent = false } = {}) {
  requireValue(validText(title, 160) && title.trim(), 'INVALID_TITLE', 'Введите название шаблона.');
  requireValue(['personal', 'project', 'workspace'].includes(scope), 'INVALID_SCOPE', 'Неизвестная область видимости.');
  let document = selectedIds?.length ? extractSelection(map.document, selectedIds) : clone(map.document);
  requireValue(document.objects.length > 0, 'EMPTY_TEMPLATE', 'Выберите непустой фрагмент или добавьте объекты.');
  document = remapDocument(document, { clearPersonal: true });
  if (!includeContent) document.objects = document.objects.filter(o => o.type !== 'image').map(o => ({ ...o,
    text: ['frame', 'shape'].includes(o.type) ? o.text : o.type === 'task' ? 'Следующее действие' : o.type === 'text' ? 'Название темы' : 'Новая мысль' }));
  const ids = new Set(document.objects.map(o => o.id)); document.connections = document.connections.filter(e => ids.has(e.from) && ids.has(e.to));
  return { schema: 'iquipage.template/1', id: uid('template'), projectId: map.projectId, revision: 0, version: 1, title: title.trim(), description, when, scope,
    kind: map.kind, category: 'Мои шаблоны', createdAt: now(), document, flow: null, sourceMapId: map.id, sourceRevision: map.revision };
}
export function prepareWrite(collection, value, previous, baseRevision) {
  requireValue(COLLECTIONS.includes(collection), 'INVALID_COLLECTION', 'Неизвестная коллекция.'); assertSafeJSON(value);
  requireValue(validId(value.id) && validId(value.projectId), 'INVALID_ID', 'Не заданы идентификаторы.');
  requireValue((previous?.revision ?? 0) === baseRevision, 'CONFLICT', 'Документ изменился в другой вкладке. Ваша копия сохранена.');
  requireValue(!previous || previous.projectId === value.projectId, 'PROJECT_MISMATCH', 'Проект записи нельзя менять через сохранение.');
  if (collection === 'maps') {
    validateMap(value); requireValue(previous?.status !== 'archived', 'ARCHIVED', 'Архив нельзя перезаписать. Создайте продолжение.');
    requireValue(!previous || previous.kind === value.kind, 'INVALID_KIND', 'Для смены формата создайте отдельную копию.');
    const transitions = value.kind === 'session' ? { draft: ['draft', 'active'], active: ['active', 'paused', 'archived'], paused: ['paused', 'active', 'archived'] } : { active: ['active', 'archived'] };
    requireValue(!previous || transitions[previous.status]?.includes(value.status), 'INVALID_TRANSITION', 'Недопустимый переход состояния карты.');
    requireValue(value.kind === 'session' || ['active', 'archived'].includes(value.status), 'INVALID_STATE', 'Постоянная карта не может быть сессией.');
    if (value.status === 'archived') requireValue(typeof value.archivedAt === 'string' && Number.isFinite(Date.parse(value.archivedAt)), 'INVALID_ARCHIVE', 'Не задан момент завершения.');
  }
  if (collection === 'templates') { validateDocument(value.document); requireValue(validText(value.title, 160) && value.title.trim(), 'INVALID_TITLE', 'Введите название шаблона.'); }
  const next = clone(value); next.revision = baseRevision + 1; next.updatedAt = now();
  if (collection === 'maps') { next.document.title = next.title; next.document.revision = next.revision; }
  return next;
}
