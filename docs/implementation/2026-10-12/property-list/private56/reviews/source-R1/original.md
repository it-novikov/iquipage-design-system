# PF04 — независимое source review R1 кандидата A

Дата: 2026-10-12. Reviewer: `/root/ds_candidate_source_r1`, GPT-6 Astra, отдельный агент, не автор DS и стенда. Режим: read-only для репозитория. Проверяется замороженная дельта к `220af664ef561d3f5ff1b873122281ef352e8f25`; интеграция более нового main находится вне основы этого заключения.

## Вердикт

**CHANGES_REQUESTED: два P2 в документации поставки и применимости временного CI опыта.** Подтверждённых P0/P1 в CSS, публичных типах или неизменённом runtime этого кандидата не найдено. Сам CSS вариант пригоден как первый ограниченный native опыт. Root принял оба замечания и решил исправить их до первой публикации/native capture, сохранив исходные patch, архив и этот отчёт. После исправлений нужен отдельный короткий addendum по новой замороженной дельте; прежние доказательства не получают новый SHA задним числом.

Это не выбор A как окончательного default. Его 7U/14U, no-grow подпись, ритм и эстетическое преимущество остаются гипотезами. Реальный браузер кандидата в этом review не запускался; будущие `GEOMETRY_PASS_REVIEW_PENDING` и `KEYBOARD_PASS_ANCHOR_REVIEW_PENDING` также не будут человеческой или продуктовой приёмкой. Sprintique продолжает потреблять54. [E1–E4, S1–S5]

## 1. Независимая основа и проверенная целостность

Прочитаны root/library AGENTS, START-HERE, `iquipage-review` и его constitution, execution-contract, quality-method, problem-first, design-review; карточка и ADR PF04; первоначальное предложение, независимое возражение, ответ автора и отдельный native baseline review. Это targeted review. Представленные ниже пользовательская, потребительская и проверочная роли — аналитические перспективы одного независимого ревьюера, не три участника исследования и не тест с людьми.

| Артефакт | Точная основа |
| --- | --- |
| Base | `220af664ef561d3f5ff1b873122281ef352e8f25` |
| Замороженный patch | 1 056 217 bytes; SHA256 `15d8f25e42cff24d16cf575277b453f73aaad3eb9b7bef670f3201a3f4aa7e8d` |
| Private55 archive | `71318ed08cd22878c3d6ab5649c229d6da103f2bef77d9bc4bb1f7b70cad5ade` |
| Control54 archive | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Comparison plan, revision1 | `d99bd7d47df7a4df998db45036cc245f0651d67d03bd948f8cd5f1faaa4d588f` |
| Historical baseline plan2 | `724f1e889dc621e178ee173cb4ef8fa1fbfd190b0249decc208e75cc89de5582` |
| Source proof | `28f04a5a2cdcf93fa7fbd07f9e1d3df9c8dcbe399bc826b87842da23c7ee05bb` |
| Local control build JSON | `61fadbd59c722f657a793cc79b96b732b5de59f37f894717eb2c5d118206cb3e` |
| Local candidate build JSON | `3c6ce17ed3924814589fa5156c96fea0344828280680afd4d25c9e76f332735f` |
| Final author Node log | `a8dda5504af9220f7fef897aba612b10e89958fe340d28a80caff1694ce6d7fd` |

Независимо пересчитаны Git blob identities всех34 секций patch относительно файлов, прочитанных в worktree: несовпадений нет. Проверены213 source-proof hashes; все176 файлов private55 tar совпадают с текущими исходниками/выходами библиотеки, в том числе поставляемые README и control-contracts. Состав54/55 одинаков: новых/удалённых файлов нет, изменены9 ожидаемых файлов — CSS, version/manifest/build metadata, тип literal version, packaged control-contracts и provenance. Исполняемые control modules не изменились. `git diff base -- products/sprintique` пуст. [E1–E3]

Для обоих local builds повторно проверены все declared source hashes,36 фактических compiled inputs и176 package-file hashes, а также4 compiled outputs каждого варианта: несовпадений нет. Input graph control — `3b859dd0bb7a3451205f061f93531c5911c7bd2a710f6301e965c5af0cc528df`; candidate — `686bdefb07e487601a5ea29076788ad293eb24e4add9ebac0a399ef3f6affc6f`. Четыре fixture inputs и32 packed public module/CSS inputs входят в каждый граф. Это сборки Node24.19, `BUILT_NOT_RENDERED`; им не приписывается будущая CI среда Node24.20. [E3, S4]

Авторский финальный стандартный Node log действительно заканчивается478 tests /478 pass /0 fail /0 skipped. Это прочитанное и связанное доказательство автора, а не повторный запуск ревьюером. Итоговый size gate в summary сообщает CSS gzip101572 ≤101612; baselines не изменены. История первой бюджетной ошибки и timing failure оставлена в summary. Полные тесты, браузер, backend и performance profiling здесь повторно не запускались. [E3]

## 2. Что меняется и насколько это соответствует причине

Предшествующий native reviewer подтвердил потерю широких подписей на120px треке при увеличенном тексте, тесный static line-height и разрыв avatar/name в существующем public recipe. В этом R1 его отчёт используется как ранее полученное свидетельство; новый просмотр PNG или новое наблюдение пользователя не заявляются. Кандидат адресует эти причины, а не добавляет поверх них ручные размеры в Sprintique. [E4, S1]

| Поверхность | Что сделано в source | Практический смысл и оставшаяся граница |
| --- | --- | --- |
| Подпись свойства | Natural line-height, полный перенос, text-relative budget; flex no-grow вместо fixed grid track/ellipsis. | Подпись может быть прочитана до открытия редактора. При stacking она всё ещё может занимать только свой бюджет, а не всю строку. |
| Select / combobox | Layout item — настоящий `.iq-select-wrap`; margin/min/max/box sizing нормализованы. Сам trigger получает естественную высоту. | У разных контролов сравнивается реальный внешний carrier; hidden form input и popup не объявлены value item. |
| Date | Прямой date trigger использует тот же внешний контракт и перенос caption. | Сохраняются текущая дата, deadline semantics и редактор. Связь открытого popup при изменении только родителя требует native evidence. |
| Status pill | Content-width, минимум26 и растущая высота;7px dot получает `align-self:center`. | Длинный статус может расти вместе с текстом. Удачная форма многострочной pill пока не доказана. |
| Ghost tags | Высота поля и input следует line-height; скрытый по ширине unfocused buffer больше не резервирует собственную высоту. | Сохранён настоящий однострочный input. Его возврат при Tab/focus проверяется отдельно; отсутствие readonly empty caption не считается исправленным. |
| Static text | Перенос plain text, `.iq-property-text`, meta и key; интерфейсный line-height; avatar/name/meta связываются scoped grid. | Значение не требует редактирования для чтения. Сетка предполагает знакомую public композицию с одним avatar/name; это не общий rich-content layout. |
| Другие modes / продукт | Правки scoped к `data-label=wide`; продуктовые JS/CSS/vendor не меняются. | Это private library trial. Product-owned Task pill и actual Task composition требуют отдельной adoption проверки. |

Важная экономия сложности: новых props/events, selector mode, зависимостей, observer, JS text measurement, remount или consumer L/V настроек нет. Изменение declaration относится только к literal версии55. Новый API для этого первого опыта не нужен. Существующий `--iq-properties-label` уже является публичной подсказкой; обновлённый control-contracts честно объясняет, что теперь это бюджет, а не гарантия точной rendered ширины. Именно эта изменённая семантика требует согласованной документации всей поставки. [S1–S3]

Набор коэффициентов не выведен из доказательства удобства:7U/14U — пробные значения. При обычном размере общая минимальная строка36px и небольшие insets могут сохранить плотность, но только кадр подтвердит результат. При615/root32 увеличенный label budget отнимает место у имени; при270/root32 «Поиск участника» может переноситься, хотя помещается в полной ширине строки. Эти издержки явно перечислены в ADR, public trial notes и плане. A не объявлен победителем по равенству boxes. [E2, S1–S5]

## 3. Спор аналитических ролей

### Пользователь, который хочет быстро прочитать факты

**Позиция:** мне важны целая подпись, связь с текущим значением и знакомый способ изменения. Удаление ellipsis полезно, когда я больше не должен открывать редактор ради имени или статуса. Метаданные должны быть вторичными, но не выглядеть случайным продолжением соседней строки.

**Возражение инженеру:** отсутствие horizontal overflow не означает удобное чтение. No-grow label после переноса может оставлять пустую правую часть, а увеличенная высота списка заставит искать соседние факты прокруткой. Если A так проигрывает, B с полной шириной подписи — полноценное решение, даже при дополнительном size contract. Нельзя возвращать обрезание, уменьшать шрифт или скрывать строки, чтобы получить красивое число высоты.

**Решение в этом review:** оставить форму A для native сравнения, но не утверждать плотность, понятность с первого взгляда или эстетическое превосходство. В первую очередь смотреть те же wide-normal, narrow-normal, wide-text200 и narrow-text200; проверять расположение labels и value groups, а не выдумывать «идеальную» высоту. [E4, S5]

### Разработчик и AI-потребитель дизайн-системы

**Позиция:** один familiar recipe и отсутствие нового обязательного режима уменьшают число решений у агента. Коррекция реальных carriers внутри DS лучше копирования внутренних styles в каждый продукт. Exact archive/version/type/provenance дают воспроизводимую поставку.

**Возражение дизайнеру:** агент читает не только control-contracts. Если главный README обещает120px,26px и ellipsis, он получит противоречивое задание и может вернуть старые локальные костыли, пытаясь «починить» новый пакет. Семантика должна совпадать в первой точке входа и деталях. Кроме того, замороженный эксперимент не должен становиться вечным обязательным gate всех следующих фичей.

**Решение:** два P2 ниже исправляются до публикации. Не увеличивать число настроек и не ослаблять archive/source fingerprints. Ограничить применимость временной проверки; при последующей adoption отдельно проверить реальные consumers. [F1, F2]

### Скептик браузерной проверки

**Позиция:** парное построение из двух tar, новый одинаковый avatar payload, именованный outer carrier и actual input graph устраняют два прошлых пробела. Проверка active/input identity и число intents содержательнее DOM snapshot.

**Возражение обеим ролям:** compiled build и совпадение rect не доказывают painted glyphs, удобство или полезность. `visiblyAdjacent` в измерителе — эвристика по gap/overlap; она не доказывает, что пользователь правильно связывает popup с контролом. Новый или старый anchor deficit должен быть прочитан из raw и кадра, а не скрыт статусом, содержащим слово PASS.

**Решение:** range и keyboard результаты остаются отдельно от visual/anchor review. Native first capture допустим после узких source исправлений. Измерение не меняет DS layout, не вызывает fake window resize и не ремонтирует popup в стенде. [S4, S5]

## 4. Замечания, принятые root

### F1 — PF04-CAR1-01 [P2, confirmed]: два противоречащих контракта в одном private55 archive

**Поверхность:** `libraries/iquipage/README.md`, строки68–71, также `package/README.md` внутри frozen tar55. Раздел `Property list (0.6.0-vnext.27)` продолжает в настоящем времени описывать exact36px rows,120px column, ghost fill bleed8px,26px pill и `.iq-property-text` как one-line ellipsis. Новые `docs/control-contracts.md`, строки49–65, обещают natural heights/full wrapping, zero outer margins и text-relative hint. Заголовок со старой версией не обозначает текст как устаревший: это текущая поставляемая справка о компонентах. [S2, S3]

**Вред:** потребитель, особенно агент, получает несовместимые инструкции о поддерживаемой геометрии и может восстановить сломанный подход локальными overrides. Наличие correct notes в другом файле не делает первую точку входа безопасной.

**Исправление:** дать в README короткое актуальное описание private55 trial и ссылку на единственный подробный recipe; старую геометрию оставить только с явной исторической границей, если она нужна. Не размножать формулу в двух независимых описаниях. Public runtime API расширять не требуется.

**Приёмка:** в новом named/frozen package README и control-contracts согласованы по current wide-list поведению, trial статусу и границе adopted54. Проверить реальные tar bytes, новый source proof и package identity. Исходный71318 draft и его доказательства сохранить; не заменять уже опубликованный или нативно потреблённый архив другими байтами под прежней идентичностью.

**Статус:** `[open — root accepted, correction planned before first publish/native]`. Это blocker согласованной передачи пакета, не доказанный browser defect CSS.

### F2 — PF04-CAR1-02 [P2, confirmed]: временный frozen trial назначен всем следующим product/library PR

**Поверхность:** `.github/workflows/tabs-geometry.yml`, новый `property-list-trial` job со строки54; `compare.mjs`, строки146–156. Workflow paths охватывают обычные product/library изменения, а job не имеет ограничения на trial branch или отдельный dispatch. При этом runner требует product dependency именно54 и byte equality213 frozen library build inputs. [S4, S6]

**Сценарий:** следующая плановая adoption55 меняет product dependency и закономерно проваливает assertion `Sprintique has not adopted the trial`; следующая DS правка меняет frozen source и проваливает source-proof. Это ожидаемое развитие уже названного плана, а не нарушенный consumer contract. Постоянный job превращает свидетельство конкретного опыта в препятствие дальнейшей работе.

**Исправление:** ограничить запуск именно веткой/явным dispatch этого опыта либо предусмотреть явное удаление/замену временного job при adoption. Проверки fingerprint, archive identity и declared scope внутри опыта сохранить строгими. Root интегрирует актуальный main/workflow отдельно; здесь это интеграционное действие не проверялось.

**Приёмка:** на trial PR по-прежнему запускаются обе сборки/оба capture/verifier/upload; контрольный провал не отменяет независимый capture кандидата; независящие ordinary product/DS изменения не обязаны совпадать с frozen55/source54. Existing Tabs и прочие необходимые gates остаются применимы. Точный критерий запуска записан рядом с native handoff.

**Статус:** `[open — root accepted, applicability correction planned before first publish/native]`. В первом capture текущей frozen ветки job выполним; замечание о корректной границе применения после него.

## 5. Стенд: пригодность и непокрытые выводы

**Что действительно подготовлено.** Оба variants используют тот же revised fixture: owner/avatar shape соответствует actual `optionAvatar()` и имеет прямой mounted oracle; carrier измеряется отдельно от inner value вместе с margins, flex basis и box sizing. Public core/styles exports ведут на распакованный tar. Fixture host CSS не содержит property/control overrides, а product runtime/CSS исключаются из compiled graph. Native runner требует committed source, записывает actual HEAD/tree и сравнивает его с reported CI revision. Plan и оба archives проверяются до исполнения. [S4, S5]

**Геометрия.** Candidate oracle отдельно проверяет property-list labels/display values по полным text ranges, clipping ancestors, host и документному overflow; декоративные initials и native input buffer не выдаются за полноценные подписи. Ordinary reference сравнивается относительно строки, поэтому новая document y позиция не считается регрессией. Полное совпадение ordinary select/date shape будет полезным узким regression evidence, но не приёмкой всех modes DS. [S4, S5]

**Взаимодействия.** В wide-normal и wide-text200 запланированы keyboard open/cancel owner/date, выбор и возврат owner с точными intent counts, неизменность trigger/input, native Home/End combobox и достижение tag search клавишей Tab. Host615→270 меняется при открытом popup без искусственного window resize; raw сохраняет и естественные scroll events, которые могут влиять на позиционирование. Это честный сравнительный diagnostic. [S4]

**Открытые вопросы, не новые блокирующие требования:**

- A/B эстетический выбор пока не выполнен. B не реализован в этом patch; это допустимо для первого A опыта, пока проигрыш A не объявлен закрытым без альтернативы.
- Геометрия/click target/focus paint кнопок удаления тегов во время расширения на focus отдельно не утверждается. Runner проходит Tab к input, но не проверяет remove/restore intent и не снимает dedicated focused-remove кадр. При adoption и заявлении сохранности affected tag interaction этот узкий путь нужно закрыть; сейчас он остаётся непроверенным, не выдуманным regression.
- Screenshot/range не проверяют весь контраст, все input states, локализации, темы и intrinsic auto-width compositions. Trial явно light/comfortable с fixed outer host. Scope можно расширить по фактическому вопросу, а не ради произвольной полной матрицы.
- Изменение размера только родителя может оставить popup рядом, оторвать его на обеих версиях или создать новую регрессию. Verifier сохраняет эти классы, но status с `ANCHOR_REVIEW_PENDING` не разрешает игнорировать новый deficit.
- Actual Task, product `.tdr-pill`, Estimate/Plan integration, readonly empty tag caption, backend/persistence/permissions и наблюдение людей не входят в этот опыт. Chromium root32 — не browser zoom200. Safari/Firefox/iOS/VoiceOver остаются в согласованной проверке перед релизом.

Нет основания заранее добавлять observer, universal wrapper, отдельную дизайн-систему продукта или настройки для каждого числа. Следующий полезный шаг — корректный immutable package/CI handoff, затем уже запланированный paired native capture и независимый visual review с правом отвергнуть A. [E2, S4–S6]

## Источники

Все пути S1–S6 ниже относятся к файлам, чьи байты сверены с frozen patch. Если worktree позднее изменён, основой R1 остаются patch/archive/хеши выше.

- **E1:** [property-list-candidate-a.patch](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-candidate-a.patch) и [checkpoint JSON](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-candidate-a.checkpoint.json).
- **E2:** [ADR](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/.bridge/tasks/20261012-property-list-readable-layout/decision.md), SHA256 `ba25b5ed682b5bf9264b2c40b392c36ea9f0833c63d522966fbbe56fe82598db`; карточка и evidence README в том же task.
- **E3:** [local summary](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/.bridge/tasks/20261012-property-list-readable-layout/evidence/local/summary.json), SHA256 `b046aa022c0fb71f1bc9ef36c5b641a20bc82b6dbbd6383b4abed5f9b4f6be73`; control-build.json, candidate-build.json, ds-node-final.log рядом; private package и source-proof в experiments/property-list-reflow/packages.
- **E4:** [native baseline review](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-baseline-native-review.md), SHA256 `5b3078f1f5c5aa4d073a1382ce4efe719a50ca499006dee3f22410a337516ca6`; [proposal](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-reflow-design-proposal.md), [opponent](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-proposal-opponent-r1.md), [designer response](sandbox:/workspace/scratch/b3dac59f68e2/research/continuation/property-list-proposal-designer-response-r1.md).
- **S1:** [foundation.css](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/libraries/iquipage/src/styles/foundation.css), scoped block2506–2560 and inherited rules2083–2091/2419–2445; SHA256 `f22173d4115d8c56d08d3e383564e1c4d1abbd85b65a56e431480e0041def62b`. Actual control markup/events: src/modules/components.js and date-field.js, unchanged from base.
- **S2:** [control-contracts.md](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/libraries/iquipage/docs/control-contracts.md), SHA256 `95d0bc22e858b4fef24bd4fc281f0ae18b6e3bd66e0040b769515408422d87ec`; types/core.d.ts literal version SHA256 `e6b1787d31cc9e983ebbb504cc5abdea7bcbb364db4f3bf9d8e2274985362e28`; package/lock/PROVENANCE/token changes in E1.
- **S3:** [library README](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/libraries/iquipage/README.md), SHA256 `1d95212fc364f621ab2c2dabf305e1bd7d830b412e6f87ac0d9215a204d8a30b`; exact unchanged bytes also exist in private55 tar.
- **S4:** [compare.mjs](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/experiments/property-list-reflow/compare.mjs), SHA256 `414e7db2b5737d4290723535ecde8b1044b4910457387fee4e6a61ec7c788117`; [interactions.mjs](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/experiments/property-list-reflow/interactions.mjs), SHA256 `c196a45556daa918c415b164fa34b7c433bbf073da6208e99f3a5c6cb9d55240`.
- **S5:** [measure.mjs](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/experiments/property-list-reflow/measure.mjs), SHA256 `9b887f9bac6c2bdb83a4f9b813c1bb7fdb8f95dc7156b487d32a1e62d80b5f6f`; [verify-comparison.mjs](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/experiments/property-list-reflow/verify-comparison.mjs), SHA256 `9e8b3f578692eca922bb46d81262bbc32c2f79213c011e4c9e0a9b6e5552c63a`; comparison-plan and fixture files in the same experiment.
- **S6:** [tabs-geometry.yml](sandbox:/workspace/scratch/b3dac59f68e2/repo-property-candidate/.github/workflows/tabs-geometry.yml), SHA256 `88f7b717e4587214d436d950eb3ee7acb8ece3c91589593777c3567bb0f3eef3`.

Репозиторий, refs, commits и PR этим ревьюером не изменялись. Сохранён только этот независимый отчёт; исходные findings остаются открытыми до отдельного evidence-backed addendum.
