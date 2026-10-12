---
bridge: 1
id: 20261012-maps-task-context
title: "Maps: связанная задача с возвратом в прежний контекст"
status: active
risk: high
owner: user
branch: fix/maps-task-context
base: main
created: 2026-10-12
updated: 2026-10-12T05:03:52Z
links:
---

# Maps: связанная задача с возвратом в прежний контекст

## Цель

Человек открывает связанную задачу на карте, затем продолжает работу в том же месте. Сейчас web/main.js переводит в Board и уничтожает MapsFeature, поэтому возврат теряет исходную карту/viewport/selection. WP01 из принятого плана сохраняет живую Maps под существующим полноценным Task; URL хранит map/task/tab identity.

## Рамки

- **Входит:** Maps host, contextual route, существующий Task drawer/tab callback, guard и late-read cancellation, meaningful tests и synthetic render.
- **Не входит:** новый router/стек/DS-пакет, backend/права/миграции, persistence pan/selection через reload, перепроектирование Task, onboarding, merge/deploy.
- **Ограничения:** high — затрагивается граница Maps/Task/shell. User 2026-10-12 явно поручил реализацию принятого плана, push и промежуточные PR; дополнительное согласование этого scope не требуется. Base main f5f941afa4e9be8a709e6de67a92bacf5a9397ca проверен GitHub API. Exact DS .52, SHA256 989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758. Один writer astra-root, отдельный worktree.

## Приёмка

- [ ] A1. A из двух карт остаётся mounted при Task, Close/Back/Forward и Task tabs/links; URL соответствует видимому контексту, direct Task URL сохраняет смысл.
- [ ] A2. Dirty guards сохраняют ввод; отказ не уничтожает контекст; отменённый/поздний Task read не открывает drawer; missing target не выбирает случайную карту.
- [ ] A3. Meaningful Node и реальный synthetic browser путь выполнены, ограничения названы, два независимых high-review завершены и промежуточный PR открыт.

## Передача

- **Состояние:** Host/route patch и ADR реализованы; 10 новых controller checks и 34 существующих regression PASS; browser pending.
- **Сейчас:** S1: узкий код готов для первого checkpoint
- **Дальше:** Реальный synthetic render и независимый R1 immutable diff
- **Незакоммичено:** Компилируемый frontend patch, новые Node tests, ADR и bridge; browser harness ещё не добавлен.
- **Рабочая копия:** 9 файл(ов): products/sprintique/ui/src/board/task-dialog.js, products/sprintique/ui/src/maps.js, products/sprintique/web/main.js, products/sprintique/web/maps-host.js, products/sprintique/web/section-route.js, products/sprintique/docs/decisions/0014-maps-task-context.md, products/sprintique/tests/maps-task-origin.test.mjs, products/sprintique/web/maps-route.js, products/sprintique/web/maps-task-context.js (5 files changed, 23 insertions(+), 12 deletions(-)) · HEAD f5f941a
- **Проверка:** npm ci по lock PASS; check:boundaries/styles PASS; Node10+34 PASS с --import tsx для regression; Vite-only build PASS. Полный npm run build BLOCKED: TS7 native compiler /proc/self/exe unavailable; backend JDK25/PG18 unavailable.

## План

### S1. Сохранить владельца Maps и согласованный маршрут задачи [done]
- **Что:** Узкий host/route patch и ADR
- **Как:** Существующий Task поверх живой Maps; contextual hash и callbacks
- **Зачем:** Возврат к той же человеческой работе без remount
- **Приёмка:**
  - [x] Код сохраняет existing guards, public DS и canonical links
- **Покрывает:** A1,A2
- **Итог:** Actual MapTask host/route и совместимые Task tab callbacks; canonical links/guards сохраняются. Node10+34 PASS, boundaries/styles и Vite bundle PASS; browser/independent review pending.

### S2. Проверить контекст, историю, guards и поздние ответы [active]
- **Что:** Actual controller tests и synthetic rendered UI
- **Как:** Две карты, связанная Task, реальные стили/.52, controllable reads
- **Зачем:** Отделить доказательство поведения от source рассуждения
- **Приёмка:**
  - [ ] Предметные сценарии проходят; runtime ограничения записаны
- **Покрывает:** A1,A2,A3
- **Зависит от:** S1

### S3. Независимая приёмка и опубликованный checkpoint [todo]
- **Что:** Два high-review, исправления, PR
- **Как:** Frozen diff и результаты; новая проверка исправленного результата
- **Зачем:** Не потерять работу и поймать ошибки автора до merge
- **Приёмка:**
  - [ ] Нет открытых P0/P1; patch и handoff доступны в GitHub
- **Покрывает:** A3
- **Зависит от:** S2

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Принятый report V3 §10.2 WP01; PR74 содержит immutable snapshot и problem-first workflow.
- web/maps-host.js, main.js, section-route.js, ui/src/maps.js, board/task-dialog.js.
- Решение: сохранить живой Maps, поскольку восстановление origin требует лишней сериализации ephemeral state. Простая замена обратной ссылки не чинит уничтожение и tab URL.
- High проработка: только существующий project/actor/capabilities; Task права из tasks.write; серверные команды не меняются. Reads ограничены текущей Task; поколение+abort защищают от late response; сохранение/dirty guard остаются у Task и Maps. Лимиты ввода/пагинация неприменимы: новых форм/списков нет. Ошибка Task оставляет карту; missing map не открывает случайную другую. Миграций нет, canonical Task URLs сохраняются. Rollback — revert PR; после будущего owner deploy проверить Maps→Task→Close/Back и отказ dirty-close, откат при утрате контекста или обходе guard.
- Полный server gate требует рабочего JDK25/PostgreSQL18; текущая среда их не имеет. npm ci установлен по текущему lock, runtime browser готовится отдельно без изменения product dependencies.

