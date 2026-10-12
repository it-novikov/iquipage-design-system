---
bridge: 1
id: 20261011-problem-first-product-workflow
title: Problem-first skills и сценарии проверки Sprintique
status: blocked
risk: standard
owner: user
branch: docs/problem-first-product-workflow
base: main
created: 2026-10-11
updated: 2026-10-11T20:11:30Z
links:
---

# Problem-first skills и сценарии проверки Sprintique

## Цель

Помочь агентам проектировать UI/UX от подтверждённой проблемы человека, сравнивать осмысленные варианты и проверять результат без повторных исследований и лишних документов. Уточнить существующие четыре skills, а для Sprintique дать актуальный индекс поверхностей, сценариев и допустимых сред проверки. Содержание и точные ссылки должны проверяться независимо; наличие инструкции не объявляется доказательством качества модели или приложения.

## Рамки

- **Входит:** problem/evidence/causes/options/decision/acceptance в существующих skills и шаблонах; переносимые references; документация маршрутов и synthetic preview; согласование canonical/client copies и manifests; независимое ревью.
- **Не входит:** приложение, доменная модель, API, новая DS-поставка, новый UI-стенд, рабочие данные, установка клиентских плагинов, публикация и деплой продукта.
- **Ограничения:** standard: меняются инструкции и документация; схема assessment 2.0 и runtime не меняются. Пользователь поручил подготовку в репозитории; отдельное подтверждение обычных решений не нужно. Независимый targeted recheck /root/repo_patch_audit принят ведущим; разрешены commit и обычный push только этой ветки. Draft PR открывает root; merge/deploy не поручены. Основа f5f941afa4e9be8a709e6de67a92bacf5a9397ca, DS в продукте vnext.52; historical lock 0.5.7 сохраняется и не доказывает текущую приёмку.

## Приёмка

- [x] A1. Четыре skills и переносимые шаблоны связывают потребность, проверяемые причины, варианты включая no-build, решение и приёмку; глубина соразмерна задаче.
- [x] A2. Sprintique inventory содержит точные source-backed routes/entry/fixtures, meaningful сценарии, ограничения evidence и live read-only/local mutation границы без рабочих данных.
- [x] A3. Canonical/client copies и manifests согласованы, проверки комплекта проходят, historical DS-lock неизменён; выполнено независимое ревью до коммита.

## Передача

- **Состояние:** Bundle commit0d3ebb4045438a419f4422db10e8a21d85c2fa96 и review/bridge commit1fccc374727c88859024bae9bb92e2a912efa013 сохранены локально; S1-S3/A1-A3 приняты. Обычный git push остановлен автоматической проверкой разрешений; успешная публикация не подтверждена.
- **Сейчас:** Подготовка и независимая приёмка завершены; публикация ветки заблокирована auto-review
- **Дальше:** Root сообщает пользователю точный отказ и получает явное разрешение на публикацию ветки в GitHub; до этого не повторять push через git или connector.
- **Незакоммичено:** Только запись отказа публикации в bridge; будет сохранена отдельным локальным коммитом. Skills/runtime и canonical manifest неизменны.
- **Рабочая копия:** нет · HEAD 1fccc37 · снято 2026-10-11T20:11:30Z
- **Ловушки:**
  - Внешний skill-creator quick_validate отвергает existing compatibility одинаково на baseline и текущем; repo validator и YAML/contract tests поле поддерживают. Не удалять корректную metadata ради такого PASS.
  - Auto-review rejected git push: external destination github.com ownership/privacy not established by trusted user text; no explicit user authorization to publish/push potentially sensitive bundle. Это permission rejection, не network/auth failure; tool запрещает workaround/indirect execution.
- **Проверка:** Ранее: 184 unittest PASS/0 skips, validate_skills, manifest164, sync, links22/CSV16 и diff/bridge PASS. Независимо: exact frozen hash, 110 copy files, 376 manifest entries, 16 NOT_RUN rows и closure F1-F3; suite заново не запускался.
- **Причина:** blocked — astra-architecture, 2026-10-11T20:11:30Z, передано root: Локальные коммиты готовы, критерии независимой приёмки выполнены. Обычный push отклонён auto-review из-за отсутствия явного разрешения пользователя на внешнюю публикацию; connector не использовать как обход. Следующий шаг — явно согласовать публикацию с пользователем. Merge/deploy не выполнялись.

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

## Решения

- **D1** (2026-10-11) Root принял независимый targeted recheck /root/repo_patch_audit: approve, F1-F3 исправлены; frozen026a6a118b8daa75a23a4136119cb737f755900f9f2c6a30a794cf5c5e14b8f9. Разрешены commit и обычный push только docs/problem-first-product-workflow. Автор и root сохраняют чужое заключение, не выдают его за своё независимое ревью; merge/deploy не поручены.

## Вопросы

Пока нет.

## Контекст

- agent-skills/START-HERE.md; canonical skills в agent-skills/skills/, установленные копии в .agents/skills/.
- products/sprintique/AGENTS.md и scripts/test.mjs: preview использует временный PostgreSQL и настоящий Kotlin backend.
- engineering/workflow.md: глубина соответствует риску, существующие полномочия сохраняются.
