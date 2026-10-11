# DS47 → DS48 GAP01–04 — независимое техническое ревью

## Актуальный итог DS48

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
