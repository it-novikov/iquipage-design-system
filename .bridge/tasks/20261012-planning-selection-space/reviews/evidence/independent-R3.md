# WP02 — независимое ревью R3

**Вердикт: approve в пределах targeted R3 — исправление F2 и browser/visual evidence Planning selection. F2 [P1] исправлено и независимо проверено на actual CI и кадрах, включая narrow menu return.** Candidate browser regression теперь имеет фактический статус **PASS**. Это scoped решение о проверяемом frontend изменении; весь обязательный vNext workflow ещё не завершён на момент проверки, поэтому готовность к merge/release из него не следует.

Ревьюер: GPT-6 Astra, независимая read-only сессия `/root/planning_review_r1`, не автор изменения. Дата: 2026-10-12. Режим: `iquipage-review`, targeted audit. R3 проверяет коррекцию F2 относительно R2; широкое R1-ревью не повторялось. Product, bridge, remote и полученные CI-артефакты ревьюером не изменялись. Локальный Chromium не запускался; новые offline probes сохранены только в scratch.

## Immutable scope и источник evidence

| Вход | Независимо проверенное значение |
| --- | --- |
| Предыдущий R2 | `a52d285b5f46975639a19d21ba1ad3212ae33cb5` |
| Immutable R3 authored commit | `3d328d05b42ffc35b8f39fa5e169c4ffbb96624c` |
| Опубликованный R3 head | `b6fb06461dd0b391ac24b4ea0772e92f67c0f1cc` |
| R3 tree | `9ac5da101814249754649b2d8591534f7685fb85` |
| Actual candidate sourceRevision | `bb58e47e952c0dc7dd19248abcc67c86c85053d9` |
| Actual CI merge tree | `9ac5da101814249754649b2d8591534f7685fb85`, совпадает с reviewed tree |
| Immutable historical baseline | `f5f941afa4e9be8a709e6de67a92bacf5a9397ca` |
| CI | run `38211016913`, job `114684962493` |
| Browser / Node в actual CI | Chromium `151.0.7922.34` / Node `v24.20.0` |
| Candidate CSS SHA256 | `0916a36d4a682ce7b05e84fc8732382ce4bbda03b707578ffd909dc16b6650f4` |
| Exact DS .52 archive SHA256 | `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758` |
| Artifact | `planning-browser-evidence`, id `11729218842`, 1,959,278 bytes |
| Downloaded ZIP SHA256 | `841818ca69bb413c86f5ee3bb6bd6e5dc11c4bc4c124defd025c50b5155d2ee5` |

Git source читался через immutable `git show`; SHA256 скачанного ZIP совпал с независимо прочитанным GitHub artifact metadata. Actual sourceRevision отдельно проверен через Git: merge имеет тот же tree и родителей baseline/опубликованный R3 head. JSON содержит ожидаемые CSS hash, `.52` и hash vendor archive. [CI run](https://github.com/it-novikov/iquipage-design-system/actions/runs/38211016913).

Дельта R2 → R3 — 11 файлов, 595 добавлений и 19 удалений: browser measurement/diagnostics, две проверки visible overlap в recognizer, fixture README и bridge evidence/reviews. Runtime CSS, исполняемая fixture и данные, product manifest/lock/vendor и workflow не менялись. Нового product workaround для получения PASS нет. R1/R2 в bridge сохранены дословно: SHA256 соответственно `4c1518fb570fe8b3c87ba952a4172d3b0ffdab3d5cfbfe21c75856b535bd9ec4` и `0d3b1b0cb2159204e3b649dc055886885fe6cc55281c591ce87212aded765f42` совпадают с исходными независимыми отчётами.

## F2 [P1] — fixed и независимо verified

**Исходная находка:** R2 runner ошибочно использовал raw row/bar bounding rectangle intersection как площадь видимого перекрытия. В wide selection он учитывал невидимый fractional tail за overflow clip; narrow post-menu failure не сохранял отдельные bounds и кадр. Это блокировало browser gate и не позволяло проверить третье падение. Исходный отчёт R2 сохраняет свой прежний verdict changes-requested и actual FAIL.

**Исправление:** `products/sprintique/tests/planning-selection-space.browser.mjs:37` теперь сохраняет computed overflow предков, BCR, border/scrollbar insets, clip rectangles, совокупный clip, visible row, raw и visible intersection. `:94` требует `visibleIntersection === 0` без epsilon или разрешённой положительной площади. Прежние row-fit, centre hit, viewport, scrollport и overflow guards сохранены; `:99` добавляет самостоятельный lower-edge hit. `:143`–`:146` сохраняют layout и отдельный `*-menu-return.png` после Escape и settling до следующего действия.

В реальных candidate traces применимая цепочка состоит из panel с `overflow:clip`, workspace с `overflow:auto`, host и shell с `overflow:hidden`. Panel имеет insets 1 px; остальные clipping ancestors — 0 px; все измеренные `overflowClipMargin` равны `0px`. Для затронутых средних строк нижний clip задаёт workspace, а не предположение о положении bar. Сохранённый BCR остаётся дробным. Это измерение соответствует наблюдаемой композиции этой fixture; универсальный CSS clipping engine здесь не заявляется.

### Подтверждение трёх прежних failure states

| Actual candidate state | Raw row bottom | Clip bottom | Bar top | Raw area, CSS px² | Visible area, CSS px² | Centre / lower-edge hit |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| desktop selection | 858.375 | 858 | 858 | 118.5 | **0** | true / true |
| compact selection | 642.375 | 642 | 642 | 118.5 | **0** | true / true |
| narrow menuReturn | 446.21875 | 446 | 446 | 62.5625 | **0** | true / true |

Desktop/compact selected-row text, checkbox и свойства расположены над панелью. Повторно просмотренные кадры подтверждают ту же clip boundary, что и pixel evidence R2; исходные PNG побайтно совпадают с R2. Сохранённые 118.5 raw area не скрыты и не округлены: это 0.375 px невидимого хвоста за scrollport.

**Ранее отсутствовавшее narrow menuReturn теперь проверено отдельно.** После M → Escape candidate frame показывает содержимое выбранной task-19: заголовок, статус, срок, estimate и row action читаются выше bar. На baseline frame panel закрывает центральную часть этой строки. Actual candidate row заканчивается BCR на 446.21875, но видимая часть — на 446; bar начинается на 446. Lower-edge hit в `(160, 445)` принадлежит строке, centre hit тоже true, `activeRow=task-19`, `outerScrollTop=0`. Таким образом, третье падение подтверждённо объясняется обрезанным хвостом 0.21875 px; отсутствовавшее доказательство R2 получено новым browser run.

Candidate menuReturn bar остаётся wrapped, занимает 296 × 106 px, находится в viewport 320 × 568. Это actual результат после закрытия меню, не переиспользованный menu-open кадр. [Narrow post-Escape PNG](sandbox:/workspace/scratch/b3dac59f68e2/research/wp02/ci-38211016913/candidate/narrow-menu-return.png), SHA256 `2342d51e1b96d6f9e88c136e0859f74a39b3de362ef71c7023854cfd1f7dcf20`.

**Решение по F2:** [fixed R3, independently verified]. Новых подтверждённых findings P0–P3 в этой targeted дельте нет. F1 остаётся fixed; recognizer теперь требует именно positive visible overlap для ранее установленной expected-red матрицы.

## Negative controls и сохранность gates

Независимые scratch probes использовали actual новые JSON и точную функцию `checkUncovered` из immutable R3. Авторский offline report не принимался как самостоятельная browser evidence.

- Независимый пересчёт clipping half-planes и raw/visible areas совпал со всеми **36** сохранёнными layout states baseline/candidate. Измеренные clip margins/insets проверены в этих же records.
- Повторное выполнение точного guard на **24** проверяемых states воспроизвело actual baseline geometryFailures и пустой candidate список.
- **12 candidate negative controls** дали ожидаемые отказы. Видимое вторжение bar на **1/64 CSS px** даёт площадь **4.9375 CSS px²** и FAIL `overlap`, хотя существующий one-pixel fit guard ещё проходит. Отсутствующий/NaN visible metric не принимается. Полностью обрезанная строка с нулевой overlap не проходит row-fit/hit guards. Отдельно отклоняются failed centre hit, failed lower-edge hit, второй scrollport, document scroll, горизонтальный overflow, bar вне viewport и workspace, заходящий в область bar даже при отсутствии пересечения данной строки.
- **12 historical recognizer cases** дали ожидаемые результаты: actual new baseline принят; отсутствие positive visible middle overlap по одному в каждом профиле, отсутствие narrow last overlap, legacy raw-only metric, PASS status, application error, timeout, незавершённая матрица/interaction и отсутствие narrow wrap отклонены.

Это offline arithmetic/guard проверки на Node `v24.19.0`; они дополняют actual Chromium evidence и не являются новым browser run. [Probe script](sandbox:/workspace/scratch/b3dac59f68e2/research/wp02/review-r3-probes/verify-r3.mjs) и [results](sandbox:/workspace/scratch/b3dac59f68e2/research/wp02/review-r3-probes/independent-probe-results.json). SHA256 script: `55de208166f43840f66b4df31a1152a52d158a3005bdb4992b50ca438c7506ad`; results: `207273291c4ecc6a5d1826b050b7e0532f9b3680c989cebf4ade2b443ab98f30`.

## Actual browser и visual outcome

| Профиль | Baseline visible middle | Baseline visible last | Candidate selection / menuReturn / last / dialog-return |
| --- | ---: | ---: | --- |
| desktop 1363 × 936, light/comfortable | 19592 | 0 | 0 / 0 / 0 / 0 |
| compact 1280 × 720, light/compact | 19592 | 0 | 0 / 0 / 0 / 0 |
| narrow 320 × 568, dark/comfortable | 23682.09375 | 15677.375 | 0 / 0 / 0 / 0 |

Площади — CSS px². Historical ordinary regression остаётся **FAIL**, а recognizer step **SUCCESS**: исходный видимый дефект сохранён как negative control. Candidate JSON — **PASS**, `geometryFailures`, `interactionFailures`, `pageErrors`, `externalRequests` все пусты. Все три профиля прошли весь существующий interaction flow.

В R3 независимо просмотрены **все 6 новых** menu-return PNG baseline/candidate и повторно desktop/compact candidate selection. Остальные 18 ранее существовавших PNG (по 9 baseline/candidate) побайтно совпадают с кадрами, просмотренными в R1/R2; их визуальная оценка сохраняется. В wide menu-return обе выбранные строки и focused task-19 видны, actions находятся отдельно внизу. Narrow после Escape теперь имеет и полноценный frame, и соответствующий raw layout.

На всех четырёх проверяемых candidate states каждого профиля один реально scrollable ancestor — workspace, `outerScrollTop=0`; document/horizontal overflow отсутствуют. Centre/lower-edge hits true. После скрытия bar workspace восстанавливает исходную высоту 880 / 664 / 464 px. Existing Space/range/M/Escape, last-row selection, Task-wrapper close/scroll/focus return и drag/cancel assertions прошли. Drag перемещает workspace: desktop 881 → 1203, compact 1097 → 1419, narrow 3930 → 4154. В каждом профиле записан один ожидаемый move intent; adapter не имитирует успешное сохранение. Pre-existing clear-button focus на BODY остаётся записанной границей, а не новым одобренным accessibility контрактом.

## Evidence и воспроизведение

- [Candidate results.json](sandbox:/workspace/scratch/b3dac59f68e2/research/wp02/ci-38211016913/candidate/results.json), SHA256 `a626a1c0a841d8392ab6f7109c6141126dfa53ca2cef6e0e77b86bf7d554f177`; рядом 12 candidate PNG.
- [Baseline results.json](sandbox:/workspace/scratch/b3dac59f68e2/research/wp02/ci-38211016913/baseline/results.json), SHA256 `1e48e51d02fefcd706b86dd8bf47dfed8ecb80b22ebfc2a8345c2f0df442f217`; рядом 12 baseline PNG.
- [Evidence ZIP](sandbox:/workspace/scratch/b3dac59f68e2/research/wp02/ci-38211016913/evidence.zip), SHA256 указан в provenance table.
- Frozen runner `/workspace/scratch/b3dac59f68e2/research/wp02/review-r3-probes/planning-selection-space.browser.mjs`, SHA256 `4d3cf2564b85a9e467f44c1772e6436f8cfc035856963da99ebe5c6331100b44`; frozen proof рядом, SHA256 `b5e8f5316daee13b45a2f422a0152058344773b7f6dd9960288eb0700ba5284f`.

Offline rechecks воспроизводятся командой `node /workspace/scratch/b3dac59f68e2/research/wp02/review-r3-probes/verify-r3.mjs`. Actual browser воспроизведение зафиксировано в CI run 38211016913: один и тот же immutable R3 driver применяется к полному historical product archive и candidate tree. Результаты предыдущих красных runs не редактировались.

## Граница approve

На **2026-10-12 06:15:21 UTC** independently fetched job status: historical browser, candidate browser, early artifact upload и start storage — SUCCESS; шаг `Library, product, real services and detached extraction` — IN_PROGRESS; certificate/image/final artifact — PENDING. Поэтому общий workflow PASS здесь не заявлен. Проверяемый R3 не изменяет и не отменяет эти gates.

Закрытие F2 опирается на actual Chromium measurements, сохранённый post-Escape кадр, независимое сравнение с видимым historical counterexample и сохранённые строгие guards. Local native TypeScript7 blocker не обходился. Task content и adapter в fixture подменены согласно исходной границе: persistence/reload, полный Task route, F03 recovery, другие engines, touch/AT и browser UI zoom остаются вне targeted acceptance. Этот отчёт не даёт разрешения на merge или deploy.

**Итоговый статус:** scoped **approve** для R3 tree `9ac5da101814249754649b2d8591534f7685fb85`; F1 fixed, **F2 fixed и independently verified**; actual Planning frontend browser gate **PASS**; общий vNext gate требует собственного завершённого результата.
