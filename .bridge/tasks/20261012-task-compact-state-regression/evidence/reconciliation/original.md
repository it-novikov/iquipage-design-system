---
schema: source-reconciliation/1
id: TASK89-90-RECONCILIATION
reviewer: /root/task_overview_native_r2
model: GPT-6 Astra
date_utc: 2026-10-12
verdict: SOURCE_RECONCILED_NATIVE_PENDING
recommended_slice: test-only on frozen PR90
main_subject: 41ebe4823471072ed6dbb405fbd5e755852eec3f
pr90_subject: 5bd09d647f79f06c7a7c844f91a6914907ed8e8b
pr88_historical_subject: 1fd928e12b43b26f29ebcb190a5595c1d2618444
runtime_changes_by_reviewer: false
repository_or_pr_mutations: false
---

# Task PR89 / PR90 — сверка с PR88 и точный следующий срез

**Рекомендация: отдельный test-only PR поверх frozen PR90, без переноса runtime из PR88.** PR89 уже восстановил модель, preview, нейтральный вопрос, CSS и модельный тест; PR90 меняет композицию и самостоятельно сохраняет нужный смысл guard из PR88. Уникальная ценность PR88 теперь — исправленный native regression, происхождение сборки и независимо проверенные исторические свидетельства.

Нужно перенести этот regression с новым замороженным планом и точными ожиданиями Compact, снять текущие длинные состояния и оценить их. Старые размеры PR82 и native PASS PR88 не являются приёмкой PR90. Это source/integration review: новая геометрия PR90 здесь не измерялась, его runtime не менялся.

## 1. Проверенные источники и идентичность

| Ветка/состояние | Commit | Полное дерево |
| --- | --- | --- |
| Общий base после Estimate PR83 | `4275dde301b5068b3d6b1801ecb54c70a2d7e708` | `c7ad669f19eb5027d63994c9e4d1642b3b9f0bd6` |
| Проверенный ранее PR88 | `1fd928e12b43b26f29ebcb190a5595c1d2618444` | `c039d65a75d1e4312b5931cc76a4d28fb7ef8e08` |
| Head PR89 | `9bdf7871717bb2e9e11758f9641811536878de2d` | `e3aa1d9369b6e6e17a388fb394e7699471ff9ced` |
| main после squash PR89 | `41ebe4823471072ed6dbb405fbd5e755852eec3f` | `e3aa1d9369b6e6e17a388fb394e7699471ff9ced` |
| Head PR90 на момент проверки | `5bd09d647f79f06c7a7c844f91a6914907ed8e8b` | `6d4a4e4a66b7a46e6bda4f8378a0975def2aea7c` |

[PR89](https://github.com/it-novikov/iquipage-design-system/pull/89) merged; [PR90](https://github.com/it-novikov/iquipage-design-system/pull/90) open и mergeable на момент полученного API record. Его parent — main41ebe. Head PR89 и его squash имеют одинаковое дерево. PR88 остаётся другим frozen источником.

Получены GitHub commit/PR metadata, полный список 12 изменений PR89 и трёх изменений PR90. Шесть затронутых/соседних файлов fetched по exact refs в base64; все 12 полученных blob SHA проверены по байтам. Для base83 и PR88 те же шесть файлов прочитаны из frozen Git. Всего 24 source snapshots. Прямые сравнения сделаны по байтам этих endpoints. Сохранённый API compare `diff88_main89` показывает diff от merge base; его нельзя ошибочно считать прямым diff head88→main89.

Описание PR89 объясняет откат PR87 сборкой из старого дерева. Это новое объяснение автора PR89; byte diff независимо подтверждает восстановление перечисленных частей. Рецензент не выдаёт из текста PR доказательство мотива или всей истории действий автора.

## 2. Что уже совпадает и что различается

| Поведение/артефакт | PR88 | main PR89 | PR90 |
| --- | --- | --- | --- |
| Literal result helper | Default 160 code points | Байт-в-байт тот же | Default 160 сохранён |
| Preview именно в overview | 160 | 160, те же байты модели | 64 через отдельный OVERVIEW_RESULT_LIMIT |
| Вопрос без canAnswer | Нейтральный status и secondary CTA | То же | То же; state и агент объединены в headline |
| Дополнительная status-строка | Только q/review через `(q||review)&&` | Guard отсутствует | Дополнительная строка удалена; headline есть только q/review |
| Rejected/blocked overview | Без ложного «Работа завершена» | Это сообщение снова показывается рядом с выбранным шагом | Не показывается; нужный смысл guard сохранён структурой |
| Genuine completion | Fallback «Работа завершена» | То же | То же |
| Полное представление Work и команды | Существующие | Не изменены | Не изменены |
| task-dialog.js: focusin guard и 4+7 properties | Сохранены | Тот же blob | Тот же blob |
| board.css | Восстановленные 14 строк | Байт-в-байт тот же файл | Байт-в-байт тот же файл |
| work-model.test.mjs | Восстановленный набор | Байт-в-байт тот же | Добавлен compact case и expectation headline |
| Native Task state runner/fixture/plan | Есть, corrected R1 и native R2 | Нет | Нет |
| Task companion workflow steps | Есть | Нет | Нет |
| Восемь VT1 PNG из PR84 | Не возвращались в runtime PR | Восстановлены исторические файлы | Унаследованы; новых Compact PNG в diff нет |

Точный общий blob task-dialog.js: `59d3d23c98fc8715124be29a48b9ba73ff84d6e2`, SHA256 `a5a35c0300044bb6c9cb6b802ac1ca9e508b01e2466afb6cac9f147671f5be55`. Source guards раскрытия, режим создания и property grouping не требуют повторного переноса.

В PR90 меняются ровно [work-model.js](https://github.com/it-novikov/iquipage-design-system/blob/5bd09d647f79f06c7a7c844f91a6914907ed8e8b/products/sprintique/ui/src/board/work-model.js), [task-work-view.js](https://github.com/it-novikov/iquipage-design-system/blob/5bd09d647f79f06c7a7c844f91a6914907ed8e8b/products/sprintique/ui/src/board/task-work-view.js) и [work-model.test.mjs](https://github.com/it-novikov/iquipage-design-system/blob/5bd09d647f79f06c7a7c844f91a6914907ed8e8b/products/sprintique/tests/work-model.test.mjs). DS package/API/CSS, Task dialog, права и dispatch/navigation не меняются.

PR90 сохраняет context в projection, добавляет headline для вопроса/проверки и использует headline вместо прежнего context h3 плюс отдельного status p. Это один смысловой заголовок, а не CSS-гарантия одной визуальной строки: длинное имя агента может переноситься. Поскольку extra status p больше нет, повторное добавление guard PR88 в этот renderer бессмысленно.

### Изменение конкретного текста

В source probe импортированы actual frozen workOverview трёх версий с прежним deterministic fixture-data.json. Выполнена чистая модельная projection, без DOM/браузера. Результаты:

| Данные | PR88 и main89 | PR90 |
| --- | --- | --- |
| Короткий literal: исходно 69 code points | Все 69, label «Результат шага» | 58 с многоточием, label «Начало результата» |
| Длинный result: исходно 268 code points | Префикс 156 с многоточием | Префикс 61 с многоточием |
| Review heading | «Работа агента · Кодекс» + отдельный status | «Результат на проверке · Кодекс» |
| No-answer heading | «Работа агента · Кодекс» + отдельный status | «Агент ждёт ответа · Кодекс» |

Это **длины строк модели**, не размеры блока или измерение улучшения. Full Work result остаётся исходным; CTA review:S1 и question:Q1, selected step title и permissions не меняются.

Source-probe record: `task89-90-reconciliation-model-probe.json`, SHA256 `f7e7b363ff4c347bef90f6547525a93015bb446d93b1d7e9e1e48020bb640e42`.

## 3. Конфликты интеграции и безопасное разделение работы

Применён read-only `git merge-file -p --diff3` к scratch-копиям с настоящим common base4275. Это per-file conflict probe, не выполненный merge репозитория.

| Пара | Файлы с конфликтами | Автоматически совместимое |
| --- | --- | --- |
| PR88 + main89 | task-work-view.js: один конфликтный блок | model, model tests, board.css, task-dialog.js; workflow сохраняет companion PR88 |
| PR88 + PR90 | task-work-view.js: 1; work-model.js: 2; work-model.test.mjs: 3 | board.css, task-dialog.js; workflow сохраняет companion PR88 |

Число конфликтных блоков описывает конкретный merge-file запуск и не является прогнозом точного UI другого merge tool. Но источники конфликта реальны: обе ветки восстановили одну строку renderer и модель от общего старого base, затем развили их по-разному.

Выбор «ours» для всего runtime88 поверх90 откатит Compact. Выбор «theirs» для всего PR уничтожит уникальную работу проверки и её историю. Новая test-only ветка от frozen90 вообще не нуждается в таком выборе: она оставляет runtime90 и переносит только проверочный слой.

Уникальное из PR88, которое стоит использовать:

- Corrected runner с нормализованным product root и полным inventory физических inputs; прежний дефект нулевого product inventory не возвращать.
- Пять Task semantic scenarios, реальные openTaskDialog/mountTaskWork, synthetic read adapter и отсутствие write attempts.
- Два passive long captures с title/summary/CTA/preview/property/disclosure/description/scrollport geometry.
- Два постоянных companion workflow steps на существующем browser setup; не создавать новую независимую инфраструктуру.
- Историю frozen plan v1/v2, source R1 с исходными недостатками и corrected addendum, native R2 и raw evidence как исторические документы, а не как результаты новой сборки.

В test-only PR не нужны повторное восстановление board.css/model, восемь старых PNG или копия всего runtime diff PR88. Его полный исторический evidence уже сохраняется отдельно.

## 4. Что показала проверка существующих PR90 свидетельств

Проверены PR body, issue comments, reviews, текущий browser workflow, его job metadata и список artifacts. Comments и reviews пусты. В PR diff нет нового native evidence или screenshot. Ссылка на замеры PR82 в body явно историческая; она не создаёт текущий результат Compact.

Native [Tabs geometry run38253043338](https://github.com/it-novikov/iquipage-design-system/actions/runs/38253043338), job114823924708, имеет success. В нём только Tabs и Estimate шаги. Artifact metadata:

| Artifact | ID | Размер | SHA256 из GitHub metadata |
| --- | --- | --- | --- |
| tabs-geometry | 11748497863 | 1 143 679 | `8e2ecb0dcfe285cca8340ad6e720069b58bed746b1067c8d282f80f40050c6b4` |
| estimate-popover | 11748797694 | 2 087 039 | `6facc7d5c310ecb917e63dcc938d52bb9bb5f76eece9a12c021e9c8d67d471b8` |

Эти ZIP не скачивались повторно и не выдаются здесь за просмотренные. Их scope установлен по workflow и actual read adapter: tabs-geometry repository для GET work возвращает workPlan:null и sessions:[], а summaryRoot при отсутствии плана скрыт. Следовательно, этот зелёный Tabs/Estimate job не показывает изменённую агентную сводку Compact. Task state artifact и соответствующих шагов нет. Это конкретный пробел покрытия, который и закрывает предлагаемый test-only slice.

Maps run38253043323 на момент чтения metadata также success; полный Sprintique vNext run38253043320 был in_progress. Их приёмка не выполнялась в этом source review. Повторять существующие проверки ради чтения статуса не требуется.

Ранее проверенный native PR88 относится только к head1fd и равному ему checkout72f862. Root отдельно сообщил об успешном полном retry PR88 с 478 / 610 / 610. Здесь этот полный пакет не ревьюился; два числа 610 относятся к суммарным counts JS/Node test runner в product и detached проверках, **не к количеству самостоятельных Kotlin/backend тестов**. Ни эти counts, ни native R2 нельзя подписывать как current main41ebe или PR90.

## 5. Точный контракт нового native плана

### Frozen identity до запуска

Новый активный план должен явно описывать Compact head5bd09d6, его дерево и test-only descendant с новым head/tree после публикации. Сохранить original v1 и v2 побайтно; записать новую revision и независимый digest до исполнения. Если v3 указывает predecessor v2, не оставить ошибочное сравнение этого digest с файлом v1: ancestry надо явно связать с обеими сохранёнными версиями.

Изменение ожиданий объясняется новым публичным представлением: headline и prefix64. Права, смысл действий, буквальность данных и отсутствие записи не ослабляются. Исправлять frozen v2 задним числом ради зелёного теста нельзя.

Сохранить среду и данные прежнего targeted scope: native Chromium/Playwright версии workflow, DS54 exact archive, desktop1280×900 и narrow390×844, light/comfortable/root16, ru-RU/UTC, фиксированное время, DPR1, обычный pointer. Не менять long title/result и Task properties без отдельной причины. Новый inventory должен показывать **все фактические** входы и outputs; число197 — историческое наблюдение, не магическое условие полноты. Положительные invariants присутствия actual Task dialog/renderer/model/consumer обязательны.

### Семантические оракулы вместо старой формы DOM

Общий старый assert `summary.context === "Работа агента · Кодекс"` больше не подходит для question/review. Snapshot должен различать actual heading и дополнительную status p. Нельзя считать любой `.task-work-status` отдельным status-row: в PR90 этот класс стоит на h3.

| Case | Точное ожидание overview | Доказательство перехода |
| --- | --- | --- |
| completed-rejected | Heading «Работа агента · Кодекс»; полный выбранный title; нет extra status p и нет «Работа завершена» в overview; secondary «Открыть работу» | Настоящий Work panel/tab; правильный шаг и «Нужна доработка»; writes=0 |
| completed-blocked | То же правило, точный title своего шага | Правильный шаг и «Нужен ответ»; writes=0 |
| review-literal | Heading «Результат на проверке · Кодекс», attention=true; точный step title; primary «Проверить результат», action=review:S1; нет approve/reject в overview | Открыт и сфокусирован именно S1; полный original result; разрешённые decision controls только внутри полного Work и не нажаты |
| question-no-answer | Heading «Агент ждёт ответа · Кодекс», attention=false; точный question title; secondary «Открыть вопрос», action=question:Q1; pending review не перехватывает фокус | Q1 и его heading focus; нет enabled input/textarea для ответа и answer command; writes=0 |
| genuine-complete | Heading «Работа агента · Кодекс», main text «Работа завершена», без дубликата extra status p | Нормальный complete Work с существующим summary; writes=0 |

Для всех пяти: один overview CTA, актуальное native modal Task, правильная выбранная вкладка, нет write decision controls в сводке, exact scenario read действительно прошёл, unsupported/errors/external requests пусты. Восстановленный смысл guard проверяется содержанием и сценариями, не наличием подстроки `(q||review)&&` в source.

### Literal witness: сохранить различающую проверку

Рекомендую оставить нынешний **69-code-point исходный literal**, а не сокращать fixture так, чтобы она обходила новое ограничение. Это одновременно проверит честное обозначение усечённого результата, буквальное отображение markup/entity и доступность полного результата.

Заранее зафиксировать независимую ожидаемую строку preview:

```text
История «<em>готово</em> &amp; проверено» сохранена после…
```

Label — «Начало результата», child elements внутри preview — только label span; реальных em-элементов нет. Ожидаемый текст записать literal fixture-константой, а не получить через workResultPreview внутри oracle. Не ослаблять assert до includes, «не пусто» или «длина меньше65».

После обычного клика в полном S1 должен быть **исходный полный текст**:

```text
История «<em>готово</em> &amp; проверено» сохранена после обновления.
```

Так изменение 69→58 не маскируется как полная буквальная копия и не разрушает исправленный в source R1 witness экранирования. Неправильная интерпретация em/entity или потеря полного текста по-прежнему должна уронить соответствующую проверку.

### Длинные состояния и оценка композиции

Сохранить два случая long-review-desktop и long-review-narrow до навигации. Captures остаются CAPTURED: никакого автоматического «приоритет обязан влезать» и переноса чисел82. Снять raw rectangles/text ranges и реальные PNG для summary, heading/title, CTA, preview, первых четырёх свойств, disclosure/text, description и scrollports.

Рецензент проверяет, видно ли действие и его результат, куда первым попадает внимание, сохранился ли смысл контекста агента, насколько полезен prefix, что ожидаемо требует прокрутки, есть ли clipping/налезание и не превращено ли содержание в множество одинаково заметных строк. Результат, статус и свойства служат разным человеческим задачам; сводить оценку к минимальной высоте нельзя.

Существующие R2 before frames могут быть историческим reference. Численный before/after вывод допустим лишь после сверки одинаковых данных, DS, среды и неизменённых влиятельных inputs; если это равенство не установлено, сначала снять сопоставимый control. Новый native после PR90 в любом случае необходим. Полученный PASS нельзя подписывать старым head или переименовывать в наблюдение реального пользователя.

## 6. Состояние прежних находок и спор ролей

| Находка R2 | После main89 | Что меняет PR90 | Текущий вывод |
| --- | --- | --- | --- |
| F1: тяжёлая длинная композиция | Структура review остаётся прежней | Объединяет context/status и уменьшает prefix | Направление соответствует причине; размер выигрыша, видимость свойств и эстетическая пригодность требуют актуального native |
| F2: неоднозначность уровней status | В overview rejected/blocked опять появляется unqualified completion; полный Work прежний | Overview снова не показывает эту строку; полный Work не меняется | Guard-смысл сохранён PR90; общий язык full Work остаётся OPEN |
| F3: вопрос без canAnswer без объяснения внутри формы | Не меняется | Только заголовок overview | OPEN, отдельный локальный продуктовый slice |
| D1: BODY focus у общего Open work | Обработчик прежний | Обработчик прежний | Не закрыт; keyboard failure ещё не доказан, отдельное воспроизведение по необходимости |

**Обычный участник.** Более короткая сводка помогает искать срочность и постановку, но переход к полному результату должен быть очевиден. Возражение рецензента результата: слишком короткий префикс может оставить только вводную фразу, а не полезный итог. Решение — не объявлять 64 универсальным оптимумом; проверить текущий кадр и полный переход на тех же содержательных данных.

**Человек, читающий длинный контент.** Сохраняются полный title и доступ к полному результату. Возражение дизайнера: эти гарантии не требуют повторять служебный контекст двумя строками. PR90 убирает повторение через headline; это разумная гипотеза компактности, а не повод применить clipping или уменьшить шрифт. Фактический перенос headline с длинным именем надо трактовать естественно, без требования одной строки.

**DS consistency.** PR90 использует прежние публичные work-story primitives, app status class, типографику и CSS. Нового приватного DOM-патча, смены DS или токенов в трёхфайловом diff нет. Возражение продуктового проектировщика: порядок смысла сводки остаётся ответственностью продукта; новый DS properties reflow сам его не исправит. Не объединять этот test-only slice с DS55 adoption.

**Разработчик/QA.** Старый fixture ценен, но h3/context и literal69 нельзя механически оставить как ожидания Compact. Возражение контроля качества: переписанные assertions могут просто скрыть регрессию. Решение — новый frozen plan, точные новые строки, старые human invariants и полная проверка перехода; literal witness становится одновременно проверкой префикса и полного текста. Ни формальный count тестов, ни отсутствие merge conflict не заменяют native evidence.

Source comment при OVERVIEW_RESULT_LIMIT утверждает, что бюджет удерживает due/priority на первом390px экране, ссылаясь на82. Его стоит трактовать как мотив исторического опыта, а не текущую гарантию. Для дальнейшей документации формулировку следует ограничить этим происхождением до свежей проверки. Это замечание к доказательству обещания, не требование менять сам выбранный runtime бюджет в данном test-only PR.

## 7. Передача

**Следующий шаг root:** создать отдельную test-only ветку от exact head5bd09d6, перенести corrected fixture/runner и два companion steps с описанным планом/оракулами, сохранить предшествующие планы и получить свой immutable native evidence. Не менять внешние PR89/90, не восстанавливать поверх90 runtime88, не объявлять старую проверку текущей.

Материалы лежат в `research/continuation/` с префиксом `task89-90-reconciliation`:

- `*-sources/`: 12 GitHub base64 responses и 24 проверенных snapshot файла.
- `*-source-integrity.json`: blob/SHA256 сведения, прямые diff и per-file merge probes; SHA256 `5b07fa577c9bacf6da3505f8d7149e91d298a63708ca6b8c2131c3dbd1256597`.
- `*-ours88-to-main89.diff`, `*-main89-to-pr90.diff`, `*-ours88-to-pr90.diff`: прямые сравнения проверенных endpoints в шести scoped files.
- `*-merge-probes/`: исходные outputs с конфликтами и без них; это исследовательские файлы, не готовый merge.
- `*-model-probe.json`: actual projection с точными исходными данными, без native claims.
- Metadata `*-pr90-runs.json`, `*-pr90-native-jobs.json`, `*-pr90-native-artifacts.json`, `*-pr90-comments.json`, `*-pr90-reviews.json`: почему существующий CI не заменяет Task Compact capture.
- `*-input-index.json`: полный индекс этой коллекции и неизменяемого отчёта с hashes.

Репозиторий, source, refs и PR не изменялись. Новый браузерный или полный тестовый запуск не выполнялся. Оригинал этого отчёта и его коллекция замораживаются; последующая приёмка остаётся отдельным документом на своём точном head.
