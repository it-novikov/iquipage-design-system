# R1 — WP02-B / PF03: независимая проверка геометрии вкладок

## Статус

Предварительная проверка диагностического стенда и плана. **Итоговый verdict по исправлению не выдан**: замороженная runtime candidate и native after evidence ещё не переданы R1. Репозиторий проверяется read-only, только через immutable Git objects; код, remote и рабочая карточка автором этого отчёта не изменялись.

## Независимая основа

- Source baseline: `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`.
- Diagnostic freeze: `cd0645368ec7308e7f0b01c3961d50be159ac540`, tree `bc32f813bff26ecdc9aed2cc53f5e87476261cc4`.
- Baseline plan SHA-256, независимо вычислен из frozen Git blob и сопоставлен с digest оркестратора: `79821edf821ead98f5666d9e87014e427394fbbbf906948cb464c53f6c19b0a9`.
- Baseline DS: `0.6.0-vnext.52`, exact tarball SHA-256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`.
- Native baseline run: `38216985723`; results source revision `fbe7a62e76f74603a4d6b66a99dd1ce03eab7390`; оркестратор установил равенство его tree диагностическому freeze. Chromium `151.0.7922.34`, Node `24.20.0`, Ubuntu 24.04, Playwright 1.62.1.
- Исходный artifact: `/workspace/scratch/b3dac59f68e2/research/wp02b/baseline-ci-11732089788.zip`; его SHA-256 независимо перепроверен: `3173d7563c148486948b203dafbd59fa2fadeba8118b777e5006e6fc7e24bf5e`.
- Raw results: `/workspace/scratch/b3dac59f68e2/research/wp02b/baseline-ci-11732089788/browser/results.json`.

Прочитаны frozen `AGENTS.md`, `START-HERE.md`, library/product `AGENTS.md`, engineering review/testing/workflow/bridge protocol, boundaries, диагностический diff, карточка, acceptance plan и fixture/runner. Применён текущий root `iquipage-review` из `repo-v3/.agents/skills/iquipage-review`, включая constitution, execution-contract, quality-method, problem-first и design-review. Это targeted review общей геометрии и её текущих consumers; не full-product, human research или release approval.

## Что baseline действительно доказывает

В `desktop-light` минимальная композиция public `ui.tabs` без product CSS и настоящий Task, открытый настоящим Board, независимо имеют `clientHeight=45`, `scrollHeight=46`, `maxScrollTop=1`, высоту border box `45.5`. Во всех остальных записанных minimal/Board профилях также есть 1px диапазона прокрутки; при root font-size 200% значения `64/65` и rect height `65`.

Геометрия соответствует общей причине: `.iq-tabs-list` содержит `border-bottom:1px; overflow:auto`, а кнопка — `border-bottom:2px; margin-bottom:-1px` (`libraries/iquipage/src/styles/foundation.css:38` на freeze). Внешний focus из `src/styles/focus.css:4` выходит на 4px за border box кнопки. Для первого minimal tab его ожидаемая paint area начинается в x=20/y=20 при scrollport x=24/y=24 и заканчивается в y=73.5 при низе scrollport 69. Следовательно, это отдельный focus-clipping риск, который простое `overflow-y:hidden` не устраняет.

Просмотрены реальные PNG: `desktop-light-minimal-short-Home.png`, `desktop-dark-minimal-long-End.png`, `narrow-light-board-work-panel.png`, `desktop-light-wiki-failure.png`. На focus strip видны лишь остатки вертикальных сторон обрезанной рамки; полная Task-композиция сохраняет читаемый рабочий заголовок и переключатель. Измерения подтверждают clipping независимо от ограничения list-only screenshot, который сам по себе не показывает окружающую область.

Общий baseline run имеет **FAIL**, а не PASS: в `product.js:33` стенд передаёт `#wiki/page-1`, тогда как production parser `web/wiki-model.js:4–5` требует `#wiki/page/page-1`. Wiki PNG показывает штатное «Страница не найдена», а runner ждёт отсутствующую кнопку edit. Это дефект стенда. Десять уже записанных minimal/Board профилей пригодны как baseline их сценариев; Wiki и nested ещё не выполнены и не приняты.

## Независимая критика решения и доказательности

План соразмерен подтверждённому дефекту. Минимальный public consumer различает DS-причину и product composition, а настоящий Task/Board и Wiki закрывают фактические product consumers, найденные поиском по frozen исходникам. Nested Task служит проверкой ограниченного окружения. Backend/grants/persistence не меняются, synthetic adapter явно не выдаётся за их приёмку. Native Chromium CI достаточен для указанного scope; невозможные локальные Chromium/TS7/JDK25/PG18 и отдельные release-only среды повторно не требуются.

### Разногласия аналитических перспектив

| Перспектива | Существенный вопрос | Решение для этого scope |
|---|---|---|
| Пользователь клавиатуры | Останется ли заметной полная рамка, включая первую/последнюю вкладку при горизонтальном overflow? | Приоритет — видимый native `:focus-visible`; выбранный вариант A должен пройти Home/End/Arrow и горизонтальные границы без отключения outline. |
| Ежедневный пользователь Task | Не станет ли полоска выше настолько, что работа уедет вниз или переключение будет выглядеть новым вложенным контейнером? | Прибавку места под focus оценить на полных before/after Task/Wiki кадрах одинаковых данных; число `maxScrollTop=0` этого не доказывает. |
| Визуальный дизайнер | Сохранится ли читаемое отношение underline, divider и labels? | Сохранить типографику и смысловую линию; если divider перенесён в фон, проверить его положение и видимость в обеих темах. Оценка вкуса сама по себе не блокирует исправление. |
| DS maintainer | Можно ли исправить общий контракт без нового API и локального product patch? | CSS в исходной DS + новая exact private version, неизменённая `.52`, build/test/pack и согласованный consumer lock — достаточная граница. Проверить public API/JS/types equivalence там, где они не должны меняться. |
| QA | Могут ли зелёные assertions принять только похожее состояние или неполный путь? | Сопоставить raw source hashes, actual module imports, события/панели и write attempts; непроигранные Wiki/nested не переименовывать в PASS. |

Вариант A (внутреннее место под внешний focus и отказ от отрицательной геометрии) имеет ясное основание и меньший риск контакта кольца с glyph, чем inset-focus без дополнительного button padding. Цена — примерно 8px дополнительной высоты полосы; это допустимая гипотеза до native after, не уже доказанное улучшение эстетики. Дополнительный дизайн-проект или интервью для устранения подтверждённого дефекта не требуются.

## Замечания к диагностическому freeze

- **R1-F1 [P2, confirmed evidence gap]** — обещанное «once per intent» не измеряется текущим runner.
  - Evidence: `tests/fixtures/tabs-geometry/acceptance-plan.json`, check `PF03-TASK-BOARD`; `tests/tabs-geometry-browser.mjs:38,92–102,125–140`; `tests/fixtures/tabs-geometry/minimal.js:20–23`.
  - Сценарий: если одна смена вкладки начнёт выпускать два одинаковых `iq-change`, конечные selected/panel states останутся верными и `attempts=[]`; текущие assertions пройдут. Minimal fixture уже собирает `changes`, но runner их не извлекает. В product probe equivalent event log отсутствует.
  - Вред: отчёт обещает проверку кратности пользовательского intent без соответствующей evidence. Это не доказанный runtime баг `.52` и не повод переписывать tabs.
  - Точное решение: использовать внешний fixture listener на `iq-change` нужного `iq-tabs` и проверять дельту ровно одного события/ожидаемое значение для каждого конкретного keyboard/pointer intent; начальную mount emission отделить от пользовательского действия. Либо явно ограничить утверждение кратности source review, если runtime JS byte-for-byte сохранён, не выдавая существующий сценарий за автоматическую проверку событий.
  - Acceptance: на новом frozen runner виден прямой event assertion либо точная граница source-only evidence; required plan scope не сокращён.
  - Решение: **open**, передано оркестратору до candidate.

Неверный Wiki route уже известен автору/оркестратору и будет устранён следующим diagnostic freeze; отдельный дублирующий finding ID не заводится. Проверить исправленный сценарий на новом native artifact.

## Следующий шаг R1

Получить immutable candidate SHA/tree, exact package/archive/lock fingerprint и native after artifact. Прочитать весь runtime/package diff, повторно связать fixture/results с frozen source, просмотреть after PNG в обеих темах и узком/увеличенном тексте, оценить высоту и focus в настоящих Task/Wiki, закрыть или сохранить R1-F1 по новым доказательствам. Только затем выдать `approve` либо `changes-requested` для ограниченного scope.

### Diagnostic correction checkpoint

Проверен frozen `8dc54637bfcd1c3509228c09c260eb6f427f6028`: fixture вызывает production `wikiHash(wikiPageId)`; добавлена проверка round-trip через `wikiRoute`, hash production route model и подробный failure context. Runtime DS/consumer не меняется. R1 независимо подтвердил равенство tree локального freeze и remote `86f626fdd910b4aa721dcb6433cc1d3460d4cf4c`: `589a3eb586711ac5f57c2e785c18c4ec8a74490c`. План не изменён. Новый native baseline run `38217591088` ещё ожидается; исправление route не считается runtime-приёмкой Wiki до него.

## История формального review: первый candidate `.53`

Предварительный original сохранён отдельно: `review-r1-preliminary.md`. Нижеследующие проверки относятся к новому freeze и не заменяют историю diagnostic FAIL.

- Local candidate: `a5e1ac45e62795531657a04d42aba11fc38e6f1b`, tree `88053c92f18f229f56e79b15c5b89905c0157c35`.
- Parent diagnostic: `56d2a2f23f3c39740a05b15821d4b46f26d572ed`, tree `d8ec6dc65001674957566c773fdcf0adf427df2c`.
- Candidate DS `.53` SHA-256: `cac335e8e80b2dfe2f62cab24cd48a7e514bc400c07cedc59d23f18c4ae61d18`.
- Plan revision 2 SHA-256: `301e5e8d4cc3f09819db39be6241be50658c6fdad0127ee8ba99a5ab90438a85`. R1 независимо подтвердил: изменены только revision, phase, package_version и ds_archive_sha256; критерии/матрица сохранены.
- Independent machine-readable evidence: `review-r1-source-verification.json`.

### Source/package

R1 читает архивы непосредственно из frozen Git blobs. В `.53` 176 файлов, набор файлов сохранён; 49 `dist/modules/*` побайтно совпадают с `.52`. Все публичные JS entries совпадают с frozen `src/entries`, в core изменён только version literal. CSS нового архива равен CSS `.52` с точной заменой единственного изменённого `foundation.css`; остальные stylesheet contents сохранены. Остальные source-owned packaged файлы совпадают с frozen source. Старый `.52` архив сохранён без изменения. Новый SHA-256 и SHA-512 integrity в product lock совпадают с байтами `.53`; product dependency указывает на этот exact archive. Изменения библиотечных version assertions сохраняют их строгость.

Общая CSS-правка убирает отрицательный margin и border родителя, резервирует `padding:4px`, рисует neutral baseline внутри content box, оставляет 2px underline, делает кнопки intrinsic-width через `flex:none` и добавляет list `scroll-padding-inline:4px`. Product runtime/CSS/маршруты не меняются. Документированная прибавка +8px ещё требует actual candidate geometry; source-арифметика не подменяет измерение.

### Исправленная baseline evidence и R1-F1

Baseline3 `baseline3-ci-11733391704.zip` имеет независимо проверенный SHA-256 `3fd72f6feaf11426f37196d4448dd1fe4d5be1f4b77acd2fb414a4128ff6ac2d`. Raw source `a49fac18565d3291b061eaa6c3c4c1c6f03ec328` независимо сопоставлен по tree с `56d2a2f2`; все 14 raw source hashes совпадают с frozen inputs.

Все 16 профилей записаны, итог **BASELINE_REPRODUCED**. R1 проверил 177 intent records: в каждом `eventDelta=1` и единственное значение совпадает с target. Подтверждено сохранение конкретного parent `task-1` после detachment child; `pageErrors=[]`, `externalRequests=[]`.

R1-F1 **исправлен в `56d2a2f2` и подтверждён baseline3**. Fixture listeners записывают stable ownerId; runner `intent()` берёт per-owner дельту после mount, проверяет точно одно нужное событие и связывает его с конкретным pointer/keyboard действием. На конечном исправлении потребуется тот же candidate runtime прогон.

Дополнительно просмотрены baseline3 полные PNG Task в desktop light/dark, narrow dark, text200; Wiki в desktop light/dark, narrow dark, text200; nested Task. Они дают сопоставимое окружение для оценки высоты/иерархии after. Существующие ограничения плотности Task при text200 не выдаются за новую регрессию CSS вкладок.

### Первая concrete candidate находка

- **R1-F2 [P1, confirmed]** — `products/sprintique/tests/library-contract.ts:5` по-прежнему объявляет `const release:'0.6.0-vnext.52'=version`, тогда как `.53` public `types/core.d.ts:2` экспортирует literal `.53`.
  - Сценарий: полный consumer build компилирует контракт против exact новой поставки и получает несовместимость двух string literal types. Root сообщил этот отказ native full gate `38219197837`; противоречие independently подтверждено frozen source.
  - Вред: принятие нового DS-пакета не компилируется в обязательной сборке продукта. Успешные Vite fixture build и упаковка библиотеки не доказывают consumer type contract.
  - Уровень исправления: consumer test expectation в том же package-adoption изменении.
  - Точное решение: обновить literal на окончательную новую private version вместе с dependency/lock; сохранить exact literal assertion, не расширять тип до `string`.
  - Acceptance: full consumer build компилирует exact-package contract на окончательном frozen SHA; archived `.53` не перезаписывается.
  - Решение: **open**, автор уведомлён root; следующая версия `.54` ожидается.

### Native `.53`: R1-F3 и выбор следующей коррекции

R1 independently проверил raw archive `candidate1-browser-11732888867.zip`: SHA-256 `a96600ae123e2640edbf22b0efbb415fb03734f8d093273b6db066600cb92d3e`; все 14 source hashes совпадают с `a5e1ac45`. Source merge `f870ef846df2115b1605ac45669780e3fe065a52` имеет тот же tree `88053c92f18f229f56e79b15c5b89905c0157c35`. В `candidate1-full-job.log:275` прочитан конкретный TS2322, подтверждающий R1-F2.

Просмотрены `.53` PNG `desktop-light-minimal-failure.png`, `desktop-light-minimal-long-End.png`, `desktop-light-minimal-short-Home.png`. Прямые native измерения short strip: rect height `53.5` вместо `45.5`, label/button начало x=28 вместо x=24, `clientHeight=scrollHeight=54`, `maxScrollTop=0`. Поэтому +8px общей высоты и +4px inward offset подтверждены для уже записанного обычного профиля; это ещё не весь accepted scope.

- **R1-F3 [P1, confirmed]** — `libraries/iquipage/src/modules/components.js:386–387` полагается на `tab.focus()` для раскрытия горизонтально прокручиваемой вкладки; добавленный в `.53` list scroll-padding не обеспечивает полное раскрытие при последовательной навигации.
  - Reproduction на exact `.53`: minimal long list → Home → ArrowRight (`history`) → ArrowRight (`materials`, disabled middle tab пропущен) → ArrowRight (`discussion`). Последний intent выпускает ровно одно корректное событие, но runner падает на `long/next: horizontal focus ring inside scrollport`.
  - Actual evidence: failure PNG показывает справа только начало «Проверка»; остальное название «и обсуждение» и правая граница рамки ушли за scrollport. Та же вкладка после End в отдельном PNG раскрыта полностью. Это наблюдаемый барьер чтению выбранного раздела, а не только косметическое несогласие с focus.
  - Уже записанные Home/End проходят и имеют целую рамку: крайние состояния сами по себе не доказывают последовательный обход. Failing `/next` geometry в `.53` runner не сохранена; следующий runner должен сохранить её перед assertion, сохраняя сами criteria.
  - Уровень исправления: общий DS keyboard reveal, без нового public API или product override.
  - Предложенное автором решение: после существующего keyboard `tab.focus()` явно вызвать `scrollIntoView({block:'nearest',inline:'nearest'})`, оставив 4px list scroll-padding. Оно непосредственно адресует различие частично видимой/полностью скрытой кнопки и не требует менять focus-модель или labels.
  - Ограничение выбора: scrollIntoView рассматривает и внешние scroll ancestors. Per-intent before/after позиции окна и scrollable ancestors в существующих Task/Wiki/nested сценариях должны показать, что уже видимая полоса не вызывает новый outer jump. При частично скрытой полосе допустимо необходимое раскрытие; изменение высоты панелей и законный scroll clamp нельзя выдавать за эффект самого reveal без причинной связи.
  - Acceptance: полный required native candidate scope, включая последовательный обход long tabs, complete focus/labels и unchanged eventDelta=1; actual contexts сохраняются; новый exact package проходит полный consumer build.
  - Решение: **open**, `.54` ожидается. Первый candidate `.53` — **changes-requested**.

Автор привёл Chromium permalink `3f6733455797a48a2423e8cec51192625592a8f1` как объяснение partial-focus поведения. R1 независимо открыл commit: он датирован 2022-07-05. Это историческое corroboration, а не exact source Chromium 151; причинный выбор опирается на фактические PNG/сценарий 151.0.7922.34. Дополнительный поиск движка не нужен для следующего обратимого шага.
