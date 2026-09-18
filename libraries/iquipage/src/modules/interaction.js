"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.motionReduced = void 0;
exports.autosize = autosize;
exports.bindAutosize = bindAutosize;
exports.copyAtButton = copyAtButton;
exports.revealContent = revealContent;
exports.transition = transition;
/** IQUIPAGE interaction utilities. No global animation loop or runtime dependency. */
const motionReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
exports.motionReduced = motionReduced;
const effects = new WeakMap();
function transition(el, frames, duration = 240, delay = 0) {
    effects.get(el)?.cancel();
    if (motionReduced() || !el.isConnected)
        return;
    const animation = el.animate(frames, { duration, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'none' });
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

