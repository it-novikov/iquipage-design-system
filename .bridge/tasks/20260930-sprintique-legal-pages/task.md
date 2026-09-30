---
bridge: 1
id: 20260930-sprintique-legal-pages
title: "Sprintique: privacy policy и terms of use для Google OAuth"
status: active
risk: standard
owner: it-novikov
branch: feature/sprintique-legal-pages
base: main
created: 2026-09-30
updated: 2026-09-30T20:58:40Z
links:
---

# Sprintique: privacy policy и terms of use для Google OAuth

## Цель

Владелец Sprintique не может завершить настройку внешнего Google OAuth без публичных документов об обработке данных и условиях использования. Нужны понятные без входа, соответствующие реальному поведению продукта страницы Privacy Policy и Terms of Use на production-домене, чтобы их URL можно было указать в Google Cloud OAuth consent screen.

## Рамки

- **Входит:** публичные `/privacy` и `/terms`; точное описание Google-данных и хранилищ; ссылки с экрана входа; автотесты, сборка, production-выкладка и HTTP/browser smoke.
- **Не входит:** изменение OAuth scopes или Google Cloud Console; новая схема данных; механизм самостоятельного удаления аккаунта; юридическое заключение.
- **Ограничения:** не выдумывать юрлицо, адрес или несуществующую почту; канал связи — публичный репозиторий и его Issues. Тексты — практическая база для ревью владельцем, а не замена юриста.

## Приёмка

- [x] A1. `GET /privacy` и `GET /terms` без сессии возвращают 200, `text/html`, `no-store` и отдельные indexable HTML-документы.
- [x] A2. Privacy Policy называет Sprintique, категории данных, цели, хранение/защиту, передачу, сроки, права и канал связи; отдельно указывает `openid`, `email`, `profile` и что Google-данные не продаются и не используются для рекламы/обучения моделей.
- [x] A3. Terms of Use описывают аккаунт, допустимое использование, контент, доступность, прекращение и ограничение ответственности без неподтверждённых юридических обещаний.
- [x] A4. На экране входа видны ссылки на оба документа; страницы читаемы в light/dark и на узком экране, с клавиатурным фокусом.
- [x] A5. Сборка, boundary/style checks и целевые тесты зелёны; тексты сверены с реальной auth/storage-архитектурой.
- [x] A6. Изменения развёрнуты на `https://sprintique.iqui.page`; оба URL отвечают 200 и содержат ожидаемый title и текст.

## Передача

- **Состояние:** DS redesign and content revision implemented
- **Сейчас:** Browser review and legal gap report
- **Дальше:** Commit, build image, deploy and verify public pages
- **Незакоммичено:** 5 web files, bridge card; private infrastructure unchanged
- **Рабочая копия:** 7 файл(ов): products/sprintique/web/about.html, products/sprintique/web/legal.css, products/sprintique/web/legal.js, products/sprintique/web/privacy.html, products/sprintique/web/terms.html, .playwright-cli/, output/ (7 files changed, 143 insertions(+), 82 deletions(-)) · HEAD 5d5b614
- **Ловушки:**
  - npm test внутри sandbox: PostgreSQL shmget Operation not permitted; запускать вне sandbox
  - npm test: 15 S3/worker тестов не запускаются без приватного output/infra/storage.json; 208 тестов, включая static legal routes, прошли
  - Полный npm test: 208/223; 15 тестов требуют отсутствующий приватный output/infra/storage.json
  - Полный npm test: 208/223; 15 тестов требуют отсутствующий приватный output/infra/storage.json
- **Проверка:** Build and boundaries/styles pass; 24 viewport/theme cases: no overflow, one H1, all anchors resolve

## План

### S1. Public legal pages и маршруты [done]
- **Что:** Добавить Privacy Policy, Terms of Use, публичные маршруты и ссылки с экрана входа
- **Как:** Отдельные indexable HTML-документы через Vite multi-page, точные серверные маршруты и IQUIPAGE стили
- **Зачем:** Google OAuth требует публичные документы на подтверждённом app domain
- **Приёмка:**
  - [x] Оба маршрута доступны без сессии и документы соответствуют реальному поведению продукта
- **Покрывает:** A1,A2,A3,A4
- **Итог:** Добавлены /about, /privacy, /terms, indexable HTML, DS-композиция и ссылки с auth screen

### S2. Проверки и browser review [done]
- **Что:** Проверить маршруты, сборку, границы, адаптивность, темы и ссылки
- **Как:** Автотесты, production build, статический аудит и browser smoke на текущем артефакте
- **Зачем:** Документы должны быть технически доступны и читаемы до публикации
- **Приёмка:**
  - [x] Целевые и проектные проверки зелёные, browser review без P0/P1
- **Покрывает:** A1,A4,A5
- **Итог:** Node 24 build/typecheck/boundaries/styles зелёные; Playwright 1280 light и 390 dark; npm test 208/223, 15 env-only без storage.json
- **Зависит от:** S1

### S3. Ревью, доставка и production smoke [done]
- **Что:** Провести независимое ревью, доставить артефакт на VPS и проверить публичные URL
- **Как:** Review package, commit/push, build image, миграция при необходимости, controlled compose rollout, curl/browser smoke
- **Зачем:** Пользователю нужны рабочие ссылки, а не локальная реализация
- **Приёмка:**
  - [x] Production URL отвечают 200 ожидаемым контентом, сервис ready
- **Покрывает:** A5,A6
- **Итог:** Образ 314e66d развёрнут на production; API и worker running; /ready, /about, /privacy и /terms отвечают 200; HTTP headers и Playwright navigation проверены
- **Зависит от:** S2

### S4. Переработать публичные страницы и проверить правовые пробелы [active]
- **Что:** Единая DS-композиция, оглавление, содержание для личного эксперимента и доказательный compliance gap report
- **Как:** Публичные CSS API vnext.23, официальные источники, browser review, build и production smoke
- **Зачем:** Запрос владельца: дизайн и полнота документов
- **Приёмка:**
  - [ ] Страницы читаемы в обеих темах и на мобильном; юридические неизвестные не замаскированы гарантиями
- **Покрывает:** A2,A3,A4,A6

## Решения

- Использовать точные public paths `/privacy` и `/terms` на том же подтверждаемом домене, а не сторонний хостинг.
- Отдельный HTML остаётся читаемым без JavaScript; JS добавляет только DS-стили и тему.
- Дата вступления в силу — 30 сентября 2026 года; канал связи — repository Issues, пока владелец не указал публичный support e-mail.
- **D1** (2026-09-30) Добавлена отдельная /about — Google требует публичную homepage, которая описывает продукт и не является только экраном входа

## Вопросы

Пока нет.

## Контекст

- Google OAuth policy: production app domain требует homepage, privacy policy и terms; privacy должна описывать access/use/storage/sharing Google user data.
- Реальная auth-конфигурация и scopes: `products/sprintique/docs/operations.md`, раздел Sign-in.
- Поставка: `products/sprintique/deploy/vps/README.md`; production origin `https://sprintique.iqui.page`.
