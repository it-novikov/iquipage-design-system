# Независимое source review исправления оценки

**APPROVE для проверки в браузере.** Это не native, backend или human acceptance. Сами оригиналы ниже сохранены побайтно.

- [R1: полный разбор реализации](estimate-fix-source-review.md), SHA256 `b8b30e10801c31cd9e8dd5f7141a4ceb579d3b015c808c9fa71e6d89d1f80186`.
- [Исправление ранней интерпретации failure](task-estimate-source-correction-attempt3.md), SHA256 `e747f5793be5ef5979923648c86f9a86b0d813ba935448dff6084e846df7eb42`.

## Точный исходник

R1 проверил локальный AI-authored commit `47dcbf2c46496e7908b3c94cee91c9813eec81c5`. Его **полное дерево** `f43689d3a5553c07468ef40eccf5c7af8538892f` опубликовано в [189d07856342b8ec9daecb6d74741b00454cc744](https://github.com/it-novikov/iquipage-design-system/commit/189d07856342b8ec9daecb6d74741b00454cc744), от того же parent main `2c757009d7bf3e3d0fc3648241d499d980ebdbb9`. GitHub connector формирует metadata commit отдельно; равенство относится к всему tree, а не к одинаковому commit SHA.

Следующий commit добавляет harness, fixture, CI и этот review packet. Три runtime/style файла и оба DS integration документа остаются ровно проверенными R1. Обновлённый статус карточки, tests и workflow не включаются задним числом в R1.

## Что именно сломано в исходном интерфейсе

[Attempt3, run38234809826](https://github.com/it-novikov/iquipage-design-system/actions/runs/38234809826), artifact11739838266, ZIP SHA256 `68c9f552716e8b9cc6255f78d93138892b69a6762f26ee8a9ca80ef47939cbef`: popup **открылся** вне modal, actual focus остался на trigger, после Escape Task исчез, popup остался. Failed wait относится к закрытию после Escape; ранняя трактовка как отказа открытия отозвана. Trace не записывал keydown/cancel dispatch: причинная цепочка событий уточняется исходниками.

R1 дополнительно уточняет route закрытия: Task имеет собственный capture-обработчик native cancel с close/flush guard. Поэтому нельзя приписывать фактическое закрытие конкретно DS listener по этим кадрам. Владение popup, фактический фокус и оставшийся popup подтверждены независимо от этого уточнения.

## Переносимость и последующая проверка

Абсолютные sandbox-пути внутри оригиналов отражают среду исследования. Локальная копия correction находится рядом по ссылке выше; первичные before/failure PNG и lossless raw сохраняются также в docs checkpoint ветки `docs/task-first-screen-capture`. Подмена оригинальных ссылок изменила бы отпечаток, поэтому переносимые связи вынесены сюда.

Native harness запускает настоящий Task из уже существующего fixture и существующие nonmodal estimate/menu helpers. Отдельно проверяются lifecycle stimuli и внутренняя геометрия редактора. Он не доказывает реальный Task save, сетевую запись, работу даты/плана во всех состояниях или человеческое удобство. После нового CI findings закрываются только в границах реально пройденных сценариев.
