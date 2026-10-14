# Task overview recovery — full CI, попытка 2

**PASS: восемь проверок сертификата, три профиля Planning, сборка и загрузка переносимого образа.** Это собственный завершённый прогон точного Task88 commit. Он дополняет сохранённую первую попытку; её ошибка загрузки Gradle остаётся в [отдельном пакете attempt 1](../attempt-1/README.md).

## Точный источник результата

| Поле | Значение |
|---|---|
| PR / head | [PR88](https://github.com/it-novikov/iquipage-design-system/pull/88), [`1fd928e12b43b26f29ebcb190a5595c1d2618444`](https://github.com/it-novikov/iquipage-design-system/tree/1fd928e12b43b26f29ebcb190a5595c1d2618444) |
| Run / attempt / job | [38249543772 / 2](https://github.com/it-novikov/iquipage-design-system/actions/runs/38249543772/attempts/2), [114816147202](https://github.com/it-novikov/iquipage-design-system/actions/runs/38249543772/job/114816147202) |
| Завершение job | `2026-10-12T13:03:54Z`; API `completed / success` |
| Фактический checkout из этого job log | `72f862293b80dbbb89352b128eacd592db86ec49` |
| Whole tree head и checkout | `c039d65a75d1e4312b5931cc76a4d28fb7ef8e08` |
| Сертификат | `2026-10-12T13:03:39.042Z`; SHA-256 `f4cb59320d9f5d2911771f23c032f3bceacd662e5f95b71d777079b6002f89f4` |

Сохранены [exact API run](metadata/task88-full-attempt2-run-api.json), [job и шаги](metadata/task88-full-attempt2-jobs-api.json), [список artifacts всего run](metadata/task88-full-attempt2-artifacts.json) и [полный job log](jobs/verify.log.gz). Список artifacts содержит обе попытки; принадлежность новых IDs именно attempt 2 подтверждена их upload-строками и размерами в собственном job log. Git API proof для [head](../../../native/task-overview-recovery/metadata/task-overview-recovery-native-git-1fd928e12b43b26f29ebcb190a5595c1d2618444.json) и [checkout](../../../native/task-overview-recovery/metadata/task-overview-recovery-native-git-72f862293b80dbbb89352b128eacd592db86ec49.json) сохранён в соседнем native-пакете и проверен повторно по точным байтам.

## Что прошло

[Исходный сертификат](verification/verification.json) сохранён без правок. Его JSON также найден в собственном timestamped job log. Полные журналы доступны в lossless gzip.

| Проверка | Результат | Полный raw |
|---|---|---|
| `verification-tools` | PASS | [verification-tools.log](verification/verification-tools.log.gz) |
| `library-build` | PASS | [library-build.log](verification/library-build.log.gz) |
| `library-tests` | PASS | [library-tests.log](verification/library-tests.log.gz) |
| `product-boundaries` | PASS | [product-boundaries.log](verification/product-boundaries.log.gz) |
| `product-build` | PASS | [product-build.log](verification/product-build.log.gz) |
| `product-tests` | PASS | [product-tests.log](verification/product-tests.log.gz) |
| `detached-product` | PASS | [detached-product.log](verification/detached-product.log.gz) |
| `source-stability` | PASS | [source-stability.log](verification/source-stability.log.gz) |

Счётчики Node test runner: **1/1** `verification-tools`, **478/478** `library-tests`, **610/610** `product-tests`, **610/610** `detached-product`; `fail`, `cancelled`, `skipped`, `todo` — 0 во всех четырёх итогах. Число 610 относится к выводу JavaScript test runner и не выдаётся за отдельное количество backend/JUnit-тестов. Полные product и detached gates завершились с кодом 0.

Planning прошёл три записанных профиля: desktop 1363×936 / light / comfortable; compact 1280×720 / light / compact; narrow 320×568 / dark / comfortable. В собственном [raw results.json](planning/candidate/results.json.gz) пусты `geometryFailures`, `interactionFailures`, `pageErrors`, `externalRequests`. Adapter и Task content в этом harness подменены; проверки persistence и полноценного содержимого Task из Planning этим прогоном не подтверждены.

Portable runtime image: шаг успешен; log содержит `build:image`, `docker load --input server/build/jib-image.tar` и загрузку `sprintique-server:latest`, `sprintique-server:2.0.0-alpha.0`. Это подтверждает сборку и загрузку образа. Запуск контейнера из этого image и сохранение image tar в Git данным пакетом не подтверждаются.

## Неизменность исходников

Все **1 246** SHA из [sources.json](verification/sources.json.gz) независимо сверены с Git blobs точного head. [sources-after.json](verification/sources-after.json.gz) побайтно равен начальному списку и обоим спискам attempt 1. Из того же immutable commit взяты workflow и реализация проверок; retry не изменял исходники или критерии.

Fingerprint до и после: `4fa6a94e01c56b8f843ababb27cf720fdf44f8bdbfe9c05984dd8813a3332729`. SHA исходного JSON: `bc7341d4d82da37cc4e9716f32a65aa190e6fded0705f7d065e4c65f356a546a`. DS archive `0.6.0-vnext.54`: `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`, также проверен против Git. Файл [независимой сверки](metadata/task88-full-attempt2-verification.json) фиксирует точные проверки и их границы; [metadata](metadata/task88-full-attempt2-metadata.json) связывает API и сертификат.

## Полнота сохранения

| Artifact attempt 2 | ZIP bytes / SHA-256 | Исходных файлов |
|---|---|---|
| `11748382713` / `vnext-verification` | 1 138 139 / `858517e8448999b532ac01494b74d05185d8ccf523be1958891c930cd39a7538` | 24 |
| `11747929711` / `planning-browser-evidence` | 943 635 / `f7c369ba7b5968677538c56e3a0e9ae551858cd7961aa73d749c0254c7b54c2c` | 13 |

Все **37 archive-member references** сопоставлены с сохранёнными точными байтами в [provenance.json](provenance.json). Оба архива содержат одинаковые 13 Planning-файлов. Все 12 PNG доступны через [таблицу изображений](screenshots.md): 11 побайтно совпадают с уже сохранёнными, а новый `desktop-last-row.png` сохранён отдельно. Его отличие не исправлялось и не интерпретируется как UX-вердикт.

Raw JSON/log хранятся в gzip с `mtime=0`, точный сертификат и PNG — identity. Job log равен JSON-decoded UTF-8 исходного ответа без добавленного LF. Ссылки `.log` внутри неизменённого сертификата разрешаются через таблицу выше и полный mapping; scratch-пути внутри исходных metadata/verification разрешаются через `supporting_source_path_map` и `source_path_map`. ZIP, подписанные download refs и image tar в Git не копировались. Compiled bundles в этих двух архивах отсутствуют; полный inventory обоих ZIP сохранён.

## Границы принятия

`fullPlatformReady: false` и `productionTouched: false` сохранены как в исходном сертификате. JVM warnings и сообщение detached watcher `Caught exception: Already watching path` остаются в raw: это успешный gate, а не заявление об отсутствии любых предупреждений.

[Task native R2](../../../native/task-overview-recovery/README.md) остаётся отдельным `APPROVE_IN_SCOPE` для пяти семантических сценариев и двух информационных captures. Full CI не закрывает F1 (мобильная композиция), F2 (язык состояния в полном Work), F3 (объяснение read-only question) и не превращает D1/BODY focus в доказанный диагноз. Human usability, итоговая эстетическая приёмка и релизная Safari/Firefox/iOS/screen-reader матрица этим пакетом не подтверждаются. Preserver проверял сохранность и source evidence; нового визуального ревью не проводил.
