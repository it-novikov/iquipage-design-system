---
bridge: 1
id: 20260928-repo-cleanup
title: Репозиторий без исторического хлама
status: active
risk: standard
owner: it-novikov
branch: chore/repo-cleanup
base: main
created: 2026-09-28
updated: 2026-09-28T12:49:14Z
links:
---

# Репозиторий без исторического хлама

## Цель

В репозитории лежали исторические поставки и модули прошлых этапов (поставка DS 05.7, `packages/`, `deliveries/`, отчёты `docs/vnext` и старых раундов) с собственным CI, а README и правила агента описывали Fastify-бэкенд, Keycloak и статус прошлых раундов. Владелец: «хлам не надо собирать, проект должен быть полностью актуальный и чистенький». Результат — в репозитории только живой код, документация о текущем состоянии и гейты, которые их проверяют; история остаётся в git.

## Рамки

- **Входит:** удаление `design-system/`, `design-system.zip`, `packages/`, `deliveries/`, `docs/vnext` (правила границ переезжают в `docs/BOUNDARIES.md`), `docs/board`, `docs/experience-r2`, `docs/experience-r3`, одноразового `scripts/materialize-vnext.mjs`, CI `maps.yml` и `planning.yml`, устаревшего аудита продукта; README, AGENTS.md и BOUNDARIES по текущему состоянию; остатки Keycloak в продукте (запасной `identity.json`, упоминания).
- **Не входит:** библиотека DS (тема Keycloak удалена в PR #19 вместе с vnext.21), решения ADR и журналы (исторические записи), `agent-skills/` и `.agents/skills/`.
- **Ограничения:** удалять только то, на что не ссылается живой код, CI и документация; история — в git.

## Приёмка

- [ ] A1. В репозитории нет исторических поставок, модулей и отчётов, на которые не ссылается живой код; README, AGENTS.md и границы описывают текущее состояние
- [ ] A2. Полный гейт verify-vnext и тесты продукта зелёные после удаления

## Передача

- **Состояние:** Задача заведена, работа не начата.
- **Дальше:** Уточнить рамки с владельцем и составить план.
- **Незакоммичено:** нет

## План

### S1. Удаление и актуализация [done]
- **Что:** Удалить исторические каталоги и их CI, переписать README/AGENTS/BOUNDARIES, убрать остатки Keycloak в продукте
- **Как:** git rm; проверка ссылок git grep; правка документов
- **Зачем:** Просьба владельца: актуальный и чистый проект
- **Приёмка:**
  - [x] git grep не находит ссылок на удалённое в живом коде и документах
- **Покрывает:** A1
- **Итог:** Удалены design-system/ (поставка 05.7), design-system.zip, packages/ (maps, planning, work-list), deliveries/, docs/vnext (BOUNDARIES.md → docs/BOUNDARIES.md), docs/board, docs/experience-r2, docs/experience-r3, scripts/materialize-vnext.mjs, CI maps.yml и planning.yml, продуктовый frontend-audit-r4.md; README, AGENTS.md, BOUNDARIES — по текущему состоянию; stand-config без identity.json, упоминания Keycloak убраны. git grep ссылок не находит.

### S2. Гейт [active]
- **Что:** verify-vnext и тесты продукта
- **Как:** scripts/verify-vnext.mjs с TEST_S3_CONFIG
- **Зачем:** Удаление не должно сломать сборку и проверки
- **Приёмка:**
  - [ ] verify-vnext PASS
- **Покрывает:** A2
- **Зависит от:** S1

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Проверка ссылок: `git grep -e design-system/ -e docs/vnext -e packages/maps -e deliveries/`.
- Гейт: `LC_ALL=C TEST_S3_CONFIG=<storage.json> node scripts/verify-vnext.mjs`.
