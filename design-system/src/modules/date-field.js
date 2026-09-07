"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IqDateField = void 0;
exports.registerDateFields = registerDateFields;
const components_js_1 = require("./components.js");
const interaction_js_1 = require("./interaction.js");
/** A date field composed with the same calendar used in the component library.
 * The visible control is a button, never a native date input. Values are local
 * ISO calendar dates, without a timezone conversion. */
class IqDateField extends components_js_1.IqElement {
    chosen = '';
    time = '14:30';
    initial = '';
    initialTime = '14:30';
    trigger;
    popup;
    calendar;
    opened = false;
    frame = 0;
    static get observedAttributes() { return ['value', 'disabled', 'readonly', 'min', 'max', 'aria-invalid', 'aria-describedby']; }
    get value() { return this.chosen; }
    set value(value) {
        this.chosen = this.normalizeValue(value);
        if (this.trigger)
            this.sync();
    }
    get timeValue() { return this.time; }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { this.toggleAttribute('disabled', value); }
    attributeChangedCallback(name, _old, value) {
        if (!this.trigger)
            return;
        if (name === 'value')
            this.chosen = this.normalizeValue(value || '');
        if (name === 'min' || name === 'max')
            this.chosen = this.normalizeValue(this.chosen);
        if (this.disabled || this.hasAttribute('readonly'))
            this.close(false);
        this.sync();
    }
    normalizeValue(value) {
        const date = new Date(value + 'T12:00:00');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+date) || date.getFullYear() !== Number(value.slice(0, 4)) || date.getMonth() + 1 !== Number(value.slice(5, 7)) || date.getDate() !== Number(value.slice(8)))
            return '';
        const validBound = (v) => {
            if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v))
                return false;
            const d = new Date(v + 'T12:00:00');
            return Number.isFinite(+d) && d.getFullYear() === Number(v.slice(0, 4)) && d.getMonth() + 1 === Number(v.slice(5, 7)) && d.getDate() === Number(v.slice(8));
        };
        const lower = this.getAttribute('min'), upper = this.getAttribute('max');
        const min = validBound(lower) ? lower : null, max = validBound(upper) ? upper : null;
        if (min && max && min > max)
            return '';
        return min && value < min ? min : max && value > max ? max : value;
    }
    mount() {
        this.initial = this.normalizeValue(this.getAttribute('value') || '');
        this.chosen = this.initial;
        const t = this.getAttribute('time') || '';
        this.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '14:30';
        this.initialTime = this.time;
        const id = components_js_1.uid(), label = this.getAttribute('label') || 'Дата';
        this.innerHTML = `<span id="${id}-label" class="iq-control-label">${components_js_1.escapeHTML(label)}</span><button type="button" class="iq-date-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}-popup" aria-labelledby="${id}-label ${id}-value"><span id="${id}-value" data-date-caption></span>${components_js_1.icon('calendar', 18)}</button><div id="${id}-popup" class="iq-date-popup" popover="manual" role="dialog" aria-modal="false" aria-label="Календарь: ${components_js_1.escapeHTML(label.toLocaleLowerCase('ru'))}"><iq-calendar data-field-calendar ${this.hasAttribute('with-time') ? 'with-time' : ''}></iq-calendar><div class="iq-date-actions"><button type="button" data-date-clear>Убрать срок</button><button type="button" data-date-today>Сегодня</button>${this.hasAttribute('with-time') ? '<button type="button" class="iq-btn primary sm" data-date-apply>Готово</button>' : ''}</div><p class="sr-only" id="${id}-keys">Стрелки — выбор дня. Page Up и Page Down — месяц. Enter — выбрать. Escape — закрыть.</p></div><input type="hidden" data-date-value name="${components_js_1.escapeHTML(this.getAttribute('name') || 'date')}">${this.hasAttribute('with-time') ? `<input type="hidden" data-date-time name="${components_js_1.escapeHTML((this.getAttribute('name') || 'date') + '-time')}">` : ''}`;
        this.trigger = this.querySelector('.iq-date-trigger');
        this.popup = this.querySelector('.iq-date-popup');
        this.calendar = this.querySelector('iq-calendar');
        this.calendar.setAttribute('aria-describedby', `${id}-keys`);
        this.sync();
        this.listen(this.trigger, 'click', () => this.opened ? this.close() : this.open());
        this.listen(this.trigger, 'keydown', ev => {
            const e = ev;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.open();
            }
        });
        this.listen(this.calendar, 'iq-change', ev => {
            ev.stopPropagation();
            if (!this.hasAttribute('with-time'))
                this.commit(this.calendar.value);
        });
        this.listen(this.popup, 'click', ev => {
            const button = ev.target.closest('button');
            if (!button)
                return;
            if (button.hasAttribute('data-date-clear'))
                this.commit('');
            if (button.hasAttribute('data-date-today')) {
                const date = new Date(), v = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                this.calendar.value = this.normalizeValue(v);
                if (!this.hasAttribute('with-time'))
                    this.commit(this.calendar.value);
            }
            if (button.hasAttribute('data-date-apply')) {
                this.time = this.calendar.timeValue;
                this.commit(this.calendar.value);
            }
        });
        this.listen(this.popup, 'keydown', ev => {
            const e = ev;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.close();
                return;
            }
            if (e.key !== 'Tab')
                return;
            e.stopPropagation();
            const nodes = [...this.popup.querySelectorAll('button:not(:disabled),input:not([type=hidden]):not(:disabled)')].filter(n => n.tabIndex >= 0 && n.getClientRects().length);
            if (!nodes.length)
                return;
            if (e.shiftKey && document.activeElement === nodes[0]) {
                e.preventDefault();
                nodes.at(-1)?.focus();
            }
            else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
                e.preventDefault();
                nodes[0].focus();
            }
        });
        this.listen(document, 'pointerdown', ev => {
            if (this.opened && !this.contains(ev.target))
                this.close(false);
        });
        this.listen(this.popup, 'pointerdown', ev => {
            const button = ev.target.closest('button');
            if (button && !button.disabled) {
                // Do not allow the browser's default button blur to focus the enclosing modal.
                // Touch must retain its compatibility click. Only mouse needs blur suppression.
                this.pointerInside = true;
                if (ev.pointerType === 'mouse') { ev.preventDefault(); button.focus({preventScroll:true}); }
            }
        });
        this.listen(document, 'pointerup', () => { setTimeout(() => { this.pointerInside = false; }, 0); });
        this.listen(document, 'pointercancel', () => { this.pointerInside = false; });
        this.listen(this, 'focusout', ev => {
            const next = ev.relatedTarget;
            if (!this.opened || !next || this.contains(next)) return;
            queueMicrotask(() => {
                if (this.opened && !this.pointerInside && !this.contains(document.activeElement)) this.close(false);
            });
        });
        const schedule = () => {
            if (!this.opened)
                return;
            cancelAnimationFrame(this.frame);
            this.frame = requestAnimationFrame(() => {
                if (this.opened)
                    this.position();
            });
        };
        this.listen(window, 'resize', schedule);
        if (window.visualViewport) {
            this.listen(window.visualViewport, 'resize', schedule);
            this.listen(window.visualViewport, 'scroll', schedule);
        }
        document.addEventListener('scroll', event => {
            if (!this.popup.contains(event.target))
                schedule();
        }, { capture: true, passive: true, signal: this.events?.signal });
        const ro = new ResizeObserver(() => {
            if (this.opened)
                schedule();
        });
        ro.observe(this.popup);
        this.addCleanup(() => { ro.disconnect(); cancelAnimationFrame(this.frame); });
        this.listen(this.closest('form') || this, 'reset', () => queueMicrotask(() => {
            if (this.isConnected) {
                this.close(false);
                this.time = this.initialTime;
                this.value = this.initial;
            }
        }));
        const parent = this.closest('dialog');
        if (parent)
            this.listen(parent, 'close', () => this.close(false));
    }
    sync() {
        this.trigger.disabled = this.disabled || this.hasAttribute('readonly');
        this.trigger.setAttribute('aria-invalid', this.getAttribute('aria-invalid') || 'false');
        const described = this.getAttribute('aria-describedby');
        if (described)
            this.trigger.setAttribute('aria-describedby', described);
        else
            this.trigger.removeAttribute('aria-describedby');
        this.querySelector('[data-date-caption]').textContent = this.chosen ? new Date(this.chosen + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) + (this.hasAttribute('with-time') ? ' — ' + this.time : '') : (this.getAttribute('placeholder') || 'Выбрать дату');
        this.trigger.classList.toggle('is-empty', !this.chosen);
        const hidden = this.querySelector('[data-date-value]');
        hidden.value = this.chosen;
        hidden.disabled = this.disabled;
        const time = this.querySelector('[data-date-time]');
        if (time) {
            time.value = this.time;
            time.disabled = this.disabled || !this.chosen;
        }
        const clear = this.querySelector('[data-date-clear]');
        if (clear)
            clear.disabled = this.hasAttribute('required') || !this.chosen;
    }
    commit(value) {
        this.chosen = this.normalizeValue(value);
        if (this.chosen)
            this.removeAttribute('aria-invalid');
        this.sync();
        this.close();
        this.emit('iq-change', { value: this.chosen, ...(this.hasAttribute('with-time') ? { time: this.time } : {}) });
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
    open() {
        if (this.disabled || this.hasAttribute('readonly') || this.opened)
            return;
        for (const name of ['min', 'max']) {
            const v = this.getAttribute(name);
            if (v)
                this.calendar.setAttribute(name, v);
            else
                this.calendar.removeAttribute(name);
        }
        const d = new Date();
        this.calendar.value = this.chosen || this.normalizeValue(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        this.calendar.timeValue = this.time;
        this.opened = true;
        this.trigger.setAttribute('aria-expanded', 'true');
        try {
            this.popup.showPopover();
        }
        catch {
            this.popup.classList.add('is-open');
        }
        this.position();
        this.calendar.focusActiveDate();
        const dy = this.popup.dataset.placement === 'top' ? -4 : 4;
        interaction_js_1.transition(this.popup, [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'translateY(0)' }], 160);
    }
    close(restoreFocus = true) {
        if (!this.opened)
            return;
        this.opened = false;
        this.popup.getAnimations().forEach(a => a.cancel());
        try {
            this.popup.hidePopover();
        }
        catch { }
        this.popup.classList.remove('is-open');
        this.trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus && this.trigger.isConnected)
            this.trigger.focus({ preventScroll: true });
    }
    position() {
        const rect = this.trigger.getBoundingClientRect(), viewport = window.visualViewport;
        const vx = viewport?.offsetLeft || 0, vy = viewport?.offsetTop || 0, vw = viewport?.width || innerWidth, vh = viewport?.height || innerHeight;
        const margin = 12, gap = 8, width = Math.min(342, vw - margin * 2);
        if (rect.bottom < vy || rect.top > vy + vh) {
            this.close(false);
            return;
        }
        this.popup.style.width = width + 'px';
        const naturalHeight = this.popup.scrollHeight;
        const below = Math.max(0, vy + vh - margin - rect.bottom - gap), above = Math.max(0, rect.top - vy - margin - gap);
        const side = below >= naturalHeight ? 'bottom' : above >= naturalHeight ? 'top' : below >= above ? 'bottom' : 'top';
        const available = side === 'bottom' ? below : above, height = Math.min(naturalHeight, available);
        this.popup.style.maxHeight = height + 'px';
        const top = side === 'bottom' ? rect.bottom + gap : rect.top - gap - height;
        const parent = this.closest('dialog')?.getBoundingClientRect();
        const proposed = parent && rect.left + width > parent.right - 20 ? rect.right - width : rect.left;
        const left = Math.max(vx + margin, Math.min(proposed, vx + vw - width - margin));
        this.popup.dataset.placement = side;
        Object.assign(this.popup.style, { left: left + 'px', top: top + 'px' });
    }
    disconnectedCallback() { this.close(false); super.disconnectedCallback(); }
}
exports.IqDateField = IqDateField;
function registerDateFields() {
    if (!customElements.get('iq-date-field'))
        customElements.define('iq-date-field', IqDateField);
}

