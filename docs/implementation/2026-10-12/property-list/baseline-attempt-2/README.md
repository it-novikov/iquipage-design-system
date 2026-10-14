# Property-list: baseline attempt 2 — зафиксированы ограничения DS54

**Пять профилей завершились `CAPTURED_WITH_OBSERVED_CONSTRAINTS`.** Job и сборка успешны; исправлен пассивный измеряющий селектор, а дизайн-система и layout остались прежними. Этот статус не является PASS исправления, одобрением будущего reflow или human приёмкой.

## Точный источник

| Поле | Значение |
| --- | --- |
| PR / run / job | [PR86](https://github.com/it-novikov/iquipage-design-system/pull/86), [38244219141 / 114793983823](https://github.com/it-novikov/iquipage-design-system/actions/runs/38244219141/job/114793983823) |
| Head | `f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b` |
| Фактический checkout | `00d4a407b90fc85bb44d9ba5fe574d39c99a9d5d` |
| Полное дерево head и checkout | `46e42c2bdfe1b4140d87906ec6a48abf68bc31f7` |
| DS / сверенные исходным runner файлы | `0.6.0-vnext.54` / 176 |
| DS archive SHA-256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Plan revision / SHA-256 | 2 / `724f1e889dc621e178ee173cb4ef8fa1fbfd190b0249decc208e75cc89de5582` |

[Метаданные](metadata.json), [exact job log](jobs/verify.log.gz) и raw подтверждают checkout; Git object head имеет тот же tree. Это baseline public DS без Sprintique CSS/runtime на ветке от Estimate `6423443…`; приёмка нового main `4f181ff…` этим захватом не выполнялась.

По сравнению с [attempt 1](../baseline-attempt-1/README.md) из 11 recorded source hashes изменился только `measure.mjs`: поверхности select/combobox теперь выбираются внутри существующего `iq-select-wrap`. Run/assertions, plan, fixture, DS package, build input graph и все четыре compiled output файла совпадают. Все десять новых PNG побайтово равны прежним. Новые measurements не означают изменения UI.

## Raw и изображения

[Полный results.json.gz](browser/results.json.gz) содержит конечный статус и все профили. [Исходный provenance.json.gz](browser/provenance.json.gz) — предшествующий source/build snapshot с `NOT_RUN`; он не подменяет конечный результат. Отдельные profile JSON: [wide-normal](browser/wide-normal.json.gz), [narrow-normal](browser/narrow-normal.json.gz), [wide-text200](browser/wide-text200.json.gz), [wide-tight-text200](browser/wide-tight-text200.json.gz), [narrow-text200](browser/narrow-text200.json.gz).

| Профиль | Viewport | Host | Root font | Диагностических observations | Исходные PNG → ранее сохранённые bytes |
| --- | --- | --- | --- | ---: | --- |
| narrow-normal | 390 × 1000 | 349 px | 16 px | 13 | [viewport](../baseline-attempt-1/browser/narrow-normal-document.png), [document](../baseline-attempt-1/browser/narrow-normal-document.png) |
| narrow-text200 | 320 × 1000 | 270 px | 32 px | 65 | [viewport](../baseline-attempt-1/browser/narrow-text200-viewport.png), [document](../baseline-attempt-1/browser/narrow-text200-document.png) |
| wide-normal | 1280 × 1000 | 615 px | 16 px | 2 | [viewport](../baseline-attempt-1/browser/wide-normal-document.png), [document](../baseline-attempt-1/browser/wide-normal-document.png) |
| wide-text200 | 1280 × 1000 | 615 px | 32 px | 38 | [viewport](../baseline-attempt-1/browser/wide-text200-document.png), [document](../baseline-attempt-1/browser/wide-text200-document.png) |
| wide-tight-text200 | 1280 × 1000 | 270 px | 32 px | 65 | [viewport](../baseline-attempt-1/browser/wide-tight-text200-viewport.png), [document](../baseline-attempt-1/browser/wide-tight-text200-document.png) |

В каждом профиле записаны все 12 value surfaces; прежних `value: null` у select/combobox больше нет. Числа observations — записи диагностик, которые могут пересекаться, а не количество уникальных дефектов. В них различаются ellipsis/range, предполагаемые ink bounds, высота меньше line-height и ограничения однострочного input. Range/Canvas оценка сама по себе не доказывает потерю нарисованных glyphs или понятность интерфейса человеку.

## Существенные границы покрытия

**Avatar владельца не покрыт.** [Fixture consumer](https://github.com/it-novikov/iquipage-design-system/blob/f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b/experiments/property-list-reflow/fixture/consumer.js) передаёт `avatar: data.person`, где есть `id/name`; public `optionAvatar` требует `avatar.text` либо bot kind. Поэтому rows `owner` и `reference-owner` не подтверждают предполагаемую композицию avatar+name. Static author использует отдельный `personAvatar` path; его нельзя смешивать с этим пропуском. Исходные fixture, plan, raw и PNG здесь не исправлены.

**Внешний layout-carrier отдельно не измерен.** `value` — внутренний trigger/shell. Собственный box `.iq-select-wrap`, margins, flex basis/grow/shrink и hypothetical outer flex size не записаны отдельными полями. Эти raw достаточны для ограниченного baseline чтения факта, но не для доказательства будущей формулы переноса внешних items. [Frozen measure source](https://github.com/it-novikov/iquipage-design-system/blob/f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b/experiments/property-list-reflow/measure.mjs).

Root 32 px означает увеличение корневого текста, не browser zoom. Native Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `v24.20.0`, light/comfortable, ru-RU/UTC. В results пусты page/console errors, внешние запросы и source changes. `targetAcceptance`, `humanAcceptance`, `backendAcceptance` остаются `NOT_RUN`; input interactions, container-only resize, новый CSS и реальный Task здесь не выполнялись.

## Сохранность

ZIP artifact `11744456028`: **1 407 722 B**, SHA-256 `b3fa9e86ac8a25e787e894f5639fef0e725921152a1e5420aac4cb02de0a1711`. Все 21 архивных файла сверены с extraction. [Package provenance](provenance.json) содержит полный SHA/bytes inventory и `source → preserved` mapping.

Семь исходных JSON и exact JSON-decoded UTF-8 job log сохранены lossless gzip `mtime=0`, с проверенными roundtrip и digest. Для десяти PNG используются семь уже сохранённых файлов attempt 1: все bytes проверены, новые копии не создаются. Исходные `screenshots[].file` не переписаны; переносимый путь находится в mapping. Четыре compiled файла — только inventory с `preserved: false`. ZIP и signed download references в Git не копируются. Companion artifact metadata не означает сохранение companion raw этим пакетом.

Агент сохранения проверил целостность и source identity; собственный визуальный просмотр PNG не заявлен. [Исходное предложение](../reviews/proposal-initial.md) и [спор R1](../reviews/proposal-R1/README.md) сохранены отдельно и не переписаны под результат capture.

[Независимый native review R1](../reviews/baseline-native-R1/README.md) добавлен после capture: автор лично просмотрел все десять PNG и признал baseline пригодным для ограниченного опыта с указанными пробелами. Это отдельный вывод reviewer, который не меняет raw статусы и не является fix/human/backend PASS.
