"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IqPagination = void 0;
exports.pageWindow = pageWindow;
exports.registerPagination = registerPagination;
const components_js_1 = require("./components.js");
const interaction_js_1 = require("./interaction.js");
/** Bounded output independent of page count, with first/last page always reachable. */
function pageWindow(total, current, compact = false) {
    total = Math.max(1, Math.min(1000000, Math.trunc(total) || 1));
    current = Math.max(1, Math.min(total, Math.trunc(current) || 1));
    const limit = compact ? 5 : 7;
    if (total <= limit)
        return Array.from({ length: total }, (_, index) => index + 1);
    const radius = compact ? 0 : 1;
    if (current <= (compact ? 2 : 4))
        return [...Array.from({ length: limit - 2 }, (_, index) => index + 1), 'end-gap', total];
    if (current >= total - (compact ? 1 : 3))
        return [1, 'start-gap', ...Array.from({ length: limit - 2 }, (_, index) => total - limit + 3 + index)];
    const middle = Array.from({ length: radius * 2 + 1 }, (_, index) => current - radius + index);
    return [1, ...(middle[0] === 3 ? [2] : ['start-gap']), ...middle, ...(middle.at(-1) === total - 2 ? [total - 1] : ['end-gap']), total];
}
class IqPagination extends components_js_1.IqElement {
    compact = false;
    countId = components_js_1.uid();
    static get observedAttributes() { return ['total', 'current', 'disabled']; }
    get total() { return Math.max(1, Math.min(1000000, Math.trunc(Number(this.getAttribute('total'))) || 1)); }
    set total(value) { this.setAttribute('total', String(value)); }
    get current() { return Math.max(1, Math.min(this.total, Math.trunc(Number(this.getAttribute('current'))) || 1)); }
    set current(value) { this.setAttribute('current', String(value)); }
    attributeChangedCallback() {
        if (this.isConnected && this.querySelector('nav'))
            this.render();
    }
    mount() {
        this.compact = this.getBoundingClientRect().width < 390;
        this.render();
        this.listen(this, 'click', event => {
            const button = event.target.closest('[data-page]');
            if (!button || button.disabled)
                return;
            const token = button.dataset.page;
            const next = token === 'prev' ? this.current - 1 : token === 'next' ? this.current + 1 : Number(token);
            if (!Number.isFinite(next))
                return;
            const before = this.current;
            this.current = next;
            const focus = this.querySelector(`[data-page="${token}"]:not(:disabled)`) || this.querySelector('[aria-current="page"]');
            focus?.focus({ preventScroll: true });
            if (before !== this.current) {
                const selected = this.querySelector('[aria-current="page"]');
                if (selected)
                    interaction_js_1.transition(selected, [{ opacity: .45, transform: 'scale(.93)' }, { opacity: 1, transform: 'scale(1)' }], 180);
                this.emit('iq-change', { current: this.current, total: this.total });
            }
        });
        const observer = new ResizeObserver(entries => {
            const compact = entries[0].contentRect.width < 390;
            if (compact !== this.compact) {
                this.compact = compact;
                this.render();
            }
        });
        observer.observe(this);
        this.addCleanup(() => observer.disconnect());
    }
    render() {
        const current = this.current, total = this.total, disabled = this.hasAttribute('disabled');
        this.innerHTML = `<div class="pagination-layout" data-pagination>
      <p class="iq-helper pagination-count" id="${this.countId}" role="status" aria-live="polite">Страница ${current} из ${total}</p>
      <nav class="iq-pagination" aria-label="Страницы" aria-describedby="${this.countId}">
        <button type="button" class="page-arrow" data-page="prev" aria-label="Предыдущая страница" ${disabled || current === 1 ? 'disabled' : ''}>${components_js_1.icon('left', 18)}</button>
        <div class="page-numbers">${pageWindow(total, current, this.compact).map(token => typeof token === 'number' ? `<button type="button" data-page="${token}" aria-label="Страница ${token}" ${token === current ? 'aria-current="page"' : ''} ${disabled ? 'disabled' : ''}>${token}</button>` : '<span class="page-gap" aria-hidden="true">…</span>').join('')}</div>
        <button type="button" class="page-arrow" data-page="next" aria-label="Следующая страница" ${disabled || current === total ? 'disabled' : ''}>${components_js_1.icon('chevron', 18)}</button>
      </nav></div>`;
    }
}
exports.IqPagination = IqPagination;
function registerPagination() {
    if (!customElements.get('iq-pagination'))
        customElements.define('iq-pagination', IqPagination);
}

