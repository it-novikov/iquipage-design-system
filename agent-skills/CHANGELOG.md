# Изменения 1.1.0

База: четыре скилла 1.0.0, неизменённая IQUIPAGE 05.7.

## Инструкции
Разделены targeted fix / full migration / limited review. Discovery задаёт только недостающие вопросы; согласованный scope не утверждается заново без причины. Добавлены общая рубрика дизайн-ревью и run-state для продолжения. Сохранены DS-GAP и запрет локальной визуальной подмены. Основные инструкции сокращены, default prompts различаются по назначению.

## Инструменты
Assessment schema 2.0 с отдельным закреплённым acceptance plan, средами, evidence registry, отрицательным scope_ready и связанным повторным закрытием находок. Известные finding IDs не теряются. V1 — только диагностика.
Scanner не пишет snippets по умолчанию, учитывает исключения и безопасные relative paths. Capture принимает точный allow-origin вместо широкого allow-remote, offline без сети, блокирует mutating requests. Отчёты не перезаписываются. Добавлен fingerprint_inputs.py без исполнения кода проекта.

## Совместимость
Имена и standalone структура skills сохранены. DS pin не изменён. Изменения формата assessment и CLI capture намеренно несовместимы со старым ready-gate: см. [миграцию](docs/MIGRATION-1.1.md).

## Приёмка
181 unit/contract/CLI test, 3 offline browser fixtures. HTTP navigation BLOCKED. 40 модельных сценариев NOT_RUN. Никаких новых runtime-проверок DS/Sprintique.
