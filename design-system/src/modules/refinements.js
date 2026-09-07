"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindRefinements = bindRefinements;
exports.installRefinements = installRefinements;
exports.toneOfVoice = toneOfVoice;
exports.updateSteps = updateSteps;
const stories_js_1 = require("./stories.js");
const components_js_1 = require("./components.js");
const ui_js_1 = require("./ui.js");
const structured_js_1 = require("./structured.js");
const events = [
    { day: '4 сентября', type: 'decisions', glyph: 'check', title: 'Макет проверен', body: 'Мария Лебедева подтвердила композицию и состояния.', time: '16:40', detail: '' },
    { day: '4 сентября', type: 'materials', glyph: 'file', title: 'Добавлены материалы проверки', body: 'Два документа связаны с задачей SPR-128.', time: '15:10', detail: 'Описание релиза и критерии готовности. Это демонстрационные события.' },
    { day: '4 сентября', type: 'system', glyph: 'sliders', title: 'Обновлены свойства задачи', body: 'Срок, ответственный и статус', time: '14:20', detail: 'Срок: 18 сентября. Ответственный: Мария Лебедева. Статус: на проверке. Три изменения собраны в одно событие.' },
    { day: '3 сентября', type: 'decisions', glyph: 'message', title: 'Гипотеза принята', body: 'Александр Ким зафиксировал следующий шаг.', time: '11:30', detail: '' }
];
function activity() { return `<div class="activity-panel" data-activity><header><div><span class="sample-overline">ПРОИСХОЖДЕНИЕ РЕШЕНИЯ</span><h3>История работы</h3></div>${ui_js_1.badge('Образец', '', false)}</header><div class="activity-filters" role="group" aria-label="Тип событий">${[['all', 'Все'], ['decisions', 'Решения'], ['materials', 'Материалы'], ['system', 'Система']].map(([id, t]) => `<button type="button" data-event-filter="${id}" aria-pressed="${id === 'all'}">${t}</button>`).join('')}</div><div class="activity-days">${[...new Set(events.map(e => e.day))].map(day => `<section data-event-day><h4>${day}</h4><div>${events.filter(e => e.day === day).map(e => `<article class="activity-event" data-event-type="${e.type}"><span class="event-symbol ${e.type}">${components_js_1.icon(e.glyph, 19)}</span><div>${e.detail ? `<details><summary><b>${e.title}</b>${components_js_1.icon('down', 14)}</summary><p class="event-detail">${e.detail}</p></details>` : `<b>${e.title}</b>`}<p>${e.body}</p></div><time>${e.time}</time></article>`).join('')}</div></section>`).join('')}</div><div class="activity-next"><span>${components_js_1.icon('arrow', 19)}</span><div><b>Подготовить реализацию</b><p>Следующий шаг, ещё не событие истории</p></div></div><p class="sr-only" data-event-count role="status">4 события</p></div>`; }
function updateSteps(box, step) {
    box.setAttribute('data-current-step', String(step));
    box.querySelectorAll('li').forEach((li, i) => {
        const done = i < step - 1, current = i === step - 1;
        li.classList.toggle('done', done);
        li.classList.toggle('current', current);
        current ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current');
        const index = li.querySelector('.iq-step-index');
        if (index)
            index.innerHTML = done ? components_js_1.icon('check', 18) : String(i + 1);
        const caption = li.querySelector('.step-status');
        if (caption)
            caption.textContent = done ? 'Завершено' : current ? 'Текущий шаг' : 'Впереди';
        const button = li.querySelector('[data-step-set]');
        if (button)
            button.disabled = i > step - 1;
    });
    const helper = box.querySelector('.iq-helper');
    if (helper)
        helper.textContent = `Шаг ${step} из 3`;
    const prev = box.querySelector('[data-step="-1"]'), next = box.querySelector('[data-step="1"]');
    if (prev)
        prev.disabled = step === 1;
    if (next)
        next.disabled = step === 3;
}
function installRefinements() {
    structured_js_1.registerStructured();
    const set = (id, demo, description, usage, keyboard) => {
        const s = stories_js_1.stories.find(x => x.id === id);
        s.demo = demo;
        if (description)
            s.description = description;
        if (usage)
            s.usage = usage;
        if (keyboard)
            s.keyboard = keyboard;
    };
    set('stepper', () => `<div data-stepper data-current-step="1"><ol class="iq-stepper" aria-label="Этапы настройки">${['Данные', 'Доступ', 'Готово'].map((s, i) => `<li class="${i === 0 ? 'current' : ''}" ${i === 0 ? 'aria-current="step"' : ''}><button type="button" data-step-set="${i + 1}" ${i ? 'disabled' : ''}><span class="iq-step-index">${i + 1}</span><span class="step-copy"><b>${s}</b><small class="step-status sr-only">${i ? 'Впереди' : 'Текущий шаг'}</small></span></button></li>`).join('')}</ol><p class="iq-helper step-counter sr-only" aria-live="polite">Шаг 1 из 3</p><div class="row">${ui_js_1.btn('Назад', 'secondary sm', 'left', 'data-step="-1" disabled')}${ui_js_1.btn('Далее', 'primary sm', 'arrow', 'data-step="1"')}</div></div>`, 'Пройденное, текущее и предстоящее — три разных состояния.', 'У пройденного шага нейтральная заливка и галочка. Текущий выделен контрастом и подписью. К завершённому шагу можно вернуться.');
    set('date-picker', () => `<div class="calendar-variants">${ui_js_1.tabs([{ key: 'date', label: 'Только дата', body: '<iq-calendar value="2026-09-18" name="date-only"></iq-calendar>' }, { key: 'datetime', label: 'Дата и время', body: '<iq-calendar value="2026-09-18" with-time time="14:30" name="meeting"></iq-calendar>' }, { key: 'field', label: 'Поле срока', body: '<div class="date-field-example"><iq-date-field label="Срок" name="deadline" value="2026-09-18"></iq-date-field><p class="iq-helper">Тот же календарь открывается из поля, в том числе внутри диалога.</p></div>' }], 'label="Вариант календаря"')}</div>`, 'Дата, дата со временем и поле срока с тем же календарём.', 'Выбранная дата сохраняет контраст при наведении. Время не содержит часовой пояс: приложение должно определять его отдельно. min/max ограничивают даты.');
    set('pagination', () => `<div class="pagination-variants">${ui_js_1.tabs([
        { key: 'short', label: '5 страниц', body: '<iq-pagination total="5" current="1"></iq-pagination>' },
        { key: 'many', label: '48 страниц', body: '<iq-pagination total="48" current="24"></iq-pagination>' },
        { key: 'end', label: '240 страниц', body: '<iq-pagination total="240" current="238"></iq-pagination>' }
    ], 'label="Количество страниц"')}</div>`, 'Текущая страница и доступные переходы — на одной оси.', 'Короткая и длинная последовательности. Крайние страницы всегда доступны, пропуски обозначены многоточием. Смена страницы не меняет порядок данных.', 'Tab — переходы, Enter/Space — выбор. Предыдущая/следующая недоступны на границах.');
    set('command', () => `<button type="button" class="command-entry" data-command>${components_js_1.icon('search', 22)}<span><b>Найти в дизайн-системе</b><small>Компонент, правило или рабочий пример</small></span><kbd>⌘ K</kbd>${components_js_1.icon('arrow', 19)}</button>`, 'Вся строка открывает поиск, а не только значок.');
    set('list', () => `<div class="iq-list navigation-list"><a class="iq-list-item" href="#components/file-item"><span class="list-symbol">${components_js_1.icon('folderOpen', 24)}</span><span class="list-copy"><b>Библиотека материалов</b><small><span>4 файла для предпросмотра</span><span>Локальные образцы</span></small></span>${components_js_1.icon('chevron', 19)}</a><a class="iq-list-item" href="#rules/principles"><span class="list-symbol">${components_js_1.icon('file', 24)}</span><span class="list-copy"><b>Принципы дизайна</b><small><span>Редакция 04</span><span>IQUIPAGE</span></small></span>${components_js_1.icon('chevron', 19)}</a></div>`, 'Вся строка — один понятный переход.', 'Один элемент ссылки на всю строку. Нет вложенной кнопки, конкурирующей со ссылкой. Enter открывает раздел.');
    set('metric', () => `<div class="iq-metric refined-metric"><header><h3>Закрыто задач</h3>${ui_js_1.badge('Образец', '', false)}</header><div class="metric-measure"><strong>128</strong><div><span>из 160</span><small>за сентябрь</small></div><span class="metric-glyph">${components_js_1.icon('chart', 24)}</span></div><div class="metric-track"><span>Выполнено 80%</span>${ui_js_1.progress(80, 'Закрыто 128 из 160 задач')}</div><div class="metric-foot"><span class="metric-change">${components_js_1.icon('arrowUp', 15)}<b>18</b> больше, чем в прошлом периоде</span><span class="metric-spark">${ui_js_1.sparkline()}</span></div></div>`, 'Главное число, общий объём и изменение читаются отдельно.');
    set('timeline', activity, 'Решения, материалы и системные изменения собраны по дням.', 'Фильтры не меняют историю. Повторные системные изменения объединены в раскрывающуюся запись. Следующая задача отделена от уже случившихся событий.');
    set('tree', () => `<div class="tree-variants">${ui_js_1.tabs([{ key: 'navigation', label: 'Навигация', body: '<iq-tree></iq-tree>' }, { key: 'selection', label: 'С выбором', body: '<iq-tree checkable></iq-tree>' }], 'label="Вариант дерева"')}</div>`, 'Два режима: навигация и выбор документов с частичным состоянием.', 'Раскрытие и выбор не смешаны. В режиме выбора галочка родителя управляет его документами; частичный выбор виден отдельно. Поиск сохраняет родительский контекст.', '↑/↓ — строки; ←/→ — иерархия; Home/End — начало/конец. Space — выбор группы, Enter — раскрытие или открытие.');
    set('alert', () => `<div class="message-gallery">${ui_js_1.alert('Изменения сохранены', 'Можно продолжить работу.', 'success')}${ui_js_1.alert('Нужно ваше решение', 'Уточните дату перед публикацией.', 'warning')}${ui_js_1.alert('Не удалось подключиться', 'Повторите попытку. Введённые данные остались в форме.', 'danger')}${ui_js_1.alert('Доступна новая версия', 'Посмотрите изменения перед обновлением.', 'info')}</div>`, 'Статус, причина и следующий шаг — без неоднозначных цветов.');
    set('banner', () => `<div class="system-notice"><span class="system-symbol">${components_js_1.icon('info', 27)}</span><div><span class="sample-overline">О РАБОЧЕЙ СРЕДЕ</span><h3>Вы работаете в локальном макете</h3><p>Изменения остаются в этом браузере. Серверные операции не выполняются.</p></div><a class="iq-btn secondary sm" href="#rules/implementation">Что доступно ${components_js_1.icon('arrow', 17)}</a></div>`, 'Системное сообщение заметно, но не притворяется ошибкой.');
    set('file-item', () => `<div class="file-samples-head"><div><h3>Рабочие материалы</h3><p>Нажмите на миниатюру, чтобы открыть оригинал.</p></div>${ui_js_1.badge('4 образца', '', false)}</div><iq-upload variant="rows" samples></iq-upload>`, 'Документ, изображение и кадр видео — вместо одинаковых пиктограмм.', 'Превью строится по реальному содержимому. TXT/MD/CSV/JSON отображаются текстом; изображения — без изменения оригинала; видео — локальные кадры. PDF использует PDF.js или предоставленный приложением рендерер. Без него доступен оригинал.', 'Tab к миниатюре, Enter — просмотр. Escape — закрыть. Для видео доступны нативные клавиатурные элементы управления.');
    set('upload-feedback', () => `<div class="message-gallery">${ui_js_1.alert('Файл больше 10 МБ', 'Уменьшите размер или разделите документ. Остальные файлы остаются в списке.', 'danger')}${ui_js_1.alert('Этот формат не поддерживается', 'Добавьте PDF, текст, изображение, ZIP, MP4 или WebM.', 'warning')}</div>`);
    set('signature-surface', () => `<section class="refined-feature"><div class="feature-copy"><span class="sample-overline">SPRINTIQUE / КОНТЕКСТ РЕШЕНИЯ</span><h3>Не искать заново.<br>Продолжать работу.</h3><p>Описание, материалы и решение команды остаются рядом с задачей.</p>${ui_js_1.btn('Открыть рабочий пример', 'primary', '', 'data-open-task="SPR-128"')}</div><div class="feature-proof"><div class="proof-mini-head"><span>SPR-128</span>${ui_js_1.badge('На проверке', 'warning', false)}</div><h4>Подготовить страницу<br>нового релиза</h4><div class="feature-proof-row"><span class="feature-proof-symbol">${components_js_1.icon('file', 20)}</span><span><b>Описание и материалы</b><small>Один контекст для всей команды</small></span></div><div class="feature-proof-row"><span class="feature-proof-symbol done">${components_js_1.icon('check', 20)}</span><span><b>Критерии готовности</b><small>Решение опирается на результат</small></span></div><div class="feature-proof-foot">${components_js_1.icon('users', 17)}Команда может продолжить работу</div></div></section>`, 'Презентация через рабочий объект, не через декоративный фон.', 'Функция показывается через реальные элементы интерфейса. Без непроверяемых обещаний, фоновых полос и бесконечной анимации.');
    set('frost-surface', () => `<div class="refined-context"><div class="context-record"><div><span class="sample-overline">РАБОЧИЙ ДОКУМЕНТ</span><h3>Концепция коллекции</h3></div><span class="document-symbol">${components_js_1.icon('file', 30)}</span><dl><div><dt>Версия</dt><dd>03</dd></div><div><dt>Среда</dt><dd>Локальный пример</dd></div></dl></div><div class="context-confirmation"><div><b>Контекст на месте</b><p>Документ, версия и состояние остаются рядом. Можно продолжить с того же места.</p></div><span class="message-emblem success">${components_js_1.icon('check', 25)}</span></div></div>`);
}
function toneOfVoice() {
    const pairs = [['Сохранение', 'Успешно! Ваши изменения были сохранены.', 'Изменения сохранены.'], ['Ошибка формы', 'Некорректные данные пользователя.', 'Укажите полный адрес почты, например name@company.com.'], ['Проблема соединения', 'Что-то пошло не так.', 'Не удалось подключиться. Повторите попытку. Данные остались в форме.'], ['Пустое состояние', 'Здесь пока ничего нет.', 'Задач пока нет. Создайте первую, чтобы начать работу.'], ['Удаление', 'Вы уверены?', 'Удалить задачу «Подготовить релиз»? Удаление можно отменить.'], ['Автоматизация', 'ИИ всё сделал за вас.', 'Черновик подготовлен агентом. Проверьте материалы перед публикацией.']];
    return `<span class="sample-overline">ПРАВИЛА / TONE OF VOICE</span><h1>Голос продукта.<br>На стороне человека.</h1><p class="rules-lead">Спокойный, предметный и уважительный. Говорим о действии и результате, не оцениваем человека и не преувеличиваем возможности продукта.</p><div class="principle-list">${[['Сначала смысл', 'Что случилось, что сохранилось и что делать дальше. В ошибке следующий шаг важнее извинений.'], ['Обращение на «вы»', 'Без фамильярности, восклицательной похвалы и давления. Не делаем эмоциональные выводы за человека.'], ['Называем действие', '«Сохранить изменения», «Создать задачу», «Повторить попытку». Не «ОК», когда последствия неочевидны.'], ['Никаких выдуманных гарантий', '«Черновик сохранён» только после подтверждения записи. Результат агента не называется проверенным без проверки.'], ['Метаданные — отдельные роли', 'Версия, дата, автор и демонстрационный статус размещаются отдельными подписями или статусами. Не соединяем их точками-буллетами.'], ['Один язык для одной сущности', 'Задача не превращается в карточку, тикет или элемент между экранами. Числа и даты оформляются по локали человека.']].map(([h, p], i) => `<article><span>0${i + 1}</span><div><h2>${h}</h2><p>${p}</p></div></article>`).join('')}</div><h2 class="rules-subheading">Не украшать. Объяснять.</h2><div class="voice-examples">${pairs.map(([type, before, after]) => `<article><span>${type}</span><div class="voice-before"><small>Не используем</small><p>${before}</p></div><div class="voice-after"><small>Вместо этого</small><p>${after}</p></div></article>`).join('')}</div><p class="rules-copy">Тон зависит от ситуации: в знакомстве можно быть выразительнее; в работе — короче; в ошибке — точнее. Обязательные ограничения и последствия действия не прячутся за дружелюбной формулировкой.</p>`;
}
/** Finite, interruptible additions. No idle frame loop or repeated page entrance animation. */
function bindRefinements(root) {
    const events = new AbortController(), signal = events.signal;
    const animations = new Set();
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
    const animate = (el) => {
        if (reduce())
            return;
        el.getAnimations().forEach(a => a.cancel());
        const a = el.animate([{ opacity: .55, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' });
        animations.add(a);
        a.finished.catch(() => { }).finally(() => animations.delete(a));
    };
    root.querySelectorAll('[data-stepper]').forEach(x => updateSteps(x, Number(x.getAttribute('data-current-step')) || 1));
    root.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b)
            return;
        if (b.dataset.stepSet) {
            const box = b.closest('[data-stepper]');
            updateSteps(box, Number(b.dataset.stepSet));
        }
        if (b.dataset.eventFilter) {
            const parent = b.closest('[data-activity]');
            parent.querySelectorAll('[data-event-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            let count = 0;
            parent.querySelectorAll('[data-event-type]').forEach(x => {
                x.hidden = b.dataset.eventFilter !== 'all' && b.dataset.eventFilter !== x.dataset.eventType;
                if (!x.hidden)
                    count++;
            });
            parent.querySelectorAll('[data-event-day]').forEach(x => x.hidden = !Array.from(x.querySelectorAll('[data-event-type]')).some(y => !y.hidden));
            parent.querySelector('[data-event-count]').textContent = `Событий: ${count}`;
            animate(parent.querySelector('.activity-days'));
        }
    }, { signal });
    root.addEventListener('iq-change', e => {
        const el = e.target;
        if (el.tagName === 'IQ-TABS') {
            const panel = Array.from(el.querySelectorAll('[data-panel]')).find(p => p.closest('iq-tabs') === el && !p.hidden);
            if (panel && el.closest('.component-specimen'))
                animate(panel);
        }
    }, { signal });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden)
            animations.forEach(a => a.cancel());
    }, { signal });
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', () => {
        if (mq.matches)
            animations.forEach(a => a.cancel());
    }, { signal });
    return () => { events.abort(); animations.forEach(a => a.cancel()); animations.clear(); };
}

