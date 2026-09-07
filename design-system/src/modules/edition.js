"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.originalNames = void 0;
exports.bindEdition = bindEdition;
exports.exampleNav = exampleNav;
exports.examplesView = examplesView;
exports.home = home;
exports.installCatalog = installCatalog;
exports.landingView = landingView;
exports.libraryView = libraryView;
exports.narrativeCard = narrativeCard;
exports.objectView = objectView;
exports.proofDocument = proofDocument;
exports.rulesView = rulesView;
exports.siteFooter = siteFooter;
exports.siteHeader = siteHeader;
const refinements_js_1 = require("./refinements.js");
const components_js_1 = require("./components.js");
const ui_js_1 = require("./ui.js");
const stories_js_1 = require("./stories.js");
const originalNames = new Map(stories_js_1.stories.map(s => [s.id, s.title]));
exports.originalNames = originalNames;
const names = {
    'button': 'Кнопка', 'icon-button': 'Кнопка со значком', 'split-button': 'Кнопка с меню', 'button-group': 'Группа действий', 'toggle-button': 'Выбранное действие', 'async-button': 'Действие с ожиданием', 'link-action': 'Ссылка', 'copy-button': 'Копирование', 'text-field': 'Текстовое поле', 'field-states': 'Состояния поля', 'search-field': 'Поиск', 'text-area': 'Многострочный текст', 'number-field': 'Числовое поле', 'password-field': 'Пароль', 'input-group': 'Поле с дополнением', 'validated-form': 'Проверка формы', 'select': 'Выбор значения', 'combobox': 'Выбор с поиском', 'multi-select': 'Метки', 'checkbox': 'Флажок', 'radio-group': 'Радиокнопки', 'switch': 'Переключатель', 'segmented-control': 'Сегментированный выбор', 'slider': 'Ползунок', 'date-picker': 'Календарь', 'tabs': 'Вкладки', 'breadcrumb': 'Путь страницы', 'pagination': 'Страницы', 'stepper': 'Шаги', 'sidebar': 'Боковая навигация', 'command': 'Быстрый поиск', 'appbar': 'Панель приложения', 'table': 'Таблица', 'list': 'Строка списка', 'avatar': 'Участники', 'badge': 'Статус', 'metric': 'Показатель', 'chart': 'Диаграмма', 'timeline': 'История', 'tree': 'Дерево разделов', 'alert': 'Сообщение', 'toast': 'Уведомление', 'progress': 'Прогресс', 'skeleton': 'Загрузка содержимого', 'empty-state': 'Пустое состояние', 'inline-message': 'Подсказка', 'banner': 'Сообщение страницы', 'dialog': 'Диалог', 'drawer': 'Боковая панель', 'dropdown-menu': 'Меню действий', 'popover': 'Контекстный выбор', 'tooltip': 'Всплывающая подсказка', 'accordion': 'Раскрывающийся раздел', 'dropzone': 'Добавление файлов', 'file-item': 'Строка файла', 'upload-feedback': 'Проверка файлов', 'card': 'Карточка объекта', 'signature-surface': 'Презентация функции', 'frost-surface': 'Контекстная поверхность', 'layout-primitives': 'Сетка и интервалы'
};
function installCatalog() {
    stories_js_1.stories.forEach(s => { s.title = names[s.id] || s.title; s.description = s.description.replace('Собственный popup, поиск с клавиатуры, rich options.', 'Список с понятными вариантами, описаниями и клавиатурным выбором.').replace('Тот же материал. ', '').replace('Локальная световая линия при вводе.', 'Постоянная подпись и ясный фокус.').replace('Свет принадлежит смысловой поверхности, а не каждому контролу.', 'Содержание объясняет пользу. Действие ведёт в работающий пример.').replace('Контекстная прозрачность с непрозрачным текстовым слоем.', 'Различимые уровни без размытия и декоративной прозрачности.'); });
    const set = (id, demo, description, usage) => {
        const s = stories_js_1.stories.find(s => s.id === id);
        s.demo = demo;
        if (description)
            s.description = description;
        if (usage)
            s.usage = usage;
    };
    set('button', () => `<div class="button-context"><span class="sample-overline">ПРОЕКТ / ВНЕСЕНЫ ИЗМЕНЕНИЯ</span><h3>Готово к следующему шагу.</h3><p>Сохраните решение, чтобы команда могла продолжить работу.</p><div class="row">${ui_js_1.btn('Сохранить изменения', 'primary', '', 'data-async')}${ui_js_1.btn('Отмена', 'secondary', '', 'data-demo-cancel')}</div></div>`, 'Одно понятное действие. Точный размер, ясный приоритет, стабильные состояния.');
    set('icon-button', () => `<div class="row">${ui_js_1.ib('plus', 'Добавить', 'primary', 'data-create-task')}${ui_js_1.ib('star', 'В избранное', 'secondary', 'data-toggle aria-pressed="false"')}${ui_js_1.ib('copy', 'Копировать название', 'secondary', 'data-copy="IQUIPAGE"')}${ui_js_1.ib('trash', 'Удалить пример', 'danger', 'data-dialog="confirm-dialog"')}</div><p class="iq-helper">44 × 44 px. Значок — 20 px. У каждого действия есть доступное имя.</p>`);
    set('text-field', () => `<div class="field-context">${ui_js_1.field('Название проекта', 'Новая коллекция', { name: 'sample-name', help: 'Это название увидят все участники.' })}${ui_js_1.field('Описание результата', '', { placeholder: 'Что изменится для пользователя?' })}</div>`);
    set('switch', () => `<div class="preference-sample"><div class="preference-head">${components_js_1.icon('bell', 22)}<h3>Только важное.</h3><p>Вы решаете, когда приложение может отвлечь вас от работы.</p></div><div class="iq-setting-row"><div><b>Личные упоминания</b><p>Когда кто-то обращается к вам</p></div>${ui_js_1.toggle('Личные упоминания', true, '', false)}</div><div class="iq-setting-row"><div><b>Еженедельный обзор</b><p>Итоги команды одним сообщением</p></div>${ui_js_1.toggle('Еженедельный обзор', false, '', false)}</div></div>`, 'Немедленное изменение настройки. Движение только между двумя положениями.');
    set('signature-surface', () => `<div class="feature-sample"><span class="sample-overline">SPRINTIQUE / КОНТЕКСТ</span><h3>Решение видно. <br>Основания — рядом.</h3><p>Откройте задачу с описанием, критериями готовности и обсуждением.</p><a class="text-action" href="#workspace">Посмотреть пример ${components_js_1.icon('arrow', 16)}</a><div class="feature-lines" aria-hidden="true"><span></span><span></span><span></span></div></div>`, 'Самостоятельный смысловой блок, а не декоративный баннер.', 'Применять для знакомства с функцией, но не вместо ежедневной работы. Никаких неподтверждённых чисел или автоматических переливов.');
    set('frost-surface', () => `<div class="context-layer"><div class="context-record"><span>Документ</span><b>Концепция коллекции</b><small>Версия 03 / локальный пример</small></div><div class="context-status">${components_js_1.icon('checkCircle', 20)}<div><b>Контекст на месте</b><p>Название, версия и состояние остаются читаемыми на собственной поверхности.</p></div></div></div>`, 'Два уровня содержания. Ни один не зависит от фона.', 'Обязательный текст располагается на непрозрачной поверхности. Контраст не меняется из-за фотографии или фоновой анимации.');
    set('copy-button', () => `<div class="copy-example"><code>--iq-accent: #2453CC</code>${ui_js_1.ib('copy', 'Скопировать токен', 'secondary sm', 'data-copy="--iq-accent: #2453CC;"')}</div>`);
    set('dialog', () => `<div class="dialog-preview"><span class="sample-overline">КОМАНДА / НОВЫЙ УЧАСТНИК</span><h3>Пригласить к работе.</h3><p>Одна задача, ясные поля, возвращение в исходный контекст.</p>${ui_js_1.btn('Подготовить приглашение', 'primary', '', 'data-dialog="demo-dialog"')}</div>`);
    set('drawer', () => `<div class="dialog-preview"><span class="sample-overline">КОНТЕКСТ / БОКОВАЯ ПАНЕЛЬ</span><h3>Детали без потери места.</h3><p>Основной список остаётся под панелью. После закрытия фокус возвращается к действию.</p>${ui_js_1.btn('Открыть настройки', 'secondary', '', 'data-dialog="demo-drawer"')}</div>`);
    set('appbar', () => `<div class="sample-appbar"><b>Sprintique</b><nav aria-label="Навигация в образце"><a href="#workspace">Задачи</a><a href="#workspace/plan">План</a></nav>${ui_js_1.ib('search', 'Поиск по системе', 'ghost', 'data-command')}</div>`);
    set('layout-primitives', () => `<div class="layout-demo"><div class="layout-span">12 колонок</div><span>4</span><span>4</span><span>4</span><span style="grid-column:span 2">8</span><span>4</span></div><p class="iq-helper">На сайте сетка невидима. Здесь — учебная схема: 12 / 8 / 4 колонки.</p>`);
}
function siteHeader(path, theme) {
    const family = path.split('/')[0];
    const active = ['workspace', 'objects', 'landing', 'examples'].includes(family) ? 'examples' : ['rules', 'foundations', 'motion', 'brand'].includes(family) ? 'rules' : family;
    return `<header class="site-header"><div class="site-header-inner"><a class="site-brand" href="#overview" aria-label="IQUIPAGE — обзор системы">${components_js_1.mark()}<span>IQUIPAGE</span><small>Design System</small></a><nav class="site-nav" aria-label="Основная навигация">${[['overview', 'Обзор'], ['components/button', 'Компоненты'], ['examples', 'Примеры'], ['rules/principles', 'Правила']].map(([p, n]) => `<a href="#${p}" ${active === p.split('/')[0] ? 'aria-current="page"' : ''}>${n}</a>`).join('')}</nav><div class="header-actions"><button class="search-trigger" type="button" data-command aria-label="Найти компонент или раздел">${components_js_1.icon('search', 17)}<span>Найти</span><kbd>⌘ K</kbd></button>${ui_js_1.ib(theme === 'light' ? 'moon' : 'sun', theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему', 'ghost theme-switch', 'data-theme-toggle')}${ui_js_1.ib('menu', 'Открыть меню', 'ghost mobile-menu', 'data-mobile-menu aria-expanded="false"')}</div></div></header>`;
}
function siteFooter() { return `<footer class="site-footer"><a href="#overview">${components_js_1.mark()}<span>IQUIPAGE</span></a><p>Один язык. Разные продукты.</p><span>Редакция 05.7</span></footer>`; }
function exampleNav(active) { return `<nav class="example-nav" aria-label="Готовые примеры"><a href="#examples">Все примеры</a>${[['workspace', 'Приложение'], ['landing', 'Лендинг'], ['objects', 'Паспорт изделия']].map(([p, n]) => `<a href="#${p}" ${p === active ? 'aria-current="page"' : ''}>${n}</a>`).join('')}<span>Демонстрационные данные</span></nav>`; }
const meta = (text) => `<span class="sample-overline">${text}</span>`;
function proofDocument(compact = false) { return `<div class="proof-document ${compact ? 'compact' : ''}"><div class="proof-bar"><span>${components_js_1.icon('file', 15)} Рабочий документ</span><span>SPR–128</span></div><div class="proof-copy"><div class="proof-tag">${components_js_1.icon('play', 14)} В работе</div><h2>Подготовить страницу <br>нового релиза.</h2><p>Показать, что изменилось и почему это важно.<br class="desktop-only"> Один результат, понятный всей команде.</p><div class="proof-checks"><span>${components_js_1.icon('checkCircle', 17)} Описаны ключевые изменения</span><span>${components_js_1.icon('checkCircle', 17)} Приложены рабочие материалы</span><span class="pending">${components_js_1.icon('circle', 17)} Осталось решение команды</span></div><div class="proof-bottom"><div>${ui_js_1.avatars()}<span>4 участника</span></div>${ui_js_1.btn('Открыть задачу', 'primary sm', '', 'data-open-task="SPR-128"')}</div></div></div>`; }
function home() { return `<div class="page-shell"><section class="home-intro"><div class="home-meta">${meta('IQUIPAGE / ОБЩИЙ ЯЗЫК ПРОДУКТОВ')}<span>Редакция 05.7</span></div><div class="home-head"><h1>Ясность в работе. <br>Точность в деталях.</h1><div class="home-lead"><p>Выразительная форма. <br>Понятные действия. <br>Внимание к человеку.</p><div class="row"><a class="iq-btn primary pill" href="#components/button">Открыть компоненты ${components_js_1.icon('arrow', 16)}</a></div></div></div></section><section class="home-feature" aria-label="Система в рабочем контексте"><div class="feature-editorial"><div>${meta('01 / СОДЕРЖАНИЕ НА ПЕРВОМ ПЛАНЕ')}<h2>Хороший интерфейс <br>не просит внимания. <br><span>Он возвращает его вам.</span></h2><p>Задача, решение и результат — в центре. <br>Всё остальное помогает с ними работать.</p></div><a class="text-action" href="#workspace">Посмотреть в работе ${components_js_1.icon('arrow', 17)}</a><div class="editorial-index" aria-hidden="true">SPRINTIQUE<i>РАБОЧИЙ ПРИМЕР</i></div></div><div class="document-stage">${proofDocument()}</div></section><div class="home-caption"><span>Реальная разметка, не картинка интерфейса.</span><span>Светлая и тёмная темы / клавиатура / адаптивность</span></div><section class="home-paths"><a href="#components/button"><span>01 / КОМПОНЕНТЫ</span><h2>Найти нужный элемент.</h2><p>Живой пример, состояния и код <br>на одной странице.</p>${components_js_1.icon('arrow', 20)}</a><a href="#examples"><span>02 / ПРИМЕРЫ</span><h2>Увидеть систему целиком.</h2><p>Рабочий продукт, лендинг <br>и цифровой паспорт.</p>${components_js_1.icon('arrow', 20)}</a><a href="#rules/principles"><span>03 / ПРАВИЛА</span><h2>Понять каждое решение.</h2><p>Типографика, цвет, движение <br>и критерии качества.</p>${components_js_1.icon('arrow', 20)}</a></section><section class="type-statement"><span>ТОЧНОСТЬ НЕ ТРЕБУЕТ ДЕКОРА.</span><p>Масштаб. Ритм. Пропорции. <br><em>Характер складывается из отношений.</em></p><a href="#rules/typography" class="iq-link">Типографическая система ${components_js_1.icon('arrow', 16)}</a></section></div>${siteFooter()}`; }
function states(s) {
    if(s.states) return s.states;
    if (['button', 'icon-button', 'async-button'].includes(s.id))
        return `<div class="state-grid">${[['Обычное', 'primary', ''], ['Вторичное', 'secondary', ''], ['С фокусом', 'primary visual-focus', ''], ['Выбранное', 'secondary', 'aria-pressed="true"'], ['Ожидание', 'primary', 'aria-busy="true" disabled'], ['Недоступно', 'secondary', 'disabled']].map(([l, c, a]) => `<div><span>${l}</span>${ui_js_1.btn(l === 'Ожидание' ? '<span class="iq-spinner"></span> Сохранение' : 'Сохранить', c, '', a)}</div>`).join('')}</div><p class="spec-note">Состояния приведены для сравнения. Ожидание — не реальная серверная операция. Фокус показан заливкой и подчёркиванием, без внешнего контура.</p>`;
    if (s.id === 'switch')
        return `<div class="state-grid"><div><span>Включён</span>${ui_js_1.toggle('Уведомления', true, '', false)}</div><div><span>Выключен</span>${ui_js_1.toggle('Уведомления', false, '', false)}</div><div><span>Недоступен</span>${ui_js_1.toggle('Уведомления', true, 'disabled')}</div></div>`;
    if (['text-field', 'field-states'].includes(s.id))
        return `<div class="field-states-grid">${ui_js_1.field('Название', 'Новая коллекция')}${ui_js_1.field('Рабочая почта', 'alex@', { state: 'error', help: 'Укажите полный адрес почты.', type: 'email' })}${ui_js_1.field('Идентификатор', 'IQ-2026', { readonly: true, help: 'Значение нельзя изменить.' })}${ui_js_1.field('Организация', 'IQUIPAGE', { disabled: true, help: 'Недоступно в этом примере.' })}</div>`;
    if (['select', 'combobox'].includes(s.id))
        return `<div class="field-states-grid">${ui_js_1.select('Проект', ['Sprintique', 'Objects', 'Core'])}${ui_js_1.select('Недоступный выбор', ['Sprintique'], 'disabled')}</div><p class="spec-note">Откройте список и проверьте ↑ / ↓, Home / End, ввод начала названия, Enter и Escape. Выбор и клавиатурный фокус различаются.</p>`;
    return `<div class="contract-grid"><div><h3>Исходное</h3><p>${components_js_1.escapeHTML(s.description)}</p></div><div><h3>Взаимодействие</h3><p>${components_js_1.escapeHTML(s.keyboard)}</p></div><div><h3>Границы</h3><p>${components_js_1.escapeHTML(s.usage)}</p></div></div><p class="spec-note">У этого образца нет отдельной матрицы всех состояний. Доступное поведение проверяйте в разделе «Пример»; полный контракт приведён ниже.</p>`;
}
function libraryView(path) {
    let id = path.split('/')[1]?.split('?')[0] || 'button';
    const category = stories_js_1.categories.find(c => c.id === id);
    if (category)
        id = stories_js_1.stories.find(s => s.category === category.id).id;
    const s = stories_js_1.stories.find(s => s.id === id) || stories_js_1.stories[0];
    const docs = `<div class="spec-docs"><h3>Когда использовать</h3><p>${components_js_1.escapeHTML(s.usage)}</p><h3>Управление с клавиатуры</h3><p>${components_js_1.escapeHTML(s.keyboard)}</p><h3>Техническая основа</h3><p>Общий слой токенов и собственные стили IQUIPAGE. Для текста, фокуса и редактирования сохранена семантика HTML. Интерактивные контролы оформлены как Web Components.</p><a class="iq-link" href="#rules/implementation">Подключение и ограничения ${components_js_1.icon('arrow', 16)}</a></div>`;
    const code = s.code || s.demo();
    return `<div class="library-shell"><aside class="catalog-nav"><div class="catalog-heading"><a href="#components/button">Компоненты</a><span>${stories_js_1.stories.length}</span><button type="button" class="catalog-toggle" data-catalog-toggle aria-expanded="false">Выбрать компонент</button></div><label class="catalog-search">${components_js_1.icon('search', 16)}<input aria-label="Найти в компонентах" placeholder="Название или назначение" data-catalog-search autocomplete="off"></label><div class="catalog-groups">${stories_js_1.categories.map(c => `<details class="catalog-group" ${c.id === s.category ? 'open' : ''}><summary>${components_js_1.escapeHTML(c.name)}<span>${stories_js_1.stories.filter(x => x.category === c.id).length}</span>${components_js_1.icon('down', 12)}</summary><div>${stories_js_1.stories.filter(x => x.category === c.id).map(x => `<a href="#components/${x.id}" data-catalog-entry data-search="${components_js_1.escapeHTML(x.title + ' ' + (originalNames.get(x.id) || x.title) + ' ' + x.description)}" ${s.id === x.id ? 'aria-current="page"' : ''}>${components_js_1.escapeHTML(x.title)}</a>`).join('')}</div></details>`).join('')}</div><p class="catalog-empty" hidden>Ничего не найдено. <br>Попробуйте другое название.</p><a class="catalog-help" href="#rules/implementation">Как подключить систему ${components_js_1.icon('arrow', 15)}</a></aside><section class="component-page"><div class="component-breadcrumb">Компоненты <span>/</span> ${stories_js_1.categories.find(c => c.id === s.category).name}</div><div class="component-heading"><div><h1>${components_js_1.escapeHTML(s.title)}</h1><p>${components_js_1.escapeHTML(s.description)}</p></div><span class="component-canonical">${(originalNames.get(s.id) || s.title)}</span></div><div class="component-specimen" data-component="${s.id}" id="story-${s.id}">${ui_js_1.tabs([{ key: 'example', label: 'Пример', body: `<div class="specimen-surface ${s.id === 'signature-surface' ? 'specimen-dark' : ''}" data-preview>${s.demo()}</div>${s.id === 'button' ? `<div class="preview-options"><span>Роль кнопки</span>${ui_js_1.segment(['Основная', 'Вторичная', 'Акцент'], 0, 'data-preview-variant aria-label="Роль кнопки"')}<span>Размер</span>${ui_js_1.segment(['S', 'M', 'L'], 1, 'data-preview-size aria-label="Размер кнопки"')}</div>` : `<p class="preview-hint">Это живой образец. Попробуйте действие мышью или клавиатурой.</p>`}` }, { key: 'states', label: 'Состояния', body: states(s) }, { key: 'usage', label: 'Использование', body: docs }, { key: 'code', label: 'Код', body: `<div class="code-head"><span>HTML / исходный пример</span><button class="iq-btn secondary sm" data-copy="${components_js_1.escapeHTML(code)}">${components_js_1.icon('copy', 15)} Копировать</button></div><pre class="source-code"><code>${components_js_1.escapeHTML(code.replace(/></g, '>\n<'))}</code></pre>` }], 'label="Документация компонента"')}</div><div class="component-bottom"><div><span>ОСНОВНОЕ ПРАВИЛО</span><p>${components_js_1.escapeHTML(s.usage)}</p></div><div><span>КЛАВИАТУРА</span><p>${components_js_1.escapeHTML(s.keyboard)}</p></div></div><div class="related-components"><span>Рядом по смыслу</span>${stories_js_1.stories.filter(x => x.category === s.category && x.id !== s.id).slice(0, 3).map(x => `<a href="#components/${x.id}">${components_js_1.escapeHTML(x.title)} ${components_js_1.icon('arrow', 15)}</a>`).join('')}</div></section></div>`;
}
function examplesView() { return `<div class="page-shell"><header class="section-intro">${meta('ПРИМЕРЫ / ОДНА СИСТЕМА В РАЗНЫХ ЗАДАЧАХ')}<h1>Не набор деталей. <br>Цельный опыт.</h1><p>Выберите сценарий. Каждый использует те же компоненты, типографику и правила поведения.</p></header><div class="example-cards"><a href="#workspace" class="example-cover"><div class="cover-work"><div class="mini-work-heading"><b>Выпуск 2.4</b><span>6 задач</span></div>${['Страница нового релиза', 'Приглашение в команду', 'Состояния загрузки'].map((x, i) => `<div><span class="mini-status ${i === 1 ? 'done' : ''}"></span><span>${x}</span><i>${['МЛ', 'АК', 'ДС'][i]}</i></div>`).join('')}</div><div class="example-cover-caption"><span>01 / ПРИЛОЖЕНИЕ</span>${components_js_1.icon('arrow', 22)}<h2>Sprintique</h2><p>Документ, список, доска и план. <br>Работа важнее оболочки.</p></div></a><a href="#landing" class="example-cover"><div class="cover-landing"><span>IQUIPAGE / SPRINTIQUE</span><strong>От идеи. <br>До ясного <br><em>результата.</em></strong><i>Узнать, как это работает ${components_js_1.icon('arrow', 14)}</i></div><div class="example-cover-caption"><span>02 / ЗНАКОМСТВО С ПРОДУКТОМ</span>${components_js_1.icon('arrow', 22)}<h2>Лендинг</h2><p>Обещание, реальный сценарий <br>и понятный следующий шаг.</p></div></a><a href="#objects" class="example-cover"><div class="cover-object">${components_js_1.mark()}<span>ПАСПОРТ ИЗДЕЛИЯ</span><strong>MODULE <br>01</strong><div><i>SERIES / 2026</i><i>IQ — 001</i></div></div><div class="example-cover-caption"><span>03 / ФИЗИЧЕСКИЙ ПРОДУКТ</span>${components_js_1.icon('arrow', 22)}<h2>Цифровой паспорт</h2><p>Происхождение, параметры <br>и забота после покупки.</p></div></a></div></div>${siteFooter()}`; }
const rules = [['principles', 'Принципы'], ['typography', 'Типографика'], ['color', 'Цвет и поверхности'], ['motion', 'Движение'], ['media', 'Графика и медиа'], ['voice', 'Голос продукта'], ['implementation', 'Внедрение']];
function rulesView(path = 'rules/principles') {
    const id = path.split('/')[1] || 'principles';
    const active = rules.some(r => r[0] === id) ? id : 'principles';
    let content = '';
    if (active === 'principles')
        content = `${meta('ОСНОВА / ИССЛЕДОВАНИЕ ПРЕМИАЛЬНЫХ БРЕНДОВ')}<h1>Качество — <br>в точности намерения.</h1><p class="rules-lead">Не заимствовать чужой внешний вид. Перенести отношения между предметом, вниманием и опытом человека.</p><div class="principle-list">${[['Главное получает первый план.', 'Задача и результат определяют композицию. Свойства не занимают место работы.', 'Исследование: B&O, Aesop, Linear'], ['Ритм сильнее оболочки.', 'Не каждому элементу нужна карточка. Масштаб, выравнивание и расстояния связывают содержание.', 'Исследование: LEMAIRE, The Modern House'], ['Качество можно объяснить.', 'Показать артефакт, автора, критерий и состояние. Не заменять доказательство словом «премиальный».', 'Исследование: Leica, Grand Seiko'], ['Забота продолжается.', 'Черновик, отмена, восстановление и понятные ограничения важнее декоративного подтверждения.', 'Исследование: Hermès, Raycast, Apple'], ['Выразительность зависит от места.', 'У знакомства с продуктом и ежедневного инструмента разный ритм. Контролы и значения остаются общими.', 'Исследование: Gentle Monster, Ett Hem']].map(([h, p, s], i) => `<article><span>0${i + 1}</span><div><h2>${h}</h2><p>${p}</p><small>${s}</small></div></article>`).join('')}</div><div class="note-panel"><b>Граница исследования</b><p>Это гипотезы переноса, а не доказанная связь оформления с ценой, удобством или конверсией. Визуальная композиция Apple в приложенном исследовании не оценивалась. Решения этой редакции — наша интерпретация источника.</p></div>`;
    if (active === 'voice')
        content = refinements_js_1.toneOfVoice();
    if (active === 'typography')
        content = `${meta('ТИПОГРАФИКА / КИРИЛЛИЦА И ЛАТИНИЦА')}<h1>Один голос. <br>Разные масштабы.</h1><p class="rules-lead">Крупный текст даёт характер. Небольшой — помогает работать. У них разные плотность, интерлиньяж и расстояния между буквами.</p><div class="type-hero">Аа<span>Работа. <br>Work.</span><small>Inter Display / Inter <br>Системный шрифт — резерв</small></div><div class="type-scale">${[['Display', '64 / 67 / 500 / −0.034 em', 'Хорошо каждый день.', 'display'], ['Heading', '32 / 37 / 500 / −0.028 em', 'Следующий шаг уже ясен.', 'heading'], ['Body', '16 / 26 / 400 / −0.01 em', 'Сохраните контекст решения, чтобы команда могла продолжить работу.', 'body'], ['Interface', '14 / 21 / 400 / −0.008 em', 'Описание / Обсуждение / Результат', 'interface'], ['Label', '13 / 19 / 500 / 0 em', 'Название проекта', 'label'], ['Caption', '12 / 18 / 400 / 0 em', 'Последнее изменение — сегодня, 10:24', 'caption']].map(([r, s, t, c]) => `<div><span>${r}<small>${s}</small></span><p class="type-${c}">${t}</p></div>`).join('')}</div><div class="note-panel"><b>Не уменьшать текст ради композиции.</b><p>Основной рабочий текст — 14–16 px; подписи — 13 px; вспомогательный текст — 12 px. Ввод на мобильных — 16 px. Мелкие редакционные индексы не несут единственного объяснения действия. Строка основного текста — до 65–70 знаков. Название рабочего объекта переносится, а не исчезает за многоточием.</p><p>Inter подключается как внешний необязательный ресурс. Без сети используется локальный или системный шрифт. Файлы шрифтов в поставку не включены; геометрия резервного шрифта может отличаться.</p></div>`;
    if (active === 'color')
        content = require('./palette.js').paletteView(window.IQ_TOKENS);
    if (active === 'motion')
        content = `${meta('ДВИЖЕНИЕ / СМЫСЛ И ПРИЧИНА')}<h1>Переход, который <br>помогает понять.</h1><p class="rules-lead">Действие получает отклик сразу. Анимация объясняет, что изменилось, а не задерживает результат ради эффекта.</p><div class="motion-settings">${ui_js_1.toggle('Уменьшить движение', document.documentElement.dataset.motion === 'reduced', 'data-reduced-motion')}<span>Системная настройка также учитывается.</span></div><div class="motion-proof" data-transition-scene><div class="motion-proof-head"><span>ПРИНЯТОЕ РЕШЕНИЕ</span><span>Демонстрация перехода</span></div><div class="motion-result"><span class="result-icon">${components_js_1.icon('file', 28)}</span><div><h2>Концепция коллекции</h2><p data-motion-caption>Описание и материалы собраны. Решение ещё не принято.</p></div><span class="motion-state">На проверке</span></div><div class="motion-evidence"><span>${components_js_1.icon('check', 16)} Контекст</span><span>${components_js_1.icon('check', 16)} Материалы</span><span>${components_js_1.icon('check', 16)} Автор</span></div><div class="row">${ui_js_1.btn('Принять результат', 'primary', '', 'data-accept-result')}${ui_js_1.btn('Сбросить', 'ghost', '', 'data-reset-result')}</div></div><div class="motion-contracts">${[['120 мс', 'Отклик', 'Наведение и нажатие. Состояние не зависит от анимации.'], ['180–280 мс', 'Изменение', 'Переключатель, панель, диалог. Прерываемые переходы.'], ['До 800 мс', 'Рассказ', 'Только презентация. Один запуск по явному действию.']].map(([t, h, p]) => `<div><span>${t}</span><h3>${h}</h3><p>${p}</p></div>`).join('')}</div><h2 class="rules-subheading">Для продающих страниц</h2><p class="rules-copy">Пошаговый рассказ связывает идею, доказательство и результат. Кнопки доступны сразу. Нет перехвата прокрутки, бесконечного параллакса и автоматической сцены в рабочем интерфейсе.</p><a class="iq-link" href="#landing">Открыть пример лендинга ${components_js_1.icon('arrow', 16)}</a><div class="note-panel"><b>Бюджет и остановка</b><p>Движение использует transform и opacity, а не фильтры размытия. Предыдущая анимация отменяется. При уходе со страницы отменяются активные эффекты и наблюдатели. В статичном режиме меняется только состояние.</p></div>`;
    if (active === 'media')
        content = `${meta('ГРАФИКА / ПРАВДИВОЕ ИЗОБРАЖЕНИЕ')}<h1>Деталь должна <br>выдерживать приближение.</h1><p class="rules-lead">В этой редакции интерфейсы и схемы — реальная разметка и SVG. Здесь нет увеличенных растровых превью, декоративных фотографий и искусственных 3D-материалов.</p><div class="icon-proof"><div class="large-icon">${components_js_1.icon('file', 144)}<span>24 × 24 / вектор</span></div><div class="icon-sizes">${[16, 20, 24, 32, 48].map(x => `<div>${components_js_1.icon('file', x)}<span>${x} px</span></div>`).join('')}</div></div><div class="principle-list">${[['Значки', 'SVG Lucide на сетке 24 × 24. Масштабы проверяются отдельно. В значке нет текста. Доступное имя принадлежит действию.'], ['Изображения', 'Зафиксированное соотношение сторон, размеры до загрузки, alt по смыслу. Нельзя растягивать превью выше его разрешения. Для крупного кадра нужны самостоятельные исходники.'], ['Видео', 'Постер до загрузки, controls, playsinline, preload="none" вне первого экрана. Без автозвука; для речи — субтитры. При reduced motion вместо декоративного видео остаётся постер.'], ['Данные', 'Показатели не выдумываются ради графики. Значения доступны в тексте или таблице. Ключевая подпись не может существовать только в tooltip.']].map(([h, p], i) => `<article><span>0${i + 1}</span><div><h2>${h}</h2><p>${p}</p></div></article>`).join('')}</div><div class="note-panel"><b>Что проверено здесь</b><p>Исходники SVG, дубли идентификаторов, горизонтальное переполнение, два масштаба экрана и reduced motion. В разделе файлов доступны реальные локальные предпросмотры текста, изображения, PDF-образца и видео. Для новых PDF загружается PDF.js; приложение может подключить собственный рендерер. Протокол проверок и ограничения находятся в архиве.</p></div>`;
    if (active === 'implementation')
        content = `${meta('ВНЕДРЕНИЕ / ЧЕСТНЫЕ ГРАНИЦЫ')}<h1>Общий язык. <br>Проверяемый контракт.</h1><p class="rules-lead">Токены, стили и поведение разделены. Студия — не зависимость продуктового интерфейса.</p><div class="implementation-grid"><div><h2>Подключение</h2><pre class="source-code"><code>${components_js_1.escapeHTML(`import { registerIquipage, enhance }\n  from './dist/iquipage.js';\nimport './dist/iquipage.css';\n\nregisterIquipage();\nconst dispose = enhance(container);\n// При удалении представления:\ndispose();`)}</code></pre></div><div><h2>Что в комплекте</h2><p>Исходники ES-модулей и контракт компонентов. CSS без UI-фреймворка. Токены обеих тем. SVG-иконки. Живые примеры, документация и воспроизводимые проверки.</p><h2>Статус</h2><p>Собранная редакция 05.7 с воспроизводимыми проверками. Автоматические тесты не заменяют проверку с пользователями, скринридерами и данными конкретного продукта.</p></div></div><h2 class="rules-subheading">Контракт интеграции</h2><div class="principle-list">${[['Состояние', 'Приложение управляет отправкой, доступом и сохранением. Компонент не изображает успешную серверную операцию.'], ['Жизненный цикл', 'Инициализация идемпотентна. Обработчики и анимации удаляются при отключении представления.'], ['Безопасность', 'Данные выводятся через экранирование. Проверка расширения файла — только помощь пользователю, не защита сервера.'], ['Совместимость', 'Нужны современные браузеры с Custom Elements, dialog и Popover API. Матрица реально выполненных проверок — в evidence/qa-report.json.']].map(([h, p], i) => `<article><span>0${i + 1}</span><div><h2>${h}</h2><p>${p}</p></div></article>`).join('')}</div>`;
    return `<div class="rules-shell"><aside class="rules-nav"><span>Правила системы</span>${rules.map(([k, l]) => `<a href="#rules/${k}" ${active === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</aside><article class="rules-page">${content}</article></div>${siteFooter()}`;
}
function landingView() { return `<div class="page-shell">${exampleNav('landing')}<section class="landing-intro"><div>${meta('SPRINTIQUE / ОТ IQUIPAGE')}<h1>От идеи. <br>До ясного <br><span>результата.</span></h1><p>Контекст, решения и работа команды — <br>в одном понятном пространстве.</p><div class="row"><a class="iq-btn primary pill" href="#workspace">Открыть демопроект ${components_js_1.icon('arrow', 17)}</a><a href="#rules/motion" class="text-action">Как устроено движение</a></div></div><div class="landing-manifest"><span>ОБЕЩАНИЕ ПОДТВЕРЖДАЕТСЯ РАБОТОЙ.</span><p>Не больше действий. <br>Больше понимания, <br><em>что делать дальше.</em></p><div>${components_js_1.icon('checkCircle', 18)} Контекст остаётся рядом</div><div>${components_js_1.icon('checkCircle', 18)} Решения имеют основания</div><div>${components_js_1.icon('checkCircle', 18)} Действия можно отменить</div></div></section><section class="narrative" data-narrative><div class="narrative-toolbar"><span>ОДИН СЦЕНАРИЙ / ТРИ ЭТАПА</span>${ui_js_1.btn('Показать переход', 'secondary sm', 'play', 'data-play-narrative')}</div><div class="narrative-grid"><div class="narrative-copy"><div class="narrative-steps" role="group" aria-label="Этапы сценария">${[['Идея', 'Определить, что изменится.'], ['Контекст', 'Собрать основания решения.'], ['Результат', 'Подтвердить готовность.']].map(([h, p], i) => `<button type="button" data-narrative-step="${i}" aria-pressed="${i === 0}"><span>0${i + 1}</span><div><h2>${h}</h2><p>${p}</p></div>${components_js_1.icon('arrow', 18)}</button>`).join('')}</div><p class="narrative-caption">Выберите этап или запустите один переход. <br>Рабочие действия доступны без анимации.</p></div><div class="narrative-stage"><div class="narrative-frame" data-narrative-frame>${narrativeCard(0)}</div><div class="narrative-fine"><span>SPRINTIQUE / РАБОЧИЙ ПРИМЕР</span><span data-stage-index>01 / 03</span></div></div></div></section><section class="landing-detail"><div><span class="sample-overline">ЕЖЕДНЕВНАЯ РАБОТА</span><h2>Каждая деталь <br>знает своё место.</h2><p>Обсуждение — у задачи. Критерии — у результата. Свойства доступны рядом, но не вытесняют содержание.</p><a href="#workspace" class="iq-link">Открыть рабочее пространство ${components_js_1.icon('arrow', 16)}</a></div>${proofDocument(true)}</section><section class="landing-close"><h2>Попробуйте <br>на настоящем сценарии.</h2><div><p>Демонстрационный проект можно редактировать. <br>Регистрация и оплата не нужны.</p><a class="iq-btn primary pill" href="#workspace">Перейти к работе ${components_js_1.icon('arrow', 17)}</a></div></section></div>${siteFooter()}`; }
function narrativeCard(step) {
    const entries = [['ГИПОТЕЗА', 'Один понятный <br>следующий шаг.', 'Помочь человеку продолжить работу, не восстанавливая весь контекст заново.', 'Определено, что проверяем', 'file'], ['ОСНОВАНИЯ', 'Решение не возникает <br>из пустоты.', 'Описание задачи, материалы и критерии готовности собраны в одном документе.', 'Контекст и материалы связаны', 'link'], ['РЕЗУЛЬТАТ', 'Готово — значит <br>проверено.', 'Результат сопоставлен с критериями. Автор решения и дальнейший шаг известны.', 'Решение подтверждено', 'checkCircle']];
    const [label, title, body, status, glyph] = entries[step];
    return `<div class="narrative-card"><div class="row between"><span>${label}</span>${components_js_1.icon(glyph, 24)}</div><h3>${title}</h3><p>${body}</p><div class="narrative-card-rule"></div><div class="narrative-card-result">${components_js_1.icon('check', 17)} ${status}</div><a href="#workspace" class="text-action">Перейти к примеру ${components_js_1.icon('arrow', 16)}</a></div>`;
}
function objectView() { return `<div class="page-shell">${exampleNav('objects')}<header class="object-intro">${meta('IQUIPAGE OBJECTS / ЦИФРОВОЙ ПАСПОРТ')}<h1>Хорошая вещь. <br>Продуманное продолжение.</h1><p>Происхождение, характеристики и история. <br>То же внимание к человеку после первого дня.</p></header><div class="object-layout"><div class="passport-sheet" id="object-pass"><div class="passport-top">${components_js_1.mark()}<span>ПАСПОРТ ИЗДЕЛИЯ</span></div><div class="passport-number">MODULE<span>01</span></div><div class="passport-diagram" aria-hidden="true"><svg viewBox="0 0 500 140" fill="none"><path d="M65 100 158 40h194l84 60H65Z" stroke="currentColor"/><path d="M65 100v12h371v-12M158 40v15l-72 45m266-60v15l65 45M158 55h194" stroke="currentColor" opacity=".5"/><circle cx="250" cy="75" r="12" stroke="currentColor"/><path d="M47 128h407M65 123v10m371-10v10" stroke="currentColor" opacity=".35"/></svg></div><div class="passport-bottom"><span>СЕРИЯ / 2026</span><span>IQ — 2026 — 001</span></div></div><div class="object-information">${ui_js_1.badge('Демонстрационный объект', 'outline', false)}<h2>У предмета <br>есть история.</h2><p>Паспорт связывает изделие с материалом, происхождением и обслуживанием. Это образец структуры, не спецификация реального товара.</p><dl class="object-specs"><div><dt>Коллекция</dt><dd>MODULE / 01</dd></div><div><dt>Материал</dt><dd>Алюминий</dd></div><div><dt>Отделка</dt><dd id="finish-name">Светлый сатин</dd></div><div><dt>Серийный номер</dt><dd>IQ—2026—001</dd></div><div><dt>Документ</dt><dd>Демонстрационный паспорт</dd></div></dl><div class="row">${ui_js_1.btn('Скачать паспорт', 'primary', '', 'data-export-passport')}${ui_js_1.btn('Обслуживание', 'secondary', '', 'data-dialog="service-dialog"')}</div></div></div><section class="object-aftercare"><div><h2>Забота продолжается.</h2><p>Конкретные инструкции, возможность обратиться за помощью и история обслуживания — часть продукта, а не примечание к покупке.</p></div><div><details class="iq-accordion" open><summary>Документация и уход ${components_js_1.icon('plus', 18)}</summary><div>Для реального изделия здесь нужны инструкции производителя, сведения о материале и ограничения ухода. Демонстрационный паспорт не содержит выдуманных рекомендаций.</div></details><details class="iq-accordion"><summary>Обращение в сервис ${components_js_1.icon('plus', 18)}</summary><div>В макете можно сохранить описание запроса локально. Отправка в сервис не подключена.</div></details><details class="iq-accordion"><summary>История изменений ${components_js_1.icon('plus', 18)}</summary><div>Паспорт создан как демонстрация интерфейса. Производство, сертификация и гарантия не заявляются.</div></details></div></section></div>${siteFooter()}`; }
/** Page-scoped, finite motion. No animation loop, observers or backdrop filter in idle. */
function bindEdition(root) {
    const controller = new AbortController();
    const signal = controller.signal;
    const animations = new Set();
    let timer;
    let sceneStep = 0;
    let playing = false;
    const low = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
    const animate = (el, frames, duration = 240) => {
        if (low())
            return;
        el.getAnimations().forEach(a => a.cancel());
        const a = el.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.2,1)' });
        animations.add(a);
        a.finished.catch(() => { }).finally(() => animations.delete(a));
    };
    const choose = (step) => {
        sceneStep = step;
        const frame = root.querySelector('[data-narrative-frame]');
        if (!frame)
            return;
        frame.innerHTML = narrativeCard(step);
        root.querySelectorAll('[data-narrative-step]').forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.narrativeStep) === step)));
        const index = root.querySelector('[data-stage-index]');
        if (index)
            index.textContent = `0${step + 1} / 03`;
        animate(frame, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], 440);
    };
    const stop = () => {
        clearTimeout(timer);
        playing = false;
        const b = root.querySelector('[data-play-narrative]');
        if (b) {
            b.innerHTML = components_js_1.icon('play', 16) + ' Показать переход';
            b.setAttribute('aria-pressed', 'false');
        }
    };
    root.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b)
            return;
        if (b.hasAttribute('data-catalog-toggle')) {
            const nav = b.closest('.catalog-nav');
            nav.classList.toggle('open');
            b.setAttribute('aria-expanded', String(nav.classList.contains('open')));
        }
        if (b.hasAttribute('data-demo-cancel'))
            components_js_1.notify({ message: 'Пример отменён', description: 'Реальные изменения не выполнялись.' });
        if (b.hasAttribute('data-narrative-step')) {
            stop();
            choose(+b.dataset.narrativeStep);
        }
        if (b.hasAttribute('data-play-narrative')) {
            if (playing) {
                stop();
                return;
            }
            if (low()) {
                choose((sceneStep + 1) % 3);
                return;
            }
            playing = true;
            b.setAttribute('aria-pressed', 'true');
            b.innerHTML = components_js_1.icon('pause', 16) + ' Остановить';
            choose(0);
            timer = setTimeout(() => { choose(1); timer = setTimeout(() => { choose(2); stop(); }, 1250); }, 1250);
        }
        if (b.hasAttribute('data-accept-result')) {
            const scene = b.closest('[data-transition-scene]');
            if (scene.classList.contains('accepted'))
                return;
            scene.classList.add('accepted');
            scene.querySelector('[data-motion-caption]').textContent = 'Результат принят. Команда может переходить к следующему шагу.';
            scene.querySelector('.motion-state').textContent = 'Готово';
            scene.querySelector('.result-icon').innerHTML = components_js_1.icon('checkCircle', 28);
            b.disabled = true;
            b.textContent = 'Результат принят';
            animate(scene.querySelector('.result-icon'), [{ opacity: .3, transform: 'scale(.88)' }, { opacity: 1, transform: 'scale(1)' }], 280);
        }
        if (b.hasAttribute('data-reset-result')) {
            const scene = b.closest('[data-transition-scene]');
            scene.classList.remove('accepted');
            scene.querySelector('[data-motion-caption]').textContent = 'Описание и материалы собраны. Решение ещё не принято.';
            scene.querySelector('.motion-state').textContent = 'На проверке';
            scene.querySelector('.result-icon').innerHTML = components_js_1.icon('file', 28);
            const accept = scene.querySelector('[data-accept-result]');
            accept.disabled = false;
            accept.textContent = 'Принять результат';
        }
    }, { signal });
    root.addEventListener('input', e => {
        const input = e.target;
        if (!input.hasAttribute('data-catalog-search'))
            return;
        const q = input.value.trim().toLocaleLowerCase('ru');
        let n = 0;
        root.querySelectorAll('.catalog-group').forEach(g => {
            let visible = 0;
            g.querySelectorAll('[data-catalog-entry]').forEach(a => {
                const show = (a.dataset.search || '').toLocaleLowerCase('ru').includes(q);
                a.hidden = !show;
                if (show)
                    visible++;
            });
            g.hidden = visible === 0;
            if (q)
                g.open = visible > 0;
            n += visible;
        });
        const empty = root.querySelector('.catalog-empty');
        if (empty)
            empty.hidden = n > 0;
    }, { signal });
    root.addEventListener('iq-change', e => {
        const el = e.target;
        const value = String(e.detail.value);
        const button = root.querySelector('.button-context .iq-btn');
        if (!button)
            return;
        if (el.hasAttribute('data-preview-variant')) {
            button.classList.remove('primary', 'secondary', 'accent');
            button.classList.add(['primary', 'secondary', 'accent'][+value]);
        }
        if (el.hasAttribute('data-preview-size')) {
            button.classList.remove('sm', 'lg');
            if (value === '0')
                button.classList.add('sm');
            if (value === '2')
                button.classList.add('lg');
        }
    }, { signal });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stop();
            animations.forEach(a => a.cancel());
            animations.clear();
        }
    }, { signal });
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', () => {
        if (low()) {
            stop();
            animations.forEach(a => a.cancel());
            animations.clear();
        }
    }, { signal });
    return () => { controller.abort(); clearTimeout(timer); animations.forEach(a => a.cancel()); animations.clear(); };
}

