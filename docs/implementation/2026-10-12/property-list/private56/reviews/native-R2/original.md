---
document: independent-native-ux-review
finding_family: PF04
revision: 1
date: 2026-10-12
reviewer: /root/ds_candidate_native_r2
model: GPT-6 Astra
mode: read-only
scope: private56 public wide property-list compared with immutable DS54
verdict: CHANGES_REQUESTED
adoption: NOT_APPROVED
human_research: NOT_RUN
pr: https://github.com/it-novikov/iquipage-design-system/pull/91
head: 945169fff6fd7e38b081a76a0e20d71b3956a365
actual_native_checkout: c267edee80d49660e22fa03bc4442c19e3b4d2d1
actual_native_tree: f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6
plan_sha256: 8d37900ee942cfbf03dd6fbccc46f9aa8fa390f3b8a00d12412aac1ffca5722f
candidate_archive_sha256: a3307cf012d307ea476056e36bdee601f8eef9efad37c78dd96aaef6ccb00d5f
control_archive_sha256: a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457
open_findings:
  - PF04-NR2-01
  - PF04-NR2-02
  - PF04-NR2-03
  - PF04-NR2-04
---

# PF04 — независимое native и UX review R2 private56

## Решение

**Кандидат A действительно возвращает читаемые подписи и значения, но принимать его как готовый default дизайн-системы и подключать в Sprintique пока рано. Вердикт — CHANGES_REQUESTED.** Автоматический парный сценарий успешно выполнен; это сохраняется как полезное свидетельство. Однако просмотр кадров и разбор измерений выявили устранимые проблемы ритма и плотности, а проверка связи открытого редактора с полем обнаружила существенное расхождение между состоянием до screenshot и самим изображением. [E1–E7]

При увеличенном тексте подписи больше не превращаются в обрывки «Исполн…», текущий статус и фамилия читаются целиком, а статические факты перестают накладываться друг на друга. Эти улучшения стоит сохранить. Одновременно A удерживает подпись в узком бюджете даже на отдельной строке, привязывает первую строку некоторых значений к маленькому аватару и без необходимости переносит дату автора на новую строку. Ни одна из этих издержек не нужна для сохранения полного текста. [E2, E3, E5, E6]

Следующий шаг состоит из двух небольших частей: сначала получить незагрязнённое свидетельство поведения popup на том же immutable56; затем исправить подтверждённые причины композиции в новой версии. Вариант B с полной шириной подписи при вертикальной компоновке остаётся реальной альтернативой. Текущие 7U/14U и no-grow не получают статус обязательного контракта только потому, что успешно рассчитались в браузере.

### Статусы приёмки карточки

| Пункт | Итог R2 | Практическая граница |
| --- | --- | --- |
| A1 — точная поставка и обычные reference controls | **PASS в scope опыта** | Все проверенные source/package/build identities сходятся; ordinary select/date имеют ту же относительную геометрию. Product остаётся54. |
| A2 — полные captions и качество композиции | **Геометрия PASS; визуальное принятие CHANGES_REQUESTED** | Все5 profiles проходят полный text-range oracle. Открыты NR2-02/03 и polish NR2-04. |
| A3 — keyboard, identity и anchor | **Keyboard PASS; anchor не закрыт** | Сохранены полные intents и focus checks. Raw после container resize показывает старые координаты popup; PNG снят уже после дополнительного resize в интервале capture. |
| A4 — независимое ревью и applicable gates | **Два независимых раунда выполнены; общий пункт ещё открыт** | Source R1 с отдельной проверкой исправлений и этот native R2 существуют. Открытые замечания не превращают A4 в завершённую приёмку. |

Здесь проверялся public synthetic fixture, а не actual Task, production workflow или работа человека. Я — отдельный reviewer, не автор CSS, fixture или критериев. Применены репозиторные `iquipage-review` и `iquipage-experience-audit`; исходные ограничения и данные не изменялись. Аналитические роли в споре ниже не являются выдуманными участниками исследования.

## 1. Что именно было проверено

### Точная основа и связь с движущимся main

До native я прочитал ADR, plan revision2, исходный R1 и его corrected addendum, публичный recipe, fixture, измеритель и сценарий взаимодействий. По immutable local Git checkpoint независимо пересчитаны215 source-proof hashes и состав обоих tar. Затем те же inputs сверены с actual CI merge tree через GitHub Git data. [E1, E4, S1–S4]

| Идентичность | Значение |
| --- | --- |
| Local source checkpoint перед публикацией | `c3e4c202f8f6f5208aca9bc820af4339d92a419d` |
| Публичный head PR91 | `945169fff6fd7e38b081a76a0e20d71b3956a365` |
| Общее дерево этих двух checkpoint | `b50846b2e9762b5f7782adced8fd5e1ff21256ed` |
| Actual checkout native job | `c267edee80d49660e22fa03bc4442c19e3b4d2d1` |
| Actual whole tree native job | `f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6` |
| Родители actual merge | main `41ebe4823471072ed6dbb405fbd5e755852eec3f` и head PR91 |
| Trial run / job | `38253208875` / `114824500556` |
| Артефакт | `11749167457`, 5 085 184 bytes |
| ZIP SHA256 | `ebca49537ca8e49cddabb3fce486e9a5f22b7fe97e4dffe1d3fbabbb6c9e85d5` |
| Native job log | 111 186 bytes; SHA256 `b86a80dc3a2d40d855907ce1137f908f5b8ae3480c908dbf5823a9b703bd0160` |

**Whole tree native checkout не равен дереву head PR.** Между публикацией и запуском в main появились внешние изменения Task. Это явно проверено и не скрыто формулировкой «тот же commit». Library tree и весь experiment tree равны head; все215 source-proof inputs,14 явно записанных source inputs каждой сборки, архивы и product package/lock совпадают. Product tree различается, но продуктовые JS/CSS не входят в36 compiled inputs данного стенда. Следовательно, опыт относится к проверяемому private56, а его выводы нельзя распространить на всю новую product tree. [E4]

### Поставка, сборка и реальный браузер

Из ZIP безопасно извлечены67 файлов; все их bytes/SHA перечислены в inventory. Проверены176 файлов control54 и178 файлов candidate56,144 input-hash ссылки четырёх сборок,16 compiled output-hash ссылок и32 screenshot-hash ссылки. Каждый native profile JSON совпадает с соответствующей записью агрегированного results. Ошибок соответствия не найдено. [E1, E4]

| Проверка | Свидетельство |
| --- | --- |
| Обе build-only сборки | Node24.20.0,36 inputs и4 outputs каждая, `BUILT_NOT_RENDERED`. |
| Обе native сборки | Те же36 inputs и4 outputs для своего tar; clean committed source scope. |
| Полный DS Node suite именно56 | Свежий CI log:478 tests /478 pass /0 fail /0 skipped. Прежний478 PASS55 не использован вместо него. |
| Native engine | Chromium151.0.7922.34, Playwright1.62.1, Ubuntu24.04, Node24.20.0. |
| Условия | Light, comfortable, ru-RU, UTC, device scale1; fixed time2026-10-12T12:00:00Z. Root font16/32px при browser zoom100%. |
| Errors / сеть | По0 page errors, console errors и off-origin requests у обоих variants. |
| Изображения | Лично просмотрены27 уникальных PNG; они покрывают все32 ссылки. Пять остальных — byte-identical дубликаты viewport/document. |

Фактические размеры и визуальный результат принадлежат этому шрифту, теме и профилям. Root font32px не назван настоящим browser zoom200%. Размеры tar, CSS или отсутствие ошибок не являются доказательством FPS, отсутствия lag или качества всех продуктов.

## 2. Что стало лучше и какой ценой

### Полнота текста и адаптация к ширине компонента

Во всех5 candidate profiles у property-list нет clipped non-decorative text ranges, выхода полного display text за host и горизонтального переполнения документа. Личный просмотр закрытых viewport/document PNG подтверждает читаемые display captions. Сочетание аватара и имени сохраняется и на узкой ширине; long static words переносятся, а не выходят вправо. Круг статуса сохраняет связь с pill; цвет просрочки дополнен словом. [E2, E3, E5]

В control54 при W270/root32 документ имеет scrollWidth362px при viewport320px. У candidate56 scrollWidth равен320px. При той же W270/root32 и viewport1280px **все12 row measurements byte-for-byte равны** соответствующим измерениям при viewport320px — отдельно в control и candidate. Это сильное свидетельство именно для заданной ширины компонента. Оно не является полной факторной проверкой всех влияний font и viewport. [E6]

| Profile | Host / root | Высота списка54 | Высота списка56 | Что видно человеку |
| --- | --- | ---: | ---: | --- |
| wide-normal |615 /16|360px|386px|Оба варианта компактны. У56 целые значения и стабильнее avatar/name; строка автора с датой занимает лишнюю строку. |
| narrow-normal |349 /16|427px|519.844px|У56 видна полная фамилия и длинное родительское значение. Часть роста необходима для чтения; метаданные и переносы требуют ритма. |
| narrow-text200 |270 /32|566px|1541.938px|У54 данные обрезаны и наложены; у56 полноценная вертикальная композиция, но есть лишняя строка подписи и открытые вопросы плотности. |
| wide-tight-text200 |270 /32|566px|1541.938px|Тот же layout строк при широком viewport; desktop сам по себе не возвращает место компоненту. |
| wide-text200 |615 /32|428px|910.531px|У56 читается всё display content; видны разнородные baseline и издержки выбранного label budget. |

**Большая высота при увеличении текста сама по себе не дефект.** Сравнивать1542px читаемого списка с566px обрезанных строк как равнокачественные варианты было бы ошибкой. Линейное чтение длинной фамилии и заголовка требует места. Оценивать нужно, какие строки несут информацию, а какие созданы конкретным CSS решением без пользы. Ни возврат ellipsis, ни уменьшение шрифта, ни скрытие свойств не являются приемлемым способом улучшить эти числа.

### Поведение, которое действительно выполнено

В wide-normal и wide-text200 оба variants открывают owner select и date с клавиатуры, закрывают Escape с прежним значением, возвращают focus на прежний trigger и сохраняют DOM identity. Выбор второго исполнителя даёт ровно один intent, возвращение первого — ещё один. Поиск и отмена не добавляют value mutations. Это синтетические UI intents; сохранение на backend не тестировалось. [E2, E3]

Combobox остаётся настоящим однострочным input с полным buffer; Home/End достигают начала/конца. Поэтому его видимое сокращение длинного ввода не выдано за тот же дефект, что обрезанная закрытая selected caption. Tab проходит через две существующие кнопки удаления тегов к input, поиск и Escape сохраняют выбранные теги и identity. Фактическая высота candidate input соответствует line-height:21/21px при root16 и42/42px при root32. Baseline54 имеет24px input с line-height20px даже при root32. [E2, E3]

Само удаление/возврат тегов и dedicated focus paint на кнопке удаления здесь не проверялись. Сохранность поиска не закрывает этот путь. По10 ordinary reference checks — select/date на5 profiles — независимо повторено точное сравнение width/height/styles и относительных координат label/carrier/value/avatar. Они совпадают. Изменившаяся absolute document y объясняется высотой списка и не названа регрессией ordinary field. [E6]

## 3. Замечания и точные способы закрытия

### PF04-NR2-01 — P2: anchor-свидетельство меняется во время capture

**Статус:** подтверждено несоответствие raw geometry и последующего PNG; A3 открыт. Подтверждены старые координаты popup после reflow в измеренном состоянии. Продолжительность и painted appearance этого состояния без побочного resize ещё не доказаны.

**Сценарий:** при viewport1280×1000 открыть owner/date клавиатурой, изменить только host615→270, дождаться двух requestAnimationFrame, прочитать state. В обоих root-font profiles trigger кандидата переносится и меняет высоту, а popup сохраняет прежние rect. До этого чтения viewport и счётчики resize/scroll не изменились. Verifier честно пишет `NEW_DETACHMENT_REQUIRES_REVIEW` во всех4 случаях. [E3, E7]

| Candidate case | Trigger после host resize | Popup после host resize | Дополнительные события до raw / после capture к cancelled |
| --- | --- | --- | --- |
| normal owner |left20; top122.531; bottom174.531|left152; top127; bottom245|resize0 /1; scroll0 /0|
| normal date |left20; top197.375; bottom229.375|left144; top164; bottom543|resize0 /1; scroll0 /0|
| text200 owner |left20; top197.063; bottom333.063|left228; top233.656; bottom424.656|resize0 /1; scroll0 /0|
| text200 date |left20; top374.750; bottom468.750|left220; top290.656; bottom741.656|resize0 /1; scroll0 /0|

Значение `verticalGap` в raw classifier отрицательно при пересечении; это служебная формула, а не корректное расстояние «оторван на345px». Для оценки здесь приведены сами rect. У54 в момент raw остаётся положительный gap7/8px: его trigger почти не переместился, поскольку содержимое осталось обрезанным. Это не доказывает исправный общий parent-resize contract54 — ширина popup там также остаётся прежней. [E2, E7]

**Почему PNG не закрывает finding:** все4 candidate popup PNG уже показывают редактор возле нового trigger. Между raw и cancelled вызывается fullPage screenshot; в этом интервале счётчик window resize вырастает на1. В control root32, где документ тоже превышает viewport, отмечено такое же увеличение. Код сам не dispatch-ит resize. Проверенный primary source Playwright1.62.1 передаёт `captureBeyondViewport=true` для fullPage, не помещающегося во viewport. Совместно с native counters это указывает на capture-side-effect, способный вызвать существующий listener позиционирования. Однако непосредственное внутреннее событие Chromium и длительность stale состояния данным логом не измерены; причинный вывод здесь помечен как обоснованная гипотеза. [E7, S5]

В DS Select позиционируется на open, window resize и document scroll; наблюдения изменения trigger нет. Date дополнительно наблюдает размер popup и visualViewport, но не trigger. У обоих native raw соответствует этому source механизму: reflow одного parent меняет anchor, а фиксированные координаты popup остаются прежними. Здесь нельзя «починить» тест вызовом `position()`, `window.resize`, scroll или повторным открытием. [S3]

**Переделка сначала на уровне диагностики:** сохранить plan2 и весь текущий packet. В следующем отдельном capture того же56 использовать viewport PNG во время anchor test; писать geometry, viewport, event counters и focus непосредственно до/после screenshot и после нескольких дальнейших кадров. Проверить, что сам capture не вызвал resize/scroll. FullPage кадр можно оставить отдельно после завершения anchor-проверки с явной другой ролью. Это уточнение наблюдения; критерий сохранения связи и прежние профили не ослабляются.

**Далее:** если stale anchor сохраняется без capture-side-effect, выполнить минимальную DS правку отслеживания актуальной геометрии открытого редактора или другое обоснованное поведение. Сохранить focus, identity, exact intent counts и cancellation. Это будет новая immutable поставка. Не добавлять общий observer повсюду до подтверждения причины и не закрывать finding только зелёным gate. Root принял эту последовательность; reviewer ничего в fixture или runtime не менял.

### PF04-NR2-02 — P2: подпись остаётся узкой, когда уже занимает собственную строку

**Подтверждённое наблюдение:** при W270/root32 строка «Поиск участника» переносится на две строки, хотя её полное native text advance составляет213px, а доступная ширина компонента270px. Candidate label имеет196px. В этой композиции value уже перенесён ниже и не конкурирует с label за горизонтальное место. Лишняя вторая строка добавляет37.688px line box. Это видно на обоих viewport при одинаковом host. [E3, E5, E6]

**Причина:** `flex:0 1 max(...,7 * interface-size)` запрещает подписи расти. После переноса value механизм по-прежнему удерживает прежний budget. Это свойство A, а не требование читаемости, локализации или платформы. На wide-text200 та же подпись также двухстрочная, но там value находится справа; этот случай требует отдельного баланса столбцов и не доказывается арифметикой narrow. [S2]

**Вред человеку:** взгляд совершает дополнительный переход в короткой подписи, список удлиняется без новой информации, вертикальная пара выглядит случайно зажатой. Текст при этом доступен целиком; это не P1 недоступности.

**Решение:** при вертикальной композиции предоставлять подписи полную доступную строку. Сравнить минимально исправленный A с B, который явно задаёт full-width label при такой композиции. Не менять подпись на более короткую ради коэффициента и не вводить consumer-specific numeric настройки. B на широком host не должен автоматически уничтожать удобную пару в двух столбцах.

**Приёмка:** на тех же W270/root32 полная подпись читается одной строкой; остальные подписи, длинные значения и keyboard путь сохранены; нет нового горизонтального escape. Проверить реальный кадр и первый взгляд, а не только требование «везде одна строка»: более длинная настоящая подпись должна иметь право переноситься.

### PF04-NR2-03 — P2: маленький avatar определяет ритм вместо первой строки имени

**Подтверждённое наблюдение:** в wide-text200 label «Исполнитель» заметно выше первой строки имени; у «Автора» тот же сдвиг. При этом «Срок» выровнен по тексту. Внешняя строка заявляет baseline alignment, но разные carrier/внутренние структуры фактически дают разные опорные линии. [E3, E5]

| Строка56, wide-text200 | Расчётная baseline label | Расчётная baseline первой строки caption | Разница |
| --- | ---: | ---: | ---: |
| Исполнитель |150.344|168.656|18.313px|
| Автор |616.531|634.844|18.313px|
| Срок |266.656|266.656|0px|
| Статус pill |98.000|103.656|5.656px|

Baseline в этой таблице — согласующаяся оценка из Range и Canvas font metrics, не pixel mask. Она нужна для объяснения лично видимого сдвига. В normal profile owner/author отличаются примерно на3.313px, то есть проблема существенно усиливается при увеличении текста. Avatar остаётся20×20px, а имя становится28px/42px. [E5]

**Причина на уровне композиции:** `.iq-select-value` выравнивает leading avatar и текст по началу; static person переводится в grid с avatar первым item. Внешний baseline механизм наследует baseline вложенной структуры, в которой маленький avatar не равен первой строке текста. Смена только `align-items` у внешней строки не может считаться универсальным решением без проверки фактических carriers. [S2]

**Вред:** общая ось значения «скачет» между свойствами. При чтении строки слева направо label и имя воспринимаются менее связанными, чем label и дата; это снижает понятность и визуальную собранность. Авторитет измерения не нужен, чтобы объявить один конкретный сдвиг нормативным: основание замечания — заметная непоследовательность одинаковых смысловых пар и требование пользователя о единой логике.

**Решение:** определить одну опору — первая строка основного текста значения. Avatar/icon должен сохранять привычную оптическую связь с ней, metadata — оставаться вторичной. Выразить это в DS для фактических select/static carriers, не фиксированными translateY по отдельным строкам. Не увеличивать все avatar до размеров крупного текста без разбора роли; не центрировать label относительно всей многострочной фамилии.

**Приёмка:** те же normal/text200 кадры показывают устойчивую связь label с первой строкой значения в owner, author, date и pill; полные captions и natural heights сохранены. Достаточна одна согласованная оптическая схема, а не искусственное равенство всех DOM rect. Параметры A нельзя объявлять окончательными до такого сравнения.

### PF04-NR2-04 — P3: дата автора принудительно занимает отдельную строку даже при свободном месте

**Наблюдение:** wide-normal author56 имеет row height60px; имя и дата всегда стоят друг под другом. Text area437px, фактическая ширина полного имени247px, metadata73px. Даже с существующим8px gap они могли бы поместиться рядом. Это конкретная лишняя строка, а не общая претензия к multiline metadata. В control авторская строка36px. [E2, E3, E5]

**Причина:** grid явно помещает avatar в column1/row1, имя в column2/row1, а metadata — в column2 следующей auto row. Новый ритм решает старый разрыв avatar/name на узком host, но платит за него обязательной второй строкой на широком. Отдельная metadata начинается с «·», что выглядит как оставшийся межстрочный разделитель. Сама строка с такой точкой уже содержалась в данных fixture и не является новой потерей текста. [S1, S2]

**Решение:** сохранять avatar с основной текстовой группой, разрешать имени и metadata размещаться рядом при достаточной ширине и естественно переноситься при её недостатке. Либо осознанно принять отдельную metadata как единый public pattern — тогда её смысл, вертикальный ритм и формат должны быть обоснованы, а не случайно заданы grid. Reviewer рекомендует первый путь для компактного property list.

**Приёмка:** тот же wide-normal не тратит строку без пользы; при349/270px avatar не становится отдельной одинокой строкой, полная фамилия и дата не обрезаются. Не уменьшать typography и не возвращать fixed height. Это polish без потери текущего действия; замечание желательно закрыть до принятия окончательного эстетического default.

### Оставшиеся вопросы, которые не повышены до подтверждённого нового дефекта

- **NR2-Q1 — пустое место после тегов.** На W270/root32 последний tag заканчивается заметно раньше конца158px carrier. Unfocused input уже имеет0×0, поэтому приписывать весь остаток его прежним24px неверно. Source сохраняет невидимый до hover chevron в flex flow; его перенос — правдоподобная причина части пустого места. Его rect отдельно не записан, поэтому причина пока гипотеза. При следующей точной правке tags полезно измерить фактический chevron и chrome line, сохранив Tab к input. Не скрывать focusable input через display:none ради плотности. [E3, S2]
- **NR2-Q2 — понятность редактирования с первого взгляда.** Закрытые inline values выглядят близко к static text. В этом опыте не было задания человеку «измените исполнителя» без подсказки. Keyboard success означает работоспособность известного контролa, а не доказанную обнаруживаемость. Большая часть этого визуального поведения уже есть в54; здесь не доказана новая регрессия. Нужен actual product context и целевое first-action наблюдение при adoption.
- **NR2-Q3 — дополнительные состояния.** Readonly empty tag caption, удаление/возврат тегов, error/pending/denied, dark и другие локализации не получили новый PASS. Trial не обещал их прохождение. Это границы последующей applicable проверки, а не требование повторить весь продукт до следующего безопасного шага.

## 4. Спор ролей и разрешение разногласий

Ниже — аналитические перспективы независимого reviewer. Root дополнительно лично просмотрел8 основных парных кадров и независимо указал на те же потенциальные издержки: author/date, узкий самостоятельный label и сдвиг первой строки рядом с avatar. Я проверил эти предположения по raw/source; согласие двух агентов не названо исследованием пользователей.

### Человек, который хочет быстро понять свойства объекта

**Позиция:** «Мне нужно узнать, кто отвечает, какой срок и в каком состоянии работа. Полное имя полезнее загадочной обрезанной строки. Я согласен прокрутить увеличенный текст, если каждая строка помогает понять объект».

**Возражение дизайнеру:** требование вернуть прежнюю высоту360/566px уничтожило бы главный результат. Длинная фамилия и название действительно занимают несколько строк, особенно в узком компоненте. Это не следует маскировать словом «плотность».

**Возражение инженеру:** полная подпись в двух строках при свободной ширине и несовпадающие оси заставляют читать неровный список медленнее. Геометрическая сохранность букв ещё не делает его удобным.

**Разрешение:** сохранить full text и normal readable typography как гарантии. Устранить только строки и сдвиги, причина которых прямо установлена. Не заявлять выигрыш в скорости работы до задания человеку; нынешнее заключение — экспертная оценка чтения кадров.

### Пользователь, которому необходим увеличенный текст

**Позиция:** «После увеличения я должен иметь возможность прочитать всю подпись и значение. Вертикальная прокрутка нормальна; исчезновение части фамилии и наложение соседних фактов мешают завершить мою работу».

**Возражение компромиссу A:** нельзя считать196px правильной шириной только потому, что число зависит от font. При отдельной строке остаток270px должен работать на чтение. Маленький avatar не должен уводить основное имя от его подписи.

**Разрешение:** W270/root32 подтверждает полезность stacking и одновременно опровергает пользу no-grow label в этом состоянии. B с полной шириной подписи получает содержательный аргумент, но его весь layout ещё не отрисован. Не превращать Chromium root32 в приёмку VoiceOver, iOS touch или настоящего browser zoom.

### Дизайнер типографики и композиции

**Позиция:** «Список должен читаться как последовательность связанных пар. Основное значение, вспомогательная дата и ведущий avatar имеют разные роли; у них должна быть одна ясная иерархия, а не случайные baseline».

**Возражение визуальному минимализму:** отсутствие рамок само по себе не делает интерфейс эстетичным. При root32 текстовые отношения важнее того, насколько незаметен control chrome. Дополнительная metadata row допустима, когда помогает чтению, но нынешняя обязательная строка на wide-normal этой пользы не показывает.

**Ответ инженеру:** не требуется универсальный mega-component или набор knobs. Можно исправить точную public композицию. Если ради no-grow придётся добавлять больше специальных исключений, чем у понятной full-width композиции, A следует отклонить.

**Разрешение:** NR2-02/03 — конкретные исправления перед default, NR2-04 — полезный bounded polish. Не менять палитру, масштаб, шрифт или style family ради нового вкуса. Текущий quiet visual language можно сделать значительно собраннее внутри существующей DS.

### Интегратор и AI-агент, который строит следующий продукт

**Позиция:** «Мне нужен один понятный public recipe, который автоматически даёт читаемую и согласованную композицию. Чёткая версия и точная документация уменьшают вероятность повторить старый fixed120/ellipsis или компенсировать его локальным CSS».

**Возражение новому набору режимов:** дополнительные consumer width настройки перекладывают проблему на каждый feature agent. Любая выбранная адаптация должна по возможности оставаться внутренним поведением DS. Стабильные public parts важнее малого количества строк CSS любой ценой.

**Разрешение:** source R1 исправления README/packaging и branch-scoped trial признаны полезными и сохранены. Новый57 нужен только для реального изменения поставки. Отдельное уточнение capture на том же56 не требует подменять tar или переименовывать старые снимки новой версией. Actual Task adoption проверяется своим scope после решения общих причин.

### Frontend и performance инженер

**Позиция:** «Natural CSS reflow без новых dependencies, remount и per-row text measurement — разумный первый опыт. Но открытый popup обязан следовать за изменившейся геометрией поля, а не пользоваться побочным resize screenshot».

**Возражение немедленному добавлению observers:** сначала нужно чистое воспроизведение и понятная жизненная область слежения. Observer на каждом элементе навсегда ради одного открытого меню может увеличить сложность и стоимость. Старый source listener не становится достаточным только потому, что модули JS не менялись».

**Разрешение:** сперва NR2-01 diagnostic, затем минимальная lifecycle-aware DS правка, если подтверждена необходимость. Проверять именно focus/intents/anchor и отсутствие лишних событий. Ни478 Node tests, ни стабильные hashes не заменяют performance profiling; comparative FPS, стоимость агентной разработки и скорость работы пользователей здесь не измерялись.

### Совместное решение

Главные гарантии — полное чтение, стабильная смысловая пара, работающий редактор, focus и сохранность выбранных данных. Изменяемые решения — коэффициенты label/value, обязательная metadata row, baseline mechanism и способ наблюдения popup. **A как направление можно продолжить, A в нынешнем виде нельзя объявлять окончательным. B не выбран без реализации; он остаётся альтернативой там, где текущий механизм уже показал ненужный компромисс.**

## 5. Передача следующему исполнителю

| Порядок | Работа | Доказательство завершения |
| --- | --- | --- |
|1|Сохранить текущие native raw,32 PNG, job log, R1 и этот R2 в промежуточном PR.|Неизменные hashes и понятные ссылки; успешный machine result рядом с открытыми findings. |
|2|Уточнить NR2-01 на том же56 без fullPage в anchor-интервале.|Viewport PNG + pre/post geometry + counters + несколько дальнейших кадров; прежние data/profiles/criteria; реальное отсутствие capture resize. |
|3|Разрешить raw/PNG расхождение и принять минимальное runtime решение, если оно нужно.|Точный подтверждённый defect или investigated dismissal; не исчезновение записи из отчёта. |
|4|Исправить NR2-02/03 и рассмотреть NR2-04 в новой immutable57.|Обновлённый recipe, новая package identity, те же сравнимые normal/text200 кадры и bounded source/native review. |
|5|Выбрать A/B или их минимально обоснованную адаптацию.|Ни одна гарантия не потеряна; общая композиция удобна для чтения; вывод об эстетике связан с реально просмотренными кадрами. |
|6|Подключать согласованную поставку в actual Sprintique отдельным шагом.|Реальный Task/другие affected consumers, product-owned pills, действия, first-glance контекст и применимые regression scenarios. |

Не требуется повторный глобальный discovery: проблема, причина и критерий уже достаточно конкретны. Не требуется новый PR quota, повторный approval для разрешённой работы или прогон всех браузеров после каждого мелкого исправления. Onboarding остаётся последним и отдельно согласуемым. Реальные Safari/Firefox/iOS/VoiceOver остаются перед релизом. Этот review не является merge, deploy, public package publish или разрешением на них.

## 6. Источники и машинная передача

Числа в отчёте берутся из immutable packet и отдельно пересчитанных производных файлов. Самостоятельный source/geometry разбор не изменял raw. Сохранены следующие точки входа:

- **E1:** [artifact inventory](property-list-private56-native-r2/artifact-inventory.json), [job metadata](property-list-private56-native-r2/jobs.json), [artifact metadata](property-list-private56-native-r2/artifacts.json), [native job log](property-list-private56-native-r2/native-job.log). [GitHub run](https://github.com/it-novikov/iquipage-design-system/actions/runs/38253208875).
- **E2:** [control54 raw results](property-list-private56-native-r2/artifact/browser/control/results.json) и sibling profile JSON/PNG. Все они относятся к revised fixture этой пары; не подменены предыдущим baseline PR86.
- **E3:** [candidate56 raw results](property-list-private56-native-r2/artifact/browser/candidate/results.json) и sibling profile JSON/PNG.
- **E4:** [pre-native frozen inputs](property-list-private56-native-r2/pre-native-frozen-inputs-c3e4c20.json), SHA256 `c77831e8fcbabb13243864eb71ae667de609d4d082543b999a3761ebfb58522e`; [native provenance integrity](property-list-private56-native-r2/native-provenance-integrity.json), SHA256 `d6830425c1634bce8b454c362f58f0215adc5277be56c3e4e12b74c672e3301e`; [actual merge metadata](property-list-private56-native-r2/merge-commit.json), [actual recursive tree](property-list-private56-native-r2/merge-tree.json), [head metadata](property-list-private56-native-r2/head-commit.json).
- **E5:** [geometry review metrics](property-list-private56-native-r2/geometry-review-metrics.json) — производная таблица из raw: rect, text lines и расчётные baseline; исходные grapheme/Canvas данные находятся в E2/E3.
- **E6:** [independent comparison checks](property-list-private56-native-r2/independent-comparison-checks.json), SHA256 `f5167cc13e7688f13bb0e4f1421308c42d2cdbe79ecd21357976890c29445cae`:10 reference shapes,24 row equality checks между одинаковыми host при разных viewport,213px full label advance.
- **E7:** [machine comparison](property-list-private56-native-r2/artifact/browser/comparison.json). Raw `popupResize.before/resized/cancelled`, event counters и PNG доступны в E2/E3; status `SCOPED_GEOMETRY_KEYBOARD_PASS_VISUAL_ANCHOR_REVIEW_PENDING` сохранён без переименования.
- **S1:** [frozen plan2 и fixture](https://github.com/it-novikov/iquipage-design-system/tree/945169fff6fd7e38b081a76a0e20d71b3956a365/experiments/property-list-reflow), [ADR](https://github.com/it-novikov/iquipage-design-system/blob/945169fff6fd7e38b081a76a0e20d71b3956a365/.bridge/tasks/20261012-property-list-readable-layout/decision.md).
- **S2:** [frozen foundation.css](https://github.com/it-novikov/iquipage-design-system/blob/945169fff6fd7e38b081a76a0e20d71b3956a365/libraries/iquipage/src/styles/foundation.css): wide-list block, static avatar grid, ghost tag input/chevron; [public control contracts](https://github.com/it-novikov/iquipage-design-system/blob/945169fff6fd7e38b081a76a0e20d71b3956a365/libraries/iquipage/docs/control-contracts.md).
- **S3:** [Select source](https://github.com/it-novikov/iquipage-design-system/blob/945169fff6fd7e38b081a76a0e20d71b3956a365/libraries/iquipage/src/modules/components.js) и [Date source](https://github.com/it-novikov/iquipage-design-system/blob/945169fff6fd7e38b081a76a0e20d71b3956a365/libraries/iquipage/src/modules/date-field.js); runtime modules55/56 ранее отдельно проверены как byte-identical в R1 addendum.
- **S4:** [исходный source R1 и corrected addendum](https://github.com/it-novikov/iquipage-design-system/tree/945169fff6fd7e38b081a76a0e20d71b3956a365/.bridge/tasks/20261012-property-list-readable-layout/reviews/source-R1). Original SHA256 `0a07165199fc25e56665bdd937289ff45eb1d55549c913a6bd35c1c305805dc9`; addendum SHA256 `655b2b73dbcb24b7851e4c1b6a1f8020b486eeccfad1fc5292d83294be25474c`.
- **S5:** Primary source [Playwright1.62.1 screenshotter](https://github.com/microsoft/playwright/blob/v1.62.1/packages/playwright-core/src/server/screenshotter.ts) и [Chromium delegate](https://github.com/microsoft/playwright/blob/v1.62.1/packages/playwright-core/src/server/chromium/crPage.ts). Получены через GitHub connector; версии, bytes и hashes записаны в [primary source notes](property-list-private56-native-r2/primary-source-notes.json). Они поддерживают механизм captureBeyondViewport, но не заменяют недостающий чистый native diagnostic.

Report сохранён отдельно и заморожен после проверки ссылок/хешей. Полный collection index и integrity sidecar находятся рядом с ним; приватная временная download reference не входит в публикуемый материал. Reviewer не изменял репозитории, fixtures, criteria, refs, PR или vendor и не запускал новый native повтор.
