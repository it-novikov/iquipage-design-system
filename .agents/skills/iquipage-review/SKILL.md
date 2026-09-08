---
name: iquipage-review
description: "Проверяет реализацию и код внедрения IQUIPAGE: публичные компоненты, отсутствие локальных UI-замен, визуальное соответствие, сетка, отступы, контраст, состояния, доступность, производительность и сохранение функций. Использовать для приёмки, code review и цикла исправлений после внедрения. Выдаёт конкретные finding IDs и проверяемые способы исправления. По умолчанию read-only; не заменяет discovery или самостоятельное проектирование продукта."
compatibility: "Чтение проекта и принятой DS. Помощники: Python 3.10+; browser capture отдельно требует Playwright и установленный движок. Ограниченный аудит возможен без runtime, но без его приёмки."
metadata:
  suite-version: "1.1.0"
  ds-baseline: "0.5.7"
  language: "ru"
---

# Приёмка внедрения: код, реальный интерфейс и честные границы

## Режим
По умолчанию read-only для приложения; отчёты разрешены. В «проверь и исправь» или разрешённом implement-цикле сначала сохрани finding, затем выполняй правки в прежних границах. Не превращай review в незаказанный redesign.

Прочитай [конституцию](references/constitution.md), [рабочий контракт](references/execution-contract.md) и [метод качества](references/quality-method.md). Выбери: targeted audit или full-integration. Недоступный browser даёт ограниченный отчёт, не готовность runtime.

## 1. Зафиксируй независимую основу
Прочитай approved scope, inventories, DS archive/hash, app revision/dirty diff и план приёмки. Для всей миграции сверить все маршруты, overlays, auth/admin/flags/роли; не доверять списку только от исполнителя.

`verify_release.py` проверяет pinned DS. `fingerprint_inputs.py` может хешировать явно перечисленные app/build/lock/config inputs; полнота списка требует ревью. Прежние DS-отчёты — свидетельства поставщика, не новое тестирование продукта.

До прогона сформируй `assets/acceptance-plan.example.json`: surfaces, required checks, dimensions, expected environment, метод и типы evidence. Подтверждённый digest хранится вне редактируемого assessment. Нельзя сократить план задним числом ради PASS.

## 2. Найди обходы и ошибки кода
`scripts/integration_scan.py` — только кандидаты. Определи реальные roots/vendor/adapters, рассмотри исключения и пропущенные файлы. Ноль сигналов или exit 0 не доказывает соответствие DS. Каждое исключение должно иметь точную причину, owner, approval и SHA; адаптерная папка не разрешение на новый визуальный язык.

Проследи import → rendering → event → state → API → confirmation → reload. Проверяй public props/types/events, slots, SSR при наличии, deep links, отмену, восстановление, race/conflict, permissions, безопасные URL/Markdown, cleanup/listeners/Blob. Разделяй supplied native HTML, правильную composition, interop, локальный bypass и unknown.

Для подозреваемого DS-дефекта — минимальная fixture с неизменённым vendor без app styles. Не устраняй дефект private DOM-патчем: используй [GAP protocol](references/gap-protocol.md). Обязательную missing capability нельзя скрыть заменой функции.

## 3. Пройди интерфейс и профессионально оцени композицию
Используй [рубрику](references/design-review.md). Проверяй главный объект, сетку, иерархию, density, icon boxes, отступы и переносы, orphan-разделители, визуальный шум, доступность actions. Сохрани и ПРОСМОТРИ before/after одинакового содержимого в обеих темах и согласованных размерах. Автоматический overflow не заменяет это действие.

Проверь meaningful data, happy/empty/loading/error/retry/denied/readonly/pending/conflict/cancel/undo/reload, selected+hover+focus-visible, вложенные dialog/menu/date, IME. Сравнивай фактическую составную поверхность после стабилизации анимаций. Genuine WebKit touch не заменяется Chromium mouse; CSS zoom не переименовывается в browser zoom.

Пассивный `capture_surface.py` фиксирует кадр и измерения; не тестирует сценарий и не ставит PASS. Его сеть ограничивается точными разрешёнными origins. Используй обезличенные данные; URL-навигация исполняет JS и не является режимом sandbox.

## 4. UX, агенты, производительность
Новичок понимает действие и результат; эксперт сохраняет контекст. Для agent-сценариев [контракт](references/human-agent.md) отделяет инициатора, мандат, выполнение, принятие и сохранение. Там, где агентной функции нет, документировать применимость, а не выдумывать PASS.

Измерь реальные bundle/network, lazy requests, idle, long tasks, большие рабочие модели и reduced motion в требуемой среде. Обозначь метод и данные. Размер gzip библиотеки не равен initial JS приложения, а JS-duration — не FPS.

## 5. Finding и закрытие
Находка: стабильный ID; severity; confirmed/hypothesis; поверхность; reproduction; evidence; нарушенное правило; вред; причина/гипотеза; точная переделка; acceptance. Вкусовое несогласие не объявлять нормативным дефектом. Непроверенную гипотезу не закрывать как исправленный баг.

Resolved требует repair record, affected files, новой проверки именно этого finding на текущем build и evidence позднее обнаружения. Ссылка на старый общий PASS не принимается. Не удалять провал из истории. Два безуспешных исправления одного root cause — повод пересмотреть причину, не снять тест.

## Проверяемый отчёт
`assets/assessment.example.json` — schema 2.0. Команда приведена в [формате приёмки](references/assessment-v2.md). Передай plan и независимо известные plan/app/DS hashes. `--require-ready` проверяет полноту ДАННОГО scope; не выдаёт разрешение на релиз/deploy и не доказывает правдивость автора evidence. Читай raw logs/assertions и кадры.

Schema 1.0 читается только как исторический диагностический формат: он больше не выдаёт готовность. Общие dimensions обязаны быть явно applicable либо approved N/A; PASS без связанных checks недопустим. Выход — assessment, findings-report, fix-ledger, gaps, run-state и handoff, с ограничениями и следующим конкретным шагом.
