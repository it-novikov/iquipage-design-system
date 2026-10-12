# PF04 — corrected addendum к source R1: private56

Дата: 2026-10-12. Reviewer: `/root/ds_candidate_source_r1`, GPT-6 Astra. Это отдельная повторная проверка исправлений тем же независимым ревьюером R1. Она не является новым независимым участником, вторым native review или пользовательским исследованием.

## Вердикт

**APPROVED_FOR_NATIVE. Оба P2 исходного R1 закрыты на проверенной corrected дельте.** Текущий private56 пакет и ограниченный CI сценарий пригодны для публикации первого парного native опыта. Новых блокирующих замечаний в рассмотренной дельте не найдено.

Принимается готовность провести опыт на точной поставке. A, его числовые бюджеты, финальный default, эстетическое преимущество, native keyboard/geometry, actual Task и product adoption остаются открытыми. Полные478 тестов версии55 на56 не перенесены. Sprintique всё ещё потребляет54. [E1–E5]

## 1. Точная связь с исходным R1 и main

| Свидетельство | Проверенное значение |
| --- | --- |
| Original R1 | 30 160 bytes; SHA256 `0a07165199fc25e56665bdd937289ff45eb1d55549c913a6bd35c1c305805dc9`;0444, неизменён |
| Original patch | 1 056 217 bytes; SHA256 `15d8f25e42cff24d16cf575277b453f73aaad3eb9b7bef670f3201a3f4aa7e8d`;0444, неизменён |
| Original local source commit | `7f419045ee09aad58d1a9a36d08163df08e658af` |
| Original whole tree / parent | `0ae776e2798cef3a9e201e68ec22f808e647c9d3` / `220af664ef561d3f5ff1b873122281ef352e8f25` |
| Included accepted main | `4275dde301b5068b3d6b1801ecb54c70a2d7e708` |
| Main whole tree / parent | `c7ad669f19eb5027d63994c9e4d1642b3b9f0bd6` / `220af664ef561d3f5ff1b873122281ef352e8f25` |
| Corrected patch | 1 040 819 bytes; SHA256 `2e2736716b04d1f99adb790687f72f7a294243d2afaa15f0cd80340e6e735c5c`;0444 |
| Retained private55 tar | `71318ed08cd22878c3d6ab5649c229d6da103f2bef77d9bc4bb1f7b70cad5ade` |
| New private56 tar | `a3307cf012d307ea476056e36bdee601f8eef9efad37c78dd96aaef6ccb00d5f` |

Независимо пересчитаны Git blob identities34 секций original patch относительно local commit7f419: все совпали. Таким образом позднее сообщённый commit действительно содержит ранее прочитанную замороженную основу R1. Все37 секций corrected patch совпали с actual worktree, прочитанным для addendum. Git не содержит unresolved entries. [E1, E2]

Corrected patch включает root-prepared merge принятого main и узкие исправления после R1. Продуктовая дельта относительно exact main4275 пуста. Весь existing workflow prefix, включая Browser/Tabs и оба Estimate steps, byte-identical main после удаления единственного добавленного path trigger `experiments/property-list-reflow/**`; отдельно добавлен guarded trial job. Это проверка сохранности интеграции, а не повторная приёмка реализации Estimate. [E2, S1]

В момент local builds HEAD ещё7f419/tree0ae776, а merge/version/docs находились в working tree. Оба JSON честно записывают этот HEAD,15 changed source paths и3 untracked source paths своего source scope. Addendum не приписывает их будущему publication commit. Новый native runner потребует уже committed source и фактическую совпадающую CI revision. [E3, S2]

## 2. Закрытие замечаний

### PF04-CAR1-01 / F1 — RESOLVED

**Что изменено:** README начинает раздел текущим `private reflow trial (0.6.0-vnext.56)`, описывает natural heights и wrapping, явно оставляет adopted product54 и ссылается на один подробный `control-contracts.md`. Прежние36px/120px/8px/26px/ellipsis названы историческим описанием vnext.27–54 и прямо исключены из текущего sizing contract. Static parts больше не описываются в настоящем времени как обязательный ellipsis. [S3]

**Что проверено:** не только source, но фактические README/control-contracts bytes внутри56 tar совпадают с исправленными файлами; оба входят в215 source-proof inputs. Версия56 согласована в package, lock root/package entry, provenance, semantic tokens, public core entry и declaration. Подробный contract сохранил исходные ограничения A и поменял только номер версии заголовка. Это устранение противоречия инструкции, а не новая geometry acceptance. [E3, E4, S3]

**Почему достаточное исправление:** агент получает current recipe и ясную историческую границу вместо двух конкурирующих требований. Нового API, дополнительных numeric knobs и локального product override не введено. Original55 архив и его доказательства сохранены, новая поставка имеет отдельное имя/версию56. [E2–E4]

### PF04-CAR1-02 / F2 — RESOLVED

**Что изменено:** job `property-list-trial` ограничен следующим условием:

```yaml
if: ${{ (github.event_name == 'pull_request' && github.head_ref == 'fix/property-list-readable-layout') || (github.event_name == 'workflow_dispatch' && github.ref_name == 'fix/property-list-readable-layout') }}
```

При source review логика условия даёт следующие результаты; это не отдельный запуск GitHub Actions:

| Контекст события | Применимость trial job |
| --- | --- |
| PR с head `fix/property-list-readable-layout` | Да |
| PR с другим head | Нет |
| Явный workflow dispatch на trial branch | Да |
| Workflow dispatch на main/другую branch | Нет |
| Другой тип события | Нет |

Experiment README и plan revision2 фиксируют эту границу. Source/archive assertions в `compare.mjs` не ослаблены: они остаются строгими для своего frozen опыта. Следующая unrelated DS правка или adoption на другой ветке не обязана совпадать с source-proof56 и product54 этого эксперимента. Если работу намеренно продолжат на самой trial branch, ограничения опыта сохранятся — это ожидаемая явная применимость. [S1, S2]

**Сохранность сценария:** обе public builds и оба capture остаются в job. Candidate capture по-прежнему зависит от успешного build и `!cancelled()`, а не от успеха control capture. Парный verifier требует успеха обеих ветвей; upload сохраняется после их провала. Path trigger для experiment retained. Existing Browser/Tabs/Estimate prefix сохранён точно, root разрешение workflow conflict не удалило параллельные проверки. [S1]

## 3. Что именно осталось одинаковым между55 и56

Source `foundation.css`, consumer/data/host/index fixture, compare/measure/interactions/verifier и оба исторических baseline plans совпадают с original7f419 byte-for-byte. В новом comparison plan неизменны все5 profiles, interaction profiles, fixture revision, comparisons, acceptance, environment и not_run. Изменены только идентификация trial, revision, base, candidate archive/version/path, описание scope с56 и metadata предыдущего плана/applicability. Не ослаблены критерии ради PASS. [E2, S2]

Saved `comparison-plan.v1.json` равен original comparison plan, SHA256 `d99bd7d47df7a4df998db45036cc245f0651d67d03bd948f8cd5f1faaa4d588f`. Saved `packages/source-proof.v55.json` равен original source proof, SHA256 `28f04a5a2cdcf93fa7fbd07f9e1d3df9c8dcbe399bc826b87842da23c7ee05bb`. Все4 файла прежнего local evidence совпадают с original commit. Новый plan2 — `8d37900ee942cfbf03dd6fbccc46f9aa8fa390f3b8a00d12412aac1ffca5722f`. [E2–E4]

### Точная граница утверждения о runtime identity

- `dist/iquipage.css` внутри tar55 и tar56 byte-identical; не только source CSS.
- Все49 файлов `dist/modules/*` внутри обоих архивов byte-identical.
- `dist/core.js` **не** byte-identical: его единственная byte delta — экспорт literal версии55→56. Это независимо проверено сравнением после ровно этой замены. Не следует писать, что все исполняемые файлы пакета идентичны.
- Другие отличающиеся файлы — package/version/provenance/build manifests, README, control-contracts, semantic metadata и version declaration. Поведение component modules данным изменением не переписано. Это source/package вывод, а не повторный native behavioral PASS. [E4]

Пакет56 имеет178 regular files вместо176. Добавлены только `docs/INTEGRATION.md` и `docs/anchored-editors.md`; удалённых файлов нет. Оба новых packaged docs совпадают с exact main4275, входят в source proof и не представляются новым runtime API. Проверена их поставка и связь с принятым source; этот addendum не объявляет весь исторический integration manual заново актуализированным под56. [E2, E4]

## 4. Проверки новой поставки и их пределы

Независимо проверены215 source-proof hashes и связь proof с tar56, все178 actual tar files с текущими package/source/dist files. Несовпадений нет. Boolean `protected_files_unchanged` в авторском summary не использовался как самостоятельное доказательство: отдельно проверены patch blobs, затронутые source/fixture/oracles, прошлые raw files и фактические tar modules/CSS. [E2–E4]

| Fresh build | Control54 | Candidate56 |
| --- | --- | --- |
| Raw result | `BUILT_NOT_RENDERED` | `BUILT_NOT_RENDERED` |
| Package files |176|178|
| Compiled inputs |36|36|
| Compiled outputs |4|4|
| Input graph SHA256 | `3b859dd0bb7a3451205f061f93531c5911c7bd2a710f6301e965c5af0cc528df` | `4dd76815e8ce9d1ddbbd81dd733b7382fee214d56726f0c7b943a1dc3cece070` |
| Bundle set SHA256 | `5c0f4f387d63a75d59372e28d020ae89ec4036c485c50216ead0232542d88bde` | `ff062ae107da6e307ce9efc35e8d0f8298b8dec86502097e9b32751c87075c09` |

Оба fresh raw JSON совпадают с actual results в `output/r1-v56-build/{control,candidate}`. В этих точных output directories заново проверены4 output hashes каждого варианта; также проверены все reported source hashes, compiled inputs и archive file hashes. Ошибок соответствия нет. Предыдущие `output/build-only` относятся к55 и не подменяют новые outputs. [E3]

Прочитан новый author log `scoped-version-size.log`:10 tests /10 pass /0 fail /0 skipped. В него входят actual version и существующие size gates; он не является complete478 suite. Прежний478/478 лог остаётся доказательством55. Ревьюер не запускал новые full tests, browser, backend, persistence или performance profiler. [E3, E5]

## 5. Сохранённый спор и следующий шаг

| Перспектива из R1 | После исправления | Что всё ещё должно решить native review |
| --- | --- | --- |
| Человек читает факты | UI варианта не менялся во время исправления документации. | Полнота и группировка текста, плотность, лишние строки no-grow labels, pill/dot и полезность первого взгляда. |
| DS consumer / агент | Current README и detailed recipe согласованы; frozen gate больше не мешает обычным следующим веткам. | Подходит ли один existing recipe actual Task без прикладных стилевых обходов. |
| Скептик проверки | Новая поставка и старые доказательства различимы; criteria и oracles не подгонялись. | Painted text, реальные keyboard/anchor состояния и отличия нового deficit от baseline deficit. |

Root может публиковать проверенный private56 trial и запускать paired capture. После получения raw evidence требуется отдельное независимое visual/native review; addendum не заменяет его. Pending вопросы исходного R1 — tag remove/focus scope, actual Task/product-owned pill, B как возможная более читаемая альтернатива и предрелизные платформы — этим исправлением не закрыты. Новых требований к повторному полному исследованию продукта или дополнительного approval-процесса не вводится.

## Источники

- **E1:** [исходный R1](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-candidate-a-source-review.md), [original patch](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-candidate-a.patch); неизменность подтверждена выше.
- **E2:** [corrected patch](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-candidate-a-r1-correction-v56.patch) и [checkpoint](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-candidate-a-r1-correction-v56.checkpoint.json); Git7f419/main4275 objects проверены локально.
- **E3:** [correction handoff](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/.bridge/tasks/20261012-property-list-readable-layout/evidence/r1-correction-v56/README.md), SHA256 `cd2116242393e6ed8c96f478cdf2f5c1aadc2b2aa075cc65c8aabad583eeb87a`; соседние candidate-build-v56.json SHA `5923abcd984f92417e6b294b09d91d45dc678eb9e3ebfa690ecbf3d36da8bd80`, control-build-v56.json SHA `4aac4321cb32c70d0cab972d49b2a9d538cfb6e8d082dd19c7d80cf8bfcd3c12` и summary-v56.json SHA `43cda1e60f039705a77bf09761c290a2773ec857e9416e29e29866101fdcd533`.
- **E4:** [package-docs-proof.json](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/.bridge/tasks/20261012-property-list-readable-layout/evidence/r1-correction-v56/package-docs-proof.json), SHA256 `74335e672af05344b471464140c197bac37c4632bd46e974c31a9a643cb56cd0`; [source-proof.json](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/experiments/property-list-reflow/packages/source-proof.json), SHA256 `5b8fbdb276f1c24e4bbd5a313fecc529965b109a1a9f29be6a0251ffaa752612`; оба tar лежат рядом с proof.
- **E5:** [scoped-version-size.log](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/.bridge/tasks/20261012-property-list-readable-layout/evidence/r1-correction-v56/scoped-version-size.log), SHA256 `d3223e6be223cee71ddc61b7550fbcb927dfcb280c1ca2f6f2b63605a071cbfc`.
- **S1:** [tabs-geometry.yml](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/.github/workflows/tabs-geometry.yml), SHA256 `149307299f70f3f8cbc61ff4cd479abae57b8747d089fd1708ba2059b55c037d`.
- **S2:** [comparison-plan.json](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/experiments/property-list-reflow/comparison-plan.json), SHA256 `8d37900ee942cfbf03dd6fbccc46f9aa8fa390f3b8a00d12412aac1ffca5722f`; same experiment README, fixture, compare/measure/interactions/verifier.
- **S3:** [library README](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/libraries/iquipage/README.md), SHA256 `864a732ae21f84d5837b3fb3c00eb175906d179c04ff4791e745593913a85280`; [control-contracts.md](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/libraries/iquipage/docs/control-contracts.md), SHA256 `ddcb924700b85626474e3671ee2bae9ab2f04a73e4e8982d2bff0464bbe7a769`.

Этот addendum записан отдельно и заморожен0444. Исходный R1, исходные доказательства, репозиторий, Git refs/commits и PR этим ревьюером не изменялись.
