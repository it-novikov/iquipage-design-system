# Compact native R3: независимая позиция, возражение и решение

Здесь сохранены четыре неизменённых оригинала спора по фактическому compact-A. Сначала ревьюер зафиксировал собственную позицию; затем автор оспорил необходимость ещё одной компоновочной пробы; итоговое решение сохраняет компактный вариант и явно описывает остаточное ограничение. Это решение о кандидате, без human или production PASS.

| Оригинал | Роль в обсуждении |
|---|---|
| [Исходная независимая позиция](task-compact-native-review-initial-position.md) | До чтения решения дизайнера и обсуждения: срок/приоритет видны, но вход остальных свойств частично обрезан. |
| [Позиция автора по остатку](task-compact-residual-designer-position.md) | Возражение от частого планировщика и автора: ещё одно попадание disclosure целиком выше footer мало меняет цену дальнейшего раскрытия; подгонять excerpt под одну fixture не следует. |
| [Полный independent review](task-compact-native-review.md) | Факты пяти изменившихся кадров, спор пользовательских и инженерных ролей, изменение позиции и границы вывода. |
| [Принятое решение](task-compact-residual-designer-decision.md) | Сохранить compact-A без нового plain-frame или sentence-boundary раунда ради единственного случая. |

В документах зафиксирован конкретный компромисс: narrow summary уменьшился с 360.72 до 263.94 px; срок и приоритет читаются целиком. У входа «Другие свойства» остаётся срез 2.375 px нижней части glyph и недостающие 16.375 px полной области. Значения относятся к frozen паре 390×844 и не обещают такую же геометрию всем пользователям. Полное название шага, состояние, CTA и буквальное начало результата сохранены; контекст session не выдаётся за подтверждённое авторство результата.

## Переносимая карта источников

| Исходный путь или ссылка авторов | Сохранённый источник |
|---|---|
| `task-compact-attempt1-11741081977/results.json` и PNG | [Compact attempt1](../../compact-attempt-1/README.md), [полный JSON в lossless gzip](../../compact-attempt-1/results.json.gz) |
| Narrow/dark/H02 из compact | [Narrow](../../compact-attempt-1/narrow-vt1-compact-initial.png), [dark](../../compact-attempt-1/dark-vt1-compact-initial.png), [H02](../../compact-attempt-1/H02-vt1-compact-initial.png), [narrow baseline](../../compact-attempt-1/narrow-baseline-initial.png) |
| `task-prototype-attempt2-11739432628/results.json` | [Attempt2](../../attempt-2/README.md), [полный JSON](../../attempt-2/results.json.gz) |
| `task-first-screen-native-review.md` | [Предыдущий actual review VT1](../task-first-screen-native-review.md) |
| Compact source approval | [Независимый source R2](../compact-source-R2/task-compact-source-review.md) |
| Overlay/plan/design decision | [Frozen experiment ca996807…](https://github.com/it-novikov/iquipage-design-system/tree/ca99680799eee8c865038d537e1bef1def6478f0/experiments/task-first-screen) |

Оригинальные Markdown, ссылки и пути не переписаны. В [compact native evidence](../../compact-attempt-1/README.md) общий результат остаётся `FAILED`: 14 initial captures и четыре CTA engineering probes состоялись, два access probes остановились после Escape. [Native проверка отдельного исправления оценки](../../../../native/estimate/README.md) относится к другому head и собственному scope; она не изменяет исторические результаты compact run. Реальное сохранение Task, Plan Apply, пользовательское исследование и release-проверки этим спором не приняты.

Все четыре документа сохранены побайтно с проверкой заданных SHA256. Только этот README является новой навигационной обёрткой; авторские позиции и их хронология остаются неизменными.
