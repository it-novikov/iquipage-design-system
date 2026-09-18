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
    connectedMoveCallback() {
        if (this.input?.form !== this._boundForm || this.ownerDocument !== this._boundDocument) this.connectedCallback();
    }
    connectedCallback() {
        if (this._movePending && this.input?.isConnected && this.input.form === this._boundForm && this.ownerDocument === this._boundDocument) {
            this._movePending = false;
            return;
        }
        const saved = this.input ? this.value : undefined;
        this._movePending = false;
        if (saved !== undefined) this.setAttribute('value', saved);
        super.connectedCallback();
        this._boundForm = this.input?.form;
        this._boundDocument = this.ownerDocument;
    }
    disconnectedCallback() {
        this._movePending = true;
        queueMicrotask(() => {
            if (!this.isConnected && this._movePending) {
                this._movePending = false;
                super.disconnectedCallback();
            }
        });
    }

    get previewOnBlur() { return this.hasAttribute('preview-on-blur'); }
    set previewOnBlur(value) { this.toggleAttribute('preview-on-blur', !!value); }
    get previewMode() { return this.input ? this.input.hidden : !!this._initialPreview; }
    set previewMode(value) { this.setPreviewMode(!!value); }
    get interactiveTasks() { return this.hasAttribute('interactive-tasks'); }
    set interactiveTasks(value) {
        this.toggleAttribute('interactive-tasks', !!value);
        if (this.input && this.previewMode) this.renderPreview(this.querySelector('.md-preview'), this.value);
    }
    mountPreviewBehavior() {
        const pane = this.querySelector('.md-preview');
        let keyboardExit = false, pointerGesture = null;
        this.listen(this.input, 'compositionstart', () => { this._composing = true; });
        this.listen(this.input, 'compositionend', () => {
            this._composing = false;
            if (this._pendingPreview) {
                this._pendingPreview = false;
                queueMicrotask(() => { if (this.isConnected) this.setPreviewMode(true); });
            }
        });
        this.listen(pane, 'click', event => {
            if (this.previewOnBlur && !event.target.closest('a,button,input,select,textarea')) this.focusEditor();
        });
        this.listen(pane, 'keydown', event => {
            if (this.previewOnBlur && event.target === pane && ['Enter', ' '].includes(event.key)) {
                event.preventDefault(); this.focusEditor();
            }
        });
        this.listen(this.ownerDocument, 'click', event => {
            const gesture = pointerGesture; pointerGesture = null;
            // Native selection can emit a click on a common ancestor after mouseup outside.
            // Only an independent outside click may change the editor's layout.
            if (event.detail > 0 && gesture && (gesture.inside || gesture.moved)) return;
            if (!this.previewOnBlur || this.previewMode || event.composedPath().includes(this)) return;
            if (event.target.closest?.('dialog') !== this.closest('dialog')) return;
            // Run the intended click action before changing layout.
            queueMicrotask(() => { if (this.isConnected && !this.events?.signal.aborted) this.setPreviewMode(true); });
        });
        this.listen(this.ownerDocument, 'pointerdown', event => {
            keyboardExit = false;
            pointerGesture = {id:event.pointerId, inside:event.composedPath().includes(this), x:event.clientX, y:event.clientY, moved:false};
        });
        this.listen(this.ownerDocument, 'pointermove', event => {
            if (pointerGesture?.id === event.pointerId && Math.hypot(event.clientX-pointerGesture.x,event.clientY-pointerGesture.y)>5) pointerGesture.moved = true;
        });
        this.listen(this.ownerDocument, 'pointercancel', () => { pointerGesture = null; });
        this.listen(this.ownerDocument.defaultView, 'blur', () => { pointerGesture = null; keyboardExit = false; });
        this.listen(this, 'keydown', event => { keyboardExit = event.key === 'Tab'; });
        this.listen(this, 'focusout', event => {
            if (this.previewOnBlur && keyboardExit && event.relatedTarget && !this.contains(event.relatedTarget) && event.relatedTarget.closest('dialog') === this.closest('dialog')) this.setPreviewMode(true);
        });
        this.setPreviewMode(!!this._initialPreview, false, false);
        this.addCleanup(() => {
            this._previewAnimation?.cancel(); this._previewFade?.cancel();
            this._pendingPreview = false; this._composing = false;
        });
    }
    setPreviewMode(on, animate = true, focus = !on) {
        if (!this.input) { this._initialPreview = on; return; }
        if (!on && (this.disabled || this.readOnly)) return;
        if (on && this._composing) { this._pendingPreview = true; return; }
        if (!on) this._pendingPreview = false;
        const changed = this.previewMode !== on, shell = this.querySelector('.markdown-editor'), pane = this.querySelector('.md-preview');
        const before = shell.getBoundingClientRect().height;
        this._previewAnimation?.cancel(); this._previewFade?.cancel();
        this._initialPreview = on;
        const button = this.querySelector('[data-md-preview]');
        button.setAttribute('aria-pressed', String(on));
        button.innerHTML = components_js_1.icon(on ? 'text' : 'eye', 16) + '<span>' + (on ? 'Редактировать' : 'Предпросмотр') + '</span>';
        button.disabled = this.disabled || (on && this.readOnly);
        this.input.hidden = on;
        pane.hidden = !on;
        pane.tabIndex = this.previewOnBlur && !this.disabled && !this.readOnly ? 0 : -1;
        this.querySelector('.md-toolbar').hidden = on;
        if (on) this.renderPreview(pane, this.value);
        else interaction_js_1.autosize(this.input);
        if (focus && !on) this.input.focus({preventScroll: true});
        const after = shell.getBoundingClientRect().height;
        if (changed && animate && !interaction_js_1.motionReduced()) {
            this._previewAnimation = shell.animate([{height: before + 'px', overflow: 'hidden'}, {height: after + 'px', overflow: 'hidden'}], {duration: 220, easing: 'cubic-bezier(.2,0,0,1)'});
            this._previewFade = (on ? pane : this.input).animate([{opacity: .35}, {opacity: 1}], {duration: 180});
        }
        if (changed) this.emit('iq-preview-change', {preview: on});
    }

    get density() { return this.getAttribute('density') === 'compact' ? 'compact' : 'comfortable'; }
    set density(value) {
        if (!['compact','comfortable'].includes(value)) throw new TypeError('Unsupported editor density');
        this.setAttribute('density',value);
    }
    get footerActions() { return (this._footerActions || []).map(action => ({...action})); }
    set footerActions(value) {
        if (!Array.isArray(value) || value.length > 4) throw new TypeError('Expected up to four editor actions');
        const ids = new Set();
        const next = value.map(action => {
            if (!action || typeof action !== 'object' || typeof action.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(action.id) || ids.has(action.id) ||
                typeof action.label !== 'string' || !action.label.trim() || action.label.length > 80 ||
                typeof action.pressed !== 'boolean' || (action.disabled !== undefined && typeof action.disabled !== 'boolean') ||
                (action.tone !== undefined && !['neutral','warning'].includes(action.tone))) throw new TypeError('Invalid editor action');
            ids.add(action.id);
            return {id:action.id,label:action.label.trim(),pressed:action.pressed,disabled:!!action.disabled,tone:action.tone || 'neutral'};
        });
        this._footerActions = next;
        this.syncFooterActions();
    }
    mountFooterActions() {
        const footer = this.querySelector('.markdown-editor > footer');
        const actions = this.ownerDocument.createElement('div');
        actions.className = 'md-footer-actions';
        footer.insertBefore(actions,footer.querySelector('[data-md-submit]'));
        this._actionAnimations = new Set();
        this.listen(actions,'click',event => {
            const button = event.target.closest('[data-editor-action]');
            const action = this._footerActions?.find(item => item.id === button?.dataset.editorAction);
            if (!action || action.disabled || this.disabled || this.readOnly) return;
            const previous = action.pressed;
            this.emit('iq-editor-action',{id:action.id,pressed:!previous,previous});
            if (this.isConnected && this._footerActions?.find(item => item.id === action.id)?.pressed !== previous) {
                const animation = interaction_js_1.transition(button,[{transform:'scale(.94)'},{transform:'scale(1.04)'},{transform:'scale(1)'}],230);
                if (animation) { this._actionAnimations.add(animation); animation.finished.catch(() => {}).finally(() => this._actionAnimations.delete(animation)); }
            }
        });
        this.addCleanup(() => { for (const animation of this._actionAnimations) animation.cancel(); this._actionAnimations.clear(); });
        this.syncFooterActions();
    }
    syncFooterActions() {
        const root = this.querySelector('.md-footer-actions');
        if (!root) return;
        const actions = this._footerActions || [], ids = new Set(actions.map(item => item.id));
        for (const button of [...root.children]) if (!ids.has(button.dataset.editorAction)) button.remove();
        let cursor = root.firstElementChild;
        for (const action of actions) {
            let button = [...root.children].find(node => node.dataset.editorAction === action.id);
            if (!button) { button = this.ownerDocument.createElement('button'); button.type = 'button'; button.dataset.editorAction = action.id; button.className = 'iq-btn secondary sm pill'; }
            button.textContent = action.label;
            button.setAttribute('aria-pressed',String(action.pressed));
            button.dataset.tone = action.tone;
            button.disabled = this.disabled || this.readOnly || action.disabled;
            if (button !== cursor) root.insertBefore(button,cursor);
            cursor = button.nextElementSibling;
        }
        root.hidden = !actions.length;
        this.querySelector('.md-hint').hidden = !!actions.length;
    }
    history = [];
    cursor = 0;
    input;
    static get observedAttributes() { return ['value', 'disabled', 'readonly', 'aria-invalid', 'aria-describedby', 'density']; }
    attributeChangedCallback(name, _old, value) {
        if (!this.input)
            return;
        if (name === 'density') { interaction_js_1.autosize(this.input); return; }
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
        for (const name of ['density','footerActions']) if (Object.prototype.hasOwnProperty.call(this,name)) { const value = this[name]; delete this[name]; this[name] = value; }
        const initial = this.getAttribute('value') || this.textContent?.trim() || '', variant = this.getAttribute('variant') || 'full';
        const tools = markdownTools;
        const label = this.getAttribute('label') || 'Описание';
        this.innerHTML = `<div class="markdown-editor variant-${components_js_1.escapeHTML(variant)}"><div class="md-editor-head"><span>${components_js_1.escapeHTML(variant === 'minimal' ? 'Комментарий' : label)}</span><button type="button" class="md-view-toggle" data-md-preview aria-pressed="false">${components_js_1.icon('eye', 16)}<span>Предпросмотр</span></button></div><div class="md-toolbar" role="toolbar" aria-label="Форматирование текста">${tools.map((t, i) => `<button type="button" class="md-tool" data-md="${t.id}" title="${t.label}${t.shortcut ? ' (' + t.shortcut + ')' : ''}" aria-label="${t.label}" tabindex="${i === 0 ? '0' : '-1'}">${t.glyph ? components_js_1.icon(t.glyph, 18) : `<span>${t.text}</span>`}</button>`).join('')}</div><textarea class="md-input" aria-label="${components_js_1.escapeHTML(label)}" name="${components_js_1.escapeHTML(this.getAttribute('name') || 'description')}" placeholder="${components_js_1.escapeHTML(this.getAttribute('placeholder') || 'Опишите ожидаемый результат, требования и ограничения')}" ${this.hasAttribute('maxlength') ? `maxlength="${components_js_1.escapeHTML(this.getAttribute('maxlength'))}"` : ''}>${components_js_1.escapeHTML(initial)}</textarea><article class="md-preview md-document" hidden aria-label="Предпросмотр Markdown"></article><footer><span class="md-hint">Markdown <span class="md-count"></span></span>${this.hasAttribute('submit-label') ? `<button type="button" class="iq-btn primary sm md-submit" data-md-submit disabled>${components_js_1.escapeHTML(this.getAttribute('submit-label') || 'Отправить')}${components_js_1.icon('send', 16)}</button>` : ''}</footer></div>`;
        this.input = this.querySelector('textarea');
        this.mountFooterActions();
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
        this.mountPreviewBehavior();
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
        this.syncFooterActions();
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
            preview.disabled = this.disabled || (this.previewMode && this.readOnly);
        if (this.previewMode) this.renderPreview(this.querySelector(".md-preview"), this.value);
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
        if (this.disabled || this.readOnly) return;
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
        value = this.value; // The textarea normalizes CRLF; task positions must use that same draft.
        try {
            pane.innerHTML=safeMarkdown(value)||'<p class="md-empty">Пока нет содержимого.</p>';
            if (this.interactiveTasks && !this.disabled && !this.readOnly) require('./markdown-tasks.js').bindMarkdownTasks(pane, value, (detail, button) => {
                if (this.disabled || this.readOnly || !this.interactiveTasks || this.value !== detail.source) return;
                const restoreFocus = this.ownerDocument.activeElement === button;
                this.input.value = detail.value;
                this.record(); this.sync();
                this.emit('iq-change', {value: this.value});
                if (restoreFocus) pane.querySelector('[data-task-position="' + detail.position + '"]')?.focus({preventScroll: true});
            });
        }
        catch(error) { const p=document.createElement('p');p.setAttribute('role','alert');p.className='md-render-error';p.textContent=error.message;pane.replaceChildren(p); }
    }
    preview() {
        if (this.disabled)
            return;
        this.setPreviewMode(!this.previewMode);
    }
}
exports.IqMarkdownEditor = IqMarkdownEditor;
function registerEditors() {
    if (!customElements.get('iq-markdown-editor'))
        customElements.define('iq-markdown-editor', IqMarkdownEditor);
    if (!customElements.get('iq-time'))
        customElements.define('iq-time', time_js_1.IqTime);
}

