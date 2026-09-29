# ADR Рабочего стола

Решения WP0 по [delivery plan](../workbench/delivery-plan.md) (§2, §3, §4, §6–§8) и [решению владельца](../workbench/delivery-plan.md#21-решение-владельца). Общие решения продукта — в [decisions](../decisions/).

| ADR | Решение |
|---|---|
| [W1](W1-exact-recipient-requests.md) | Адресный запрос: точный получатель, жизненный цикл, синхронизация с источником, потеря членства |
| [W2](W2-private-state-boundary.md) | Граница приватного: личное состояние, приватные квитанции, общие события |
| [W3](W3-field-revisions-and-watermark.md) | Независимые ревизии полей и водяной знак значимых событий |
| [W4](W4-snapshot-envelope-and-cursors.md) | Конверт одного снимка, курсоры, политика счётчиков и лимиты |
| [W5](W5-waiting-and-snooze.md) | «Жду», `checkBackAt`, отложенные запросы и `neededBy` |
| [W6](W6-route-and-drawer.md) | Маршрут и drawer, фильтр против навигации, флаги |

Статус всех ADR — **accepted** (решение владельца 2026-09-29, реализация — карточка `.bridge/tasks/20260929-workbench-mvp`).
