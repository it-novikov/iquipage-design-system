# Estimate: полный CI и Planning regression для PR #83

**Статус: зафиксированный job `verify` завершился `success`; все восемь проверок полного сертификата прошли.** Отдельный шаг Planning прошёл три заданных браузерных профиля. Сборка переносимого runtime image и `docker load` также завершились успешно. Это свидетельства для точного кандидата ниже; исходный сертификат сохраняет `fullPlatformReady: false` и `productionTouched: false`.

Этот пакет дополняет [native estimate и его независимое ревью](../../native/estimate/README.md) завершившимся полным CI. Более ранние артефакты и их отметки о тогда ещё ожидавшемся CI сохранены без изменений. Проверка пользовательской понятности и эстетическая приёмка всего Sprintique здесь не проводились.

## Какой код проверен

| Поле | Зафиксированное значение |
| --- | --- |
| PR | [#83](https://github.com/it-novikov/iquipage-design-system/pull/83) |
| Run / job | [38238395702 / 114774644637](https://github.com/it-novikov/iquipage-design-system/actions/runs/38238395702/job/114774644637) |
| Head кандидата | `6423443d71a0817570281cf28822a3c14f7db684` |
| Фактический CI checkout | `7dbb86d6130fef17cecb4810610cfae0976089c0` — merge checkout PR |
| Дерево head и checkout | `81fa1c2800632324b09afd86d01b6fd671ccc6a5` — совпадает целиком |
| Родители checkout | `2c757009d7bf3e3d0fc3648241d499d980ebdbb9`, `6423443d71a0817570281cf28822a3c14f7db684` |
| Дата сертификата | `2026-10-12T11:10:09.285Z` |
| DS archive SHA-256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |

Фактический checkout подтверждён строками 106, 133, 135–136 [полного job log](jobs/verify.log.gz) и `sourceRevision` в [Planning results](planning/candidate/results.json.gz). [Полный объект checkout из Git API](metadata/github-checkout-commit.json) сериализован из ранее полученного доверенного снимка без удаления полей; его происхождение и SHA исходного снимка указаны в [provenance](provenance.json). Дерево head дополнительно прочитано из неизменяемого Git object. [Метаданные job и обоих артефактов](metadata/github-job-and-artifacts.json) сохранены исходными байтами.

## Восемь проверок сертификата

Основной источник — неизменённый [verification.json](verification/verification.json). Семь выполняемых команд имеют `exitCode: 0`, `signal: null`, `passed: true`; восьмая проверка `source-stability` имеет `passed: true` и отдельный журнал.

| Проверка | Фактический результат | Полный журнал |
| --- | --- | --- |
| verification-tools | 1 / 1 тест | [verification-tools.log.gz](verification/verification-tools.log.gz) |
| library-build | IQUIPAGE `0.6.0-vnext.54`, 62 source modules, 91 SVG icons | [library-build.log.gz](verification/library-build.log.gz) |
| library-tests | 478 / 478 тестов | [library-tests.log.gz](verification/library-tests.log.gz) |
| product-boundaries | Границы импортов и контрактов, публичные DS API и правила стилей | [product-boundaries.log.gz](verification/product-boundaries.log.gz) |
| product-build | TypeScript `tsc --noEmit` и production Vite build | [product-build.log.gz](verification/product-build.log.gz) |
| product-tests | 609 / 609 тестов; журнал фиксирует PostgreSQL 18.6 и 58 migrations | [product-tests.log.gz](verification/product-tests.log.gz) |
| detached-product | Извлечён только `products/sprintique`: clean install, boundaries, strict build и 609 / 609 тестов | [detached-product.log.gz](verification/detached-product.log.gz) |
| source-stability | 1240 зафиксированных source/build inputs совпали до и после | [source-stability.log.gz](verification/source-stability.log.gz) |

Во всех четырёх итогах тестовых команд `fail`, `cancelled`, `skipped` и `todo` равны нулю. Product и detached — два запуска одной группы тестов; их нельзя складывать в число уникальных сценариев. В оригинальном detached log остаётся завершающая строка `Caught exception: Already watching path`, а в журналах — предупреждения Gradle/JVM. Успешный exit status не означает отсутствие любых предупреждений; исходные сообщения не отредактированы.

[sources.json.gz](verification/sources.json.gz) и [sources-after.json.gz](verification/sources-after.json.gz) после распаковки побайтово одинаковы. Отпечаток `d63a90d703e0494396ee5ddc4f9776f6eb11b8ac8117d53f150b8366b5ff421b` независимо пересчитан по правилу зафиксированного [source-inputs.mjs](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/scripts/vnext/source-inputs.mjs). Все 1240 записанных SHA-256 дополнительно сверены с Git blobs head кандидата. Под «чистотой исходников» здесь понимается это совпадение проверяемых входов; сертификат не утверждает, что в CI отсутствовали генерируемые или игнорируемые файлы.

## Planning: что действительно проверено

[Полный results.json.gz](planning/candidate/results.json.gz) фиксирует `PASS`, Chromium `151.0.7922.34`, Node `v24.20.0`, три профиля и пустые массивы `geometryFailures`, `interactionFailures`, `pageErrors`, `externalRequests`.

| Профиль | Viewport / тема / плотность | Все четыре исходных PNG |
| --- | --- | --- |
| desktop | 1363 × 936, light, comfortable | [selection](planning/candidate/desktop-selection.png), [menu](planning/candidate/desktop-menu.png), [menu return](planning/candidate/desktop-menu-return.png), [last row](planning/candidate/desktop-last-row.png) |
| compact | 1280 × 720, light, compact | [selection](planning/candidate/compact-selection.png), [menu](planning/candidate/compact-menu.png), [menu return](planning/candidate/compact-menu-return.png), [last row](planning/candidate/compact-last-row.png) |
| narrow | 320 × 568, dark, comfortable | [selection](planning/candidate/narrow-selection.png), [menu](planning/candidate/narrow-menu.png), [menu return](planning/candidate/narrow-menu-return.png), [last row](planning/candidate/narrow-last-row.png) |

Проверены selection и отдельно размещённая область действий, Space/range selection, M, границы меню, Escape return, последняя строка, wrapper Task dialog с подставленным callback, отмена selection, edge scrolling при drag и один записанный move intent на профиль. Во всех записанных основных состояниях видимое пересечение строки и action bar равно нулю, `rowHit`/`rowBoundaryHit` истинны, горизонтального переполнения и прокрутки всего документа не зафиксировано.

Различие raw и visible geometry сохранено: у desktop/compact в состоянии selection исходные прямоугольники пересекаются на `118.5` квадратных CSS px, но после измеренного clipping видимое пересечение равно нулю. Нельзя заменять это утверждением «любое геометрическое пересечение отсутствует».

Граница оригинального harness: `Planning selection frontend; adapter and Task content substituted; no persistence claim`. Browser UI zoom не проверялся; это headless viewport `1x`. Записанный move intent не доказывает сохранение Planning в backend. Шаг воспроизведения исторического baseline был штатно пропущен: он предназначен только для ветки исходного Planning repair, что явно задано в [зафиксированном workflow](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/.github/workflows/vnext.yml).

## Переносимый образ

В [job log](jobs/verify.log.gz), строки 4010–4012 и 4570–4586, присутствуют `npm run build:image`, созданный `server/build/jib-image.tar`, `BUILD SUCCESSFUL` и загрузка `sprintique-server:latest` / `sprintique-server:2.0.0-alpha.0`. Этот шаг выполняется после восьми проверок сертификата.

Подтверждены сборка и загрузка образа в Docker. Запуск загруженного контейнера, его readiness и эксплуатационная проверка здесь не заявлены. Сам image tar не входил в скачанные артефакты и в этот пакет не включён.

## Состав и воспроизводимость архива

| Загруженный ZIP | Размер | SHA-256 | Файлов внутри |
| --- | ---: | --- | ---: |
| `vnext-verification`, artifact `11742478819` | 1 137 697 B | `8bfa2eceecf442542b68fe6a0c2202177432f15d03e35eb4d082bb3e864ed804` | 24 |
| `planning-browser-evidence`, artifact `11741673810` | 943 604 B | `f05d6be9d4a3fb7b13a2f6f67b83c72ab85f877d62097f2f1f3da93876ace471` | 13 |

Все 37 архивных записей имеют полный inventory SHA-256/bytes и `source → preserved` mapping в [provenance.json](provenance.json). Все payload bytes доступны в этом пакете. Два ZIP содержат один и тот же комплект из 12 PNG и Planning JSON; он сохранён один раз без изменения байтов. Совпадений этих PNG с ранее tracked evidence не было. ZIP-контейнеры остаются scratch источниками; их структура, размеры и digest зафиксированы, но ZIP в Git не дублируются.

Десять verification logs/source JSON, Planning JSON и exact UTF-8 job log сжаты lossless gzip с `mtime=0`; для каждого проверены обратная распаковка и SHA исходных байтов. Job log получен JSON-декодированием переданной строки без добавления завершающего переноса. Полный certificate JSON, metadata и все PNG сохранены без нормализации. Подписанные ссылки скачивания в пакет не включены.

Поля `log` в неизменённом сертификате содержат исходные имена `.log`; переносимые ссылки на `.log.gz` даны в таблице выше. Для чтения агенты могут использовать `gzip -dc <path>` или `gzip.decompress`. Префиксы CI output и датированный каталог исходного ZIP не требуется создавать заново: точное соответствие путей находится в provenance.

## Пределы вывода

Полный CI поддерживает решение по точному кандидату Estimate и показывает отсутствие регрессии в перечисленных автоматических проверках. [Native R2](../../native/estimate/reviews/estimate-fix-native-review.md) отдельно принимает замороженный scope A1–A3; этот пакет не расширяет его до всех UI Sprintique. Реальный Planning persistence, весь Task при увеличенном тексте, date flows, пользовательские исследования, Safari/Firefox/iOS/VoiceOver и общая релизная приёмка этим CI не подтверждены. Агент сохранения проверил provenance, данные, исходные Git blobs и байты файлов; самостоятельный визуальный просмотр этих PNG здесь не заявлен.
