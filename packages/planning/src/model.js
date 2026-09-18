import {validDate} from './date-value.js';
/** Validates the consumer projection, not the backend's Task/Release records. */
export const PROTOCOL = 'sprintique.planning-view/1';
export function invariant(condition, message) { if (!condition) throw new Error(message); }
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const identifier = v => typeof v === 'string' && v.length > 0 && v.length <= 240;
const text = (v, max = 1000) => typeof v === 'string' && v.length <= max;
const count = v => Number.isSafeInteger(v) && v >= 0;
export function validateGroups(page, projectId) {
  invariant(object(page) && page.protocol === PROTOCOL && page.projectId === projectId,
    'Получен неподдерживаемый ответ Планирования. Обновите подключение.');
  invariant(Array.isArray(page.items) && page.items.length <= 100, 'Некорректная страница релизов.');
  invariant(page.nextCursor === null || identifier(page.nextCursor), 'Некорректный курсор релизов.');
  invariant(identifier(page.revision), 'Не задана версия состава.');
  const ids = new Set();
  for (const group of page.items) {
    invariant(object(group) && identifier(group.id) && !ids.has(group.id), 'Повторяющаяся группа.'); ids.add(group.id);
    invariant(text(group.title, 240) && ['active', 'planned', 'backlog', 'closed', 'cancelled'].includes(group.state), 'Некорректная группа.');
    invariant(count(group.total) && count(group.matched) && group.matched <= group.total, 'Некорректное количество задач.');
    invariant(text(group.dateLabel ?? '') && text(group.formatLabel ?? ''), 'Некорректная подпись релиза.');
  }
  invariant(page.capabilities===undefined||object(page.capabilities)&&Object.values(page.capabilities).every(v=>typeof v==='boolean'), 'Invalid planning capabilities');
  return page;
}
export function validateRows(page, projectId, groupId, revision) {
  invariant(object(page) && page.projectId === projectId && page.groupId === groupId,
    'Ответ относится к другому проекту или релизу.');
  invariant(page.revision === revision, 'Состав изменился. Обновите Планирование.');
  invariant(Array.isArray(page.rows) && page.rows.length <= 200, 'Некорректная страница задач.');
  invariant(page.nextCursor === null || identifier(page.nextCursor), 'Некорректный курсор задач.');
  const ids = new Set();
  for (const row of page.rows) {
    invariant(object(row) && identifier(row.id) && !ids.has(row.id), 'Повторяющаяся строка.'); ids.add(row.id);
    invariant(identifier(row.taskId) && text(row.key, 100) && text(row.title, 240), 'Некорректная задача.');
    invariant(count(row.depth) && row.depth <= 100 && count(row.childrenCount), 'Некорректная иерархия.');
    invariant(['task', 'bug', 'epic'].includes(row.type) && ['draft', 'ready'].includes(row.preparation), 'Некорректный тип задачи.');
    invariant(row.ownerId===undefined||text(row.ownerId,240), 'Некорректная идентичность исполнителя.');
    invariant(row.dueValue===undefined||row.dueValue===null||validDate(row.dueValue), 'Некорректный срок.');
    invariant(text(row.statusLabel, 120) && text(row.ownerLabel ?? '', 120) && text(row.dateLabel ?? '', 120), 'Некорректные свойства задачи.');
    invariant(typeof row.contextOnly === 'boolean' && typeof row.selectable === 'boolean', 'Не указаны возможности строки.');
    invariant(['normal','low','high','critical'].includes(row.priority), 'Некорректный приоритет.');
  }
  return page;
}
export const selectableRows = groups => groups.flatMap(g => g.folded ? [] : g.rows).filter(r => !r.contextOnly && r.selectable);
export function mergeRows(previous, next) {
  const known = new Set(previous.map(row => row.id));
  invariant(!next.some(row => known.has(row.id)), 'Страница задач пересекается с предыдущей. Обновите список.');
  return [...previous, ...next];
}
/** Selection is task identity. Disclosure and selection are independent. */
export class Selection {
  ids = new Set(); anchor = null; snapshot = null;
  toggle(id, rows, range = false) {
    if(this.snapshot)return;
    const available = rows.map(row => row.taskId);
    if (!available.includes(id)) return;
    const end = available.indexOf(id), start = available.indexOf(this.anchor);
    if (range && start >= 0) {
      const select = !this.ids.has(id);
      for (const key of available.slice(Math.min(start,end), Math.max(start,end)+1)) select ? this.ids.add(key) : this.ids.delete(key);
    } else this.ids.has(id) ? this.ids.delete(id) : this.ids.add(id);
    this.anchor = id;
  }
  all(rows) {
    if(this.snapshot)return;
    const ids = rows.map(r => r.taskId), remove = ids.length > 0 && ids.every(id => this.ids.has(id));
    for (const id of ids) remove ? this.ids.delete(id) : this.ids.add(id);
  }
  clear() { this.ids.clear(); this.anchor = null; this.snapshot = null; }
  summary(rows) { if(this.snapshot)return {total:this.snapshot.count,hidden:0,snapshot:true};const visible = new Set(rows.map(r => r.taskId)); return {total:this.ids.size, hidden:[...this.ids].filter(id=>!visible.has(id)).length}; }
}
