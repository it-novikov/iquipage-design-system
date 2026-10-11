# Отступы заголовка задачи

По обратной связи владельца верхний отступ заголовка уменьшен на 10–20%, нижний до табов выровнен с ним. UI выполнен GPT 6 Astra: четыре строки product composition CSS, публичные токены действующей DS .42, без изменения библиотеки, контролов и autosize.

Геометрия строк desktop29/53 →25/25px (верх −13,8%), mobile25/53 →21/21px (−16%). Проверены drawer и fullscreen на широком экране и390px, заголовки1–9строк; общий grid gap и расстояния обложки сохранены. Raw geometry и просмотренные before/after снимки: output/title-spacing/. Existing fractional scroll табов после focus до0,5px не относится к правке и не менялся.

PASS: build/typecheck, check:boundaries/styles, node --import tsx --test tests/work-model.test.mjs tests/frontend-lifecycle.test.mjs tests/task-templates.test.mjs —31/31. Linux amd64 jibBuildTar PASS. Это low visual polish: новая API/схема/права не затронуты; прошлый полный gate относится к предыдущей реализации, не заявляется проверкой этого изменения. Выпуск фиксируется после сверки production.
