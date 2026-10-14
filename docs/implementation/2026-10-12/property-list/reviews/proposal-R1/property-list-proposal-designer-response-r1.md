# PF04 — ответ дизайнера на независимый opponent review R1

Дата: 2026-10-12. **Read-only ответ; A — кандидат rendered опыта, не принятый API/default.** Реализация, package и browser-author experiments не менялись. Frozen [proposal](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-reflow-design-proposal.md), SHA256 `bd5b12448a5f5f36b1851c28b27b097cb0332e62ca81fdf7358ec07a38371c7c`, остаётся исходным документом; этот ответ его не переписывает.

Полностью прочитан отдельный [opponent R1](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-proposal-opponent-r1.md), SHA256 `b55d6ff0fb0a5ec54843e941dc16b6054cc5b94a86a45dabf93baebdb58233d1`. Затем лично проверены указанные CSS/markup, tag painter и handlers позиционирования. В момент чтения `repo-property-reflow` имел HEAD `9b20baa92560d937bf02886255be7004950579fb`; `git diff` с исходным642344 не показал различий в затронутых foundation/components/date-field/Task/catalog-picker исходниках. Поставка остаётся54. Это не привязка текущего production к local SHA.

## Решение после спора

**Сохраняю A как первый небольшой опыт; снимаю преждевременную обязательность его формулы, полного default API и точного spacing.** Цель — полная читаемая пара и удобное действие. Числа7U/14U, одинаковая ширина невидимых boxes и одновременное сохранение всех старых размеров не являются целью человека.

B остаётся полноценным конкурентом. Его преимущество — полная ширина длинной подписи и явный ритм вертикальной пары. Цена — размерный контракт и его корректное использование потребителем. Наличие дополнительного attr само по себе не делает этот вариант плохим; оно оправдано, если более простой default ощутимо хуже читается.

## 1. O1 — внешняя геометрия: возражение принято

У `iq-select` value carrier — `.iq-select-wrap`; у date/host — непосредственный trigger; pill отменяет ghost margin; tags имеют своё поле и block margins. Новую flex basis нельзя механически поставить на «любого ребёнка, кроме label». Это не один и тот же box. [S1, S2]

В алгоритме flex строки собираются по **outer hypothetical main size**, затем распределяются гибкие длины. Отрицательный margin и min/max ограничения участвуют раньше окончательного shrink/grow. Следовательно, фактический `getBoundingClientRect()` после layout тоже не равен исходной hypothetical size. Формула `W=L+G+V` допустима как reference только после определения carriers и учёта их внешней геометрии. [W1]

Для следующего ограниченного опыта достаточно маленькой явной карты:

| Строка | Layout item значения | Что отличает её сейчас |
| --- | --- | --- |
| Select/searchable/combobox | `.iq-select-wrap` | Внешний ghost margin; настоящий trigger и popup находятся внутри. |
| Date | Прямой `.iq-date-trigger` | Margin относится к самой кнопке; padding/border уже входят в её видимый/hit box. |
| Product Estimate/Plan | Прямой host trigger внутри `.iq-property` | Своя строка, рядом может быть popup; shared reset не должен включить popup в поток. |
| Pill | Select-wrap и его кнопка | Убрано отрицательное смещение; отдельные padding и typography. |
| Tags | `.iq-tag-picker-field` | Inline/block margins, input/chips внутри; абсолютный list остаётся overlay. |
| Static | `.iq-property-value` | Иная обёртка, иногда непосредственный текст; собственный text inset. |

**Простой диагностический кандидат** — согласовать внешние размеры на этих конкретных item: убрать layout-margin в ограниченном эксперименте, явно учитывать border-box/padding/min-width, затем проверить text/group edges. Это не заранее выбранный shipping reset. Если ghost bleed нужен, он не должен снова незаметно менять разные outer bases. Способ его сохранения определяется фактической формой wrapper; новая универсальная оболочка или абстракция ради формулы не назначается.

Принимаем coherent список и удобные области управления, а не равенство каждого BCR. Если нормализация требует существенно поменять DOM или отбирает полезное место у обычного Task, это стоимость A и основание сравнить B. Новые L/V knobs потребителям не нужны.

## 2. O2 — ритм и выравнивание: возражение принято, цель уточнена

У wrapping flex нет автоматического признака, позволяющего без дополнительных правил поменять межпарный gap только после переноса. Поэтому нельзя одновременно обещать exact normal36, отдельные stacked4/12 и отсутствие условного механизма.

Первый опыт может использовать **одну схему ритма для inline и wrapped**. Начальная диагностическая гипотеза — без дополнительного gap между flex lines, с одним небольшим общим block inset пары: фактическое расстояние уже содержит line-height и внутренние отступы control. Результат оценивается в кадре; это не утверждённые нулевые отступы интерфейса. Небольшое изменение обычной плотности допустимо только при более ясной связи label/value и сохранении удобного просмотра списка. Не добавлять `space-3` ко всем строкам только для выполнения прежней таблицы.

Оппонент справедливо уточнил и «один левый край». Согласовать нужно **край группы значения** и static/editable одного типа. У avatar+name буквы имени естественно начинаются дальше, чем plain text. Пустые icon slots во всех остальных строках, подвешенный за границей avatar или pixel-perfect совпадение букв не нужны.

## 3. O3 — no-grow и текстовые бюджеты: принимаю видимую цену

Подпись, которая помещается в `W`, но не помещается в `L`, получает лишние строки в A. Это реальная цена чтения. Аргумент про невидимый box не отменяет её. Предпочтение no-grow в первом кандидате основано только на сохранении полезного места значения в обычном Task, а не на признании всех иных layouts излишними.

Различающий пример для A/B — **одинаковая подпись и значение при одном font/W**, причём измерение показывает `L < natural label width ≤ W`. Подпись вроде «Дата согласования» подходит только если её фактическая ширина в выбранном шрифте удовлетворяет этому условию. В B она получает полную строку; в A переносится внутри label budget. Смотрим связь пары, лишний вертикальный ход и ширину полезного value, без произвольной нормы числа строк.

У W≈615/U28 сам факт попадания выше расчётных600px ничего не доказывает. Avatar/key/chevron/insets занимают часть value carrier. Нужно видеть настоящий owner, parent и date caption. Окончательное `H` как preferred override, вычисление `U` и возможный default станут public contract только после этого решения. Внешнее API не обязано выдавать потребителю все внутренние коэффициенты.

## 4. O4 — tags: разделяю геометрию и отсутствующее содержание

**Tag input относится к применимому reflow scope.** В54 он действительно имеет `height:24px; line-height:20px` при interface font. Его нельзя считать покрытым снятием ограничений32/26px у select/date. Важны высота и фокус самого однострочного input, возвращение его ширины при поиске, wrap chip caption и доступность remove button. Многострочный input из этого не следует. [S1, S2]

**Empty readonly ghost tag — отдельная source-backed проблема состояния.** Painter записывает «Нет тегов» в placeholder и скрывает input при readonly; chips при пустом массиве отсутствуют. В просмотренных style rules не найден альтернативный caption через CSS. Но новый native failure этого пути здесь не заявляется. [S2]

Actual Task readonly использует собственную static строку и прямо выводит «Нет тегов» при пустом списке. Поэтому эту ветвь публичного `IqTagPicker` нельзя приписывать прежним Task кадрам. [S3]

В ближайшем выборе геометрии сохраняется отдельная запись **не подтверждено native / не исправлено этим scope** для missing caption. Не маскировать её псевдоконтентом, не считать весь public readonly исправленным и не добавлять tag engine в reflow PR. Если ограниченный baseline подтвердит отсутствие текста, root может назначить самостоятельный маленький control scope; это не условие запускать новый полный аудит.

## 5. O5 — статичные parts и форма: принимаю с ограничением сложности

Перенос должен покрывать непосредственный текст `.iq-property-value`, а не только `.iq-property-text`. Avatar/name/meta и key/title нуждаются в осмысленной структуре, чтобы естественное wrapping не разрывало связанную группу. Caption wrapper в `.tdr-pill` имеет практическую цель: полный перенос текста рядом с dot при естественной высоте. Это небольшая Task adoption правка; readonly не становится disabled editor. [S3, S4]

Новый вычисляемый радиус заранее не обязателен. **Сначала существующий простой radius role и настоящий многострочный status.** Только если кадр показывает, что форма мешает чтению/заливка теряет аккуратность, нужен локальный предел радиуса. Никакого нового внешнего radius knob или status engine из этого не следует.

«Полное значение» означает полную выбранную подпись и уже предусмотренные сведения. Оно не возвращает все намеренно скрытые select metadata. В частности, текущая wide grammar скрывает meta, а release target date показывается в открытом выборе; перенос не отменяет это продуктовое решение. [S1, S3]

## 6. O6 — открытый popup: гарантия сужена до проверяемого пути

Сохранение DOM/control identity необходимо, но не гарантирует anchor. У select есть open/window-resize/scroll positioning; date дополнительно наблюдает размер **popup**, не trigger. Container-only resize может изменить положение trigger без нужного события, а resize самого popup иногда вызовет позиционирование косвенно. По одному source это риск, не доказанный failure. [S2]

Различающий сценарий — открыть конкретный select/date и изменить только ширину его родителя при неизменном viewport. Не отправлять искусственный `window.resize`: он замаскирует вопрос. Сравнить trigger/popup rectangles, видимый anchor, focus и завершение/отмену intent на54 и кандидате.

Если54 уже теряет anchor, фиксируется конкретный старый deficit и его владелец. Если только новый layout ломает путь, это regression кандидата. Нельзя закрыть ни один из них доказательством «узел тот же». Это также не разрешение переписать все overlays: новый observer или lifecycle потребует отдельного конкретного основания. Существующий Estimate close-on-resize не заменяется общим правилом по умолчанию.

## Прямой спор и достигнутая граница

После собственной позиции оппонента я предложил следующие ограничения: фактические carriers вместо универсального wrapper; согласованная внешняя геометрия; один приемлемый rhythm без определения wrap-state; B как реальный конкурент для длинной подписи; separate scope empty-readonly; отдельная диагностика container-only anchor.

Оппонент их принял и подчеркнул, что **zero layout-margin и internal gap0 — диагностические гипотезы, не требования к финальному UI**. Оба согласны оценивать normal-density change по видимому списку, а не равенству всех прямоугольников. Разногласие о победителе A/B намеренно не закрыто: цену no-grow, ритм и фактические transitions предстоит увидеть. Это согласие о способе различить варианты, не native/human approval.

## Ближайший ограниченный шаг

Сначала использовать уже запущенный baseline54. После него — один небольшой actual-wrapper A кандидат с явной геометрией, typography и единым ритмом. В запись опыта войдут использованный font/W, реальные carriers и применённая дельта, затем кадры normal/text200 и конкретные affected interactions. B добавляется там, где остаётся различающий вопрос о подписи/ритме или A требует несоразмерной сложности. Не нужен новый общий стенд, набор consumer knobs или полная матрица состояний.

Этот ответ не расширяет реализацию автоматически. Missing readonly caption остаётся отдельным finding; popup-anchor — отдельной проверяемой границей; свойства metadata/прав/сохранения не меняются. Новых PASS нет. Original proposal и discovery сверяются по их прежним SHA.

## Проверенные источники

- **S1 — Layout и tag input:** [foundation.css:2419–2445](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/styles/foundation.css#L2419-L2445), [2506–2557](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/styles/foundation.css#L2506-L2557).
- **S2 — Actual control markup/lifecycle:** [select markup/events:148–183](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/components.js#L148-L183), [position:240–249](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/components.js#L240-L249), [tag paint:1411–1434](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/components.js#L1411-L1434), [date events/RO:147–170](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/date-field.js#L147-L170), [date position:268–287](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/date-field.js#L268-L287).
- **S3 — Task consumers:** [static values:130–146](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/task-dialog.js#L130-L146), [catalog-picker:12–24](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/catalog-picker.js#L12-L24).
- **S4 — Product pill:** [board.css:262–266](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/board.css#L262-L266).
- **W1 — Flex sizing:** [CSS Flexbox §9.3](https://www.w3.org/TR/css-flexbox-1/#algo-line-break), лично открыт и прочитан для проверки порядка line collection / flexible lengths. Это объяснение механизма, не runtime доказательство кандидата.
