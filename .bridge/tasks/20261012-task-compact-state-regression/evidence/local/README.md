# Локальная проверка test-only Task Compact

**Source/build готовы независимому source R1; native, визуальная и человеческая приёмка ещё NOT_RUN.** Проверен рабочий test-only patch поверх exact PR90 `5bd09d647f79f06c7a7c844f91a6914907ed8e8b`, tree `6d4a4e4a66b7a46e6bda4f8378a0975def2aea7c`. Это не committed descendant: root создаёт публикационный commit после source review.

| Проверка | Результат | Evidence |
| --- | --- | --- |
| Текущая модель Work | 15/15 PASS, включая пятнадцатый Compact case из PR90 | [log](work-model.log), [command metadata](work-model.json) |
| Product boundary и style contract | PASS | [log](boundaries.log), [metadata](boundaries.json) |
| Syntax runner/data/consumer | 3/3 PASS | [scope integrity](scope-integrity.json) |
| Полный actual fixture build | BUILT_NOT_RENDERED; 197 inputs = 61 product + 136 dependencies; 12 outputs; 14 source fingerprints | [results](build-only-results.json), [log](build-only.log), [command metadata](build-only-command.json) |
| Exact DS54 | Все176 установленных файлов равны tar; package/lock неизменны | package и source поля build results |
| Исторические данные | Все пять прежних semantic scenarios и общий long-review объект deep-equal PR88; длинные строки не изменены | [data preservation](data-preservation.json) |
| Новый contrast | can-answer отличается от no-answer только id сценария и canAnswer | data preservation |
| Runtime и workflow | UI/web/client/contracts/server/vendor/manifest/lock/model tests/DS неизменны; прежние3225B workflow Tabs/Estimate сохранены, добавлен exact двухшаговый suffix PR88 | scope integrity |
| Переданные оригиналы | v1/v2/consumer/index равны exact Git blob PR88 | scope integrity |

Plan v3 `acd56ea3aef4666275b5691482e6c82880e01a8cbd10f4d70d2bf8d53b093503` зафиксирован до runner и остался неизменным. Каждый из14 source hashes сверён с конечными файлами после build. Дополнительный источник относительно13 у PR88 — сохранённый v2; число inputs не хардкодится как completeness oracle.

Shared dependency directory использовался только для чтения через временный symlink; install не выполнялся, symlink удалён после build. Node локально24.19.0; GitHub target24.20.0. Native Chromium, полный TypeScript/JDK25/PG18 gate здесь не запускались из-за ранее установленного ограничения среды; это не PASS и не новый повтор неработающей команды.

Self-review охватил полный runner delta к corrected PR88, workflow suffix, новый plan, literal/permission/focus ожидания и scope integrity. Автор не присваивает ему независимость. Source R1 должен проверить всю working patch/manifest, native R2 — новый CI checkout, реальные PNG и raw measurements, прежде чем оценивать текущую композицию.

F1 long composition остаётся вопросом текущего кадра; F2 full Work wording и F3 readonly explanation открыты; D1 generic Open work BODY focus не выдан за доказанный keyboard failure. Меньшая высота или число зелёных cases не принимают Compact автоматически.
