---
bridge: 1
id: 20261012-notification-time-order
title: "NT05: deterministic precise notification order verification"
status: active
risk: standard
owner: it-novikov
branch: test/notification-time-order
base: f5f941afa4e9be8a709e6de67a92bacf5a9397ca
created: 2026-10-12
updated: 2026-10-12T07:31:02Z
links:
---

# NT05: deterministic precise notification order verification

## Цель

PR76 full CI 38212609809 завершился с 566 PASS / 1 FAIL: NT05 сравнивает строки createdAt и отвергает порядок уведомлений. SQL уже сортирует по timestamp DESC, id DESC; failing pair в логе не сохранена, поэтому изменение пользовательской сортировки не обосновано. Нужна детерминированная проверка реального HTTP/DB-контракта, которая различает микросекунды, равные timestamps и границу страницы, не зависит от часов и сохраняет проверку прав и действий чтения.

## Рамки

- **Входит:** test-only NT05 fixture/oracle; воспроизводимое свидетельство исходного строкового predicate на реальном сериализованном API-ответе; диагностические материалы и bridge.
- **Не входит:** production SQL/commands/serializer, публичные contracts, DS/vendor, manifests, workflow, merge/deploy/rerun/cancel.
- **Ограничения:** отдельный synthetic recipient сохраняет global dan из NT02; реальные PostgreSQL/Kotlin проверки обязательны. Local JDK25/PG18 недоступны: статические результаты не заменяют CI. Root публикует remote; автор работает только в этом worktree.

## Приёмка

- [ ] A1. Real ephemeral Kotlin/PostgreSQL API provides a deterministic counterexample: original string predicate false while expected timestamp/id order is correct; evidence records exact serialized values.
- [ ] A2. NT05 verifies 20/5 exact ID pages, microsecond order, equal-time id tie across cursor, unread/read-by-id/read-all-before, cross-user and database permission behavior without clock-dependent state.
- [ ] A3. Applicable build and full real-backend/extraction gates plus independent review pass on the published candidate; scope remains tests and bridge only.

## Передача

- **Состояние:** R1 changes-requested preserved verbatim and indexed. F1/F2 test-only corrections implemented; independent R2 and actual CI pending.
- **Сейчас:** S2 — freeze corrected test candidate for R2 and root publication
- **Дальше:** Independent reviewer checks new frozen diff; root opens PR and inspects real NT05/certificate evidence.
- **Незакоммичено:** NT05 correction and bridge/evidence/review files only.
- **Рабочая копия:** 1 файл(ов): products/sprintique/tests/notifications.test.ts (4 files changed, 28 insertions(+), 13 deletions(-)) · HEAD 44954a33 · снято 2026-10-12T07:31:02Z
- **Ловушки:**
  - Global dan already has NT02 notification; never assert a fixed total against that shared recipient.
  - Docker test runner does not honor --only; default local runner does. Do not advertise a focused Docker command that still silently runs all tests.
  - No local JDK25/PG18: real backend NOT RUN until GitHub CI.
  - Official typecheck cannot start locally: TypeScript-Go readlink /proc/self/exe missing. Node syntax PASS is not typecheck PASS.
  - Original R1 decisions remain open historically; author implementation is not independent closure. R2 and real backend still required.
- **Проверка:** Post-R1 Node syntax, boundaries/styles, diff whitespace and integer countermodel PASS; native /proc-blocked build deliberately not repeated; backend NOT RUN.
- **Причина:** planned — gpt-6-astra-notification-order, 2026-10-12T07:31:02Z, передано root: R1 F1/F2 corrected in NT05; original review preserved and canonical index added. Publish frozen correction and request R2; actual CI/acceptance still pending.

## План

### S1. Зафиксировать причину и контрмодель [done]
- **Что:** Сверить CI assertion, точный serializer/SQL и fixture isolation.
- **Как:** Прочитать actual source и raw evidence; задать anti-correlated ids и microsecond timestamps.
- **Зачем:** Не менять production порядок без доказательства.
- **Приёмка:**
  - [x] Есть короткий problem-first brief и проверяемая модель с границей A1 pending runtime.
- **Покрывает:** A1
- **Итог:** CI38212609809 failure and immutable SQL/serializer read; isolated 25-row countermodel with inverted microsecond/id order and equal-time 20/5 boundary specified. Runtime A1 remains pending.
- **Модель:** strong

### S2. Подготовить test-only кандидат [active]
- **Что:** Детерминированная fixture и точная проверка ID на двух страницах.
- **Как:** Реальный admin fixture setup, прежние HTTP operations и permission assertions; scoped static checks.
- **Зачем:** Усилить NT05 без общего date framework и потери точности.
- **Приёмка:**
  - [ ] Diff узкий, strict build/доступные проверки выполнены, runtime ограничения названы.
- **Покрывает:** A2
- **Зависит от:** S1
- **Модель:** strong

### S3. Подтвердить на CI и независимом ревью [todo]
- **Что:** Записать actual original-predicate counterexample, full gates и review.
- **Как:** Root публикует immutable candidate; изучить raw CI artifacts и исправить только подтверждённое.
- **Зачем:** Static green не доказывает serializer, SQL, cursor и real services.
- **Приёмка:**
  - [ ] CI и reviewer подтверждают A1/A2; нет открытых blocking findings.
- **Покрывает:** A1,A2,A3
- **Зависит от:** S2
- **Модель:** strong

## Решения

- **D1** (2026-10-12) Fixture with expected IDs, not a general date comparator: SQL order can be verified without parsing away microseconds; an equal-timestamp group crosses the page boundary.
- **D2** (2026-10-12) R1 F1/F2 accepted: cursor tie carries 1us; read-by-id targets ordinal 3 so the inclusive cutoff remains unread until read-all. Exact ID expectations and old-predicate diagnostic remain unchanged.

## Вопросы

Пока нет.

## Контекст

- Failure: https://github.com/it-novikov/iquipage-design-system/actions/runs/38212609809/job/114690036607 ; artifact 11730566938 SHA256 01f4e920548357ba713cd6d82e4c41d37d7684259078d14c0ba9fa27309d4ba9.
- Tests: products/sprintique/tests/notifications.test.ts; immutable baseline f5f941afa4e9be8a709e6de67a92bacf5a9397ca.
- Source contract: Notifications.kt page ORDER BY created_at DESC,id DESC and Instant.toString; read-all uses exact timestamptz cutoff.
- Plan and validation evidence: evidence.md beside this card. Scratch investigation: research/continuation/nt05/.
- User explicitly lifted PR quota; the separate rules change is root-owned. No local rules/cap edits are part of this test correction.
