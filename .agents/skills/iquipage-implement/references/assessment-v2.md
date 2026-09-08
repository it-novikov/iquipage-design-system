# Приёмка schema 2.0

## Зачем отдельный план
1.0 проверяла только scope, записанный самим автором assessment. 2.0 сравнивает отчёт с отдельным планом и digest, который принимающий получил до прогона. План включает поверхности, required checks, dimensions, метод, evidence kinds и точную environment. Правдивость одобрения и полнота inventory всё равно проверяются человеком/независимым агентом.

План hash — SHA256 канонического JSON: UTF-8, ensure_ascii=False, sort_keys=True, separators=(',',':'), без NaN. Для вычисления использовать `canonical_sha()` из validate_assessment.py либо ту же формулу. Проверяющий передаёт hash из принятой записи, НЕ перечитывает ожидаемое значение из assessment.

```sh
python3 SKILL_ROOT/scripts/validate_assessment.py WORK_DIR/assessment.json \
  --evidence-root WORK_DIR \
  --plan WORK_DIR/acceptance-plan.json \
  --plan-sha256 APPROVED_PLAN_SHA \
  --current-fingerprint ACTUAL_APP_SHA \
  --ds-archive-sha256 APPROVED_DS_ARCHIVE_SHA \
  --out WORK_DIR/assessment-validation-NEW.json --require-ready
```

## Данные
План и отчёт schema 2.0 имеют самостоятельные схемы в assets. Шаблоны намеренно NOT_RUN/PENDING, без выдуманной approval. `scope_type=targeted` означает только указанные поверхности; `full-integration` требует полного согласованного inventory. Все шесть dimensions имеют решение applicability. Нет агентных функций — human-agent можно объявить approved N/A; существующие агентные функции исключать нельзя.

`checks` должны точно соответствовать плану. Environment включает engine, role, theme, viewport, input, load_mode (application/fixture/static), data_profile. Нельзя заменить application фикстурой, WebKit Chromium или keyboard pointer. `method` различает automated/manual-inspection/manual-interaction.

Evidence — реестр ID → path + SHA + kind + app/DS hashes + captured_at. Кадр переиспользуется по ID, а не маркируется разными видами доказательств под новыми ID. Тесты указывают evidence_ids, dimensions и finding_ids. PASS визуальной dimension требует запланированного просмотра screenshot; код — source-review; performance — measurement. Это требования к представленным свидетельствам, не автоматическая оценка их смысла.

Coverage обязана включать required check IDs каждой поверхности. Applicable dimension должна иметь хотя бы один фактический required PASS: все проверки N/A не превращаются в PASS dimension. Отсутствующий инструмент — NOT_RUN/BLOCKED, не N/A.

## Находки
Закреплённые `known_finding_ids` переносят известные ID предыдущего ревью: их нельзя удалить из следующего assessment. При обнаружении новых замечаний и подготовке повторного прогона обновить принятую revision плана. Изменение digest требует отдельной принятой записи; список не является автоматическим поиском всех ошибок.

Open P0/P1, mandatory-ds-gap и unapproved-ds-bypass блокируют готовность. P2/P3 можно принять только конкретным risk_acceptance в закреплённом плане: owner, reference, reason. Это не исключает находку из отчёта.

Resolved требует confirmed finding, repair description, changed_paths, новый app fingerprint, дату проверки и reciprocal verification check IDs. Проверка должна быть о затронутой поверхности и dimension, ссылаться обратно на finding и выполняться после обнаружения. Все затронутые поверхности перепроверяются. Evidence до обнаружения и тот же fingerprint не подтверждают кодовую правку. Конфигурационные/данные изменения также включать в fingerprint inputs.

Гипотезу можно закрыть как dismissed только с отдельным заключением, reviewer и актуальным связанным расследованием; это не «исправлено». Подтверждённый дефект нельзя так скрыть. Прежний отчёт с FAIL сохраняется отдельно от нового прогона.

## Результат и границы
`structure_valid` — формат и непротиворечивость. `gate_ready` — все требования ЗАКРЕПЛЁННОГО scope и положительное заключение проверяющего. Явное `scope_ready: false` всегда удерживает gate. Это не сертификат «весь продукт идеален» и не полномочие deploy.

Exit 0 — валидно (и gate ready при --require-ready); 1 — ошибочный формат/ссылки/противоречие; 2 — валидно, но not ready в строгом режиме; 3 — невозможно прочитать/проверить. Запись отчёта не перезаписывает существующий файл.

Схема 1.0 поддерживается только для исторической диагностики. Автоконвертации её PASS в 2.0 нет: восстановить реальный план, области, environment, время и evidence из источников, недостающее повторить. Поля release_ready/scope_ready имеют разные границы утверждения.

Validator использует standard library и строгий поднабор JSON Schema, применяемый нашими схемами. Он не является произвольным Draft 2020-12 валидатором. Схемы дополнительно проверяются jsonschema в developer-тестах. Hash не защищает от согласованной подделки отчёта, плана и самих логов одним автором; нужен review actual assertions/trace и при необходимости независимое исполнение.
