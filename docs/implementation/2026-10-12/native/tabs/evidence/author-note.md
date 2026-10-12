# PF03 / WP02-B — общая геометрия вкладок, author evidence `.54`

## Результат и статус

Private DS `0.6.0-vnext.54` устраняет отдельный вертикальный диапазон вкладок во всех 16 согласованных native-сценариях. Полоса сохраняет подписи, 2px underline, внешнюю рамку focus, selected/panel states и доступ к длинным вкладкам. Последовательная клавиатурная навигация теперь раскрывает выбранное название целиком. Это author evidence на конкретной поставке; полный vNext gate и окончательные независимые R1/R2 на момент подготовки пакета ещё ожидаются. Human validation не проводилась.

Основа вывода — [исходный raw `.54`](raw/candidate2-results.json.gz), [raw baseline `.52`](raw/baseline3-results.json.gz), [сопоставление всех измерений](analysis/native-comparison.json) и 12 пар неизменённых native PNG ниже. Полные fingerprint, исходные пути, назначение и SHA-256 каждого файла находятся в [manifest](manifest.json).

## Причина и выбранная граница исправления

Минимальный consumer вызывает public `ui.tabs()` из точного `.52` без product CSS. Настоящий Task, открытый настоящим Board, и сравнение версий Wiki воспроизводят ту же геометрию. У flex-списка были `border-bottom:1px; overflow:auto`, а у кнопки — `border-bottom:2px; margin-bottom:-1px`. Отрицательный margin уменьшал вклад кнопки в поперечный размер списка, оставляя её border box в scrollable overflow. Native baseline даёт 1px диапазона во всех профилях. Глобальный focus рисуется снаружи кнопки: outline 2px + offset 2px; у списка не было места для этих 4px. На исходных кадрах рамка обрезана.

Сравнивались два минимальных варианта. **A:** убрать отрицательный margin и border списка, оставить 2px underline кнопки, зарезервировать 4px внутри scrollport и нарисовать нейтральную 1px линию внизу content box. **B:** перенести focus внутрь и добавить место у glyph. Вариант B меняет ширины кнопок и сближает focus с текстом/underline. Выбран A: он сохраняет существующий внешний focus. Его цена — ровно 8px дополнительной высоты полосы и 4px отступа подписи от края. Для этого выбора были приняты source/layout comparison и один native spike; две полные реализации не требовались.

Первая поставка `.53` исправила вертикальную геометрию, но её native run остановился на последовательности `Home → history → materials → discussion`: `focus()` оставил последнюю вкладку частично видимой. End отдельно раскрывал её полностью, поэтому одной проверки крайних состояний оказалось недостаточно. Сохранены [original failure PNG](history/candidate1-desktop-light-minimal-failure.png), [полный raw отказа](raw/candidate1-failure-results.json.gz) и [неизменённый R1 `.53`](history/review-r1-v53.md). Этот R1 имеет `changes-requested` и не переименован в approval.

В `.54` после существующего keyboard `tab.focus()` вызывается `tab.scrollIntoView({block:'nearest', inline:'nearest'})`. CSS побайтно равен `.53`; существующий `scroll-padding-inline:4px` оставляет место для рамки. Из 49 runtime modules меняется только `components.js`. Public API, роли, модель выбора, события и production runtime/CSS Task, Board и Wiki сохраняются. Второй отказ `.53` — оставшийся точный type literal `.52` в consumer contract — исправлен на точный `.54`, без расширения типа до `string`. [Проверка пакета](analysis/package-verification.json).

## Native измерения

Все 57 именованных captures baseline имеют соответствующие captures candidate. Во всех парах высота border box увеличилась ровно на 8px; размеры кнопок, размеры/line-height текста, подписи, underline и selected/panel states совпадают. В координатах layout, с учётом внутреннего scroll offset, начало каждой кнопки сдвинуто на 4px по обеим осям. [Полное сопоставление](analysis/native-comparison.json).

| Профили | `.52`: client / scroll / maxScrollTop | `.54`: client / scroll / maxScrollTop | Высота rect |
| --- | --- | --- | --- |
| Обычный текст, обе темы, desktop и narrow | 45 / 46 / 1 px | 54 / 54 / 0 px | 45.5 → 53.5 px |
| Root font-size 200% | 64 / 65 / 1 px | 73 / 73 / 0 px | 65 → 73 px |

Список по-прежнему использует `overflow:auto`: отсутствие диапазона получено исправлением геометрии. Все 177 сохранённых intent geometries также имеют `scrollHeight === clientHeight` и `maxScrollTop === 0`.

Все 177 действий выпускают ровно одно `iq-change` с ожидаемым значением и owner. Это 136 keyboard intents и 41 pointer intent. Проверены Home, End, переход через границу, полный последовательный обход и пропуск disabled-вкладки. В ранее падавшем `materials → discussion` теперь `scrollLeft=475`, название шириной 161px целиком видно; внешняя focus paint area `[175,344]` находится внутри scrollport `[24,344]` по горизонтали. Полная геометрия этого конкретного действия сохраняется до assertions в raw; PNG End не выдаётся за screenshot другой клавиатурной последовательности.

Для 136 keyboard intents сохранены 298 before/after snapshots внешних scroll ancestors. В 298 случаях полоса помещалась по горизонтали, в 268 — по вертикали с учётом scroll padding. **Ни одно само клавиатурное действие не изменило позицию внешнего ancestor или окна**, включая случаи вне этого условия. Это измеренная граница текущих сценариев, а не обещание для любого будущего host layout. [Контекстные данные](analysis/native-comparison.json).

Board после закрытия Task сохраняет две исходные карточки. Nested Task удаляется из DOM до проверки возвращённого родителя; retained parent — `{connected:true, open:true, taskId:'task-1'}`. Task-переключения не создают write attempts. В каждом Wiki-профиле есть ровно одна явно вызванная synthetic rejected save, создающая конфликт без записи; draft сохраняется после переключений. `pageErrors`, `externalRequests` и unsupported adapter calls пусты. Это реальные frontend modules с детерминированными synthetic adapters; bootstrap/auth/backend/persistence таким стендом не приняты.

## Визуальная оценка и цена места

Автор просмотрел 18 before/after пар исходных PNG; в компактный пакет включены 12 пар, покрывающих все пять профилей и четыре поверхности. В светлой и тёмной теме рамка focus замкнута, underline читается целиком, нейтральная линия остаётся под рядом вкладок. В Task сохраняется порядок title → tabs → section content. В Wiki остаются видны сообщение конфликта, выбранное сравнение и editor. У nested readonly Task рамка также целиком видна, нижние действия сохраняются.

**Task и первый экран.** Дополнительные 8px имеют реальную цену: в desktop-light Task заголовок «Описание», который на `.52` едва показывался над закреплённым footer, на `.54` начинается ниже видимой границы. Поэтому V03 сохраняет именно плотный task-panel, а не только свободный work panel. Существующий `.iq-dialog-body` остаётся `overflow-y:auto`; raw initial geometry показывает доступный диапазон 790px в desktop-light и 954px при text200. Пакет не заявляет, что весь Task помещается на первом экране. При text200 сокращённые property labels и плотность полей уже присутствовали в baseline; эта правка не исправляет общую типографику/плотность Task.

**Wiki text200 и подготовка screenshot.** `capture()` сначала записывает geometry, затем вызывает `list.screenshot()`. При text200 исходная полоса находится у нижней границы окна. Подготовка screenshot раскрывает список и прокручивает Wiki `MAIN` ещё до первого intent: в `.54` `scrollTop` меняется с 0 на 15, list top — с 842.1875 на 827.1875. Первый pointer и последующие keyboard before/after contexts сохраняют это положение. Baseline screenshot также выполнял предварительное раскрытие, но меньшей полосы. Поэтому V11 показывает окружение и границу первого экрана; абсолютные page Y между этими полными кадрами не фиксированы. Величины +8/+4 получены из layout coordinates, а отсутствие keyboard jump — из per-intent before/after, независимо от подготовки screenshot. Кадры не кадрировались и не выравнивались вручную.

| Пара | Назначение | `.52` | `.54` |
| --- | --- | --- | --- |
| V01 | Minimal, светлая тема, keyboard Home | [До](visual/before/desktop-light-minimal-short-Home.png) | [После](visual/after/desktop-light-minimal-short-Home.png) |
| V02 | Minimal, длинное название при text200 | [До](visual/before/text200-light-minimal-long-End.png) | [После](visual/after/text200-light-minimal-long-End.png) |
| V03 | Task desktop-light, свойства и нижняя граница первого экрана | [До](visual/before/desktop-light-board-task-panel.png) | [После](visual/after/desktop-light-board-task-panel.png) |
| V04 | Task desktop-dark, work panel | [До](visual/before/desktop-dark-board-work-panel.png) | [После](visual/after/desktop-dark-board-work-panel.png) |
| V05 | Task narrow-light 390px, work panel | [До](visual/before/narrow-light-board-work-panel.png) | [После](visual/after/narrow-light-board-work-panel.png) |
| V06 | Task narrow-dark 320px, task panel | [До](visual/before/narrow-dark-board-task-panel.png) | [После](visual/after/narrow-dark-board-task-panel.png) |
| V07 | Task text200, свойства и видимая граница | [До](visual/before/text200-light-board-task-panel.png) | [После](visual/after/text200-light-board-task-panel.png) |
| V08 | Wiki desktop-light, сохранённый draft | [До](visual/before/desktop-light-wiki-draft-preserved.png) | [После](visual/after/desktop-light-wiki-draft-preserved.png) |
| V09 | Wiki desktop-dark, сохранённый draft | [До](visual/before/desktop-dark-wiki-draft-preserved.png) | [После](visual/after/desktop-dark-wiki-draft-preserved.png) |
| V10 | Wiki narrow-dark 320px | [До](visual/before/narrow-dark-wiki-draft-preserved.png) | [После](visual/after/narrow-dark-wiki-draft-preserved.png) |
| V11 | Wiki text200; учитывать screenshot setup | [До](visual/before/text200-light-wiki-draft-preserved.png) | [После](visual/after/text200-light-wiki-draft-preserved.png) |
| V12 | Nested readonly Task с keyboard focus | [До](visual/before/desktop-light-nested-nested-task.png) | [После](visual/after/desktop-light-nested-nested-task.png) |

## Привязка к поставке и gates

| Доказательство | Immutable reference |
| --- | --- |
| Authoritative baseline | Run `38218161373`, artifact `11733391704`, source `a49fac18565d3291b061eaa6c3c4c1c6f03ec328`, tree `d8ec6dc65001674957566c773fdcf0adf427df2c` |
| Native `.54` | Run `38221220733`, job `114717673229`, artifact `11734645359`, source `f53af728201b7a4ce2a128c6de7228143d2d50b4` |
| Published integration | Head `8f8d218168074bd4c7c9e1e29dfbe783a27998dd`, tree `a7bf8ed72f07d975a6837e8f1428382785893833` |
| Package `.54` SHA-256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Candidate plan revision3 SHA-256 | `a0165e153cb976c9da17332b1b79baaeb9b10da2e375c9aa290c620bb3889872` |
| Baseline plan SHA-256 | `79821edf821ead98f5666d9e87014e427394fbbbf906948cb464c53f6c19b0a9` |

Все 14 input hashes каждого raw результата независимо сверены с соответствующими frozen Git blobs; оба plan hashes совпали. [Проверка raw inputs](analysis/raw-source-verification.json). Whole-tree связывание CI merge source `.54` с опубликованным integration head дополнительно проверяет root; его окончательный результат следует приложить отдельно.

Публикация объединяет проверяемую DS-поставку и отдельно reviewed test-only PR78 prerequisite для NT05. Он не меняет library, package/lock, runner, fixture или plan; [побайтное сопоставление](analysis/publication-verification.json) показывает только восемь NT paths и две bridge-записи сверх authored DS tree. Code review NT05 не выдаётся за full CI PASS.

Локально прошли normal build, 478/478 library tests без skips, прежние size/style/contrast gates, normal prepack/pack, точный consumer install, byte comparison всех 176 source/archive/installed файлов, fixture build-only, boundaries/style guard, syntax и diff self-review. `.52` и `.53` archives не перезаписаны. Локальный TypeScript compiler не исполнялся повторно из-за известной зависимости TS7 от отсутствующего `/proc`; exact consumer literal проверен статически, а компиляция остаётся обязанностью full CI. Local Chromium, JDK25 и PG18 также не выдаются за PASS.

Native среда: Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `24.20.0`, GitHub Actions Ubuntu 24.04, ru-RU/UTC, device scale 1, reduced motion. Text200 — увеличение HTML root font-size, не browser zoom. Реальный zoom 200%, Safari, Firefox, iOS touch и screen reader combinations остаются отдельными WP09 release checks. Merge/deploy/npm publish и human research не выполнялись. Rollback — точная `.52` с соответствующими dependency/lock/type expectation; пользовательские данные не откатываются.

## Как прочитать raw и проверить оригиналы

Gzip сохраняет исходный JSON полностью; для каждого файла manifest содержит SHA-256 сжатых и исходных bytes. Например, из корня этого evidence-пакета:

```bash
gzip -dc raw/candidate2-results.json.gz > candidate2-results.json
sha256sum raw/candidate2-results.json.gz candidate2-results.json
```

Ожидаются соответственно `0decfdbc49dbd0f7e45d32c23a91e9b09c5792621e66c39b2ba3bfa674989453` и `44bfdf6a50938f61ca114344d852ca259e4909464ba9c6d1deee2c2072de0cb7`. После распаковки доступны все 16 profiles, 57 captures и 177 per-intent geometries/contexts. Все PNG — исходные bytes из проверенных native artifacts, без crop, resize, re-encoding или графических дополнений.
