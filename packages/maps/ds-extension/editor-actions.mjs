/** Owner-approved public source contract; applied only to the copied DS candidate. */
export async function applyEditorActionsPatch(patch){
  await patch('src/modules/editor.js','    history = [];',String.raw`
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
    history = [];`);
  await patch('src/modules/editor.js',"return ['value', 'disabled', 'readonly', 'aria-invalid', 'aria-describedby'];","return ['value', 'disabled', 'readonly', 'aria-invalid', 'aria-describedby', 'density'];");
  await patch('src/modules/editor.js',"        if (name === 'value')\n            this.value = value || '';","        if (name === 'density') { interaction_js_1.autosize(this.input); return; }\n        if (name === 'value')\n            this.value = value || '';");
  await patch('src/modules/editor.js','    mount() {',`    mount() {
        for (const name of ['density','footerActions']) if (Object.prototype.hasOwnProperty.call(this,name)) { const value = this[name]; delete this[name]; this[name] = value; }`);
  await patch('src/modules/editor.js',"        this.input = this.querySelector('textarea');","        this.input = this.querySelector('textarea');\n        this.mountFooterActions();");
  await patch('src/modules/editor.js','        const locked = this.disabled || this.readOnly;','        const locked = this.disabled || this.readOnly;\n        this.syncFooterActions();');
  await patch('types/core.d.ts','export declare class IqMarkdownEditor extends HTMLElement {value:string;disabled:boolean;readOnly:boolean;preview():void;focusEditor():void;}',`export interface MarkdownEditorAction {id:string;label:string;pressed:boolean;disabled?:boolean;tone?:'neutral'|'warning';}
export interface MarkdownEditorActionIntent {id:string;pressed:boolean;previous:boolean;}
export declare class IqMarkdownEditor extends HTMLElement {value:string;disabled:boolean;readOnly:boolean;density:'compact'|'comfortable';footerActions:MarkdownEditorAction[];preview():void;focusEditor():void;}`);
}
