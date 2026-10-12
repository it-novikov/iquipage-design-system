# R2 — WP02-B / PF03, общая геометрия вкладок, DS vnext.54

## Статус и независимость

Рецензент: отдельная сессия GPT-6 Astra, `/root/tabs_review_r2`; не автор изменения и не R1. Режим: read-only для репозитория и remote. Применён актуальный `iquipage-review` из `repo-v3/.agents/skills`, targeted scope. Прочитаны корневой, library и product `AGENTS.md`, `engineering/review.md`, границы поставки, карточка и журнал задачи, неизменяемый acceptance plan.

Первоначальная критика сформирована **до чтения отчётов R1** и сохранена в `review-r2-pre-reconciliation.md`, SHA-256 `669dd0207b415dfd9d1dc6e0a0a333f32aa61a1b1c2033562b9dd7a7919445b3`. Входной пакет уже сообщал о провале .53; это не слепое исследование. Собственные выводы ниже основаны на diff, самостоятельной проверке tarball/исходников, всех сырых intent/geometry records .54 и просмотренных PNG .52/.53/.54. Аналитические перспективы не являются интервью, наблюдением участников или отдельными людьми-рецензентами. Последующая сверка с R1 приведена отдельно; первоначальные наблюдения сохранены.

**Scoped R2 verdict: approve для source/package review и принятого targeted native scope .54. Новых подтверждённых P0/P1/P2 не найдено; существенных разногласий с R1 нет.** Полный existing vNext CI и реальный consumer TypeScript остаются обязательной проверкой завершения всей поставки; R1-F2 нельзя закрыть по этому scoped verdict. Ни нативный fixture, ни точный literal в исходнике не заменяют компиляцию. A3/final delivery остаются pending, пока root не примет текущий полный gate.

## Неизменяемая основа

| Объект | Fingerprint / идентификатор |
|---|---|
| Опубликованный head | `8f8d218168074bd4c7c9e1e29dfbe783a27998dd` |
| Опубликованное дерево | `a7bf8ed72f07d975a6837e8f1428382785893833` |
| DS checkpoint, первый parent | `078faae97694b0631c8fbe90e3dc6cb6867bb8fb`, tree `9c7feff01838ad18caaf930e0d9480d71a7ef365` |
| Test-only prerequisite, второй parent | `2424d472`; `notifications.test.ts` побайтно равен blob этого prerequisite |
| Actual native merge | `f53af728201b7a4ce2a128c6de7228143d2d50b4`; R2 прочитал Git object и самостоятельно подтвердил тот же tree `a7bf8ed7…` |
| DS .54 archive SHA-256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| План revision 3 SHA-256 | `a0165e153cb976c9da17332b1b79baaeb9b10da2e375c9aa290c620bb3889872` |
| Native .54 | Run `38221220733`, job `114717673229`, artifact `11734645359`; root проверил digest `8b969d7f15bef33032c5b51d630ef75b9ac4385d7b10ff20df0e1568e0d20954` |
| Authoritative .52 | Run `38218161373`, artifact `11733391704`; actual merge `a49fac18565d3291b061eaa6c3c4c1c6f03ec328`, archive `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758` |
| Historical failed .53 | Run `38219197651`, artifact `11732888867`, archive `cac335e8e80b2dfe2f62cab24cd48a7e514bc400c07cedc59d23f18c4ae61d18` |

Raw directories, relative to `/workspace/scratch/b3dac59f68e2/research/wp02b/`:

- `baseline3-ci-11733391704/browser/` — authoritative before.
- `candidate1-browser-11732888867/browser/` — сохранённый отказ .53.
- `candidate2-browser-11734645359/browser/` — actual .54; **78 PNG и один results.json**, не 79 PNG.
- `candidate2-browser-11734645359/build/results.json` — успешная fixture build, browserChecks честно NOT_RUN в build-only документе.
- `candidate2-browser-job.log` — checkout actual merge, boundary/style guards, fixture build и native run.
- `review-r2-source-verification.json` и `review-r2-native-verification.json` — собственные расчёты R2; они не являются новым браузерным запуском.

## Собственная критика: потребность, альтернативы и компромиссы

Участник должен понимать, какой раздел задачи или версия документа открыты, и продолжать чтение. Исходная .52 даёт ложную маленькую область вертикальной прокрутки и неполную рамку клавиатурного фокуса. Причина действительно общая DS: `foundation.css:40` заменяет прежнюю комбинацию flex, отрицательного нижнего margin кнопки и бордюра списка; минимальная fixture не загружает product CSS и воспроизводит тот же 1 px, что Task и Wiki. Это различает DS-причину и правдоподобную альтернативу — прикладной scrollbar/переполнение drawer.

### Участник, который читает и нажимает

Сохранились знакомые названия, порядок, выбранная подпись с 2 px underline, расстояние между подписями и панели. В полноразмерных Task и Wiki и в двух узких профилях строка остаётся вторичной по отношению к заголовку. .54 не создаёт ещё одну поверхность, меню или обязательный шаг. Board после закрытия показывает те же две карточки; PNG возврата во всех пяти профилях побайтно совпадают с .52.

Цена видна: полоса выше на **8 CSS px**, а подписи сдвинуты на **4 px** внутрь. На Task 1280×720 заголовок «Описание», уже находившийся у нижней границы в .52, в .54 виден хуже под краем прокручиваемого содержимого. Это конкретный компромисс плотности, заранее описанный в `control-contracts.md:62`, а не доказательство улучшения всего Task. Тело задачи уже не помещалось в исходный первый экран этого профиля. Увеличивать scope до переделки свойств, footer или информационной архитектуры для этой правки не требуется. В text200 сохранены прежние сокращённые подписи свойств; данное исправление их не устраняет и не создаёт.

### Пользователь клавиатуры

Для него простое отсутствие scrollbar недостаточно. .53 особенно показателен: End раскрывал последнюю длинную вкладку, но последовательный ArrowRight оставлял на экране лишь начало «Проверка…» и обрезанную справа рамку. Это видимый, воспроизводимый отказ, а не эстетическое предпочтение (`candidate1…/desktop-light-minimal-failure.png` и raw assertion `long/next`).

.54 добавляет ровно один платформенный вызов после прежнего focus (`components.js:389`). Он раскрывает выбранную вкладку с nearest по двум осям, пользуясь тем же scroll padding. Перебор всех включённых вкладок, Home/End, обе стрелки, wrap и пропуск disabled проходят на actual .54. В 136 keyboard intents фокус находится на выбранной вкладке, outline остаётся solid 2 px с offset 2 px, полная рамка и подпись помещаются в scrollport.

Главный конкурирующий риск — сдвиг внешнего документа/диалога через scrollIntoView до переключения панели. R2 проверил **все фактические ancestor deltas**, а не только условие validContext. В 177 записанных intents внешних перемещений нет; разрешённый тестом clamp ни разу не понадобился. Особенно полезен text200 Wiki: сохранён scrollTop 15 при изменении диапазона 585 ↔ 421. Это доказательство только записанных состояний, а не обещание отсутствия прокрутки в любой чужой композиции.

### Визуальный дизайнер

В light и dark выбранность читается по прежнему цвету и underline; клавиатурная рамка полностью замкнута и отделена от glyph. Внешний край focus совпадает с началом полосы, хотя пассивная подпись теперь имеет 4 px inset относительно соседней оси. Нейтральная линия заканчивается на content box и остаётся тихим разделителем; появились место для рамки и небольшой нижний зазор. Это осознанная небольшая перемена ритма. Не обнаружено новой фиксированной высоты, сжатия шрифта, ellipsis вкладок или перекрытия подписи рамкой.

Таблица метрик сама по себе не закрывает дизайн: просмотрены парные полные Task и Wiki кадры всех пяти профилей, парный nested Task, focused strips light/dark/narrow/text200 и исторический отказ .53. На narrow Task заголовок переносится как прежде; на Wiki конфликт, статус несохранённого текста и сравнение остаются различимыми. Пустая synthetic Work-панель подтверждает выбор раздела, но не выполненную агентом работу или пригодность всего agent-flow.

### DS consumer, сопровождение и стоимость исполнения

Текущие product callers подтверждены независимым `rg`: runtime usages находятся только в `ui/src/board/task-dialog.js` и `web/wiki.js`; Board открывает тот же Task. Public helper `ui.tabs` и supplied markup сохранены. Product runtime/CSS не изменялись. Task по-прежнему исключает собственный iq-tabs event из autosave (`task-dialog.js:424`), меняет маршрут/видимость footer своим существующим handler (`task-dialog.js:435`). Wiki не превращает смену вкладки в новую запись.

Новая логика не добавляет observer, таймер, измерительный JS-цикл, зависимость, listener, публичный prop или специальный adapter. Один scrollIntoView на выбранной вкладке при существующем keyboard intent — соразмерное изменение. Native layout имеет стоимость; FPS, latency, long tasks или initial application bytes не измерялись. Read-only existing size gate R2 проходит: core closure 185231/185291 B, CSS 101476/101612 B, icons 55675/57218 B; core closure — 31 файл. Остаток бюджета маленький, но baseline и пороги не увеличены. Это размерный gate, не runtime performance benchmark.

### Почему выбранная правка предпочтительна

| Вариант | Проверяемый результат / причина решения |
|---|---|
| Сохранить .52 или только скрыть overflow-y | Оставляет исходный разрыв геометрии либо прячет симптом; внешняя рамка продолжает обрезаться. Отвергается baseline PNG и raw 1 px. |
| Только убрать отрицательный margin | Устраняет одну причину высоты, но само по себе не резервирует место под global external focus. Недостаточно для текущего контракта. |
| Inset focus на нынешних кнопках | У кнопок нет inline padding; существующий inset recipe приближает ring/halo к первым и последним glyph. Для качественного результата пришлось бы менять padding каждой вкладки и горизонтальный ритм. Не прототипировался, не объявляется доказанно неработоспособным; исходникового сравнения достаточно, чтобы не предпочесть его здесь. |
| Только CSS candidate .53 | Корректная новая высота и End/Home, но реальный sequential ArrowRight оставляет clipped label/focus. Отвергается собственным неизменённым gate. |
| .54: место под текущий focus + nearest reveal | Actual матрица подтверждает геометрию и каждый intent без внешних сдвигов. Сохраняет control/API, требует лишь минимального общего keyboard correction; цена +8/+4 явна. |
| Собственная scrollLeft-арифметика, observers, новый API или product override | Дополнительная логика и coupling без наблюдаемой необходимости после успешной native .54. Не требуется для текущего дефекта. |

## Контракт поставки и целостность gates

R2 сам вычислил SHA-256 .54, SHA-512 lock integrity, SHA плана; сверил все **176** упакованных файлов с соответствующими файлами library build/source tree и installed package. Расхождений и повторных путей архива нет. Для всех **49** modules независимо реконструирована трансформация src → ESM, для пяти public entries проверено точное соответствие src → dist, CSS заново собран в памяти в порядке build.mjs и побайтно сравнен с архивом. Единственное изменение runtime module относительно .52 и .53 — `components.js`; CSS .54 побайтно равен .53.

Version .54 согласована в package/lock, entry, declarations, semantic metadata, provenance, build manifest, consumer dependency и точном consumer TypeScript literal. Это не заявление о выполненной TS7 compilation. Public export surface не расширен. Прежние .52 и .53 tarball совпадают с immutable Git blobs. Product lock после нормализации только DS root dependency и DS entry в точности равен baseline: посторонних изменений dependencies нет.

Второй parent привносит ровно отдельный notification test и его документы/bridge metadata. Actual NT05 test blob совпадает с `2424d472`. Это не новое доказательство корректности NT05 от R2 этого scope; независимый review и full CI prerequisite принадлежат тому пакету. DS, package, fixture, runner и plan в merge не изменены.

Surfaces, profiles, environment, check acceptance, release_checks, risk_acceptances и known findings исходного плана сохранены. Два текста applicability исправлены, чтобы не называть новую JS-правку CSS-only. Runner добавляет geometry/context на каждый intent и проверку внешних сдвигов; старые assertions не сняты. Сопоставление .52 baseline и .53 failure подтверждает, что gate умеет наблюдать дефект, а не получает PASS от одной новой версии. Existing vNext workflow, verifier, extraction и size/style/contrast baselines относительно authoritative baseline неизменны.

## Native результаты и их пределы

Среда raw: Node 24.20.0, Playwright 1.62.1 / native Chromium 151.0.7922.34, Ubuntu 24.04, ru-RU, UTC, device scale 1, reduced motion. Профили: 1280×720 light comfortable; 1440×900 dark compact; 390×844 light; 320×720 dark; 768×900 light с HTML root font-size 200%. Последний — **text scaling, не browser zoom**.

| Проверка | Результат R2 |
|---|---|
| Source identity | Все 14 sourceSHA256 inputs raw совпали с проверяемым деревом; archive/plan exact; actual merge tree exact |
| Matrix | 16 cases: 5 minimal, 5 Task/Board, 5 Wiki, 1 desktop-light nested |
| Geometry | 57 named measurements + 177 intent measurements = 234; во всех .54 scrollHeight = clientHeight и maxScrollTop = 0 |
| Обычный текст | .52 client/scroll 45/46, rect 45.5; .54 54/54, rect 53.5 |
| text200 | .52 64/65, rect 65; .54 73/73, rect 73 |
| Events/state | Все 177 intents: ровно один соответствующий iq-change, одна выбранная вкладка, корректные tabIndex и panel.hidden |
| Keyboard | 136 intents и 178 focusVisible geometry rows с named captures; полный сохранённый focus, labels и underline; disabled не выбирается; горизонтальное раскрытие проверено |
| Контекст | Ноль ancestor movements в записанных intents, включая сравнение без условного фильтра runner |
| Product effects | Board — 2 карточки после возврата, без write attempts. Wiki — только один явно заданный rejected save на профиль, без дополнительной записи при tabs. Nested — сохранился тот же connected/open parent task-1 |
| Ошибки / сеть | pageErrors = [], externalRequests = [], unsupported synthetic operations = [] |

**Существенная оговорка screenshot-метода.** В text200 Wiki `locator.screenshot()` раскрывает полосу перед первым intent: initial top 842.1875 становится 827.1875, `.wiki-document.scrollTop` меняется 0 → 15 вне intent. `capture()` измеряет перед screenshot; его абсолютный page Y не всегда равен кадру после автоматического раскрытия. Все последующие intent contexts сохраняются. Поэтому full text200 Wiki PNG здесь используются как окружение, **не как pixel-aligned before/after**; относительные +8 px, +4 px и bounds проверены отдельно. Это было замечено R2 при сравнении кадров и raw до чтения авторского уточнения.

В этой матрице все отдельные focused labels с focus помещаются по ширине; длинная совокупная полоса переполняется. Ветка для подписи шире целого scrollport не была фактически пройдена, поэтому общая гарантия на произвольно длинную одиночную подпись не заявляется. Не вводится новый обязательный gate сверх принятого scope.

## Что остаётся за пределами вывода

Full existing vNext run `38221220620` ещё не принят этим checkpoint; consumer TypeScript, real services, detached extraction и portable image нельзя объявлять PASS по native fixture. Сообщение автора о 478/478 library tests — supplier evidence до получения final full-CI records; R2 его не выдаёт за свой повторный прогон. Локальные Chromium, TS7, JDK25 и PG18 не перезапускались по известным ограничениям среды.

Настоящий browser zoom 200%, Firefox, Safari, iOS touch и screen-reader combinations остаются отдельными WP09 release requirements. Нативный fixture использует реальные frontend modules с synthetic adapters; он не проверяет основную authentication/bootstrap цепочку, persistence, production, human usability, agent execution или принятие результата. No merge/deploy/npm publish authorization не возникает из этого review.

## Сверка с R1

После первоначального собственного checkpoint R2 прочитал `review-r1.md` (original SHA-256 `32702335ce7ea4f30055a155a30fbc19973cea0ec981739d41d885965c00b77f`) и `review-r1-followup-54.md`, затем сопоставил завершённую native позицию с самим R1. Прочитан также опубликованный native follow-up R1 с SHA-256 `17d16a336e4609e565198ec3e368df057046a0a914a79cade5198c0d75b70322`. R1 прочитал полный независимый checkpoint R2 после своего анализа. Исторический original R1 не изменялся.

| Вопрос | Самостоятельный вывод R2 и reconciliation |
|---|---|
| R1-F1, кратность | Поддерживаю закрытие на текущем native .54: все 177 intents имеют ровно одно событие нужного owner/value. Недостаток ранней fixture не замаскирован финальным selected state. |
| R1-F2, exact consumer literal | Согласен: код .54 исправляет буквальное противоречие, сохраняя строгий тип. Finding **не закрыт до актуального full consumer build**. Ограниченное approve R2 не снимает это условие. |
| R1-F3, clipped sequential selection | Поддерживаю закрытие на текущем native .54: прежний failing materials → discussion проходит, 234 geometry records не содержат clipping/range violations, after PNG показывают целую рамку. |
| Побочное движение внешних scrollers | Согласен с R1 по риску и условной применимости guard. R2 дополнительно сравнил все raw ancestor deltas: движения и natural clamp не возникли. Раскрытие при screenshot в text200 Wiki находится вне intent и явно отделено. |
| +8 px / +4 px и первый экран Task | Обе проверки признают конкретную цену плотности и положение «Описание» у footer. Согласованная геометрическая коррекция не объявляется улучшением всех экранов и не требует нового redesign scope. |
| 136 против 178 | Разные знаменатели: 136 keyboard intents; 178 focusVisible samples, когда включены named captures. R2 самостоятельно пересчитал 178; численного разногласия нет. |
| Неисполненные ветки и среды | Обе проверки не заявляют проверенную oversized-single-label ветку, natural clamp, human research, production или release-only browser targets. |

Существенных технических, визуальных или методических разногласий не осталось. R1 удерживает общий final до current full gate; scoped R2 approve ограничен уже проверенным source/native scope и удерживает ту же границу общей готовности. Это не waiver существующего gate.

## Индекс просмотренных изображений

R2 действительно просмотрел **45 PNG: 27 current .54, 17 baseline .52 и один failed .53**. Пять имён профилей перечислены в разделе среды; пути ниже относительно соответствующего `browser/` каталога выше.

- В обеих .52/.54: `{profile}-board-task-panel.png` и `{profile}-wiki-draft-preserved.png` для каждого из пяти профилей; `desktop-light-nested-nested-task.png`; `desktop-light-minimal-short-Home.png`; `desktop-dark-board-task-End.png`; `narrow-dark-board-task-Home.png`; `text200-light-wiki-wiki-End.png`.
- В .54: `{profile}-board-work-panel.png` и `{profile}-board-board-return.png` для всех пяти профилей; `desktop-light-minimal-long-End.png`; `text200-light-minimal-long-End.png`.
- Дополнительные before .52 для Work: `desktop-light-board-work-panel.png`, `narrow-dark-board-work-panel.png`.
- Historical .53: `desktop-light-minimal-failure.png`.

Остальные PNG не объявляются вручную просмотренными R2. Все сырые named measurements и intents независимо прочитаны/пересчитаны, независимо от выбора кадров.

## Итог

- **Вердикт:** **approve — scoped source/package review и targeted native .54** на exact published tree. **Полная приёмка поставки pending current full vNext CI, включая consumer TypeScript и R1-F2.** Это не approval merge/deploy и не снятие required gates.
- **Проверено:** immutable source/package/plan; scopes и guards; actual native raw всех 16 cases/177 intents/234 geometries; реальные PNG и компромисс композиции; read-only existing size gate.
- **Не проверено:** перечисленные выше full-CI/release-only/human/production targets; без переноса этих состояний в PASS.
