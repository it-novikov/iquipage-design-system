"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.motionReduced = void 0;
exports.autosize = autosize;
exports.bindAutosize = bindAutosize;
exports.bindLoading = bindLoading;
exports.copyAtButton = copyAtButton;
exports.motionEase = motionEase;
exports.motionMs = motionMs;
exports.revealContent = revealContent;
exports.scrollBehavior = scrollBehavior;
exports.transition = transition;
exports.withoutTransitions = withoutTransitions;
/** IQUIPAGE interaction utilities. No global animation loop or runtime dependency. */
/** The one reduced-motion check (MOT-10): the OS preference or the product setting `data-motion="reduced"` on <html>.
 *  CSS follows the same two signals by zeroing the motion tokens (src/styles/motion.css). */
const motionReduced = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.dataset.motion === 'reduced';
exports.motionReduced = motionReduced;
const rootStyle = () => getComputedStyle(document.documentElement);
/** A motion token as milliseconds: motionMs('enter') reads --iq-motion-enter; a full custom property name ('--iq-loading-delay')
 *  is read as is. Under reduced motion the motion tokens are 0, so callers skip the animation when the result is 0. */
function motionMs(name, fallback = 0) {
    const prop = name.startsWith('--') ? name : `--iq-motion-${name}`;
    let value = '';
    try { value = rootStyle().getPropertyValue(prop).trim(); } catch { return fallback; }
    const number = parseFloat(value);
    if (!Number.isFinite(number) || number < 0) return fallback;
    return value.endsWith('ms') ? number : number * 1000;
}
const EASE_FALLBACK = { ease: 'cubic-bezier(.2,.7,.2,1)', spring: 'cubic-bezier(.16,1,.3,1)', out: 'cubic-bezier(.4,0,1,1)' };
/** An easing token for the Web Animations API: motionEase('spring') reads --iq-ease-spring; 'ease' reads --iq-ease. */
function motionEase(name = 'ease') {
    const prop = name === 'ease' ? '--iq-ease' : `--iq-ease-${name}`;
    try { return rootStyle().getPropertyValue(prop).trim() || EASE_FALLBACK[name] || EASE_FALLBACK.ease; } catch { return EASE_FALLBACK[name] || EASE_FALLBACK.ease; }
}
/** scrollIntoView({behavior: scrollBehavior()}): smooth scrolling is one of the main vestibular triggers (MOT-15). */
function scrollBehavior() { return motionReduced() ? 'auto' : 'smooth'; }
let switching = 0;
/** Runs fn (typically `root.dataset.theme = …`) with every transition suppressed for the frame in which the change lands (MOT-05),
 *  so a theme switch repaints at once instead of rippling through 120–360 ms colour transitions. */
function withoutTransitions(fn) {
    const root = document.documentElement;
    root.setAttribute('data-theme-switching', '');
    switching++;
    const release = () => { if (--switching <= 0) { switching = 0; root.removeAttribute('data-theme-switching'); } };
    try {
        return fn();
    }
    finally {
        // Two frames: the first paints the new theme without transitions, the second lifts the guard.
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(release)); else release();
    }
}
/** Loading policy (MOT-07): the container gets .iq-loading (invisible for --iq-loading-delay, so fast answers never flash) and
 *  aria-busy; after --iq-loading-slow it gets .iq-loading-slow and a status note. Returns a function that ends the state. */
function bindLoading(el, { slowAfter, note = 'Загружаем дольше обычного…' } = {}) {
    el.classList.add('iq-loading');
    el.setAttribute('aria-busy', 'true');
    const delay = slowAfter ?? motionMs('--iq-loading-slow', 5000);
    let text = null;
    const timer = setTimeout(() => {
        el.classList.add('iq-loading-slow');
        text = document.createElement('p');
        text.className = 'iq-loading-note';
        text.setAttribute('role', 'status');
        text.textContent = note;
        el.append(text);
    }, delay);
    return () => {
        clearTimeout(timer);
        text?.remove();
        el.classList.remove('iq-loading', 'iq-loading-slow');
        el.removeAttribute('aria-busy');
    };
}
const effects = new WeakMap();
function transition(el, frames, duration = motionMs('enter', 280), delay = 0) {
    effects.get(el)?.cancel();
    if (motionReduced() || !duration || !el.isConnected)
        return;
    const animation = el.animate(frames, { duration, delay, easing: motionEase('spring'), fill: 'none' });
    effects.set(el, animation);
    animation.finished.catch(() => { }).finally(() => {
        if (effects.get(el) === animation)
            effects.delete(el);
    });
    return animation;
}
/** A single write/read/write per edit. No resize observer feedback cycle. */
function autosize(input) {
    if (!input.isConnected || !input.getClientRects().length)
        return;
    const before = input.scrollTop;
    input.style.height = 'auto';
    const style = getComputedStyle(input), border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const min = parseFloat(style.minHeight) || 76, max = parseFloat(style.maxHeight) || 640;
    const height = Math.max(min, Math.min(max, input.scrollHeight + border));
    input.style.height = `${height}px`;
    input.style.overflowY = input.scrollHeight + border > max ? 'auto' : 'hidden';
    input.scrollTop = before;
}
function bindAutosize(root, signal) {
    root.querySelectorAll('textarea').forEach(input => {
        input.style.resize = 'none';
        autosize(input);
        input.addEventListener('input', () => autosize(input), { signal });
        input.closest('form')?.addEventListener('reset', () => requestAnimationFrame(() => autosize(input)), { signal });
    });
    const resize = () => root.querySelectorAll('textarea').forEach(autosize);
    window.addEventListener('resize', resize, { signal, passive: true });
}
const copying = new WeakMap();
async function copyAtButton(button, text) {
    copying.get(button)?.restore();
    const old = button.innerHTML, label = button.getAttribute('aria-label'), width = button.style.minWidth;
    const box = button.getBoundingClientRect();
    let restored = false;
    const restore = () => {
        if (restored)
            return;
        restored = true;
        clearTimeout(copying.get(button)?.timer);
        button.innerHTML = old;
        button.style.minWidth = width;
        button.removeAttribute('data-copy-state');
        button.removeAttribute('aria-busy');
        label === null ? button.removeAttribute('aria-label') : button.setAttribute('aria-label', label);
        copying.delete(button);
    };
    const current = { restore };
    copying.set(button, current);
    button.setAttribute('aria-busy', 'true');
    let ok = false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            ok = true;
        }
        else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-10000px;top:0';
            document.body.append(ta);
            ta.select();
            ok = document.execCommand('copy');
            ta.remove();
            button.focus({ preventScroll: true });
        }
    }
    catch {
        ok = false;
    }
    if (copying.get(button) !== current)
        return ok;
    if (!button.isConnected) {
        restore();
        return ok;
    }
    button.style.minWidth = `${box.width}px`;
    button.removeAttribute('aria-busy');
    button.dataset.copyState = ok ? 'success' : 'error';
    const message = ok ? 'Скопировано' : 'Не скопировано';
    button.setAttribute('aria-label', message);
    const glyph = ok ? '<path d="m5 12 4.5 4.5L19 7"/>' : '<path d="m7 7 10 10M17 7 7 17"/>';
    const iconOnly = button.classList.contains('icon');
    button.innerHTML = `<span class="copy-confirmation"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg>${iconOnly ? '' : `<span>${message}</span>`}</span><span class="sr-only" role="status">${message}</span>`;
    transition(button.querySelector('.copy-confirmation'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], 230);
    const record = copying.get(button);
    if (record)
        record.timer = setTimeout(restore, ok ? 1900 : 3600);
    return ok;
}
/** Reveal only newly mounted content. At rest there are zero JS frame callbacks. */
function revealContent(root) {
    const animations = [];
    if (!motionReduced())
        root.querySelectorAll('.component-stage>*, .specimen-surface>*, .workspace-tools, .workspace-views, .proof-document, .page-head').forEach((el, i) => {
            if (i > 8)
                return;
            const a = transition(el, [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], 300, Math.min(i, 4) * 25);
            if (a)
                animations.push(a);
        });
    return () => animations.forEach(a => a.cancel());
}

