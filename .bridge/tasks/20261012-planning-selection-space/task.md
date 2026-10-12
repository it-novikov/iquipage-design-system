---
bridge: 1
id: 20261012-planning-selection-space
title: "WP02-A: выбранная строка Planning не перекрывается панелью"
status: active
risk: standard
owner: it-novikov
branch: fix/planning-selection-space
base: f5f941afa4e9be8a709e6de67a92bacf5a9397ca
created: 2026-10-12
updated: 2026-10-12T06:05:07Z
links:
---

# WP02-A: выбранная строка Planning не перекрывается панелью

## Цель

При выборе задач для переноса человек должен видеть выбранную строку и команды одновременно. Нижняя плавающая панель Planning перекрывает содержимое строки в определённом положении прокрутки (PF02/WP02-A). Нужна минимальная продуктовая компоновка, которая сохраняет привычные controls, выбор, клавиатуру и смысл команды. Приёмка относится к геометрии и затронутому frontend-поведению; сохранение на сервере этим не доказывается.

## Рамки

- **Входит:** Planning selection bar/scroll boundary, dedicated regression с настоящим mountPlanning и точной DS .52, обычные product styles, ограниченные geometry/keyboard/menu/return/drag-cancel проверки; их узкий запуск в existing GitHub Actions workflow.
- **Не входит:** общий redesign Planning, tabs/DS release, домен/права/API/операции перемещения и F03 lost-response/replay, реальные пользовательские данные, публикация/PR/remote ref.
- **Ограничения:** base f5f941afa4e9be8a709e6de67a92bacf5a9397ca; отдельная ветка fix/planning-selection-space. Backend JDK/PG недоступен; synthetic frontend явно подменяет только adapter/data и Task callback. Общий стенд и новые runtime/lock зависимости не добавляются. Root проводит независимое ревью и публикацию. Автор — GPT-6 Astra (AI agent), gpt-6-astra@localhost.

### Короткий problem-first разбор

- Источник/причина: `.pl-selbar` fixed относительно viewport, отдельный sibling после workspace; список прокручивается в `#host-view`. Дополнительное место в конце не устраняет перекрытие средней строки. Связь live-кадра и deploy SHA неизвестна; локальную причину подтвердить отдельным red render.
- Кандидат: один scrollport с содержимым над auto-height панелью в обычном потоке. Существующий DOM позволяет начать с локальных CSS-правил. Отвергнуть при потере доступа к строкам/командам, focus/scroll-return или лишнем dispatch.
- Альтернативы: панель в потоке у поиска теряет постоянную доступность на длинном списке; fixed/sticky с padding либо автопрокруткой сохраняет перекрытие или перехватывает ручную прокрутку. Не добавлять компоненты и слушатели без найденной причины.
- Гарантии: прежние selection/row intents, подписи/count, permissions, меню и adapter; одна команда на один выбор. Изменение transport потребует отдельной реальной мутации, а чистая геометрия не закрывает F03.

## Приёмка

- [ ] A1. Aктуальный exact-package render воспроизводит перекрытие до правки; после правки выбранная строка и панель доступны без пересечения в desktop/narrow и при изменении высоты панели.
- [ ] A2. Selection/Space/Escape/menu/клавиатурный фокус, return callback и drag-cancel сохраняются; один выбор команды даёт один intent, synthetic проверка не выдаётся за серверное сохранение.
- [ ] A3. Подготовлен воспроизводимый пакет независимого ревью: минимальный diff, точный package/build, red/green evidence, результаты scoped проверок и конкретные NOT_RUN ограничения.

## Передача

- **Состояние:** Actual CI38209281679 historical proof PASS; candidate FAIL on three raw overlap checks. Independent R1/R2 preserved verbatim; F1 closed, F2 open. Test-only measured clipping correction prepared.
- **Сейчас:** S2 — new actual baseline/candidate geometry and narrow menu-return evidence pending
- **Дальше:** Root publishes this narrow correction; inspect strict visible-overlap results, computed clip chain, all hit guards and after-Escape frames, then independent follow-up.
- **Незакоммичено:** Dedicated runner/recognizer, README/evidence, complete independent R1/R2 reports/indexes and checkpoint only; runtime CSS/JS, executable fixture, dependencies and workflow unchanged.
- **Рабочая копия:** 3 файл(ов): products/sprintique/tests/fixtures/planning-selection/README.md, products/sprintique/tests/planning-selection-baseline-proof.mjs, products/sprintique/tests/planning-selection-space.browser.mjs (6 files changed, 67 insertions(+), 19 deletions(-)) · HEAD a52d285b · снято 2026-10-12T06:05:07Z
- **Ловушки:**
  - Для Playwright installer нужен TMPDIR в scratch: /tmp отсутствует; браузеры устанавливаются вне repo.
  - Native Chromium exits SIGTRAP before about:blank; /proc/self is absent. Native TypeScript7 build also fails at readlink /proc/self/exe. No runtime PASS or build PASS claimed.
  - Local browser NOT_RUN; complete npm build blocked by native TypeScript7 /proc/self/exe. Existing workflow gates unchanged. Historical red requires original repair branch fix/planning-selection-space.
  - Baseline is a counterexample, not a requirement that every old position fail. Desktop/compact last overlap is zero because of end spacing; candidate must still pass every middle/last assertion.
  - Raw BCR intersection is diagnostic, not painted overlap. Do not round away overlap or mark F2/A1/A2 accepted from offline arithmetic; narrow menuReturn was missing in old CI.
- **Причина:** planned — GPT-6 Astra (AI agent), 2026-10-12T06:05:07Z, передано root: Test-only F2 correction is reviewable; runtime and workflow unchanged. Root publishes the local commit and runs actual baseline/candidate CI. F2 and A1/A2 remain open; narrow menu-return and measured clip/hit evidence still required.

## План

### S1. Точная база и red render [done]
- **Что:** Одна synthetic Planning fixture с настоящим mountPlanning и .52
- **Как:** Штатные shell/product styles, детерминированный ContainersView, реальный Chromium; зафиксировать исходное перекрытие
- **Зачем:** Подтвердить локальную причину до изменения и сравнивать один и тот же сценарий
- **Приёмка:**
  - [x] Версия и bytes .52 подтверждены; red overlap измерен и просмотрен; условия и границы сохранены
- **Покрывает:** A1
- **Итог:** GitHub run38207967799 job114675580643: immutable f5f + exact .52, Chromium151, all3 profiles rendered and interactions completed with no page/interaction/external errors. Six selection/last-row frames inspected. Actual counterexample: middle all3 + narrow last; corrected historical recognizer passes on unchanged downloaded JSON. Candidate still pending.

### S2. Минимальная компоновка и green [active]
- **Что:** Отвести панели собственную auto-height область; проверить затронутое поведение
- **Как:** Локальный Planning CSS, прежние события; тот же browser сценарий плюс keyboard/menu/return/drag-cancel
- **Зачем:** Убрать root cause без переделки функций Planning
- **Приёмка:**
  - [ ] Geometry green на тех же данных; взаимодействия и один intent подтверждены; новые app ошибки отсутствуют
- **Покрывает:** A1,A2
- **Зависит от:** S1

### S3. Scoped gates и handoff [todo]
- **Что:** Самопроверка полного diff и пакет независимого ревью
- **Как:** Boundary/build/затронутые Node tests, fingerprints/logs, ограничения backend и release targets
- **Зачем:** Передать проверяемый результат без ложной готовности продукта
- **Приёмка:**
  - [ ] Scope и evidence согласованы; root получил immutable diff и конкретный следующий шаг
- **Покрывает:** A3
- **Зависит от:** S2

## Решения

- Root разрешил подготовить CSS-кандидат и выполнить real-render на existing GitHub Ubuntu runner после подтверждённого отказа локального Chromium. Локально red/green не считается выполненным; A1/A2 остаются открытыми. Это изменение execution environment, а не ослабление критериев.
- Baseline proof отделён от обычного green: immutable f5f product tree, в котором добавлен только новый driver/fixture; recognizer не принимает запуск с ошибкой или неполное взаимодействие за воспроизведение overlap. Historical red запускается только в исходном repair PR, subsequent bases не обязаны оставаться дефектными.
- Product runtime JS/DOM, manifest, lock и DS archive не меняются. Дельта приложения ограничена Planning CSS; browser tooling устанавливается временно вне package.
- Первый реальный CI run 38207967799 подтвердил middle overlap во всех трёх профилях и last overlap на narrow. Требование historical recognizer о last overlap на desktop/compact было неверным: место в конце списка защищает эти конкретные последние строки. Исправляется только распознавание подтверждённого counterexample; все candidate geometry/interaction/error assertions сохраняются. S1 подтверждён, S2 ждёт candidate run.

## Вопросы

Пока нет.

## Контекст

- Actual checks, browser boundary и требования к GitHub evidence: [evidence.md](evidence.md).
- Актуальный implement skill: `/workspace/scratch/b3dac59f68e2/repo-v3/agent-skills/skills/iquipage-implement/SKILL.md` (ещё отдельный PR; в эту ветку не копируется).
- DS: `products/sprintique/vendor/iquipage-web-0.6.0-vnext.52.tgz`, SHA256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`; существующий public workspace, native product shell и supplied buttons.
- Путь: `products/sprintique/ui/planning/src/index.js::mountPlanning`; фактические product CSS `web/main.js` imports; `contracts/planning-view.ts::ContainersView`.
- Standard проверки: targeted browser red/green, check:boundaries/build, затронутые существующие Node tests; полный backend test недоступен и не считается PASS.
