import dep0 from './components.js';
const exports={};
const deps={"./components.js":dep0};
(function(exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IqTime = void 0;
exports.formatTime = formatTime;
exports.parseTime = parseTime;
const components_js_1 = require("./components.js");
const canonical = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const pad = (value) => String(value).padStart(2, '0');
/** A local wall-clock time, deliberately independent of dates and time zones. */
function parseTime(value) {
    const match = /^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
    if (!match)
        return null;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes > 59 || (match[3] ? hours < 1 || hours > 12 : hours > 23))
        return null;
    if (match[3])
        hours = hours % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${pad(hours)}:${pad(minutes)}`;
}
function formatTime(value, cycle) {
    if (!canonical(value))
        return '';
    const [hours, minutes] = value.split(':').map(Number);
    return cycle === 24 ? value : `${pad(hours % 12 || 12)}:${pad(minutes)} ${hours >= 12 ? 'PM' : 'AM'}`;
}
/** Segmented keyboard editor. Presentation may be 12/24h; value is always HH:mm. */
class IqTime extends components_js_1.IqElement {
    current = '14:30';
    initial = '14:30';
    fields = [];
    static get observedAttributes() { return ['value', 'hour-cycle', 'disabled', 'readonly']; }
    get value() { return this.current; }
    set value(value) {
        if (canonical(value)) {
            this.current = value;
            this.sync();
        }
    }
    get hourCycle() { return this.getAttribute('hour-cycle') === '12' ? 12 : 24; }
    set hourCycle(cycle) { this.setAttribute('hour-cycle', String(cycle)); }
    get locked() { return this.hasAttribute('disabled') || this.hasAttribute('readonly'); }
    attributeChangedCallback(name, _old, value) {
        if (name === 'value' && value && canonical(value))
            this.current = value;
        if (this.fields.length)
            this.sync();
    }
    mount() {
        const value = this.getAttribute('value') || '';
        this.current = canonical(value) ? value : '14:30';
        this.initial = this.current;
        const id = components_js_1.uid();
        this.innerHTML = `<div class="time-picker time-picker-046" role="group" aria-labelledby="${id}-title">
      <div class="time-settings"><span class="time-title" id="${id}-title">${components_js_1.icon('clock', 17)}Время</span>
        <div class="time-format" role="group" aria-label="Формат времени">
          <button type="button" data-hour-cycle="12" aria-label="12-часовой формат">12 ч</button>
          <button type="button" data-hour-cycle="24" aria-label="24-часовой формат">24 ч</button>
        </div>
      </div>
      <div class="time-values"><div class="time-segments" role="group" aria-label="Ввод времени">
        <label class="time-segment"><span class="sr-only">Часы</span><input type="text" inputmode="numeric" autocomplete="off" role="spinbutton" data-time-part="hours" aria-label="Часы" maxlength="2"></label>
        <span class="time-colon" aria-hidden="true">:</span>
        <label class="time-segment"><span class="sr-only">Минуты</span><input type="text" inputmode="numeric" autocomplete="off" role="spinbutton" data-time-part="minutes" aria-label="Минуты" maxlength="2"></label>
      </div><button type="button" class="time-period" data-time-period aria-label="Период суток"></button></div>
      <span class="sr-only" data-time-live role="status" aria-live="polite"></span>
      ${this.hasAttribute('name') ? `<input type="hidden" name="${components_js_1.escapeHTML(this.getAttribute('name'))}" data-time-value>` : ''}
    </div>`;
        this.fields = [...this.querySelectorAll('[data-time-part]')];
        this.sync();
        this.listen(this, 'click', event => {
            const button = event.target.closest('button');
            if (!button || button.disabled)
                return;
            if (button.dataset.hourCycle) {
                this.commitActive();
                this.hourCycle = Number(button.dataset.hourCycle);
                this.emit('iq-format-change', { hourCycle: this.hourCycle, value: this.current });
            }
            else if (button.hasAttribute('data-time-period') && !this.locked) {
                const [hours, minutes] = this.current.split(':').map(Number);
                this.commit(`${pad((hours + 12) % 24)}:${pad(minutes)}`);
            }
        });
        this.fields.forEach((field, index) => {
            this.listen(field, 'focus', () => field.select());
            this.listen(field, 'input', () => {
                field.value = field.value.replace(/\D/g, '').slice(0, 2);
                const max = index ? 59 : this.hourCycle === 12 ? 12 : 23;
                const min = !index && this.hourCycle === 12 ? 1 : 0;
                if (field.value.length === 2 && Number(field.value) >= min && Number(field.value) <= max) {
                    this.commitField(field);
                    if (index === 0) {
                        this.fields[1].focus({ preventScroll: true });
                        this.fields[1].select();
                    }
                }
            });
            this.listen(field, 'change', () => this.commitField(field));
            this.listen(field, 'blur', () => this.commitField(field));
            this.listen(field, 'paste', event => {
                const parsed = parseTime(event.clipboardData?.getData('text') || '');
                if (parsed && !this.locked) {
                    event.preventDefault();
                    this.commit(parsed);
                    this.fields[1].focus({ preventScroll: true });
                    this.fields[1].select();
                }
            });
            this.listen(field, 'keydown', event => this.key(event, field, index));
        });
        const form = this.closest('form');
        if (form)
            this.listen(form, 'reset', () => queueMicrotask(() => {
                if (this.isConnected)
                    this.value = this.initial;
            }));
    }
    commitActive() {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && this.fields.includes(active))
            this.commitField(active);
    }
    commitField(field) {
        if (this.locked) {
            this.sync();
            return;
        }
        const index = field.dataset.timePart === 'hours' ? 0 : 1;
        const min = index === 0 && this.hourCycle === 12 ? 1 : 0, max = index ? 59 : this.hourCycle === 12 ? 12 : 23;
        if (!/^\d{1,2}$/.test(field.value) || Number(field.value) < min || Number(field.value) > max) {
            this.sync();
            this.querySelector('[data-time-live]').textContent = `${index ? 'Минуты' : 'Часы'}: от ${min} до ${max}. Предыдущее значение сохранено.`;
            return;
        }
        const parts = this.current.split(':').map(Number);
        let next = Number(field.value);
        if (index === 0 && this.hourCycle === 12)
            next = next % 12 + (parts[0] >= 12 ? 12 : 0);
        parts[index] = next;
        this.commit(parts.map(pad).join(':'));
    }
    commit(value) {
        if (!canonical(value))
            return;
        const changed = value !== this.current;
        this.current = value;
        this.sync();
        if (changed) {
            this.querySelector('[data-time-live]').textContent = formatTime(value, this.hourCycle);
            this.emit('iq-time-change', { value });
        }
    }
    sync() {
        if (!this.fields.length)
            return;
        const parts = this.current.split(':').map(Number), cycle = this.hourCycle;
        this.fields.forEach((field, index) => {
            const number = index ? parts[1] : cycle === 12 ? parts[0] % 12 || 12 : parts[0];
            field.value = pad(number);
            field.disabled = this.hasAttribute('disabled');
            field.readOnly = this.hasAttribute('readonly');
            field.setAttribute('aria-valuemin', !index && cycle === 12 ? '1' : '0');
            field.setAttribute('aria-valuemax', index ? '59' : cycle === 12 ? '12' : '23');
            field.setAttribute('aria-valuenow', String(number));
            field.setAttribute('aria-valuetext', !index && cycle === 12 ? `${number} ${parts[0] >= 12 ? 'PM' : 'AM'}` : String(number));
        });
        this.querySelectorAll('[data-hour-cycle]').forEach(button => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.hourCycle) === cycle));
            button.disabled = this.hasAttribute('disabled');
        });
        const period = this.querySelector('[data-time-period]');
        period.hidden = cycle === 24;
        period.textContent = parts[0] >= 12 ? 'PM' : 'AM';
        period.setAttribute('aria-label', parts[0] >= 12 ? 'После полудня. Переключить на AM' : 'До полудня. Переключить на PM');
        period.disabled = this.locked;
        this.dataset.hourCycle = String(cycle);
        const hidden = this.querySelector('[data-time-value]');
        if (hidden) {
            hidden.value = this.current;
            hidden.disabled = this.hasAttribute('disabled');
        }
    }
    key(event, field, index) {
        if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey)
            return;
        if (['ArrowLeft', 'ArrowRight', ':'].includes(event.key)) {
            event.preventDefault();
            this.commitField(field);
            const next = this.fields[event.key === 'ArrowLeft' ? 0 : 1];
            next.focus({ preventScroll: true });
            next.select();
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            this.commitField(field);
            field.select();
            return;
        }
        if (this.locked || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        const min = !index && this.hourCycle === 12 ? 1 : 0, max = index ? 59 : this.hourCycle === 12 ? 12 : 23;
        const value = Number(field.value) || min;
        field.value = String(event.key === 'Home' ? min : event.key === 'End' ? max : min + (value - min + (event.key === 'ArrowUp' ? 1 : -1) + max - min + 1) % (max - min + 1));
        this.commitField(field);
        field.select();
    }
}
exports.IqTime = IqTime;


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
