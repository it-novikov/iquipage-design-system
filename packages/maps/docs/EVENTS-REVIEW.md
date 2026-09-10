# R4 status: RESOLVED

OUTBOX-07 and OUTBOX-08 are fixed. The original assertions remain in tests/outbox.test.mjs and run in npm test. New regressions cover committed snapshots, trusted archive completion, bounded recovery, target isolation, HTTP and the browser journal. Fresh evidence is in evidence/final/verification.json.

The report below is the preserved original discovery record, not the current release status.

---

# Проверка черновика событий — 10 сентября 2026

Статус: NOT READY. Не включать этот черновик в поставку R3.
Проверенная R3 находится в ветке feature/maps-r3-release, коммит 5a30bdf.
Команда воспроизведения: `node --test tests/outbox-regression.mjs`.
Результат: 8 проверок, 6 PASS, 2 FAIL. Исходный лог: evidence/events/outbox-regression.txt.

## Подтверждённые свойства

Запись документа и событие переживают повторное открытие хранилища.
Конфликт revision не добавляет событие. Ошибка диска не меняет документ или очередь.
Пауза правила до доставки не создаёт запуск. Параллельные drain не дублируют запуск.
Повтор после отказа подтверждения доставки и перезапуска не дублирует созданную задачу.

## OUTBOX-07 — вход события зависит от более поздней версии карты

Тест сохраняет два изменения до доставки. Первый запуск получает текст второго.
Причина: EventService.dispatch читает текущий документ для inputSource=map-notes.
Исправление должно закреплять входные данные при записи события, вместе с принятой
версией правила. Нельзя просто заменить idempotency key или ослабить проверку теста.
Повтор доставки должен использовать тот же снимок, даже если карта изменилась.

## OUTBOX-08 — завершающее событие сессии отбрасывается

После архивации собственной карты правило session.archived не создаёт запуск:
общая защита archived в EventService.dispatch возвращает skipped.
Нужно отдельно разрешить ранее опубликованное завершающее правило для доверенного
события commit с точными recordId/revision. Снять запрет запуска всех архивных карт
нельзя: ручной запуск, расписание, webhook и редактирование архива остаются запрещены.
Запись задач по завершающему правилу должна по-прежнему ждать подтверждения человека.

Последующие этапы: ограничение повторов/ошибочная очередь, UI доставки, HTTP-регрессии.
