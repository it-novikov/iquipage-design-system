# Private56 — независимое native R2

**CHANGES_REQUESTED; adoption NOT_APPROVED.** [Полный оригинал](original.md) сохранён побайтно: 51 102 bytes, SHA256 `ecb66d5d4218fca7193ff7ccb7d7dd3bdc540d640e6568b3f6e793d3e46ed56f`. Reviewer: `/root/ds_candidate_native_r2`, GPT-6 Astra; автор CSS/harness в этом ревью не участвовал как независимый проверяющий.

Проверено actual native checkout `c267edee80d49660e22fa03bc4442c19e3b4d2d1`, tree `f44996dd0b3f1bae8358e0b1ece17f8c038bb1d6`, PR91 head `945169fff6fd7e38b081a76a0e20d71b3956a365` плюс принятый main41ebe. Native run38253208875/job114824500556. Candidate56 archive `a3307cf012d307ea476056e36bdee601f8eef9efad37c78dd96aaef6ccb00d5f`; control54 `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457`.

| Finding | Итог | Следующее действие |
| --- | --- | --- |
| NR2-01 P2 | Open: raw anchor и PNG расходятся; в интервале fullPage capture появился resize event | Same56 viewport diagnostic с состояниями до/после PNG и после RAF; runtime не менять до чистого наблюдения |
| NR2-02 P2 | Open: подпись196px занимает две строки при полной ширине270px и text advance213px | Новая layout trial57; label получает всю собственную строку |
| NR2-03 P2 | Open: first-text baseline owner/author ниже label на18.3125px при root32 | Исправить фактическую опору вложенной композиции, проверить PNG |
| NR2-04 P3 | Open: metadata автора всегда во второй grid-row | Сохранить естественный inline flow при достаточной ширине |

Свежие478/478 DS Node, package/source/reference и scoped geometry/keyboard PASS56 сохранены. Они не закрывают эти findings и не являются наблюдением человека или проверкой actual Task. `decision-r2.md` фиксирует коррекцию до кода. Ссылки внутри оригинала на sibling evidence относятся к исходной коллекции `research/continuation/property-list-private56-native-r2`; перенос оригинала не изменяет её содержание или hashes. Root сохраняет весь исходный native packet отдельно от нового diagnostic.
