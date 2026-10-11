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
updated: 2026-10-11T07:58:55Z
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

- [x] A1. Рабочий план и история атомарны, защищены CAS/idempotency/RLS/fencing, роли и отмена проверены.
- [x] A2. UI задачи/агентов/вопросов эстетичен и функционален на точном DS-архиве, обе темы/телефон/клавиатура.
- [x] A3. MCP и скиллы, bridge roundtrip/conflict, реальные external/API сценарии проверены.
- [x] A4. Два независимых ревью high без P0/P1, полный isolated/detached гейт и CI.
- [x] A5. Push и выпуск: backup/rollback, migrate, exact image, ready/worker и ключевой сценарий.

## Передача

- **Состояние:** Реализация, проверки, push и production выпуск завершены. SPR-14 и подзадачи на review.
- **Сейчас:** Итоговая документация выпуска
- **Дальше:** Владелец проверяет новую вкладку и принимает результат
- **Незакоммичено:** Только итоговая документация и bridge evidence.
- **Рабочая копия:** 3 файл(ов): products/sprintique/docs/agent-work/CLIENTS.md, products/sprintique/docs/agent-work/RELEASE.md, products/sprintique/docs/agent-work/UI-REVIEW.md (5 files changed, 53 insertions(+), 23 deletions(-)) · HEAD eb4574b · снято 2026-10-11T07:58:55Z
- **Ловушки:**
  - Встроенный набор tools не hot-reload; штатный native app-server ephemeral без модели успешно подключает MCP OAuth
  - Migration77 makes image931 incompatible; feature-off must be tested, full image rollback requires compatible artifact or DB restoration
  - Old preview stopped; earlier screenshots and unverified first composition are not acceptance of revised UI
- **Проверка:** Gate4 и CI38121099469 PASS; native OAuth roundtrip; production tabs/reload; observation10min PASS
- **Причина:** review — codex, 2026-10-11T07:58:55Z, передано human:it-novikov: Новая вкладка и быстрые действия выложены; human approval оставлен владельцу. Claude Code и свежий бесшовный OAuth login имеют ограничения CLIENTS.md.

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

### S3. Независимое ревью и полная приёмка [done]
- **Что:** P11, полный гейт и два ревью исправленного результата.
- **Как:** Изолированный PG18/S3, detached product, обе темы/телефон и реальные OAuth clients.
- **Зачем:** Закрыть регрессии и риски прав/повторов/передачи.
- **Приёмка:**
  - [x] Нет P0/P1; полная проверка и CI зелёные; evidence финальной сборки сохранены
- **Покрывает:** A4
- **Итог:** Gate4: DS456, продукт473, detached473 без пропусков; sourceStable true. CI38121099469 success, два независимых ревью без P0/P1.
- **Зависит от:** S1, S2

### S4. Выпуск и наблюдение [done]
- **Что:** P12, push/PR/release/backup/rollback.
- **Как:** Проверить latest base; clean final build; backup; migrate; exact image; readiness и authenticated flow.
- **Зачем:** Рабочий результат на production.
- **Приёмка:**
  - [x] Верифицированный коммит/образ, backup и путь отката, ready/worker и основной сценарий
- **Покрывает:** A5
- **Итог:** Выпуск eb4574b в 07:48:26 UTC; точный manifest559c870, backup074809, migrate77, own OAuth и production UI PASS. Наблюдение до07:58:26: ready, HTML, API/worker, рестарты0, ERROR0. Совместимый rollback фактически проверен.
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
