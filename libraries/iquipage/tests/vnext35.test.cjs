'use strict';
/** Contracts for 0.6.0-vnext.35: action feedback — pending buttons, activity line, slow and offline notices, errors. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---- A small DOM: enough tree, attributes and events for feedback.js. ----
const listeners = new Map();
const on = (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); };
const fire = (type, event = {}) => { for (const fn of listeners.get(type) || []) fn(event); };
class Node {
  constructor(tag = 'div', text = null) { this.tagName = tag.toUpperCase(); this.text = text; this.childNodes = []; this.parentNode = null; this.attrs = new Map(); this.dataset = {}; this.style = { width: '', setProperty() { } }; this.classes = new Set(); this.width = 80; this.contentWidth = 60; }
  get className() { return [...this.classes].join(' '); }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() { const c = this.classes; return { contains: x => c.has(x), add: x => c.add(x), remove: (...x) => x.forEach(y => c.delete(y)), toggle: (x, f) => (f ?? !c.has(x)) ? c.add(x) : c.delete(x) }; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.body || n === doc; }
  get textContent() { return this.text ?? this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) { this.childNodes = []; this.text = String(v); }
  set innerHTML(v) { this.html = v; this.childNodes = []; }
  get innerHTML() { return this.html || ''; }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.childNodes.find(n => n.text === null) || null; }
  append(...nodes) { for (const n of nodes) { n.parentNode?.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1); n.parentNode = this; this.childNodes.push(n); } }
  prepend(n) { this.append(n); this.childNodes.unshift(this.childNodes.pop()); }
  after(n) { const p = this.parentNode; p.append(n); p.childNodes.splice(p.childNodes.indexOf(this) + 1, 0, p.childNodes.pop()); }
  remove() { if (this.parentNode) { this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; } }
  replaceWith(...nodes) { const p = this.parentNode, i = p.childNodes.indexOf(this); this.remove(); for (const n of nodes) { n.parentNode?.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1); n.parentNode = p; } p.childNodes.splice(i, 0, ...nodes); }
  replaceChildren(...nodes) { this.childNodes = []; this.append(...nodes); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  toggleAttribute(k, f) { f ? this.attrs.set(k, '') : this.attrs.delete(k); }
  matches(sel) { return sel.split(',').some(s => s.trim().startsWith('.') ? this.classes.has(s.trim().slice(1)) : this.tagName === s.trim().toUpperCase()); }
  closest(sel) { let n = this; while (n && n.matches) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  querySelector(sel) { for (const c of this.childNodes) { if (c.text !== null) continue; if (sel.startsWith('#') ? c.id === sel.slice(1) : sel.includes('[role="') ? c.classes.has('iq-toast-live') && c.getAttribute('role') === sel.match(/role="(\w+)"/)[1] : c.matches(sel)) return c; const d = c.querySelector(sel); if (d) return d; } return null; }
  querySelectorAll() { return []; }
  addEventListener() { }
  getBoundingClientRect() { return { width: this.width, left: 10, top: 10, bottom: 46 }; }
  get scrollWidth() { return this.contentWidth; }
  get clientWidth() { return this.width; }
  focus() { doc.activeElement = this; }
}
const doc = { body: null, activeElement: null, createElement: tag => new Node(tag), querySelector: sel => doc.body.querySelector(sel), documentElement: { dataset: {} } };
doc.body = new Node('body');
globalThis.document = doc;
globalThis.window = { addEventListener: (type, fn) => on(type, fn) };
globalThis.addEventListener = (type, fn) => on(type, fn);
globalThis.innerWidth = 1440; globalThis.innerHeight = 1000;
globalThis.HTMLElement ??= class { };
const text = value => new Node('#text', value);
const button = (label, { icon = false, cls = '' } = {}) => {
  const b = new Node('button'); b.className = `iq-btn primary ${cls}`;
  if (icon) { const svg = new Node('svg'); svg.className = 'iq-icon'; b.append(svg); }
  if (label) b.append(text(label));
  doc.body.append(b); return b;
};
const feedback = require('../src/modules/feedback.js');
const { pending, isPending, trackActivity, activityState, autoPending, recentFailure, watchConnection, configureFeedback, FEEDBACK_TIMING, actionError, saveIndicator } = feedback;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('the timing ladder: 150 ms pending, 1 s line, 8 s slow notice', () => {
  assert.equal(FEEDBACK_TIMING.pending, 150); assert.equal(FEEDBACK_TIMING.activity, 1000); assert.equal(FEEDBACK_TIMING.slow, 8000);
  assert.deepEqual(configureFeedback({ pending: 'x', slow: -1 }).slow, 8000, 'invalid values are ignored');
});

test('a fast action never shows the pending look (no flicker under 150 ms)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const b = button('Сохранить'), work = deferred();
  const result = pending(b, work.promise);
  assert.equal(b.dataset.pending, 'hold', 'clicks are held at once');
  assert.equal(b.getAttribute('aria-busy'), null);
  t.mock.timers.tick(149);
  assert.equal(b.getAttribute('aria-busy'), null, 'nothing visible before 150 ms');
  work.resolve('ok'); await flush();
  assert.equal(await result, 'ok');
  t.mock.timers.tick(500);
  assert.equal(b.getAttribute('aria-busy'), null); assert.equal(b.dataset.pending, undefined);
  assert.equal(b.childNodes.length, 1, 'content untouched');
});

test('a slow action shows a spinner at the same width with aria-busy, then restores the button exactly', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const b = button('Готово', { icon: true }), work = deferred();
  const result = pending(b, () => work.promise);
  t.mock.timers.tick(150);
  assert.equal(b.getAttribute('aria-busy'), 'true');
  assert.equal(b.style.width, '80px', 'the width is kept');
  assert.equal(b.dataset.pending, 'icon', 'the spinner takes the leading icon\'s place');
  assert.ok(b.childNodes.some(n => n.classes.has('iq-btn-spinner')));
  work.resolve(1); await result;
  assert.equal(b.getAttribute('aria-busy'), null); assert.equal(b.style.width, '');
  assert.deepEqual(b.childNodes.map(n => n.tagName), ['SVG', '#TEXT'], 'original nodes are back in order');
  const plain = button('Готово'), w2 = deferred(); const r2 = pending(plain, w2.promise);
  t.mock.timers.tick(150); assert.equal(plain.dataset.pending, 'overlay', 'without an icon the spinner sits over the label');
  w2.resolve(); await r2;
});

test('no double submit: a second call returns the running work and clicks are swallowed while pending', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const b = button('Создать'), work = deferred();
  let runs = 0;
  const first = pending(b, () => { runs++; return work.promise; });
  const second = pending(b, () => { runs++; return work.promise; });
  assert.equal(runs, 1); assert.equal(first, second);
  let stopped = false;
  fire('click', { target: { closest: () => b }, preventDefault() { }, stopImmediatePropagation() { stopped = true; } });
  assert.ok(stopped, 'the capturing guard stops the click');
  work.resolve(); await first;
  assert.equal(isPending(b), false);
});

test('error recovery: the button is enabled again before the caller sees the error, which can show next to it with a retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const b = button('Отправить'), work = deferred();
  const result = pending(b, work.promise);
  t.mock.timers.tick(300);
  work.reject(Object.assign(Error('Сервис недоступен.'), { status: 503 }));
  await assert.rejects(result, /Сервис недоступен/);
  assert.equal(isPending(b), false); assert.equal(b.getAttribute('aria-busy'), null);
  let retried = 0;
  const shown = actionError(b, Error('Сервис недоступен.'), { retry: () => retried++ });
  assert.equal(shown.node.getAttribute('role'), 'alert');
  assert.match(shown.node.innerHTML, /Не получилось\.<\/b> Сервис недоступен\./);
  assert.match(shown.node.innerHTML, /data-action-retry>Повторить</);
  assert.equal(b.parentNode.childNodes[b.parentNode.childNodes.indexOf(b) + 1], shown.node, 'right after the button in the tab order');
  shown.remove(); assert.equal(shown.node.parentNode, null);
  const line = new Node('p'); doc.body.append(line); line.hidden = true;
  actionError(b, 'Проверьте поля.', { at: line });
  assert.equal(line.hidden, false); assert.equal(line.childNodes[0].dataset.placement, 'inline');
  assert.equal(retried, 0);
});

test('activity: the line lights after 1 s, the slow state after 8 s, both end with the request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const request = deferred();
  trackActivity(request.promise, { kind: 'write' });
  assert.equal(activityState().active, 1); assert.equal(activityState().long, false);
  t.mock.timers.tick(999); assert.equal(activityState().long, false);
  t.mock.timers.tick(1); assert.equal(activityState().long, true);
  t.mock.timers.tick(6999); assert.equal(activityState().slow, false);
  t.mock.timers.tick(1); assert.deepEqual(activityState(), { active: 1, long: true, slow: true, slowWrite: true });
  request.resolve(); await flush();
  assert.deepEqual(activityState(), { active: 0, long: false, slow: false, slowWrite: false });
});

test('auto pending: a request right after a press holds that button; a chained request keeps it; a failure is attributable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  autoPending();
  const b = button('Удалить');
  b.focus(); fire('click', { target: { closest: sel => sel.includes('.iq-btn') ? b : null } });
  const one = deferred();
  trackActivity(one.promise, { kind: 'write' });
  assert.ok(isPending(b));
  one.resolve(); await flush();
  const two = deferred(); trackActivity(two.promise, { kind: 'write' });
  t.mock.timers.tick(FEEDBACK_TIMING.grace + 1);
  assert.ok(isPending(b), 'the chain started within the grace keeps the button pending');
  t.mock.timers.tick(200); assert.equal(b.getAttribute('aria-busy'), 'true');
  two.reject(Error('x')); await flush(); t.mock.timers.tick(FEEDBACK_TIMING.grace + 1);
  assert.equal(isPending(b), false);
  assert.equal(recentFailure(), b); assert.equal(recentFailure(), null, 'taken once');
  t.mock.timers.tick(FEEDBACK_TIMING.attribution + 400);
  const late = deferred(); trackActivity(late.promise); assert.equal(isPending(b), false, 'a request long after the press is not the button\'s');
  late.resolve(); await flush();
  const menu = button('Ещё'); menu.focus(); fire('click', { target: { closest: sel => sel.includes('.iq-btn') ? menu : null } });
  doc.activeElement = doc.body;
  const reload = deferred(); trackActivity(reload.promise); assert.equal(isPending(menu), false, 'focus left the button (a menu opened): a reload is not its work');
  reload.resolve(); await flush();
});

test('slow and offline notices: calm text at the top of the toast stack; online again refreshes and says so', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let refreshed = 0;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  const stop = watchConnection({ onOnline: () => refreshed++ });
  const region = doc.body.querySelector('#iq-toasts') || doc.querySelector('#iq-toasts');
  const notice = () => doc.body.childNodes.find(n => n.id === 'iq-toasts')?.childNodes.find(n => n.classes.has('iq-connection-notice'));
  const request = deferred(); trackActivity(request.promise, { kind: 'write' });
  t.mock.timers.tick(7999); assert.equal(notice(), undefined);
  t.mock.timers.tick(1); assert.equal(notice().dataset.notice, 'slowWrite');
  assert.match(notice().innerHTML, /Связь медленная.*Действие ещё выполняется\. Дождитесь ответа, нажимать повторно не нужно\./);
  request.resolve(); await flush(); assert.equal(notice(), undefined, 'it leaves with the request');
  fire('offline'); assert.equal(notice().dataset.notice, 'offline');
  assert.match(notice().innerHTML, /Нет подключения к интернету/);
  assert.equal(notice().className.includes('tone-warning'), true);
  fire('online'); assert.equal(notice().dataset.notice, 'online'); assert.equal(refreshed, 1);
  t.mock.timers.tick(4000); assert.equal(notice(), undefined);
  stop(); void region;
});

test('autosave line: quiet saving after 150 ms, saved, then the resting text; failure offers a retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const el = new Node('p'); doc.body.append(el);
  const state = saveIndicator(el, { idle: 'Изменения сохраняются автоматически' });
  assert.equal(el.getAttribute('role'), 'status'); assert.equal(el.dataset.state, 'idle');
  const fast = deferred(); state.track(fast.promise); t.mock.timers.tick(100); assert.equal(el.dataset.state, 'idle');
  fast.resolve(); await flush(); assert.equal(el.dataset.state, 'saved');
  t.mock.timers.tick(FEEDBACK_TIMING.saved); assert.equal(el.dataset.state, 'idle');
  const slow = deferred(); state.track(slow.promise, { retry() { } }); t.mock.timers.tick(150); assert.equal(el.dataset.state, 'saving');
  assert.match(el.innerHTML, /Сохраняю…/);
  slow.reject(Error('x')); await flush(); assert.equal(el.dataset.state, 'error');
  assert.match(el.innerHTML, /Не сохранено.*Повторить/);
});

test('public surface: core exports, types, styles and the vnext.35 release', () => {
  const core = read('src/entries/core.js'), types = read('types/core.d.ts'), css = read('src/styles/feedback.css'), build = read('scripts/build.mjs');
  for (const name of ['pending', 'actionError', 'trackActivity', 'autoPending', 'mountActivityLine', 'watchConnection', 'saveIndicator', 'uploadProgress', 'recentFailure', 'reportNetworkFailure'])
    { assert.match(core, new RegExp(`export const ${name}=feedbackModule\\.${name};`)); assert.match(types, new RegExp(`export declare function ${name}`)); }
  for (const rule of ['.iq-btn[data-pending=overlay]>.iq-btn-spinner{position:absolute', '.iq-activity-line[data-active]{opacity:1}', '.iq-action-error[data-placement=float]{position:fixed', '.iq-save-state{', '.iq-upload-progress{'])
    assert.ok(css.includes(rule), rule);
  assert.match(css, /prefers-reduced-motion: reduce\)\{\.iq-activity-line>span\{animation:none/);
  assert.match(build, /src\/styles\/feedback\.css/);
  assert.ok(JSON.parse(read('src/manifest.json')).entries.core.includes('feedback.js'));
  assert.match(core, /export const version='0\.6\.0-vnext\.35';/);
  assert.equal(require('../package.json').version, '0.6.0-vnext.35');
  assert.match(types, /export declare const version:'0\.6\.0-vnext\.35';/);
  assert.equal(JSON.parse(read('tokens/semantic.json')).meta.version, '0.6.0-vnext.35');
  assert.equal(JSON.parse(read('PROVENANCE.json')).release, '0.6.0-vnext.35');
});
