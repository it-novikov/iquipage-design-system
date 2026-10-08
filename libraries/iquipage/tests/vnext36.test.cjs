'use strict';
/** Contracts for 0.6.0-vnext.36: the switcher — the top bar's workspace/project switcher as one public control, with a
 *  title size for a page title that chooses what its page shows (a board's release). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---- A small DOM with an HTML reader: enough for the switcher's markup and iq-menu's keyboard and pointer paths. ----
const VOID = new Set(['hr', 'input', 'img', 'br']);
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this.text = ''; this.listeners = new Map(); this.style = {}; this.hidden = false; this.disabled = false; this.tabIndex = 0; this.classes = new Set(); }
  get classList() { const c = this.classes; return { add: (...x) => x.forEach(y => c.add(y)), remove: (...x) => x.forEach(y => c.delete(y)), contains: x => c.has(x) }; }
  get dataset() { const self = this; return new Proxy({}, { get: (_, k) => self.getAttribute('data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase())) ?? undefined }); }
  get id() { return this.attrs.get('id') || ''; } set id(v) { this.attrs.set('id', String(v)); }
  get textContent() { return this.text + this.childNodes.map(c => c.textContent).join(''); }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === document; }
  get offsetWidth() { return 240; } get offsetHeight() { return 160; }
  setAttribute(k, v) { if (k === 'class') this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); else this.attrs.set(k, String(v)); }
  getAttribute(k) { return k === 'class' ? [...this.classes].join(' ') : this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return k === 'class' ? this.classes.size > 0 : this.attrs.has(k); }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.childNodes.push(n); } }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  *all() { for (const c of this.childNodes) { yield c; yield* c.all(); } }
  matches(sel) {
    return sel.split(',').some(part => {
      let rest = part.trim(), m;
      if ((m = /^[a-z][\w-]*/.exec(rest))) { if (this.tagName !== m[0].toUpperCase()) return false; rest = rest.slice(m[0].length); }
      while (rest) {
        if ((m = /^\.([\w-]+)/.exec(rest))) { if (!this.classes.has(m[1])) return false; }
        else if ((m = /^\[([\w-]+)(?:=([^\]]*))?\]/.exec(rest))) { if (!this.hasAttribute(m[1]) || (m[2] !== undefined && this.getAttribute(m[1]) !== m[2])) return false; }
        else if ((m = /^:not\(:disabled\)/.exec(rest))) { if (this.disabled) return false; }
        else throw Error('Unsupported selector ' + sel);
        rest = rest.slice(m[0].length);
      }
      return true;
    });
  }
  closest(sel) { let n = this; while (n && n.matches) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) { return [...this.all()].filter(n => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getBoundingClientRect() { return { left: 40, top: 40, right: 280, bottom: 72, width: 240, height: 32 }; }
  focus() { document.activeElement = this; }
  scrollIntoView() { }
  animate() { return { finished: Promise.resolve(), cancel() { } }; }
  addEventListener(type, fn, opts = {}) { if (opts.signal?.aborted) return; if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); opts.signal?.addEventListener('abort', () => { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn)); }); }
  dispatchEvent(event) { for (let n = this; n; n = event.bubbles ? n.parentNode : null) for (const fn of [...(n.listeners.get(event.type) || [])]) fn(event); return true; }
  fire(type, props = {}) { const event = { type, target: this, bubbles: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { }, ...props }; this.dispatchEvent(event); return event; }
}
/** Reads the markup the switcher returns: elements, quoted attributes and text, with entities decoded. */
function parse(html) {
  const top = new El('#fragment'), stack = [top], decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  for (const [, close, tag, attrs, self, text] of html.matchAll(/<(\/?)([a-z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (text !== undefined) { const t = new El('#text'); t.text = decode(text); t.matches = () => false; stack.at(-1).append(t); continue; }
    if (close) { stack.pop(); continue; }
    const el = new El(tag); for (const [, k, v] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.setAttribute(k, v === undefined ? '' : decode(v));
    stack.at(-1).append(el); if (!self && !VOID.has(tag)) stack.push(el);
  }
  return top;
}
const document = new El('#document'); document.body = new El('body'); document.append(document.body); document.activeElement = null;
Object.assign(globalThis, { HTMLElement: El, document, window: new El('#window'), innerWidth: 1440, innerHeight: 1000, matchMedia: () => ({ matches: true }), requestAnimationFrame: () => 0, cancelAnimationFrame: () => { }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
const ui = require('../src/modules/ui.js');
const { IqMenu } = require('../src/modules/components.js');

const releases = [
  { label: 'Спринт 12', action: 'board-release:running', current: true, meta: 'идёт' },
  { label: 'Спринт 13', action: 'board-release:next', current: false, meta: 'запланирован' },
  { separator: true },
  { label: 'Без релиза', action: 'board-release:backlog', current: false },
];
/** Mounts a switcher the way the browser upgrades <iq-menu>: the parsed element becomes an IqMenu. */
function mount(options) {
  const parsed = parse(ui.switcher(options)).childNodes[0], menu = Object.assign(new IqMenu('iq-menu'), {});
  menu.tagName = 'IQ-MENU'; for (const [k, v] of parsed.attrs) menu.setAttribute(k, v); menu.classes = parsed.classes;
  menu.append(...parsed.childNodes); document.body.append(menu); menu.connectedCallback();
  const trigger = menu.querySelector('button'), popup = menu.querySelector('[data-menu]');
  return { menu, trigger, popup, items: () => popup.querySelectorAll('button'), actions: (() => { const seen = []; menu.addEventListener('iq-action', e => seen.push(e.detail.action)); return seen; })() };
}

test('the trigger is the quiet top-bar label with a small chevron, no border and no other icon', () => {
  const bar = parse(ui.switcher({ label: 'IQUIPAGE', name: 'Пространство', tone: 'muted', className: 'pn-space-trigger', items: [] })).childNodes[0];
  assert.equal(bar.tagName, 'IQ-MENU'); assert.ok(bar.classes.has('iq-switcher-menu'));
  const button = bar.querySelector('button');
  assert.deepEqual([...button.classes], ['iq-btn', 'ghost', 'sm', 'iq-switcher', 'pn-space-trigger']);
  assert.equal(button.getAttribute('aria-label'), 'Пространство: IQUIPAGE'); assert.equal(button.getAttribute('title'), 'IQUIPAGE');
  assert.equal(button.getAttribute('data-tone'), 'muted'); assert.equal(button.querySelector('.iq-switcher-label').textContent, 'IQUIPAGE');
  const icons = button.querySelectorAll('svg'); assert.equal(icons.length, 1); assert.equal(icons[0].getAttribute('data-glyph'), 'down'); assert.equal(icons[0].getAttribute('width'), '14');
  const project = parse(ui.switcher({ label: 'Your Foreign Friend', name: 'Проект', emphasis: 'strong', items: [] })).childNodes[0].querySelector('button');
  assert.equal(project.querySelector('.iq-switcher-label').tagName, 'STRONG', 'the project stays bold, as in the top bar');
  assert.equal(project.getAttribute('data-emphasis'), 'strong');
});

test('the title size keeps the heading font: no compact size, a larger chevron, the same label and menu', () => {
  const title = parse(ui.switcher({ label: 'Спринт 12', name: 'Релиз на доске', size: 'title', items: releases })).childNodes[0];
  const button = title.querySelector('button');
  assert.equal(button.getAttribute('data-size'), 'title'); assert.ok(!button.classes.has('sm'), 'no compact size: the heading decides');
  assert.ok(button.classes.has('iq-switcher') && button.classes.has('ghost'));
  assert.equal(button.getAttribute('aria-label'), 'Релиз на доске: Спринт 12');
  assert.equal(button.querySelector('svg').getAttribute('width'), '18');
  assert.ok(!button.querySelector('[data-glyph=stack]') && !title.querySelector('[data-glyph=stack]'), 'no layers icon anywhere');
  assert.throws(() => ui.switcher({ label: 'x', size: 'huge', items: [] }), TypeError);
  const css = read('src/styles/switcher.css');
  assert.match(css, /\.iq-switcher\.iq-btn\[data-size=title\]\{[^}]*font:inherit/);
  assert.match(css, /\.iq-switcher\.iq-btn\[data-size=title\]\{[^}]*height:auto/);
});

test('choices are menuitemradio rows: the current one checked with the check glyph, the others on the same column', () => {
  const popup = parse(ui.switcher({ label: 'Спринт 12', size: 'title', items: releases })).childNodes[0].querySelector('[data-menu]');
  const rows = popup.querySelectorAll('button');
  assert.deepEqual(rows.map(r => r.getAttribute('role')), ['menuitemradio', 'menuitemradio', 'menuitemradio']);
  assert.deepEqual(rows.map(r => r.getAttribute('aria-checked')), ['true', 'false', 'false']);
  assert.deepEqual(rows.map(r => r.getAttribute('data-action')), ['board-release:running', 'board-release:next', 'board-release:backlog']);
  assert.equal(rows[0].querySelector('svg').getAttribute('data-glyph'), 'check');
  assert.ok(rows[1].querySelector('.iq-switcher-mark') && !rows[1].querySelector('svg'), 'an empty mark keeps the label column');
  assert.deepEqual(rows.map(r => r.querySelector('.iq-switcher-meta')?.textContent ?? null), ['идёт', 'запланирован', null]);
  assert.equal(popup.querySelector('hr').getAttribute('role'), 'separator');
  // The top bar's rows keep their kind glyph until they are current; commands are plain menu items.
  const bar = parse(ui.switcher({ label: 'Команда', items: [{ section: 'Пространства' }, { label: 'Команда', glyph: 'folder', current: true, action: 'workspace:1' }, { label: 'Маркетинг', glyph: 'folder', current: false, action: 'workspace:2' }, { label: 'Новое пространство', glyph: 'plus', action: 'create-workspace' }] })).childNodes[0];
  const [mine, other, command] = bar.querySelector('[data-menu]').querySelectorAll('button');
  assert.equal(mine.querySelector('svg').getAttribute('data-glyph'), 'check'); assert.equal(other.querySelector('svg').getAttribute('data-glyph'), 'folder');
  assert.equal(command.getAttribute('role'), null); assert.equal(command.getAttribute('aria-checked'), null);
  assert.equal(bar.querySelector('.iq-menu-section').textContent, 'Пространства');
});

test('text is plain: names, meta and sections are escaped', () => {
  const html = ui.switcher({ label: '<b>R&D</b>', name: 'Релиз', items: [{ section: '<i>' }, { label: '"x"<y>', action: 'a', current: false, meta: '<m>' }] });
  assert.doesNotMatch(html, /<b>|<i>|<y>|<m>/);
  const parsed = parse(html).childNodes[0];
  assert.equal(parsed.querySelector('.iq-switcher-label').textContent, '<b>R&D</b>');
  assert.equal(parsed.querySelector('button').getAttribute('aria-label'), 'Релиз: <b>R&D</b>');
});

test('opening: the button says it has a menu and opens it on the current choice', () => {
  const { menu, trigger, popup, items } = mount({ label: 'Спринт 12', name: 'Релиз на доске', size: 'title', items: releases });
  assert.equal(trigger.getAttribute('aria-haspopup'), 'menu'); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.getAttribute('aria-controls'), popup.id); assert.equal(popup.getAttribute('role'), 'menu');
  trigger.fire('click');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true'); assert.equal(popup.hidden, false);
  assert.equal(document.activeElement, items()[0], 'focus lands on the checked release');
  trigger.fire('click'); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  menu.disconnectedCallback();
});

test('keyboard: arrows open and move, Escape closes back to the title, Enter on a row picks it', () => {
  const { menu, trigger, popup, items, actions } = mount({ label: 'Спринт 13', name: 'Релиз на доске', size: 'title', items: releases.map(x => x.separator ? x : { ...x, current: x.action === 'board-release:next' }) });
  const down = trigger.fire('keydown', { key: 'ArrowDown' });
  assert.ok(down.defaultPrevented); assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, items()[1], 'ArrowDown opens on the current release');
  popup.fire('keydown', { key: 'ArrowDown' }); assert.equal(document.activeElement, items()[2], 'the rule is skipped');
  popup.fire('keydown', { key: 'ArrowDown' }); assert.equal(document.activeElement, items()[0], 'wraps to the first');
  popup.fire('keydown', { key: 'End' }); assert.equal(document.activeElement, items()[2]);
  popup.fire('keydown', { key: 'Escape' });
  assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(document.activeElement, trigger, 'Escape returns to the title');
  trigger.fire('keydown', { key: 'ArrowUp' }); assert.equal(document.activeElement, items()[2], 'ArrowUp opens on the last row');
  // Enter or Space on a focused button is its click: the menu closes onto the title and reports the release.
  popup.fire('click', { target: items()[2] });
  assert.deepEqual(actions, ['board-release:backlog']); assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(document.activeElement, trigger);
  menu.disconnectedCallback();
});

test('public surface: core export, types, styles and the vnext.36 release', () => {
  const core = read('src/entries/core.js'), types = read('types/core.d.ts'), build = read('scripts/build.mjs');
  assert.match(core, /export const switcher=m13\.switcher;/);
  assert.match(types, /export declare function switcher\(options:SwitcherOptions\):string;/);
  assert.match(types, /export interface SwitcherOptions \{/);
  assert.match(build, /src\/styles\/switcher\.css/);
  assert.equal(typeof ui.switcher, 'function');
  assert.match(core, /export const version='0\.6\.0-vnext\.36';/);
  assert.equal(require('../package.json').version, '0.6.0-vnext.36');
  assert.match(types, /export declare const version:'0\.6\.0-vnext\.36';/);
  assert.equal(JSON.parse(read('tokens/semantic.json')).meta.version, '0.6.0-vnext.36');
  assert.equal(JSON.parse(read('PROVENANCE.json')).release, '0.6.0-vnext.36');
});
