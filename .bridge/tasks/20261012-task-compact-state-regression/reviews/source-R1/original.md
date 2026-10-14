# Task Compact — независимое source review R1

**Вердикт: APPROVE_IN_SCOPE — для фиксации и публикации проверенного test-only checkpoint с последующей новой native проверкой. Конкретных блокеров в данном patch не обнаружено. Native, визуальная, пользовательская и backend приёмка остаются NOT_RUN.**

Рецензент: `/root/task_overview_native_r2`, GPT-6 Astra, 12 октября 2026 года. Автор checkpoint — другой агент; автор остановил запись до ревью. Рецензент не менял репозиторий, индекс, refs, lease, PR или acceptance plan. Ранее я независимо разбирал native PR88 и reconciliation PR89/90; это известный контекст, а не слепое исследование и не новое native доказательство. Спор ролей ниже — отдельный от автора критический разбор с нескольких позиций одним рецензентом; он не представлен как исследование с реальными участниками.

## 1. Точно определённый предмет ревью

| Предмет | Проверенная идентичность |
| --- | --- |
| Рабочая копия | `/workspace/scratch/b3dac59f68e2/repo-task-compact-state` |
| Ветка | `test/task-compact-state-regression` |
| Неизменённый HEAD/base | `5bd09d647f79f06c7a7c844f91a6914907ed8e8b` |
| Whole tree base | `6d4a4e4a66b7a46e6bda4f8378a0975def2aea7c` |
| Рабочий checkpoint | `task-compact-state-author-checkpoint.json`, SHA256 `e1482f385b6f03bc2d4c22a259713428d2eeb9316dd39c4cca32b8d6824366d4` |
| Полный patch | `task-compact-state-author.patch`, 176 208 B, SHA256 `fe9262b7b4489e1f20c6768ccc4166070909d4fe85dc9a920a59d335b09fc56e` |
| Момент заморозки автора | `2026-10-12T13:37:10.345914+00:00` |
| Полный объём | 24 файла: 15 Bridge/evidence, один workflow, семь fixture files, один runner |
| Активный plan v3 | `products/sprintique/tests/fixtures/task-overview-state/acceptance-plan.json`, SHA256 `acd56ea3aef4666275b5691482e6c82880e01a8cbd10f4d70d2bf8d53b093503` |
| Новый runner | `products/sprintique/tests/task-overview-state-browser.mjs`, 29 116 B, SHA256 `8a6baf9690d0e07fcfb9a90c9e283ad2cc4ebbd5c5192211bb8fb685a7a62229` |

Это ревью незакоммиченного patch поверх указанного base. Сам HEAD ещё не включает runner/fixture/evidence. Независимо проверены размер, SHA256 и Git blob hash каждого из 24 файлов; актуальный полный список tracked changes и untracked files совпадает с manifest. Индекс пуст относительно HEAD. Каждый hunk frozen patch восстановлен **в памяти** из base и дал точные текущие bytes всех 24 файлов. `git diff --stat` одного tracked workflow не использовался как определение объёма.

Проверенная runtime граница шире UI: `ui`, `web`, `client`, `contracts`, `server`, `vendor`, package/lock, существующий `work-model.test.mjs`, исходный Tabs adapter/fixture и вся `libraries/iquipage` не изменены; дополнительных untracked файлов в этих границах нет. Следовательно, этот patch не восстанавливает runtime88 поверх Compact90 и не меняет реальные права или данные. Доказательство — `task-compact-state-source-r1-independent-integrity.json`, полный перечень файлов и 24 реконструкции patch.

В ходе ревью root сообщил о внешнем merge PR90. Лично прочитан уже восстановленный root Git object `5d674ee06551b175fb5e9553c9866c11fb8fe4c0`: его whole tree равен указанному `6d4a4e4…`; diff к frozen `5bd…` пуст. Это проверка равенства доступных Git objects, без самостоятельного refresh remote main. Предмет этого R1 остался **5bd + frozen patch**. Ни новый main, ни будущий commit не получили native PASS от этого документа. Перед публикацией root привязывает фактический head/tree отдельно.

## 2. Какой пользовательский пробел закрывается

Человек должен отличать «агент закончил запуск» от «результат принят», понять, требуется ли его решение, и одним действием попасть к правильному вопросу или результату. Compact90 изменил заголовок и длину начала результата. Его ранее изученный Tabs adapter возвращал `workPlan:null`, поэтому успешный общий native job не подтверждал именно эту сводку. Источник этого решения — сохранённый `evidence/reconciliation/original.md`, 30 240 B, SHA256 `3d35da5b8b2e8b4b6070e8ebf84facdc665621b20d13fbc7d15bb81d9c5cfd4b`; копия независимо совпала побайтно.

Выбранный срез соответствует проблеме: реальные `openTaskDialog`, `mountTaskWork`, `workOverview`, публичный DS54 и production CSS собираются с явными синтетическими **read** ответами. `consumer.js` не строит альтернативную сводку. Он перехватывает только существующий GET задачи `/work`, использует исходный adapter для остальных операций и сохраняет `reads`, `unsupported`, `attempts`. Нет новой команды записи, изменения product event handler или мутации серверного состояния.

Смысл проверки — проверить переход от понятной сводки к существующему действию, а не набрать зелёные screenshots. В частности, короткий prefix обязан иметь честную подпись и открывать полный исходный результат. Недоступный ответ не должен выглядеть приглашением отправить решение.

## 3. Разбор acceptance и runner

### 3.1. Все прежние состояния сохранены

Независимый Node source probe импортировал точный `data.mjs` из Git PR88 `1fd928e12b43b26f29ebcb190a5595c1d2618444` и текущий fixture. При импорте старого модуля изменена только ссылка на неизменённый Tabs adapter; исходный Git source зафиксирован hash. Deep equality прошла для всех пяти старых semantic объектов и общего `review-long`, включая task properties, длинные title, результат, permissions и session. Все старые записи `cases` из plan v2 содержатся в v3 без изменений. Новый `question-can-answer` отличается от `question-no-answer` ровно в `id` и `work.permissions.canAnswer`; pending S1 review сохранён в обоих.

| Случай | Ожидание в сводке | Переход и защита смысла |
| --- | --- | --- |
| `completed-rejected` | Точный контекст агента, полный проблемный title, одна secondary «Открыть работу»; без ложного завершения | Реальный Work показывает выбранный шаг и «Нужна доработка» |
| `completed-blocked` | Полный blocked title с ordinary agent heading; без результата или дополнительного session status p | Work показывает выбранный шаг и «Нужен ответ» |
| `review-literal` | «Результат на проверке · Кодекс», attention=true, полный S1 title, одна primary «Проверить результат» | Точный `review:S1`; существующий `focus-S1` раскрыт, его summary получает focus; полный literal result доступен |
| `question-no-answer` | «Агент ждёт ответа · Кодекс», attention=false, Q1 вместо pending review, secondary «Открыть вопрос» | Ровно существующий Q1, focus его heading; ноль enabled inputs/textarea и нет confirm-answer command |
| `question-can-answer` | «Нужно ваше решение · Кодекс», attention=true, primary «Ответить агенту» | Тот же Q1; focus существующего enabled O1 input; доступные варианты O1/O2/`__other`, поле комментария и отдельная confirm command |
| `genuine-complete` | Ordinary agent heading и непустой основной «Работа завершена», одна secondary CTA | Реальная complete секция сохраняет исходный session summary; этот контроль не даёт убрать корректное завершение вместе с ложным |

Общие assertions требуют настоящего открытого modal dialog, выбранной Task tab, видимой сводки, ровно одного next-action CTA, точного имени команды и action id. В overview отсутствуют `approve:`, `reject:`, `answer:` и `new-question` controls. Все переходы выполняет обычный Playwright pointer click по точной доступной подписи; затем проверяются Work panel и выбранная tab. Runner не вызывает product action напрямую, не делает forced click, не устанавливает focus, не раскрывает нужный step и не исправляет scroll вместо продукта.

### 3.2. Heading не перепутан с лишним абзацем статуса

Текущий renderer переносит review/question status в `<h3 class="task-work-status">` и использует `overview.text || overview.status` как основной `<p>`. Старый selector `.task-work-status` больше не доказывает наличие дополнительного status row. Новый snapshot измеряет `heading` и отдельно **`p.task-work-status`**. Точные ожидаемые heading/agent и attention assertions сохранены; extra status p должен отсутствовать. Для rejected/blocked/genuine-complete attention attribute отсутствует. Это соответствует неизменённому Compact renderer, а не допускает произвольный пустой heading ради прохождения теста.

### 3.3. Literal oracle стал точным для новой композиции

Сохраняется исходная строка из **69 code points**:

```text
История «<em>готово</em> &amp; проверено» сохранена после обновления.
```

Независимо заданный ожидаемый prefix содержит **58 code points**:

```text
История «<em>готово</em> &amp; проверено» сохранена после…
```

Runner не вычисляет ожидаемый prefix через production `workResultPreview`. Точное равенство overview text включает «Начало результата», а структура требует один дочерний `SPAN` подписи и ноль `em`. После перехода к S1 проверяется полный исходный текст и отсутствие всех дочерних элементов в result paragraph. Поэтому удаление `<em>`, интерпретация его как markup, декодирование `&amp;` в иной вид, пропуск хвоста после перехода или подмена полной строки prefix не дадут PASS.

Отдельный read-only source probe подтвердил actual model prefix 58 и неизменённый default `workResultPreview(..., 160)`, возвращающий полный literal witness. Длинная исходная строка содержит 268 code points, текущий model prefix — 61. **Это подсчёт строк в модели, не измерение текущей геометрии или качества первого экрана.** Допустимость budget64 эстетически этим R1 не принимается.

### 3.4. Проверка can-answer опирается на реальные контролы

Лично прочитаны production `question(id)` и DS54 `dist/modules/work-story.js`. Production выбирает первый `input:not(:disabled),textarea:not(:disabled)`, иначе heading, и сам выполняет focus/scroll. DS выводит native radio O1/O2/`__other`, уникальное имя `work-answer-Q1`, empty draft и fieldset disabled при отсутствии права; textarea также disabled. Production добавляет confirm command только при `canAnswer`.

Новый положительный контраст поэтому проверяет реальный O1, а не выдуманную кнопку. В обоих сценариях открытие вопроса оставляет ноль checked inputs и пустой textarea; confirm не вызывается. Enabled confirm при пустом draft — текущее product поведение, поскольку в существующем submit path есть валидация пустого ответа. Source R1 не принимает этот UX как идеальный и не тестирует запись. Если последующий problem-first срез изменит валидацию или доступность confirm, потребуется явная новая revision ожиданий.

### 3.5. Нет переноса прежнего native PASS

План v3 корректно ссылается на сохранённый **v2**, SHA256 `66780241ab4de4b154e77520440632e839bf9cb865ad4dfd93ba443eb2fc186d`. V2 побайтно равен active plan PR88 и по-прежнему ссылается на v1, SHA256 `9f18f4a523f032847666a35b4d7394eb7fbac0ae1551ecc479d3811dfb2dd5a8`. Сам v1, consumer и index также точно равны своим PR88 Git blobs. Новые source fingerprints включают сохранённый v2; исторические документы не переписаны под Compact.

Два `review-long` профиля — 1280×900 и 390×844 — сохраняют исходные длинные данные и возвращают **CAPTURED**. Snapshot пассивно пишет viewport PNG, heading/title/summary/CTA/prefix, четыре свойства, disclosure box и text ranges, description, clipping ancestors и scrollports. Геометрия не получает PASS по подогнанному порогу. Native visual reviewer ещё должен лично оценить текущее полезное содержание и видимость действий; старые Compact82 или PR88 числа применять к новым кадрам нельзя. Унаследованный runtime comment о first-screen fit не заменяет эту проверку.

## 4. Независимая проверка доказательств сборки

Здесь проверена уже сделанная автором actual build, а не запущен второй browser или повторная сборка. Сохранённый Bridge `build-only-results.json` побайтно совпал с файлом фактического `output/.../build-only/results.json`. Он честно сообщает dirty/untracked working sources, base HEAD/tree, `BUILT_NOT_RENDERED`, пустые `cases` и `nativeAcceptance: NOT_RUN`.

| Независимая сверка | Результат и предел |
| --- | --- |
| 24 source/checkpoint файла | Размер, SHA256, Git blob hash совпали; полная реконструкция patch совпала |
| 14 отдельно записанных source hashes | Все совпали с текущими файлами, включая renderer/model/dialog/CSS, runner, plan v1/v2/v3 и workflow |
| 197 physical build inputs | Все заново прочитаны и rehashed: 61 product/fixture, 41 DS54, 95 Zod; inputGraphSHA256 пересчитан и совпал |
| 12 compiled outputs | Полный перечень файлов совпал; каждый rehashed; bundleSetSHA256 пересчитан и совпал |
| Полный DS54 | Точный archive SHA256 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`; все 176 regular files архива совпали с установленными файлами, без лишних файлов |
| package/lock | Fingerprints совпали; runtime dependency boundary не изменена |
| Fixture data | Самостоятельно собранные объекты всех семи scenario равны сохранённому fixture-data и dataSHA256 сборки |
| Syntax | Независимые `node --check` runner/data/consumer: 3/3 PASS |
| Авторский model suite | Прочитан точный сохранённый лог 15/15 Node tests; повторный общий запуск не присваивается рецензенту |
| Авторский boundaries/style | Прочитаны точные metadata и logs PASS; эта запись не является browser/performance acceptance |

Dependency symlink в review repo отсутствует: автор документировал временное read-only подключение и его удаление. Независимая сверка читала те же доступные shared dependencies по `/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/node_modules` и сравнивала их с exact archive. Ни install, ни изменение shared dependencies не выполнялись.

Реальный runner записывает actual Git revision/whole tree и требует равенства `TASK_OVERVIEW_SOURCE_REVISION` в CI, чистых committed scoped sources для native, точного установленного DS и существования actual dialog/renderer/model в compilation graph. Он сохраняет полные input/output fingerprints; число 197 является наблюдением, не магическим gate. Case JSON, raw captures и aggregate сохраняются до context shutdown, FAIL не переименовывается в PASS. Нулевые unsupported/writes/page errors/console errors/off-origin requests обязательны. Всё это разумно связывает будущую native проверку с конкретным build, но пока не даёт native результата.

## 5. Спор ролей и принятые решения

| Позиция | Возражение | Ответ другой позиции и решение |
| --- | --- | --- |
| Обычный участник | «Работа завершена» при rejected/blocked может закрыть мой вопрос ошибочно | QA требует отрицательного overview assertion и положительного genuine-complete контроля. Оба сохранены. Проблема языка общего full Work остаётся F2, не скрывается test-only PASS |
| Пользователь, которому нужен результат | 58 символов могут не дать достаточно смысла до клика | Designer защищает короткую композицию, но не обещает понимания. Точная честная подпись и полный S1 после одного действия обязательны; полезность prefix и длинный first screen ещё оцениваются по новым native кадрам |
| Участник без права ответа | «Открыть вопрос» может привести к непонятной недоступной форме | Engineer сохраняет существующие permissions; QA проверяет отсутствие ложного приглашения ответить и правильный focus. Это предотвращает регрессию, но не объясняет причину недоступности. F3 остаётся открытым |
| Участник с правом ответа | Навигационный тест может открыть панель, но оставить меня без понятного места действия | Новый permission contrast требует focus именно enabled O1 внутри Q1, доступные варианты/комментарий и отдельное подтверждение. Никакой выбор за пользователя не совершается |
| Power user | Одна команда сводки прячет быстрые approve/reject и другие возможности | Product decision сохраняет одну понятную цель в обзорном блоке и существующие decision controls в конкретном full S1. Тест проверяет их наличие после точного перехода, а не удаляет функциональность |
| DS designer | Тест может законсервировать случайные DOM/CSS детали или замаскировать второй status line | h3/extra p различены по текущему контракту, native контролы DS используются напрямую. Exact labels/actions защищают смысл; внешний вид и общая DS пригодность этим срезом не принимаются |
| QA и provenance reviewer | Передача PR88 тестов способна перенести старый PASS на иной renderer | Нужны неизменные v1/v2, новый v3, independent prefix, полный graph и future checkout identity. Все source условия проверены; новый native всё ещё обязательный |
| Разработчик AI agents / производительность | Ещё одна большая матрица повышает стоимость CI и даёт flaky результаты | Срез использует существующий setup, шесть адресных semantic cases и только два long captures; не добавляет dependency/install или production bytes. Forced repair и geometry threshold отсутствуют. Быстродействие пользователей требует отдельной проверки, а не вывода из числа тестов |

Разногласие о плотности и выразительности first screen **не решено подгонкой количества строк**. В этой работе принято только решение о достаточном следующем доказательстве: точная семантика и переходы плюс наблюдение актуальной длинной композиции. Ослаблять exact text, permissions, focus или запрет записи ради native PASS нельзя.

## 6. CI и открытые границы

Исходные **3225 B** `.github/workflows/tabs-geometry.yml` сохранены побайтно: SHA256 prefix `5879c4fdcf218636c0d9220385606e5333532b3062fee514c72def61d9dd017f`. Добавлен точный двухшаговый suffix PR88, SHA256 `054d80f0d1e702823076e9d4ea88e3f942baa6cc8a109f2719b7e4ddd1cfc555`; whole workflow SHA256 `0135239b554bc5747e5a920d71189dac4a1281d73ebe521cf1fef49f4a4e719d`. Existing Tabs/Estimate setup и steps не изменены. Runner и upload используют `!cancelled()`, существующий Playwright path и upload artifact `task-overview-state`; failure evidence сохраняется без нового install.

| Вопрос | Состояние после source R1 |
| --- | --- |
| F1 — длинная композиция, первый экран, свойства и читабельный prefix | OPEN; нужны новые actual desktop/narrow PNG и их личное native review |
| F2 — completed session wording против незавершённого шага/full Work | OPEN; existing wording намеренно явно записан в oracle как граница текущего среза |
| F3 — понятная причина недоступного ответа | OPEN; no-answer regression не решает объяснение прав |
| D1 — general Open work focus и полный keyboard путь | Отдельный diagnostic pending; pointer BODY metadata из старого run не является доказанным keyboard failure |
| Native шесть semantics и два long captures | NOT_RUN для frozen checkpoint |
| Backend writes/permission enforcement, agent execution | NOT_RUN; синтетические reads не проверяют сервер |
| Производительность и отсутствие пользовательских лагов | Не проверялись этим срезом; production bytes не менялись |
| Safari/Firefox/iOS/VoiceOver и другие реальные platform/screen reader сценарии | Отдельная prerelease проверка по решению пользователя |
| Онбординг | Последний приоритет, только после отдельного явного согласования пользователя |

Ни пять native cases PR88, ни общие исторические 610/610 не включены в результат этого R1. Если исторические 610/610 упоминаются в соседней evidence, это counts JS/Node runner, а не число standalone backend tests. Build-only и syntax не заменяют выполненный CI, а будущий успешный native job не заменяет личное visual review или исследование с людьми.

## 7. Следующий шаг и условия повторного review

Root может сохранить этот immutable original с wrapper, зафиксировать проверенные 24 файла и открыть test-only PR на актуальный main с отдельно записанным head/tree. Если integration меняет только ancestry при равном base tree, source вывод остаётся привязанным к этим же reviewed bytes; это не разрешает переписать замороженный plan или перенести runtime88. После публикации нужен свежий native run: проверить actual checkout и Git tree, полный plan/input/output fingerprints, шесть semantic PASS, два CAPTURED, реальные PNG и ошибки. Native failure следует сохранить и объяснить, без изменения oracle под результат.

Любое изменение runtime, runner, active plan, fixture values, workflow либо bytes из checkpoint требует адресного нового source review или addendum на новый immutable patch. Дополнение wrapper/публикационной metadata root может вести отдельно, сохраняя original этого R1. Конкретных source блокеров, которые требовали бы исправления проверенного checkpoint до публикации, нет.

## 8. Независимые артефакты и воспроизводимость

Все следующие файлы находятся в `/workspace/scratch/b3dac59f68e2/research/continuation/`. Репозитории не изменялись. После завершения originals и manifest устанавливаются read-only; manifest содержит размеры и SHA256 review outputs и frozen inputs, без самоссылочного hash самого manifest.

| Артефакт | Размер / SHA256 | Содержание |
| --- | --- | --- |
| `task-compact-state-source-r1-independent-integrity.json` | 126 058 B / `5b19ad1b80bbe88aa848233eee488923b60b190bc467a08f3bb7cc701b343f70` | Все 24 файла/patch reconstruction, 14 sources, 197 inputs, 12 outputs, 176 DS files, plan/workflow и scope equality |
| `task-compact-state-source-r1-independent-data.json` | 3081 B / `03ac2af22eb2aca507238560de7125b3b6b68c5d9da28019e4e4371f8d6e4d39` | Deep-equal старых scenarios, двухточечный contrast, exact fixture-data, literal и model-only probe |
| `task-compact-state-source-r1-runner-delta.patch` | 18 724 B / `19a44d97fa50762b1f180bd3aeaf3f1c6421b2febf0550cda13499de0d312fe5` | Полный лично прочитанный delta corrected PR88 runner → Compact runner |
| `task-compact-state-source-r1-checks.json` | 1529 B / `e8e60ea0900a47f14489159243b3e7d8c6769c75afcdfb6e6e1665746c5050ed` | Независимые syntax commands, known main tree equality и явные NOT_RUN границы |
| `task-compact-state-source-r1-manifest.json` | Размер и SHA256 передаются root отдельно | Индекс точных originals и входов; review identity остаётся frozen patch, а не будущий main |

**Итоговое решение: APPROVE_IN_SCOPE / SOURCE_R1. Native acceptance: NOT_RUN. Изменений до фиксации этого checkpoint не требуется.**
