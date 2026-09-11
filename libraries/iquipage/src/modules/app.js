"use strict";
require("./ui-demo.js").install();
Object.defineProperty(exports, "__esModule", { value: true });
const priority_js_1 = require("./priority.js");
const board_motion_js_1 = require("./board-motion.js");
const task_kind_js_1 = require("./task-kind.js");
const task_stories_js_1 = require("./task-stories.js");
const pagination_js_1 = require("./pagination.js");
const date_field_js_1 = require("./date-field.js");
const validation_js_1 = require("./validation.js");
const revision_js_1 = require("./revision.js");
const editor_js_1 = require("./editor.js");
const interaction_js_1 = require("./interaction.js");
const sample_data_js_1 = require("./sample-data.js");
const media_js_1 = require("./media.js");
const edition_js_1 = require("./edition.js");
const components_js_1 = require("./components.js");
const ui_js_1 = require("./ui.js");
const refinements_js_1 = require("./refinements.js");
const stories_js_1 = require("./stories.js");
media_js_1.configureDemoFiles(sample_data_js_1.sampleData, sample_data_js_1.pdfSamplePreview);
editor_js_1.registerEditors();
components_js_1.registerComponents();require('./work-header.js').registerWorkHeader();
date_field_js_1.registerDateFields();
pagination_js_1.registerPagination();
(0, task_stories_js_1.installTaskStories)();
edition_js_1.installCatalog();
refinements_js_1.installRefinements();
revision_js_1.installRevision();
require('./navigation-story.js').installSideNavigationStory();
require('./advanced-stories.js').installAdvancedStories();
require('./whiteboard-stories.js').installWhiteboardStories();
require('./everyday-stories.js').installEverydayStories();
if(location.hash==='#components/data-chart')location.replace('#components/chart');
window.addEventListener('hashchange',()=>{if(location.hash==='#components/data-chart')location.replace('#components/chart')});
window.IQ_CATALOG = stories_js_1.stories.map(({ demo, ...entry }) => entry);
const initialTasks = [
    { id: 'SPR-128', title: 'Подготовить страницу нового релиза', description: 'Собрать страницу релиза 2.4: ключевые изменения, примеры и условия перехода. Основное содержание — конкретный результат, а не перечень внутренних задач.', status: 'active', owner: 'Мария Лебедева', priority: 'critical', due: '2026-09-18', start: 5, checks: [true, true, false], comments: [{ author: 'Александр Ким', text: 'В первом экране оставим результат и один следующий шаг. Детали версии — ниже.', time: 'Сегодня, 10:24' }] },
    { id: 'SPR-129', title: 'Проверить сценарий приглашения в команду', description: 'Проверить создание приглашения, смену роли и возврат к работе. Состояние ошибки не должно удалять введённый адрес.', status: 'review', owner: 'Александр Ким', priority: 'high', due: '2026-09-12', start: 4, checks: [true, true, false], comments: [] },
    { id: 'SPR-130', title: 'Уточнить состояния загрузки документов', description: 'Разделить выбор локального файла, отправку, обработку и готовность. У пользователя всегда должна быть возможность отменить действие.', status: 'active', owner: 'Дмитрий Соколов', priority: 'normal', due: '2026-09-20', start: 10, checks: [true, false, false], comments: [] },
    { id: 'SPR-131', type: 'epic', title: 'Подготовить цифровой паспорт изделия', description: 'Собрать происхождение, материал, параметры и историю обслуживания в одном документе. Это демонстрационный рабочий объект.', status: 'backlog', owner: 'Анна Волкова', priority: 'normal', due: '2026-09-25', start: 14, checks: [false, false, false], comments: [] },
    { id: 'SPR-132', title: 'Настроить семантические цвета двух тем', description: 'Зафиксировать роли текста, поверхностей, состояний и фокуса. Светлая и тёмная темы используют одинаковые имена токенов.', status: 'done', owner: 'Мария Лебедева', priority: 'normal', due: '2026-09-06', start: 1, checks: [true, true, true], comments: [] },
    { id: 'SPR-133', title: 'Согласовать структуру продуктовой библиотеки', description: 'Развести основы, компоненты, сценарии и правила качества. Каждый пример должен иметь реальное поведение и определённые границы.', status: 'done', owner: 'Александр Ким', priority: 'normal', due: '2026-09-08', start: 2, checks: [true, true, true], comments: [] }
];
const statusInfo = { backlog: { label: 'Запланировано', tone: '', icon: 'clock' }, active: { label: 'В работе', tone: 'info', icon: 'play' }, review: { label: 'На проверке', tone: 'warning', icon: 'eye' }, done: { label: 'Готово', tone: 'success', icon: 'checkCircle' } };
const owners = ['Александр Ким', 'Мария Лебедева', 'Дмитрий Соколов', 'Анна Волкова'];
const raw = components_js_1.load('tasks-v2', structuredClone(initialTasks));
let tasks = Array.isArray(raw) && raw.every(t => t && typeof t.id === 'string' && typeof t.title === 'string' && statusInfo[t.status] && Array.isArray(t.comments) && Array.isArray(t.checks)) ? structuredClone(raw) : structuredClone(initialTasks);
tasks.forEach(t => { t.priority = (0, priority_js_1.normalizePriority)(t.priority); t.type = task_kind_js_1.normalizeTaskKind(t.type || initialTasks.find(x => x.id === t.id)?.type); });
let boardCleanup = () => { };
let selection = new Set();
let taskSearch = '';
let statusFilter = 'all';
const sortOptions = [{ value: 'manual', label: 'Порядок проекта' }, { value: 'due-asc', label: 'Сначала ближайшие сроки' }, { value: 'due-desc', label: 'Сначала дальние сроки' }, { value: 'title-asc', label: 'Название: А → Я' }, { value: 'title-desc', label: 'Название: Я → А' }, { value: 'status', label: 'По статусу' }, { value: 'owner', label: 'По ответственному' }, { value: 'priority', label: 'По приоритету' }];
let sortKey = 'manual';
function sortMenu() { return `<iq-menu id="task-sort-menu">${ui_js_1.btn('Сортировка', 'secondary sm', 'sort', 'data-sort-tasks')}<div data-menu><div class="iq-popup-caption">Порядок задач</div>${sortOptions.map(option => `<button type="button" role="menuitemradio" aria-checked="${sortKey === option.value}" data-action="sort:${option.value}"><span>${option.label}</span><span class="sort-selected" aria-hidden="true">${components_js_1.icon('check', 16)}</span></button>`).join('')}</div></iq-menu>`; }
let currentTask = '';
let disposeView = () => { };
let pageEvents;
const pageTimers = new Set();
function viewDelay(fn, ms) {
    const id = setTimeout(() => { pageTimers.delete(id); fn(); }, ms);
    pageTimers.add(id);
    return id;
}
function clearViewTimers() { pageTimers.forEach(id => clearTimeout(id)); pageTimers.clear(); }
let theme = components_js_1.load('theme', 'light');
if (!['light', 'dark'].includes(theme))
    theme = 'light';
document.documentElement.dataset.theme = theme;
let reduced = components_js_1.load('reduced-motion', false);
document.documentElement.dataset.motion = reduced ? 'reduced' : 'standard';
const root = document.getElementById('app');
const route = () => {
    try {
        return decodeURIComponent(location.hash.slice(1) || 'overview');
    }
    catch {
        return 'overview';
    }
};
const go = (path) => {
    if (route() === path)
        render();
    else
        location.hash = path;
};
const taskSave = () => {
    if (!components_js_1.save('tasks-v2', tasks))
        components_js_1.notify({ tone: 'warning', message: 'Локальное хранение недоступно', description: 'Изменения останутся только до закрытия этой вкладки.' });
};
const initials = (name) => name.split(' ').map(x => x[0]).slice(0, 2).join('');
const ownerAvatar = (name, cls = '') => ui_js_1.avatar(initials(name), owners.indexOf(name) + 1, cls);
const dateShort = (date) => { const d = new Date(date + 'T12:00:00'); return isNaN(+d) ? 'Без срока' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''); };
function header(path) { return edition_js_1.siteHeader(path, theme); }
function footer() { return edition_js_1.siteFooter(); }
function overview() { return edition_js_1.home(); }
function library(path) { return edition_js_1.libraryView(path); }
let workspaceDensity = components_js_1.load('workspace-density', 'compact');
if(!['compact','comfortable'].includes(workspaceDensity))workspaceDensity='compact';
function workspace(path) {
    const mode=path.split('/')[1]||'tasks',done=tasks.filter(t=>t.status==='done').length,review=tasks.filter(t=>t.status==='review').length;
    return `<div class="page-shell work-page">${edition_js_1.exampleNav('workspace')}
    <iq-work-layout density="${workspaceDensity}" class="workspace-layout" label="Проект Sprintique">
     <iq-work-header slot="header" title="Выпуск 2.4" eyebrow="SPRINTIQUE / КОМАНДНЫЙ ПРОЕКТ" description="Контекст, задачи и решения команды."><div slot="actions" class="iq-work-toolbar-group">${ui_js_1.avatars()}${ui_js_1.btn('Новая задача','primary sm','','data-create-task')}</div></iq-work-header>
     <nav slot="navigation" class="iq-work-navigation" aria-label="Представление задач">${[['tasks','Список','list'],['board','Доска','board'],['plan','План','calendar']].map(([value,label,glyph])=>`<a href="#workspace/${value}" ${mode===value?'aria-current="page"':''}>${components_js_1.icon(glyph,16)}${label}</a>`).join('')}</nav>
     <div slot="summary" class="iq-work-summary"><span><b data-summary-count>${tasks.length}</b> задач</span><span><b data-summary-review>${review}</b> на проверке</span><span data-summary-done>${done} из ${tasks.length} завершено</span></div>
     <div slot="toolbar" class="workspace-tools"><div class="iq-search-small">${components_js_1.icon('search',16)}<input placeholder="Найти задачу…" aria-label="Найти задачу" value="${components_js_1.escapeHTML(taskSearch)}" data-task-search></div>${ui_js_1.select('Фильтр по статусу',[{value:'all',label:'Все статусы'},...Object.entries(statusInfo).map(([value,v])=>({value,label:v.label}))],`class="compact-select" id="task-status-filter" value="${statusFilter}"`)}${sortMenu()}${ui_js_1.btn(workspaceDensity==='compact'?'Компактно':'Свободно','ghost sm','','data-work-density aria-pressed="'+(workspaceDensity==='compact')+'"')}${ui_js_1.menu(ui_js_1.ib('more','Настройки проекта','ghost sm'),[{label:'Экспортировать задачи',glyph:'download',action:'export-tasks'},{label:'Сбросить демо-данные',glyph:'refresh',action:'reset-data'}])}</div>
     <div id="task-content">${renderTasks(mode)}</div>
     <p slot="footer" class="iq-work-footer workspace-reading-note">Это редактируемый демопроект. Изменения сохраняются только в браузере при доступном хранилище.</p>
    </iq-work-layout></div>${edition_js_1.siteFooter()}`;
}

function filteredTasks() {
    const filtered = tasks.filter(t => (statusFilter === 'all' || t.status === statusFilter) && (!taskSearch || (t.title + ' ' + t.id + ' ' + t.owner).toLocaleLowerCase('ru').includes(taskSearch.toLocaleLowerCase('ru'))));
    const compare = (a, b) => {
        switch (sortKey) {
            case 'due-asc': return (a.due || '9999').localeCompare(b.due || '9999');
            case 'due-desc': return (b.due || '0000').localeCompare(a.due || '0000');
            case 'title-asc': return a.title.localeCompare(b.title, 'ru', { numeric: true });
            case 'title-desc': return b.title.localeCompare(a.title, 'ru', { numeric: true });
            case 'owner': return a.owner.localeCompare(b.owner, 'ru');
            case 'priority': return priority_js_1.priorities[(0, priority_js_1.normalizePriority)(a.priority)].rank - priority_js_1.priorities[(0, priority_js_1.normalizePriority)(b.priority)].rank;
            case 'status': return Object.keys(statusInfo).indexOf(a.status) - Object.keys(statusInfo).indexOf(b.status);
            default: return 0;
        }
    };
    return filtered.sort(compare);
}
function renderTasks(mode) {
    const items = filteredTasks();
    if (!items.length)
        return ui_js_1.empty(taskSearch || statusFilter !== 'all' ? 'Задачи не найдены' : 'Пока нет задач', taskSearch || statusFilter !== 'all' ? 'Попробуйте другой запрос или сбросьте фильтр.' : 'Создайте задачу, чтобы начать работу.', ui_js_1.btn('Создать задачу', 'secondary sm', 'plus', 'data-create-task'));
    let bulk = selection.size ? `<div class="bulk-bar"><span>Выбрано: ${selection.size}</span>${ui_js_1.btn('Удалить выбранные', 'ghost sm', 'trash', 'data-bulk-delete')}</div>` : '';
    if (mode === 'board')
        return `<div class="kanban iq-board" role="region" aria-label="Доска задач. Столбцы прокручиваются вместе." tabindex="-1">${Object.entries(statusInfo).map(([status, info]) => `<section class="kanban-column" data-drop-status="${status}" aria-label="${info.label}"><div class="kanban-column-header">${components_js_1.icon(info.icon, 20)}<h3>${info.label}</h3><span class="kanban-count">${items.filter(t => t.status === status).length}</span></div><div class="column-cards" data-column-cards>${items.filter(t => t.status === status).map(t => `<article class="task-card" data-task-surface="${t.id}" data-task-emphasis="${task_kind_js_1.taskEmphasis(t)}" data-task-kind="${task_kind_js_1.normalizeTaskKind(t.type)}" data-drag-id="${t.id}" data-priority="${(0, priority_js_1.normalizePriority)(t.priority)}"><div class="task-card-top"><div class="task-identity"><button type="button" class="iq-drag-handle" data-drag-handle aria-label="Переместить ${t.id}" aria-pressed="false" aria-describedby="board-drag-help">${components_js_1.icon('grip', 16)}</button><span class="task-card-id">${t.id}</span>${task_kind_js_1.taskSignal(t)}</div>${ui_js_1.menu(ui_js_1.ib('more', `Действия ${t.id}`, 'ghost sm'), Object.entries(statusInfo).map(([key, v]) => ({ label: v.label, glyph: v.icon, action: `move:${t.id}:${key}` })))}</div><button type="button" class="task-card-title" data-open-task="${t.id}">${components_js_1.escapeHTML(t.title)}</button><div class="task-card-footer"><span class="task-due">${components_js_1.icon('calendar', 15)}<span>${dateShort(t.due)}</span></span>${ownerAvatar(t.owner)}</div></article>`).join('')}<div class="board-empty-slot" aria-hidden="true">Переместите задачу сюда</div></div></section>`).join('')}</div><p class="iq-helper board-drag-help" id="board-drag-help">Перетащите задачу за ручку. С клавиатуры: Enter — взять, стрелки — переместить, Enter — подтвердить, Escape — отменить. Перемещение также доступно через меню карточки.</p>`;
    if (mode === 'plan')
        return `<iq-plan items="${components_js_1.escapeHTML(JSON.stringify(items))}"></iq-plan>`;
    return `${bulk}<div class="iq-table-wrap workspace-table"><table class="iq-table"><caption class="sr-only">Задачи демонстрационного проекта Sprintique</caption><thead><tr><th class="check-col">${ui_js_1.check('', selection.size === items.length && items.length > 0, 'aria-label="Выбрать все задачи" data-select-all')}</th><th>Задача</th><th>Статус</th><th>Ответственный</th><th>Срок</th><th><span class="sr-only">Действия</span></th></tr></thead><tbody>${items.map(t => `<tr data-task-surface="${t.id}" data-task-emphasis="${task_kind_js_1.taskEmphasis(t)}" data-task-kind="${task_kind_js_1.normalizeTaskKind(t.type)}" data-priority="${(0, priority_js_1.normalizePriority)(t.priority)}"><td class="check-col">${ui_js_1.check('', selection.has(t.id), `aria-label="Выбрать ${t.id}" data-select-task="${t.id}"`)}</td><td class="task-title"><div class="task-row-meta"><span class="task-id">${t.id}</span>${task_kind_js_1.taskSignal(t)}</div><button type="button" data-open-task="${t.id}">${components_js_1.escapeHTML(t.title)}</button></td><td>${ui_js_1.badge(statusInfo[t.status].label, statusInfo[t.status].tone)}</td><td class="task-owner-cell"><div class="task-person">${ownerAvatar(t.owner)}<span>${components_js_1.escapeHTML(t.owner.split(' ')[0])}</span></div></td><td class="task-date-cell">${dateShort(t.due)}</td><td class="task-actions-cell">${ui_js_1.menu(ui_js_1.ib('more', `Действия ${t.id}`, 'ghost sm'), [{ label: 'Открыть задачу', glyph: 'expand', action: `open:${t.id}` }, { label: 'Завершить', glyph: 'checkCircle', action: `move:${t.id}:done` }, { label: 'Удалить', glyph: 'trash', danger: true, action: `delete:${t.id}` }])}</td></tr>`).join('')}</tbody></table></div><div class="workspace-table-foot"><span>${items.length} из ${tasks.length} задач / все названия доступны полностью</span><span>Демо-сценарий / не серверные данные</span></div>`;
}
function foundations() { return edition_js_1.rulesView('rules/principles'); }
const motions = [
    ['press', 'Press response', '120 ms', 'Нажатие без изменения компоновки.'], ['lift', 'Hover elevation', '180 ms', 'Небольшая глубина, не прыжок.'], ['focus', 'Field ribbon', '320 ms', 'Локальный свет внутри поля.'], ['switch', 'Switch translation', '220 ms', 'Одна ручка, два состояния.'], ['select', 'Select reveal', '160 ms', 'Появление рядом с источником.'], ['enter', 'Dialog entrance', '240 ms', 'Вход в отдельную задачу.'], ['drawer', 'Drawer entrance', '300 ms', 'Сохранение пространственной связи.'], ['toast', 'Toast entrance', '260 ms', 'Отклик без захвата внимания.'], ['progress', 'Progress change', '340 ms', 'Непрерывность значения.'], ['reorder', 'List relocation', '340 ms', 'Видно, что именно переместилось.'], ['chart', 'Chart trace', '900 ms', 'Только демонстрационный график.'], ['material', 'Light settle', '900 ms', 'Редкий брендовый переход.']
];
function motion() { return edition_js_1.rulesView('rules/motion'); }
function brand() { return edition_js_1.rulesView('rules/principles'); }
function objects() { return edition_js_1.objectView(); }
function staticDialogs() {
    return `
<iq-dialog id="command-dialog"><h2 class="sr-only">Поиск по системе</h2><div class="iq-command-input">${components_js_1.icon('search', 22)}<input placeholder="Найти компонент или раздел…" aria-label="Поиск по системе" id="command-input" autocomplete="off"><kbd>esc</kbd></div><div class="iq-command-list" id="command-results"></div><div class="iq-command-foot">↑ ↓ — выбрать &nbsp; Enter — открыть &nbsp; Esc — закрыть</div></iq-dialog>
<iq-dialog id="demo-dialog"><div class="iq-dialog-brand">${components_js_1.icon('users', 24)}</div><div class="iq-dialog-head"><div><h2>Пригласить в пространство.</h2><p>Подготовьте приглашение для нового участника.</p></div>${ui_js_1.ib('x', 'Закрыть диалог', 'ghost sm', 'data-close')}</div><form id="invite-demo-form" class="stack iq-dialog-form" novalidate>${ui_js_1.field('Рабочая почта', '', { type: 'email', placeholder: 'name@company.com', name: 'email', required: true })}${ui_js_1.select('Роль', ['Редактор', 'Наблюдатель', 'Администратор'], 'name="role"')}<p class="iq-helper form-note">Это пример. Приглашение не будет отправлено.</p><div class="iq-dialog-footer">${ui_js_1.btn('Отмена', 'secondary', '', 'data-close')}${ui_js_1.btn('Подготовить', 'primary', 'arrow', 'data-invite-demo')}</div></form></iq-dialog>
<iq-dialog id="demo-drawer" kind="drawer"><div class="iq-dialog-head"><div><h2>Настройки пространства.</h2><p>Локальный пример панели с сохранением.</p></div>${ui_js_1.ib('x', 'Закрыть панель', 'ghost sm', 'data-close')}</div><form id="workspace-settings" class="stack">${ui_js_1.field('Название', components_js_1.load('space-name', 'IQUIPAGE Studio'), { name: 'title' })}${ui_js_1.textarea('Описание', 'Пространство для общей работы над продуктами.', { name: 'description' })}<div class="iq-settings-list"><div class="iq-setting-row"><div><b>История изменений</b><p>Сохранять версии документов</p></div>${ui_js_1.toggle('История изменений', true, '', false)}</div><div class="iq-setting-row"><div><b>Только для участников</b><p>Ограничить доступ к материалам</p></div>${ui_js_1.toggle('Ограниченный доступ', true, '', false)}</div><div class="iq-dialog-footer">${ui_js_1.btn('Закрыть', 'secondary', '', 'data-close')}${ui_js_1.btn('Сохранить локально', 'primary', 'check', 'data-save-settings')}</div></div></form></iq-dialog>
<iq-dialog id="confirm-dialog"><div class="iq-dialog-brand" style="background:var(--iq-danger-bg);color:var(--iq-danger)">${components_js_1.icon('trash', 23)}</div><div class="iq-dialog-head"><div><h2 id="confirm-title">Удалить пример?</h2><p id="confirm-description">Демонстрация подтверждения действия. Реальные данные не затрагиваются.</p></div>${ui_js_1.ib('x', 'Закрыть подтверждение', 'ghost sm', 'data-close')}</div><div class="iq-dialog-footer">${ui_js_1.btn('Отмена', 'secondary', '', 'data-close')}${ui_js_1.btn('Подтвердить', 'danger', 'trash', 'data-confirm-run')}</div></iq-dialog>
<iq-dialog id="code-dialog"><div class="iq-dialog-head"><div><h2 id="code-title">Компонент</h2><p>Разметка рабочего примера.</p></div>${ui_js_1.ib('x', 'Закрыть исходный код', 'ghost sm', 'data-close')}</div><div class="code-panel code-dialog"><pre id="code-content"></pre></div><div class="iq-dialog-footer">${ui_js_1.btn('Скопировать код', 'primary', 'copy', 'data-copy-story')}</div></iq-dialog>
<iq-dialog id="service-dialog"><div class="iq-dialog-head"><div><h2>Обслуживание изделия.</h2><p>Подготовьте описание запроса. Отправка в сервис не подключена.</p></div>${ui_js_1.ib('x', 'Закрыть запрос', 'ghost sm', 'data-close')}</div><form id="service-form" class="stack">${ui_js_1.field('Серийный номер', 'IQ—2026—001', { readonly: true, name: 'serial' })}${ui_js_1.textarea('Что произошло?', components_js_1.load('service-draft', ''), { placeholder: 'Опишите запрос…', name: 'message', maxlength: 1000 })}<div class="iq-dialog-footer">${ui_js_1.btn('Закрыть', 'secondary', '', 'data-close')}${ui_js_1.btn('Сохранить черновик', 'primary', 'check', 'data-service-save')}</div></form></iq-dialog>`;
}
function render() {
    boardCleanup();
    disposeView();
    clearViewTimers();
    pageEvents?.abort();
    pageEvents = new AbortController();
    document.querySelectorAll('iq-dialog').forEach(dialog => {
        if (dialog.open)
            dialog.close(true);
    });
    const path = route(), family = path.split('/')[0];
    const html = family === 'components' ? library(path) : family === 'workspace' ? workspace(path) : family === 'examples' ? edition_js_1.examplesView() : family === 'landing' ? edition_js_1.landingView() : family === 'rules' ? edition_js_1.rulesView(path) : family === 'foundations' ? foundations() : family === 'motion' ? motion() : family === 'brand' ? brand() : family === 'objects' ? objects() : overview();
    root.dataset.route = path;
    root.innerHTML = header(path) + `<main id="main" tabindex="-1">${html}</main>`;
    const removeControls = components_js_1.enhance(root), removeEdition = edition_js_1.bindEdition(root), removeRefinements = refinements_js_1.bindRefinements(root);
    disposeView = () => { removeControls(); removeEdition(); removeRefinements(); };
    const title = root.querySelector('h1')?.textContent || 'Обзор';
    document.title = `${title} / IQUIPAGE`;
    bindPage();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (document.activeElement === document.body && location.hash)
        root.querySelector('#main')?.focus({ preventScroll: true });
}
function commandResults(q = '') {
    const results = document.getElementById('command-results');
    const pages = [{ title: 'Обзор системы', sub: 'От содержания к форме', path: 'overview', glyph: 'grid' }, { title: 'Компоненты', sub: 'Пример, состояния, использование и код', path: 'components/button', glyph: 'sliders' }, { title: 'Рабочее приложение', sub: 'Sprintique: задачи, доска, план', path: 'workspace', glyph: 'list' }, { title: 'Лендинг', sub: 'Обещание и предметный сценарий', path: 'landing', glyph: 'upRight' }, { title: 'Цифровой паспорт', sub: 'Физический продукт и сервис', path: 'objects', glyph: 'box' }, { title: 'Правила системы', sub: 'Исследование и визуальные решения', path: 'rules/principles', glyph: 'text' }, { title: 'Типографика', sub: 'Кириллица, масштаб и ритм', path: 'rules/typography', glyph: 'text' }, { title: 'Движение', sub: 'Переходы и ограничения', path: 'rules/motion', glyph: 'play' }, { title: 'Голос продукта', sub: 'Tone of voice и тексты интерфейса', path: 'rules/voice', glyph: 'message' }, { title: 'Графика и медиа', sub: 'Чёткая отрисовка и подготовка изображений', path: 'rules/media', glyph: 'eye' }];
    const all = [...pages, ...stories_js_1.stories.map(s => ({ title: s.title, sub: edition_js_1.originalNames.get(s.id) || '', path: `components/${s.id}`, glyph: 'code' }))];
    const match = all.filter(x => (x.title + ' ' + x.sub).toLocaleLowerCase('ru').includes(q.toLocaleLowerCase('ru'))).slice(0, q ? 18 : 6);
    results.innerHTML = match.length ? match.map(x => `<button type="button" data-command-go="${x.path}">${components_js_1.icon(x.glyph, 18)}<span>${components_js_1.escapeHTML(x.title)}<small>${components_js_1.escapeHTML(x.sub)}</small></span>${components_js_1.icon('arrow', 15)}</button>`).join('') : '<p class="iq-helper" style="padding:20px 14px">Ничего не найдено. Измените запрос.</p>';
}
function openCommand() { commandResults(); document.getElementById('command-dialog').show(); const input = document.getElementById('command-input'); input.value = ''; input.focus(); }
function openCreateTask() {
    document.getElementById('create-task-dialog')?.remove();
    const draft = components_js_1.load('task-draft', {});
    const modal = document.createElement('iq-dialog');
    modal.id = 'create-task-dialog';
    modal.innerHTML = `<div class="iq-dialog-head"><div><span class="eyebrow no-line" style="font-size:12px;margin-bottom:12px">SPRINTIQUE / НОВАЯ ЗАДАЧА</span><h2>Следующий шаг.</h2><p>Опишите результат, к которому нужно прийти.</p></div>${ui_js_1.ib('x', 'Закрыть создание задачи', 'ghost sm', 'data-close')}</div><form id="create-task-form" class="stack" novalidate>${ui_js_1.field('Название задачи', draft.title || '', { placeholder: 'Что должно быть сделано?', name: 'title', required: true, max: 140 })}${ui_js_1.textarea('Описание', draft.description || '', { name: 'description', placeholder: 'Цель, контекст и критерий готовности…', maxlength: 1600 })}<div class="grid-2" style="gap:18px">${ui_js_1.select('Ответственный', owners.map(x => ({ value: x, label: x, icon: 'user' })), `name="owner" value="${components_js_1.escapeHTML(draft.owner || owners[0])}"`)}${ui_js_1.field('Срок', draft.due ?? '2026-09-18', { type: 'date', name: 'due' })}</div>${ui_js_1.select('Приоритет', (0, priority_js_1.priorityOptions)(), `name="priority" value="${(0, priority_js_1.normalizePriority)(draft.priority)}"`)}<p class="iq-helper">Черновик сохраняется в браузере при доступном хранилище. Иначе — до закрытия вкладки.</p><div class="iq-dialog-footer">${ui_js_1.btn('Закрыть', 'secondary', '', 'data-close')}${ui_js_1.btn('Создать задачу', 'primary', 'plus', 'data-submit-task')}</div></form>`;
    document.getElementById('portals').append(modal);
    components_js_1.enhance(modal);
    modal.show();
}
function openTask(id) {
    const t = tasks.find(x => x.id === id);
    if (!t)
        return;
    currentTask = id;
    document.getElementById('task-drawer')?.remove();
    const modal = document.createElement('iq-dialog');
    modal.id = 'task-drawer';
    modal.setAttribute('kind', 'drawer');
    modal.dataset.taskPriority = (0, priority_js_1.normalizePriority)(t.priority);
    modal.innerHTML = `<div class="task-document-toolbar"><nav class="iq-breadcrumb" aria-label="Задача"><span>Sprintique</span>${components_js_1.icon('chevron', 14)}<span>${t.id}</span></nav><div class="row">${ui_js_1.ib('expand', 'Открыть задачу на весь экран', 'ghost sm', 'data-task-expand aria-pressed="false"')}${ui_js_1.ib('x', 'Закрыть задачу', 'ghost sm', 'data-close')}</div></div>
    <div class="task-document"><header class="task-document-heading"><span class="sample-overline">${t.type === 'epic' ? 'ЭПИК' : 'РАБОЧАЯ ЗАДАЧА'}</span><h2 class="task-drawer-title">${components_js_1.escapeHTML(t.title)}</h2></header>
    <aside class="task-document-properties" aria-label="Свойства задачи">
      <div>${ui_js_1.select('Статус', Object.entries(statusInfo).map(([value, v]) => ({ value, label: v.label })), `id="task-drawer-status" value="${t.status}"`)}</div>
      <div>${ui_js_1.select('Тип задачи', task_kind_js_1.taskKindOptions(), `id="task-drawer-kind" value="${task_kind_js_1.normalizeTaskKind(t.type)}"`)}</div>
      <div>${ui_js_1.select('Приоритет', (0, priority_js_1.priorityOptions)(), `id="task-drawer-priority" value="${(0, priority_js_1.normalizePriority)(t.priority)}"`)}<span class="priority-detail-caption" data-priority-preview>${(0, priority_js_1.priorityBadge)(t.priority)}</span></div>
      <div class="task-property-person"><span class="iq-control-label">Ответственный</span><div class="task-person">${ownerAvatar(t.owner)}<span>${components_js_1.escapeHTML(t.owner)}</span></div></div>
      <div><iq-date-field id="task-drawer-due" label="Срок" value="${components_js_1.escapeHTML(t.due || '')}"></iq-date-field></div>
      <p class="task-detail-save" role="status" data-task-save-state>${components_js_1.icon('check', 15)}<span>Изменения сохраняются локально</span></p>
    </aside>
    <div class="task-document-body"><section class="task-drawer-section"><h3>Описание</h3><p>${components_js_1.escapeHTML(t.description || 'Описание ещё не добавлено.')}</p></section>
      <section class="task-drawer-section"><h3>Критерии готовности</h3><div class="task-evidence stack sm">${['Результат соответствует задаче', 'Материалы приложены и доступны', 'Результат проверен человеком'].map((x, i) => ui_js_1.check(x, t.checks[i], `data-task-check="${i}"`)).join('')}</div></section>
      <section class="task-drawer-section"><h3>Обсуждение <span class="muted" id="comments-count">${t.comments.length}</span></h3><div id="task-comments">${commentsHTML(t)}</div><div class="comment-compose"><iq-markdown-editor id="new-comment" variant="minimal" submit-label="Отправить" label="Комментарий к задаче" placeholder="Добавить комментарий…" maxlength="2000" name="comment"></iq-markdown-editor><p class="iq-helper comment-storage">Сохранится в этом браузере.</p><span class="sr-only" data-comment-status role="status"></span></div></section>
    </div><footer class="iq-dialog-footer task-document-footer">${ui_js_1.btn('Закрыть', 'secondary', '', 'data-close')}${ui_js_1.btn(t.status === 'done' ? 'Вернуть в работу' : 'Завершить задачу', 'primary', t.status === 'done' ? 'refresh' : 'check', 'data-complete-task')}</footer></div>`;
    document.getElementById('portals').append(modal);
    components_js_1.enhance(modal);
    modal.show();
    const sourceView = document.getElementById('task-content'), sourceRoute = route();
    modal.addEventListener('iq-close', () => { if (route() === sourceRoute && document.getElementById('task-content') === sourceView && sourceView) {
        refreshTasks();
        document.querySelector(`[data-open-task="${id}"]`)?.focus({ preventScroll: true });
    } });
}
function toggleTaskView(button) {
    const host = document.getElementById('task-drawer');
    if (!host)
        return;
    const expanded = host.toggleAttribute('expanded');
    const dialog = host.querySelector('dialog');
    dialog.classList.toggle('is-fullscreen', expanded);
    button.innerHTML = components_js_1.icon(expanded ? 'collapse' : 'expand', 18);
    button.setAttribute('aria-pressed', String(expanded));
    button.setAttribute('aria-label', expanded ? 'Вернуть в боковую панель' : 'Открыть задачу на весь экран');
    // Keep existing editors/selection intact. Only reveal the new composition.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion !== 'reduced') {
        const body = host.querySelector('.task-document');
        body.getAnimations().forEach(a => a.cancel());
        body.animate([{ opacity: .65, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
}
function setPriority(id, value) {
    const t = tasks.find(t => t.id === id);
    if (!t)
        return;
    t.priority = (0, priority_js_1.normalizePriority)(value);
    taskSave();
    refreshTasks();
    const modal = document.getElementById('task-drawer');
    if (modal) {
        modal.dataset.taskPriority = t.priority;
        modal.querySelector('[data-priority-preview]').innerHTML = (0, priority_js_1.priorityBadge)(t.priority);
        modal.querySelector('[data-task-save-state] span').textContent = 'Приоритет сохранён';
    }
}
function commentsHTML(t) { return t.comments.length ? t.comments.map(c => `<article class="comment">${ownerAvatar(c.author)}<div><b>${components_js_1.escapeHTML(c.author)}</b><small>${components_js_1.escapeHTML(c.time)}</small><div class="comment-body">${editor_js_1.safeMarkdown(c.text)}</div></div></article>`).join('') : '<p class="comments-empty">Начните обсуждение результата.</p>'; }
function refreshTasks() {
    const content = document.getElementById('task-content');
    if (!content)
        return;
    const oldBoard = content.querySelector('.iq-board'), scroll = oldBoard ? { top: oldBoard.scrollTop, left: oldBoard.scrollLeft } : null;
    boardCleanup();
    content.innerHTML = renderTasks(route().split('/')[1] || 'tasks');
    if (scroll) {
        const next = content.querySelector('.iq-board');
        if (next) {
            next.scrollTop = scroll.top;
            next.scrollLeft = scroll.left;
        }
    }
    components_js_1.enhance(content);
    bindDrag(content);
    const done = tasks.filter(t => t.status === 'done').length, review = tasks.filter(t => t.status === 'review').length;
    const countNode = document.querySelector('[data-summary-count]'), reviewNode = document.querySelector('[data-summary-review]'), doneNode = document.querySelector('[data-summary-done]');
    if (countNode)
        countNode.textContent = String(tasks.length);
    if (reviewNode)
        reviewNode.textContent = String(review);
    if (doneNode)
        doneNode.textContent = `${done} из ${tasks.length} завершено`;
    const workProgress = document.querySelector('.work-summary [role=progressbar]');
    if (workProgress) {
        const pct = Math.round(done / Math.max(1, tasks.length) * 100);
        workProgress.style.setProperty('--progress', pct + '%');
        workProgress.setAttribute('aria-valuenow', String(pct));
    }
    const summary = document.querySelectorAll('.summary-data>b');
    if (summary.length === 3) {
        summary[0].textContent = String(tasks.length).padStart(2, '0');
        summary[1].innerHTML = String(done).padStart(2, '0') + '<span>/ ' + tasks.length + '</span>';
        summary[2].textContent = String(review).padStart(2, '0');
    }
    const sidebar = document.querySelector('.workspace-side-release');
    if (sidebar) {
        sidebar.querySelector('p').textContent = `${done} из ${tasks.length} задач завершено`;
        const bar = sidebar.querySelector('[role=progressbar]');
        const percent = Math.round(done / Math.max(1, tasks.length) * 100);
        if (bar) {
            bar.setAttribute('aria-valuenow', String(percent));
            bar.style.setProperty('--progress', percent + '%');
        }
    }
    const count = document.querySelector('.workspace-sidebar .count');
    if (count)
        count.textContent = String(tasks.length);
    const insight = document.querySelector('.workspace-insight p');
    if (insight)
        insight.textContent = (review ? `${review} ${review === 1 ? 'задача ожидает' : 'задачи ожидают'} решения команды.` : 'Задач на проверке пока нет.') + ' Откройте материалы и подтвердите результат.';
    const all = document.querySelector('[data-select-all]');
    if (all)
        all.indeterminate = selection.size > 0 && selection.size < filteredTasks().length;
}
function setStatus(id, status) {
    const t = tasks.find(t => t.id === id);
    if (!t)
        return;
    const before = t.status;
    t.status = status;
    taskSave();
    refreshTasks();
    components_js_1.notify({ tone: 'success', message: 'Статус обновлён', description: statusInfo[status].label, action: { label: 'Отменить', run: () => { t.status = before; taskSave(); refreshTasks(); } } });
}
function removeTask(id) {
    const index = tasks.findIndex(t => t.id === id);
    if (index < 0)
        return;
    const removed = tasks.splice(index, 1)[0];
    selection.delete(id);
    taskSave();
    refreshTasks();
    components_js_1.notify({ message: 'Задача удалена', description: removed.title, action: { label: 'Отменить', run: () => { tasks.splice(index, 0, removed); taskSave(); refreshTasks(); } } });
}
let confirmAction = () => components_js_1.notify({ tone: 'info', message: 'Пример подтверждения завершён' });
function confirm(title, description, action) { confirmAction = action; document.getElementById('confirm-title').textContent = title; document.getElementById('confirm-description').textContent = description; document.getElementById('confirm-dialog').show(); }
function exportTokens() {
    components_js_1.downloadJSON('iquipage-semantic-tokens.json', window.IQ_TOKENS);
    components_js_1.notify({ tone: 'success', message: 'Файл токенов подготовлен' });
}
function playMotion(key) {
    const stage = document.querySelector(`.motion-stage[data-effect="${key}"]`);
    if (!stage)
        return;
    stage.classList.remove('playing');
    void stage.offsetWidth;
    stage.classList.add('playing');
}
function bindPage() {
    const densityButton=root.querySelector('[data-work-density]');
    densityButton?.addEventListener('click',()=>{workspaceDensity=workspaceDensity==='compact'?'comfortable':'compact';components_js_1.save('workspace-density',workspaceDensity);root.querySelector('.workspace-layout').density=workspaceDensity;densityButton.textContent=workspaceDensity==='compact'?'Компактно':'Свободно';densityButton.setAttribute('aria-pressed',String(workspaceDensity==='compact'));},{signal:pageEvents.signal});
    bindDrag(root);
    const all = document.querySelector('[data-select-all]');
    if (all)
        all.indeterminate = selection.size > 0 && selection.size < filteredTasks().length;
    const compact = document.documentElement.dataset.density === 'compact';
    if (compact)
        document.querySelector('.workspace-table')?.classList.add('compact');
}
function bindDrag(parent) {
    boardCleanup();
    const board = parent.querySelector('.iq-board');
    boardCleanup = board ? (0, board_motion_js_1.bindBoard)(board, detail => {
        const old = structuredClone(tasks), index = tasks.findIndex(t => t.id === detail.id);
        if (index < 0 || !statusInfo[detail.status])
            return;
        const task = tasks.splice(index, 1)[0];
        task.status = detail.status;
        const before = detail.beforeId ? tasks.findIndex(t => t.id === detail.beforeId) : -1;
        if (before >= 0)
            tasks.splice(before, 0, task);
        else {
            const last = tasks.map(t => t.status).lastIndexOf(detail.status);
            tasks.splice(last < 0 ? tasks.length : last + 1, 0, task);
        }
        sortKey = 'manual';
        taskSave();
        refreshTasks();
        if (detail.keyboard)
            document.querySelector(`[data-drag-id="${detail.id}"] [data-drag-handle]`)?.focus({ preventScroll: true });
        components_js_1.notify({ tone: 'success', message: 'Задача перемещена', description: `${detail.id}: ${statusInfo[detail.status].label}`, action: { label: 'Отменить', run: () => { tasks = old; taskSave(); refreshTasks(); } } });
    }) : () => { };
}
function validateForm(form) { return validation_js_1.validateFields(form); }
function submitTask() {
    const form = document.getElementById('create-task-form');
    if (!form)
        return;
    if (!validateForm(form)) {
        return;
    }
    const data = new FormData(form), nextId = Math.max(133, ...tasks.map(t => +t.id.replace('SPR-', '')).filter(Number.isFinite)) + 1;
    const due = String(data.get('due') || '');
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        const control = form.querySelector('iq-date-field');
        control?.setAttribute('aria-invalid', 'true');
        control?.querySelector('button')?.focus();
        return;
    }
    const task = { id: `SPR-${nextId}`, title: String(data.get('title') || '').trim(), description: String(data.get('description') || ''), owner: String(data.get('owner') || owners[0]), due, status: 'backlog', priority: (0, priority_js_1.normalizePriority)(String(data.get('priority') || 'normal')), start: 5, checks: [false, false, false], comments: [] };
    tasks.unshift(task);
    taskSave();
    components_js_1.save('task-draft', {});
    document.getElementById('create-task-dialog').close();
    go('workspace/tasks');
    components_js_1.notify({ tone: 'success', message: 'Задача создана', description: task.title, action: { label: 'Открыть', run: () => openTask(task.id) } });
}
function sendComment() {
    const editor = document.getElementById('new-comment'), text = editor?.value.trim();
    if (!text) {
        editor?.focusEditor();
        return;
    }
    const task = tasks.find(t => t.id === currentTask);
    if (!task || text.length > 2000)
        return;
    task.comments.push({ author: owners[0], text, time: 'Только что' });
    taskSave();
    document.getElementById('task-comments').innerHTML = commentsHTML(task);
    document.getElementById('comments-count').textContent = String(task.comments.length);
    editor.value = '';
    const button = document.querySelector('#new-comment [data-md-submit]');
    if (button)
        button.disabled = true;
    const status = document.querySelector('[data-comment-status]');
    if (status)
        status.textContent = 'Комментарий добавлен в локальное обсуждение.';
    editor?.focusEditor();
}
document.body.addEventListener('click', async (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    const surface = target?.closest('[data-task-surface]');
    const interactive = target?.closest('button,a,input,textarea,select,label,iq-menu,iq-select,[role="button"]');
    if (surface && !interactive && !window.getSelection()?.toString()) {
        openTask(surface.dataset.taskSurface);
        return;
    }
    const el = ev.target.closest('button,a,[data-action]');
    if (!el)
        return;
    if (el.dataset.go) {
        go(el.dataset.go);
        return;
    }
    if (el.hasAttribute('data-command')) {
        openCommand();
        return;
    }
    if (el.dataset.commandGo) {
        const [path, focus] = el.dataset.commandGo.split('?focus=');
        document.getElementById('command-dialog').close();
        go(path);
        if (focus)
            setTimeout(() => { document.getElementById('story-' + focus)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 90);
        return;
    }
    if (el.hasAttribute('data-theme-toggle')) {
        theme = theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = theme;
        components_js_1.save('theme', theme);
        el.innerHTML = components_js_1.icon(theme === 'light' ? 'moon' : 'sun', 17);
        el.setAttribute('aria-label', theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему');
        const caption = document.querySelector('.library-toolbar>.row>span:last-child');
        if (caption)
            caption.textContent = theme === 'light' ? 'Светлая тема' : 'Тёмная тема';
        return;
    }
    if (el.hasAttribute('data-mobile-menu')) {
        const nav = document.querySelector('.site-nav');
        nav.classList.toggle('open');
        el.setAttribute('aria-expanded', String(nav.classList.contains('open')));
        return;
    }
    if (el.hasAttribute('data-task-expand')) {
        toggleTaskView(el);
        return;
    }
    if (el.hasAttribute('data-create-task')) {
        openCreateTask();
        return;
    }
    if (el.dataset.openTask) {
        openTask(el.dataset.openTask);
        return;
    }
    if (el.hasAttribute('data-submit-task')) {
        submitTask();
        return;
    }
    if (el.hasAttribute('data-comment-send')) {
        sendComment();
        return;
    }
    if (el.hasAttribute('data-complete-task')) {
        const t = tasks.find(x => x.id === currentTask);
        if (t) {
            setStatus(t.id, t.status === 'done' ? 'active' : 'done');
            document.getElementById('task-drawer').close();
        }
        return;
    }
    if (el.hasAttribute('data-export-tokens')) {
        exportTokens();
        return;
    }
    if (el.hasAttribute('data-export-passport')) {
        components_js_1.downloadJSON('iquipage-demo-passport.json', { demo: true, product: 'MODULE / 01', serial: 'IQ—2026—001', material: 'aluminium', finish: document.getElementById('finish-name')?.textContent, notice: 'Демонстрационные параметры. Не спецификация товара.' });
        components_js_1.notify({ tone: 'success', message: 'Паспорт подготовлен в JSON' });
        return;
    }
    if (el.hasAttribute('data-service-save')) {
        const form = document.getElementById('service-form');
        const text = String(new FormData(form).get('message') || '');
        if (!text.trim()) {
            components_js_1.notify({ tone: 'warning', message: 'Опишите запрос' });
            return;
        }
        const ok = components_js_1.save('service-draft', text);
        document.getElementById('service-dialog').close();
        components_js_1.notify({ tone: ok ? 'success' : 'warning', message: ok ? 'Черновик сохранён локально' : 'Хранение недоступно', description: 'Обращение в сервис не отправлено.' });
        return;
    }
    if (el.hasAttribute('data-create-space')) {
        const title = document.querySelector('[name=hero-workspace]')?.value.trim();
        if (!title) {
            components_js_1.notify({ tone: 'warning', message: 'Укажите название пространства' });
            return;
        }
        const input = document.querySelector('#workspace-settings [name=title]');
        if (input)
            input.value = title;
        document.getElementById('demo-drawer').show();
        return;
    }
    if (el.hasAttribute('data-save-settings')) {
        const form = document.getElementById('workspace-settings'), title = String(new FormData(form).get('title') || '').trim();
        if (!title) {
            components_js_1.notify({ tone: 'warning', message: 'Название не должно быть пустым' });
            return;
        }
        const ok = components_js_1.save('space-name', title);
        document.getElementById('demo-drawer').close();
        components_js_1.notify({ tone: ok ? 'success' : 'warning', message: ok ? 'Настройки сохранены локально' : 'Хранение недоступно' });
        return;
    }
    if (el.hasAttribute('data-invite-demo')) {
        const form = document.getElementById('invite-demo-form');
        if (!validateForm(form)) {
            return;
        }
        document.getElementById('demo-dialog').close();
        components_js_1.notify({ tone: 'success', message: 'Пример приглашения подготовлен', description: 'Письмо не отправлено. Сервер не подключён.' });
        return;
    }
    if (el.hasAttribute('data-confirm-run')) {
        document.getElementById('confirm-dialog').close();
        confirmAction();
        return;
    }
    if (el.hasAttribute('data-bulk-delete')) {
        const ids = [...selection];
        confirm(`Удалить ${ids.length} ${ids.length === 1 ? 'задачу' : 'задачи'}?`, 'Будут удалены только выбранные локальные демо-данные.', () => { const previous = structuredClone(tasks); tasks = tasks.filter(t => !selection.has(t.id)); selection.clear(); taskSave(); refreshTasks(); components_js_1.notify({ message: 'Выбранные задачи удалены', action: { label: 'Отменить', run: () => { tasks = previous; taskSave(); refreshTasks(); } } }); });
        return;
    }
    if (el.dataset.storyCode) {
        const story = stories_js_1.stories.find(s => s.id === el.dataset.storyCode);
        if (!story)
            return;
        document.getElementById('code-title').textContent = story.title;
        document.getElementById('code-content').textContent = story.demo();
        document.getElementById('code-dialog').show();
        return;
    }
    if (el.hasAttribute('data-copy-story')) {
        await interaction_js_1.copyAtButton(el, document.getElementById('code-content').textContent || '');
        return;
    }
    if (el.dataset.toast) {
        const tone = el.dataset.toast;
        components_js_1.notify({ tone, message: { success: 'Изменение сохранено', info: 'Доступен новый контекст', warning: 'Нужно ваше решение', danger: 'Не удалось выполнить действие' }[tone], description: 'Демонстрация системного сообщения.', action: tone === 'success' ? { label: 'Отменить', run: () => components_js_1.notify({ message: 'Демонстрационное действие отменено' }) } : undefined });
        return;
    }
    if (el.hasAttribute('data-async')) {
        const button = el;
        if (button.disabled)
            return;
        const html = button.innerHTML;
        button.style.width = button.getBoundingClientRect().width + 'px';
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.innerHTML = '<span class="iq-spinner"></span> Проверка';
        viewDelay(() => { button.removeAttribute('aria-busy'); button.innerHTML = components_js_1.icon('check', 17) + ' Проверено'; viewDelay(() => { button.disabled = false; button.style.width = ''; button.innerHTML = html; }, 950); }, 800);
        return;
    }
    if (el.hasAttribute('data-submit-demo')) {
        const form = el.closest('form');
        const ok = validateForm(form);
        form.querySelector('[data-form-message]').innerHTML = ok ? ui_js_1.alert('Поля заполнены', 'Данные не отправлялись на сервер.', 'success') : '';
        return;
    }
    if (el.dataset.step) {
        const box = el.closest('[data-stepper]'), current = +(box.getAttribute('data-current-step') || '1'), step = Math.min(3, Math.max(1, current + Number(el.dataset.step)));
        refinements_js_1.updateSteps(box, step);
        return;
    }
    if (el.hasAttribute('data-sort')) {
        const table = el.closest('table'), index = +el.dataset.sort, rows = Array.from(table.querySelectorAll('tbody tr')), th = el.closest('th'), ascending = th.getAttribute('aria-sort') !== 'ascending';
        table.querySelectorAll('th').forEach(x => x.removeAttribute('aria-sort'));
        th.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
        rows.sort((a, b) => a.children[index].textContent.localeCompare(b.children[index].textContent, 'ru', { numeric: true }) * (ascending ? 1 : -1));
        rows.forEach(r => table.querySelector('tbody').append(r));
        return;
    }
    if (el.dataset.motionPlay) {
        playMotion(el.dataset.motionPlay);
        return;
    }
    if (el.hasAttribute('data-motion-all')) {
        motions.forEach(m => playMotion(m[0]));
        return;
    }
    if (el.hasAttribute('data-progress-play')) {
        const box = el.closest('[data-progress-demo]'), bar = box.querySelector('[role=progressbar]'), value = box.querySelector('.demo-progress-value'), button = el;
        button.disabled = true;
        let n = 0;
        const tick = () => {
            if (!box.isConnected)
                return;
            n = Math.min(100, n + 5);
            bar.style.setProperty('--progress', n + '%');
            bar.setAttribute('aria-valuenow', String(n));
            value.textContent = n + '%';
            box.querySelector('.iq-ring strong').innerHTML = `${n}<span style="font-size:12px">%</span>`;
            box.querySelector('.iq-ring-fill')?.setAttribute('stroke-dashoffset', String(226.2 * (1 - n / 100)));
            if (n === 100) {
                button.disabled = false;
            }
            else
                viewDelay(tick, 45);
        };
        viewDelay(tick, 45);
        return;
    }
    const nav = el.closest('.preview-nav');
    if (nav) {
        nav.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
    }
});
document.body.addEventListener('iq-action', ev => {
    const action = ev.detail.action;
    if (action.startsWith('sort:')) {
        const value = action.slice(5);
        if (!sortOptions.some(x => x.value === value))
            return;
        sortKey = value;
        document.querySelectorAll('#task-sort-menu [role=menuitemradio]').forEach(item => item.setAttribute('aria-checked', String(item.dataset.action === 'sort:' + sortKey)));
        const trigger = document.querySelector('[data-sort-tasks]');
        if (trigger)
            trigger.title = sortOptions.find(x => x.value === sortKey).label;
        refreshTasks();
        return;
    }
    if (action === 'export-tokens')
        exportTokens();
    else if (action === 'export-tasks')
        components_js_1.downloadJSON('sprintique-demo-tasks.json', { demo: true, tasks });
    else if (action === 'workspace')
        go('workspace');
    else if (action === 'copy-name')
        void interaction_js_1.copyAtButton(ev.target.querySelector('button') || ev.target, 'IQUIPAGE Studio');
    else if (action === 'confirm')
        confirm('Удалить пример?', 'Это демонстрация. Никакие реальные данные не удаляются.', () => components_js_1.notify({ message: 'Пример подтверждения завершён' }));
    else if (action === 'reset-data')
        confirm('Сбросить демо-данные?', 'Ваши локальные задачи и комментарии будут заменены первоначальным примером.', () => { tasks = structuredClone(initialTasks); selection.clear(); taskSearch = ''; statusFilter = 'all'; taskSave(); render(); components_js_1.notify({ message: 'Демо-данные восстановлены' }); });
    else if (action.startsWith('move:')) {
        const [, id, status] = action.split(':');
        setStatus(id, status);
    }
    else if (action.startsWith('open:'))
        openTask(action.split(':')[1]);
    else if (action.startsWith('delete:'))
        removeTask(action.split(':')[1]);
});
document.body.addEventListener('iq-change', ev => {
    const target = ev.target, detail = ev.detail;
    if (target.id === 'task-status-filter') {
        statusFilter = String(detail.value);
        selection.clear();
        refreshTasks();
    }
    if (target.id === 'task-drawer-priority') {
        setPriority(currentTask, String(detail.value));
    }
    if (target.id === 'task-drawer-due') {
        const t = tasks.find(t => t.id === currentTask);
        if (t) {
            t.due = String(detail.value || '');
            taskSave();
            refreshTasks();
        }
    }
    if (target.id === 'task-drawer-status') {
        setStatus(currentTask, String(detail.value));
    }
    if (target.id === 'object-finish') {
        const dark = String(detail.value) === '1';
        document.getElementById('object-pass')?.classList.toggle('dark-finish', dark);
        document.getElementById('finish-name').textContent = dark ? 'Тёмный сатин' : 'Светлый сатин';
        const label = document.querySelector('#object-pass .row:last-child .mono');
        if (label)
            label.textContent = dark ? 'ALUMINIUM / DARK SATIN' : 'ALUMINIUM / SATIN';
    }
    if (target.closest('#create-task-form')) {
        const data = Object.fromEntries(new FormData(document.getElementById('create-task-form')));
        components_js_1.save('task-draft', data);
    }
});
document.body.addEventListener('input', ev => {
    const input = ev.target;
    if (input.id === 'command-input') {
        commandResults(input.value);
        return;
    }
    if (input.hasAttribute('data-task-search')) {
        taskSearch = input.value;
        refreshTasks();
        return;
    }
    if (input.hasAttribute('data-library-search')) {
        const q = input.value.trim().toLocaleLowerCase();
        const items = stories_js_1.stories.filter(s => (s.title + ' ' + s.description + ' ' + (stories_js_1.categories.find(c => c.id === s.category)?.name || '')).toLocaleLowerCase().includes(q));
        const content = document.getElementById('library-content');
        content.className = 'stories-grid';
        content.innerHTML = q ? `<div class="library-search-summary" style="grid-column:1/-1">Найдено ${items.length} из ${stories_js_1.stories.length}</div>` + items.map(stories_js_1.storyCard).join('') : stories_js_1.stories.filter(s => s.category === route().split('/')[1]).map(stories_js_1.storyCard).join('');
        components_js_1.enhance(content);
        return;
    }
    if (input.dataset.count) {
        const target = document.getElementById(input.dataset.count);
        if (target)
            target.textContent = `${input.value.length} / ${input.maxLength}`;
    }
    if (input.closest('[data-filter-demo]') && input.name === 'search-components') {
        const box = input.closest('[data-filter-demo]');
        let count = 0;
        box.querySelectorAll('.demo-search-results>span').forEach(row => {
            row.hidden = !row.textContent.toLowerCase().includes(input.value.toLowerCase());
            if (!row.hidden)
                count++;
        });
        box.querySelector('.iq-helper').textContent = count ? `${count} компонентов` : 'Ничего не найдено';
    }
    if (input.closest('#create-task-form')) {
        const data = Object.fromEntries(new FormData(document.getElementById('create-task-form')));
        components_js_1.save('task-draft', data);
    }
    if (input instanceof HTMLInputElement && input.closest('form')?.dataset.validationAttempted === 'true')
        validation_js_1.setFieldError(input, validation_js_1.fieldError(input));
});
document.body.addEventListener('change', ev => {
    const changed = ev.target;
    if (changed instanceof HTMLInputElement && changed.closest('form')?.dataset.validationAttempted === 'true')
        validation_js_1.setFieldError(changed, validation_js_1.fieldError(changed));
    const input = ev.target;
    if (input.hasAttribute('data-reduced-toggle')) {
        reduced = input.checked;
        document.documentElement.dataset.motion = reduced ? 'reduced' : 'standard';
        components_js_1.save('reduced-motion', reduced);
    }
    if (input.dataset.selectTask) {
        input.checked ? selection.add(input.dataset.selectTask) : selection.delete(input.dataset.selectTask);
        refreshTasks();
    }
    if (input.hasAttribute('data-select-all')) {
        selection = input.checked ? new Set(filteredTasks().map(t => t.id)) : new Set();
        refreshTasks();
    }
    if (input.hasAttribute('data-task-check')) {
        const t = tasks.find(t => t.id === currentTask);
        if (t) {
            t.checks[+input.dataset.taskCheck] = input.checked;
            taskSave();
        }
    }
});
document.body.addEventListener('submit', ev => {
    ev.preventDefault();
    const form = ev.target;
    if (form.id === 'create-task-form')
        submitTask();
    else if (form.hasAttribute('data-demo-form'))
        form.querySelector('[data-submit-demo]')?.click();
    else if (form.id === 'invite-demo-form')
        form.querySelector('[data-invite-demo]')?.click();
});
document.addEventListener('keydown', ev => {
    if (ev.defaultPrevented)
        return;
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        const dialog = document.getElementById('command-dialog');
        dialog.open ? dialog.close() : openCommand();
        return;
    }
    const input = ev.target;
    if (ev.key === '/' && !['INPUT', 'TEXTAREA'].includes(input.tagName)) {
        const search = document.querySelector('[data-library-search]');
        if (search) {
            ev.preventDefault();
            search.focus();
        }
    }
    const command = document.getElementById('command-dialog');
    if (command.open) {
        const buttons = Array.from(document.querySelectorAll('#command-results>button'));
        let index = buttons.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            buttons[(index + 1) % buttons.length]?.focus();
        }
        else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
        }
        else if (ev.key === 'Enter' && input.id === 'command-input') {
            ev.preventDefault();
            buttons[0]?.click();
        }
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && !!input.closest('#new-comment')) {
        ev.preventDefault();
        sendComment();
    }
});
document.querySelector('.skip-link')?.addEventListener('click', ev => { ev.preventDefault(); const main = document.getElementById('main'); main?.focus({ preventScroll: true }); main?.scrollIntoView({ block: 'start' }); });
window.addEventListener('hashchange', render);
document.getElementById('portals').innerHTML = staticDialogs();
components_js_1.enhance(document.getElementById('portals'));
render();
document.body.addEventListener('iq-change', ev => {
    const element = ev.target;
    if (element.id === 'new-comment') {
        const editor = element;
        const button = document.querySelector('#new-comment [data-md-submit]');
        if (button)
            button.disabled = !editor.value.trim() || editor.value.length > 2000;
    }
    if (element.closest('#create-task-form'))
        components_js_1.save('task-draft', Object.fromEntries(new FormData(document.getElementById('create-task-form'))));
});
document.body.addEventListener('iq-submit', ev => {
    if (ev.target.id === 'new-comment')
        sendComment();
});

document.body.addEventListener('iq-change', (event) => {
    if (event.target?.id !== 'task-drawer-kind') return;
    const task = tasks.find(t => t.id === currentTask);
    if (!task) return;
    task.type = task_kind_js_1.normalizeTaskKind(event.detail?.value);
    taskSave();
    refreshTasks();
    const modal = document.getElementById('task-drawer');
    const heading = modal?.querySelector('.task-document-heading .sample-overline');
    if (heading) heading.textContent = task.type === 'epic' ? 'ЭПИК' : 'РАБОЧАЯ ЗАДАЧА';
    const status = modal?.querySelector('[data-task-save-state] span');
    if (status) status.textContent = 'Тип задачи сохранён';
});

