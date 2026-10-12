# Журнал 20261012-tabs-scroll-geometry

- 2026-10-12T07:02:47Z · tabs-impl · create · - · WP02-B / PF03: общая геометрия вкладок без лишней прокрутки
- 2026-10-12T07:02:48Z · tabs-impl · claim · - · взял задачу
- 2026-10-12T07:13:10Z · tabs-impl · checkpoint · S1 · дальше: Root publishes diagnostic commit, runs Tabs geometry on native Chromium, returns actual baseline artifacts.
- 2026-10-12T07:14:29Z · tabs-impl · checkpoint · S1 · дальше: Root publishes frozen diagnostic commit and returns native Chromium baseline artifacts.
- 2026-10-12T07:24:12Z · tabs-impl · checkpoint · S1 · дальше: Root publishes this checkpoint and repeats the frozen native baseline before any common CSS change.
- 2026-10-12T07:30:06Z · tabs-impl · checkpoint · S1 · дальше: Root publishes this diagnostic checkpoint and repeats the full native baseline including event deltas and correct nested close observation.
- 2026-10-12T07:39:37Z · tabs-impl · step · S1 · done: Authoritative baseline: Actions 38218161373, artifact 11733391704 SHA2563fd72f6feaf11426f37196d4448dd1fe4d5be1f4b77acd2fb414a4128ff6ac2d. Native Chromium 151.0.7922.34 BASELINE_REPRODUCED: 16 cases, 177 intents, every eventDelta1, correct retained nested parent, no page errors/external requests. Source merge a49fac18565d3291b061eaa6c3c4c1c6f03ec328 has tree d8ec6dc65001674957566c773fdcf0adf427df2c = diagnostic head56d2a2f2. Frozen plan79821edf… and exact .52 archive989fab… verified; ordinary minimal/Task/Wiki client45/scroll46/max1 and clipped focus visible in raw frames. A/B source-layout comparison favours A; root accepted one native candidate.
- 2026-10-12T07:39:37Z · tabs-impl · note · A1 · критерий приёмки выполнен
- 2026-10-12T07:39:37Z · tabs-impl · step · S2 · active: Candidate A built/tested/packed and exact private .53 adopted; native candidate geometry still NOT_RUN. First package criterion complete; remaining candidate matrix pending.
- 2026-10-12T07:39:37Z · tabs-impl · note · A3 · критерий приёмки выполнен
- 2026-10-12T07:39:37Z · tabs-impl · checkpoint · S2 · дальше: Root publishes frozen candidate; run native plan revision2 and the unchanged full vNext gate; inspect raw client/scroll/rect/focus and actual full frames before acceptance.
