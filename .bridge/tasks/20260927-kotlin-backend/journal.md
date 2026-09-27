# Журнал 20260927-kotlin-backend

- 2026-09-27T21:08:20Z · claude-opus-5-5 · create · - · Перенос бэкенда Sprintique на Kotlin и Spring Boot
- 2026-09-27T21:10:53Z · claude-opus-5-5 · claim · - · взял задачу
- 2026-09-27T21:10:53Z · claude-opus-5-5 · step · S1 · active
- 2026-09-27T21:10:53Z · claude-opus-5-5 · checkpoint · S1 · дальше: Дописать ADR переноса и таблицу соответствия маршрутов
- 2026-09-27T21:23:26Z · claude-opus-5-5 · checkpoint · S2 · дальше: После исправлений инженерной системы по R1/R2: учесть R2 F2 (инвентаризация тестов), F3 (внешние имена сохраняются), F9 (Konsist), F12 (без Docker — тестовый стенд), F13 (dev-login вне production-артефакта)
- 2026-09-27T21:42:05Z · claude-opus-5-5 · claim · - · взял задачу
- 2026-09-27T21:44:33Z · claude-opus-5-5 · step · S2 · done: коммит 10979ad; ./gradlew check: ktlint, detekt, ArchUnit (4 правила), verifyProductionArtifact
- 2026-09-27T21:44:33Z · claude-opus-5-5 · step · S3 · active
- 2026-09-27T21:44:33Z · claude-opus-5-5 · checkpoint · S3 · дальше: scripts/test.mjs: режим SPRINTIQUE_BACKEND=kotlin — миграции командой migrate, integrationTest с SPRINTIQUE_TEST_*; сравнить права с migrate.ts
- 2026-09-27T21:48:50Z · claude-opus-5-5 · checkpoint · S3 · дальше: Решить про jOOQ-кодогенерацию: JooqCodegen в integrationTest + режим --jooq в test.mjs; затем S4
- 2026-09-27T21:55:22Z · claude-opus-5-5 · step · S3 · done: коммит b98e30d; Flyway = migrate.ts (418 операторов); JooqSchemaDriftIntegrationTest + 5 тестов базы зелёные
- 2026-09-27T21:55:22Z · claude-opus-5-5 · step · S4 · active
- 2026-09-27T21:59:22Z · claude-opus-5-5 · step · S4 · done: коммит 1d3905a; integrationTest 7/7 (контекст не утекает, владелец не стартует); дымовой прогон: health, ready 503 без базы, статика 200/304, метрики, 413
- 2026-09-27T21:59:22Z · claude-opus-5-5 · step · S5 · active
- 2026-09-27T21:59:22Z · claude-opus-5-5 · checkpoint · S5 · дальше: ObjectStoragePort + S3-адаптер (AWS SDK v2), FileInspection (сигнатуры), ImageProcessing (TwelveMonkeys чтение, webp-imageio запись, EXIF, лимиты, таймаут 10 с)
