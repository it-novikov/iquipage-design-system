# Первый native запуск: отказ сценария открытия Task

**Статус: FAILED до открытия Task. Это не результат визуального сравнения.** [Run 38232257749](https://github.com/it-novikov/iquipage-design-system/actions/runs/38232257749), job `114754315509`, artifact `11739177058`. Исходный head — `a82960df22cd93dfa8dcbdda618e3169cbcda068`; actual checkout `97738178c8c72cc8d6288d1dd83f4ccdecfc644f` имеет тот же полный tree `5ad867fffd02de99566c796cbfa17a7a21783f97`.

В данных есть родительский Epic и отдельная карточка Task. Общий locator `[data-open-task="task-1"].first()` выбрал скрытую ссылку на подзадачу внутри свёрнутого эпика. Браузер правильно отказался нажимать невидимый элемент. Все 14 frame attempts и шесть probes остановились на этом одинаковом условии. `pageErrors`, `consoleErrors`, `externalRequests` пусты; две статические сборки и прежние шаги tabs geometry прошли.

Root просмотрел [исходный H01 кадр](H01-baseline-open-failure.png): собственная карточка Task действительно видима в колонке «В работе». Исправление ограничено выбором её настоящего заголовка: `article[data-task-surface="task-1"] > button.task-card-title[data-open-task="task-1"]:visible` и обычным strict click. `force` не используется; родитель в fixture, source overlay и все oracles сохраняются. [Точный исправляющий commit](https://github.com/it-novikov/iquipage-design-system/commit/0c74ab69487fa5d7ec66ead92400043901e85af2).

## Сохранённые оригиналы

- Все 14 `*-open-failure.png` находятся рядом без изменения байтов. Это кадры Board после отказа открытия, не кадры Task.
- [Полный results.json.gz](results.json.gz), uncompressed SHA256 `9eac4327d6c0b625f897af0452c99c4f1aabf6bd5d0fc9954980257cb1b444c4`.
- [Полный job.log.gz](job.log.gz), uncompressed SHA256 `7a914035d44a7057eac3074df1cc36cc2082480b3ea4f0c082618b985eb46e5e`.
- [Provenance и полный список 39 файлов artifact](provenance.json), включая SHA каждого кадра и emitted asset. ZIP SHA256 `49286403f2552dbc9fc24ea466b3e42829ff74090ed35c31957a022f98d31904`, 3 908 490 bytes.

PNG, JSON и журнал сохранены целиком; для JSON/журнала использован lossless gzip. Промежуточные compiled assets воспроизводятся из опубликованного frozen кода и exact package; их hashes сохранены, сами build outputs в Git не копируются. Повторный run оформляется отдельно и не переписывает этот отказ.
