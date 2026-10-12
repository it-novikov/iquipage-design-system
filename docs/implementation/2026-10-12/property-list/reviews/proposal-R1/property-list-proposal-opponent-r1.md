# PF04 — независимый opponent review предложения, R1

Дата: 2026-10-12. **Read-only дизайн/source review до нового native baseline. CSS, API и числовые пороги не приняты.**

Основа: [proposal](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-reflow-design-proposal.md), SHA-256 `bd5b12448a5f5f36b1851c28b27b097cb0332e62ca81fdf7358ec07a38371c7c`; [discovery](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-reflow-discovery.md), SHA-256 `e6e222e503790852a43fd195fd75bab3d2854baf8b93cbfb3301c948448d4e7e`. Исходники прочитаны через frozen Git `6423443d71a0817570281cf28822a3c14f7db684`, tree `81fa1c2800632324b09afd86d01b6fd671ccc6a5`, в `repo-property-reflow`. Поставка — DS `0.6.0-vnext.54`, archive SHA-256 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`.

## Собственная позиция до обсуждения с автором

**A — разумный первый ограниченный rendered кандидат. Я не рекомендую сейчас закреплять его формулу, default layout или публичную семантику как готовое решение.** Автоматическое сохранение полного текста снижает риск пропущенного opt-in. Однако преимущество A существует только при простой реализации на реальных public wrappers и приемлемом визуальном ритме. Дополнительное имя режима само по себе не делает B хуже для человека; B должен выиграть или проиграть по фактической композиции и цене подключения.

Задача чтения подтверждена. Ранее я лично просмотрел actual Task320/root32 after-open и final; в этом review дополнительно открыт actual Task768/root32 из discovery E2. Подписи усечены и на широкой поверхности. Это поддерживает зависимость от текста и ширины пары, но не доказывает `L=max(H,7U)`, `V=14U` или полезность двух колонок при W≈615/U28. Новый minimal baseline ещё не получен; поведения человека и будущего layout я не наблюдал.

| Роль оппонента | Что поддерживаю | Что оспариваю |
|---|---|---|
| Человек с увеличенным текстом | Полный текущий факт виден до редактирования; увеличение вертикальной длины допустимо. | «Не обрезано» недостаточно, если подпись дробится в узком L при свободном W, имя отделяется от avatar, а следующий label выглядит ближе к чужому значению. |
| Визуальный дизайнер плотности | Стабильная колонка коротких labels на обычном Task и один порядок чтения. | Одновременное обещание прежних 36px rows, естественно растущих controls, разных inline/stacked gaps и отсутствия условного механизма пока не обосновано. |
| DS API для AI-потребителей | Один основной recipe, настоящие controls и явная versioned поставка. | Агенты не должны самостоятельно нормализовывать четыре разновидности wrapper, вычислять U или изобретать readonly-select. Внутренние L/V не нуждаются в новых consumer knobs. |
| Platform-инженер | CSS reflow без remount, JS измерения текста и смены state engine. | Flex wrapping не гарантирует одинаковую границу для разных outer boxes; сохранённый DOM не гарантирует привязку открытого popup после container-only resize. |

## Существенные возражения

### PF04-O1. Формула перехода пока не соответствует единому physical layout item

У `iq-select` значение находится в `.iq-select-wrap`; у date и product host trigger это непосредственная кнопка; у tags — собственное поле. Ghost margins выходят влево на8px, pill отключает этот margin, tags дополнительно имеют block margins. Эти различия присутствуют в DS54, а не являются предполагаемым будущим markup. [S1, S2, S3]

В flex layout решение о строках использует **outer hypothetical size** до распределения shrink/grow. Поэтому арифметика L+G+V не является автоматическим следствием задания двух bases. В условном примере с сохранённым outer margin −8px сумма отличается на8px; это объяснение риска, не измеренный breakpoint кандидата. Min/max ограничения и box sizing тоже должны относиться к определённому carrier. [W1]

**Нужное уточнение:** reference geometry должна относиться к нормализованным outer items. Внутренний декоративный bleed не должен участвовать в разных bases разных controls. Простой scoped reset/выравнивание оправдан этой задачей. Новая универсальная wrapper-архитектура только для спасения формулы — уже существенная цена A. Popup, hidden inputs и tag list должны сохранять свою существующую роль; правило «все дети кроме label — value» нельзя механически переносить в новый layout.

### PF04-O2. У A не определена цена условного ритма

Flex-wrap может дать небольшой gap между label и value после переноса. Из этого не следует автоматическая смена **межпарного** расстояния или ghost insets только в stacked состоянии. Если space-3 применяется между всеми парами, обычная форма становится длиннее; если сохраняется исходный gap0, нужно отдельно показать ясную принадлежность label/value в вертикальной композиции. Это конструктивное ограничение предложенного механизма, а не доказанная невозможность A.

Не следует требовать одновременно exact normal36, conditional stacked4/12 и отсутствие любого способа различить состояния. Разумный первый выбор — единый ритм с явно показанной ценой для normal Task либо более явный mode, если единый ритм плохо читается. Автор уже назвал spacing numbers гипотезами; в следующем решении важнее связь пары, чем сохранение самих чисел.

«Один текстовый левый край» также требует точности: группа avatar/name закономерно имеет другой край букв, чем plain text. Согласовывать следует край value-группы и паритет static/editable одного типа. Подвешивать avatar за границу или добавлять пустые icon slots во все строки ради совпадения букв нецелесообразно.

### PF04-O3. No-grow label и 7U/14U — видимые компромиссы

Если подпись помещается в W, но не в L, A создаёт дополнительную строку даже после перехода к вертикальной паре. Это последствие ширины **видимого текста**, а не требование симметрии невидимых boxes. На реальном Task labels короткие; этого недостаточно для вывода о публичном pattern с более длинными подписями.

14U является бюджетом всего value carrier: avatar/key/chevron, gaps и padding расходуют его часть. Предложение честно не называет это четырнадцатью символами. Но из пропорции ещё не следует, что remaining caption area при W≈615/U28 лучше вертикального варианта. Само наличие15px сверх расчётной границы ничего не говорит о читаемости owner, parent key+title или date+signal.

**Решение после baseline:** сравнить один действительно различающий label, который помещается в W и не помещается в L, и тот же содержательный value. Это позволяет выбрать между no-grow A и B без произвольной нормы числа строк. Не подгонять коэффициенты под старый PNG. U следует брать из явно выбранной interface typography роли списка, а не из случайного `em` у wrapper или меньшего pill font. H уже является публичным host override; его новая роль как предпочтительного, а не точного размера требует прямого описания. Новые L/V настройки для каждого consumer не обоснованы.

### PF04-O4. Tag picker содержит дополнительный input и missing-text путь

Контракт input обсуждает combobox, но public ghost tag picker тоже содержит настоящий editable input. В DS54 он имеет `height:24px; line-height:20px` при interface font; выбранные chips скрывают его ширину до фокуса. Поэтому снятие32/26px ограничений у date/select не покрывает tags. Полный chip caption, remove button, рост поля и раскрытие search input при фокусе — разные части одной композиции. [S1, S2]

Есть более узкий **source-backed blind spot**, который CSS reflow сам не исправит: `IqTagPicker.paint()` создаёт chips по `_value`, кладёт «Нет тегов» в placeholder и затем скрывает input при `readonly`. Для empty readonly state видимый caption этим кодом не создаётся. Это не новый воспроизведённый native failure. Actual Task readonly использует static tags строку с собственным «Нет тегов», поэтому данный путь нельзя приписывать его кадрам.

Следствие для scope: нельзя объявлять все public readonly empty values исправленными по editable Task. Этот путь нужно явно отнести к отдельному finding/ограничению либо к небольшому согласованному исправлению самого control после подтверждения. Не маскировать отсутствие текста CSS-псевдоконтентом в продукте и не расширять задачу до нового tag engine.

### PF04-O5. Статичный Task требует осмысленных value parts

У static Plan, priority/type и empty values встречается непосредственный текст в `.iq-property-value`; у owner/author — несколько sibling parts; у parent key — `flex:none`; у `.tdr-pill` — dot и непосредственный текст с продуктовым height26. Снятие ellipsis только с `.iq-property-text` оставит часть путей прежней. [S3, S4]

Группировка avatar+name и независимый metadata suffix оправдана смыслом данных и предотвращением avatar-only строки. Caption внутри readonly pill также имеет конкретную цель. Это основание для маленькой composition/adoption правки с существующими public parts, а не для второго status component/state engine. Геометрию status fill можно сначала оценить с простым существующим radius role; вычисление нового font-dependent radius допустимо, только если кадр показывает решаемую им проблему. Не превращать ограничение «однострочный радиус» в новый внешний API.

Полнота выбранного caption не означает возврат всех умышленно скрытых metadata: DS wide-list скрывает select meta, а release consumer специально оставляет target date в открытом списке. Reflow не должен незаметно отменить это продуктовое решение. [S1, S3]

### PF04-O6. Resize promise шире сохранения DOM identity

`IqSelect` позиционирует popup при открытии, window resize и scroll. У date-field дополнительно есть visualViewport events и ResizeObserver **popup**, но не trigger. Если меняется только ширина контейнера, сохранённый trigger может переместиться/вырасти без перечисленных сигналов. Это исходящий из source риск для предложенного сценария, а не заявленный новый browser defect. Tag picker имеет другой путь — абсолютный list относительно самого host. [S2]

Нужное различие — window resize и container-only resize при открытом конкретном editor. Сравнивать нужно anchor/popup rectangles, identity и завершение/отмену intent. Если baseline выявит старый deficit, зафиксировать его владельца и границу, а не автоматически переписывать все overlays. Product Estimate уже имеет свой проверенный close-on-resize механизм; PF04 не требует превращать все editors в одинаковый popup lifecycle.

## Проверенная карта public/static путей

| Путь | Конкретная форма в source | Что необходимо учитывать |
|---|---|---|
| Select, searchable, status pill | Label + select-wrap; внутри button/value, optional avatar/key/caption/meta; popup внутри wrap; отдельный hidden input. | Нормализуется carrier, не смешиваются trigger и popup; caption допускает перенос, сохранены search/disabled/keyboard semantics; pill имеет собственную форму. |
| Combobox | Тот же outer wrap, настоящий input и icon/avatar оболочка. | Однострочное редактирование остаётся; высота и label должны расти с текстом. Не обещать multiline input или автоматически заменять его другим control. |
| Date, with-time, public readonly | Label + непосредственный button/caption + native popup + hidden values. | Дата/сигнал полностью видны; readonly API control не тождественен static Task row; естественная высота не меняет календарную семантику. |
| Ghost tags | Label + field с chips, input, chevron; абсолютный list. | Input24/20, chip text/remove affordance, раскрытие search, selected/empty/readonly — отдельные source paths; list не третий inline item. |
| Product Estimate/Plan | `.iq-property`, label, непосредственный `.iq-date-trigger`; Plan имеет sibling popup. | Перенос host caption, внешний value carrier и существующий intent; арифметика должна совпадать с supplied controls без изменения popup поведения. |
| Static plain/empty/Plan | `.iq-property-value`, иногда текст без `.iq-property-text`. | Перенос и line-height на применимом value path, честное empty state, без hover/Tab-stop. |
| Static owner/author/parent/tags | Avatar/text/meta/key/chips как существующие parts. | Имя не отрывается от avatar; key не блокирует title; meta остаётся связанным с фактом; длинный chip тоже переносится. |
| Static status | Продуктовые `.tdr-pill` + `.tdr-dot` + текст. | DS release в одиночку не меняет ceiling26; Task adoption обязателен для заявленного readonly parity. |

Область этих выводов — wide-list. `data-columns=auto/2` относится к внешним колонкам, strip имеет иную задачу; shared selector не должен расширить policy на них без решения. В сочетании внешних колонок с новым mode W означает ширину пары. Наличие query-container шириной всего списка само по себе этого не обеспечивает.

## Цена альтернативы B и каждой добавляемой сложности

У B есть обоснованное преимущество: явная смена композиции позволяет отдать label всю ширину и менять ритм состояния. Inline-size containment действительно меняет intrinsic sizing; безопасная ширина должна следовать реальному host layout. Font-relative query использует font query-container, который может отличаться от U. Это цена контракта, а не аргумент, что container queries вообще плохи. Неподтверждённая draft-возможность подстановки переменных не является гарантией поддержки браузерами. [W2, W3]

| Сложность | Когда она полезна / чего не добавлять сейчас |
|---|---|
| Default intrinsic wrapping | Полезен, если на existing wrappers получены устойчивые строки и нормальный ритм. Не добавлять JS измерение caption ради точности коэффициента. |
| Нормализация outer boxes | Нужна для одной reference geometry. Простая scoped правка оправдана; новый общий wrapper component только ради flex formula не оправдан автоматически. |
| Дополнительные composition parts | Оправданы avatar/name/meta и pill caption, где есть смысловая группа. Не делать каждое поле отдельной карточкой или настраиваемой подсистемой. |
| Opt-in container B | Оправдан заметно лучшим чтением и ритмом при понятной host width. Не превращать его в обязательный «доступный режим», отсутствие которого сохраняет clipping. |
| Новые публичные L/V/gap/radius knobs | Не нужны для этого опыта. Агенту нужен устойчивый recipe и допустимый host override, а не задача настройки математической модели. |
| Новый popup observer/lifecycle | Только по конкретному подтверждённому anchor deficit и его владельцу. Не является автоматической частью CSS reflow. |
| Всегда вертикальный host | Простой резерв, если inline не даёт полезного сравнения или обе адаптивные реализации слишком дороги. Его цена проверяется обычным Task, без нового пользовательского переключателя. |

## Обсуждение с автором после собственной позиции

Автор `design_system_review` получил O1–O4 и resize возражение после формирования позиции выше. В ответе согласился: формула — reference geometry только после нормализации outer items; zero layout-margin является кандидатом опыта, а универсальная новая оболочка не принимается автоматически; единый приемлемый rhythm допустим вместо одновременного обещания exact36 и conditional4/12; цена no-grow реально видима и B нельзя отвергать лишь за attr; tag empty-readonly отделяется от static Task; container-only resize нужно отличать от window resize без blanket overlay rewrite.

В следующем сообщении автор уточнил единый rhythm без распознавания wrap, именование фактических carriers вместо новой wrapper abstraction и возможность начать внутренний gap с нуля, учитывая существующие insets. Я согласился с этой границей опыта: нулевые margins/gap остаются диагностическими гипотезами; небольшое изменение normal density оценивается по реальному списку и связи фактов, а не по равенству всех BCR. B остаётся полноценным конкурентом.

Эти уточнения снимают спор о направлении опыта, но не являются native validation и не меняют frozen proposal. Пороговые значения и окончательный способ остаются открытыми. После уже запланированного baseline полезен только опыт, различающий оставшийся вопрос: outer carrier/переход, цена длинного label и обычной плотности, либо конкретный state из приведённой карты. Общего нового checklist, квоты проверок или дополнительного approval-процесса я не предлагаю.

**Итог для root:** продолжать ограниченный выбор A/B после baseline; сначала можно проверить A с оговорённой ценой и точными carriers. Не объявлять default/API принятыми и не закрывать missing-text или popup-anchor гипотезы одним layout PASS. Предложение и discovery сохранены неизменными; этот отчёт — единственный записанный reviewer файл.

## Источники

- **S1:** frozen [foundation.css](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/src/styles/foundation.css), строки2083–2090, 2416–2445, 2506–2557; [typography roles](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/tokens/semantic.json),93–100; [public contract](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/README.md),68–75.
- **S2:** [components.js](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/src/modules/components.js),132–217,176–183,240–267,1332–1434; [date-field.js](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/src/modules/date-field.js),66,147–170,228–287.
- **S3:** [Task markup](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/products/sprintique/ui/src/board/task-dialog.js),90–146,174–188; [catalog mounts](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/products/sprintique/ui/src/board/catalog-picker.js),12–24; [Plan](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/products/sprintique/ui/src/board/plan-field.js),20–47.
- **S4:** [Task CSS](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/products/sprintique/ui/src/board/board.css),252–266.
- **W1:** independently consulted [CSS Flexbox §9.3](https://www.w3.org/TR/css-flexbox-1/#algo-line-break) — outer hypothetical size and line collection before flexible lengths.
- **W2:** independently consulted [CSS Containment3 §3.1](https://www.w3.org/TR/css-contain-3/#containment-inline-size) — effect on inline intrinsic sizes.
- **W3:** independently consulted [CSS Conditional Rules5 size queries](https://drafts.csswg.org/css-conditional-5/#size-container) — query-container font/size context; draft mechanism is not runtime acceptance.
