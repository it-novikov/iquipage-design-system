# Оценка: независимые source R1 и native R2

**Native R2 одобряет frozen план A1–A3 на head `6423443d71a0817570281cf28822a3c14f7db684`, tree `81fa1c2800632324b09afd86d01b6fd671ccc6a5`.** В проверенном scope F-EST-01 подтверждён как исправленный в actual Board→Task estimate path; F-EST-02 — в горизонтальной компоновке оценки четырёх заданных Task profiles. Общая Task form при text200, реальная интеграция Planning/date editor, backend persistence и human/release acceptance в этот вывод не входят.

| Неизменённый оригинал | Основание и граница |
|---|---|
| [Source review R1](estimate-fix-source-review.md) | Одобряет frozen runtime/style/DS-integration diff для дальнейшей native проверки. Исходный локальный commit `47dcbf2c46496e7908b3c94cee91c9813eec81c5` и [опубликованный checkpoint](https://github.com/it-novikov/iquipage-design-system/commit/189d07856342b8ec9daecb6d74741b00454cc744) имеют одинаковый tree `f43689d3a5553c07468ef40eccf5c7af8538892f`. Harness и native acceptance этим R1 не подтверждаются. |
| [Native review R2](estimate-fix-native-review.md) | Одобряет A1–A3 на [полном candidate head](https://github.com/it-novikov/iquipage-design-system/commit/6423443d71a0817570281cf28822a3c14f7db684). Проверены exact provenance, oracle и raw outcomes; отдельно просмотрены 12 candidate PNG и прежняя пара отказа. Три runtime/style fingerprints сохраняют одобренный source R1. |

Автор R2 сохранил `visualInspection: NOT_RUN` в исходном JSON и зафиксировал дополнительный независимый просмотр в новом отчёте. Его одобрение не переименовывает старые snapshots и не означает визуальную приёмку всех 20 изображений, всей Task form или приложения.

## Важная историческая точность

Начальный отказ был **после Escape**, когда ожидалось закрытие popover. Предшествующее открытие прошло. [Отдельная поправка диагноза](../../../task-first-screen/prototype/reviews/task-estimate-source-correction-attempt3.md) сохраняется неизменной. Source R1 дополнительно уточняет источник Task cancellation: в actual Task есть собственный native `cancel` capture handler с close/flush guard; ранняя прямая атрибуция закрытия DS listener была неполной. Это уточнение source chain, не новое содержимое старой native трассы: она не записывала dispatch keyboard/cancel событий.

Старые и новые Task данные различаются: SPT-101 с 3 ч и TFX-101 без оценки. R2 поэтому трактует сравнение как проверку поведения и геометрии компонента в actual product fixtures, без заявления об identical-content pixel comparison. Старые evidence остаются `FAILED`.

## Переносимая карта авторских ссылок

| Ссылка в исходном отчёте | Сохранённый источник |
|---|---|
| `estimate-candidate-estimate-11740684903/browser/results.json` | [Полный JSON в lossless gzip](../estimate/browser/results.json.gz) |
| Candidate PNG в том же `browser/` | [Карта всех 20 изображений](../README.md); [desktop](../estimate/browser/task-desktop-light-after-open.png), [narrow light](../estimate/browser/task-narrow-light-after-open.png), [narrow dark](../estimate/browser/task-narrow-dark-after-open.png), [narrow text200](../estimate/browser/task-narrow-text200-after-open.png) |
| Scratch artifact ZIP | [Digest, размер и полный инвентарь](../estimate/provenance.json); сами ZIP/build outputs в Git не скопированы, PNG и полный JSON сохранены |
| `estimate-native-job.log` | [Полный журнал в lossless gzip](../jobs/native.log.gz) |
| Frozen native plan | [Точный acceptance-plan.json](../acceptance-plan.json) |
| `estimate-fix-source-review.md` | [Неизменённый R1](estimate-fix-source-review.md) |
| `task-prototype-attempt3-11739838266/results.json` | [Полный исходный JSON отказа](../../../task-first-screen/prototype/attempt-3/results.json.gz), [карта первоначальных кадров](../../../task-first-screen/prototype/attempt-3/README.md) |
| `task-estimate-source-correction-attempt3.md` | [Историческая поправка](../../../task-first-screen/prototype/reviews/task-estimate-source-correction-attempt3.md) |
| Native runner/fixtures/workflow | Frozen head `6423443…`: [runner](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/products/sprintique/tests/estimate-popover-browser.mjs), [fixture](https://github.com/it-novikov/iquipage-design-system/tree/6423443d71a0817570281cf28822a3c14f7db684/products/sprintique/tests/fixtures/estimate-popover), [workflow](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/.github/workflows/tabs-geometry.yml) |

Оба MD скопированы без изменения байтов, путей и ссылок. Только этот README — новая обёртка. Companion Maps/Tabs и полная vNext CI остаются самостоятельными доказательствами; native R2 не выводит свой verdict из их статусов. Новых browser runs, source edits или повторной визуальной проверки при сохранении не выполнялось.
