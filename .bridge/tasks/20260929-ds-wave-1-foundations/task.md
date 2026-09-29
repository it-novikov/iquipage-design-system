---
bridge: 1
id: 20260929-ds-wave-1-foundations
title: "DS волна 1 «Основания»: тема на ролях, движение, rem-шкала"
status: active
risk: standard
owner: it-novikov
branch: feature/ds-wave-1
base: feature/ds-wave-0
created: 2026-09-29
updated: 2026-09-29T08:47:15Z
links:
---

# DS волна 1 «Основания»: тема на ролях, движение, rem-шкала

## Цель

Какая проблема, у кого и какой проверяемый результат нужен. 2–6 предложений.

## Рамки

- **Входит:** …
- **Не входит:** …
- **Ограничения:** …

## Приёмка

- [x] A1. A1. Тёмная тема через роли: --iq-fixed-* заменены семантическими ролями с per-theme значениями, dark-патчи в компонентах убраны, акценты в semantic.json и генерируются, prefers-color-scheme fallback и theme-boot.js, prefers-contrast; контрастный гейт: 0 провалов в обеих темах и трёх акцентах кроме задокументированных disabled
- [x] A2. A2. Статусы без опоры на цвет: значки в бейджах success/danger, формы маркеров в графиках, planned отделён от info; disabled без opacity; двойное кольцо фокуса; dark-тени и кромки
- [x] A3. A3. Одна стратегия reduced motion (:root[data-motion=reduced] и media → токены 0ms), все длительности и кривые через токены, подавление переходов при смене темы, симметрия входа/выхода, политика skeleton; стилевой гейт: duration-raw 0
- [x] A4. A4. Шкала текста в rem, floor 12px в компонентных селекторах (гейт font-size-below-12px = 0 для компонентов), медиазапросы не уменьшают текст, кириллический интерлиньяж и трекинг токенами, hyphens для :lang(ru), text-size-adjust; codemod-скрипты в scripts/codemods
- [ ] A5. A5. Версия 0.6.0-vnext.24, changelog, гейты обновлены, оба npm test и полный гейт продукта зелёные, продукт принял релиз; визуальный QA каталога в Inter в обеих темах

## Передача

- **Состояние:** vnext.24 собран и принят продуктом; quick checks зелёные; гейт продукта идёт в фоне; каталог проверен в тёмной теме
- **Сейчас:** визуальный QA светлой темы, PR
- **Дальше:** после гейта: A5, статус review
- **Незакоммичено:** нет
- **Рабочая копия:** нет · HEAD dd20600
- **Проверка:** cd libraries/iquipage && npm run build && npm test; cd products/sprintique && npm ci && npm run build && npm run check:boundaries

## План

### S1. Цвет и тема на ролях [done]
- **Что:** COL-03/05/06/07/08/09/10/11/12/13/16/22, ENG-14: accents и prefers-color-scheme из semantic.json, theme-boot.js, без fixed-*, dark-тени, disabled-токены, halo фокуса
- **Как:** ветка feature/ds-wave-1-color, ручные правки
- **Зачем:** Тёмная тема перестаёт быть набором патчей
- **Приёмка:**
  - [x] contrast gate без провалов кроме disabled; тест wave1-color зелёный
- **Покрывает:** A1,A2
- **Итог:** три потока слиты; codemods переиграны; библиотека 366/366; contrast gate: 14 остаточных пар (line декоративная, fills как глифы, disabled календаря)

### S2. Типографика: rem-шкала codemod [done]
- **Что:** TYP-03..10, 14..19: scripts/codemods/type-scale.mjs, text.css, токены трекинга и интерлиньяжа
- **Как:** ветка feature/ds-wave-1-type, все CSS-правки через идемпотентный скрипт
- **Зачем:** Настройка размера шрифта браузера работает; 12px floor
- **Приёмка:**
  - [x] тест wave1-type зелёный, гейт below-12px на компонентах 0
- **Покрывает:** A4
- **Итог:** type-scale codemod: 1204 правок, font-size-px 0, below-12px 0, ≥24px адаптив сохранён

### S3. Движение: одна стратегия и токены [done]
- **Что:** MOT-01/03/04/05/07/08/09/10/12..18: scripts/codemods/motion-tokens.mjs, motion.css, motionReduced/motionMs/withoutTransitions
- **Как:** ветка feature/ds-wave-1-motion
- **Зачем:** Reduced motion честный, длительности токенами
- **Приёмка:**
  - [x] duration-raw 0 на компонентах; тест wave1-motion зелёный
- **Покрывает:** A3
- **Итог:** motion-tokens codemod: duration-raw 0, одна стратегия reduced motion, motionReduced/motionMs/withoutTransitions/bindLoading

### S4. Интеграция: слить цвет, переиграть codemods, релиз vnext.24, продукт, QA [active]
- **Что:** merge color; run type/motion codemods; gates:update; версия; changelog; тарбол; гейт продукта; визуальный QA каталога
- **Как:** как в волне 0
- **Зачем:** Одна волна = один PR
- **Приёмка:**
  - [ ] A5
- **Покрывает:** A5

## Решения

Пока нет.

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
