# Property-list proposal: независимый спор R1

Оба оригинала сохранены без изменения текста, ссылок и форматирования. Это source/design review и ответ автора; они не утверждают готовый CSS, API, числовые пороги или native/human PASS.

| Оригинал | SHA-256 |
| --- | --- |
| [Opponent R1](property-list-proposal-opponent-r1.md) | `b55d6ff0fb0a5ec54843e941dc16b6054cc5b94a86a45dabf93baebdb58233d1` |
| [Ответ дизайнера](property-list-proposal-designer-response-r1.md) | `7694966e88cf1f278de114bde5d959d4b6ab45297f1d1865e5914f828c928ba2` |

## Что изменилось в позиции после возражений

| Предмет спора | Уточнённая граница |
| --- | --- |
| Формула A и разные public wrappers | Reference geometry должна учитывать реальные outer items. Один селектор «все дети кроме label» не является контрактом; скрытые inputs и popup сохраняют роли |
| Плотность и spacing | Не обещать одновременно прежние высоты и условный stacked rhythm без механизма различения. Смотреть связь пары и видимый список; zero margin/gap — диагностические гипотезы |
| No-grow label и A/B | A остаётся первым ограниченным кандидатом. B — полноценный конкурент для длинной подписи и ритма. Победитель и коэффициенты пока не определены |
| Tags и static parts | Tag input требует своего рассмотрения. Empty readonly caption — отдельный source finding; avatar/name, key/title и pill caption имеют смысловую роль. Не возвращать намеренно скрытые metadata |
| Открытый popup при resize | Сохранённый DOM не доказывает anchor при container-only resize. Нужен конкретный путь и сопоставление с baseline; все overlay lifecycle не переписываются автоматически |

Автор принял существенные возражения и сузил обещания. Разногласие о конечном выборе A/B оставлено для различающего rendered опыта, а не закрыто голосованием ролей. Требование человеческой читаемости не заменено равенством прямоугольников; спор AI ролей не является исследованием с людьми.

## Переносимые ссылки и время evidence

| Scratch ссылка внутри оригиналов | Сохранённый файл |
| --- | --- |
| `property-list-reflow-design-proposal.md` | [Исходный proposal](../proposal-initial.md) |
| `property-list-reflow-discovery.md` | [Discovery](../../discovery.md) |
| `property-list-proposal-opponent-r1.md` | [Opponent R1](property-list-proposal-opponent-r1.md) |

Оригиналы фиксируют позицию до нового baseline и ссылаются на DS54 / frozen source `6423443…` и `2c757009…`. Более поздний [baseline attempt 2](../../baseline-attempt-2/README.md) имеет статус `CAPTURED_WITH_OBSERVED_CONSTRAINTS` с avatar gap и отсутствующим отдельным outer-carrier measurement. Он не превращает ранние предложения в принятые API. Старый proposal, discovery и failed attempt 1 не исправляются задним числом; дальнейшая реализация требует явной ограниченной дельты и соответствующих доказательств.
