'use strict';
/** Wave 0 regressions: MOT-02 (optimistic drop commit), ENG-05 (Popover API guard), ENG-08 (no CDN pdf.js). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const modulesDir = path.join(__dirname, '..', 'src', 'modules');

// ---------------------------------------------------------------------------------------------
// Minimal DOM stub: enough of Element/Document for board-motion.js, IqMenu and IqFilePreview.
// ---------------------------------------------------------------------------------------------
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const log = [];
class FakeAnimation {
  constructor(target, keyframes, options) {
    this.target = target; this.keyframes = keyframes; this.options = options; this.playState = 'running';
    this.finished = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.finished.catch(() => {});
  }
  finish() { if (this.playState === 'running') { this.playState = 'finished'; this.resolve(this); } }
  cancel() { if (this.playState === 'running') { this.playState = 'idle'; this.reject(new DOMException('Aborted', 'AbortError')); } }
}
function closingParen(text, open) { let depth = 0; for (let i = open; i < text.length; i++) { if (text[i] === '(') depth++; else if (text[i] === ')' && --depth === 0) return i; } throw new Error('Unbalanced selector ' + text); }
function matchesSimple(el, selector) {
  let rest = selector.trim();
  const tag = /^[a-zA-Z][\w-]*/.exec(rest);
  if (tag) { if (el.tagName !== tag[0].toUpperCase()) return false; rest = rest.slice(tag[0].length); }
  while (rest) {
    if (rest[0] === '.') { const m = /^\.([\w-]+)/.exec(rest); if (!el.classList.contains(m[1])) return false; rest = rest.slice(m[0].length); }
    else if (rest[0] === '[') { const m = /^\[([\w-]+)(?:=("?)([^\]"]*)\2)?\]/.exec(rest); if (!el.hasAttribute(m[1])) return false; if (m[3] !== undefined && el.getAttribute(m[1]) !== m[3]) return false; rest = rest.slice(m[0].length); }
    else if (rest.startsWith(':not(')) { const end = closingParen(rest, 4); if (matchesSelector(el, rest.slice(5, end))) return false; rest = rest.slice(end + 1); }
    else if (rest.startsWith(':disabled')) { if (!el.disabled) return false; rest = rest.slice(9); }
    else if (rest.startsWith(':popover-open')) { if (!el.popoverOpen) return false; rest = rest.slice(13); }
    else throw new Error('Unsupported selector in stub: ' + selector);
  }
  return true;
}
const splitTop = s => { const out = []; let depth = 0, start = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; else if (s[i] === ',' && !depth) { out.push(s.slice(start, i)); start = i + 1; } } out.push(s.slice(start)); return out; };
const matchesSelector = (el, selector) => splitTop(selector).some(part => matchesSimple(el, part));
class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this.listeners = new Map();
    this.style = {}; this.text = ''; this.hidden = false; this.inert = false; this.disabled = false; this.tabIndex = 0; this.scrollTop = 0; this.rect = null; this.popoverOpen = false;
    const self = this;
    this.classList = { add: (...c) => c.forEach(x => self.classes.add(x)), remove: (...c) => c.forEach(x => self.classes.delete(x)), contains: c => self.classes.has(c), toggle(c, force) { const on = force === undefined ? !self.classes.has(c) : !!force; on ? self.classes.add(c) : self.classes.delete(c); return on; } };
    this.classes = new Set();
    this.dataset = new Proxy({}, { get: (_, k) => self.attrs.get('data-' + kebab(String(k))), set: (_, k, v) => { self.attrs.set('data-' + kebab(String(k)), String(v)); return true; }, has: (_, k) => self.attrs.has('data-' + kebab(String(k))), deleteProperty: (_, k) => self.attrs.delete('data-' + kebab(String(k))) });
  }
  get className() { return [...this.classes].join(' '); } set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get id() { return this.attrs.get('id') || ''; } set id(v) { this.attrs.set('id', String(v)); }
  get role() { return this.attrs.get('role'); } set role(v) { this.attrs.set('role', String(v)); }
  get textContent() { return this.text + this.childNodes.map(c => c.textContent).join(''); } set textContent(v) { this.text = String(v); this.childNodes.splice(0).forEach(c => c.parentNode = null); }
  get innerHTML() { return this.html || ''; } set innerHTML(v) { this.html = String(v); this.childNodes.splice(0).forEach(c => c.parentNode = null); }
  get outerHTML() { return `<${this.tagName.toLowerCase()}>${this.innerHTML}</${this.tagName.toLowerCase()}>`; }
  get children() { return [...this.childNodes]; }
  get parentElement() { return this.parentNode && this.parentNode.tagName !== '#DOCUMENT' ? this.parentNode : null; }
  get firstElementChild() { return this.childNodes[0] || null; }
  get nextElementSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
  get previousElementSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) - 1] || null; }
  get isConnected() { let n = this; while (n) { if (n.tagName === '#DOCUMENT') return true; n = n.parentNode; } return false; }
  get offsetWidth() { return this.rect?.width || 0; } get offsetHeight() { return this.rect?.height || 0; }
  setAttribute(k, v) { if (k === 'class') this.className = v; else this.attrs.set(k, String(v)); } getAttribute(k) { if (k === 'class') return this.className; return this.attrs.has(k) ? this.attrs.get(k) : null; } hasAttribute(k) { return k === 'class' ? this.classes.size > 0 : this.attrs.has(k); } removeAttribute(k) { if (k === 'class') this.classes.clear(); else this.attrs.delete(k); }
  append(...nodes) { for (const n of nodes) { n.remove(); n.parentNode = this; this.childNodes.push(n); } }
  prepend(...nodes) { for (const n of nodes.reverse()) { n.remove(); n.parentNode = this; this.childNodes.unshift(n); } }
  before(node) { this.parentNode.insertBefore(node, this); }
  insertBefore(node, ref) { if (!ref) { this.append(node); return node; } node.remove(); node.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, node); return node; }
  remove() { if (this.parentNode) { const list = this.parentNode.childNodes; list.splice(list.indexOf(this), 1); this.parentNode = null; } }
  contains(node) { let n = node; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  matches(selector) { return matchesSelector(this, selector); }
  closest(selector) { let n = this; while (n && n.tagName !== '#DOCUMENT') { if (n.matches(selector)) return n; n = n.parentNode; } return null; }
  *descendants() { for (const c of this.childNodes) { yield c; yield* c.descendants(); } }
  querySelectorAll(selector) { return [...this.descendants()].filter(n => n.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, width: 0, height: 0 }; return { ...r, right: r.left + r.width, bottom: r.top + r.height }; }
  animate(keyframes, options) { const a = new FakeAnimation(this, keyframes, options); log.push({ kind: 'animate', target: this, animation: a }); return a; }
  getAnimations() { return []; }
  scrollIntoView() {} scrollBy() {}
  focus() { document.activeElement = this; }
  addEventListener(type, fn, opts = {}) { if (opts.signal?.aborted) return; const entry = { fn, opts }; if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(entry); opts.signal?.addEventListener('abort', () => this.removeEventListener(type, fn), { once: true }); }
  removeEventListener(type, fn) { const list = this.listeners.get(type); if (list) this.listeners.set(type, list.filter(e => e.fn !== fn)); }
  dispatch(type, props = {}) {
    const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...props };
    for (const { fn } of [...(this.listeners.get(type) || [])]) { if (event.stopped) break; fn(event); }
    return event;
  }
  dispatchEvent(event) { return !this.dispatch(event.type, { detail: event.detail }).defaultPrevented; }
}
const document = new El('#document');
document.body = new El('body'); document.documentElement = new El('html'); document.append(document.documentElement); document.documentElement.append(document.body);
document.createElement = tag => new El(tag);
document.elementFromPoint = () => null;
document.hidden = false;
document.activeElement = null;
const window = new El('#window');
let reducedMotion = false, rafQueue = [];
Object.assign(global, {
  HTMLElement: El, document, window, innerWidth: 1200, innerHeight: 800,
  matchMedia: () => ({ matches: reducedMotion }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => {},
});
const runFrame = () => { const queue = rafQueue.splice(0); queue.forEach(fn => fn()); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const { bindBoard } = require('../src/modules/board-motion.js');
const { IqMenu } = require('../src/modules/components.js');
const { IqFilePreview, configurePDFPreviews } = require('../src/modules/media.js');

// ---------------------------------------------------------------------------------------------
// MOT-02: the drop is committed at release; the landing animation is purely visual.
// ---------------------------------------------------------------------------------------------
const el = (tag, attrs = {}) => { const n = new El(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
function card(id, top) {
  const c = el('article', { class: 'task-card', 'data-drag-id': id });
  const key = el('span', { class: 'task-card-id' }); key.textContent = id;
  const title = el('button', { class: 'task-card-title' }); title.textContent = 'Задача ' + id;
  const handle = el('button', { 'data-drag-handle': '' });
  c.append(key, title, handle);
  c.rect = { left: 20, top, width: 240, height: 80 };
  return c;
}
function buildBoard() {
  log.length = 0; rafQueue = []; reducedMotion = false; document.hidden = false;
  const board = el('div', { class: 'iq-board' });
  board.rect = { left: 0, top: 0, width: 1200, height: 800 };
  const columns = ['todo', 'done'].map((status, i) => {
    const col = el('section', { 'data-drop-status': status }); col.rect = { left: 300 * i, top: 0, width: 300, height: 800 };
    const heading = el('h3'); heading.textContent = status;
    const list = el('div', { 'data-column-cards': '' });
    col.append(heading, list); board.append(col);
    return { col, list };
  });
  columns[0].list.append(card('t1', 40), card('t2', 140));
  columns[1].list.append(card('t3', 40));
  document.body.append(board);
  const drops = [];
  const handle = id => board.querySelector(`[data-drag-id=${id}]`).querySelector('[data-drag-handle]');
  return { board, columns, drops, handle, live: () => board.querySelector('.sr-only').textContent };
}
/** Keyboard drag of t1 into the "done" column, up to (not including) the release. */
function keyboardDragToDone(fixture, onDrop) {
  const { board, drops } = fixture;
  const dispose = bindBoard(board, detail => { drops.push(detail); log.push({ kind: 'drop', detail }); onDrop?.(detail); });
  board.dispatch('keydown', { key: ' ', target: fixture.handle('t1') });
  assert.ok(board.classList.contains('is-dragging'));
  board.dispatch('keydown', { key: 'ArrowRight', target: board });
  assert.equal(board.querySelector('.iq-board-placeholder').closest('[data-drop-status]').dataset.dropStatus, 'done');
  return dispose;
}
const overlay = () => document.body.children.find(n => n.classList.contains('iq-drag-overlay')) || null;
const landingAnimation = () => log.find(e => e.kind === 'animate' && e.target.classList.contains('iq-drag-overlay'))?.animation;
function cleanup(fixture, dispose) { dispose?.(); fixture.board.remove(); overlay()?.remove(); }

test('MOT-02: onDrop fires synchronously at release, before the landing animation starts', () => {
  const fixture = buildBoard();
  const dispose = keyboardDragToDone(fixture);
  fixture.board.dispatch('keydown', { key: 'Enter', target: fixture.board });
  assert.equal(fixture.drops.length, 1);
  assert.deepEqual(fixture.drops[0], { id: 't1', status: 'done', beforeId: null, keyboard: true });
  const dropAt = log.findIndex(e => e.kind === 'drop'), animateAt = log.findIndex(e => e.kind === 'animate' && e.target.classList.contains('iq-drag-overlay'));
  assert.ok(animateAt > dropAt, `onDrop (${dropAt}) must precede the landing animate() call (${animateAt})`);
  assert.equal(landingAnimation().playState, 'running', 'the landing is still in flight after the commit');
  // The drag state is already gone: the board is clean while the overlay lands.
  assert.equal(fixture.board.classList.contains('is-dragging'), false);
  assert.equal(fixture.board.querySelector('.iq-board-placeholder'), null);
  assert.equal(fixture.board.querySelector('.is-drag-source'), null);
  assert.equal(document.body.classList.contains('iq-board-dragging'), false);
  assert.ok(overlay(), 'the overlay outlives the drag state for the visual landing');
  cleanup(fixture, dispose);
});

test('MOT-02: Escape during the landing window keeps the committed drop and only ends the visual', () => {
  const fixture = buildBoard();
  let landed;
  const dispose = keyboardDragToDone(fixture, detail => {
    // A host that re-renders synchronously (like Sprintique) already shows the card at its new place.
    landed = fixture.board.querySelector(`[data-drag-id=${detail.id}]`); fixture.columns[1].list.append(landed); landed.rect = { left: 320, top: 140, width: 240, height: 80 };
  });
  fixture.board.dispatch('keydown', { key: 'Enter', target: fixture.board });
  assert.equal(fixture.drops.length, 1);
  assert.equal(landed.style.visibility, 'hidden', 'the landed card stays invisible until the overlay arrives');
  const anim = landingAnimation();
  assert.deepEqual(anim.keyframes.at(-1).transform, 'translate3d(320px,140px,0) rotate(0)', 'the overlay flies to the card\'s new rect');
  window.dispatch('keydown', { key: 'Escape', target: fixture.board });
  assert.equal(fixture.drops.length, 1, 'Escape must not add or revoke a drop');
  assert.equal(anim.playState, 'finished', 'the landing jumps to its end state');
  assert.equal(overlay(), null, 'the overlay is gone');
  assert.equal(landed.style.visibility, '', 'the card is revealed at its new place');
  assert.equal(landed.parentNode, fixture.columns[1].list, 'no FLIP back to the source column');
  assert.notEqual(fixture.live(), 'Перемещение отменено.');
  cleanup(fixture, dispose);
});

test('MOT-02: visibilitychange and dispose during the landing keep the drop', () => {
  for (const interrupt of ['visibility', 'dispose']) {
    const fixture = buildBoard();
    const dispose = keyboardDragToDone(fixture);
    fixture.board.dispatch('keydown', { key: 'Enter', target: fixture.board });
    assert.equal(fixture.drops.length, 1);
    if (interrupt === 'visibility') { document.hidden = true; document.dispatch('visibilitychange'); document.hidden = false; }
    else dispose();
    assert.equal(fixture.drops.length, 1, interrupt + ': the drop survives');
    assert.equal(overlay(), null, interrupt + ': the overlay is removed');
    assert.equal(fixture.board.querySelector('.is-drag-source'), null);
    cleanup(fixture, interrupt === 'visibility' ? dispose : null);
  }
});

test('MOT-02: the landing that finishes on its own reveals the card and removes the overlay', async () => {
  const fixture = buildBoard();
  let landed;
  const dispose = keyboardDragToDone(fixture, detail => { landed = fixture.board.querySelector(`[data-drag-id=${detail.id}]`); landed.rect = { left: 320, top: 140, width: 240, height: 80 }; });
  fixture.board.dispatch('keydown', { key: 'Enter', target: fixture.board });
  const anim = landingAnimation();
  assert.equal(landed.style.visibility, 'hidden');
  anim.finish();
  await tick();
  assert.equal(landed.style.visibility, '');
  assert.equal(overlay(), null);
  assert.equal(fixture.drops.length, 1);
  cleanup(fixture, dispose);
});

test('MOT-02: Escape before release still cancels the keyboard drag without a drop', () => {
  const fixture = buildBoard();
  const dispose = keyboardDragToDone(fixture);
  window.dispatch('keydown', { key: 'Escape', target: fixture.board });
  assert.equal(fixture.drops.length, 0);
  assert.equal(fixture.live(), 'Перемещение отменено.');
  assert.equal(fixture.board.querySelector('.iq-board-placeholder'), null);
  assert.equal(fixture.board.querySelector('.is-drag-source'), null);
  assert.equal(fixture.board.querySelector('[data-drag-id=t1]').parentNode, fixture.columns[0].list);
  cleanup(fixture, dispose);
});

test('MOT-02: reduced motion commits synchronously with no overlay animation', () => {
  const fixture = buildBoard();
  reducedMotion = true;
  const dispose = keyboardDragToDone(fixture);
  fixture.board.dispatch('keydown', { key: 'Enter', target: fixture.board });
  assert.equal(fixture.drops.length, 1);
  assert.equal(landingAnimation(), undefined);
  assert.equal(overlay(), null);
  cleanup(fixture, dispose);
});

test('MOT-02: a pointer drop commits at pointerup and swallows exactly one follow-up click', () => {
  const fixture = buildBoard();
  const { board, columns, drops } = fixture;
  const dispose = bindBoard(board, detail => { drops.push(detail); log.push({ kind: 'drop', detail }); });
  const t1 = board.querySelector('[data-drag-id=t1]');
  document.elementFromPoint = () => columns[1].col;
  board.dispatch('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 60, target: t1.querySelector('.task-card-title') });
  window.dispatch('pointermove', { pointerId: 1, clientX: 400, clientY: 60 });
  assert.ok(board.classList.contains('is-dragging'));
  runFrame();
  assert.equal(board.querySelector('.iq-board-placeholder').closest('[data-drop-status]').dataset.dropStatus, 'done');
  window.dispatch('pointerup', { pointerId: 1, clientX: 400, clientY: 60 });
  assert.equal(drops.length, 1);
  assert.deepEqual(drops[0], { id: 't1', status: 'done', beforeId: 't3', keyboard: false });
  assert.equal(landingAnimation().playState, 'running');
  const first = board.dispatch('click', { target: t1.querySelector('.task-card-title') });
  assert.equal(first.defaultPrevented, true, 'the click synthesised from the releasing pointerup is swallowed');
  const second = board.dispatch('click', { target: t1.querySelector('.task-card-title') });
  assert.equal(second.defaultPrevented, false, 'the guard is one-shot: the next click goes through');
  document.elementFromPoint = () => null;
  cleanup(fixture, dispose);
});

test('MOT-02 source: onDrop is invoked before the landing animate() and never inside a finished callback', () => {
  const source = fs.readFileSync(path.join(modulesDir, 'board-motion.js'), 'utf8');
  const finish = source.slice(source.indexOf('function finish()'), source.indexOf("on(board, 'pointerdown'"));
  assert.ok(finish.indexOf('onDrop(detail)') < finish.indexOf('ghost.animate('), 'onDrop must precede the landing animation');
  assert.doesNotMatch(finish, /finished\.then\([^)]*onDrop/, 'onDrop must not wait for the animation');
});

// ---------------------------------------------------------------------------------------------
// ENG-05: Popover API guard.
// ---------------------------------------------------------------------------------------------
function buildMenu(popupExtras = {}) {
  const menu = new IqMenu('iq-menu');
  const trigger = el('button'); trigger.textContent = 'Действия'; trigger.rect = { left: 500, top: 100, width: 120, height: 36 };
  const popup = el('div', { 'data-menu': '' }); popup.rect = { left: 0, top: 0, width: 224, height: 120 };
  const item = el('button'); item.textContent = 'Открыть'; popup.append(item);
  Object.assign(popup, popupExtras);
  menu.append(trigger, popup);
  document.body.append(menu);
  menu.connectedCallback();
  return { menu, trigger, popup, item };
}

test('ENG-05: iq-menu opens and closes without the Popover API instead of throwing', () => {
  reducedMotion = true;
  const { menu, trigger, popup, item } = buildMenu();
  assert.equal(typeof popup.showPopover, 'undefined', 'the stub models Safari 16 / Firefox < 125');
  assert.equal(popup.hidden, true, 'the light-DOM fallback keeps the closed menu hidden');
  assert.doesNotThrow(() => menu.open());
  assert.equal(popup.hidden, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, item, 'the first item receives focus');
  assert.match(popup.style.left, /px$/);
  assert.doesNotThrow(() => menu.close());
  assert.equal(popup.hidden, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  menu.disconnectedCallback(); menu.remove();
});

test('ENG-05: iq-menu uses showPopover/hidePopover when the engine has them', () => {
  reducedMotion = true;
  const calls = [];
  const { menu, popup } = buildMenu({ showPopover() { calls.push('show'); this.popoverOpen = true; }, hidePopover() { calls.push('hide'); this.popoverOpen = false; } });
  assert.equal(popup.hidden, false, 'no [hidden] fallback when the UA hides [popover] itself');
  menu.open(); menu.open();
  assert.deepEqual(calls, ['show'], 'an already open popover is not shown twice');
  menu.close();
  assert.deepEqual(calls, ['show', 'hide']);
  assert.equal(popup.hidden, false, 'a supporting engine never relies on [hidden]');
  menu.disconnectedCallback(); menu.remove();
});

test('ENG-05 source: every showPopover/hidePopover call in src/modules is feature-guarded', () => {
  const offenders = [];
  for (const file of fs.readdirSync(modulesDir).filter(f => f.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(modulesDir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\.(show|hide)Popover\s*\(/.test(line)) return;
      // Guarded: a feature check on the same line, or a `try {` opening within the three preceding lines
      // (the hasPopoverAPI helpers wrap the call in `if (!el.matches(':popover-open'))` inside a try).
      const previous = lines.slice(Math.max(0, i - 3), i).map(l => l.trim()).filter(Boolean);
      const guarded = /typeof\s+\S+\.(show|hide)Popover|hasPopoverAPI\(|\.(show|hide)Popover\s*&&|'(show|hide)Popover'\s+in\s|try\s*\{/.test(line) || previous.some(l => /^try\s*\{?$/.test(l));
      if (!guarded) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------------------------
// ENG-08: no remote pdf.js by default.
// ---------------------------------------------------------------------------------------------
test('ENG-08 source: no module loads code from cdn.jsdelivr.net or any other remote script URL', () => {
  const offenders = [];
  for (const file of fs.readdirSync(modulesDir).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(modulesDir, file), 'utf8');
    if (source.includes('cdn.jsdelivr.net')) offenders.push(file + ': cdn.jsdelivr.net');
    if (/import\(\s*['"`]https?:/.test(source)) offenders.push(file + ': remote import()');
  }
  assert.deepEqual(offenders, []);
});

function previewHost() {
  const host = new El('iq-file-preview');
  const button = el('button'); const loading = el('span', { class: 'preview-loading' }); button.append(loading); host.append(button);
  host.source = { name: 'report.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(0) };
  return { host, button };
}

test('ENG-08: without configuration a PDF preview falls back to the placeholder tile, fetching nothing', async () => {
  configurePDFPreviews(null);
  const { host, button } = previewHost();
  await assert.rejects(IqFilePreview.prototype.renderPreview.call(host, new AbortController().signal), /not configured/);
  assert.equal(host.dataset.state, 'unavailable');
  assert.match(button.title, /модуль просмотра/);
  assert.ok(host.querySelector('.preview-loading'), 'the placeholder icon stays in place');
});

test('ENG-08: a host renderer is used for the thumbnail', async () => {
  const seen = [];
  configurePDFPreviews(async (file, canvas) => { seen.push(file.name, canvas.tagName); });
  const { host, button } = previewHost();
  await IqFilePreview.prototype.renderPreview.call(host, new AbortController().signal);
  assert.deepEqual(seen, ['report.pdf', 'CANVAS']);
  assert.equal(host.dataset.state, 'ready');
  assert.equal(button.children[0].tagName, 'CANVAS');
  configurePDFPreviews(null);
});

test('ENG-08: a self-hosted pdfjsUrl is loaded from exactly that URL', async () => {
  configurePDFPreviews({ pdfjsUrl: '/vendor/pdfjs/pdf.min.mjs' });
  const { host } = previewHost();
  await assert.rejects(IqFilePreview.prototype.renderPreview.call(host, new AbortController().signal), e => { assert.match(String(e.message), /\/vendor\/pdfjs\/pdf\.min\.mjs/); assert.doesNotMatch(String(e.message), /jsdelivr/); return true; });
  assert.equal(host.dataset.state, 'unavailable');
  configurePDFPreviews(null);
});
