---
bridge: 1
id: 20261012-tabs-scroll-geometry
title: "WP02-B / PF03: общая геометрия вкладок без лишней прокрутки"
status: active
risk: high
owner: it-novikov
branch: fix/tabs-scroll-geometry
base: f5f941afa4e9be8a709e6de67a92bacf5a9397ca
created: 2026-10-12
updated: 2026-10-12T08:02:13Z
links:
---

# WP02-B / PF03: общая геометрия вкладок без лишней прокрутки

## Цель

Когда участник читает задачу и переключается к работе агента, он должен видеть устойчивый переключатель разделов и продолжать чтение. На `.52` замечена отдельная вертикальная прокрутка вкладок на один пиксель; она выглядит как ещё одна область содержимого. WP02-B / PF03 принятого problem-first плана поручает воспроизвести причину на exact package, исправить общую DS-геометрию и проверить настоящий Task.

## Рамки

- **Входит:** общий `iq-tabs` / `.iq-tabs-list`; геометрия, underline и сохранение focus; новая private DS-версия build/test/pack, точный vendor и lock продукта; минимальный consumer, настоящий Task внутри Board и сравнение версий Wiki; native Chromium evidence в одинаковых профилях.
- **Не входит:** domain/API/grants, новое поведение Task, новый router или tabs API, PR75/PR76, redesign Task/Board/Wiki, human research, merge/deploy/npm publish.
- **Ограничения:** root координирует общую поставку и владеет remote mutations; один writer этой ветки. Локальные private product overrides запрещены. Предыдущий tarball никогда не перезаписывается.
- **Авторизация:** владелец поручил продолжать принятый большой problem-first план, пушить промежуточные результаты/PR и 2026-10-12 убрал количественный лимит PR. Root принял этот scope 2026-10-12. Merge/deploy/public publication не поручены.

## Приёмка

- [x] A1. На точном `.52` минимальном consumer и настоящем Task воспроизведён PF03: сохранены client/scroll/rect/focus и кадры; источник и границы synthetic evidence названы.
- [ ] A2. На новой DS-поставке у вкладок нет непреднамеренной вертикальной прокрутки; underline, labels, focus, selected/panel states и горизонтальный доступ сохранены в light/dark, narrow и увеличенном тексте; проверены Task/Board и Wiki по impact map.
- [ ] A3. Версия, public exports/types, build/test/pack, tarball SHA, dependency/lock и consumer согласованы; старый `.52` неизменён; продукт не патчит приватный CSS библиотеки.
- [ ] A4. Самопроверка diff и две независимые проверки R1/R2 выполнены на неизменяемых fingerprints; required NOT_RUN и release-only среды названы без ложного PASS; root получил reviewable checkpoint.

## Передача

- **Состояние:** Final .54 checkpoint a8b4a19a is published as Git object078faae9 with exact tree9c7feff0; clean PR78 test-only prerequisite merge prepared. Native/full candidate and independent final reviews remain pending.
- **Сейчас:** S2 — publish one composed .54 head for native and full CI
- **Дальше:** Inspect current .54 native full matrix and full vNext; preserve actual screenshots/results and resolve independent findings
- **Незакоммичено:** Exact PR78 test plus its review packet and tabs bridge updates; DS/runtime/package/plan/driver unchanged by integration.
- **Рабочая копия:** 1 файл(ов): products/sprintique/tests/notifications.test.ts (10 files changed, 530 insertions(+), 24 deletions(-)) · HEAD 078faae9 · снято 2026-10-12T08:02:13Z
- **Ловушки:**
  - local Chromium падает до `about:blank` без `/proc`; TypeScript 7 nativecompiler требует `/proc/self/exe`; JDK25/PG18 отсутствуют. Эти unavailable tests повторно не запускаются. CI Ubuntu24.04/PW1.62.1 нужен для actual browser. Для local fixture используется временный symlink node_modules из repo-maps: product manifest SHA `5c1ec083a2ab611e83c112a3786ebd2de1aa894da49fbf4494b3045d3582942e`, lock SHA `3399e2333d8104f75e792cf100d3f149a62a9e361961bf4df1af4e46f7f09254` и archive SHA совпали; CI всегда делает isolated npm ci.
  - First Actions run 38216985723, artifact11732089788 SHA2563173d7563c148486948b203dafbd59fa2fadeba8118b777e5006e6fc7e24bf5e. Its merge snapshot fbe7a62e has the same tree as diagnostic cd064536. Permissions already correct: Wiki requires tasks.write, which the fixture has. Local Chromium/TS7/JDK25/PG18 remain unavailable; no repeated execution or PASS claim. Product node_modules is now a separate ignored copy, so package adoption cannot modify the shared Maps dependencies.
  - Baseline2 artifact 11732715864 SHA25661f4fbd22fbd06163c5093e08623d6374014bcc0cb4dae3a4a1b4261f11c1ee4, source merge e3328dc8b38334993fcf038c4a733fb0b2052938. Reduced-motion native close removes open before its queued close event dispatches iq-close and product removal; do not substitute a fixed sleep or alter production lifecycle. Whole run remains FAIL until the repeat completes.
  - Candidate archive SHA256cac335e8e80b2dfe2f62cab24cd48a7e514bc400c07cedc59d23f18c4ae61d18. Plan revision2 SHA256301e5e8d4cc3f09819db39be6241be50658c6fdad0127ee8ba99a5ab90438a85 changes only revision/phase/package_version/digest; root independently froze it before native. Previous .52 remains SHA989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758. Exact-version assertions in existing vnext38 test updated to .53, without weakening. Unrelated libc lock metadata normalized by local npm restored from baseline; only DS dependency/entry changed. NT05 is separate scope; no prerequisite or product runtime mixed here.
  - Candidate1 .53 native run38219197651 FAIL, artifact11732888867 SHA256a96600ae123e2640edbf22b0efbb415fb03734f8d093273b6db066600cb92d3e; full run38219197837 FAIL at product-build exact .52 type literal. Original R1 findings F2/F3 retained. New .54 archive SHA256a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457; plan revision3 SHA2561a4e4a6c361718d98d065a13af5fc3b6a86fe750aca1cba910eed5a3e8bd7a4f changes only release metadata from v2. Previous .52/.53 archives immutable. No local Chromium/TS7/JDK25/PG18 retry; separate ignored product node_modules copy. NT05 prerequisite remains root-owned separate test-only scope.
  - Revision3 before-publication plan description corrected after DS checkpoint 45a468ab; earlier revision3 bytes and SHA1a4e4a6c… are preserved as historical evidence. Final SHA will be recorded with this checkpoint; .54 archive stays a726a453… and the same 176 files. Original .53 R1 findings remain unchanged.
- **Проверка:** Root independently verified .54 archive SHA256a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457 and final plan SHA256a0165e153cb976c9da17332b1b79baaeb9b10da2e375c9aa290c620bb3889872. Relative to .53: plan changes exactly revision/package/digest and two descriptive reasons; criteria/profiles/release gates equal. Notification test equals exact PR78 blob.
- **Причина:** planned — astra-root, 2026-10-12T08:02:13Z, передано root: Publish the frozen composed .54 checkpoint once. After native CI, resume independent R1 and fresh R2 on exact hashes; full CI and A2/A3/A4 remain pending. No main merge/deploy.

## План

### S1. Воспроизведение и выбор общей геометрии [done]

- **Что:** закрепить baseline и acceptance до CSS.
- **Как:** exact `.52` public package; минимальный consumer без product CSS; реальные mountTaskBoard/openTaskDialog/mountWiki с synthetic adapter responses; измерения и screenshots native Chromium, затем сравнение минимальных вариантов.
- **Зачем:** отличить дефект общей геометрии от product composition и не спрятать обрезанный focus.
- **Покрывает:** A1
- **Приёмка:**
  - [x] Baseline recognizer воспроизвёл 1px scroll минимального consumer и Task с source/archive fingerprints.
- **Итог:** Authoritative baseline: Actions 38218161373, artifact 11733391704 SHA2563fd72f6feaf11426f37196d4448dd1fe4d5be1f4b77acd2fb414a4128ff6ac2d. Native Chromium 151.0.7922.34 BASELINE_REPRODUCED: 16 cases, 177 intents, every eventDelta1, correct retained nested parent, no page errors/external requests. Source merge a49fac18565d3291b061eaa6c3c4c1c6f03ec328 has tree d8ec6dc65001674957566c773fdcf0adf427df2c = diagnostic head56d2a2f2. Frozen plan79821edf… and exact .52 archive989fab… verified; ordinary minimal/Task/Wiki client45/scroll46/max1 and clipped focus visible in raw frames. A/B source-layout comparison favours A; root accepted one native candidate.

### S2. Общая правка и точный выпуск [active]

- **Что:** исправить выбранную общую геометрию и упаковать новую версию.
- **Как:** DS styles и минимальный внутренний keyboard reveal по native evidence; необходимая public contract documentation/version metadata, build/test/pack; consumer adoption exact tarball и lock.
- **Зачем:** каждый настоящий consumer получает одну проверяемую поставку.
- **Покрывает:** A2, A3
- **Приёмка:**
  - [x] Новая версия собрана/упакована; source/package JS/types/CSS и product vendor согласованы.
  - [ ] Native candidate matrix без unintended vertical scroll и clipping; keyboard/panels и горизонтальный доступ сохранены.
- **Итог:** Candidate .53 native/full gates FAIL: intermediate keyboard label/focus clipping and stale exact consumer type pin. Both corrected in independent .54 package; shared CSS is byte-identical to .53, only IqTabs keyboard reveal changes among 49 runtime modules. Library build/tests 478/478 and all 176 source/archive/installed files PASS. Candidate .54 native matrix/full gate and R1/R2 remain pending; A3 reopened until full consumer verification.

### S3. Независимая приёмка и handoff [todo]

- **Что:** передать root конкретный проверяемый результат и закрыть замечания в scope.
- **Как:** targeted module/build/boundary checks, само-review, R1/R2 независимыми агентами root, исправления с новой evidence.
- **Зачем:** версия пакета сама по себе не закрывает PF03.
- **Покрывает:** A4
- **Приёмка:**
  - [ ] R1/R2 завершены; итоговый fingerprint и PASS/FAIL/NOT_RUN названы; rollback обозначен.
- **Итог:** не выполнен.

## Решения

1. **Причина E1 + source:** список — flex с `border-bottom:1px; overflow:auto`; кнопка — `border-bottom:2px; margin-bottom:-1px`. Отрицательный margin уменьшает вклад кнопки в cross-size списка; её border box выходит в scrollable overflow. Native Chromium 151 на exact `.52` воспроизвёл clientHeight45, scrollHeight46, rect45.5, maxScrollTop1 в minimal/Task/Wiki. При root text200: client64/scroll65/rect65/max1. Keyboard focus выходит из scrollport на 4px сверху и 4.5px снизу (5px снизу при text200); PNG подтверждают clipping. Источник: Actions 38216985723 / 38217591088, immutable plan SHA `79821edf…`; полные fingerprints в диагностическом output.
2. **Связанный риск focus:** загружаемый последним `focus.css` задаёт внешний outline2px + offset2px и 4px halo. У tab button нет inline padding. Простое `overflow-y:hidden` скроет симптом, а простое включение tabs в inset-focus recipe приблизит ring/halo вплотную к первому/последнему glyph.
3. **Варианты до кода:** A — убрать отрицательный margin и border списка, зарезервировать внутри scrollport 4px под существующий внешний focus, совместить baseline/2px underline фоновой линией внутри content box. B — убрать отрицательный margin и использовать существующий inset-focus DS pattern с необходимым местом для glyph. A предпочтён для узкого native spike: сохраняет внешний focus; может прибавить 8px к высоте strip. B требует изменения padding/ширины labels и рискует наложить ring на текст. Обе полные реализации не нужны: root принял source/layout сравнение и один native spike по различающему вопросу.
4. **Impact map:** `ui.tabs` — supplied composition; Task использует exact markup в `ui/src/board/task-dialog.js`, Board открывает этот же Task; Wiki сравнивает конфликтующие версии в `web/wiki.js`. Board не имеет собственной `.iq-tabs-list`, но проверяется opening/close и реальный Task. Runtime/APIs этих callers менять не требуется.
5. **High проработка:** роли member/readonly и disabled minimal-tab; данные synthetic, никакой записи в сервисы/пользовательскую БД; конкурентность/повторы команд не меняются, write intent проверяется только на отсутствие лишних попыток при переключении. Длинные labels и text scaling проверяются без фиксированной высоты. Dependency version — существующая граница private package, новой технологии/API нет, ADR не требуется. Rollback — предыдущий exact `.52` плюс соответствующий dependency/lock; пользовательские данные не откатываются.
- **D1** (2026-10-12) Native .53 corrected the 1px vertical range but failed sequential materials→discussion ArrowRight: native focus left a long label partially outside the horizontal scrollport although End exposed it fully. Root accepted the minimal shared correction: after existing keyboard focus, call native scrollIntoView with block/inline nearest, using the same 4px list scroll padding. No API, selection, event or product runtime change. Runner now records geometry and outer scroll context on every intent and rejects outer jumps when the strip already fits. Existing geometry and exact event-count gates remain unchanged. Historical Chromium source is explanatory only; actual Chromium151 PNG/raw is the failure evidence.
- **D2** (2026-10-12) Перед единственным запуском .54 включён exact test-only prerequisite PR78 commit2424d472, независимо approved R2, чтобы полный gate не зависел от подтверждённого дефектного NT05 oracle. Отдельный backend/full CI PR78 ещё pending. Merge не меняет DS .54, product runtime, archive, lock, public type pin, fixtures, driver или workflows относительно DS checkpoint078faae9. Это явная проверочная зависимость; пользовательские критерии PF03 и все существующие gates сохраняются.

## Вопросы

Открытых вопросов к владельцу по scope нет. Authoritative baseline завершён; повтор native candidate `.54`, full vNext и независимые проверки ещё ожидаются. Root владеет публикацией checkpoint.

## Контекст

- Принятый отчёт в общей рабочей копии root: `repo-v3/products/sprintique/docs/experience/research/sprintique_problem_first_research_plan_v3.md`, PF03 и §10.3 WP02-B. Эта ветка начинается от main `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`.
- `AGENTS.md`, `libraries/iquipage/AGENTS.md`, `products/sprintique/AGENTS.md`, `docs/BOUNDARIES.md`, `engineering/workflow.md`, `engineering/testing.md`; problem-first iquipage-implement из `.agents/skills` рабочей копии root.
- Baseline package `.52` SHA256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`; fingerprints/acceptance: `products/sprintique/tests/fixtures/tabs-geometry/acceptance-plan.json`.
- Диагностика: `node tests/tabs-geometry-browser.mjs --build-only` из продукта; native `PLAYWRIGHT_MODULE=<temporary playwright> node tests/tabs-geometry-browser.mjs`.
- Raw scratch evidence: `/workspace/scratch/b3dac59f68e2/research/wp02b/`; evidence не заменяет independent review или human research.
