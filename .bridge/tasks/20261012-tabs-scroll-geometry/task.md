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
updated: 2026-10-12T07:30:06Z
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

- [ ] A1. На точном `.52` минимальном consumer и настоящем Task воспроизведён PF03: сохранены client/scroll/rect/focus и кадры; источник и границы synthetic evidence названы.
- [ ] A2. На новой DS-поставке у вкладок нет непреднамеренной вертикальной прокрутки; underline, labels, focus, selected/panel states и горизонтальный доступ сохранены в light/dark, narrow и увеличенном тексте; проверены Task/Board и Wiki по impact map.
- [ ] A3. Версия, public exports/types, build/test/pack, tarball SHA, dependency/lock и consumer согласованы; старый `.52` неизменён; продукт не патчит приватный CSS библиотеки.
- [ ] A4. Самопроверка diff и две независимые проверки R1/R2 выполнены на неизменяемых fingerprints; required NOT_RUN и release-only среды названы без ложного PASS; root получил reviewable checkpoint.

## Передача

- **Состояние:** Native baseline2 (38217591088) recorded all 15 minimal/Task/Board/Wiki profiles on exact .52; all show the shared 1px scroll defect. Nested tabs and keyboard ran, but runner read a closed child before the native close event removed it. Corrected the observer: retain parent/child handles, await child detachment, verify the same open parent. Added public iq-change event deltas per owner and per intent plus explicit existing 2px underline assertions; frozen acceptance unchanged. Build-only actual entries, boundaries, syntax and diff PASS.
- **Сейчас:** S1 — second diagnostic correction and existing-criterion instrumentation ready, no DS or product runtime change.
- **Дальше:** Root publishes this diagnostic checkpoint and repeats the full native baseline including event deltas and correct nested close observation.
- **Незакоммичено:** Minimal/product fixture event collectors, diagnostic runner lifecycle/event/underline evidence, bridge only.
- **Рабочая копия:** 3 файл(ов): products/sprintique/tests/fixtures/tabs-geometry/minimal.js, products/sprintique/tests/fixtures/tabs-geometry/product.js, products/sprintique/tests/tabs-geometry-browser.mjs (4 files changed, 40 insertions(+), 17 deletions(-)) · HEAD 86f626fd
- **Ловушки:**
  - local Chromium падает до `about:blank` без `/proc`; TypeScript 7 nativecompiler требует `/proc/self/exe`; JDK25/PG18 отсутствуют. Эти unavailable tests повторно не запускаются. CI Ubuntu24.04/PW1.62.1 нужен для actual browser. Для local fixture используется временный symlink node_modules из repo-maps: product manifest SHA `5c1ec083a2ab611e83c112a3786ebd2de1aa894da49fbf4494b3045d3582942e`, lock SHA `3399e2333d8104f75e792cf100d3f149a62a9e361961bf4df1af4e46f7f09254` и archive SHA совпали; CI всегда делает isolated npm ci.
  - First Actions run 38216985723, artifact11732089788 SHA2563173d7563c148486948b203dafbd59fa2fadeba8118b777e5006e6fc7e24bf5e. Its merge snapshot fbe7a62e has the same tree as diagnostic cd064536. Permissions already correct: Wiki requires tasks.write, which the fixture has. Local Chromium/TS7/JDK25/PG18 remain unavailable; no repeated execution or PASS claim. Product node_modules is now a separate ignored copy, so package adoption cannot modify the shared Maps dependencies.
  - Baseline2 artifact 11732715864 SHA25661f4fbd22fbd06163c5093e08623d6374014bcc0cb4dae3a4a1b4261f11c1ee4, source merge e3328dc8b38334993fcf038c4a733fb0b2052938. Reduced-motion native close removes open before its queued close event dispatches iq-close and product removal; do not substitute a fixed sleep or alter production lifecycle. Whole run remains FAIL until the repeat completes.
- **Проверка:** Product: TABS_EVIDENCE_DIR=<scratch> node tests/tabs-geometry-browser.mjs --build-only; npm run check:boundaries. Native Actions tabs-geometry.yml. Plan SHA25679821edf821ead98f5666d9e87014e427394fbbbf906948cb464c53f6c19b0a9 unchanged.

## План

### S1. Воспроизведение и выбор общей геометрии [active]

- **Что:** закрепить baseline и acceptance до CSS.
- **Как:** exact `.52` public package; минимальный consumer без product CSS; реальные mountTaskBoard/openTaskDialog/mountWiki с synthetic adapter responses; измерения и screenshots native Chromium, затем сравнение минимальных вариантов.
- **Зачем:** отличить дефект общей геометрии от product composition и не спрятать обрезанный focus.
- **Покрывает:** A1
- **Приёмка:**
  - [ ] Baseline recognizer воспроизвёл 1px scroll минимального consumer и Task с source/archive fingerprints.
- **Итог:** Native baseline 1/2 воспроизвёл общий дефект: minimal/Task/Wiki дают 1px scroll, обычная геометрия clientHeight45/scrollHeight46/rect45.5 и clipped focus. Второй прогон записал 15 профилей; завершение S1 ожидает исправленного lifecycle wait вложенного Task и проверки event delta на `.52`.

### S2. Общая правка и точный выпуск [todo]

- **Что:** исправить выбранную общую геометрию и упаковать новую версию.
- **Как:** только DS styles, необходимая public contract documentation/version metadata, build/test/pack; consumer adoption exact tarball и lock.
- **Зачем:** каждый настоящий consumer получает одну проверяемую поставку.
- **Покрывает:** A2, A3
- **Приёмка:**
  - [ ] Новая версия собрана/упакована; source/package JS/types/CSS и product vendor согласованы.
  - [ ] Native candidate matrix без unintended vertical scroll и clipping; keyboard/panels и горизонтальный доступ сохранены.
- **Итог:** не выполнен.

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
