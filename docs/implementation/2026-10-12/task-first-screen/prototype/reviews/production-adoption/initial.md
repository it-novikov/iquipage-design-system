# Task: сверка уже принятого production VT1 с frozen VT1 / Compact-A

Дата: 2026-10-12. Автор: независимый AI reviewer `/root/task_first_screen_review`, GPT-6 Astra. Статус: **read-only adoption review; новый main не получил здесь native, human или production acceptance**.

## 1. Вывод и граница решения

**Основную композицию VT1 уже перенесли в main через PR84. Повторный перенос всей старой experimental patch не нужен.** В текущих исходниках есть четыре постоянно раскрытых свойства, группа остальных семи, прежнее «Описание», конкретное начало выбранного результата и переход к полной проверке. Однако PR84 не совпадает ни с frozen VT1, ни с Compact-A: он добавляет собственные CSS и раскрытие группы, распространяет группировку на создание задачи и иначе строит summary. Это новая исходная точка, которую нужно сохранять при дальнейшей работе. [PR84](https://github.com/it-novikov/iquipage-design-system/pull/84), [merge](https://github.com/it-novikov/iquipage-design-system/commit/4f181ff3589a32fd9ce152f99018d212d74624b6).

Один конкретный остаточный риск подтверждён исходниками и исполнением точной модели: renderer теперь отдельно выводит статус сессии над выбранным rejected/blocked шагом. При завершённой сессии это даёт «Работа завершена» рядом с ещё требующим действия шагом. Исправлять следует **уровень и область показа статуса**, не `session.state`, `workFocus` или права. Compact остаётся адресной гипотезой для длинного review на узком экране; нынешние источники не позволяют объявить его уже перенесённым, ненужным либо подтверждённым на main.

## 2. Точные входы и лично выполненная проверка

GitHub read tools подтвердили PR84 `merged=true`, время merge `2026-10-12T11:12:48Z` и следующие ссылки:

| Роль | SHA |
| --- | --- |
| Исследуемый main / merge commit | `4f181ff3589a32fd9ce152f99018d212d74624b6` |
| Base PR84 | `2c757009d7bf3e3d0fc3648241d499d980ebdbb9` |
| Head PR84 | `d6132831d6068533883523770cd88c63a8de6326` |
| Frozen initial prototype source | `0c74ab69487fa5d7ec66ead92400043901e85af2` |
| Frozen Compact source | `ca99680799eee8c865038d537e1bef1def6478f0` |
| Frozen Compact whole tree | `fa3b64c091ce0acec26c1eba6da73bc43a245d34` |

Прочитаны actual commit diff, список изменённых файлов, изменённые части четырёх product modules и model tests. В PR84 изменены 13 файлов: четыре product modules, один файл тестов и восемь PNG. Для всех ссылок на production source ниже зафиксирован main `4f181ff…`, а не плавающий branch.

| Primary path | Git blob SHA |
| --- | --- |
| [products/sprintique/ui/src/board/task-dialog.js](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/task-dialog.js) | `32edc6b31549fa416e33c5a83e903d1216a5fcc1` |
| [products/sprintique/ui/src/board/task-work-view.js](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/task-work-view.js) | `a61eb98732ddf6e276a4a5636b1246415142783e` |
| [products/sprintique/ui/src/board/work-model.js](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/work-model.js) | `ed6145bee9b68854c3510b20d4de6f50d5ed0c1e` |
| [products/sprintique/ui/src/board/board.css](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/board.css) | `fac9efb66c8b40c2eaec68392c87150e1b6258f9` |
| [products/sprintique/tests/work-model.test.mjs](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/tests/work-model.test.mjs) | `e3c5d5fe870fef169641228e0b5791c6610e1cb5` |

Лично открыты изображения, полученные из exact main через GitHub: [base-narrow-light-task-panel.png](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/docs/implementation/2026-10-12/task-first-screen/vt1-render/base-narrow-light-task-panel.png) и [vt1-narrow-light-task-panel.png](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/docs/implementation/2026-10-12/task-first-screen/vt1-render/vt1-narrow-light-task-panel.png). Их Git blob SHA соответственно `e2d2bf16794c1623295854c0303c68ab22a6bf8f` и `22d0e14eaa868daf06a09ec0b168e8f305958e8e`. Остальные шесть новых PNG в этом срезе лично не оценивались.

Оба просмотренных кадра показывают обычную Task TFX-101 «Проверить результат и обсуждение» без видимого work summary. Они иллюстрируют пользу группировки для доступа к описанию, но **не отвечают на вопрос о длинном review summary**. Наличие PNG в commit устанавливает точные bytes изображения; без проверенного manifest оно само по себе не связывает исполнение браузера с этим source tree. Новый browser не запускался. PR-body с заявлениями о локальных тестах прочитан как заявление автора, а не как собственный test PASS этого review.

## 3. Что совпадает и что существенно отличается

Основа сравнения — frozen [vt1.patch](https://github.com/it-novikov/iquipage-design-system/blob/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen/vt1.patch) и [vt1-compact.patch](https://github.com/it-novikov/iquipage-design-system/blob/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen/vt1-compact.patch); их локальные SHA-256 повторно сверены и приведены в §7. Production стороны таблицы опираются на четыре primary modules из §2.

| Аспект | Frozen VT1 | Frozen Compact-A | PR84 / main `4f181ff…` |
| --- | --- | --- | --- |
| Существующая Task | Статус → Исполнитель → Срок → Приоритет; остальные семь в `details` | То же | Та же группа 4+7, в editable и static markup |
| Создание задачи | Явное `if(!task)` сохраняет все свойства раскрытыми | То же | Такого bypass нет: создание также получает группу семи |
| Группа свойств | Native `iq-work-details`, hint через `iq-work-byline`, без нового consumer CSS | То же | `task-more-properties`, свой marker, flex-wrap summary, переносимый hint «Оценка, тип, релиз, план…» |
| Раскрытие при событиях | Дополнительных handlers patch не вносит | То же | Capture `invalid` и `focusin` раскрывают группу, если target внутри неё |
| Контекст и новый status | Отдельный контекст; дополнительный status только для question/review | Question/review status и имя агента объединены в heading | Отдельный контекст; отдельный status при `overview.status && overview.text`, в том числе для обычного выбранного step |
| Выбранный review result | Helper во view, до 160 code points с учётом многоточия | Helper во view, пробный предел 64 с учётом многоточия | Экспортируемый model helper, default 160 до добавления многоточия: возможны 161 code point; есть test на этот случай |
| Нормализация prefix | `workText().trim()`, граница слова | То же с меньшим пробным бюджетом | Дополнительно схлопывается весь whitespace; последняя граница пробела используется при позиции >60% лимита; удаляется конечная пунктуация перед многоточием |
| Preview layout | Отдельная строка label и затем result | Inline label с двоеточием; result | Inline label без двоеточия; result, собственные margin и wrapping CSS |
| Пустой result | «Описание результата не добавлено» | То же без лишнего label | Label «Результат шага» плюс «Описание результата не добавлено», muted parent |
| Вопрос, `canAnswer=false` | «Вопрос ждёт ответа», прежнее `attention:true` | То же | «Агент ждёт ответа», `attention:false`, secondary «Открыть вопрос» |
| Сохранённые рамки решения | Полное имя выбранного шага, один summary, прежний frame, «Описание», старые CTA и grants | То же | Эти элементы сохранены; новых approve/reject в overview нет |

PR84 preview — буквальный prefix **после существующего `workText` и новой нормализации пробелов/конца**, не семантическое резюме и не побайтная цитата raw Markdown. Он экранируется renderer. Это честная форма начала результата при явном label сокращения; различия алгоритма нельзя свести к косметическому «160 вместо 64». [Model](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/work-model.js), [renderer](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/task-work-view.js).

`workFocus` не изменён: открытый вопрос предшествует review, затем рассматривается doing/blocked/rejected step. Preview относится именно к выбранному этим selector результату, не к «последнему по времени». `agentName` берётся из активной либо первой сессии: это **контекст работы агента, не доказательство авторства выбранного result**. Смена видимой композиции не даёт права переименовывать агента в автора. [Model](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/work-model.js).

## 4. Конкретная semantic finding: статус запуска теряет свой уровень

Новая строка renderer не ограничена question/review. Когда `workFocus` выбрал step, `workOverview.text` содержит его название, а `workOverview.status` по-прежнему берётся из session. Точная полученная с GitHub модель была исполнена в памяти с двумя ограниченными примерами; source files не менялись.

| Вход: `sessions[0].state='completed'`, открытого question / pending review нет | Выход focus / overview | Следствие по source renderer |
| --- | --- | --- |
| Шаг `state:'done', approval:'rejected', title:'Повторить проверку сохранения'` | `kind:'step'`; status «Работа завершена»; text «Повторить проверку сохранения» | Условие отдельной строки status истинно |
| Шаг `state:'blocked', title:'Получить ответ о передаче'` | `kind:'step'`; status «Работа завершена»; text «Получить ответ о передаче» | Условие отдельной строки status истинно |

Это **подтверждение поведения чистой модели и ветки markup, не native screenshot и не утверждение о встреченном production incident**. Значение `completed` для законченного запуска само по себе корректно. Проблема — читатель видит неподписанное «Работа завершена» непосредственно перед выбранным нерешённым шагом. Полная Work view при rejected отдельно сообщает «Нужна доработка»; summary теряет эту границу уровней. [Model](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/work-model.js), [renderer / focused Work](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/task-work-view.js).

Предпочитаю уже согласованное узкое решение: дополнительный status в overview показывать адресно для question/review, сохранив прежнее поведение остальных branches. Альтернатива — явно назвать уровень «Состояние запуска», если продукту требуется именно эта информация рядом со step. Во втором случае появляется дополнительный текст и нужна оценка его пользы; это не повод переписывать состояния или selector. Контрольные rejected и blocked нужны именно для этого найденного риска. Новый широкий WP05 здесь не предлагается.

## 5. Какие прежние narrow выводы переносятся

В frozen native сравнении Compact уменьшил summary длинного review с 360.72 до 263.94 px, то есть на 96.78 px, и вернул целиком Due и Priority на конкретном 390×844. Вход группы всё ещё пересекал нижнюю границу: box был виден на 28.625 из 45 px; text rectangle выходил на 2.375 px, а до целого box не хватало 16.375 px. Это разные метрики, и они не заменяют личную оценку видимых glyphs. Числа относятся только к прежним fixtures, CSS, mounts и source. [Frozen native review](task-first-screen-native-review.md), [frozen Compact review](task-compact-native-review.md).

Для main переносится **причинная гипотеза**: отдельные context/status, длинное имя шага и prefix могут вытеснить основные свойства. Точные величины, прежний срез строки disclosure и утверждение о возвращённых Due/Priority не переносятся: PR84 уже объединяет label и preview иначе, нормализует текст иначе и меняет geometry disclosure собственным CSS. Рассмотренные новые narrow PNG без summary этот вопрос не разрешают.

Прежнее решение не требовало уместить все поля, описание и результаты в любой первый экран. После возражения дизайнера Compact был сохранён с допустимой прокруткой в конкретном stress-case; обязательный plain-frame / perfect-fit раунд и подбор 64→50 под fixture были отклонены как непропорциональные. Этот принцип остаётся: **никакого автоматического изменения лимита или снятия frame без остаточного пользовательского выигрыша на текущем варианте**. Более короткий Compact prefix можно рассмотреть после текущего long-review кадра; сам предел 64 не стал продуктовым контрактом. [Согласованный Compact review](task-compact-native-review.md), [позиция дизайнера](task-compact-residual-designer-position.md).

## 6. Спор ролей и изменение позиции

Ниже — экспертные AI позиции, не исследование с людьми. Инженер `/root/task_estimate_review` получил конкретные найденные мной PR84 source facts и дал возражение; он явно отметил, что самостоятельно PR84 source не читал. Поэтому это отдельная проверка рассуждения, не второй независимый source PASS.

| Позиция | Возражение | Разрешение на текущих фактах |
| --- | --- | --- |
| Читатель / reviewer: предмет проверки должен быть понятен до перехода | Конкретный result полезен, но общий «Работа завершена» рядом с rejected/blocked может исказить следующий шаг | Исправить область подписи; полный title и прежний CTA сохранить. Не объявлять агента автором result |
| Частый планировщик: estimate, type, release и Plan должны быстро редактироваться | 4+7 оставляет раскрытие и прокрутку, а создание теперь тоже скрывает type. Нет данных, что эти операции редкие | Не откатывать принятую композицию автоматически. Признавать стоимость доступа и проверить затронутую реальную операцию, если следующий scope её меняет |
| UX / визуальный дизайнер: убрать неоправданную высоту | Старый −96.78 px относится к другой композиции; текущий inline preview уже отличается. Подгонка prefix под один текст не доказывает улучшение | Compact остаётся pending по текущему long-review; ни обязательного perfect-fit, ни вывода «Compact больше не нужен» |
| DS maintainer: сохранить один экземпляр public controls | Полный перенос старой patch затрёт новую group CSS, reveal handlers, model helper и create behaviour | Работать дельтой от main. Новые CSS сами по себе не доказаны нарушением DS; не менять публичные API и владельца контролов ради сходства с frozen patch |
| Инженер: статус завершённого запуска может быть правдивым | Моя ранняя краткая формулировка могла звучать как ошибка состояния, хотя дефект — потеря его контекста | Уточнено: исправляется presentation scope, не session state. PR83 native PASS принадлежит его собственному tree, не новой Task composition |

Про создание есть конкретная source связь: изменение type может применить template и обновить ещё не тронутый priority; это делает доступ к type функционально значимым, а не просто вопросом наличия поля. Но без выполнения create flow нельзя объявить новое disclosure ни сломанным, ни пользовательски принятым. `invalid`/`focusin` handlers — полезное намерение reveal, а не доказательство любого перехода фокуса в закрытую группу. [Task source](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/task-dialog.js).

## 7. Минимальный следующий scope

1. **Принять `4f181ff…` как новую базу реализации.** Не переносить VT1 целиком и не ретаргетить автоматически frozen PR82. Сохранить внешние create / neutral-question / attention / reveal решения, пока конкретный сценарий не даёт причины изменить их.
2. **Исправить найденную неоднозначность status адресной дельтой renderer.** Для выбранного review сохранить state, title, literal result / empty fallback и прежний переход. Для вопроса сохранить разницу `canAnswer` и существующие права. Для обычного selected step не добавлять неподписанный session status. Это не переработка `workFocus`.
3. **Связать решение о Compact с current long-review кадром.** На текущей композиции оценить видимость scope / CTA, Due и Priority, а также обнаружимость входа группы. Вход измерить отдельно, не требовать все семь полей в fold. Если остаётся существенная высотная проблема, переносить только оправданную компактную композицию, сохраняя full selected-step identity и честность частичного result. C / VT2 / plain не становятся обязательными вариантами.
4. **Интеграцию Estimate проверять на точном объединённом кандидате.** На момент чтения [PR83](https://github.com/it-novikov/iquipage-design-system/pull/83) открыт: head `6423443d71a0817570281cf28822a3c14f7db684`, base `2c757009d7bf3e3d0fc3648241d499d980ebdbb9`. Его native/full PASS, сообщённые root и инженерным reviewer, относятся к прежней composition. Они не подтверждают main `4f181ff…`. При интеграции инженер предложил адресно сопоставить popup/estimate/planning CSS и Task wrapper/form/focus handlers, сохранить постоянно включённую regression и проверить взаимодействие на объединённом source. Это не пересмотр всех старых проверок.

Незакрытые границы сохраняются: реальный `Plan` означает schedule `start/end` с apply/busy/error, не membership в спринте; его backend-сохранение здесь не проверялось. Не закрыты новым evidence также create/type-template-priority, readonly, accepted result, cover, personal request и human usability. Это **предел утверждений данного среза**, не новая обязательная матрица для каждой последующей правки. Source не заменяет интерактивное действие, а fixture persistence не заменяет backend. [Task source](https://github.com/it-novikov/iquipage-design-system/blob/4f181ff3589a32fd9ce152f99018d212d74624b6/products/sprintique/ui/src/board/task-dialog.js), [сохранённые границы Compact](task-compact-native-review.md).

### Неизменные исходные артефакты

| Артефакт | SHA-256 |
| --- | --- |
| `repo-task-prototype/experiments/task-first-screen/vt1.patch` | `41f3852ff8d3abfc4777e3aea6ef4e229f1e15d4f46280b681b28196b2a922f5` |
| `repo-task-prototype/experiments/task-first-screen/vt1-compact.patch` | `5ef3ceaa010ea0ed726e0e6067c55822708c3ed4bcde16ecc63cc6b16c8d6c5f` |
| `research/continuation/task-first-screen-native-review.md` | `6671cabb9f40ce77b0dfff35d0c5b34cc8b7d8a38460c68a83e184f3a2622c4f` |
| `research/continuation/task-compact-native-review.md` | `eb9ba67108f0c30fab63ab8588e1da87a78c8a45c2c83f2404ee26a67506a39b` |

В этом review изменён только новый MD вне репозиториев. Исходники, прежние reviews, Git refs, PR, commits и ветки не изменялись. Факт merge PR84 не объявлен доказательством deploy или приёмки нового main.
