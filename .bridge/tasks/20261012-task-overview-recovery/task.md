---
bridge: 1
id: 20261012-task-overview-recovery
title: "Task: восстановить результат и ясный следующий шаг"
status: active
risk: standard
owner: it-novikov
branch: fix/task-overview-recovery
base: 220af664ef561d3f5ff1b873122281ef352e8f25
created: 2026-10-12
updated: 2026-10-12T12:02:43Z
links:
---

# Task: восстановить результат и ясный следующий шаг

## Цель

Вернуть потерянные в PR87 сведения первого экрана Task: буквальное начало результата работы и понятное объяснение вопроса. Не смешивать состояние завершённого запуска с выбранным возвращённым или заблокированным шагом. Причина, альтернативы, точный scope и границы — [decision.md](decision.md).

## Рамки

- Восстановить model helper, overview result/neutral question и соответствующие CSS из принятого PR84; дополнительный status только для question/review. Сохранить текущий task-dialog.js целиком, включая PR87 focusin.
- Пять адресных native semantic cases и два informational long-review кадра на actual Task. Постоянные companion steps существующего workflow; первичные доказательства не подменяют human/backend acceptance.
- DS/package, данные, права и команды, состав/создание свойств, Estimate, backend, rollout не меняются. Префикс160 сохраняется, Compact не внедряется.
- Владелец явно разрешил продолжать план, исправления, push и PR без количественных квот. Root владеет этой веткой, git/main/чужие ветки не перезаписывает; merge/deploy не разрешены.

## Приёмка

- [ ] A1. Actual overview selected rejected/blocked сохраняет полное имя шага, контекст и CTA без вводящего в заблуждение completed status.
- [ ] A2. Review показывает буквальный результат и переход к нужному шагу; вопрос без права ответа остаётся нейтральным и не предлагает подтверждение; genuine complete сохраняет непустое сообщение. Нет synthetic write attempts.
- [ ] A3. Desktop/390 длинные кадры сохранены с raw геометрией без нового layout PASS; task-dialog.js равен main220af, старые материалы не подменены.
- [ ] A4. Source/package/build, native и существующие применимые CI gates проверены; независимое ревью и честные ограничения сохранены.

## Передача

- **Состояние:** Bounded recovery prepared; local 14 model tests, boundary/styles, actual fixture build and 176 installed DS files PASS; native NOT_RUN
- **Сейчас:** S1 source ready for independent exact review
- **Дальше:** Freeze source, independent review, publish and native CI
- **Незакоммичено:** Только названные source/tests/workflow и карточка с predecessor evidence.
- **Рабочая копия:** 7 файл(ов): .github/workflows/tabs-geometry.yml, products/sprintique/tests/work-model.test.mjs, products/sprintique/ui/src/board/board.css, products/sprintique/ui/src/board/task-work-view.js, products/sprintique/ui/src/board/work-model.js, products/sprintique/tests/fixtures/task-overview-state/, products/sprintique/tests/task-overview-state-browser.mjs (5 files changed, 55 insertions(+), 6 deletions(-)) · HEAD 220af664e
- **Ловушки:** Native Chromium локально не работает из-за отсутствия /proc и не повторяется. Полный vNext CI требует нативную среду. Исторические predecessor checks относятся к4f181ff, не к220af.
- **Проверка:** Pending actual local/CI evidence. Target/human/backend acceptance пока NOT_RUN.

## План

### S1. Восстановить полезную сводку [active]

- **Что:** Restore PR84 overview/model/CSS and scoped status; five behavioral cases and two passive frames.
- **Как:** Exact source comparison, existing public DS54 and actual openTaskDialog; immutable v1, explicit v2 before runtime.
- **Зачем:** Человек сразу видит нужную информацию и доступное действие.
- **Покрывает:** A1, A2, A3
- **Приёмка:**
  - [ ] Восстановление ограничено названным scope; local/build и source review сохранены.

### S2. Проверить native и сохранить [todo]

- **Что:** Native semantic regression, current long-review captures, existing CI, independent review.
- **Как:** Compiled current product and clean committed checkout, exact source/package hashes; preserve failures and evidence.
- **Зачем:** Не переносить старые результаты на новую композицию; сделать изменение воспроизводимым и reviewable.
- **Покрывает:** A4
- **Приёмка:**
  - [ ] Native/CI результаты и ограничения сохранены, PR открыт, независимое ревью завершено.

## Решения

- Original v1 SHA256 `9f18f4a523f032847666a35b4d7394eb7fbac0ae1551ecc479d3811dfb2dd5a8` сохранён. V2 SHA256 `66780241ab4de4b154e77520440632e839bf9cb865ad4dfd93ba443eb2fc186d` записан до runtime recovery.
- Семь небольших cases постоянно запускаются companion шагом: отдельный mode/механизм для двух PNG не оправдан.
- Прежний evidence и причины дрейфа сохранены в predecessor/ и decision.md; они не являются проверкой текущей ветки.

## Вопросы

Нет блокирующих вопросов к владельцу. Следующий scope — только оценка фактических long-review кадров; Compact требует собственного решения по этим данным.

## Контекст

- [PR84](https://github.com/it-novikov/iquipage-design-system/pull/84), [PR87](https://github.com/it-novikov/iquipage-design-system/pull/87).
- [Независимая предшествующая source/plan работа](predecessor/handoff.md).
- [V2 acceptance plan](../../../products/sprintique/tests/fixtures/task-overview-state/acceptance-plan.json) — из корня репозитория path products/sprintique/tests/fixtures/task-overview-state/acceptance-plan.json.
