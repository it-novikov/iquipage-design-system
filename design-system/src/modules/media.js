"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IqFilePreview = void 0;
exports.configureDemoFiles = configureDemoFiles;
exports.configurePDFPreviews = configurePDFPreviews;
exports.exampleFiles = exampleFiles;
const icons_js_1 = require("./icons.js");
const esc = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const samplePDFs = new WeakMap();
let demoFactory;
/** Studio-only sample registration. Product imports do not pull in demonstration media. */
function configureDemoFiles(samples, pdfPreview) {
    demoFactory = () => samples.map(s => {
        const f = new File([Uint8Array.from(atob(s.base64), c => c.charCodeAt(0))], s.name, { type: s.type });
        if (s.type === 'application/pdf')
            samplePDFs.set(f, pdfPreview);
        return f;
    });
}
function exampleFiles() { return demoFactory?.() ?? []; }
let pdfRenderer;
/** Product apps can provide a self-hosted PDF.js renderer. No document data is sent over the network. */
function configurePDFPreviews(renderer) { pdfRenderer = renderer; }
let pdfModule;
async function defaultPDFRenderer(file, canvas, signal) {
    // Optional, pinned parser. Only library code is requested; PDF bytes stay on the device.
    // Self-host using configurePDFPreviews() for offline deployments or restrictive CSP.
    const url = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs';
    pdfModule ??= import(url).catch(e => { pdfModule = undefined; throw e; });
    const pdfjs = await pdfModule;
    if (signal.aborted)
        throw new DOMException('Aborted', 'AbortError');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, enableXfa: false, useSystemFonts: true });
    const cancel = () => { void task.destroy(); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const raw = page.getViewport({ scale: 1 });
        const view = page.getViewport({ scale: Math.min(2, 640 / raw.width, 840 / raw.height) });
        canvas.width = Math.ceil(view.width);
        canvas.height = Math.ceil(view.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: view }).promise;
    }
    finally {
        signal.removeEventListener('abort', cancel);
        void task.destroy();
    }
}
function kind(file) {
    const n = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|svg)$/.test(n))
        return 'image';
    if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/.test(n))
        return 'video';
    if (/\.(txt|md|csv|json|log)$/.test(n))
        return 'text';
    return /\.pdf$/.test(n) ? 'pdf' : 'other';
}
function wait(target, type, signal, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const done = (ev) => { clearTimeout(timer); target.removeEventListener(type, done); target.removeEventListener('error', error); signal.removeEventListener('abort', abort); resolve(ev); };
        const error = () => { cleanup(); reject(new Error('Формат не удалось прочитать')); };
        const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
        const cleanup = () => { clearTimeout(timer); target.removeEventListener(type, done); target.removeEventListener('error', error); signal.removeEventListener('abort', abort); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('Предпросмотр не готов')); }, timeout);
        target.addEventListener(type, done, { once: true });
        target.addEventListener('error', error, { once: true });
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
    });
}
/** Local preview: real file content, bounded canvas, finite video seeks, abortable lifecycle. */
class IqFilePreview extends HTMLElement {
    source;
    events;
    url = '';
    video;
    observer;
    dialog;
    seekTimer;
    seeking = false;
    desired = 0;
    poster = 0;
    running = false;
    visible = false;
    get file() { return this.source; }
    set file(f) {
        if (f === this.source)
            return;
        this.source = f;
        if (this.isConnected)
            this.mount();
    }
    connectedCallback() { this.mount(); }
    disconnectedCallback() { this.cleanup(); }
    cleanup() {
        this.events?.abort();
        this.observer?.disconnect();
        clearTimeout(this.seekTimer);
        this.seekTimer = undefined;
        this.visible = false;
        this.dialog?.close();
        this.dialog?.remove();
        this.dialog = undefined;
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
            this.video = undefined;
        }
        if (this.url) {
            URL.revokeObjectURL(this.url);
            this.url = '';
        }
        this.running = false;
        this.seeking = false;
    }
    mount() {
        this.cleanup();
        const f = this.source;
        if (!f)
            return;
        this.events = new AbortController();
        const signal = this.events.signal;
        const k = kind(f);
        this.dataset.kind = k;
        this.dataset.state = 'pending';
        this.url = URL.createObjectURL(f);
        this.innerHTML = `<button type="button" class="file-preview-button" aria-label="Предпросмотр ${esc(f.name)}"><span class="preview-loading">${icons_js_1.icon(k === 'video' ? 'video' : k === 'image' ? 'image' : 'file', 25)}</span><span class="preview-kind">${k === 'video' ? 'VIDEO' : k === 'pdf' ? 'PDF' : k === 'text' ? 'TEXT' : k === 'image' ? 'IMG' : 'FILE'}</span>${k === 'video' ? '<span class="video-scrub-track"><i></i></span>' : ''}</button>`;
        const button = this.querySelector('button');
        button.addEventListener('click', () => { void this.open().catch(() => { this.dialog?.remove(); this.dialog = undefined; button.title = 'Не удалось открыть просмотр. Попробуйте ещё раз.'; }); }, { signal });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearTimeout(this.seekTimer);
                this.seekTimer = undefined;
                this.video?.pause();
            }
        }, { signal });
        const begin = () => {
            if (!this.running) {
                this.running = true;
                void this.renderPreview(signal).catch(e => {
                    if (signal.aborted)
                        return;
                    this.dataset.state = 'unavailable';
                    button.title = 'Миниатюра недоступна. Нажмите, чтобы открыть оригинал.';
                    const badge = this.querySelector('.preview-kind');
                    if (badge)
                        badge.textContent = 'ОТКРЫТЬ';
                    const load = this.querySelector('.preview-loading');
                    if (load)
                        load.innerHTML = icons_js_1.icon('file', 25);
                });
            }
        };
        this.observer = new IntersectionObserver(entries => {
            entries.forEach(e => {
                this.visible = e.isIntersecting;
                if (e.isIntersecting) {
                    begin();
                }
                else {
                    clearTimeout(this.seekTimer);
                    this.seekTimer = undefined;
                    this.video?.pause();
                }
            });
        }, { rootMargin: '80px' });
        this.observer.observe(this);
        button.addEventListener('pointermove', e => {
            if (k !== 'video' || e.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced' || !this.video?.duration)
                return;
            const r = button.getBoundingClientRect();
            this.desired = Math.max(0, Math.min(.995, (e.clientX - r.left) / r.width)) * this.video.duration;
            const bar = this.querySelector('.video-scrub-track i');
            if (bar)
                bar.style.transform = `scaleX(${this.desired / this.video.duration})`;
            this.queueSeek();
        }, { signal });
        button.addEventListener('pointerleave', () => {
            if (k === 'video' && this.video) {
                this.desired = this.poster;
                this.queueSeek();
            }
        }, { signal });
    }
    async renderPreview(signal) {
        const f = this.source, k = kind(f), button = this.querySelector('button');
        const done = (node) => {
            if (signal.aborted)
                return;
            this.querySelector('.preview-loading')?.remove();
            button.prepend(node);
            this.dataset.state = 'ready';
        };
        if (k === 'image') {
            const img = new Image();
            img.alt = '';
            img.decoding = 'async';
            img.src = this.url;
            await img.decode();
            done(img);
            return;
        }
        if (k === 'pdf' && samplePDFs.has(f)) {
            const img = new Image();
            img.alt = '';
            img.src = samplePDFs.get(f);
            await img.decode();
            done(img);
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        if (k === 'pdf') {
            try {
                await (pdfRenderer || defaultPDFRenderer)(f, canvas, signal);
                done(canvas);
            }
            catch (e) {
                if (!signal.aborted) {
                    this.dataset.state = 'unavailable';
                    button.title = 'Для PDF нужен модуль просмотра. Нажмите, чтобы открыть оригинал.';
                }
                throw e;
            }
            return;
        }
        if (k === 'text') {
            const text = await f.slice(0, 24000).text();
            if (signal.aborted)
                return;
            canvas.width = 480;
            canvas.height = 620;
            const c = canvas.getContext('2d');
            c.fillStyle = '#fff';
            c.fillRect(0, 0, 480, 620);
            c.fillStyle = '#242426';
            c.font = '600 18px system-ui';
            c.fillText(f.name.slice(0, 36), 32, 44);
            c.fillStyle = '#55555b';
            c.fillRect(32, 63, 416, 1);
            c.font = '16px system-ui';
            let y = 100;
            for (const line of text.split('\n')) {
                let chunk = '';
                for (const word of line.split(' ')) {
                    if (c.measureText(chunk + word).width > 412) {
                        c.fillText(chunk, 32, y);
                        y += 23;
                        chunk = '';
                    }
                    chunk += word + ' ';
                }
                c.fillText(chunk, 32, y);
                y += 23;
                if (y > 596)
                    break;
            }
            done(canvas);
            return;
        }
        if (k === 'video') {
            const v = document.createElement('video');
            this.video = v;
            v.muted = true;
            v.playsInline = true;
            v.preload = 'metadata';
            v.src = this.url;
            const loaded = wait(v, 'loadedmetadata', signal);
            v.load();
            await loaded;
            if (signal.aborted)
                return;
            if (!Number.isFinite(v.duration) || !v.duration)
                throw new Error('Не удалось определить длительность');
            this.poster = Math.min(.15, v.duration / 10);
            const scale = Math.min(1, 480 / (v.videoWidth || 480), 480 / (v.videoHeight || 270));
            canvas.width = Math.round((v.videoWidth || 480) * scale);
            canvas.height = Math.round((v.videoHeight || 270) * scale);
            this.desired = this.poster;
            const seek = wait(v, 'seeked', signal);
            v.currentTime = this.poster;
            await seek;
            if (signal.aborted)
                return;
            canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
            done(canvas);
            button.title = 'Двигайте указатель по кадру. Нажмите для просмотра со звуком.';
            return;
        }
        this.dataset.state = 'unavailable';
        button.title = 'Для этого формата нет предпросмотра. Можно открыть оригинал.';
    }
    queueSeek() {
        if (!this.visible || document.hidden || this.seekTimer || this.seeking || !this.video || !this.events)
            return;
        this.seekTimer = setTimeout(() => { this.seekTimer = undefined; void this.seekFrame(); }, 100);
    }
    async seekFrame() {
        const v = this.video, signal = this.events?.signal, canvas = this.querySelector('canvas');
        if (!v || !signal || signal.aborted || !canvas)
            return;
        if (Math.abs(v.currentTime - this.desired) < .035)
            return;
        const at = this.desired;
        this.seeking = true;
        try {
            const next = wait(v, 'seeked', signal, 2500);
            v.currentTime = at;
            await next;
            if (!signal.aborted)
                canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        }
        catch { }
        finally {
            this.seeking = false;
            if (!signal.aborted && Math.abs(this.desired - at) > .035)
                this.queueSeek();
        }
    }
    async open() {
        const f = this.source;
        if (!f || this.dialog)
            return;
        const focus = this.querySelector('button');
        const d = document.createElement('dialog');
        d.className = 'media-dialog';
        d.setAttribute('aria-label', 'Предпросмотр ' + f.name);
        this.dialog = d;
        const k = kind(f);
        const safe = esc(f.name);
        d.innerHTML = `<header><div><span class="sample-overline">ЛОКАЛЬНЫЙ ФАЙЛ</span><h2>${safe}</h2></div><button class="iq-btn ghost icon" aria-label="Закрыть предпросмотр">${icons_js_1.icon('x', 20)}</button></header><div class="media-dialog-body"></div><footer><span>Оригинал остаётся на устройстве</span><a class="iq-btn secondary sm" href="${this.url}" download="${safe}">${icons_js_1.icon('download', 17)}Сохранить файл</a></footer>`;
        document.body.append(d);
        const body = d.querySelector('.media-dialog-body');
        if (k === 'video')
            body.innerHTML = `<video controls playsinline preload="metadata" src="${this.url}"></video>`;
        else if (k === 'image')
            body.innerHTML = `<img src="${this.url}" alt="${safe}">`;
        else if (k === 'text') {
            const pre = document.createElement('pre');
            pre.textContent = await f.slice(0, 250000).text();
            if (!d.isConnected)
                return;
            body.append(pre);
            if (f.size > 250000)
                body.insertAdjacentHTML('beforeend', '<p>Показаны первые 250 КБ. Полный документ доступен в оригинале.</p>');
        }
        else if (k === 'pdf') {
            const thumb = this.querySelector('canvas,img');
            let pageImage = samplePDFs.get(f) || '';
            if (!pageImage && thumb instanceof HTMLCanvasElement)
                pageImage = thumb.toDataURL('image/png');
            if (pageImage)
                body.innerHTML = `<div class="pdf-page-view"><span class="pdf-page-label">Первая страница документа</span><img src="${pageImage}" alt="Первая страница ${safe}"></div>`;
            else
                body.innerHTML = '<div class="pdf-preview-fallback"><h3>Миниатюра пока недоступна</h3><p>Для нового PDF требуется модуль просмотра. Оригинал доступен независимо от миниатюры.</p></div>';
            d.querySelector('footer').insertAdjacentHTML('beforeend', `<a class="iq-btn secondary sm" href="${this.url}" target="_blank" rel="noopener">Открыть полный PDF ${icons_js_1.icon('upRight', 17)}</a>`);
        }
        else
            body.innerHTML = '<p>Для этого формата нет предпросмотра. Сохраните файл, чтобы открыть его в подходящем приложении.</p>';
        const close = () => d.close();
        d.querySelector('header button').addEventListener('click', close);
        d.addEventListener('click', e => {
            if (e.target === d) {
                const r = d.getBoundingClientRect();
                if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                    d.close();
            }
        });
        d.addEventListener('close', () => {
            d.querySelector('video')?.pause();
            d.remove();
            this.dialog = undefined;
            if (focus?.isConnected)
                focus.focus({ preventScroll: true });
        }, { once: true });
        d.showModal();
    }
}
exports.IqFilePreview = IqFilePreview;

