# Task Compact: состояние, следующий шаг и полный результат

Этот regression открывает настоящую Task через `openTaskDialog` на неизменённом runtime [PR90 5bd09d6](https://github.com/it-novikov/iquipage-design-system/tree/5bd09d647f79f06c7a7c844f91a6914907ed8e8b) и проверяет компактную сводку с DS54. Участник должен сразу различить проверку результата, вопрос к нему, вопрос без права ответа и незавершённый шаг; одна команда сводки ведёт к нужному S1 или Q1, где доступен полный текст. Synthetic только bootstrap и ответы чтения. Продуктовые renderer, модель, CSS, данные и права этим test-only изменением не исправляются.

## Почему нужен отдельный сценарий

Зелёный [Tabs/Estimate job PR90](https://github.com/it-novikov/iquipage-design-system/actions/runs/38253043338) использовал `workPlan:null`: он не открывал изменённую агентную сводку. Corrected [runner PR88](https://github.com/it-novikov/iquipage-design-system/blob/1fd928e12b43b26f29ebcb190a5595c1d2618444/products/sprintique/tests/task-overview-state-browser.mjs) уже проверял пять semantic состояний и два long кадра, но ожидал другой heading и preview160. Его native PASS относится к PR88, а не к Compact. Здесь перенесён только проверочный слой с новыми точными ожиданиями; runtime PR88 не переносится поверх90.

План [acceptance-plan.json](acceptance-plan.json), revision3, SHA256 `acd56ea3aef4666275b5691482e6c82880e01a8cbd10f4d70d2bf8d53b093503` закреплён до адаптации runner и любого native исполнения. Root получил digest отдельно. [v1](acceptance-plan.v1.json) SHA256 `9f18f4a523f032847666a35b4d7394eb7fbac0ae1551ecc479d3811dfb2dd5a8` и [v2](acceptance-plan.v2.json) SHA256 `66780241ab4de4b154e77520440632e839bf9cb865ad4dfd93ba443eb2fc186d` сохранены побайтно из PR88. Цепочка v3→v2→v1 проверяется по правильным файлам; исторические scope и результаты не переименовываются.

[Карточка с provenance reconciliation](../../../../../.bridge/tasks/20261012-task-compact-state-regression/task.md) описывает разрешение, причину, варианты и независимые ревью. Reconciliation оригинал сохранён там; его отдельная scratch-коллекция не объявляется Git-артефактом.

## Что проверяется

Все пять прежних semantic случаев сохранены. Шестой, `question-can-answer`, добавлен до реализации как контраст permissions, подписи CTA и фокуса для того же Q1.

| Сценарий | Heading сводки | Единственная команда | Смысл перехода |
| --- | --- | --- | --- |
| completed-rejected | Работа агента · Кодекс | Открыть работу, secondary | Точный выбранный шаг и «Нужна доработка»; без ложного завершения в сводке |
| completed-blocked | Работа агента · Кодекс | Открыть работу, secondary | Точный выбранный шаг и «Нужен ответ»; без ложного завершения в сводке |
| review-literal | Результат на проверке · Кодекс | Проверить результат, primary, review:S1 | Открыт S1, фокус на его summary, полный буквальный result; решение не принимается |
| question-no-answer | Агент ждёт ответа · Кодекс | Открыть вопрос, secondary, question:Q1 | Фокус на заголовке Q1; поля недоступны и answer command отсутствует |
| question-can-answer | Нужно ваше решение · Кодекс | Ответить агенту, primary, question:Q1 | Фокус на существующем enabled O1 input внутри Q1; доступна форма, ответ не выбран и не отправлен |
| genuine-complete | Работа агента · Кодекс | Открыть работу, secondary | Основной текст «Работа завершена» и прежний полный session summary |

Каждый случай начинает с native modal Task и вкладки «Задача», затем обычным pointer-кликом использует её CTA. Проверяются настоящий Work panel/tab, точная выбранная identity, отсутствие decision/new-question controls в сводке, нулевые write attempts/unsupported operations/browser errors/off-origin requests и факт точного scenario GET. Q1 имеет приоритет над ожидающим review S1 в обоих permission вариантах. Наличие UI-разрешения не доказывает серверное enforcement.

В Compact `.task-work-status` расположен на h3. Snapshot измеряет **heading** и **extraStatus paragraph** отдельно; отсутствие дополнительного p проверяется без ошибочного требования убрать статусный heading.

### Буквальный текст — различающий оракул

Исходные 69 code points сохранены:

```text
История «<em>готово</em> &amp; проверено» сохранена после обновления.
```

Независимое точное ожидание preview — 58 code points, заранее записанных в fixture и плане:

```text
История «<em>готово</em> &amp; проверено» сохранена после…
```

Label — «Начало результата». В preview ровно один element child, label `SPAN`, и ноль `em` elements; полный S1 показывает исходную строку без дочерних markup elements. Поэтому потеря окончания, ошибочная интерпретация `<em>` или декодирование `&amp;` по-прежнему различимы. Оракул не вычисляет ожидание через продуктовый `workResultPreview`, не заменяет exact equality на includes или проверку длины.

### Длинные кадры и работа человека

`long-review-desktop`1280×900 и `long-review-narrow`390×844 сохраняют прежние Task properties, длинный title и result. Снимок делается до перехода или прокрутки. Raw measurements содержат summary/heading/title/CTA/preview, четыре первых свойства, disclosure и его text ranges, description, scrollports и scroll positions. Статус этих случаев — `CAPTURED`, без порога «приоритет обязан помещаться» и без автоматического Compact approval.

Независимый native рецензент смотрит реальные PNG: что первым привлекает внимание, понятен ли следующий шаг, помогает ли prefix оценить результат, различаются ли контекст и действие, доступны ли ожидаемые свойства, нет ли clipping/налезания. Естественный перенос длинного heading допустим: «одна строка состояния» — структура информации, не запрет переноса текста. Меньшая высота сама по себе не доказывает хороший дизайн. Численные выигрыши PR82/88 не переносятся на90; before/after возможен только при подтверждённой сопоставимости данных и среды.

## Запуск и provenance

Из `products/sprintique`:

```sh
node tests/task-overview-state-browser.mjs --build-only
PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node tests/task-overview-state-browser.mjs
```

Используются существующие workflow Node24.20.0, Playwright1.62.1 и установленный native Chromium на Ubuntu24.04. Два companion steps после Tabs/Estimate имеют `!cancelled()` и сохраняют evidence при локальном отказе другого шага; существующие проверки не ослабляются. Новый dependency или browser setup не добавляется. В ограниченной локальной среде запускаются meaningful source/model/boundary/build-only checks; известные ограничения Chromium/TS7/JDK25/PG18 повторно не обходятся.

Среда остаётся light/comfortable/root16, ru-RU/UTC, DPR1, 100% browser zoom, reduced motion, fixed `2026-10-12T12:00:00.000Z`. `page.clock.setFixedTime` оставляет обычные timers. Pointer click не доказывает keyboard traversal или `:focus-visible`.

По умолчанию выход — `output/task-overview-state/{build-only,browser}`. `TASK_OVERVIEW_EVIDENCE_DIR` задаёт другой output, `TASK_OVERVIEW_SOURCE_REVISION` — независимо переданный CI checkout SHA. Native требует чистые committed source inputs. Build-only сохраняет реальный HEAD и список незакоммиченных входов, не выдавая их за committed build.

Сохраняются actual Git revision/whole tree, plan hash, source hashes, каждое установленное DS54 содержимое сверяется с exact tar SHA256 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`. Vite собирает actual production modules, сохраняя все физические module-input и output hashes. Положительные invariants требуют присутствия Task dialog/renderer/model/fixture consumer; прежние197 inputs — историческое наблюдение, не магическая константа. Product root нормализован, исправление R1 против прежних136 dependency-only inputs сохранено.

До браузера пишутся provenance и fixture data. Каждый кейс и raw capture сохраняются до закрытия context, включая ошибки. Скриншот viewport не принуждает scroll. Rectangles/text ranges описывают геометрию, а не точные painted glyph masks.

## Границы вывода и оставшаяся работа

`nativeAcceptance: PASS` означает только выполненные semantic assertions и завершённые captures на **своём** actual source. `compositionAssessment`, `visualInspection`, `humanAcceptance`, `backendAcceptance` остаются `NOT_RUN` до соответствующей отдельной работы. Source R1 предшествует публикации; native visual R2 должен смотреть свежие кадры. Этот test-only PR не принимает Compact автоматически.

- **F1:** длинная композиция — оценить текущие размеры и hierarchy, не ссылаться на старый выигрыш.
- **F2:** неоднозначность session/step статусов в полном Work остаётся открыта. Regression сохраняет existing full heading как boundary, не объявляет wording правильным.
- **F3:** форма без права ответа всё ещё нуждается в понятной причине недоступности. Проверка поля не закрывает этот UX вопрос.
- **D1:** BODY focus после общего Open work остаётся диагностикой; без отдельного Tab/ShiftTab прохода это не доказанный keyboard failure. Точный Q1/S1 focus проверяется здесь.

Backend writes/grants, agent execution, create/type/template/disclosure redesign и другие flows вне scope. Реальные Safari/Firefox/iOS/VoiceOver проверяются перед релизом; объясняющий онбординг остаётся последним и требует отдельного согласования.
