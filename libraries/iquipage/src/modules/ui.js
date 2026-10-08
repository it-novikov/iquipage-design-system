"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectOptions = void 0;
exports.alert = alert;
exports.amount = amount;
exports.avatar = avatar;
exports.avatars = avatars;
exports.avatarTone = avatarTone;
exports.avatarGroup = avatarGroup;
exports.personAvatar = personAvatar;
exports.initials = initials;
exports.badge = badge;
exports.btn = btn;
exports.chart = chart;
exports.check = check;
exports.combo = combo;
exports.empty = empty;
exports.field = field;
exports.ib = ib;
exports.menu = menu;
exports.switcher = switcher;
exports.progress = progress;
exports.radio = radio;
exports.ring = ring;
exports.segment = segment;
exports.select = select;
exports.sparkline = sparkline;
exports.tabs = tabs;
exports.textarea = textarea;
exports.toggle = toggle;
const components_js_1 = require("./components.js");
const scale_js_1 = require("./scale.js");
/** vnext.30: the scale of progress against a target, also exported as scale() from the core entry. */
exports.scale = options => scale_js_1.scale(options);
let ids = 1000;
const id = () => `field-${++ids}`;
function btn(text, variant = 'primary', glyph = '', attrs = '') {
    const trailing = text && ['arrow', 'chevron', 'upRight', 'check', 'checkCircle', 'refresh', 'download', 'send'].includes(glyph);
    return `<button type="button" class="iq-btn ${variant}" ${attrs}>${glyph && !trailing ? components_js_1.icon(glyph, 17) : ''}${text}${trailing ? components_js_1.icon(glyph, 17) : ''}</button>`;
}
function ib(glyph, label, variant = 'ghost', attrs = '') { return btn('', `icon ${variant}`, glyph, `aria-label="${components_js_1.escapeHTML(label)}" ${attrs}`); }
/** Status glyphs give success/danger/warning a non-colour channel (COL-06); `withIcon=false` keeps a text-only badge. */
const badgeGlyph = { success: 'checkCircle', danger: 'xCircle', warning: 'warning' };
function badge(text, tone = '', withIcon = true) {
    const semantic = tone || (/^(Запланировано|Запланирован|В плане)$/.test(text) ? 'planned' : /^(На проверке|Требует решения)$/.test(text) ? 'warning' : text === 'Готово' ? 'success' : /Образец|образц|Демо|Пример/.test(text) ? 'sample' : 'neutral');
    const glyph = withIcon && badgeGlyph[semantic] ? components_js_1.icon(badgeGlyph[semantic], 14) : '';
    return `<span class="iq-badge ${components_js_1.escapeHTML(semantic)}">${glyph}${components_js_1.escapeHTML(text)}</span>`;
}
function field(label, value = '', opts = {}) {
    const key = id();
    if (opts.type === 'date' || opts.type === 'datetime-local')
        return `<iq-date-field label="${components_js_1.escapeHTML(label)}" value="${components_js_1.escapeHTML(value.split('T')[0])}" ${opts.type === 'datetime-local' ? `with-time time="${components_js_1.escapeHTML(value.split('T')[1]?.slice(0, 5) || '14:30')}"` : ''} ${opts.name ? `name="${components_js_1.escapeHTML(opts.name)}"` : ''} ${opts.disabled ? 'disabled' : ''} ${opts.readonly ? 'readonly' : ''} ${opts.required ? 'required' : ''}></iq-date-field>`;
    return `<div class="iq-field"><label for="${key}" class="iq-control-label">${label}</label><div class="iq-input-shell ${opts.state || ''}">${opts.icon ? components_js_1.icon(opts.icon, 17) : ''}<input id="${key}" type="${opts.type || 'text'}" ${opts.type === 'email' ? 'autocomplete="email"' : opts.name === 'name' ? 'autocomplete="name"' : ''} value="${components_js_1.escapeHTML(value)}" ${opts.placeholder ? `placeholder="${components_js_1.escapeHTML(opts.placeholder)}"` : ''} ${opts.readonly ? 'readonly' : ''} ${opts.disabled ? 'disabled' : ''} ${opts.name ? `name="${opts.name}"` : ''} ${opts.required ? 'required' : ''} ${opts.max ? `maxlength="${opts.max}"` : ''} ${opts.state === 'error' ? 'aria-invalid="true"' : ''} ${opts.help ? `aria-describedby="${key}-help"` : ''}>${opts.state === 'success' ? components_js_1.icon('checkCircle', 17) : ''}</div>${opts.help ? `<small class="iq-helper ${opts.state === 'error' ? 'error' : ''}" id="${key}-help">${opts.help}</small>` : ''}</div>`;
}
function textarea(label, value = '', opts = {}) { const key = id(); return `<div class="iq-field"><label class="iq-control-label" for="${key}">${label}</label><div class="iq-input-shell"><textarea id="${key}" ${opts.name ? `name="${opts.name}"` : ''} placeholder="${components_js_1.escapeHTML(opts.placeholder || '')}" ${opts.maxlength ? `maxlength="${opts.maxlength}" data-count="${key}-count"` : ''} ${opts.help ? `aria-describedby="${key}-help"` : ''}>${components_js_1.escapeHTML(value)}</textarea></div>${opts.help || opts.maxlength ? `<div class="iq-field-foot">${opts.help ? `<small class="iq-helper" id="${key}-help">${opts.help}</small>` : '<span></span>'}${opts.maxlength ? `<small class="iq-helper" id="${key}-count">${value.length} / ${opts.maxlength}</small>` : ''}</div>` : ''}</div>`; }
/**
 * An amount with its unit (0.6.0-vnext.30): a decimal text field that reads right-aligned in tabular figures, with the
 * currency sign or unit as a suffix. `labelHidden` keeps the label for assistive technology only, for table rows.
 */
function amount(label, value = '', opts = {}) { const key = id(), e = components_js_1.escapeHTML; return `<div class="iq-field iq-amount">${opts.labelHidden ? '' : `<label class="iq-control-label" for="${key}">${label}</label>`}<div class="iq-input-shell"><input id="${key}" ${opts.name ? `name="${e(opts.name)}"` : ''} inputmode="decimal" autocomplete="off" value="${e(value)}" placeholder="${e(opts.placeholder || '')}" ${opts.labelHidden ? `aria-label="${e(label)}"` : ''} ${opts.required ? 'required' : ''} ${opts.attrs || ''}><span class="iq-input-suffix" data-amount-suffix>${e(opts.suffix || '')}</span></div></div>`; }
function check(label, checked = false, attrs = '') { return `<label class="iq-check"><input type="checkbox" ${checked ? 'checked' : ''} ${attrs}><span class="iq-check-box">${components_js_1.icon('check', 14)}</span>${label ? `<span>${label}</span>` : ''}</label>`; }
function radio(label, name, checked = false, value = '') { return `<label class="iq-radio"><input type="radio" name="${name}" value="${components_js_1.escapeHTML(value || label)}" ${checked ? 'checked' : ''}><span class="iq-radio-dot"></span><span>${label}</span></label>`; }
function toggle(label, checked = true, attrs = '', showLabel = true) { return `<label class="iq-switch"><input type="checkbox" role="switch" ${checked ? 'checked' : ''} aria-label="${components_js_1.escapeHTML(label)}" ${attrs}><span class="iq-switch-track"></span>${label && showLabel ? `<span>${label}</span>` : ''}</label>`; }
function segment(items, active = 0, attrs = '') { return `<div class="iq-segmented" data-segmented ${attrs}>${items.map((x, i) => `<button type="button" aria-pressed="${i === active}" data-value="${i}">${x}</button>`).join('')}</div>`; }
function select(label, options, attrs = '') { const data = options.map((x, i) => typeof x === 'string' ? { value: String(i), label: x } : x); return `<iq-select label="${components_js_1.escapeHTML(label)}" options="${components_js_1.escapeHTML(JSON.stringify(data))}" ${attrs}></iq-select>`; }
function combo(label, options, attrs = '') { return `<iq-combobox label="${components_js_1.escapeHTML(label)}" options="${components_js_1.escapeHTML(JSON.stringify(options.map(x => ({ value: x, label: x }))))}" ${attrs}></iq-combobox>`; }
function avatar(text = 'АК', v = 0, cls = '') { return `<span class="iq-avatar v${v} ${cls}" role="img" aria-label="Участник ${text}">${text}</span>`; }
/** One person keeps one avatar tone everywhere: a stable hash of their id (or name) picks v1–v4. */
function avatarTone(key) { let h = 0; for (const ch of String(key || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return 1 + h % 4; }
function initials(name) { return String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?'; }
/** People as a DS avatar group: at most three discs (two and "+N" when there are more), one tooltip with every name,
    and one accessible label. people: [{name, id?}]; size: 'xs' | 'sm' | 'md'. */
/** One person as one decorative DS avatar disc: the name is always rendered as text beside it. */
/** A person's photo over their initials: the initials stay underneath as the fallback while (or if) it loads.
 *  Only same-origin paths, blob: and https: URLs are accepted. */
function avatarPhoto(person) {
    const src = typeof person?.image === 'string' ? person.image : '';
    return /^(\/(?!\/)|blob:|https:\/\/)/.test(src) ? `<img src="${components_js_1.escapeHTML(src)}" alt="" loading="lazy" decoding="async">` : '';
}
function personAvatar(person, { size = 'sm' } = {}) {
    if (!['', 'xs', 'sm', 'lg'].includes(size)) throw new TypeError('Unsupported avatar size');
    const sized = size ? ` ${size}` : '';
    if (!person || !String(person.name || '').trim()) return `<span class="iq-avatar${sized} more" aria-hidden="true">?</span>`;
    // A service account (vnext.27) is a square with the bot glyph, never initials: it is not a person.
    if (person.kind === 'service') return `<span class="iq-avatar${sized} bot" aria-hidden="true">${components_js_1.icon('bot', 12)}</span>`;
    const photo = avatarPhoto(person);
    return `<span class="iq-avatar${sized} v${avatarTone(person.id || person.name)}${photo ? ' has-image' : ''}" aria-hidden="true">${components_js_1.escapeHTML(initials(person.name))}${photo}</span>`;
}
function avatarGroup(people, { size = 'sm', max = 3, label = 'Участники' } = {}) {
    const list = (Array.isArray(people) ? people : []).filter(p => p && typeof p.name === 'string' && p.name.trim());
    if (!list.length) return '';
    const shown = list.length > max ? list.slice(0, max - 1) : list, rest = list.length - shown.length;
    const names = list.map(p => p.name.trim());
    const discs = shown.map(p => { const photo = avatarPhoto(p); return `<span class="iq-avatar v${avatarTone(p.id || p.name)}${photo ? ' has-image' : ''}" aria-hidden="true">${components_js_1.escapeHTML(initials(p.name))}${photo}</span>`; }).join('') + (rest ? `<span class="iq-avatar more" aria-hidden="true">+${rest}</span>` : '');
    return `<iq-tooltip heading="${components_js_1.escapeHTML(label)}" text="${components_js_1.escapeHTML(names.join('\n'))}"><span class="iq-avatars ${components_js_1.escapeHTML(size)}" role="img" aria-label="${components_js_1.escapeHTML(label + ': ' + names.join(', '))}">${discs}</span></iq-tooltip>`;
}
function avatars() { return `<div class="iq-avatars" aria-label="4 участника">${avatar('АК', 1)}${avatar('МЛ', 2)}${avatar('ДС', 3)}<span class="iq-avatar more" role="img" aria-label="Ещё один участник">+1</span></div>`; }
function alert(title, body, tone = 'info') { const names = { info: 'info', success: 'checkCircle', warning: 'warning', danger: 'xCircle' }; return `<div class="iq-alert ${tone}"><span class="message-emblem">${components_js_1.icon(tone === 'danger' ? 'x' : tone === 'success' ? 'check' : names[tone], 25)}</span><div class="message-copy"><b>${title}</b><p>${body}</p></div></div>`; }
function progress(value = 68, label = 'Прогресс', cls = '') { return `<div class="iq-progress ${cls}" role="progressbar" aria-label="${components_js_1.escapeHTML(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" style="--progress:${value}%"><span></span></div>`; }
function ring(value = 76) { return `<div class="iq-ring" role="img" aria-label="Выполнено ${value}%"><svg width="86" height="86" viewBox="0 0 86 86" fill="none"><circle class="iq-ring-track" cx="43" cy="43" r="36" stroke-width="5"/><circle class="iq-ring-fill" cx="43" cy="43" r="36" stroke-width="5" stroke-dasharray="226.2" stroke-dashoffset="${226.2 * (1 - value / 100)}"/></svg><strong>${value}<span style="font-size:12px">%</span></strong></div>`; }
function sparkline(values=[]){const finite=values.filter(Number.isFinite);if(!finite.length)return '';const min=Math.min(...finite),span=Math.max(...finite)-min||1;const points=values.map((v,i)=>Number.isFinite(v)?`${i*328/Math.max(1,values.length-1)},${64-(v-min)*60/span}`:null).filter(Boolean);return `<svg class="iq-sparkline" viewBox="0 0 330 68" fill="none" role="img" aria-label="Динамика показателя"><polyline points="${points.join(' ')}" stroke="currentColor" stroke-width="2"/></svg>`;}
function chart(data){if(!data?.values?.length)return '<p class="iq-helper">Нет данных для диаграммы.</p>';const values=data.values,labels=data.labels||[],max=Math.max(1,...values.filter(Number.isFinite));return `<figure class="iq-chart-demo"><svg class="iq-chart" viewBox="0 0 720 230" role="img" aria-label="${components_js_1.escapeHTML(data.title||'Данные')}">${values.map((v,i)=>Number.isFinite(v)?`<rect x="${36+i*680/values.length}" y="${210-v/max*190}" width="${Math.max(2,680/values.length-20)}" height="${Math.max(0,v/max*190)}" rx="5" fill="currentColor"/>`:'').join('')}</svg><figcaption class="iq-helper chart-caption">${components_js_1.escapeHTML(labels.join(' — '))}</figcaption></figure>`;}
function menu(trigger, items) { return `<iq-menu>${trigger}<div data-menu>${items.map(x => x.section ? `<p class="iq-menu-section" role="presentation">${components_js_1.escapeHTML(x.section)}</p>` : `<button type="button" class="${x.danger ? 'danger' : ''}" data-action="${x.action || 'demo'}">${x.glyph ? components_js_1.icon(x.glyph, 17) : ''}<span>${x.label}</span>${x.shortcut ? `<kbd>${x.shortcut}</kbd>` : ''}</button>`).join('')}</div></iq-menu>`; }
/**
 * A switcher (0.6.0-vnext.36): the current choice as a quiet text label with a small chevron, no border, opening a DS
 * menu of the choices with the current one checked. The workspace and project in the top bar and a page title that
 * chooses what its page shows are the same control, so they look and behave alike.
 *
 * - `label`: the current choice as plain text; `name`: what is chosen («Проект»), so the button reads «Проект: label».
 * - `items`: `{section}` headings, `{separator:true}` rules, choices `{label, action, current, glyph?, meta?}` and
 *   commands `{label, action, glyph?, danger?}`. A choice is the item with a boolean `current`: it is a
 *   menuitemradio with aria-checked, its glyph becomes the check while it is current, and the menu opens on it.
 *   `meta` is a quiet word at the end of the row («идёт»). Labels, meta, sections and the name are plain text.
 * - `size: 'title'` takes the font of its heading (a page title keeps its size and weight); the default is the
 *   compact top-bar size. `tone: 'muted'` and `emphasis: 'strong'` (a <strong> label) are the top bar's quiet workspace
 *   and bold project.
 * - `className` and `attrs` go on the button; the menu reports the picked item's `action` as `iq-action`.
 */
function switcher({ label = '', name = '', items = [], size = '', tone = '', emphasis = '', className = '', attrs = '' } = {}) {
    const e = components_js_1.escapeHTML, title = size === 'title';
    if (!['', 'title'].includes(size)) throw new TypeError('Unsupported switcher size');
    const text = String(label ?? ''), accessible = name ? `${name}: ${text}` : text, tag = emphasis === 'strong' ? 'strong' : 'span';
    const slot = items.some(x => !x.section && !x.separator && (x.glyph || typeof x.current === 'boolean'));
    const mark = x => { const glyph = x.current === true ? 'check' : x.glyph; return glyph ? components_js_1.icon(glyph, 17) : slot ? '<span class="iq-switcher-mark" aria-hidden="true"></span>' : ''; };
    const row = x => x.section ? `<p class="iq-menu-section" role="presentation">${e(x.section)}</p>`
        : x.separator ? '<hr class="iq-switcher-separator" role="separator">'
        : `<button type="button"${typeof x.current === 'boolean' ? ` role="menuitemradio" aria-checked="${x.current}"` : ''}${x.danger ? ' class="danger"' : ''} data-action="${e(x.action ?? '')}">${mark(x)}<span>${e(x.label ?? '')}</span>${x.meta ? `<small class="iq-switcher-meta">${e(x.meta)}</small>` : ''}</button>`;
    const trigger = `<button type="button" class="iq-btn ghost${title ? '' : ' sm'} iq-switcher${className ? ' ' + e(className) : ''}"${title ? ' data-size="title"' : ''}${tone ? ` data-tone="${e(tone)}"` : ''}${emphasis ? ` data-emphasis="${e(emphasis)}"` : ''} aria-label="${e(accessible)}" title="${e(text)}"${attrs ? ' ' + attrs : ''}><${tag} class="iq-switcher-label">${e(text)}</${tag}>${components_js_1.icon('down', title ? 18 : 14)}</button>`;
    return `<iq-menu class="iq-switcher-menu">${trigger}<div data-menu class="iq-switcher-popup">${items.map(row).join('')}</div></iq-menu>`;
}
function tabs(items, attrs = '') { return `<iq-tabs ${attrs}><div class="iq-tabs-list" data-tablist>${items.map(x => `<button type="button" data-tab="${x.key}">${x.label}</button>`).join('')}</div>${items.map(x => `<div class="iq-tab-panel" data-panel="${x.key}">${x.body}</div>`).join('')}</iq-tabs>`; }
function empty(title = 'Пока здесь пусто', body = 'Добавьте первый объект, чтобы начать работу.', action = btn('Создать', 'secondary sm', 'plus', 'data-create-task')) { return `<div class="iq-empty"><div class="empty-art" aria-hidden="true"><span class="empty-sheet back"></span><span class="empty-sheet">${components_js_1.icon('folderOpen', 38)}</span><span class="empty-art-plus">${components_js_1.icon('plus', 17)}</span></div><h3>${title}</h3><p>${body}</p>${action}</div>`; }
const projectOptions = [];
exports.projectOptions = projectOptions;

exports.radioGroup = radioGroup;
function radioGroup(label, name, options, selected) {
    const key = id();
    return `<fieldset class="iq-choice-group"><legend>${components_js_1.escapeHTML(label)}</legend><div class="iq-choice-options">${options.map((option,i)=>`<label class="iq-choice"><input type="radio" name="${components_js_1.escapeHTML(name)}" value="${components_js_1.escapeHTML(option.value)}" ${option.value === selected ? 'checked' : ''} ${option.disabled ? 'disabled' : ''} aria-describedby="${key}-${i}"><span class="iq-choice-indicator" aria-hidden="true"></span><span class="iq-choice-copy"><b>${components_js_1.escapeHTML(option.label)}</b><small id="${key}-${i}">${components_js_1.escapeHTML(option.description || '')}</small></span></label>`).join('')}</div></fieldset>`;
}

