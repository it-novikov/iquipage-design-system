# Источник решения о следующем срезе

[Original](original.md) — неизменённое независимое source reconciliation от `/root/task_overview_native_r2`, GPT-6 Astra, 2026-10-12. Размер 30 240 B, SHA256 `3d35da5b8b2e8b4b6070e8ebf84facdc665621b20d13fbc7d15bb81d9c5cfd4b`. Он подтверждает source-различия, не выполняет native приёмку Compact.

Исходная scratch-коллекция имеет index SHA256 `0e58dc10016d61c92012b584f00f818c457c5e1af13ec4c340058472ff658b91`; сама коллекция здесь не копируется и не объявляется сохранённой в Git. Локальные имена в оригинале указывают происхождение исследования. Для воспроизведения source-контекста доступны immutable Git refs:

- [PR88 1fd928e](https://github.com/it-novikov/iquipage-design-system/tree/1fd928e12b43b26f29ebcb190a5595c1d2618444), tree `c039d65a75d1e4312b5931cc76a4d28fb7ef8e08` — corrected historical runner, пять semantic cases и два long captures.
- [main после PR89 41ebe48](https://github.com/it-novikov/iquipage-design-system/tree/41ebe4823471072ed6dbb405fbd5e755852eec3f), tree `e3aa1d9369b6e6e17a388fb394e7699471ff9ced`.
- [Compact PR90 5bd09d6](https://github.com/it-novikov/iquipage-design-system/tree/5bd09d647f79f06c7a7c844f91a6914907ed8e8b), tree `6d4a4e4a66b7a46e6bda4f8378a0975def2aea7c` — родитель этой test-only ветки; product runtime сохраняется.

[Новая карточка](../../task.md) и plan v3 уточняют шесть semantic cases: все исходные пять сохранены, `question-can-answer` добавлен отдельным контрастом с `question-no-answer` по поручению root. Эта добавка не переименовывает прежние пять в шесть и не меняет исторические планы. Новые снимки, source R1 и native R2 ещё требуются.
