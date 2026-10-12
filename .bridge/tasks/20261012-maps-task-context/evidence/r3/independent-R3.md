# Независимый follow-up R3 — исправления R2 для WP01 Maps → Task

**Вердикт: changes-requested для immutable patch `d93912d119bfeeee176dafbff789dbbfba6f0ebddb227f6596cbed3dcdf1f2e4` поверх `7068d1089b4951c80b8fec73c825d88bb1aad608`.** Пять исходных воспроизведений R2 теперь проходят. Подтверждён один новый **P1, R3-F1**: более ранний отказ Map guard стирает последний native route до его replay, поскольку shell сохраняет в очереди только boolean. Это отдельный дефект композиции исправленного shell и существующего Maps guard. Browser/visual acceptance нового runtime этим отчётом не заявлена.

## Основа, независимость и границы

- Ревьюер — `maps_review_r2`, GPT-6 Astra, не автор runtime или его regression suite. Это независимый от автора follow-up тем же ревьюером после R2, а не заявка на ещё один свежий независимый раунд с чистой историей.
- Задание — проверить устранение R2-F1/F2/F3, initial Task await и route ownership, восстановление contextual Task после настоящего initial-map retry, сохранение dirty guard после неудачного reload и accepted `keepOpen`, а также новые достижимые гонки shell.
- Base commit: `7068d1089b4951c80b8fec73c825d88bb1aad608`; base tree: `0a34e4399b1d5a6acb9018ebd2746a02b10f48e1`.
- Проверяемый artifact: `/workspace/scratch/b3dac59f68e2/research/wp01/r2-runtime-candidate.patch`; SHA-256: `d93912d119bfeeee176dafbff789dbbfba6f0ebddb227f6596cbed3dcdf1f2e4`. Ревьюер самостоятельно проверил hash, извлёк base через `git archive`, применил этот patch и проверял полученный snapshot: `/workspace/scratch/b3dac59f68e2/research/wp01/review-r3-d93912d1`.
- Patch меняет четыре runtime-файла: shell `web/main.js`, host `web/maps-host.js`, contextual controller `web/maps-task-context.js` и общий `ui/src/board/task-dialog.js`. Изменяемый checkout автора не использован как источник frozen verdict. Подключена имеющаяся `node_modules`; установки зависимостей не было.
- Продолжены правила уже прочитанных root/product AGENTS, engineering workflow/review и локального `iquipage-review`, включая его execution-contract, quality-method и design-review. Исходный отчёт R2 и его доказательства сохранены без изменений.
- Targeted plan записан до проверок: `/workspace/scratch/b3dac59f68e2/research/wp01/r3-targeted-plan.json`, SHA-256 `2ed4716be635d1ec269bebb919529260625176967d57a3f935c641800846b697`.
- Product, bridge и remote для ревьюера остаются read-only. Созданы только scratch snapshot, независимые diagnostics, логи, план и этот отчёт. Ревьюер не выполнял backend, production, credential, publish, merge или deploy действий.

Все номера строк далее относятся к этому snapshot, пути — относительно его корня. Source-composition проверки в Node отделены от native browser evidence.

### Зафиксированные входы

| Source | SHA-256 |
| --- | --- |
| `products/sprintique/web/main.js` | `aa8a75ca12ae58bc098b7e3bcc38df4f6e22ac29a10f51e91fcc5da620c708ed` |
| `products/sprintique/web/maps-host.js` | `f6d657fa8f799455f1d6c24e01b6a57107d0765ad16cbcd867b01f16d8f5eaea` |
| `products/sprintique/web/maps-task-context.js` | `fbbdede95642a8087720fff7ae62c4bde7181e78f638a0353cbd07fed815d28d` |
| `products/sprintique/ui/src/board/task-dialog.js` | `7ee36bd4d07cd9c690ed89f2f097a9aa4a58aeca48a46d4ca879b09d73484bb7` |

## Подтверждённая находка

### R3-F1 [P1] — отказ старого Map guard стирает последний queued native route

**Локализация:** `products/sprintique/web/main.js:251,316,319`; взаимодействующий writer — `products/sprintique/web/maps-task-context.js:114–118`.

Shell теперь замечает native `hashchange` во время `showProject`, увеличивает `routeVersion`, ставит `pendingHashRoute=true` и вызывает доступный `cancelRoute`. После завершения текущего `showProject` он вызывает `applyHashRoute`. Однако сама очередь не хранит hash и history state нового перехода. `applyHashRoute` читает текущее `location.hash`, которое к этому моменту успевает изменить ещё выполняющийся guard старого перехода.

**Достижимый порядок событий:**

1. Открыта карта A и contextual Task T1, адрес `#maps/A/task/T1`.
2. Native hash меняется на canonical `#/task/T2`. Настоящий `applyHashRoute` начинает `showProject(..., 'tasks')` и вызывает `board.closeTask()`.
3. T1 разрешает закрытие. Context закрывает Task и ждёт `maps.readyToLeave()`. Асинхронный Map guard может ожидать завершения редактора или сохранения; такой await и его отказ являются штатным контрактом Maps, а не придуманным исключением.
4. Пока Map guard ожидается, пользователь выполняет native Back к `#maps/A/task/T1`. Новый адрес остаётся внутри уже открытой карты. Настоящий shell handler фиксирует `routeVersion=2`, `pendingHashRoute=true`.
5. Прежний Map guard возвращает `false`. Существующий `closeTask` корректно для своего завершившегося шага пишет map-only `#maps/A`: прежняя T1 уже закрыта. Эта запись одновременно уничтожает единственную доступную копию нового native target.
6. `showProject` доходит до `finally`, сбрасывает boolean и вызывает `applyHashRoute`, который получает уже `#maps/A`. T1 не открывается. Версионный fence останавливает последующую запись старого canonical handler, но потерянный адрес он восстановить не может.

**Ожидается:** последняя цель `#maps/A/task/T1` обрабатывается после старого guard. Она не требует оставлять A, поэтому отказ именно старого перехода к Board не должен отменять возвращение в contextual Task на A. Собственные guards актуального перехода при этом сохраняют право на отказ.

**Фактически, из независимого исполнения:**

```json
{
  "task": null,
  "hash": "#maps/A",
  "reads": ["T1"],
  "writes": ["#maps/A/task/T1", "#maps/A", "#maps/A"],
  "shell": {
    "navigating": false,
    "routeVersion": 2,
    "pendingHashRoute": false,
    "viewMode": "maps"
  },
  "errors": []
}
```

Второго чтения T1 нет; runner и source не падают с исключением. Падает assertion ожидаемого правильного поведения: `currentTask()` возвращает `null` вместо `T1`. Пользовательский Back теряется без объяснения, адрес переписывается старым действием. Это нарушение latest-intent ownership на обычной async-границе, **P1**. Утверждения о повреждении сохранённых данных здесь нет.

**Воспроизведение:** `/workspace/scratch/b3dac59f68e2/research/wp01/maps-task-review-r3-repro.test.mjs`, один тест `R3-F1`. Исполнены дословные тела настоящих `showProject`, `navigate`, `hashchange` handler и `applyHashRoute` из frozen `main.js`, настоящий `createMapsTaskContext` и настоящие route parsers. Диагностические doubles ограничены browser event delivery, history/DOM оболочкой, repository и ожидаемым Map guard. Task — минимальный EventTarget с разрешённым закрытием. Реальные shell или contextual route decisions тестом не подменены. Это source-composition evidence, не native browser traversal.

**Направление исправления:** хранить latest pending route как собственное значение, включая hash, history state и version, и передавать именно этот intent после завершения старого `showProject`. Старый guard может восстанавливать маршрут своего оставшегося UI, но не должен уничтожать более новый queued target. Replay должен проверять актуальность target и оставлять штатные guards включёнными. Одного нового version fence или повторного чтения `location.hash` недостаточно.

**Приёмочный regression:** задержать section-leave на Map guard после разрешённого закрытия source Task, подать более новый contextual route с отдельным history state, отказать старому guard. Проверить восстановление ровно последнего hash/state и открытие его Task при сохранении карты A; проверить, что старое canonical продолжение ничего не переписывает. Отдельно не путать этот сценарий с отказом dirty guard ещё живой Task: актуальный переход обязан уважать такой отказ. Native case должен дойти до shell, поскольку изолированный host fixture shell queue не исполняет.

**Статус в данном artifact: open.** Автор получил finding и принял его. Работа над последующим исправлением не меняет frozen verdict `d939…`; её результат требует отдельного follow-up.

## Повторная проверка R2

Оригинальные R2 diagnostics не изменены. Для нового source создан отдельный `/workspace/scratch/b3dac59f68e2/research/wp01/maps-task-r2-regressions-on-r3.test.mjs`. Исходные пять assertions ожидаемого поведения сохранены. Harness адаптирован к новой API-обвязке: источник читается из R3 snapshot, доступен EventTarget `window`, доставляется настоящий `hashchange` listener, заданы новые shell переменные, учитывается асинхронное планирование reload callback, а визуальный `showState` имеет наблюдательный sink. Исправления продукта тест не имитирует.

| Замечание / assertion R2 | Результат на R3 | Наблюдение |
| --- | --- | --- |
| R2-F1: pending initial T1 → новый `#maps/A` | **PASS** | `task=null`, URL map-only, `opened=[]`; старый T1 не открывается. |
| R2-F1: pending initial T1 → новый `#maps/A/task/T2/work` | **PASS** | `task=T2`, точный новый URL, `opened=[T2]`. |
| R2-F1: pending initial T1 → canonical `#/task/T2` | **PASS в исходном объёме assertion** | Canonical URL сохранён, Maps Task не открыт. Этот тест не утверждает, что полноценный Board с canonical T2 уже смонтирован. |
| R2-F2: ошибка initial map load → настоящий successful retry | **PASS** | Исполнены реальные Maps loadInitial/reloadList/openMap; после retry открыты A и T1, hash contextual, один Task read T1. |
| R2-F3: reload failed, затем новый комментарий и отказ Close | **PASS** | `dirty=true`, `accepted=false`, форма остаётся подключённой, confirmation вызвана один раз; currentTask и hash остаются T1. Negative control до reload также проходит. |

**Итого: PASS 5/5, 0 skipped/cancelled.** Соответствующие исходные воспроизведения R2 закрыты в проверенном source scope. Полную навигационную границу считать исправленной пока нельзя из-за отдельного R3-F1.

### Почему изменения исправляют проверенные причины

`maps-host.js:9–10,29–37` теперь слушает native hash на всё время async mount, отменяет незавершённый contextual read и перечитывает актуальный route после его завершения. В `maps-task-context.js` fromRoute-запрос дополнительно проверяет сохранённый `requestedHash` в `active()`. Это закрывает прежний период между завершением Maps mount и возвратом host после первой Task: потерявший актуальность read не может открыть старый drawer только потому, что shell ещё не получил host.

`maps-host.js:21–25,32` сохраняет contextual initial intent при отсутствии карты после initial error. Настоящий `onOpenMap` успешного retry узнаёт тот же pending route и снова вызывает `host.openRoute`. Решение проверено через настоящий путь загрузки Maps, а не через подставленный `onOpenMap` callback.

`task-dialog.js:433–436` больше не выставляет глобальный `discarded=true` перед асинхронным `onReload`. Ошибка callback возвращается в доступный `showState` с reload action. Поэтому сохранённая после failure форма продолжает учитывать ввод, созданный после попытки обновления. В `close({keepOpen:true})` результат подтверждения отделён в локальный `accepted`; `discarded` выставляется только вместе с фактическим закрытием при `!keepOpen` (`448–461`). По source это также устраняет прежнюю возможность оставить живую форму с выключенным guard, если replacement отменён после accepted keepOpen.

Последний вывод об accepted keepOpen и cancellation основан на чтении настоящего исходного кода и передаче управления `beforeOpen`/`replace`. В этом follow-up не исполнялся самостоятельный browser matrix для каждого null/support/cancel варианта и нового ввода во время каждого await. Его нельзя выдавать за дополнительное число прошедших тестов. Общий Board использует изменённый Task close/reload, поэтому targeted source review не означает принятия всех Board/Planning/Workbench потоков.

## Выполненные проверки и ограничения

| Проверка | Фактический результат и источник |
| --- | --- |
| `node --test maps-task-r2-regressions-on-r3.test.mjs`, cwd `research/wp01` | Независимо **PASS 5/5**, raw log `r3-r2-regressions.log`. |
| `node --test maps-task-review-r3-repro.test.mjs`, тот же cwd | Независимо **FAIL 1/1**, child Node exit **1**; raw log `r3-independent-regression.log`. Это подтверждённый R3-F1, а не ошибка bootstrap. |
| `npm run check:boundaries`, frozen R3 product | Независимо **PASS**, включая styles и product/public boundary checks. |
| Vite 323 modules для candidate | **Сообщено автором**, не отдельный независимый запуск R3. |
| Авторские новые R2/R3 regression tests | На момент этого frozen review не были переданы как проверенный immutable suite; к результатам R3 не приписаны. Последующие commits и их PASS не меняют этот отчёт. |
| Полный `npm run build` и полный integration/server suite | В R3 **NOT_RUN**. Известные прежние ограничения локального TypeScript/build окружения этим follow-up не переопределены. |
| Native browser именно для patch `d939…` и найденной shell race | **NOT_RUN**. Нет новой native приёмки reload/mount-recovery/shell queue на данном runtime. |
| Visual inspection нового runtime | **NOT_RUN**. Полная UI-приёмка не заявлена. |

Область patch ограничена четырьмя runtime-файлами; manifests, lock, vendor и public DS implementation не меняются этим patch. Ранее в независимом R2 были подтверждены pinned `@iquipage/ds` `0.6.0-vnext.52`, archive SHA-256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758` и совпадение всех 176 обычных файлов установленного DS с archive. В R3 это ссылка на прежнее доказательство, а не повторная полная vendor-проверка. Результат boundaries подтверждает область импортов; он не заменяет проверку поведения общего Task.

### Что действительно подтверждает имеющийся native artifact

Ревьюер лично прочитал `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38209868579/results.json`. Он относится к **старому runtime 7068 до проверяемых исправлений**, checked merge `384ddd0dd2c48dd9b1ddd039d266ca9a87cefaa2`, run `38209868579`, job `114681412661`. JSON фиксирует Browser `151.0.7922.34`, четыре PASS profile: desktop-light, desktop-dark, narrow-light, narrow-dark; `pageErrors=[]`, `externalRequests=[]`, `peakOpenTaskDialogs=1`.

В его scope входят изолированные реальные host/whiteboard/Task, inspector open, contextual tab, Close/Escape/native Back/Forward. Desktop-light дополнительно содержит missing/support linked-task recovery с сохранённой source Task, успешную связь к T2, отмену delayed replacement и refusal настоящего comment draft guard. Это полезное свидетельство уже существующих основ потока. Сам JSON прямо исключает main.js/bootstrap/backend/persistence/grants. Значит, он не исполняет shell очередь из R3-F1 и не доказывает новые R2 reload/initial-mount исправления.

Artifact ID `11728982348`; SHA-256 zip `62e7f4b5043a27a0d3c94568c6d1b5a9e3cf8d3db32dfd7cf5c76b99fe4b7b98` сообщил и проверил parent. Ревьюер самостоятельно прочитал JSON, но повторно не хешировал zip и не осматривал PNG frames. Визуального вердикта из наличия PNG или статуса JSON не выводится. Old native PASS не переносится на patch `d939…`.

## Передача на следующий шаг

Для `d939…` необходим отдельный fix R3-F1 с immutable source и тестом, сохраняющим последний hash/state через отказ старого guard. Повторный review может быть узким: exact queue delta и это воспроизведение, с проверкой сохранения действующих guards. Он должен оформляться отдельно и не переписывать этот changes-requested verdict. Новое native evidence требуется оценить по его фактическому source revision и выполняемым сценариям; отдельный host fixture не закрывает full-shell route race.

Оригинальный `/workspace/scratch/b3dac59f68e2/research/wp01/independent-R2.md` остаётся неизменным. Созданные R3 source diagnostics и raw logs доступны рядом с настоящим отчётом и фиксируют один открытый P1 при пяти исправленных исходных assertions R2.
