# Backend handoff — UX R3, совместная команда

Контекст: новая платформа с чистым стартом, не поддержка старого Sprintique. Репозиторий UI `it-novikov/iquipage-design-system`, ветка `feature/vnext-planning-ui`, PR #3. Этот документ — требования потребителя, не ещё одна OpenAPI/DDL-схема. Названия operation IDs и транспорт выбирает владелец backend.

## 1. Одна задача во всех представлениях
Planning, board, map, timeline, calendar, search и agent work ссылаются на taskId/projectId/revision. Полный документ один: Markdown, файлы/обложка, именованные чек-листы, треды, связи, история. Map externalTaskId — ссылка, а не независимые title/owner/status. Кэш подписывается revision и обновляется по разрешённому событию; запрет доступа не должен оставлять старую приватную копию.
Одно изменение поля должно быть возможно без повторного отправления всего документа. `PlanningRow` теперь допускает `ownerId` и `dueValue` для прямой правки. `ownerId` — непрозрачный principal ID, не displayName. Reference fixture использует старую строку owner только для изолированных UX-тестов. Реальный SDK обязан преобразовать на канонический assigneeId.
Сервер проверяет переходы статусов, подготовленность, outcome и допуск к работе отдельно. Ни один UI не может объявить completed-run готовой задачей. Ошибки CAS и uncertain receipt общие; второй UI не создаёт собственный обход сохранения.

## 2. Пространство и проект
Публичный `@sprintique/planning-ui/navigation` получает разрешённые контексты через provider. UI не создаёт membership и не определяет ACL по имени. Смена контекста отменяет reads/подписки предыдущего scope, но не повторяет неопределённый commit. Open task draft блокирует переключение до решения пользователя.
Нужны permission-filtered запросы workspace/project membership, доступные действия, профиль человека, реальные logout/session expiry. Потеря доступа удаляет данные старого проекта из projections/search/cache. Общий план «Все проекты» ограничен одним пространством и не раскрывает hidden names/counts.

## 3. Релизы и Сроки
Существующая потребительская модель: release flexible/timeboxed, draft/ready task, parent inheritance/explicit assignment/explicit none. Не поддерживать двойные сущности Sprint и Release для одного пакета. Запуск не сбрасывает статусы; закрытие явно принимает результаты и переносит незавершённое. Accepted child остаётся в завершённом релизе при переносе открытого parent.
`Сроки` — интерфейс Гант/Календарь, не сущность. start/end, deadline, date-only/timezone сохраняют разные смыслы. Single-day event может остаться milestone внутренним типом. Отдельная новая сущность под слово «Сроки» не нужна.
Для квартального плана: saved view scope/projects/filter/granularity/horizon и coarse period с precision. Не преобразовывать Q2 в жёсткий deadline 30 июня. До согласованной схемы UI не будет делать фиктивные precise writes. Поддержка Goals — отдельное подтверждённое исследованием решение, не необходимость первого релиза.

## 4. Участник-агент
Использовать существующий Principal.kind=agent, Membership, grants и mandate. Агент может быть primary assignee, а не обязательным delegate человеческого assignee. Sponsor/admin, initiator, actor и approver отдельно. AgentProfile содержит обязанности, версии инструкций, опциональный стиль, разрешённые context sources и execution connection reference; не секрет.
Команды: create/update/pause agent profile; assign task; start/stop run; answer question; propose/accept/reject result; propose/accept/forget memory entry. Одинаковый policy/use-case слой HTTP/worker/будущего MCP. Prompt/персона не полномочия.
Контекст включает manifests task/source/version, оценку размера и исключённое. Хранилище памяти участника отделено от истории конкретной SDK Session. Revoke/forget удаляет доступ из текущей сборки контекста и кэша. Исторический audit не выдаётся заново неавторизованному агенту.
LLM connector: capability catalog, server secret reference, allowlisted provider/models/region, budgets, usage. Runner connector: отдельный repo checkout, scoped credentials, quotas, approved tools/network, artifacts, signed callbacks. Plain model endpoint не считается средой разработки. Первый pilot выбирает одну модель/runner по eval, без автоматического подключения обоих стеков.

## 5. Поручение, деньги, результат
Назначение ставит задачу в очередь. По умолчанию отдельное Начать; auto-start-ready только после включения администратором с budget/scope. Mention, импорт, открытие карточки и геометрия карты не запускают платный вызов.
Один task имеет несколько исторических runs, но один подтверждённый исполнитель текущего поручения. Leases/version fences при конкуренции, idempotency для запуска/эффекта. Reassign отменяет дальнейшие эффекты старого мандата и сохраняет уже выполненные, не переписывая авторство.
Вопрос в обычном task thread с типом «Требует решения», ответ продолжает тот же run. Artifact/proposal относится к task revision и commit SHA. Принятие человеком не может применить результат к изменённой задаче или новому diff без нового решения. Автопроверка CI — не разрешение merge/deploy.
Резерв/фактическое usage/оценка стоимости/runner cost различимы. Provider unknown не ноль. Отмена не гарантирует возврат уже потраченного бюджета. Нет LLM-polling пока ждём человека. Политика fallback модели/провайдера и расходов явно выдана, не скрыта.

## 6. Совместная приёмка
Первый живой путь: admin создаёт агентный principal и подключение → назначает подготовленную ограниченную задачу → агент читает разрешённые источники → runner возвращает draft PR и результаты проверок → reviewer принимает точную версию → запись/audit/outbox атомарны → второй клиент получает событие. Отдельно: чужой tenant, revoked grant, stale task/SHA, потеря ACK, два worker, неверный webhook, исчерпанный лимит, остановка и перезапуск.
В текущей UI-поставке нет production identities, PG, provider account, runner или paid calls. Все такие сценарии остаются NOT_RUN. Нужны совместные contract tests до подключения реального SDK; UI mock не становится серверной спецификацией по умолчанию.
