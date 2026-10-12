# Sprintique Task VT1 — независимое source review

Дата: 2026-10-12. Reviewer: /root/task_prototype_source_review, GPT-6 Astra. Режим: targeted, read-only для репозиториев. Автор overlay — другой агент. Этот отчёт фиксирует первоначальный независимый разбор и ответ автора; дальнейшее закрытие вопросов оформляется отдельным дополнением.

## Вердикт и его граница

**approve — только исходники замороженного экспериментального overlay для сравнительного render.** Подтверждённых новых функциональных дефектов в рассмотренной дельте не найдено. Production UI не принят. Визуального PASS, browser/keyboard PASS, успешного сохранения или человеческого подтверждения этот вердикт не содержит.

Состав 4+7, одинаковый порядок editable/static, первоначальное наличие контролов, сохранение существующих выборок и маршрутов, точная проекция выбранного результата и нейтральный статус вопроса реализованы в пределах согласованного refinement. Два конкретных ограничения сохраняются ниже: старое test expectation расходится с новым copy; взаимодействие busy Plan и закрываемого внешнего details требует реального адаптера.

Исходники движущегося runner/fixtures в repo-task-prototype не входили в review. Их итоговый render и provenance — отдельное доказательство. Проверка source patch не подтверждает, что runner применил его без дополнительной дельты.

## 1. Точные входы

| Вход | Проверенное значение |
|---|---|
| Frozen baseline repo-tabs | 8f8d218168074bd4c7c9e1e29dfbe783a27998dd |
| DS archive | products/sprintique/vendor/iquipage-web-0.6.0-vnext.54.tgz |
| DS SHA-256 | a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457 |
| Source overlay SHA-256 | 41f3852ff8d3abfc4777e3aea6ef4e229f1e15d4f46280b681b28196b2a922f5 |
| Design addendum SHA-256 | 8118b3fc868153c9e68cc6080b6f3058b914ac3fe01cdfa2a534de55ccb171c3 |
| Prior independent design review SHA-256 | a690c90b5a5af055510f4f243b224dd1c502b97060650814b7eb96294db73c5f |

Все заданные SHA совпали. HEAD repo-tabs совпал с baseline; рабочее дерево было чистым. Временная папка создана вне репозиториев: [task-prototype-source-review-temp][TEMP]. В неё сначала извлечены ровно три изменяемых файла командой git show из frozen commit, затем выполнены git apply --check и git apply именно заданного patch. Оба завершились с кодом 0. Файлы baseline, vendor, package/dependencies, Git и remote не менялись.

| Файл | SHA-256 после применения |
|---|---|
| task-dialog.js | 18f74815aa106ffa939d9864e7a58bd93e20787bfe986c422785f804de3633fd |
| task-work-view.js | 26c8545a0a85d73ff032f50605137597878f33a2ff3d1b01228e8b2d1de7d021 |
| work-model.js | 03d2d7ba34da67ed06c4b9c66459da7b13a81469ed6a471c0ce6953ea90e00a9 |

Полные base/patched fingerprints находятся в [source-manifest.json][MANIFEST].

Применены START-HERE, корневой и Sprintique AGENTS, engineering/review и локальный iquipage-review с его обязательными references в объёме targeted диагностики. bridge brief не выбрал активную задачу и предложил перечисленные карточки; произвольная карточка не выбиралась, claim/checkpoint не писались, поскольку оркестратор передал точный внешний scope и явно запретил writes в репозитории. Это не ограничило доступное source review и не заменяло пользовательское разрешение.

## 2. Формы, семантика и lifecycle

### Проверено чтением исходников

**Единственный экземпляр каждого факта и прежняя форма.** propertyFacts не копирует массив: исходные 11 entries распределяются через slice(0,4) и slice(4). Прямые строки — status, ownerId, due, priority. Далее в прежнем порядке: estimate, type, release, plan, parent, tags, author. Одинаковая граница применяется к editableFacts и staticFacts. Не добавлены второй form, повторный editor, name или скрытая desktop/narrow копия. [TD, строки 98–165]

**Семантика dl сохранена.** Для readonly каждая из двух групп — отдельный dl; строки row имеют div с dt/dd. Родитель details находится снаружи второго dl. Slot плана остаётся div внутри этого dl; mountPlanField по ближайшему dl выбирает dt/dd, а не span/span. В editable-ветви списки остаются div, author — собственный dl, штатные controls и slots сохраняют прежнее положение внутри property recipe. Новая обёртка не делает dt/dd прямыми детьми details и не вкладывает dl списков друг в друга. Это source-проверка структуры, не accessibility-tree/browser assertion. [TD, строки 85, 101–146; PLAN, строки 21–25]

**Все controls/slots создаются до первого взаимодействия.** content формируется один раз до dialog; mountEstimate, mountTaskCatalogs, mountPlanField и mountTaskDescription вызываются при штатном mount формы. Закрытый native details не является условием вызова этих функций и не отключает поля. Поэтому существующие read/FormData, querySelector, catalogs.value, estimate closure и planning hook получают прежние единственные targets. [TD, строки 166–188, 192, 240, 264–277]

«Один mount» здесь означает отсутствие нового lazy mount или повторного монтажа группы. Это не утверждение, что внутренние штатные редакторы никогда не перерисовываются: например, estimate обновляет собственный trigger после получения настроек, а catalog может обновить select после создания релиза. Эти пути уже были в baseline и в patch не менялись. [TD, строки 179–188; CAT]

**Disclosure не сбрасывается от нового кода при poll, tabs или fullscreen.** Work poll перерисовывает root работы и summaryRoot, расположенные отдельно от task-editor-properties. Fullscreen меняет dataset и анимацию размеров; свойствам не присваивается новый innerHTML. DS54 IqTabs меняет hidden существующих panel, не пересоздавая их. Board onSaved обновляет доску и список данных, сохраняя текущий drawer. Возврат через явный reload/reopen или переход к другой Task — новый эпизод с новым исходно закрытым details. [TD, строки 250–252, 301, 436–439; TW, строки 33–76; BOARD, строка 148; DS54 components.js, строки 364–427]

### Права, предупреждения и create baseline

| Условие | Вывод проверки |
|---|---|
| Existing editable Task | Прежние controls и quick-edit routes, один details после четырёх прямых строк. |
| Existing readonly Task | Прежняя статическая проекция. Lock reason стоит перед первым dl и не попадает в закрытый details. |
| Accepted result | Прежняя блокировка редактирования и независимая возможность обсуждения; accepted reason остаётся снаружи disclosure. |
| Legacy owner / owner warning | Editable helper добавляется после propertyFacts целиком, снаружи details; legacy значение readonly остаётся в прямой owner-строке. Имеющаяся readonly-проекция warning не расширялась. |
| Create, task=null | propertyFacts возвращает прежний единый список. Дельта не меняет порядок type/template/default-priority, intentional submit и initial focus. После частично успешного создания closure task остаётся прежним, поэтому layout не переключается посреди retry. |
| canEdit=true, но нет applyPlanningChange | План по-прежнему статический; disclosure не создаёт отсутствующий write capability. |

Источник: [TD], прежде всего строки 25–53, 101–105, 119–146, 166–172, 192–239, 303–327, 358–422, 477–480.

Generic autosave error остаётся в прежнем save-state, вне disclosure. Он не переносит фокус к произвольному скрытому полю. Нового сопоставления общей ошибки конкретному дополнительному полю нет. Отдельный риск Plan описан в SR-2, а не объявлен решённым этим наблюдением.

## 3. Summary, выбранный результат и действия

**Один выбранный предмет.** q и review получаются из одного существующего workFocus(state) и взаимоисключающи. При открытом вопросе preview не строится. Без вопроса используется первый подходящий review-step в прежнем порядке массива; это не выбор «последнего» результата. Overview title/action и preview берут один и тот же выбранный шаг. workFocus и selector не изменены. [WM, строки 24–42; TW, строки 43–45, 62–64]

**Правдивое состояние.** Отдельный status в summary добавляется только для question/review. canAnswer=false или отсутствие canAnswer дают «Вопрос ждёт ответа» и прежнее «Открыть вопрос». canAnswer=true сохраняет личный доступный ответ. Review говорит о проверке, не о принятии. Для rejected/blocked и других fallback ветвей сохранилась прежняя проекция overview.text либо overview.status; ранее скрытый общий session status не стал новой отдельной строкой. При отсутствии workPlan summaryRoot по-прежнему hidden. [WM, строки 39–42; TW, строки 62–64]

**Содержательное происхождение preview.** resultPreview получает review.result, выполняет именно workText и trim. Пустой результат подписан «Описание результата не добавлено», без отрицания evidence или выполненной работы. Короткий текст возвращается полностью; длинный — буквальное начало нормализованного текста, подпись «Начало результата» и видимое многоточие. Title не используется в качестве результата. Сохранённый result не модифицируется. [TW, строки 7–14, 62–64]

**Unicode и escaping.** Array.from ограничивает длину по code points, включая зарезервированное место для многоточия. Индекс boundary берётся из уже собранного prefix в UTF-16 и применяется к тому же prefix; смешения индекса code points с индексом UTF-16 нет. Все поля preview и overview перед HTML insertion проходят существующий esc. В DS54 публичный escapeHTML экранирует амперсанд, угловые скобки и обе кавычки. HTML-подобный result не вводит новый HTML renderer. [TW; DS54 core.js экспорт escapeHTML, components.js строка 28]

Это не гарантия сохранения целой графемы. Составной emoji может закончиться на неполной последовательности code points; этот предел разрешён текущим экспериментальным контрактом и не заявлен grapheme-aware алгоритмом. Смысловая достаточность 160 points и высота в narrow/text200 остаются предметом actual render.

**Порядок CTA и полный review.** Существующая кнопка summary находится в head раньше preview в DOM. Новый полный workStep или копия evidence в Task не добавлены. Прежние полные проекции во вкладке Work не изменены. CTA по-прежнему сначала открывает Work, затем выполняет question/review route; review открывает focus-id либо прежний id и фокусирует summary шага. Approve/reject и canDecide-проверки остаются в существующем handle. Action gate, revisions, requests и permissions не менялись. [TD, строка 301; TW, строки 47–69, 113–118, 149–174]

**Focus restoration не переписан.** Существующая логика сохраняет фокус summary-action перед обновлением и возвращает его на текущую кнопку; остальные Work targets используют прежние id и focus helpers. Новое тело preview не добавляет фокусируемого контрола или обработчика. Это source parity, а не утверждение о фактическом поведении клавиатуры при динамической смене вопроса. [TW, строки 36–42, 68–77, 165–174]

## 4. Выполненные проверки

| Проверка | Результат и предел |
|---|---|
| SHA заданных входов, HEAD, DS54 | Совпали; точный provenance записан выше. |
| Применение frozen patch к трём frozen файлам | git apply --check и git apply: exit 0. |
| Node 24.19.0: node --check трёх patched JS | 3/3 exit 0. Не TS-check и не сборка. |
| Наблюдения точных workFocus/workOverview | 8 контролируемых состояний: вопрос с правом/без/без permissions, приоритет вопроса над review, два review в существующем порядке, empty result при evidence, rejected/completed, blocked/running и no-plan. Это pure Node, без DOM и API. |
| Наблюдения точного resultPreview | 9 inputs, включая empty/whitespace, Markdown, HTML-подобный текст, 160/161 points, astral Unicode, границы слов и составные emoji. Во всех observed cases — literal normalized prefix, не более 160 points, well-formed UTF-16. |
| Существующий неизменённый work-model.test.mjs на patched model | **12 pass / 1 fail, child exit 1.** FAIL подробно сохранён как SR-1. Остальные baseline imports разрешались из repo-tabs. |

Для последней строки не переписывались assertions: Node registerHooks перенаправил только точный URL baseline work-model.js на reviewed temporary файл, после чего выполнился исходный test file. Его SHA-256: fd8d6551f81f18f06f5d7646995a4e103705fcd407f00a3bc03d0a02a036739b. В TAP указан фактический reviewed module URL. Wrapper и observation script находятся только во временной папке, не в продукте.

Evidence: [checks.json][CHECKS], [source-observations.json][OBS], [existing-work-model-tests.tap][TAP]. Observation script извлекает тело resultPreview из точного patched файла; он не реализует копию helper и не выдаётся за browser renderer.

## 5. Сохранённые ограничения и ответ автора

### SR-1 — подтверждённое расхождение старого test expectation с новым copy

**Классификация:** confirmed integration expectation mismatch; не новый дефект согласованного поведения и не причина менять эксперимент обратно.

**Источник и условие:** исходный work-model.test.mjs, test на строке 33, assertion строки 35, при canAnswer=false ожидает status «Нужно ваше решение». Patched workOverview возвращает согласованное «Вопрос ждёт ответа». Фактический запуск дал ровно этот diff и 12/13 pass. [TEST; TAP]

**Практический смысл:** нельзя предъявлять неизменённый suite как green для overlay. При будущем переносе принятого поведения в production потребуется обновить соответствующее ожидание вместе с принятым контрактом; текущая постановка разрешает лишь временный composition experiment.

**Ответ автора:** автор подтвердил, что сохранит разницу презентации явно и не объявит весь неизменённый suite green под overlay. Original source review и raw FAIL не удаляются. Позже reviewer выполнил описанный ограниченный запуск; он подтвердил прогноз.

### SR-2 — закрытие внешнего details во время busy Plan и ошибки

**Классификация:** source-backed interaction hypothesis, runtime NOT_RUN. Возможное влияние на обнаружимость ошибки и возврат фокуса; подтверждённым UI defect не объявлено.

**Условие:** в existing editable Task с настоящим applyPlanningChange открыть «Другие свойства», затем Plan, начать медленный Apply и закрыть внешний native details до ответа. Если onApply завершится ошибкой, plan-field.js catch фокусирует Apply в popup без раскрытия внешнего details. Пока busy=true, close() отказывает; новая внешняя summary не входит в его блокировку. [TD, строки 105, 276–277; PLAN, строки 95–101, 110–116, 160]

**Что известно из source:** disclosure не имеет обработчика, связывающего его закрытие с busy Plan; error catch не открывает родительский disclosure. Реальная видимость top-layer popup, доступность summary в этой последовательности и итог фокуса в целевом браузере здесь не проверены.

**Наименьший следующий шаг:** воспроизвести эту последовательность с прежним реальным адаптером и отказом/задержкой записи. Если риск подтвердится, раскрыть ближайший data-task-other-properties перед field-specific error focus либо согласованно предотвратить сворачивание только на время этой операции. Не менять planning command, CAS или backend ради композиции. Исходная группа и draft должны сохраниться, сообщение об ошибке быть достижимым, фокус — возвращаться к видимому существующему контролу.

**Ответ автора:** synthetic adapter намеренно не предоставляет applyPlanningChange, поэтому Plan там readonly. Автор отказался подменять отсутствующее сохранение fake Apply, согласился добавить точный сценарий в README/следующую real-adapter acceptance и передал ограничение root. Reviewer согласился: гипотеза не блокирует текущий source approval/capture, остаётся открытой для соответствующего runtime evidence.

## 6. Разные рабочие роли и спорные tradeoffs

| Перспектива | Что поддержано source | Что остаётся открытым |
|---|---|---|
| Ежедневный читатель | «Описание», текущий editor, title и summary frame сохранены; перед описанием меньше постоянно раскрытых фактов. | Содержательное начало действительно видно в нужном viewport; result preview не вытесняет четыре свойства. Нужен actual render. |
| Частый планировщик | Все дополнительные поля доступны в одном устойчивом disclosure, существующие adapters/read paths и open-состояние в текущем эпизоде сохранены кодом. | Цена раскрытия между задачами, пригодность hint, настоящая последовательная правка/сохранение и SR-2. Это рабочий tradeoff, не доказанный defect. |
| Reviewer с доступом на чтение | Нейтральный вопрос, честный review/empty result, тот же выбранный id, доступный inspect route без нового права принять результат. | Фактическая заметность статуса и текста; keyboard route и чтение при narrow/text200. |
| DS maintainer / инженер надёжности | Существующие public properties/work-story/details recipes; нет новых imports/slots, CSS override, пакета или API. Штатные slots/selects не переписаны. | Runtime control lifecycle, public property reflow при text200, cover/personal/fullscreen composition и eventual production gate. |

Ни выбор четырёх прямых фактов, ни 160 points, ни hint не становятся принятым универсальным правилом от source approval. Известный text200 reflow и Workbench personal/fullscreen grid не считались исправленными. Чтение соответствующих CSS показало сохранение прежних overrides; эстетический спор этим review заново не открывался.

## 7. NOT_RUN и передача

**Не выполнялись:** новый browser render; visual/contrast/reflow/keyboard acceptance; взаимодействия real controls и Plan busy/error; настоящее сохранение, conflict, close/reopen persistence; новая create Task через backend; TS7 native check; JDK25/PostgreSQL18 suite; полный build/test продукта; наблюдения людей; production merge/deploy.

Заведомо недоступные local Chromium и TS7 пути, требующие /proc, а также отсутствующие JDK25/PG18 не повторялись. Этот отчёт не переносит чужие старые screenshots или vendor assertions на новые исходники.

Следующий шаг: root сопоставляет этот immutable source verdict с отдельными actual baseline/VT1 capture и их точным source/data/DS fingerprint. SR-1 остаётся задокументированным test mismatch, SR-2 — явным требованием будущего подходящего real-adapter сценария. Изменение frozen overlay требует нового SHA и отдельного затронутого review; этот первоначальный документ не переписывается.

## Evidence hashes и источники

| Evidence | SHA-256 |
|---|---|
| source-manifest.json | 019ad1a46c2041ba1e8a33ce7972a2a35dc8ccb937ad241dcc0fe699d74345ba |
| checks.json | d22368bfee83269f9a114615cafa70a19e5cc1189d89fa57a2f7cc9ca38c1103 |
| source-observations.json | c1fa5aa96a7dbede52ae2bd8b5a2cb9db1503debd40892f51268f3ca85e44e4d |
| existing-work-model-tests.tap | db08aee68423a4bc9301cc7314ace958ee3565c9a654308d73a80b1606d30b3d |

Линии TD/TW/WM относятся к временным patched файлам; остальные source references относятся к frozen repo-tabs. DS54 references — содержимое проверенного архива, прочитанное без изменения vendor.

[TEMP]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp
[MANIFEST]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp/source-manifest.json
[CHECKS]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp/checks.json
[OBS]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp/source-observations.json
[TAP]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp/existing-work-model-tests.tap
[TD]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp/products/sprintique/ui/src/board/task-dialog.js
[TW]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp/products/sprintique/ui/src/board/task-work-view.js
[WM]: sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/task-prototype-source-review-temp/products/sprintique/ui/src/board/work-model.js
[PLAN]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/plan-field.js
[CAT]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/catalog-picker.js
[BOARD]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/ui/src/board/board.js
[TEST]: sandbox:/workspace/scratch/b3dac59f68e2/repo-tabs/products/sprintique/tests/work-model.test.mjs

