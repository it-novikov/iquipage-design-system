# Sprintique: переносимый навык

`sprintique-work` — самостоятельный навык работы через Sprintique MCP для Codex и Claude Code. Он поставляется отдельно от четырёх навыков дизайн-системы IQUIPAGE и не зависит от её runtime или версии.

Скопируйте папку `sprintique-work` в `<проект>/.agents/skills/` для Codex или `<проект>/.claude/skills/` для Claude Code. Перед заменой сравните существующие файлы. Подключите Sprintique MCP штатным клиентом, войдите в аккаунт и проверьте `tools/list`. Вызов: `$sprintique-work` в Codex, `/sprintique-work` в Claude Code. Настройка клиента и права проверяются отдельно от наличия папки.

Версия 1.0.0. Навык не содержит credentials, доступа к модели или разрешения на deployment. Сохранённый сервером digest версии навыка должен соответствовать поставленному тексту; наличие записи навыка не доказывает загрузку его внешним клиентом.

Пакет имеет отдельный `MANIFEST.sha256` и не входит в baseline manifest DS-suite 1.1. Проверки исходников: `node --test engineering/bridge/test/remote.test.mjs`, `python3 products/sprintique/agent-skills/test_skill.py` и `python3 products/sprintique/agent-skills/verify_package.py` из корня репозитория. Проверки клиента OAuth и production выполняются отдельно.
