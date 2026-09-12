let defaultTags='';exports.configureTagDefaults=v=>{defaultTags=String(v)};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uid = exports.mark = exports.icon = exports.glyphs = exports.escapeHTML = exports.IqUpload = exports.IqTooltip = exports.IqTags = exports.IqTabs = exports.IqSelect = exports.IqRange = exports.IqNumber = exports.IqMenu = exports.IqElement = exports.IqDialog = exports.IqCombobox = exports.IqCalendar = void 0;
exports.copyText = copyText;
exports.downloadJSON = downloadJSON;
exports.enhance = enhance;
exports.load = load;
exports.notify = notify;
exports.registerComponents = registerComponents;
exports.save = save;
const interaction_js_1 = require("./interaction.js");
const media_js_1 = require("./media.js");
const icons_js_1 = require("./icons.js");
const icons_js_2 = require("./icons.js");
const icon = icons_js_2.icon;
exports.icon = icon;
const mark = icons_js_2.mark;
exports.mark = mark;
const glyphs = icons_js_2.glyphs;
exports.glyphs = glyphs;
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
exports.escapeHTML = escapeHTML;
let sequence = 0;
const uid = () => `iq-${++sequence}`;
exports.uid = uid;
const isReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
const sessionValues = new Map();
function save(key, value) {
    sessionValues.set(key, structuredClone(value));
    try {
        localStorage.setItem('iquipage.edition04.' + key, JSON.stringify(value));
        return true;
    }
    catch {
        return false;
    }
}
function load(key, fallback) {
    if (sessionValues.has(key))
        return structuredClone(sessionValues.get(key));
    try {
        const raw = localStorage.getItem('iquipage.edition04.' + key);
        return raw ? JSON.parse(raw) : fallback;
    }
    catch {
        return fallback;
    }
}
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        const previous = document.activeElement;
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;left:-10000px';
        document.body.append(el);
        el.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        }
        catch { }
        finally {
            el.remove();
            if (previous?.isConnected)
                previous.focus({ preventScroll: true });
        }
        return ok;
    }
}
function downloadJSON(name, data) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
/** Base class: every connected element owns abortable listeners. */
class IqElement extends HTMLElement {
    cleanups = [];
    addCleanup(fn) { this.cleanups.push(fn); }
    events;
    connectedCallback() { this.cleanups.splice(0).forEach(fn => fn()); this.events?.abort(); this.events = new AbortController(); this.mount(); }
    disconnectedCallback() { this.cleanups.splice(0).forEach(fn => fn()); this.events?.abort(); }
    listen(target, type, fn) { target.addEventListener(type, fn, { signal: this.events?.signal }); }
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail })); }
}
exports.IqElement = IqElement;
/** Select-only combobox. Native hidden input provides normal form submission. */
class IqSelect extends IqElement {
    disconnectedCallback() { this.close(); super.disconnectedCallback(); }
    options = [];
    selected = '';
    active = 0;
    opened = false;
    trigger;
    popup;
    list;
    editable = false;
    query = '';
    filtered = [];
    typeBuffer = '';
    typedAt = 0;
    initialValue = '';
    static get observedAttributes() { return ['value', 'disabled']; }
    attributeChangedCallback(name, _old, value) {
        if (name === 'value') {
            this.selected = value || '';
            if (this.trigger)
                this.sync();
        }
        if (name === 'disabled' && this.trigger) {
            this.trigger.disabled = value !== null;
            const hidden = this.querySelector('input[type=hidden]');
            if (hidden)
                hidden.disabled = value !== null;
            if (value !== null)
                this.close();
        }
    }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { this.toggleAttribute('disabled', value); }
    get value() { return this.selected; }
    set value(v) { this.selected = v; this.setAttribute('value', v); this.sync(); }
    mount() {
        this.editable = this.tagName.toLowerCase() === 'iq-combobox';
        if (!this.options.length) {
            try {
                const parsed = JSON.parse(this.getAttribute('options') || '[]');
                this.options = Array.isArray(parsed) ? parsed.filter((o) => !!o && typeof o === 'object' && typeof o.value === 'string' && typeof o.label === 'string') : [];
            }
            catch {
                this.options = [];
            }
            if (!this.options.length)
                this.options = Array.from(this.querySelectorAll('option')).map(o => ({ value: o.value, label: o.textContent || o.value, disabled: o.disabled }));
        }
        this.selected = this.getAttribute('value') ?? this.options[0]?.value ?? '';
        this.initialValue = this.selected;
        const id = uid(), label = this.getAttribute('label') || 'Выбрать значение', name = this.getAttribute('name') || '', disabled = this.hasAttribute('disabled');
        this.innerHTML = `<span class="iq-control-label" id="${id}-label">${escapeHTML(label)}</span><div class="iq-select-wrap">${this.editable ? `<div class="iq-combo-shell">${icons_js_1.icon('search', 17)}<input class="iq-combo-input" role="combobox" aria-autocomplete="list" autocomplete="off" ${disabled ? 'disabled' : ''} aria-expanded="false" aria-controls="${id}-list" aria-labelledby="${id}-label" placeholder="${escapeHTML(this.getAttribute('placeholder') || 'Найти…')}">${icons_js_1.icon('down', 16)}</div>` : `<button type="button" class="iq-select-trigger" role="combobox" ${disabled ? 'disabled' : ''} aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" aria-labelledby="${id}-label"><span class="iq-select-value"></span>${icons_js_1.icon('down', 16)}</button>`}<div class="iq-popup iq-select-popup" popover="manual"><div class="iq-popup-caption">${escapeHTML(label)}</div><div id="${id}-list" role="listbox" aria-labelledby="${id}-label"></div></div></div><input type="hidden" ${name ? `name="${escapeHTML(name)}"` : ''}>`;
        this.trigger = this.querySelector('[role=combobox]');
        this.popup = this.querySelector('.iq-popup');
        this.list = this.querySelector('[role=listbox]');
        this.sync();
        this.listen(this.trigger, 'click', () => this.editable ? this.open() : this.opened ? this.close() : this.open());
        this.listen(this.trigger, 'keydown', (ev) => this.onKey(ev));
        if (this.editable)
            this.listen(this.trigger, 'input', () => { this.query = this.trigger.value; this.active = 0; this.open(); });
        this.listen(this.list, 'pointerdown', ev => ev.preventDefault());
        this.listen(this.list, 'click', ev => {
            const item = ev.target.closest('[data-value]');
            if (item && item.getAttribute('aria-disabled') !== 'true')
                this.choose(item.dataset.value);
        });
        this.listen(document, 'pointerdown', ev => {
            if (this.opened && !this.contains(ev.target))
                this.close();
        });
        this.listen(window, 'resize', () => {
            if (this.opened)
                this.position();
        });
        document.addEventListener('scroll', () => {
            if (this.opened)
                this.position();
        }, { capture: true, passive: true, signal: this.events?.signal });
        this.listen(this, 'focusout', ev => {
            if (!this.contains(ev.relatedTarget))
                this.close();
        });
        const form = this.closest('form');
        if (form)
            this.listen(form, 'reset', () => setTimeout(() => { this.selected = this.getAttribute('default-value') ?? this.initialValue; this.sync(); }, 0));
    }
    sync() {
        if (!this.trigger)
            return;
        const match = this.options.find(o => o.value === this.selected);
        if (this.editable && !this.opened)
            this.trigger.value = match?.label || '';
        const caption = this.querySelector('.iq-select-value');
        if (caption)
            caption.innerHTML = `${match?.icon ? icons_js_1.icon(match.icon, 17) : ''}${escapeHTML(match?.label || this.getAttribute('placeholder') || 'Выбрать…')}`;
        const hidden = this.querySelector('input[type=hidden]');
        if (hidden) {
            hidden.value = this.selected;
            hidden.disabled = this.hasAttribute('disabled');
        }
        this.renderOptions();
    }
    renderOptions() {
        this.filtered = this.options.filter(o => !this.query || o.label.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()));
        if (this.active >= this.filtered.length)
            this.active = 0;
        this.list.innerHTML = this.filtered.length ? this.filtered.map((o, i) => `<div id="${this.list.id}-${i}" class="iq-option ${i === this.active ? 'is-active' : ''}" role="option" aria-selected="${o.value === this.selected}" ${o.disabled ? 'aria-disabled="true"' : ''} data-value="${escapeHTML(o.value)}">${o.icon ? `<span class="iq-option-icon">${icons_js_1.icon(o.icon, 18)}</span>` : ''}<span class="iq-option-copy"><span class="iq-option-label">${escapeHTML(o.label)}</span>${o.description ? `<small>${escapeHTML(o.description)}</small>` : ''}</span>${o.value === this.selected ? icons_js_1.icon('check', 17) : ''}</div>`).join('') : '<div class="iq-no-results">Ничего не найдено</div>';
        if (this.opened && this.filtered.length)
            this.trigger.setAttribute('aria-activedescendant', `${this.list.id}-${this.active}`);
        else
            this.trigger.removeAttribute('aria-activedescendant');
    }
    position() {
        const r = this.trigger.getBoundingClientRect();
        const h = Math.min(320, this.popup.scrollHeight || 300), gap = 7;
        let top = r.bottom + gap;
        if (window.innerHeight - r.bottom < h + gap && r.top > h)
            top = r.top - h - gap;
        this.popup.style.cssText = `left:${Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 240) - 8))}px;top:${Math.max(8, top)}px;width:${Math.min(Math.max(r.width, 240), innerWidth - 16)}px;max-height:${Math.max(130, innerHeight - Math.max(8, top) - 8)}px;`;
    }
    open() {
        if (this.trigger.disabled)
            return;
        const wasOpen = this.opened;
        this.opened = true;
        this.trigger.setAttribute('aria-expanded', 'true');
        if (!this.editable && !wasOpen)
            this.active = Math.max(0, this.options.findIndex(o => o.value === this.selected));
        this.renderOptions();
        try {
            this.popup.showPopover();
        }
        catch {
            this.popup.style.display = 'block';
        }
        this.position();
    }
    close() {
        if (!this.opened)
            return;
        this.opened = false;
        this.trigger.setAttribute('aria-expanded', 'false');
        this.trigger.removeAttribute('aria-activedescendant');
        try {
            this.popup.hidePopover();
        }
        catch {
            this.popup.style.display = 'none';
        }
        this.query = '';
        this.sync();
    }
    choose(v) { this.selected = v; this.close(); this.sync(); this.emit('iq-change', { value: v }); this.trigger.focus(); }
    onKey(e) {
        if (e.key === 'Tab') {
            this.close();
            return;
        }
        if (e.key === 'Escape') {
            if (this.opened) {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            }
            return;
        }
        if (e.isComposing)
            return;
        if (this.editable && !this.opened && ['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(e.key))
            return;
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            if (!this.opened) {
                this.open();
                return;
            }
            const n = this.filtered.length;
            if (!n)
                return;
            let next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (this.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
            for (let x = 0; x < n && this.filtered[next]?.disabled; x++)
                next = (next + (e.key === 'ArrowUp' ? -1 : 1) + n) % n;
            this.active = next;
            this.renderOptions();
            this.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (e.key === 'Enter' || (!this.editable && e.key === ' ')) {
            e.preventDefault();
            if (!this.opened) {
                this.open();
                return;
            }
            const o = this.filtered[this.active];
            if (o && !o.disabled)
                this.choose(o.value);
            return;
        }
        if (!this.editable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const now = Date.now();
            this.typeBuffer = now - this.typedAt > 600 ? e.key : this.typeBuffer + e.key;
            this.typedAt = now;
            if (!this.opened)
                this.open();
            const idx = this.filtered.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(this.typeBuffer.toLowerCase()));
            if (idx >= 0) {
                this.active = idx;
                this.renderOptions();
            }
        }
    }
}
exports.IqSelect = IqSelect;
class IqCombobox extends IqSelect {
}
exports.IqCombobox = IqCombobox;
class IqTabs extends IqElement {
    mount() {
        const list = this.querySelector('[data-tablist]');
        if (!list)
            return;
        const tabs = Array.from(list.querySelectorAll('[data-tab]'));
        const id = uid();
        list.setAttribute('role', 'tablist');
        list.setAttribute('aria-label', this.getAttribute('label') || 'Разделы');
        tabs.forEach((tab, i) => {
            const key = tab.dataset.tab;
            tab.id = id + '-tab-' + i;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', id + '-panel-' + i);
            const panel = this.querySelector(`[data-panel="${key}"]`);
            if (panel) {
                panel.id = id + '-panel-' + i;
                panel.setAttribute('role', 'tabpanel');
                panel.setAttribute('aria-labelledby', tab.id);
                panel.tabIndex = 0;
            }
        });
        const activate = (key, focus = false) => {
            tabs.forEach(tab => {
                const active = tab.dataset.tab === key;
                tab.setAttribute('aria-selected', String(active));
                tab.tabIndex = active ? 0 : -1;
                tab.classList.toggle('active', active);
                if (active && focus)
                    tab.focus();
            });
            this.querySelectorAll('[data-panel]').forEach(p => {
                if (p.closest('iq-tabs') === this)
                    p.hidden = p.dataset.panel !== key;
            });
            this.setAttribute('value', key);
            this.emit('iq-change', { value: key });
        };
        activate(this.getAttribute('value') || tabs[0]?.dataset.tab || '');
        this.listen(list, 'click', ev => {
            const tab = ev.target.closest('[data-tab]');
            if (tab && !tab.disabled)
                activate(tab.dataset.tab);
        });
        this.listen(list, 'keydown', ev => {
            const e = ev, enabled = tabs.filter(t => !t.disabled), i = enabled.indexOf(document.activeElement);
            let next = i;
            if (e.key === 'ArrowRight')
                next = (i + 1) % enabled.length;
            else if (e.key === 'ArrowLeft')
                next = (i - 1 + enabled.length) % enabled.length;
            else if (e.key === 'Home')
                next = 0;
            else if (e.key === 'End')
                next = enabled.length - 1;
            else
                return;
            e.preventDefault();
            activate(enabled[next].dataset.tab, true);
        });
    }
}
exports.IqTabs = IqTabs;
class IqDialog extends IqElement {
    native;
    previous = null;
    motion;
    generation = 0;
    mount() {
        if (!this.querySelector('dialog')) {
            const content = this.innerHTML;
            this.innerHTML = `<dialog class="iq-dialog ${this.getAttribute('kind') === 'drawer' ? 'iq-drawer' : ''}"><div class="iq-dialog-inner">${content}</div></dialog>`;
        }
        this.native = this.querySelector('dialog');
        const title = this.querySelector('h2,h3');
        if (title) {
            title.id ||= uid();
            this.native.setAttribute('aria-labelledby', title.id);
        }
        else
            this.native.setAttribute('aria-label', this.getAttribute('label') || 'Диалог');
        this.listen(this.native, 'cancel', e => {
            e.preventDefault();
            if (!this.hasAttribute('persistent'))
                this.close();
        });
        this.listen(this.native, 'close', () => {
            if (this.previous?.isConnected)
                this.previous.focus({ preventScroll: true });
            this.emit('iq-close', {});
        });
        this.listen(this.native, 'click', e => {
            if (e.target.closest('[data-close]')) {
                this.close();
                return;
            }
            if (e.target === this.native && !this.hasAttribute('persistent')) {
                const r = this.native.getBoundingClientRect(), m = e;
                if (m.clientX < r.left || m.clientX > r.right || m.clientY < r.top || m.clientY > r.bottom)
                    this.close();
            }
        });
        this.listen(this.native, 'keydown', ev => {
            const e = ev;
            if (e.key !== 'Tab')
                return;
            const nodes = Array.from(this.native.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(n => n.getClientRects().length > 0 && !n.closest('[hidden],[inert]'));
            if (!nodes.length) {
                e.preventDefault();
                return;
            }
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
    }
    show() {
        this.generation++;
        this.motion?.cancel();
        if (!this.native.open) {
            this.previous = document.activeElement;
            this.native.showModal();
            this.emit('iq-open', {});
        }
        if (!isReduced()) {
            const x = this.getAttribute('kind') === 'drawer';
            this.motion = this.native.animate([{ opacity: 0, transform: x ? 'translateX(20px)' : 'translateY(8px)' }, { opacity: 1, transform: 'translate(0)' }], { duration: x ? 260 : 180, easing: 'cubic-bezier(.2,.7,.2,1)' });
            this.motion.finished.catch(() => { });
        }
    }
    close(immediate = false) {
        if (!this.native?.open)
            return;
        const generation = ++this.generation;
        this.motion?.cancel();
        if (immediate || isReduced()) {
            this.native.close();
            return;
        }
        this.motion = this.native.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-out' });
        this.motion.finished.then(() => {
            if (this.generation === generation && this.native.open)
                this.native.close();
        }).catch(() => { });
    }
    get open() { return this.native?.open || false; }
    disconnectedCallback() {
        this.generation++;
        this.motion?.cancel();
        if (this.native?.open)
            this.native.close();
        super.disconnectedCallback();
    }
}
exports.IqDialog = IqDialog;
function notify(options) {
    let region = document.querySelector('#iq-toasts');
    if (!region) {
        region = document.createElement('section');
        region.id = 'iq-toasts';
        region.className = 'iq-toasts';
        region.setAttribute('aria-label', 'Уведомления');
        document.body.append(region);
    }
    const toast = document.createElement('div');
    toast.className = `iq-toast tone-${options.tone || 'info'} ${options.description ? 'has-description' : 'summary-only'}`;
    const glyph = { info: 'info', success: 'checkCircle', warning: 'warning', danger: 'xCircle' }[options.tone || 'info'];
    toast.innerHTML = `<span class="iq-toast-icon">${icons_js_1.icon(glyph, 21)}</span><div class="iq-toast-copy" role="status"><b>${escapeHTML(options.message)}</b>${options.description ? `<p>${escapeHTML(options.description)}</p>` : ''}</div>${options.action ? `<button type="button" class="iq-toast-action">${escapeHTML(options.action.label)}</button>` : ''}<button type="button" class="iq-btn icon ghost sm" aria-label="Закрыть уведомление">${icons_js_1.icon('x', 16)}</button>`;
    region.append(toast);
    let timer;
    let remaining = options.duration ?? 6500;
    let start = Date.now();
    let removed = false;
    const remove = () => {
        if (removed)
            return;
        removed = true;
        clearTimeout(timer);
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), isReduced() ? 0 : 150);
    };
    const resume = () => {
        clearTimeout(timer);
        if (removed || toast.matches(':hover') || toast.contains(document.activeElement))
            return;
        start = Date.now();
        timer = setTimeout(remove, remaining);
    };
    const pause = () => { clearTimeout(timer); remaining = Math.max(500, remaining - (Date.now() - start)); };
    resume();
    toast.addEventListener('pointerenter', pause);
    toast.addEventListener('pointerleave', resume);
    toast.addEventListener('focusin', pause);
    toast.addEventListener('focusout', e => {
        if (!toast.contains(e.relatedTarget))
            resume();
    });
    toast.querySelector('.iq-btn').addEventListener('click', remove);
    toast.querySelector('.iq-toast-action')?.addEventListener('click', () => { options.action?.run(); remove(); });
    return remove;
}
/** Native numeric input preserves editing, selection, and assistive technology support. */
class IqNumber extends IqElement {
    initial = 0;
    static get observedAttributes() { return ['disabled', 'value', 'min', 'max', 'step']; }
    attributeChangedCallback(name, _old, value) {
        const input = this.querySelector('input');
        if (!input)
            return;
        if (name === 'value')
            input.value = value || '0';
        else if (name !== 'disabled') {
            if (value === null)
                input.removeAttribute(name);
            else
                input.setAttribute(name, value);
        }
        this.sync(false);
    }
    sync(emit) {
        const input = this.querySelector('input');
        if (!input)
            return;
        const disabled = this.hasAttribute('disabled');
        input.disabled = disabled;
        const min = input.min === '' ? -Infinity : Number(input.min), max = input.max === '' ? Infinity : Number(input.max);
        const buttons = this.querySelectorAll('button');
        buttons[0].disabled = disabled || input.valueAsNumber <= min;
        buttons[1].disabled = disabled || input.valueAsNumber >= max;
        if (emit)
            this.emit('iq-change', { value: input.valueAsNumber });
    }
    mount() {
        const label = this.getAttribute('label') || 'Количество', id = uid();
        const attr = (name, fallback) => escapeHTML(this.getAttribute(name) ?? fallback);
        this.innerHTML = `<label class="iq-control-label" for="${id}">${escapeHTML(label)}</label><div class="iq-number"><button type="button" aria-label="Уменьшить ${escapeHTML(label.toLowerCase())}">${icons_js_1.icon('minus', 17)}</button><input id="${id}" type="number" min="${attr('min', '0')}" max="${attr('max', '100')}" step="${attr('step', '1')}" value="${attr('value', this.getAttribute('min') || '0')}" name="${attr('name', '')}"><button type="button" aria-label="Увеличить ${escapeHTML(label.toLowerCase())}">${icons_js_1.icon('plus', 17)}</button></div>`;
        const input = this.querySelector('input');
        this.initial = input.valueAsNumber;
        const description = this.getAttribute('aria-describedby');
        if (description)
            input.setAttribute('aria-describedby', description);
        this.querySelectorAll('button').forEach((button, i) => this.listen(button, 'click', () => {
            try {
                i ? input.stepUp() : input.stepDown();
            }
            catch {
                return;
            }
            this.sync(true);
        }));
        this.listen(input, 'input', () => this.sync(false));
        this.listen(input, 'change', () => { const n = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : this.initial; input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), n))); this.sync(true); });
        const form = this.closest('form');
        if (form)
            this.listen(form, 'reset', () => queueMicrotask(() => {
                if (!this.isConnected)
                    return;
                input.value = String(this.initial);
                this.sync(false);
            }));
        this.sync(false);
    }
    get value() { return this.querySelector('input')?.valueAsNumber ?? 0; }
    set value(n) {
        if (Number.isFinite(n))
            this.setAttribute('value', String(n));
    }
}
exports.IqNumber = IqNumber;
class IqRange extends IqElement {
    initial = '50';
    static get observedAttributes() { return ['disabled', 'value', 'min', 'max', 'step']; }
    attributeChangedCallback(name, _old, value) {
        const input = this.querySelector('input');
        if (!input)
            return;
        if (name === 'disabled')
            input.disabled = value !== null;
        else if (name === 'value')
            input.value = value || '50';
        else if (value === null)
            input.removeAttribute(name);
        else
            input.setAttribute(name, value);
        this.sync(false);
    }
    sync(emit) {
        const input = this.querySelector('input');
        if (!input)
            return;
        const min = Number(input.min), max = Number(input.max), unit = this.getAttribute('unit') || '';
        input.style.setProperty('--range-fill', `${max > min ? (input.valueAsNumber - min) / (max - min) * 100 : 0}%`);
        this.querySelector('output').value = input.value + unit;
        if (emit)
            this.emit('iq-change', { value: input.valueAsNumber });
    }
    mount() {
        const id = uid(), label = this.getAttribute('label') || 'Значение';
        const attr = (n, f) => escapeHTML(this.getAttribute(n) ?? f);
        this.innerHTML = `<div class="iq-range-heading"><label for="${id}" class="iq-control-label">${escapeHTML(label)}</label><output for="${id}"></output></div><input id="${id}" type="range" min="${attr('min', '0')}" max="${attr('max', '100')}" step="${attr('step', '1')}" value="${attr('value', '50')}" name="${attr('name', '')}" ${this.hasAttribute('disabled') ? 'disabled' : ''}><div class="iq-range-scale"><span>${attr('min', '0')}${attr('unit', '')}</span><span>${attr('max', '100')}${attr('unit', '')}</span></div>`;
        const input = this.querySelector('input');
        this.initial = input.value;
        this.listen(input, 'input', () => this.sync(true));
        const form = this.closest('form');
        if (form)
            this.listen(form, 'reset', () => queueMicrotask(() => {
                if (!this.isConnected)
                    return;
                input.value = this.initial;
                this.sync(false);
            }));
        this.sync(false);
    }
    get value() { return this.querySelector('input')?.valueAsNumber ?? 0; }
    set value(n) {
        if (Number.isFinite(n))
            this.setAttribute('value', String(n));
    }
}
exports.IqRange = IqRange;
class IqCalendar extends IqElement {
    current = new Date();
    chosen = '';
    focused = '';
    time = '14:30';
    initial = '';
    cycle = 24;
    get value() { return this.chosen; }
    set value(v) {
        if (this.valid(v)) {
            this.chosen = this.clamp(v);
            this.focused = this.chosen;
            this.current = new Date(this.chosen + 'T12:00:00');
            this.current.setDate(1);
            if (this.isConnected)
                this.render();
        }
    }
    get timeValue() { return this.time; }
    set timeValue(value) {
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
            this.time = value;
            if (this.isConnected)
                this.render();
        }
    }
    fmt(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    valid(s) { const d = new Date(s + 'T12:00:00'); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(+d) && this.fmt(d) === s; }
    clamp(s) { const min = this.getAttribute('min'), max = this.getAttribute('max'); return min && this.valid(min) && s < min ? min : max && this.valid(max) && s > max ? max : s; }
    mount() {
        this.cycle = this.getAttribute('hour-cycle') === '12' ? 12 : 24;
        const supplied = this.getAttribute('value') || '';
        this.initial = this.valid(supplied) ? supplied : this.fmt(new Date());
        this.chosen = this.clamp(this.initial);
        this.focused = this.chosen;
        this.current = new Date(this.chosen + 'T12:00:00');
        this.current.setDate(1);
        const time = this.getAttribute('time') || '14:30';
        this.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '14:30';
        this.render();
        this.listen(this, 'click', ev => {
            const b = ev.target.closest('[data-month],[data-date]');
            if (!b || b.disabled)
                return;
            if (b.dataset.month) {
                this.current.setMonth(this.current.getMonth() + Number(b.dataset.month));
                this.focused = this.clamp(this.fmt(this.current));
                this.render();
                this.focusControl(`[data-month="${b.dataset.month}"]`);
            }
            else if (b.dataset.date) {
                this.chosen = b.dataset.date;
                this.focused = this.chosen;
                this.render();
                this.focusActiveDate();
                this.changed();
            }
        });
        this.listen(this, 'keydown', e => this.key(e));
        this.listen(this, 'iq-format-change', e => {
            e.stopPropagation();
            this.cycle = e.detail.hourCycle;
            const output = this.querySelector('output');
            if (output)
                output.value = this.displayTime();
        });
        this.listen(this, 'iq-time-change', e => {
            e.stopPropagation();
            this.time = e.detail.value;
            const output = this.querySelector('output');
            if (output)
                output.value = this.displayTime();
            const hidden = this.querySelector('[data-time-hidden]');
            if (hidden)
                hidden.value = this.time;
            this.changed();
        });
        const f = this.closest('form');
        if (f)
            this.listen(f, 'reset', () => { this.value = this.initial; this.time = this.getAttribute('time') || '14:30'; this.render(); });
    }
    displayTime() { const [h, m] = this.time.split(':'); return this.cycle === 24 ? this.time : `${String(Number(h) % 12 || 12).padStart(2, '0')}:${m} ${Number(h) >= 12 ? 'PM' : 'AM'}`; }
    changed() { this.emit('iq-change', { value: this.chosen, ...(this.hasAttribute('with-time') ? { time: this.time, localDateTime: this.chosen + 'T' + this.time } : {}) }); }
    render() {
        const y = this.current.getFullYear(), m = this.current.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = this.fmt(new Date()), label = this.current.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), min = this.getAttribute('min'), max = this.getAttribute('max');
        let rows = '';
        for (let r = 0; r < Math.ceil((first + days) / 7); r++) {
            rows += '<div role="row">';
            for (let c = 0; c < 7; c++) {
                const n = r * 7 + c - first + 1;
                if (n < 1 || n > days) {
                    rows += '<span role="gridcell"></span>';
                    continue;
                }
                const value = this.fmt(new Date(y, m, n)), selected = value === this.chosen, disabled = !!((min && value < min) || (max && value > max));
                rows += `<span role="gridcell" aria-selected="${selected}"><button type="button" data-date="${value}" tabindex="${value === this.focused && !disabled ? 0 : -1}" class="${selected ? 'selected' : ''} ${value === today ? 'today' : ''}" aria-label="${new Date(y, m, n).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>${n}</button></span>`;
            }
            rows += '</div>';
        }
        const name = this.hasAttribute('data-field-calendar') ? '' : escapeHTML(this.getAttribute('name') || 'date'), [h, minute] = this.time.split(':');
        this.innerHTML = `<div class="iq-calendar-heading"><b aria-live="polite">${label}</b><div class="calendar-arrows"><button type="button" class="iq-btn icon ghost sm" data-month="-1" aria-label="Предыдущий месяц">${icons_js_1.icon('left', 18)}</button><button type="button" class="iq-btn icon ghost sm" data-month="1" aria-label="Следующий месяц">${icons_js_1.icon('chevron', 18)}</button></div></div><div class="iq-calendar-grid" role="grid" aria-label="${label}"><div role="row" class="iq-calendar-week">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => `<span role="columnheader">${x}</span>`).join('')}</div>${rows}</div>${this.hasAttribute('with-time') ? `<iq-time value="${this.time}" hour-cycle="${this.cycle}"></iq-time>` : ''}<div class="iq-calendar-foot"><span>${icons_js_1.icon('calendar', 17)}<span>${new Date(this.chosen + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span></span>${this.hasAttribute('with-time') ? `<output>${this.displayTime()}</output>` : '<span class="calendar-foot-hint">Выбрано</span>'}</div>${name ? `<input type="hidden" name="${name}" value="${this.chosen}">` : ''}${this.hasAttribute('with-time') && name ? `<input type="hidden" data-time-hidden name="${name}-time" value="${this.time}">` : ''}`;
    }
    focusActiveDate() { this.focusControl(`[data-date="${this.focused}"]`); }
    focusControl(selector) {
        const target = this.querySelector(selector);
        if (!target)
            return;
        target.focus({ preventScroll: true });
        const popup = this.closest('.iq-date-popup');
        if (!popup)
            return;
        const rect = target.getBoundingClientRect(), parent = popup.getBoundingClientRect();
        const footer = popup.querySelector('.iq-date-actions')?.offsetHeight || 0;
        if (rect.bottom > parent.bottom - footer - 8)
            popup.scrollTop += rect.bottom - parent.bottom + footer + 8;
        else if (rect.top < parent.top + 8)
            popup.scrollTop -= parent.top + 8 - rect.top;
    }
    key(e) {
        const b = e.target.closest('[data-date]');
        if (!b)
            return;
        const d = new Date(b.dataset.date + 'T12:00:00');
        let delta = 0;
        switch (e.key) {
            case 'ArrowRight':
                delta = 1;
                break;
            case 'ArrowLeft':
                delta = -1;
                break;
            case 'ArrowDown':
                delta = 7;
                break;
            case 'ArrowUp':
                delta = -7;
                break;
            case 'Home':
                delta = -((d.getDay() + 6) % 7);
                break;
            case 'End':
                delta = 6 - (d.getDay() + 6) % 7;
                break;
            case 'PageDown':
            case 'PageUp': {
                const day = d.getDate();
                d.setDate(1);
                d.setMonth(d.getMonth() + (e.key === 'PageDown' ? 1 : -1) * (e.shiftKey ? 12 : 1));
                d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
                break;
            }
            default: return;
        }
        e.preventDefault();
        d.setDate(d.getDate() + delta);
        this.focused = this.clamp(this.fmt(d));
        this.current = new Date(this.focused + 'T12:00:00');
        this.current.setDate(1);
        this.render();
        this.focusActiveDate();
    }
}
exports.IqCalendar = IqCalendar;
/** Menu owns positioning, focus, typeahead and cleanup. */
class IqMenu extends IqElement {
    popup;
    trigger;
    opened = false;
    frame = 0;
    typeahead = '';
    typeTimer = 0;
    mount() {
        this.trigger = this.querySelector('button');
        this.popup = this.querySelector('[data-menu]');
        if (!this.trigger || !this.popup)
            return;
        this.popup.classList.add('iq-popup', 'iq-menu-popup');
        this.popup.setAttribute('popover', 'manual');
        this.popup.setAttribute('role', 'menu');
        this.popup.id ||= uid();
        this.trigger.setAttribute('aria-haspopup', 'menu');
        this.trigger.setAttribute('aria-expanded', 'false');
        this.trigger.setAttribute('aria-controls', this.popup.id);
        this.items().forEach(b => { if (!b.hasAttribute('role'))
            b.setAttribute('role', 'menuitem'); b.tabIndex = -1; });
        this.listen(this.trigger, 'click', () => this.opened ? this.close() : this.open());
        this.listen(this.trigger, 'keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            this.open(e.key === 'ArrowUp');
        } });
        this.listen(this.popup, 'keydown', e => {
            const items = this.items();
            if (!items.length)
                return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.close();
                return;
            }
            if (e.key === 'Tab') {
                this.close();
                return;
            }
            let i = items.indexOf(document.activeElement), next;
            if (e.key === 'ArrowDown')
                next = (i + 1) % items.length;
            else if (e.key === 'ArrowUp')
                next = (i - 1 + items.length) % items.length;
            else if (e.key === 'Home')
                next = 0;
            else if (e.key === 'End')
                next = items.length - 1;
            else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
                clearTimeout(this.typeTimer);
                this.typeahead += e.key.toLocaleLowerCase('ru');
                next = items.findIndex(b => b.textContent.trim().toLocaleLowerCase('ru').startsWith(this.typeahead));
                this.typeTimer = setTimeout(() => this.typeahead = '', 650);
            }
            else
                return;
            e.preventDefault();
            if (next >= 0)
                items[next]?.focus({ preventScroll: true });
            items[next]?.scrollIntoView({ block: 'nearest' });
        });
        this.listen(this.popup, 'click', e => { const item = e.target.closest('button'); if (!item || item.disabled)
            return; const action = item.dataset.action || item.textContent; this.close(); this.emit('iq-action', { action }); });
        this.listen(document, 'pointerdown', e => { if (this.opened && !this.contains(e.target))
            this.close(false); });
        const schedule = () => { if (!this.opened)
            return; cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.position()); };
        this.listen(window, 'resize', schedule);
        document.addEventListener('scroll', e => { if (!this.popup.contains(e.target))
            schedule(); }, { capture: true, passive: true, signal: this.events.signal });
        this.addCleanup(() => { cancelAnimationFrame(this.frame); clearTimeout(this.typeTimer); this.close(false); });
    }
    items() { return Array.from(this.popup?.querySelectorAll('button:not(:disabled)') || []); }
    position() {
        if (!this.opened)
            return;
        const r = this.trigger.getBoundingClientRect(), p = this.popup;
        if (r.bottom < 0 || r.top > innerHeight) {
            this.close(false);
            return;
        }
        p.style.maxHeight = Math.max(100, innerHeight - 24) + 'px';
        const w = p.offsetWidth, h = p.offsetHeight;
        p.style.left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + 'px';
        p.style.top = Math.max(12, Math.min(r.bottom + h + 8 <= innerHeight - 12 ? r.bottom + 8 : r.top - h - 8, innerHeight - h - 12)) + 'px';
    }
    open(last = false) {
        if (this.opened)
            return;
        this.opened = true;
        this.trigger.setAttribute('aria-expanded', 'true');
        this.popup.showPopover();
        this.position();
        const chosen = last ? this.items().at(-1) : this.popup.querySelector('[aria-checked=true]') || this.items()[0];
        chosen?.focus({ preventScroll: true });
        if (!isReduced()) {
            const a = this.popup.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 150, easing: 'cubic-bezier(.2,.7,.2,1)' });
            this.addCleanup(() => a.cancel());
        }
    }
    close(focus = true) {
        if (!this.opened)
            return;
        this.opened = false;
        this.trigger?.setAttribute('aria-expanded', 'false');
        try {
            this.popup.hidePopover();
        }
        catch { }
        if (focus && this.trigger?.isConnected)
            this.trigger.focus({ preventScroll: true });
    }
}
exports.IqMenu = IqMenu;
class IqTooltip extends IqElement {
    mount() {
        const child = this.firstElementChild;
        if (!child)
            return;
        this.querySelector('.iq-tooltip')?.remove();
        const tip = document.createElement('span');
        tip.className = 'iq-tooltip';
        tip.id = uid();
        tip.setAttribute('role', 'tooltip');
        tip.setAttribute('popover', 'manual');
        tip.textContent = this.getAttribute('text') || '';
        this.append(tip);
        child.setAttribute('aria-describedby', tip.id);
        let dismissed = false;
        const close = () => {
            try {
                tip.hidePopover();
            }
            catch { }
        };
        const open = () => {
            if (dismissed)
                return;
            try {
                tip.showPopover();
            }
            catch {
                return;
            }
            const r = child.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
            tip.style.left = Math.max(8, Math.min(r.left + (r.width - w) / 2, innerWidth - w - 8)) + 'px';
            tip.style.top = Math.max(8, r.top > h + 10 ? r.top - h - 8 : r.bottom + 8) + 'px';
        };
        this.listen(child, 'pointerenter', () => { dismissed = false; open(); });
        this.listen(child, 'focus', () => { dismissed = false; open(); });
        this.listen(child, 'blur', close);
        this.listen(this, 'pointerleave', close);
        this.listen(this, 'keydown', e => {
            if (e.key === 'Escape') {
                dismissed = true;
                close();
                e.stopPropagation();
            }
        });
        this.listen(window, 'resize', close);
    }
}
exports.IqTooltip = IqTooltip;
class IqTags extends IqElement {
    chosen = [];
    get value() { return [...this.chosen]; }
    mount() {
        this.chosen = (this.getAttribute('value') || defaultTags).split(',').filter(Boolean);
        this.render();
        this.listen(this, 'click', ev => {
            const b = ev.target.closest('[data-remove]');
            if (b) {
                this.chosen = this.chosen.filter(v => v !== b.dataset.remove);
                this.render();
                this.querySelector('input')?.focus();
                this.emit('iq-change', { value: this.value });
            }
        });
        this.listen(this, 'keydown', ev => {
            const e = ev, input = e.target;
            if (input.tagName !== 'INPUT')
                return;
            if (e.isComposing)
                return;
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const v = input.value.trim();
                if (v && !this.chosen.includes(v) && this.chosen.length < 8) {
                    this.chosen.push(v);
                    this.render();
                    this.querySelector('input')?.focus();
                    this.emit('iq-change', { value: this.value });
                }
            }
            else if (e.key === 'Backspace' && !input.value && this.chosen.length) {
                this.chosen.pop();
                this.render();
                this.querySelector('input')?.focus();
                this.emit('iq-change', { value: this.value });
            }
        });
    }
    render() { const id = uid(); this.innerHTML = `<label for="${id}" class="iq-control-label">${escapeHTML(this.getAttribute('label') || 'Метки')}</label><div class="iq-tags-input">${this.chosen.map(v => `<span class="iq-tag">${escapeHTML(v)}<button type="button" data-remove="${escapeHTML(v)}" aria-label="Удалить метку ${escapeHTML(v)}">${icons_js_1.icon('x', 13)}</button></span>`).join('')}<input id="${id}" placeholder="Добавить…" maxlength="32" aria-describedby="${id}-help"></div><small class="iq-helper" id="${id}-help">Enter — добавить / Backspace — удалить / до 8 меток</small>`; }
}
exports.IqTags = IqTags;
class IqUpload extends IqElement {
    selected = [];
    seeded = false;
    depth = 0;
    fileErrors = [];
    get files() { return [...this.selected]; }
    mount() {
        if (this.hasAttribute('samples') && !this.seeded) {
            this.selected = media_js_1.exampleFiles();
            this.seeded = true;
        }
        const rows = this.getAttribute('variant') === 'rows';
        this.innerHTML = `${rows ? '' : `<div class="iq-dropzone"><div class="iq-upload-art" aria-hidden="true"><span class="upload-back-sheet"></span><span class="iq-upload-sheet">${icons_js_1.icon('file', 33)}</span><span class="iq-upload-circle">${icons_js_1.icon('plus', 18)}</span></div><div class="upload-copy"><b>Добавьте рабочие материалы</b><p>Перетащите файлы в эту область<br>или выберите их на устройстве.</p></div><button type="button" class="iq-btn secondary sm" data-pick-file>${icons_js_1.icon('upload', 18)}Выбрать файлы</button><div class="upload-limits"><span>PDF, текст, изображения, видео и ZIP</span><span>До 10 МБ на файл. Не более 10 файлов.</span></div></div>`}<input type="file" multiple hidden accept="${escapeHTML(this.getAttribute('accept') || '.pdf,.png,.jpg,.jpeg,.svg,.webp,.avif,.gif,.zip,.txt,.md,.csv,.json,.mp4,.webm,.mov')}" aria-label="Выбрать файлы для загрузки"><div class="upload-errors"></div><div class="iq-upload-list"></div>${rows ? `<button type="button" class="file-dropwell" data-pick-file>${icons_js_1.icon('plus', 20)}<span>Переместите файлы сюда <span>или выберите на устройстве</span></span></button>` : ''}<p class="iq-helper upload-privacy">${icons_js_1.icon('lock', 14)}<span>Файлы остаются на устройстве. Серверная отправка не выполняется.</span></p><span class="sr-only" role="status" data-upload-status></span>`;
        const input = this.querySelector('input[type=file]'), drop = this.querySelector('.iq-dropzone,.file-dropwell');
        this.listen(input, 'change', () => { this.add(Array.from(input.files || [])); input.value = ''; });
        this.listen(this, 'click', ev => {
            const t = ev.target;
            if (t.closest('[data-pick-file]'))
                input.click();
            const b = t.closest('[data-remove-file]');
            if (b) {
                this.selected.splice(Number(b.dataset.removeFile), 1);
                this.renderList();
                this.emit('iq-files', { files: this.files });
                this.querySelector('[data-pick-file]')?.focus();
            }
        });
        if (drop) {
            this.listen(drop, 'dragenter', ev => { ev.preventDefault(); this.depth++; drop.classList.add('dragover'); });
            this.listen(drop, 'dragover', ev => {
                ev.preventDefault();
                if (ev.dataTransfer)
                    ev.dataTransfer.dropEffect = 'copy';
            });
            this.listen(drop, 'dragleave', () => {
                this.depth = Math.max(0, this.depth - 1);
                if (!this.depth)
                    drop.classList.remove('dragover');
            });
            this.listen(drop, 'drop', ev => { ev.preventDefault(); this.depth = 0; drop.classList.remove('dragover'); this.add(Array.from(ev.dataTransfer?.files || [])); });
        }
        this.renderList();
    }
    add(files) {
        this.fileErrors = [];
        const allowed = /\.(pdf|png|jpe?g|svg|webp|avif|gif|zip|txt|md|csv|json|mp4|webm|mov)$/i, accepted = (this.getAttribute('accept') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) {
                this.fileErrors.push(file.name + ' — больше 10 МБ. Уменьшите размер файла.');
                continue;
            }
            const fn = file.name.toLowerCase(), mime = file.type.toLowerCase(), matches = !accepted.length || accepted.some(t => t.startsWith('.') ? fn.endsWith(t) : t.endsWith('/*') ? mime.startsWith(t.slice(0, -1)) : mime === t);
            if (!allowed.test(fn) || !matches) {
                this.fileErrors.push(file.name + ' — формат не поддерживается. Выберите PDF, текст, изображение, видео или ZIP.');
                continue;
            }
            if (this.selected.length >= 10) {
                this.fileErrors.push('Можно выбрать до 10 файлов. Уберите лишние перед добавлением новых.');
                break;
            }
            if (!this.selected.some(x => x.name === file.name && x.size === file.size && x.lastModified === file.lastModified))
                this.selected.push(file);
        }
        this.renderList();
        this.emit('iq-files', { files: this.files });
    }
    renderList() {
        this.querySelector('.upload-errors').innerHTML = this.fileErrors.length ? `<div class="iq-alert danger" role="alert"><span class="message-emblem">${icons_js_1.icon('x', 25)}</span><div class="message-copy"><b>Не все файлы добавлены</b><p>${this.fileErrors.map(escapeHTML).join('<br>')}</p></div></div>` : '';
        this.querySelector('.iq-upload-list').innerHTML = this.selected.map((f, i) => `<div class="iq-file-item"><iq-file-preview></iq-file-preview><div class="file-item-copy"><b>${escapeHTML(f.name)}</b><small><span>${f.size < 1048576 ? (f.size / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' КБ' : (f.size / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ'}</span><span>На устройстве</span></small></div><span class="iq-file-check" aria-label="Файл выбран">${icons_js_1.icon('check', 18)}</span><button type="button" class="iq-btn ghost icon sm" data-remove-file="${i}" aria-label="Убрать ${escapeHTML(f.name)}">${icons_js_1.icon('x', 17)}</button></div>`).join('');
        this.querySelectorAll('iq-file-preview').forEach((el, i) => el.file = this.selected[i]);
        this.querySelector('[data-upload-status]').textContent = `Выбрано файлов: ${this.selected.length}`;
    }
}
exports.IqUpload = IqUpload;
function registerComponents() {
    const definitions = { 'iq-file-preview': media_js_1.IqFilePreview, 'iq-select': IqSelect, 'iq-combobox': IqCombobox, 'iq-tabs': IqTabs, 'iq-dialog': IqDialog, 'iq-number': IqNumber, 'iq-range': IqRange, 'iq-calendar': IqCalendar, 'iq-menu': IqMenu, 'iq-tooltip': IqTooltip, 'iq-tags': IqTags, 'iq-upload': IqUpload };
    Object.entries(definitions).forEach(([name, type]) => {
        if (!customElements.get(name))
            customElements.define(name, type);
    });
}
/** DOM enhancement for native semantic controls. Invoke after rendering a view. */
const enhancedRoots = new WeakMap();
function enhance(root = document) {
    enhancedRoots.get(root)?.abort();
    const abort = new AbortController();
    enhancedRoots.set(root, abort);
    const opts = { signal: abort.signal };
    interaction_js_1.bindAutosize(root, abort.signal);
    const cancelReveal = interaction_js_1.revealContent(root);
    abort.signal.addEventListener("abort", cancelReveal, { once: true });
    root.querySelectorAll('[data-password]').forEach(b => b.addEventListener('click', () => {
        const input = b.closest('.iq-input-shell')?.querySelector('input');
        if (!input)
            return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(show));
        b.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    }, opts));
    root.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); }, opts));
    root.querySelectorAll('[data-segmented]').forEach(group => {
        group.setAttribute('role', 'group');
        const buttons = Array.from(group.querySelectorAll('button'));
        buttons.forEach(b => b.addEventListener('click', () => { buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b))); group.dispatchEvent(new CustomEvent('iq-change', { bubbles: true, detail: { value: b.dataset.value || b.textContent } })); }, opts));
    });
    root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => { void interaction_js_1.copyAtButton(b, b.dataset.copy || ''); }, opts));
    root.querySelectorAll('[data-dialog]').forEach(b => b.addEventListener('click', () => document.getElementById(b.dataset.dialog) && document.getElementById(b.dataset.dialog).show(), opts));
    root.querySelectorAll('[data-indeterminate]').forEach(c => { c.indeterminate = true; });
    return () => abort.abort();
}

