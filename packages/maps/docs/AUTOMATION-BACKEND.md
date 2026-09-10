# Событийная автоматизация: реализация и продолжение

Документ описывает существующий reference runtime и обязательные требования для production-исполнителя. Последний раздел — **план доработки**, а не заявление о выполнении.

## Разделение данных

Map — редактируемая карта и draft flow. Rule — способ запуска, версия и параметры источника. Run — отдельный неизменяемый снимок flow, входные данные, журнал шагов и принятых решений. Task — внешний результат через адаптер, не состояние карточки whiteboard.

`run.flowSnapshot` фиксируется при запуске; перемещение объектов и дальнейшая правка flow не меняют исполняемую версию. Правило при включении закрепляет flowSnapshot и mapRevision. Для применения новой версии правило нужно пересохранить/включить явно. Архивная исходная карта не запускается. Автоматизация для события `session.archived` должна принадлежать отдельной активной постоянной карте-сценарию; завершённая сессия — источник данных события, а не редактируемый исполнитель.

## Поддержанная семантика графа

Типы узлов: input(notes), transform(notes→actions), condition(json→json), llm(notes→actions), approval(actions→actions), task(actions→result), output(json). Transform: lines или unique. Condition: has-items либо contains с буквальным текстом, без eval/кода. Labels/цвет/расположение связей не интерпретируются как код.

Один input; минимум один output; граф без циклов. Обычный узел имеет один безусловный следующий шаг. Condition имеет две ветви true/false. Исполняется один выбранный путь. На каждом пути к task требуется approval. Несовместимые типы, недоступные шаги, циклы, отсутствующие endpoints и незаполненные инструкции блокируют запуск. JSON-порт допускает связку разных структур, но фактический payload проверяется перед выполнением узла.

Произвольные JS/Python шаги, циклы, параллельные ветки, subprocess/BPMN и компенсирующие транзакции не реализованы. Новая фигура на проекции workflow остаётся пояснением; исполнительный узел добавляется действием «Добавить шаг» и получает семантический тип.

## Режимы

**Проверка:** только структура, без запросов к модели и внешних записей.

**Тест:** настоящий проход reference-графа, но LLM возвращает явно отмеченный `[Проверочный ответ]`, а task сообщает wouldCreate, не создавая задач. Моделирование не выдаётся за ответ реальной модели. Даже тест останавливается на approval, чтобы проверить этот путь.

**Исполнение:** task записывает локальные задачи стенда либо обращается к адаптеру host. LLM требует configured adapter и connectionRef. Без подключения run получает blocked. Нет автоматического fallback на притворный результат.

## Run lifecycle и сохранение

`queued → running → awaiting_approval → running → succeeded`. Дополнительные состояния: failed, blocked, interrupted, rejected, cancelled. На каждом шаге сохраняются attempt, input, output, startedAt/finishedAt, статус и ошибка. Локальный FileRepository делает сериализованный compare-and-set, запись temporary-файла, fsync и rename; память обновляется после успешной записи. Это single-process reference, не распределённая БД.

Approval записывает actor, nodeId, timestamp, accepted и отредактированный список. accepted должен быть boolean; baseRevision обязан совпадать. Повторное/устаревшее подтверждение отклоняется. После restart waiting approval остаётся доступным, а незавершённый running/queued помечается interrupted и требует ручной проверки/повтора.

Повтор разрешён для failed/blocked/interrupted, максимум три раза в текущем reference runtime. Завершённые шаги не выполняются заново: currentNode остаётся на незавершённом. Внешние операции должны иметь idempotencyKey runId:nodeId; локальный task-adapter использует детерминированный ID каждой задачи. Остановка run не отменяет уже созданные задачи. HTTP abort/таймаут не доказывает, что внешний сервис ничего не записал.

## Источники событий

### Вручную

Запуск доступен из «Тест и запуск». Сохранённое правило manual — описание ручного сценария, а не фоновый триггер.

### По расписанию

Время ЧЧ:ММ, IANA timezone, непустой список weekdays 0..6. Reference scheduler просматривает правила каждые 10 секунд, пока процесс работает. Пропущенное время не догоняется. Несуществующая локальная минута при переводе часов пропускается; повторяющаяся минута запускается один раз. Dedupe key включает ruleId и локальные дату/время. Слоты проверены отдельными DST-тестами.

UI сохраняет правило draft/enabled/paused. Без серверной capability UI не изображает работающую фоновую автоматизацию. Закрытие браузера не останавливает запущенный серверный scheduler; остановка процесса — останавливает.

### Событие проекта

Поддержаны `session.archived`, `map.updated`, `task.completed`. Producer отправляет событие **после успешной записи** в своей системе. Текущий reference CRUD автоматически эти события не публикует; UI предоставляет явный тест события. Production host должен подключить producer/outbox, не заменять это CSS-состоянием.

Payload:

```json
{
  "id": "event-unique-id",
  "projectId": "project-id",
  "type": "session.archived",
  "data": {"notes": ["Согласовать критерии готовности до начала работы"]},
  "depth": 0
}
```

В `EventService.dispatch` при источнике event-notes входом становится `event.data` с полем `notes`; при источнике map-notes берутся актуальные заметки активной карты, а не произвольный URL. Версия графа при этом остаётся закреплённой в правиле. Не передавать полные документы/секреты, когда достаточно выбранного фрагмента.

Rule фильтруется по projectId/type. Возврат собственного originRuleId блокируется, depth ограничен. Эти поля в production формирует доверенный серверный producer, а не внешний пользователь.

### Входящий запрос

Endpoint `POST /api/hooks/:ruleId` доступен при установленном `MAPS_WEBHOOK_SECRET`. Reference использует один секрет стенда; production требует отдельный секрет каждого подключения/правила, ротацию и ACL.

Заголовки: `X-Maps-Timestamp` — Unix seconds; `X-Maps-Signature` — hex HMAC-SHA256 от `timestamp + '.' + rawBody`. Подпись считается по исходным байтам body до JSON parse, сравнение timing-safe, окно ±300 секунд. Неверная или устаревшая подпись не создаёт run. Origin/CSRF-механизм интерфейса не подменяет проверку подписи webhook.

**Дедупликация:** одинаковые ruleId/eventId дают один run. Тот же eventId с иным объектом data отклоняется как EVENT_CONFLICT, включая конкурирующие обращения. Повтор webhook может возвращать существующий результат; это не повторное выполнение.

## Реальный HTTP reference API

База `/api`. JSON ошибки: `{code,message,details?}`. 409 — конфликт/неизменяемый архив/повтор ID с иным событием; 403 — origin/Host/signature/project rejection; 404 — отсутствующий ресурс; остальные validation errors — 400. `X-Maps-Client: reference` нужен для обычных записей интерфейса; это CSRF-маркер, **не credential**.

| Метод и путь | Назначение |
|---|---|
| GET /capabilities | Фактически настроенные возможности стенда |
| GET /records/:collection?projectId=… | Список видимых записей |
| GET /records/:collection/:id?projectId=… | Запись или null |
| PUT /records/:collection/:id | `{record,baseRevision}`; runs напрямую не записываются |
| POST /runs | `{mapId,mapRevision,projectId,input,mode}`; сервер использует сохранённый flow |
| POST /runs/:id/approve | `{projectId,baseRevision,accepted,actions}` |
| POST /runs/:id/cancel | `{projectId}` |
| POST /runs/:id/retry | `{projectId}` |
| POST /events | Доверенное в production событие проекта; в reference явный тест |
| POST /hooks/:ruleId | Подписанный raw JSON |

Клиентские actorId и flow при обычном запуске не авторитетны. Reference сервер подставляет свою identity и читает каноническую карту. В production роли и membership проверяются на каждом методе, включая чтение run input/output и доступ к источникам.

## LLM gateway contract

В окружении сервера: `MAPS_LLM_GATEWAY` — фиксированный HTTPS endpoint без credentials в URL, `MAPS_LLM_GATEWAY_TOKEN` — необязательный bearer secret. Они не попадают в карту, шаблон или browser storage. Никаких ключей в репозитории. Endpoint — **кастомный gateway-контракт этого пакета**, не готовая прямая совместимость с API провайдера.

Запрос:

```json
{"input":{"notes":["Нужны понятные критерии"]},"prompt":"Составь следующие действия","connectionRef":"team-model","outputSchema":"actions/title-v1"}
```

Ответ:

```json
{"actions":[{"title":"Согласовать критерии перед началом задачи"}],"usage":{"inputTokens":100,"outputTokens":40}}
```

Проверяются количество действий и непустой title до 240 символов. Невалидный ответ останавливает шаг. Таймаут LLM/task — 30 секунд; активная часть reference-run ограничена 120 секундами. Данные входа ограничены 100 заметками, 10 000 символов на заметку и суммарным лимитом. Реального gateway, денег и токенов в этой поставке не использовано.

## Production-требования для следующего агента

1. Подключить реальные auth/workspace/project ACL и неизменяемый аудит. Разделить edit/run/publish/approve/manageAutomation. Нельзя доверять DOM-флагам или идентификаторам из тела запроса.
2. Заменить FileRepository на транзакционную БД. Обеспечить compare-and-set, уникальность ruleId/eventId, approval CAS и неизменяемость архивов. Протокол схем/миграций/backup/retention согласовать с платформой.
3. Создать durable очередь, worker leases, heartbeat, retry/backoff/dead-letter и recovery после сбоя. Долгий webhook отвечает 202 после durable enqueue, а не ждёт весь процесс. Локальный synchronous POST — reference, не SLA.
4. Публиковать доменные события через transactional outbox. Повторная доставка не повторяет эффект. Добавить event routing, auth producers, depth/origin provenance; concurrency policy и ограничение нагрузки на проект.
5. Ввести версии draft/published для сценариев и правила изменения pinned version. Текущий reference закрепляет снимок, но не содержит отдельного approval-процесса публикации workflow.
6. Обеспечить идемпотентность **внешних** задач и восстановление после неопределённого сетевого результата. Abort не даёт гарантию отсутствия записи. Поддерживать проверку существующего эффекта, не слепой retry. Компенсации — отдельные подтверждённые действия.
7. Для webhook: per-connection secrets, ротация, rate limit, лимиты тела, доверенные источники, журнал rejected/replayed событий. Для внешних fetch: allowlist, запрет private-network SSRF, egress, ограничение redirect/размера, секреты только server-side.
8. Для LLM: разрешённые провайдеры/модели, проверка structured output, redaction input/logs, budget/token/time limits, trace без секретов. Контент заметок — данные, не разрешение модели вызывать инструменты. Не выполнять raw model instructions как код.
9. Добавить SSE/WebSocket для статусов run и observability: latency, ошибки, стоимость по фактическому usage, retry, source event. UI должен показывать offline/loading/not-connected, не фальшивую успешность.
10. Повторить проверки: два workers принимают одно событие; сбой после внешнего эффекта до local commit; повтор approval; смена прав; архивирование источника; DST; отзыв webhook secret; остановка/перезапуск; invalid model output; isolation двух организаций; нагрузка большой карты. Затем браузерная матрица и production-приёмка.
