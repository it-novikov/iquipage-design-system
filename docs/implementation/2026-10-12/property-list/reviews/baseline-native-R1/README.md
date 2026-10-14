# Property-list: независимый native baseline review R1

[property-list-baseline-native-review.md](property-list-baseline-native-review.md) — неизменённый отчёт `/root/task_estimate_review`, **21 891 B**, SHA-256 `5b3078f1f5c5aa4d073a1382ce4efe719a50ca499006dee3f22410a337516ca6`. Reviewer лично просмотрел все десять PNG, сопоставил raw/source/ZIP и не запускал новый браузер. Агент сохранения проверил байты отчёта; собственная визуальная приёмка ему не приписывается.

**Вердикт автора: baseline пригоден для первого ограниченного rendered опыта, с двумя подтверждёнными пробелами покрытия.** Это дополнение к `CAPTURED_WITH_OBSERVED_CONSTRAINTS`, а не PASS будущего исправления. `targetAcceptance`, `humanAcceptance`, `backendAcceptance` остаются `NOT_RUN`; A/B, публичный default и коэффициенты ещё не приняты.

## Что уточнил независимый разбор

| Вывод автора | Граница |
| --- | --- |
| Потери labels/selected captions видны в public wide-list без Sprintique CSS | Source фиксирует ограниченную колонку label и высоты; это не утверждение о всех DS modes или всём Task |
| Narrow/text200 и wide-tight/text200 имеют одинаковые row measurements | Ширина компонента влияет самостоятельно; доказательство не выбирает автоматически A, B или порог |
| Fixed height, range/Canvas и native inputs требуют разных трактовок | Не каждая диагностическая запись — нарисованное усечение; observations не являются числом независимых дефектов |
| В owner/reference-owner отсутствует предполагаемый avatar | Fixture передал `id/name` вместо `avatar.text`; static author использует другой public путь. Пробел не исправлен в frozen raw |
| Outer carrier отдельно не записан | Внутренний trigger не заменяет carrier/margins/flex-basis. Будущую формулу layout этим baseline доказать нельзя |

Отчёт рассматривает цену плотности, целостность пары, avatar/name и значение длинной подписи для различения A/B. Он рекомендует ограниченный опыт на фактических wrappers, сохраняя роли popup и hidden input. Passive capture не проверяет container-only resize открытого editor, поиск/фокус, tag remove, реальные Plan/Estimate, readonly Task, backend или пользователей. Полный document PNG также не доказывает fit первого viewport.

## Переносимые источники оригинала

| Scratch ссылка в отчёте | Сохранённый эквивалент |
| --- | --- |
| Attempt 2 `browser/results.json` | [Полный raw gzip](../../baseline-attempt-2/browser/results.json.gz) |
| Attempt 2 `browser/provenance.json` | [Исходный source/build snapshot gzip](../../baseline-attempt-2/browser/provenance.json.gz) |
| Attempt 2 metadata | [metadata.json](../../baseline-attempt-2/metadata.json) |
| Exact job log JSON string | [JSON-decoded UTF-8 log gzip](../../baseline-attempt-2/jobs/verify.log.gz), без добавленного newline |
| Attempt 1 results | [Исходный FAILED raw gzip](../../baseline-attempt-1/browser/results.json.gz) |
| `wide-normal-document.png` | [Те же bytes attempt 1](../../baseline-attempt-1/browser/wide-normal-document.png) |
| `narrow-normal-document.png` | [Те же bytes attempt 1](../../baseline-attempt-1/browser/narrow-normal-document.png) |
| `narrow-text200-document.png` | [Те же bytes attempt 1](../../baseline-attempt-1/browser/narrow-text200-document.png) |
| `wide-tight-text200-document.png` | [Те же bytes attempt 1](../../baseline-attempt-1/browser/wide-tight-text200-document.png) |
| `wide-text200-document.png` | [Те же bytes attempt 1](../../baseline-attempt-1/browser/wide-text200-document.png) |

Все десять PNG исходного attempt 2 равны соответствующим файлам attempt 1; весь mapping и SHA доступны в [package provenance](../../baseline-attempt-2/provenance.json), включая отдельные viewport версии. Файлы с одинаковыми байтами не выдаются за новые изображения. Exact GitHub links оригинала закреплены на `f834a68a…`; его checkout `00d4a407…` имеет то же дерево `46e42c2b…`. Он происходит от Estimate `6423443…`, не является новым product main `4f181ff…` и не принимает его композицию.

[Discovery](../../discovery.md), [исходный proposal](../proposal-initial.md), [opponent R1 и ответ дизайнера](../proposal-R1/README.md) сохраняют первоначальные позиции. Этот native отчёт добавлен отдельно, с новым evidence и сужениями; прежние файлы, raw и формулировки не переписаны.
