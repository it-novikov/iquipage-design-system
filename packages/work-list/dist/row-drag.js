/** Controlled pointer/keyboard intent; never moves, selects or saves caller data. */
export function bindRowDrag(options) {
    const { root, scrollRoot } = options, abort = new AbortController(), signal = abort.signal;
    const live = document.createElement('span');
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    root.append(live);
    let state = null, frame = 0, disposed = false, suppress = 0;
    const announce = (text) => { if (live.textContent !== text)
        live.textContent = text; };
    function clear(message) {
        const old = state;
        state = null;
        cancelAnimationFrame(frame);
        frame = 0;
        old?.ghost?.remove();
        old?.marker?.remove();
        if (old) {
            old.handle.setAttribute('aria-pressed', 'false');
            if (old.handle.isConnected)
                old.handle.focus({ preventScroll: true });
        }
        root.querySelectorAll('[data-work-drop-active]').forEach(n => n.removeAttribute('data-work-drop-active'));
        root.removeAttribute('data-work-dragging');
        if (old?.active)
            options.onState?.(false);
        if (message)
            announce(message);
        return old;
    }
    function begin(s) {
        s.active = true;
        root.setAttribute('data-work-dragging', '');
        s.handle.setAttribute('aria-pressed', 'true');
        s.handle.focus({ preventScroll: true });
        s.ghost = document.createElement('div');
        s.ghost.className = 'iq-list-drag-ghost';
        s.ghost.setAttribute('aria-hidden', 'true');
        s.ghost.textContent = s.source.label;
        s.marker = document.createElement('div');
        s.marker.className = 'iq-list-drop-marker';
        s.marker.hidden = true;
        s.marker.setAttribute('aria-hidden', 'true');
        document.body.append(s.ghost, s.marker);
        options.onState?.(true);
        announce('Перемещение ' + s.source.label + '. Стрелки — выбрать позицию, Enter — проверить перенос, Escape — отменить.');
    }
    function showTarget(s, target) {
        s.target = target;
        root.querySelectorAll('[data-work-drop-active]').forEach(n => n.removeAttribute('data-work-drop-active'));
        if (s.marker)
            s.marker.hidden = !target;
        if (!target) {
            announce('Перемещение недоступно в этой позиции.');
            return;
        }
        const group = root.querySelector('[data-work-group="' + CSS.escape(target.groupId) + '"]');
        const row = target.beforeId ? group?.querySelector('[data-work-row="' + CSS.escape(target.beforeId) + '"]') : null;
        const targetElement = row || group?.querySelector('[data-work-dropzone]') || group;
        if (group)
            group.setAttribute('data-work-drop-active', '');
        if (targetElement && s.marker) {
            const r = targetElement.getBoundingClientRect();
            s.marker.style.cssText = `left:${r.left}px;top:${row ? r.top : r.bottom}px;width:${r.width}px`;
        }
        announce(target.label + '. Enter — проверить, Escape — отменить.');
    }
    function point(s) {
        const hit = document.elementFromPoint(s.x, s.y), group = hit?.closest('[data-work-group]');
        if (!group || !root.contains(group)) {
            showTarget(s, null);
            return;
        }
        const row = hit?.closest('[data-work-row]');
        let beforeId = row?.dataset.workRow || null;
        if (row && s.y > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2)
            beforeId = row.nextElementSibling?.getAttribute('data-work-row') || null;
        showTarget(s, options.resolve(s.source, group.dataset.workGroup, beforeId));
    }
    function tick(time) {
        const s = state;
        if (!s?.active || s.pointer === null || disposed)
            return;
        const elapsed = Math.min(32, time - (s.time || time));
        s.time = time;
        if (!s.handle.isConnected || !options.source(s.source.id)) {
            clear('Перемещение отменено: данные изменились.');
            return;
        }
        if (s.ghost)
            s.ghost.style.transform = `translate3d(${s.x + 12}px,${s.y + 12}px,0)`;
        point(s);
        const r = scrollRoot.getBoundingClientRect(), edge = 48;
        if (s.x >= r.left && s.x <= r.right) {
            const velocity = s.y < r.top + edge ? -Math.min(1, (r.top + edge - s.y) / edge) : s.y > r.bottom - edge ? Math.min(1, (s.y - r.bottom + edge) / edge) : 0;
            if (velocity)
                scrollRoot.scrollTop += velocity * elapsed * 0.65;
        }
        frame = requestAnimationFrame(tick);
    }
    function finish() {
        const s = state;
        if (!s?.active || !s.target) {
            clear('Перемещение отменено.');
            return;
        }
        const target = options.resolve(s.source, s.target.groupId, s.target.beforeId);
        if (!target) {
            clear('Позиция больше недоступна.');
            return;
        }
        suppress = s.pointer === null ? 0 : performance.now() + 350;
        clear('Проверяем последствия переноса.');
        setTimeout(() => { suppress = 0; }, 0);
        options.commit(s.source, target);
    }
    const make = (handle, source, x, y, pointer) => ({ source, handle, x, y, sx: x, sy: y, pointer, active: false, target: null, index: -1, ghost: null, marker: null, time: 0 });
    root.addEventListener('pointerdown', event => {
        if (event.button !== 0 || state)
            return;
        const handle = event.target.closest('[data-work-drag]');
        if (!handle || handle.matches(':disabled'))
            return;
        const source = options.source(handle.dataset.workDrag);
        if (!source)
            return;
        state = make(handle, source, event.clientX, event.clientY, event.pointerId);
    }, { signal });
    window.addEventListener('pointermove', event => {
        const s = state;
        if (!s || s.pointer !== event.pointerId)
            return;
        s.x = event.clientX;
        s.y = event.clientY;
        if (!s.active && Math.hypot(s.x - s.sx, s.y - s.sy) >= 6) {
            begin(s);
            frame = requestAnimationFrame(tick);
        }
        if (s.active)
            event.preventDefault();
    }, { signal, passive: false });
    window.addEventListener('pointerup', event => { const s = state; if (!s || s.pointer !== event.pointerId)
        return; if (s.active) {
        event.preventDefault();
        s.x = event.clientX;
        s.y = event.clientY;
        point(s);
        finish();
    }
    else
        clear(''); }, { signal });
    window.addEventListener('pointercancel', () => clear('Перемещение отменено.'), { signal });
    window.addEventListener('blur', () => clear('Перемещение отменено.'), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        clear('Перемещение отменено.'); }, { signal });
    root.addEventListener('click', event => { if (performance.now() < suppress) {
        event.preventDefault();
        event.stopImmediatePropagation();
    } }, { signal, capture: true });
    root.addEventListener('keydown', event => {
        const handle = event.target.closest('[data-work-drag]');
        if (!state && handle && !handle.matches(':disabled') && [' ', 'Enter'].includes(event.key)) {
            const source = options.source(handle.dataset.workDrag);
            if (!source)
                return;
            event.preventDefault();
            const r = handle.getBoundingClientRect();
            state = make(handle, source, r.left, r.top, null);
            begin(state);
            if (state.ghost)
                state.ghost.style.transform = `translate3d(${r.left}px,${r.bottom}px,0)`;
            return;
        }
        const s = state;
        if (!s?.active || s.pointer !== null)
            return;
        if ([' ', 'Enter'].includes(event.key)) {
            event.preventDefault();
            finish();
            return;
        }
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        const choices = options.targets(s.source);
        if (!choices.length) {
            announce('Нет доступных позиций.');
            return;
        }
        s.index = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : Math.min(choices.length - 1, Math.max(0, s.index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1)));
        const target = choices[s.index];
        const group = root.querySelector('[data-work-group="' + CSS.escape(target.groupId) + '"]');
        group?.scrollIntoView({ block: 'nearest' });
        showTarget(s, target);
    }, { signal });
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && state) {
        event.preventDefault();
        event.stopPropagation();
        clear('Перемещение отменено.');
    } }, { signal, capture: true });
    return () => { disposed = true; clear(''); abort.abort(); live.remove(); };
}
