# Независимое source review VT1

Оригинальный [отчёт](independent-review.md) другого агента GPT-6 Astra сохранён без изменения байтов. Вердикт — **approve только для frozen experimental source overlay и сравнительного render**. Это не приёмка production UI, визуального качества, native взаимодействий или сохранения.

Input patch: `41f3852ff8d3abfc4777e3aea6ef4e229f1e15d4f46280b681b28196b2a922f5`. Baseline: `8f8d218168074bd4c7c9e1e29dfbe783a27998dd`. Проверяемый patch находится в [эксперименте](../../../../../experiments/task-first-screen/vt1.patch); post-apply fingerprints — в [source manifest](source-manifest.json).

## Фактические результаты и оговорки

- Три `node --check` прошли; проверены восемь состояний модели и девять preview inputs. [Checks](checks.json), [наблюдения](source-observations.json).
- **SR-1:** неизменённый suite с точным перенаправлением только импорта модели дал **12 pass / 1 fail**. Единственное расхождение — старое ожидание «Нужно ваше решение» при `canAnswer=false`; overlay намеренно показывает «Вопрос ждёт ответа». [Исходный TAP](existing-work-model-tests.tap) сохранён. Green этому suite не присваивается. При принятии production поведения соответствующий тест должен измениться вместе с ним.
- **SR-2:** последовательность «Apply плана → медленный ответ → закрытие внешнего details → ошибка и фокус» остаётся конкретной source-backed гипотезой. Текущий синтетический адаптер предоставляет readonly Plan, поэтому runtime сценарий требует реального адаптера и остаётся `NOT_RUN`.

В оригинале ссылки `sandbox:` и номера строк отражают исходную среду ревьюера. Все четыре первичных evidence-файла перенесены рядом с отчётом. Три временных patched исходника воспроизводятся применением exact patch к baseline; исходники Plan, catalog, Board и DS читаются на указанном frozen revision. Полный список сохранённых файлов с byte length и SHA-256 находится в [preservation.json](preservation.json).

Оригиналы не переписываются после browser capture. Дальнейшие результаты и закрытие вопросов оформляются отдельно.
