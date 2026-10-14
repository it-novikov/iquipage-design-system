# Full CI Task overview recovery — первый сохранённый checkpoint

Для точного head `1fd928e12b43b26f29ebcb190a5595c1d2618444` сохранена [попытка 1](attempt-1/README.md): run `38249543772` / job `114811955287`, **FAILED** из-за HTTP 504 при загрузке Gradle 9.6.1 до backend tests. Сертификат содержит шесть успешных checks и один неуспешный; detached product и image не выполнялись.

[Отдельное наблюдение попытки 2](observations/attempt-2-in-progress.json) отражает `in_progress` при сборе этого checkpoint. Готовые native и первая попытка сохранены без ожидания retry. Последующее завершение попытки 2 требует отдельного пакета и не заменяет `attempt-1/`.

[Task R2 APPROVE_IN_SCOPE и companion native](../../native/task-overview-recovery/README.md) ограничены своими проверками. Полного CI PASS или общей human/UI приёмки этот checkpoint не заявляет. Source of record: actual checkout `72f862293b80dbbb89352b128eacd592db86ec49`, whole tree `c039d65a75d1e4312b5931cc76a4d28fb7ef8e08`.
