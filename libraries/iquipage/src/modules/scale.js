"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCALE_TARGET_AT = void 0;
exports.scaleParts = scaleParts;
exports.scale = scale;
const components_js_1 = require("./components.js");
/**
 * A scale of progress against a target (0.6.0-vnext.30): what is done, what is still pending, the target as a mark and
 * an overrun beyond it. With a target, the track ends at the mark and only an overrun reaches past it, so «within or
 * not» reads without numbers. Without a target the parts are drawn against `max` (or their own sum) on a full track.
 * Values are numbers or exact decimal strings; the drawing needs only their proportions.
 */
const SCALE_TARGET_AT = 0.84;
exports.SCALE_TARGET_AT = SCALE_TARGET_AT;
const amount = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
/** The geometry of a scale as fractions of its width: track end, target mark, and the done, pending and over spans. */
function scaleParts({ target = null, done = 0, pending = 0, max = 0 } = {}) {
    const d = amount(done), p = amount(pending), hasTarget = target !== null && target !== undefined && target !== '';
    const span = (from, to) => ({ from: clamp(from, 0, 1), to: clamp(Math.max(from, to), 0, 1) });
    if (hasTarget) {
        const t = amount(target), room = 1 - SCALE_TARGET_AT;
        if (t === 0) {
            // Anything against a zero target is an overrun: the mark stands at the start and the overrun takes the room.
            return { end: 0, mark: 0, done: span(0, 0), pending: span(0, 0), over: span(0, d + p > 0 ? room : 0) };
        }
        const unit = SCALE_TARGET_AT / t, doneTo = d * unit, total = (d + p) * unit;
        return {
            end: SCALE_TARGET_AT,
            mark: SCALE_TARGET_AT,
            done: span(0, Math.min(doneTo, SCALE_TARGET_AT)),
            pending: span(Math.min(doneTo, SCALE_TARGET_AT), Math.min(total, SCALE_TARGET_AT)),
            over: span(SCALE_TARGET_AT, SCALE_TARGET_AT + clamp(total - SCALE_TARGET_AT, 0, room)),
        };
    }
    const whole = amount(max) || d + p;
    if (!whole)
        return { end: 1, mark: null, done: span(0, 0), pending: span(0, 0), over: span(0, 0) };
    const doneTo = d / whole;
    return { end: 1, mark: null, done: span(0, doneTo), pending: span(doneTo, (d + p) / whole), over: span(0, 0) };
}
const percent = fraction => `${(fraction * 100).toFixed(2)}%`;
/**
 * The scale as markup: `size` lg (a summary), md (an editor) or sm (a row); `label` is its text equivalent for screen
 * readers (the scale is an image to them); `over` names the overrun tone, `danger` by default or `success` when going
 * past the target is good.
 */
function scale({ target = null, done = 0, pending = 0, max = 0, size = 'md', label = '', over = 'danger' } = {}) {
    const parts = scaleParts({ target, done, pending, max });
    const drawn = [['done', parts.done], ['pending', parts.pending], ['over', parts.over]].filter(([, s]) => s.to > s.from);
    const first = drawn[0]?.[0], last = drawn.at(-1)?.[0];
    const segment = ([kind, s]) => `<span class="iq-scale-${kind}" style="--iq-scale-from:${percent(s.from)};--iq-scale-to:${percent(s.to)}"${kind === first && s.from === 0 ? ' data-start' : ''}${kind === last ? ' data-end' : ''}></span>`;
    const sizeName = ['lg', 'md', 'sm'].includes(size) ? size : 'md';
    return `<div class="iq-scale" data-size="${sizeName}"${over === 'success' ? ' data-over="success"' : ''} role="img" aria-label="${components_js_1.escapeHTML(label)}">`
        + (parts.end > 0 ? `<span class="iq-scale-track" style="--iq-scale-from:0%;--iq-scale-to:${percent(parts.end)}"></span>` : '')
        + drawn.map(segment).join('')
        + (parts.mark !== null ? `<span class="iq-scale-mark" style="--iq-scale-at:${percent(parts.mark)}"></span>` : '')
        + '</div>';
}
