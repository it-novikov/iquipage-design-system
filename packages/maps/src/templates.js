import discussions from './templates-discussions.js';
import systems from './templates-systems.js';
export const BUILTIN_TEMPLATES = [...discussions, ...systems];
export function findTemplate(id, custom = []) { return [...BUILTIN_TEMPLATES, ...custom].find(t => t.id === id); }
export function filterTemplates(templates, { query = '', category = 'Все' } = {}) {
  const q = query.trim().toLocaleLowerCase('ru');
  return templates.filter(t => (category === 'Все' || t.category === category) && (!q || [t.title, t.description, t.when, t.category].join(' ').toLocaleLowerCase('ru').includes(q)));
}
