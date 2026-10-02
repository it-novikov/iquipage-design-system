---
bridge: 1
id: 20261002-workbench-capacity-test
title: Стабильный тест ёмкости Workbench
status: active
risk: low
owner: nvkv71
branch: fix/workbench-capacity-test
base: main
created: 2026-10-02
updated: 2026-10-02T14:30:20Z
links:
---

# Стабильный тест ёмкости Workbench

## Цель

WorkbenchCapacityIntegrationTest падал на загруженной машине: снимок «Сейчас» для человека на пределе участия (2000 задач, 300 000 событий) шёл 1,7–2,8 с при лимите 2 с. Нужно найти и устранить причину, а замер сделать устойчивым (прогрев, медиана), не отключая тест. Владелец одобрил отдельный небольшой PR.

## Рамки

- **Входит:** запрос Workbench.query (CTE related/unseen), WorkbenchCapacityIntegrationTest.
- **Не входит:** другие продукты и worktree, продакшен, функции RLS.
- **Ограничения:** миграция не понадобилась; номер V20261001000071 не занят этой веткой.

## Приёмка

- [x] A1. Причина медленного чтения найдена профилированием EXPLAIN (ANALYZE, BUFFERS) от роли приложения с RLS и устранена
- [x] A2. Тест прогревается и сравнивает медиану пяти замеров с обоснованным бюджетом, а план проверяется без часов
- [ ] A3. Гейты npm test и verify-vnext зелёные, PR открыт и не слит

## Передача

- **Состояние:** Исправление и тест готовы, идут гейты
- **Дальше:** npm test, verify-vnext, PR
- **Незакоммичено:** нет
- **Рабочая копия:** 2 файл(ов): products/sprintique/server/src/integrationTest/kotlin/com/sprintique/workbench/WorkbenchCapacityIntegrationTest.kt, products/sprintique/server/src/main/kotlin/com/sprintique/workbench/application/Workbench.kt (2 files changed, 71 insertions(+), 26 deletions(-)) · HEAD 4756b27

## План

### S1. Причина и исправление [done]
- **Что:** Профиль снимка от роли приложения, правка CTE related/unseen
- **Как:** EXPLAIN (ANALYZE, BUFFERS) и pg_stat_user_functions на данных теста, водяной знак как столбец агрегата
- **Зачем:** Тест падал из-за реального лишнего чтения, а не только из-за нагрузки
- **Приёмка:**
  - [x] auth.can_project вызывается на событиях после водяного знака, а не на всей истории
- **Покрывает:** A1
- **Итог:** 1,76 с → 0,13 с на SQL; вызовов can_project 310 тыс. → 16 тыс. за чтение

### S2. Устойчивый замер [done]
- **Что:** Прогрев, медиана пяти замеров, ANALYZE засеянных таблиц, проверка Index Cond
- **Как:** Общий помощник timed и бюджеты с комментарием
- **Зачем:** Один замер на загруженной машине не говорит ни о чём
- **Приёмка:**
  - [x] пять прогонов на ветке зелёные, медианы записаны
- **Покрывает:** A2
- **Итог:** медиана пяти прогонов 1910 мс на main → 141 мс на ветке
- **Зависит от:** S1

### S3. Гейты и PR [active]
- **Что:** npm test, verify-vnext, PR
- **Как:** Node 24, TEST_S3_CONFIG стенда, фоновые прогоны
- **Зачем:** Правило репозитория
- **Приёмка:**
  - [ ] гейты зелёные, PR открыт
- **Покрывает:** A3
- **Зависит от:** S2

## Решения

- **D1** (2026-10-02) Исправление в тексте запроса, а не миграцией — COALESCE в условии по task_activity не leakproof, поэтому под RLS он не попадал в индексное условие и шёл после auth.can_project; функции RLS тут ни при чём
- **D2** (2026-10-02) Бюджеты 300 и 600 мс по медиане после двух прогревов — около 4 раз от медианы при нагрузке 4–6, а регрессию плана ловит проверка Index Cond

## Вопросы

Пока нет.

## Контекст

- products/sprintique/server/src/main/kotlin/com/sprintique/workbench/application/Workbench.kt — CTE related и unseen.
- products/sprintique/server/src/integrationTest/kotlin/com/sprintique/workbench/WorkbenchCapacityIntegrationTest.kt — бюджеты и проверка плана.
