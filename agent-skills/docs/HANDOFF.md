# Handoff комплекта Agent Skills 1.1

## Текущая точка
Четыре скилла под pinned @iquipage/web 0.5.7. DS archive hash и assets/ds-release-lock.json НЕ менялись. IQUIPAGE runtime и шрифты в пакет не входят. Этот комплект не результат нового внедрения Sprintique.

## Что проверить перед изменением
Прочитать REVIEW-1.0.md, MIGRATION-1.1.md и quality report. Главные механизмы: review/scripts/validate_assessment.py и assessment/acceptance-plan schemas. Нельзя возвращать self-declared scope, переиспользовать прежний generic PASS для закрытия finding или убирать независимые hashes.

## Источники
Установочные skills/ — самостоятельные папки. Копии общих references/scripts intentional для автономной установки; tests/validate_skills.py и test_contracts.py проверяют отсутствие дрейфа. После изменения общего ресурса синхронизировать копии. Tests/reproduce_v1.py запускает диагностику ОРИГИНАЛЬНОГО 1.0 на synthetic inputs, не меняет его.

## Команды
`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py' -v`
`python3 tests/validate_skills.py`
`python3 tests/verify_package.py`
Browser smoke требует установленный Chromium; хранить новый output, не затирать reports. Runtime schema helper использует только собственный объявленный schema subset; при добавлении keyword расширить и проверить обработчик или явно добавить dependency.

## Не закрыто и не заявлено
Реальные модельные сессии Codex/Claude, автоматическое включение skills и работа на настоящем пользовательском проекте НЕ запускались. Evaluation prompts имеют NOT_RUN. Пакет не является sandbox и не подтверждает подлинность approvals/evidence; независимый reviewer должен читать raw sources. HTTP navigation в этой среде запрещалась policy браузера, smoke через set_content не закрывает этот пункт.

## Следующий содержательный шаг
Установить в разрешённой тестовой клиентской среде и прогнать selected examples/evaluation-cases.json на исходной и улучшенной версии с одной моделью/настройками и read-only репликой проекта. Сохранить actual transcripts/tool calls и оценить routing, обходы, unnecessary questions, coverage, false ready и исправления. Keyword matching не считать модельным eval. Для публикации скиллов отдельно выбрать distribution policy; сама поставка не даёт разрешения.
