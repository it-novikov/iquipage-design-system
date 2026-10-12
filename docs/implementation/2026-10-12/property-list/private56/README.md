# Property list — private56, исходный native trial и независимые ревью

**Native R2: CHANGES_REQUESTED. Candidate A в этой поставке не принят как окончательный default дизайн-системы; adoption в Sprintique — NOT_APPROVED.** Парный сценарий успешно выполнен, полнота display text и keyboard checks подтверждены в заданном scope. Три P2 и один P3 требуют дальнейшей работы. Основание — [неизменённый отчёт R2](reviews/native-R2/original.md), а не новый вердикт preserver.

Это сохранение исходного опыта private56. Raw, PNG, plan2, журналы и тексты ревью не корректировались после capture. Дальнейшая диагностика A3 должна иметь отдельный checkpoint. [Provenance](provenance.json) связывает каждый исходный файл с сохранёнными байтами и явно отмечает compiled inventory-only.

## Что принято и что остаётся открытым

| Пункт | Вердикт R2 | Граница |
|---|---|---|
| A1 — поставка и ordinary reference controls | PASS в scope опыта | Точные inputs/packages/builds; 10 сравнений обычных select/date сохранены. |
| A2 — captions и композиция | Geometry PASS; visual CHANGES_REQUESTED | Пять профилей читаемого текста; открыты NR2-02/03 и polish NR2-04. |
| A3 — keyboard, identity, anchor | Keyboard PASS; anchor открыт | Focus/intents/identity проверены; raw и последующий PNG относятся к разным моментам capture-интервала. |
| A4 — независимые ревью | Два раунда выполнены, общая приёмка открыта | Source R1 с addendum и независимый native R2 существуют; замечания остаются. |

Оба native `results.json` сохраняют `CAPTURED_WITH_OBSERVED_CONSTRAINTS`. У candidate `targetAcceptance` — `GEOMETRY_PASS_REVIEW_PENDING`; машинный comparison — `SCOPED_GEOMETRY_KEYBOARD_PASS_VISUAL_ANCHOR_REVIEW_PENDING`. Эти исходные статусы не переписаны задним числом после R2. Обе build-only записи остаются `BUILT_NOT_RENDERED`; их `reportedCIRevision: null` также сохранён. [Raw comparison](artifact/browser/comparison.json.gz), [candidate](artifact/browser/candidate/results.json.gz), [control](artifact/browser/control/results.json.gz).

В собственном CI log private56 зафиксированы **478 tests / 478 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo**. Это свежие Node tests версии56, не перенос результата55. Сам trial job успешен. Другие jobs того же workflow перечислены в исходной metadata; этим пакетом не заявляется полный CI продукта. [Job metadata](metadata/jobs.json), [exact decoded log](jobs/native.log.gz).

## Конкретные замечания R2

| ID / приоритет | Подтверждённое наблюдение | Следующее решение по frozen R2 |
|---|---|---|
| PF04-NR2-01 / P2 | После изменения только host trigger переместился, raw popup rect остался прежним. Все четыре последующих candidate popup PNG уже показывают popup возле нового trigger; в capture-интервале появился дополнительный resize. | На том же immutable56 получить отдельный viewport capture с geometry/counters/focus до и после, затем несколько следующих кадров. Длительность stale состояния и точный внутренний механизм не объявлены доказанными. |
| PF04-NR2-02 / P2 | При host270/root32 самостоятельная подпись «Поиск участника» шириной213px ограничена196px и переносится, хотя value уже ниже. | Дать подписи доступную ширину при вертикальной композиции; сравнить исправленный A с обоснованной альтернативой B. Не сокращать текст ради коэффициента. |
| PF04-NR2-03 / P2 | При text200 у owner/author заметно расходятся label и первая строка имени рядом с20px avatar; расчётная baseline-разница около18.313px. | Привязать композицию к первой строке основного текста и сохранить оптическую связь avatar; не компенсировать отдельные строки фиксированным translateY. |
| PF04-NR2-04 / P3 | На wide-normal дата автора обязательно занимает новую строку: row60px при достаточном месте для имени и metadata рядом. | Разрешить естественное совместное размещение и перенос; сохранить avatar/name на узкой ширине. Либо отдельно обосновать единый pattern вторичной строки. |

Число baseline получено reviewer из Range и Canvas metrics как объяснение лично видимого сдвига; это не pixel-mask измерение. Отрицательный `verticalGap` в raw — формула classifier при пересечении, а не расстояние «отрыва» на указанное число пикселей. [Расчётные метрики](reviews/native-R2/evidence/geometry-review-metrics.json.gz), [независимые сравнения](reviews/native-R2/evidence/independent-comparison-checks.json), [полный разбор findings](reviews/native-R2/original.md).

Большая высота читаемого списка при увеличении текста сама по себе не дефект. R2 сохраняет full text, natural heights и вертикальную прокрутку; пересматриваются только лишние строки и непоследовательные текстовые связи. B пока не отрисован и не выбран победителем. Пустое место tags, обнаруживаемость редактирования с первого взгляда и дополнительные состояния отдельно отмечены как вопросы/границы, не как автоматически подтверждённые новые дефекты.

## Точный источник опыта

| Идентификатор | Значение |
|---|---|
| PR / published head | [PR91](https://github.com/it-novikov/iquipage-design-system/pull/91), `945169fff6fd7e38b081a76a0e20d71b3956a365` |
| Local checkpoint с тем же head tree | `c3e4c202f8f6f5208aca9bc820af4339d92a419d` |
| Head tree | `b50846b2e9762b5f7782adced8fd5e1ff21256ed` |
| Actual CI checkout | `c267edee80d49660e22fa03bc4442c19e3b4d2d1` |
| Actual CI whole tree | `f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6` |
| Run / trial job | [38253208875](https://github.com/it-novikov/iquipage-design-system/actions/runs/38253208875), [114824500556](https://github.com/it-novikov/iquipage-design-system/actions/runs/38253208875/job/114824500556) |
| Control54 archive | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Private56 archive | `a3307cf012d307ea476056e36bdee601f8eef9efad37c78dd96aaef6ccb00d5f` |
| Plan2 SHA-256 | `8d37900ee942cfbf03dd6fbccc46f9aa8fa390f3b8a00d12412aac1ffca5722f` |

**Полные деревья head и CI не равны.** CI merge включает main41ebe с внешними изменениями Task. Рецензент проверил equality library/experiment tree и точных inputs опыта; product JS/CSS не входят в36 compiled inputs стенда. Preserver отдельно проверил235 выбранных Git blobs по local checkpoint и actual recursive CI tree, включая215 source-proof inputs, архивы и источники ревью. Ни одна из этих проверок не объявляет весь продукт равным head или принятым. [Head API](metadata/head-commit.json), [merge API](metadata/merge-commit.json), [recursive CI tree](metadata/merge-tree.json.gz), [source preparation](metadata/private56-preservation-preparation.json), [native proof](reviews/native-R2/evidence/native-provenance-integrity.json.gz).

Сохранены точные [plan2](source/comparison-plan.json) и [source-proof](source/source-proof.json.gz). Исходный код полного опыта доступен в [опубликованном head](https://github.com/it-novikov/iquipage-design-system/tree/945169fff6fd7e38b081a76a0e20d71b3956a365/experiments/property-list-reflow) и [actual CI checkout](https://github.com/it-novikov/iquipage-design-system/tree/c267edee80d49660e22fa03bc4442c19e3b4d2d1/experiments/property-list-reflow). Продукт остаётся на54; actual Task не входит в этот public synthetic fixture.

## Наблюдения и сохранённые данные

Native среда: Chromium151.0.7922.34, Playwright1.62.1, Node24.20.0, Ubuntu24.04; light / comfortable, ru-RU / UTC, fixed time2026-10-12T12:00:00Z, device scale1. Root font16/32px не выдаётся за настоящий browser zoom200%. Пять парных профилей различают host615/349/270px и narrow/wide viewport; оба variants имеют0 page errors, console errors и off-origin requests. [Оригинальный R2](reviews/native-R2/original.md), [raw candidate](artifact/browser/candidate/results.json.gz).

ZIP `11749167457`: **5 085 184 байта**, SHA-256 `ebca49537ca8e49cddabb3fce486e9a5f22b7fe97e4dffe1d3fbabbb6c9e85d5`. Все67 member paths проверены на безопасность, SHA и равенство извлечённым байтам. **51 member reference сохранена** через identity/gzip; **16 compiled members — inventory-only**, с manifest и точным source для воспроизведения. Все32 PNG reference доступны через [таблицу изображений](screenshots.md):27 новых уникальных identity-файлов и5 точных дубликатов по mapping. Эти кадры не подменены прежним PR86 baseline. [Inventory](metadata/artifact-inventory.json), [artifact metadata](metadata/artifacts.json), [полный mapping](provenance.json).

Raw aggregate/profile/provenance/comparison JSON, журналы и большие proof JSON сохранены lossless gzip с `mtime=0`. Исходный log равен JSON-decoded UTF-8 без добавленного LF; [исходное JSON-представление строки](jobs/native-job-log-exact.json.gz) также сохранено точно. MD и PNG не менялись. Оригиналы могут сохранять исторические scratch-пути: переносимые соответствия находятся в [навигаторе ревью](reviews/README.md) и `source_path_map` / `supporting_source_path_map` в provenance.

R2 лично просмотрел27 уникальных PNG, что отдельно зафиксировано в [visual inspection index](reviews/native-R2/evidence/visual-inspection-index.json). Preserver проверял байты и source evidence, не выполнял новое визуальное ревью. Подписанная download reference, ZIP и транспортный дубль primary-source response не копировались в Git. Два точных Playwright source-файла с headers и versioned URLs сохранены отдельно и объяснены в [primary source notes](reviews/native-R2/primary-source/primary-source-notes.json); они поддерживают гипотезу capture-side-effect, но не заменяют чистую native диагностику.

## Продолжение работы

Порядок из frozen R2: отдельная диагностика NR2-01 на том же56 → решение о минимальной runtime-правке после подтверждения → новая immutable поставка для NR2-02/03 и рассмотрения NR2-04 → обоснованный выбор композиции → отдельная adoption-проверка actual Sprintique. Исходный trial и plan2 при этом остаются неизменными.

`humanAcceptance` и `backendAcceptance` остаются `NOT_RUN`. Спор ролей в R1/R2 — экспертные перспективы агентов, не реальные респонденты. Actual Task, persistence, performance profiling, первая попытка человека найти редактор и релизная Safari/Firefox/iOS/VoiceOver матрица этим пакетом не приняты. Onboarding остаётся в конце и требует ранее оговорённого отдельного согласования.
