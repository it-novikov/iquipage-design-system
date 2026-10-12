# Оценка: native проверка исправления и companion regression

**Целевой native набор оценки: 10/10 `PASS`. Companion Tabs: 16/16 profiles `PASS`; Maps: 4/4 profiles и 5/5 mount-recovery `PASS`.** Все результаты относятся к head [`6423443d71a0817570281cf28822a3c14f7db684`](https://github.com/it-novikov/iquipage-design-system/commit/6423443d71a0817570281cf28822a3c14f7db684), actual checkout `7dbb86d6130fef17cecb4810610cfae0976089c0`, одинаковому полному tree `81fa1c2800632324b09afd86d01b6fd671ccc6a5`. Parents checkout — main `2c757009d7bf3e3d0fc3648241d499d980ebdbb9` и этот head; соответствие проверено по trusted Git API metadata.

Это пакет исходных доказательств [PR83](https://github.com/it-novikov/iquipage-design-system/pull/83). Он сохраняет результаты конкретных браузерных сценариев и [два самостоятельных ревью](reviews/README.md). Native R2 одобряет frozen A1–A3: F-EST-01 проверен как исправленный в actual Board→Task estimate path, F-EST-02 — в горизонтальной компоновке четырёх Task profiles. Полная vNext CI и пользовательская приёмка сюда не включены. Исторические `FAILED` runs VT1/compact в [отдельном эксперименте Task](../../task-first-screen/prototype/compact-attempt-1/README.md) не переписаны.

## Проверенный scope

| Набор | Что зафиксировано | Исходный результат |
|---|---|---|
| Estimate | Четыре actual Board→Task профиля: desktop light, narrow light/dark, narrow text200. Ещё шесть сценариев существующих helper: время/единицы, points cancel, клавиатура меню, закрытие/удаление owner и удаление anchor. Всего 10 `PASS`; static build и fixture contracts `PASS`. | [Полный JSON](estimate/browser/results.json.gz), [точный acceptance plan](acceptance-plan.json) |
| Tabs | 16 minimal/Board/Task/Wiki/nested profiles `PASS`. В отдельном build-only документе `build.status=PASS`, а верхний `status` и `browserChecks` остаются `NOT_RUN`, поскольку браузер в этом build-only этапе не запускался. | [Browser JSON](tabs/browser/results.json.gz), [build-only JSON](tabs/build/results.json.gz) |
| Maps | Четыре viewport/theme profiles и пять сценариев восстановления mount `PASS`; synthetic reads и native history. | [Полный JSON](maps/results.json.gz) |

В [acceptance plan](acceptance-plan.json), SHA256 `853bc181d9f4e4db33f5676b4efd515a49cb89210a2f5e79cb307e08aecba42e`, A1 проверяет обычное открытие оценки внутри владеющего modal, фокус editable input, отсутствие вложенной формы и отмену Escape с сохранением Task/значения и возвратом фокуса. A2 проверяет cleanup owner/anchor и прежние callback/menu contracts. A3 проверяет горизонтальное размещение input, единиц, подсказки и действий до ввода текста. Успешные синтетические callbacks не означают backend persistence. План скопирован без правок и совпадает с frozen Git source и `planSHA256` результата.

Среда — native Chromium 151.0.7922.34, Playwright 1.62.1, Node v24.20.0, Vite 8.3.0, Ubuntu 24.04, `ru-RU`, UTC, DPR 1. DS `0.6.0-vnext.54`: 176 установленных файлов совпали с tar SHA `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`. Режим text200 меняет HTML root font-size; это не browser zoom. Применялись обычные click/keyboard без force, исправления фокуса/scroll, перестановки DOM или retries. `pageErrors` и `externalRequests` пусты во всех трёх browser results; в Estimate также пуст `consoleErrors`.

## Кадры собственных сценариев оценки

Все 20 PNG сохранены побайтно; каждая пара показывает состояние после открытия и итог того же сценария. Ссылки позволяют проверить реальное состояние и предел автоматических assertions без реконструкции screenshots.

| Сценарий | Открытие | Итог |
|---|---|---|
| `task-desktop-light` | [После открытия](estimate/browser/task-desktop-light-after-open.png) | [Конечное состояние](estimate/browser/task-desktop-light-final.png) |
| `task-narrow-light` | [После открытия](estimate/browser/task-narrow-light-after-open.png) | [Конечное состояние](estimate/browser/task-narrow-light-final.png) |
| `task-narrow-dark` | [После открытия](estimate/browser/task-narrow-dark-after-open.png) | [Конечное состояние](estimate/browser/task-narrow-dark-final.png) |
| `task-narrow-text200` | [После открытия](estimate/browser/task-narrow-text200-after-open.png) | [Конечное состояние](estimate/browser/task-narrow-text200-final.png) |
| `outside-time-save` | [После открытия](estimate/browser/outside-time-save-after-open.png) | [Конечное состояние](estimate/browser/outside-time-save-final.png) |
| `outside-points-keyboard-cancel` | [После открытия](estimate/browser/outside-points-keyboard-cancel-after-open.png) | [Конечное состояние](estimate/browser/outside-points-keyboard-cancel-final.png) |
| `outside-menu-keyboard` | [После открытия](estimate/browser/outside-menu-keyboard-after-open.png) | [Конечное состояние](estimate/browser/outside-menu-keyboard-final.png) |
| `owner-close` | [После открытия](estimate/browser/owner-close-after-open.png) | [Конечное состояние](estimate/browser/owner-close-final.png) |
| `owner-removal` | [После открытия](estimate/browser/owner-removal-after-open.png) | [Конечное состояние](estimate/browser/owner-removal-final.png) |
| `anchor-removal` | [После открытия](estimate/browser/anchor-removal-after-open.png) | [Конечное состояние](estimate/browser/anchor-removal-final.png) |

## Companion PNG: новые копии и повторное использование

Все 119 PNG трёх artifacts доступны offline: 105 новых копий и 14 ссылок на уже tracked Git originals с точным byte equality. В Tabs 64 несовпавших PNG скопированы в `tabs/browser/`; 14 совпавших показаны ниже. Все 21 Maps PNG сохранены в `maps/`. Имена и байты оригиналов не изменялись. Полные raw→preserved path maps содержатся в [Tabs provenance](tabs/provenance.json), [Maps provenance](maps/provenance.json) и [Estimate provenance](estimate/provenance.json); `preservedAs` задан относительно `docs/implementation/2026-10-12`.

| Имя в Tabs artifact | Побайтно совпадающий Git original |
|---|---|
| `browser/desktop-dark-board-task-panel.png` | [Существующий оригинал](../../task-first-screen/evidence/desktop-dark-board-task-panel.png) |
| `browser/desktop-dark-board-work-panel.png` | [Существующий оригинал](../tabs/evidence/visual/after/desktop-dark-board-work-panel.png) |
| `browser/desktop-dark-wiki-draft-preserved.png` | [Существующий оригинал](../tabs/evidence/visual/after/desktop-dark-wiki-draft-preserved.png) |
| `browser/desktop-light-board-task-panel.png` | [Существующий оригинал](../tabs/evidence/visual/after/desktop-light-board-task-panel.png) |
| `browser/desktop-light-minimal-short-Home.png` | [Существующий оригинал](../tabs/evidence/visual/after/desktop-light-minimal-short-Home.png) |
| `browser/desktop-light-nested-nested-task.png` | [Существующий оригинал](../tabs/evidence/visual/after/desktop-light-nested-nested-task.png) |
| `browser/desktop-light-wiki-draft-preserved.png` | [Существующий оригинал](../tabs/evidence/visual/after/desktop-light-wiki-draft-preserved.png) |
| `browser/narrow-dark-board-task-panel.png` | [Существующий оригинал](../tabs/evidence/visual/after/narrow-dark-board-task-panel.png) |
| `browser/narrow-dark-wiki-draft-preserved.png` | [Существующий оригинал](../tabs/evidence/visual/after/narrow-dark-wiki-draft-preserved.png) |
| `browser/narrow-light-board-task-panel.png` | [Существующий оригинал](../../task-first-screen/evidence/narrow-light-board-task-panel.png) |
| `browser/narrow-light-board-work-panel.png` | [Существующий оригинал](../tabs/evidence/visual/after/narrow-light-board-work-panel.png) |
| `browser/text200-light-board-task-panel.png` | [Существующий оригинал](../tabs/evidence/visual/after/text200-light-board-task-panel.png) |
| `browser/text200-light-minimal-long-End.png` | [Существующий оригинал](../tabs/evidence/visual/after/text200-light-minimal-long-End.png) |
| `browser/text200-light-wiki-draft-preserved.png` | [Существующий оригинал](../tabs/evidence/visual/after/text200-light-wiki-draft-preserved.png) |

Сопоставление использовало SHA и фактическое равенство байтов. Существующие файлы также сверены с tracked HEAD, поэтому ссылки не опираются на незакоммиченные подмены. Совпадение PNG не заменяет новые raw results: каждый companion JSON сохранён целиком с собственным checkout и датой запуска.

## Происхождение и полный архивный инвентарь

| Artifact | Run/job | ZIP SHA256 | Файлы |
|---|---|---|---:|
| Estimate `11740684903` | [Native run 38238395802](https://github.com/it-novikov/iquipage-design-system/actions/runs/38238395802), job `114774633940` | `a40d26f6293649b85a02a4b4781f96ddd8ab58956e46764519c660a4ad6d599f` |38|
| Tabs `11741850248` | Тот же native run/job | `2ffc8587ea170f84ec4cbe99aab5b085c75cd6c19951a0fbdb926e4e6aa40568` |80|
| Maps `11741144568` | [Maps run 38238395764](https://github.com/it-novikov/iquipage-design-system/actions/runs/38238395764), job `114774634048` | `20ad5bb2658b2d04b11e62a4184a72ca995acacfd5da9c870e4b61a1ba441a2b` |22|

- [Полный native job log](jobs/native.log.gz), uncompressed SHA256 `c7f77d1ad2e92a6cd55eee63adbcef5bf6b68c43681de7e60cc6f0db9490bf46`; он охватывает Estimate и Tabs.
- [Полный Maps job log](jobs/maps.log.gz), uncompressed SHA256 `e3fb5437e97d95e39476ead0e6a4461110c3f50a3051de5289d3ac3923915b97`. Исходная JSON-строка декодирована в UTF-8 без добавления перевода строки.
- [Общий provenance](provenance.json) связывает metadata checkout, native scopes, hashes raw JSON, журналы и три пофайловых инвентаря.

Все 140 архивных файлов побайтно сверены с ZIP; ZIP digests и размеры совпали с API metadata. Все четыре JSON и два журнала сохранены целиком через lossless gzip с `mtime=0`, roundtrip проверен. Для 17 compiled assets Estimate сохранены полный hash/size inventory, сами build outputs в Git не копируются. Ни один PNG не перерисован или перекодирован.

`visualInspection`, `humanAcceptance` и `backendAcceptance` в исходном Estimate JSON — `NOT_RUN`. [Отдельный native R2](reviews/estimate-fix-native-review.md) добавляет независимый просмотр 12 candidate PNG и прежней пары отказа, сохраняя raw JSON неизменным; его вывод ограничен указанным A1–A3 scope. Полное сохранение Task, authentication, backend persistence, наблюдение за пользователем, окончательная эстетическая приёмка, performance benchmark, real browser zoom, Safari/Firefox/iOS и screen readers этим набором не подтверждены. Релизные проверки остаются отдельным этапом. Новые проверки исправленного кода и будущие review оформляются отдельными доказательствами; сохранённые оригиналы не редактируются.
