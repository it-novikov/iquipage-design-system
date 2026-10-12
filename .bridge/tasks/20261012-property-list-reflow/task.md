---
bridge: 1
id: 20261012-property-list-reflow
title: "Свойства: установить общий контракт читаемости и переноса"
status: active
risk: standard
owner: it-novikov
branch: fix/property-list-reflow
base: 6423443d71a0817570281cf28822a3c14f7db684
created: 2026-10-12
updated: 2026-10-12T11:40:19Z
links:
---

# Свойства: установить общий контракт читаемости и переноса

## Цель

В списке свойств человек должен сразу прочитать название поля и его текущее значение. В настоящих кадрах Task при увеличенном тексте подписи и значения усечены, статичные строки переносятся тесно. В общей DS54 обнаружены фиксированная колонка, высоты и nowrap/ellipsis. Сначала отдельно воспроизвести публичный pattern без Sprintique, затем определить общий контракт читаемости и выбрать простое решение по сравнению вариантов.

## Рамки

- **Входит:** минимальный public DS54 baseline, пассивные geometry/PNG и provenance, независимый спор вариантов адаптивной пары label/value. Этот checkpoint содержит стенд и два companion steps существующего workflow.
- **Не входит:** новая DS поставка или product CSS в данном checkpoint; backend, права, onboarding и изменение состава свойств. Реализация выбранного контракта получает собственный проверяемый объём после baseline.
- **Ограничения:** frozen base PR83 `6423443d…`, exact DS54. Параллельно в main уже слит PR84 (`4f181ff…`); DS-only baseline от этого не становится проверкой нового Task. Количественных квот PR нет. Пользователь разрешил работу и публикацию; merge/deploy/npm publish не выполняются.

## Приёмка

- [ ] A1. Пять заранее заданных профилей снимают настоящие публичные компоненты и статичные строки без product imports/overrides; полный исходный текст, геометрия и PNG сохраняются, ошибки не маскируются.
- [ ] A2. Причины отделены от предположений по exact DS54 и реальным кадрам. Два подхода сопоставлены с точки зрения человека, эстетики, API для агентов и устойчивости layout.
- [ ] A3. Выбран следующий ограниченный scope с правилами проверки. Baseline не объявляется исправлением, native source capture не подменяет пользовательскую приёмку.

## Передача

- **Состояние:** Attempt1 FAILED at value surface assertion: select/combobox wrapped one level deeper than measurement selector. Actual screenshots and raw were preserved.
- **Сейчас:** S2 — corrected passive selector before new native capture
- **Дальше:** Publish selector correction, inspect new complete capture; preserve failed first raw separately.
- **Незакоммичено:** Harness, README, эта карточка и два workflow steps подготовлены; root сохраняет checkpoint. Product/DS/package/lock не изменены.
- **Рабочая копия:** 2 файл(ов): experiments/property-list-reflow/README.md, experiments/property-list-reflow/measure.mjs (2 files changed, 8 insertions(+), 1 deletion(-)) · HEAD 3f9e8992c
- **Ловушки:**
  - Локальный Chromium без /proc уже установлен как неработающий; повторно не запускать. Build-only raw создан до двух сохранений provenance/profile JSON, поэтому его runner hash исторический; compiled inputs/outputs не изменены. Range boxes не являются маской нарисованных glyphs.
  - Attempt1 all5 raw value:null on select/combobox; date/tag/static values present. DS components.js148 confirms select-wrap parent. Do not weaken literal-value assertion.
- **Проверка:** Corrected measure syntax PASS. Fixture/build inputs/DS/plan unchanged; no repeat build needed for measurement-only change.

## План

### S1. Локализовать наблюдаемую проблему [done]

- **Что:** Сопоставить actual Task evidence с общим public property-list contract и потребителями.
- **Как:** Read-only source review DS54, длинные/статичные/readonly значения, собственный product pill.
- **Зачем:** Исправлять общую причину вместо отдельного viewport override.
- **Приёмка:**
  - [x] Discovery с исходными путями, SHA, фактами и границами сохранён.
- **Покрывает:** A2
- **Итог:** Discovery SHA256 `e6e222e503790852a43fd195fd75bab3d2854baf8b93cbfb3301c948448d4e7e`. Новый minimal native пока NOT_RUN.

### S2. Получить DS-only baseline [active]

- **Что:** Пять профилей ширины/текста, public controls и static rows, обычные select/date вне properties как сравнение.
- **Как:** Compiled Vite preview, installed tar byte equality, Chromium из существующего CI; passive capture без force, ремонта focus/scroll, retries и runtime overrides.
- **Зачем:** Различить вклад контейнера, текста и recipe на реальном renderer.
- **Приёмка:**
  - [ ] Все профили и первичные данные сохранены с точным source tree и планом.
- **Покрывает:** A1, A2

### S3. Сопоставить варианты и определить реализацию [todo]

- **Что:** Независимый спор автоматического intrinsic reflow и opt-in container mode; уточнить static/editable parity и product-owned pill.
- **Как:** Отдельные позиции разных ролей, actual baseline и предметное сравнение цены normal density/читаемости enlarged text.
- **Зачем:** Не вводить сложность или новую обязанность consumer без наблюдаемой пользы.
- **Приёмка:**
  - [ ] Причины, решения, возражения и следующий acceptance scope сохранены отдельно от immutable baseline.
- **Покрывает:** A2, A3

## Решения

- **D1.** Контейнер и размер текста меняются раздельно; телефонный breakpoint не считается достаточным объяснением дефекта.
- **D2.** Baseline возвращает `CAPTURED_WITH_OBSERVED_CONSTRAINTS` либо `CAPTURED_WITHOUT_CLASSIFIED_CONSTRAINTS`, а target/human/backend acceptance остаются `NOT_RUN`. Ни один статус не одобряет существующее усечение.
- **D3.** Общие checks существующего workflow сохранены. Два новых steps ограничены этой экспериментальной веткой; baseline не навязывается всем будущим PR.
- **D4.** Гипотеза text-relative label/value budgets ещё не является public API или принятой CSS реализацией. Не усложнять layout ради растяжения невидимого label box.

## Вопросы

Нет блокирующих вопросов к владельцу. Требуемое продолжение разрешено в сессии.

## Контекст

- [Discovery и исходные Task evidence](https://github.com/it-novikov/iquipage-design-system/blob/a8efe40cf9f4633f912a3473d80e2f7c9e0ed9f3/docs/implementation/2026-10-12/property-list/README.md).
- [Стенд, план, команды и границы](../../../experiments/property-list-reflow/README.md).
- Active plan v2 SHA256 `724f1e889dc621e178ee173cb4ef8fa1fbfd190b0249decc208e75cc89de5582`; original v1 SHA256 `008998d380659f2b9993edc727260bc46ed95735d1842c1b209ba5eeb7cc4689`.
- Final runner SHA256 `b53a9c4e8087da71b7c7a459a139ae76f61cbf2bafbb5edc7406118749d71190`; measure SHA256 `020d96242755153ed5f9fa4b216d20f17da60a3c868af6263e5040fed72a8542`.
- Root source review: public constructors/attributes, no product imports, explicit fixed Date, full text/range metadata, preservation before context close; fixture/build inputs unchanged after preservation-only adjustment.
