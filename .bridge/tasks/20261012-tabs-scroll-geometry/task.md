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
updated: 2026-10-12T07:39:37Z
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
- [x] A3. Версия, public exports/types, build/test/pack, tarball SHA, dependency/lock и consumer согласованы; старый `.52` неизменён; продукт не патчит приватный CSS библиотеки.
- [ ] A4. Самопроверка diff и две независимые проверки R1/R2 выполнены на неизменяемых fingerprints; required NOT_RUN и release-only среды названы без ложного PASS; root получил reviewable checkpoint.

## Передача

- **Состояние:** Candidate A .53: only shared tabs CSS geometry plus release metadata/docs. Remove negative margin and parent border; keep overflow:auto, reserve current 4px external focus paint, intrinsic-width labels and content-box baseline/2px active underline. Library build and tests 478/478 PASS, pack and exact product dependency/lock adoption PASS. All 176 packaged files byte-match library source/built output, archive and installed consumer. Runtime JS modules unchanged; core export/types only version literal. Actual consumer build-only, boundaries/style guard, diff self-review PASS. Native candidate NOT_RUN; full vNext and R1/R2 pending.
- **Сейчас:** S2 — immutable .53 candidate ready for native before/after and independent review.
- **Дальше:** Root publishes frozen candidate; run native plan revision2 and the unchanged full vNext gate; inspect raw client/scroll/rect/focus and actual full frames before acceptance.
- **Незакоммичено:** DS CSS/release metadata/docs and exact-version gate; .53 tarball/product manifest+lock; plan metadata revision2; bridge. No product presentation/runtime edit.
- **Рабочая копия:** 14 файл(ов): libraries/iquipage/PROVENANCE.json, libraries/iquipage/README.md, libraries/iquipage/docs/control-contracts.md, libraries/iquipage/package-lock.json, libraries/iquipage/package.json, libraries/iquipage/src/entries/core.js, libraries/iquipage/src/styles/foundation.css, libraries/iquipage/tests/vnext38.test.cjs, libraries/iquipage/tokens/semantic.json, libraries/iquipage/types/core.d.ts, products/sprintique/package-lock.json, products/sprintique/package.json и ещё 2 (15 files changed, 50 insertions(+), 32 deletions(-)) · HEAD 56d2a2f2
- **Ловушки:**
  - local Chromium падает до `about:blank` без `/proc`; TypeScript 7 nativecompiler требует `/proc/self/exe`; JDK25/PG18 отсутствуют. Эти unavailable tests повторно не запускаются. CI Ubuntu24.04/PW1.62.1 нужен для actual browser. Для local fixture используется временный symlink node_modules из repo-maps: product manifest SHA `5c1ec083a2ab611e83c112a3786ebd2de1aa894da49fbf4494b3045d3582942e`, lock SHA `3399e2333d8104f75e792cf100d3f149a62a9e361961bf4df1af4e46f7f09254` и archive SHA совпали; CI всегда делает isolated npm ci.
  - First Actions run 38216985723, artifact11732089788 SHA2563173d7563c148486948b203dafbd59fa2fadeba8118b777e5006e6fc7e24bf5e. Its merge snapshot fbe7a62e has the same tree as diagnostic cd064536. Permissions already correct: Wiki requires tasks.write, which the fixture has. Local Chromium/TS7/JDK25/PG18 remain unavailable; no repeated execution or PASS claim. Product node_modules is now a separate ignored copy, so package adoption cannot modify the shared Maps dependencies.
  - Baseline2 artifact 11732715864 SHA25661f4fbd22fbd06163c5093e08623d6374014bcc0cb4dae3a4a1b4261f11c1ee4, source merge e3328dc8b38334993fcf038c4a733fb0b2052938. Reduced-motion native close removes open before its queued close event dispatches iq-close and product removal; do not substitute a fixed sleep or alter production lifecycle. Whole run remains FAIL until the repeat completes.
  - Candidate archive SHA256cac335e8e80b2dfe2f62cab24cd48a7e514bc400c07cedc59d23f18c4ae61d18. Plan revision2 SHA256301e5e8d4cc3f09819db39be6241be50658c6fdad0127ee8ba99a5ab90438a85 changes only revision/phase/package_version/digest; root independently froze it before native. Previous .52 remains SHA989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758. Exact-version assertions in existing vnext38 test updated to .53, without weakening. Unrelated libc lock metadata normalized by local npm restored from baseline; only DS dependency/entry changed. NT05 is separate scope; no prerequisite or product runtime mixed here.
- **Проверка:** Library npm run build, npm test, npm pack --offline; product exact tarball install, all-file archive comparison, node tests/tabs-geometry-browser.mjs --build-only, npm run check:boundaries. Native tabs-geometry.yml plus full vnext.yml. Local Chromium/TS7/JDK25/PG18 known unavailable and not repeated.

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
- **Как:** только DS styles, необходимая public contract documentation/version metadata, build/test/pack; consumer adoption exact tarball и lock.
- **Зачем:** каждый настоящий consumer получает одну проверяемую поставку.
- **Покрывает:** A2, A3
- **Приёмка:**
  - [x] Новая версия собрана/упакована; source/package JS/types/CSS и product vendor согласованы.
  - [ ] Native candidate matrix без unintended vertical scroll и clipping; keyboard/panels и горизонтальный доступ сохранены.
- **Итог:** Candidate A built/tested/packed and exact private .53 adopted; native candidate geometry still NOT_RUN. First package criterion complete; remaining candidate matrix pending.

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

## Вопросы

Открытых вопросов к владельцу по scope нет. Browser baseline/candidate ожидают доступный native CI runtime; root владеет публикацией checkpoint.

## Контекст

- Принятый отчёт в общей рабочей копии root: `repo-v3/products/sprintique/docs/experience/research/sprintique_problem_first_research_plan_v3.md`, PF03 и §10.3 WP02-B. Эта ветка начинается от main `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`.
- `AGENTS.md`, `libraries/iquipage/AGENTS.md`, `products/sprintique/AGENTS.md`, `docs/BOUNDARIES.md`, `engineering/workflow.md`, `engineering/testing.md`; problem-first iquipage-implement из `.agents/skills` рабочей копии root.
- Baseline package `.52` SHA256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`; fingerprints/acceptance: `products/sprintique/tests/fixtures/tabs-geometry/acceptance-plan.json`.
- Диагностика: `node tests/tabs-geometry-browser.mjs --build-only` из продукта; native `PLAYWRIGHT_MODULE=<temporary playwright> node tests/tabs-geometry-browser.mjs`.
- Raw scratch evidence: `/workspace/scratch/b3dac59f68e2/research/wp02b/`; evidence не заменяет independent review или human research.
