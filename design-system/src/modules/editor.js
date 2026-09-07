const {safeMarkdown} = require('./markdown.js');
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markdownTools = exports.IqTime = exports.IqMarkdownEditor = void 0;
exports.registerEditors = registerEditors;
exports.safeMarkdown = safeMarkdown;
const time_js_1 = require("./time.js");
const time_js_2 = require("./time.js");
const IqTime = time_js_2.IqTime;
exports.IqTime = IqTime;
const components_js_1 = require("./components.js");
const interaction_js_1 = require("./interaction.js");
const markdownTools = [
    { id: 'bold', label: 'Полужирный', glyph: 'bold', shortcut: 'Ctrl/⌘ B' }, { id: 'italic', label: 'Курсив', glyph: 'italic', shortcut: 'Ctrl/⌘ I' }, { id: 'strike', label: 'Зачёркнутый', glyph: 'strike' },
    { id: 'h1', label: 'Заголовок 1', glyph: 'h1' }, { id: 'h2', label: 'Заголовок 2', glyph: 'h2' }, { id: 'h3', label: 'Заголовок 3', glyph: 'h3' },
    { id: 'ul', label: 'Маркированный список', glyph: 'list' }, { id: 'ol', label: 'Нумерованный список', glyph: 'ordered' }, { id: 'task', label: 'Чек-лист', glyph: 'checklist' },
    { id: 'quote', label: 'Цитата', glyph: 'quote' }, { id: 'code', label: 'Код в строке', glyph: 'code' }, { id: 'block', label: 'Блок кода', glyph: 'codeBlock' },
    { id: 'link', label: 'Ссылка', glyph: 'link', shortcut: 'Ctrl/⌘ K' }, { id: 'image', label: 'Изображение по HTTPS-ссылке', glyph: 'image' }, { id: 'rule', label: 'Разделитель', glyph: 'minus' },
    { id: 'undo', label: 'Отменить', glyph: 'undo', shortcut: 'Ctrl/⌘ Z' }, { id: 'redo', label: 'Повторить', glyph: 'redo', shortcut: 'Ctrl/⌘ Shift Z' }
];
exports.markdownTools = markdownTools;
class IqMarkdownEditor extends components_js_1.IqElement {
    history = [];
    cursor = 0;
    input;
    static get observedAttributes() { return ['value', 'disabled', 'readonly', 'aria-invalid', 'aria-describedby']; }
    attributeChangedCallback(name, _old, value) {
        if (!this.input)
            return;
        if (name === 'value')
            this.value = value || '';
        else
            this.sync();
    }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { this.toggleAttribute('disabled', value); }
    get readOnly() { return this.hasAttribute('readonly'); }
    set readOnly(value) { this.toggleAttribute('readonly', value); }
    get value() { return this.input ? this.input.value : this.getAttribute('value') || ''; }
    set value(value) {
        const next = String(value ?? '');
        if (this.input) {
            this.input.value = next;
            this.history = [next];
            this.cursor = 0;
            this.sync();
            interaction_js_1.autosize(this.input);
            const pane = this.querySelector('.md-preview');
            if (pane && !pane.hidden)
                this.renderPreview(pane,next);
        }
        else
            this.setAttribute('value', next);
    }
    mount() {
        const initial = this.getAttribute('value') || this.textContent?.trim() || '', variant = this.getAttribute('variant') || 'full';
        const tools = markdownTools;
        const label = this.getAttribute('label') || 'Описание';
        this.innerHTML = `<div class="markdown-editor variant-${components_js_1.escapeHTML(variant)}"><div class="md-editor-head"><span>${components_js_1.escapeHTML(variant === 'minimal' ? 'Комментарий' : label)}</span><button type="button" class="md-view-toggle" data-md-preview aria-pressed="false">${components_js_1.icon('eye', 16)}<span>Предпросмотр</span></button></div><div class="md-toolbar" role="toolbar" aria-label="Форматирование текста">${tools.map((t, i) => `<button type="button" class="md-tool" data-md="${t.id}" title="${t.label}${t.shortcut ? ' (' + t.shortcut + ')' : ''}" aria-label="${t.label}" tabindex="${i === 0 ? '0' : '-1'}">${t.glyph ? components_js_1.icon(t.glyph, 18) : `<span>${t.text}</span>`}</button>`).join('')}</div><textarea class="md-input" aria-label="${components_js_1.escapeHTML(label)}" name="${components_js_1.escapeHTML(this.getAttribute('name') || 'description')}" placeholder="${components_js_1.escapeHTML(this.getAttribute('placeholder') || 'Опишите ожидаемый результат, требования и ограничения')}" ${this.hasAttribute('maxlength') ? `maxlength="${components_js_1.escapeHTML(this.getAttribute('maxlength'))}"` : ''}>${components_js_1.escapeHTML(initial)}</textarea><article class="md-preview md-document" hidden aria-label="Предпросмотр Markdown"></article><footer><span class="md-hint">Markdown <span class="md-count"></span></span>${this.hasAttribute('submit-label') ? `<button type="button" class="iq-btn primary sm md-submit" data-md-submit disabled>${components_js_1.escapeHTML(this.getAttribute('submit-label') || 'Отправить')}${components_js_1.icon('send', 16)}</button>` : ''}</footer></div>`;
        this.input = this.querySelector('textarea');
        this.history = [initial];
        this.cursor = 0;
        interaction_js_1.autosize(this.input);
        this.sync();
        if (this.input.form)
            this.listen(this.input.form, 'reset', () => queueMicrotask(() => {
                if (!this.isConnected)
                    return;
                this.history = [this.input.value];
                this.cursor = 0;
                this.sync();
                interaction_js_1.autosize(this.input);
            }));
        this.listen(this.input, 'input', () => { this.record(); interaction_js_1.autosize(this.input); this.sync(); this.emit('iq-change', { value: this.value }); });
        this.listen(this, 'click', ev => {
            const t = ev.target.closest('[data-md]');
            if (t)
                this.command(t.dataset.md);
            if (ev.target.closest('[data-md-preview]'))
                this.preview();
            if (ev.target.closest('[data-md-submit]'))
                this.submit();
        });
        this.listen(this, 'keydown', ev => {
            const e = ev;
            const tool = e.target.closest('[data-md]');
            if (tool && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const items = [...this.querySelectorAll('[data-md]:not(:disabled)')], i = items.indexOf(tool), next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
                items.forEach((x, j) => x.tabIndex = j === next ? 0 : -1);
                items[next]?.focus();
                return;
            }
            if (!(e.metaKey || e.ctrlKey))
                return;
            if (e.key === 'Enter' && this.hasAttribute('submit-label')) {
                e.preventDefault();
                e.stopPropagation();
                this.submit();
                return;
            }
            if (e.target !== this.input)
                return;
            const map = { b: 'bold', i: 'italic', k: 'link', z: e.shiftKey ? 'redo' : 'undo', y: 'redo' };
            if (map[e.key.toLowerCase()]) {
                e.preventDefault();
                e.stopPropagation();
                this.command(map[e.key.toLowerCase()]);
            }
        });
        let previousWidth = 0, frame = 0;
        const ro = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width || 0;
            if (Math.abs(width - previousWidth) < .5)
                return;
            previousWidth = width;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => interaction_js_1.autosize(this.input));
        });
        ro.observe(this);
        this.addCleanup(() => { ro.disconnect(); cancelAnimationFrame(frame); });
    }
    record() {
        if (this.history[this.cursor] === this.value)
            return;
        this.history = this.history.slice(0, this.cursor + 1);
        this.history.push(this.value);
        if (this.history.length > 100)
            this.history.shift();
        this.cursor = this.history.length - 1;
    }
    sync() {
        if (!this.input)
            return;
        const locked = this.disabled || this.readOnly;
        this.input.disabled = this.disabled;
        this.input.readOnly = this.readOnly;
        this.input.setAttribute('aria-invalid', String(this.getAttribute('aria-invalid') === 'true'));
        const described = this.getAttribute('aria-describedby');
        if (described)
            this.input.setAttribute('aria-describedby', described);
        else
            this.input.removeAttribute('aria-describedby');
        this.querySelector('.md-count').textContent = `${this.value.length} знаков`;
        this.querySelectorAll('[data-md]').forEach(button => { const name = button.dataset.md; button.disabled = locked || (name === 'undo' ? this.cursor === 0 : name === 'redo' ? this.cursor === this.history.length - 1 : false); });
        const preview = this.querySelector('[data-md-preview]');
        if (preview)
            preview.disabled = this.disabled;
        const submit = this.querySelector('[data-md-submit]');
        if (submit)
            submit.disabled = locked || !this.value.trim() || !this.input.validity.valid || (this.input.maxLength >= 0 && this.value.length > this.input.maxLength);
    }
    command(id) {
        if (this.disabled || this.readOnly)
            return;
        if (id === 'undo' || id === 'redo') {
            const n = this.cursor + (id === 'undo' ? -1 : 1);
            if (n >= 0 && n < this.history.length) {
                this.cursor = n;
                this.input.value = this.history[n];
            }
            else
                return;
        }
        else {
            const v = this.value, start = this.input.selectionStart, end = this.input.selectionEnd, selected = v.slice(start, end) || 'текст';
            let insert = '', a = start, b = end;
            const pair = { bold: '**', italic: '*', strike: '~~', code: '`' };
            if (pair[id])
                insert = pair[id] + selected + pair[id];
            else if (id === 'link')
                insert = `[${selected}](https://example.com)`;
            else if (id === 'image')
                insert = '![Описание изображения](https://example.com/image.jpg)';
            else if (id === 'block')
                insert = '\n```\n' + selected + '\n```\n';
            else if (id === 'rule')
                insert = '\n\n---\n\n';
            else {
                a = v.lastIndexOf('\n', start - 1) + 1;
                b = v.indexOf('\n', end);
                if (b < 0)
                    b = v.length;
                const prefix = { h1: '# ', h2: '## ', h3: '### ', ul: '- ', ol: '1. ', task: '- [ ] ', quote: '> ' };
                insert = (v.slice(a, b) || 'текст').split('\n').map((line, i) => (id === 'ol' ? `${i + 1}. ` : prefix[id] || '') + line.replace(/^(#{1,3} |> |- \[[ x]\] |[-*] |\d+\. )/, '')).join('\n');
            }
            this.input.setRangeText(insert, a, b, 'select');
            this.record();
        }
        this.input.focus({ preventScroll: true });
        interaction_js_1.autosize(this.input);
        this.sync();
        this.emit('iq-change', { value: this.value });
    }
    focusEditor() {
        if (this.querySelector('[data-md-preview]')?.getAttribute('aria-pressed') === 'true')
            this.preview();
        else
            this.input?.focus({ preventScroll: true });
    }
    submit() {
        if (this.disabled || this.readOnly || !this.value.trim() || !this.input.validity.valid || (this.input.maxLength >= 0 && this.value.length > this.input.maxLength))
            return;
        this.emit('iq-submit', { value: this.value });
    }
    renderPreview(pane,value) {
        try { pane.innerHTML=safeMarkdown(value)||'<p class="md-empty">Пока нет содержимого.</p>'; }
        catch(error) { const p=document.createElement('p');p.setAttribute('role','alert');p.className='md-render-error';p.textContent=error.message;pane.replaceChildren(p); }
    }
    preview() {
        if (this.disabled)
            return;
        const button = this.querySelector('[data-md-preview]'), pane = this.querySelector('.md-preview'), on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        button.innerHTML = components_js_1.icon(on ? 'text' : 'eye', 16) + '<span>' + (on ? 'Редактировать' : 'Предпросмотр') + '</span>';
        this.input.hidden = on;
        pane.hidden = !on;
        this.querySelector('.md-toolbar').hidden = on;
        if (on) {
            this.renderPreview(pane,this.value);
            interaction_js_1.transition(pane, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], 200);
        }
        else {
            interaction_js_1.autosize(this.input);
            this.input.focus();
        }
    }
}
exports.IqMarkdownEditor = IqMarkdownEditor;
function registerEditors() {
    if (!customElements.get('iq-markdown-editor'))
        customElements.define('iq-markdown-editor', IqMarkdownEditor);
    if (!customElements.get('iq-time'))
        customElements.define('iq-time', time_js_1.IqTime);
}

