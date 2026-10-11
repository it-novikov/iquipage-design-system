---
bridge: 1
id: 20261011-spr-14-agent-work
title: "SPR-14: агентский раздел, рабочий план и MCP"
status: active
risk: high
owner: it-novikov
branch: feat/spr-14-agent-work
base: main
created: 2026-10-11
updated: 2026-10-11T07:21:17Z
links:
---

# SPR-14: агентский раздел, рабочий план и MCP

## Цель

Реализовать согласованный план SPR-14 P01–P12: общий план и журнал работы, вопросы/решения, управление агентами и навыками, MCP и обмен мостом. Человек видит значимые результаты и следующий нужный шаг; агент продолжает с сохранённого состояния. Весь UI выполняет GPT 6 Astra на публичной версии IQUIPAGE.

## Рамки

- **Входит:** P01–P12 из products/sprintique/docs/agent-work/SPR-14-PLAN.md; задачи SPR-25–SPR-36, связь SPR-4; новый модуль work и права; DS release; full QA; push/deploy с откатом.
- **Не входит:** arbitrary remote shell/SQL, автоматический запуск подписочного клиента без доверенного адаптера, действия от имени человека.
- **Ограничения:** короткий связный рабочий текст без буллетов/нейрослопа в агентском разделе; минимум шума и значимые быстрые действия; права на каждой команде; изолированные QA данные; только Codex в платформе.

## Приёмка

- [ ] A1. Рабочий план и история атомарны, защищены CAS/idempotency/RLS/fencing, роли и отмена проверены.
- [ ] A2. UI задачи/агентов/вопросов эстетичен и функционален на точном DS-архиве, обе темы/телефон/клавиатура.
- [ ] A3. MCP и скиллы, bridge roundtrip/conflict, реальные external/API сценарии проверены.
- [ ] A4. Два независимых ревью high без P0/P1, полный isolated/detached гейт и CI.
- [ ] A5. Push и выпуск: backup/rollback, migrate, exact image, ready/worker и ключевой сценарий.

## Передача

- **Состояние:** Gate3 полный PASS473+473. Первый CI тоже прошёл продукт и detached, но fingerprint ошибочно счёл новые Gradle cache-файлы изменением исходников; artifact upload исчерпал квоту. Узкое исправление проверено обоими ревьюерами; gate4 и повтор CI обязательны.
- **Сейчас:** S3: повтор immutable гейта и CI после исправления инструмента проверки
- **Дальше:** После обоих PASS — свежая backup, migrate, own OAuth и production UI.
- **Незакоммичено:** Только CI/fingerprint tooling и release evidence; runtime и UI неизменны.
- **Рабочая копия:** 7 файл(ов): .github/workflows/vnext.yml, products/sprintique/docs/agent-work/BACKEND-REVIEW.md, products/sprintique/docs/agent-work/FINAL-REVIEW.md, products/sprintique/docs/agent-work/RELEASE.md, scripts/verify-vnext.mjs, scripts/vnext/source-inputs.mjs, scripts/vnext/source-inputs.test.mjs (7 files changed, 43 insertions(+), 2 deletions(-)) · HEAD 844bff9
- **Ловушки:**
  - Встроенный набор tools не hot-reload; штатный native app-server ephemeral без модели успешно подключает MCP OAuth
  - Migration77 makes image931 incompatible; feature-off must be tested, full image rollback requires compatible artifact or DB restoration
  - Old preview stopped; earlier screenshots and unverified first composition are not acceptance of revised UI
- **Проверка:** BACKEND-REVIEW.md и FINAL-REVIEW.md: CI-only diff approve, cache regression1/1PASS, runtimechecks сохраняют строгий отказ.

## План

### S1. Контракты и вертикальный сценарий [done]
- **Что:** P01–P06: модель, DS, план, вопросы, сессии и журнал.
- **Как:** Backend/contracts — agent_architecture; DS/UI — GPT 6 Astra agent_ui.
- **Зачем:** Проверяемая и продолжаемая работа в задаче.
- **Приёмка:**
  - [x] Backend targeted tests и DS/frontend gates проходят; вертикальный сценарий в браузере
- **Покрывает:** A1, A2
- **Итог:** Публичная DS .39, новый модуль work и права проверены реальным HTTP и браузером; отдельная вкладка, обе темы, телефон, клавиатура и сохранение черновика подтверждены UI-REVIEW.md.

### S2. Реестр, MCP, навыки и обмен [done]
- **Что:** P07–P10: агенты, typed work tools, skills, bridge sync, handoff.
- **Как:** Backend/UI по общему API, bridge/skills — agent_collaboration.
- **Зачем:** Работа из внешнего клиента и через API без потери состояния и повышения прав.
- **Приёмка:**
  - [x] Реестр и profile, MCP parity, roundtrip/conflict, revoke/cancel/transfer tests проходят
- **Покрывает:** A1, A2, A3
- **Итог:** Типизированные инструменты, реестр и навыки готовы; bridge 49/49, portable skill и revoke/cancel/transfer проверены. Новые production MCP tools проверяются после выкладки.

### S3. Независимое ревью и полная приёмка [active]
- **Что:** P11, полный гейт и два ревью исправленного результата.
- **Как:** Изолированный PG18/S3, detached product, обе темы/телефон и реальные OAuth clients.
- **Зачем:** Закрыть регрессии и риски прав/повторов/передачи.
- **Приёмка:**
  - [ ] Нет P0/P1; полная проверка и CI зелёные; evidence финальной сборки сохранены
- **Покрывает:** A4
- **Итог:** Оба независимых ревью завершены без открытых замечаний. Полный gate3 идёт на замороженном исходном дереве; изолированные main/fallback контейнеры прошли готовность, сессию, новую схему и feature boundary.
- **Зависит от:** S1, S2

### S4. Выпуск и наблюдение [todo]
- **Что:** P12, push/PR/release/backup/rollback.
- **Как:** Проверить latest base; clean final build; backup; migrate; exact image; readiness и authenticated flow.
- **Зачем:** Рабочий результат на production.
- **Приёмка:**
  - [ ] Верифицированный коммит/образ, backup и путь отката, ready/worker и основной сценарий
- **Покрывает:** A5
- **Зависит от:** S3

## Решения

- **D1** (2026-10-11) Владелец утвердил P01–P12: «В остальном ок, давай пробовать». Уточнение: в агентском разделе человекочитаемый связный текст без буллетов и нейрослопа; в UI только значимое для работы.
- **D2** (2026-10-11) UI — GPT 6 Astra; новые записи платформы только аккаунтом Codex, не пользователем.
- **D3** (2026-10-11) Пользователь явно разрешил push и deploy в исходной постановке.

## Вопросы

Пока нет.

## Контекст

- products/sprintique/docs/agent-work/SPR-14-PLAN.md — утверждённый план
- products/sprintique/docs/agent-work/SUBTASKS.md — реальные карточки
- Existing owned QA S3: products/sprintique/output/infra/storage.json, mode 0600; не выводить содержимое
- Node24 /opt/homebrew/opt/node@24/bin; JDK25 /opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home; PG18 /opt/homebrew/opt/postgresql@18/bin
- Проверенный MCP через native app-server, temporary helper /tmp/spr14-native-mcp.py; credentials не извлекаются
