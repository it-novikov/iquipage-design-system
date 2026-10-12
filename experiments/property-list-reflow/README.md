# PF04: минимальное воспроизведение property-list на DS54

**Baseline, без исправления.** Стенд отделяет публичный property-list от CSS и runtime Sprintique, чтобы проверить вклад фиксированных колонок, сокращений и высот в уже замеченную потерю текста. Старые реальные кадры Task остаются в discovery; этот опыт их не подменяет и не повторяет весь продукт.

Источник задачи: [сохранённый discovery](https://github.com/it-novikov/iquipage-design-system/blob/a8efe40cf9f4633f912a3473d80e2f7c9e0ed9f3/docs/implementation/2026-10-12/property-list/discovery.md), SHA256 `e6e222e503790852a43fd195fd75bab3d2854baf8b93cbfb3301c948448d4e7e`. Исходный план зафиксирован **до fixture и runner** и сохранён в [baseline-plan.v1.json](baseline-plan.v1.json), SHA256 `008998d380659f2b9993edc727260bc46ed95735d1842c1b209ba5eeb7cc4689`. До первого запуска root добавил отдельную проверку большого шрифта в широком контейнере. Активный [baseline-plan.json](baseline-plan.json), revision 2: SHA256 `724f1e889dc621e178ee173cb4ef8fa1fbfd190b0249decc208e75cc89de5582`.

## Что сравнивается

| Профиль | Viewport | Контейнер | Root font |
| --- | --- | ---: | ---: |
| wide-normal | 1280×1000 | 615px | 16px |
| narrow-normal | 390×1000 | 349px | 16px |
| narrow-text200 | 320×1000 | 270px | 32px |
| wide-tight-text200 | 1280×1000 | 270px | 32px |
| wide-text200 | 1280×1000 | 615px | 32px |

Пара narrow-text200 / wide-tight-text200 имеет одинаковые контейнер и шрифт, но разные viewport. Она позволяет проверить объяснение «проблема только на телефонном viewport». Wide-normal / wide-text200 отдельно меняет только root font; wide-tight-text200 / wide-text200 — только ширину контейнера. Так можно проверить фиксированный label track при достаточном месте для значения и обосновать будущий порог reflow. Для labels в каждом кадре измеряются фактические grid tracks, font и полный текст; это ограниченный различающий опыт, не полная матрица всех сочетаний.

В едином property-list находятся реальные публичные `iq-select`, `iq-date-field`, `iq-combobox`, `iq-tag-picker` и документированные статичные строки Plan, author, status и parent. Статичные строки — синтетическое содержимое публичного recipe, **не доказательство фактических прав пользователя Task**. Два обычных поля с теми же данными и шириной находятся вне `.iq-properties`: это проверка вклада recipe, не предложенный новый дизайн Task.

Компоненты создаются через публичные элементы/API; их внутренний HTML не копируется. `host.css` задаёт только внешний отступ и подписи стенда. Ни одно правило property-list или control не переопределяется. Импортируются только exact `@iquipage/web/core` и `@iquipage/web/styles.css`; product CSS/runtime отсутствуют.

## Запуск и границы доказательства

Из корня репозитория после установки **существующих** product dependencies:

```bash
node experiments/property-list-reflow/run.mjs --build-only
PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node experiments/property-list-reflow/run.mjs
```

Локальный `--build-only` не запускает Chromium. Native run предназначен для уже подготовленного workflow с Playwright 1.62.1. Результаты создаются в `output/build-only` или `output/browser` внутри эксперимента; environment variable `PROPERTY_REFLOW_EVIDENCE_DIR` позволяет задать отдельный каталог.

Runner проверяет exact package archive и все установленные файлы DS, пишет фактические source revision/tree, dirty/untracked source, source hashes, package/lock, plan/data hashes, build input/output fingerprints и среду. Перед страницей выставляется фиксированное browser time для стабильной подписи срока. Публичный [Playwright Clock.setFixedTime](https://playwright.dev/docs/api/class-clock#clock-set-fixed-time) фиксирует Date, сохраняя работу timers; это не патч DS или системного времени.

Каждый профиль получает viewport PNG, full-document PNG и raw geometry. Полный документ не означает, что все строки помещаются в начальном viewport. Перед capture нет открытия контролов, focus/scroll repair, DOM перестановок или попыток исправить CSS. Ошибка одного профиля не стирает другие; состояние и screenshot сохраняются до закрытия context.

DOM Range отражает размещение полного текста, в том числе текста за ellipsis. Это **не маска нарисованных глифов**. Для отдельных символов дополнительно сохраняются canvas metrics и совместимые оценки ink bounds; реальное отсечение и визуальное перекрытие требуют просмотра PNG. Фиксированная высота меньше line-height сама по себе не маркируется доказанным отсечением. Встроенный однострочный input combobox измеряется отдельно; ему не обещается многострочный режим.

## Как читать статус

- `BUILT_NOT_RENDERED` — собраны entry и provenance, native capture не выполнялся.
- `CAPTURED_WITH_OBSERVED_CONSTRAINTS` — capture завершён, измерения содержат сокращения, переполнения или пересечения, перечисленные в observations.
- `CAPTURED_WITHOUT_CLASSIFIED_CONSTRAINTS` — capture завершён, автоматические признаки не найдены; это не визуальная приёмка.
- `FAILED` / `BLOCKED` — ошибка фикстуры, среды, provenance или capture; подробности остаются в raw evidence.

**Target acceptance всегда `NOT_RUN`.** Нет assertion «дефект должен присутствовать», которое делало бы baseline зелёным за ожидаемую ошибку; нет assertion «ничего не должно обрезаться», выдающего текущую поставку за исправленный вариант. Human, backend, реальные permissions, настоящие browser zoom/Safari/Firefox/iOS/VoiceOver этим опытом не проверяются.

Следующий шаг после native capture — сопоставить raw rows и PNG с неизменёнными правилами DS54, отделить подтверждённую причину от предположений, затем проектировать конкретный reflow. Новый DS release и adoption в Task относятся к следующему этапу.

## Исправление измерителя после первого run

[Run38243334999](https://github.com/it-novikov/iquipage-design-system/actions/runs/38243334999) на head `3f9e8992c057e0548245f7dca7c089e7e345d4be` завершился `FAILED`: пять профилей сохранили реальные кадры, но проверка `Actual value surface: status` остановила классификацию. Измеритель ошибочно искал select/combobox surface среди непосредственных детей элемента; в actual DS54 она находится внутри `.iq-select-wrap` (`src/modules/components.js:148`). Raw `value:null` у всех select/combobox и успешный доступ к direct-child date/tag/static rows согласуются с этим источником.

Исправлен только точный read-only selector измерителя. Проверка наличия поверхности и literal data сохранена; fixture, DS, план, геометрия страницы и PNG не исправлялись. Повторный запуск нужен из-за конкретного дефекта capture, а не для получения случайного PASS. Первый raw остаётся отдельным исходным результатом; он не является полноценной геометрией значений.
