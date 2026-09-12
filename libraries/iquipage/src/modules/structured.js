"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IqTree = exports.IqPlan = void 0;
exports.registerStructured = registerStructured;
const priority_js_1 = require("./priority.js");
const components_js_1 = require("./components.js");
let treeDefaults={nodes:[],expanded:[],selected:[],focus:'',current:''};exports.configureTreeDefaults=v=>{treeDefaults=v};
class IqTree extends HTMLElement {
    nodes = structuredClone(treeDefaults.nodes);
    events;
    expanded = new Set(treeDefaults.expanded);
    selected = new Set(treeDefaults.selected);
    focused = treeDefaults.focus;
    current = treeDefaults.current;
    query = '';
    flat = new Map();
    static observedAttributes = ['items', 'checkable'];
    attributeChangedCallback() {
        if (this.isConnected)
            this.connectedCallback();
    }
    get items() { return this.nodes; }
    set items(value) { this.setAttribute('items', JSON.stringify(value)); }
    connectedCallback() {
        this.events?.abort();
        this.flat.clear();
        if (this.hasAttribute('items')) {
            const used = new Set();
            let count = 0;
            const clean = (raw, depth = 0) => !Array.isArray(raw) || depth > 12 ? [] : raw.flatMap(n => {
                if (!n || typeof n.id !== 'string' || typeof n.label !== 'string' || used.has(n.id) || ++count > 1000)
                    return [];
                used.add(n.id);
                const children = clean(n.children, depth + 1);
                return [{ id: n.id, label: n.label, ...(children.length ? { children } : {}) }];
            });
            try {
                this.nodes = clean(JSON.parse(this.getAttribute('items') || '[]'));
            }
            catch {
                this.nodes = [];
            }
        }
        this.events = new AbortController();
        const visit = (ns, p) => ns.forEach(n => {
            this.flat.set(n.id, { node: n, parent: p });
            if (n.children)
                visit(n.children, n.id);
        });
        visit(this.nodes);
        this.selected = new Set([...this.selected].filter(id => this.flat.has(id)));
        if (!this.flat.has(this.current))
            this.current = this.nodes.flatMap(n => this.leaves(n))[0] || '';
        this.innerHTML = `<div class="tree-panel"><div class="tree-top"><div><span class="sample-overline">ПРОЕКТ</span><h3>Рабочие разделы</h3></div><span class="tree-count">${this.total} документов</span></div><label class="tree-search">${components_js_1.icon('search', 17)}<input type="search" placeholder="Найти раздел" aria-label="Найти раздел в дереве"></label><div class="tree-content" role="tree" aria-label="Разделы проекта" ${this.hasAttribute('checkable') ? 'aria-multiselectable="true"' : ''}></div><p class="tree-status" role="status"></p></div>`;
        this.render();
        const signal = this.events.signal;
        this.addEventListener('input', e => { this.query = e.target.value.trim().toLocaleLowerCase('ru'); this.render(); }, { signal });
        this.addEventListener('click', e => {
            const row = e.target.closest('[data-node]');
            if (!row)
                return;
            const id = row.dataset.node, n = this.flat.get(id).node;
            this.focused = id;
            if (e.target.closest('[data-disclosure]'))
                this.toggle(id);
            else if (this.hasAttribute('checkable'))
                this.check(id);
            else if (n.children)
                this.toggle(id);
            else {
                this.current = id;
                this.render();
                this.emit();
            }
            this.focusNode(id);
        }, { signal });
        this.addEventListener('keydown', e => this.key(e), { signal });
    }
    disconnectedCallback() { this.events?.abort(); }
    get total() { return this.nodes.flatMap(n => this.leaves(n)).length; }
    emit() { this.dispatchEvent(new CustomEvent('iq-change', { bubbles: true, detail: { value: this.value } })); }
    set value(value) {
        const valid = value.filter(id => this.flat.has(id));
        if (this.hasAttribute('checkable'))
            this.selected = new Set(valid.flatMap(id => this.leaves(this.flat.get(id).node)));
        else
            this.current = valid[0] || '';
        if (this.isConnected)
            this.render();
    }
    get value() { return this.hasAttribute('checkable') ? [...this.selected] : [this.current]; }
    leaves(n) { return n.children ? n.children.flatMap(x => this.leaves(x)) : [n.id]; }
    checked(n) { const leaves = this.leaves(n), nSelected = leaves.filter(x => this.selected.has(x)).length; return nSelected === 0 ? 'false' : nSelected === leaves.length ? 'true' : 'mixed'; }
    matchesNode(n) { return !this.query || n.label.toLocaleLowerCase('ru').includes(this.query) || !!n.children?.some(x => this.matchesNode(x)); }
    render() {
        const checkable = this.hasAttribute('checkable');
        let html = '';
        const visit = (ns, level, force = false) => {
            ns.forEach((n, i) => {
                if (!force && !this.matchesNode(n))
                    return;
                const branch = !!n.children, state = this.checked(n), open = branch && (this.expanded.has(n.id) || !!this.query), count = this.leaves(n).length;
                html += `<div class="tree-row ${!checkable && this.current === n.id ? 'is-selected' : ''}" role="treeitem" aria-label="${components_js_1.escapeHTML(n.label)}" aria-level="${level}" aria-posinset="${i + 1}" aria-setsize="${ns.length}" ${branch ? `aria-expanded="${open}"` : ''} ${checkable ? `aria-checked="${state}"` : `aria-selected="${this.current === n.id}"`} tabindex="${this.focused === n.id ? 0 : -1}" data-node="${components_js_1.escapeHTML(n.id)}" style="--tree-level:${level - 1}"><span class="tree-disclosure" ${branch ? 'data-disclosure' : ''}>${branch ? components_js_1.icon('chevron', 15) : ''}</span>${checkable ? `<span class="tree-checkbox ${state}" aria-hidden="true">${state === 'true' ? components_js_1.icon('check', 14) : state === 'mixed' ? components_js_1.icon('minus', 14) : ''}</span>` : `<span class="tree-node-icon">${components_js_1.icon(branch ? (open ? 'folderOpen' : 'folder') : 'file', 19)}</span>`}<span class="tree-node-label">${components_js_1.escapeHTML(n.label)}</span>${branch ? `<span class="tree-node-count">${count}</span>` : ''}</div>`;
                if (open)
                    visit(n.children, level + 1, force || n.label.toLocaleLowerCase('ru').includes(this.query));
            });
        };
        visit(this.nodes, 1);
        const content = this.querySelector('.tree-content');
        content.innerHTML = html || '<p class="tree-no-results">Разделов с таким названием нет.</p>';
        if (!content.querySelector('[tabindex="0"]'))
            content.querySelector('[role=treeitem]')?.setAttribute('tabindex', '0');
        this.querySelector('.tree-status').textContent = checkable ? `Выбрано документов: ${this.selected.size} из ${this.total}` : `Выбран раздел: ${this.flat.get(this.current)?.node.label || ''}`;
    }
    focusNode(id) {
        const row = this.querySelector(`[data-node="${CSS.escape(id)}"]`);
        if (!row)
            return;
        this.querySelectorAll('[data-node]').forEach(x => x.tabIndex = x === row ? 0 : -1);
        this.focused = id;
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest' });
    }
    toggle(id) {
        if (this.expanded.has(id))
            this.expanded.delete(id);
        else
            this.expanded.add(id);
        this.render();
    }
    check(id) { const n = this.flat.get(id).node, leaves = this.leaves(n), all = leaves.every(x => this.selected.has(x)); leaves.forEach(x => all ? this.selected.delete(x) : this.selected.add(x)); this.render(); this.emit(); }
    key(e) {
        const row = e.target.closest('[data-node]');
        if (!row)
            return;
        const id = row.dataset.node, item = this.flat.get(id), visible = Array.from(this.querySelectorAll('[data-node]')), i = visible.indexOf(row);
        let next = '';
        switch (e.key) {
            case 'ArrowDown':
                next = visible[Math.min(i + 1, visible.length - 1)]?.dataset.node || id;
                break;
            case 'ArrowUp':
                next = visible[Math.max(0, i - 1)]?.dataset.node || id;
                break;
            case 'Home':
                next = visible[0]?.dataset.node || id;
                break;
            case 'End':
                next = visible.at(-1)?.dataset.node || id;
                break;
            case 'ArrowRight':
                if (item.node.children) {
                    if (!this.expanded.has(id)) {
                        this.toggle(id);
                        next = id;
                    }
                    else
                        next = item.node.children[0].id;
                }
                break;
            case 'ArrowLeft':
                if (item.node.children && this.expanded.has(id)) {
                    this.toggle(id);
                    next = id;
                }
                else
                    next = item.parent || id;
                break;
            case ' ':
            case 'Enter':
                if (this.hasAttribute('checkable') && e.key === ' ')
                    this.check(id);
                else if (item.node.children)
                    this.toggle(id);
                else {
                    this.current = id;
                    this.render();
                    this.emit();
                }
                next = id;
                break;
            default: return;
        }
        e.preventDefault();
        if (next)
            this.focusNode(next);
    }
}
exports.IqTree = IqTree;
/** Deadline calendar. Dates remain true calendar dates, not inferred task durations. */
class IqPlan extends HTMLElement {
    expandedDates = new Set();
    events;
    month = new Date(2026, 8, 1, 12);
    initialMonth = new Date(2026, 8, 1, 12);
    mode = 'calendar';
    tasks = [];
    static observedAttributes = ['items', 'month'];
    attributeChangedCallback() {
        if (this.isConnected)
            this.connectedCallback();
    }
    get items() { return [...this.tasks]; }
    set items(value) { this.setAttribute('items', JSON.stringify(value)); }
    connectedCallback() {
        this.events?.abort();
        this.events = new AbortController();
        const validDate = (value) => {
            if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
                return false;
            const d = new Date(value + 'T12:00:00');
            return Number.isFinite(+d) && this.fmt(d) === value;
        };
        try {
            const parsed = JSON.parse(this.getAttribute('items') || '[]');
            this.tasks = Array.isArray(parsed) ? parsed.filter(x => x && typeof x.id === 'string' && typeof x.title === 'string' && validDate(x.due)).slice(0, 1000).map(x => ({ id: x.id, title: x.title, due: x.due, owner: typeof x.owner === 'string' ? x.owner : '', status: typeof x.status === 'string' ? x.status : 'todo', priority: (0, priority_js_1.normalizePriority)(x.priority) })) : [];
        }
        catch {
            this.tasks = [];
        }
        const requested = this.getAttribute('month'), first = this.tasks.map(x => x.due).sort()[0];
        if (requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested))
            this.initialMonth = new Date(requested + '-01T12:00:00');
        else if (first)
            this.initialMonth = new Date(first.slice(0, 7) + '-01T12:00:00');
        else
            this.initialMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
        this.month = new Date(this.initialMonth);
        this.render();
        this.addEventListener('click', e => {
            const more = e.target.closest('[data-plan-more]');
            if (more) {
                const date = more.dataset.planMore;
                this.expandedDates.has(date) ? this.expandedDates.delete(date) : this.expandedDates.add(date);
                this.render();
                this.querySelector(`[data-plan-more="${date}"]`)?.focus({preventScroll:true});
                return;
            }
            const b = e.target.closest('[data-plan-month],[data-plan-mode],[data-plan-reset]');
            if (!b)
                return;
            if (b.dataset.planMonth) {
                this.month.setMonth(this.month.getMonth() + Number(b.dataset.planMonth));
                this.render();
                this.querySelector(`[data-plan-month="${b.dataset.planMonth}"]`)?.focus({ preventScroll: true });
            }
            else if (b.dataset.planMode) {
                this.mode = b.dataset.planMode;
                this.render();
                this.querySelector(`[data-plan-mode="${this.mode}"]`)?.focus({ preventScroll: true });
            }
            else {
                this.month = new Date(this.initialMonth);
                this.render();
                this.querySelector('[data-plan-month]')?.focus({ preventScroll: true });
            }
            this.dispatchEvent(new CustomEvent('iq-change', { bubbles: true, detail: { month: this.fmt(this.month).slice(0, 7), mode: this.mode } }));
        }, { signal: this.events.signal });
    }
    disconnectedCallback() { this.events?.abort(); }
    fmt(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    render() {
        const year=this.month.getFullYear(), month=this.month.getMonth(), prefix=`${year}-${String(month+1).padStart(2,'0')}`;
        const items=this.tasks.filter(t=>t.due.startsWith(prefix)).sort((a,b)=>a.due.localeCompare(b.due));
        const label=this.month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}), start=(new Date(year,month,1).getDay()+6)%7, days=new Date(year,month+1,0).getDate(), today=this.fmt(new Date());
        const state = (t)=>({done:'Готово',review:'На проверке',active:'В работе',backlog:'Запланировано'}[t.status]||'Запланировано');
        const card = t=>`<button type="button" class="plan-deadline ${t.status==='done'?'done':''}" data-open-task="${components_js_1.escapeHTML(t.id)}" aria-label="${components_js_1.escapeHTML(t.title+', '+state(t))}"><span class="plan-entry-top"><span>${components_js_1.escapeHTML(t.id)}</span>${t.status==='done'?components_js_1.icon('check',13):'<span class="plan-entry-dot" aria-hidden="true"></span>'}</span><b>${components_js_1.escapeHTML(t.title)}</b><span class="plan-entry-meta"><span>${state(t)}</span><span class="plan-person" aria-label="${components_js_1.escapeHTML(t.owner)}">${components_js_1.escapeHTML(t.owner.split(' ').filter(Boolean).map(x=>x[0]).slice(0,2).join(''))}</span></span></button>`;
        let cells='';
        for(let i=0;i<Math.ceil((start+days)/7)*7;i++){
            const n=i-start+1,date=this.fmt(new Date(year,month,n)),outside=n<1||n>days;
            if(outside){cells+=`<div class="plan-day outside ${i%7>4?'is-weekend':''}" aria-hidden="true"><div class="plan-day-head"><time>${new Date(year,month,n).getDate()}</time></div></div>`;continue;}
            const matches=items.filter(t=>t.due===date),expanded=this.expandedDates?.has(date),shown=expanded?matches:matches.slice(0,2);
            cells+=`<section class="plan-day ${date===today?'is-today':''} ${matches.length?'has-deadline':''} ${i%7>4?'is-weekend':''}" aria-label="${new Date(year,month,n).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}"><div class="plan-day-head"><time datetime="${date}">${n}</time>${date===today?'<span>Сегодня</span>':matches.length?`<span>${matches.length} ${matches.length%10===1 && matches.length%100!==11?'срок':matches.length%10>=2 && matches.length%10<=4 && !(matches.length%100>=12 && matches.length%100<=14)?'срока':'сроков'}</span>`:''}</div><div class="plan-day-entries">${shown.map(card).join('')}</div>${matches.length>2?`<button type="button" class="plan-show-more" data-plan-more="${date}" aria-expanded="${!!expanded}">${expanded?'Свернуть':`Ещё ${matches.length-2}`}${components_js_1.icon(expanded?'collapse':'plus',13)}</button>`:''}</section>`;
        }
        const dates=[...new Set(items.map(t=>t.due))];
        const agenda=dates.length?dates.map(date=>{const d=new Date(date+'T12:00:00');return `<section class="agenda-day"><div class="agenda-date"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('ru-RU',{month:'short'})}<br>${d.toLocaleDateString('ru-RU',{weekday:'short'})}</span></div><div>${items.filter(t=>t.due===date).map(t=>`<button type="button" class="agenda-task" data-open-task="${components_js_1.escapeHTML(t.id)}"><span class="agenda-state ${t.status==='done'?'done':''}">${components_js_1.icon(t.status==='done'?'check':'calendar',18)}</span><span class="agenda-task-copy"><b>${components_js_1.escapeHTML(t.title)}</b><small><span>${components_js_1.escapeHTML(t.id)}</span><span>${components_js_1.escapeHTML(t.owner)}</span></small></span><span class="agenda-state-label" data-status="${components_js_1.escapeHTML(t.status)}">${state(t)}</span>${components_js_1.icon('chevron',16)}</button>`).join('')}</div></section>`;}).join(''):'<div class="agenda-empty"><h3>На этот месяц сроков нет</h3><p>Задачи не исчезли. Вернитесь к исходному месяцу или откройте общий список.</p><button type="button" class="iq-btn secondary sm" data-plan-reset>К исходному месяцу</button></div>';
        this.innerHTML=`<div class="deadline-planner" data-mode="${this.mode}"><header class="plan-toolbar"><div><span class="sample-overline">КАЛЕНДАРЬ СРОКОВ</span><h2 aria-live="polite">${label}</h2></div><div class="plan-month-controls"><button type="button" class="iq-btn icon ghost sm" data-plan-month="-1" aria-label="Предыдущий месяц плана">${components_js_1.icon('left',17)}</button><button type="button" class="iq-btn icon ghost sm" data-plan-month="1" aria-label="Следующий месяц плана">${components_js_1.icon('chevron',17)}</button></div><div class="iq-segmented plan-modes" role="group" aria-label="Представление плана"><button type="button" data-plan-mode="calendar" aria-pressed="${this.mode==='calendar'}">${components_js_1.icon('calendar',16)}Календарь</button><button type="button" data-plan-mode="agenda" aria-pressed="${this.mode==='agenda'}">${components_js_1.icon('list',16)}По датам</button></div></header><div class="plan-month-grid"><div class="plan-weekday">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span>${x}</span>`).join('')}</div><div class="plan-days">${cells}</div></div><div class="plan-agenda">${agenda}</div><footer class="plan-legend"><span>${components_js_1.icon('calendar',16)}Срок завершения, не длительность задачи</span><span class="iq-badge sample">${items.length} задач в месяце</span></footer></div>`;
    }
}
exports.IqPlan = IqPlan;
function registerStructured() {
    if (!customElements.get('iq-tree'))
        customElements.define('iq-tree', IqTree);
    if (!customElements.get('iq-plan'))
        customElements.define('iq-plan', IqPlan);
}

