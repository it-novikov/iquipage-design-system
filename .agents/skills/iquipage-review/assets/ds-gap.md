# DS-GAP-000 — краткое имя
Статус и scope: …; существующая авторизация либо необходимое решение: …
Это запись потребности, не реализованный API; отдельную систему статусов не вводить.

| Поле | Содержание |
|---|---|
| Classification | missing-component / missing-capability / ds-defect / unclear-contract / documentation-discovery / release-mismatch; product/composition cause исключена или указана отдельно |
| Priority / owner | … |
| Requirement / surfaces | … |
| User problem | Конкретный результат, который нельзя сохранить |
| Accepted release | package, version, ZIP SHA, manifest SHA |
| Inspected evidence | exports, types, docs, file:line, fixture и результат |
| Closest supplied pattern | … |
| Actual missing contract | Данные/props/events/states, не название «красивый picker» |
| Proposed minimal extension | Предложение владельцу; не выдумывать существующий API |
| Alternatives / decision | Существующий путь, исправление, минимальное расширение, no-build; причина и оставшееся unknown |
| Functional loss if substituted | … |
| Safe temporary path | … / нет; полным внедрением не считается |
| Acceptance | Применимые проверки затронутого контракта: render/theme, semantic/keyboard/focus, роли/состояния и save/reload/conflict — только если этот контракт их затрагивает. Target environments и расширенная браузерная проверка — по существующей release policy; не назначать все состояния каждому primitive. |
| Consumer impact | Exact package, реальный caller и применимые public/text/form/state/focus/outcome контракты; затронутые текущие consumers |
| Owner decision | Не получено / явная ссылка на решение и scope |

## Изолированное воспроизведение для ds-defect
Проверенные bytes, fixture без app CSS/adapters, шаги, expected/actual, browser/version/input.

## После решения
DS issue/release/hash → contract tests → интеграция → повторное review.
Ранее полученная авторизация учитывается; локальная подмена DS не считается поставкой.
