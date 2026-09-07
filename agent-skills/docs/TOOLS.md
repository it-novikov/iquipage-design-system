# Помощники: что они проверяют и чего не проверяют

Все пути ниже относительны папке установленного скилла. Замените `SKILL_ROOT`, `PROJECT`, `WORK_DIR`, `DS_ROOT` на существующие абсолютные пути. Инструменты не копируют компоненты и не исправляют проект автоматически.

## verify_release.py · implement / review
```sh
python3 SKILL_ROOT/scripts/verify_release.py --ds-root DS_ROOT --archive IQUIPAGE-05.7.zip --out WORK_DIR/ds-verification.json
```
Проверяет pinned archive SHA, pinned MANIFEST SHA, каждую запись manifest, отсутствие лишних/пропавших/изменённых файлов и identity package. Не исполняет скрипты архива, не распаковывает его, не меняет vendor. Без `--archive` подтверждает только распакованные bytes по pinned manifest. Используйте чистую копию; не папку с новыми build-артефактами.

Exit: 0 integrity PASS (возможны явно перечисленные known warnings), 1 mismatch, 2 не удалось проверить. Уже обнаруженное несовпадение literal version в `types/core.d.ts` сохраняется warning; оно не скрыто и не исправляется скиллом.

## integration_scan.py · implement / review
```sh
python3 SKILL_ROOT/scripts/integration_scan.py --root PROJECT --config WORK_DIR/scan-config.json --out WORK_DIR/scan.json
```
Сначала заполните `assets/scan-config.example.json`: source roots, vendor boundary, adapters и исключённые generated paths. Не указывайте production secrets. Скрипт возвращает файлы и SHA, пропуски/отсутствующие roots и кандидаты с file:line.

Ищет internal imports, признаки DOM/monkeypatch, local UI primitives, параллельные UI-kit, native date, !important, literals, focus suppression, demo imports и опасные HTML sinks. Это **heuristic scan**, не AST/proof. Правильный supplied markup с native button допустим; `adapter_roots` только отмечает место, не скрывает нарушение.

Narrow exception: rule_id + path + line + точный source_sha256 + reason + owner + approval_ref. Даже совпавшее исключение остаётся видимым для рецензента. Широкие wildcard и устаревшие записи не принимаются.

Exit: 0 сканирование закончено (не «код принят»), 2 неполный scan/invalid config. Не использовать exit 0 как release gate. Source fingerprint охватывает только перечисленные файлы; для app acceptance дополнительно нужны build/dependency/environment fingerprints.

## validate_assessment.py · review
```sh
python3 SKILL_ROOT/scripts/validate_assessment.py WORK_DIR/assessment.json --evidence-root WORK_DIR --current-fingerprint CURRENT_SHA --out WORK_DIR/validation.json --require-ready
```
Проверяет unique IDs, весь объявленный scope, required cases, шесть review dimensions, актуальность fingerprint, существование и SHA evidence, resolved findings с проверками. NOT_RUN/BLOCKED не превращаются в PASS. Подробная структура — `assets/assessment.schema.json`; example намеренно не является готовым отчётом.

Exit: 0 valid (и ready при --require-ready), 1 invalid structure/evidence/contradictory claim, 2 valid но не ready в строгом режиме, 3 ошибка чтения/формата. Без --require-ready прочитайте gate_ready; exit 0 означает только структурную допустимость.

**Ограничение:** человек/агент может написать неправду в самом логе. Валидатор не распознаёт ложное тестирование и не заменяет просмотр assertions/trace/screenshots. Не «лечить» отказ созданием фиктивного evidence-файла.

## capture_surface.py · review / experience-audit
```sh
python3 SKILL_ROOT/scripts/capture_surface.py --url http://127.0.0.1:4173/tasks --ready-selector main --state-label tasks-populated-dark --app-fingerprint CURRENT_SHA --output WORK_DIR/capture-001 --width 1440 --height 900 --engine chromium
```
Требует Python Playwright и установленный engine. При необходимости задайте `--executable /path/to/chromium`. `--storage-state` — собственная разрешённая тестовая сессия; файл не копируется в отчёт. Скриншот может содержать конфиденциальный UI: использовать обезличенные fixtures.

По умолчанию разрешены loopback HTTP(S) resources; для явно разрешённой удалённой тестовой среды есть --allow-remote. WebSockets и service workers блокируются в этом пассивном capture; real-time проверять отдельным сценарием. Скрипт открывает URL, ждёт ready selector и шрифты, фиксирует кадр, прямую DOM-геометрию и computed styles. Тему не форсирует и не меняет состояния приложения. Auth/выбор роли/interaction states достигаются отдельными разрешёнными действиями агента.

Для изолированных тестов можно вместо --url передать `--html-fixture PATH`: HTML загружается через `set_content`, что явно отмечается как offline-fixture. Это не тест HTTP origin, маршрутизации, авторизованного приложения или persistence. Не подменять им blocked реальный сценарий.

Он не управляет UI, не измеряет композитный контраст, не обходит shadow roots и не сертифицирует accessibility. Всегда `verdict: NOT_ASSESSED`. Не считать видимый h1 или scrollWidth полным UX-аудитом. Capture не проверяет сохранение и backend; результаты скрипта должны дополняться journey tests.

## Самопроверка пакета
Из корня комплекта:
```sh
python3 tests/test_tools.py
python3 tests/validate_skills.py
```
Browser smoke выполнен отдельно на синтетической fixture; документы с результатами находятся в `reports/`. Prompt evaluation cases в `examples/evaluation-cases.json` — задания для реального агента; автоматическое выполнение этими скриптами не производится.
