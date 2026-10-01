"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_GLYPHS = void 0;
exports.statusGlyph = statusGlyph;
exports.bindTreeDrag = bindTreeDrag;
exports.treeDropPosition = treeDropPosition;
const components_js_1 = require("./components.js");
/*
 * Tree rows with aligned columns (vnext.28): the status glyph in board tones and hold-to-drag between drop zones.
 * The library never moves or saves data: a drag reports the intent, the host applies it.
 */
/** Board columns as glyphs: a shape and a tone; the grey word is only for statuses the glyph does not tell apart. */
exports.STATUS_GLYPHS = Object.freeze({
    ready: Object.freeze({ shape: 'ring', tone: 'neutral', label: 'Готово к работе', word: '' }),
    in_progress: Object.freeze({ shape: 'half', tone: 'info', label: 'В работе', word: '' }),
    review: Object.freeze({ shape: 'half', tone: 'warning', label: 'Ревью', word: 'ревью' }),
    ready_for_testing: Object.freeze({ shape: 'ring-dot', tone: 'planned', label: 'Готово к тестированию', word: 'к тестированию' }),
    testing: Object.freeze({ shape: 'half', tone: 'warning', label: 'Тестирование', word: 'тестирование' }),
    ready_for_release: Object.freeze({ shape: 'check', tone: 'success', label: 'Готово к релизу', word: '' })
});
const SHAPES = {
    ring: '<circle cx="7.5" cy="7.5" r="5.75" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    half: '<circle cx="7.5" cy="7.5" r="5.75" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 1.75a5.75 5.75 0 0 1 0 11.5z" fill="currentColor"/>',
    'ring-dot': '<circle cx="7.5" cy="7.5" r="5.75" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7.5" cy="7.5" r="2.4" fill="currentColor"/>',
    check: '<circle cx="7.5" cy="7.5" r="6.5" fill="currentColor"/><path class="iq-status-check" d="M4.6 7.7l2 2 3.9-4.4" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
};
const TONES = new Set(['neutral', 'info', 'warning', 'planned', 'success']);
/** `<span class="iq-status-glyph">` with the status shape in its tone; an unknown status is a neutral ring. */
function statusGlyph(status, options = {}) {
    const known = typeof status === 'string' ? exports.STATUS_GLYPHS[status] : null;
    const spec = known || (status && typeof status === 'object' ? status : exports.STATUS_GLYPHS.ready);
    const shape = Object.hasOwn(SHAPES, spec.shape) ? spec.shape : 'ring';
    const tone = TONES.has(spec.tone) ? spec.tone : 'neutral';
    const size = Number.isFinite(options.size) && options.size > 0 ? options.size : 15;
    const label = options.label ?? spec.label ?? '';
    return `<span class="iq-status-glyph" data-shape="${shape}" data-tone="${tone}" role="img" aria-label="${components_js_1.escapeHTML(label)}" title="${components_js_1.escapeHTML(label)}"><svg viewBox="0 0 15 15" width="${size}" height="${size}" aria-hidden="true" focusable="false">${SHAPES[shape]}</svg></span>`;
}
const level = row => Number(row.getAttribute('aria-level') || row.dataset.treeLevel || 1);
/**
 * Where a block dropped at `y` lands among the root rows of `container`: after the root row whose block (the row and
 * its deeper rows below it) ends above the middle of the next one. Dragged rows and their descendants are skipped.
 */
function treeDropPosition(container, y, { rowSelector = '[data-tree-drag]', rowAttr = 'data-tree-drag', skip = new Set() } = {}) {
    const rows = [...container.querySelectorAll(rowSelector)];
    const blocks = [];
    let skipping = 0, current = null;
    for (const row of rows) {
        const lvl = level(row);
        if (skipping && lvl > skipping)
            continue;
        skipping = 0;
        const id = row.getAttribute(rowAttr) || '';
        if (skip.has(id)) {
            skipping = lvl;
            continue;
        }
        if (lvl <= 1) {
            current = { id, first: row, last: row };
            blocks.push(current);
        }
        else if (current)
            current.last = row;
    }
    let afterId = null, before = null;
    for (const block of blocks) {
        const rect = block.first.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
            before = block;
            break;
        }
        afterId = block.id;
    }
    const box = container.getBoundingClientRect();
    let top;
    if (before)
        top = before.first.getBoundingClientRect().top - box.top;
    else if (blocks.length)
        top = blocks[blocks.length - 1].last.getBoundingClientRect().bottom - box.top;
    else
        top = null;
    return { afterId, top, empty: !blocks.length };
}
function scrollParent(node) {
    for (let el = node?.parentElement; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight)
            return el;
    }
    return document.scrollingElement || document.documentElement;
}
/**
 * Hold-to-drag in a tree: a press held for `holdMs` or moved by `slop` px lifts the row (or the items the host names)
 * and carries it over drop zones; a short click stays a click. Escape or a release outside every zone cancels.
 */
function bindTreeDrag(options) {
    const root = options?.root;
    if (!(root instanceof HTMLElement) || typeof options.onDrop !== 'function')
        throw new TypeError('bindTreeDrag needs a root element and onDrop');
    const rowSelector = options.rowSelector || '[data-tree-drag]';
    const containerSelector = options.containerSelector || '[data-tree-dropzone]';
    const holdMs = options.holdMs ?? 200, slop = options.slop ?? 6;
    const ignore = options.ignore || 'input,textarea,select,[contenteditable],[data-tree-nodrag]';
    const rowAttr = rowSelector.match(/^\[([^\]=]+)/)?.[1] || 'data-tree-drag';
    const zoneAttr = containerSelector.match(/^\[([^\]=]+)/)?.[1] || 'data-tree-dropzone';
    const html = document.documentElement;
    const live = document.createElement('p');
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    root.append(live);
    const say = text => { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); };
    let press = null, drag = null, destroyed = false;
    const idOf = row => row.getAttribute(rowAttr) || '';
    const zoneOf = node => node?.closest?.(containerSelector) || null;
    const zoneId = zone => zone?.getAttribute(zoneAttr) || '';
    const zoneName = zone => zone?.getAttribute('aria-label') || zoneId(zone);
    function clearPress() {
        if (!press)
            return;
        clearTimeout(press.timer);
        press = null;
    }
    function onPointerDown(event) {
        if (destroyed || drag || event.button !== 0 || event.isPrimary === false)
            return;
        const row = event.target.closest?.(rowSelector);
        if (!row || !root.contains(row) || event.target.closest(ignore))
            return;
        if (options.canDrag && !options.canDrag(row))
            return;
        clearPress();
        press = { row, x: event.clientX, y: event.clientY, pointerId: event.pointerId, timer: setTimeout(() => start(), holdMs) };
    }
    function start() {
        if (!press || drag)
            return;
        const { row, x, y } = press;
        clearTimeout(press.timer);
        const ids = (options.items ? options.items(row) : null) || [idOf(row)];
        const source = zoneOf(row);
        const rect = row.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'iq-tree-drag-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        const preview = options.preview ? options.preview(row, ids) || {} : {};
        ghost.innerHTML = (preview.html ?? row.outerHTML) + (preview.badge ? `<span class="iq-tree-drag-badge">${components_js_1.escapeHTML(preview.badge)}</span>` : '');
        for (const node of ghost.querySelectorAll('[id]'))
            node.removeAttribute('id');
        for (const node of ghost.querySelectorAll('[data-tree-dragging]'))
            node.removeAttribute('data-tree-dragging');
        const columns = source ? getComputedStyle(source) : null;
        if (columns) {
            ghost.style.setProperty('--tree-columns', columns.getPropertyValue('--tree-columns'));
            ghost.style.setProperty('--tree-column-gap', columns.getPropertyValue('--tree-column-gap'));
        }
        const width = Math.min(rect.width, 660);
        ghost.style.width = `${width}px`;
        ghost.popover = 'manual';
        document.body.append(ghost);
        try {
            ghost.showPopover();
        }
        catch { /* Without the Popover API the ghost is a fixed element at the end of the body. */ }
        const dragged = ids.flatMap(id => [...root.querySelectorAll(`[${rowAttr}="${CSS.escape(id)}"]`)]);
        for (const node of dragged)
            node.setAttribute('data-tree-dragging', '');
        html.setAttribute('data-tree-drag-active', '');
        getSelection?.()?.removeAllRanges();
        drag = { ids, source, row, ghost, dragged, ox: x, oy: y, dx: Math.min(Math.max(x - rect.left, 12), width - 12), dy: Math.min(Math.max(y - rect.top, 8), rect.height - 8), target: null, afterId: null, line: null, x, y, scroller: scrollParent(row), raf: 0 };
        press = null;
        place(x, y);
        say(`Перенос: ${options.label ? options.label(ids) : `задач: ${ids.length}`}. Отпустите над списком или нажмите Escape для отмены.`);
        options.onState?.(true);
        drag.raf = requestAnimationFrame(autoScroll);
    }
    function place(x, y) {
        if (!drag)
            return;
        drag.x = x;
        drag.y = y;
        drag.ghost.style.transform = `translate(${Math.round(x - drag.dx)}px,${Math.round(y - drag.dy)}px) rotate(-0.6deg)`;
        const hit = document.elementFromPoint(x, y);
        let zone = zoneOf(hit);
        if (zone && !root.contains(zone))
            zone = null;
        let position = null;
        if (zone) {
            position = treeDropPosition(zone, y, { rowSelector, rowAttr, skip: new Set(drag.ids) });
            const intent = { ids: drag.ids, containerId: zoneId(zone), afterId: position.afterId };
            if (options.canDrop && !options.canDrop(intent))
                zone = null;
        }
        if (zone !== drag.target) {
            drag.target?.removeAttribute('data-tree-drop-target');
            drag.line?.remove();
            drag.line = null;
            drag.target = zone;
            if (zone) {
                zone.setAttribute('data-tree-drop-target', '');
                say(`Цель: ${zoneName(zone)}.`);
            }
        }
        drag.afterId = position?.afterId ?? null;
        if (zone && position && position.top !== null) {
            if (!drag.line) {
                drag.line = document.createElement('span');
                drag.line.className = 'iq-tree-drop-line';
                drag.line.setAttribute('aria-hidden', 'true');
                zone.append(drag.line);
            }
            drag.line.style.top = `${Math.round(position.top)}px`;
        }
        else if (drag.line) {
            drag.line.remove();
            drag.line = null;
        }
    }
    function autoScroll() {
        if (!drag)
            return;
        const scroller = drag.scroller, page = scroller === document.scrollingElement || scroller === document.documentElement;
        const box = page ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
        const edge = 56, step = 14;
        const delta = drag.y < box.top + edge ? -step : drag.y > box.bottom - edge ? step : 0;
        if (delta) {
            scroller.scrollBy(0, delta);
            place(drag.x, drag.y);
        }
        drag.raf = requestAnimationFrame(autoScroll);
    }
    function finish(commit) {
        const current = drag;
        if (!current)
            return;
        drag = null;
        cancelAnimationFrame(current.raf);
        try {
            current.ghost.hidePopover?.();
        }
        catch { /* already hidden */ }
        current.ghost.remove();
        current.line?.remove();
        current.target?.removeAttribute('data-tree-drop-target');
        for (const node of current.dragged)
            node.removeAttribute('data-tree-dragging');
        html.removeAttribute('data-tree-drag-active');
        options.onState?.(false);
        suppressClick();
        if (!commit || !current.target) {
            say('Перенос отменён.');
            return;
        }
        const intent = { ids: current.ids, sourceContainerId: zoneId(current.source), containerId: zoneId(current.target), afterId: current.afterId };
        Promise.resolve(options.onDrop(intent)).then(result => {
            say(result?.message || 'Перенесено.');
            if (result && typeof result.undo === 'function')
                components_js_1.notify({ tone: 'success', message: result.message || 'Перенесено', action: { label: 'Отменить', run: result.undo, undo: true } });
        }, () => say('Перенос не выполнен.'));
    }
    function suppressClick() {
        const block = event => { event.preventDefault(); event.stopPropagation(); };
        window.addEventListener('click', block, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', block, { capture: true }), 0);
    }
    function onPointerMove(event) {
        if (drag) {
            event.preventDefault();
            place(event.clientX, event.clientY);
            return;
        }
        if (press && event.pointerId === press.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= slop) {
            start();
            if (drag)
                place(event.clientX, event.clientY);
        }
    }
    function onPointerUp(event) {
        if (drag) {
            // A press held in place and released without moving lifts nothing: it is cancelled, not dropped.
            finish(Math.hypot(event.clientX - drag.ox, event.clientY - drag.oy) >= slop);
            return;
        }
        clearPress();
    }
    function onKeyDown(event) {
        if (event.key === 'Escape' && drag) {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
        }
    }
    const cancel = () => { clearPress(); finish(false); };
    root.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', cancel);
    return {
        cancel,
        destroy() {
            destroyed = true;
            cancel();
            root.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', cancel);
            document.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('blur', cancel);
            live.remove();
        }
    };
}
