const {safeMarkdown, markdownPasteLink} = require('./markdown.js');
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markdownTools = exports.IqTime = exports.IqMarkdownEditor = void 0;
exports.registerEditors = registerEditors;
exports.safeMarkdown = safeMarkdown;
exports.pasteLink = pasteLink;
const time_js_1 = require("./time.js");
const mentions_js_1 = require("./mentions.js");
const time_js_2 = require("./time.js");
const IqTime = time_js_2.IqTime;
exports.IqTime = IqTime;
const components_js_1 = require("./components.js");
const interaction_js_1 = require("./interaction.js");
let hintSequence = 0;
const chatTools = ['bold', 'italic', 'link', 'ul', 'ol', 'quote', 'code'];
const markdownTools = [
    { id: 'bold', label: 'Полужирный', glyph: 'bold', shortcut: 'Ctrl/⌘ B' }, { id: 'italic', label: 'Курсив', glyph: 'italic', shortcut: 'Ctrl/⌘ I' }, { id: 'strike', label: 'Зачёркнутый', glyph: 'strike' },
    { id: 'h1', label: 'Заголовок 1', glyph: 'h1' }, { id: 'h2', label: 'Заголовок 2', glyph: 'h2' }, { id: 'h3', label: 'Заголовок 3', glyph: 'h3' },
    { id: 'ul', label: 'Маркированный список', glyph: 'list' }, { id: 'ol', label: 'Нумерованный список', glyph: 'ordered' }, { id: 'task', label: 'Чек-лист', glyph: 'checklist' },
    { id: 'quote', label: 'Цитата', glyph: 'quote' }, { id: 'code', label: 'Код в строке', glyph: 'code' }, { id: 'block', label: 'Блок кода', glyph: 'codeBlock' },
    { id: 'link', label: 'Ссылка', glyph: 'link', shortcut: 'Ctrl/⌘ K' }, { id: 'image', label: 'Изображение по HTTPS-ссылке', glyph: 'image' }, { id: 'rule', label: 'Разделитель', glyph: 'minus' },
    { id: 'undo', label: 'Отменить', glyph: 'undo', shortcut: 'Ctrl/⌘ Z' }, { id: 'redo', label: 'Повторить', glyph: 'redo', shortcut: 'Ctrl/⌘ Shift Z' }
];
exports.markdownTools = markdownTools;
/** A pasted link becomes Markdown at once: [selection](url) over a selection, <url> at a caret (see markdownPasteLink).
 * The edit goes through the browser's insertText, so it fires one input event (one history entry) and the native
 * undo reverts it in one step too; setRangeText plus a synthetic input event is the fallback. */
function pasteLink(input, event) {
    if (!input || event.defaultPrevented || input.disabled || input.readOnly)
        return false;
    const link = markdownPasteLink(input.value, input.selectionStart, input.selectionEnd, event.clipboardData?.getData('text/plain'));
    if (!link)
        return false;
    // A link that would not fit stays an ordinary paste, which the field itself truncates.
    if (input.maxLength >= 0 && input.value.length - (link.end - link.start) + link.text.length > input.maxLength)
        return false;
    event.preventDefault();
    input.setSelectionRange(link.start, link.end);
    let inserted = false;
    try { inserted = input.ownerDocument.activeElement === input && input.ownerDocument.execCommand('insertText', false, link.text); }
    catch { inserted = false; }
    if (!inserted) {
        input.setRangeText(link.text, link.start, link.end, 'end');
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: link.text }));
    }
    return true;
}
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
        this.listen(this, 'keydown', event => {
            if (event.key !== 'Escape' || !this.previewOnBlur || this.previewMode || this._composing || event.defaultPrevented) return;
            // First Escape leaves editing; the dialog closes only on the next one.
            event.preventDefault(); event.stopPropagation();
            this.setPreviewMode(true);
            this.querySelector('.md-preview')?.focus({preventScroll: true});
        });
        this.listen(this, 'focusout', event => {
            if (this.previewOnBlur && keyboardExit && event.relatedTarget && !this.contains(event.relatedTarget) && event.relatedTarget.closest('dialog') === this.closest('dialog')) this.setPreviewMode(true);
        });
        // The preview attribute opens straight in preview, with no height animation on first paint.
        this.setPreviewMode(!!this._initialPreview || this.hasAttribute('preview'), false, false);
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
        this.toggleAttribute('data-previewing', on);
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
        const duration = changed && animate && !interaction_js_1.motionReduced() ? interaction_js_1.motionMs('standard', 180) : 0;
        if (duration > 0) {
            // Layout is never animated (MOT-04): the shell takes its new height at once; when it grew, the added band is
            // revealed by clip-path while the new pane fades in — both paint-only.
            if (after > before) this._previewAnimation = shell.animate([{clipPath: `inset(0 0 ${after - before}px 0)`}, {clipPath: 'inset(0)'}], {duration, easing: interaction_js_1.motionEase('ease')});
            this._previewFade = (on ? pane : this.input).animate([{opacity: .35}, {opacity: 1}], {duration, easing: interaction_js_1.motionEase('ease')});
        }
        if (changed) this.emit('iq-preview-change', {preview: on});
    }

    /**
     * Who can be mentioned (vnext.29): {id, name, kind?: 'human'|'service', description?, image?}. With members, «@»
     * in the text opens the mention list and the preview shows mention pills with current names; null turns it off.
     */
    get mentions() { return this._mentions ? this._mentions.map(member => ({...member})) : null; }
    set mentions(value) {
        if (value != null && !Array.isArray(value)) throw new TypeError('mentions: an array of members or null');
        // The list shows a dozen at a time; a very large project offers its first 1000 members.
        this._mentions = value ? value.slice(0, 1000).map(member => ({...member})) : null;
        this.syncMentions();
        if (this.input && this.previewMode) this.renderPreview(this.querySelector('.md-preview'), this.value);
    }
    syncMentions() {
        if (!this.input) return;
        if (!this._mentions) { this._mentionList?.destroy(); this._mentionList = null; return; }
        if (this._mentionList && this._mentionList.input === this.input) this._mentionList.setMembers(this._mentions);
        else {
            this._mentionList?.destroy();
            this._mentionList = mentions_js_1.attachMentionAutocomplete(this.input, {members: this._mentions});
            if (!this._mentionCleanup) {
                this._mentionCleanup = true;
                this.addCleanup(() => { this._mentionCleanup = false; this._mentionList?.destroy(); this._mentionList = null; });
            }
        }
    }
    get density() { return this.getAttribute('density') === 'compact' ? 'compact' : 'comfortable'; }
    set density(value) {
        if (!['compact','comfortable'].includes(value)) throw new TypeError('Unsupported editor density');
        this.setAttribute('density',value);
    }
    /** Contextual host actions at the end of the toolbar (for example "Шаблон"). They exist only while editing. */
    get toolbarActions() { return (this._toolbarActions || []).map(action => ({...action})); }
    set toolbarActions(value) {
        if (!Array.isArray(value) || value.length > 3) throw new TypeError('Expected up to three toolbar actions');
        const ids = new Set();
        this._toolbarActions = value.map(action => {
            if (!action || typeof action.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(action.id) || ids.has(action.id) || typeof action.label !== 'string' || !action.label.trim() || action.label.length > 40 || (action.icon !== undefined && typeof action.icon !== 'string')) throw new TypeError('Invalid toolbar action');
            ids.add(action.id);
            return {id:action.id,label:action.label.trim(),icon:action.icon || ''};
        });
        this.syncToolbarActions();
    }
    syncToolbarActions() {
        const toolbar = this.querySelector('.md-toolbar');
        if (!toolbar) return;
        toolbar.querySelector('.md-toolbar-actions')?.remove();
        const actions = this._toolbarActions || [];
        if (!actions.length) return;
        const group = this.ownerDocument.createElement('span');
        group.className = 'md-toolbar-actions';
        group.innerHTML = actions.map(action => `<button type="button" class="md-toolbar-action" data-toolbar-action="${components_js_1.escapeHTML(action.id)}" title="${components_js_1.escapeHTML(action.label)}">${action.icon ? components_js_1.icon(action.icon, 16) : ''}<span>${components_js_1.escapeHTML(action.label)}</span></button>`).join('');
        toolbar.append(group);
    }
    get footerActions() { return (this._footerActions || []).map(action => ({...action})); }
    set footerActions(value) {
        if (!Array.isArray(value) || value.length > 4) throw new TypeError('Expected up to four editor actions');
        const ids = new Set();
        const next = value.map(action => {
            if (!action || typeof action !== 'object' || typeof action.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(action.id) || ids.has(action.id) ||
                typeof action.label !== 'string' || !action.label.trim() || action.label.length > 80 ||
                typeof action.pressed !== 'boolean' || (action.disabled !== undefined && typeof action.disabled !== 'boolean') ||
                (action.tone !== undefined && !['neutral','warning'].includes(action.tone)) ||
                (action.hint !== undefined && (typeof action.hint !== 'string' || action.hint.length > 120)) ||
                (action.appearance !== undefined && !['check','chip'].includes(action.appearance)) || (action.icon !== undefined && typeof action.icon !== 'string')) throw new TypeError('Invalid editor action');
            ids.add(action.id);
            return {id:action.id,label:action.label.trim(),pressed:action.pressed,disabled:!!action.disabled,tone:action.tone || 'neutral',hint:(action.hint || '').trim(),appearance:action.appearance || 'check',icon:action.icon || ''};
        });
        this._footerActions = next;
        this.syncFooterActions();
    }
    mountFooterActions() {
        const footer = this.querySelector('.markdown-editor > footer');
        const actions = this.ownerDocument.createElement('div');
        actions.className = 'md-footer-actions';
        footer.insertBefore(actions,footer.querySelector('[data-md-cancel],[data-md-submit]'));
        const hint = this.ownerDocument.createElement('small');
        hint.className = 'md-footer-hint'; hint.id = 'md-hint-' + (++hintSequence); hint.hidden = true;
        footer.after(hint);
        this.listen(actions,'click',event => {
            const chip = event.target.closest('button[data-editor-action]');
            const action = this._footerActions?.find(item => item.id === chip?.dataset.editorAction);
            if (!action || action.disabled || this.disabled || this.readOnly) return;
            this.emit('iq-editor-action',{id:action.id,pressed:!action.pressed,previous:action.pressed});
            this.syncFooterActions();
        });
        // Footer actions are DS checkboxes: a labelled choice about the message, with an optional quiet hint.
        this.listen(actions,'change',event => {
            const input = event.target.closest('input[type=checkbox]'), node = input?.closest('[data-editor-action]');
            const action = this._footerActions?.find(item => item.id === node?.dataset.editorAction);
            if (!action) return;
            if (action.disabled || this.disabled || this.readOnly) { input.checked = action.pressed; return; }
            const previous = action.pressed;
            this.emit('iq-editor-action',{id:action.id,pressed:!previous,previous});
            // The host owns the state: re-apply whatever it set (or kept).
            this.syncFooterActions();
        });
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
            if (button && (button.tagName === 'BUTTON') !== (action.appearance === 'chip')) { button.remove(); button = null; }
            if (!button && action.appearance === 'chip') {
                // A chip is a compact pressed/unpressed toggle for chat composers; its hint shows once under the footer.
                button = this.ownerDocument.createElement('button'); button.type = 'button'; button.dataset.editorAction = action.id; button.className = 'md-footer-chip';
            }
            if (button?.tagName === 'BUTTON') {
                button.innerHTML = (action.icon ? components_js_1.icon(action.icon, 14) : '') + '<span>' + components_js_1.escapeHTML(action.label) + '</span>';
                button.setAttribute('aria-pressed', String(action.pressed)); button.dataset.tone = action.tone;
                button.disabled = this.disabled || this.readOnly || action.disabled;
                if (action.hint) button.setAttribute('aria-describedby', this.querySelector('.md-footer-hint')?.id || ''); else button.removeAttribute('aria-describedby');
                if (button !== cursor) root.insertBefore(button,cursor);
                cursor = button.nextElementSibling;
                continue;
            }
            if (!button) {
                button = this.ownerDocument.createElement('label'); button.dataset.editorAction = action.id; button.className = 'iq-check md-footer-toggle';
                button.innerHTML = `<input type="checkbox"><span class="iq-check-box">${components_js_1.icon('check', 14)}</span><span class="md-footer-toggle-copy"><span class="md-footer-toggle-label"></span><small class="md-footer-toggle-hint"></small></span>`;
            }
            const input = button.querySelector('input');
            button.querySelector('.md-footer-toggle-label').textContent = action.label;
            const hint = button.querySelector('.md-footer-toggle-hint'); hint.textContent = action.hint; hint.hidden = !action.hint;
            input.checked = action.pressed;
            button.dataset.tone = action.tone; button.dataset.checked = String(action.pressed);
            input.disabled = this.disabled || this.readOnly || action.disabled;
            if (button !== cursor) root.insertBefore(button,cursor);
            cursor = button.nextElementSibling;
        }
        root.hidden = !actions.length;
        this.querySelector('.md-hint').hidden = !!actions.length || this.variant === 'chat';
        const hint = this.querySelector('.md-footer-hint'), shown = actions.find(item => item.appearance === 'chip' && item.pressed && item.hint);
        if (hint) { hint.textContent = shown?.hint || ''; hint.hidden = !shown; }
        this.syncIdle();
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
        for (const name of ['density','footerActions','toolbarActions','mentions']) if (Object.prototype.hasOwnProperty.call(this,name)) { const value = this[name]; delete this[name]; this[name] = value; }
        const initial = this.getAttribute('value') || this.textContent?.trim() || '', variant = this.getAttribute('variant') || 'full';
        const chat = variant === 'chat';
        const tools = chat ? markdownTools.filter(tool => chatTools.includes(tool.id)) : markdownTools;
        const label = this.getAttribute('label') || 'Описание';
        const toolbar = `<div class="md-toolbar" role="toolbar" aria-label="Форматирование текста">${tools.map((t, i) => `<button type="button" class="md-tool" data-md="${t.id}" title="${t.label}${t.shortcut ? ' (' + t.shortcut + ')' : ''}" aria-label="${t.label}" tabindex="${i === 0 ? '0' : '-1'}">${t.glyph ? components_js_1.icon(t.glyph, chat ? 16 : 18) : `<span>${t.text}</span>`}</button>`).join('')}</div>`;
        const cancel = this.hasAttribute('cancel-label') ? `<button type="button" class="iq-btn ghost sm md-cancel" data-md-cancel>${components_js_1.escapeHTML(this.getAttribute('cancel-label') || 'Отмена')}</button>` : '';
        this.innerHTML = `<div class="markdown-editor variant-${components_js_1.escapeHTML(variant)}"${chat ? ' tabindex="-1"' : ''}><div class="md-editor-head"><span>${components_js_1.escapeHTML(variant === 'minimal' ? 'Комментарий' : label)}</span><button type="button" class="md-view-toggle" data-md-preview aria-pressed="false">${components_js_1.icon('eye', 16)}<span>Предпросмотр</span></button></div>${chat ? '' : toolbar}<textarea${chat ? ' rows="1"' : ''} class="md-input" aria-label="${components_js_1.escapeHTML(label)}" name="${components_js_1.escapeHTML(this.getAttribute('name') || 'description')}" placeholder="${components_js_1.escapeHTML(this.getAttribute('placeholder') || 'Опишите ожидаемый результат, требования и ограничения')}" ${this.hasAttribute('maxlength') ? `maxlength="${components_js_1.escapeHTML(this.getAttribute('maxlength'))}"` : ''}>${components_js_1.escapeHTML(initial)}</textarea><article class="md-preview md-document" hidden aria-label="Предпросмотр Markdown"></article><footer>${chat ? toolbar : ''}<span class="md-hint">Markdown <span class="md-count"></span></span>${cancel}${this.hasAttribute('submit-label') ? `<button type="button" class="iq-btn primary sm md-submit" data-md-submit disabled>${components_js_1.escapeHTML(this.getAttribute('submit-label') || 'Отправить')}${components_js_1.icon('send', 16)}</button>` : ''}</footer></div>`;
        this.input = this.querySelector('textarea');
        this.mountFooterActions();
        this.syncToolbarActions();
        this.syncMentions();
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
        this.listen(this.input, 'paste', event => { if (!this.disabled && !this.readOnly) pasteLink(this.input, event); });
        this.listen(this, 'click', ev => {
            const t = ev.target.closest('[data-md]');
            if (t)
                this.command(t.dataset.md);
            if (ev.target.closest('[data-md-preview]'))
                this.preview();
            const hostAction = ev.target.closest('[data-toolbar-action],[data-empty-action]');
            if (hostAction && !this.disabled && !this.readOnly)
                this.emit('iq-editor-action', {id: hostAction.dataset.toolbarAction || hostAction.dataset.emptyAction});
            if (ev.target.closest('[data-md-submit]'))
                this.submit();
            if (ev.target.closest('[data-md-cancel]') && !this.disabled) {
                if (this.emit('iq-cancel', {value: this.value}, {cancelable: true})) this.reset();
            }
        });
        if (chat) this.mountChat();
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
                this.submit({alternate: e.altKey});
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
    submit({alternate = false} = {}) {
        if (this.disabled || this.readOnly || !this.value.trim() || !this.input.validity.valid || (this.input.maxLength >= 0 && this.value.length > this.input.maxLength))
            return;
        this.emit('iq-submit', { value: this.value, alternate: !!alternate });
    }
    get variant() { return this.getAttribute('variant') || 'full'; }
    /** Chat composer: the short toolbar lives in the footer; with idle="line" the editor rests as one field. */
    mountChat() {
        this.listen(this, 'focusin', () => this.expand({focus: false}));
        this.listen(this, 'pointerdown', () => this.expand({focus: false}));
        this.listen(this.input, 'input', () => this.expand({focus: false}));
        this.listen(this, 'focusout', event => {
            if (event.relatedTarget && this.contains(event.relatedTarget)) return;
            queueMicrotask(() => { if (this.isConnected && !this.contains(this.ownerDocument.activeElement)) this.collapse(); });
        });
        this.listen(this, 'keydown', event => {
            if (event.key !== 'Escape' || this._composing || event.defaultPrevented) return;
            const frame = this.querySelector('.markdown-editor');
            if (event.target === frame) return; // the second Escape reaches the dialog
            if (!this.value.trim()) {
                if (!this.expanded) return;
                event.preventDefault(); event.stopPropagation();
                if (this.hasAttribute('idle')) { this.collapse(); this.input.blur(); }
                else this.emit('iq-cancel', {value: this.value, reason: 'escape'}, {cancelable: true});
                return;
            }
            // A typed draft is never dropped by Escape: step out of the field first, keep the text.
            event.preventDefault(); event.stopPropagation();
            frame.focus({preventScroll: true});
        });
        this.syncIdle();
    }
    idleAllowed() {
        return this.variant === 'chat' && this.getAttribute('idle') === 'line' && !this.value.trim() && !(this._footerActions || []).some(item => item.pressed) && !(this.input && this.contains(this.ownerDocument.activeElement));
    }
    syncIdle() {
        if (!this.input || this.variant !== 'chat' || this.getAttribute('idle') !== 'line') return;
        const idle = this.idleAllowed(), was = this.hasAttribute('data-idle');
        this.toggleAttribute('data-idle', idle);
        if (was !== idle) this.emit('iq-editor-expand', {expanded: !idle});
    }
    get expanded() { return !this.hasAttribute('data-idle'); }
    expand({focus = true} = {}) {
        if (!this.input) return;
        if (this.hasAttribute('data-idle')) { this.removeAttribute('data-idle'); this.emit('iq-editor-expand', {expanded: true}); interaction_js_1.autosize(this.input); }
        if (focus) { this.input.focus({preventScroll: true}); const end = this.input.value.length; this.input.setSelectionRange(end, end); }
    }
    collapse() {
        if (!this.input || this.getAttribute('idle') !== 'line' || this.hasAttribute('data-idle')) return;
        if (this.value.trim() || (this._footerActions || []).some(item => item.pressed)) return;
        this.toggleAttribute('data-idle', true);
        this.emit('iq-editor-expand', {expanded: false});
    }
    /** Clears the draft and its history, releases every pressed footer action (the host hears reason:'reset'), then rests. */
    reset() {
        if (!this.input) return;
        this.value = '';
        for (const action of (this._footerActions || [])) if (action.pressed) {
            this.emit('iq-editor-action', {id: action.id, pressed: false, previous: true, reason: 'reset'});
            action.pressed = false;
        }
        this.syncFooterActions();
        this.emit('iq-change', {value: ''});
        if (!this.contains(this.ownerDocument.activeElement)) this.collapse();
    }
    renderPreview(pane,value) {
        value = this.value; // The textarea normalizes CRLF; task positions must use that same draft.
        try {
            const emptyAction=this.getAttribute('empty-action-label'),emptyId=this.getAttribute('empty-action')||'empty';
            pane.innerHTML=safeMarkdown(value,{mentions:this._mentions||undefined})||`<p class="md-empty">${components_js_1.escapeHTML(this.getAttribute('empty-text')||'Пока нет содержимого.')}</p>${emptyAction&&!this.readOnly&&!this.disabled?`<p class="md-empty-action"><button type="button" class="iq-btn ghost sm" data-empty-action="${components_js_1.escapeHTML(emptyId)}">${components_js_1.escapeHTML(emptyAction)}</button></p>`:''}`;
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

