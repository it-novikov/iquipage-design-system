# Estimate: новый checkpoint `4ff05227…`

**Новый native PASS для точного head `4ff05227cad0a9e1c1a35d59faffdddd20e5c354`: 10 Estimate cases, 16 Tabs profiles, 4 Maps profiles и 5 recovery cases.** Прежний checkpoint `6423443…` сохранён отдельно и не переименован.

## Источник и границы

Actual checkout всех новых jobs — `ae1364b069f12c0e747f4e28e208ac45dbbfcfe6`; whole tree head/checkout — `c7ad669f19eb5027d63994c9e4d1642b3b9f0bd6`. Git API подтверждает родителей checkout `220af664…` и `4ff05227…`. Внешний merge PR83 в `4275dde301b5068b3d6b1801ecb54c70a2d7e708` наблюдён в `2026-10-12T12:20:33Z`; его whole tree совпадает. Это запись интеграции, самостоятельного native run на SHA main здесь нет.

Native runs: `38245658802` / job `114798738334` и Maps `38245658711` / job `114798738057`. [Безопасная exact metadata](originals/newparallel-estimate-metadata.json) содержит IDs, digest, Git API proof и исходные границы. [Полный CI этого head](../../../ci/estimate/current-4ff/README.md) сохранён в отдельной подпапке.

Четыре Task-профиля проверяют настоящий переход Board → Task: 1280×720 light; 390×844 light и dark; 320×900 light с root text 200%. Popup открыт внутри владельца modal, input получает реальный focus, Escape закрывает popup и возвращает focus к оценке, сохраняя Task. Оракул геометрии относится к ширине popup и его частей. Шесть остальных cases покрывают внешние estimate/menu callbacks и закрытие/удаление владельца/anchor. Raw и assertions доступны ниже.

По сравнению с 642 изменились только Task grouping/reveal и три строки harness, раскрывающие «Другие свойства» обычным кликом. Runtime popover, Estimate, Planning CSS и acceptance plan не изменились. Иерархия/эстетика disclosure, усечения внешней property list, вертикальная композиция text200, реальный backend, human usability и release-браузеры не получают общего PASS от этого набора.

## Неизменённые оригиналы и переносимость

[Исходный collection report](originals/newparallel-estimate-collection.md) сохранён побайтно вместе с metadata, обеими verification JSON, PNG comparison, collection index и тремя source snapshots. Все восемь относительных ссылок исходного Markdown разрешаются внутри `originals/`. Scratch paths внутри JSON сохранены как исторические идентификаторы источников; фактические offline paths этого пакета указаны в [provenance](provenance.json) и [таблице PNG](screenshots.md).

Слова исходного report/metadata о scratch-only и отсутствии repo writes описывают предшествующую стадию сбора. Этот wrapper описывает последующее сохранение в Git worktree. Исходный collection index перечисляет scratch-байты, включая compiled outputs; он не является обещанием наличия всех этих файлов в Git.

| Документ | Назначение |
|---|---|
| [Native verification](originals/newparallel-estimate-native-verification.json) | Проверка source hashes, build graph, output и capture hashes с явно указанной границей для 95 Zod inputs |
| [Full verification](originals/newparallel-estimate-full-verification.json) | Exact-head certificate, 1 240 Git inputs и integration observation |
| [Frozen runner](originals/newparallel-estimate-runner.mjs) | Оракулы нового native прогона, source SHA `62df3b6e…` |
| [Frozen Task source](originals/newparallel-estimate-task-dialog.js) | Grouping/reveal этого head, source SHA `a5a35c03…` |
| [Acceptance plan](originals/newparallel-estimate-acceptance-plan.json) | Неизменённый A1–A3 plan, SHA `853bc181…` |

## Raw и просмотр

| Данные | Offline файл |
|---|---|
| Estimate, все 10 cases / 20 capture records | [results.json.gz](estimate/browser/results.json.gz) |
| Tabs browser, 16 profiles | [browser/results.json.gz](tabs/browser/results.json.gz) |
| Tabs build-only | [build/results.json.gz](tabs/build/results.json.gz) |
| Maps, 4 profiles и 5 recovery | [results.json.gz](maps/results.json.gz) |
| Native job exact decoded UTF-8 | [native.log.gz](jobs/native.log.gz) |
| Maps job exact decoded UTF-8 | [maps.log.gz](jobs/maps.log.gz) |

Gzip lossless, `mtime=0`; декодированные логи сохранены без добавления newline. Для чтения используйте стандартную распаковку gzip. Top-level `NOT_RUN` в Tabs build-only JSON относится к browser phase; build имеет собственный `PASS`, browser — отдельный raw файл.

Лично просмотрены 12 PNG на стадии сбора: все 8 изменённых Task Estimate after-open/final, 3 Task panel из Tabs и 1 related Task из Maps. Список с SHA в исходной metadata. Это визуальное наблюдение агента; raw `visualInspection`, `humanAcceptance`, `backendAcceptance` остаются `NOT_RUN`.

## Полнота сохранения

В трёх native ZIP **140 файлов**: **119 PNG**, **4 raw JSON** и **17 compiled outputs**. Все 119 PNG доступны offline: 19 новых уникальных файлов скопированы identity, 100 archive paths ссылаются на существующие exact PNG после проверки байтов. Raw JSON сохранены полными gzip. Полный mapping каждого ZIP member с его bytes/SHA и сохранённым path находится в provenance; PNG можно открывать через таблицу выше.

**17 compiled outputs и сами ZIP не перенесены в Git.** Сохранены их полные bytes/SHA inventory, точный опубликованный commit, runner и build manifests. Rebuild возможен из этого источника; тождество будущего rebuild проверяется по записанным SHA, не предполагается автоматически. Подписанные download references не перенесены. Существующие evidence files и глобальный manifest этой подзадачей не менялись.
