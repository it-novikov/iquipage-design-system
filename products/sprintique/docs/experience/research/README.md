# Исследование Sprintique и дизайн-системы — архив V3

[sprintique_problem_first_research_plan_v3.md](sprintique_problem_first_research_plan_v3.md) — неизменяемый снимок итогового исследования от **2026-10-11**. Он включает промпт, результаты, problem-first методику, план и два раунда независимого ревью промпта и отчёта. Копия сохранена без изменения содержимого, ссылок и исторических утверждений.

- SHA256: `d8d43a7264f9af19b544e7a4edc340bf9c832572ddc5155c6ae61baa05f760a3`.
- Размер: 302 264 байта.
- Источник копии: переданный владельцу файл `deliverables/sprintique_problem_first_research_plan_v3.md`.

## Публикация после завершения снимка

Описание заблокированной публикации в отчёте относится к **2026-10-11**. **2026-10-12** пользователь явно разрешил публикацию ветки/PR и выполнение плана с промежуточными push/PR. Root опубликовал workflow через GitHub API: [PR №74](https://github.com/it-novikov/iquipage-design-system/pull/74), commit [`be77902b24fc19a0e9cf81c3879207d4210f8ad9`](https://github.com/it-novikov/iquipage-design-system/commit/be77902b24fc19a0e9cf81c3879207d4210f8ad9). Новая попытка CLI push остановилась на аутентификации; это отдельное событие, не прежний отказ автоматической проверки разрешений.

Опубликованный commit имеет tree `f338d4e9cc4f9b22f40cd7e3b4988799fc873ab6`, равный tree прежнего локального HEAD `7296e8982909a94840a902f398601fb28e6a0cd2`. Различаются история и metadata commit, а не файлы этого снимка workflow. Исходные локальные commit/hash в ревью не заменены на remote SHA; [сопоставление версий и границы доказательств](../../../../../.bridge/tasks/20261011-problem-first-product-workflow/reviews/PUBLICATION.md) записаны отдельно. Наличие PR не означает merge, deploy или runtime-приёмку Sprintique.

## Как читать и использовать

Для нового изменения начните с текущего [индекса опыта](../README.md), [сценариев](../SCENARIOS.md) и [правил продукта](../../../AGENTS.md). Архив фиксирует исследование и принятые на его дату решения; актуальное состояние реализации и дальнейшие результаты находятся в карточке соответствующей задачи. Не запускайте весь аудит и два плюс два раунда заново для каждой локальной правки.

Исследование различает V2 source/build `.50`, V3 source `.52` и живое наблюдение с неизвестным production SHA. Исходная V3 база — [`f5f941afa4e9be8a709e6de67a92bacf5a9397ca`](https://github.com/it-novikov/iquipage-design-system/tree/f5f941afa4e9be8a709e6de67a92bacf5a9397ca); её source-выводы не автоматически относятся к последующим версиям. Например, ближайший Maps/Task путь связан с [product host](../../../web/maps-host.js), [navigation](../../../web/main.js), [Maps](../../../ui/src/maps.js) и [Task dialog](../../../ui/src/board/task-dialog.js). При работе проверяйте их текущую версию.

В архиве сохранены три исторические `sandbox:`-ссылки на локальный checkout. Переносимые ссылки на те же документы:

- [R1 — первоначальное независимое ревью repo patch](../../../../../.bridge/tasks/20261011-problem-first-product-workflow/reviews/R1.md).
- [R2 — адресная независимая перепроверка](../../../../../.bridge/tasks/20261011-problem-first-product-workflow/reviews/R2.md).
- [Карточка workflow и текущая передача](../../../../../.bridge/tasks/20261011-problem-first-product-workflow/task.md).

Добавление архива и publication metadata не является новым ревью продукта или модели. Исходные результаты тестов относятся к записанным в отчёте версиям. Production screenshots, cookies, тестовые browser-state файлы и рабочие данные рядом с архивом не сохраняются.
