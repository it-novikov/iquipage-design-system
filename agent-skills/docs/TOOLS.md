# Инструменты 1.1

Пути ниже относительны установленному скиллу. Скрипты используют Python 3.10+ standard library; capture отдельно требует Playwright и установленный движок. Ничего не устанавливается и не запускает модель автоматически.

## Целостность DS
`verify_release.py --ds-root DS_ROOT --archive DS.zip --out NEW_REPORT.json`
Сравнивает package, pinned manifest, файлы и архив с принятой 05.7. Нет исполнения кода поставки. По-прежнему известна несовпадающая строка version в types/core.d.ts — warning, не исправление. Проход доказывает bytes, не UI. Output не помещать в DS и не перезаписывать старый отчёт.

## Кандидаты на обходы
`integration_scan.py --root PROJECT --config CONFIG.json --out NEW_SCAN.json`
Regex-разведка: private imports, local controls/UI kits, native date, CSS/DOM overrides и прочее. Соблюдающие exact markup native elements допустимы; сигналы проверять вручную. `source_roots` обязательны. `adapter_roots` не suppressions.

Нормализованные relative paths, без `..` и symlink parents. Snippets выключены по умолчанию; file/line/hash остаются. При явном include_snippets=true применяется дополнительная эвристическая редактировка credential-like строк, НЕ универсальный secret scanner. Sensitive outputs не публиковать.

`exclusion_ledger` перечисляет исключённые файлы/поддеревья. `explicit-exclusion` без точной записи reason/owner/approval делает scan INCOMPLETE. Vendor и built-in pruning видны отдельно; это не доказательство целостности vendor или отсутствия UI в generated code. Exit 0 означает сканирование, не соответствие DS.

## Fingerprint приложения
`fingerprint_inputs.py --root PROJECT --inputs INPUT_FILES.json --out NEW_SNAPSHOT.json`
INPUT_FILES.json — явный массив путей к source/build/lock/config файлам. Читает только bytes; не запускает команды проекта и не сохраняет содержание. Не включает `.env`, secrets и symlinks. Полноту перечня определяет ревью. Нельзя исключить изменённый build input ради сохранения прежнего hash.

## Приёмка
См. [полный формат schema 2.0](../skills/iquipage-review/references/assessment-v2.md). Нужны отчёт, независимый acceptance plan, его принятый canonical digest, текущий app fingerprint и DS archive hash. Набор проверок нельзя сократить внутри assessment. Schema 1.0 больше не выдаёт ready. `--require-ready` — gate текущего scope, не разрешение deploy.

## Пассивный browser capture
```sh
python3 SKILL_ROOT/scripts/capture_surface.py \
  --url http://127.0.0.1:4173/tasks --ready-selector main \
  --state-label tasks-dark --app-fingerprint APP_SHA \
  --output NEW_CAPTURE_DIR --width 1440 --height 900 --engine chromium
```
URL mode по умолчанию разрешает только origin указанного loopback URL, не любые localhost-порты. Для авторизованного staging явно добавить `--allow-origin https://staging.example` и нужные origins ресурсов по отдельности. `--allow-remote` теперь отклоняется, а не разрешает весь Интернет. Credentials в URL не принимаются.

`--html-fixture FILE` по умолчанию не имеет сети. GET/HEAD/OPTIONS разрешены только по allowlist; mutating methods, WebSockets и service workers блокируются. Это пассивная фиксация, не тестирование GraphQL/realtime. Для этих путей нужен отдельный разрешённый сценарий. Перехват запросов не OS sandbox; даже GET может менять состояние плохого сервера.

Capture фиксирует screenshot, прямую DOM-геометрию и computed styles, но всегда выдаёт NOT_ASSESSED. Не выполняет сценарий, не меряет составной contrast и не traverses shadow roots. Pageerror сообщения редактируются; их наличие фиксируется, подробности изучаются в разрешённой локальной среде. Снимок может содержать приватные данные — использовать synthetic fixtures. Смена темы не форсируется.

## Повторяемая самопроверка
```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 tests/validate_skills.py
python3 tests/verify_package.py
```
Browser smoke не заменяет навигацию реального приложения; новый каталог вывода обязателен. Evaluation cases — задания реальному клиенту/модели, не результаты этих Python-тестов.

Для полного developer-прогона дополнительно установленные jsonschema/PyYAML обязательны (версии в requirements-dev.txt). Их отсутствие может дать SKIP и не считается полными проверками. Runtime validator не зависит от этих пакетов.
