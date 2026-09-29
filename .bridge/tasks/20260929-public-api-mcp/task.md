---
bridge: 1
id: 20260929-public-api-mcp
title: Публичный API и удалённый MCP-сервер Sprintique (api.iqui.page)
status: active
risk: high
owner: it-novikov
branch: feature/public-api-mcp
base: main
created: 2026-09-29
updated: 2026-09-29T20:41:17Z
links:
---

# Публичный API и удалённый MCP-сервер Sprintique (api.iqui.page)

## Цель

Людям нужен программный доступ к Sprintique: скрипты с токеном и ИИ-ассистенты (Claude как custom connector и другие MCP-клиенты), которые работают с задачами от имени человека и не шире его прав. Нужен публичный REST API на `https://api.iqui.page` с bearer-учётными данными вместо cookie и удалённый MCP-сервер `https://api.iqui.page/mcp` (Streamable HTTP) с авторизацией OAuth 2.1 по спецификации MCP: PKCE S256, метаданные ресурса и сервера авторизации, динамическая регистрация клиентов, согласие на sprintique.iqui.page, ротация refresh-токенов, привязка к ресурсу (RFC 8707), отзыв из настроек. Плюс персональные токены для скриптов. Результат проверяется e2e-тестом полного потока и ручной проверкой официальным MCP-клиентом.

## Рамки

- **Входит:**
  - делегированные учётные данные человека: OAuth-токены доступа и персональные токены (скоупы `read`/`write`, срок, хэши, отзыв);
  - сервер авторизации OAuth 2.1: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource[/mcp]`, DCR (RFC 7591), authorize с согласием на sprintique.iqui.page, token (code + refresh с ротацией и обнаружением повтора), revoke (RFC 7009);
  - REST API `/api/v1/…` по bearer на api.iqui.page, cookie на API-хосте не авторизуют, CORS нет;
  - MCP Streamable HTTP (stateless) с инструментами: проекты, поиск задач, задача с обсуждением, создание, изменение полей (CAS + идемпотентность), смена статуса, комментарий, релизы, вехи, сводки карт;
  - настройки человека: подключённые приложения и персональные токены; экран согласия на DS;
  - лимиты по учётным данным, аудит с клиентом, метрики с ограниченными метками;
  - operations.md, ADR, тесты (unit, integration, HTTP e2e).
- **Не входит:** план работы агента из agent-bridge.md (карточка 20260927-sprintique-agent-work); Client ID Metadata Documents и загрузка чего-либо по URL клиента; CORS для браузерных клиентов; сессии MCP и серверные потоки SSE; ресурсы и промпты MCP; изменения nginx и выкладка.
- **Ограничения:** миграция `V20260929000027__…` (после 025/026 или перенумеровать перед слиянием); нет raw-SQL/generic execute; OAuth-токены не пересылаются другим сервисам; текст задач и комментариев — недоверенные данные; операции безопасности (агенты, участники, одобрения, токены) только в интерактивной сессии; Docker только через контекст `colima-sprintique-vnext-qa`; данные стенда и `output/infra/*` не трогать; не сливать.

## Приёмка

- [ ] A1. Полный поток OAuth + MCP проходит e2e-тестом против сервера на настоящем PostgreSQL: регистрация → authorize с PKCE → token → initialize → tools/list → чтение → запись → refresh → revoke → отказ
- [ ] A2. Bearer-запросы действуют строго как человек (RLS, роль, скоуп read/write, аудитория RFC 8707); cookie не авторизуют на API-хосте; операции безопасности требуют интерактивной сессии; тесты безопасности на каждое правило
- [ ] A3. Сервер авторизации соответствует спецификации MCP: метаданные, DCR без загрузки URL, redirect только точное совпадение https/loopback, только S256, без implicit/password, ротация refresh с обнаружением повтора, отзыв; токены только хэшами
- [ ] A4. Человек видит и отзывает подключённые приложения и персональные токены в настройках; согласие на sprintique.iqui.page на компонентах DS, защищено от фрейминга и CSRF
- [ ] A5. Лимиты по учётным данным, аудит «кто и каким клиентом» без содержимого в логах, метрики с ограниченными метками; operations.md и ADR описывают настройку и подключение Claude
- [ ] A6. Гейты зелёные: npm test продукта, Kotlin unit+integration, корневой verify-vnext; ручная проверка на локальном сервере официальным MCP-клиентом; независимое ревью, P0/P1 закрыты; PR открыт, не слит

## Передача

- **Состояние:** R1 исправлено, mcp-oauth 10/10 зелёные
- **Сейчас:** S7 — ручная проверка SDK, независимое ревью R2, гейты
- **Дальше:** Ревью R2, verify-vnext, push, PR
- **Незакоммичено:** DelegatedAccessIntegrationTest.kt (новый интеграционный тест, ещё не прогнан)
- **Рабочая копия:** 19 файл(ов): products/sprintique/docs/decisions/0003-public-api-mcp.md, products/sprintique/docs/operations.md, products/sprintique/server/src/main/kotlin/com/sprintique/identity/api/AuthenticatedRequests.kt, products/sprintique/server/src/main/kotlin/com/sprintique/identity/application/Authentication.kt, products/sprintique/server/src/main/kotlin/com/sprintique/identity/application/ConnectedApps.kt, products/sprintique/server/src/main/kotlin/com/sprintique/identity/application/OAuthAuthorizations.kt, products/sprintique/server/src/main/kotlin/com/sprintique/identity/application/OAuthClients.kt, products/sprintique/server/src/main/kotlin/com/sprintique/identity/application/OAuthTokens.kt, products/sprintique/server/src/main/kotlin/com/sprintique/identity/domain/OAuthRules.kt, products/sprintique/server/src/main/kotlin/com/sprintique/mcp/api/McpController.kt, products/sprintique/server/src/main/kotlin/com/sprintique/mcp/application/McpTools.kt, products/sprintique/server/src/main/kotlin/com/sprintique/mcp/application/TaskTools.kt и ещё 7 (19 files changed, 324 insertions(+), 112 deletions(-)) · HEAD f3dbe90
- **Ловушки:**
  - Узел по умолчанию v26: для гейтов PATH=/opt/homebrew/opt/node@24/bin:$PATH
  - TEST_S3_CONFIG=/Users/nvkv71/iquipage-work/ux-ds-20260925/products/sprintique/output/infra/storage.json

## План

### S1. ADR и проработка [done]
- **Что:** ADR 0003: модель доступа (делегированные токены, скоупы, аудитории, OAuth AS, MCP-транспорт, решение по SDK)
- **Как:** docs/decisions/0003-public-api-mcp.md по шаблону; чек-лист проработки high
- **Зачем:** Контракт, схема, аутентификация и технология меняются
- **Приёмка:**
  - [x] ADR покрывает семь вопросов проработки и альтернативы
- **Покрывает:** A2,A3
- **Итог:** docs/decisions/0003-public-api-mcp.md: модель доступа, AS, MCP, проработка 7 пунктов, альтернативы
- **Модель:** strong

### S2. Миграция и делегированные учётные данные [done]
- **Что:** V20260929000027: OAuth-клиенты, коды, гранты, refresh, события доступа; credentials kind oauth/personal со скоупами и аудиторией; Authentication и ProjectAccess понимают делегирование
- **Как:** Flyway SQL + afterMigrate гранты + jOOQ regen; Actor.credentialKind/scopes/clientId; cookie на API-хосте не принимаются; SESSION_REQUIRED для операций безопасности
- **Зачем:** Основа для REST и MCP
- **Приёмка:**
  - [x] Миграция применяется с нуля, дрейф jOOQ нулевой
  - [x] Тесты: read-токен не меняет, cookie на API-хосте 401, агентские гранты и одобрения из токена 403
- **Покрывает:** A2
- **Итог:** 5c73db2 миграция+jOOQ; 344fd83 делегированные учётные данные; tests/mcp-oauth.test.ts P05-P07 (скоуп, аудитория, cookie на API-хосте, SESSION_REQUIRED)
- **Модель:** strong

### S3. Сервер авторизации OAuth 2.1 и персональные токены [done]
- **Что:** Метаданные AS и PRM, DCR, authorize API для согласия, token (code, refresh с ротацией), revoke, подключённые приложения, персональные токены
- **Как:** identity/application OAuthServer, PersonalTokens; identity/api контроллеры; /api/oauth/* протокольные, /api/v1/* для интерфейса с Zod-контрактами
- **Зачем:** Claude и другие клиенты подключаются сами, люди управляют доступом
- **Приёмка:**
  - [x] HTTP-тесты: PKCE, redirect exact match, повтор кода и refresh отзывает грант, отзыв
- **Покрывает:** A3,A4
- **Итог:** 344fd83; tests/mcp-oauth.test.ts P01-P04, P06 зелёные (7/7); OAuthRulesTest
- **Модель:** strong

### S4. MCP-сервер [done]
- **Что:** POST /mcp Streamable HTTP stateless: initialize, ping, tools/list, tools/call; инструменты по списку
- **Как:** mcp/api транспорт JSON-RPC, mcp/application инструменты поверх application-слоёв задач, обсуждений, планирования, карт
- **Зачем:** Удалённый MCP для Claude
- **Приёмка:**
  - [x] HTTP-тесты инструментов, отказов по скоупу, Origin, версии протокола
- **Покрывает:** A1,A2
- **Итог:** 344fd83; P01 полный поток, McpToolSchemaTest
- **Модель:** strong

### S5. Интерфейс: согласие и настройки доступа [done]
- **Что:** Экран /oauth/authorize на iq-auth-screen, раздел настроек «Доступ приложений»: подключённые приложения и персональные токены
- **Как:** web/consent.js, web/api-access.js, settings-sections; продолжение после входа через sessionStorage
- **Зачем:** Человек видит, кому дал доступ, и отзывает его
- **Приёмка:**
  - [x] Проверено в браузере на локальном сервере
- **Покрывает:** A4
- **Итог:** 1fe4631; проверено в браузере на локальном стенде: экран согласия (тёмная тема, 1280px), раздел «Доступ приложений», создание токена
- **Модель:** strong

### S6. Лимиты, аудит, метрики, документация [done]
- **Что:** Окно запросов на учётные данные, аудит с client_id, метрики инструментов, operations.md, README
- **Как:** RequestLimitFilter, AuditTrail, RequestMetrics
- **Зачем:** Эксплуатация и расследование
- **Приёмка:**
  - [x] Тесты лимита; operations.md описывает переменные и подключение Claude
- **Покрывает:** A5
- **Итог:** 344fd83 лимиты/аудит/метрики; 0582896 operations.md и README
- **Модель:** fast

### S7. E2E, ручная проверка, ревью, гейты, PR [active]
- **Что:** E2E полного потока, ручная проверка официальным MCP SDK, независимое ревью и исправления, гейты, PR
- **Как:** tests/mcp-oauth.test.ts; scratch-скрипт на @modelcontextprotocol/sdk против локального сервера; subagent-ревью
- **Зачем:** Доказательство готовности
- **Приёмка:**
  - [ ] npm test, integration, verify-vnext зелёные; PR открыт
- **Покрывает:** A1,A6
- **Модель:** strong

## Решения

- **D1** (2026-09-29) MCP-транспорт свой (stateless Streamable HTTP 2025-11-25), не Java SDK 2.0.1 — SDK отдаёт клиенту и пишет в лог e.getMessage(), тянет Reactor; совместимость проверяем официальным TS SDK
- **D2** (2026-09-29) Протокольные эндпоинты OAuth в /api/oauth/* (форматы RFC, открытые метаданные DCR), интерфейсные — в /api/v1 с Zod-контрактами; authorize — страница интерфейса /oauth/authorize на sprintique.iqui.page
- **D3** (2026-09-29) Делегированный токен = права человека ∩ скоуп; операции безопасности (агенты, участники, одобрения, токены, пространство) только в интерактивной сессии — иначе токен выпускает себе замену или обходит одобрение человека

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
