# WP01 — авторское исправление после независимого R1

Дата: 2026-10-12. Это промежуточный кандидат в [PR75](https://github.com/it-novikov/iquipage-design-system/pull/75), не release acceptance.

## Что исправлено и чем проверяется

| Finding | Изменение | Текущее доказательство |
|---|---|---|
| R1-F1 | Один отменяемый intent включает открытие Maps и Task. `MapsFeature.openMap` получает signal и проверяет отмену до замены current/board | Actual MapFeature + context: поздний B против Back A/новой Task A; отмена во время guard до чтения |
| R1-F2 | Shell после отказа получает фактический оставшийся route владельца | Actual тела `navigate` и canonical Task `hashchange` исполнены с текущим guard; закрытая Task не возвращается в URL |
| R1-F3 | Initial host сохраняет более новый hash и применяет последний map/task/tab target после загрузки | Actual mounting host: map-only A, другая Task A/work, Task в B, неизменённый direct link |
| R1-F4 | Прежняя Task остаётся до начальных reads следующей. `beforeOpen` вызывает её обычный guard, затем existing `replace` | Actual Task links view показывает missing-target/support-read ошибку в живой прежней Task. Controller checks: отказ draft, Close при delayed support, section leave во время settlement |

`beforeOpen` — необязательный product lifecycle callback; DS API и пакет не меняются. Ошибка имеет живую Task-поверхность и Map error sink. Отказ не считается выполненным переходом. Scope канонических копируемых ссылок, прав и серверных команд сохранён.

## Фактически выполненные scoped gates

- `node --import tsx --test --test-concurrency=1 tests/maps-task-origin.test.mjs tests/frontend-lifecycle.test.mjs tests/navigation-speed.test.mjs tests/work-model.test.mjs tests/page-surfaces.test.mjs` — **79/79 PASS** (24 target +55 related).
- `npm run check:boundaries` — **PASS**, включая styles.
- `node node_modules/vite/bin/vite.js build` — **PASS**, 323 modules. Это bundle, не полный `npm run build`.
- `node tests/maps-task-browser.mjs --build-only` — **build PASS, browser NOT_RUN**; проверен actual module graph Maps, inspector, Task.
- YAML parse, `git diff --check`, targeted `bridge check` — **PASS**.
- Историческая проверка нового regression driver на неизменённом source первого checkpoint: 11/13 содержательных FAIL, 2/13 PASS. На исправленном source все 13 проходят. [Исходное независимое R1 и воспроизведения](r1/README.md) сохранены отдельно.

## Браузер и оставшаяся приёмка

Dedicated fixture использует actual Maps host, whiteboard, Task, relations, comment editor и product styles с exact DS .52. Light/dark × 1280×720/390×844: Close/Escape/native Back/Forward, Work tab и сохранение одного экземпляра карты. Один desktop-профиль дополнительно проверяет missing linked Task, support rejection, успешную замену, delayed support + Close и отказ закрытия реального неопубликованного комментария.

`.github/workflows/maps-task-context.yml` выполняет быстрый synthetic browser gate параллельно неизменённому существующему vNext workflow. Отдельный файл предотвращает конфликт с изменениями CI в параллельном Planning PR. Оба workflow используют те же pinned Actions; инструменты браузера временные, manifest/lock/vendor не меняются. JSON/кадры содержат synthetic данные и привязаны к source revision. Сеть fixture ограничена её localhost origin.

**Открыто до нового evidence:** browser runtime/визуальный просмотр, свежий независимый R2 и штатный полный CI. Локальный Chromium завершается до страницы из-за отсутствующего `/proc`; TypeScript7 native compiler — из-за `/proc/self/exe`; JDK25/PG18 gate локально недоступен. Эти ограничения не переименованы в PASS. Реальные Safari/Firefox/iOS/VoiceOver остаются перед release согласно указанию владельца.

Изолированный browser host не подменяет `main.js` и не доказывает auth/persistence/grants; shell boundary отдельно исполняется в Node. Hard reload не обещает восстановления ephemeral viewport. Полная приёмка WP01 и A1–A3 остаётся открытой до перечисленных проверок.
