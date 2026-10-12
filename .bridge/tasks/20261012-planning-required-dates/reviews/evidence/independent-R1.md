# PF09 — независимое scoped review обязательных дат спринта

## Вердикт

**approve — только для проверенного source diff и его task packet.** Подтверждённых замечаний P0, P1, P2 или P3 в изменении не найдено. Два статических атрибута `required` корректно используют уже поставленное поведение `iq-date-field` версии `.52` в общем caller создания и редактирования спринта. Изменение устраняет разрешённую интерфейсом очистку периода, который существующий submit требует заполнить.

Это ограниченное независимое code/integration review, а не приёмка фактического браузерного поведения, всей программы PF09/WP07, сохранения в базе или production. Проверка CI именно опубликованного кандидата остаётся в ведении root по исходному A3. Отсутствие здесь браузера не превращено ни в PASS, ни в новый обязательный gate для публикации этой обратимой caller-правки.

- Ревьюер: **GPT-6 Astra**, отдельная сессия `/root/planning_dates_review`, не автор patch.
- Дата фиксации: **2026-10-12, 08:37:50 UTC**.
- Режим: `iquipage-review`, targeted, репозиторий read-only. Прочитаны применимые root/product AGENTS, START-HERE, engineering review/workflow и обязательные references review skill.
- Runtime diff прочитан самостоятельно до авторских выводов в карточке. Затем проверены карточка, run-state, журнал и первичный PF09 source.
- Пользовательское разрешение продолжать принятую программу и отсутствие численных квот учитываются. Ревьюер не менял код, ветки, карточку или remote. Merge/deploy не выполнялись.

## Неизменяемые входы

| Вход | Проверенное значение |
|---|---|
| Worktree | `/workspace/scratch/b3dac59f68e2/repo-required-dates` |
| Base | `2424d4724ec411c84b54b85634dbf54228b0ebd8` |
| Reviewed HEAD | `0f95d415547f09520ca5be728c76342eb476dba2` |
| Reviewed tree | `ac08b693216d1c800756aca62b6c38a4fa32fc26` |
| Implementation commit | `cdfd23f9fe857dfa4e9a22e4c541799b95926187` |
| Implementation tree, указанный в packet | `76d2702a41628e8c5e431aee01f04e84b9ffadf0` |
| Runtime caller SHA-256 | `4417243af2058f08c8a522776362fd056f5deca76681acd802b7cb8f63c2cd81` |
| DS archive SHA-256 | `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758` |
| `package.json` SHA-256 | `5c1ec083a2ab611e83c112a3786ebd2de1aa894da49fbf4494b3045d3582942e` |
| `package-lock.json` SHA-256 | `3399e2333d8104f75e792cf100d3f149a62a9e361961bf4df1af4e46f7f09254` |

`git status --porcelain=v1` пуст в начале и после выполненных проверок; HEAD/tree совпали при повторной сверке перед записью отчёта. Diff base→HEAD содержит четыре файла: одну изменённую строку продукта и три файла `.bridge/tasks/20261012-planning-required-dates/`. Единственная runtime-дельта — `required` у `name="start"` и `name="end"` в `products/sprintique/ui/planning/src/containers-dialogs.js:65`. Между implementation commit и reviewed HEAD менялись только эти три файла packet.

Источник принятого наблюдения прочитан из Git blob `e2fedd97419ed4c255e9997357b679c8eadc95d8`: `products/sprintique/docs/experience/research/sprintique_problem_first_research_plan_v3.md`, §PF09, строки 254–258; строка 612 о WP07; L12/N09. Это исторический источник исследования, а не повторная runtime-проверка текущего кандидата. Там явно сказано: активная команда была наблюдена, clear и submit не выполнялись; применение existing required contract разрешено как ранний независимый fix.

## Находки по severity

| Severity | Подтверждённые новые findings | Итог |
|---|---:|---|
| P0 | 0 | Потери данных, обхода прав или иного критического эффекта этим diff не выявлено. |
| P1 | 0 | Нарушения проверенного контракта или source-сценария не выявлено. |
| P2 | 0 | Дополнительной сложности, неполного scope или ложной runtime-приёмки в packet не выявлено. |
| P3 | 0 | Отдельных замечаний по patch нет. |

Остаток PF09 — общая подпись «Убрать срок» для разных видов дат — уже зафиксирован как отдельная работа WP07. Он не объявляется новым дефектом этой правки и не закрывается данным review.

## Человеческая потребность и соразмерность решения

Период спринта имеет начало и окончание. Предлагать убрать одну из этих дат, а после отправки формы объяснять, что обе обязательны, создаёт лишний ошибочный шаг. Patch согласует доступную команду очистки с уже существующим требованием формы. Он сохраняет возможность выбрать другую дату и не делает сам период readonly.

Это достаточный ранний срез PF09: он применяет готовую возможность компонента, не меняя календарь, DS-релиз, форму данных, права или сохранение. Новый harness, dependency или тест, проверяющий наличие ровно двух атрибутов, добавили бы механическую сложность без существенного нового доказательства. Для standard-risk изменения проведено одно независимое review с чтением фактического контракта и доступными существующими проверками.

При этом сам текст «Убрать срок» остаётся в popup, теперь disabled для обязательных дат. Patch не добавляет объяснения обязательности, нового объявления для assistive technology или нейтральной/контекстной подписи clear. Более широкое понимание пользователем семантики разных дат остаётся целью PF09/WP07.

## Source review: точный контракт `.52`

Проверен именно продуктовый `vendor/iquipage-web-0.6.0-vnext.52.tgz`, а не только исходник библиотеки в монорепозитории. `package.json` и lock указывают на этот архив; SHA-512 SRI пересчитан и совпал. Архивные package/PROVENANCE называют `.52`. Исторический `PROVENANCE.sourceCommit` не используется как fingerprint продукта.

Публичный export `./core` направлен на `types/core.d.ts` и `dist/core.js`. Тип `IqDateField` содержит `.value`, `.disabled`, `open/close`, но не typed `.required` (`package/types/core.d.ts:65–67`). Caller использует атрибут в markup, а не выдуманное свойство или private DOM patch. В `package/dist/core.js:144–146` `registerCore()` регистрирует date field. Все приведённые ниже номера DS относятся к содержимому этого точного архива.

`package/dist/modules/date-field.js:213–215` задаёт `clear.disabled = this.hasAttribute('required') || !this.chosen`. `mount()` вызывает `sync()` после получения начального значения и создания внутренней кнопки (`:65–77`). Два атрибута заданы в статическом HTML до подключения формы; тем самым они доступны первому `sync()`.

`required` не входит в `observedAttributes` (`:28`). Это ограничивает динамическое переключение этого атрибута, но caller его динамически не меняет. `sync()` не ставит `.disabled` триггеру по `required`: триггер зависит только от `disabled/readonly` (`:188–189`). Кнопка clear является нативным `<button>`; отключение использует её native `disabled`, а не только визуальный CSS. CSS disabled-состояния также присутствует (`package/dist/iquipage.css:1166–1167`). Реальные pointer/keyboard и визуальный результат здесь не прогонялись.

### Создание, редактирование и соседние поля

| Путь | Прочитанное основание и вывод по source |
|---|---|
| Создать спринт | `ui/planning/src/index.js:170–179` вызывает общий `containerDialog`; `containers-dialogs.js:62` берёт прежние `nextSprintDates`. Оба поля получают атрибут, вычисление defaults не меняется. |
| Изменить спринт | `index.js:181–183` передаёт `value:c` тому же caller. `containers-dialogs.js:61–65` берёт сохранённые start/end. Отдельной edit-ветки без required не найдено. |
| Выбрать день / «Сегодня» | В DS calendar `components.js:856–872` день присваивается в `chosen`, а не переключается в пустое значение. Date field принимает `iq-change` и вызывает прежний `commit` (`date-field.js:86–106`). Required не запрещает выбор. |
| Events и значение формы | `commit` нормализует значение, синхронизирует, закрывает popup и выдаёт прежние `iq-change`, `input`, `change` (`:224–232`). Hidden input получает `chosen` (`:205–207`). Эти ветки не изменены. |
| Пустой/обратный диапазон | Продукт читает `.value` и до `onSubmit` отвергает отсутствие даты и `start > end` (`containers-dialogs.js:73–77`). Required не заменяет эти проверки. |
| Release deadline | Отдельная release-ветка остаётся без required, с подписью «необязательно»; пустое `.value` становится `null` (`:66,76`). Прежние сохранённые start/end release не переписываются этой правкой. |
| Task due | `dueEditor` отдельно обрабатывает `data-clear` через `pick(null)` (`:30,34–40`); `index.js:207–211` передаёт nullable due в прежнюю bulk-команду. Эта функция и caller не изменены. |

### Keyboard, reset, cancel и предел обязательности

Клавиатурный разбор носит **source-only** характер. Открытие по ArrowDown, выбор нативной кнопки дня, навигация стрелками/Home/End/PageUp/PageDown и Escape остаются прежними (`date-field.js:78–85,108–129`; `components.js:935–977`). Список Tab-цикла берёт `button:not(:disabled)`, поэтому disabled clear исключается из него, остальные controls не исключаются (`date-field.js:119`). Закрытие возвращает фокус триггеру (`:260–272`). В продуктовой форме обработчик Escape продолжает отдельно учитывать `iq-date-field` (`ui/planning/src/dialog.js:14`).

Reset не превращается в clear: listener поля ставит в микрозадачу закрытие popup и восстановление mount-time `initialTime`/`initial` (`date-field.js:177–183`). Required не участвует в setter `.value`, поэтому не мешает восстановлению. Продуктовый диалог не добавляет новой кнопки reset; существующие cancel/close и removal остаются прежними (`dialog.js:10,13,22–24`). Фактическое поведение reset и фокуса в браузере не объявляется проверенным.

Это **не form-associated native required/validity contract**. Внутренний value control — hidden input; `.value=''` продолжает нормализоваться в пустую строку и синхронизироваться (`date-field.js:29–33,49–63,205–215`). В текущем renderer нет нового `aria-required` или field-specific объявления обязательности. Синтетическое программное событие также не является доказательством того, что пользовательская очистка недоступна. Нужный вывод ограничен обычной native-disabled кнопкой clear, а защита submit остаётся в продукте. В packet эти различия описаны честно.

## Фактически выполненные проверки ревьюера

Среда: **Node v24.19.0**. Никаких новых тестов, symlink, harness или установок dependencies не создавалось.

| Проверка / команда | Реальный результат и предел |
|---|---|
| `git status --porcelain=v1`; `git rev-parse HEAD HEAD^{tree}` | Clean; HEAD/tree совпали до и после проверок. |
| `git diff base...HEAD` и сравнение implementation→HEAD | Прочитан runtime diff и все три файла packet; implementation→HEAD меняет только packet. |
| `node --check products/sprintique/ui/planning/src/containers-dialogs.js` | Exit 0, syntax PASS. |
| Из продукта: `node scripts/check-boundaries.mjs` | PASS: product-contained imports, public DS entries, contracts independent of presentation. |
| Из продукта: `node scripts/check-styles.mjs` | PASS: tokens, public variants, no inline styling. Это автоматическая проверка правил, не visual review. |
| `git diff --check 2424d4724ec411c84b54b85634dbf54228b0ebd8...HEAD` | Exit 0, PASS. |
| `engineering/bridge/bin/bridge check 20261012-planning-required-dates` | Exit 0, PASS. Не означает runtime-приёмку или исполнение A3. |
| Python `hashlib` / `tarfile`: package/lock/archive hashes, lock SRI | PASS, значения в таблице входов; package/lock/vendor byte-identical с dependency reuse source `repo-planning`. |
| Архив против установленного `repo-planning/products/sprintique/node_modules/@iquipage/web` | **176/176** архивных файлов byte-identical, mismatches 0. Пакет не устанавливался заново. |
| Существующий `planning-containers-ui.test.mjs`, способ запуска ниже | **7 passed / 0 failed / 0 skipped**, duration 158.223702 ms. Model/default/date-label coverage; не DOM/form regression. |

### Точная provenance независимого запуска 7 тестов

В frozen worktree нет `node_modules`; его read-only состояние сохранено. Вместо нового symlink/loader выполнен уже существующий test-файл из соседней установленной копии при рабочем каталоге frozen продукта:

```sh
# cwd: /workspace/scratch/b3dac59f68e2/repo-required-dates/products/sprintique
node --test /workspace/scratch/b3dac59f68e2/repo-planning/products/sprintique/tests/planning-containers-ui.test.mjs
```

До запуска побайтово сверены тест и вся его product import closure с frozen worktree:

| Файл | SHA-256 обеих копий |
|---|---|
| `tests/planning-containers-ui.test.mjs` | `f46110d34b95cc7526327d77364b9389be4c368586942cc87c9cf299fecbb5a5` |
| `ui/planning/src/containers-model.js` | `76bd713ac1c10ba1fbe5363b53caea6dfbed34a1479b3456141471e70f21d40c` |
| `ui/src/estimate.js` | `e509718b460a002ed8316cacc9453f4bb98f75a9d06c7f843690d007abcb0a86` |
| `ui/src/popover.js` | `ef10bf12d66e1586ce85ff568ec4552863bc1c17ae1718bb2fae480ecc519e21` |

Imports этой closure ведут только к перечисленным product-файлам и `@iquipage/web/core`; установленный DS сверен с точным архивом отдельно. Model assertions исполняются на этой идентичной closure. Последний тест читает product source paths относительно cwd и поэтому читает frozen caller. Он проверяет отсутствие bullet markup, а не поведение required. Ни один из семи тестов не объявлен тестом clear/reset/submit формы.

## Доказательства автора и честность packet

Авторская таблица различает фактические model/syntax/boundary checks, source reasoning и NOT_RUN. Собственного browser PASS, полной CI-приёмки или нового серверного воспроизведения PF09 в ней нет. Run-state `served_build: unknown` и `plan_sha256: null` не маскируются как машинная full-integration acceptance. `external_side_effects_authorized:false` описывает ограничение автора; публикация передана root и не отменяет ранее данное пользователем разрешение root.

Карточка фиксирует implementation commit, а последующий reviewed HEAD содержит handoff metadata: это явно объяснено и подтверждено diff. Обозначение A1 как выполненного читается вместе с его явным scope «Source fix» и source-only оговорками; это не доказательство выполненного human/browser сценария.

Отдельных raw-логов каждого авторского запуска packet не предоставляет: ревьюер не удостоверяет исторический факт их исполнения только по таблице. Для существенных здесь доступных проверок приведены собственные фактические результаты выше. Авторский import probe с HTMLElement stub не используется как DOM evidence. Полный CI prerequisite PR78 получен как контекст от root; ревьюер удалённо его не перепроверял и не переносит его PASS на текущий HEAD.

## Не выполнено и границы дальнейшего решения

**NOT_RUN ревьюером:** реальный браузерный clear/selection/keyboard/reset/submit; обе темы и viewports; assistive technology, touch, native popup/focus; real HTTP/DB persistence; human acceptance; typecheck/build; Kotlin/PostgreSQL/native/full suite; remote CI текущего кандидата; merge/deploy. Ограничения `/proc`, Chromium/TS7 и отсутствующих JDK25/PG18 prerequisites переданы в задании и packet; их не диагностировали и не пытались обходить заново. Никакого браузера здесь не запускалось.

Решение соразмерно узкому diff: контракт уже поставлен, атрибуты статические, продуктовый submit остаётся защитой, соседние nullable-date callers не затронуты. Не выявлен конкретный остаточный source-риск, который требовал бы нового harness, изменения DS или ещё одного обязательного review. Разрешённую публикацию можно продолжать с этим scoped verdict и явными NOT_RUN. Root сохраняет оригинал отзыва, прикладывает его digest и проверяет CI именно публикуемого кандидата по A3. Если до публикации меняются runtime source, package или проверенный контракт, этот verdict нельзя автоматически переносить на новый diff.

Общая подпись «Убрать срок», объяснение разных видов дат и фактическая human/browser приёмка более широкого PF09 остаются отдельным продолжением принятого плана. Они не потеряны и не объявлены закрытыми двумя атрибутами.
