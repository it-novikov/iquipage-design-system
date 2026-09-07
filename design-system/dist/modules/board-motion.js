
const exports={};
const deps={};
(function(exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindBoard = bindBoard;
/** Pointer + keyboard board interactions.
 * A single frame loop runs only during a drag. Neighbour movement uses FLIP,
 * with transforms/opacity only; no animated blur, shadow, width or height.
 */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
function bindBoard(board, onDrop) {
    const abort = new AbortController(), signal = abort.signal;
    let state = null, frame = 0, suppressUntil = 0, animations = new Map(), disposed = false;
    let live = document.createElement('span');
    live.className = 'sr-only';
    live.role = 'status';
    live.setAttribute('aria-live', 'polite');
    board.append(live);
    const on = (node, type, fn, opts = {}) => node.addEventListener(type, fn, { ...opts, signal });
    const announce = text => live.textContent = text;
    const cards = () => [...board.querySelectorAll('.task-card:not(.is-drag-source)')];
    const positions = () => new Map(cards().map(n => [n, n.getBoundingClientRect()]));
    function flip(before) {
        if (reduced())
            return;
        // Batch all reads before writes to avoid one layout per card.
        const moves = [...before].filter(([n]) => n.isConnected).map(([n, r]) => [n, r, n.getBoundingClientRect()]);
        for (const [n, a, b] of moves) {
            const dx = a.left - b.left, dy = a.top - b.top;
            if (Math.abs(dx) + Math.abs(dy) < 1)
                continue;
            animations.get(n)?.cancel();
            const anim = n.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
            animations.set(n, anim);
            anim.finished.catch(() => { }).finally(() => { if (animations.get(n) === anim)
                animations.delete(n); });
        }
    }
    function updateScrolled() { board.classList.toggle('is-scrolled', board.scrollTop > 3); }
    on(board, 'scroll', updateScrolled, { passive: true });
    updateScrolled();
    function place(col, before = null) {
        if (!state?.active || !col)
            return;
        const list = col.querySelector('[data-column-cards]');
        if (!list)
            return;
        const ph = state.placeholder;
        if (ph.parentElement === list && ph.nextElementSibling === before)
            return;
        const snapshot = positions();
        list.insertBefore(ph, before);
        board.querySelectorAll('.is-drop-column').forEach(n => n.classList.remove('is-drop-column'));
        col.classList.add('is-drop-column');
        flip(snapshot);
        if (state.keyboard) {
            const r = ph.getBoundingClientRect();
            state.x = r.left;
            state.y = r.top;
            state.ghost.style.transform = `translate3d(${r.left}px,${r.top}px,0)`;
            announce(`${col.querySelector('h3').textContent}. Позиция ${[...list.children].filter(n => n !== state.card).indexOf(ph) + 1}. Enter — переместить, Escape — отменить.`);
            ph.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }
    function begin(card, keyboard = false, x = 0, y = 0, pointerId = null) {
        if (state?.active)
            return;
        const r = card.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'task-card iq-drag-overlay';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.inert = true;
        ghost.dataset.priority = card.dataset.priority || 'normal';
        ghost.dataset.taskKind = card.dataset.taskKind || 'task';
        ghost.dataset.taskEmphasis = card.dataset.taskEmphasis || 'none';
        // Overlay deliberately excludes interactive custom elements and duplicate IDs.
        ghost.innerHTML = `<div class="task-card-top"><span class="task-card-id">${card.querySelector('.task-card-id').textContent}</span></div><div class="task-card-title">${card.querySelector('.task-card-title').textContent.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>${card.querySelector('.task-card-footer').outerHTML}`;
        Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', left: '0', top: '0', transform: `translate3d(${r.left}px,${r.top}px,0)` });
        document.body.append(ghost);
        const ph = document.createElement('div');
        ph.className = 'iq-board-placeholder';
        ph.style.height = r.height + 'px';
        ph.setAttribute('aria-hidden', 'true');
        card.before(ph);
        card.classList.add('is-drag-source');
        state = { active: true, keyboard, card, ghost, placeholder: ph, sourceParent: ph.parentNode, sourceNext: card.nextElementSibling, pointerId, dx: x - r.left, dy: y - r.top, x: keyboard ? r.left : x, y: keyboard ? r.top : y, width: r.width, height: r.height };
        board.classList.add('is-dragging');
        document.body.classList.add('iq-board-dragging');
        card.querySelector('[data-drag-handle]')?.setAttribute('aria-pressed', 'true');
        announce(`Перемещение ${card.dataset.dragId}. Выберите столбец. Escape — отменить.`);
        if (keyboard) {
            board.focus({ preventScroll: true });
        }
        else
            frame = requestAnimationFrame(tick);
    }
    function tick() {
        if (!state?.active || state.keyboard || disposed)
            return;
        const s = state;
        s.ghost.style.transform = `translate3d(${s.x - s.dx}px,${s.y - s.dy}px,0) rotate(-1deg)`;
        const hit = document.elementFromPoint(s.x, s.y), col = hit?.closest('[data-drop-status]');
        if (col && board.contains(col)) {
            const nodes = [...col.querySelectorAll('.task-card:not(.is-drag-source)')];
            const before = nodes.find(n => { const r = n.getBoundingClientRect(); return s.y < r.top + r.height / 2; }) || null;
            place(col, before);
        }
        const r = board.getBoundingClientRect(), edge = 48;
        const dy = s.y < r.top + edge ? -Math.min(12, (r.top + edge - s.y) / 4) : s.y > r.bottom - edge ? Math.min(12, (s.y - r.bottom + edge) / 4) : 0;
        const dx = s.x < r.left + edge ? -Math.min(12, (r.left + edge - s.x) / 4) : s.x > r.right - edge ? Math.min(12, (s.x - r.right + edge) / 4) : 0;
        if (dy || dx)
            board.scrollBy({ left: dx, top: dy, behavior: 'instant' });
        frame = requestAnimationFrame(tick);
    }
    function cleanupState(s) {
        cancelAnimationFrame(frame);
        frame = 0;
        s.ghost?.remove();
        s.placeholder?.remove();
        s.card.classList.remove('is-drag-source');
        s.card.querySelector('[data-drag-handle]')?.setAttribute('aria-pressed', 'false');
        board.classList.remove('is-dragging');
        document.body.classList.remove('iq-board-dragging');
        board.querySelectorAll('.is-drop-column').forEach(n => n.classList.remove('is-drop-column'));
        state = null;
    }
    function cancel() { if (!state)
        return; if (!state.active) {
        state = null;
        return;
    } const s = state, before = positions(); cleanupState(s); flip(before); announce('Перемещение отменено.'); s.card.querySelector('[data-drag-handle]')?.focus({ preventScroll: true }); }
    function finish() {
        if (!state?.active) {
            state = null;
            return;
        }
        const s = state;
        if (s.landing)
            return;
        cancelAnimationFrame(frame);
        frame = 0;
        const col = s.placeholder.closest('[data-drop-status]');
        if (!col) {
            cancel();
            return;
        }
        const before = [...s.placeholder.parentElement.children].slice([...s.placeholder.parentElement.children].indexOf(s.placeholder) + 1).find(n => n.matches('.task-card:not(.is-drag-source)'));
        const detail = { id: s.card.dataset.dragId, status: col.dataset.dropStatus, beforeId: before?.dataset.dragId || null, keyboard: s.keyboard };
        const destination = s.placeholder.getBoundingClientRect(), from = s.ghost.getBoundingClientRect();
        const done = () => { if (disposed || state !== s)
            return; cleanupState(s); suppressUntil = performance.now() + 450; onDrop(detail); };
        if (reduced())
            done();
        else {
            const anim = s.ghost.animate([{ transform: `translate3d(${from.left}px,${from.top}px,0) rotate(-1deg)`, opacity: 1 }, { transform: `translate3d(${destination.left}px,${destination.top}px,0) rotate(0)`, opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
            s.landing = anim;
            anim.finished.then(done).catch(() => { });
        }
    }
    on(board, 'pointerdown', e => {
        if (e.button !== 0 || state)
            return;
        const card = e.target.closest('.task-card');
        if (!card)
            return;
        if (e.target.closest('iq-menu,a,input,textarea') || e.target.closest('button:not([data-drag-handle]):not(.task-card-title)'))
            return;
        if (e.pointerType === 'touch' && !e.target.closest('[data-drag-handle]'))
            return;
        state = { active: false, card, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    });
    on(window, 'pointermove', e => {
        if (!state || state.keyboard || state.pointerId !== e.pointerId)
            return;
        if (!state.active) {
            if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 6)
                return;
            const p = state;
            begin(p.card, false, p.startX, p.startY, p.pointerId);
        }
        e.preventDefault();
        state.x = e.clientX;
        state.y = e.clientY;
    }, { passive: false });
    on(window, 'pointerup', e => { if (!state || state.keyboard || state.pointerId !== e.pointerId)
        return; if (state.active) {
        e.preventDefault();
        const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop-status]');
        if (col && board.contains(col))
            finish();
        else
            cancel();
    }
    else
        state = null; });
    on(window, 'pointercancel', cancel);
    on(board, 'click', e => { if (performance.now() < suppressUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
    } }, { capture: true });
    on(board, 'keydown', e => {
        const handle = e.target.closest('[data-drag-handle]');
        if (!handle && !state?.keyboard)
            return;
        if (!state?.active && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            begin(handle.closest('.task-card'), true);
            return;
        }
        if (!state?.keyboard)
            return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
            return;
        }
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            finish();
            return;
        }
        const cols = [...board.querySelectorAll('[data-drop-status]')], col = state.placeholder.closest('[data-drop-status]');
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const i = Math.max(0, Math.min(cols.length - 1, cols.indexOf(col) + (e.key === 'ArrowLeft' ? -1 : 1)));
            place(cols[i]);
        }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const next = e.key === 'ArrowUp' ? state.placeholder.previousElementSibling : state.placeholder.nextElementSibling;
            if (next && next !== state.card)
                place(col, e.key === 'ArrowUp' ? next : next.nextElementSibling);
        }
    });
    on(window, 'keydown', e => { if (e.key === 'Escape' && state) {
        e.preventDefault();
        cancel();
    } });
    on(document, 'visibilitychange', () => { if (document.hidden)
        cancel(); });
    return () => { disposed = true; if (state?.active) {
        state.landing?.cancel();
        cleanupState(state);
    } state = null; cancelAnimationFrame(frame); abort.abort(); animations.forEach(a => a.cancel()); animations.clear(); live.remove(); };
}


})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
