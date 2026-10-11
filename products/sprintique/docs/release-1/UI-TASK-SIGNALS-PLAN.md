# Компактные сигналы и ширина страниц

Ревизия52 после обратной связи владельца: использовать всю доступную ширину без ограничений1120/1600, но сохранить рабочие горизонтальные отступы24px desktop /16px mobile. Внутренние отступы компонентов и ширина текста сохраняются. Версия51 с нулевыми полями и сливающимися сигналами отклонена; не является принимаемым дизайном. Исполнение в `fix/task-signals-full-width`, база `73f9109`. Данные, API, роли, черновики и маршруты сохраняются.

После сравнения двух actual прототипов независимое R1 и root выбрали вариант A: читаемое цветное слово приоритета и самостоятельная нейтральная контурная метка «1 блокер / 2 блокера / 5 блокеров» с замком. Общая высота22px, точный общий центр и зазор12px. Это не яркая плашка. При недостоверном счётчике — «Есть блокер», без выдуманного числа. Tooltip и aria явно говорят «Заблокирована» и показывают реальные причины, открываются по фокусу; Escape закрывает подсказку. Нажатие открывает прежнюю задачу и её связи. EffectiveBlocked берётся только с сервера; priority/emphasis не меняются.

## Карта поверхностей

| Поверхность | Внешний canvas | Что сохраняется внутри |
| --- | --- | --- |
| Доска | `.host-task-page`: сохранить inline24/16 | Отступы карточек, зазор колонок, title spacing task drawer |
| Планирование | `.iq-workspace-page.iq-page-fluid`: maxnone, прежние inline24/16 | Строки дерева, ячейки, панели, инструменты |
| Рабочий стол | Тот же public modifier; host уже без полей | Навигация, внутренние группы, карточки |
| Финансы | Public modifier, убрать nested page caps1440/1280 | Карточки/таблицы/формы и размеры читаемых пояснений |
| Агенты, профиль, управление аккаунтом | `.iq-agent-directory.iq-page-fluid`: убрать max1120, сохранить inline24/16 | Контролы, story paragraphs, формы |
| Settings | Внешний host/layout уже edge-to-edge | Navigation rail, внутренний content padding и measure1120 форм |
| Wiki | Внешний layout уже edge-to-edge | Rail, document bar и читаемый76ch документ |
| Maps | Canvas уже edge-to-edge | Внутренние отступы toolbar/header |
| Legal/about | `.legal-layout` width100% без centered max, рабочие inline24/16 | Article48rem, внутренние reading spacings и site header |
| Sign-in/consent | Auth canvas уже fullwidth | Внутренняя форма, provider controls и legal links |
| Search | Общий host: рабочие inline24/16; поиск внутри overlay не page gutter | Диалог, controls, результаты |
| Loading/access/landing | App-owned host/placeholder без внешнего max, с рабочими inline24/16 | Form skeleton measure, alert/control padding |

## Публичная граница

DS52 уточняет опциональный `.iq-page-fluid` для workspace/agent directory и компактную `.iq-task-signals/.iq-task-blocker` composition. Существующие callers без modifier не меняются. Product не меняет private DOM или правила DS компонентов. Settings public parts/hooks изучены, но после уточнения владельца их внутренние поля и form measure сохранены.

## Приёмка

Сопоставить карточки high/critical/normal + blocked/false/unknown, несколько длинных причин, большие count, обе темы,320/390 и desktop. Сигналы в одной строке, блокировка без заливки, title/open/menu/drag/keyboard прежние. Проверить focus tooltip/Escape и обычное открытие задачи.

На actual synthetic backend проверить canvas boundaries board/planning/workbench/finance/agents/settings/wiki/maps и loading; legal/auth отдельно без изменения входа. Внешние wrappers имеют maxnone и рабочие inline24/16 либо уже занимают всё доступное пространство с нужными внутренними отступами; document/form reading widths сохраняются. Не применять глобальный padding0 к controls или nested text. Зафиксировать before/after и DOM ширины; отличать production read-only baseline от synthetic acceptance.

Targeted product tests + DS tests/build/pack/exact adoption; unchanged local и official Linux gzip budgets. Root ведёт backend preview, independent reviews, CI и выпуск. Никаких production writes в UI QA.
