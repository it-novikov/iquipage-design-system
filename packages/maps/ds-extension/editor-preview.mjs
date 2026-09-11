/** Opt-in interaction of the existing editor, applied only to the copied DS candidate. */
export async function applyEditorPreviewPatch(patch) {
  await patch('src/modules/editor.js', '    history = [];', String.raw`
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
    history = [];`);
  await patch('src/modules/editor.js', '        ro.observe(this);', '        ro.observe(this);\n        this.mountPreviewBehavior();');
  await patch('src/modules/editor.js', '    focusEditor() {', '    focusEditor() {\n        if (this.disabled || this.readOnly) return;');
  await patch('src/modules/editor.js', '    renderPreview(pane,value) {', '    renderPreview(pane,value) {\n        value = this.value; // The textarea normalizes CRLF; task positions must use that same draft.');
  await patch('src/modules/editor.js', '            preview.disabled = this.disabled;', '            preview.disabled = this.disabled || (this.previewMode && this.readOnly);\n        if (this.previewMode) this.renderPreview(this.querySelector(".md-preview"), this.value);');
  await patch('src/modules/editor.js', `        try { pane.innerHTML=safeMarkdown(value)||'<p class="md-empty">Пока нет содержимого.</p>'; }`, `        try {
            pane.innerHTML=safeMarkdown(value)||'<p class="md-empty">Пока нет содержимого.</p>';
            if (this.interactiveTasks && !this.disabled && !this.readOnly) require('./markdown-tasks.js').bindMarkdownTasks(pane, value, (detail, button) => {
                if (this.disabled || this.readOnly || !this.interactiveTasks || this.value !== detail.source) return;
                const restoreFocus = this.ownerDocument.activeElement === button;
                this.input.value = detail.value;
                this.record(); this.sync();
                this.emit('iq-change', {value: this.value});
                if (restoreFocus) pane.querySelector('[data-task-position="' + detail.position + '"]')?.focus({preventScroll: true});
            });
        }`);
  await patch('src/modules/editor.js', `        const button = this.querySelector('[data-md-preview]'), pane = this.querySelector('.md-preview'), on = button.getAttribute('aria-pressed') !== 'true';
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
        }`, '        this.setPreviewMode(!this.previewMode);');
}
