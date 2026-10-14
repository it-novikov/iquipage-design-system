# Независимые ревью actual Task и компактной сводки

**Сначала прочитайте [исправление диагноза оценки](task-estimate-source-correction-attempt3.md).** В раннем [source diagnosis](task-estimate-source-diagnosis.md) неверно определён момент отказа: attempt2 прошёл ожидание открытия popover, затем завис на ожидании его **закрытия после Escape**. Точная позиция — frozen `run.mjs:217:54`. Attempt3 подтвердил: Task закрывается, а popover оценки остаётся открытым. Ранний отчёт сохранён неизменным для истории; его opening-timeout трактовка отозвана автором в отдельном исправлении.

Этот каталог сохраняет шесть исходных Markdown-документов и четыре связанных raw-файла без изменения байтов, ссылок и путей. Только этот README — новая навигационная обёртка. Сохранение не переоценивает выводы ревьюеров и не превращает source approval в native или пользовательскую приёмку.

## Документы и их назначение

| Документ | Что в нём зафиксировано |
|---|---|
| [Независимая исходная позиция](task-first-screen-native-review-initial-position.md) | Позиция визуального ревьюера по 14 actual кадрам attempt2 до обсуждения с автором. |
| [Полный visual review и спор ролей](task-first-screen-native-review.md) | Сопоставление семи пар, польза для обычной Task, пространственная цена длинной review-сводки, аргументы читателя, планировщика, проверяющего и владельца DS. Решение — продолжить адресную пробу, а не принять VT1 универсально. |
| [Обсуждение узкой сводки](task-first-screen-narrow-debate.md) | Альтернативы следующего эксперимента и причины выбранного направления; состояние документа относится к моменту до нового рендера. |
| [Ранний диагноз оценки](task-estimate-source-diagnosis.md) | Исторические source-гипотезы. Читайте вместе с поправкой; трактовка opening timeout неверна. |
| [Исправление по attempt3](task-estimate-source-correction-attempt3.md) | Отзыв неверной трактовки, точная привязка runner и native traces, выводы о lifecycle/focus и обрезании содержимого popup. Исправление продукта этим отчётом не принято. |
| [Compact source R2](compact-source-R2/task-compact-source-review.md) | `approve-for-comparative-render` для точного compact overlay; runtime, visual, native и human acceptance не подтверждаются этим source review. |

## Raw evidence compact source R2

- [source-manifest.json](compact-source-R2/source-manifest.json) — baseline, patch SHA, hashes исходных и patched модулей, записанные команды и результаты.
- [observe.mjs](compact-source-R2/observe.mjs) — неизменённый скрипт независимых source observations.
- [escape-source.txt](compact-source-R2/escape-source.txt) — точный извлечённый helper escaping, использованный в наблюдениях.
- [source-observations.json](compact-source-R2/source-observations.json) — 15 excerpt cases и 10 projection cases. Это pure source observations с заменой `ui.btn` инертным маркером, без DOM и жизненного цикла настоящей кнопки.

Скрипт содержит исходные абсолютные пути. Он сохранён как свидетельство проведённой проверки и не обещает запуск из произвольного каталога. Для повторения нужно создать отдельный checkout baseline `8f8d218168074bd4c7c9e1e29dfbe783a27998dd`, применить [точный compact overlay](https://github.com/it-novikov/iquipage-design-system/blob/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen/vt1-compact.patch) с SHA256 `5ef3ceaa010ea0ed726e0e6067c55822708c3ed4bcde16ecc63cc6b16c8d6c5f`, сверить три patched SHA с manifest и настроить пути в отдельной рабочей копии скрипта. Сохранённые оригиналы этого пакета не редактируются. Временный репозиторий и полные копии production modules сюда не включены.

## Переносимые соответствия исходных путей

Ссылки внутри оригиналов намеренно остались такими, какими были у авторов. Для чтения вне исходного workspace используйте эту карту.

| Упоминание в оригиналах | Сохранённый или точный источник |
|---|---|
| `task-prototype-attempt2-11739432628/results.json` и кадры рядом | [Attempt2: README и карта кадров](../attempt-2/README.md), [полный JSON в lossless gzip](../attempt-2/results.json.gz) |
| `task-prototype-attempt3-11739838266/results.json` и кадры рядом | [Attempt3: README и карта кадров](../attempt-3/README.md), [полный JSON с traces](../attempt-3/results.json.gz) |
| `task-first-screen-native-review-initial-position.md`, `task-first-screen-native-review.md` | [Исходная позиция](task-first-screen-native-review-initial-position.md), [полный review](task-first-screen-native-review.md) |
| `task-estimate-source-diagnosis.md` | [Исторический диагноз](task-estimate-source-diagnosis.md); актуализирующая [поправка](task-estimate-source-correction-attempt3.md) обязательна для интерпретации |
| `task-first-screen-review.md`, `task-first-screen-design-addendum.md` | [Предыдущее независимое review дизайна](../../independent-review.md), [уточнение дизайна](../../design-refinement.md) |
| `task-prototype-source-review.md` | [Frozen source R1](https://github.com/it-novikov/iquipage-design-system/blob/0c74ab69487fa5d7ec66ead92400043901e85af2/.bridge/tasks/20261012-task-first-screen-prototype/reviews/source-R1/independent-review.md), SHA256 `8063c59009c4ec8a1861999e370aeb1558e4ebf17b112e0856efe8bfdc31e28f` |
| `repo-tabs/products/sprintique/ui/src/…` | Frozen product `8f8d218…`: [task-dialog.js](https://github.com/it-novikov/iquipage-design-system/blob/8f8d218168074bd4c7c9e1e29dfbe783a27998dd/products/sprintique/ui/src/board/task-dialog.js), [estimate.js](https://github.com/it-novikov/iquipage-design-system/blob/8f8d218168074bd4c7c9e1e29dfbe783a27998dd/products/sprintique/ui/src/estimate.js), [popover.js](https://github.com/it-novikov/iquipage-design-system/blob/8f8d218168074bd4c7c9e1e29dfbe783a27998dd/products/sprintique/ui/src/popover.js) |
| Исходный `libraries/iquipage/src/styles/work-story.css` | [Frozen DS work-story.css](https://github.com/it-novikov/iquipage-design-system/blob/8f8d218168074bd4c7c9e1e29dfbe783a27998dd/libraries/iquipage/src/styles/work-story.css) |
| `task-compact-source-review-temp/{source-manifest.json,observe.mjs,escape-source.txt,source-observations.json}` | Четыре файла в `compact-source-R2/`, ссылки выше |
| `task-compact-source-review-temp/products/sprintique/ui/src/board/{task-dialog.js,task-work-view.js,work-model.js}` | Восстанавливаются из frozen baseline и точного compact overlay; hashes приведены в [source manifest](compact-source-R2/source-manifest.json) |

Все десять оригиналов повторно сверены по SHA256 и побайтному равенству исходникам; wrapper-ссылки на локальные файлы проверены. Набор не содержит новый native run компактного варианта и не заменяет последующую оценку его реального первого экрана, отмены оценки или сохранения данных. Source R2, visual review attempt2 и native результаты attempt2/3 остаются отдельными видами доказательств со своими границами.
