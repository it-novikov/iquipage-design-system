---
bridge: 1
id: 20260928-sprintique-production-auth
title: Вход в Sprintique по почте, через Google и Apple
status: active
risk: high
owner: it-novikov
branch: feature/kotlin-backend
base: feat/finish-platform
created: 2026-09-28
updated: 2026-09-28T08:05:44Z
links:
---

# Вход в Sprintique по почте, через Google и Apple

## Цель

Сейчас вход в Sprintique идёт через внешний OIDC-провайдер (Keycloak на локальном стенде), а своего производственного входа у продукта нет. Нужен вход, которым пользуются без администратора: по электронной почте, через Google и через Apple. Один человек — один аккаунт: способы входа с подтверждённой почтой ведут в тот же аккаунт. Результат проверяется тестами против Kotlin-сервера с синтетическими провайдерами и почтовым ящиком.

## Рамки

- **Входит:**
  - вход по одноразовому коду на почту, аккаунт создаётся при первом входе;
  - вход через Google и Apple (OIDC, для Apple — form_post и секрет клиента ES256);
  - привязка способов входа к аккаунту по подтверждённой почте, перенос существующих OIDC-аккаунтов;
  - экран входа на компонентах IQUIPAGE;
  - отправка почты по SMTP, почтовый ящик-файл для локального стенда;
  - локальный стенд и его проверки без Keycloak; документация по настройке Google и Apple.
- **Не входит:** пароли, двухфакторная защита, управление способами входа в профиле, SSO организаций.
- **Ограничения:**
  - вход для разработки и почтовый ящик-файл отключены в production и вне loopback;
  - секреты (ключ Apple, пароль SMTP, секрет Google) — только из окружения или файла, не в репозитории;
  - ответы не выдают, есть ли аккаунт с этой почтой.

## Приёмка

- [ ] A1. Вход по коду на почту: письмо уходит, верный код открывает сессию, неверный и просроченный отклоняются, попытки и частота ограничены
- [ ] A2. Вход через Google и Apple проходит против синтетических провайдеров; подделанный токен, чужой state и nonce отклоняются
- [ ] A3. Способы входа с подтверждённой почтой ведут в один аккаунт; существующие аккаунты сохраняются после миграции
- [ ] A4. Экран входа на компонентах IQUIPAGE проверен в браузере на компьютере и телефоне
- [ ] A5. Локальный стенд, проверка контейнера и учения восстановления проходят без Keycloak
- [ ] A6. Документация объясняет, как настроить Google, Apple и SMTP в production

## Передача

- **Состояние:** S1–S4 готовы; S5 ждёт запуска на эталонном стенде владельцем; S6: документация готова, ревью идёт
- **Сейчас:** Два независимых ревью всей ветки
- **Дальше:** Исправить P0/P1, повторное ревью, обновить PR #17
- **Незакоммичено:** нет
- **Рабочая копия:** 69 файл(ов): engineering/stack.md, products/sprintique/README.md, products/sprintique/docs/authentication-screen.md, products/sprintique/docs/decisions/0001-kotlin-backend.md, products/sprintique/docs/operations.md, products/sprintique/package.json, products/sprintique/scripts/backup-drill.mjs, products/sprintique/scripts/check-container.mjs, products/sprintique/scripts/check-local-agent.mjs, products/sprintique/scripts/check-local-oidc.mjs -> products/sprintique/scripts/check-local-sign-in.mjs, products/sprintique/scripts/local-app.mjs, products/sprintique/scripts/local-identity.mjs -> products/sprintique/scripts/local-services.mjs и ещё 57 (48 files changed, 581 insertions(+), 490 deletions(-)) · HEAD 25c122e
- **Проверка:** cd products/sprintique && node scripts/test.mjs

## План

### S1. Схема аккаунтов и способов входа [done]
- **Что:** Таблица auth.identities, коды почты, провайдер у login_states; перенос issuer/subject
- **Как:** Миграция 021; Accounts.resolve: способ входа → привязка по подтверждённой почте → новый аккаунт
- **Зачем:** Один человек — один аккаунт при нескольких способах входа
- **Приёмка:**
  - [x] Существующие аккаунты переносятся миграцией
  - [x] Привязка по почте только при подтверждённой почте и одном совпадении
- **Покрывает:** A3
- **Итог:** Миграция 021: auth.identities (перенос issuer/subject), auth.email_challenges, provider у login_states. Accounts: известный способ → присоединение по подтверждённой почте (одно совпадение, advisory lock) → новый человек. SignInMigrationIntegrationTest, SI05–SI06.

### S2. Вход по коду на почту [done]
- **Что:** POST /auth/email/start и /auth/email/verify, MailPort, SMTP и почтовый ящик-файл
- **Как:** Код 6 цифр, 10 минут, 5 попыток, привязка к браузеру cookie; лимиты по почте и адресу
- **Зачем:** Основной способ входа без пароля
- **Приёмка:**
  - [x] Тесты: верный, неверный, просроченный, исчерпанный код, лимиты
  - [x] SMTP проверен интеграционным тестом
- **Покрывает:** A1
- **Итог:** EmailSignIn (6 цифр, 10 минут, 5 попыток, cookie-привязка, 30 с и 5 в час на адрес), SMTP (angus-mail, STARTTLS обязателен, отправитель в заголовке и конверте), почтовый ящик-файл в local. SI02–SI04, SI08–SI09; SmtpMailIntegrationTest на GreenMail. Найдено и исправлено: письмо уходило без From с именем пользователя ОС в конверте.
- **Зависит от:** S1

### S3. Google и Apple [done]
- **Что:** Провайдеры google и apple на общем OIDC-адаптере
- **Как:** /auth/login/{provider}, /auth/callback/{provider}; Apple — form_post, секрет ES256, cookie SameSite=None
- **Зачем:** Вход в один клик
- **Приёмка:**
  - [x] Тесты против синтетических провайдеров, включая отказы
- **Покрывает:** A2,A3
- **Итог:** OidcIdentityProviderAdapter параметризован: Google (PKCE, select_account, доверие к Gmail/hd), Apple (form_post, секрет ES256 на 5 минут, имя из user, cookie SameSite=None). /auth/login/{provider}, /auth/callback/{provider}; отказы — редирект с sign-in-error. SI05–SI07 против синтетических провайдеров.
- **Зависит от:** S1

### S4. Экран входа [done]
- **Что:** Экран входа на iq-auth-screen: почта → код, кнопки Google и Apple
- **Как:** Слот form и примитивы DS; только настроенные способы
- **Зачем:** Пользователь видит понятный вход
- **Приёмка:**
  - [x] Проверен в браузере на компьютере и телефоне
- **Покрывает:** A4
- **Итог:** web/sign-in.js на iq-auth-screen и примитивах DS; проверено в браузере на стенде 4321: почта → неверный код (осталось 4) → верный код → онбординг; ошибка провайдера; телефон 375 px; кнопки Google/Apple визуально. check:boundaries и check:styles проходят.
- **Зависит от:** S2,S3

### S5. Стенд и проверки без Keycloak [blocked]
- **Что:** Локальный стенд, check-container, учения восстановления и проверка агента через вход по почте
- **Как:** Почтовый ящик-файл стенда; удалить local-identity и check-local-oidc
- **Зачем:** Снять Q1 и лишний сервис
- **Приёмка:**
  - [ ] Стенд и проверки проходят
- **Покрывает:** A5
- **Итог:** Скрипты переписаны: local-services (PostgreSQL + Mailpit), check-local-sign-in, check-container, check-local-agent, backup-drill без Keycloak; dev:local с почтовым ящиком. Не запущены: настройки эталонного стенда (output/infra) есть только в копии R3, доступ к ней отклонён — запускает владелец.
- **Зависит от:** S2

### S6. Документация и ревью [active]
- **Что:** operations.md, README, ADR; два независимых ревью всей ветки
- **Как:** Ревьюеры с чистым контекстом: безопасность и данные; корректность и простота
- **Зачем:** Процесс high
- **Приёмка:**
  - [ ] P0/P1 закрыты
  - [ ] Документация по Google, Apple и SMTP
- **Покрывает:** A6
- **Зависит от:** S4,S5

## Решения

- **D1** (2026-09-28) Вход без пароля по коду на почту, а не по ссылке — код работает, когда письмо открыто на телефоне, а вход идёт на компьютере, и его не «съедают» почтовые сканеры ссылок
- **D2** (2026-09-28) Свой вход в Kotlin-сервере вместо Keycloak в production — меньше сервисов, а Apple в Keycloak требует стороннего расширения
- **D3** (2026-09-28) Почта Google считается подтверждённой для привязки только при email_verified и адресе gmail.com или claim hd — так советует Google
- **D4** (2026-09-28) Вход входит в PR #17 — он снимает блокер S14 (проверка через Keycloak) карточки kotlin-backend

## Вопросы

Пока нет.

## Контекст

- Модуль: `products/sprintique/server/src/main/kotlin/com/sprintique/identity/`.
- Экран входа: `products/sprintique/web/main.js`, `web/auth-screen.js`; компоненты `libraries/iquipage/src/modules/auth-screen.js`.
- Проверка: `cd products/sprintique && node scripts/test.mjs`.
