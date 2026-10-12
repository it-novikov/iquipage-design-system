---
bridge: 1
id: 20261012-task-overview-state
title: "Task: состояние запуска не обозначает завершение проблемного шага"
status: active
risk: standard
owner: it-novikov
branch: fix/task-overview-state
base: 4f181ff3589a32fd9ce152f99018d212d74624b6
created: 2026-10-12
updated: 2026-10-12T11:57:57Z
links:
---

# Task: состояние запуска не обозначает завершение проблемного шага

## Цель

Когда участник открывает Task, он должен понять, что требует продолжения или проверки. На main `4f181ff3589a32fd9ce152f99018d212d74624b6` завершённая сессия добавляет неподписанное «Работа завершена» над выбранным rejected/blocked шагом. Статус запуска сам по себе корректен, но его уровень в обзоре неоднозначен. Нужно сохранить идентичность выбранного шага и следующий переход, не изменяя состояния или права.

## Рамки

- **Входит:** одна адресная renderer-правка `products/sprintique/ui/src/board/task-work-view.js`; actual Task regression через существующий synthetic read adapter; два информационных long-review кадра; два scoped companion steps workflow; эта карточка.
- **Не входит:** `workFocus`, model/statuses/grants/attention, предел result160, create/disclosure, новый CSS/DS-релиз, интеграция Estimate, backend writes, merge/deploy.
- **Ограничения:** один writer `estimate-browser`; root делает commits/push/PR. Использовать текущую композицию PR84; frozen VT1/Compact patch целиком не переносится. Native Chromium локально не запускать: известный `/proc` blocker; CI выполнит actual browser. Временный node_modules symlink допускается только к exact неизменённым repo-tabs deps.
- **Авторизация:** владелец поручил продолжать реализацию, сохранять промежуточные результаты в PR и снял численные ограничения PR. Root 2026-10-12 выделил этот точечный scope; отдельного согласования этой правки не требуется.

## Приёмка

- [ ] A1. Overview для completed+rejected и completed+blocked сохраняет title/context/CTA без неподписанного статуса завершённой сессии; настоящая Work вкладка и её собственный status не изменены.
- [ ] A2. Review сохраняет literal result и переход к полному выбранному шагу; neutral question сохраняет статус ожидания, права и CTA; genuine complete сохраняет основной текст завершения. Actual native actions не вызывают write attempts.
- [ ] A3. Текущие long-review desktop/390 кадры и raw geometry сохранены для отдельной оценки Compact; никаких новых layout-оракулов или эстетического PASS.
- [ ] A4. Проверены exact package/build/boundary/source; plan закреплён до теста, результаты и ограничения сохранены, независимый review и root handoff доступны.

## Передача

- **Состояние:** Frozen renderer delta and actual Task harness on base 4f181ff; local build/syntax/boundary/14 model tests PASS; native NOT_RUN.
- **Сейчас:** S1 source and verification prepared; root preserves checkpoint before new-main repair
- **Дальше:** Root reviews PR87 drift and scopes an explicit repair on 220af664; preserve this original plan and source.
- **Незакоммичено:** Only owned renderer, runner, fixture, workflow append and this task card; no dependency symlink remains.
- **Рабочая копия:** 4 файл(ов): .github/workflows/tabs-geometry.yml, products/sprintique/ui/src/board/task-work-view.js, products/sprintique/tests/fixtures/task-overview-state/, products/sprintique/tests/task-overview-state-browser.mjs (2 files changed, 18 insertions(+), 1 deletion(-)) · HEAD 4f181ff35 · снято 2026-10-12T11:57:57Z
- **Ловушки:**
  - Root verified concurrent main PR87 220af664 removes preview/neutral status/CSS, so the one-condition patch is not directly applicable there. No silent rebase. Root also reported external PR83-head drift; Estimate integration remains outside scope.
- **Проверка:** All 176 DS files equal archive; Vite 136 inputs/12 outputs; original workflow prefix byte-equal; exactly two appended steps. See frozen-sources.json and local-checks.json.
- **Причина:** planned — estimate-browser, 2026-10-12T11:57:57Z, передано root: Frozen on 4f181ff; source manifest a2b3799af33b7bef00ebbdfc57c7a80e83971730e14e92fa9203bbf8954f574e. Root preserves old plan/source, scopes PR87 repair separately, then final independent diff/native review. No further code edits by estimate-browser.

## План

### S1. Область статуса и actual Task regression [active]

- **Что:** исправить уровень представления completed-session status и сохранить смежные сценарии.
- **Как:** использовать уже вычисленные q/review только для дополнительной status-строки; не менять fallback. Проверить five semantic scenarios в настоящем openTaskDialog и сохранить два long-review кадра с пассивными измерениями.
- **Зачем:** человек читает выбранный проблемный шаг без ложного впечатления, что его результат завершён или принят.
- **Покрывает:** A1, A2, A3
- **Приёмка:**
  - [ ] Source delta ограничена renderer; native cases и информационные кадры сохранены с их точной средой.
- **Итог:** native NOT_RUN; реализация начата после утверждённого source/model finding.

### S2. Проверки, независимый review и передача [todo]

- **Что:** подготовить воспроизводимый checkpoint для публикации root.
- **Как:** syntax, существующие work-model tests, public boundary, compiled fixture build, byte-equal installed DS; два appended scoped workflow steps; независимый review; source/package/build fingerprints и явный native NOT_RUN локально.
- **Зачем:** исходный вывод не выдаётся за browser acceptance; не теряются результаты failed capture.
- **Покрывает:** A4
- **Приёмка:**
  - [ ] Локальные доступные проверки, immutable fingerprints и handoff сохранены; root получил reviewable scope для CI.
- **Итог:** ожидается.

## Решения

1. Причина подтверждена независимым adoption review: чистая модель выбирает rejected/blocked step, но дополнительная строка renderer показывает завершение сессии рядом с ним. Это presentation scope, а не ошибка `session.state`.
2. Минимальное решение — показывать дополнительную строку только для уже вычисленных question/review. Альтернатива с подписью «Состояние запуска» добавила бы лишний текст; потребность в нём здесь не установлена. Основной `overview.text || overview.status` сохраняется для genuinely complete.
3. Независимый AI reviewer `task_scope_review` прочитал исходники main и согласился с пятью behavioral cases. Он уточнил: отсутствие completed-текста проверяется только в overview, не во всём DOM; neutral question нельзя привязывать к attention; fixture не должна содержать более приоритетный question/review в rejected/blocked случаях. Это source/план review, не native или human acceptance.
4. Длинный review служит проверкой следующей гипотезы Compact на принятой текущей композиции. Допустимая прокрутка не превращается в дефект автоматически; result budget и geometry не подгоняются под fixture.

## Вопросы

Вопросов по этому scope нет. Native/visual evidence и отдельное решение по Compact будут рассмотрены после CI.

## Контекст

- `research/continuation/task-production-vt1-adoption-review.md` в общей рабочей копии: SHA256 `542871074da7c7f69209325d3cc1d12c213ca1254b94f52c3cc304134229d9d5`.
- Exact base `4f181ff3589a32fd9ce152f99018d212d74624b6`, tree `a025d8054ffe5461ac628bb2c442a8dc3ae17690`; PR84 уже принят в main, PR83 не входит в эту базу.
- `products/sprintique/tests/fixtures/task-overview-state/acceptance-plan.json`, `products/sprintique/tests/task-overview-state-browser.mjs` — frozen plan и воспроизводимый runner.
- DS `0.6.0-vnext.54`, archive SHA256 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`; product package/lock совпадают с repo-tabs.
- `iquipage-implement`: прочитаны constitution, execution-contract, problem-first, human-agent; применён targeted workflow без нового аудита.
