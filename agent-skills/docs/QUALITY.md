# Проверка комплекта скиллов 1.0.0

## Реально выполнено

| Проверка | Результат | Область |
|---|---|---|
| Поставка IQUIPAGE 05.7 | 297/297 файлов MANIFEST совпадают, архивный SHA совпадает | Только целостность прочитанного DS-пакета, не новый прогон его UI |
| Тесты Python-помощников | 60/60 | Чистая выдача/повреждение manifest, опасные пути, лишние/пропавшие файлы, scanner candidates/исключения/адаптации, evidence freshness, coverage и fail-closed gate, URL policy |
| Формат и ресурсы 4 скиллов | PASS | Имена, frontmatter, длины, локальные ссылки, JSON, Python syntax, совпадение shared references |
| Пример assessment по JSON schema | PASS | Это заполненный шаблон NOT_RUN, а не готовый отчёт |
| Проверка шаблона гейтом | Отклонён как ready, exit 2 | Нет approval, реальных checks и evidence — они не выдуманы |
| Browser helper, 3 offline fixtures | 3/3 | Light 1280, dark 390, обнаружение преднамеренной JS-ошибки; verdict остаётся NOT_ASSESSED |
| Browser helper, HTTP-навигация | BLOCKED | Chromium возвращает ERR_BLOCKED_BY_ADMINISTRATOR для локального URL. Offline fixture не закрывает эту проверку |

Подробные результаты: `reports/tool-tests.log`, `skill-validation.json`, `schema-validation.json`, `template-gate.json`, `capture-smoke.json`, `ds-baseline-verification.json`.

## Чего эти результаты не доказывают
Скиллы не устанавливались и не запускались в реальных модельных сессиях Codex/Claude. Автоактивация и выполнение всех инструкций конкретным агентом ещё не проверены. Для этого подготовлены **26 evaluation cases**, все с честным статусом NOT_RUN, в `examples/evaluation-cases.json`.

Regex scanner не полноценный AST/code review, не детектор всех обходов и не критик эстетики. Capture фиксирует текущую поверхность, не проходит весь путь и не меряет композитный contrast. Validator проверяет отчёт и файлы, не правдивость автора лога и не семантику тестов. Это помощники человеческого/агентного ревью, а не гарантия «идеального внедрения».

Не проводилось нового внедрения в Sprintique, не менялись исходники DS, не было реального usability-исследования. Установка скиллов не даёт секреты, новые инструменты или разрешение на публикацию.

## Найденное при чтении DS
`package.json` и runtime экспортируют 0.5.7, а `types/core.d.ts` содержит literal version 0.5.6. Несовпадение включено в release-map и release lock как known discrepancy; не исправлялось незаметно. Исторические проблемы WebKit touch и ограничения больших spatial-моделей сохранены в handoff, а не объявлены решёнными тестами навыков.

## Воспроизведение
Из распакованного корня:

```sh
python3 tests/test_tools.py
python3 tests/validate_skills.py
python3 tests/verify_package.py
```

Для browser smoke нужны Playwright и Chromium; скрипт использует `/usr/bin/chromium`, другой путь меняется в тестовом сценарии. Библиотечные помощники не устанавливают зависимости. `tests/browser_smoke.py` намеренно не перезаписывает существующие capture files: для нового прогона сначала сохраните прежние evidence и выберите/подготовьте чистый вывод. Отчёты новой проверки не должны перезаписать данные прежнего релиза.

Формат SKILL.md проверен собственным валидатором комплекта, не upstream `skills-ref`. Публичные installation paths сверены с документацией 2026-09-07; support разных клиентов нужно подтверждать в используемой версии.
