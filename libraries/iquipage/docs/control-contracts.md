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

---------- Property list (0.6.0-vnext.27): .iq-properties[data-label=wide] ----------
   One calm list of an object's facts: 36px rows, a wide 13px label column (120px; a host may set
   --iq-properties-label) and the ghost value grammar of the property grid — text at rest, a hover fill and a chevron,
   one click opens the editor. Static rows (.iq-property with .iq-property-label and .iq-property-value, or dt/dd)
   read as the same text without a hover; the status pill is 26px so it never stands taller than its neighbours.

## Menu touch targets (vnext.50)

`iq-menu` action items, including menus composed with `ui.menu()` or `ui.switcher()`, have a minimum height of 44px when the primary pointer is coarse or the viewport is at most 720px wide. Fine-pointer wider desktops retain the existing 40px minimum. This is an additive CSS sizing correction: roles, disabled items, keyboard navigation, focus restoration and action events are unchanged. Consumers use the public component; no product selector into its popup is needed.

Public `.iq-document-bar`, `.iq-document-rail` and `.iq-dialog` compositions apply the same 44×44px minimum to `.iq-btn` controls in that touch/narrow media condition, including icon-only navigation and close buttons. Wider fine-pointer layouts retain their existing component sizes.
