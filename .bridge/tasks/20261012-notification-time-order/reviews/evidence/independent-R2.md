# NT05 — независимое follow-up ревью R2

## Предмет и граница результата

**Вердикт: approve для scoped code/test review.** F1 и F2 из R1 исправлены в frozen кандидате. Реальный backend, A1–A3 и полный release gate остаются отдельными открытыми условиями; этот вердикт не является runtime PASS, production acceptance или разрешением merge/deploy.

- Репозиторий: `it-novikov/iquipage-design-system`.
- Reviewer: `notification_review_r1`, тот же независимый от автора агент, который выполнил R1.
- Дата: 2026-10-12.
- Frozen кандидат: `9943d62a6036f5052a13dbedb0713204d9407e59`.
- Frozen tree: `4cea6e5c7bbbcf24b9284fa2516dcf8dca3ba709`.
- Непосредственный parent: `44954a33bd3d2c6d010df33cd5ec3140f313b00e`.
- Tree parent: `b9e7a93f2bb68cb57e83d7b1dd98219bb43811cb`, идентичен tree первоначально рассмотренного R1 commit `edfc244f757d9c1d46d5e18d7b807628bcfb7603`.
- Исходный base линии: `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`.

Identity, parent и tree проверены через объекты Git. Рассмотрен diff `44954a33..9943d62a`; полный список изменений относительно исходного base дополнительно проверен на сохранение test-only scope. Working tree не использовался как предмет ревью. Репозиторий и remote не изменялись.

## Diff и сохранность R1

Относительно parent изменены шесть файлов: NT05 (`8` строк diff), карточка, evidence, journal, канонический индекс R1 и архивный оригинал R1. Суммарно `181 additions / 14 deletions`, основная часть — материалы ревью. Единственное изменение исполняемого кода находится внутри NT05.

Архив `.bridge/tasks/20261012-notification-time-order/reviews/evidence/independent-R1.md` побайтово сравнен с первоначальным `research/continuation/notification-review-r1.md`.

Результат: **байты совпадают**, SHA256 `d39ac91a0e968607e3c95305ca1c6dcfb5389596846fa5cdc8b41b0392c62543`. Исходный файл R1 не переписывался. Его `changes-requested`, исходные findings и исторический предмет сохранены. Канонический индекс явно отделяет ответ автора от независимого закрытия; данный R2 и есть отдельное подтверждение исправлений.

## Закрытие замечаний

### F1 [P1] — точность курсора: закрыто

**Решение: [fixed 9943d62a6036f5052a13dbedb0713204d9407e59].**

В `products/sprintique/tests/notifications.test.ts:153` tied group теперь имеет `2000-01-01T00:00:00.500001Z`. Прежний expected order `1,2,3,25,…,4`, размеры 20/5 и граница ordinal 9/8 сохранены (`:155–169`).

На исправленных данных точный cursor — `(500001 µs, 9)`, и оставшиеся IDs — `8,7,6,5,4`. Усечение cursor до миллисекунд даёт `(500000 µs, 9)` и исключает весь этот хвост. Поэтому описанная в F1 регрессия теперь нарушает и `second.items.length === 5`, и точный массив IDs. Исправление проверяет точность времени именно на границе, одновременно сохраняя проверку tie-break по ID.

Дополнительных записей, date parser, зависимости, runner или production-изменений не внесено.

### F2 [P2] — включающая граница read-all: закрыто

**Решение: [fixed 9943d62a6036f5052a13dbedb0713204d9407e59].**

Read-by-id перенесён на `first.items[2]`, то есть ordinal 3 (`notifications.test.ts:171`). Тест подтверждает его `read === true` и явно подтверждает `first.items[0].read === false` до read-all (`:173–175`).

Cutoff остаётся равным timestamp ordinal 1 (`600002 µs`), а поздняя строка ordinal 26 имеет `600003 µs` (`:179–182`). Теперь корректное `<= before` оставляет unread `[26]`, а ошибочное `< before` оставляет `[1,26]`. Последний результат нарушает как count `1`, так и exact unread-ID assertion. Cross-user target ordinal 2 остаётся непрочитанным и сохранён для исходной проверки (`:177–178`).

## Независимая проверка различимости регрессий

Выполнен повторный расчёт целочисленных предикатов по параметрам **из frozen source**. Перед вычислением скрипт через `git show` проверил наличие `.500001Z`, read-by-id `first.items[2]`, явного `afterOne.items[0].read === false` и исходного cutoff `first.items[0].createdAt`.

| Вариант | Полученный результат | Результат относительно исправленных assertions |
| --- | --- | --- |
| Точный timestamp DESC, id DESC | Страница 1: `1,2,3,25,24,…,9`; страница 2: `8,7,6,5,4` | Совпадает. |
| Точный cursor `(500001 µs, 9)` | Хвост `8,7,6,5,4` | Совпадает. |
| Cursor, усечённый до `(500000 µs, 9)` | Хвост `[]` | Отклоняется: F1 закрыт. |
| Включающий read-all после read-by-id ordinal 3 | Unread `[26]` | Совпадает. |
| Строгий read-all `< before` после read-by-id ordinal 3 | Unread `[1,26]` | Отклоняется: F2 закрыт. |

Это независимый анализ данных и сравнений, **не PostgreSQL/API-тест и не runtime PASS**. Никакие моки БД или дополнительные test artifacts в репозиторий не добавлялись.

## Что не ослаблено и побочные эффекты

- Три верхних timestamp `.600002Z`, `.600001Z`, `.600Z` и противоположный им порядок IDs сохранены. Тест продолжает отличать точный timestamp order от ID-only и от millisecond-rounded timestamp с ID tie-break.
- Оба полных expected-ID массива, точные размеры 20/5, `nextCursor === null` на второй странице, equality tied timestamps и отсутствие пересечений сохранены.
- Изоляция собственного synthetic recipient и `before === 25` сохранены. Global `dan` и соседние NT01–NT04/NT06+ не изменены.
- Невалидный cursor, unread/read-by-id, cross-user no-op, поздняя строка на +1 µs, exact unread ID, пустая read-команда и два runtime-role отказа INSERT/UPDATE(kind) сохранены.
- Промежуточное чтение страницы переиспользовано через `afterOne`; количество HTTP GET на этом шаге не увеличено. Добавлена одна явная проверка непрочитанной cutoff row.
- Diagnostic старого строкового predicate остался диагностикой; он не превратился в permanent assertion, привязанный к представлению времени serializer.
- Полный список файлов относительно исходного base подтверждает отсутствие изменений runtime SQL/serializer, migrations/RLS/grants, contracts, manifests, vendor или workflows.
- Evidence и карточка описывают именно внесённые исправления и прямо сохраняют CI/R2 acceptance pending на момент заморозки. Они не подменяют авторской оценкой независимое approve.

По ролям разногласие из R1 разрешено минимально: QA получает два различимых отрицательных сценария; backend precision и изоляция сохраняются; maintainer не получает новой инфраструктуры; обе обозначенные пользовательские границы покрыты управляемыми данными.

## Checked / not_run

**Самостоятельно checked:** frozen identity/tree/parent; равенство parent tree предмету R1; полный diff correction; изменённые bridge материалы и сохранность оригинала R1 по байтам/SHA256; NT05 целиком с окрестностью; общий список changed files от исходного base; описанные целочисленные отрицательные сценарии; `git diff --check 44954a33bd3d2c6d010df33cd5ec3140f313b00e 9943d62a6036f5052a13dbedb0713204d9407e59` — exit 0.

**Только авторские сведения:** post-R1 Node syntax, boundaries/styles и bridge checks. Они прочитаны в evidence и не переименованы в мои результаты.

**NOT RUN:** реальный Kotlin/JDK25/PostgreSQL18 HTTP NT05, Gradle, native TS7/Vite build, Chromium, vNext full gate, detached extraction и portable image. Известные локальные blockers не повторялись. Новый remote CI и фактический serializer diagnostic этим reviewer не проверялись. A1 о реальном counterexample и полный backend acceptance остаются pending.

## Итог

- **Вердикт: approve** в явно ограниченном scope независимого code/test review frozen `9943d62a6036f5052a13dbedb0713204d9407e59`.
- **F1 и F2 закрыты исправлением указанного commit; новых P0–P3 замечаний не найдено.**
- Канонические статусы findings можно обновить со ссылкой на этот отдельный R2; исторический оригинал R1 должен остаться неизменным.
- Runtime/CI pending не является PASS. Готовность задачи, A1–A3, merge/deploy и production acceptance этим отчётом не закрываются.
