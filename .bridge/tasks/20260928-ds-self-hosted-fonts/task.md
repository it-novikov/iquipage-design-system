---
bridge: 1
id: 20260928-ds-self-hosted-fonts
title: "DS: самостоятельная поставка Inter (0.6.0-vnext.22)"
status: review
risk: standard
owner: it-novikov
branch: feature/ds-self-hosted-fonts
base: main
created: 2026-09-28
updated: 2026-09-28T22:54:23Z
links:
---

# DS: самостоятельная поставка Inter (0.6.0-vnext.22)

## Цель

Какая проблема, у кого и какой проверяемый результат нужен. 2–6 предложений.

## Рамки

- **Входит:** …
- **Не входит:** …
- **Ограничения:** …

## Приёмка

- [x] A1. A1. Пакет содержит assets/fonts/InterVariable.woff2 (Inter 4.1, OFL 1.1, wght 400–700, opsz 14–32, latin+cyrillic) и tokens/fonts.css с @font-face для Inter и Inter Display; экспорт ./fonts.css
- [x] A2. A2. dist/iquipage.css начинается с @font-face и грузит шрифт относительным путём ../assets/fonts/; каталоги index/whiteboard/workbench не ходят в Google Fonts и делают preload шрифта
- [x] A3. A3. Метрический fallback Inter Fallback (Arial с size-adjust) в стеках --iq-font и --iq-display; swap не двигает вёрстку
- [x] A4. A4. Версия 0.6.0-vnext.22: package.json, semantic.json, README-changelog, PROVENANCE.json, INTEGRATION.md; npm run build и npm test зелёные; tests/vnext22.test.cjs фиксирует контракт
- [x] A5. A5. Проект claude.ai/design получает тот же woff2 и fonts.css вместо 18 статических TTF

## Передача

- **Состояние:** S1–S5 готовы; PR #21 на main, оба коммита запушены, гейт продукта 192/192
- **Сейчас:** ревью и слияние владельцем
- **Дальше:** после слияния карточка в done; повторный визуальный QA каталога в Inter по плану волны 1
- **Незакоммичено:** нет
- **Рабочая копия:** нет · HEAD 72c5960 · снято 2026-09-28T22:54:23Z
- **Ловушки:**
  - engines node >=24 <25, локально node 26: build и test проходят, npm install предупредит
- **Проверка:** cd libraries/iquipage && npm run build && npm test; cd products/sprintique && npm ci && npm run build && JAVA_HOME=/opt/homebrew/opt/openjdk@25 TEST_S3_CONFIG=<storage.json> node scripts/test.mjs
- **Причина:** review — claude, 2026-09-28T22:54:23Z: Готово к слиянию: PR #21

## План

### S1. Подмножество Inter 4.1 [done]
- **Что:** Скачать Inter-4.1.zip, ограничить wght 400–700, вырезать latin+cyrillic, woff2
- **Как:** scripts/subset-inter.py на fonttools+brotli; sha256 в assets/fonts/README.md
- **Зачем:** Один вариативный файл 109 KB вместо CDN и 18 TTF
- **Приёмка:**
  - [x] woff2 ≤ 120 KB, 248 кириллических глифов, оси opsz 14–32 и wght 400–700
- **Покрывает:** A1
- **Итог:** assets/fonts/InterVariable.woff2 109 172 B, sha256 c8126c77…, 668 глифов, кириллица 248, оси opsz 14–32, wght 400–700

### S2. fonts.css, сборка, шаблоны, версия [done]
- **Что:** tokens/fonts.css, prepend в dist css, preload в трёх шаблонах вместо Google Fonts, vnext.22
- **Как:** build.mjs: fontsCSS первым; demoCSS с путём assets/fonts/ для корневых каталогов
- **Зачем:** Продукт импортирует @iquipage/web/styles.css и получит шрифт без отдельных шагов
- **Приёмка:**
  - [x] npm run build без ошибок; grep googleapis по src/*.html пуст; dist/iquipage.css начинается с @font-face
- **Покрывает:** A2,A3,A4
- **Итог:** build: dist/iquipage.css начинается с @font-face, три каталога с preload и без googleapis; в браузере document.fonts: Inter и Inter Display loaded, единственный запрос /assets/fonts/InterVariable.woff2

### S3. Документация и тест [done]
- **Что:** README-changelog, INTEGRATION.md раздел «Шрифт», PROVENANCE.json, tests/vnext22.test.cjs
- **Как:** Тест читает package.json, fonts.css, dist css и шаблоны
- **Зачем:** Контракт поставки проверяется в CI
- **Приёмка:**
  - [x] npm test зелёный
- **Покрывает:** A4
- **Итог:** npm test 289/289; README, INTEGRATION.md «Шрифт», PROVENANCE.json fonts

### S4. Синхронизация проекта claude.ai/design [done]
- **Что:** Заменить fonts/InterDisplay-*.ttf на fonts/InterVariable.woff2 + OFL, переписать tokens/fonts.css
- **Как:** DesignSync finalize_plan/write_files/delete_files
- **Зачем:** Каталог в claude.ai/design рендерится тем же шрифтом, что и продукт
- **Приёмка:**
  - [x] list_files показывает один woff2, чекер проекта без предупреждения о шрифте
- **Покрывает:** A5
- **Итог:** DesignSync plan e2304bb3f3b6: записаны fonts/InterVariable.woff2, fonts/OFL.txt, tokens/fonts.css (путь ../fonts/); удалены 18 InterDisplay-*.ttf

### S5. Адаптация релиза в Sprintique [done]
- **Что:** vendor/iquipage-web-0.6.0-vnext.22.tgz, package.json, lockfile с integrity, library-contract, README sha256, docs
- **Как:** npm pack в библиотеке, git mv тарбола, npm ci; vite build кладёт InterVariable-*.woff2 в dist/assets
- **Зачем:** Продукт впервые рендерится в Inter, а не в системном шрифте
- **Приёмка:**
  - [x] npm ci и npm run build продукта чисто; dist содержит woff2; check:boundaries PASS; полный node scripts/test.mjs зелёный
- **Покрывает:** A4
- **Итог:** npm ci и npm run build продукта чисто; dist/assets/InterVariable-CXsUriRB.woff2; check:boundaries PASS; node scripts/test.mjs 192/192 (JDK 25, S3 стенда ux-ds); стенд 4344: document.fonts Inter/Inter Display loaded, единственный запрос шрифта из бандла; доска и планирование в обеих темах в Inter

## Решения

- **D1** (2026-09-28) Один вариативный InterVariable.woff2 вместо статических Inter Display — ось opsz даёт дисплейные формы сама; курсив не поставляется (4 правила font-style в DS), браузер синтезирует
- **D2** (2026-09-28) Метрический fallback: Arial с size-adjust 107.4 %, ascent 90.2 %, descent 22.48 % (значения генератора next/font для Inter) — swap без сдвига вёрстки

## Вопросы

Пока нет.

## Контекст

- Что читать и какие команды запускать, по одной строке.
