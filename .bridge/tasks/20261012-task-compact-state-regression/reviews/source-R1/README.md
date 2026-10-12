# Task Compact: независимое source R1

**APPROVE_IN_SCOPE — test-only исходники готовы к новому native прогону.** [Оригинал](original.md), 31 533 B, SHA256 `f5cbc9d0d96f4c5da5a9816a6b95bfdce4416c000715ae9d8fdaf5fc6567f28e`, сохранён побайтно. Native и визуальная приёмка пока NOT_RUN; старые кадры и числовой выигрыш Compact сюда не перенесены.

Проверяемая единица — exact base `5bd09d647f79f06c7a7c844f91a6914907ed8e8b`, tree `6d4a4e4a66b7a46e6bda4f8378a0975def2aea7c`, плюс frozen author patch `fe9262b7b4489e1f20c6768ccc4166070909d4fe85dc9a920a59d335b09fc56e` из 24 файлов. Root до claim отдельно сверил все 24 файла. Самостоятельное R1 проверило каждый hunk, production handlers, DS54 question projection, 197 build inputs, 12 outputs, 14 source fingerprints и176 package files; синтаксис3/3 PASS. 15/15 model PASS прочитан из авторского лога; повторный запуск ему не присвоен.

Сохранены все прежние пять semantic scenarios и длинные данные; шестой question-can-answer меняет только identity и canAnswer. Heading и дополнительный status paragraph различены, preview имеет независимое точное ожидание58 code points из69, fullS1 сохраняет текст и буквальные угловые скобки. Проверяются один CTA, S1/Q1, focus и отсутствие отправки. Genuine-complete не потерян. Plan v3 сохраняет настоящую цепочку v2/v1. Ролевые возражения и пределы выводов находятся в оригинале.

На наблюдении root и reviewer main `5d674ee06551b175fb5e9553c9866c11fb8fe4c0` имеет тот же whole tree, что frozen base. После review root интегрировал этот main: staged source tree остался `6d4a4e4…`, без runtime diff. Авторский patch сохраняет ранний текст Bridge до root claim/review metadata. Нативный прогон должен отдельно зафиксировать фактический CI checkout.

## Сохранённые исходники проверки

Абсолютные scratch paths в оригиналах являются provenance labels. Точные доступные копии указаны ниже; крупные raw сохранены lossless gzip с mtime0. [Manifest хранения](preservation.json) связывает длины и SHA256 до и после сжатия.

| Исходный файл | Копия рядом | Encoding |
| --- | --- | --- |
| task-compact-state-source-r1.md | [original.md](original.md) | identity |
| task-compact-state-source-r1-independent-integrity.json | [task-compact-state-source-r1-independent-integrity.json.gz](task-compact-state-source-r1-independent-integrity.json.gz) | gzip |
| task-compact-state-source-r1-independent-data.json | [task-compact-state-source-r1-independent-data.json](task-compact-state-source-r1-independent-data.json) | identity |
| task-compact-state-source-r1-runner-delta.patch | [task-compact-state-source-r1-runner-delta.patch](task-compact-state-source-r1-runner-delta.patch) | identity |
| task-compact-state-source-r1-checks.json | [task-compact-state-source-r1-checks.json](task-compact-state-source-r1-checks.json) | identity |
| task-compact-state-author-checkpoint.json | [task-compact-state-author-checkpoint.json](task-compact-state-author-checkpoint.json) | identity |
| task-compact-state-author.patch | [task-compact-state-author.patch.gz](task-compact-state-author.patch.gz) | gzip |
| task-compact-state-source-r1-manifest.json | [task-compact-state-source-r1-manifest.json](task-compact-state-source-r1-manifest.json) | identity |

F1 требует текущих длинных кадров; F2 full Work wording, F3 объяснение readonly и D1 отдельная keyboard диагностика остаются открытыми. Native, backend и человеческая приёмка из source/build не следуют. Runtime, vendor/package/lock и product permissions этим PR не меняются.
