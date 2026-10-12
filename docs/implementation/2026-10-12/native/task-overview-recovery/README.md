# Task overview recovery — native checkpoint PR88

**Task R2: APPROVE_IN_SCOPE — пять семантических сценариев и завершение двух информационных captures.** Это ограниченное восстановление сводки; весь первый экран, вкладка Work, human/backend и full CI этим verdict не приняты.

## Точная версия и отдельные результаты

Head `1fd928e12b43b26f29ebcb190a5595c1d2618444`; actual checkout `72f862293b80dbbb89352b128eacd592db86ec49`; whole tree `c039d65a75d1e4312b5931cc76a4d28fb7ef8e08`. Git API и raw согласуются по полному дереву. CI checkout имеет родителей `4275dde…` и `1fd928…`. Main4275 является базой этого восстановления; равенство tree текущему main или доказательство какого-либо последующего merge здесь не утверждается.

| Свидетельство | Результат и граница |
|---|---|
| Task artifact `11746932185`, run `38249543808`, job `114811955572` | Пять PASS: completed-rejected, completed-blocked, review-literal, question-no-answer, genuine-complete. Long-review-desktop и long-review-narrow — CAPTURED. |
| Независимый Task R2 | APPROVE_IN_SCOPE; 12 Task PNG лично просмотрел отдельный рецензент. |
| Tabs в том же native job | 16 profiles PASS; собственный raw и scope, не часть verdict Task R2. |
| Estimate в том же native job | 10 cases PASS; собственный raw и scope, не перенос старого 4ff/642 PASS. |
| Maps, run `38249543770`, job `114811955251` | 4 profiles + 5 recovery cases PASS; отдельный companion runner. |
| Full attempt1, run `38249543772`, job `114811955287` | FAILED при загрузке Gradle, отдельный [неизменяемый пакет](../../ci/task-overview-recovery/attempt-1/README.md). |

В первом snapshot повторная попытка full run имела attempt 2 / in_progress. Готовые native records сохранены независимо от неё. Новая попытка не заменяет первую и требует собственного сертификата.

## Независимое ревью и открытые вопросы

[Оригинальный R2 report](reviews/originals/task-overview-recovery-native-review.md) сохранён byte-for-byte, SHA-256 `72581a66c9586c788416da0d6041a7a317ffd8aa7bb4ad8873748ea009b83d4d`. Спор ролей внутри него — аналитическая работа отдельного GPT-6 Astra агента, не исследование с участием людей. Preserver не заявляет личного просмотра этих PNG.

| Открытая запись R2 | Что остаётся открытым |
|---|---|
| F1 | Композиция длинного narrow first screen: остальные свойства и описание уходят ниже рабочей области. |
| F2 | Противоречивый язык завершения в существующей полной вкладке Work. |
| F3 | В read-only вопросе не объяснена причина отсутствия права ответить. |
| D1 | Recorded BODY focus после общего «Открыть работу»; это диагностическое наблюдение, keyboard-дефект не доказан. |

Эти записи не исправлены и не waived ограниченным APPROVE. Подтверждены восстановление literal результата, различение проблемного шага и завершившегося запуска, нейтральный переход читателя без права отвечать. Текущий preview budget, backend state/permissions и более широкий Work UX не перепроектированы этим review.

[Independent integrity](reviews/originals/task-overview-recovery-native-independent-integrity.json) фиксирует 197/197 inputs (61 product/fixture, 41 DS, 95 Zod), 12/12 compiled outputs и 12/12 PNG. [Исходный collection index](reviews/originals/task-overview-recovery-native-collection-index.json) описывает 45 scratch originals и не является обещанием наличия ZIP/compiled bytes в Git. Source/card/R1 ссылки исходного report ведут на точный опубликованный head; исходные scratch paths внутри JSON не переписаны. Их переносимое соответствие даёт [provenance](provenance.json).

## Raw и PNG

| Материал | Offline path |
|---|---|
| Полный Task aggregate | [results.json.gz](task/browser/results.json.gz) |
| Before-native snapshot | [provenance.json.gz](task/browser/provenance.json.gz) |
| Fixture data | [fixture-data.json.gz](task/browser/fixture-data.json.gz) |
| Frozen acceptance plan v2 | [acceptance-plan.json](source/acceptance-plan.json) |
| Tabs browser / build | [browser](tabs/browser/results.json.gz) / [build-only](tabs/build/results.json.gz) |
| Estimate | [results.json.gz](estimate/browser/results.json.gz) |
| Maps | [results.json.gz](maps/results.json.gz) |
| Native job / Maps job | [native.log.gz](jobs/native.log.gz) / [maps.log.gz](jobs/maps.log.gz) |

Все семь отдельных Task case JSON находятся в `task/browser/<case-id>.json.gz`. Все 131 native/companion PNG открываются из [таблицы снимков](screenshots.md). Сохранены 31 новые уникальные PNG; 100 native archive references ссылаются на существующие exact files после проверки байтов. Уменьшения, перерисовки или подмены кадров не выполнялись.

До начала browser run Task `provenance.json` имеет `NOT_RUN`; финальный aggregate имеет общий `PASS`, пять semantic PASS и два CAPTURED. Эти разные фазы не нормализованы. Raw `visualInspection`, `humanAcceptance`, `backendAcceptance` остаются `NOT_RUN`; отдельное визуальное наблюдение рецензента не переписывает их. Tabs build-only аналогично имеет общий browser `NOT_RUN` при собственном build PASS.

Среда Task: native Chromium 151.0.7922.34 / Playwright 1.62.1 / Node 24.20.0, Ubuntu 24.04, light/comfortable, root 16px, ru-RU/UTC, synthetic data. Тёмная тема, text scaling, другие платформы и полноценный keyboard путь не входят в Task semantic matrix. Реальные release-браузеры и assistive technologies остаются отдельной предрелизной проверкой; onboarding не внедрялся.

## Полнота сохранения

Четыре native ZIP содержат **174 file entries**: 131 PNG, 14 полных JSON, 29 compiled outputs. Полные JSON и exact decoded UTF-8 logs сохранены lossless gzip, `mtime=0`, без добавления newline. Все PNG имеют offline mapping. **29 compiled outputs и сами ZIP не скопированы в Git**: сохранены exact inventory, опубликованный source head и build manifests; byte-identity будущего rebuild проверяется по этим SHA.

Safe metadata, reviewer originals и inventories сохранены identity. Подписанные download references исключены. Ранее сохранённые checkpoints, глобальные summaries/manifest и Git этой подзадачей не менялись; root независимо ведёт общий статус и публикацию.
