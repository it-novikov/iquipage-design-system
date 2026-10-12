---
bridge: 1
id: 20261012-planning-required-dates
title: Обязательные даты начала и окончания спринта
status: active
risk: standard
owner: it-novikov
branch: fix/planning-required-dates
base: 2424d4724ec411c84b54b85634dbf54228b0ebd8
created: 2026-10-12
updated: 2026-10-12T08:31:40Z
links:
---

# Обязательные даты начала и окончания спринта

## Цель

Человек задаёт период спринта и должен понимать, что начало и окончание обязательны. PF09 показал активную команду «Убрать срок» у начала; очистка и submit в исходном наблюдении не выполнялись. Устранить подтверждённый source-разрыв: общий caller создания/редактирования должен передавать существующий атрибут `required` обоим полям, сохраняя выбор и проверку диапазона.

## Рамки

- **Входит:** PF09 / ранний независимый пункт WP07; два `required` в sprint-ветке `containerDialog`, source/parity review и соразмерные существующие проверки.
- **Не входит:** общая подпись «Убрать срок», новый календарь, DS release/patch, зависимости, optional release deadline и task due, домен/права/сохранение.
- **Ограничения:** база `2424d4724ec411c84b54b85634dbf54228b0ebd8`; DS остаётся .52. Владелец принял scope через PF09, поручил промежуточные PR и снял численные квоты. Автор — GPT-6 Astra (AI agent); root владеет независимым ревью, push/PR/CI. Чужие worktree не изменять.

## Приёмка

- [x] A1. Source fix применяет existing required contract к началу/окончанию в create/edit; empty/range guards, selection/reset и optional date callers сохранены.
- [x] A2. Exact .52 package binding, синтаксис, существующие Planning model/date checks, boundary/style и diff/bridge checks подтверждены фактическими результатами; NOT_RUN названы явно.
- [ ] A3. Root завершил независимое ревью frozen patch и применимые CI gates опубликованного кандидата; это не приёмка непроверенного браузерного/человеческого/persistence сценария.

## Передача

- **Состояние:** Implementation cdfd23f9 / tree 76d2702a; product code fixed and local evidence complete. Independent review and exact candidate CI remain pending.
- **Сейчас:** S3 — root review/publication handoff
- **Дальше:** Root independently reviews the final branch HEAD/tree, publishes a separate PR and checks exact CI.
- **Незакоммичено:** Only this handoff metadata after cdfd23f9; no product/dependency changes. Final worktree cleanliness is verified after the handoff commit.
- **Рабочая копия:** нет · HEAD cdfd23f9 · снято 2026-10-12T08:31:40Z
- **Ловушки:** На данной базе исследовательский план ещё не слит; его точный source указан в Контексте. Известные ограничения /proc для Chromium/TS7/JDK25/PG18 повторно не диагностировать; npm install и новый browser harness вне scope.
- **Проверка:** Task Context records 7/7 model/date tests, syntax, boundaries/styles, exact .52 public binding and source-only semantics; browser/native/full gates NOT_RUN.
- **Причина:** review — gpt-6-astra-required-dates, 2026-10-12T08:31:40Z, передано root: Implementation authored cdfd23f9fe857dfa4e9a22e4c541799b95926187; tree 76d2702a41628e8c5e431aee01f04e84b9ffadf0. Two required attrs, exact .52, actual local evidence preserved. Root owns independent review and every remote mutation; no UI/native/full PASS claimed.

## План

### S1. Подтвердить причину и выбрать минимальную правку [done]
- **Что:** Проследить create/edit, optional callers и shipped date-field contract.
- **Как:** Читать PF09/WP07, `index.js`, `containers-dialogs.js`, `dialog.js`, package/lock/vendor и публичный core entry .52.
- **Зачем:** Устранить неверное разрешение очистки без изменения календаря или домена.
- **Приёмка:**
  - [x] Причина, варианты, границы и exact DS semantics записаны до кода.
- **Покрывает:** A1
- **Итог:** Source trace and exact .52 archive contract confirmed; shared create/edit caller lacks required, optional callers and validation are distinct; diagnosis sent to root before code.

### S2. Применить контракт и проверить локальный результат [done]
- **Что:** Добавить `required` ровно двум sprint date fields.
- **Как:** Минимальный diff; существующий `planning-containers-ui.test.mjs`, syntax, boundary/style, exact binding и bridge/diff checks.
- **Зачем:** Убрать разрешённую очистку обязательного периода и сохранить соседние формы.
- **Приёмка:**
  - [x] Только два атрибута изменяют продукт; доступные проверки прошли, ограничения зафиксированы.
- **Покрывает:** A1, A2
- **Итог:** Authored commit `cdfd23f9fe857dfa4e9a22e4c541799b95926187`, tree `76d2702a41628e8c5e431aee01f04e84b9ffadf0`. Two static required attrs only; node existing Planning model/date tests 7/7, syntax, boundary/style, exact .52 public/package binding, diff/bridge PASS. Browser/native/full CI NOT_RUN locally; evidence in Context.
- **Зависит от:** S1

### S3. Независимая проверка и публикация root [todo]
- **Что:** Review frozen patch и CI точного опубликованного кандидата.
- **Как:** Root получает authored commit/tree, карточку и actual checks; публикует отдельный PR и проверяет CI.
- **Зачем:** Проверить результат независимо от автора и доступной здесь среды.
- **Приёмка:**
  - [ ] Независимое ревью и применимые CI gates завершены; scoped verdict и NOT_RUN сохранены.
- **Покрывает:** A3
- **Зависит от:** S2

## Решения

- **D1** (2026-10-12) Исправить existing caller двумя static attributes. Оставить baseline означало бы разрешать очистку того, что submit отвергает. Менять общий clear copy не устраняет отсутствие required; новый календарь/DS release не нужны для этой причины и остаются вне scope.
- **D2** (2026-10-12) Не добавлять тест, зеркалящий два атрибута, или новый browser harness для обратимой caller-правки. Использовать существующие проверки и точный source/diff review; браузерный regression здесь NOT_RUN из-за известных ограничений среды, без фиктивного PASS.

## Вопросы

Пока нет.

## Контекст

- Принятый report: `products/sprintique/docs/experience/research/sprintique_problem_first_research_plan_v3.md` §PF09 / §WP07, L12/N09; доступен в worktree `repo-v3` при commit `4654517bdb94a629c19d514a194495348f08e25e`, Git blob `e2fedd97419ed4c255e9997357b679c8eadc95d8`. Report не скопирован в эту ветку. Это источник наблюдения, а не runtime-проверка текущего кандидата.
- **Причина:** `products/sprintique/ui/planning/src/index.js:172,183` вызывает один `containerDialog` для create/edit. В baseline `containers-dialogs.js:65` sprint start/end не получали required; `:73–74` требуют обе даты и `start <= end`. Patch добавляет только отсутствующие атрибуты. Optional release deadline — ветка `:66,76`; `dueEditor` имеет собственный `pick(null)` и остаётся прежним.
- **Exact DS:** `products/sprintique/package.json` / lock указывают `file:vendor/iquipage-web-0.6.0-vnext.52.tgz`; archive SHA-256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`; lock SHA-512 SRI совпал. Archive package/PROVENANCE называют .52; исторический upstream sourceCommit в PROVENANCE не считается текущим product fingerprint.
- **Публичный контракт:** archive `package.json` экспортирует `./core` с `types/core.d.ts` и `dist/core.js`; `IqDateField` публичен, даёт `.value`, `.disabled`, `open/close`. `required` используется как markup attribute, не как несуществующее typed `.required` property. У поставленного `dist/modules/date-field.js` в `sync()` clear.disabled = required OR empty. Static attribute присутствует до mount/sync; динамическое переключение required caller не использует.
- **Сохраняемые semantics (source evidence):** mount нормализует initial ISO day; calendar selection вызывает commit и прежние iq-change/input/change; hidden input синхронизирует значение для формы. Reset закрывает popup и восстанавливает mount-time initial value/time. Это не form-associated native required/validity: programmatic empty остаётся возможным, поэтому existing submit guards необходимы. Обратный диапазон остаётся ошибкой того же submit. Keyboard/focus handlers не меняются.
- **Привязка существующих dependencies:** package.json SHA-256 `5c1ec083a2ab611e83c112a3786ebd2de1aa894da49fbf4494b3045d3582942e`, package-lock SHA-256 `3399e2333d8104f75e792cf100d3f149a62a9e361961bf4df1af4e46f7f09254`, vendor hash совпали с `repo-planning`; установленная .52 там совпала byte-for-byte с 176 файлами архива. После сверки использован временный read-only symlink `products/sprintique/node_modules` → соответствующий каталог `repo-planning`, удалён после проверок. npm install не выполнялся; dependencies не изменены.
- **Опровергающая проверка:** другая create/edit ветка или required, блокирующий выбор/reset, изменили бы решение; source trace этого не выявил. Не проверенные render/keyboard/reset/submit в браузере, реальный HTTP/DB, human acceptance и production build остаются NOT_RUN/unknown; прошлый CI prerequisite не переносится на эту правку.
- **Остаток PF09:** нейтральная/контекстная подпись общей команды «Убрать срок» остаётся отдельной работой WP07. Этот patch закрывает только caller-разрыв обязательных sprint dates.
- **Frozen implementation:** `cdfd23f9fe857dfa4e9a22e4c541799b95926187` / tree `76d2702a41628e8c5e431aee01f04e84b9ffadf0`, author/committer `GPT-6 Astra (AI agent) <gpt-6-astra@localhost>`. Последующий checkpoint хранит только эти IDs и передачу; код и test evidence относятся к этому неизменённому caller. Root проверяет финальный HEAD/tree при получении, review остаётся независимым.

**Фактические проверки автора, 2026-10-12, Node v24.19.0.** Caller SHA-256 после patch: `4417243af2058f08c8a522776362fd056f5deca76681acd802b7cb8f63c2cd81`. Served build/браузерная среда неизвестны; source/model evidence не переносится на UI-приёмку.

| Проверка | Результат и предел |
|---|---|
| Из `products/sprintique`: `node --test tests/planning-containers-ui.test.mjs` | PASS 7/7, 0 skipped. Existing model/date labels/defaults/optional due tests; не browser test формы. |
| Из продукта: `npm run check:boundaries` | PASS boundary + style contracts. |
| Из корня: `node --check products/sprintique/ui/planning/src/containers-dialogs.js` | PASS syntax. |
| Public core import через `node --input-type=module` с минимальным HTMLElement stub | PASS exports `registerCore`, `registerDateFields`, `IqDateField`, `.value` getter; никаких DOM/UX assertions. Import resolved в byte-matched .52 из repo-planning. |
| Package/lock SRI + archive/installed byte comparison | PASS: три root файла совпали с reuse source; все 176 archive files совпали с installed .52. |
| Source/parity/self-review diff | Только два `required` у start/end. Shared create/edit, optional deadline/dueEditor, empty/range guards и DS events/reset/form semantics прочитаны; handlers и package не изменены. |
| `git diff --check`; `bridge check 20261012-planning-required-dates` | PASS. |
| Typecheck/build, native/full tests, real browser (clear/selection/keyboard/reset/submit), HTTP/DB, human/production acceptance | NOT_RUN; известные ограничения /proc и недоступные native prerequisites не повторялись. Full CI выполняет root после публикации; source baseline CI не считается проверкой patch. |
