# R2: исправления и расширенная проверка

## Авторский результат

R2-F1: initial Task read/support отменяется при новом native hash; сверка requested hash защищает от позднего ответа. Host применяет последнюю contextual цель. Shell откладывает canonical/section route до завершения mount и затем передаёт её нужному владельцу.

R2-F2: успешный initial-map retry продолжает сохранённую Task/Work цель; список не подменяет явно указанную A более новой B.

R2-F3: reload не ставит permanent discarded до успешной замены; error sink остаётся в Task. Accepted keepOpen не отключает guard оставшейся формы, если замена отменена.

Дополнительный независимый R3 выявил, что одного boolean pending недостаточно: старый отказ Map guard мог переписать адрес до replay. Исправление хранит hash/history state/version последнего native перехода. Его actual-shell regression проверяет повторное открытие T1 внутри A, сохранение history state/инспектора и единственный map guard. Frozen независимый отчёт хранится отдельно, без изменения прежнего verdict.

## Выполнено на исправленном source

- 97/97 scoped Node checks PASS: 42 target +55 related. Target включает actual MapsFeature, host, начальную Task preparation, Task dirty/reload/close и shell showProject/navigate/hash handler с внешними адаптерами. Это source-level evidence, не browser acceptance.
- Boundaries/styles PASS, product Vite323 PASS; синтаксис и fixture actual module graph build PASS.
- Vendor .52, manifest и lock не менялись.
- Проверка чувствительности: те же 17 новых R2 expectations падают на immutable `67abc87`/remote `ac9393c` (исходники не исправлялись; добавлен только driver). R3 сценарий на том старом source проходит: он касается следующей авторской queue-правки. На frozen patch `d93912d1` отдельный R3 expectation падает; на текущем исправлении все 18 проходят. Historical assertions не менялись для зелёного результата.

## Native evidence и границы

Предыдущий runtime `7068d1089b4951c80b8fec73c825d88bb1aad608`: [CI 38209868579](https://github.com/it-novikov/iquipage-design-system/actions/runs/38209868579), job 114681412661 — actual Chromium 151.0.7922.34 PASS на четырёх светлых/тёмных wide/narrow профилях. Checked merge `384ddd0dd2c48dd9b1ddd039d266ca9a87cefaa2`; artifact 11728982348 SHA256 `62e7f4b5043a27a0d3c94568c6d1b5a9e3cf8d3db32dfd7cf5c76b99fe4b7b98`. Ошибок страницы и внешних запросов 0. Кадры с Task/Work, комментарием после отказа Back и возвращённой картой просмотрены root. Эти результаты не переатрибутируются новому runtime.

Новый runner дополнен двумя actual autosave-conflict→reload-read/support-failure→new-comment→Back-refusal cases и пятью initial-map/task/support recovery cases. Две ожидаемые synthetic write attempts возвращают CONFLICT без записи; остальные записи запрещены. Новые native checks и текущий full CI PENDING до публикации/исполнения. Canonical section integration покрыта source-level shell test, а browser fixture изолирована от auth/main/backend. Локальный full build и browser BLOCKED средой, не PASS. A1–A3 остаются открыты до scoped independent/native acceptance.
