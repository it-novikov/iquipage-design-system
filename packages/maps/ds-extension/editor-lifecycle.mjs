/** DS-E02: explicit source-candidate fix; the pinned baseline is never edited. */
export async function applyEditorLifecyclePatch(patch){
  await patch('src/modules/editor.js','class IqMarkdownEditor extends components_js_1.IqElement {',`class IqMarkdownEditor extends components_js_1.IqElement {
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
    }`);
}
