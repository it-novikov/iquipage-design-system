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
    emit(type, detail, {cancelable = false} = {}) { return this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, cancelable, detail })); }
}
exports.IqElement = IqElement;
/** Select-only combobox. Native hidden input provides normal form submission. */
/** An option's avatar (vnext.27: also in the open list, so people and service accounts read alike): initials over an
 *  optional photo, or {kind:'bot'} — a service account's square avatar with the bot glyph, its role spoken, not shown. */
function optionAvatar(o) {
    if (o?.avatar?.kind === 'bot') return `<span class="iq-avatar xs iq-select-avatar bot" aria-hidden="true">${icons_js_1.icon('bot', 12)}</span>`;
    if (!o?.avatar || typeof o.avatar.text !== 'string') return '';
    const photo = typeof o.avatar.image === 'string' && /^(\/(?!\/)|blob:|https:\/\/)/.test(o.avatar.image) ? `<img src="${escapeHTML(o.avatar.image)}" alt="" decoding="async">` : '';
    return `<span class="iq-avatar xs iq-select-avatar v${Number(o.avatar.tone) || 1}${photo ? ' has-image' : ''}" aria-hidden="true">${escapeHTML(o.avatar.text.slice(0, 2))}${photo}</span>`;
}
/** The value of the «create» option of a creatable combobox; never a real option value. */
const CREATE_VALUE = '__iq_create__';
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
        this.innerHTML = `<span class="iq-control-label" id="${id}-label">${escapeHTML(label)}</span><div class="iq-select-wrap">${this.editable ? `<div class="iq-combo-shell">${icons_js_1.icon('search', 17)}<input class="iq-combo-input" role="combobox" aria-autocomplete="list" autocomplete="off" ${disabled ? 'disabled' : ''} aria-expanded="false" aria-controls="${id}-list" aria-labelledby="${id}-label" placeholder="${escapeHTML(this.getAttribute('placeholder') || 'Найти…')}">${icons_js_1.icon('down', 16)}</div>` : `<button type="button" class="iq-select-trigger" role="combobox" ${disabled ? 'disabled' : ''} aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" aria-labelledby="${id}-label"><span class="iq-select-value"></span>${icons_js_1.icon('down', 16)}</button>`}<div class="iq-popup iq-select-popup" popover="manual">${!this.editable && this.hasAttribute('searchable') ? `<div class="iq-select-search">${icons_js_1.icon('search', 16)}<input type="search" autocomplete="off" aria-label="${escapeHTML(this.getAttribute('search-placeholder') || 'Найти')}" aria-controls="${id}-list" placeholder="${escapeHTML(this.getAttribute('search-placeholder') || 'Найти')}"></div>` : ''}<div id="${id}-list" role="listbox" aria-labelledby="${id}-label"></div></div></div><input type="hidden" ${name ? `name="${escapeHTML(name)}"` : ''}>`;
        this.trigger = this.querySelector('[role=combobox]');
        this.popup = this.querySelector('.iq-popup');
        this.list = this.querySelector('[role=listbox]');
        // searchable: the closed control stays a value; the search lives inside the open list.
        this.search = this.querySelector('.iq-select-search input');
        if (this.search) {
            this.listen(this.search, 'input', () => { this.query = this.search.value; this.active = 0; this.renderOptions(); });
            this.listen(this.search, 'keydown', ev => {
                if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Tab'].includes(ev.key)) this.onKey(ev);
                else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.close(); this.trigger.focus(); }
            });
        }
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
        const bot = match?.avatar?.kind === 'bot', avatar = optionAvatar(match);
        const caption = this.querySelector('.iq-select-value');
        // trigger-icon="none" (vnext.27): an option's glyph stays in the open list; the closed control shows the word.
        const glyph = match?.icon && this.getAttribute('trigger-icon') !== 'none' ? icons_js_1.icon(match.icon, 17) : '';
        const lead = this.getAttribute('appearance') === 'pill' ? '<span class="iq-select-dot" aria-hidden="true"></span>' : avatar || glyph;
        const role = bot ? `<span class="sr-only">, ${escapeHTML(typeof match.avatar.label === 'string' && match.avatar.label ? match.avatar.label : 'сервисный аккаунт')}</span>` : '';
        if (caption)
            caption.innerHTML = `${lead}${match?.key ? `<span class="iq-select-key">${escapeHTML(match.key)}</span>` : ''}<span class="iq-select-label">${escapeHTML(match?.label || this.getAttribute('placeholder') || 'Выбрать…')}</span>${role}${match?.meta ? `<span class="iq-select-meta">${escapeHTML(match.meta)}</span>` : ''}`;
        // The selected option's tone and avatar show on the closed control (value-first property chips).
        this.trigger.dataset.tone = typeof match?.tone === 'string' ? match.tone : '';
        this.dataset.empty = String(!match?.value);
        if (this.editable) {
            const shell = this.querySelector('.iq-combo-shell');
            shell?.querySelector(':scope > .iq-select-avatar')?.remove();
            if (shell && avatar) shell.insertAdjacentHTML('afterbegin', avatar);
        }
        const hidden = this.querySelector('input[type=hidden]');
        if (hidden) {
            hidden.value = this.selected;
            hidden.disabled = this.hasAttribute('disabled');
        }
        this.renderOptions();
    }
    renderOptions() {
        const query = this.query.toLocaleLowerCase();
        this.filtered = this.options.filter(o => !query || o.label.toLocaleLowerCase().includes(query) || (typeof o.key === 'string' && o.key.toLocaleLowerCase().includes(query)));
        if (this.active >= this.filtered.length)
            this.active = 0;
        // creatable (vnext.30): a combobox offers to create what was typed when no option is called that.
        const typed = this.query.trim();
        if (this.editable && this.hasAttribute('creatable') && typed && !this.options.some(o => o.label.trim().toLocaleLowerCase() === typed.toLocaleLowerCase()))
            this.filtered = [...this.filtered, { value: CREATE_VALUE, label: (this.getAttribute('create-label') || 'Создать «{query}»').replace('{query}', typed), icon: 'plus', create: typed }];
        if (this.active >= this.filtered.length)
            this.active = 0;
        this.list.innerHTML = this.filtered.length ? this.filtered.map((o, i) => `<div id="${this.list.id}-${i}" class="iq-option ${i === this.active ? 'is-active' : ''}${o.separator ? ' iq-option-separated' : ''}" role="option" aria-selected="${o.value === this.selected}" ${o.disabled ? 'aria-disabled="true"' : ''} data-value="${escapeHTML(o.value)}">${o.avatar ? `<span class="iq-option-icon">${optionAvatar(o)}</span>` : o.icon ? `<span class="iq-option-icon">${icons_js_1.icon(o.icon, 18)}</span>` : ''}<span class="iq-option-copy"><span class="iq-option-label">${o.key ? `<span class="iq-select-key">${escapeHTML(o.key)}</span> ` : ''}${escapeHTML(o.label)}</span>${o.description ? `<small>${escapeHTML(o.description)}</small>` : ''}</span>${o.meta ? `<span class="iq-option-meta">${escapeHTML(o.meta)}</span>` : ''}${o.value === this.selected ? icons_js_1.icon('check', 17) : ''}</div>`).join('') : '<div class="iq-no-results">Ничего не найдено</div>';
        for (const owner of [this.trigger, this.search].filter(Boolean)) {
            if (this.opened && this.filtered.length)
                owner.setAttribute('aria-activedescendant', `${this.list.id}-${this.active}`);
            else
                owner.removeAttribute('aria-activedescendant');
        }
    }
    position() {
        const r = this.trigger.getBoundingClientRect();
        const h = Math.min(320, this.popup.scrollHeight || 300), gap = 7;
        let top = r.bottom + gap;
        if (window.innerHeight - r.bottom < h + gap && r.top > h)
            top = r.top - h - gap;
        // One width for every list opened from a short value (vnext.27); a wide form field keeps its own width.
        const width = Math.min(Math.max(r.width, 280), innerWidth - 16);
        this.popup.style.cssText = `left:${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px;top:${Math.max(8, top)}px;width:${width}px;max-height:${Math.max(130, innerHeight - Math.max(8, top) - 8)}px;`;
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
        if (this.search && !wasOpen) requestAnimationFrame(() => { if (this.opened) this.search.focus({ preventScroll: true }); });
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
        if (this.search) this.search.value = '';
        this.sync();
    }
    choose(v) {
        if (v === CREATE_VALUE) {
            // The host creates the option (a request may fail); it then adds it to options and sets the value.
            const label = this.query.trim();
            this.close();
            this.emit('iq-create', { label });
            this.trigger.focus();
            return;
        }
        this.selected = v; this.close(); this.sync(); this.emit('iq-change', { value: v }); this.trigger.focus();
    }
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
            this.native.inert = false;
            this.closing = false;
            this.settle();
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
    /** instant: no entrance motion, for a surface that replaces another in the same frame (for example one task drawer
     *  handing over to the next), so the backdrop and panel never blink. */
    /** Enter and exit are a symmetrical pair from the tokens (MOT-08): a dialog fades on --iq-motion-standard, a drawer slides
     *  on --iq-motion-enter. Under reduced motion the tokens are 0 and nothing animates. */
    motionMs() {
        const drawer = this.getAttribute('kind') === 'drawer';
        return interaction_js_1.motionReduced() ? 0 : interaction_js_1.motionMs(drawer ? 'enter' : 'standard', drawer ? 280 : 180);
    }
    show({ instant = false } = {}) {
        this.generation++;
        this.motion?.cancel(); this.backdropAnimation?.cancel(); this.backdropAnimation = null;
        this.native.inert = false;
        this.closing = false;
        if (!this.native.open) {
            this.previous = document.activeElement;
            this.native.showModal();
            this.settled = false;
            this.emit('iq-open', {});
        }
        else if (this.settled) {
            // Reopened during its own exit: the close was already announced, so the open is announced again.
            this.settled = false;
            this.emit('iq-open', {});
        }
        const duration = instant ? 0 : this.motionMs();
        if (duration > 0) {
            // A drawer slides in opaque (a translucent panel over a dimmed page reads as a blink); the backdrop fades
            // in with it instead of darkening the page in one frame.
            const x = this.getAttribute('kind') === 'drawer';
            this.motion = this.native.animate(x ? [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translate(0)' }], { duration, easing: interaction_js_1.motionEase('ease') });
            this.motion.finished.catch(() => { });
            this.backdropMotion(true, duration);
        }
    }
    /** Fades the ::backdrop where the engine can animate it; elsewhere it simply appears and disappears. */
    backdropMotion(opening, duration) {
        this.backdropAnimation?.cancel(); this.backdropAnimation = null;
        try { this.backdropAnimation = this.native.animate(opening ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration, easing: interaction_js_1.motionEase(opening ? 'ease' : 'out'), fill: opening ? 'none' : 'forwards', pseudoElement: '::backdrop' }); this.backdropAnimation.finished.catch(() => { }); }
        catch { }
    }
    /** The result of closing, once per open: focus returns to the opener and iq-close fires. */
    settle() {
        if (this.settled)
            return;
        this.settled = true;
        if (this.previous?.isConnected)
            this.previous.focus({ preventScroll: true });
        this.emit('iq-close', {});
    }
    /** The result comes first (MOT-16): focus returns and iq-close fires immediately; the exit motion only explains it,
     *  with the dialog inert meanwhile. A second close() during the exit is ignored. */
    close(immediate = false) {
        if (!this.native?.open || this.closing)
            return;
        const generation = ++this.generation;
        this.motion?.cancel(); this.backdropAnimation?.cancel(); this.backdropAnimation = null;
        const duration = immediate ? 0 : this.motionMs();
        if (!(duration > 0)) {
            this.native.close();
            return;
        }
        this.closing = true;
        this.native.inert = true;
        this.settle();
        const x = this.getAttribute('kind') === 'drawer';
        this.motion = this.native.animate(x ? [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }] : [{ opacity: 1 }, { opacity: 0 }], { duration, easing: interaction_js_1.motionEase('out'), fill: 'forwards' });
        this.backdropMotion(false, duration);
        this.motion.finished.then(() => {
            if (this.generation === generation && this.native.open) {
                this.native.close();
                // The closing motion holds its last frame until the dialog is gone; drop it so the next open starts clean.
                this.motion?.cancel(); this.backdropAnimation?.cancel(); this.backdropAnimation = null;
            }
        }).catch(() => { });
    }
    get open() { return this.native?.open || false; }
    disconnectedCallback() {
        this.generation++;
        this.motion?.cancel();
        this.closing = false;
        if (this.native) this.native.inert = false;
        if (this.native?.open)
            this.native.close();
        super.disconnectedCallback();
    }
}
exports.IqDialog = IqDialog;
/** How long a toast stays, in ms (0: until dismissed). A short confirmation reads at a glance; a warning or an error
 * asks for a decision, so it stays longer. An undo action (action.undo) keeps its window open until the person
 * dismisses the toast (A11Y-01: reaching «Отменить» by keyboard or with a screen reader takes longer than any fixed
 * time). Any other action, such as «Открыть», is a shortcut: it leaves with the toast after a longer read. */
const TOAST_DURATION = Object.freeze({ info: 5000, success: 5000, warning: 8000, danger: 10000, action: 10000 });
exports.TOAST_DURATION = TOAST_DURATION;
function toastDuration(options = {}) {
    // Only an explicit 0 keeps a toast; a malformed duration falls back to the default instead of pinning it.
    const value = Number(options.duration);
    if (options.duration === 0 || (options.duration != null && Number.isFinite(value) && value > 0))
        return value;
    if (options.action?.undo)
        return 0;
    const base = TOAST_DURATION[options.tone] ?? TOAST_DURATION.info;
    return options.action ? Math.max(base, TOAST_DURATION.action) : base;
}
exports.toastDuration = toastDuration;
function notify(options) {
    let region = document.querySelector('#iq-toasts');
    if (!region) {
        region = document.createElement('section');
        region.id = 'iq-toasts';
        region.className = 'iq-toasts';
        region.setAttribute('aria-label', 'Уведомления');
        document.body.append(region);
    }
    // Two permanent, empty live nodes: screen readers announce text written into an existing region, while a region
    // inserted together with its content is often skipped. Errors go to the alert node, everything else stays polite.
    const liveNode = (role, live) => {
        let node = region.querySelector(`.iq-toast-live[role="${role}"]`);
        if (!node) {
            node = document.createElement('div');
            node.className = 'sr-only iq-toast-live';
            node.setAttribute('role', role);
            node.setAttribute('aria-live', live);
            region.append(node);
        }
        return node;
    };
    const polite = liveNode('status', 'polite');
    const alert = liveNode('alert', 'assertive');
    const announcement = [options.message, options.description, options.action?.label].filter(Boolean).join('. ');
    const live = options.tone === 'danger' ? alert : polite;
    live.textContent = '';
    setTimeout(() => { live.textContent = announcement; }, 30); // A cleared then refilled node announces repeated text too.
    const toast = document.createElement('div');
    toast.className = `iq-toast tone-${options.tone || 'info'} ${options.description ? 'has-description' : 'summary-only'}`;
    const glyph = { info: 'info', success: 'checkCircle', warning: 'warning', danger: 'xCircle' }[options.tone || 'info'];
    toast.innerHTML = `<span class="iq-toast-icon">${icons_js_1.icon(glyph, 21)}</span><div class="iq-toast-copy"><b>${escapeHTML(options.message)}</b>${options.description ? `<p>${escapeHTML(options.description)}</p>` : ''}</div>${options.action ? `<button type="button" class="iq-toast-action">${escapeHTML(options.action.label)}</button>` : ''}<button type="button" class="iq-btn icon ghost sm" aria-label="Закрыть уведомление">${icons_js_1.icon('x', 16)}</button>`;
    region.append(toast);
    const duration = toastDuration(options);
    toast.dataset.duration = String(duration);
    let timer = 0;
    let remaining = duration;
    let start = 0;
    let removed = false;
    // The countdown runs only while the toast can be read: it holds under a pointer that moved onto it, with focus inside
    // and in a hidden tab. A toast that appears under a resting pointer (the "Создать" button sits where toasts land)
    // is not being read: it keeps counting until the pointer really moves over it, or it would never leave. Browsers send
    // a synthetic pointermove when layout changes under a resting pointer, so a move counts only once it travels.
    let pointed = false, rest = null;
    const held = () => (pointed && toast.matches(':hover')) || toast.contains(document.activeElement) || document.hidden;
    const onVisibility = () => { if (document.hidden) pause(); else resume(); };
    // Focus that entered the toast (Tab, a screen reader) goes back where it came from when the toast leaves.
    let returnFocus = null;
    const remove = () => {
        if (removed)
            return;
        removed = true;
        clearTimeout(timer);
        if (toast.contains(document.activeElement) && returnFocus?.isConnected)
            returnFocus.focus({ preventScroll: true });
        document.removeEventListener('visibilitychange', onVisibility);
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), interaction_js_1.motionReduced() ? 0 : interaction_js_1.motionMs('standard', 180));
    };
    const resume = () => {
        // A countdown that is already running keeps its elapsed time.
        if (timer || removed || !duration || held())
            return;
        start = Date.now();
        timer = setTimeout(remove, remaining);
    };
    // Only a running countdown loses time; a toast the person just left keeps at least 1.5 s to finish reading.
    const pause = () => {
        if (!timer)
            return;
        clearTimeout(timer);
        timer = 0;
        remaining = Math.max(1500, remaining - (Date.now() - start));
    };
    resume();
    document.addEventListener('visibilitychange', onVisibility);
    toast.addEventListener('pointermove', e => {
        if (pointed)
            return;
        if (!rest) {
            rest = { x: e.clientX, y: e.clientY };
            return;
        }
        if (Math.hypot(e.clientX - rest.x, e.clientY - rest.y) < 4)
            return;
        pointed = true;
        pause();
    });
    toast.addEventListener('pointerleave', () => { pointed = false; rest = null; resume(); });
    toast.addEventListener('focusin', e => {
        if (e.relatedTarget && !toast.contains(e.relatedTarget))
            returnFocus = e.relatedTarget;
        pause();
    });
    toast.addEventListener('focusout', e => {
        if (!toast.contains(e.relatedTarget))
            resume();
    });
    // Escape inside a toast closes that toast only, not the dialog or drawer underneath.
    toast.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || e.defaultPrevented)
            return;
        e.preventDefault();
        e.stopPropagation();
        remove();
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
/** One validator for mount, property assignment and form reset: a wall clock never reaches markup raw. */
const isCanonicalTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''));
const canonicalTime = value => isCanonicalTime(value) ? String(value) : '14:30';
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
        if (isCanonicalTime(value)) {
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
        this.time = canonicalTime(this.getAttribute('time'));
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
            this.listen(f, 'reset', () => this.resetToInitial());
    }
    resetToInitial() { this.value = this.initial; this.time = canonicalTime(this.getAttribute('time')); this.render(); }
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
        this.innerHTML = `<div class="iq-calendar-heading"><b aria-live="polite">${label}</b><div class="calendar-arrows"><button type="button" class="iq-btn icon ghost sm" data-month="-1" aria-label="Предыдущий месяц">${icons_js_1.icon('left', 18)}</button><button type="button" class="iq-btn icon ghost sm" data-month="1" aria-label="Следующий месяц">${icons_js_1.icon('chevron', 18)}</button></div></div><div class="iq-calendar-grid" role="grid" aria-label="${label}"><div role="row" class="iq-calendar-week">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => `<span role="columnheader">${x}</span>`).join('')}</div>${rows}</div>${this.hasAttribute('with-time') ? `<iq-time value="${escapeHTML(this.time)}" hour-cycle="${this.cycle}"></iq-time>` : ''}<div class="iq-calendar-foot"><span>${icons_js_1.icon('calendar', 17)}<span>${new Date(this.chosen + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span></span>${this.hasAttribute('with-time') ? `<output>${this.displayTime()}</output>` : '<span class="calendar-foot-hint">Выбрано</span>'}</div>${name ? `<input type="hidden" name="${name}" value="${this.chosen}">` : ''}${this.hasAttribute('with-time') && name ? `<input type="hidden" data-time-hidden name="${name}-time" value="${escapeHTML(this.time)}">` : ''}`;
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
/** Popover API guard (ENG-05). Engines without showPopover() must not throw; the menu then falls back
 * to a light-DOM .iq-popup (position:fixed, its own z-index) toggled with [hidden]. */
const hasPopoverAPI = el => typeof el.showPopover === 'function' && typeof el.hidePopover === 'function';
function showPopup(el) {
    el.hidden = false;
    if (hasPopoverAPI(el)) {
        try {
            if (!el.matches(':popover-open'))
                el.showPopover();
            return;
        }
        catch { }
    }
    el.hidden = false;
}
function hidePopup(el) {
    if (hasPopoverAPI(el)) {
        try {
            if (el.matches(':popover-open'))
                el.hidePopover();
            return;
        }
        catch { }
    }
    el.hidden = true;
}
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
        // Without the Popover API (Safari <= 16, Firefox < 125) the UA does not hide [popover], so the
        // menu is kept closed with [hidden] and shown as an ordinary fixed-position .iq-popup.
        if (!hasPopoverAPI(this.popup))
            this.popup.hidden = true;
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
        this.exit?.cancel(); this.exit = null;
        showPopup(this.popup);
        this.position();
        const chosen = last ? this.items().at(-1) : this.popup.querySelector('[aria-checked=true]') || this.items()[0];
        chosen?.focus({ preventScroll: true });
        const duration = interaction_js_1.motionReduced() ? 0 : interaction_js_1.motionMs('fast', 120);
        if (duration > 0) {
            const a = this.popup.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration, easing: interaction_js_1.motionEase('ease') });
            a.finished.catch(() => { });
            this.addCleanup(() => a.cancel());
        }
    }
    /** Closing is immediate for the state (aria-expanded, focus); the popup fades out on the same fast token it faded in on. */
    close(focus = true) {
        if (!this.opened)
            return;
        this.opened = false;
        this.trigger?.setAttribute('aria-expanded', 'false');
        const duration = interaction_js_1.motionReduced() ? 0 : interaction_js_1.motionMs('fast', 120);
        if (duration > 0 && typeof this.popup.animate === 'function') {
            const a = this.exit = this.popup.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: interaction_js_1.motionEase('out'), fill: 'forwards' });
            a.finished.then(() => { if (this.exit === a && !this.opened) hidePopup(this.popup); }).catch(() => { }).finally(() => { if (this.exit === a) this.exit = null; a.cancel(); });
            this.addCleanup(() => { a.cancel(); if (!this.opened) hidePopup(this.popup); });
        }
        else
            hidePopup(this.popup);
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
        // heading + text: a short title and one line per "\n" in text, so longer explanations keep a structure.
        const heading = this.getAttribute('heading');
        if (heading) {
            const title = document.createElement('b'); title.className = 'iq-tooltip-heading'; title.textContent = heading; tip.append(title);
            // A line «label<TAB>value» is a figure: the label on the left, the value on the right (vnext.30).
            for (const line of (this.getAttribute('text') || '').split('\n').filter(Boolean)) {
                const row = document.createElement('span'), [term, value] = line.split('\t');
                if (value !== undefined) { row.className = 'iq-tooltip-row'; const t = document.createElement('span'), v = document.createElement('strong'); t.textContent = term; v.textContent = value; row.append(t, v); }
                else { row.className = 'iq-tooltip-line'; row.textContent = line; }
                tip.append(row);
            }
            tip.classList.add('iq-tooltip-rich');
        }
        else tip.textContent = this.getAttribute('text') || '';
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
            // placement="bottom" (vnext.30) opens below the anchor when it fits, for rows whose heading stays readable.
            const below = this.getAttribute('placement') === 'bottom' ? r.bottom + h + 8 <= innerHeight || r.top <= h + 10 : r.top <= h + 10;
            tip.style.top = Math.max(8, below ? r.bottom + 8 : r.top - h - 8) + 'px';
        };
        this.listen(child, 'pointerenter', () => { dismissed = false; open(); });
        // Focus opens the tooltip only for keyboard navigation, never after a click or a programmatic focus.
        this.listen(child, 'focus', () => { if (!child.matches(':focus-visible')) return; dismissed = false; open(); });
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
/** Any RGB tag colour without inline styles: one shared stylesheet rule per colour, added on first use.
    A palette tone name passes through; "#RRGGBB" becomes data-tone="custom" with a derived, theme-aware fill and text. */
let tagColorSheet = null;
const tagColors = new Set();
function ensureTagColor(hex) {
    if (tagColors.has(hex) || typeof document === 'undefined' || typeof CSSStyleSheet === 'undefined') return;
    tagColors.add(hex);
    if (!tagColorSheet) { tagColorSheet = new CSSStyleSheet(); document.adoptedStyleSheets = [...document.adoptedStyleSheets, tagColorSheet]; }
    tagColorSheet.insertRule(`[data-tag-color="${hex}"]{--iq-tag-color:#${hex}}`, tagColorSheet.cssRules.length);
}
function tagToneAttributes(tone) {
    const value = String(tone || 'neutral'), match = /^#([0-9a-f]{6})$/i.exec(value);
    if (!match) return `data-tone="${escapeHTML(value)}"`;
    const hex = match[1].toUpperCase();
    ensureTagColor(hex);
    return `data-tone="custom" data-tag-color="${hex}"`;
}
exports.tagToneAttributes = tagToneAttributes;
/** Catalog tag picker: chosen tags as toned DS tags with remove buttons, a search field that lists the
 *  remaining catalog tags, optional creation, and short enter/leave motion. Value is a list of option values. */
class IqTagPicker extends IqElement {
    _options = [];
    _value = [];
    query = '';
    active = 0;
    opened = false;
    entering = new Set();
    get options() { return this._options.map(o => ({ ...o })); }
    set options(list) { this._options = (Array.isArray(list) ? list : []).filter(o => o && typeof o.value === 'string' && typeof o.label === 'string').map(o => ({ value: o.value, label: o.label, tone: typeof o.tone === 'string' ? o.tone : 'neutral', archived: !!o.archived })); this.paint(); }
    get value() { return [...this._value]; }
    set value(list) { this._value = [...new Set((Array.isArray(list) ? list : []).filter(v => typeof v === 'string'))]; this.paint(); }
    get locked() { return this.hasAttribute('disabled') || this.hasAttribute('readonly'); }
    mount() {
        this.uid ||= uid();
        // appearance="ghost" (vnext.27): a value in a property list — chips at rest, a hover fill and a chevron like the
        // other ghost triggers; a click anywhere opens the search. No "+" button: an unmatched search offers creation.
        const ghost = this.getAttribute('appearance') === 'ghost';
        this.innerHTML = `<span class="iq-control-label" id="${this.uid}-label"></span><div class="iq-tag-picker-field" role="group" aria-labelledby="${this.uid}-label"><div class="iq-tag-picker-values"></div><input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${this.uid}-list" aria-labelledby="${this.uid}-label" autocomplete="off" maxlength="100">${ghost ? `<span class="iq-tag-picker-chevron" aria-hidden="true">${icons_js_1.icon('down', 16)}</span>` : `<button type="button" class="iq-btn ghost icon sm iq-tag-picker-add" data-tag-create aria-label="Создать тег" title="Новый тег" hidden>${icons_js_1.icon('plus', 16)}</button>`}</div><div class="iq-tag-picker-list" id="${this.uid}-list" role="listbox" hidden></div>`;
        this.input = this.querySelector('input');
        this.listen(this.input, 'focus', () => this.open());
        this.listen(this.input, 'input', () => { this.query = this.input.value; this.active = 0; this.open(); });
        this.listen(this.input, 'keydown', e => { if (!['Backspace', 'Delete'].includes(e.key) && this.armed) { this.armed = false; this.input.removeAttribute('aria-description'); this.paint(); } this.key(e); });
        this.listen(this, 'click', e => {
            const remove = e.target.closest('[data-tag-remove]');
            if (remove) { this.remove(remove.dataset.tagRemove); return; }
            if (e.target.closest('[data-tag-create]')) { this.close(); this.requestCreate(this.query.trim()); return; }
            const option = e.target.closest('[data-option]');
            if (option) { this.choose(Number(option.dataset.option)); return; }
            if (e.target.closest('.iq-tag-picker-field') && !this.locked) this.input.focus();
        });
        this.listen(document, 'pointerdown', e => { if (!this.contains(e.target)) this.close(); });
        this.listen(this, 'focusout', e => { if (!this.contains(e.relatedTarget)) this.close(); });
        this.paint();
    }
    matches() {
        const q = this.query.trim().toLocaleLowerCase('ru');
        const list = this._options.filter(o => !this._value.includes(o.value) && !o.archived && (!q || o.label.toLocaleLowerCase('ru').includes(q))).map(o => ({ kind: 'option', option: o }));
        const exact = this._options.some(o => o.label.toLocaleLowerCase('ru') === q);
        if (q && !exact && this.hasAttribute('creatable')) list.push({ kind: 'create', label: this.query.trim() });
        return list;
    }
    open() { if (this.locked) return; this.opened = true; this.paintList(); }
    close() { if (!this.opened) return; this.opened = false; this.paintList(); }
    key(e) {
        if (e.isComposing) return;
        const items = this.matches();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!this.opened) this.open(); if (items.length) { this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; this.paintList(); } }
        else if (e.key === 'Enter') { if (this.opened && items.length) { e.preventDefault(); this.choose(this.active); } }
        else if (e.key === 'Escape') { if (this.opened) { e.preventDefault(); e.stopPropagation(); this.close(); } }
        // Backspace in an empty field first marks the last tag, a second Backspace removes it.
        else if ((e.key === 'Backspace' || e.key === 'Delete') && !this.input.value && this._value.length) { e.preventDefault(); if (this.armed) { this.armed = false; this.remove(this._value.at(-1)); } else { this.armed = true; this.paint(); this.input.setAttribute('aria-description', `Тег ${this._options.find(o => o.value === this._value.at(-1))?.label || ''}. Нажмите Backspace ещё раз, чтобы убрать.`); } }
    }
    choose(index) {
        const item = this.matches()[index]; if (!item || this.locked) return;
        if (item.kind === 'option') { this.add(item.option.value); return; }
        this.close();this.requestCreate(item.label);
    }
    /** Creation belongs to the host (it owns the catalog, e.g. a dialog); accept() adds the created option and selects it. */
    requestCreate(label) {
        let settled = false;
        this.emit('iq-create', { label, accept: option => { if (settled || !option?.value) return; settled = true; this._options = [...this._options.filter(o => o.value !== option.value), { value: option.value, label: option.label || label, tone: option.tone || 'neutral', archived: false }]; this.add(option.value); } });
    }
    add(value) {
        if (this._value.includes(value)) return;
        this._value = [...this._value, value]; this.entering.add(value);
        this.query = ''; this.input.value = ''; this.active = 0;
        this.paint(); this.emit('iq-change', { value: this.value });
    }
    remove(value) {
        if (this.locked || !this._value.includes(value)) return;
        const chip = this.querySelector(`.iq-tag[data-value="${CSS.escape(value)}"]`);
        const done = () => { if (!this._value.includes(value)) return; this._value = this._value.filter(v => v !== value); this.paint(); this.emit('iq-change', { value: this.value }); this.input?.focus({ preventScroll: true }); };
        if (!chip || interaction_js_1.motionReduced()) { done(); return; }
        chip.setAttribute('data-leaving', ''); chip.addEventListener('animationend', done, { once: true }); setTimeout(done, interaction_js_1.motionMs('fast', 120) + 120);
    }
    paint() {
        if (!this.input) return;
        this.querySelector('.iq-control-label').textContent = this.getAttribute('label') || 'Теги';
        const byValue = new Map(this._options.map(o => [o.value, o]));
        this.querySelector('.iq-tag-picker-values').innerHTML = this._value.map(v => { const o = byValue.get(v) || { label: 'Недоступный тег', tone: 'neutral' };
            return `<span class="iq-tag" ${tagToneAttributes(o.tone)} data-value="${escapeHTML(v)}" ${this.entering.has(v) && !interaction_js_1.motionReduced() ? 'data-entering' : ''}><span>${escapeHTML(o.label)}${o.archived ? ' (в архиве)' : ''}</span>${this.locked ? '' : `<button type="button" class="iq-tag-remove" data-tag-remove="${escapeHTML(v)}" aria-label="Убрать тег ${escapeHTML(o.label)}">${icons_js_1.icon('x', 12)}</button>`}</span>`; }).join('')
            ;
        const add = this.querySelector('.iq-tag-picker-add'); if (add) add.hidden = !(this.hasAttribute('creatable') && !this.locked);
        const chips = this.querySelectorAll('.iq-tag-picker-values > .iq-tag'); chips.forEach((chip, i) => chip.toggleAttribute('data-armed', !!this.armed && i === chips.length - 1));
        this.querySelectorAll('[data-entering]').forEach(chip => chip.addEventListener('animationend', () => chip.removeAttribute('data-entering'), { once: true }));
        this.entering.clear();
        this.input.disabled = this.hasAttribute('disabled'); this.input.readOnly = this.hasAttribute('readonly');
        // A ghost picker reads like a value: «Нет тегов» when empty; with chips the search hint shows only while typing.
        const ghost = this.getAttribute('appearance') === 'ghost';
        this.input.placeholder = this.locked ? (this._value.length ? '' : 'Нет тегов') : ghost ? (this._value.length ? 'Найти тег' : (this.getAttribute('placeholder') || 'Нет тегов')) : this._value.length ? 'Ещё тег' : (this.getAttribute('placeholder') || 'Добавить тег');
        this.input.hidden = this.hasAttribute('readonly');
        this.paintList();
    }
    paintList() {
        const list = this.querySelector('.iq-tag-picker-list'); if (!list) return;
        const items = this.opened ? this.matches() : [];
        this.active = Math.min(this.active, Math.max(0, items.length - 1));
        list.hidden = !this.opened; this.input.setAttribute('aria-expanded', String(this.opened));
        list.innerHTML = items.length ? items.map((item, i) => `<button type="button" role="option" class="iq-tag-picker-option" id="${this.uid}-o${i}" data-option="${i}" tabindex="-1" aria-selected="${i === this.active}">${item.kind === 'option' ? `<span class="iq-tag" ${tagToneAttributes(item.option.tone)}>${escapeHTML(item.option.label)}</span>` : `${icons_js_1.icon('plus', 14)}<span>Создать тег «${escapeHTML(item.label)}»</span>`}</button>`).join('') : `<p class="iq-tag-picker-empty">${this.query.trim() ? 'Ничего не найдено.' : this._options.length ? 'Все теги уже выбраны.' : 'В проекте пока нет тегов.'}</p>`;
        if (this.opened && items.length) this.input.setAttribute('aria-activedescendant', `${this.uid}-o${this.active}`); else this.input.removeAttribute('aria-activedescendant');
    }
    static get observedAttributes() { return ['label', 'disabled', 'readonly', 'placeholder']; }
    attributeChangedCallback() { this.paint(); }
}
exports.IqTagPicker = IqTagPicker;
/** File picker for hosts that upload themselves: a drop target plus a picker button, no internal list.
 *  variant="compact" is one dashed row; variant="zone" is the DS dropzone. Emits iq-files {files} on pick or drop. */
class IqFilePicker extends IqElement {
    static get observedAttributes() { return ['label', 'hint', 'disabled', 'accept', 'multiple']; }
    attributeChangedCallback() { if (this.events) this.mount(); }
    mount() {
        const label = escapeHTML(this.getAttribute('label') || (this.hasAttribute('multiple') ? 'Выберите или перетащите файлы' : 'Выберите или перетащите файл'));
        const hint = escapeHTML(this.getAttribute('hint') || ''), disabled = this.hasAttribute('disabled') ? 'disabled' : '';
        const accept = escapeHTML(this.getAttribute('accept') || ''), multiple = this.hasAttribute('multiple') ? 'multiple' : '';
        const zone = this.getAttribute('variant') === 'zone', button = this.getAttribute('variant') === 'button';
        this.innerHTML = (button
            // variant="button": a quiet action (for a section head); drop-target makes a whole region accept files.
            ? `<button type="button" class="iq-btn ghost sm iq-file-picker-target" data-pick-file ${disabled}>${icons_js_1.icon('upload', 16)}<span>${label}</span></button>`
            : zone
            ? `<div class="iq-dropzone iq-file-picker-target"><div class="iq-upload-art" aria-hidden="true"><span class="upload-back-sheet"></span><span class="iq-upload-sheet">${icons_js_1.icon('file', 33)}</span><span class="iq-upload-circle">${icons_js_1.icon('plus', 18)}</span></div><div class="upload-copy"><b>${label}</b>${hint ? `<p>${hint}</p>` : ''}</div><button type="button" class="iq-btn secondary sm" data-pick-file ${disabled}>${icons_js_1.icon('upload', 18)}Выбрать на устройстве</button></div>`
            : `<button type="button" class="file-dropwell iq-file-picker-target iq-file-picker-row" data-pick-file ${disabled}>${icons_js_1.icon('upload', 18)}<span class="iq-file-picker-copy"><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}</span></button>`)
            + `<input type="file" hidden ${multiple} ${accept ? `accept="${accept}"` : ''} ${disabled} aria-label="${label}">`;
        const input = this.querySelector('input[type=file]'), target = this.querySelector('.iq-file-picker-target');
        const deliver = files => { if (!files.length || this.hasAttribute('disabled')) return; this.emit('iq-files', { files: this.hasAttribute('multiple') ? files : files.slice(0, 1) }); };
        this.listen(input, 'change', () => { deliver(Array.from(input.files || [])); input.value = ''; });
        this.listen(this, 'click', ev => { if (ev.target.closest('[data-pick-file]') && !this.hasAttribute('disabled')) input.click(); });
        let depth = 0;
        this.listen(target, 'dragenter', ev => { ev.preventDefault(); depth++; target.classList.add('dragover'); });
        this.listen(target, 'dragover', ev => { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'; });
        this.listen(target, 'dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) target.classList.remove('dragover'); });
        this.listen(target, 'drop', ev => { ev.preventDefault(); depth = 0; target.classList.remove('dragover'); deliver(Array.from(ev.dataTransfer?.files || [])); });
        // drop-target="<selector>": the closest matching ancestor (for example the whole files section) also takes
        // dropped files and shows data-file-drop while files are dragged over it.
        const region = this.getAttribute('drop-target') ? this.closest(this.getAttribute('drop-target')) : null;
        if (region) {
            let over = 0;
            const files = ev => Array.from(ev.dataTransfer?.types || []).includes('Files');
            this.listen(region, 'dragenter', ev => { if (!files(ev) || this.hasAttribute('disabled')) return; ev.preventDefault(); over++; region.setAttribute('data-file-drop', ''); });
            this.listen(region, 'dragover', ev => { if (!files(ev) || this.hasAttribute('disabled')) return; ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'; });
            this.listen(region, 'dragleave', () => { over = Math.max(0, over - 1); if (!over) region.removeAttribute('data-file-drop'); });
            this.listen(region, 'drop', ev => { if (!files(ev)) return; ev.preventDefault(); over = 0; region.removeAttribute('data-file-drop'); if (!ev.defaultPrevented || !target.contains(ev.target)) deliver(Array.from(ev.dataTransfer?.files || [])); });
        }
    }
    /** Opens the system picker (for hosts with their own trigger, e.g. a cover preset dialog). */
    open() { this.querySelector('input[type=file]')?.click(); }
}
exports.IqFilePicker = IqFilePicker;
function registerComponents() {
    const definitions = { 'iq-file-preview': media_js_1.IqFilePreview, 'iq-select': IqSelect, 'iq-combobox': IqCombobox, 'iq-tabs': IqTabs, 'iq-dialog': IqDialog, 'iq-number': IqNumber, 'iq-range': IqRange, 'iq-calendar': IqCalendar, 'iq-menu': IqMenu, 'iq-tooltip': IqTooltip, 'iq-tags': IqTags, 'iq-tag-picker': IqTagPicker, 'iq-file-picker': IqFilePicker, 'iq-upload': IqUpload };
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

