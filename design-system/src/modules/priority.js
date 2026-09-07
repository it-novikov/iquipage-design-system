"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorities = void 0;
exports.normalizePriority = normalizePriority;
exports.priorityBadge = priorityBadge;
exports.priorityOptions = priorityOptions;
const icons_js_1 = require("./icons.js");
/** Stable, explicit values shared by cards, tables and task detail. */
exports.priorities = Object.freeze({
    critical: { label: 'Критический', short: 'Критический', rank: 0, icon: 'flag' },
    high: { label: 'Высокий', short: 'Высокий', rank: 1, icon: 'priority' },
    normal: { label: 'Обычный', short: 'Обычный', rank: 2, icon: 'minus' },
    low: { label: 'Низкий', short: 'Низкий', rank: 3, icon: 'low' }
});
function normalizePriority(value) { return Object.hasOwn(exports.priorities, value) ? value : 'normal'; }
function priorityBadge(value, compact = false) {
    const key = normalizePriority(value), p = exports.priorities[key];
    return `<span class="iq-priority ${compact ? 'compact' : ''}" data-priority="${key}" aria-label="Приоритет: ${p.label.toLocaleLowerCase('ru')}"><span>${p.short}</span></span>`;
}
function priorityOptions() { return Object.entries(exports.priorities).map(([value, p]) => ({ value, label: p.label })); }

