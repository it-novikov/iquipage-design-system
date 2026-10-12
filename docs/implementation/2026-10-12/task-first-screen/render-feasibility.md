# PF04 / WP04 — feasibility сравнительного actual render первого экрана Task

Дата: 12 октября 2026. Автор: task_first_screen_render, узкая read-only проверка технической осуществимости. **Статус: READY TO PREPARE AN EXPERIMENT, не actual-render результат и не разрешение на production-изменение.**

## 1. Рекомендация

Самый маленький достаточно честный опыт — **актуальный baseline и уточнённый VT1 на одинаковых данных, с итоговой композицией до первого mount**. Для этого хватает отдельного короткого runner и sibling fixture рядом с tabs-geometry. Временные exact source patches подставляются Vite под исходными module IDs; исходные production-файлы в репозитории остаются неизменными. Каждый вариант получает отдельный build и открывается через уже имеющийся Vite preview. Это следует называть **экспериментально собранным продуктовым frontend с синтетическим adapter**, а не production candidate или backend-приёмкой.

Для VT1 достаточно двух основных overlay-файлов — ui/src/board/task-dialog.js и ui/src/board/task-work-view.js — и маленькой presentation-правки question status в ui/src/board/work-model.js согласно уточнённому handoff. Selector в work-model не меняется. Поставленные DS54 .iq-properties[data-label=wide] и native details.iq-work-details уже дают нужные строки и раскрытие; необходимость нового CSS в первой итерации не установлена. Если после рендера потребуется поправить отступ продуктовой обёртки, это отдельный небольшой, также сохранённый diff — без изменения внутренних контролов DS. [S1] [S2] [S9] [D1] [D2]

C остаётся контрольной перестановкой без disclosure. VT2 остаётся альтернативой полного открытого списка рядом с содержанием **только при достаточной фактической ширине existing fullscreen**. По последнему сообщению reviewer, согласованному им с root, эти варианты подключаются к конкретному неразрешённому конфликту, а не ради обязательного числа сравнительных слотов. Первоначальная задача перечисляла все четыре; эта записка сохраняет технический путь для всех, но не превращает их количество в gate.

Уточнение root имеет приоритет над исходным proposal: сохраняются внешний заголовок «Описание» и существующая рамка summary. В этой рамке отдельно виден status **только в question/review**; в review — короткий буквальный preview result именно выбранного workFocus шага. Generic session status не добавляется в другие ветви: он может ошибочно назвать возвращённый на доработку шаг завершённым. **Второго полного workStep на вкладке Task нет.** Existing selector, права, модель данных и review handler остаются прежними. В question при canAnswer=false используется «Вопрос ждёт ответа». Сам факт такого текста не расширяет право ответить. [P3]

## 2. Основание и то, что выполнено

Прочитан чистый repo-tabs, HEAD **8f8d218168074bd4c7c9e1e29dfbe783a27998dd**. Проверены применимые AGENTS, START-HERE, engineering/bridge protocol и targeted правила iquipage-review. `bridge brief` без выбранной задачи вернул несколько карточек; claim и записи в карточку не выполнялись по явному read-only scope root. Исходный аудит не повторялся.

Прочитаны runner, workflow, product/repository fixtures, task markup и mounted slots, workFocus/workOverview, summary/review routing, эффективные product CSS, shipped DS contracts и lifecycle, meaningful seed и формы server response. Прочитанные DS control/work-story docs, components/date-field/editor и CSS побайтно сверены с archive54 и совпали с installed files. **Не запускались browser, npm build/test, JDK/PostgreSQL, workflows; репозитории, ветки и production UI не менялись.** Известный локальный native blocker /proc, TypeScript 7 /proc/self/exe и отсутствие JDK25/PG18 принят как уже установленный вход: повторных попыток нет.

Исходный proposal SHA-256: 4a8a1862ec3684e81fb54e86da03304bd851cd8dd93e70220987a820de883aa5. Его статус не повышался до approved design. Reviewer сообщил immutable review: a690c90b5a5af055510f4f243b224dd1c502b97060650814b7eb96294db73c5f; его исходный аудит повторно не читался. Уточнение дизайнера от этого же дня проверено как отдельный frozen addendum, SHA-256 8118b3fc868153c9e68cc6080b6f3058b914ac3fe01cdfa2a534de55ccb171c3; его §§3–4 уточняют эксперимент, не означают принятую production UI. [P1] [P2] [P3]

### Уже работающая техническая опора

| Файл | Что переиспользовать | Что не приписывать этому механизму |
|---|---|---|
| tests/tabs-geometry-browser.mjs | Exact package/version/tar assertions; explicit plan hash; Vite build; loopback server; Playwright context с ru-RU/UTC/DPR1/reduced motion; запрет сторонних запросов; fonts + два animation frames; screenshots, errors и scroll ancestors. | Сейчас build-only работает с write:false, а browser читает Vite dev server. Это не сохранённый production bundle и не главный authenticated bootstrap. |
| tests/fixtures/tabs-geometry/product.js и product.html | Точный порядок public DS/product CSS imports; registerCore; настоящий mountProjectNavigation, mountTaskBoard и настоящий openTaskDialog через Board card. | Оболочка fixture и navigation adapter синтетические; прямой openTaskDialog доказывает менее полный путь, чем Board → Task. |
| tests/fixtures/tabs-geometry/repository.js | Узкий adapter с явными supported reads и unexpected operations. | Description сейчас слишком короткое; releases/tags/plan пусты; workPlan=null. Для H01/H02 этих данных недостаточно. |
| .github/workflows/tabs-geometry.yml | Ubuntu24.04, Node24.20.0, временный Playwright1.62.1, установленный Chromium, contents:read, artifact retention14days, существующий workflow_dispatch. | Полный backend/release gate этот browser job не заменяет. PF03 acceptance plan не превращается в PF04 plan. |

Vite 8.3.0 уже подключён продуктом; установленная декларация exports содержит build() и preview(), PreviewServer.close() и httpServer. Поэтому для static built artifact не нужны собственный HTTP server, новая bundler-платформа, новая UI-зависимость или общий framework экспериментов. [S3] [S4] [S5] [S6] [S7] [V1]

## 3. Почему source overlay предпочтительнее переноса после mount

| Вариант | Цена и подлинность | Честный предел |
|---|---|---|
| Postmount DOM arrangement в fixture | Самый короткий код: переместить product-owned секции и существующие control nodes до любых действий. Получается настоящая геометрия настоящих DS контролов. | Обычный reconnect DS54 IqElement вызывает cleanup, abort и mount. IqSelect заново пишет innerHTML; Select/DateField закрывают popup при disconnect. Сохранённая ссылка на custom element не доказывает сохранённый внутренний input, focus, listeners или draft. Нельзя объявлять original lifecycle/interaction PASS после такого перемещения. |
| Exact source patch → temporary Vite build | Немного больше подготовки: временные копии 2–3 явно перечисленных файлов, patch bytes, hashes и небольшой Vite load overlay. Первый mount сразу создаёт правильный DOM, controls получают обычные product callbacks. | Это отдельная экспериментальная сборка; сам diff ещё не production-кандидат. Synthetic adapter всё ещё не доказывает backend save. |
| Окончательное source edit выбранной композиции | Следующий шаг после выбора: конечный DOM рождается непосредственно из production source, без runtime variant flags. | Требует своей применимой проверки и review. Доказательство эксперимента не переносится автоматически на иной commit. |

DS54 MarkdownEditor отдельно имеет connectedMoveCallback и защиту переноса внутри той же формы/document. У Select и DateField такой контракт не установлен. Поэтому общий moveBefore workaround не следует вводить ради этого опыта и нельзя распространять гарантию редактора на все контролы. Source overlay дешевле, чем универсальное исправление переносов. [D3] [D4] [D5]

### Узкий алгоритм overlay

1. Runner проверяет frozen product source revision/tree, package-lock, exact vendor tar и bytes разрешённых source files. Изменение исходника означает новый baseline, а не молчаливый fuzzy patch.
2. В отдельной временной директории вне checkout создаются копии только разрешённых файлов с прежними относительными путями. Checked-in unified diff применяется там обычным git apply без --3way и без --index. Проверяются hash самого diff и ожидаемый hash каждого итогового файла. Разрешённый список overlay IDs фиксирован — не произвольный API переписывания проекта.
3. Небольшой Vite plugin с enforce:pre/load возвращает patched bytes только для exact исходных IDs этих файлов. Module ID остаётся прежним: относительные imports продолжают вести в реальный продукт и его public @iquipage/web package. Это не alias внутренностей DS, не копия контролов и не monkeypatch их прототипов.
4. Для baseline overlay пуст. Experimental CSS, если оно вообще нужно, в baseline отсутствует. Build configuration и fixture данные общие. Каждый вариант получает свежий build output и отдельный preview/server, чтобы module cache не смешивал варианты.
5. Vite build пишет bundle в одноразовую output-директорию; preview обслуживает именно эти bytes на 127.0.0.1. Browser loads разрешены только с этого origin. Сохраняются hash bundle assets, source diff и outcome manifest. Build и browser используют одну и ту же overlay map.
6. На resize и раскрытии DOM не перекладывается: меняется только native details open / CSS reflow. Данные не мигрируют, production flags не появляются.

Техническая стоимость сверх postmount пути — temporary file preparation, exact overlay и build+preview; остальные launch/probe/capture/error routines уже имеют рабочий образец. Точное время нового runner пока не измерено.

## 4. Минимальный будущий patch set

Все пути ниже относительны products/sprintique, кроме workflow. **Сейчас этих изменений нет.**

| Будущий файл | Назначение |
|---|---|
| tests/task-first-screen-browser.mjs | Узкий orchestrator: provenance, materialize patch, Vite build+preview, фиксированные cases, небольшие DOM/value/scroll probes, viewport PNG и results.json. Использует имеющиеся Node/Vite/Playwright; не импортирует старый runner с его top-level execution. |
| tests/fixtures/task-first-screen/product.html | Та же оболочка product.html с отдельным title и entry. Никакой нарисованной Task-разметки. |
| tests/fixtures/task-first-screen/product.js | Тот же CSS/import/mount path. Настраивает test dataset и probe; открытие Task выполняет runner через настоящую карточку Board. Dataset/query — только механизм fixture; production module не читает variant flag. |
| tests/fixtures/task-first-screen/repository.js | Meaningful immutable cases + небольшой адаптер по существующему примеру. Явные reads, попытки writes и unsupported operations. Синтетический /work response имеет серверную форму. |
| tests/fixtures/task-first-screen/comparison-plan.json | Frozen source/tar/diff fingerprints, идентификаторы случаев и кадров, ожидаемый selected work id, среда, ограничения. Небольшой протокол эксперимента; не универсальный acceptance framework. |
| tests/fixtures/task-first-screen/vt1.patch | Изменение task-dialog.js: 4 прямые строки, 7 строк в details до Description; симметрия editable/readonly. Изменение task-work-view.js: refinement только existing summary. Маленькая copy-правка question status в work-model.js, без изменения workFocus. Сохранённый полный diff обозрим до запуска. |
| .github/workflows/tabs-geometry.yml | Позднее root может добавить manual-only step для companion runner и включить его output в существующий artifact. Старые PF03 шаги и plan не переписываются. |

Дополнительный общий utils-модуль не нужен для такого объёма: короткие copied routines из старого runner легче обозреть, чем сначала рефакторить пройденный PF03 harness. C/VT2 patches и их CSS добавляются лишь после формулировки вопроса, на который они отвечают. Root остаётся единственным владельцем GitHub mutations.

### Exact места изменения и сохранённые границы

task-dialog.js строки 103–142 создают 11 строк. Первые четыре — status, ownerId, due, priority; далее estimate, type, catalogs/release, plan, parent, tags, author. В обоих представлениях остаются те же поля/слоты. FormData недостаточно как единственное доказательство: read() также читает .value у select/date/editor и closure state estimate/catalogs/files. mountPlanField при отсутствии repository.applyPlanningChange становится readonly. Нельзя случайно назвать такой fixture полной проверкой editable Planning. [S1] [S8]

VT1 меняет группировку до mount, сохраняет внешнее «Описание», а описание остаётся одним iq-markdown-editor. Native summary «Другие свойства» имеет вторичный естественно переносимый hint «Оценка, тип, релиз, план…»; длинный hint не зажимается в фиксированную высоту. Раскрытие не должно dispatch change/iq-change в форму. Закрытая details содержит уже смонтированные, не disabled controls; не lazy render. Title, due/status signal, priorityTouched, Type/template offer, catalog closures, plan callback, task route, footer и autosave read/flush остаются исходными. [P3]

SummaryRoot — product-owned section, а не внутренний DOM DS. task-work-view.js уже вычисляет focus и review в render; можно использовать эти же переменные для preview, сохранив исходную data-work-summary-action кнопку и listener. Review click должен по-прежнему открыть вкладку work и существующий review:<id>. Открытый question всегда выигрывает у review согласно неизменённому workFocus. Нельзя выбирать самый свежий session/result или дублировать approve/reject наверху. [S2] [S9]

Уточнённый пробный preview берёт весь workText(focus.item.result).trim(), затем буквальное начало до 160 Unicode code points с предпочтением предыдущей границы слова. Это измеряемый начальный budget, не новый gate и не строковый clamp. Короткий текст подписан «Результат шага», сокращённый — «Начало результата» с видимым многоточием; пустой — «Описание результата не добавлено». Title и существующий CTA стоят до preview в DOM. Текст escaped; evidence/criteria/decision остаются в полном Work review. Пример с пустым result допустим как presentation edge, но отдельно маркируется, если не представляет нормальный современный серверный done-переход. [P3]

## 5. Данные: одинаковая работа, не красивый пустой fixture

H01 обычной Task следует заполнять по текущему product-owned шаблону: «Цель», «Что сделать», «Критерии готовности». Например, заданием может быть сохранение черновика ответа при уходе и возвращении в задачу: явно назвать проблему, требуемое поведение и проверяемый следующий шаг. Нужен содержательный текст, написанный как заполненная задача, с достаточно длинным описанием для оценки C/H11. Не оставлять вопросительные заглушки шаблона и не объявлять авторский пример реальным пользовательским документом. [S10]

Отдельный H01 bug использует текущие «Проблема», «Как повторить», «Ожидаемый результат», «Фактический результат», «Окружение». Он полезен как узкий 390px/Type пример, не требует второго полного Cartesian product.

В обоих — осмысленно заполненные owner/due/priority/estimate/type/release/plan/parent/tags/author, длинные, но допустимые title/имя/release. Dates фиксируются вместе с browser Date, чтобы deadline tone не менялся между парными кадрами. Текст, права, роли, ids и значения в baseline и варианте побайтно одинаковы. Верхняя рамка summary отсутствует только в действительно no-work H01; не убирать её из H02 ради экономии высоты.

Для H02 использовать смысл существующего work-preview-seed: S1 «Проверить сохранение истории», result «История остаётся доступной после обновления страницы.», выполненный criterion об истории, evidence и следующий S2 о передаче работы. **Seed не запускается**; synthetic read-only response воспроизводит форму TaskWork.read: schema/revision/workPlan/sessions/requests/events/permissions. Поля steps согласуются с contracts/work.ts и сервером: done + pending/unreviewed, непустые result/evidence и выполненные criteria. Ссылки evidence обозначаются как синтетические и остаются same-origin. [S11] [S12] [S13]

В review-case Q1 отсутствует или уже answered: иначе существующий workFocus законно выберет question первым. Рекомендуется второй pending done шаг с другим result после S1: проверка selected id тогда обнаруживает случайный выбор «последнего результата». Это не новая логика селектора.

Несколько малых cases проверяют семантические края без матрицы кадров на каждую комбинацию: открытый Q1 + canAnswer=false; approved S1; rejected S1; работа без выбранного review result. Для последнего нельзя изобретать серверно недопустимый done step с пустым evidence ради теста: достаточно doing/empty-work случая. Изменения response — отдельные фиксированные случаи, не симуляция принятия человеком.

Нынешняя repository fixture не имеет applyPlanningChange и потому показывает Plan readonly. Для проверки лишь визуальной композиции это допустимый явно названный предел. Если нужен настоящий смонтированный editable Plan trigger, fixture может предоставить stub этого существующего adapter метода, который логирует попытку и отклоняет применение; открытие/закрытие popover тогда проверяемо, commit — по-прежнему нет. Не выдавать synthetic success за сохранение.

## 6. Минимальная матрица и точка решения

### Первый вопрос: VT1 даёт читаемый вход в работу и понятную цену дополнительных полей?

Минимальное ядро — **четыре новых viewport PNG**: baseline/VT1 × meaningful H01 task/H02 review при 1280×720, light, comfortable, root100. Это первый actual comparative render. Чтобы аргумент выбора не зависел от одного удачного desktop, предлагаемая узкая follow-up матрица ниже; количество файлов — оценка артефактов, не квота и не основание PASS.

| Профиль | Случай | Сравнение | Какой вопрос разрешает |
|---|---|---|---|
| 1280×720, light, comfortable, root100 | H01 длинная Task и H02 review | B / VT1, 4 исходных кадра | Есть ли цель / буквальный result до первой прокрутки? Что заняло освобождённое место? |
| 390×844, light, comfortable, root100 | H01 bug | B / VT1 | Работает ли вход на узком экране с заполненным bug report? |
| 1280×720, dark, comfortable, root100 | H02 review | B / VT1 | Сохранились ли state, текст и action при том же viewport/density? |
| 320×720, light, comfortable, root100 | H01 с длинными значениями | B / VT1 | Не скрывается ли новая цена в самом узком reflow? |
| 768×900, light, comfortable, root200 | H01 | B / VT1 | Не куплена ли высота уменьшением текста; куда ушли поля/смысл? Это HTML root font-size200, не browser zoom. |

Такой след за пределами ядра даёт ещё восемь кадров (четыре пары), а не все data×state×theme×viewport комбинации. При необходимости сохранить один VT1 кадр раскрытых дополнительных свойств и один кадр результата после existing review action. Кадры состояния раскрытия не подменяют исходное первое открытие.

Если вопрос с baseline/VT1 решён, для «полноты вариантов» ничего добавлять не требуется. Если цена disclosure остаётся спорной, C проверяется на том же meaningful длинном H01 и H02 в drawer: описание перед неизменным открытым списком. Если длительное чтение/частые properties требуют широкого рабочего места, сравниваются **current fullscreen baseline, C fullscreen и VT2 fullscreen** при одинаковых 1440×900/theme/density. C fullscreen отделяет эффект колонок от одного увеличения ширины и перестановки. Это не шесть обязательных render slots.

VT2 при необходимости начинает с проверки перехода через условие достаточной ширины с теми же nodes и values. Условие должно опираться на реальный доступный inline size и текстовый масштаб; широкий browser с drawer664px не подходит. Existing fullscreen body имеет max-width1160px, тогда как обычный drawer width min(664px,100vw). Один CSS fallback и один DOM-порядок, без duplicating/remount на resize. Старые workbench.css grid areas для personal supplement также надо учитывать, если этот контекст включён. [S14] [S15]

### Что принимать по этому опыту

Принимающий лично смотрит парные исходные кадры и краткий interaction record. Он может принять **экспертное решение о следующей композиции для реализации** либо сформулировать конкретный конфликт для C/VT2. Формулировка результата: «на этих данных выбран VT1/C/VT2 для следующего product patch; такие-то вопросы остаются». **Не human PASS**, не production-ready и не подтверждение сохранения.

H02 baseline→VT1 одновременно меняет presentation summary и группировку свойств. Нельзя приписать весь выигрыш группировке. Если именно причинность становится предметом спора, добавить один summary-only baseline reference на тех же H02 данных; это точечный контроль, не новый gate.

Для последующей человеческой проверки отдельно фиксируются первое действие без подсказки, объяснение цели/критерия/следующего шага, поиск результата и его review, а также цена повторных раскрытий Оценки/Типа/Релиза/Плана на нескольких задачах. Наблюдение агентом за собственной автоматизацией не является таким исследованием.

## 7. Небольшие meaningful probes вместо тысяч assertions

Скрипт фиксирует факты, а не вычисляет эстетический или usability PASS:

- **Подлинность первого кадра:** настоящий Board card открыл настоящий Task; readonly/allowed state известен; support/work response отрендерены; fonts готовы, два frames прошли; .iq-dialog-body находится в начальном положении. PNG берётся как viewport, не fullPage и не заранее прокрученный description crop.
- **Один экземпляр:** по одному status/ownerId/due/priority/type/parent/releaseId/editor и по одному estimate/catalogs/plan/tags slot. В baseline и VT1 сопоставлены публичные values, FormData и semantic static values. Отдельно проверяются plan/estimate/tag значения, которых FormData не покрывает. Одинаковые данные не требуют одинакового HTML разных композиций.
- **Раскрытие:** keyboard → native summary → Enter/Space → дополнительные controls. Сохранены ссылки на custom elements и их внутренние inputs после первого mount; раскрытие/закрытие и resize не создают новые nodes. Открыть и закрыть Type/estimate или Plan popup без применения; Escape возвращает фокус ожидаемому trigger. У native details нет собственного Escape-to-close контракта: не придумывать его в assertions.
- **Чтение и прокрутка:** bounds реального первого содержательного абзаца/preview, summary, четырёх полей, disclosure и footer; видимость определяется пересечением с scrollport, не только top description section. wheel в описании/свойствах должен менять .iq-dialog-body, а не отдельный новый column scroller. Записываются ranges/ancestors и overflow. Фокусированный popup может иметь свой scroll — это другой слой и не нарушение одного основного scroll owner.
- **Семантика H02:** selected id == workFocus id; preview — буквальный текст этого result; question !canAnswer нейтрален и не имеет нового answer permission; ни accepted/rejected, ни другой поздний step не выдают чужой result. Existing summary action открывает work и тот же review:<id>; новых approve/reject в Task summary нет.
- **Отсутствие побочных эффектов:** начальное открытие, disclosure, навигация в review и popup cancel не вызывают repository writes/command attempts; unsupported operations, page errors и off-origin requests записываются как failure. Synthetic adapter writes не подтверждают persistence.

Dirty Markdown/type-template/failure/retry/real save можно проверять в отдельном коротком interaction case после first-frame capture. Автосохранение существующей Task с синтетическим adapter либо отклоняется, либо лишь имитируется; такое действие нельзя назвать настоящим сохранением. Сам исходный narrow companion не должен случайно превращаться в имитацию серверной state machine.

Source patch VT1 затрагивает общий renderer. Первый опыт ограничен existing Task. Обложка, personal request supplement, новый Task и полноценные Planning/workbench callers остаются **непроверенными этим минимумом**; no-cover результаты на них не распространяются. Перед production-применением scope либо явно ограничивается, либо их фактическая затронутая ветвь проверяется отдельно.

## 8. CI-цена и способ запуска

В сохранённом job log 11734645359 установка product/browser tools шла примерно 08:03:05–08:03:39 UTC; actual boundary/build — до 08:03:40; browser runner — 08:03:40–08:04:06. Browser evidence содержит **16 профилей и 78 PNG**, package54, Node24.20.0, Chromium151.0.7922.34. Это измеренное прошлое свидетельство, не новый run и не SLA. [E1] [E2]

Узкий B/VT1 опыт использует уже установленный browser и те же product dependencies; дополнительные два builds и несколько contexts/captures должны стоить существенно меньше нового backend stand. До измерения разумно планировать десятки секунд browser + несколько секунд build сверх install, но не обещать точный duration. Основная цена cold CI — установка Playwright/Chromium; не следует добавлять её второй раз в отдельном job без нужды.

Самый дешёвый orchestration: в существующем workflow добавить **отдельный manual-only step** companion runner с условием workflow_dispatch; output положить, например, в output/tabs-geometry/first-screen, уже попадающий в существующий artifact. Existing PF03 run проходит прежним путём. Это не новый required PR/release/cross-browser gate. Draft PR даёт reviewable patch, а root делает workflow_dispatch точной ветки и фиксирует run SHA. Если root предпочитает один автоматический прогон на экспериментальном draft PR, это альтернативное orchestration того же runner, не необходимость нового workflow.

Не требуется npm run build (который в продукте сначала вызывает TypeScript7 typecheck), ./gradlew, JDK25 или PG18 для этого fixture. Existing required gates продукта остаются самостоятельными и не отменяются. Новый comparator build компилирует реальные импортированные consumer modules Vite так же по границе, как текущий build-only smoke.

## 9. Provenance, которого не хватает простой подписи «DS54»

Общий results manifest должен хранить run commit (GitHub checkout/merge ref), frozen baseline product revision, время, source/plan/dataset/patch SHA, exact archive SHA и installed version; исходные bytes изменённых files; patched output SHA; bundle asset hashes; variant; data case; viewport/theme/density/rootFontSize/devicePixelRatio/visualViewport scale; browser build; ready/failure; filenames и checksums всех PNG.

Поскольку экспериментальный commit содержит новые tests/workflow, одного равенства HEAD frozen commit не будет. Вместо этого проверяется, что production inputs под ui/web/client/contracts/vendor/package files совпадают с frozen baseline, кроме явно временной overlay map. Test и workflow bytes входят в самостоятельный run fingerprint. Нельзя присвоить старые PNG новому commit только потому, что title совпал. Обычный check:boundaries в checkout проверяет исходный продукт; его PASS нельзя назвать отдельной проверкой временного patched source. Для небольшого overlay сохраняются прежние imports, reviewer проверяет exact diff и фактическую module graph/public package сборки.

Baseline получает те же meaningful fixtures, но **никаких** layout patches или общей экспериментальной CSS. Его summary остаётся настоящим текущим summary; уточнённая presentation принадлежит варианту. Отдельный summary-only control, если понадобился, называется отдельно. Имена «baseline» и «VT1» в metadata/галерее не вставляются в product body, чтобы не менять first-screen geometry.

### Проверенные контрольные fingerprints

| Input | SHA-256 |
|---|---|
| vendor/iquipage-web-0.6.0-vnext.54.tgz | a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457 |
| ui/src/board/task-dialog.js | bba396bdf8f1b03beb20358eebce3161913c668cbc3b6328fc0d675a63518549 |
| ui/src/board/task-work-view.js | 5b9da8507f62fef702af3cc390849007a2da8693ec353a4b68ec1894291df309 |
| ui/src/board/work-model.js | 4628a01a00edf29cbecda7094d69d757c5f571280f2e5c8deead0b93db3783a8 |
| ui/src/board/board.css | ab3a8535ce0d65d655116b3162ff53fab04c900ee8341fe4a0d4131ffeec3e5e |
| web/workbench/workbench.css | 0e7cfdfc2df44e6c7c07307ca823c329468ded1a83b1e907625bd3934d77c55e |
| tests/tabs-geometry-browser.mjs | 776b7dc8dc513d6bcef74a7e17edfaeb1f4014d9f8fe8c4e6738fe5328706aed |
| tests/fixtures/tabs-geometry/product.js | 255705dd0dc8bbf92ac4616e797163dd1b35d0f57198debbeb585f4e2938db63 |
| tests/fixtures/tabs-geometry/repository.js | 87bd553ed1087ca52b23711c07f4d9289b1a56b0f890f3be0632c2f249dbc824 |
| .github/workflows/tabs-geometry.yml | 3d42ecbeb0d1d3529e5c43fca4dfbaaf5b69ff9fdc7b6aab52ff2b639e1f1e4b |

## 10. Handoff

Следующее конкретное действие после назначения root — подготовить reviewable sibling fixture/runner и exact VT1 patch на frozen production source; root рецензирует diff, затем запускает existing GitHub Actions. Принимать UI вариант по ещё не существующим кадрам нельзя. По окончании этого read-only feasibility остаются NOT_RUN actual alternative render, native interactions, human tasks и backend saves.

Исходные ссылки приведены на реально прочитанные локальные файлы. Line numbers в тексте относятся к frozen source; пакетные внутренности прочитаны для диагностики lifecycle и не предлагаются как imports/API.

[S1]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/task-dialog.js
[S2]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/task-work-view.js
[S3]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/tests/tabs-geometry-browser.mjs
[S4]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/tests/fixtures/tabs-geometry/product.js
[S5]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/tests/fixtures/tabs-geometry/product.html
[S6]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/tests/fixtures/tabs-geometry/repository.js
[S7]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/.github/workflows/tabs-geometry.yml
[S8]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/plan-field.js
[S9]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/work-model.js
[S10]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/contracts/template-defaults.ts
[S11]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/tests/work-preview-seed.ts
[S12]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/server/src/main/kotlin/com/sprintique/work/application/TaskWork.kt
[S13]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/contracts/work.ts
[S14]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/board.css
[S15]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/web/workbench/workbench.css
[D1]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/node_modules/@iquipage/web/docs/control-contracts.md
[D2]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/node_modules/@iquipage/web/docs/work-story.md
[D3]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/node_modules/@iquipage/web/dist/modules/components.js
[D4]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/node_modules/@iquipage/web/dist/modules/date-field.js
[D5]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/node_modules/@iquipage/web/dist/modules/editor.js
[V1]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/node_modules/vite/dist/node/index.d.ts
[E1]: sandbox:/workspace/scratch/b3dac59f68e2/research/wp02b/candidate2-browser-job.log
[E2]: sandbox:/workspace/scratch/b3dac59f68e2/research/wp02b/candidate2-browser-11734645359/browser/results.json
[P1]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-first-screen-design.md
[P2]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-first-screen-review.md
[P3]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-first-screen-design-addendum.md
