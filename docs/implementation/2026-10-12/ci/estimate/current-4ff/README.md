# Full CI Estimate: checkpoint `4ff05227…`

**Run `38245659125`, job `114798739719`: completed / success; все 8 certificate checks PASS.** Это новый full run для `4ff05227cad0a9e1c1a35d59faffdddd20e5c354`, actual checkout `ae1364b069f12c0e747f4e28e208ac45dbbfcfe6`, whole tree `c7ad669f19eb5027d63994c9e4d1642b3b9f0bd6`.

Сертификат [verification.json](verification/verification.json) создан `2026-10-12T12:19:50.709Z`, SHA-256 `c4cdebfc1eb95876c2ffc1eec159240f90c0eedce5b30c2d76d06289d2c4a245`. Он полностью совпадает с JSON в [exact job log](jobs/verify.log.gz) после удаления временных префиксов лог-строк. Сам log сохранён lossless без такой обработки.

## Проверки и исходники

| Набор | Tests / pass | Fail / cancelled / skipped / todo |
|---|---:|---:|
| Verification tools | 1 / 1 | 0 / 0 / 0 / 0 |
| DS | 478 / 478 | 0 / 0 / 0 / 0 |
| Product | 609 / 609 | 0 / 0 / 0 / 0 |
| Detached product | 609 / 609 | 0 / 0 / 0 / 0 |

Восемь checks: verification-tools, library-build, library-tests, product-boundaries, product-build, product-tests, detached-product, source-stability. Полные логи каждого сохранены как `<check-name>.log.gz` в `verification/`; соответствие исходных имён сертификата gzip paths содержится в [provenance](provenance.json).

[sources.json.gz](verification/sources.json.gz) и [sources-after.json.gz](verification/sources-after.json.gz) декодируются в byte-identical JSON. Все **1 240** source hashes сверены с точными Git blobs 4ff. Пересчитанный fingerprint `9bbb33d0a450fe6f21146b3a14af2d18d23cb9193f2a8dad9c0560ecdadcfba0` совпадает с обоими fingerprint сертификата. DS tarball — `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`.

[Исходный полный verification report](../../../native/estimate/current-4ff/originals/newparallel-estimate-full-verification.json) и [неизменённая collection metadata](../../../native/estimate/current-4ff/originals/newparallel-estimate-metadata.json) хранятся рядом с оригинальным report в native checkpoint. Полный source/provenance пакет браузерных проверок: [native current-4ff](../../../native/estimate/current-4ff/README.md).

## Planning и image

[Новый Planning results.json.gz](planning/candidate/results.json.gz) имеет общий `PASS`, три профиля и пустые geometry/interaction/page/off-origin failures: desktop 1363×936 light comfortable; compact 1280×720 light compact; narrow 320×568 dark comfortable. Profile entries не имеют отдельного поля `status`; общий verdict не заменён выдуманными profile statuses.

Все **12 PNG** нового full run byte-identical существующим PNG; [таблица снимков](screenshots.md) открывает эти exact files. Два новых ZIP содержат одинаковые 13 Planning files. Новый raw JSON с source revision сохранён отдельно; его SHA-256 `78fd00bc6cd31e0e0995d4429b818d87ed2a3d69502c00381da53c62fa8cc49e`. Planning использует synthetic adapters и заменённый Task callback; backend и human usability из этого browser run не следуют.

Portable image успешно собран, затем `docker load` загрузил `sprintique-server:latest` и `sprintique-server:2.0.0-alpha.0`. Самостоятельный запуск image этим evidence не доказан; image tar отсутствует в скачанных artifacts и здесь не сохранён. JVM warnings и нефатальный detached watcher `Already watching path` остались в raw. Сертификат сохраняет `fullPlatformReady: false`, `productionTouched: false`.

## Интеграция и полнота

Git API отдельно фиксирует merge PR83 в `4275dde301b5068b3d6b1801ecb54c70a2d7e708` в `2026-10-12T12:20:33Z` и равенство его whole tree tested head/checkout. Это observation интеграции, не дополнительный CI run. Ранее сохранённый 642 checkpoint остаётся неизменным.

Оба новых full-CI ZIP проверены по размеру и SHA; **все 37 file entries имеют mapping**: 11 verification files и два одинаковых набора из 13 Planning files. Все raw logs/source JSON сохранены полным lossless gzip с `mtime=0`; certificate — исходный identity JSON. 24 archive PNG references разрешаются в 12 существующих exact files. ZIP и подписанные download references не перенесены.

В `api/` сохранены identity snapshots первоначального `in_progress`, завершённого `success`, job steps и artifacts. Safe Git API proof связан через provenance с общим native пакетом. Глобальный manifest и другие checkpoints этой подзадачей не менялись.
