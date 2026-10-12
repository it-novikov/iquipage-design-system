# WP02 — независимое ревью R2

**Вердикт: changes-requested для `a52d285b5f46975639a19d21ba1ad3212ae33cb5`. F1 исправлено и независимо проверено. Открыто F2 [P1]: измерение перекрытия в browser runner учитывает обрезанную, неотрисованную часть bounding rectangle строки.** Actual candidate CI выполнен и имеет статус **FAIL**; этот отчёт не переименовывает его в PASS. Просмотренные кадры подтверждают устранение крупного перекрытия, но третье падение после закрытия narrow menu требует отдельной сохранённой геометрии/кадра и новой проверки.

Ревьюер: GPT-6 Astra, отдельная read-only сессия `/root/planning_review_r1`, не автор изменений. Дата: 2026-10-12. Режим: `iquipage-review`, targeted audit. R1 остаётся историческим отчётом о `6a0f69c`; product, bridge, remote и исходные CI-артефакты не изменялись. Локальный Chromium не запускался.

## Immutable scope и provenance

Проверена вся дельта R1 → R2: 6 файлов, 51 добавление и 14 удалений. Изменены только recognizer, early artifact upload, README и bridge evidence/task/journal. Вне этой дельты выборочно перепроверена причина candidate FAIL в уже рассмотренном browser runner.

| Вход | Проверенное значение |
| --- | --- |
| R1 candidate | `6a0f69c869886fd4d3bca43ef857264a6240049a` |
| R2 head | `a52d285b5f46975639a19d21ba1ad3212ae33cb5` |
| R2 head tree | `66832fc7cac44b268e1a4ff02e944a350d613b04` |
| Actual CI candidate sourceRevision | `b3505803dd4dfc6a78558566422ad2d5f274532d` |
| Actual CI merge tree | `66832fc7cac44b268e1a4ff02e944a350d613b04`, совпадает с R2 head |
| CI | run `38209281679`, job `114679612012` |
| Browser / Node в CI | Chromium `151.0.7922.34` / Node `v24.20.0` |
| Candidate CSS SHA256 | `0916a36d4a682ce7b05e84fc8732382ce4bbda03b707578ffd909dc16b6650f4` |
| DS .52 archive SHA256 | `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758` |
| Downloaded artifact SHA256 | `ee84471a776f43c31177b70f826c7f300c036248832913be2d84b57ca471bca5` |

`git diff --exit-code` подтвердил неизменность candidate browser runner, runtime CSS, исполняемой fixture и её данных/HTML, product manifest/lock/vendor относительно R1. Tree actual CI merge отдельно прочитан через Git и совпадает с проверяемым head. CI JSON содержит ожидаемый candidate CSS hash и exact DS .52. Artifact metadata прочитаны через GitHub connector; SHA256 скачанного ZIP независимо совпал с metadata.

## F1 — исправлено

**F1 [P1], R1, `planning-selection-baseline-proof.mjs:13` — [fixed a52d285b5f46975639a19d21ba1ad3212ae33cb5].** Новое условие соответствует наблюдаемому исходному дефекту: middle overlap во всех трёх профилях, last overlap в narrow и реально перенесённые narrow controls. Требования к candidate не менялись.

Независимая проверка recognizer на Node `v24.19.0` дала **20/20 ожидаемых результатов**: unmodified actual baseline JSON принимается, а 19 отрицательных вариантов отклоняются. Проверены wrong status PASS/RUNNING, application error, external request, interaction timeout, launch failure, недостающий профиль, неверный порядок профилей, отсутствие middle overlap отдельно в каждом профиле, отсутствие либо дублирование move intent отдельно в каждом профиле, отсутствие narrow last overlap и отсутствие narrow wrap. Это mutations JSON для проверки recognizer, не browser run.

В новом actual CI historical step завершён **SUCCESS**, ordinary baseline runner сохранил ожидаемый **FAIL**, candidate step действительно выполнен. Таким образом, конкретная блокировка F1 устранена. Early artifact step тоже SUCCESS; существующие backend/build/extraction/image gates не ослаблены.

Доказательство: `/workspace/scratch/b3dac59f68e2/research/wp02/review-r2-probes/negative-control-results.json`; рядом зафиксированный recognizer, каждый вход и log. Recognizer SHA256: `0d2d64ba674dcee413e5feeeaba5a06bf7daad1ff9722b7c220a9e6f46568283`.

## Новая находка

- **F2** [P1] `products/sprintique/tests/planning-selection-space.browser.mjs:51` и `:70` — raw `getBoundingClientRect(row) ∩ getBoundingClientRect(bar)` используется как площадь видимого перекрытия без учёта обрезки строки её `overflow:auto` scrollport. Strict `intersection === 0` поэтому отвергает кадр с физически отдельной панелью и доступным содержимым строки.
  **Статус:** confirmed для desktop/compact selected middle row; причина третьего narrow menu-return failure ещё не подтверждена отдельным сохранённым измерением.
  **Сценарий:** выполнить unchanged candidate runner на R2 head. Выбор middle row после её положения у нижней границы оставляет fractional tail bounding rectangle на 0,375 px за scrollport. Этот tail обрезается workspace. Bar начинается ровно на нижней границе workspace, но raw rectangle formula выдаёт 118,5 CSS px² и делает весь CI красным.
  **Вред:** приёмочный тест блокирует проверенный сценарий на основании невидимой геометрии. Нельзя уверенно отделить ошибку измерения от реального перекрытия, если FAIL не сохраняет все исходные bounds; сейчас narrow menu return записан только как label/check.
  **Evidence:** actual candidate JSON, desktop/compact selection frames, совпадающий source CSS hash и реально обнаруженный computed-overflow scroll owner; независимый offline clip calculation и чтение пикселей исходных PNG. Подробности ниже.
  **Требуемое исправление:** определить перекрытие по реально видимой части строки с учётом применимых clipping bounds. Сохранить raw row/bar rectangles и raw intersection как диагностику. Не вводить разрешённую площадь перекрытия и не удалять проверку: visible overlap должен оставаться строго нулевым. Сохранить самостоятельные row-fit, row hit, bar containment, single-scrollport, document overflow, focus и все interaction guards. Сохранять `menuReturn` geometry и кадр после Escape до следующего действия, чтобы третье падение можно было независимо объяснить.
  **Приёмка:** новая browser evidence содержит computed clipping bounds и raw/visible intersections для каждого проверяемого состояния; visible intersection равен нулю на всех candidate profiles/states, raw fractional clipping остаётся виден в диагностике; исходный baseline по-прежнему даёт положительную visible overlap в исходной expected-red матрице; намеренно созданное реальное перекрытие и недостаточная видимость строки остаются FAIL. После этого actual CI и независимый просмотр кадров, включая narrow menu return, подтверждают результат. До этого candidate остаётся FAIL.
  **Решение:** [open]

### Почему F2 подтверждено для двух широких профилей

| Actual candidate state | Row bottom | Scrollport bottom | Bar top | Raw intersection | Row ∩ scrollport ∩ bar |
| --- | ---: | ---: | ---: | ---: | ---: |
| desktop selected middle | 858.375 | 858 | 858 | 118.5 | 0 |
| compact selected middle | 642.375 | 642 | 642 | 118.5 | 0 |

Границы приведены в CSS px, площади — CSS px². `layout()` обнаружил `iq-workspace-page iq-page-fluid` как ближайшего реально переполненного предка с computed `overflowY:auto|scroll`. На обоих профилях `outerScrollTop=0`, `rowHit=true`, `scrollableAncestors=1`. В actual CSS этот элемент имеет `overflow:auto`. Имеющаяся самостоятельная row-fit проверка уже допускает fractional difference до 1 px; она не упала.

На просмотренных desktop/compact selection frames текст, checkbox и свойства выбранной строки находятся над панелью. Для дополнительной проверки clip boundary независимо прочитана полоса x=950…1049, заведомо вне bar: desktop y=856 — все 100 pixels цвета selection `[237,242,255]`, y=857 — border `[221,223,227]`, y=858 и 859 — canvas `[255,255,255]`. Compact даёт тот же переход y=640/641/642. Видимая строка заканчивается у scrollport; raw дробный хвост ниже него не рисуется. PNG не редактировались.

Offline пересечение имеющихся actual bounds со scrollport даёт ноль для всех сохранённых candidate selection/lastRow/dialog-return snapshots. Та же формула сохраняет исходные большие positive overlaps baseline. Это объяснение сохранённой evidence, не новый browser PASS.

Третья запись `narrow keyboard menu return / overlap` не содержит raw layout: строка 118 передаёт `await layout(...)` прямо в `checkUncovered`, затем данные теряются. Имеющийся `narrow-menu.png` снят **до Escape**. Я не подменяю отсутствующий кадр после Escape этим кадром и не объявляю третье падение объяснённым.

Доказательство анализа: `/workspace/scratch/b3dac59f68e2/research/wp02/review-r2-probes/clip-analysis.json`.

## Фактический browser/visual результат

Прочитаны raw CI log и оба `results.json`. Просмотрены все **9 candidate PNG** и сопоставлены с baseline. Все 9 baseline PNG и baseline JSON нового run байтово идентичны просмотренным в R1: сравнение выполнено независимо.

| Поверхность | Наблюдение по кадрам и actual metrics |
| --- | --- |
| Desktop selection / last row | Большое baseline перекрытие средней строки отсутствует на candidate frame; текст и controls строки читаются. Последняя строка находится выше области панели, обе доступны. Отдельная нижняя область занимает bar 62 px плюс нижний margin 16 px. Raw fractional intersection отмечено в F2. |
| Compact selection / last row | Такое же устранение крупного перекрытия; последняя строка и действие видны. F2 воспроизводится в raw rectangle средней строки. |
| Narrow selection / last row | Bar расширилась с 161 до 296 px и перенесла controls в собственном пространстве; её высота изменилась с 147.09375 до 106 px. Текст и поля выбранных middle/last rows доступны, их сохранённый raw overlap равен 0, `rowHit=true` вместо baseline `false`. |
| Menus | Все три menu frames просмотрены: меню размещены в viewport, focused item различим; actions доступны. Narrow кадр после Escape отсутствует, поэтому его визуальное состояние остаётся непроверенным. |
| Scroll owner / hidden bar | На всех сохранённых candidate states owner — workspace, `outerScrollTop=0`, один scrollable ancestor, document/horizontal overflow отсутствуют. После очистки selection workspace возвращает полную исходную высоту: desktop 880, compact 664, narrow 464 px. |
| Keyboard, return, drag, intent | Все три профиля дошли до конца interaction assertions: Space/range/M/Escape, last row, Task-wrapper close/focus/scroll return, edge drag/cancel, один записанный move intent. `pageErrors`, `externalRequests`, `interactionFailures` пусты. Это synthetic frontend результат; серверного сохранения нет. |

Actual candidate `geometryFailures` содержит ровно три записи: desktop selected middle overlap; compact selected middle overlap; narrow keyboard menu return overlap. Другие geometry guards и interaction assertions не упали. **Общий candidate status — FAIL.**

## Evidence и воспроизведение

- `/workspace/scratch/b3dac59f68e2/research/wp02/ci-38209281679/evidence.zip`, SHA256 `ee84471a776f43c31177b70f826c7f300c036248832913be2d84b57ca471bca5`.
- `/workspace/scratch/b3dac59f68e2/research/wp02/ci-38209281679/candidate/results.json`, SHA256 `79336cff1e11a354d188299b4428e3d8eb2656094c81b597988806e2365d03d7`; рядом 9 candidate PNG.
- `/workspace/scratch/b3dac59f68e2/research/wp02/ci-38209281679/baseline/results.json`, SHA256 `25e787a945868a8fd006ab62a06ec9d0e32fdfdc717bb10fef639e86e0e78165`; рядом 9 baseline PNG.
- `/workspace/scratch/b3dac59f68e2/research/wp02/review-r2-probes/ci-38209281679-job.log` — independently fetched raw job log.
- `/workspace/scratch/b3dac59f68e2/research/wp02/review-r2-probes/negative-control-results.json` и `clip-analysis.json` — reviewer probes с явным разграничением от browser run.

F1 воспроизводится без нового browser: зафиксированный recognizer из `review-r2-probes` теперь возвращает exit 0 на unmodified baseline JSON; все 19 отрицательных входов дают exit 1. F2 воспроизводится самим runner на commit R2 в Chromium указанного run; сохранённый JSON показывает 118,5 raw area при нулевом видимом пересечении двух широких selection states.

## Ограничения и следующий шаг

Browser/visual больше не NOT_RUN для всего кандидата: actual run и девять кадров получены и оценены. Однако overall browser gate **FAIL**, narrow post-menu failure требует дополнительной evidence, а A1/A2 полностью не закрыты. Исправление F1 не означает готовность всей задачи.

Backend/services/extraction/runtime-image steps нового run были skipped после candidate failure. Локальный native TypeScript7 build blocker не обойдён. Настоящий Task route, persistence/reload, F03 recovery, другие browser engines, touch/AT/browser UI zoom и release-wide suite остаются за пределами этого targeted review. Нового product/DS/transport-дефекта по рассмотренным кадрам не подтверждено.

Следующий конкретный шаг: исправить измерение/диагностику F2, сохранив строгую проверку отсутствия видимого перекрытия и независимые visibility guards; получить новую baseline/candidate evidence с сохранённым narrow menu-return состоянием, затем повторить независимое ревью затронутой дельты и итогового browser результата.

## Итог

- **Вердикт:** changes-requested для `a52d285b5f46975639a19d21ba1ad3212ae33cb5`.
- **F1:** fixed и independently verified, включая 19 negative controls и actual historical CI SUCCESS.
- **F2:** open [P1], исправить измерение и недостающую диагностику before acceptance.
- **Проверено:** вся дельта R2, неизменность candidate/runtime/dependencies/gates, exact merge tree, actual raw CI и 9 candidate frames с baseline comparison.
- **Не утверждено:** overall candidate PASS, полный A1/A2, release readiness, merge/deploy.
