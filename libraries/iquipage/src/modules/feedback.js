"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEEDBACK_TIMING = exports.PENDING_LABELS = void 0;
exports.configureFeedback = configureFeedback;
exports.pending = pending;
exports.isPending = isPending;
exports.pendingLabel = pendingLabel;
exports.actionError = actionError;
exports.clearActionError = clearActionError;
exports.trackActivity = trackActivity;
exports.activityState = activityState;
exports.onActivity = onActivity;
exports.autoPending = autoPending;
exports.recentFailure = recentFailure;
exports.announce = announce;
exports.mountActivityLine = mountActivityLine;
exports.watchConnection = watchConnection;
exports.connectionState = connectionState;
exports.reportNetworkFailure = reportNetworkFailure;
exports.saveIndicator = saveIndicator;
exports.uploadProgress = uploadProgress;
const components_js_1 = require("./components.js");
/** API: docs/action-feedback.md. */
const FEEDBACK_TIMING = { pending: 150, activity: 1000, slow: 8000, saved: 2000, attribution: 1000, grace: 80, failure: 2500 };
exports.FEEDBACK_TIMING = FEEDBACK_TIMING;
/** Timings in ms (tests and hosts may shorten or lengthen them). Returns the current values. */
function configureFeedback(values = {}) {
    for (const [key, value] of Object.entries(values))
        if (key in FEEDBACK_TIMING && Number.isFinite(Number(value)) && Number(value) >= 0)
            FEEDBACK_TIMING[key] = Number(value);
    return { ...FEEDBACK_TIMING };
}
/** The present-continuous form of a common action label, shown while it runs when it fits the button. */
const PENDING_LABELS = Object.freeze({
    'Сохранить': 'Сохраняю…', 'Создать': 'Создаю…', 'Отправить': 'Отправляю…', 'Удалить': 'Удаляю…', 'Добавить': 'Добавляю…',
    'Применить': 'Применяю…', 'Пригласить': 'Приглашаю…', 'Войти': 'Вхожу…', 'Подтвердить': 'Подтверждаю…', 'Утвердить': 'Утверждаю…',
    'Отклонить': 'Отклоняю…', 'Запустить': 'Запускаю…', 'Остановить': 'Останавливаю…', 'Подключить': 'Подключаю…', 'Отключить': 'Отключаю…',
    'Загрузить': 'Загружаю…', 'Перенести': 'Переношу…', 'Архивировать': 'Архивирую…', 'Восстановить': 'Восстанавливаю…', 'Выпустить': 'Выпускаю…',
    'Принять': 'Принимаю…', 'Связать': 'Связываю…', 'Обновить': 'Обновляю…', 'Продолжить': 'Продолжаю…', 'Выйти': 'Выхожу…'
});
exports.PENDING_LABELS = PENDING_LABELS;
function pendingLabel(text) { return PENDING_LABELS[String(text || '').trim()] || ''; }
const hasDocument = () => typeof document !== 'undefined';
// ---- Live announcements: one polite and one assertive node that stay in the document (notify uses the same pair). ----
function toastRegion() {
    let region = document.querySelector('#iq-toasts');
    if (!region) {
        region = document.createElement('section');
        region.id = 'iq-toasts';
        region.className = 'iq-toasts';
        region.setAttribute('aria-label', 'Уведомления');
        document.body.append(region);
    }
    return region;
}
function announce(text, { assertive = false } = {}) {
    if (!hasDocument() || !text)
        return;
    const region = toastRegion(), role = assertive ? 'alert' : 'status';
    let node = region.querySelector(`.iq-toast-live[role="${role}"]`);
    if (!node) {
        node = document.createElement('div');
        node.className = 'sr-only iq-toast-live';
        node.setAttribute('role', role);
        node.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
        region.append(node);
    }
    node.textContent = '';
    setTimeout(() => { node.textContent = text; }, 30);
}
// ---- Button pending state ----
/** button → group: the work it waits for (count), whether it shows, and how to put it back. */
const groups = new WeakMap();
function isPending(button) { return !!button && groups.has(button); }
let guarding = false;
/** One capturing guard for the whole document: a pending button takes no click and its form no second submit. */
function guard() {
    if (guarding || !hasDocument())
        return;
    guarding = true;
    const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    window.addEventListener('click', event => {
        const button = event.target?.closest?.('button,[role=button],a.iq-btn');
        if (button && groups.has(button))
            stop(event);
    }, true);
    // Enter in a field submits through the form's submit button: while that button is pending, nothing is sent again.
    window.addEventListener('submit', event => {
        const submitter = event.submitter || event.target?.querySelector?.('button[type=submit]');
        if (submitter && groups.has(submitter))
            stop(event);
    }, true);
}
function show(button, group) {
    if (!button.isConnected || group.shown)
        return;
    group.shown = true;
    const box = button.getBoundingClientRect();
    group.width = button.style.width;
    if (box.width)
        button.style.width = `${box.width}px`;
    const content = document.createElement('span');
    content.className = 'iq-btn-pending-content';
    content.append(...button.childNodes);
    const spinner = document.createElement('span');
    spinner.className = 'iq-spinner iq-btn-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner, content);
    group.content = content;
    group.spinner = spinner;
    const first = content.firstElementChild, text = content.textContent.trim();
    const leadingIcon = !button.classList.contains('icon') && !!text && first?.matches?.('.iq-icon') && content.firstChild === first;
    const label = group.label === undefined ? pendingLabel(text) : group.label;
    let mode = leadingIcon ? 'icon' : 'overlay';
    if (label && !button.classList.contains('icon')) {
        const shown = document.createElement('span');
        shown.className = 'iq-btn-pending-label';
        shown.textContent = label;
        button.append(shown);
        button.dataset.pending = 'label';
        // The pending label is used only when it fits the button's width; otherwise the spinner sits over the label.
        if (button.scrollWidth > button.clientWidth + 1)
            shown.remove();
        else {
            mode = 'label';
            group.labelNode = shown;
        }
    }
    button.dataset.pending = mode;
    button.setAttribute('aria-busy', 'true');
    if (label)
        announce(label);
}
function restore(button, group) {
    clearTimeout(group.timer);
    clearTimeout(group.endTimer);
    if (groups.get(button) === group)
        groups.delete(button);
    if (group.shown) {
        group.spinner?.remove();
        group.labelNode?.remove();
        if (group.content) {
            group.content.replaceWith(...group.content.childNodes);
        }
        button.style.width = group.width || '';
        if (!button.getAttribute('style'))
            button.removeAttribute('style');
        button.removeAttribute('aria-busy');
    }
    delete button.dataset.pending;
    group.done?.();
}
function startGroup(button, { label, grace = 0 } = {}) {
    guard();
    const group = { count: 0, shown: false, label, grace, failed: false, timer: 0, endTimer: 0, done: null };
    groups.set(button, group);
    button.dataset.pending = 'hold';
    clearActionError(button);
    group.timer = setTimeout(() => show(button, group), FEEDBACK_TIMING.pending);
    group.finished = new Promise(resolve => { group.done = resolve; });
    return group;
}
function join(button, promise, options) {
    const group = groups.get(button) || startGroup(button, options);
    group.count++;
    clearTimeout(group.endTimer);
    const settle = failed => {
        if (failed)
            group.failed = true;
        if (--group.count > 0 || groups.get(button) !== group)
            return;
        // A failure of explicit pending() work is the caller's to show; an automatic one waits for recentFailure().
        if (group.failed && !group.explicit)
            lastFailure = { button, at: Date.now() };
        if (group.grace)
            group.endTimer = setTimeout(() => restore(button, group), group.grace);
        else
            restore(button, group);
    };
    promise.then(() => settle(false), () => settle(true));
    return group;
}
/** API: docs/action-feedback.md. */
function pending(button, work, options = {}) {
    if (!button)
        return Promise.resolve(typeof work === 'function' ? work() : work);
    const running = groups.get(button);
    if (running?.explicit)
        return running.explicit;
    let promise;
    try {
        promise = Promise.resolve(typeof work === 'function' ? work() : work);
    }
    catch (error) {
        promise = Promise.reject(error);
    }
    const group = join(button, promise, { label: options.label, grace: 0 });
    group.grace = 0;
    // The caller continues after the button is back: an error shown next to it, or a re-render, finds it enabled.
    const result = promise.then(value => group.finished.then(() => value), error => group.finished.then(() => { throw error; }));
    group.explicit = result;
    return result;
}
// ---- Inline error next to the action ----
const errors = new WeakMap();
function clearActionError(button) { errors.get(button)?.remove(); }
/** API: docs/action-feedback.md. */
function actionError(button, error, { retry, at, title = 'Не получилось', retryLabel = 'Повторить' } = {}) {
    if (!hasDocument())
        return { remove() { } };
    clearActionError(button);
    const message = typeof error === 'string' ? error : (error?.message || 'Повторите попытку.');
    const node = document.createElement('div');
    node.className = 'iq-action-error';
    node.setAttribute('role', 'alert');
    node.innerHTML = `${components_js_1.icon('warning', 16)}<p><b>${components_js_1.escapeHTML(String(title).replace(/[.!…]+$/, ''))}.</b> ${components_js_1.escapeHTML(message)}</p>${retry ? `<button type="button" class="iq-btn ghost sm" data-action-retry>${components_js_1.escapeHTML(retryLabel)}</button>` : ''}${at ? '' : `<button type="button" class="iq-btn ghost icon sm" data-action-dismiss aria-label="Закрыть сообщение">${components_js_1.icon('x', 14)}</button>`}`;
    const controller = new AbortController();
    let removed = false;
    const remove = () => {
        if (removed)
            return;
        removed = true;
        controller.abort();
        const hadFocus = node.contains(document.activeElement);
        try {
            node.hidePopover?.();
        }
        catch { }
        node.remove();
        if (errors.get(button) === handle)
            errors.delete(button);
        if (hadFocus && button?.isConnected)
            button.focus({ preventScroll: true });
    };
    const handle = { node, remove };
    node.addEventListener('click', event => {
        if (event.target.closest('[data-action-retry]')) {
            remove();
            button?.focus({ preventScroll: true });
            retry?.();
        }
        else if (event.target.closest('[data-action-dismiss]'))
            remove();
    }, { signal: controller.signal });
    node.addEventListener('keydown', event => { if (event.key === 'Escape') {
        event.stopPropagation();
        remove();
    } }, { signal: controller.signal });
    if (at) {
        node.dataset.placement = 'inline';
        at.replaceChildren(node);
        at.hidden = false;
    }
    else if (button?.isConnected) {
        node.dataset.placement = 'float';
        node.setAttribute('popover', 'manual');
        button.after(node);
        const place = () => {
            if (!button.isConnected) {
                remove();
                return;
            }
            const box = button.getBoundingClientRect(), width = node.offsetWidth, height = node.offsetHeight;
            const left = Math.max(8, Math.min(box.left, innerWidth - width - 8));
            const below = box.bottom + 6 + height <= innerHeight - 8;
            node.style.left = `${left}px`;
            node.style.top = `${below ? box.bottom + 6 : Math.max(8, box.top - height - 6)}px`;
        };
        try {
            node.showPopover();
        }
        catch { }
        place();
        addEventListener('scroll', place, { capture: true, passive: true, signal: controller.signal });
        addEventListener('resize', place, { passive: true, signal: controller.signal });
        // The next press of the same button, or of anything else, means the message has been read.
        addEventListener('pointerdown', event => { if (!node.contains(event.target))
            remove(); }, { capture: true, signal: controller.signal });
    }
    else
        return { node, remove };
    errors.set(button, handle);
    return handle;
}
// ---- Activity: requests in flight, the line under the top bar and the slow notice ----
const activity = { items: new Set(), listeners: new Set() };
let lastActivation = null, lastFailure = null, autoOn = false;
function activityState() {
    const items = [...activity.items];
    // slowWrite: a slow change, or anything a press started — both are «an action still in progress».
    return { active: items.length, long: items.some(i => i.long), slow: items.some(i => i.slow), slowWrite: items.some(i => i.slow && (i.kind === 'write' || i.action)) };
}
function emit() { const state = activityState(); activity.listeners.forEach(fn => fn(state)); }
function onActivity(listener) { activity.listeners.add(listener); listener(activityState()); return () => activity.listeners.delete(listener); }
/**
 * Reports work in flight (a request): after FEEDBACK_TIMING.activity it lights the line, after FEEDBACK_TIMING.slow the
 * slow notice. With autoPending() on, a request that starts right after a button press also holds that button pending.
 * kind: 'read' | 'write'. Returns the same promise.
 */
function trackActivity(promise, { kind = 'read', button } = {}) {
    const item = { kind, long: false, slow: false, timers: [] };
    activity.items.add(item);
    item.timers.push(setTimeout(() => { item.long = true; emit(); }, FEEDBACK_TIMING.activity));
    item.timers.push(setTimeout(() => { item.slow = true; emit(); }, FEEDBACK_TIMING.slow));
    const target = button || attributed();
    if (target) {
        item.action = true;
        join(target, promise, { grace: FEEDBACK_TIMING.grace });
    }
    const end = () => { item.timers.forEach(clearTimeout); activity.items.delete(item); emit(); };
    promise.then(end, end);
    if (activity.items.size === 1)
        emit();
    return promise;
}
function attributed() {
    if (!autoOn || !lastActivation)
        return null;
    const { button, at } = lastActivation;
    if (Date.now() - at > FEEDBACK_TIMING.attribution || !button.isConnected) {
        lastActivation = null;
        return null;
    }
    // Only a button the person is still on (focused, or under the pointer) owns a new request: a press that opened a
    // menu or a dialog does not take over a reload that happens to start meanwhile.
    let hovered = false;
    try {
        hovered = button.matches(':hover');
    }
    catch { }
    const active = document.activeElement;
    if (!hovered && active !== button && !button.contains?.(active))
        return null;
    // A chain of requests from one press (read, then write) keeps the same button pending.
    lastActivation.at = Date.now();
    return button;
}
/**
 * Turns on automatic button feedback: a request reported with trackActivity() shortly after a press of a button takes
 * that button pending, with no code at the call site. DS buttons (.iq-btn) take part; any other control opts in with
 * data-pending-auto, and a button (or a region) opts out with data-no-pending.
 */
function autoPending({ selector = '.iq-btn,[data-pending-auto]' } = {}) {
    if (autoOn || !hasDocument())
        return;
    autoOn = true;
    guard();
    const remember = button => { if (button && !button.closest('[data-no-pending]'))
        lastActivation = { button, at: Date.now() }; };
    window.addEventListener('click', event => remember(event.target?.closest?.(selector)), true);
    window.addEventListener('submit', event => remember(event.submitter || event.target?.querySelector?.('button[type=submit]')), true);
}
/** The button whose last tracked request failed just now, so a generic error report can speak next to it. */
function recentFailure() {
    if (!lastFailure || Date.now() - lastFailure.at > FEEDBACK_TIMING.failure || !lastFailure.button.isConnected)
        return null;
    const { button } = lastFailure;
    lastFailure = null;
    return button;
}
/** The thin line of long-running work: under `host` (e.g. the top bar) or along the top of the window. */
function mountActivityLine(host) {
    const line = document.createElement('div');
    line.className = 'iq-activity-line';
    line.setAttribute('aria-hidden', 'true');
    line.innerHTML = '<span></span>';
    if (host) {
        host.classList.add('iq-activity-host');
        host.append(line);
    }
    else
        document.body.append(line);
    const stop = onActivity(state => { line.toggleAttribute('data-active', state.long); });
    return () => { stop(); line.remove(); host?.classList.remove('iq-activity-host'); };
}
// ---- Connection: slow and offline notices ----
const connection = { offline: false, listeners: new Set() };
function connectionState() { return { offline: connection.offline }; }
function setOffline(value) {
    if (connection.offline === value)
        return;
    connection.offline = value;
    connection.listeners.forEach(fn => fn(value));
}
/** A request failed before any answer (fetch TypeError, XHR error): offline when the browser agrees. */
function reportNetworkFailure() { if (typeof navigator !== 'undefined' && navigator.onLine === false)
    setOffline(true); }
const NOTICE = {
    slowWrite: ['Связь медленная', 'Действие ещё выполняется. Дождитесь ответа, нажимать повторно не нужно.'],
    slowRead: ['Связь медленная', 'Данные ещё загружаются.'],
    offline: ['Нет подключения к интернету', 'Изменения не отправятся, пока связь не вернётся. Потом страница обновится сама.'],
    online: ['Связь восстановлена', 'Данные обновлены.']
};
/**
 * The calm notices of the connection, at the top of the toast stack: «Связь медленная» while slow work runs, «Нет
 * подключения» while offline (it stays), «Связь восстановлена» for a moment after. onOnline runs when the connection
 * returns, for the host to refresh what it shows. Returns a function that stops watching.
 */
function watchConnection({ onOnline } = {}) {
    if (!hasDocument())
        return () => { };
    const controller = new AbortController();
    let node = null, kind = '', hideTimer = 0;
    const render = next => {
        clearTimeout(hideTimer);
        if (next === kind)
            return;
        kind = next;
        if (!next) {
            node?.remove();
            node = null;
            return;
        }
        const region = toastRegion();
        if (!node) {
            node = document.createElement('div');
            region.prepend(node);
        }
        const [title, text] = NOTICE[next];
        const tone = next === 'offline' ? 'warning' : next === 'online' ? 'success' : 'info';
        const glyph = { offline: 'warning', online: 'checkCircle' }[next] || 'clock';
        node.className = `iq-toast iq-connection-notice tone-${tone}`;
        node.dataset.notice = next;
        node.innerHTML = `<span class="iq-toast-icon">${components_js_1.icon(glyph, 21)}</span><div class="iq-toast-copy"><b>${components_js_1.escapeHTML(title)}</b><p>${components_js_1.escapeHTML(text)}</p></div>`;
        announce(`${title}. ${text}`, { assertive: next === 'offline' });
    };
    const update = () => {
        if (connection.offline)
            return render('offline');
        if (kind === 'online')
            return;
        const state = activityState();
        render(state.slowWrite ? 'slowWrite' : state.slow ? 'slowRead' : '');
    };
    const stopActivity = onActivity(update);
    const onChange = offline => {
        if (offline)
            return update();
        render('online');
        hideTimer = setTimeout(() => { kind = 'online-done'; render(''); update(); }, 4000);
        onOnline?.();
    };
    connection.listeners.add(onChange);
    addEventListener('offline', () => setOffline(true), { signal: controller.signal });
    addEventListener('online', () => setOffline(false), { signal: controller.signal });
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
        setOffline(true);
    update();
    return () => { controller.abort(); stopActivity(); connection.listeners.delete(onChange); clearTimeout(hideTimer); node?.remove(); };
}
// ---- Autosave state of an inline field ----
/**
 * A quiet line for an autosaving field: «Сохраняю…» (after FEEDBACK_TIMING.pending), «Сохранено» for a moment, then the
 * resting text again; «Не сохранено» with «Повторить» on failure. track(promise, {retry}) follows one save.
 */
function saveIndicator(el, { idle = '' } = {}) {
    el.classList.add('iq-save-state');
    el.setAttribute('role', 'status');
    let timer = 0, current = 0, again = null;
    el.addEventListener('click', event => { if (event.target?.closest?.('.iq-save-retry'))
        again?.(); });
    const set = (state, text, retry) => {
        again = retry || null;
        clearTimeout(timer);
        el.dataset.state = state;
        el.innerHTML = state === 'saving' ? `<span class="iq-spinner" aria-hidden="true"></span><span>${components_js_1.escapeHTML(text)}</span>`
            : state === 'error' ? `${components_js_1.icon('warning', 14)}<span>${components_js_1.escapeHTML(text)}</span>${retry ? '<button type="button" class="iq-save-retry">Повторить</button>' : ''}`
                : state === 'saved' ? `${components_js_1.icon('check', 14)}<span>${components_js_1.escapeHTML(text)}</span>` : components_js_1.escapeHTML(text);
    };
    const api = {
        idle() { set('idle', idle); },
        saving() { const id = ++current; clearTimeout(timer); timer = setTimeout(() => { if (id === current)
            set('saving', 'Сохраняю…'); }, FEEDBACK_TIMING.pending); },
        saved() { ++current; set('saved', 'Сохранено'); timer = setTimeout(() => api.idle(), FEEDBACK_TIMING.saved); },
        failed({ retry, message = 'Не сохранено' } = {}) { ++current; set('error', message, retry); },
        track(promise, { retry } = {}) {
            api.saving();
            promise.then(() => api.saved(), () => api.failed({ retry }));
            return promise;
        }
    };
    api.idle();
    return api;
}
// ---- Upload progress of one file ----
/**
 * A file row's progress: a thin bar and «12 из 40 МБ» (role=progressbar). update(loaded, total) as bytes arrive;
 * done() and failed(message, retry) end it. The row is the host's; the bar is appended to `el`.
 */
function uploadProgress(el, { name = '' } = {}) {
    const node = document.createElement('div');
    node.className = 'iq-upload-progress';
    node.innerHTML = `<div class="iq-progress" role="progressbar" aria-label="${components_js_1.escapeHTML(name ? `Загрузка ${name}` : 'Загрузка файла')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><small data-upload-text>Готовим отправку…</small>`;
    el.append(node);
    const bar = node.querySelector('.iq-progress'), text = node.querySelector('[data-upload-text]');
    let again = null;
    node.addEventListener('click', event => { if (event.target?.closest?.('.iq-save-retry'))
        again?.(); });
    const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
    return {
        node,
        update(loaded, total) {
            const percent = total ? Math.min(100, Math.round(loaded / total * 100)) : 0;
            bar.setAttribute('aria-valuenow', String(percent));
            bar.style.setProperty('--progress', `${percent}%`);
            text.textContent = total ? `${size(loaded)} из ${size(total)}` : 'Отправляю…';
            node.dataset.state = 'uploading';
        },
        done() { node.remove(); },
        failed(message = 'Файл не отправлен', retry) {
            node.dataset.state = 'error';
            again = retry || null;
            text.innerHTML = `${components_js_1.escapeHTML(message)}${retry ? ' <button type="button" class="iq-save-retry">Повторить</button>' : ''}`;
        }
    };
}
