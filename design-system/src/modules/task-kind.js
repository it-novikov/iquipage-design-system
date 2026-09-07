"use strict";
/** A task's type is independent from its priority. Higher priority owns the accent. */
const taskKinds = Object.freeze({ task: {label:'Задача'}, epic: {label:'Эпик'} });
function normalizeTaskKind(value) { return Object.hasOwn(taskKinds, value) ? value : 'task'; }
function taskKindOptions() { return Object.entries(taskKinds).map(([value, k]) => ({value, label:k.label})); }
exports.taskKinds = taskKinds;
exports.normalizeTaskKind = normalizeTaskKind;
exports.taskKindOptions = taskKindOptions;

const priority = require('./priority.js');
function taskSignal(task) {
 const p = priority.normalizePriority(task.priority);
 const kind = normalizeTaskKind(task.type);
 const urgent = p === 'critical' || p === 'high';
 return `<span class="task-signal-copy" data-signal="${urgent ? p : kind}">${kind === 'epic' ? '<span class="task-epic-label">Эпик</span>' : ''}${urgent ? `<span class="task-urgency-label">${priority.priorities[p].label}</span>` : ''}</span>`;
}
exports.taskSignal = taskSignal;


/** Exactly one visual emphasis. Completion/status is intentionally not an input. */
function taskEmphasis(task = {}) {
 const p = priority.normalizePriority(task?.priority);
 if (p === 'critical' || p === 'high') return p;
 return normalizeTaskKind(task?.type) === 'epic' ? 'epic' : 'none';
}
exports.taskEmphasis = taskEmphasis;

