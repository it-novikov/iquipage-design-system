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
updated: 2026-10-12T06:33:04Z
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

- [x] A1. A из двух карт остаётся mounted при Task, Close/Back/Forward и Task tabs/links; URL соответствует видимому контексту, direct Task URL сохраняет смысл.
- [x] A2. Dirty guards сохраняют ввод; отказ не уничтожает контекст; отменённый/поздний Task read не открывает drawer; missing target не выбирает случайную карту.
- [ ] A3. Meaningful Node и реальный synthetic browser путь выполнены, ограничения названы, два независимых high-review завершены и промежуточный PR открыт.

## Передача

- **Состояние:** Scoped A1/A2 and S2 complete. R1/R2 high-review findings resolved through independent R3/R4/R5; R5 scoped approve. Native source d4c7fd5 and exact checked tree are recorded with immutable before/after JSON and selected PNG.
- **Сейчас:** S3 — retain published evidence and await full vNext completion
- **Дальше:** Verify final PR75 remote tree, then inspect full vNext build/backend/real-services/extraction/runtime-image on the relevant head; only close A3/readiness after required gates. Continue within the three existing PRs.
- **Незакоммичено:** This checkpoint adds only bridge acceptance/reviews and byte-identical native evidence; runtime/tests/workflow unchanged from d4c7fd5.
- **Рабочая копия:** Snapshot создания этого docs/evidence checkpoint; проверенный runtime d4c7fd597efaa60f5e646687c06338c98e90946d. Перед продолжением сверить git status и published PR head.
- **Ловушки:**
  - CI 38208579979/114677451438: Task browser NOT_RUN after fixture context validation failure; not a product verdict. R2 67abc has 79 PASS and 5 independent FAIL.
- **Проверка:** Current runtime: 97/97 Node, boundaries/styles and Vite PASS; native Chromium run38212310305 PASS four profiles and five recovery cases; independent R5 exact-source PASS5/5 and personally inspected panels. Full vNext still pending; no production/full-shell browser claim.
- **Причина:** planned — astra-root, 2026-10-12T06:33:04Z, передано root: Publish documentation/evidence checkpoint to the existing PR75; retain exact source provenance. Scoped frontend evidence passed, full vNext gate remains outstanding. PR74/75/76 use the agreed WIP capacity; merge/deploy are not performed.

## План

### S1. Сохранить владельца Maps и согласованный маршрут задачи [done]
- **Что:** Узкий host/route patch и ADR
- **Как:** Существующий Task поверх живой Maps; contextual hash и callbacks
- **Зачем:** Возврат к той же человеческой работе без remount
- **Приёмка:**
  - [x] Код сохраняет existing guards, public DS и canonical links
- **Покрывает:** A1,A2
- **Итог:** Actual MapTask host/route и совместимые Task tab callbacks; canonical links/guards сохраняются. Node10+34 PASS, boundaries/styles и Vite bundle PASS; browser/independent review pending.

### S2. Проверить контекст, историю, guards и поздние ответы [done]
- **Что:** Actual controller tests и synthetic rendered UI
- **Как:** Две карты, связанная Task, реальные стили/.52, controllable reads
- **Зачем:** Отделить доказательство поведения от source рассуждения
- **Приёмка:**
  - [x] Предметные сценарии проходят; runtime ограничения записаны
- **Покрывает:** A1,A2,A3
- **Итог:** 97 Node regressions and actual Chromium four profiles/five recovery cases PASS; visible tabs independently verified in R5. Native fixture limits recorded in evidence/native-tabs.
- **Зависит от:** S1

### S3. Независимая приёмка и опубликованный checkpoint [active]
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

