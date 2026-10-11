# WFR1-3: каталог до первого ответа

Controlled product-only repair в ветке `fix/wiki-catalog-loading`, исходная база `9249b30`. DS .50, сервер и API не менялись. Причина: пустой начальный массив трактовался как успешный пустой каталог и в rail, и на главной странице; архив использовал те же данные.

`wikiCatalogState` различает неизвестные данные (`rows=null`), pending, первый успешный ответ (включая `[]`) и ошибку. Отменённые/устаревшие запросы не публикуют результат. Последний успешный каталог остаётся при refresh и ошибке. Render показывает публичный skeleton до первого ответа, error/retry после отказа, empty только после успешного пустого ответа. Уже загруженные страницы и архив не скрываются при ошибке обновления.

Четыре новые meaningful asynchronous регрессии: pending→nonempty/empty; initial error→retry; cached nonempty/empty→refresh error; superseded/closed→late result/error без нового paint. Целевой набор UI 42/42 PASS, build, boundaries и diff check PASS. Команды: `node --test tests/access-notice-ui.test.mjs tests/wiki-ui.test.mjs tests/task-materials-ui.test.mjs tests/task-wiki-links-ui.test.mjs`, `npm run build`, `npm run check:boundaries`; Node24. Логи сохранены в `output/wiki-loading/`.

## Браузерное доказательство

Использована отдельная локальная UI fixture `http://localhost:4322/output/wiki-loading/index.html` с настоящим `mountWiki`, поставленным DS и product shell stylesheet, но контролируемым synthetic repository. Это проверка фактически отрисованного UI, не HTTP/backend-приёмка. Ни production, ни реальные данные не затрагивались; сервер/БД для фикстуры не нужны. Исходники фикстуры в `output/wiki-loading/`, служебные кнопки сверху не относятся к продукту.

Chromium 1280×720, светлая тема: pending index и archive имеют два aria-busy skeleton и не содержат ложного empty; initial error удаляет busy и показывает retry; retry возвращает loading; успешный [] показывает настоящее empty/Create, архив — «Архив пуст». После nonempty повторная загрузка и её ошибка сохраняют «Инструкция команды»/«Прежняя инструкция». Закрытие раздела до позднего ответа оставляет fixture пустой — закрытый компонент не оживает.

Raw DOM: `output/wiki-loading/measurements.json`. Просмотренные финальные снимки: `pending-index.jpg`, `pending-archive.jpg`. Снимки сделаны после публичной 180 ms задержки skeleton; начальные мгновенные кадры были заменены финальными. Viewport сброшен. Это целевой loading repair; проверка иных браузеров, mobile, production HTTP или всей wiki-функциональности заново не заявляется.

Source freeze после завершённых проверок; дальнейший full gate и выпуск ведёт root. Ранее изменённый чужой `WIKI-FINAL-EXPERIENCE-REVIEW.md` не редактировался.

## Независимое техническое ревью R2

Frozen receipt: **SCOPED TECHNICAL APPROVE** exact fingerprint `d47439aacd32ceafda328bf62d4a1647895f2f7321a8d8648a8149254e4ddcb0`, `output/wiki-loading/sources.json` hashes independently checked mismatch0. Full CI/new release artifacts pending. Прежний3e15 certificate не переносится на этот source. Этот receipt фиксирует review docs до PR CI, не production approval.

2026-10-12, base9249b30 → frozen working delta `web/wiki.js`, `web/wiki-model.js`, `tests/wiki-ui.test.mjs`. **Scoped source review PASS**, actionable P0/P1/P2 не найдено. Это не новый whole-release APPROVE: fingerprint/fullgate/CI/artifacts ещё ожидаются. DS50/backend/API не изменены.

`wikiCatalogState` отличает unknownnull от successful[]; pending initial failure не объявляется empty. Refresh сохраняет последний успешный результат, включая пустой, и error/retry не заменяют его ложным новым состоянием. `request.current()` ограждает commit rows/error/final paint; старый resolve/reject/finally не снимает pending нового запроса и не перерисовывает закрытый mount. Fetch получает signal; guard работает и при игнорировании abort транспортом. Closed state может сохранить внутренний pending=true, но объект mount уничтожен и callback не исполняется — утечки UI состояния нет.

Application `loadCatalog` рисует skeleton/error/retry на index/archive/rail; page/edit обновляют только catalog/breadcrumb context, не заменяют textarea/draft. Realtime refresh пользуется тем же read channel и cache snapshot. История страницы, scroll-context helper и dirty/CAS/permission logic не изменены. Requests и listeners закрываются существующим mount cleanup; новых timers/storage/global subscriptions нет.

Собственный Node24 запуск из product с существующим tsx loader `--test tests/wiki-ui.test.mjs`: **19/19 PASS**, fail/skipped0. Новые deferred regressions проверяют pending до resolve для empty/nonempty, failure→retry, retained cache при failure и superseded/closed late callback suppression; исходный ambiguous[] defect ловится unknownnull/loaded assertions. Первый вызов из repository root не смог resolve product-local tsx и был исправлен working directory, source не менялся. Это model tests, не own actual browser render или backend прогон. Авторское browser fixture evidence выше атрибутировано; оно synthetic repository и не удостоверяет production HTTP/cache behavior.
