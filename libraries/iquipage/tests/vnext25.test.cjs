'use strict';
/** Contracts for 0.6.0-vnext.25 (Sprintique release 1.0): a pasted link becomes Markdown (SPR-5) and toasts leave on
 *  their own (SPR-8). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const { markdownPasteLink: paste, safeMarkdown } = require('../src/modules/markdown.js');

// ---- SPR-5: pasted links -------------------------------------------------------------------------------------------

test('SPR-5: a bare link pasted at a caret becomes an autolink whose text is the URL', () => {
  assert.deepEqual(paste('См. ', 4, 4, 'https://example.com/a_b?x=1&y=2'), { text: '<https://example.com/a_b?x=1&y=2>', start: 4, end: 4 });
  assert.deepEqual(paste('', 0, 0, '  http://intra.example/wiki  \n'), { text: '<http://intra.example/wiki>', start: 0, end: 0 });
  assert.deepEqual(paste('', 0, 0, 'mailto:team@example.com'), { text: '<mailto:team@example.com>', start: 0, end: 0 });
  const html = safeMarkdown('См. ' + paste('См. ', 4, 4, 'https://example.com/a_b').text);
  assert.match(html, /<a href="https:\/\/example.com\/a_b" target="_blank"[^>]*>https:\/\/example.com\/a_b<\/a>/);
});

test('SPR-5: a link pasted over a selection wraps it as [text](url)', () => {
  assert.deepEqual(paste('Читайте docs здесь', 8, 12, 'https://example.com/docs'), { text: '[docs](https://example.com/docs)', start: 8, end: 12 });
  // Brackets in the selection and parentheses in the URL are escaped, so the link still parses.
  const wrapped = paste('a [b] c', 0, 7, 'https://en.wikipedia.org/wiki/Link_(disambiguation)');
  assert.equal(wrapped.text, '[a \\[b\\] c](https://en.wikipedia.org/wiki/Link_\\(disambiguation\\))');
  assert.match(safeMarkdown(wrapped.text), /<a href="https:\/\/en.wikipedia.org\/wiki\/Link_\(disambiguation\)"[^>]*>a \[b\] c<\/a>/);
  assert.match(safeMarkdown(paste('почта', 0, 5, 'mailto:me@example.com').text), /<a href="mailto:me@example.com" rel="noopener noreferrer">почта<\/a>/);
  // A reversed range is the same selection.
  assert.deepEqual(paste('abc', 3, 0, 'https://e.com'), { text: '[abc](https://e.com)', start: 0, end: 3 });
});

test('SPR-5: ordinary text and unsafe or unsupported links paste unchanged', () => {
  for (const text of ['просто текст', 'https://example.com and more', 'see https://example.com', 'javascript:alert(1)', 'data:text/html,x',
    'ftp://example.com/x', '//example.com', 'https://user:pass@example.com', 'mailto:nobody', 'https://x.com/\u0000', '', null,
    'https://' + 'a'.repeat(2050) + '.com'])
    assert.equal(paste('abc', 1, 1, text), null, JSON.stringify(text));
});

test('SPR-5: inside code, inside a link destination, over a link or across paragraphs the paste stays plain', () => {
  assert.equal(paste('```\ncode ', 9, 9, 'https://e.com'), null, 'inside a fenced block');
  assert.notEqual(paste('```\ncode\n```\n', 13, 13, 'https://e.com'), null, 'after a closed fence');
  assert.equal(paste('текст `код ', 11, 11, 'https://e.com'), null, 'inside inline code');
  assert.equal(paste('[docs](', 7, 7, 'https://e.com'), null, 'typing a link destination');
  assert.equal(paste('<', 1, 1, 'https://e.com'), null, 'typing an autolink');
  assert.equal(paste('old https://old.example', 4, 23, 'https://new.example'), null, 'replacing a URL with a URL');
  assert.equal(paste('one\n\ntwo', 0, 8, 'https://e.com'), null, 'a selection across paragraphs');
  assert.equal(paste('- one\n- two', 0, 11, 'https://e.com'), null, 'a selection across list items');
  assert.equal(paste('a `code` b', 0, 5, 'https://e.com'), null, 'a selection that cuts a code span');
});

test('SPR-5: an existing link keeps its structure (review R1)', () => {
  const s = 'see [docs](https://a.com) x';
  assert.equal(paste(s, 5, 9, 'https://e.com'), null, 'the label of a link');
  assert.equal(paste(s, 4, 25, 'https://e.com'), null, 'a whole link');
  assert.equal(paste(s, 4, 8, 'https://e.com'), null, 'half of a link');
  assert.equal(paste(s, 16, 16, 'https://e.com'), null, 'a caret in a destination');
  assert.equal(paste('a <https://a.com> b', 2, 17, 'https://e.com'), null, 'an autolink');
  assert.equal(paste('a <https://a.co', 15, 15, 'https://e.com'), null, 'a caret in an autolink');
  assert.notEqual(paste(s, 27, 27, 'https://e.com'), null, 'after a closed link');
  assert.notEqual(paste('- [ ] пункт', 6, 11, 'https://e.com'), null, 'a checklist item text');
});

test('SPR-5: offsets follow the source as given, and a trailing backslash cannot escape the bracket (review R1)', () => {
  assert.deepEqual(paste('a\r\nb\r\nc ', 7, 7, 'https://e.com'), { text: '<https://e.com>', start: 7, end: 7 });
  const tail = paste('word\\', 0, 5, 'https://e.com');
  assert.equal(tail.text, '[word\\\\](https://e.com)');
  assert.match(safeMarkdown(tail.text), /<a href="https:\/\/e.com\/"[^>]*>word\\<\/a>/);
});

/** A textarea as far as pasteLink needs one. */
function field(value, start, end = start, { maxLength = -1, execCommand = () => false } = {}) {
  const events = [];
  const input = {
    value, selectionStart: start, selectionEnd: end, maxLength, disabled: false, readOnly: false,
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    setRangeText(text, a, b, mode) { this.value = this.value.slice(0, a) + text + this.value.slice(b); if (mode === 'end') this.selectionStart = this.selectionEnd = a + text.length; },
    dispatchEvent(event) { events.push(event); return true; },
    events
  };
  input.ownerDocument = { activeElement: input, execCommand: (...args) => execCommand(input, ...args) };
  return input;
}
const clipboard = text => ({ defaultPrevented: false, clipboardData: { getData: type => type === 'text/plain' ? text : '' }, preventDefault() { this.defaultPrevented = true; } });

test('SPR-5: pasteLink edits the field through one input event, so undo reverts it in one step', () => {
  global.HTMLElement = global.HTMLElement || class {};
  global.InputEvent = global.InputEvent || class { constructor(type, init) { Object.assign(this, { type }, init); } };
  const { pasteLink } = require('../src/modules/editor.js');
  // The browser's own insertText: one native undo step and one input event.
  const calls = [];
  const native = field('Читайте docs', 8, 12, { execCommand: (input, command, _ui, text) => { calls.push(command); input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end'); return true; } });
  const event = clipboard('https://example.com/docs');
  assert.equal(pasteLink(native, event), true);
  assert.ok(event.defaultPrevented);
  assert.deepEqual(calls, ['insertText']);
  assert.equal(native.value, 'Читайте [docs](https://example.com/docs)');
  // Without insertText the fallback replaces the range and announces exactly one input event.
  const fallback = field('См. ', 4);
  assert.equal(pasteLink(fallback, clipboard('https://example.com')), true);
  assert.equal(fallback.value, 'См. <https://example.com>');
  assert.equal(fallback.selectionStart, fallback.value.length, 'the caret lands after the link');
  assert.equal(fallback.events.length, 1);
  assert.equal(fallback.events[0].inputType, 'insertFromPaste');
  // Plain text, a read-only field and a link that would overflow maxlength keep the browser's own paste.
  for (const [input, text] of [[field('abc', 3), 'plain words'], [Object.assign(field('abc', 3), { readOnly: true }), 'https://e.com'], [field('abc', 3, 3, { maxLength: 10 }), 'https://example.com']]) {
    const e = clipboard(text);
    assert.equal(pasteLink(input, e), false);
    assert.equal(e.defaultPrevented, false);
  }
});

test('SPR-5: the Markdown editor and the map text editor both route paste through pasteLink', () => {
  const editor = read('src/modules/editor.js'), studio = read('src/modules/whiteboard-studio.js');
  assert.ok(editor.includes(`this.listen(this.input, 'paste', event => { if (!this.disabled && !this.readOnly) pasteLink(this.input, event); });`));
  assert.ok(editor.includes(`execCommand('insertText', false, link.text)`));
  assert.ok(studio.includes('input.onpaste=e=>{if(!this.locked)pasteLink(input,e);};'));
});

// ---- SPR-8: toasts leave on their own ------------------------------------------------------------------------------

/** Just enough DOM for notify(): the region, the live nodes, the toast and its two buttons. */
function fakeDocument() {
  class Node {
    get isConnected() { let node = this; while (node.parent) node = node.parent; return node.tagName === 'BODY'; }
    focus() { documentRef.activeElement = this; }
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.parent = null; this.hovered = false; this.textContent = ''; this.className = ''; this.id = ''; }
    get classList() { const node = this; return { add: name => { node.className = (node.className + ' ' + name).trim(); }, contains: name => node.className.split(/\s+/).includes(name) }; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
    set innerHTML(html) {
      this.children = [];
      if (html.includes('iq-toast-action')) { const action = new Node('button'); action.className = 'iq-toast-action'; this.append(action); }
      if (html.includes('Закрыть уведомление')) { const close = new Node('button'); close.className = 'iq-btn'; this.append(close); }
    }
    *walk() { for (const child of this.children) { yield child; yield* child.walk(); } }
    querySelector(selector) {
      const match = /^(?:#([\w-]+))?(?:\.([\w-]+))?(?:\[role="(\w+)"\])?$/.exec(selector);
      for (const node of this.walk()) if ((!match[1] || node.id === match[1]) && (!match[2] || node.className.split(/\s+/).includes(match[2])) && (!match[3] || node.attributes.role === match[3])) return node;
      return null;
    }
    matches(selector) { return selector === ':hover' ? this.hovered : false; }
    contains(node) { for (; node; node = node.parent) if (node === this) return true; return false; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    removeEventListener(type, listener) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== listener); }
    fire(type, init = {}) { const event = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...init }; for (const listener of [...(this.listeners[type] || [])]) listener(event); return event; }
  }
  let documentRef = null;
  const body = new Node('body');
  const document = Object.assign(new Node('#document'), { body, activeElement: null, hidden: false, documentElement: Object.assign(new Node('html'), { dataset: {} }), createElement: tag => new Node(tag) });
  document.querySelector = selector => body.querySelector(selector);
  documentRef = document;
  return document;
}

function withToasts(run) {
  return t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const saved = { document: global.document, matchMedia: global.matchMedia };
    global.HTMLElement = global.HTMLElement || class {};
    global.document = fakeDocument();
    global.matchMedia = () => ({ matches: true }); // reduced motion: a leaving toast goes at once
    try {
      const { notify } = require('../src/modules/components.js');
      const toasts = () => global.document.body.querySelector('#iq-toasts').children.filter(node => node.className.startsWith('iq-toast tone') && !node.className.includes('leaving'));
      run({ notify, toasts, document: global.document, tick: ms => t.mock.timers.tick(ms) });
    } finally { global.document = saved.document; global.matchMedia = saved.matchMedia; }
  };
}

test('SPR-8: the timing policy by tone and action', () => {
  global.HTMLElement = global.HTMLElement || class {};
  const { toastDuration, TOAST_DURATION } = require('../src/modules/components.js');
  assert.deepEqual({ ...TOAST_DURATION }, { info: 5000, success: 5000, warning: 8000, danger: 10000, action: 10000 });
  assert.equal(toastDuration({ message: 'x' }), 5000);
  assert.equal(toastDuration({ tone: 'success', message: 'Задача создана' }), 5000);
  assert.equal(toastDuration({ tone: 'warning', message: 'x' }), 8000);
  assert.equal(toastDuration({ tone: 'danger', message: 'x' }), 10000);
  assert.equal(toastDuration({ tone: 'success', message: 'x', action: { label: 'Открыть', run() {} } }), 10000, 'a shortcut action still leaves');
  assert.equal(toastDuration({ tone: 'success', message: 'x', action: { label: 'Отменить', undo: true, run() {} } }), 0, 'an undo window stays until dismissed');
  assert.equal(toastDuration({ message: 'x', duration: 2500 }), 2500);
  assert.equal(toastDuration({ message: 'x', duration: 0 }), 0);
  for (const bad of [-1, NaN, 'soon', Infinity]) assert.equal(toastDuration({ tone: 'warning', message: 'x', duration: bad }), 8000, 'a malformed duration never pins a toast: ' + bad);
  assert.equal(toastDuration({ message: 'x', duration: '2500' }), 2500);
});

test('SPR-8: a confirmation toast disappears by itself after 5 s', withToasts(({ notify, toasts, tick }) => {
  notify({ tone: 'success', message: 'Задача SPR-1 создана', action: { label: 'Открыть', run() {} } });
  notify({ tone: 'success', message: 'Изменения сохранены' });
  assert.equal(toasts().length, 2);
  tick(4999); assert.equal(toasts().length, 2);
  tick(1); assert.equal(toasts().length, 1, 'the plain confirmation left at 5 s');
  tick(5000); assert.equal(toasts().length, 0, 'the toast with «Открыть» left at 10 s');
}));

test('SPR-8: hover, focus and a hidden tab pause the countdown; leaving resumes it', withToasts(({ notify, toasts, document, tick }) => {
  notify({ tone: 'info', message: 'Доступен новый контекст' });
  const toast = toasts()[0];
  tick(3000);
  toast.hovered = true; toast.fire('pointermove', { clientX: 10, clientY: 10 }); toast.fire('pointermove', { clientX: 20, clientY: 12 });
  tick(60000); assert.equal(toasts().length, 1, 'held while hovered');
  toast.hovered = false; toast.fire('pointerleave');
  tick(1999); assert.equal(toasts().length, 1, 'the remaining 2 s continue');
  tick(1); assert.equal(toasts().length, 0);

  notify({ tone: 'info', message: 'Второе' });
  const second = toasts()[0], button = second.querySelector('.iq-btn');
  document.activeElement = button; second.fire('focusin');
  tick(60000); assert.equal(toasts().length, 1, 'held while focused');
  document.activeElement = null; second.fire('focusout', { relatedTarget: null });
  document.hidden = true; document.fire('visibilitychange');
  tick(60000); assert.equal(toasts().length, 1, 'held in a hidden tab');
  document.hidden = false; document.fire('visibilitychange');
  tick(5000); assert.equal(toasts().length, 0);
  assert.equal((document.listeners.visibilitychange || []).length, 0, 'a removed toast stops listening');
}));

test('SPR-8: a toast that appears under a resting pointer still leaves; moving onto it holds it', withToasts(({ notify, toasts, tick }) => {
  // The pointer rests where the drawer's «Создать задачу» was: the new toast is :hover without any movement.
  notify({ tone: 'success', message: 'Задача SPR-2 создана', action: { label: 'Открыть', run() {} } });
  const toast = toasts()[0];
  // Browsers also send synthetic pointermoves at the same spot when layout changes under the pointer.
  toast.hovered = true; toast.fire('pointerenter'); toast.fire('pointerover');
  toast.fire('pointermove', { clientX: 700, clientY: 480 }); toast.fire('pointermove', { clientX: 701, clientY: 480 });
  tick(10000); assert.equal(toasts().length, 0, 'no movement, no pause');
  notify({ tone: 'success', message: 'Ещё одна' });
  const next = toasts()[0];
  next.hovered = true;
  tick(1000); next.fire('pointermove', { clientX: 600, clientY: 470 }); next.fire('pointermove', { clientX: 640, clientY: 475 });
  tick(60000); assert.equal(toasts().length, 1, 'a moving pointer reads it');
  next.hovered = false; next.fire('pointerleave');
  tick(4000); assert.equal(toasts().length, 0, 'the remaining 4 s after leaving');
}));

test('SPR-8: leaving a toast that was never paused keeps the elapsed time (review R1)', withToasts(({ notify, toasts, tick }) => {
  notify({ tone: 'info', message: 'Короткое' });
  const toast = toasts()[0];
  tick(4900);
  toast.hovered = true; toast.fire('pointerenter'); toast.hovered = false; toast.fire('pointerleave');
  tick(100); assert.equal(toasts().length, 0, 'gone at 5 s, not restarted');
}));

test('SPR-8: focus that entered a toast returns where it came from when the toast closes (review R1)', withToasts(({ notify, toasts, document }) => {
  const field = document.createElement('textarea'); document.body.append(field); document.activeElement = field;
  notify({ tone: 'danger', message: 'Ошибка' });
  const toast = toasts()[0], close = toast.querySelector('.iq-btn');
  document.activeElement = close; toast.fire('focusin', { relatedTarget: field });
  toast.fire('keydown', { key: 'Escape' });
  assert.equal(toasts().length, 0);
  assert.equal(document.activeElement, field);
}));

test('SPR-8: undo stays until dismissed; the close button and Escape dismiss; errors are alerts', withToasts(({ notify, toasts, document, tick }) => {
  let undone = 0;
  notify({ tone: 'success', message: 'Задача удалена', action: { label: 'Отменить', undo: true, run: () => { undone++; } } });
  tick(10 * 60000); assert.equal(toasts().length, 1, 'the undo window is open');
  toasts()[0].querySelector('.iq-toast-action').fire('click');
  assert.equal(undone, 1); assert.equal(toasts().length, 0);

  notify({ tone: 'danger', message: 'Не удалось сохранить', description: 'Сеть недоступна' });
  const region = document.body.querySelector('#iq-toasts');
  tick(30);
  assert.equal(region.querySelector('.iq-toast-live[role="alert"]').textContent, 'Не удалось сохранить. Сеть недоступна');
  assert.equal(region.querySelector('.iq-toast-live[role="alert"]').getAttribute('aria-live'), 'assertive');
  const escape = toasts()[0].fire('keydown', { key: 'Escape' });
  assert.ok(escape.defaultPrevented && escape.stopped, 'Escape closes this toast only, not the dialog underneath');
  assert.equal(toasts().length, 0);

  notify({ tone: 'info', message: 'Информация' });
  tick(30);
  assert.equal(region.querySelector('.iq-toast-live[role="status"]').textContent, 'Информация');
  toasts()[0].querySelector('.iq-btn').fire('click');
  assert.equal(toasts().length, 0);
}));
