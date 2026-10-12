# Compact attempt1: отдельная проба компактной review-сводки

**14 начальных кадров — `CAPTURED`; четыре сценария существующих CTA прошли engineering assertions; два сценария отмены оценки — `FAILED`. Общий результат — `FAILED`.** Это первый native пакет `vt1-compact` на прежнем frozen baseline. Он не подменяет original VT1 и не является универсальной визуальной или пользовательской приёмкой.

[Run 38236799696](https://github.com/it-novikov/iquipage-design-system/actions/runs/38236799696), job `114769351207`, artifact `11741081977` (`task-first-screen-compact`). Head — [`ca99680799eee8c865038d537e1bef1def6478f0`](https://github.com/it-novikov/iquipage-design-system/commit/ca99680799eee8c865038d537e1bef1def6478f0); actual checkout `e3f78e367e3caadf04f7a6d8494255b377e35b14` имеет тот же полный tree `fa3b64c091ce0acec26c1eba6da73bc43a245d34`. Checkout, tree и parents сверены с Git API metadata, исходным `results.json` и checkout SHA в полном журнале.

## Точная проба и её границы

Кандидат использует [compact overlay](https://github.com/it-novikov/iquipage-design-system/blob/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen/vt1-compact.patch), SHA256 `5ef3ceaa010ea0ed726e0e6067c55822708c3ed4bcde16ecc63cc6b16c8d6c5f`, и [отдельный план](https://github.com/it-novikov/iquipage-design-system/blob/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen/comparison-plan-compact.json), SHA256 `96ef6956176d44f21917a1133c44868290c2e5c3bc1b13d7bc366bc4b1761bd0`. Бюджет буквального excerpt в этой пробе — 64 code points; это параметр эксперимента, не принятый контракт DS. [Решение о пробе](https://github.com/it-novikov/iquipage-design-system/blob/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen/design-decision-compact.md) и [независимый compact source R2](../reviews/compact-source-R2/task-compact-source-review.md) объясняют выбор и ограничивают source approval сравнительным рендером.

Исходный `vt1.patch` остался с SHA256 `41f3852ff8d3abfc4777e3aea6ef4e229f1e15d4f46280b681b28196b2a922f5`, исходный `comparison-plan.json` — `f19b4da9ff01e9ed87d17d69d85fb89af9b734b7dc5e4964e7d5d158af60b55a`. Их bytes независимо проверены в frozen Git head. [Attempt2](../attempt-2/README.md), [attempt3](../attempt-3/README.md) и первоначальные ревью не переписаны.

| Проверка | Зафиксированный результат |
|---|---|
| Исходники, DS и fixture | Пять общих engineering checks — `PASS`: frozen product/DS trees, совпадение 176 установленных файлов с DS `.54`, overlay трёх модулей только во временных копиях, существующий task validator и две статические Vite-сборки. |
| Первые экраны | 14 кадров `CAPTURED`, все начальные assertions прошли; `body.scrollTop=0` и `window.scrollY=0`. |
| Review CTA, оба варианта | Вкладка «Работа агента», существующий шаг `focus-S1` и его фокус проверены; исходные nodes формы остаются подключёнными. Два поздних кадра сохранены. |
| Question CTA, оба варианта | Переход на вкладку работы проверен; при `canAnswer=false` отсутствуют действие ответа и доступные поля ответа. |
| Отмена семи свойств перед оценкой | Статус, исполнитель, приоритет, тип, релиз, родитель и срок открылись, закрылись через Escape и вернули фокус на trigger в обоих вариантах. |
| Отмена оценки | Open wait завершился, close wait после Escape — timeout в обоих вариантах. Итоговые проверки access-сценария после оценки не достигнуты. |
| Ошибки и обращения | `pageErrors`, `consoleErrors`, `externalRequests` пусты; шесть probes не содержат backend-command attempts или неподдержанных обращений fixture. |

## Повторяемость кадров и отказ оценки

Все **семь baseline initial PNG побайтно равны соответствующим кадрам attempt2**. Начальные **H01 и text200 кандидата побайтно равны прежнему VT1**. Сравнение выполнено по bytes и по SHA из исходного results attempt2; полный перечень пар приведён в [provenance](provenance.json). Это точное равенство файлов, а не новый вывод об удобстве интерфейса. Остальные пять candidate PNG отличаются и требуют самостоятельной визуальной оценки.

Отказ оценки относится к отмене: оба stack указывают на `run.mjs:291:54`, где после Escape ожидается `!document.querySelector('[popover]:popover-open')`. Предшествующее open wait на строке 290 прошло. SHA256 frozen runner `4e21b8ad86a9d96eb6a3317f3917b6cd6f3652da68db856622268bc93fced02b` совпадает с записью `fixtureSHA256`.

Оба пассивных trace содержат по 13 событий, `dropped=0`. Popover добавлен под `BODY` вне открытого Task modal; записанного фокуса внутри popup нет. После Escape конечное состояние содержит `modal=null`, отключённый от DOM trigger, фокус на Task card title в Board и всё ещё подключённый открытый popover. Записей `scroll` или `popup-removed` нет. В trace нет самостоятельных `keydown/cancel/close`: последовательность Escape установлена по frozen runner, стеку и конечному DOM. [Отдельное исправление раннего диагноза](../reviews/task-estimate-source-correction-attempt3.md) объясняет, почему первоначальная трактовка opening timeout была неверна. Compact-проба этот дефект не исправляет и не ослабляет oracle.

## Исходные кадры

| Сценарий | Baseline | VT1 compact |
|---|---|---|
| H01: обычная задача, 1280×720 | [Кадр](H01-baseline-initial.png) | [Кадр](H01-vt1-compact-initial.png) |
| H02: результат на проверке, 1280×720 | [Кадр](H02-baseline-initial.png) | [Кадр](H02-vt1-compact-initial.png) |
| Длинные заголовки и результат, 390×844 | [Кадр](narrow-baseline-initial.png) | [Кадр](narrow-vt1-compact-initial.png) |
| Тот же узкий сценарий, dark | [Кадр](dark-baseline-initial.png) | [Кадр](dark-vt1-compact-initial.png) |
| Text200, 1280×720 | [Кадр](text200-baseline-initial.png) | [Кадр](text200-vt1-compact-initial.png) |
| Пустой текст результата | [Кадр](empty-baseline-initial.png) | [Кадр](empty-vt1-compact-initial.png) |
| Открытый вопрос без права ответа | [Кадр](question-baseline-initial.png) | [Кадр](question-vt1-compact-initial.png) |

| Поздняя проверка | Baseline | VT1 compact |
|---|---|---|
| Оценка после click | [Кадр](H01-baseline-estimate-after-click.png) | [Кадр](H01-vt1-compact-estimate-after-click.png) |
| После timeout отмены оценки | [Кадр](H01-baseline-property-access-failure.png) | [Кадр](H01-vt1-compact-property-access-failure.png) |
| Переход к существующему шагу review | [Кадр](H02-baseline-existing-review-CTA.png) | [Кадр](H02-vt1-compact-existing-review-CTA.png) |

[Compact: «Другие свойства» после настоящего Tab/Enter-пути](H01-vt1-compact-keyboard-opened.png). Поздние кадры имеют собственное состояние и не подменяют начальную композицию.

## Сохранение и повторение

- Все **21 PNG** сохранены без изменения байтов: 14 initial, один keyboard-opened, две after-click оценки, две после отказа и два review CTA.
- [Полный results.json.gz](results.json.gz): uncompressed SHA256 `0a37c5889f1cc88943044aa70c5249d70c7059dc828cfea166d1db0f2dd9ed12`, 867,603 bytes.
- [Полный job.log.gz](job.log.gz): uncompressed SHA256 `405e6ef1f221de4c112c48177213bb106f478344c4acffb274a1e1fb66c9ba56`, 50,427 bytes. JSON-строка декодирована в UTF-8 без добавления перевода строки.
- [Provenance и полный инвентарь 46 файлов](provenance.json): ZIP SHA256 `a56f17a728c1ef3dbb4006a4a460c67a38fc1880a7eb081fc66b6d82bd92235b`, 4,677,636 bytes.

Оба lossless gzip используют `mtime=0`; roundtrip и hashes проверены. Все 46 извлечённых файлов побайтно совпали с ZIP. Для 24 compiled assets сохранены размеры и hashes; сами build outputs в Git не копируются. Среда: Ubuntu 24.04, Node v24.20.0, Vite 8.3.0, Playwright 1.62.1, Chromium 151.0.7922.34, `ru-RU`, UTC.

Для повторения используйте отдельный checkout точного head `ca99680799eee8c865038d537e1bef1def6478f0` и команды [README эксперимента](https://github.com/it-novikov/iquipage-design-system/blob/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen/README.md), выбрав compact comparison plan. Этот сохранённый пакет содержит результаты, а не переносимую копию полного build environment. Его bytes при повторе не меняют; новые результаты сохраняют отдельно.

В исходном результате `visualAcceptance`, `humanAcceptance`, `backendAcceptance` равны `NOT_RUN`. Новый layout, узкий сценарий, text200/reflow, реальное сохранение и повторное открытие, Plan preview/commit, readonly/accepted/create/cover/personal acceptance и релизная кросс-браузерная приёмка этим пакетом не принимаются. Следующий visual review должен ссылаться на эти frozen кадры и отдельно оценивать сохранившуюся цену компактности.
