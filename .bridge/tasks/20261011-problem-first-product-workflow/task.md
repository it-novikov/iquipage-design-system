---
bridge: 1
id: 20261011-problem-first-product-workflow
title: Problem-first skills и сценарии проверки Sprintique
status: review
risk: standard
owner: user
branch: docs/problem-first-product-workflow
base: main
created: 2026-10-11
updated: 2026-10-12T04:58:22Z
links:
  - https://github.com/it-novikov/iquipage-design-system/pull/74
---

# Problem-first skills и сценарии проверки Sprintique

## Цель

Помочь агентам проектировать UI/UX от подтверждённой проблемы человека, сравнивать осмысленные варианты и проверять результат без повторных исследований и лишних документов. Уточнить существующие четыре skills, а для Sprintique дать актуальный индекс поверхностей, сценариев и допустимых сред проверки. Содержание и точные ссылки должны проверяться независимо; наличие инструкции не объявляется доказательством качества модели или приложения.

## Рамки

- **Входит:** problem/evidence/causes/options/decision/acceptance в существующих skills и шаблонах; переносимые references; документация маршрутов и synthetic preview; согласование canonical/client copies и manifests; независимое ревью; неизменяемый архив итогового исследования и учёт фактической публикации.
- **Не входит:** приложение, доменная модель, API, новая DS-поставка, новый UI-стенд, рабочие данные, установка клиентских плагинов, публикация и деплой продукта.
- **Ограничения:** standard: меняются инструкции и документация; схема assessment 2.0 и runtime не меняются. Пользователь поручил подготовку в репозитории; отдельное подтверждение обычных решений не нужно. Независимый targeted recheck /root/repo_patch_audit принят ведущим. 2026-10-12 пользователь явно разрешил публикацию ветки/PR и выполнение плана с промежуточными push/PR; root подтвердил публикацию workflow в PR 74 через GitHub API. Этот этап добавляет только архив и publication bookkeeping; merge/deploy продукта не входят. Основа f5f941afa4e9be8a709e6de67a92bacf5a9397ca, DS в продукте vnext.52; historical lock 0.5.7 сохраняется и не доказывает текущую приёмку.

## Приёмка

- [x] A1. Четыре skills и переносимые шаблоны связывают потребность, проверяемые причины, варианты включая no-build, решение и приёмку; глубина соразмерна задаче.
- [x] A2. Sprintique inventory содержит точные source-backed routes/entry/fixtures, meaningful сценарии, ограничения evidence и live read-only/local mutation границы без рабочих данных.
- [x] A3. Canonical/client copies и manifests согласованы, проверки комплекта проходят, historical DS-lock неизменён; выполнено независимое ревью до коммита.
- [x] A4. Текущая передача отражает опубликованный PR 74 и новое разрешение; неизменяемый отчёт V3 сохранён с точным SHA256 и portable ссылками, исторические reviews и журнал сохранены.

## Передача

- **Состояние:** Workflow опубликован в PR 74: remote be77902b24fc19a0e9cf81c3879207d4210f8ad9, tree равен local7296e898. Новая user authorization от 2026-10-12 зафиксирована. A1-A4/S1-S4 выполнены; архив исследования сохранён без изменения bytes.
- **Сейчас:** Bookkeeping и архив готовы к отдельному local commit поверх remote base be77902
- **Дальше:** Root проверяет и публикует добавленный metadata/archive commit в существующий PR 74; исходные reviews и report snapshot не переписывать.
- **Незакоммичено:** Только 5 файлов: task/journal, reviews/PUBLICATION.md, research README и точный MD snapshot. Подготовлены для локального коммита; root владеет внешней публикацией.
- **Рабочая копия:** 2 файл(ов): products/sprintique/docs/experience/research/README.md, products/sprintique/docs/experience/research/sprintique_problem_first_research_plan_v3.md (5 files changed, 1293 insertions(+), 10 deletions(-)) · HEAD be77902 · снято 2026-10-12T04:57:04Z
- **Ловушки:**
  - Внешний skill-creator quick_validate отвергает existing compatibility одинаково на baseline и текущем; repo validator и YAML/contract tests поле поддерживают. Не удалять корректную metadata ради такого PASS.
  - Исторически 2026-10-11 auto-review отклонил git push из-за отсутствия явного user authorization на внешнюю публикацию; эта запись и журнал сохранены. 2026-10-12 пользователь дал новое явное разрешение, root подтвердил PR 74 через API. Последующий CLI auth failure — отдельное событие, не текущий approval blocker.
- **Проверка:** SHA256 отчёта d8d43a7264f9af19b544e7a4edc340bf9c832572ddc5155c6ae61baa05f760a3; 15 links PASS; 4 original review files byte-equal; journal history unchanged; равенство tree подтверждено; bridge/diff PASS. Suite и runtime на этом этапе не запускались.
- **Причина:** planned — astra-architecture, 2026-10-12T04:57:04Z, передано root: Старый approval blocker снят новой явной user authorization; PR74 опубликован root. Архив V3 и publication mapping подготовлены поверх равного remote tree be77902, A4/S4 завершены. SHA/report/original reviews/links/bridge/diff проверены, новый audit или runtime PASS не заявлен. Следующее действие root — публикация metadata/archive commit в тот же PR.

## План

### S1. Уточнить переносимую методику [done]
- **Что:** Дополнить существующие skills и шаблоны
- **Как:** Общий короткий reference и явные решения вместо новой системы документов
- **Зачем:** Не закреплять предложенную кнопку до понимания потребности
- **Приёмка:**
  - [x] Problem-first цепочка и границы полномочий не противоречат текущему процессу
- **Покрывает:** A1
- **Итог:** Четыре skills 47/47/52/56 строк; общий problem-first reference; brief/options/decision/acceptance; schema2.0 и historical locks неизменны. validate_skills PASS.

### S2. Описать поверхности и безопасные сценарии [done]
- **Что:** Добавить product-specific индекс и preview руководство
- **Как:** Сверить маршруты и seed scripts текущего HEAD
- **Зачем:** Агент должен отличать реальную проверку от подготовленной картинки
- **Приёмка:**
  - [x] У всех семейств есть вход, цель, fixture и честное ограничение
- **Покрывает:** A2
- **Итог:** docs/experience README, SCENARIOS и CSV16семейств: route/source/fixture/evidence limits; ссылки проверены; все authored scenarios NOT_RUN, mock runner не реализован.
- **Зависит от:** S1

### S3. Синхронизировать и проверить [done]
- **Что:** Обновить копии и manifests; передать diff на ревью
- **Как:** Детерминированная сборка комплекта, существующие проверки и независимые замечания
- **Зачем:** Инструкция должна быть переносимой и воспроизводимой
- **Приёмка:**
  - [x] Технические проверки зелёные и независимое ревью завершено
- **Покрывает:** A3
- **Итог:** Содержательный commit 0d3ebb4045438a419f4422db10e8a21d85c2fa96. Независимые reviews/R1.md и R2.md сохраняют заключения /root/repo_patch_audit: 3P2 исправлены, targeted recheck approve для frozen026a6a118b8daa75a23a4136119cb737f755900f9f2c6a30a794cf5c5e14b8f9. Suite184 PASS/0 skips и структурные checks ранее выполнены; metadata-only этап не требует повторного suite.
- **Зависит от:** S2

### S4. Зафиксировать публикацию и архив исследования [done]
- **Что:** Обновить текущую передачу, сохранить byte-exact отчёт и сопоставление local/remote commits
- **Как:** Добавить отдельные README/publication metadata; проверить hash, относительные ссылки, bridge и diff
- **Зачем:** Следующий агент видит текущий PR и отличает исторический snapshot от актуального состояния
- **Приёмка:**
  - [x] Report SHA256 совпадает; оригинальные reviews не изменены; текущая передача не заблокирована прежним отказом
- **Покрывает:** A4
- **Итог:** Архив V3 byte-exact: 302264 bytes, SHA256 d8d43a7264f9af19b544e7a4edc340bf9c832572ddc5155c6ae61baa05f760a3. README/PUBLICATION: 15 относительных ссылок PASS; R1/R2 и 2 evidence bytes прежние, journal append-only. Tree local7296e898 = remotebe77902. bridge check и staged diff --check PASS; runtime/skills не менялись, suite повторно не запускался.
- **Зависит от:** S3

## Решения

- **D1** (2026-10-11) Root принял независимый targeted recheck /root/repo_patch_audit: approve, F1-F3 исправлены; frozen026a6a118b8daa75a23a4136119cb737f755900f9f2c6a30a794cf5c5e14b8f9. Разрешены commit и обычный push только docs/problem-first-product-workflow. Автор и root сохраняют чужое заключение, не выдают его за своё независимое ревью; merge/deploy не поручены.

## Вопросы

Пока нет.

## Контекст

- agent-skills/START-HERE.md; canonical skills в agent-skills/skills/, установленные копии в .agents/skills/.
- products/sprintique/AGENTS.md и scripts/test.mjs: preview использует временный PostgreSQL и настоящий Kotlin backend.
- engineering/workflow.md: глубина соответствует риску, существующие полномочия сохраняются.
- products/sprintique/docs/experience/research/README.md: неизменяемый отчёт V3 от 2026-10-11 и текущий publication context.
- reviews/PUBLICATION.md: mapping исходных local commits и remote be77902b24fc19a0e9cf81c3879207d4210f8ad9 при равном tree; исходные R1/R2 не изменяются.
