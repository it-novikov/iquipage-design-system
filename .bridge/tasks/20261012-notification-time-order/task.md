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
updated: 2026-10-12T07:41:15Z
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

- **Состояние:** Code/test review complete: independent R2 approve, F1/F2 fixed in 9943d62a = published fedf04cb by tree. PR78 branch review waiting for real CI; A1-A3 and full PASS remain open.
- **Сейчас:** S2 — candidate and independent code review complete; strict build/backend CI pending
- **Дальше:** Root publishes this last documentation checkpoint, then inspects the matching completed NT05 diagnostic, certificate and full backend/extraction gate; no further docs-only publication before CI results.
- **Незакоммичено:** Bridge review/evidence/card/journal only; products/sprintique/tests/notifications.test.ts unchanged from fedf04cb.
- **Рабочая копия:** нет · HEAD fedf04cb · снято 2026-10-12T07:41:15Z
- **Ловушки:**
  - Global dan already has NT02 notification; never assert a fixed total against that shared recipient.
  - Docker test runner does not honor --only; default local runner does. Do not advertise a focused Docker command that still silently runs all tests.
  - No local JDK25/PG18: real backend NOT RUN until GitHub CI.
  - Official typecheck cannot start locally: TypeScript-Go readlink /proc/self/exe missing. Node syntax PASS is not typecheck PASS.
  - R1 original stays immutable; R2 independently closed F1/F2 for code/test only. Actual serializer evidence, A1–A3 and full readiness remain open.
  - This is the final documentation checkpoint before CI results; do not publish additional docs-only changes that supersede the long run.
- **Проверка:** Docs-only: bridge check and git diff --check PASS; R1/R2 archived bytes/digests and reviewed/published parent/tree aliases PASS; test/runtime source unchanged. Native build/backend not rerun; A1-A3 and real CI pending.
- **Причина:** planned — gpt-6-astra-notification-order, 2026-10-12T07:41:15Z, передано root: Independent R2 original and canonical index preserved; F1/F2 resolutions link the separate scoped approve on 9943d62a = fedf04cb by tree. Publish this final docs checkpoint, then wait for matching real CI/NT05 evidence. Code review done; A1-A3/full readiness open. No further docs-only publication before CI results; writer released.

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
- **D3** (2026-10-12) Independent R2 approves scoped code/test on 9943d62a (published fedf04cb, identical tree); close F1/F2 in the canonical R1 only, preserve both original reports. A1-A3 and full readiness remain pending actual CI.

## Вопросы

Пока нет.

## Контекст

- Failure: https://github.com/it-novikov/iquipage-design-system/actions/runs/38212609809/job/114690036607 ; artifact 11730566938 SHA256 01f4e920548357ba713cd6d82e4c41d37d7684259078d14c0ba9fa27309d4ba9.
- Tests: products/sprintique/tests/notifications.test.ts; immutable baseline f5f941afa4e9be8a709e6de67a92bacf5a9397ca.
- Source contract: Notifications.kt page ORDER BY created_at DESC,id DESC and Instant.toString; read-all uses exact timestamptz cutoff.
- PR78: https://github.com/it-novikov/iquipage-design-system/pull/78 ; reviewed local 9943d62a6036f5052a13dbedb0713204d9407e59 = published fedf04cb8e4c443b2e4567fb473a1f600868f2bc by tree 4cea6e5c7bbbcf24b9284fa2516dcf8dca3ba709. R2 code/test approve only; initial CI 38218385123 has no completed evidence recorded here.
- Plan and validation evidence: evidence.md beside this card. Scratch investigation: research/continuation/nt05/.
- User explicitly lifted PR quota; the separate rules change is root-owned. No local rules/cap edits are part of this test correction.
