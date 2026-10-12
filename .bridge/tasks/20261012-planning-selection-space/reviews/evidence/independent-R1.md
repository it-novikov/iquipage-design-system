# WP02 — независимое ревью R1

**Вердикт: changes-requested.** Для immutable commit `6a0f69c869886fd4d3bca43ef857264a6240049a` подтверждена одна находка **F1 [P1]** в новом историческом proof. Она останавливает CI до проверки CSS-кандидата. Дополнительных подтверждённых дефектов runtime в проверенном diff не обнаружено, но browser/visual приёмка кандидата **NOT_RUN**; это не approve продукта и не release gate.

Ревьюер: GPT-6 Astra, отдельная сессия `/root/planning_review_r1`, не автор изменения. Дата: 2026-10-12. Режим: `iquipage-review`, targeted audit, read-only. Product, bridge и remote не изменялись. Chromium локально повторно не запускался.

## Основа и scope

Прочитаны root/product `AGENTS.md`, `START-HERE.md`, engineering README, review/workflow и bridge protocol; skill `iquipage-review` с constitution, execution-contract, quality-method и design-review; карточка, журнал и evidence задачи `.bridge/tasks/20261012-planning-selection-space`.

Проверены все 11 изменённых файлов относительно базы. Runtime-дельта ограничена 10 строками diff `products/sprintique/ui/planning/src/planning.css`: full-height колонка, workspace как область прокрутки и существующая selection bar в обычном потоке. Прочитаны неизменённые окрестности: shell/mount, Planning markup/render/focus/selection, top-layer popover/dialog, публичная workspace composition и `bindTreeDrag` из фактически поставленного архива .52. Manifest, lock, vendor, runtime JS/DOM, server/API/permissions в diff не меняются.

Исходники читались через `git show` и frozen `git archive` в `/workspace/scratch/b3dac59f68e2/research/wp02/review-6a0f69c`; последующие live-изменения автора в этот вердикт не входят.

| Вход | Проверенное значение |
| --- | --- |
| Base | `f5f941afa4e9be8a709e6de67a92bacf5a9397ca` |
| Candidate | `6a0f69c869886fd4d3bca43ef857264a6240049a` |
| Candidate tree | `548ec2d7af4e2969e61d0eeda94ec7d0b0f42b84` |
| Patch SHA256 | `fbb0f1bae0d5ae5077ceeed0a0703cf02c02410d75d0305a2d6718ae403eaa6f` |
| DS | `@iquipage/web` `0.6.0-vnext.52` |
| DS archive SHA256 | `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758` |
| Base Planning CSS SHA256 | `abc64121cac705d4cb6a7a183cc79e2bb0e3e5992e01a0f3483eaff0ff0b7f1a` |
| Candidate Planning CSS SHA256 | `0916a36d4a682ce7b05e84fc8732382ce4bbda03b707578ffd909dc16b6650f4` |

## Находки

- **F1** [P1] `products/sprintique/tests/planning-selection-baseline-proof.mjs:13` — Исторический proof требует перекрытия последней строки во всех профилях, которого на immutable baseline нет. Через `.github/workflows/vnext.yml:61` это превращает достоверное воспроизведение исходного дефекта в падение job и не даёт выполнить candidate regression.
  **Статус:** confirmed, дефект нового теста/CI; не утверждение о неисправности CSS-кандидата.
  **Сценарий:** запустить repair PR с unchanged baseline `f5f941a`. Три browser-профиля полностью выполняют interaction assertions, средняя выбранная строка перекрывается во всех трёх; последняя перекрывается только на narrow. После ожидаемого FAIL обычного no-overlap runner recognizer падает на desktop last row. Следующий candidate step не выполняется.
  **Вред:** обязательное доказательство исправления недоступно из-за ложного ожидания о старой версии; CI остаётся красным и A1/A2 нельзя закрыть.
  **Причина:** целевое требование «не перекрывать среднюю и последнюю строку на всех профилях» ошибочно перенесено в историческое требование «старая версия обязательно перекрывает каждую из этих строк на каждом профиле». Исторический контрпример должен описывать фактически наблюдаемый дефект, а требования к исправлению остаются полными.
  **Evidence:** GitHub Actions run `38207967799`, job `114675580643`; исходный Chromium `151.0.7922.34`, Node `v24.20.0`. Локально независимо прочитаны JSON и raw log, просмотрены все девять baseline PNG, повторно запущен immutable recognizer против полученного JSON.
  **Требуемое исправление:** скорректировать только историческую expected-red матрицу и соответствующие обещания в evidence/docs по проверенным фактам: selected middle overlap во всех трёх профилях и selected last overlap на narrow, с полным завершением взаимодействий и отсутствием application/external/interaction errors. Сохранить candidate no-overlap, hit testing, bounds, scroll, wrap и interaction assertions на всех трёх профилях. Не принимать произвольный FAIL или ошибку запуска как red proof.
  **Приёмка исправления:** исправленный recognizer принимает этот реальный baseline-результат; отрицательные случаи без требуемого overlap, с ошибкой или незавершённым профилем остаются красными; CI затем фактически выполняет candidate runner. Для A1/A2 нужны candidate PASS и независимый просмотр matching before/after frames на текущем build. Изменения expected-red матрицы не должны ослаблять требования к green.
  **Решение:** [open]

### Измеренный baseline для F1

Площадь пересечения в CSS px²; данные из actual `results.json`, не расчёт по исходникам.

| Профиль | Средняя выбранная строка | Последняя выбранная строка | Перенос controls | Recorded move intents |
| --- | ---: | ---: | --- | ---: |
| desktop, light/comfortable, 1363×936 | 19592 | 0 | нет | 1 |
| compact, light/compact, 1280×720 | 19592 | 0 | нет | 1 |
| narrow, dark/comfortable, 320×568 | 23682.09375 | 15677.375 | да | 1 |

У desktop `lastRow.row.bottom = bar.top = 858`; у compact — `642`. Пересечения нет, что видно и в кадрах. На narrow панель закрывает существенную часть последней строки; `rowHit = false`. На всех профилях `pageErrors`, `externalRequests` и `interactionFailures` пусты, а interaction run завершается до записи одного move intent. Таким образом, это корректное воспроизведение реального дефекта, отвергнутое неверным recognizer expectation.

Команда воспроизведения F1 без нового запуска браузера:

```sh
node /workspace/scratch/b3dac59f68e2/research/wp02/review-6a0f69c/products/sprintique/tests/planning-selection-baseline-proof.mjs /workspace/scratch/b3dac59f68e2/research/wp02/ci-38207967799/planning-selection/baseline/results.json
```

Фактически: exit `1`, `AssertionError: desktop: selected last row must visibly intersect the bar`, строка 13.

Пути evidence:

- `/workspace/scratch/b3dac59f68e2/research/wp02/ci-38207967799/planning-selection/baseline/results.json`, SHA256 `25e787a945868a8fd006ab62a06ec9d0e32fdfdc717bb10fef639e86e0e78165`.
- `/workspace/scratch/b3dac59f68e2/research/wp02/ci-38207967799-job.log`: recognizer assertion около строк 1349–1360; последующий ENOENT verification certificate — следствие остановки перед существующими verification steps.
- `/workspace/scratch/b3dac59f68e2/research/wp02/ci-38207967799/evidence.zip`, SHA256 `faf8728a0f8cf50bd45e02660b6551242e96e13ac4e867f494c0ab70afda832a`.
- В baseline directory просмотрены `desktop-selection.png`, `desktop-last-row.png`, `desktop-menu.png`, соответствующие три `compact-*` и три `narrow-*`.

## Что проверено в реализации и gate

**Геометрия по исходникам.** Цепочка высоты соответствует настоящему shell: `.demo-shell` задаёт viewport height, `.platform-main` — flex с `min-height:0`, Planning root/page получают полную высоту; workspace может сжиматься и прокручиваться. Bar — существующий sibling workspace с `flex:none` и auto-height, поэтому её перенос должен участвовать в расчёте высоты. `hidden` снимает bar из layout. Новой фиксированной высоты, дополнительного filler, private DOM-патча или локальных визуальных замен DS в diff нет. Это обоснованность реализации, а не доказанный candidate render.

**Selection и focus.** `toggleSelection` сохраняет существующие render/focusRow paths; после изменения selection перерисованная строка фокусируется штатным `.focus({preventScroll:false})`. Escape очищает выбор через тот же render. Сценарий исчезновения сфокусированной clear-selection button отдельно записывается runner как baseline behavior, не утверждается в качестве желательного accessibility-контракта. Степень фактического scroll movement после уменьшения workspace требует candidate run.

**Меню, dialog return и drag.** Product popovers/menus и drag ghost добавляются в `document.body`/top layer; новое `overflow:hidden` на host не должно их обрезать. Закрытие меню по scroll слушается в capture на document, поэтому перенос scrolling element сам по себе не теряет listener. DS `scrollParent` выбирает ближайшего предка с `overflowY:auto|scroll` и фактическим overflow; новый workspace соответствует этому алгоритму. Product callback после закрытия Task возвращает фокус строке, а synthetic fixture честно заменяет содержимое Task и adapter. Исторические assertions и кадры подтверждают baseline interaction path; паритет кандидата пока не проверен.

**Регрессия и границы fixture.** Использованы настоящий `mountPlanning`, обычные product CSS imports, project navigation, public DS .52 и real product dialog wrapper. Данные детерминированные и вымышленные. Adapter `move` записывает intent и явно отклоняет операцию; результат не имитирует сохранение на сервере. Runner собирает geometry failures отдельно, продолжает interactions и требует пустых application/external/interaction errors. Это полезная структура для получения red evidence. Найденная ошибка — требование recognizer к last-row baseline, а не необходимость удалять проверки кандидата.

**Существующие gates и зависимости.** В workflow только добавления; прежние installation, library/product/real-services/extraction и runtime-image steps не ослаблены и не удалены. Product manifest/lock/vendor идентичны базе. Playwright устанавливается отдельным временным инструментом CI. Текущая остановка перед candidate и основными gates является FAIL, а не их успешным выполнением.

## Проверки, выполненные ревьюером

| Проверка | Результат и граница |
| --- | --- |
| Полный immutable diff и инструкции | Прочитаны; только scoped runtime CSS и dedicated verification additions |
| SHA tree/patch/DS/CSS/evidence | Независимо сверены; base CSS hash совпадает с actual CI JSON |
| `node --test tests/planning-workspace.test.mjs tests/planning-containers-ui.test.mjs tests/planning-operation.test.mjs` | 18 passed, 0 failed, Node `v24.19.0`; frozen source и public vendor .52 из immutable archive; не layout и не persistence |
| `node --check` двух новых runners | PASS, syntax only |
| `git diff --check f5f941a 6a0f69c` | PASS, whitespace only |
| Immutable baseline recognizer на actual CI JSON | FAIL воспроизведён без браузера, F1 |
| Actual baseline JSON/raw log/9 PNG | Прочитаны и кадры просмотрены; воспроизведение overlap подтверждено в указанной матрице |

Авторские `check:boundaries`, Vite product/fixture bundle и сообщения о невозможности local Chromium/native TypeScript7 отдельно прочитаны в evidence. Они не переименованы в независимую browser-проверку и не засчитаны за полный build.

## Не проверено и условия следующего ревью

- **Candidate browser/visual: NOT_RUN.** В actual CI job candidate step не выполнен из-за F1; локальный browser повторно не запускался после известного отказа среды `/proc`. A1/A2 остаются открытыми. Наличие правильного CSS и зелёных Node-тестов не закрывает их.
- **Candidate full build, backend/services/extraction/runtime-image: NOT_RUN в рассмотренном CI run.** Локальная native TypeScript7-проблема не обойдена и не скрыта. Прежние gates остаются обязательными.
- Не проверены настоящий Task route, API persistence/reload, F03 lost-response/replay, реальные пользовательские данные, остальные browser engines, touch/device Safari, screen reader, browser UI zoom и release-wide suite. Текущий scope — синтетический frontend Planning.
- Новые commit автора и будущий CI результат этим immutable R1 не утверждаются. После исправления F1 нужно проверить точную дельту proof/docs, реальный candidate результат, owner/outerScrollTop нового scroller и matching screenshots; для закрытия F1 недостаточно одной ссылки на исходный baseline FAIL.

## Итог

- **Вердикт:** changes-requested для `6a0f69c869886fd4d3bca43ef857264a6240049a`.
- **Открыто:** F1 [P1], неверное требование исторического proof блокирует candidate verification.
- **Проверено:** весь diff, затронутая цепочка composition/focus/menu/drag, неизменность зависимостей и существующих gates, 18 Node-тестов, syntax/whitespace, фактический baseline CI и все девять baseline кадров.
- **Не проверено:** browser/visual и release gates кандидата; они не объявлены PASS. Разрешения на merge/deploy этот отчёт не даёт.
