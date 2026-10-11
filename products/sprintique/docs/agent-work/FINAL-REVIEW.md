# SPR-14: независимое финальное ревью 2

2026-10-11. Reviewer2, отдельная сессия, исходники read-only. Проверен исправленный локальный diff `feat/spr-14-agent-work` относительно `9543147`, включая незакоммиченные новые файлы. Основой служат AGENTS.md, engineering/workflow.md, engineering/review.md и approved SPR-14 scope. Применён targeted code audit по проектному iquipage-review; браузерная приёмка принадлежит отдельному исполнителю.

## Замечания и повторная проверка

- **R2-F1 [P1]** `server/src/main/kotlin/com/sprintique/access/api/AccessRequests.kt:20` — wire enum не принимал новое `work.write`; списки DTO также ограничивались прежними 14 правами. Полный полученный каталог при сохранении давал 400 вместо применения либо проверки полномочий. Та же граница была в `identity/api/DelegatedAccessController.kt`. **Решение: fixed.** Enum и все восемь ограничений согласованы с 15 проектными правами. Отдельно проверен новый `GrantedCapability.WORK_WRITE` и максимум 7 в AgentGrantController. Регрессия выполняет Create/Put полного пресета, явный service grant и полный agent grant; превышение прав по полному каталогу остаётся 403. Финальные HTTP проверки прав — 21/21 PASS.
- **R2-F2 [P2]** `server/src/main/kotlin/com/sprintique/work/application/WorkCard.kt:108` и экспорт вопросов — generated card всегда называла план draft и вопрос open, включая активный план и ответ человека. **Решение: fixed.** Экспорт передаёт действительное состояние с mapping waiting→blocked, grammar Qn/open/answered и сохранённым ответом. Прочитана регрессия WorkCardTest и сверены regex локального bridge.

Открытых P0/P1/P2 в проверенном коде нет.

## Проверено

Проверены work application/API, typed MCP и контракты; текущие права actor/initiator, project-before-resource fence, CAS, lease token, завершение поручений и повтор команды с исходной applied revision. GET не раскрывает lease token. Сервисный аккаунт не принимает собственные результаты и не изменяет действующие человеческие рамки; изменение результата снимает прежнее одобрение. Точные критерии и evidence входят в approval digest.

Проверены V20261011000077 и afterMigrate: runtime остаётся non-owner/NOBYPASSRLS, lifecycle без actor ограничен владельцем таблицы и временным scope проекта запуска; session/event/audit/outbox атомарны, UUID audit/outbox согласованы. Источник повторного обращения связан с session только для исходного сообщения; позднее обращение не становится handled от завершения запуска, который его не читал. Просмотрены AgentRunner/Prompt/Mentions, WorkParticipation и pinned skills; конкретное поручение и выбранное обсуждение передаются как недоверенные данные.

Проверены исправления integration gate: точные expectations нового work.write; finance rollback удаляет только собственные миграции 72–76 и сохраняет независимые work schema/ledger 77; обновлённые jOOQ work tables/records, FK/index/reference и WorkLifecycle соответствуют миграции. Проверена новая полнота source-inputs для Kotlin, Gradle, TOML, properties и wrapper scripts вместе с регрессией changed-input detection.

Клиентский pass охватывает public DS .39 imports, отдельные native task/work tabs, сохранённый DOM черновика задачи, optional /work route/copy, linked thread, revision snapshot открытых форм, повторные ACK/reload, lease cleanup и историю без принудительной смены фокуса. Bridge pass охватывает raw-card сохранность, unknown sections, CAS refusal, pending idempotency key после потери ответа и повтор push --create.

Прочитаны raw логи: `/tmp/sprintique-work-http6.log` — 30/30 PASS; финальный `/tmp/spr14-integration-fixes3.log` — 33/33 PASS; `/tmp/spr14-wire-rights-final.log` — 21/21 PASS; `/tmp/spr14-fallback-final2.log` — 39/39 PASS. Тесты/сборки в этой reviewer-сессии не запускались параллельно gate. Ранний `/tmp/spr14-fullgate.log` FAILED сохраняется как история выявленных integration несовпадений и не используется как PASS.

## Follow-up после detached gate

В `/tmp/spr14-fullgate2.log` основной продукт прошёл проверки, но detached product test обнаружил приватный dynamic import `../../../engineering/bridge/src/card.mjs` из `tests/work.test.ts`. Проверен итоговый тест после исправления: приватная зависимость удалена, grammar answered question/decision проверяется на реальном HTTP GET; PUT той же карточки и повторный GET сохраняют точный текст, увеличивают revision на один и сохраняют ответ, решение и исходный threadId. Проверка не пропущена, область extraction не расширена. Product application code этим исправлением не менялся. Прочитан свежий `/tmp/spr14-product-roundtrip.log`: **5/5 PASS**, включая действительный GET→PUT→GET и дальнейший второй вопрос. Code verdict сохраняется; fullgate2 не считается полным PASS, окончательный immutable gate3 остаётся release gate.

## Follow-up после CI source stability

Прочитан `/tmp/spr14-ci-final.log`: product-build, product-tests и detached-product PASS; source-stability FAIL и последующая загрузка artifacts отвергнута из-за квоты аккаунта. Этот запуск не считается CI PASS. Проверен узкий исправленный diff: source-inputs исключает только добавленные generated cache dirs `.gradle`/`.kotlin`; обычные `.kt`, `.kts`, `.toml`, `.properties` и wrapper scripts по-прежнему входят в fingerprint. Регрессия создаёт отсутствовавшие cache files и меняет их, затем отдельно подтверждает обнаружение изменения настоящего Work.kt. Drift теперь печатается точными путями; verification JSON и stability log выводятся в CI job log. `continue-on-error` добавлен исключительно к upload-artifact: тесты, сборка, source-stability и portable image остаются обязательными. Артефакты не удалялись. **Approve по этому исправлению, новых P0/P1 нет.** Свежие immutable gate4 и новый CI остаются release gates.

## Итог

- **Вердикт: approve по исправленному коду; открытых P0/P1 нет.**
- Финальное неизменяемое fullgate, browser acceptance итогового стенда, реальные внешние клиенты OAuth и production release/наблюдение остаются самостоятельными обязательными gates. Это ревью не подтверждает их прохождение и не заменяет разрешение владельца.
- Исправлялся только этот отчёт; commit/push/deploy reviewer2 не выполнял.
