# PF04 — независимый native baseline review R1

Дата: 2026-10-12. Reviewer: `/root/task_estimate_review`. Read-only проверка frozen DS54 baseline; исходники, пакет, harness и raw не изменялись, новые browser/CI запуски не выполнялись.

**Вердикт: baseline пригоден для выбора первого ограниченного rendered опыта, с двумя подтверждёнными пробелами покрытия.** Потеря текста воспроизводится в публичном property-list recipe `data-label=wide` без Sprintique CSS/runtime. Это не приёмка исправления: `targetAcceptance`, `humanAcceptance`, `backendAcceptance` остаются `NOT_RUN`. A целесообразен как первый кандидат; его default/API, 7U/14U и пороги не приняты. B остаётся реальным конкурентом по читаемости длинной подписи и ритму.

## 1. Проверенная привязка и готовность

| Поле | Проверенное значение |
| --- | --- |
| PR head | `f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b` |
| Actual checkout | `00d4a407b90fc85bb44d9ba5fe574d39c99a9d5d` |
| Whole tree обоих | `46e42c2bdfe1b4140d87906ec6a48abf68bc31f7` |
| Checkout parents | `6423443d71a0817570281cf28822a3c14f7db684` + указанный PR head |
| Run / job | `38244219141` / `114793983823`, capture job success |
| Artifact | `11744456028`, ZIP 1 407 722 bytes |
| ZIP SHA-256 | `b3fa9e86ac8a25e787e894f5639fef0e725921152a1e5420aac4cb02de0a1711` |
| Raw results SHA-256 | `c9514f45dd4260e5881671aa210bd641226f24f36bb01556e6ef694c191fb985` |
| Plan revision 2 SHA-256 | `724f1e889dc621e178ee173cb4ef8fa1fbfd190b0249decc208e75cc89de5582` |
| Package | `0.6.0-vnext.54`, archive SHA `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Browser / tools | Native Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `v24.20.0`, Vite `8.3.0` |

Лично сверены Git commit/tree/parents, job checkout log, metadata, ZIP digest и все 21 извлечённых файла с ZIP; source fingerprints с frozen Git, все 10 PNG hashes, пять отдельных profile JSON с embedded profiles и четыре compiled output hashes. Все 32 использованных DS build inputs совпадают с соответствующими файлами committed archive. Runner отдельно проверил все 176 installed package files. Build graph содержит DS и четыре fixture inputs; product runtime/CSS отсутствуют. Diff от642344 не меняет library/product source. [E1, E2, S1]

Во всех пяти профилях `ready=true`, `bootstrapError=null`, правильные DS version/root font/host width, 12 ожидаемых строк и полные исходные значения. `changes=[]`; page/console/off-origin error lists пусты. До/после screenshot viewport и root font совпадают, window scroll `(0,0)`. Browser Date явно фиксирован на `2026-10-12T12:00:00.000Z`; ISO срока `2026-10-11` сохранён и caption показывает просрочку. Это время fixture, не системные часы reviewer. Используется root font16/32 при viewport scale1, не настоящий browser zoom. Inter зарегистрирован как loaded; отдельный fallback face имеет status error, поэтому «все faces загружены» не заявляется. [E1, S1, S2]

Первый capture остался `FAILED` на `Actual value surface: status`: старый selector не доходил до select-wrap. Проверенный code diff меняет только путь к фактической поверхности; все десять соответствующих PNG attempt1/attempt2 byte-identical. Это ремонт измерителя, не изменение интерфейса и не новый PASS продукта. [E3, S1]

## 2. Личный просмотр всех 10 PNG и raw geometry

Числа observations ниже — объём автоматических записей, не число независимых дефектов и не severity. Просмотрены viewport и document PNG каждого профиля; ссылки ведут на document кадры. [E1]

| Профиль, W/root | Observations | Что видно и измерено |
| --- | ---: | --- |
| [wide-normal, 615/16](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-11744456028/browser/wide-normal-document.png) | 2 | Компактный список высотой360px; выбранные/static captions читаются. Две записи относятся к native inputs. |
| [narrow-normal, 349/16](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-11744456028/browser/narrow-normal-document.png) | 13 | Owner, author и parent title сокращены; author avatar оторван от имени на отдельную строку. Static status переносится. Document не переполнен по горизонтали. |
| [narrow-text200, 270/32](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-11744456028/browser/narrow-text200-document.png) | 65 | Потери labels и selected captions, тесные static lines. Static status выходит вправо до362px при host.right290 и viewport320; document.scrollWidth362. |
| [wide-tight-text200, 270/32](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-11744456028/browser/wide-tight-text200-document.png) | 65 | Полностью те же row objects/geometry при viewport1280. Переполнение host сохраняется, но широкое окно его вмещает. |
| [wide-text200, 615/32](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-11744456028/browser/wide-text200-document.png) | 38 | Owner/date/priority captions читаются целиком, подписи owner/priority/participant всё ещё сокращены. Author composition и static line rhythm остаются неудобными; parent title сокращён. |

В narrow-text200 document PNG имеет высоту1149 и ширину362; viewport PNG только320×1000 и показывает реальное отсечение справа/ниже окна. Нижнее reference date находится ниже первого экрана. Полный screenshot не доказывает fit первого viewport. [E1]

## 3. Подтверждённые причины и границы вывода

**N1 — fixed label width, а не только недостаточная ширина значения.** Label track остаётся120px во всех профилях; при root32 label font26/line-height20. Полные ширины «Исполнитель»167, «Приоритет»136, «Поиск участника»213 превышают120 и соответствуют видимому ellipsis. В615/root32 value column483, plain owner422 и date286 помещаются, а label всё равно потерян. Цепочка прямо совпадает с `--iq-properties-label:120px` и nowrap/overflow/ellipsis в recipe. [E1, S3]

**N2 — доступная ширина компонента имеет самостоятельное значение.** `narrow-text200.measurement.rows` и `wide-tight-text200.measurement.rows` полностью равны. Объяснение «это только мобильный viewport» не выдерживает контролируемого сравнения. Это поддерживает intrinsic/container решение; оно не выбирает flex A, query B или число breakpoint. Обычные select/date той же ширины270/root32 показывают целые значения в нескольких строках, с trigger heights148/108 против32 в property-list. Сравнение доказывает дополнительное ограничение recipe, но не предлагает переносить bordered reference layout в Task. [E1, S2, S3]

**N3 — фиксированная typography и составные static values требуют собственного исправления.** Static font28 продолжает использовать line-height20. При270/root32 status занимает три строки/height60, но полные text ranges имеют height74; на кадре строки читаются тесно, без ясного межпарного воздуха. Непрерывное слово «подтверждения» достигаетx362 без clipping ancestors и создаёт реальный document overflow. «Не запланирован» достигаетx337; meta автораx297. На349/root16 и615/root32 avatar автора уже находится отдельно от имени: sibling flex items не сохраняют группу. `.iq-property-text` дополнительно сокращает author/parent и сохраняет line-height20. Одной отмены ellipsis недостаточно: нужны читаемая высота строки, перенос длинного текста и осмысленная связь avatar/name/meta, key/title. [E1, S2, S3]

**N4 — 26/32px подтверждены как ограничения высоты, не как универсальное отсечение ink.** В root32 pill имеет height26 при line-height39; ghost select/date/combo height32 при line-height42. Однако на615/root32 status/owner/date видны целиком, trigger overflow visible, а полный line box выходит за fill/hit rectangle. Запись `element-shorter-than-line-height` не даёт права назвать каждый такой control визуально обрезанным. Полная multiline caption потребует естественной высоты; точные painted-glyph выводы здесь ограничены просмотренными PNG. [E1, S3]

**N5 — tags уже частично переносятся; input имеет отдельный footprint.** При270/root32 обе выбранные подписи видимы, второй chip занимает две строки. Нулевой по ширине unfocused input остаётся24px высотой наy386–410 внутри field250–414; ниже chips виден дополнительный пустой участок. Поэтому запись о129px placeholder при contentWidth0 не означает потерю обязательного текста «Найти тег», но нельзя игнорировать сохраняемый layout footprint. Focus/search/remove не выполнялись. Empty readonly tag path и product `.tdr-pill` в этом fixture отсутствуют. [E1, S3, S4]

## 4. Что observations не доказывают

- Обе wide-normal записи — ограничения native single-line buffers. У combobox сохранён полный value, canvas225 превышает content216; у выбранных tags измерен placeholder скрытого по ширине поиска. Это не две сломанные подписи. Полное имя в закрытом combobox и редактирование его input — отдельный дизайн-вопрос, не обещание multiline input.
- `full-text-range-outside-host` у текста за ellipsis не равен видимому выходу за host. В349/root16 такие записи есть, а document.scrollWidth равен viewport390. Реальный выход static-status в270/root32 подтверждён отдельно unclipped ranges и кадром.
- Range box включает пространство, которое не является нарисованными глифами. `estimated-ink-*` остаётся оценкой. Например, малое range intersection Plan→author не устанавливает collision букв. Дубли range/ink/ellipsis/scroll одной строки не складываются в независимые дефекты.
- Ноль page/console errors не доказывает успешное взаимодействие, сохранение или правильность всех состояний. Здесь не было открытия popup, фокуса, изменения значения, контейнерного resize во время ввода либо проверки прав. [E1, S1]

## 5. Два пробела стенда, исправляемые до сравнения A/B

**G1 — заявленный owner avatar фактически отсутствует.** Fixture передаёт `avatar:data.person`, где есть только id/name. Exact `optionAvatar()` требует `avatar.text` либо bot kind и возвращает пустую строку для этого объекта. В PNG и owner textGeometry нет avatar; он отсутствует и у reference-owner. Oracle проверяет registration/label/value, но не lead. Это неверно наполненный public option в fixture, не DS/product defect. Static author avatar есть. Утверждение plan «owner with avatar» и вывод о достаточности value budget для такого owner текущими данными не покрыты. [S2, S4, E1]

**G2 — actual value surface измерена, outer layout item ещё нет.** Новый selector корректно находит inner trigger/shell в `.iq-select-wrap`. Но row.value — эта внутренняя поверхность; отдельные wrapper rect, margin, box-sizing, flex basis/grow/shrink не записаны. В source carrier select/combo отличается от direct date trigger, tag field и static dd. При270/root32 pill box достигаетx298 при host.right290, ghost trigger начинаетсяx144, static ddx152. Поэтому формулаL+G+V ещё не измерена как единая внешняя геометрия всех carriers. [E1, S1, S3, S4]

Root уведомлён и подтвердил общий revised-control/candidate fixture: правильный public avatar payload и явная запись реальных outer items. Attempt2 остаётся неизменным. Достаточен отдельный сопоставимый DS54 control capture изменённого fixture; перепроверять весь CI из-за этих двух пробелов не требуется.

## 6. Минимальный следующий опыт и спор о плотности

1. **Один ограниченный A на фактических carriers.** Label/value flow, естественная высота control, пропорциональный line-height и полный wrap caption/static text рассматриваются вместе. Согласовать внешние margins/padding/box-sizing существующих items и сохранить popup/hidden input вне layout роли значения. Не строить universal wrapper ради формулы, не добавлять consumer L/V knobs. Именованная запись carrier/rect/basis нужна именно для объяснения перехода строк.
2. **Использовать уже различающие профили.** Wide615/root16 показывает цену обычной плотности;270/root32 — восстановление чтения и containment;615/root32 — цену увеличенного label budget при ещё пригодной ширине. Existing349/root16 показывает риск лишней высоты/отрыва составных частей. Это те же данные, не новая полная матрица. И ordinary reference controls должны сохранить свой вид вне recipe.
3. **B сравнить на уже существующей подписи.** При гипотезеU=28, H120 получаетсяL196. У «Поиск участника» actual width213, то есть196<213≤270. A no-grow заставляет её переноситься даже после stacking; B может дать ей полную ширину. Сравнить ту же строку и значение, ясность пары, лишний вертикальный ход и действие. Новая длинная подпись или норматив количества строк не нужны. При615/root32 увеличениеL также отнимет место у сейчас полного plain owner; правильный avatar дополнительно занимает место. Эта цена должна быть видна, а не спрятана за попаданием выше расчётного600.
4. **Один читаемый ритм вместо обещания старых36 и условных4/12 одновременно.** Приоритет — целая читаемая пара и различение соседних свойств. Небольшая цена высоты normal допустима после кадра; лишняя пустота, avatar на своей строке и инерционно фиксированный line-height не считаются оправданной плотностью. Если A требует сложного распознавания wrap или проигрывает B в чтении, это основание выбрать B.

После выбора геометрии остаются конкретные affected interactions: input фокус/поиск, tag remove, открытый select/date при **container-only** resize без искусственного window.resize. Текущий passive baseline не устанавливает старую или новую причину возможного anchor deficit. Actual Task host Estimate/Plan, readonly/static `.tdr-pill`, backend/permissions, human evaluation, настоящий zoom и другие браузеры — вне этой native проверки; общий DS capture их не заменяет. Захвачен только `data-label=wide`, light/comfortable; другие column/label modes и темы здесь не проверены.

## Источники и неизменность

- **E1:** [results.json](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-11744456028/browser/results.json), его пять profile JSON и10 PNG в том же каталоге; [provenance.json](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-11744456028/browser/provenance.json).
- **E2:** [metadata](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-metadata.json), [exact job log JSON](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt2-job-exact.json), ZIP рядом с extracted evidence. Git objects head/checkout проверены лично.
- **E3:** [attempt1 results](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-baseline-attempt1-11743199083/browser/results.json), actual tree629e80459d8f7f7c7d0e95c9c917cdfa3ec9b03f; failed capture не переименован в успешный.
- **S1:** Frozen [runner](https://github.com/it-novikov/iquipage-design-system/blob/f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b/experiments/property-list-reflow/run.mjs), особенно64–106; [measure](https://github.com/it-novikov/iquipage-design-system/blob/f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b/experiments/property-list-reflow/measure.mjs),6–8 и91–99. Содержимое прочитано через frozen Git.
- **S2:** [consumer](https://github.com/it-novikov/iquipage-design-system/blob/f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b/experiments/property-list-reflow/fixture/consumer.js),6–31; соседние data/host.css и baseline-plan.json.
- **S3:** [foundation.css](https://github.com/it-novikov/iquipage-design-system/blob/f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b/libraries/iquipage/src/styles/foundation.css),2419–2434,2506–2537,2548–2557.
- **S4:** [components.js](https://github.com/it-novikov/iquipage-design-system/blob/f834a68aeb3ba5a145f56a5dbd0ea4d50be34e2b/libraries/iquipage/src/modules/components.js),87–93,148,192–205,1411–1422.

Original discovery SHA `e6e222e503790852a43fd195fd75bab3d2854baf8b93cbfb3301c948448d4e7e`, proposal `bd5b12448a5f5f36b1851c28b27b097cb0332e62ca81fdf7358ec07a38371c7c`, opponent `b55d6ff0fb0a5ec54843e941dc16b6054cc5b94a86a45dabf93baebdb58233d1`, designer response `7694966e88cf1f278de114bde5d959d4b6ab45297f1d1865e5914f828c928ba2` повторно совпали. Этот отчёт добавляет native evidence и сужения; исходные позиции не переписывает.
