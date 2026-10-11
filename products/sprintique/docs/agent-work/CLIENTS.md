# Клиенты и синхронизация моста

Подписка Codex/Claude Code используется в клиенте пользователя. Sprintique MCP предоставляет доступ к задачам; его подключение не запускает внешнего агента с сервера. Внутренний API-агент имеет отдельное подключение модели.

## MCP и навык

Замените example-адрес адресом своего сервера:

```sh
codex mcp add sprintique --url https://sprintique.example/mcp
codex mcp login sprintique
```

Для действующего Sprintique проверены OAuth аккаунта Codex и вызовы `get_task`/`create_task` через native app-server на `https://api.iqui.page/mcp`. Для нового подключения сначала используйте discovery ресурса сервера:

```sh
codex mcp add sprintique --url https://api.iqui.page/mcp \
  --oauth-client-registration dcr
```

Текущий CLI также поддерживает `--oauth-resource https://api.iqui.page/mcp`. В проверенном подключении явный resource вместе с discovery дал два параметра `resource` в URL авторизации; сервер отклонил такой запрос. Успешный вход состоялся после нормализации URL к одному resource и согласия человека. Поэтому бесшовный свежий вход приведённой командой ещё не подтверждён; вариант без явного resource требует отдельной проверки.

Команда добавляет подключение и начинает вход. Если имя уже настроено, используйте существующее подключение и штатный вход, не добавляйте дубликат. Эта проверка относится к Codex и существующим инструментам задач; новые инструменты плана SPR-14 и Claude Code требуют своей приёмки.

```sh
claude mcp add --transport http sprintique https://sprintique.example/mcp
```

В Claude Code откройте `/mcp` и выполните вход. Callback и регистрацию клиента проверяют на используемой версии. Эти команды не доказывают работоспособность интеграции. После входа проверьте tools/list и чтение своей задачи; не создавайте пробную задачу от человека. При 401 повторите штатный вход; при 403 проверьте разрешения.

Папка `products/sprintique/agent-skills/sprintique-work` устанавливается в `.agents/skills/` для Codex или `.claude/skills/` для Claude Code. Проектная копия Codex находится в `.agents/skills/sprintique-work`. Явный вызов: `$sprintique-work` или `/sprintique-work`. Навык не выдаёт права и не устанавливает MCP.

## bridge pull/push

Команды синхронизируют Markdown, а не запускают модель. Импорт карточки разрешается сервером в черновик. Активный план меняется типизированными командами шагов, аренды, checkpoint и передачи.

CLI использует токен из явно указанной переменной. Он не читает OAuth-кэш Codex/Claude и не выполняет login. Штатный клиент управляет своим OAuth отдельно. Для MCP нужен токен, выданный для audience этого Sprintique MCP; не копируйте токены провайдера модели. Credentials не вставляются в командную строку или Git.

```sh
engineering/bridge/bin/bridge pull 20261011-spr-14 \
  --url https://sprintique.example/mcp --transport mcp \
  --project PROJECT_UUID --task SPR-14 --token-env SPRINTIQUE_MCP_TOKEN
```

Локальный id должен совпадать с `meta.id` получаемой карточки. Для серверного плана export использует `YYYYMMDD-task-key-lower`; imported id сохраняется. При неизвестном id прочитайте `get_work_card` штатным MCP-клиентом.

Если на сервере план ещё не создан, импортируйте существующую локальную карточку через `push ... --create`. При первом подключении CLI проверит пустой план с ревизией 0; появление плана между чтением и записью даст CAS-конфликт. Это создаёт только план существующей задачи, не новую задачу от человека. Уже существующий несвязанный план флаг не перезаписывает. После потерянного ответа повтор той же команды использует сохранённую ревизию и ключ; новый preflight не мешает восстановлению.

```sh
engineering/bridge/bin/bridge push 20261011-spr-14 \
  --url https://sprintique.example/mcp --transport mcp \
  --project PROJECT_UUID --task SPR-14 --token-env SPRINTIQUE_MCP_TOKEN
```

REST требует отдельно выданный `spk_` service token и корень сервера:

```sh
engineering/bridge/bin/bridge pull 20261011-spr-14 \
  --url https://sprintique.example --transport rest \
  --project PROJECT_UUID --task SPR-14 --token-env SPRINTIQUE_SERVICE_TOKEN
```

CLI обращается к GET/PUT `/api/v1/projects/{project}/tasks/{task}/work-plan/card`. PUT содержит `baseRevision`, `card` и заголовок `Idempotency-Key`. MCP использует `get_work_card`/`put_work_card`. Токен MCP не переносится на REST; redirects отклоняются. HTTPS обязателен, кроме HTTP loopback для локальной проверки.

Ревизия, remote identity, hash карточки и pending key хранятся локально в `.bridge/runs/sync/`, без credentials. Этот каталог не предназначен для Git. Не создавайте sync-state вручную и не повышайте revision для обхода конфликта. CLI передаёт raw text: неизвестные разделы и code blocks не пересобираются. Сервер сохраняет raw import/export до изменения плана; после изменения экспорт может стать каноническим.

## Восстановление

`pull` не перезаписывает локальную работу. При конфликте сохраните свою карточку отдельным файлом, получите новую с `pull ... --accept-remote`, сравните версии вручную и повторите push. Флаг явно принимает серверную версию вместо локальной. `--force` не поддерживается; CAS нельзя обходить.

При сетевом сбое запись могла выполниться. Повторите тот же push без редактирования карточки: сохраняются прежний текст, revision и idempotency key. Пока исход неизвестен, другой текст и pull блокируются. Не удаляйте pending state ради нового ключа. Ошибки не выводят тела ответов или credentials.

Локальные `claim/checkpoint/handoff` не вызывают серверные команды. Локальная аренда не заменяет серверную аренду с fencing token, получаемую через MCP. Изменение Markdown не позволяет одобрить собственную работу или изменить человеческие рамки активного плана.

## Проверки

Из корня: `npm test --prefix engineering/bridge` и `python3 products/sprintique/agent-skills/test_skill.py`. Проверяются CAS, сохранность изменений, потерянный ответ и тот же ключ повтора, roundtrip, разделение credentials и переносимость навыка.

Отдельная приёмка в реальных Codex/Claude Code: OAuth, tools/list, чтение адресной задачи, запись черновика, 401/403 и отзыв доступа. Локальные тесты не доказывают production-совместимость.

Источники: [Codex authentication](https://learn.chatgpt.com/docs/auth), [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
