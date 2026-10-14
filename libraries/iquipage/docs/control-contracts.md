# Control contracts

API notes relocated from shipped runtime comments in vnext.46; executable behaviour unchanged.

## src/modules/ui.js

/**
 * A switcher (0.6.0-vnext.36): the current choice as a quiet text label with a small chevron, no border, opening a DS
 * menu of the choices with the current one checked. The workspace and project in the top bar and a page title that
 * chooses what its page shows are the same control, so they look and behave alike.
 *
 * - `label`: the current choice as plain text; `name`: what is chosen («Проект»), so the button reads «Проект: label».
 * - `items`: `{section}` headings, `{separator:true}` rules, choices `{label, action, current, glyph?, meta?}` and
 *   commands `{label, action, glyph?, danger?}`. A choice is the item with a boolean `current`: it is a
 *   menuitemradio with aria-checked, its glyph becomes the check while it is current, and the menu opens on it.
 *   `meta` is a quiet word at the end of the row («идёт»). Labels, meta, sections and the name are plain text.
 * - `size: 'title'` takes the font of its heading (a page title keeps its size and weight); the default is the
 *   compact top-bar size. `tone: 'muted'` and `emphasis: 'strong'` (a <strong> label) are the top bar's quiet workspace
 *   and bold project.
 * - `className` and `attrs` go on the button; the menu reports the picked item's `action` as `iq-action`.
 */

## src/modules/mentions.js

/**
 * The @ autocomplete of one textarea. `members` are {id, name, kind?: 'human'|'service', description?, image?};
 * people are listed first, service accounts under «Сервисные аккаунты». Picking inserts «@Имя» and a space through
 * the browser's own insertText (one undo step), fires `input` and then `iq-mention` {id, name} on the textarea. The
 * list lives next to the textarea (inside a dialog it stays reachable) and opens in the top layer.
 *
 * The field never shows a token: it holds plain text and a map of the picked mentions, which follows every edit.
 * Editing inside a name drops its mention (the text is then an ordinary typed one); Backspace right after a mention
 * removes it whole. toMarkdown() gives the message with tokens; load(markdown) shows one with names.
 */

## src/styles/avatar.css

/* Avatars (0.6.0-vnext.38): one scale, one rule for the initials, owned here and nowhere else.
   The disc's diameter is --iq-avatar-size, one step of the avatar scale (tokens avatar-size-xs…xl: 20, 24, 28, 32, 40, 48 px;
   32 without a size class). The initials are a fixed share of that diameter (--iq-avatar-initials, 0.37) at one weight
   (--iq-avatar-initials-weight, 550), untracked: two wide Cyrillic capitals («ЖЛ», Inter at text optical size) keep about
   19% of the diameter clear on each side at every size, a single letter about 35%. The line is trimmed to the cap height
   and alphabetic baseline (text-box) and centred in the disc (align-content), so the capitals sit on the optical centre;
   where text-box is unsupported the 1:1 line box is centred instead (Inter's capitals are within half a pixel of it).
   A context chooses a size class (or sets --iq-avatar-size); it never sets a width or a font-size. */

## Property list

## Property list — vnext.56 private reflow trial

`.iq-properties[data-label=wide]` presents an object's named facts. Editable values keep their existing ghost trigger, hover/focus feedback and editor; static `.iq-property` rows use `.iq-property-label` and `.iq-property-value` (including `dt`/`dd`). The label remains secondary and the complete current value can wrap before the person opens an editor.

**Trial status:** this package is a private candidate. Sprintique still consumes vnext.54. Native comparison and independent review must decide whether this reflow is suitable before product adoption; the numeric budgets below are implementation details under evaluation, not a new consumer API.

The list uses available row width and the interface text size, without a viewport breakpoint or a container observer. Each label keeps a no-grow budget of the greater of the existing `--iq-properties-label` hint (120px by default) and seven interface text units. Its value carrier starts with fourteen interface text units and takes the remaining row space. When both outer budgets do not fit, flex places the value below the label. The label can itself wrap within its budget; it does not automatically consume the whole stacked row. This may add label or value lines compared with a full-width stacked arrangement. The existing hint still permits a host to budget for its labels, but it is not a fixed rendered-width guarantee.

Rows have a 36px minimum, a small common block inset and natural height. Labels, selected captions and static text wrap, including unbroken words. A select's existing `.iq-select-wrap`, a date's button, a tag field and the static value share zero outer margins and border-box sizing; popups and hidden form inputs are excluded. The visible text inset is shared by static values and ghost triggers. A filled status remains a content-width pill with a 26px minimum, growing with its caption. Neither text nor controls are reduced to make a row fit.

Use the existing public value parts for composed static facts: `.iq-property-text`, `.iq-property-meta` and `.iq-property-key`. A direct avatar with `.iq-property-text` keeps the name beside the avatar and allows metadata beneath that name. Plain text values also wrap. Intentionally secondary select metadata remains hidden in this compact composition. Native combobox and tag search inputs retain their single-line editing contract; long input buffers scroll while editing rather than becoming multiline display text. Selected tag captions remain visible, and the empty unfocused search buffer does not reserve an extra row.

This trial changes only the wide property list. The separate `[data-columns]` grid, property strip and ordinary controls retain their contracts. Consumers must not copy internal trigger styles into products. Product-owned controls (for example a bespoke Task pill), live popup positioning during a container-only resize, and a readonly empty tag picker require their own applicable verification; this CSS change does not claim to resolve those behaviors.

## Menu touch targets (vnext.50)

`iq-menu` action items, including menus composed with `ui.menu()` or `ui.switcher()`, have a minimum height of 44px when the primary pointer is coarse or the viewport is at most 720px wide. Fine-pointer wider desktops retain the existing 40px minimum. This is an additive CSS sizing correction: roles, disabled items, keyboard navigation, focus restoration and action events are unchanged. Consumers use the public component; no product selector into its popup is needed.

Public `.iq-document-bar`, `.iq-document-rail` and `.iq-dialog` compositions apply the same 44×44px minimum to `.iq-btn` controls in that touch/narrow media condition, including icon-only navigation and close buttons. Wider fine-pointer layouts retain their existing component sizes.

## Tabs geometry (vnext.54)

The public `iq-tabs` / `ui.tabs()` composition keeps a single horizontal strip of intrinsic-width, unwrapped labels. The selected label retains its 2px underline; the neutral 1px baseline is painted at the content-box bottom. The strip reserves 4px on each side for the existing global external focus outline and halo. Its height follows the text, with no negative button margin or fixed height; ordinary and enlarged text do not create a vertical scroll range. Keyboard activation explicitly reveals the selected tab with native `scrollIntoView` and nearest alignment on both axes. This also exposes a partially visible label that native focus may leave in place. Inline scroll padding reserves the existing external focus paint; horizontal panning remains available.

This adds 8px to the strip height compared with vnext.52 and moves its labels 4px inward. Hosts should allow the row to size to content and consume the public package styles. No product selector into the component is needed. Roles, selected/panel state, disabled-tab skipping, click/arrow/Home/End selection and `iq-change` events are unchanged.
