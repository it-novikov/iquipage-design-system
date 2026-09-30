---
bridge: 1
id: 20260930-access-invites
title: "Sprintique: права, пресеты и приглашения по почте"
status: active
risk: high
owner: it-novikov
branch: feature/access-invites
base: main
created: 2026-09-30
updated: 2026-09-30T13:38:13Z
links:
---

# Sprintique: права, пресеты и приглашения по почте

## Цель

Сейчас доступ в Sprintique — три роли проекта и две роли пространства, приглашение — только ссылка. Владелец утвердил модель прав: каталог именованных прав, редактируемые пресеты, личные добавления/исключения и приглашения по почте. Результат: часть I спецификации реализована в продукте (база, API, интерфейс), текущие роли переведены в пресеты без потери доступа, приглашения уходят письмом через существующий SMTP.

## Рамки

- **Входит:** часть I спецификации docs/access/access-and-invitations.md: права, пресеты, роли пространства, владение, вход администратора, приглашения по почте, интерфейс настроек.
- **Не входит:** часть II (сервисные аккаунты) — строится в PR #27; группы; матрица с правкой; отслеживание недоставки.
- **Ограничения:** миграции с V20260930000030 (после 026–029 из веток в работе или перенумеровать перед слиянием); Docker только через контекст colima-sprintique-vnext-qa; данные стенда и output/infra не трогать; не сливать.

## Приёмка

- [ ] A1. Спецификация docs/access/access-and-invitations.md финализирована по решениям владельца и закоммичена
- [ ] A2. Каталог прав (14+5), зависимости, пресеты (системные и свои ≤10) с правкой и возвратом по умолчанию, личные добавления/исключения с разницей, auth.can(project, permission) в RLS; финансы через finance.read/finance.write
- [ ] A3. Роли пространства Владелец/Администратор/Участник/Гость, передача владения, защита последнего администратора, явный вход администратора пространства в проект с аудитом; миграция ролей в пресеты без потери доступа
- [ ] A4. Приглашения по почте: несколько адресов, пресет, проекты, хэш токена, 7 дней, повтор/отзыв, лимиты, одинаковые ответы, письмо multipart/alternative, принятие только с тем же подтверждённым адресом
- [ ] A5. Интерфейс настроек по артбордам на компонентах DS: участники, пресеты, редактор прав, «Что может», приглашение, ожидающие приглашения; 390, тёмная тема, a11y
- [ ] A6. Тесты, два ревью, гейты зелёные, PR открыт

## Передача

- **Состояние:** Миграции 030–032 и сервер части I написаны; gradle check и интеграционные тесты Kotlin зелёные (30 тестов)
- **Сейчас:** S2/S3 — HTTP-тесты и интерфейс
- **Дальше:** обновить tests/membership.test.ts под новые приглашения, написать tests/access.test.ts, затем web
- **Незакоммичено:** нет
- **Рабочая копия:** 79 файл(ов): products/sprintique/contracts/membership.ts, products/sprintique/scripts/export-contracts.ts, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/App.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/indexes/Indexes.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/keys/Keys.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/AuditEvents.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/ProjectMembers.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/Projects.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/WorkspaceAudit.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/WorkspaceMembers.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/Workspaces.kt, products/sprintique/server/src/generated/jooq/com/sprintique/database/schema/app/tables/records/AuditEventsRecord.kt и ещё 67 (53 files changed, 1645 insertions(+), 860 deletions(-)) · HEAD b5f28bc
- **Ловушки:**
  - Trigger app.compile_project_member компилирует права при каждой записи project_members; код без preset_id идёт по пути role→системный пресет

## План

### S1. Спецификация: решения владельца [done]
- **Что:** Статус approved, решения по открытым вопросам, без ролей в задачах, часть II: finance.read/write явно, без персональных токенов, создаёт любой участник, лимит 50
- **Как:** правка docs/access/access-and-invitations.md
- **Зачем:** Спецификация — источник для кода и PR #27
- **Приёмка:**
  - [x] документ закоммичен
- **Покрывает:** A1
- **Итог:** коммит b5f28bc: статус approved, решения владельца, без ролей в задачах, часть II по решениям

### S2. База: права, пресеты, миграция ролей, приглашения [active]
- **Что:** V030 права/пресеты/auth.can, V031 перенос ролей, V032 приглашения по почте
- **Как:** Flyway SQL, триггер компиляции, jOOQ-генерация
- **Зачем:** База — источник истины для прав
- **Приёмка:**
  - [ ] миграции с нуля зелёные, эквивалентность ролей проверена
- **Покрывает:** A2,A3,A4

### S3. Сервер: права, пресеты, доступ, приглашения, письмо [todo]
- **Что:** Permission, ProjectAccess по правам, Presets/MemberAccess/WorkspaceAccess/Invitations, MailPort с HTML
- **Как:** Kotlin в access/*, контракты Zod
- **Зачем:** Сценарии и API части I
- **Приёмка:**
  - [ ] unit+integration+HTTP тесты зелёные
- **Покрывает:** A2,A3,A4

### S4. Интерфейс настроек [todo]
- **Что:** Участники, Доступ, Пресеты, редактор прав, Что может, Пригласить, Приглашения, путь получателя
- **Как:** web/*.js на @iquipage/web из vendor
- **Зачем:** Артборды раунда 2
- **Приёмка:**
  - [ ] браузер 1440 light/dark и 390, check:styles
- **Покрывает:** A5

### S5. Ревью, гейты, PR [todo]
- **Что:** R1 после сервера, R2 весь diff, исправления; npm test, verify-vnext; PR
- **Как:** два read-only субагента
- **Зачем:** high-риск
- **Приёмка:**
  - [ ] гейты зелёные, PR открыт
- **Покрывает:** A6

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
