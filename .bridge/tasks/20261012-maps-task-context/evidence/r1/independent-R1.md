# Независимое ревью R1 — WP01 Maps → Task → прежняя карта

**Вердикт: changes-requested.** Найдены четыре конкретных нарушения поведения на границах Maps / Task / shell. Ниже три ошибки воспроизведены непосредственным исполнением frozen source в Node, четвёртая подтверждена отдельным read-only probe действующего обработчика Task links. Это ограниченное техническое ревью, не browser/production-приёмка.

## Основа и независимость

- Ревьюер: отдельный агент `maps_review_r1`, GPT-6 Astra; не автор патча. Root остаётся единственным автором исправлений.
- Дополнительный агент `task_lifecycle_probe` независимо проследил узкий путь Task links и cleanup; его вывод проверен по тем же immutable исходникам.
- Неизменяемый commit: `fbaf15fbcae32a672ec5975fc1106a2bff29b709`.
- Base: `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`.
- Задача: `.bridge/tasks/20261012-maps-task-context/task.md`; рамки WP01 и критерии A1–A3.
- Исходники для исполнения извлечены через `git archive fbaf15f` в `/workspace/scratch/b3dac59f68e2/research/wp01/review-fbaf15f`. Текущая рабочая ветка автора не использовалась как исполняемый source после заморозки.
- Проверен SHA-256 vendor-архива `.52` непосредственно в commit: `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`.
- Прочитаны root/product `AGENTS.md`, `START-HERE.md`, `engineering/README.md`, `engineering/review.md`, relevant product README, `iquipage-review` и его constitution / execution-contract / quality-method / design-review, ADR 0014, task/diff.
- Режим: targeted, read-only для product / bridge / remote. Созданы только scratch snapshot, диагностические repro и этот отчёт. Публикация, merge и deploy не выполнялись.

Все номера строк ниже относятся к `fbaf15f`; пути — относительно корня репозитория, если не указано иное.

## Findings

### R1-F1 — прежний запрос другой карты побеждает более поздний Back

- **R1-F1** [P1] `products/sprintique/web/maps-task-context.js:83` — `openRoute()` не отменяет прежнее открытие карты при переходе к уже текущей карте и не проверяет актуальность intent после `await maps.openMap()` на строках 86–89.
  **Сценарий:** открыта A; браузер переходит на `#maps/B/task/T1`; чтение B задерживается. Пока текущая карта ещё A, пользователь нажимает Back к `#maps/A`. Новый `openRoute(A)` отменяет только Task read, не pending `MapsFeature.openMap(B)`. B затем загружается, меняет текущую карту и адрес, а продолжение старого `openRoute` открывает T1.
  **Ожидание:** остаётся исходный живой A без Task; поздний результат B не влияет на видимый контекст.
  **Наблюдение Node:** `{"map":"B","task":"T1","hash":"#maps/B/task/T1"}`.
  **Причина:** Task `generation` в host не ограждает загрузку Maps; `MapsFeature.mapGeneration` меняется только при другом `openMap` (`ui/src/maps.js:85–99`). Переход обратно к текущей A обходит этот вызов. Поздний `openMap(B)` потому считается актуальным, а старый route continuation запускает новый, формально актуальный Task intent.
  **Вред:** Back отменяет прежний выбор лишь на время. Поздняя загрузка заменяет карту и открывает уже отменённую задачу; реальный `buildBoard()` при этом пересоздаёт поверхность B (`ui/src/maps.js:95–103`). Это нарушает A1/A2.
  **Воспроизведение:** `R1-F1` в `tests/maps-task-review-r1-repro.test.mjs` внутри frozen snapshot. Исполняются настоящий `createMapsTaskContext` и настоящий `MapsFeature.prototype.openMap`; repository read удерживается, DOM painting заглушён. Тест падает на проверке `current.id === 'A'`. Native browser и физическое сохранение viewport этим probe не измерялись.
  **Действие:** сделать отмену/актуальность общими для всего route intent, включая ожидание карты и продолжение после него. Более новый переход к уже текущей карте должен отменять загрузку другой карты, а устаревшее продолжение не должно писать URL или открывать Task. Один check только после `openMap` недостаточен, если к этому моменту Maps уже поменяла current/board.
  **Приёмка исправления:** задержать B, перейти обратно к A, доставить B последней; A/viewport/selection/inspector остаются теми же, ни B, ни T1 не появляются. Повторить, когда более новый intent открывает другую Task на A.
  **Решение:** [open]

### R1-F2 — отказ map guard возвращает URL уже закрытой Task

- **R1-F2** [P1] `products/sprintique/web/maps-task-context.js:96` — новый двухступенчатый `closeTask()` несовместим с сохранением старого `restoreHash` в shell (`web/main.js:253–255`; аналогичный путь canonical Task — строка 307).
  **Сценарий:** из A открыта T1. Закрытие T1 разрешено, но карта содержит изменение, которое её guard отказывается отпускать, например после неудавшегося сохранения. Пользователь выбирает Planning или другой раздел. Shell запоминает `#maps/A/task/T1`; `closeTask()` закрывает Task, получает `false` от `maps.readyToLeave()` и записывает правильный `#maps/A`. Затем `navigate()` восстанавливает заранее запомненный `#maps/A/task/T1`.
  **Ожидание:** после принятого закрытия Task и отказа карты URL соответствует оставшейся карте A. Если выбран иной продуктовый контракт, необходимо согласованно оставить и сам drawer, и его URL.
  **Наблюдение Node:** `{"task":null,"hash":"#maps/A/task/T1","retained":"#maps/A"}`.
  **Причина:** shell считает отказ навигации отсутствием любых изменений текущего состояния. В новом host отказ второй стадии может происходить уже после принятого закрытия первой. Комментарий на строке 99 о том, что закрытая Task не воскресает, соблюдается внутри host, но shell возвращает её адрес поверх этого результата. `replaceState` не создаёт `hashchange`, поэтому drawer при этом не открывается.
  **Вред:** адрес/видимый контекст расходятся; копирование адреса, reload и следующие Back/Forward обещают Task, которой сейчас нет. Нарушены A1/A2.
  **Воспроизведение:** `R1-F2` в том же repro. Исполняются frozen controller и извлечённый без правок настоящий `navigate()` из `web/main.js`; `showProject` ограничен соответствующим вызовом controller guard. Проверка `location.hash === context.routeHash` падает.
  **Действие:** после отказа guard восстанавливать фактический оставшийся маршрут владельца, учитывая частично завершённое закрытие; проверить оба места восстановления, включая canonical Task hash handler. Не возвращать заранее сохранённый адрес закрытого drawer.
  **Приёмка исправления:** Task-close принят / map-leave отказан при section navigation и при переходе к canonical Task URL; фактический drawer, `routeHash`, `location.hash` согласованы; ввод карты сохранён. Отдельно сохранить текущий сценарий отказа самой Task.
  **Решение:** [open]

### R1-F3 — initial mount открывает Task из уже оставленного URL

- **R1-F3** [P1] `products/sprintique/web/maps-host.js:7` — `initialHash` удерживается через асинхронный mount и без проверки текущего route используется на строке 18.
  **Сценарий:** начинается загрузка contextual URL `#maps/A/task/T1`; список/чтение карты задержаны. До окончания mount пользователь возвращается к `#maps/A`. Во время `showProject()` новый host ещё не присвоен `board`, а `navigate()` игнорирует событие при `navigating=true` (`web/main.js:176,226,251,307`). После завершения mount `onOpenMap` сохраняет уже новый map-only адрес, но затем строка 18 вызывает `host.openRoute(initialHash)` и открывает T1 из прежнего адреса.
  **Ожидание:** отменённая Task не появляется после позднего initial read; итог соответствует последнему намерению пользователя.
  **Наблюдение Node:** `{"task":"T1","hash":"#maps/A/task/T1","opened":["T1"]}` после изменения route на `#maps/A` до завершения mount.
  **Причина:** current identity карты проверяется, актуальность исходного route — нет. Task generation создаётся только после map mount и потому не знает об отмене, произошедшей во время загрузки карты. Замена адреса из `onOpenMap` через `replaceState` не уведомляет host отдельным событием.
  **Вред:** поздняя initial загрузка самопроизвольно восстанавливает оставленный drawer. Нарушен A2; корректные проверки отмены уже начатого Task read этот путь не покрывают.
  **Воспроизведение:** `R1-F3` в том же repro. Исполняется настоящий frozen `mountMapsHost` с injected delayed map mount и настоящий `createMapsTaskContext`; `openTaskDialog` заменён минимальным контроллером, сетевой и browser runtime отсутствуют. Тест падает на ожидаемом отсутствии Task. Поведение shell при initial mount дополнительно прослежено по указанным строкам, не объявляется native-browser проверкой.
  **Действие:** согласовывать начальный контекст с последним принятым route intent после mount и обеспечивать передачу намерений, пришедших во время загрузки. Не открывать безусловно сохранённый `initialHash`; одновременно учесть возможную нормализацию URL самим `onOpenMap`.
  **Приёмка исправления:** direct contextual URL → задержка map read → Back/map-only route → завершение reads; не появляется Task и не возвращается старый URL. Проверить также новый contextual target, пришедший во время mount, и успешный неизменённый direct link.
  **Решение:** [open]

### R1-F4 — ошибка открытия связанной Task подавляется уже уничтоженным drawer

- **R1-F4** [P1] `products/sprintique/web/maps-task-context.js:55` — callback связанных Task возвращает rejected promise после закрытия прежней Task (строки 44, 50, 75–77), а единственный обработчик ошибки принадлежит уже уничтоженному Task links view.
  **Сценарий:** открытая из Maps T1 показывает связь с T2 из загруженного task context. T2 стала недоступной; её новый read возвращает 404/null. Нажатие связи сначала закрывает T1, затем читает T2. `ProductRepository.read()` превращает 404 в `null` (`web/repository.js:158–164`); новый host выбрасывает «Задача недоступна…». Но `mountTaskLinks` ловит ошибку в `.catch(fail)` (`ui/src/board/link-view.js:66`), а `fail` работает только пока `closed === false` (строка 47). `iq-close` T1 уже вызвал `links.destroy()` (`task-dialog.js:472–474`), выставив `closed=true` (`link-view.js:85`).
  **Ожидание:** человек видит причину отказа в существующей поверхности и может продолжить/повторить действие; предпочтительно сохранить T1, пока следующая Task не прочитана/не готова.
  **Наблюдение отдельного Node probe:** после нажатия связанной Task `currentTask=null`, `hash=#maps/A`, `errorVisible=false`; порядок: `read:t1 → close:t1 → unsubscribe:links → read:t2`. Открытие пропадает без объяснения.
  **Воспроизведение:** `node --experimental-vm-modules tests/maps-task-links-review-r1-repro.mjs` в frozen product. Probe подготовлен узким read-only subagent, затем его код прочитан и команда отдельно выполнена основным ревьюером R1. Exit 0 означает `CONFIRMED_SILENT_LINK_FAILURE` в двух случаях: missing target и HTTP-503-like read error. Probe проверяет SHA исходников и исполняет immutable `createMapsTaskContext` и действующий `mountTaskLinks`; unrelated UI imports и Task `iq-close` lifecycle синтетические, соответствуют указанному cleanup исходнику. Это не native-browser assertion.
  **Уточнение:** основное воспроизведение — missing target/404. При сетевом fetch rejection отдельно может появиться общая индикация соединения (`ui/src/action-feedback.js:7–14`), поэтому отчёт не утверждает, что любая offline-индикация отсутствует. Именно объяснение отказа навигации в Task теряется. Promise уже пойман, поэтому global `unhandledrejection` этот случай не исправляет.
  **Сравнение с base:** до WP01 переход из Maps открывал Board; Board сначала читает/проверяет следующую Task и только затем закрывает/заменяет текущую (`ui/src/board/board.js:199–205`), а ошибка имеет устойчивую поверхность отображения.
  **Действие:** сохранить error sink, переживающий закрытие предыдущей Task, либо оставить текущий drawer до успешной подготовки следующего. Для Task links нельзя полагаться на catch в уничтожаемой форме.
  **Приёмка исправления:** linked T2 возвращает null/404 и отдельно ошибку support-loading; сообщение доступно, исходный контекст предсказуем, URL согласован, нет необработанного rejection; успешная цепочка и отказ dirty-close продолжают работать.
  **Решение:** [open]

## Команды и фактические результаты

Рабочий каталог исполнения:

```text
/workspace/scratch/b3dac59f68e2/research/wp01/review-fbaf15f/products/sprintique
```

Node: `v24.19.0`. Для установленных зависимостей snapshot использует read-only ссылку на уже имеющийся `repo-maps/products/sprintique/node_modules`; новой установки зависимостей ревьюер не выполнял.

| Проверка, выполненная ревьюером | Результат |
|---|---|
| `node --test tests/maps-task-origin.test.mjs` | PASS: 10/10 |
| `node --import tsx --test tests/frontend-lifecycle.test.mjs tests/navigation-speed.test.mjs tests/work-model.test.mjs tests/page-surfaces.test.mjs` | PASS: 55/55 |
| `node --test tests/maps-task-review-r1-repro.test.mjs` | FAIL: 3/3; падения подтверждают R1-F1, R1-F2, R1-F3 |
| `node --experimental-vm-modules tests/maps-task-links-review-r1-repro.mjs` | CONFIRMED_SILENT_LINK_FAILURE: два случая; exit 0 проверяет наличие бага, не исправность продукта |
| Vendor `.52` из frozen commit: `git show fbaf15f:products/sprintique/vendor/iquipage-web-0.6.0-vnext.52.tgz | sha256sum` | SHA совпадает с указанным в пакете ревью |

`maps-task-review-r1-repro.test.mjs` — scratch-диагностика, не authored product patch. Тесты проверяют ожидаемое правильное поведение, поэтому их текущий FAIL является сохранённым доказательством дефектов, а не провалом настройки test runner.

## Почему текущие зелёные тесты пропускают дефекты

1. Новый fixture заменяет Maps и Task простыми объектами, а history traversal — своей синхронной очередью `openRoute`. Это полезно для отдельных controller-инвариантов, но не исполняет native `hashchange`, shell `navigate`, initial `navigating` phase и реальное уничтожение Task subviews.
2. Его `maps.openMap` заканчивается сразу. Существующий lifecycle test действительно проверяет два последовательных `MapsFeature.openMap` intent, однако новый переход к уже текущей карте второго `openMap` не вызывает. Поэтому оба слоя по отдельности зелёные, а композиция в R1-F1 проигрывает.
3. Тест отказа Maps guard вызывает `context.closeTask()` напрямую и потому не видит последующую запись старого `restoreHash` из shell. Test helper `retainedRouteHash` тоже не доказывает правильный момент его применения после частично принятого закрытия.
4. Initial tests проверяют `MapsFeature.loadInitial`, но не последующий безусловный `host.openRoute(initialHash)`. Task cancellation tests начинают отмену уже после создания host; фазу загрузки самой карты они пропускают.
5. Тест Task chain непосредственно ожидает `dialog.options.onOpenTask()`. Он не устанавливает настоящий `mountTaskLinks` и cleanup, поэтому уничтожение единственного места показа ошибки незаметно.

Сложность здесь определяется несколькими владельцами одного адреса и разных поколений read. Нужна согласованная передача intent между существующими слоями, без расширения scope до нового router. Дополнительные тесты должны проходить соответствующую границу владельцев, иначе новые булевы stub-проверки могут повторить ту же слепую зону.

## Что подтверждено и что не является finding

По source узкий подход сохраняет Maps owner при обычном открытии Task, использует существующий public Task dialog, сохраняет canonical `taskURL`, раздельно передаёт `tasks.write` и `project.settings`, не меняет backend/DS/schema. Контроллерные happy path, вкладки, обычные Back/Forward, отказ самой Task, late Task read и missing initial map проходят перечисленные Node проверки. Эти результаты ограничены их assertions.

Проверена гипотеза об инвалидированном `isActive` после same-task route: в текущем `task-dialog.js` этот callback читается только перед initial mount (строка 40); дальнейшие save/listener paths его не используют. Поэтому само увеличение generation в fast path не объявлено отдельным post-mount дефектом без достижимого отказа.

Отличия Task link handoff от Board — отсутствие `backTo/onBack`, сохранения fullscreen и `replace` — замечены по source, но не объявлены дополнительным блокером: ADR явно выбирает одну history step и возврат к карте; отдельного доказательства нарушения утверждённого сценария в этом ревью нет. Это не означает runtime-приёмку данных деталей.

## Итог

- **Вердикт:** changes-requested.
- **Открыто:** четыре P1: R1-F1, R1-F2, R1-F3, R1-F4. Исправления принадлежат автору; в immutable patch ничего не исправлено.
- **Проверено:** полный узкий diff WP01; Task route/dialog/links lifecycle; Maps open/read/guard lifecycle; shell mount/hash/navigation boundaries; 65 исходных Node checks; три дополнительные воспроизводимые проверки границ; отдельный read-only probe Task-link error; SHA pinned vendor.
- **Не проверено:** native browser Back/Forward и animation/focus/viewport render, визуальная матрица тем/размеров, production acceptance, полный `npm run build`, backend/JDK25/PostgreSQL18, deploy. Browser harness на момент заморозки отсутствовал; ограничения compiler/backend из пакета автора не переименованы в PASS и не переиспытаны без причины. Уже объявленный pending browser сам по себе новым finding не считается.
- **Дальше:** исправить четыре root cause, сохранить воспроизведения как meaningful regression coverage, выполнить planned real synthetic browser path и передать новый immutable patch свежему независимому R2. Закрытие R1-F1–F4 требует доказательства на исправленном source; прежние зелёные 65 checks этого не заменяют.
