# Третий native запуск: CTA проверены, отмена оценки закрывает Task

**14 начальных кадров — `CAPTURED`; четыре сценария существующих CTA прошли engineering assertions; два сценария отмены оценки — `FAILED`. Общий результат — `FAILED`.** Пассивная трасса уточнила наблюдаемое поведение: popover оценки остаётся открытым, когда после Escape Task уже закрыт. Это зафиксированный дефект сценария, а не завершённая приёмка интерфейса.

[Run 38234809826](https://github.com/it-novikov/iquipage-design-system/actions/runs/38234809826), job `114762756388`, artifact `11739838266`. Исходный head — [`2f66973538605035bf354ed264ee0c95f2a34ec5`](https://github.com/it-novikov/iquipage-design-system/commit/2f66973538605035bf354ed264ee0c95f2a34ec5); actual checkout `e7a4bb9eb1f9ed8878edd00d4128bdc332e6dd8e` имеет тот же полный tree `a294b5e551154bc8f57103e5158a72b0e49682dc`. Равенство проверено по Git metadata и исходному `results.json`; checkout SHA также присутствует в полном журнале.

## Что подтверждают данные

| Проверка | Зафиксированный результат |
|---|---|
| Исходники, пакет и fixture | Пять общих engineering checks — `PASS`, включая frozen source trees, совпадение 176 установленных файлов с DS `.54`, overlay трёх модулей во временных копиях, существующий task validator и две статические Vite-сборки. |
| Первые экраны | Все 14 кадров `CAPTURED`; начальные assertions прошли. Во всех начальных снимках `body.scrollTop=0` и `window.scrollY=0`. |
| Review CTA, baseline и VT1 | Открылась вкладка «Работа агента», выбран существующий шаг `focus-S1`, его summary получила фокус. Исходные controls и named inputs остались подключены к своей форме. Два итоговых кадра сохранены. |
| Question CTA, baseline и VT1 | Открылась вкладка работы; при `canAnswer=false` отсутствуют действие ответа и доступные поля ответа. Проверка неизменности исходных nodes прошла. |
| Семь свойств перед оценкой | В обоих вариантах открытие, Escape и возврат фокуса прошли для статуса, исполнителя, приоритета, типа, релиза, родителя и срока. |
| Оценка | В обоих вариантах open wait прошёл; после Escape ожидание отсутствия открытого popover завершилось timeout. Проверки tabs/resize/fullscreen и итогового состояния формы в этих access probes не достигнуты. |
| Ошибки и обращения | `pageErrors`, `consoleErrors`, `externalRequests` пусты. Во всех шести probes отсутствуют неподдержанные обращения fixture и попытки backend-команд. |

Исправление locator ограничило выбранный элемент ролью `tab`: `[data-task-tabs] [role=tab][aria-selected=true]`. Оно устранило strict-mode конфликт [предыдущей попытки](../attempt-2/README.md). Четыре успешных CTA-сценария не превращают общий запуск в `PASS`.

## Отмена оценки: последовательность и границы вывода

В каждом из двух вариантов trace содержит 13 событий, `dropped=0`. При добавлении popover его parent — `BODY`, `containedByOpenDialog=false`, хотя Task modal открыт. После click popover открыт; фокус остаётся на trigger оценки. Ни одно записанное событие не фиксирует фокус внутри popover.

Frozen runner затем отправляет Escape. Оба error stack указывают на `run.mjs:275:54` — ожидание `!document.querySelector('[popover]:popover-open')` после Escape. SHA256 runner `dce1ae5f13e6a48753e3fcfedb4f0ea1fae0547d16d82d48b4aab8f07bb61f93` совпадает с `fixtureSHA256` исходного результата. В конечном состоянии `modal=null`, trigger уже не подключён к DOM, фокус находится на заголовке Task в Board, а popover всё ещё подключён и открыт. Две пары «после click / после отказа» сохранены ниже.

В записанной последовательности нет `scroll` и `popup-removed`; это не поддерживает раннюю гипотезу о закрытии popover из-за прокрутки в данном запуске. Трасса не содержит отдельных `keydown`, `cancel` или `close`: порядок Escape установлен по командам frozen runner, стеку отказа и конечному состоянию DOM. Поправка к ранней интерпретации attempt2 сохраняется: там также произошёл timeout **отмены** на строке 217, а не открытия на строке 216.

Эти данные подтверждают конфликт жизненного цикла popover и Task. Конкретное изменение владения popup, фокуса и обработки Escape ещё требует отдельного source review и native проверки исправления. Этот пакет не утверждает, что причина уже устранена, и не подменяет oracle принудительным закрытием.

## Исходные кадры

| Сценарий | Baseline | VT1 |
|---|---|---|
| H01: обычная задача, 1280×720 | [Кадр](H01-baseline-initial.png) | [Кадр](H01-vt1-initial.png) |
| H02: результат на проверке, 1280×720 | [Кадр](H02-baseline-initial.png) | [Кадр](H02-vt1-initial.png) |
| Длинные заголовки и результат, 390×844 | [Кадр](narrow-baseline-initial.png) | [Кадр](narrow-vt1-initial.png) |
| Тот же узкий сценарий, dark | [Кадр](dark-baseline-initial.png) | [Кадр](dark-vt1-initial.png) |
| Text200, 1280×720 | [Кадр](text200-baseline-initial.png) | [Кадр](text200-vt1-initial.png) |
| Пустой текст результата | [Кадр](empty-baseline-initial.png) | [Кадр](empty-vt1-initial.png) |
| Открытый вопрос без права ответа | [Кадр](question-baseline-initial.png) | [Кадр](question-vt1-initial.png) |

| Поздняя проверка | Baseline | VT1 |
|---|---|---|
| Оценка после click | [Кадр](H01-baseline-estimate-after-click.png) | [Кадр](H01-vt1-estimate-after-click.png) |
| После timeout отмены оценки | [Кадр](H01-baseline-property-access-failure.png) | [Кадр](H01-vt1-property-access-failure.png) |
| Переход к существующему шагу review | [Кадр](H02-baseline-existing-review-CTA.png) | [Кадр](H02-vt1-existing-review-CTA.png) |

[VT1: «Другие свойства» открыты настоящим Tab/Enter-путём](H01-vt1-keyboard-opened.png). Поздние кадры не подменяют начальные; у сценария раскрытия есть собственная прокрутка.

## Сохранённые оригиналы

- Все 21 PNG без изменения байтов: 14 начальных, один keyboard-opened, две after-click оценки, две после отказа и два review CTA.
- [Полный results.json.gz](results.json.gz), uncompressed SHA256 `13b4d157cffdf3653b7fe3073b4bb25e7ee29bc1ae5f4a0f233b3a262512f610`, 854,614 bytes. Содержит полные события обоих traces и геометрию всех кадров.
- [Полный job.log.gz](job.log.gz), uncompressed SHA256 `89e22e55a118bfcfb3fdc2688218e8e09a30ddf2d3605079d13b06cbf47cef18`, 50,391 bytes. JSON-строка журнала декодирована в UTF-8 без добавления перевода строки.
- [Provenance и инвентарь 46 файлов artifact](provenance.json). ZIP SHA256 `68c9f552716e8b9cc6255f78d93138892b69a6762f26ee8a9ca80ef47939cbef`, 4,676,133 bytes.

Lossless gzip использует `mtime=0`; оба roundtrip проверены. Все 46 извлечённых файлов побайтно совпадают с ZIP, все сохранённые файлы повторно проверены по SHA256. Для 24 compiled assets сохранены точные размеры и hashes, сами build outputs в Git не копируются. Среда: Ubuntu 24.04, Node v24.20.0, Vite 8.3.0, Playwright 1.62.1, Chromium 151.0.7922.34, `ru-RU`, UTC.

В исходном результате `visualAcceptance`, `humanAcceptance`, `backendAcceptance` равны `NOT_RUN`. Общая компоновка VT1, узкий сценарий, text200, сохранение и повторное открытие, Plan preview/commit, readonly/accepted/create/cover/personal acceptance и релизная кросс-браузерная приёмка этим пакетом не принимаются. Визуальные выводы и причинный разбор оформляются отдельно; последующие попытки сохраняются отдельно от этого `FAILED`.
