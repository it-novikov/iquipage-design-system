# Task: initial adoption review фактического PR84

[initial.md](initial.md) — неизменённый `task-production-vt1-adoption-review.md`, **26 810 B**, SHA-256 `542871074da7c7f69209325d3cc1d12c213ca1254b94f52c3cc304134229d9d5`. Автор `/root/task_first_screen_review` выполнил source/model review и описал границы лично просмотренных изображений. Сохранение файла не присваивает этому агенту авторство или визуальную проверку.

## Какие версии нельзя смешивать

| Версия | Роль и граница доказательств |
| --- | --- |
| Main `4f181ff3589a32fd9ce152f99018d212d74624b6` | Исследуемый merge PR84; продуктовый VT1 уже существует. Новый main здесь не получил native/human acceptance |
| PR84 head `d6132831d6068533883523770cd88c63a8de6326`, base `2c757009d7bf3e3d0fc3648241d499d980ebdbb9` | Параллельная реализация, отличающаяся от обоих frozen прототипов |
| Frozen initial `0c74ab69487fa5d7ec66ead92400043901e85af2` / Compact `ca99680799eee8c865038d537e1bef1def6478f0` | Прежние сравнительные условия и измерения; PR82 не изменяется и не ретаргетируется |
| Estimate head `6423443d71a0817570281cf28822a3c14f7db684`, base `2c757009…`, tree `81fa1c…` | [Native](../../../../native/estimate/README.md) и [full CI](../../../../ci/estimate/README.md) относятся к этому кандидату. Они не принимают автоматически композицию с `4f181ff…` |

Основной вывод автора: повторно переносить всю experimental patch не нужно. У PR84 уже есть 4+7 свойства и конкретный prefix результата, но отличаются создание задачи, group CSS/reveal, алгоритм prefix и summary. Подтверждённый source/model риск — неподписанный статус завершённой сессии перед выбранным rejected/blocked шагом. Предложено уточнить область показа статуса, сохранив session state, selector и права.

Решение о Compact на текущем длинном review остаётся гипотезой до соответствующего current render. Два рассмотренных автором narrow PNG показывали обычную Task без work summary; они не разрешают вопрос о длинном summary. Сам Git blob PNG без verified capture manifest не связывает исполнение browser с исследуемым source. Старые значения высоты и clipping нельзя переносить на новый layout как измеренные.

Спор AI ролей сохранён в оригинале: инженер возразил против смешения уровня session и шага и отдельно сообщил, что самостоятельно PR84 source не читал. Это проверка рассуждения, не второй независимый source PASS и не human research. Create/type-template-priority, реальные Plan apply/busy/error, backend, readonly и другие перечисленные границы не превращаются в новую обязательную матрицу на каждую правку.

## Переносимые ссылки из оригинала

| Исходное относительное имя | Сохранённый документ |
| --- | --- |
| `task-first-screen-native-review.md` | [Первый native review](../task-first-screen-native-review.md) |
| `task-compact-native-review.md` | [Compact native R3](../compact-native-R3/task-compact-native-review.md) |
| `task-compact-residual-designer-position.md` | [Позиция дизайнера](../compact-native-R3/task-compact-residual-designer-position.md) |

Exact GitHub URLs на PR84 source, model tests, два PNG и frozen patches сохранены внутри [initial.md](initial.md). Содержимое оригинала, его пути и формулировки не исправлялись. Предыдущее [сравнение prototype](../../README.md) остаётся историческим пакетом; новые выводы относятся только к явно названному scope adoption review.
