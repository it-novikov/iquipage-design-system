# Независимое ревью R2 — WP01 Maps → Task → прежняя карта

**Вердикт: changes-requested для `67abc872e632138c9c9673db77b6e7c76c0830a8`.** Открыты три P1: одно продолжение незакрытого initial-mount root cause R1-F3 и два дополнительных отказа recovery/dirty-guard. Все три подтверждены исполнением зафиксированного исходного кода в Node. Исходные 79 scoped checks проходят; они не покрывают приведённые границы. Browser/visual acceptance в этом отчёте не заявлена.

## Основа, рамки и независимость

- Ревьюер: отдельный агент `maps_review_r2`, GPT-6 Astra, новая независимая сессия R2; не автор патча. Изменения остаются работой автора.
- Дополнительный read-only агент `guard_validation` независимо проверил достижимость R2-F3, настоящий comment composer/repository и диагностический negative control; подтвердил причину. Основной ревьюер также прочитал указанные им исходные участки. Это второе мнение об одной находке, не отдельный раунд приёмки.
- Проверяемый commit: `67abc872e632138c9c9673db77b6e7c76c0830a8`; tree: `e548bc1208532f7dbf9aa1bcfa4015b3e6124399`.
- Base: `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`.
- R1: `fbaf15fbcae32a672ec5975fc1106a2bff29b709`; пакет автора также указывает эквивалентное опубликованное дерево `83f30e77100e8732cc6af50b9b51852dd6d32c6f`.
- Исходники извлечены через `git archive` в `/workspace/scratch/b3dac59f68e2/research/wp01/review-67abc87`. Исполнялся этот snapshot, а не изменяемая ветка автора. Для чтения установленных зависимостей подключена существующая `node_modules`; новой установки ревьюер не выполнял.
- Прочитаны root/product `AGENTS.md`, `START-HERE.md`, `engineering/README.md`, `engineering/workflow.md`, `engineering/review.md`, границы репозитория, README продукта, ADR 0014, карточка WP01, авторский checkpoint, дословный независимый R1 и его evidence. Применён локальный `iquipage-review` и прочитаны constitution / execution-contract / quality-method / design-review.
- Проверен полный продуктовый diff WP01 и полностью — исправления после R1 с их Maps / Task / shell окружением. Отдельно прочитаны новый browser runner, его fixture/repository, dedicated workflow и декларации ограничений.
- План targeted проверки сохранён **до тестов**: `r2-targeted-plan.json`, SHA-256 `8e47e0879d50de7decb0a0cce1fa0c988f46a35aaefa9383f8aef87750d5bcc0`. Это локальный план независимого ревью, а не подпись владельца и не full-integration assessment.
- Режим read-only для product / bridge / remote. Созданы только scratch snapshot, диагностический тест, логи, план, fixture-build evidence и этот отчёт. Никаких backend/production/credential действий, публикации, merge или deploy ревьюер не выполнял.

Все номера строк ниже относятся к frozen `67abc87`; пути относительно корня репозитория. Node-доказательства явно отделены от настоящего браузера.

## Findings

### R2-F1 — initial Task read всё ещё воскрешает оставленный route

- **R2-F1** [P1, confirmed] `products/sprintique/web/maps-host.js:21–22` — последний hash считывается перед `await host.openRoute(latestHash)`, но host становится доступен shell только после завершения этого await.
  **Связь с R1:** продолжение **R1-F3**, а не второй независимый дефект той же фазы. Автор исправил смену hash во время начальной загрузки карты; последующая загрузка первой Task остаётся вне действующей передачи intent.
  **Сценарий:** открыть contextual URL `#maps/A/task/T1`. Карта A уже прочитана, начинается первый Task read или support loading. Пока он задержан, перейти к `#maps/A` либо более новой `#maps/A/task/T2/work`. Во время `board=await mountMapsHost(...)` shell ещё держит `board=null` и `navigating=true` (`web/main.js:176,186,226`). Его настоящий `hashchange` handler отправляет Maps route в `navigate`, который возвращается на начальном guard (`main.js:251,306`). Доставить прежний T1 последним.
  **Ожидание:** отменённый T1 не появляется и не пишет URL; видимый контекст соответствует последнему route intent.
  **Фактически:** во всех трёх независимых вариантах конечные `task="T1"`, `hash="#maps/A/task/T1"`, `opened=["T1"]`. Проверены более новые `#maps/A`, `#maps/A/task/T2/work` и canonical `#/task/T2`; ошибок исполнения нет. Canonical handler тоже не может сменить owner во время pending mount и старое продолжение позднее переписывает его адрес.
  **Причина:** исправление делает один снимок `location.hash` после Maps mount. Оно не подключает route intent на всё время Task/module/support await до возвращения host. `createMapsTaskContext` не получает нового вызова и потому не отменяет `generation`/`opening`; его внутренний `active()` закономерно считает прежний read актуальным.
  **Вред:** Back и новый deep link отменяются поздним ответом; человек получает Task, от которой уже ушёл. Нарушены A1/A2 и обещание ADR о последнем адресе после initial mount.
  **Воспроизведение:** три теста `R2-F1` в `maps-task-review-r2-repro.test.mjs`. Исполнены дословные `mountMapsHost`, `createMapsTaskContext`, `showProject`, `navigate` и `hashchange` bodies из snapshot. Состояние shell соответствует реальному незавершённому mount. Repository read удерживается; DOM drawer заменён EventTarget. Это actual-source композиционный probe, не native browser traversal.
  **Действие:** обеспечить непрерывную передачу/отмену route intent через весь initial mount, включая первую Task и её support/module loading. Один дополнительный post-await `replaceState` недостаточен: устаревший drawer вообще не должен открываться. Canonical и другие section routes должны попасть к правильному владельцу. Новый router для этого не требуется.
  **Приёмка:** отдельно задержать map list, map read, Task read и Task support; во время каждой фазы выполнить Back к карте, новый contextual task/tab и canonical Task route. Доставить старый ответ последним. Неизменённый direct link успешно открывается; изменённый открывает только последнюю цель, без кратковременного старого drawer. Новый native-browser case должен начинаться с contextual URL, а не только с уже готовой карты.
  **Решение:** [open]

### R2-F2 — успешный retry карты оставляет Task URL без Task

- **R2-F2** [P1, confirmed] `products/sprintique/web/maps-host.js:17,22` — после ошибки initial map mount contextual route пропускается; последующий успешный `onOpenMap` меняет только адрес и больше не применяет Task target.
  **Сценарий:** открыть `#maps/A/task/T1`. Initial map-list read временно завершается ошибкой. Настоящий `MapsFeature.loadInitial()` показывает ошибку и «Повторить загрузку» (`ui/src/maps.js:59–74`), host возвращается без `maps.current`, поэтому строка 22 не вызывает `openRoute`. Затем повторить загрузку; карта A успешно открывается.
  **Ожидание:** успешное восстановление выполняет актуальный contextual deep link; drawer и адрес согласованы. Отказ отсутствующей карты по-прежнему не выбирает случайную B.
  **Фактически:** `map="A"`, `hash="#maps/A/task/T1"`, `currentTask=null`, `taskReads=[]`, `opened=[]`. Ни одного чтения названной Task не было.
  **Причина:** кнопка retry вызывает существующий `loadInitial`, который успешно вызывает `openMap`/`onOpenMap`. Host сохраняет Task suffix в `replaceState`, но `replaceState` не генерирует `hashchange`. Единственное первоначальное применение route уже пропущено; повторного применения после recovery нет.
  **Вред:** сработавшее «Повторить» не завершает путь человека к Task. URL обещает открытый объект, которого нет, и его сохранение/reload имеет другое действие, чем текущая поверхность. Нарушены A1/A2.
  **Воспроизведение:** тест `R2-F2` исполняет настоящие `MapsFeature.loadInitial`, `reloadList`, `openMap`, настоящий `mountMapsHost` и contextual controller. В первой попытке repository list отклонён, затем та же instance успешно повторяет операцию. Заглушены DOM painting и drawer; error/retry state и отсутствие Task read проверяются явно.
  **Действие:** завершать согласование актуальной Task-цели и после успешного восстановления карты, сохраняя одного владельца route и late-read cancellation. Не объявлять Task открытой одним сохранением её suffix в URL.
  **Приёмка:** initial map-list failure и отдельно map-read failure → настоящий retry → только актуальная Task/tab открыта поверх A. Смена hash до retry не воскрешает прежний target. Missing map остаётся явной ошибкой; newer B не подставляется. Идентичность существующего Maps controller сохраняется.
  **Решение:** [open]

### R2-F3 — сохранённый после неудачного reload drawer теряет dirty-guard

- **R2-F3** [P1, confirmed] `products/sprintique/web/maps-task-context.js:55–68,87–89` — новый handoff сохраняет прежний drawer при ошибке `onReload`, но у старого Task controller к этому моменту уже выставлен постоянный `discarded=true`.
  **Связь с изменением:** это побочный эффект исправления R1-F4, которое правильно откладывает уничтожение прежней формы до успешной подготовки следующей. Его совместимость с существующим reload callback не проверена.
  **Сценарий:** в Maps Task T1 получает autosave conflict и показывает «Загрузить актуальную версию» (`ui/src/board/task-dialog.js:375–376`; альтернативный достижимый источник — неудачный fresh read после plan command, строки 399–402). Нажать это действие. Настоящий обработчик сначала делает `discarded=true`, затем `void onReload()` (`task-dialog.js:430–433`). Новый host запускает `openTask(task.id,{reload:true,...})`; повторное чтение или support preparation завершается ошибкой. Старый T1 остаётся доступным. **После этой ошибки** ввести новый неопубликованный комментарий и закрыть drawer.
  **Ожидание:** текущая живая форма защищает новый ввод; Close/Back должны спросить, сохранять ли новый draft. Ранее выбранное обновление не является разрешением терять будущие изменения.
  **Фактически:** `dirty=false`, `accepted=true`, `connected=false`, `confirmations=0`, `hash="#maps/A"`, `currentTask=null`. Новый комментарий закрыт без предупреждения.
  **Причина:** `dirty()` целиком ограждён `!discarded` (`task-dialog.js:348–349`); `close()` также пропускает flush при выставленном флаге и немедленно закрывает такую форму (`445–449`). Настоящий thread controller распознаёт непустой draft (`ui/src/board/thread-view.js:51,350`), но внешний флаг подавляет его результат; idle draft не активирует busy checks. В прежнем Board reload сначала действительно закрывал старый drawer, затем читал новую Task (`ui/src/board/board.js:148`), поэтому сохранённой активной формы с этим флагом не возникало. В новом Maps failure path прежняя форма остаётся, а восстановление guard отсутствует.
  **Вред:** неопубликованный ввод, созданный уже после отказа обновления, теряется при обычном закрытии без dirty confirmation. Нарушен A2. Это не жалоба на уже осознанно отброшенный до reload текст.
  **Воспроизведение:** тест `R2-F3` исполняет настоящий contextual controller и дословные Task `dirty`, reload click handler и `close` blocks. DOM/form/editor adapters минимальны. Отдельный отрицательный контроль в том же тесте доказывает, что **до** reload этот же guard замечает комментарий, показывает confirmation и отказывает закрытию. После actual reload failure он перестаёт защищать новую запись. Probe ловит promise только для наблюдения ошибки; поведение сохранения старого drawer не изменяется.
  **Действие:** согласовать reload/discard с новым отложенным handoff. Решение об отбрасывании старой формы должно завершаться вместе с успешной заменой или корректно отменяться, если форма осталась. Живой editable drawer не может продолжать работу с навсегда выключенным dirty predicate. Только reset в catch недостаточен для нового ввода во время pending reload; проверить также отмену/false/supersession. Сохранить новый error sink R1-F4 и не возвращаться к безусловному раннему уничтожению формы.
  **Приёмка:** актуальное Task UI: failed Task read/null, failed support read и отмена reload → старый drawer остаётся; ввести новый комментарий/поле и проверить Close, Escape и Back с отказом/подтверждением. Новый текст защищён. Успешный reload и обычный linked-task handoff по-прежнему заменяют одну Task другой, а failed linked-task preparation оставляет доступную ошибку.
  **Решение:** [open]

## Состояние четырёх замечаний R1

| R1 | Статус по текущему source evidence | Что проверено и что осталось |
| --- | --- | --- |
| R1-F1 — поздняя B побеждает Back A | **Resolved в проверенном source scope** | Context отменяет request, переданный в настоящий `MapsFeature.openMap`; checks стоят после guard и перед изменением `current`/board. Actual Maps tests для map-only A, новой Task на A и отмены во время guard проходят. |
| R1-F2 — shell возвращает URL уже закрытой Task | **Resolved в проверенном source scope** | Настоящие `navigate` и canonical Task handler повторно получают route действующего владельца после отказа Maps guard. Оба независимых запуска authored regressions проходят; старый Task suffix не восстанавливается. |
| R1-F3 — initial mount воскрешает оставленный Task URL | **Unresolved / частично исправлено** | Четыре authored cases со сменой hash во время map mount проходят. **R2-F1** подтверждает то же нарушение intent во время последующего initial Task await. Общую находку нельзя закрыть только на первой фазе mount. |
| R1-F4 — linked-task error теряется после уничтожения source Task | **Исходные missing/support сценарии resolved; repair имеет новый побочный дефект** | Настоящий Task links view сохраняет живой T1 и показывает missing/support error; `beforeOpen` стоит после Task/support/members reads, старый Task проходит обычный keepOpen guard, затем применяется existing replace. Эти authored cases проходят. Новый **R2-F3** отдельно блокирует принятие reload-пути. |

Resolved здесь ограничен соответствующим root cause и фактически исполненными assertions. Это не утверждение, что вся UI-матрица Maps/Task уже принята.

## Исполненные проверки и evidence

Рабочий каталог продукта: `/workspace/scratch/b3dac59f68e2/research/wp01/review-67abc87/products/sprintique`.

| Проверка R2 | Фактический результат |
| --- | --- |
| `node --import tsx --test --test-concurrency=1 tests/maps-task-origin.test.mjs tests/frontend-lifecycle.test.mjs tests/navigation-speed.test.mjs tests/work-model.test.mjs tests/page-surfaces.test.mjs` | **PASS 79/79**, 0 skipped/cancelled; Node `v24.19.0`. |
| `npm run check:boundaries` | **PASS** product-contained imports/public DS entries/contracts boundary и styles check. |
| `MAPS_SOURCE_REVISION=67abc872e632138c9c9673db77b6e7c76c0830a8 MAPS_EVIDENCE_DIR=.../research/wp01/r2-fixture-build node tests/maps-task-browser.mjs --build-only` | **Build PASS**, browser **NOT_RUN**; actual Maps host/context/Maps/inspector/Task module graph собран. `r2-fixture-build/results.json`. |
| `node --test maps-task-review-r2-repro.test.mjs`, из `research/wp01` | **FAIL 5/5**, воспроизводит R2-F1 в трёх вариантах, R2-F2 и R2-F3. Все падения — assertions ожидаемого правильного поведения; runner/setup работает. |
| Vendor `.52` в frozen snapshot | SHA-256 **`989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`**, совпадает с pinned evidence. |
| Installed DS против pinned archive | **Все 176 обычных файлов совпадают побайтно**; установленная версия `0.6.0-vnext.52`. |
| Diff manifest / lock / vendor / existing `.github/workflows/vnext.yml` относительно base | **Пуст**; эти границы WP01 не изменяет. |

Полный вывод независимых repro сохранён в `/workspace/scratch/b3dac59f68e2/research/wp01/r2-independent-regressions.log`; test source — соседний `maps-task-review-r2-repro.test.mjs`. Лог явно печатает exit code дочернего Node **1**; его сохранение Python-обёрткой с exit 0 не объявляется успешным тестом.

Зафиксированные SHA-256 source inputs независимых repro:

| Source | SHA-256 |
| --- | --- |
| `web/maps-host.js` | `b6ce131dece97601bf9c1169cf3c3be65beb751177691c609955fc1006cfad47` |
| `web/maps-task-context.js` | `e0249fef5da75b5aa1970e6b667e30069f5a902bdd7957ba6f16dead0d6e2f02` |
| `web/main.js` | `c1756c15cefa1acf65a89e04be7d19ae5313415421cc3294c67c9eaa65ad1880` |
| `ui/src/board/task-dialog.js` | `d61ad085a1a46a2bbf1fbe36646b2430583d04457869fd2b240a0db294966b12` |

## Оценка реализации вне findings

Узкая composition по source сохраняет существующий Maps owner и полноценный Task dialog; нового UI-компонента или DS обхода в патче не обнаружено. Открытие Task не вызывает map guard и не пересоздаёт canvas/inspector. Уход из section по-прежнему последовательно проводит Task close и Maps guard. Abort для Maps установлен ещё до ожидания guard и проверяется до замены `current`; task generation проверяется после Task read и в delayed handoff. Это исправляет основной cross-owner race R1-F1.

Task capabilities передаются отдельно от Maps: `tasks.write` для редактирования Task и `project.settings` для управления каталогами. Новый projectId check на прочитанной Task соответствует существующему Board boundary. Backend, actor context, schema, migration, API и server authorization не меняются; runtime прав из синтетического adapter не выводится.

`initialSection`, `onSectionChange`, `setSection` и `beforeOpen` — product-level callbacks, не новый DS API. Для Board/Planning/Workbench `beforeOpen` по умолчанию отсутствует, а обычная tab URL запись остаётся через существующий canonical `taskURL`. При отсутствии Work capability controller нормализует section к Task. Копирование Task URL, существующие поля, обсуждения, links и attachment adapter используют прежние реализации. Linked handoff теперь передаёт existing `replace` и состояние fullscreen. Это source compatibility review; полного поведения всех прочих hosts данный набор проверок не доказывает.

Проверены close/replace lifecycle в product `ui.js` и точном packaged dialog: обычное закрытие и instant replacement могут давать разный момент native close notification. Host слушает `iq-close`, ожидает его при необходимости и игнорирует старый drawer после смены `modal`. Отдельного доказанного race на successful instantaneous replacement в доступном source review не найдено. Наблюдение MutationObserver в fixture не принимается за измерение кадров или отсутствия мигания.

## Browser fixture и CI: что доказуемо, что отсутствует

Новый fixture существенно сильнее первых controller doubles: он импортирует реальный `mountMapsHost`, настоящий Maps/whiteboard/inspector, Task/relations/comment editor/Work tab, product CSS и точную `.52`. Открытие выполняется действительной кнопкой инспектора, переходы между Task — действительными relation-map buttons. Репозиторий даёт только определённые synthetic reads; неподдержанные операции и всякая запись записываются как ошибка. Сеть browser context ограничивается origin его loopback Vite server. Fixture не обращается к production, credentials или backend.

Автор корректно разделил scope. В README и `results.json` явно указано отсутствие `main.js` bootstrap/auth/section switching. `--build-only` оставляет browser NOT_RUN; первый независимый R2 запуск это подтвердил. Workflow содержит отдельный scoped browser job с pinned Actions, temporary Playwright и публикацией evidence, не заменяет существующий vNext gate. Artifact upload не выдаёт отсутствие файлов за успех. На PR `github.sha` обозначает проверяемый CI revision; его и source digests необходимо сопоставить с принимаемым patch, особенно если CI исполняет merge ref.

У fixture остаются конкретные пределы покрытия:

1. Все четыре browser profiles начинают с готовой карты `#maps/map-a`. Они не проходят initial contextual Task loading. Сам fixture также делает `if(!host)return` в hash listener во время pending mount, поэтому **R2-F1** не проверяется существующей happy-path матрицей.
2. Map reads в synthetic adapter немедленные и успешные; initial map error → retry и пропущенный Task target **R2-F2** отсутствуют.
3. Записи запрещены, reload после conflict не активируется. Проверка свежего comment draft и отказа Back не проверяет форму после failed reload с уже выставленным `discarded` — **R2-F3**.
4. Во всех profiles включён `reducedMotion:'reduce'`. Два `requestAnimationFrame` и MutationObserver не измеряют обычные opening/closing animations, native frame continuity или отсутствие краткого overlap. README это ограничение честно называет.
5. Desktop/narrow Chromium emulation не является iOS touch, Safari, Firefox, screen reader или реальным browser UI zoom. Синтетическое сохранение viewport/selection не является подтверждением persistence после reload.

Зелёный будущий запуск текущего fixture не закроет эти три findings: их действия в runner отсутствуют. Нужны прямые regressions затронутых границ. Pending browser gate сам по себе не оформляется как дополнительный finding, поскольку автор не объявляет его пройденным.

### Полученная при завершении R2 сводка первого CI

Оркестратор передал следующую фактическую сводку [Maps CI run 38208579979](https://github.com/it-novikov/iquipage-design-system/actions/runs/38208579979), job `114677451438`: 79 Node checks PASS; browser job **FAIL на bootstrap fixture, до предметных сценариев**. Причина по переданному результату: контекст project navigation fixture не соответствует `readProjectContext`. Проверенный merge `MAPS_SOURCE_REVISION`: `cc3ce4bd8401f70f5e7498fe6addf2a8de1f5cea`. Публикуемый head `ac9393cc86421612f8b54f1937606517d6ffe36c` имеет exact tree frozen `67abc87` — `e548bc1208532f7dbf9aa1bcfa4015b3e6124399`.

Переданные metadata artifact: `11728680980`, name `maps-task-context`, size `1970` bytes, digest `096347f689326a4e30b5a1dca6a382962f97dce7f23de5c11da122c20570753e`. Это сводка оркестратора: основной R2 reviewer **не скачивал этот artifact и не читал raw CI JSON/кадры лично**. Отдельный автор исправляет fixture bootstrap; будущая поправка не меняет данный frozen verdict.

Таким образом, runner запускался в настоящем CI browser, но ключевые native Back/Forward, visual light/dark × viewport, focus и Task replacement scenarios остаются **NOT_RUN**, а сам CI gate — **FAIL**. Наличие artifact или fixture bundle PASS не закрывает runtime/visual. При получении успешного нового evidence требуется отдельная запись с exact revision/digests и перечнем лично просмотренных кадров; безусловного UI approve в этом отчёте нет.

## Итог и передача

- **Вердикт:** changes-requested.
- **Открыто:** **R2-F1, R2-F2, R2-F3 — P1**. R2-F1 сохраняет незакрытый root cause R1-F3; остальные исходные R1 cases исправлены в проверенном техническом scope.
- **Проверено:** полный узкий WP01 diff и все R1 repairs, source boundaries Maps/Task/shell, actual Task beforeOpen/replace/reload/dirty lifecycle, canonical URL/public DS boundary, 79 scoped Node checks, пять независимых воспроизводимых regression assertions, fixture build и source audit browser workflow.
- **Не проверено:** настоящий браузер/кадры для этого commit, обычная animation/focus/viewport visual матрица, production acceptance, полный `npm run build`, JDK25/PostgreSQL18/server/extraction gates и deploy. Автор сообщает local TypeScript7 `/proc/self/exe` и Chromium `/proc` blockers; R2 не переименовывает их в PASS и не повторяет заведомо недоступные gates.
- **Дальше:** автор исправляет три root cause без расширения scope и без ослабления существующих тестов; сохраняет новые meaningful regressions; публикует следующий разрешённый checkpoint; получает actual browser/CI evidence и повторную независимую проверку исправленного результата. A1–A3 остаются открытыми. Сам этот отчёт ничего не разрешает сливать или выкладывать.

