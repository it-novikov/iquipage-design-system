## Разбор «Планирование → Список» (Sprintique) в языке IQUIPAGE

Источники: 6 скриншотов, `products/sprintique/ui/planning/src/planning.css`, `markup.js`, `group-header.js`, `index.js`, `web/shell.css`; DS `tokens/tokens.css`, `foundation.css`, `everyday.css`, `work-list.css`, `settings.css`, README; эталон `ui/src/board/board.css`, `docs/ux-ds-alignment.md`.

### Диагноз (10 пунктов)

1. **Три яруса переключателей.** `.sq-page-heading` (24px) + `.pn-views-row` с двумя `.iq-segmented` + `.pn-toolbar` с третьим `.iq-segmented` — до первой задачи ~260px. Три сегмента одной формы (`--iq-recessed`, radius 9px) на трёх смысловых уровнях (вид, срез, готовность) различаются только положением.
2. **Контейнер кричит громче содержимого.** `.pn-group` — карточка `--iq-radius-lg` (24px), `--iq-raised`, рамка `--iq-line`. Радиус крупнее любой поверхности DS (`.iq-settings-panel` — `--iq-radius-md` 16px, кнопки 8px). В тёмной теме `--iq-raised` #202023 на `--iq-canvas` #0D0D0F читается как модальная плашка, а не как зона длинной страницы.
3. **Два механизма для одного «состояния группы».** Бэклог получает фон `--iq-surface`, активный релиз — рамку `color-mix(--iq-info 40%)`, хотя статус уже назван бейджем. На мобиле бэклог становится серым блоком без причины.
4. **Заголовок группы — три голоса в строке.** `h2` 18px (`--iq-type-title-size`) + залитый `.iq-badge` (`--iq-info-fill`/`--iq-planned-fill`, 600) + «Спринт» 13px. Факты на второй строке сдвинуты на `calc(36px + 20px + 16px)` = 72px — не совпадают ни с чекбоксом, ни с названием.
5. **Прогресс дублирует сам себя.** `.pn-progress` 120px и текст «Готово 0 из 2» рядом; при 0% полоса `--iq-line` — серый штрих посреди фактов.
6. **Строка 56px, содержания — 20px.** `.iq-work-list td{padding:8px}` + ghost-кнопки `.iq-btn.sm` 36px в названии, исполнителе и сроке: три отдельные hit-area с собственным hover в одной строке; hover ячейки светится отдельно от строки.
7. **Цветные названия спорят со статусом.** `tr[data-task-emphasis]` красит текст названия в `--iq-task-epic-text`/`-high-text`/`-critical-text`; в бэклоге 6 из 11 строк цветные. Доска делает наоборот: `.task-card-title` остаётся `--iq-ink` 500 14px, сигнал уходит в световое поле `--task-light-*`.
8. **«Мягкие» бейджи не мягкие — дыра в токенах.** `.iq-badge.soft.warning`/`.soft.success` берут `--iq-warning-bg` #FFB343 и `--iq-success-bg` #2CB88A — это fill-цвета, а не тинты (у info/planned/danger тинты есть: #E9F1FF/#F3EAF8/#FFF0F2). В тёмной теме `--iq-warning` = `--iq-warning-bg` = #FFB343 — текст «На проверке», «Черновик» исчезает; `--iq-success` #54CDA0 на #2CB88A — контраст ~1.3:1.
9. **«Ёлочка» — сетка, которой нет нигде в продукте.** `.pn-tree` 1.5px `color-mix(--iq-muted 40%)` пересекает горизонтальные `--iq-line` строк, плюс заливка дочерних `color-mix(--iq-surface 60%)`, плюс отступ — три способа сказать «вложено». Доска говорит это подписью (`.task-card-parent`, 11px `--iq-muted`) и сводкой (`.task-subtasks-summary`), `iq-relation-map` — положением в дорожке, без коннекторов-уголков.
10. **Мобильная строка рассыпана.** `.iq-work-list-id` скрыт, но `.pn-check-space`/`.pn-disclosure-space` (36px каждая) остаются — название начинается в 140px от края; `td[data-column=date]` растянут третьей строкой с пустой правой половиной; ~300px на три факта.

### Направление (5 принципов)

1. **Свет — смысловой поверхности.** Релиз — не карточка, а `.iq-section` на канве: `border-top:1px solid var(--iq-line)`, без радиуса и `--iq-raised`. `--iq-surface` остаётся только под hover строки и под `.pn-selection`.
2. **Один голос на строку.** Название `--iq-ink`, ключ `--iq-mono` `--iq-muted`, тон — только у статуса (`.iq-badge.soft`) и у срока (`data-tone`). Приоритет — не цвет текста.
3. **Ритм 8.** Строка 40px, заголовок группы 32px, факты 24px, контролы в ячейках `--h:28px` (как `.task-card-top .iq-btn`), паддинги `--iq-space-2`.
4. **Факты — подписанные значения.** `.iq-section-count` и `.pn-fact-label`/`.pn-fact-value`, без точек-разделителей; бар только у идущего релиза и один на секцию.
5. **Вложенность — как на доске.** Отступ + сводка родителя в стиле `.task-subtasks-summary`, дочерние строки на размер меньше. Без линий и заливок.

### Спецификация

| Элемент | Токены/классы DS | Значение |
|---|---|---|
| Заголовок страницы | `.sq-page-heading`, `--iq-work-compact-title` | 24px/600, ряд 48px, `padding-bottom:--iq-space-5`; без изменений |
| Панель управления | одна строка `.pn-toolbar`, `gap:--iq-space-3` | Слева `.iq-segmented` «Список / Гант / Календарь»; затем `.iq-segmented` готовности; справа ghost «Вручную», «Фильтры», «Архив» как ghost-toggle с `aria-pressed`. Удалить `.pn-views-row` |
| Контейнер релиза | `.pn-group` → `.iq-section` | `border-top:1px solid var(--iq-line)`, `border-radius:0`, `background:transparent`, `padding-block:--iq-space-6`, `margin:0`. Удалить `[data-state=active]` рамку и `[data-group=backlog]` фон |
| Заголовок группы | `.iq-section-head` (32px), `.iq-section-head h3` | Одна строка: fold `.iq-btn.ghost.icon --h:28px` → `.iq-check` 19px → название 16px/24px 600 `--iq-ink` → `.iq-badge.soft` статус → «Спринт» 12px `--iq-muted` → `.iq-section-actions` (одно действие + `iq-menu`). Залитый `.iq-badge.info` допустим только у `data-state=active` — единственный светящийся элемент на экране |
| Факты группы | `.pn-group-facts`, `--iq-type-caption-size` | Строка 24px, `padding-left:calc(28px + 19px + 2*var(--iq-space-2))` = левый край названия; label `--iq-muted`, value `--iq-ink` 500 `tabular-nums`; `gap:--iq-space-5`; timing тон только `--iq-danger`/`--iq-warning` |
| Прогресс | `.iq-progress` | Только при `data-state=active` и `done>0`: отдельная строка под фактами, `width:100%`, `max-width:320px`, 4px, `--iq-line`/`--iq-accent`. Текст «Готово N из M» остаётся фактом; `.pn-progress` 120px удалить |
| Шапка колонок | `.iq-work-list thead th` | 11px/500 `--iq-muted`, высота 32px, `padding:--iq-space-2`, `border-bottom:1px --iq-line`; показывать один раз (как сейчас) |
| Строка | `.iq-work-list tr[data-work-row]` | `height:40px`, `td{padding:var(--iq-space-2)}`, `border-bottom:1px solid var(--iq-line)`, без вертикальных линий; hover `--iq-surface`, selected `--iq-accent-soft` — на всю строку |
| Колонки | `<colgroup>` | Задача `auto`, Статус 160px, Исполнитель 200px, Срок 112px — фиксированные px вместо %, чтобы бейджи и даты не плавали между группами |
| Чекбокс, ключ, название | `.pn-row-identity`, `.iq-work-list-id`, `.iq-work-list-title>.iq-btn` | `gap:--iq-space-2`; `.iq-check` 19px; disclosure 24px только при детях (иначе `width:0`); ключ `--iq-mono` 12px 400 `--iq-muted`, `min-width:6ch`; название 14px/1.45 500 `--iq-ink`, `padding:0; min-height:24px`, без ghost-hover |
| Ключ как ручка | `.pn-key-drag` | `padding:2px 4px`, hover `--iq-hover`, `--iq-radius-xs`, `cursor:grab`; без `.iq-btn` |
| Приоритет/тип | `.iq-dot` 6px в `--task-signal` перед ключом | Только для `high`/`critical`/`epic`; для планирования переопределить `tr[data-task-emphasis] .iq-work-list-title>.iq-btn{color:var(--iq-ink)}` |
| Исполнитель | `.pn-person`: `.iq-avatar.xs` + имя | 20px аватар, имя 13px `--iq-ink`; контрол `--h:28px`, `padding-inline:--iq-space-1`, `margin-left:calc(-1*var(--iq-space-1))` (как ghost-значения `.iq-properties`), hover `--iq-hover` |
| Срок | `.pn-date` | 13px `tabular-nums` `--iq-ink`; `[data-tone=danger]` `--iq-danger`, `[data-tone=warning]` `--iq-warning` — те же правила, что `.task-due-date` |
| Заглушки | `.pn-empty-value` | «Не назначен», «Без даты» — 13px 400 `--iq-faint`; на мобиле скрыты |
| Статус | `.iq-badge.soft` | 11px 500, min-height 24px, radius 6px; neutral `--iq-recessed`/`--iq-muted`, info `--iq-info-bg`/`--iq-info`, planned `--iq-planned-bg`/`--iq-planned`. **Фикс в DS:** `.iq-badge.soft.warning{background:var(--iq-tag-amber-fill);color:var(--iq-tag-amber-text)}`, `.iq-badge.soft.success{background:var(--iq-tag-green-fill);color:var(--iq-tag-green-text)}` — эти пары тинтованы в обеих темах (#FFF6E8/#85500B, тёмная #2B261F/#FFCF83) |
| Черновик | `.iq-badge.soft.outline` | Готовность — не сигнал: `border:1px solid var(--iq-line)`, `background:transparent`, `color:var(--iq-muted)` |
| Эпик → подзадачи | удалить `.pn-tree`, `tr[data-depth]>td` заливку | Родитель: название + сводка в стиле `.task-subtasks-summary` («2 подзадачи, 1 готова», 11px `--iq-muted`, число `--iq-ink` tabular). Дети: `.pn-indent = depth × var(--iq-space-6)`, название 13px (`--iq-type-label-size`) 500, ключ как обычно; выполненные — глиф `check` `--iq-success` перед ключом (`.task-subtask-state[data-done]`) |
| Тёмная тема | токены | Секции на `--iq-canvas` с `--iq-line` #343438; hover `--iq-surface` #161618; бейджи по правилу выше; никаких `--iq-raised` карточек |
| Мобиль 390px | `@media(max-width:640px)` | Секция без рамки, `padding-inline:--iq-space-4`. Заголовок: fold + название + `.iq-badge.soft` в одну строку, факты 12px второй, действия — в `iq-menu`. Строка `grid: minmax(0,1fr) auto`, `padding-block:--iq-space-2`, min-height 56px: 1-я строка — `.iq-check` + `--iq-space-2` + название (ключ скрыт, резервы `.pn-check-space`/`.pn-disclosure-space` = 0); 2-я — статус, `.iq-avatar.xs` + имя, срок справа tabular; пустые значения не рендерятся |

### Чего не делать

- Не давать контейнерам `--iq-radius-lg` и `--iq-raised`: карточка — для объекта (task-card), секция — для зоны страницы.
- Не кодировать состояние группы фоном или рамкой; состояние — бейдж.
- Не красить названия по приоритету и не держать два цветных элемента в строке (название + статус).
- Не использовать `color-mix` в продуктовом CSS: любой цвет — токен; нужен полутон — просить его у DS.
- Не рисовать линии дерева и заливки вложенных строк; вложенность — отступ и подпись.
- Не ставить `.iq-btn.sm` (36px) внутрь 40px-строки; значение в ячейке — ghost `--h:28px` с выносом влево на `--iq-space-1`.
- Не дублировать одно число баром и текстом.
- Не оставлять `--iq-warning-bg`/`--iq-success-bg` под текстом: до фикса DS эти пары нечитаемы в тёмной теме.