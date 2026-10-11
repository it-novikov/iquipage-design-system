# Отступы заголовка задачи

По обратной связи владельца верхний отступ заголовка уменьшен на 10–20%, нижний до табов выровнен с ним. UI выполнен GPT 6 Astra: четыре строки product composition CSS, публичные токены действующей DS .42, без изменения библиотеки, контролов и autosize.

Геометрия строк desktop29/53 →25/25px (верх −13,8%), mobile25/53 →21/21px (−16%). Проверены drawer и fullscreen на широком экране и390px, заголовки1–9строк; общий grid gap и расстояния обложки сохранены. Raw geometry и просмотренные before/after снимки: output/title-spacing/. Existing fractional scroll табов после focus до0,5px не относится к правке и не менялся.

PASS: build/typecheck, check:boundaries/styles, node --import tsx --test tests/work-model.test.mjs tests/frontend-lifecycle.test.mjs tests/task-templates.test.mjs —31/31. Linux amd64 jibBuildTar PASS. Это low visual polish: новая API/схема/права не затронуты; прошлый полный gate относится к предыдущей реализации, не заявляется проверкой этого изменения. Выпуск runtime dabb3de подтверждён на production. API ready, worker running; точные образы, restarts0 и ERROR0 проверены. Ledger077 без новых миграций. Read-only SPR-4 подтвердил25/25px desktop и21/21px mobile390 без overflow; console error/warn отсутствуют, временный размер окна сброшен. Снимок: output/release1-ui/title-spacing-production-after.jpg. Raw deployment receipt: output/title-spacing/deployment.json. Полный CI новой версии выполняется отдельно; его PASS здесь не заявляется.


Runtime: `dabb3dec2fca9b733cdfb61b4d549bc2dd422fa4`; manifest: `sha256:6e7d9584ef337960a327d500515606332ace09c5ce44e3fde4150f619bd2f154`; HTML SHA256: `f92532c4d9973c39efb5c7812509f1daf4ae04b5f7f61d90239863c97772618e`; cutover: `2026-10-11T09:47:11Z`; backup: `/root/backups/sprintique-vnext/title-spacing-20261011T094624Z`.
