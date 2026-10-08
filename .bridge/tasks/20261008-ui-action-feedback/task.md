---
bridge: 1
id: 20261008-ui-action-feedback
title: Обратная связь на действия по всей платформе (DS vnext.35)
status: active
risk: standard
owner: nvkv71
branch: feat/ui-action-feedback
base: main
created: 2026-10-08
updated: 2026-10-08T07:51:41Z
links:
---

# Обратная связь на действия по всей платформе (DS vnext.35)

## Цель

Владелец Sprintique: после нажатия на кнопки нет статусов загрузки, на медленном интернете непонятно, что происходит. Нужна одна спокойная система обратной связи на действия по всей платформе, на дизайн-системе IQUIPAGE. Результат: кнопка не принимает повторных нажатий и через 150 мс показывает ожидание той же ширины, долгие запросы видны линией под верхней панелью, медленная связь и офлайн названы спокойным уведомлением, ошибка сказана рядом с действием с «Повторить».

## Рамки

- **Входит:** аудит под Slow 3G + 2,4 с задержки; модуль DS feedback.js (pending, actionError, trackActivity, autoPending, линия, уведомления связи, saveIndicator, uploadProgress) и релиз vnext.35; центральная проводка в продукте (fetcher клиента, dialog(), formDialog, report/unhandledrejection, вход) и точечная там, где нет кнопки DS.
- **Не входит:** перестройка диалога создания задачи (task-dialog.js) — его параллельно меняет ветка feat/create-task-links-files; кнопки диалога получают ожидание через общий dialog(); телефонная раскладка.
- **Ограничения:** спокойно и без скачков вёрстки, без маркированных списков в текстах, только десктоп, aria-busy и живые регионы, фокус сохраняется.

## Приёмка

- [ ] A1. Кнопка, запускающая запрос, сразу перестаёт принимать нажатия, через 150 мс показывает спиннер той же ширины с aria-busy и возвращается как была; ошибка показывается рядом с кнопкой с «Повторить»
- [ ] A2. Запросы дольше 1 с показывают тонкую линию под верхней панелью; дольше 8 с — спокойное уведомление о медленной связи; офлайн — постоянное уведомление и обновление данных после возврата связи
- [ ] A3. Оптимистичные действия (доска, переключатели) откатываются с тостом; загрузки разделов и ящиков — скелеты после задержки; файлы — прогресс по каждому; автосохранение — тихий статус
- [ ] A4. DS vnext.35 выпущен поверх vnext.34 и принят продуктом; тесты DS и продукта на тайминг, двойную отправку, восстановление после ошибки и уведомления; скриншоты 1440×1000 в двух темах

## Передача

- **Состояние:** DS vnext.35 (feedback.js/feedback.css) выпущен и принят продуктом; центральная проводка через trackedFetch, dialog(), formDialog, report и unhandledrejection; точечная — вход, ящик, комментарии, агенты, колокольчик, рабочий стол, финансы, планирование, настройки. Тесты DS 424/424, продукта action-feedback 6/6.
- **Дальше:** Скриншоты 1440×1000 в двух темах, полный гейт (npm ci, npm test, check:boundaries, verify-vnext), PR.
- **Незакоммичено:** нет
- **Рабочая копия:** 37 файл(ов): products/sprintique/client/api.ts, products/sprintique/package-lock.json, products/sprintique/package.json, products/sprintique/tests/library-contract.ts, products/sprintique/ui/finance/src/finance.css, products/sprintique/ui/finance/src/index.js, products/sprintique/ui/finance/src/plan-editor.js, products/sprintique/ui/planning/src/dialog.js, products/sprintique/ui/planning/src/index.js, products/sprintique/ui/planning/src/planning.css, products/sprintique/ui/src/board/agent-runs-view.js, products/sprintique/ui/src/board/board.css и ещё 25 (33 files changed, 231 insertions(+), 114 deletions(-)) · HEAD cc56bb7
- **Ловушки:**
  - Lock integrity: при перепаковке пересчитывать sha512 тарбола и заменять ключ integrity, иначе npm ci молча ставит старое содержимое из кэша.
  - task-dialog.js не трогать: параллельная ветка feat/create-task-links-files.

## План

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
