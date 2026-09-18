"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectOptions = void 0;
exports.alert = alert;
exports.avatar = avatar;
exports.avatars = avatars;
exports.badge = badge;
exports.btn = btn;
exports.chart = chart;
exports.check = check;
exports.combo = combo;
exports.empty = empty;
exports.field = field;
exports.ib = ib;
exports.menu = menu;
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
let ids = 1000;
const id = () => `field-${++ids}`;
function btn(text, variant = 'primary', glyph = '', attrs = '') {
    const trailing = text && ['arrow', 'chevron', 'upRight', 'check', 'checkCircle', 'refresh', 'download', 'send'].includes(glyph);
    return `<button type="button" class="iq-btn ${variant}" ${attrs}>${glyph && !trailing ? components_js_1.icon(glyph, 17) : ''}${text}${trailing ? components_js_1.icon(glyph, 17) : ''}</button>`;
}
function ib(glyph, label, variant = 'ghost', attrs = '') { return btn('', `icon ${variant}`, glyph, `aria-label="${components_js_1.escapeHTML(label)}" ${attrs}`); }
function badge(text, tone = '', _dot = true) {
    const semantic = tone || (/^(Запланировано|Запланирован|В плане)$/.test(text) ? 'planned' : /^(На проверке|Требует решения)$/.test(text) ? 'warning' : text === 'Готово' ? 'success' : /Образец|образц|Демо|Пример/.test(text) ? 'sample' : 'neutral');
    return `<span class="iq-badge ${components_js_1.escapeHTML(semantic)}">${components_js_1.escapeHTML(text)}</span>`;
}
function field(label, value = '', opts = {}) {
    const key = id();
    if (opts.type === 'date' || opts.type === 'datetime-local')
        return `<iq-date-field label="${components_js_1.escapeHTML(label)}" value="${components_js_1.escapeHTML(value.split('T')[0])}" ${opts.type === 'datetime-local' ? `with-time time="${components_js_1.escapeHTML(value.split('T')[1]?.slice(0, 5) || '14:30')}"` : ''} ${opts.name ? `name="${components_js_1.escapeHTML(opts.name)}"` : ''} ${opts.disabled ? 'disabled' : ''} ${opts.readonly ? 'readonly' : ''} ${opts.required ? 'required' : ''}></iq-date-field>`;
    return `<div class="iq-field"><label for="${key}" class="iq-control-label">${label}</label><div class="iq-input-shell ${opts.state || ''}">${opts.icon ? components_js_1.icon(opts.icon, 17) : ''}<input id="${key}" type="${opts.type || 'text'}" ${opts.type === 'email' ? 'autocomplete="email"' : opts.name === 'name' ? 'autocomplete="name"' : ''} value="${components_js_1.escapeHTML(value)}" ${opts.placeholder ? `placeholder="${components_js_1.escapeHTML(opts.placeholder)}"` : ''} ${opts.readonly ? 'readonly' : ''} ${opts.disabled ? 'disabled' : ''} ${opts.name ? `name="${opts.name}"` : ''} ${opts.required ? 'required' : ''} ${opts.max ? `maxlength="${opts.max}"` : ''} ${opts.state === 'error' ? 'aria-invalid="true"' : ''} ${opts.help ? `aria-describedby="${key}-help"` : ''}>${opts.state === 'success' ? components_js_1.icon('checkCircle', 17) : ''}</div>${opts.help ? `<small class="iq-helper ${opts.state === 'error' ? 'error' : ''}" id="${key}-help">${opts.help}</small>` : ''}</div>`;
}
function textarea(label, value = '', opts = {}) { const key = id(); return `<div class="iq-field"><label class="iq-control-label" for="${key}">${label}</label><div class="iq-input-shell"><textarea id="${key}" ${opts.name ? `name="${opts.name}"` : ''} placeholder="${components_js_1.escapeHTML(opts.placeholder || '')}" ${opts.maxlength ? `maxlength="${opts.maxlength}" data-count="${key}-count"` : ''} ${opts.help ? `aria-describedby="${key}-help"` : ''}>${components_js_1.escapeHTML(value)}</textarea></div>${opts.help || opts.maxlength ? `<div class="iq-field-foot">${opts.help ? `<small class="iq-helper" id="${key}-help">${opts.help}</small>` : '<span></span>'}${opts.maxlength ? `<small class="iq-helper" id="${key}-count">${value.length} / ${opts.maxlength}</small>` : ''}</div>` : ''}</div>`; }
function check(label, checked = false, attrs = '') { return `<label class="iq-check"><input type="checkbox" ${checked ? 'checked' : ''} ${attrs}><span class="iq-check-box">${components_js_1.icon('check', 14)}</span>${label ? `<span>${label}</span>` : ''}</label>`; }
function radio(label, name, checked = false, value = '') { return `<label class="iq-radio"><input type="radio" name="${name}" value="${components_js_1.escapeHTML(value || label)}" ${checked ? 'checked' : ''}><span class="iq-radio-dot"></span><span>${label}</span></label>`; }
function toggle(label, checked = true, attrs = '', showLabel = true) { return `<label class="iq-switch"><input type="checkbox" role="switch" ${checked ? 'checked' : ''} aria-label="${components_js_1.escapeHTML(label)}" ${attrs}><span class="iq-switch-track"></span>${label && showLabel ? `<span>${label}</span>` : ''}</label>`; }
function segment(items, active = 0, attrs = '') { return `<div class="iq-segmented" data-segmented ${attrs}>${items.map((x, i) => `<button type="button" aria-pressed="${i === active}" data-value="${i}">${x}</button>`).join('')}</div>`; }
function select(label, options, attrs = '') { const data = options.map((x, i) => typeof x === 'string' ? { value: String(i), label: x } : x); return `<iq-select label="${components_js_1.escapeHTML(label)}" options="${components_js_1.escapeHTML(JSON.stringify(data))}" ${attrs}></iq-select>`; }
function combo(label, options, attrs = '') { return `<iq-combobox label="${components_js_1.escapeHTML(label)}" options="${components_js_1.escapeHTML(JSON.stringify(options.map(x => ({ value: x, label: x }))))}" ${attrs}></iq-combobox>`; }
function avatar(text = 'АК', v = 0, cls = '') { return `<span class="iq-avatar v${v} ${cls}" role="img" aria-label="Участник ${text}">${text}</span>`; }
function avatars() { return `<div class="iq-avatars" aria-label="4 участника">${avatar('АК', 1)}${avatar('МЛ', 2)}${avatar('ДС', 3)}<span class="iq-avatar more" role="img" aria-label="Ещё один участник">+1</span></div>`; }
function alert(title, body, tone = 'info') { const names = { info: 'info', success: 'checkCircle', warning: 'warning', danger: 'xCircle' }; return `<div class="iq-alert ${tone}"><span class="message-emblem">${components_js_1.icon(tone === 'danger' ? 'x' : tone === 'success' ? 'check' : names[tone], 25)}</span><div class="message-copy"><b>${title}</b><p>${body}</p></div></div>`; }
function progress(value = 68, label = 'Прогресс', cls = '') { return `<div class="iq-progress ${cls}" role="progressbar" aria-label="${components_js_1.escapeHTML(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" style="--progress:${value}%"><span></span></div>`; }
function ring(value = 76) { return `<div class="iq-ring" role="img" aria-label="Выполнено ${value}%"><svg width="86" height="86" viewBox="0 0 86 86" fill="none"><circle class="iq-ring-track" cx="43" cy="43" r="36" stroke-width="5"/><circle class="iq-ring-fill" cx="43" cy="43" r="36" stroke-width="5" stroke-dasharray="226.2" stroke-dashoffset="${226.2 * (1 - value / 100)}"/></svg><strong>${value}<span style="font-size:12px">%</span></strong></div>`; }
function sparkline(values=[]){const finite=values.filter(Number.isFinite);if(!finite.length)return '';const min=Math.min(...finite),span=Math.max(...finite)-min||1;const points=values.map((v,i)=>Number.isFinite(v)?`${i*328/Math.max(1,values.length-1)},${64-(v-min)*60/span}`:null).filter(Boolean);return `<svg class="iq-sparkline" viewBox="0 0 330 68" fill="none" role="img" aria-label="Динамика показателя"><polyline points="${points.join(' ')}" stroke="currentColor" stroke-width="2"/></svg>`;}
function chart(data){if(!data?.values?.length)return '<p class="iq-helper">Нет данных для диаграммы.</p>';const values=data.values,labels=data.labels||[],max=Math.max(1,...values.filter(Number.isFinite));return `<figure class="iq-chart-demo"><svg class="iq-chart" viewBox="0 0 720 230" role="img" aria-label="${components_js_1.escapeHTML(data.title||'Данные')}">${values.map((v,i)=>Number.isFinite(v)?`<rect x="${36+i*680/values.length}" y="${210-v/max*190}" width="${Math.max(2,680/values.length-20)}" height="${Math.max(0,v/max*190)}" rx="5" fill="currentColor"/>`:'').join('')}</svg><figcaption class="iq-helper chart-caption">${components_js_1.escapeHTML(labels.join(' — '))}</figcaption></figure>`;}
function menu(trigger, items) { return `<iq-menu>${trigger}<div data-menu>${items.map(x => `<button type="button" class="${x.danger ? 'danger' : ''}" data-action="${x.action || 'demo'}">${x.glyph ? components_js_1.icon(x.glyph, 17) : ''}<span>${x.label}</span>${x.shortcut ? `<kbd>${x.shortcut}</kbd>` : ''}</button>`).join('')}</div></iq-menu>`; }
function tabs(items, attrs = '') { return `<iq-tabs ${attrs}><div class="iq-tabs-list" data-tablist>${items.map(x => `<button type="button" data-tab="${x.key}">${x.label}</button>`).join('')}</div>${items.map(x => `<div class="iq-tab-panel" data-panel="${x.key}">${x.body}</div>`).join('')}</iq-tabs>`; }
function empty(title = 'Пока здесь пусто', body = 'Добавьте первый объект, чтобы начать работу.', action = btn('Создать', 'secondary sm', 'plus', 'data-create-task')) { return `<div class="iq-empty"><div class="empty-art" aria-hidden="true"><span class="empty-sheet back"></span><span class="empty-sheet">${components_js_1.icon('folderOpen', 38)}</span><span class="empty-art-plus">${components_js_1.icon('plus', 17)}</span></div><h3>${title}</h3><p>${body}</p>${action}</div>`; }
const projectOptions = [];
exports.projectOptions = projectOptions;

exports.radioGroup = radioGroup;
function radioGroup(label, name, options, selected) {
    const key = id();
    return `<fieldset class="iq-choice-group"><legend>${components_js_1.escapeHTML(label)}</legend><div class="iq-choice-options">${options.map((option,i)=>`<label class="iq-choice"><input type="radio" name="${components_js_1.escapeHTML(name)}" value="${components_js_1.escapeHTML(option.value)}" ${option.value === selected ? 'checked' : ''} ${option.disabled ? 'disabled' : ''} aria-describedby="${key}-${i}"><span class="iq-choice-indicator" aria-hidden="true"></span><span class="iq-choice-copy"><b>${components_js_1.escapeHTML(option.label)}</b><small id="${key}-${i}">${components_js_1.escapeHTML(option.description || '')}</small></span></label>`).join('')}</div></fieldset>`;
}

