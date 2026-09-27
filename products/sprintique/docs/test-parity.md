# Паритет тестов при переносе бэкенда на Kotlin

Мерило переноса — все сценарии текущих тестов. Ни один сценарий не удаляется молча: у каждого есть новое место, и в конце переноса эта таблица сверяется с тестами построчно.

## Как тесты получают бэкенд

- `tests/fixture.ts` больше не импортирует код бэкенда. Фикстура запускает Kotlin-сервер (`server/build/libs/sprintique-server-local.jar`) с нужными параметрами, ждёт `/health` и отдаёт `app.inject()`, который отправляет запрос по HTTP. Форма ответа прежняя: `statusCode`, `headers`, `body`, `json()`.
- Параметры, которые раньше передавались в `createApp`, становятся переменными окружения сервера:

  | `createApp` | Переменная окружения |
  |---|---|
  | `devLogin` | `SPRINTIQUE_DEV_LOGIN` |
  | `metricsToken` | `SPRINTIQUE_METRICS_TOKEN` |
  | `web` | `SPRINTIQUE_WEB_ROOT` |
  | `storage` | `SPRINTIQUE_STORAGE_*` |
  | `origin` | `SPRINTIQUE_PUBLIC_ORIGIN` |
  | `NODE_ENV=production` | `SPRINTIQUE_ENVIRONMENT=production` |

  Вариант «другой сервер» (`createApp` внутри теста) запускается как второй процесс.
- Проверки RLS, которые обращались к базе через TS-класс `Database`, используют тестовый помощник `tests/support/runtime-database.ts`. Он делает то же самое на `pg`: транзакция, `set_config`, запрос. Эти проверки проверяют политики базы и не зависят от языка бэкенда.
- Сценарии, которым нужно вмешаться внутрь процесса, переносятся в интеграционные тесты Kotlin с фейками портов. Таких сценариев три вида: хранилище, которое падает или задерживает ответ, гонка под блокировкой, отзыв прав во время ожидания.

## Файлы

| Файл | Тестов | Сейчас | После переноса |
|---|---:|---|---|
| agent-runs | 5 | HTTP | HTTP без изменений |
| event-bootstrap | 3 | HTTP, OpenAPI | HTTP; имя схемы `EventHeadResponse` сохраняется |
| load | 1 | HTTP | HTTP |
| maps | 5 | HTTP | HTTP |
| membership | 5 | HTTP | HTTP |
| planning-view | 11 | HTTP | HTTP |
| platform-completion | 11 | HTTP | HTTP |
| project-profile | 3 | HTTP | HTTP |
| workspace | 5 | HTTP | HTTP |
| api | 20 | HTTP; `Database` для RLS; `createApp` для вариантов без OIDC, с фейковым OIDC и с недоступной базой | HTTP. RLS — через помощник. Варианты сервера — отдельные процессы (`startApp`). OIDC — синтетический провайдер по HTTPS на loopback (`tests/support/fake-oidc-provider.ts`): одноразовый CA, которому доверяет только сервер под тестом через `SPRINTIQUE_OIDC_TRUST_FILE`. Роль владельца базы — сервер с ней не запускается |
| dev-login | 4 | `createApp`, `NODE_ENV` | HTTP против серверов с `SPRINTIQUE_DEV_LOGIN` и без. Отказ в production и на не-loopback адресе — запуск сервера с этими настройками завершается ошибкой. Отсутствие маршрута в production-артефакте — задача Gradle `verifyProductionArtifact` |
| operations | 5 | `createApp` с токеном метрик; правка `public.schema_migrations` | HTTP против сервера с `SPRINTIQUE_METRICS_TOKEN`. Проверка несовпадения схемы правит `flyway_schema_history` |
| planning | 23 | HTTP; `Database`; `createApp`; `canonical`; `planChange` напрямую | HTTP. Прямые вызовы домена планирования — Kotlin `PlanningChangeTest` с теми же сценариями. `canonical` — Kotlin `CanonicalJsonTest` |
| security-r4 | 9 | HTTP; `createApp`; `discussions` напрямую; фейковое хранилище | HTTP. SEC-03 (отзыв прав, пока запись ждёт блокировку проекта) — запрос по HTTP, ожидание видно в `pg_stat_activity`. SEC-07 и SEC-08 — отдельные серверы (`startApp`, синтетический OIDC по HTTPS). SEC-05 (общая проверка готовности) — Kotlin `ReadinessControllerTest` |
| static-http | 1 | `createApp` + `serveWeb` | HTTP против сервера с `SPRINTIQUE_WEB_ROOT` |
| media | 6 | HTTP; `application/media`; хранилище S3 | HTTP с настоящим S3. Прямые вызовы — Kotlin `MediaIntegrationTest` |
| media-locks | 2 | use case напрямую, медленное хранилище | Kotlin `MediaLockIntegrationTest` с фейком хранилища, который задерживает запись |
| jobs | 3 | `JobQueue` напрямую, S3 | Kotlin `AssetCleanupWorkerIntegrationTest` с настоящим S3 |
| backend-audit | 4 | HTTP; прямые `pageThreads`, `rows`, `validateTaskHierarchy` | HTTP. Прямые вызовы — Kotlin `DiscussionPageIntegrationTest` (число запросов страницы), `PlanningRowsIntegrationTest`, `TaskRulesTest` |
| appearance, frontend-lifecycle, planning-controller, planning-operation, runner | 57 | фронтенд и скрипты | без изменений |

## Где берётся база

Kotlin-тесты делятся на два набора:

- `./gradlew test` — модульные тесты без базы.
- `./gradlew integrationTest` — тесты с настоящим PostgreSQL. Базу даёт тот же изолированный кластер, что и API-тестам: `scripts/test.mjs` создаёт его (только Unix-сокет, отдельные роли), применяет миграции Kotlin-командой `migrate` и передаёт адреса в переменных `SPRINTIQUE_TEST_*`. Без этих переменных `integrationTest` падает сразу, не пытаясь найти Docker. Правило «не трогать Docker VM по умолчанию» соблюдается без исключений.
