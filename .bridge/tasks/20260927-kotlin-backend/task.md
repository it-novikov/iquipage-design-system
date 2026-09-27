---
bridge: 1
id: 20260927-kotlin-backend
title: Перенос бэкенда Sprintique на Kotlin и Spring Boot
status: active
risk: high
owner: it-novikov
holder: claude-opus-5-5
lease: 2026-09-28T01:23:26Z
branch: feature/kotlin-backend
base: feature/engineering-system
created: 2026-09-27
updated: 2026-09-27T21:23:26Z
links:
---

# Перенос бэкенда Sprintique на Kotlin и Spring Boot

## Цель

Бэкенд Sprintique написан на Node/Fastify (≈200 КБ TypeScript), а инженерная система закрепляет для всех проектов Kotlin/Spring. Нужно переписать бэкенд на базовый стек (Kotlin 2.3.21, JDK 25, Spring Boot 4.1, jOOQ, Flyway, OpenAPI 3.1) по новым правилам имён и архитектуры, **сохранив поведение HTTP API один в один**: интерфейс, тесты и данные продолжают работать без изменений. Результат: Kotlin-приложение и воркер в `products/sprintique/server`, существующий набор API-тестов проходит против него по HTTP, TypeScript-бэкенд удалён.

## Рамки

- **Входит:** все маршруты `/api/v1`, `/auth/*`, `/health`, `/ready`, `/internal/metrics`, статика; RLS и роли базы; идемпотентность, CAS, аудит и outbox; OIDC и dev-login; S3 и обработка изображений; воркер заданий; SSE; OpenAPI и Swagger UI; скрипты запуска, тестов и стенда; документация продукта.
- **Не входит:** новые функции продукта; изменения интерфейса; изменение схемы данных сверх перевода миграций в формат Flyway; выкладка.
- **Ограничения:** схема базы та же (перевод 001–020 без изменения SQL); контракт API не меняется; Docker только через явный контекст `colima-sprintique-vnext-qa`, VM по умолчанию не трогать; роль приложения без владения и BYPASSRLS; dev-login запрещён в production и вне loopback; секреты не в git.

## Передача

- **Состояние:** Каркас Gradle (Kotlin 2.3.21, Boot 4.1.1, ktlint, detekt) собирается; ADR продукта написан; миграции скопированы во Flyway без изменений (контрольные суммы сверены); слой базы, ошибки, JSON, заголовки.
- **Сейчас:** S2 — каркас, до ревью
- **Дальше:** После исправлений инженерной системы по R1/R2: учесть R2 F2 (инвентаризация тестов), F3 (внешние имена сохраняются), F9 (Konsist), F12 (без Docker — тестовый стенд), F13 (dev-login вне production-артефакта)
- **Незакоммичено:** 5 файл(ов): .bridge/tasks/20260927-kotlin-backend/journal.md, .bridge/tasks/20260927-kotlin-backend/task.md, .impeccable/, products/sprintique/docs/decisions/, products/sprintique/server/ (2 files changed, 12 insertions(+), 8 deletions(-))
- **Ловушки:**
  - pg_ctl и тесты падают без `LC_ALL=C LANG=C`.
  - Docker-контекст по умолчанию (colima default) сломан; рабочий — `colima-sprintique-vnext-qa` (сокет ~/.colima/sprintique-vnext-qa/docker.sock). Правило продукта запрещает перезапускать VM по умолчанию.
  - Кластеры PostgreSQL для тестов создаёт scripts/test.mjs (только `sprintique-test-*`, есть guard). Homebrew postgresql@16 и кластер Codex на порту 4391 не трогать.
  - Фронтенд импортирует zod-контракты из `contracts/` — их не удалять.
  - Spring Boot 4: автоконфигурации в пакетах org.springframework.boot.<модуль>.autoconfigure
  - Имена переменных окружения задаются явно в application.yaml; relaxed binding даёт SPRINTIQUE_DATABASE_RUNTIMEROLE
- **Проверка:** `cd products/sprintique/server && ./gradlew check` и `LC_ALL=C LANG=C TEST_S3_CONFIG=$PWD/output/infra/storage.json SPRINTIQUE_BACKEND=kotlin npm test`

## План

### S1. Проработка и ADR продукта [active]
- **Что:** ADR «Перенос бэкенда на Kotlin»: подход, соответствие модулей, переменные окружения, миграции, генерация jOOQ, изображения, тестовая стратегия.
- **Как:** Перенос с проверкой паритета: API-тесты «чёрным ящиком» по HTTP против обоих бэкендов. Ответы на чек-лист проработки из workflow.md.
- **Зачем:** Риск high: меняется реализация всего контракта.
- **Приёмка:**
  - [ ] ADR в products/sprintique/docs/decisions/ со статусом accepted
  - [ ] Таблица соответствия маршрутов и модулей Kotlin
- **Модель:** strong

### S2. Каркас Gradle-проекта [todo]
- **Что:** `server/` с Gradle 9.6.1 wrapper, version catalog, lock-файлами, ktlint, Detekt, Konsist, Spring Boot-приложением, `/health`.
- **Как:** Пакет `com.sprintique`; модули по возможностям; `qualityCheck` и pre-commit по правилам code-quality.md.
- **Зачем:** Основа, на которой проверяется каждый следующий шаг.
- **Приёмка:**
  - [ ] `./gradlew check` проходит
  - [ ] Архитектурный тест слоёв проходит
- **Модель:** strong

### S3. Схема, jOOQ, интеграционные тесты [todo]
- **Что:** Миграции 001–020 в формате Flyway с плейсхолдерами ролей, выдача прав, проверка схемы при старте, сгенерированный jOOQ, база для Testcontainers.
- **Как:** SQL без изменений; генерация jOOQ из поднятой схемы в `src/generated`, тест расхождения; Testcontainers через явный DOCKER_HOST.
- **Зачем:** Та же схема данных — условие паритета.
- **Приёмка:**
  - [ ] Миграции применяются к пустой базе, права совпадают со старым migrate.ts
  - [ ] Тест расхождения jOOQ со схемой проходит
- **Модель:** strong

### S4. Сквозные механизмы [todo]
- **Что:** Транзакции с RLS-контекстом, проверка ролей, ошибки `{code,message,requestId}`, заголовки безопасности, лимиты, метрики и логи, статика.
- **Как:** Явный `DatabaseTransactions` поверх DataSource (без @Transactional), `ProblemException` + обработчик, фильтры Spring.
- **Зачем:** Всё остальное строится на этих механизмах.
- **Приёмка:**
  - [ ] Тесты: контекст RLS не утекает между соединениями пула
  - [ ] Небезопасная роль базы не даёт запуститься

### S5. Идентичность [todo]
- **Что:** Cookie-сессия и токены агентов, CSRF, `/api/v1/session`, выход, dev-login, OIDC code+PKCE, выпуск и отзыв агентов.
- **Как:** Spring Security без сессий сервлета, свой фильтр учётных данных; OIDC через Nimbus за `IdentityProviderPort`.
- **Зачем:** Вход и права — основа безопасности.
- **Приёмка:**
  - [ ] API-тесты dev-login, CSRF и сессий проходят против Kotlin
  - [ ] Проверка локального OIDC (`check-local-oidc`) проходит

### S6. Пространства, проекты, участники [todo]
- **Что:** Пространства, проекты, профили, участники, приглашения, аватары людей и проектов.
- **Как:** Порт из application/workspace, membership, project-profile.
- **Зачем:** Паритет раздела настроек.
- **Приёмка:**
  - [ ] workspace, membership и project-profile тесты проходят против Kotlin

### S7. Задачи, каталоги, обсуждения [todo]
- **Что:** Задачи и позиция, журнал идемпотентности, аудит и outbox, теги, релизы, шаблоны, обсуждения.
- **Как:** Модули `task`, `catalog`, `discussion`, общий `command` для идемпотентности.
- **Зачем:** Основной сценарий доски.
- **Приёмка:**
  - [ ] api, platform-completion и security-r4 тесты по задачам и обсуждениям проходят

### S8. Планирование [todo]
- **Что:** Предметная модель планирования, превью, коммиты, одобрения, представления.
- **Как:** Чистый Kotlin-домен с модульными тестами по сценариям planning.test.ts.
- **Зачем:** Самая сложная предметная логика.
- **Приёмка:**
  - [ ] planning и planning-view тесты проходят против Kotlin
  - [ ] Модульные тесты домена планирования
- **Модель:** strong

### S9. Карты [todo]
- **Что:** Карты, версии, шаблоны, сессии, голосования, таймер.
- **Как:** Порт application/maps.
- **Зачем:** Паритет раздела карт.
- **Приёмка:**
  - [ ] maps тесты проходят против Kotlin

### S10. Файлы и воркер [todo]
- **Что:** S3-адаптер, проверка и перекодирование изображений, вложения и обложки, воркер очистки, операции.
- **Как:** AWS SDK v2, ImageIO + TwelveMonkeys + webp-imageio, ограничение пикселей, времени и параллельности; воркер — отдельный процесс того же артефакта с ролью worker.
- **Зачем:** Паритет файлов и безопасность загрузок.
- **Приёмка:**
  - [ ] media, media-locks, jobs и operations тесты проходят с настоящим S3

### S11. События и агенты [todo]
- **Что:** SSE событий проекта, запуски агентов, контекст агента, одобрения.
- **Как:** Порт application/events и agent-runs.
- **Зачем:** Паритет агентов и живых обновлений.
- **Приёмка:**
  - [ ] event-bootstrap и agent-runs тесты проходят

### S12. OpenAPI и Swagger UI [todo]
- **Что:** OpenAPI 3.1 из кода, Swagger UI, `/api/v1/contracts`, тест расхождения.
- **Как:** springdoc; зафиксированный документ в репозитории.
- **Зачем:** Контракт виден и проверяется.
- **Приёмка:**
  - [ ] Тест расхождения OpenAPI проходит

### S13. Переключение и удаление TypeScript-бэкенда [todo]
- **Что:** Скрипты тестов, стенда и контейнера на Kotlin; API-тесты по HTTP; удаление backend/; обновление README и operations.
- **Как:** Шим `inject` поверх fetch в tests/fixture; сборка образа через Jib.
- **Зачем:** Один бэкенд, без двух путей.
- **Приёмка:**
  - [ ] `npm test` зелёный против Kotlin, пропусков нет
  - [ ] Стенд `dev:local` работает, интерфейс проверен в браузере
  - [ ] Полный гейт verify-vnext проходит

### S14. Ревью 1 и исправления [todo]
- **Что:** Два параллельных ревью: безопасность и данные; корректность и простота.
- **Как:** `bridge review`, ревьюеры с чистым контекстом.
- **Зачем:** Процесс high.
- **Приёмка:**
  - [ ] P0/P1 закрыты, P2 решены

### S15. Ревью 2 и PR [todo]
- **Что:** Повторное ревью исправлений, release gate, PR.
- **Как:** Другой ревьюер, фокус на расхождениях кода, базы, OpenAPI и документов.
- **Зачем:** Процесс high.
- **Приёмка:**
  - [ ] Вердикт approve
  - [ ] PR открыт

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- `products/sprintique/README.md` — продукт, запуск, стенд
- `products/sprintique/AGENTS.md` — границы продукта
- `products/sprintique/backend/` — исходный бэкенд для переноса
- `products/sprintique/tests/` — API-тесты, которые должны пройти против Kotlin
- `engineering/architecture.md`, `engineering/conventions/naming.md` — правила
