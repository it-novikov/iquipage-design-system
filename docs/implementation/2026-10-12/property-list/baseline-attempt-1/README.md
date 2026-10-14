# Property-list: baseline attempt 1 — FAILED

**Все пять профилей завершились `FAILED` на assertion `Actual value surface: status`.** Это не состоявшаяся приёмка baseline и не проверка нового CSS. Сборка прошла; до отказа записаны частичные измерения и реальные PNG. Все исходные статусы, значения и сообщения сохранены без исправления.

## Точная версия и причина отказа

| Поле | Значение |
| --- | --- |
| PR / run / job | [PR86](https://github.com/it-novikov/iquipage-design-system/pull/86), [38243334999 / 114791052857](https://github.com/it-novikov/iquipage-design-system/actions/runs/38243334999/job/114791052857) |
| Head | `3f9e8992c057e0548245f7dca7c089e7e345d4be` |
| Фактический checkout | `5a718c668efadbe7450cb1169e8eefca14224781` |
| Полное дерево head и checkout | `629e80459d8f7f7c7d0e95c9c917cdfa3ec9b03f` |
| DS | `@iquipage/web@0.6.0-vnext.54`, 176 установленных файлов сверены исходным runner |
| DS archive SHA-256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Plan revision / SHA-256 | 2 / `724f1e889dc621e178ee173cb4ef8fa1fbfd190b0249decc208e75cc89de5582` |

Checkout подтверждён [exact job log](jobs/verify.log.gz), исходными результатами и [Git API metadata](metadata.json); одинаковый tree head дополнительно прочитан из Git. Этот branch происходит от кандидата Estimate `6423443…`; он не является новым main `4f181ff…` с продуктовым VT1.

В frozen [measure.mjs, строка 94](https://github.com/it-novikov/iquipage-design-system/blob/3f9e8992c057e0548245f7dca7c089e7e345d4be/experiments/property-list-reflow/measure.mjs) пассивный селектор ищет `.iq-select-trigger` и `.iq-combo-shell` прямо под строкой. В actual public [components.js, строка 148](https://github.com/it-novikov/iquipage-design-system/blob/3f9e8992c057e0548245f7dca7c089e7e345d4be/libraries/iquipage/src/modules/components.js) обе поверхности находятся внутри существующего `.iq-select-wrap`. Поэтому у `status`, `owner`, `priority`, `participant` и `reference-owner` поле измерителя `value` равно `null`, хотя public controls зарегистрированы и их `controlValue` записаны. У date/tag/static поверхностей measurements присутствуют.

Отказ происходит в [run.mjs, строка 73](https://github.com/it-novikov/iquipage-design-system/blob/3f9e8992c057e0548245f7dca7c089e7e345d4be/experiments/property-list-reflow/run.mjs) при первой проверке value. `value: null` означает пропущенный селектором DOM-узел; его нельзя трактовать как исчезнувшее значение у пользователя. Нули в зависимых geometry relations также не доказывают отсутствие наложений: часть поверхностей не измерена. Следующее исправление наблюдающего селектора вынесено отдельно; fixture, DS, plan и assertions не исправляются задним числом в этом пакете. Успешный повтор здесь не заявлен.

## Что доступно для чтения

[Полный results.json.gz](browser/results.json.gz) содержит конечный `FAILED`, все профили, measurements, failure measurements, provenance и ошибки. [Исходный browser/provenance.json.gz](browser/provenance.json.gz) — более ранний source/build snapshot со статусом `NOT_RUN`; это не итог browser run. Отдельные исходные profile JSON тоже сохранены полностью: [wide-normal](browser/wide-normal.json.gz), [narrow-normal](browser/narrow-normal.json.gz), [wide-text200](browser/wide-text200.json.gz), [wide-tight-text200](browser/wide-tight-text200.json.gz), [narrow-text200](browser/narrow-text200.json.gz).

| Профиль | Viewport | Ширина host | Root font | Исходные виды кадра → сохранённые bytes |
| --- | --- | --- | --- | --- |
| narrow-normal | 390 × 1000 | 349 px | 16 px | [viewport](browser/narrow-normal-document.png), [document](browser/narrow-normal-document.png), [failure](browser/narrow-normal-document.png) |
| narrow-text200 | 320 × 1000 | 270 px | 32 px | [viewport](browser/narrow-text200-viewport.png), [document](browser/narrow-text200-document.png), [failure](browser/narrow-text200-document.png) |
| wide-normal | 1280 × 1000 | 615 px | 16 px | [viewport](browser/wide-normal-document.png), [document](browser/wide-normal-document.png), [failure](browser/wide-normal-document.png) |
| wide-text200 | 1280 × 1000 | 615 px | 32 px | [viewport](browser/wide-text200-document.png), [document](browser/wide-text200-document.png), [failure](browser/wide-text200-document.png) |
| wide-tight-text200 | 1280 × 1000 | 270 px | 32 px | [viewport](browser/wide-tight-text200-viewport.png), [document](browser/wide-tight-text200-document.png), [failure](browser/wide-tight-text200-document.png) |

В 15 исходных PNG — семь различных SHA-256. Ссылки для одинаковых `viewport/document/failure` намеренно ведут на один канонический файл с теми же байтами. [Package provenance](provenance.json) содержит mapping каждого оригинального имени, размер и SHA; поле `screenshots[].file` в неизменённых raw JSON остаётся исходным. PNG не перерисовывались. Агент сохранения самостоятельно не заявляет визуальную оценку этих кадров.

Все профили используют native Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `v24.20.0`, light/comfortable, ru-RU, UTC. Root 32 px — увеличение корневого текста, не browser zoom. В исходных results нет page/console errors, внешних запросов или зарегистрированных изменений исходника; input сценарии не выполнялись. Эти факты не делают неполный geometry capture успешным.

## Сохранность и границы

ZIP artifact `11743199083`: **1 928 607 B**, SHA-256 `a5c0d5b245f113f57f94ebfaf776daffff00dd2e644c2214adf81026d46c7a74`. Все 26 файлов сверены с extracted bytes. Семь полных исходных JSON и exact JSON-decoded UTF-8 job log сжаты lossless gzip с `mtime=0`; проверены SHA и обратная распаковка без добавленного newline. Для чтения: `gzip -dc <path>` или `gzip.decompress`.

Четыре compiled output файла сохранены только как SHA/bytes inventory (`preserved: false`); ZIP-контейнер и runnable bundle в Git не копируются. Все JSON и все исходные PNG bytes доступны offline через mapping. Metadata перечисляет также companion artifacts Tabs/Estimate; их наличие в API не означает, что они сохранены этим пакетом. Подписанные ссылки скачивания не включены.

`targetAcceptance`, `humanAcceptance` и `backendAcceptance` остаются `NOT_RUN`. Новый reflow вариант, весь реальный Task, persistence, permissions, human readability и релизные платформы этим failed baseline не проверены. [Discovery](../discovery.md) и [исходное предложение](../reviews/proposal-initial.md) описывают проблему и будущие варианты отдельно.
