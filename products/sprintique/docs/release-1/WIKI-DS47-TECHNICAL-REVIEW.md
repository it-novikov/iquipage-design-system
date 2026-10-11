# DS47 → DS48 → DS49 GAP01–04 — независимое техническое ревью

## Текущий технический итог DS50: APPROVE

Exact tar SHA256 `90380ecbfdeff2cca0e0ced052eefa7ec3e3f4bad320cf6891b866e8156d27a3` независимо проверён. Delta49→50 package CSS содержит только дополнительный floor внутри `@media(pointer:coarse),(max-width:720px)`: `.iq-menu-popup button,:is(.iq-document-bar,.iq-document-rail,.iq-dialog) .iq-btn{min-height:44px;min-width:44px}`. Renderer создаёт фактическую iq-menu-popup; public composition scopes совпадают с document/menu/dialog контрактами. Правило намеренно действует на public dialog buttons также вне Wiki на narrow/coarse; desktop fine pointer шире720 не меняется. Оно не вводит частный product selector. Interaction/components modules byte-identical49→50; autosize finite/none исправление49 сохранено. Public types отличаются только version literal.

Собственный targeted vnext46/47/49/50 **15/15 PASS**, fail/skipped0. Новые50 regression сверяют popup class с renderer, desktop menu base40 и presence/scope media floor, document/dialog правило отсутствует до media block. Это static/model tests, не computed browser sizing. Полные авторские476 PASS — внешнее evidence. Проверенные CSS/interaction/components/docs/document.md/types/core.d.ts/package.json byte-equal tar↔librarydist↔installed package.

Actual `output/design-review/ds50-linux-gzip.json` прочитан: official Node24.20.0/zlib1.3.2.1-motley, exact archive SHA выше; **core185160≤185291, CSS101397≤101612**, запас131B/215B. Эти фактические значения отличаются от предварительной оценки184949/101603 в сообщении; в verdict использован JSON. Budgets не повышены. Новых actionable technical findings в narrow delta не найдено. **APPROVE только DS50 technical package**; actual390 closure R1 и whole-feature новый freeze/gate/container proof остаются отдельными gates.

## Историческое ожидание DS50

После actual mobile R1 найден P2 touch target: menu40px и document bar/dialog close36px вместо44px. DS50 public repair ещё ожидает независимого technical re-review и нового exact package/budget evidence. DS49 APPROVE ниже — исторический узкий verdict по autosize/title, не актуальная final acceptance.

## Исторический итог DS49

2026-10-11. **APPROVE для технической корректировки DS49**, exact tar SHA256 `c4ba43d6cf74313b7b43bb657bde818fc15a91e64e4764567fef51ebd7a48225`. Вердикт48 ниже исторический и касался исправления tree selectors; он не подтверждал отсутствия позднее найденной браузерной проблемы title/autosize. Новых actionable findings в узком delta48→49 не найдено. Текущая Wiki UI и task links ещё требуют отдельной приёмки.

Самостоятельный read-only diff обоих tar подтверждает два изменения поведения: `src/modules/interaction.js:96` трактует computed `maxHeight === 'none'` как Infinity; `src/styles/foundation.css:2648` задаёт `.iq-document-title` min-height1.25em/max-height:none. Последнее перекрывает generic textarea min80/max640 только для document title. Default textarea640 и editor600 остаются конечными CSS лимитами; такие поля по-прежнему clamp и включают overflow auto. Пустое/нечисловое fallback значение сохраняет прежние76/640. Для явного none высота растёт по scrollHeight+border, overflow hidden; input node/value/selection не заменяются, scrollTop сохраняется. Resize observer/state/API новых нет. Остальные tar delta — version49 и сопутствующие manifest/provenance/docs/token metadata; public types меняют только version literal, остальные module bytes неизменны.

Собственный Node24 targeted запуск vnext46/47/49: **13/13 PASS**, fail/skipped0. Новые49 tests покрывают одно-/многострочный title, body1700 при none, finite640 clamp/scroll, fallback и disconnected guard. Полные авторские474/474 — внешнее evidence. Это тесты autosize с model computed style, не собственная браузерная cascade/IME проверка.

Независимо подтверждён SHA tar; CSS/interaction/docs/document.md/types/core.d.ts/package.json совпадают byte-for-byte между tar, library dist и установленным consumer. Прочитан fresh root `products/sprintique/output/design-review/ds49-linux-gzip.json`: Node24.20.0/zlib1.3.2.1-motley-42c2f19, core185161<185291, CSS101369<101612 (запас130B/243B). JSON содержит raw measurements; связь с exact49 основана также на root run attribution и проверенном tar, а не на отсутствующем SHA поле JSON. Budgets не повышены. Build/cache/source reviewer не менял.

Пределы: actual document title geometry, mobile/IME/theme и целый product editing lifecycle reviewer в браузере не выполнял. Технический APPROVE49 не заменяет отдельный actual UI review, product fullgate или production readiness.

## Исторический итог DS48

2026-10-11. **APPROVE для узкой технической поставки DS48**, exact tar SHA256 `5023b875c4a02b7c347b35970c172aa47836f79a911d8a682dc298ae2ed46eed`. Исторический DS47 ниже остаётся отклонённым; его PASS не используется для подтверждения исправленного пакета. Новых actionable findings при corrective re-review не найдено. Это не окончательная приёмка Wiki UI.

**DS47-TREE-SELECTORS закрыт в DS48.** Фактический `libraries/iquipage/src/styles/foundation.css:2640` скрывает `.tree-node-count`, строки2643/2657 задают padding `.tree-node-label` в compact desktop и narrow/coarse режимах. Эти классы совпадают с renderer `src/modules/structured.js:122`. Остальные document/outline/editor контракты и семантика дерева не изменены этой корректировкой; глубина12 остаётся в aria-level, visual indent ограничен отдельно.

Новая meaningful regression `libraries/iquipage/tests/vnext46.test.cjs:41` получает HTML из фактического IqTree renderer, извлекает классы descendant count и label и проверяет соответствующие CSS selectors/default+coarse padding. Она ловит исходные ошибочные имена DS47. Это проверка renderer/CSS соответствия, не вычисленная браузером геометрия или полная cascade проверка.

Собственный повторный запуск Node24 `--test libraries/iquipage/tests/vnext46.test.cjs libraries/iquipage/tests/vnext47.test.cjs`: **11/11 PASS**, fail/skipped0. Полные авторские472/472 — внешнее evidence, не собственный запуск. Tar SHA независимо проверён. Read-only byte comparison tar↔library dist↔installed `products/sprintique/node_modules/@iquipage/web` совпал для CSS, structured/viewer/editor modules, document.md, types/core.d.ts и package.json. Builds/cache не изменялись.

Прочитан fresh root Linux proof `products/sprintique/output/design-review/ds48-linux-gzip.json`: Node24.20.0/zlib1.3.2.1-motley-42c2f19, exact SHA выше, passed=true; core185141<185291, CSS101356<101612. Запас150B/256B, budgets не подняты. Это внешний официальный Linux запуск, не собственный probe reviewer.

Пределы остаются прежними: собственный actual browser/IME/theme/device прогон не выполнен. Отдельная actual DS visual acceptance и product lifecycle/dirty editing acceptance ещё требуются; APPROVE здесь разрешает использовать исправленный public package, не удостоверяет готовность текущей Wiki UI или production.

## Исторический DS47 — changes-requested

2026-10-11. Проверены фактические source/docs/types и vnext46/47 tests, не только согласованный план. Reviewer не автор DS/UI; реализации не менялись. Проверяемый exact tar SHA256 `7678c5033fa77900c14b8faf809e49c854c6f8973bf8d32ea1ba5db419f325b1` самостоятельно подтверждён. UI implementation ещё идёт; это targeted library review.

## Finding

- **DS47-TREE-SELECTORS [P1, confirmed]** `libraries/iquipage/src/styles/foundation.css:2640` — `hide-counts` скрывает `.tree-count`, но renderer `src/modules/structured.js:122` выводит descendant count как `.tree-node-count`. Навигационное дерево сохраняет счётчики вопреки public document.md. В том же блоке строки2643/2657 применяют compact padding к отсутствующему `.tree-label` вместо `.tree-node-label`; текст не получает обещанную геометрию. Сценарий: navigation/plain/compact/hide-counts, родитель с детьми. Решение: исправить реальные selectors, добавить fixture/regression с actual rendered branch/count/label и проверить narrow/coarse/default режимы; затем repack и Linux remeasurement. Передано автору/root; **open** на указанном tar.

## Проверено без новых findings

- Viewer `markdown-viewer.js:18`: fresh snapshots не раскрывают internal array/map; headings берутся из уже безопасно отрисованного Markdown, без второго parser. Фактические DOM IDs имеют viewer namespace, logical IDs deterministic ordinal в пределах того же source. Cache map обновляется даже при одинаковом outline после rerender; empty/error сбрасывают targets. focusHeading выбирает собственный map, проверяет connected, invalid возвращаетfalse, scroll immediate; location.hash/routing/save не меняет. Программные value/headingLevel изменения не запрашивают focus. Source содержит actual heading level/textContent, tests проверяют duplicates, mutation isolation и несколько viewer. Общий DS focus-visible охватывает tabindex heading.
- Editor `editor.js:360` и foundation document variant: visible label/info hint/footer counter скрыты presentation-only. Accessible name остаётся на textarea и preview. Footer сохраняется при caller actions/submit/cancel, их hints не скрываются как `.md-hint`. Variant CSS не пересоздаёт textarea; public previewMode/focusEditor, toolbarActions/footerActions и существующие disabled/readonly/IME/undo logic остаются. Preview label улучшен для всех вариантов, без изменения их событий. Actual browser/IME variant geometry пока не проверена reviewer.
- Workspace public CSS/classes documented in document.md: rail/bar/content/title с min-width0, measure76ch, narrow rail hide и существующий dialog на стороне host. Route/drafts/permissions/loading/error/focus не перенесены в DS controller. Product должен предоставить mobile navigation/dirty guards и ограниченную outline presentation. Это не готовый product lifecycle.
- Plain/compact opt-in не меняет selector/checkable semantics, tree value/expandedIds и cancelable intents. Legacy/navigation tests проверяют parent activation, disclosure, refreshed focus и1000-node path. Неправильные selectors остаются finding выше. Дополнительные изменения mentions/ui/avatar/property-list — перенос comments в packaged control-contracts.md, не новый runtime behavior. Budgets не повышены.

## Доказательства и пределы

Собственный запуск `node --test libraries/iquipage/tests/vnext47.test.cjs libraries/iquipage/tests/vnext46.test.cjs`: **10/10 PASS**, fail/skipped0. Этот набор не ловит finding CSS: новая47 suite покрывает outline, поэтому PASS не доказывает tree appearance. Авторский полный library471/471 — внешнее evidence, не запуск reviewer.

Прочитан root official Linux `products/sprintique/output/design-review/ds47-linux-gzip.json`: Node24.20.0/zlib1.3.2.1-motley, core185141<185291, CSS101354<101612, SHA указанного tar. Это внешний Linux probe. Запас core150B; исправление требует повторного измерения нового exact tar. Предыдущий PASS нельзя переносить на repaired package.

Не выполнены собственные actual DS browser/IME/theme/device проверки; actual new DS visual acceptance идёт отдельно. Не заявляются product/fullgate/production readiness. Large outline содержит все entries; product должен ограничить видимый список и дать доступ к продолжению. Private DOM обход не разрешён.

**Вердикт:** changes-requested для указанного DS47 tar до DS47-TREE-SELECTORS fix, meaningful affected regression, repack и fresh Linux budget proof.
