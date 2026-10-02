'use strict';
/**
 * The @ autocomplete (0.6.0-vnext.29): a calm list under the caret of a textarea. «@» opens it, typing filters it
 * (case-insensitive, «ё» as «е»), ↑↓ move, Enter or Tab inserts the mention token, Escape closes it, a click picks.
 * Tokens and their rendering are in mention-tokens.js.
 */
const components_js_1 = require("./components.js");
const ui_js_1 = require("./ui.js");
const tokens = require("./mention-tokens.js");
const {mentionQuery, filterMentionCandidates, mentionToken} = tokens;
const MENTION_ID = new RegExp(tokens.MENTION_ID_PATTERN);
const esc = components_js_1.escapeHTML;
let sequence = 0;
/** Where the caret of a textarea is on screen: a mirror with the same box and text up to the caret. */
function caretPoint(input, index) {
    const doc = input.ownerDocument, view = doc.defaultView, style = view.getComputedStyle(input), mirror = doc.createElement('div');
    for (const name of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize']) mirror.style[name] = style[name];
    Object.assign(mirror.style, {position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', overflow: 'hidden', height: 'auto'});
    mirror.textContent = input.value.slice(0, index);
    const marker = doc.createElement('span');
    marker.textContent = input.value.slice(index, index + 1) || '.';
    mirror.append(marker);
    doc.body.append(mirror);
    const box = input.getBoundingClientRect(), line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 20;
    const point = {x: box.left + marker.offsetLeft - input.scrollLeft, y: box.top + marker.offsetTop - input.scrollTop, line};
    mirror.remove();
    return point;
}
/**
 * The @ autocomplete of one textarea. `members` are {id, name, kind?: 'human'|'service', description?, image?};
 * people are listed first, service accounts under «Сервисные аккаунты». Picking inserts mentionToken(member) and a
 * space through the browser's own insertText (one undo step), fires `input` and then `iq-mention` {id, name} on the
 * textarea. The list lives next to the textarea (inside a dialog it stays reachable) and opens in the top layer.
 */
class MentionAutocomplete {
    constructor(input, {members = [], label = 'Упомянуть участника'} = {}) {
        if (!input || input.tagName !== 'TEXTAREA' && input.tagName !== 'INPUT') throw new TypeError('MentionAutocomplete needs a textarea');
        this.input = input;
        this.members = [];
        this.matches = [];
        this.active = 0;
        this.range = null;
        this.events = new AbortController();
        const doc = input.ownerDocument, id = 'iq-mention-' + (++sequence);
        this.popup = doc.createElement('div');
        this.popup.className = 'iq-popup iq-mention-popup';
        this.popup.setAttribute('popover', 'manual');
        this.list = doc.createElement('div');
        this.list.id = id;
        this.list.setAttribute('role', 'listbox');
        this.list.setAttribute('aria-label', label);
        this.popup.append(this.list);
        // A textarea keeps its textbox role (aria-expanded belongs to a combobox): the list is announced through
        // aria-activedescendant and a polite status with the number of matches.
        this.status = doc.createElement('span');
        this.status.className = 'sr-only';
        this.status.setAttribute('role', 'status');
        this.opened = false;
        this.fallback = typeof this.popup.showPopover !== 'function';
        if (this.fallback) this.popup.style.display = 'none';
        input.after(this.popup, this.status);
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', id);
        this.setMembers(members);
        const signal = this.events.signal;
        input.addEventListener('input', () => this.update(), {signal});
        input.addEventListener('click', () => this.update(), {signal});
        input.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) this.update(); }, {signal});
        input.addEventListener('keydown', event => this.onKey(event), {signal});
        input.addEventListener('blur', () => this.close(), {signal});
        input.addEventListener('compositionend', () => this.update(), {signal});
        // The list never takes focus: the caret stays in the text while a row is clicked.
        this.list.addEventListener('pointerdown', event => event.preventDefault(), {signal});
        this.list.addEventListener('click', event => {
            const row = event.target.closest('[data-mention-index]');
            if (row) this.choose(Number(row.dataset.mentionIndex));
        }, {signal});
        doc.addEventListener('scroll', () => { if (this.isOpen) this.position(); }, {capture: true, passive: true, signal});
        doc.defaultView.addEventListener('resize', () => { if (this.isOpen) this.position(); }, {signal});
    }
    get isOpen() { return this.opened; }
    setMembers(members) {
        if (!Array.isArray(members)) throw new TypeError('Mention members are an array');
        this.members = members.filter(m => m && MENTION_ID.test(String(m.id ?? '')) && typeof m.name === 'string' && m.name.trim())
            .map(m => ({id: String(m.id), name: m.name.trim(), kind: m.kind === 'service' ? 'service' : 'human', description: typeof m.description === 'string' ? m.description : '', image: typeof m.image === 'string' ? m.image : undefined}));
        if (this.isOpen) this.update();
    }
    /** Reads the text at the caret and opens, filters or closes the list. */
    update() {
        const input = this.input;
        if (input.disabled || input.readOnly || input.selectionStart !== input.selectionEnd || !this.members.length) { this.close(); return; }
        const found = mentionQuery(input.value, input.selectionStart);
        if (!found) { this.close(); return; }
        const matches = filterMentionCandidates(this.members, found.query);
        // A space typed after a name nobody has means ordinary text again; so does a space after a whole name, where
        // Enter and Tab belong to the text again.
        const typed = found.query.toLocaleLowerCase('ru').replace(/ё/g, 'е');
        if ((!matches.length && /\s/.test(found.query)) || (/\s$/.test(found.query) &&
            !matches.some(m => m.name.toLocaleLowerCase('ru').replace(/ё/g, 'е').startsWith(typed)))) { this.close(); return; }
        const sameRange = this.range && this.range.start === found.start;
        this.range = {start: found.start, end: input.selectionStart};
        this.matches = matches;
        if (!sameRange || this.active >= matches.length) this.active = 0;
        this.render();
        this.open();
    }
    render() {
        const people = this.matches.filter(m => m.kind !== 'service').length;
        this.list.innerHTML = this.matches.length ? this.matches.map((member, index) => {
            const heading = member.kind === 'service' && index === people ? `<div class="iq-mention-heading" aria-hidden="true">Сервисные аккаунты</div>` : '';
            const avatar = ui_js_1.personAvatar({id: member.id, name: member.name, kind: member.kind, image: member.image}, {size: 'xs'});
            const role = member.kind === 'service' ? `<span class="sr-only">, сервисный аккаунт</span>` : '';
            return `${heading}<div id="${this.list.id}-${index}" class="iq-option${index === this.active ? ' is-active' : ''}" role="option" aria-selected="${index === this.active}" data-mention-index="${index}"><span class="iq-option-icon">${avatar}</span><span class="iq-option-copy"><span class="iq-option-label">${esc(member.name)}${role}</span>${member.description ? `<small>${esc(member.description)}</small>` : ''}</span></div>`;
        }).join('') : '<div class="iq-no-results">Нет участника с таким именем</div>';
        if (this.matches.length) this.input.setAttribute('aria-activedescendant', `${this.list.id}-${this.active}`);
        else this.input.removeAttribute('aria-activedescendant');
        const said = this.matches.length ? `Упоминание: найдено ${this.matches.length}` : 'Упоминание: никого не нашли';
        if (this.status.textContent !== said) this.status.textContent = said;
    }
    open() {
        if (!this.opened) {
            this.opened = true;
            if (!this.fallback) try { this.popup.showPopover(); } catch { this.fallback = true; }
        }
        this.position();
    }
    close() {
        this.range = null;
        if (!this.opened) return;
        this.opened = false;
        this.status.textContent = '';
        this.input.removeAttribute('aria-activedescendant');
        if (this.fallback) this.popup.style.display = 'none'; else try { this.popup.hidePopover(); } catch { this.popup.style.display = 'none'; }
    }
    position() {
        if (!this.range) return;
        const view = this.input.ownerDocument.defaultView, point = caretPoint(this.input, this.range.start), gap = 4;
        const width = Math.min(280, view.innerWidth - 16), height = Math.min(320, this.popup.scrollHeight || 240);
        let top = point.y + point.line + gap;
        if (top + height > view.innerHeight - 8 && point.y - height - gap > 8) top = point.y - height - gap;
        const left = Math.max(8, Math.min(point.x - 8, view.innerWidth - width - 8));
        this.popup.style.cssText = `left:${left}px;top:${Math.max(8, top)}px;width:${width}px;max-height:${Math.max(120, Math.min(320, view.innerHeight - Math.max(8, top) - 8))}px;${this.fallback ? 'display:block;' : ''}`;
    }
    move(step) {
        const n = this.matches.length;
        if (!n) return;
        this.active = (this.active + step + n) % n;
        this.render();
        this.list.querySelector('.is-active')?.scrollIntoView?.({block: 'nearest'});
    }
    onKey(event) {
        if (!this.isOpen || event.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.move(event.key === 'ArrowDown' ? 1 : -1); return; }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
        if ((event.key === 'Enter' || event.key === 'Tab') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && this.matches.length) {
            event.preventDefault(); event.stopPropagation(); this.choose(this.active);
            return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) this.close();
    }
    /** Replaces «@query» with the member's token and a space. */
    choose(index) {
        const member = this.matches[index], range = this.range, input = this.input;
        if (!member || !range) return;
        const after = input.value.slice(range.end, range.end + 1), text = mentionToken(member) + (after && /\s/.test(after) ? '' : ' ');
        this.close();
        if (input.maxLength >= 0 && input.value.length - (range.end - range.start) + text.length > input.maxLength) return;
        input.focus({preventScroll: true});
        input.setSelectionRange(range.start, range.end);
        let inserted = false;
        try { inserted = input.ownerDocument.execCommand('insertText', false, text); } catch { inserted = false; }
        if (!inserted || input.value.slice(range.start, range.start + text.length) !== text) {
            input.setRangeText(text, range.start, Math.max(range.start, input.selectionEnd), 'end');
            input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text}));
        }
        this.close();
        input.dispatchEvent(new CustomEvent('iq-mention', {bubbles: true, composed: true, detail: {id: member.id, name: member.name}}));
    }
    destroy() {
        this.close();
        this.events.abort();
        this.popup.remove();
        this.status.remove();
        for (const name of ['aria-autocomplete', 'aria-controls', 'aria-activedescendant']) this.input.removeAttribute(name);
    }
}
function attachMentionAutocomplete(input, options) { return new MentionAutocomplete(input, options); }
Object.assign(exports, {MentionAutocomplete, attachMentionAutocomplete});
