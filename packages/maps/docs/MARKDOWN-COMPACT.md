# Compact editor — public DS contract, board.7

Owner-approved, additive source candidate over pinned IQUIPAGE 05.7. Existing consumers keep `density="comfortable"` and an empty action list by default. Build with `node scripts/build.mjs`; do not modify the pinned `design-system/` directory or manually patch generated bundles.

## API

```ts
interface MarkdownEditorAction {
  id: string;
  label: string;
  pressed: boolean;
  disabled?: boolean;
  tone?: 'neutral' | 'warning';
}
interface MarkdownEditorActionIntent {
  id: string;
  pressed: boolean;
  previous: boolean;
}
// On iq-markdown-editor:
// density: 'comfortable' | 'compact'
// footerActions: MarkdownEditorAction[]
// event: iq-editor-action, detail: MarkdownEditorActionIntent
```

`density` reflects the same-named attribute. Invalid property values throw; unsupported attribute values behave as `comfortable`. Both new properties can be set before custom element registration. Default behavior and the existing value/preview/history APIs are unchanged.

`footerActions` accepts at most four actions. IDs are unique, 1–64 ASCII lowercase letters/digits/hyphens, starting with a letter. Labels must be nonempty text up to 80 UTF-16 code units; whitespace is trimmed. `pressed` is required. Optional fields are normalized to `disabled: false`, `tone: 'neutral'`. Invalid arrays throw atomically without replacing the previous state. The property copies incoming and outgoing records; mutating a returned record does not update the UI.

An action is a native `button` with `aria-pressed`. Mouse click, Enter and Space emit an intent. The host must synchronously accept or reject it by setting `footerActions`; no internal optimistic toggle or persistence occurs. Programmatic changes emit no event. Accepted interaction uses the same transition helper as DS controls; reduced-motion suppresses the motion. Host updates preserve the textarea/history and each retained action's button identity. Editor `disabled`, `readOnly`, and per-action `disabled` deny activation. Disabled actions remain legible and show their last accepted selection.

The normal footer helper is hidden while actions are present. Actions and the publish button wrap on narrow screens instead of overflowing. This API contains no arbitrary markup, file handling, data fetching, task status transitions, or task-specific event listeners.

## Reusable discussion recipe

```html
<iq-markdown-editor
  density="compact"
  label="Новое обсуждение"
  placeholder="Напишите сообщение или вопрос"
  submit-label="Опубликовать"
  maxlength="20000">
</iq-markdown-editor>
```

```js
let requiresResolution = false;
const sync = () => {
  editor.footerActions = [{
    id: 'requires-resolution',
    label: 'Требует решения',
    pressed: requiresResolution,
    tone: 'warning',
  }];
};
sync();
editor.addEventListener('iq-editor-action', event => {
  if (event.target !== editor || event.detail.id !== 'requires-resolution') return;
  requiresResolution = event.detail.pressed;
  sync();
});
```

On `iq-submit`, the application validates, locks the editor, then commits the text and flag using its existing repository. Only an acknowledged success clears the draft/flag; every failure unlocks while preserving them. For uncertain delivery reuse a stable thread/message ID; never create a second discussion just because the response was lost. A retry with a changed flag must surface the conflict. Include a selected flag with empty text in the host's unsaved guard. The component itself never saves data.

Published state recipe (existing DS classes, no custom colors):

```html
<span class="iq-badge">Комментарий</span>
<span class="iq-badge warning">Требует решения</span>
<span class="iq-badge success">Решён</span>
```

Use text plus color; labels remain meaningful in grayscale and to assistive technology. Permission checks and resolution actions stay with the host. A reply inherits the parent discussion kind; it does not have another decision toggle.

## Description recipe

Set `density="compact"`, `previewOnBlur = true`, and the existing initial preview state. The preview content enters editing on click; an independent outside click or keyboard focus leaving the editor returns to preview. A drag that begins within the editor and ends outside retains text selection and editing. Compact auto-preview descriptions omit the redundant header/footer; they do not lose Markdown tools or the textarea's accessible name. Do not hide the toolbar with application CSS.

## Verification and limits

`tests/browser-editor-actions-v34.mjs` exercises the isolated contract, controlled events, pre-upgrade properties, keyboard, validation, disabled/read-only, motion, short/long content, history/checklists, default compatibility and cleanup. `tests/browser-thread-actions-v34.mjs` exercises actual HTTP publication, failures, uncertain delivery, resolution/reopening, drafts, permissions and persistence. Both cover 320/390/768/1440 px in light/dark Chromium; discussion paging also retains browser-storage regression coverage.

Focus-neutral buttons are the owner's previously approved exception, not WCAG certification. Safari/Firefox, physical touch, and true browser zoom are not claimed. Compact upload is a separate contract and is not included here.
