# Карта принятой Web-поставки 05.7

Пакет **`@iquipage/web` 0.5.7**, private/local, не обещать установку из npm. Архив зафиксирован в `assets/ds-release-lock.json`. Текущую DS не изменять этим скиллом. Сначала проверять новую выдачу владельца; имя версии само по себе недостаточно.

## Перед планом внедрения прочитать в supplied root
`README.md`, `docs/INTEGRATION.md`, `docs/HANDOFF-05.7.md`, `docs/DAILY-WORK-API.md`, `docs/EXTENSION-API.md`, `docs/WHITEBOARD-API.md`, `types/core.d.ts`, `types/extensions.d.ts`, `types/whiteboard.d.ts`, `dist/entry-manifest.json`, `tokens/semantic.json`. Визуальные примеры: `index.html`, `workbench.html`, `whiteboard.html`. Инвентарь в `references/capability-index.json` — указатель, не замена чтению точного API.

## Публичные входы
| Потребность | Подключение | Не путать |
|---|---|---|
| Ежедневные контролы, формы, меню, даты, Markdown, layout | `dist/core.js` / `@iquipage/web/core`, `registerCore()` | Не регистрирует graph/roadmap/crop/whiteboard. |
| Roadmap, graph, remote-combobox, controlled tags, data-chart, crop | `dist/advanced.js`, `registerAdvanced()` | Использует core-зависимости, не whiteboard. |
| Свободная доска | `dist/whiteboard.js`, `registerWhiteboard()` | Своя модель, не импорт graph. |
| Совместимость без lazy split | `dist/iquipage.js`, `registerIquipage()` | Полный вход импортирует все семейства. |
| Стиль | `dist/iquipage.css` / `@iquipage/web/styles.css` | Один общий CSS. Не смешивать версии. |

ESM обслуживается через HTTP(S). Автономные HTML — демонстрации, не production entry. `src/modules` — CommonJS-исходники сборки. `dist/modules` — детали графа импортов, не публичный контракт для потребителя.

## Сопоставление задач
- `iq-work-layout` + `iq-work-header`: header/navigation/summary/toolbar/default data/footer; compact/comfortable; `.iq-work-table` — простая таблица, не enterprise data-grid.
- `iq-date-field`/`iq-calendar`/`iq-time`: собственный календарь DS, не browser date popup. Проверить форму, вложенный dialog, month navigation, время, timezone приложения.
- `iq-plan`: даты завершения `due`. `iq-roadmap`: start/end, иерархия, milestone, FS/SS/FF/SF. Семантики backend blocks/precedes/related не перекодировать в календарный lag автоматически.
- `iq-graph`: nodes/edges, структурированные отношения, capability/read rules, временные mediaSources и presence. Не серверный исполнитель процесса.
- `iq-whiteboard`: objects/connections, свободные заметки, рамки, схемы и 14 фигур, Markdown/alignment, undo/redo. Не CRDT, не realtime-сервис, не BPMN runtime. Видимые List и Pencil убраны; legacy API не повод вернуть их в UI.
- `iq-remote-combobox`: source/пагинация/abort/retry/selection. `iq-tag-input`: controlled value. Старые `iq-combobox`/`iq-tags` не считать аналогами без проверки.
- `iq-data-chart`: series/axes/legend/tooltips/table. Старые `ui.chart()`/`sparkline()` содержат фиксированные демонстрационные значения; не использовать их как аналитику приложения.
- `iq-markdown-editor`: редактирование. `iq-markdown-viewer`: чтение тем же safe renderer без editor chrome. Viewer не принимает результат агента. Markdown subset не означает полный CommonMark/GFM.
- `iq-image-crop`: ручная область, zoom, File/Blob, export, controlled requests. Не подменять центральной автообрезкой.
- `iq-file-preview`/`configurePDFPreviews`: медиа и PDF renderer, отдельно от прав и серверного upload. Не заявлять автономную поддержку PDF без своего renderer.
- `ui` helpers/документированная exact markup: alert, badge, button, form, segmented, avatar и др. Native elements в таком шаблоне допустимы. Некоторые helper arguments содержат доверенную markup-строку: непроверенные данные выводить через textContent/escapeHTML, не raw attrs. `ui.avatars()` содержит фиксированные демонстрационные инициалы; для реальных участников использовать supplied composition, не эти данные.

## Контракты изменений
Структурированные данные — properties, не склейка JSON в HTML. События намерения не равны сохранению; приложение валидирует права, сохраняет по API и принимает/отклоняет результат с текущей revision/request identity. Размонтирование снимает listeners, отменяет запросы и освобождает Blob URL. Фокус, selection и viewport должны переживать переходы по согласованному сценарию.

Отдельный production React-wrapper и нативные Compose/SwiftUI-компоненты **не поставлены**. Framework adapter можно сделать через публичные свойства/events и lifecycle. Новый нативный UI-kit требует согласованной поставки DS; перекраска Material не считается full IQUIPAGE.

## Проверенные при подготовке скиллов ограничения
- `types/core.d.ts` объявляет `version:'0.5.6'`, а runtime/package — `0.5.7`. Это обнаруженное несовпадение; не исправлено в навыках, потому что архив DS сохранён.
- `ui` объявлен как `Record<string,unknown>`; часть зарегистрированных элементов не имеет полноценных классов в core-декларациях. Факт регистрации не даёт права выдумать props.
- Исторический WebKit touch календаря остаётся внешним gate до настоящего повторения. Playwright WebKit не равен native Safari; Chromium tap не закрывает WebKit.
- Whiteboard router ограничен 40 препятствиями, нет полной виртуализации, глобального обхода всех пересечений, CRDT и исполнения автоматизаций.
- Цветовые пары поставщика и тесты библиотеки — только исходные доказательства. Каждый продукт требует тестов своего CSS, шрифтов, моделей, браузеров и API.

## Обновление на другую поставку
Сначала новый архив и его владелец/approval → manifest verification → diff public exports/types/tokens/capabilities → повторение known regressions → capability mapping → новый release lock. Не перезаписывать pinned hash ради зелёного теста. Версионированный lock должен объяснять переход, не «always latest».
