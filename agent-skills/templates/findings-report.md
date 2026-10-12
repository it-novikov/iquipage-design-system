# Приёмка внедрения IQUIPAGE
Вердикт: NOT_RUN / BLOCKED / NEEDS_CHANGES / READY_FOR_APPROVED_SCOPE.
DS archive SHA / app fingerprint / дата / reviewer mode (independent или self-review): …

## Scope и доверие
Согласованные поверхности, роли, среды; реально проверенное; чего не удалось проверить.

## Основные находки
### IQ-F-001 — конкретная проблема
- Severity: P…; classification: confirmed / hypothesis; status: open.
- Поверхность, сценарий и роль: …
- Факт: что наблюдается; evidence path/hash и selector или file:line.
- Воспроизведение: …; ожидание/факт: …
- Причина: подтверждена или гипотеза; ссылка на exact DS contract/principle.
- Для спорной причины: конкурирующее объяснение и различающее evidence; необходимые гарантии отдельно от изменяемого решения.
- Вред человеку/агенту: …
- Уровень исправления: composition / adapter / DS / domain decision.
- Требуемая переделка: конкретные изменения, не «улучшить UX».
- Решение/основание: исправить / упростить / не строить новую функцию / один опыт / остановить вариант; значимые альтернативы и что опровергает выбор.
- Приёмка и регрессия: …
- Вид проверки и граница вывода: source / synthetic / runtime исследователя / наблюдение человека. При общем DS-изменении — затронутые consumers и точная поставка.
- Закрытие: новый check ID/evidence/fingerprint или не закрыто.

## Полнота
Реестр поверхностей; число применимых required cases; PASS/FAIL/BLOCKED/NOT_RUN/N/A отдельно. Не складывать несовместимые виды тестов в одну «успешность».

## Гейты
Functional parity; отсутствие обходов DS; visual coherence; a11y; human-agent; performance; known gaps; approval scope.

## Задания исполнителю
Finding ID → приоритет → root cause → DS mapping → файлы → acceptance → владелец.
Принятые риски с approver/reference. Не исправленные mandatory gates не исчезают из отчёта.
