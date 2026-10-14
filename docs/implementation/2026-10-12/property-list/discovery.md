# PF04: читаемые свойства при увеличенном тексте

Дата: 2026-10-12. **Read-only discovery; реализация и новый релиз не выполнены.**

## Вывод и задача человека

**Следующий ограниченный шаг — проверить и исправить reflow публичного property-list в DS, затем принять его в настоящем Task.** Перестановка разделов Task и исправленный Estimate popup не устраняют потерю текста внутри строки.

Человек открывает задачу и хочет узнать, кто отвечает, каковы срок/приоритет/оценка и что уже назначено, прежде чем что-либо менять. Сейчас при увеличенном тексте сокращаются и подписи, и значения. Открытие редактора ради чтения недостаточно: статичные поля не имеют такого пути, а выбор значения — отдельное намерение. Частота затруднения и поведение реальных людей не исследованы; наблюдаемый барьер чтению конкретных кадров подтверждён.

## 1. Свидетельства и точная основа

| ID | Наблюдение | Граница |
| --- | --- | --- |
| E1 | В native [after-open](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/estimate-candidate-estimate-11740684903/browser/task-narrow-text200-after-open.png) видны усечения подписи исполнителя/приоритета и значений срока/приоритета/оценки. В [final после закрытия popup](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/estimate-candidate-estimate-11740684903/browser/task-narrow-text200-final.png) сохраняются те же усечения; статичный «План» переносится тесно и выходит вправо, автор раскладывается на несколько тесных строк. | 320×900, light, comfortable, Chromium 151.0.7922.34, DPR1. HTML root font-size 32px / 200%; browser zoom 100%, visualViewportScale1. Synthetic настоящий Board→Task, не production и не наблюдение человека. |
| E2 | В предыдущем native [Task text200](sandbox:/workspace/scratch/b3dac59f68e2/repo-evidence/docs/implementation/2026-10-12/task-first-screen/evidence/text200-light-board-task-panel.png) подписи исполнителя/приоритета также сокращены, хотя значения преимущественно помещаются. | 768×900, root32px; тот же PNG находится в native/tabs/evidence/visual/after. DS54. Следовательно, только правило «на узком viewport» недостаточно. |
| E3 | CSS причины присутствует в consumed DS54; соответствующие правила исходного foundation.css побайтово найдены в packed dist/iquipage.css. Task markup/hash соответствует raw capture. | Минимальный DS-only render и абляция отдельных правил **NOT_RUN**. Source + product frame уже достаточны для ограниченного следующего опыта, но не для принятия будущего reflow. |

Рассмотрен immutable `repo-estimate` **6423443d71a0817570281cf28822a3c14f7db684**, tree **81fa1c2800632324b09afd86d01b6fd671ccc6a5**. Raw E1 записывает CI source **7dbb86d6130fef17cecb4810610cfae0976089c0**, тот же tree; task-dialog/package/lock hashes отдельно совпали. Main **2c757009d7bf3e3d0fc3648241d499d980ebdbb9** имеет тот же затронутый DS CSS и Task integration; estimate delta меняет popup/estimate composition и сопутствующие docs, а не property runtime.

Exact package: `@iquipage/web@0.6.0-vnext.54`, archive SHA256 **a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457**. [Raw E1](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/estimate-candidate-estimate-11740684903/browser/results.json) SHA256 `ba5c1e84bbce367dbeb33e9a1ac1c20ffb8465d660b228e132cdb0b1ac244a38`; PNG after-open `cf49fe62e5dd37bd0066a4939cfc0588cb2bba4c990d7f8a5884a4e3ff0b5c85`, final `10cfd20ad6d85d55f9e2e4e93a3cdeb9137c8724c3c5be539f98fa96018d8185`. E2 SHA256 `24fc9743b7ed140d8676c773a3995b941ac9611693b99e3ac0d26e6872ece756`; provenance — [существующий manifest](sandbox:/workspace/scratch/b3dac59f68e2/repo-evidence/docs/implementation/2026-10-12/native/tabs/evidence/manifest.json) и lossless raw candidate2. Результат PASS существующего Estimate/Tabs runner относится к его критериям; property-list им не принят.

## 2. Причина и ответственность

| Уровень | Конкретное правило и следствие | Владелец |
| --- | --- | --- |
| Доступная ширина | `.iq-properties[data-label=wide]` всегда задаёт label track **120px** и вторую колонку `minmax(0,1fr)`. Label font `.8125rem` растёт с 13 до26px, ширина track не растёт. Подписи имеют `nowrap; overflow:hidden; text-overflow:ellipsis`. [S1, S2] | DS. Task использует поставленный pattern; только fullscreen переопределяет публичную ширину на136px. [S5] |
| Полнота значения | `.iq-properties` принудительно сокращает `.iq-select-value`, `[data-date-caption]`; wide-list отдельно сокращает `.iq-select-label`. Статичный `.iq-property-text` тоже однострочный с ellipsis. Полный label остаётся в данных/DOM, это не его обрезка сервером. [S1, S3, S4] | DS visible-text contract. Ни tooltip, ни accessible name не восстанавливают визуальное чтение. Фактическая screen-reader приёмка здесь не выполнялась. |
| Высота и перенос | Ghost controls имеют `height:32px`; status pill —26px. Подписи и `.iq-property-value` — `line-height:20px`. E1 измерил estimate trigger height32 при font28/line-height42. Само превышение line box ещё не доказывает отсечение глифов, но фиксированная высота не является контрактом многострочного значения. [S1] | DS. При reflow нужны высота по содержимому, достаточный line-height и min-height для hit/focus, а не только снятие ellipsis. |
| Статичная композиция | Read-only Plan отдаёт обычный текст `.iq-property-value`; его flex-wrap переносит слова/части, но длинное слово не получает безопасного break. Автор соединяет avatar, `.iq-property-text` и nowrap `.iq-property-meta`. Task дополнительно рисует собственный read-only `.tdr-pill` с height26px. [S4–S6] | Общие text/wrap правила — DS; состав, meaning и read-only pill parity — Task. Открывать редактор у статичных свойств нельзя вводить как обход. |

Конкурирующие причины проверены доступными свидетельствами: popup не объясняет дефект — E1 final сохраняет его без popup; исключительно тесный телефон не объясняет label clipping — E2 воспроизводит его при768px; группировка/раскрытие меняет количество строк, но не их width/overflow правила. Дополнительный вклад product cascade в каждое значение ещё следует отделить DS-only render, особенно для static Plan/author; не надо обследовать backend без причинной связи.

## 3. Что уже позволяет public DS

| Поставленный механизм | Что можно использовать | Чего он не решает |
| --- | --- | --- |
| `.iq-properties[data-label=wide]`, `--iq-properties-label` | Документированный object-facts pattern, единый порядок, ghost value; host может задать ширину label. [S2] | Увеличение track отнимает место у значения; `rem` вместо px само по себе не создаёт reflow и не снимает fixed heights. |
| `.iq-properties[data-columns=auto]` | Число **колонок свойств** меняется по доступным272px; есть явный вариант2. [S1, S2] | Внутри свойства всё ещё две колонки и сокращения. Это другой уровень сетки, не stacked label/value. |
| Обычные `iq-select`, `iq-date-field` вне properties | Публичные controls с label перед editor; `searchable`, placeholder, pill/trigger-icon — существующие возможности. [S3] | Переносить весь Task в обычную форму — смена композиции; ни это, ни снятие wide не дают доказанного общего long-value решения. |
| Статичные `.iq-property` + label/value или `dt/dd` | Read-only facts без disabled controls; тот же semantic порядок. [S2, S4] | Нет документированного reflow/multiline switch. `.iq-property-strip` скрывает видимые labels и не отвечает этой задаче. |

Нельзя выдавать предлагаемый `stacked/auto` режим за уже существующий API. Для новой возможности достаточно конкретного public markup/CSS contract и примера потребления; новый мегакомпонент, date framework или state engine не нужен.

## 4. Варианты с ценой

| Вариант | Композиция | Достоинства и цена / условие отказа |
| --- | --- | --- |
| **A. Сохранить две колонки, разрешить естественный перенос** | Label/value выравниваются по первой строке; тексты переносятся, высота естественная; label track учитывает текстовый размер. | Близко к привычному сравнению строк на широком месте. На280px содержимого при text200 колонка значения всё равно мала: много коротких строк и распад имени/даты. Отвергнуть как универсальный вариант, если для чтения нужно дробить обычные слова на несколько строк при свободной ширине всей пары. |
| **B. Адаптивная пара — рекомендуемая проверяемая гипотеза** | При достаточном месте label слева, value справа. В тесном **контейнере относительно размера текста** — полный label над полным value. Одна и та же DOM/control identity; высота следует тексту. | Сохраняет обычную плотность и человеческую связь «что / какое значение». Нужна согласованная правка label, value, высот, pill/static частей. Реальный предел переключения определяется render; global viewport breakpoint заранее не назначается. Цена — более длинный список при увеличенном тексте. |
| **C. Всегда вертикальные пары в данном property-list** | Label над значением во всех размерах; один спокойный левый край, одинаковая структура. | Самый простой предсказуемый layout без переключения. На широком Task дороже по вертикали и медленнее сравнение по колонке. Использовать как запасной вариант, если B требует нестабильного измеряющего JS либо сложного branching; normal-size Task должен доказать приемлемую плотность. |

В B/C связь внутри пары должна быть сильнее интервала между парами: небольшой внутренний gap, более заметный межстрочный ритм. Значение — основной читаемый текст, label — вторичный, но полностью видимый. Дата сохраняет сигнал, оценка — единицу; avatar/dot/chevron не съедают доступную текстовую колонку и не зависают между строками. Long-name/key/meta могут иметь осмысленные отдельные строки; для действительно неразрывных строк нужен безопасный перенос. Не уменьшать шрифт, не ограничивать существенный текст line-clamp, не скрывать его только в hover или edit. Нельзя требовать все11 строк на одном экране text200: вертикальное продолжение нормальнее потери содержания.

## 5. Ограниченный следующий scope

1. Сначала один DS-only native recipe на exact54: select/status/date, произвольная `.iq-property` с host trigger и статичным value. Те же строки — в actual Task. Это отличает DS от продуктового ограничения и даёт historical red; сейчас **NOT_RUN**.
2. Проверить B на этом recipe. Область изменения — публичный property-list и непосредственно используемые text/trigger состояния, без глобального изменения всех `.iq-control-label`/меню/табов. Если нужен public mode, определить его после опыта, с прямой документацией границ. CSS reflow предпочтителен дублированию/remount контролов.
3. Принять точную новую поставку в Task: editable и readonly, empty/populated, long owner/release/parent, date+signal, estimate+unit, Plan и author. Product `.tdr-pill` не должен остаться зафиксированным на26px после изменения DS. Порядок свойств и права не менять в этом пакете.
4. Сохранить обычную геометрию там, где она пригодна. Существующие regex-тесты `vnext27.test.cjs` закрепляют36/120/26px, но не доказывают читабельность; изменять их только вместе с принятым новым контрактом и meaningful native evidence, не ради зелёного результата. [S7]

**Affected consumers:** основной найденный runtime consumer — общий Task list (`task-dialog.js`: editable/static); вложенные release/tags из `catalog-picker.js`, Plan из `plan-field.js`, Estimate host trigger. Его открывают Board и Planning creation; проверять общий drawer, а не перепроектировать каждый маршрут. [S4–S6, S8] Если меняется общий `.iq-properties` selector, дополнительно проверить existing `data-columns=auto` и обычный select/date вне pattern на том же package. Это совместимость затронутого правила, не обязательный второй consumer для каждой строки CSS. `iq-combobox` имеет настоящий однострочный input: не обещать его multiline display данным исправлением; сохранить native editing и проверить применимый label/layout контракт.

## 6. Какой native опыт различит гипотезы

| Вопрос | Минимально различающее свидетельство |
| --- | --- |
| DS или product? | Один текст/markup на exact54 без product CSS и в actual Task; записать computed grid tracks, width/overflow/white-space/line-height. Если minimal не воспроизводит конкретное значение, искать product owner до изменения общего DS. |
| Viewport или контейнер/шрифт? | Две ширины property-container при **одинаковом широком viewport**; отдельно root100/200. Повторить уже известные320×900 и768×900 условия. Не создавать полную матрицу всех размеров. |
| Текст действительно доступен? | Полный label/value в кадре, естественные переносы; проверка реальных text rects с ancestor clipping и manual inspection. `scrollWidth === clientWidth` не доказывает отсутствия ellipsis; выход line box за кнопку не равен видимому clipping. Проверить long word, date+signal, key/name/meta и static Plan. |
| Сохранилось редактирование? | Native pointer/keyboard: один open intent, выбрать или отменить, Escape/return к тому же trigger; видимый focus и hit area после переноса, без scroll/focus repair. Счётчики synthetic callbacks доказывают только UI dispatch, не сохранение backend. |
| Сохранилась эстетика? | Сопоставленные normal/text200 кадры: ясные пары, устойчивый левый край, отличие текста от управления, отсутствие слипшихся строк/лишних рамок. Убедиться, что все свойства доступны прокруткой и active control не теряется. B отвергается, если переключение создаёт нечитаемую промежуточную колонку или требует remount. |

Root-font enlargement не переименовывать в настоящий browser zoom. Расширенные Safari/Firefox/iOS/VoiceOver проверки остаются перед релизом по принятому правилу; minimal Chromium опыт не закрывает их. Наблюдение реального человека и итоговая визуальная приёмка нового варианта **NOT_RUN**. Независимый reviewer Estimate отдельно подтвердил наличие background truncation и границу popup acceptance; нового раунда общего аудита здесь не проводилось.

## Источники кода

Все ссылки — immutable main2c757; проверенные затронутые исходники совпадают с estimate642.

- **S1 — DS layout/text:** [foundation.css:2083–2090](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/styles/foundation.css#L2083-L2090), [strip:2127–2146](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/styles/foundation.css#L2127-L2146), [2413–2443](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/styles/foundation.css#L2413-L2443), [2505–2538](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/styles/foundation.css#L2505-L2538); [type tokens:93–97](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/tokens/semantic.json#L93-L97).
- **S2 — Public recipe:** [control-contracts.md:47–53](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/docs/control-contracts.md#L47-L53), [README:68–74](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/README.md#L68-L74), [README:147–170](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/README.md#L147-L170).
- **S3 — Control markup/selected text:** [components.js:132–151](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/components.js#L132-L151), [192–217](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/components.js#L192-L217), [date-field.js:66](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/src/modules/date-field.js#L66).
- **S4 — Actual Task lists:** [task-dialog.js:90–146](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/task-dialog.js#L90-L146), [174–188](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/task-dialog.js#L174-L188).
- **S5 — Product sizing/static pill:** [board.css:252–265](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/board.css#L252-L265).
- **S6 — Nested consumers:** [plan-field.js:10–47](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/plan-field.js#L10-L47), [catalog-picker.js:12–26](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/catalog-picker.js#L12-L26).
- **S7 — Existing source assertions:** [vnext27.test.cjs:13–26](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/libraries/iquipage/tests/vnext27.test.cjs#L13-L26).
- **S8 — Actual callers:** [board.js:148](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/ui/src/board/board.js#L148), [planning-host.js:49](https://github.com/it-novikov/iquipage-design-system/blob/2c757009d7bf3e3d0fc3648241d499d980ebdbb9/products/sprintique/web/planning-host.js#L49).
