# Компактные сигналы и ширина страниц

Владелец подтвердил: убрать внешние поля страниц, сохранить внутренние отступы компонентов и ширину текста. Исполнение в `fix/task-signals-full-width`, база `73f9109`. Данные, API, роли, черновики и маршруты сохраняются.

Карточка сейчас помещает priority рядом с номером, а blocker — отдельным grid-item с заливкой danger. Новый ряд под названием объединяет прежний priority signal и «Заблокирована» с замком, без плашки и заливки. Эффективная блокировка берётся только из серверного effectiveBlocked. Приоритет/emphasis остаётся независимым. Публичный iq-tooltip открывает реальные причины при hover/keyboard focus; Escape закрывает его. На touch карточка открывает ту же задачу и её существующие связи. Unknown/false не изображаются как разблокировка.

## Карта поверхностей

| Поверхность | Внешний canvas | Что сохраняется внутри |
| --- | --- | --- |
| Доска | `.host-task-page`: убрать inline24/16 | Отступы карточек, зазор колонок, title spacing task drawer |
| Планирование | `.iq-workspace-page.iq-page-fluid`: maxnone, inline0 | Строки дерева, ячейки, панели, инструменты |
| Рабочий стол | Тот же public modifier; host уже без полей | Навигация, внутренние группы, карточки |
| Финансы | Public modifier, убрать nested page caps1440/1280 | Карточки/таблицы/формы и размеры читаемых пояснений |
| Агенты, профиль, управление аккаунтом | `.iq-agent-directory.iq-page-fluid`: убрать max1120 и inline24/16 | Контролы, story paragraphs, формы |
| Settings | Внешний host/layout уже edge-to-edge | Navigation rail, внутренний content padding и measure1120 форм |
| Wiki | Внешний layout уже edge-to-edge | Rail, document bar и читаемый76ch документ |
| Maps | Canvas уже edge-to-edge | Внутренние отступы toolbar/header |
| Legal/about | `.legal-layout` width100% вместо centered max/gutter | Article48rem, внутренние reading spacings и site header |
| Sign-in/consent | Auth canvas уже fullwidth | Внутренняя форма, provider controls и legal links |
| Search | Общий host: inline0; поиск внутри overlay не page gutter | Диалог, controls, результаты |
| Loading/access/landing | App-owned host/placeholder без внешнего max/inline | Form skeleton measure, alert/control padding |

## Публичная граница

DS51 добавляет опциональный `.iq-page-fluid` для workspace/agent directory и компактную `.iq-task-signals/.iq-task-blocker` composition. Существующие callers без modifier не меняются. Product не меняет private DOM или правила DS компонентов. Settings public parts/hooks изучены, но после уточнения владельца их внутренние поля и form measure сохранены.

## Приёмка

Сопоставить карточки high/critical/normal + blocked/false/unknown, несколько длинных причин, большие count, обе темы,320/390 и desktop. Сигналы в одной строке, блокировка без заливки, title/open/menu/drag/keyboard прежние. Проверить focus tooltip/Escape и обычное открытие задачи.

На actual synthetic backend проверить canvas boundaries board/planning/workbench/finance/agents/settings/wiki/maps и loading; legal/auth отдельно без изменения входа. Внешние wrappers имеют inline0/maxnone или уже занимают всё доступное пространство; document/form reading widths сохраняются. Не применять глобальный padding0 к controls или nested text. Зафиксировать before/after и DOM ширины; отличать production read-only baseline от synthetic acceptance.

Targeted product tests + DS tests/build/pack/exact adoption; unchanged local и official Linux gzip budgets. Root ведёт backend preview, independent reviews, CI и выпуск. Никаких production writes в UI QA.
