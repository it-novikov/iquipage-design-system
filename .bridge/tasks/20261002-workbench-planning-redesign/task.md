---
bridge: 1
id: 20261002-workbench-planning-redesign
title: Пересборка Рабочего стола и Планирования
status: active
risk: high
owner: nvkv71
branch: feat/workbench-planning-redesign
base: main
created: 2026-10-02
updated: 2026-10-03T13:15:08Z
links:
---

# Пересборка Рабочего стола и Планирования

## Цель

Пересобрать Рабочий стол и Планирование: ясные очереди и следующий шаг, читаемый состав плана, эстетичная адаптивная композиция. Пользователь явно поручил новое решение и расширение DS.

## Рамки

- **Входит:** аудит, новая композиция двух экранов, публичное расширение DS, точный пакет, поведенческая и визуальная проверка.
- **Не входит:** новые доменные возможности, изменение API сервера/прав, push, публикация, deploy.
- **Ограничения:** сохранить функции, данные и права; изолированный синтетический стенд.
- **Проработка high:** additive CSS API; контракты сервера не меняются. Ошибки/конкурентность/повторы остаются в существующих адаптерах. Поиск работает по загруженному составу без новой пагинации. Отказ сети сохраняет данные и повтор. Откат — предыдущий frontend и tarball .29. Альтернативы и матрица: specs/general/UI-IMPROVEMENTS.md.

## Приёмка

- [x] A1. Оба экрана пересобраны с сохранением операций и прав; finding IDs и паритет задокументированы
- [x] A2. DS vnext.31 собрана, проверена и подключена точным tarball; build, boundary и затронутые тесты проходят
- [x] A3. Новая композиция просмотрена в обеих темах и адаптивных размерах; взаимодействия проверены и ограничения названы

## Передача

- **Состояние:** Объединено с origin/main 9a959a2; DS .31, исходный .30 сохранён; публикация разрешена
- **Сейчас:** Публикация PR
- **Дальше:** Просмотр и слияние владельцем
- **Незакоммичено:** merge main and package .31
- **Рабочая копия:** 103 файл(ов): libraries/iquipage/PROVENANCE.json, libraries/iquipage/README.md, libraries/iquipage/docs/workspace.md, libraries/iquipage/package-lock.json, libraries/iquipage/package.json, libraries/iquipage/scripts/gates/contrast-baseline.json, libraries/iquipage/scripts/gates/size-baseline.json, libraries/iquipage/src/entries/core.js, libraries/iquipage/src/manifest.json, libraries/iquipage/src/modules/components.js, libraries/iquipage/src/modules/scale.js, libraries/iquipage/src/modules/ui.js и ещё 91 (109 files changed, 10445 insertions(+), 902 deletions(-)) · HEAD 87a3241
- **Проверка:** 414 DS +60 targeted product PASS; build/typecheck/boundaries PASS; diff clean
- **Причина:** review — codex-design, 2026-10-03T12:07:23Z: Готово локально; push/deploy не разрешены и не выполнялись; полный интеграционный прогон не заявлен

## План

### S1. Ревью и реализация [done]
- **Что:** Новая композиция двух экранов
- **Как:** DS public layout + продуктовые адаптеры
- **Зачем:** Ясные действия и читаемость
- **Приёмка:**
  - [x] Паритет и проверки задокументированы
- **Покрывает:** A1,A2,A3
- **Итог:** DS .30; 408 DS, 22 UI, 30 HTTP PASS; build/boundaries PASS; R1/R2 fixed; browser search/move/undo/focus/themes/responsive verified. Details specs/general/UI-IMPROVEMENTS.md

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
