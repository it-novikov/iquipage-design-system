# Источники и границы знания

## Предоставленная система
База: архив `IQUIPAGE-05.7.zip`, SHA256 `0eb12439404cfff3e87118d447e133252fcae01a2a8e4329f264a3c79e33be2c`, пакет `@iquipage/web` `0.5.7`. См. `assets/ds-release-lock.json` и `references/release-map.md`. Источник API — фактические dist/entries, types, docs и публичные примеры пакета. Прежний `@iquipage/ui` из миграции Sprintique не объявляется API этого Web-пакета.

Основания арт-дирекции: предоставленное исследование «Качество как система — исследование для Sprintique», раздел «Общее — точность намерения», шесть принципов; раздел «Что мешает нынешнему Sprintique». Это экспертные гипотезы переноса, не доказанный эффект на конверсию. Сводка передана в constitution.md; весь исходный исследовательский архив не включён.

Переданные заявки агента: точность различия срока и интервала, неизменность domain semantics, отсутствие CSS/DOM обходов, реальное разделение ESM, проверка обоих оформлений и controlled API, compact work layout, read-only Markdown viewer. Исторические баги должны проверяться на новой версии; нельзя объявлять их актуальными только по старому скриншоту.

## Внешняя документация, проверенная 2026-09-07
- Agent Skills specification: https://agentskills.io/specification — формат SKILL.md, YAML frontmatter, scripts/references/assets; не гарантия одинаковых прав и автозапуска в разных агентах.
- OpenAI, Build skills: https://developers.openai.com/codex/skills/ (редирект на https://learn.chatgpt.com/docs/build-skills) — `.agents/skills`, явный вызов `$name`, опциональный agents/openai.yaml.
- Anthropic, Claude Code skills: https://code.claude.com/docs/en/skills — `.claude/skills`, вызов `/name`; установка папки не даёт новых инструментов или прав.
- W3C: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html — требования контраста текста.
- W3C: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html — необходимая информация компонентов/графики.
- W3C: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html — видимый фокус.
- W3C: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html — target size и исключения.
- W3C: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html — reflow и двумерные исключения.
- W3C APG: https://www.w3.org/WAI/ARIA/apg/ — паттерны ролей и клавиатуры, не сертификат соответствия.

## Авторские процедуры этого комплекта
Роли четырёх скиллов, гейты, форматы отчётов, severity, сценарии опроса и Human/Agent contract — новые рабочие инструкции по запросу владельца. Они не выданы за существующие функции библиотеки, результаты независимого UX-исследования или гарантию соблюдения скилла любой моделью. Каждый новый проект требует своих согласованных требований и тестов.

## Сверка формата при ревью 1.1 (2026-09-07)
- https://agentskills.io/specification — frontmatter, description, локальные ресурсы и progressive disclosure.
- https://developers.openai.com/codex/skills → https://learn.chatgpt.com/docs/build-skills — местоположение .agents/skills, explicit invocation, optional openai.yaml.
- https://code.claude.com/docs/en/skills — .claude/skills, invocation и ограничения metadata.
Это внешняя проверка packaging/discovery, а не источник изменений принятого IQUIPAGE и не подтверждение работы навыков на модели. Улучшения скиллов основаны на ревью их исходных файлов и synthetic tests.
