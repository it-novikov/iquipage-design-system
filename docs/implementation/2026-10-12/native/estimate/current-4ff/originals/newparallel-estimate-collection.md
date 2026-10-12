# Новый Estimate checkpoint: `4ff05227…`, сбор доказательств

Статус: **новые завершённые native runs и полный CI подтверждены для точного head `4ff05227cad0a9e1c1a35d59faffdddd20e5c354`**. Это отдельный набор исходных результатов. Прежний PASS `6423443…` не используется вместо нового прогона.

Подзадача выполняла только чтение GitHub/Git и сохранение файлов в scratch. CI не перезапускался; Git objects, refs, index, commits, PR и `repo-evidence` не изменялись. Публикацию и размещение evidence определяет root.

## 1. Привязка к исходникам и интеграция

| Роль | Точное значение |
|---|---|
| Head PR83 | `4ff05227cad0a9e1c1a35d59faffdddd20e5c354` |
| Actual checkout всех трёх jobs | `ae1364b069f12c0e747f4e28e208ac45dbbfcfe6` |
| Родители checkout | `220af664ef561d3f5ff1b873122281ef352e8f25`, `4ff05227cad0a9e1c1a35d59faffdddd20e5c354` |
| Whole tree head и checkout | `c7ad669f19eb5027d63994c9e4d1642b3b9f0bd6` |
| Внешний merge PR83 | `2026-10-12T12:20:33Z` |
| Наблюдённый main commit после merge | `4275dde301b5068b3d6b1801ecb54c70a2d7e708` |
| Whole tree этого main commit | `c7ad669f19eb5027d63994c9e4d1642b3b9f0bd6` |

Actual checkout извлечён из `git log -1 --format=%H` в native, Maps и full job logs. Git API независимо подтвердил его tree и родителей; Git API head и локальный read-only `git cat-file` согласуются с ним. Main commit имеет одного родителя `220af664…`: это отдельный commit с тем же содержимым дерева. Равенство main зафиксировано как **наблюдение интеграции**, а не ещё один native/CI run на SHA main.

Объединённая безопасная metadata: [newparallel-estimate-metadata.json](newparallel-estimate-metadata.json). Она содержит exact Git API responses для head/checkout/main, IDs, SHA архивов и логов, а также границы личного просмотра. Первое чтение full run показывало `in_progress`; последующее — `completed/success`. Между ними один запрос вернул `ReadTimeout`, после которого повторное чтение завершилось успешно.

## 2. Что изменилось по сравнению с `6423443…`

GitHub compare и сравнение всех 1 240 full-CI inputs показывают ровно два изменённых файла:

| Файл | Изменение и смысл |
|---|---|
| `products/sprintique/ui/src/board/task-dialog.js` | Четыре свойства остаются открытыми, остальные помещены в native `<details>` «Другие свойства» с подсказкой «Оценка, тип, релиз, план…». Группировка есть и в редактируемой, и в статической форме. Контролы смонтированы сразу. Обработчики `invalid`/`focusin` раскрывают группу; `focusin` на самом `summary` исключён из такого раскрытия. |
| `products/sprintique/tests/estimate-popover-browser.mjs` | Перед обращением к оценке Task-сценарий обычным кликом раскрывает `summary`, если группа существует и закрыта. Добавлены три строки. Оракулы открытия, реального focus, Escape, draft, callback и горизонтальной геометрии сохранены. |

Runtime `popover.js`, `estimate.js`, `planning.css`, package/lock, native acceptance plan и остальные записанные source fingerprints не изменились. Новые исходники лично прочитаны из **точного 4ff Git blob**; copies для последующего переноса: [runner](newparallel-estimate-runner.mjs), [Task](newparallel-estimate-task-dialog.js), [acceptance plan](newparallel-estimate-acceptance-plan.json). План: SHA-256 `853bc181d9f4e4db33f5676b4efd515a49cb89210a2f5e79cb307e08aecba42e`.

Эта подзадача не автор новых runtime изменений. Внешний merge и новое устройство Task приняты как наблюдаемая композиция, для которой собран новый набор evidence. Проверка `invalid`/programmatic-focus disclosure не добавлялась; наличие обработчиков — source observation, а не расширение native acceptance.

## 3. Новый native результат

| Workflow | Run / job | Содержательный результат |
|---|---|---|
| Tabs geometry + Estimate | `38245658802` / `114798738334` | Estimate: все **10 cases PASS**. Tabs: **16 profiles PASS**. |
| Maps context | `38245658711` / `114798738057` | **4 profiles + 5 mount-recovery cases PASS**. |
| Полный vNext | `38245659125` / `114798739719` | **8 certificate checks PASS**, подробнее ниже. |

Estimate проверяет четыре настоящих перехода Board → Task: desktop `1280×720` light, narrow `390×844` light и dark, narrow `320×900` light с `HTML root font-size: 200%`. Последнее не является browser zoom. Ещё шесть cases: outside-time-save, outside-points-keyboard-cancel, outside-menu-keyboard, owner-close, owner-removal, anchor-removal.

В четырёх Task cases raw показывает один открытый native popup, реальный focus в input оценки, принадлежность popup своему modal dialog и отсутствие вложенной формы. Обычный ввод изменяет черновик; Escape закрывает popup, сохраняет Task открытым и возвращает focus исходному trigger; незаписанная оценка не меняется. Synthetic adapter не получает попыток записи. Эти assertions сверены с точным runner; это новый прогон, а не вывод из равенства runtime файлов.

Горизонтальная геометрия popup проходит на четырёх профилях. Его видимые границы: desktop `765…1045`, narrow light/dark `102…382`, narrow text200 `32…312` CSS px. Это проверка popup и его частей по ширине; весь Task и вертикальная композиция в такую формулировку не входят.

Native raw: build/fixture contracts PASS, DS `0.6.0-vnext.54`, archive SHA `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`, 176 installed files проверены самим runner, tracked/untracked source changes пусты, page/console/off-origin errors пусты. Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `24.20.0`, Ubuntu 24.04, `ru-RU`, UTC. Tabs build-only JSON по-прежнему содержит top-level `NOT_RUN` для browser phase при `build.status: PASS`; это не конфликт с отдельным browser JSON `PASS`.

В подзадаче дополнительно сверены 89 уникальных source files из native/Tabs/Maps manifests с Git blob точного head; в native build graph — 75 product inputs с Git и 41 DS input с точным Git-stored tarball. Для остальных 95 Zod inputs сохранены SHA нового runner; они равны предыдущим raw metadata, но npm-архив Zod здесь отдельно не скачивался. Все 211 записей участвуют в независимо пересчитанном graph hash. Все 17 compiled output hashes и все 20 native capture PNG hashes проверены по скачанным байтам. Детали: [native verification](newparallel-estimate-native-verification.json).

## 4. Личный просмотр и оставшиеся ограничения UI

Лично просмотрены **12 исходных PNG**: все восемь изменившихся Estimate Task `after-open`/`final`, три Task panel из Tabs (desktop light, narrow light, text200) и один related Task из Maps. Точные paths/SHA перечислены в `personal_visual_review` metadata. Остальные PNG сохранены и сопоставлены по SHA, но личный просмотр всех 119 native/companion снимков не заявляется.

В обычных профилях открытый popup находится рядом с оценкой и читается; после Escape виден focus ring на оценке, Task остаётся на месте. На закрытом first screen четыре основных свойства предшествуют «Другим свойствам», затем видны описание и ожидаемый результат. Это наблюдаемая структура на детерминированных fixtures, не доказательство того, что человеку понятны акценты и следующий шаг.

На `320×900` / text200 редактор оценки помещается по ширине, но Task вокруг него остаётся проблемным: подписи и значения ряда свойств усечены, «Не запланирован» занимает тесные строки, footer при увеличенном тексте забирает много высоты. В обычном narrow профиле дата автора переносится на строку с ведущим разделителем. У disclosure подпись и подсказка визуально почти не разделены; эстетическая и информационная иерархия требует отдельного продуктового решения. Эти наблюдения **не исправляют raw** и не превращают scoped Estimate PASS в PASS всей property list или Task.

В просмотренном Maps PNG красная строка `Synthetic support read failed` принадлежит fault fixture; её нельзя объявлять обнаруженным production инцидентом. Full Task save, authentication, backend acceptance этой browser-сессии, человеческая usability, итоговая эстетика, performance benchmarking и release-браузеры остаются за пределами native пакета. Raw `visualInspection`, `humanAcceptance`, `backendAcceptance` остаются `NOT_RUN`; личное наблюдение оформлено отдельной производной записью.

## 5. Full CI и Planning

Сертификат создан `2026-10-12T12:19:50.709Z`, SHA-256 **`c4cdebfc1eb95876c2ffc1eec159240f90c0eedce5b30c2d76d06289d2c4a245`**. Его JSON целиком совпадает с сертификатом в job log после удаления префиксов времени из лог-строк.

Восемь checks: verification-tools, library-build, library-tests, product-boundaries, product-build, product-tests, detached-product, source-stability. Все `passed: true`; процессные checks имеют exit 0 без signal.

| Тестовый набор | Tests / pass | Fail / cancelled / skipped / todo |
|---|---:|---:|
| Verification tools | 1 / 1 | 0 / 0 / 0 / 0 |
| Дизайн-система | 478 / 478 | 0 / 0 / 0 / 0 |
| Продукт | 609 / 609 | 0 / 0 / 0 / 0 |
| Detached product | 609 / 609 | 0 / 0 / 0 / 0 |

Все **1 240** записей `sources.json` независимо сопоставлены с SHA-256 Git blobs `4ff05227…`. `sources.json` и `sources-after.json` byte-identical. Пересчитанный fingerprint: `9bbb33d0a450fe6f21146b3a14af2d18d23cb9193f2a8dad9c0560ecdadcfba0`.

Job успешно собрал portable image и выполнил `docker load`; в логах обе метки: `sprintique-server:latest`, `sprintique-server:2.0.0-alpha.0`. Самостоятельный запуск этого image не доказан; tar image не входит в скачанные artifact ZIP. В raw сохранены JVM warnings и нефатальное сообщение detached watcher `Already watching path`. Сертификат сохраняет `fullPlatformReady: false`, `productionTouched: false`.

Planning: общий `PASS`, пустые geometry/interaction/page/off-origin failures. Три профиля — desktop `1363×936` light comfortable, compact `1280×720` light compact, narrow `320×568` dark comfortable. Raw profiles не имеют собственного поля `status`; verdict относится к общему runner и его проверкам. Actual frontend использует synthetic adapters и заменённый Task callback; отсутствие backend writes нельзя выводить как production persistence acceptance. Вся детализация: [full verification](newparallel-estimate-full-verification.json).

Оба новых full-CI artifacts содержат одинаковые 13 Planning files. Все 12 PNG byte-identical соответствующим старым 642 PNG. Новый `results.json` имеет новый source revision и сохранён отдельно: SHA `78fd00bc6cd31e0e0995d4429b818d87ed2a3d69502c00381da53c62fa8cc49e`.

## 6. ZIP, логи и дальнейшее сохранение

Все пять ZIP проверены по опубликованным размеру и digest, распакованы с проверкой путей и типов entries. Для каждого файла сохранены размер и SHA-256; распакованные байты сверены с ZIP.

| Artifact ID / имя | ZIP bytes | SHA-256 | Files / PNG |
|---|---:|---|---:|
| `11745980346` / estimate-popover | 2 083 554 | `bcbac45aabf5dc618af5c1aece7258baf9bd69a6287458caed37f12267db0535` | 38 / 20 |
| `11746485133` / tabs-geometry | 1 140 456 | `a1687e92a1c924e493c08a526d9f42933d75390253fdf354af9aa053a4b75563` | 80 / 78 |
| `11746510094` / maps-task-context | 1 063 213 | `9d3c08d445da7d2dde32f87a7f1eaecf45d498a7a8f77368ce004e17b0f6e3ad` | 22 / 21 |
| `11746194910` / vnext-verification | 1 137 754 | `29f5585a7c8fcec0d7231b5e6758956de46d898af4b6c8764d0efe51f78c7f65` | 24 / 12 |
| `11746555040` / planning-browser-evidence | 943 604 | `7262828d55fab2820539b91522a8c30dfae476c3ae25246c111e6013e30589ab` | 13 / 12 |

Имена extract/ZIP начинаются с `newparallel-estimate-{native,tabs,maps,full,planning}-<artifact-id>`. Рядом лежат `*-inventory.json` с полным archive inventory. Compiled outputs пока сохранены только в scratch, все 17 перечислены прозрачно.

Exact job JSON strings декодированы в UTF-8 `.log` без добавления newline:

| Лог | Bytes | SHA-256 |
|---|---:|---|
| `newparallel-estimate-native-job.log` | 52 249 | `6f1fbd8cc48f28520cfa5e1d3840b32da09b335daa90f2f4f261a77427be5838` |
| `newparallel-estimate-maps-job.log` | 59 224 | `4f7df3dad8d6e9388d4b9ec09a5ca81bcde5b7105932411e0937da7c236e23b6` |
| `newparallel-estimate-full-job.log` | 287 988 | `5050be0462dbf123fd08278b660624051abed7748176254502f7ca38adaaf350` |

Для dedup подготовлен [PNG comparison](newparallel-estimate-png-comparison.json): с предыдущими files по тем же archive paths byte-identical **12/20 Estimate, 72/78 Tabs, 16/21 Maps**. Отдельно full verification перечисляет 12/12 Planning matches. Это только тождество байтов, без переноса результата проверки между commits.

Safe scratch files перечисляет [collection index](newparallel-estimate-collection-index.json). Подписанные download references содержатся только в приватных `newparallel-estimate-download-*.json`; их содержимое исключено из переносимого отчёта/индекса и не предназначено для Git. Публикация пакета пока не выполнялась.
