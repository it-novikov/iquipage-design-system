# Handoff комплекта скиллов

## Что поставлено
Четыре скилла версии 1.0.0. Это процедурный слой над IQUIPAGE, не версия 05.8 и не модификация 05.7. DS-база зафиксирована по SHA в каждом skills/*/assets/ds-release-lock.json. Скиллы должны работать с предоставленным проектом, не с памятью о старом Sprintique.

## Где менять
- `skills/*/SKILL.md`: triggers, границы, workflow, выходные артефакты.
- `skills/*/references/constitution.md`: неизменные принципы (общие копии должны совпадать).
- `release-map.md`, `capability-index.json`, `ds-release-lock.json`: exact release context; обновлять только после чтения новой одобренной выдачи.
- `quality-method.md`, `human-agent.md`, `gap-protocol.md`: общие требования и evidence model.
- `skills/*/assets`: шаблоны рабочих документов; assessment schema и example находятся в review.
- `skills/iquipage-review/scripts`: canonical помощники; копии в implement/audit должны совпадать.
- `examples/evaluation-cases.json`: позитивные/негативные промпты и ожидаемые гейты. Их ещё нужно выполнить в настоящих клиентах/моделях.

## Почему так
В старых миграциях главный риск — выглядящее похожим приложение без исходных функций, состояния/сохранение только в demo, внутренние CSS/DOM-патчи, преждевременное «всё проверено» и очередное локальное изобретение компонентов. Гейты направлены на эти конкретные ошибки.

## Не заявлять лишнего
Скиллы не устанавливались в аккаунт пользователя и не проверялись в реальных Codex/Claude model sessions. Структурная проверка SKILL.md не доказывает правильный автоматический trigger. Regex scan не доказывает отсутствие обходов; verifier не сертификат безопасности; evidence validator не детектор фальшивых логов. Нет новых полномочий и auto-deploy.

## Известная база
Прочитанный DS package/runtime 0.5.7, но `types/core.d.ts` literal version 0.5.6. Сохранено как known discrepancy, не замазано правкой библиотеки. Исторический WebKit tap календаря требует собственной проверки. Native Android/iOS visual-library и готового production React-wrapper в этой выдаче нет; это нельзя выдумывать.

## Следующие проверки
Установить в согласованном агенте, подтвердить discovery четырёх names, выполнить evaluation cases на sandbox-проекте с seeded defects и заданным scope; проверить, что агент действительно остановится на DS-GAP, не изменит vendor и не выдаст screenshot-only audit за полное acceptance. Отдельно провести real UI migration и review, не используя результаты self-tests как доказательство продуктового качества.

## Разрешения и изменение правил
Новую DS, бизнесовые требования, agent autonomy или release target согласовывать. Не снижать gates ради зелёного pipeline. Увеличить версию skill suite, зафиксировать diff, обновить тесты и manifest после изменений.
