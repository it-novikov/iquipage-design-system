# Ревью private56 — порядок и переносимые ссылки

**Текущий результат native R2 — CHANGES_REQUESTED, adoption NOT_APPROVED.** Все оригиналы сохранены без редактирования текста и внутренних путей. Их прежние формулировки фиксируют соответствующий момент работы; они не переопределяют текущий статус.

| Оригинал | Самостоятельная роль | Вердикт в своём scope |
|---|---|---|
| [Source R1 original](source-R1/original.md) | Первый независимый source reviewer, private55 | CHANGES_REQUESTED: противоречивый README и чрезмерная применимость frozen trial |
| [Source R1 corrected addendum](source-R1/corrected-addendum.md) | Тот же R1 reviewer проверил исправления private56 | APPROVED_FOR_NATIVE; default/эстетика/adoption не приняты |
| [Source R1 historical wrapper](source-R1/README.md) и [provenance](source-R1/provenance.json) | Исходная связка original55 → corrected56 | Сохранён исторический native NOT_RUN; новый native результат находится отдельно |
| [Native R2 original](native-R2/original.md) | Второй независимый reviewer, точная поставка54/56 и реальные Chromium PNG | CHANGES_REQUESTED: три P2, один P3; geometry/keyboard PASS сохранены |

Corrected addendum не является третьим независимым рецензентом. Аналитические пользовательские, дизайнерские, инженерные и AI-integrator роли внутри оригиналов — спор перспектив, не вымышленные участники human research. Основное разрешение спора: сохранить полное чтение и работу редакторов, исправить конкретные лишние переносы/оси, а A3 уточнить отдельным capture того же56. B остаётся альтернативой, не выбранной без отрисовки. [Полный R2](native-R2/original.md), [текущий пакет](../README.md).

## Проверка оригиналов

- Native R2: 51 102 байта, SHA-256 `ecb66d5d4218fca7193ff7ccb7d7dd3bdc540d640e6568b3f6e793d3e46ed56f`.
- Source R1 original: 30 160 байт, SHA-256 `0a07165199fc25e56665bdd937289ff45eb1d55549c913a6bd35c1c305805dc9`.
- Source R1 addendum: 18 173 байта, SHA-256 `655b2b73dbcb24b7851e4c1b6a1f8020b486eeccfad1fc5292d83294be25474c`.
- [Collection index R2](native-R2/collection-index.json): 84 оригинала, включая67 ZIP members. [Integrity R2](native-R2/integrity.json) подтверждает identities и completeness; его PASS не является UX PASS.

Все84 native collection originals сопоставлены с новым пакетом. Для16 compiled members сохранён inventory без их bytes; остальные оригинальные bytes доступны identity/gzip, в том числе оба представления job log. Пять повторяющихся PNG имени имеют точный общий target. Collection index и integrity sidecar также сохранены без правок.

## Все15 локальных ссылок внутри native R2

Исходный R2 оставлен побайтно неизменным; его ссылки `property-list-private56-native-r2/...` относятся к первоначальной scratch-композиции. В этом Git-пакете используйте следующие переносимые counterparts. Исторические абсолютные paths в JSON разрешаются через supporting/source mapping в [provenance](../provenance.json).

| Ссылка оригинала | Сохранённый counterpart |
|---|---|
| `property-list-private56-native-r2/artifact-inventory.json` | [artifact inventory](../metadata/artifact-inventory.json) |
| `property-list-private56-native-r2/jobs.json` | [job metadata](../metadata/jobs.json) |
| `property-list-private56-native-r2/artifacts.json` | [artifact metadata](../metadata/artifacts.json) |
| `property-list-private56-native-r2/native-job.log` | [native job log](../jobs/native.log.gz) |
| `property-list-private56-native-r2/artifact/browser/control/results.json` | [control54 raw results](../artifact/browser/control/results.json.gz) |
| `property-list-private56-native-r2/artifact/browser/candidate/results.json` | [candidate56 raw results](../artifact/browser/candidate/results.json.gz) |
| `property-list-private56-native-r2/pre-native-frozen-inputs-c3e4c20.json` | [pre-native frozen inputs](native-R2/evidence/pre-native-frozen-inputs-c3e4c20.json.gz) |
| `property-list-private56-native-r2/native-provenance-integrity.json` | [native provenance integrity](native-R2/evidence/native-provenance-integrity.json.gz) |
| `property-list-private56-native-r2/merge-commit.json` | [actual merge metadata](../metadata/merge-commit.json) |
| `property-list-private56-native-r2/merge-tree.json` | [actual recursive tree](../metadata/merge-tree.json.gz) |
| `property-list-private56-native-r2/head-commit.json` | [head metadata](../metadata/head-commit.json) |
| `property-list-private56-native-r2/geometry-review-metrics.json` | [geometry review metrics](native-R2/evidence/geometry-review-metrics.json.gz) |
| `property-list-private56-native-r2/independent-comparison-checks.json` | [independent comparison checks](native-R2/evidence/independent-comparison-checks.json) |
| `property-list-private56-native-r2/artifact/browser/comparison.json` | [machine comparison](../artifact/browser/comparison.json.gz) |
| `property-list-private56-native-r2/primary-source-notes.json` | [primary source notes](native-R2/primary-source/primary-source-notes.json) |

## Primary source и границы старых R1-путей

[Source notes](native-R2/primary-source/primary-source-notes.json), [Playwright screenshotter.ts](native-R2/primary-source/playwright-v1.62.1-screenshotter.ts.gz) и [Chromium crPage.ts](native-R2/primary-source/playwright-v1.62.1-crPage.ts.gz) содержат точные source bytes/headers версии1.62.1 и исходные URL. Transport duplicate не сохранялся. Эти источники объясняют `captureBeyondViewport`; точная причина/длительность stale native состояния остаётся предметом NR2-01 diagnostic.

Scratch-ссылки source R1 к ранним patch/build outputs описывают его исходные checkpoints; этот preservation не выдаёт все прежние временные worktrees за скопированные в Git. Original/addendum, их provenance и historical wrapper сохранены полностью. Опубликованные источники соответствующего опыта и локальные evidence JSON доступны по [frozen PR91 head](https://github.com/it-novikov/iquipage-design-system/tree/945169fff6fd7e38b081a76a0e20d71b3956a365/.bridge/tasks/20261012-property-list-readable-layout). Предшествующая published private55 основа — [b03422ab](https://github.com/it-novikov/iquipage-design-system/commit/b03422ab5289bb936b385489a5d017e18bd1bb98).

A3 не исправлен в старом raw и не закрыт визуально переименованным screenshot. Будущий diagnostic и будущая изменённая поставка имеют отдельные версии/контрольные точки.
