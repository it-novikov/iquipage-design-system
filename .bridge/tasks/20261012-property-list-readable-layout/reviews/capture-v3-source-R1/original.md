---
report_id: PF04-clean56-capture-r3-source-R1
reviewer: /root/ds_candidate_source_r1
model: GPT-6 Astra
review_date: 2026-10-12
review_kind: independent-source-review
verdict: APPROVED_FOR_NATIVE
approval_scope: same54-vs56-capture-diagnostic-only
source_head: 945169fff6fd7e38b081a76a0e20d71b3956a365
pending_merge_head: 41ebe4823471072ed6dbb405fbd5e755852eec3f
patch_base_tree: f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6
patch_sha256: d34985e5cd4fbb4be688db5b2c79536d5fc66c04265c7c2a5f7800cb9ac7e7b0
checkpoint_sha256: 521d2be3aaf5a99c920d49c234c59b3dca6a16f90c45edb99375e95bf00f8d68
comparison_plan_revision: 3
comparison_plan_sha256: 940aa92a1ef88941f8d3dfed46b81cd3a649351e56388eb84f6efc46445503d5
native_capture_revision3: NOT_RUN
new_library_full_tests: NOT_RUN
product_adoption: NOT_RUN
human_acceptance: NOT_RUN
layout_A3: OPEN
source_blockers: []
previous_native_verdict: CHANGES_REQUESTED
immutable: true
---

# PF04: независимое source R1 диагностики открытого редактора на том же private56

**Вердикт: APPROVED_FOR_NATIVE — для диагностического запуска revision3 с неизменными DS54 и private56. Блокеров в замороженной правке проверяющего сценария не обнаружено.** Изменение сохраняет эксперимент и позволяет увидеть, меняется ли окружение редактора в интервале получения изображения. Оно не исправляет позиционирование, не принимает дизайн A и не закрывает A3 или замечания native R2. [E1–E7]

Ревью выполнено отдельно от автора реализации. Проверены окончательный патч, manifest, исходники сценария, прежнее независимое R2, решение о последовательности работ и фактические байты локальных сборок. Ролевой спор ниже — аналитические позиции одного независимого ревьюера, а не проведённые исследования с пользователями или три отдельных ревью. Исходники репозитория, индекс, refs, коммиты и PR этим ревьюером не изменялись; создан только этот отчёт.

## 1. Точная база и сохранение истории

Проверяемая единица — дерево `f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6` плюс патч SHA256 `d34985e5cd4fbb4be688db5b2c79536d5fc66c04265c7c2a5f7800cb9ac7e7b0`, размер 230127 байт. Патч и checkpoint имеют права `0444`. Все 24 файла manifest совпали по длине и SHA256; для всех 24 секций патча дополнительно сверены новые Git blob IDs с фактическим содержимым. Неперечисленных tracked-изменений относительно этой базы не найдено. [E1, E2]

На момент проверки HEAD worktree — `945169fff6fd7e38b081a76a0e20d71b3956a365`; staged интеграция main `41ebe4823471072ed6dbb405fbd5e755852eec3f` ещё не оформлена новым коммитом. Индекс совпадает с прежним фактическим native checkout `c267edee80d49660e22fa03bc4442c19e3b4d2d1`, чьё дерево — указанное `f449…`; конфликтующих записей индекса нет. Product subtree совпадает с main41ebe. Это проверка существующей staged интеграции, а не утверждение, что новый диагностический source уже опубликован. [E2, E3]

Root сообщил о более новом удалённом main `5d674ee06551b175fb5e9553c9866c11fb8fe4c0`. Он **не входит** в это ревью. Будущий CI может использовать другое целое дерево; его фактический checkout и сохранение проверенных DS/архивов/фикстуры должны быть привязаны к новому native evidence. Этот отчёт не подтверждает весь будущий merge tree и не переносит проверку продуктового кода на main5d.

История сохранена: оригинальный native R2 SHA256 `ecb66d5d4218fca7193ff7ccb7d7dd3bdc540d640e6568b3f6e793d3e46ed56f` совпадает с его копией в Bridge; прежние source R1 и corrected addendum сохранили свои SHA256 и `0444`. `comparison-plan.v2.json` побайтно совпадает с планом из прежнего native checkout, SHA256 `8d37900ee942cfbf03dd6fbccc46f9aa8fa390f3b8a00d12412aac1ffca5722f`. Никакой старый вывод не переписан новым диагностическим статусом. [E2, E4, E8]

## 2. Проблема, которую этот checkpoint действительно решает

В прежнем native R2 raw-геометрия после сужения host 615→270 показывала старое положение popup при неизменном счётчике window resize. Поздний full-page PNG показывал редактор около уже перемещённого поля; в интервале capture счётчик увеличивался. R2 сохранил расхождение и обоснованную гипотезу вмешательства capture, не выдав предполагаемую внутреннюю причину Chromium за установленный факт. [E4]

Для человека существенна связь между нажатым полем и появившимся редактором: изображение после непреднамеренного исправления позиции может скрыть момент, когда эта связь потеряна. Поэтому сначала нужно получить более чистое наблюдение на прежнем компоненте. Одновременная правка CSS или позиционирования лишила бы сравнение возможности различить влияние инструмента и поведение компонента. В `decision-r2.md` сохранена именно эта последовательность; будущий layout57 и возможное исправление lifecycle позиционирования вынесены за границу текущего checkpoint. [E3, E4]

## 3. Что изменилось и почему этого достаточно для source approval

| Область | Проверенное изменение | Практическое значение |
| --- | --- | --- |
| Получение изображения | `screenshot()` возвращает имя, SHA256 и явный `fullPage`; interaction callback передаёт `fullPage:false`. | Открытые owner/date снимаются в пределах viewport; режим capture присутствует в raw-записи. |
| Неуспешный сценарий | Failure PNG также использует viewport. | Ошибка больше не приводит к повторению прежнего full-page capture при открытом редакторе. |
| Временные точки | После `resized` сохраняются `afterPNG` и `afterCaptureFrames`; между последними выполняются две RAF. | Можно различить геометрию до снимка, после возврата screenshot API и после дальнейшего выполнения браузера. |
| Наблюдение окружения | Добавлены `observedAt`, visualViewport geometry и отдельные passive resize/scroll counters. | Проверяется канал событий, на который подписан Date, помимо window. Отсутствующий API представлен явным `null`. |
| Независимая проверка | Verifier сам сопоставляет семь инвариантов в обеих последующих точках, не полагаясь на строку статуса. | Формальный «чистый» статус при изменённых данных не даёт PASS. |
| Чтение всей композиции | Закрытые viewport и full-document кадры оставлены. | Диагностика открытого редактора не лишает последующее визуальное ревью полного списка. |

Все перечисленное подтверждается небольшим executable diff трёх `.mjs` файлов; остальные изменения относятся к плану, README и фиксации evidence. [E1, E5]

В owner/date последовательность остаётся предметной: открыть клавиатурой → снять исходное состояние → изменить ширину внешнего host → две RAF → `resized` → viewport PNG → `afterPNG` → две RAF → `afterCaptureFrames` → Escape → проверить отмену. Запись `{id,before,resized}` попадает в `result.popupResize` **до** ожидания screenshot, поэтому pre-capture geometry остаётся в raw и при ошибке получения изображения. Счётчики visualViewport копируются в snapshot, а не сохраняются общей изменяемой ссылкой. [E5]

Новые наблюдатели только увеличивают счётчики. В правке нет вызова DS positioning, synthetic resize/scroll, scroll-to-repair, переоткрытия ради изображения, ResizeObserver на компоненте, remount или изменения размеров после `resized` до завершения обеих post-capture точек. Единственная проверяемая смена ширины — прежняя host mutation; восстановление ширины остаётся после Escape. Чтение `getBoundingClientRect` и ожидание RAF имеют обычные ограничения браузерного измерения, но нового механизма исправления позиции они не добавляют. [E5]

Семь инвариантов сравниваются между `resized` и каждой post-capture точкой: `viewport`, `hostWidth`, `windowScroll`, `resizeEvents`, `scrollEvents`, `visualViewport`, `visualViewportEvents`. При различии raw сохраняет имя точки, ключ, старое и новое значения; итоговый interaction assert завершается ошибкой. Отдельный verifier требует `fullPage:false`, явные поля visualViewport, чистый статус и фактическое deep equality. Geometry при этом не подгоняется: raw содержит прежнюю и новую anchor classification, а общий допустимый успешный статус по-прежнему заканчивается `VISUAL_ANCHOR_REVIEW_PENDING`. [E5]

## 4. Что осталось неизменным

Независимая byte/diff сверка подтвердила отсутствие изменений в `libraries/iquipage`, fixture DOM/data/styles, `measure.mjs` и `.github/workflows/tabs-geometry.yml` относительно проверенной базы. Не добавлены runtime JS/CSS, публичные API, зависимости или потребительские настройки. Сохранились исходные две клавиатурные interaction profiles и все пять геометрических профилей. В JSON плана неизменны `packages`, `profiles`, `interaction_profiles`, `fixture_revision`, `comparisons`, `acceptance`, `environment`, `not_run` и `applicability`. Отличаются только идентификация revision3, её база/причина/ссылка на прежний план и новый `capture_contract`. [E1, E2, E5]

Не удалены проверки полного текста, отсутствия clipping и горизонтального overflow, настоящего avatar, формы ordinary reference controls, native single-line input и Home/End, перехода Tab к существующему tag search, selected tags, сохранения identity и focus. Escape по-прежнему должен закрывать popup без изменения значения; выбор и возврат owner должны породить ровно два ожидаемых intent. В executable diff нет ослабления этих утверждений. [E5]

| Объект | SHA256 | Независимая сверка |
| --- | --- | --- |
| Control54 archive | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` | Все 176 упакованных файлов совпадают с fresh build provenance. |
| Candidate56 archive | `a3307cf012d307ea476056e36bdee601f8eef9efad37c78dd96aaef6ccb00d5f` | Все 178 упакованных файлов совпадают; версия остаётся `0.6.0-vnext.56`. |
| Private56 source proof | `5b8fbdb276f1c24e4bbd5a313fecc529965b109a1a9f29be6a0251ffaa752612` | Все 215 исходных файлов совпадают с proof. |
| Revision3 plan | `940aa92a1ef88941f8d3dfed46b81cd3a649351e56388eb84f6efc46445503d5` | Совпадает с текущим файлом, checkpoint и обеими свежими сборками. |

Обе локальные сборки имеют `build.status: PASS`, общий статус **BUILT_NOT_RENDERED**, пустой массив profiles и `NOT_RUN` для target/human/backend acceptance. Для каждой независимо сверены 14 source hashes, 36 compiled input hashes и четыре фактических output-файла. Использованы именно outputs из `compiled-940aa92a1ef8`, указанного в свежем build summary, а не более ранняя папка `compiled`. Также проверены hashes продуктовых package.json/lock и соответствие results/provenance. Эти факты подтверждают происхождение сборок; native capture ими не доказан. [E6]

## 5. Отрицательные controls: полезный, но ограниченный результат

Проверены исходные логи и изменённые копии JSON, на которых автор выполнял три отрицательных контроля. [E7]

| Контроль | Что реально проверено | Зафиксированный отказ |
| --- | --- | --- |
| Старый packet full-page сценария | В старом packet отсутствует новое явное `capture.fullPage:false`. | `Open-editor capture uses the viewport`. Строгое сравнение в исходнике также отвергнет `true`; этот конкретный лог относится к отсутствующему полю. |
| Подложный clean status, window counter | В candidate `afterPNG.resizeEvents` отличается 1 против 0, при объявленном clean status. | `afterPNG preserves resizeEvents`. |
| Подложный clean status, visualViewport counter | В candidate `afterPNG.visualViewportEvents.resize` отличается 1 против 0, при объявленном clean status. | `afterPNG preserves visualViewportEvents`. |

Это metadata-only проверки способности verifier отвергать несовместимое свидетельство. Post-capture данные в контрольных копиях намеренно сконструированы; они не выдаются за новое состояние браузера. Статические 24 checks автора включают эти expected rejections и не являются 24 пользовательскими или native сценариями. Ревьюер сверил уже существующие доказательства и их байты, не запускал новый native или полный library suite. Прежние 478/478 DS56 PASS относятся к завершённому native56 CI, описанному в R2; этому новому harness-run они не приписываются. [E4, E7]

## 6. Спор с трёх сторон и разрешение

**Correctness/QA:** «Viewport PNG сам по себе не гарантирует отсутствие вмешательства. Если Date слушает visualViewport, проверки одного window недостаточно». Это обоснованное возражение к исходной диагностической идее. В окончательном замороженном варианте есть оба набора geometry/counters, две post-capture точки и независимая проверка raw. Это достаточное предусловие для следующего ограниченного native опыта. Доказывать нулевое влияние любого измерения или точную внутреннюю причинность screenshot инструмент всё ещё не может. [E5]

**Пользователь, читающий и редактирующий свойства:** «Красивый PNG возле поля не оправдывает редактор, который до снимка оказался в другом месте. Мне нужны полная подпись, узнаваемое значение, очевидная связь поля и редактора и предсказуемая отмена». Диагностика сохраняет состояния до снимка и все interaction контракты; поэтому она помогает обнаружить именно этот риск. Но этот checkpoint не устраняет ограничения label width, baseline avatar/name и лишней строки metadata, замеченные R2. Они остаются открытыми задачами следующего layout trial. [E3–E5]

**Сопровождающий DS, агентную разработку и performance:** «Не стоит раздувать framework ради одного дефекта или добавлять наблюдатель в каждый компонент до понимания причины». Возражение принято по границе решения: instrumentation остаётся в эксперименте; пакеты и продукт не меняются; применяется существующий guarded workflow; profiles не расширены. Добавленные чтения и две RAF имеют стоимость в сценарии тестирования, но пользовательский runtime не получает этой нагрузки. FPS, latency и общая скорость работы пользователя здесь не измерены. Важнее сохранить ясные статусы и не превратить удобный диагностический PASS в автоматическое принятие нового default. [E1, E5–E7]

**Разрешение:** продолжать с этим замороженным diagnostic checkpoint; получить native наблюдение на тех же компонентах, затем выбирать исправление по сохраняющемуся дефекту. Это соответствует problem-first подходу и сохраняет сравнимость evidence, не требуя заранее принять гипотезу автора о CSS57 или lifecycle popup. [E3]

## 7. Границы вывода и чтение будущего native результата

`CAPTURE_CHANGED_ENVIRONMENT` означает изменение зарегистрированного окружения **в наблюдаемом интервале**. Само название не доказывает, что единственной причиной был screenshot. `afterPNG` — следующая state evaluation после возврата screenshot API, а не гарантированный timestamp самого painted frame. `afterCaptureFrames` покрывает две дальнейшие RAF, а не неограниченное будущее. Нулевые счётчики также не доказывают правильную adjacency: geometry может естественно меняться без этих событий. Исходники и план прямо сохраняют эту границу. [E5]

| Что покажет revision3 | Допустимый вывод |
| --- | --- |
| Изменилось окружение при capture | Диагностика должна завершиться FAILED и сохранить raw. Нельзя принимать изображение как чистое доказательство исправленного anchor. |
| Окружение стабильно, popup остаётся вне связи с trigger | Проблема воспроизводится на прежнем56 без зарегистрированного capture resize/scroll; требуется отдельный разбор lifecycle/позиционирования. |
| Окружение стабильно, geometry естественно меняется между точками | Зафиксировать последовательность и время; не называть мгновенное состояние ни постоянным дефектом, ни готовым исправлением без анализа. |
| Всё геометрически рядом, semantics проходят | Это scoped native evidence; нужно независимо прочитать raw и PNG. A3 и окончательный default не принимаются одной строкой PASS. |

Перед native достаточно сохранить данный immutable target и проверить реальные checkout/package/fixture/plan hashes нового CI. Дальнейшее изменение DS source, архивов или semantic criteria должно иметь отдельный checkpoint. Общий поиск более новых продуктов, широкая матрица браузеров и повтор неизменного полного suite не нужны для завершения именно этого source R1.

## Источники и возможность воспроизвести проверку

Все пути ниже относятся к workspace `/workspace/scratch/b3dac59f68e2`; repository paths — к `repo-property-candidate`. SHA256, не рабочее имя ветки, определяет рассмотренные байты.

- **E1:** `research/continuation/property-list-private56-capture-r3.patch`, 230127 байт, SHA256 `d34985e5cd4fbb4be688db5b2c79536d5fc66c04265c7c2a5f7800cb9ac7e7b0`, `0444`.
- **E2:** `research/continuation/property-list-private56-capture-r3.checkpoint.json`, SHA256 `521d2be3aaf5a99c920d49c234c59b3dca6a16f90c45edb99375e95bf00f8d68`, `0444`; 24-file manifest. Независимые read-only Git проверки: actual HEAD/MERGE_HEAD, пустой diff индекса к `c267…`, отсутствие unmerged entries, diff защищённых путей, отсутствие продуктового diff к main41ebe и SHA/blob сверка manifest.
- **E3:** `.bridge/tasks/20261012-property-list-readable-layout/decision-r2.md`, SHA256 `b7060d633e30d04aed4b887d0f7c7c5f3867d3e4336e1d8c3c9fecc8ab8df500`; handoff `evidence/capture-v3/README.md`, SHA256 `4bed869544a2109df36cdccd6eb4bcaf48fe827e721ccada5e3d60076de8a915`.
- **E4:** `research/continuation/property-list-private56-native-r2.md`, 51102 байт, SHA256 `ecb66d5d4218fca7193ff7ccb7d7dd3bdc540d640e6568b3f6e793d3e46ed56f`, `0444`; exact copy `reviews/native-R2/original.md`. Его raw: `research/continuation/property-list-private56-native-r2/artifact/browser/{control,candidate}/results.json`. Ревью R2 содержит прежний actual checkout и native provenance; оно остаётся CHANGES_REQUESTED.
- **E5:** `experiments/property-list-reflow/compare.mjs` SHA256 `eb28bac56c37b5dc29cb1afe8e8af33d7896d87f0a5d59b5e616aaf0c0e23855`; `interactions.mjs` SHA256 `39bb207e5f19003498ef8d0e8f0e7e5847c80740c985e66f07aa9e07968658e5`; `verify-comparison.mjs` SHA256 `07b93bec52cf5355b26fdbb7a55a5e689fc6ce679b4eff9a9fcf227ce3978991`; current plan SHA256 `940aa92a1ef88941f8d3dfed46b81cd3a649351e56388eb84f6efc46445503d5`. Их точный diff входит в E1.
- **E6:** `.bridge/tasks/20261012-property-list-readable-layout/evidence/capture-v3/build-only/{control,candidate}/{results,provenance}.json`; все четыре SHA256 входят в E2. `local/build-summary.json` SHA256 `d4da740d18d08a40c90e099127191c6a467f363d3346e77f5a88c3bee7b8814b`. Actual compiled outputs: `research/continuation/property-list-capture-v3-local/compiled-940aa92a1ef8/{control,candidate}`. Независимо сверены tar file maps, 215 source-proof entries, source/input/output hashes и hashes наборов compiled inputs/outputs.
- **E7:** В том же `evidence/capture-v3/local/`: `checks.json` SHA256 `a80e104b2271705335db4b9792043f5867d550fa66fc97a13e70583a5126ffe6`; `reject-legacy-fullpage.log` SHA256 `2a02adb00959a79a4972e40861b239d65bcc0a1f15b4d77b3cdfb688f0e365a6`; `reject-forged-clean-counter.log` SHA256 `8c5e5a2074c7b18266f0613caa1cb5b7107337ab4e419620c9db624001dd4521`; `reject-forged-visualviewport-counter.log` SHA256 `062c7d3190b36e3f1c1b54e9df11402ae14e71a8e0c9c774e7428e4455da2bad`. Проверены соответствующие изменённые metadata packets и comparison.json в `research/continuation/property-list-capture-v3-local/negative-controls/`.
- **E8:** Неизменные `research/continuation/property-list-candidate-a-source-review.md` SHA256 `0a07165199fc25e56665bdd937289ff45eb1d55549c913a6bd35c1c305805dc9` и `property-list-candidate-a-source-review-corrected-addendum.md` SHA256 `655b2b73dbcb24b7851e4c1b6a1f8020b486eeccfad1fc5292d83294be25474c`.
