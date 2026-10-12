# WP05 — copy clarification, candidate 1

Base: main `5d674ee06551b175fb5e9553c9866c11fb8fe4c0`, DS54.

## Changes
- Requests section: «Запросы к вам»; suppress zero request count, without changing queues.
- Completed delegated work: «Больше не жду» and «Вы больше не ждёте», with existing personal acknowledgment and undo. Collective approvals unchanged.
- Telegram: «Отвязать Telegram» deletes the link; «Доставлять уведомления» only changes delivery.
- Settings `agents`: «Предложения и API-доступ»; empty state no longer implies executor catalog is empty. Existing ids, permissions and endpoints unchanged.
- Account model-driven capability: «Работа с ИИ в Sprintique». Executor catalog remains «Агенты»; no merger of backend entities or readiness inference.

## Verification
- Node model/copy/API separation checks: 14/14 passed (Node 22.22.0 locally, not required Node 24).
- Synthetic native Chromium frontend check against actual modules: delivery off keeps Telegram link; refusal restores switch; unlink uses DELETE; personal acknowledgment true then undo false; distinct headings and grant action render. No page errors.
- No authenticated production writes or role acceptance. Full server suite unavailable locally (PostgreSQL 18/JDK 25); CI required before merge.
- PF07 blocked/disallowed roles, skill changes and result-finding remain unverified. This candidate must not be called complete WP05 acceptance.

## Boundaries
Only presentation strings and copy regression added. No permission, token, server, data-model or API changes.
