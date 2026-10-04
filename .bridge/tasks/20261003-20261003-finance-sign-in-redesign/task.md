---
bridge: 1
id: 20261003-20261003-finance-sign-in-redesign
title: Пересборка финансов и стартового экрана
status: active
risk: high
owner: nvkv71
branch: feat/finance-sign-in-redesign
base: main
created: 2026-10-03
updated: 2026-10-04T05:11:45Z
links:
---

# Пересборка финансов и стартового экрана

## Цель

Пересобрать финансы и страницу входа по прямому запросу владельца. Пользователь должен видеть смысл сумм, базу сравнения и следующий шаг без наведения. На входе — понятное назначение продукта и компактная форма. Кнопка Google сохраняет исходные разметку, оформление и поведение.

## Рамки

- **Входит:** обзор финансов, доступность действий, редактор плана, стартовый экран; публичные дополнения DS, адаптивность и локальная проверка.
- **Не входит:** изменение расчётов/API/прав, банковские функции, OAuth, юридические тексты, публикация и production deploy.
- **Ограничения:** точный vendor-пакет DS; Google без изменений; синтетические данные; сохранение состояний плана/операций и раздельных валют.

## Приёмка

См. specs/general/FINANCE-AUTH-REDESIGN.md.
- [x] A1. Финансы показывают план, факт, ожидания, прогноз и действия; адаптивность проверена
- [x] A2. Экран входа пересобран; Google сохранён; build, DS и целевые тесты проходят

## Передача

- **Состояние:** review
- **Сейчас:** Реализация DS .34 и финансов/auth UI закончена; локальная QA выполнена, R1 без P1/P2
- **Дальше:** Завершить независимое R2 после восстановления лимита сервиса; решение владельца о публикации
- **Незакоммичено:** Изменения реализации и документации готовы к локальному коммиту
- **Рабочая копия:** 21 файл(ов): libraries/iquipage/PROVENANCE.json, libraries/iquipage/docs/authentication.md, libraries/iquipage/docs/workspace.md, libraries/iquipage/package-lock.json, libraries/iquipage/package.json, libraries/iquipage/scripts/gates/size-baseline.json, libraries/iquipage/src/entries/core.js, libraries/iquipage/src/styles/auth-screen.css, libraries/iquipage/src/styles/workspace.css, libraries/iquipage/tokens/semantic.json, libraries/iquipage/types/core.d.ts, products/sprintique/package-lock.json и ещё 9 (19 files changed, 124 insertions(+), 92 deletions(-)) · HEAD 79c9b8f · снято 2026-10-04T05:02:09Z
- **Проверка:** DS414/414; finance/auth48/48; final UI17/17; build и boundaries PASS; screenshots outputs/finance-auth
- **Причина:** review — codex-design, 2026-10-04T05:02:09Z: Реализация готова локально. R1 завершено; R2 прервано usage limit, finding исправлен. См. specs/general/FINANCE-AUTH-REDESIGN.md и outputs/finance-auth.

## План

### S1. Реализация и локальная приёмка [done]
- **Что:** DS .34, финансовый обзор, редактор плана и welcome
- **Как:** Версионный публичный пакет, UI и HTTP проверки, браузерные скриншоты
- **Зачем:** Ясность состава, действий и результатов
- **Приёмка:**
  - [x] Сборка, тесты и локальные сценарии проходят
- **Покрывает:** A1,A2
- **Итог:** 414 DS, 48 targeted HTTP/UI, final17 UI; browser local QA

### S2. Независимое ревью [done]
- **Что:** R1 и R2
- **Как:** Два независимых ревьюера по engineering/WORKFLOW
- **Зачем:** Проверить регрессии и побочные эффекты
- **Приёмка:**
  - [x] Оба раунда завершены
- **Итог:** R2 approve47ca09f; дополнительный approve87b372e после merge main; открытых P0/P1/P2 нет
- **Зависит от:** S1

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
