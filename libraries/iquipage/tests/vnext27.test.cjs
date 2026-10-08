'use strict';
/** Contracts for 0.6.0-vnext.27: the property list .iq-properties[data-label=wide] and the values it needs. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
globalThis.HTMLElement ??= class {};
const { IqDateField } = require('../src/modules/date-field.js');
const { personAvatar } = require('../src/modules/ui.js');
const { icon } = require('../src/modules/icons.js');
const css = read('src/styles/foundation.css'), components = read('src/modules/components.js'), dateField = read('src/modules/date-field.js');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('the wide list: 36px rows, a 120px label column of 13/400 labels and the shared ghost value grammar', () => {
  for (const rule of ['.iq-properties[data-label=wide]{--iq-properties-label:120px;gap:0}',
    'grid-template-columns:var(--iq-properties-label) minmax(0,1fr);align-items:center;column-gap:var(--iq-space-3);min-height:36px',
    'font-size:var(--iq-type-label-size);font-weight:400;line-height:20px;color:var(--iq-muted)',
    '.iq-properties:is([data-columns],[data-label=wide]) :is(.iq-select-trigger,.iq-date-trigger,.iq-combo-shell):hover{border-color:transparent;background:var(--iq-hover)}',
    '.iq-properties[data-label=wide] .iq-select-value>.iq-select-meta{display:none}',
    '.iq-properties[data-label=wide] iq-select[appearance=pill] .iq-select-trigger{height:26px;min-height:26px;',
    '.iq-properties[data-label=wide] iq-select[appearance=pill] .iq-select-dot{width:7px;height:7px}',
    '.iq-properties[data-label=wide] .iq-date-trigger>.iq-icon[data-glyph=calendar]{display:none}',
    '.iq-property-value[data-empty=true]{color:var(--iq-muted)}'])
    assert.ok(css.includes(rule), rule);
  // The grid of facts keeps its own label width and gaps.
  assert.ok(css.includes('.iq-properties[data-columns]{--iq-properties-label:96px;column-gap:var(--iq-space-6);row-gap:var(--iq-space-1)}'));
  assert.doesNotMatch(css, /\.iq-properties\[data-columns\] :is\(\.iq-select-trigger,\.iq-date-trigger,\.iq-combo-shell\)\{/);
});

test('iq-select: trigger-icon="none" keeps the glyph in the list, a key leads the value, a bot avatar is square and spoken', () => {
  assert.match(components, /this\.getAttribute\('trigger-icon'\) !== 'none'/);
  assert.match(components, /<span class="iq-option-icon">\$\{icons_js_1\.icon\(o\.icon, 18\)\}<\/span>/, 'the open list still shows option glyphs');
  assert.match(components, /<span class="iq-avatar xs iq-select-avatar bot" aria-hidden="true">\$\{icons_js_1\.icon\('bot', 12\)\}<\/span>/);
  assert.match(components, /<span class="sr-only">, \$\{escapeHTML\(/);
  assert.match(components, /<span class="iq-select-key">\$\{escapeHTML\(match\.key\)\}<\/span>/);
  assert.match(components, /typeof o\.key === 'string' && o\.key\.toLocaleLowerCase\(\)\.includes\(query\)/, 'the search finds a task by its key');
  assert.match(icon('bot', 12), /data-glyph="bot"[^>]*><g fill="none" stroke="currentColor"/);
});

test('a service account avatar is a square with the bot glyph; a person keeps initials', () => {
  assert.match(personAvatar({ id: 'svc', name: 'Бот релизов', kind: 'service' }, { size: 'xs' }), /^<span class="iq-avatar xs bot" aria-hidden="true"><svg class="iq-icon" data-glyph="bot"/);
  assert.match(personAvatar({ id: 'p', name: 'Анна Соколова' }, { size: 'xs' }), />АС</);
  assert.ok(css.includes('.iq-avatar.bot{border-radius:var(--iq-radius-xs);background:var(--iq-recessed);color:var(--iq-muted);box-shadow:inset 0 0 0 1px var(--iq-line)}'));
  // Initials at 20px stay a calm small mark beside 14px names (owner's feedback). Since vnext.38 every avatar, the select
  // avatar included (it is an xs avatar), takes its initials from the one avatar rule (vnext38.test.cjs pins the ratio).
  const avatarCss = read('src/styles/avatar.css');
  assert.ok(avatarCss.includes('.iq-avatar.xs{--iq-avatar-size:var(--iq-avatar-size-xs)}'));
  assert.ok(avatarCss.includes('.iq-avatar.bot>.iq-icon{width:calc(var(--iq-avatar-size) * .55);height:calc(var(--iq-avatar-size) * .55)}'), 'the bot glyph is 11px at 20');
});

test('iq-date-field deadline: overdue, today and tomorrow are words and tones; finished work has none', () => {
  const state = (chosen, deadline = true) => IqDateField.prototype.deadlineState.call({ chosen, hasAttribute: name => name === 'deadline' && deadline });
  assert.equal(state(day(-1)), 'overdue');
  assert.equal(state(day(0)), 'today');
  assert.equal(state(day(1)), 'tomorrow');
  assert.equal(state(day(2)), '');
  assert.equal(state(''), '');
  assert.equal(state(day(-1), false), '', 'without the attribute a date is only a date');
  assert.match(dateField, /const DEADLINE_WORDS = \{ overdue: 'просрочен', today: 'сегодня', tomorrow: 'завтра' \};/);
  assert.match(dateField, /\(deadline \? ' · ' \+ DEADLINE_WORDS\[deadline\] : ''\)/);
  assert.match(dateField, /'aria-describedby', 'deadline'\]/);
  assert.ok(css.includes('iq-date-field[deadline] .iq-date-trigger[data-deadline=overdue]{color:var(--iq-task-critical-text)}'));
  assert.ok(css.includes('iq-date-field[deadline] .iq-date-trigger:is([data-deadline=today],[data-deadline=tomorrow]){color:var(--iq-task-high-text)}'));
  assert.ok(css.includes('.iq-date-trigger>.iq-icon[data-glyph=down]{display:none}'), 'the chevron shows only in the wide list');
});

test('iq-tag-picker appearance="ghost": chips at rest, no "+" button, «Нет тегов» when empty, the hint only while typing', () => {
  assert.match(components, /\$\{ghost \? `<span class="iq-tag-picker-chevron" aria-hidden="true">/);
  assert.match(components, /ghost \? \(this\._value\.length \? 'Найти тег' : \(this\.getAttribute\('placeholder'\) \|\| 'Нет тегов'\)\)/);
  for (const rule of ['iq-tag-picker[appearance=ghost] .iq-tag-picker-field:hover{border-color:transparent;background:var(--iq-hover)}',
    'iq-tag-picker[appearance=ghost] .iq-tag-picker-values:not(:empty)+input:not(:focus){flex:0 0 0;width:0;min-width:0}',
    'iq-tag-picker:is([appearance=inline],[appearance=ghost]) .iq-tag .iq-tag-remove{width:0;opacity:0',
    '.iq-properties[data-label=wide] iq-tag-picker .iq-tag-picker-field{justify-self:start;max-width:calc(100% + var(--iq-space-2));margin:2px 0 2px calc(-1 * var(--iq-space-2))}'])
    assert.ok(css.includes(rule), rule);
});

test('select popups: a calm list — no caption, a filled search, 34px rows with one fill for hover and keyboard, no frames', () => {
  assert.doesNotMatch(components, /iq-select-popup" popover="manual"><div class="iq-popup-caption">/);
  assert.match(components, /const width = Math\.min\(Math\.max\(r\.width, 280\), innerWidth - 16\);/);
  for (const rule of ['.iq-option{display:flex;align-items:center;gap:var(--iq-space-2);min-height:34px;padding:6px var(--iq-space-2);border-radius:var(--iq-radius-sm);',
    '.iq-option:hover,.iq-option.is-active{background:var(--iq-hover)}', '[role=listbox]:hover>.iq-option.is-active:not(:hover){background:transparent}',
    '.iq-option.iq-option-separated{margin-top:6px}', '.iq-select-search{display:flex;align-items:center;gap:var(--iq-space-2);height:32px;margin:0 0 var(--iq-space-1);padding:0 var(--iq-space-2);border-radius:var(--iq-radius-sm);background:var(--iq-surface);',
    '.iq-properties:is([data-columns],[data-label=wide]) .iq-combo-shell:focus-within{border-color:transparent;background:var(--iq-hover)}'])
    assert.ok(css.includes(rule), rule);
  assert.doesNotMatch(css, /\.iq-option\.is-active\{[^}]*outline/);
  assert.doesNotMatch(css, /\.iq-option\.iq-option-separated\{[^}]*border-top/);
});
