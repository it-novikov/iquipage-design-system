# Независимый follow-up R4 — queue fix и новое native evidence WP01

**Вердикт: changes-requested для `e1e33787f3b13f64b87e68ff5687ddd525421a3a`, tree `adb0814a7ff0c2cd19b0baf0cb58d33766989ff5`.** Прежний **P1 R3-F1 закрыт** независимым воспроизведением с точным hash/history state. Новое браузерное evidence выявило **R4-F1 [P2]**: contextual URL `/work` после восстановления открывает правильную Task, но визуально оставляет вкладку «Задача». Native runner объявляет PASS, потому что в этом пути не проверяет реально выбранную вкладку и видимую panel. Этот дефект не вызван новой queue delta; он обнаружен в существующем WP01 Task adapter при проверке свежих кадров.

## Основа и рамки

- Ревьюер: независимый от автора агент `maps_review_r2`, GPT-6 Astra; продолжение targeted follow-up R3. Ревьюер не изменял product, bridge, remote или авторские tests.
- Commit самостоятельно проверен через `git rev-parse`, извлечён через `git archive` в `/workspace/scratch/b3dac59f68e2/research/wp01/review-r4-e1e33787`. Исполнялся frozen source, не mutable checkout автора. `node_modules` подключена к имеющимся установленным зависимостям без новой установки.
- Первоначальная область R4 — исправление R3-F1 относительно immutable patch `d93912d119bfeeee176dafbff789dbbfba6f0ebddb227f6596cbed3dcdf1f2e4`. При передаче текущего native artifact область обоснованно дополнена проверкой его raw results и относящихся к исправлениям кадров. Parent отдельно подтвердил необходимость зафиксировать выявленный визуальный отказ как finding текущего frozen R4.
- Targeted plan записан до проверок: `/workspace/scratch/b3dac59f68e2/research/wp01/r4-targeted-plan.json`, SHA-256 `334febe5f240a11159510c7a0125f43e7b110badcc31002e780458d2a115a71f`.
- Опубликованный parent commit `1fe0d7e2a6ccf1af289a19b5491c1aabbd45ff8e` самостоятельно проверен по локальному git object: tree также `adb0814a7ff0c2cd19b0baf0cb58d33766989ff5`. Это byte-equivalent tree; основой настоящего отчёта остаётся e1e33787.
- Frozen R3 не пересмотрен задним числом: `/workspace/scratch/b3dac59f68e2/research/wp01/independent-R3.md`, SHA-256 `e29a81f9e8afddf328b241a96c396ef12fec59bb362914d33454d9031e5a1d94`, сохраняет changes-requested для прежнего patch. Исходный R2 также остаётся неизменным.

### Runtime provenance

| Source | SHA-256 e1e33787 | Отличие от frozen R3 |
| --- | --- | --- |
| `products/sprintique/web/main.js` | `7f31cfb05b11b8b43c5edec144d5fc34c115889068ab9c426dfc4ad2ef37d2aa` | Только targeted queue correction: pending object и replay точного target. |
| `products/sprintique/web/maps-host.js` | `f6d657fa8f799455f1d6c24e01b6a57107d0765ad16cbcd867b01f16d8f5eaea` | Побайтно без изменений. |
| `products/sprintique/web/maps-task-context.js` | `fbbdede95642a8087720fff7ae62c4bde7181e78f638a0353cbd07fed815d28d` | Побайтно без изменений. |
| `products/sprintique/ui/src/board/task-dialog.js` | `7ee36bd4d07cd9c690ed89f2f097a9aa4a58aeca48a46d4ca879b09d73484bb7` | Побайтно без изменений. |

Номера строк ниже относятся к e1e33787. Runtime проверки и browser evidence разделены по фактически исполняемым слоям.

## Закрытие R3-F1 [P1]

`main.js` теперь сохраняет во время `navigating` объект `{hash:location.hash,state:history.state,version:routeVersion}`. В `showProject.finally` этот объект снимается из очереди; если его version остаётся актуальной, shell восстанавливает сохранённые hash/state и только затем вызывает `applyHashRoute`. Последующий version fence старого navigation/canonical handler не позволяет ему переопределить новое действие.

Это исправляет исходную потерю intent: более ранний Maps `closeTask` по-прежнему вправе написать оставшийся map-only route после отказа Map guard, но больше не уничтожает единственную копию следующего native target. Изменение не ослабляет `Task.close`, `Maps.readyToLeave`, `beforeOpen` или их право на отказ.

Для независимого повторения создан `/workspace/scratch/b3dac59f68e2/research/wp01/maps-task-review-r4-repro.test.mjs`. Исходные assertions R3 о конечной Task и URL сохранены. Harness обновлён на новое представление queue и дополнен проверкой собственного вложенного history state. Реальные тела `showProject`, `navigate`, `hashchange`, `applyHashRoute`, contextual controller и route parsers извлекаются из e1. Исходный R3 diagnostic не изменён.

**Результат: PASS 1/1, child Node exit 0.** После закрытия T1, ожидания старого Map guard, нового Back к T1 и отказа прежнему section leave наблюдается:

```json
{
  "task": "T1",
  "hash": "#maps/A/task/T1",
  "state": {
    "latestNativeRoute": "return-to-T1",
    "nested": {"map": "A", "task": "T1"}
  },
  "reads": ["T1", "T1"],
  "shell": {
    "navigating": false,
    "routeVersion": 2,
    "pendingHashRoute": null,
    "viewMode": "maps"
  },
  "errors": []
}
```

Авторский regression `R3-F1: a refused older section leave cannot replace the queued Task route or its history state` также лично прочитан и независимо выполнен в frozen suite. Он исполняет actual shell bodies, проверяет identity прежнего map board/inspector, отсутствие canonical Task open и ровно один вызов старого Map guard. Это содержательная защита от исходного дефекта, а не проверка имени новой переменной.

**R3-F1 resolved в проверенном source scope.** Сам shell не входит в native fixture; утверждения о выполненном браузерном сценарии shell queue здесь нет.

## Открытая находка

### R4-F1 [P2] — contextual Work route меняет атрибут вкладки, но не её видимый panel

**Локализация:** `products/sprintique/ui/src/board/task-dialog.js:150,441–445`; supporting parser `ui/src/board/task-route.js:12` (`parseTaskSection`) и pinned DS `dist/modules/components.js:364–425` (`IqTabs`). Coverage gap: `tests/maps-task-browser.mjs:37–39,118–124`, fixture `tests/fixtures/maps-task-context/main.js:39`.

**Достижимый и наблюдённый сценарий:** начать initial contextual URL T1, задержать его Task read или support read, во время ожидания перейти к `#maps/map-a/task/MFX-102/work`, затем завершить старый read. Current runtime правильно отменяет T1 и открывает MFX-102 на прежней A. Однако видимый drawer остаётся в разделе «Задача» с полями статуса, исполнителя, срока, приоритета и описания, хотя адрес и атрибут tabs говорят `work`.

**Прямое visual evidence текущего runtime:**

- `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38210846541/initial-task-new-task-recovery.png`;
- `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38210846541/initial-support-new-task-recovery.png`.

Ревьюер лично осмотрел оба кадра. В них заголовок Task MFX-102, подчёркнута вкладка «Задача», видимы Task fields; раздел «Работа агента» не выбран. Оба raw result entry одновременно содержат точный hash `#maps/map-a/task/MFX-102/work` и `workTab="work"`. Кадры одинаковы побайтно, SHA-256 `43e959fe41005e1f97dde8ad69862ff03f30009f042c80cbb9113bf6053ab3b4`.

Это не заявлено как случайный кадр до завершения анимации. `waitTask` уже ждёт видимый native dialog и две `requestAnimationFrame`. Source объясняет устойчивое рассогласование:

1. В markup `iq-tabs` получает `value="${parseTaskSection(location.hash)}"`. Этот parser умеет canonical `#/task/.../work`; для contextual `#maps/.../task/.../work` он возвращает `task`.
2. Настоящий `IqTabs.mount()` синхронно активирует initial `value`, выставляет tab `aria-selected`, `active` и panel `hidden`. Поэтому при подключении drawer выбирается Task.
3. Позже product `setSection(initialSection)` пишет лишь `tabs.setAttribute('value',next)` и обновляет footer. У `IqTabs` и его `IqElement` нет value attribute observer; смена атрибута не вызывает `activate` и не меняет selected tab/panel. Штатная активация вызывается из mount, click или keyboard.
4. Fixture `inspect().workTab` читает ровно этот атрибут. Recovery runner проверяет task identity, URL и map, но не `aria-selected` и не видимость Work panel. Его PASS не доказывает соответствие видимого раздела адресу.

Использован именно pinned `@iquipage/web` `0.6.0-vnext.52`, archive SHA-256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`. Ревьюер отдельно сравнил прочитанный installed `dist/modules/components.js` с одноимённым member tarball: они побайтно одинаковы, SHA-256 `5d1c0798227f4960ea495c2770cf099d3836a5782c8965af6a9ee5f88ad586a1`. Вывод не основан на другой версии DS или предположении о его API.

**Влияние:** contextual `/work` и программное восстановление section показывают не обещанный раздел. Пользователь должен снова вручную выбрать «Работа агента»; адрес не отражает фактический экран. Это **P2**, подтверждённая функциональная ошибка выбора tab, а не потеря сохранённых данных и не полный отказ Task. Manual click Work работает: отдельно осмотренный `desktop-light-work-tab.png` показывает правильный Work panel и выбранную «Работа агента». Поэтому различие между clicked и restored путём существенно. Аналогичный риск native Forward и same-Task section restoration следует из общего `setSection` пути; отдельного кадра именно для этих переходов текущий artifact не предоставляет.

**Исправление:** initial markup должен получать уже разрешённый `initialSection`. Последующая смена section должна использовать действительную штатную активацию существующей вкладки, доступную через поддерживаемый public contract, с корректным подавлением побочных route writes во время внутренней синхронизации. Изменять pinned DS package или обращаться к закрытому внутреннему `activate` для этого не требуется.

**Приёмка:** для initial contextual `/work`, смены route во время Task/support await, native Forward в `/work` и same-Task section route проверить одновременно точный URL, правильную Task, `[data-tab="work"][aria-selected="true"]`, реально видимый `[data-panel="work"]`, скрытый Task panel и ожидаемый Work content. Для возврата в Task проверить обратное состояние. Снимки делать после этих assertions. Проверка только `value` или Task ID оставляет этот дефект незамеченным.

**Статус: open для e1e33787.** Parent получил source/visual evidence и подтвердил finding. Обновление validator или runtime после e1 оценивается отдельным follow-up; настоящий frozen verdict не будет переписан.

## Что подтверждено тестами

| Проверка | Результат и граница |
| --- | --- |
| Independent R3-F1 reproduction на e1 | **PASS 1/1**, exact target hash/state, source-composition Node. Log `r4-independent-regression.log`. |
| `node --import tsx --test --test-concurrency=1 tests/maps-task-origin.test.mjs` в frozen product | Независимо **PASS 42/42**, 0 skipped/cancelled. Log `r4-maps-task-origin.log`. |
| R2 Task-read и support-read initial await | В 42 входят 8 cases для map-only, новой Task, новой Task Work и canonical Task через actual shell. Эти source assertions проходят; DOM doubles не проверяют настоящий DS tab rendering. |
| R2 actual initial retry | В 42 входят четыре cases list/map-read retry × Task/Work deep link. Task/route recovery проходит; R4-F1 отдельно ограничивает принятие видимой Work вкладки. |
| R2 reload guard | В 42 входят read-error, null, support-error, support-cancel и superseded accepted-keepOpen. Проверяется новый comment, отказ Close и последующее явно разрешённое закрытие. Все проходят. |
| Native текущего runtime | Raw runner status **PASS** для четырёх profiles и пяти mountRecovery, но два Work recovery frames подтверждают **R4-F1**. PASS корректен только относительно написанных assertions, не как полная UI-приёмка. |
| Полная сборка, backend/grants/integration и полный shell в браузере | В узком R4 **NOT_RUN**. Независимо повторять все 97 общих tests или весь build для одной queue delta не требовалось; их авторский результат не выдан за собственный запуск. |

Смысл исходных R2 findings сохранён: stale T1 больше не побеждает новый intent, retry действительно открывает Task, живой drawer после failed reload защищает последующий ввод. Последующие authored tests расширяют source coverage на support/cancel/keepOpen, а свежий native run подтверждает реальные failed-read/reload paths. Видимая Work-вкладка остаётся отдельной незакрытой функциональной границей.

## Точное происхождение нового native evidence

Ревьюер лично прочитал `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38210846541/results.json`, SHA-256 `6642b799b12abc78f698a485f9a3174e8193891a73b946129499941bf9ff84c2`.

- Run `38210846541`, job `114684421451`, checked merge `aac5f0927fa1c278668af1ff620c7d9c6f01720b`; parent передал его для tree-equivalent published `1fe0d7e2…`.
- Самостоятельно пересчитаны **все 10 sourceSHA256** из JSON по frozen e1: Maps host/context/route, Maps module, Task dialog, Task link view, два CSS и два fixture module — **10/10 совпадают**. `main.js` в browser fixture не исполняется и в этом digest list отсутствует; shell proof остаётся source-based.
- Browser `151.0.7922.34`, four profiles desktop-light / desktop-dark / narrow-light / narrow-dark; `peakOpenTaskDialogs=1` у каждого. `pageErrors=[]`, `externalRequests=[]`, fixture contracts PASS с `readProjectContext`.
- Five recovery entries: initial-map retry, initial-task → map, initial-task → MFX-102 Work, initial-support → map, initial-support → MFX-102 Work. Task identity/map/hash соответствуют targets; для двух Work entries visual result не соответствует section, как описано выше.
- Deep desktop-light содержит два настоящих conflict/reload failures: Task read и support read. Ошибки вызываются synthetic repository без записи; проверены ровно две `synthetic-conflict-no-write` attempts. Runner редактирует настоящий title, получает настоящий conflict/reload UI, выполняет Reload, восстанавливает прежний title и вводит новый comment. Native Back вызывает настоящий discard confirmation, refusal сохраняет draft. Это не вручную нарисованный error state.
- Ревьюер лично осмотрел `desktop-light-reload-task-read-draft.png` и `desktop-light-reload-support-read-draft.png`: T1 остаётся открытой, новый comment читается в composer, доступны ошибка обновления и действие «Загрузить актуальную версию»; на фоне остаётся A. Также осмотрены initial-map retry, два Work recovery и clicked desktop Work frames. Полная оценка всех dark/narrow screenshots этим follow-up не заявлена.
- Zip SHA-256 `22200d381480ae27a5e45e827ab8c1b2b0872ea6026c7a5a533f2270a6a5894c` сообщил и проверил parent. Ревьюер самостоятельно проверил JSON, соответствие source digests и указанные image hashes; zip повторно не хешировал.

Native source scope явно ограничен изолированными actual host/whiteboard/Task с synthetic reads; main.js/bootstrap/backend/persistence/grants исключены. Текущий run не смешан с прежним `38209868579`. Проверка source/DS/frame атрибуции сохранена в `/workspace/scratch/b3dac59f68e2/research/wp01/r4-native-evidence-validation.json`.

Уточнение имени зависимости: фактическое название package — **`@iquipage/web`**, подтверждено manifest и pinned archive. Упоминание `@iquipage/ds` в одном абзаце frozen R3 является ошибкой названия в тексте отчёта; version, archive SHA и проверяемые исходники там указаны для того же `@iquipage/web`. Для сохранения immutable R3 это уточнение дано здесь, без изменения его файла или verdict.

## Следующий необходимый шаг

Усилить native assertions на реальный selected tab/panel, исправить product tab synchronization с текущим public DS и проверить frozen исправление. Существующие R2/R3 reports и их неуспешные первоначальные результаты сохраняются; R3-F1 закрыт в настоящем R4, а R4-F1 требует отдельного подтверждённого решения. Никаких разрешений на merge/deploy или полной UI/backend acceptance этот отчёт не выдаёт.
