# Full CI Task recovery — попытка 1, FAILED

**Run `38249543772`, attempt 1, job `114811955287`: failure.** Сбой произошёл при загрузке `gradle-9.6.1-bin.zip`: сервер вернул HTTP 504 до запуска backend-тестов. Это сохранённая неудачная попытка; результат другой попытки не заменяет её.

Head `1fd928e12b43b26f29ebcb190a5595c1d2618444`; actual checkout `72f862293b80dbbb89352b128eacd592db86ec49`; whole tree `c039d65a75d1e4312b5931cc76a4d28fb7ef8e08`. Checkout прочитан из exact job log; Git tree/source inputs отдельно сверены.

## Что сертификат действительно содержит

[Оригинальный verification.json](verification/verification.json) создан `2026-10-12T12:32:40.536Z`, SHA-256 `5aaa50adebfa3859e98dab67b6d3509df5d485740d5566d145a33d8b78b77aa8`.

| Check | Результат |
|---|---|
| verification-tools | PASS; 1/1 test |
| library-build | PASS |
| library-tests | PASS; 478/478 tests, fail/cancelled/skipped/todo — 0 |
| product-boundaries | PASS |
| product-build | PASS |
| product-tests | FAIL, exit 1; Gradle download HTTP 504 до backend tests |
| source-stability | PASS |

Здесь **семь checks: шесть PASS, один FAIL**. Detached-product отсутствует в сертификате, его прогон и image build/load не выполнялись. Числа product/backend tests не придуманы. Причина видна в [product-tests.log.gz](verification/product-tests.log.gz) и [полном job log](jobs/verify.log.gz); последний декодируется в 246 108 исходных UTF-8 bytes, SHA `f2f4dc622907bdda2bd097600daf288166b2aa175d6304ca4ad51fcc9565c855`.

Все **1 246** source-input hashes независимо сверены с точным Git head. [sources.json.gz](verification/sources.json.gz) и [sources-after.json.gz](verification/sources-after.json.gz) декодируются в одинаковые байты. Пересчитанный fingerprint `4fa6a94e01c56b8f843ababb27cf720fdf44f8bdbfe9c05984dd8813a3332729` совпадает с обоими fingerprint сертификата. Это source integrity попытки, а не успешный full CI.

## Planning до сбоя

Planning browser был выполнен до backend verification: общий PASS, три профиля, пустые geometry/interaction/page/off-origin failures. Новый [results.json.gz](planning/candidate/results.json.gz) сохраняет checkout этой попытки; SHA исходного JSON `be022b4adbd2e1a609874c6bdd2c79bcd467626f438e0cbbf547c102b6eef3c1`.

Два ZIP содержат одинаковые 13 Planning files. Все 12 PNG byte-identical ранее сохранённым; [таблица PNG](screenshots.md) открывает exact files. Это собственный Planning result до HTTP-сбоя, не PASS backend или всего Task.

## Mapping и следующая попытка

[Provenance](provenance.json) перечисляет все 36 file entries двух ZIP: 10 verification files и два набора из 13 Planning files. Certificate сохранён identity, logs/source JSON — полным lossless gzip с `mtime=0`. ZIP и signed download references не перенесены.

Отдельный [snapshot attempt 2](../observations/attempt-2-in-progress.json) фиксирует `run_attempt: 2`, `status: in_progress`, `conclusion: null` на стадии этого checkpoint. Он не меняет failure attempt 1 и не даёт нового full PASS. Native [Task R2 и companions](../../../native/task-overview-recovery/README.md) имеют собственный scope и остаются отдельными свидетельствами.
