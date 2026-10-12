# Независимый follow-up R5 — синхронизация видимых Task/Work tabs

**Вердикт: scoped approve для исправления R4-F1 в `ac68af1e1c4c213ba307d35ec8706998802db447`, tree `8ab90c4eb22be90b0a0a1e226a50bb598e0b87da`. R4-F1 [P2] resolved.** Исправление подтверждено настоящим контрактом pinned DS `.52`, независимой проверкой числа route callbacks/writes, усиленными native assertions и лично осмотренными свежими recovery frames. Новых подтверждённых P0–P3 findings в этой узкой delta нет.

## Основа, независимость и границы

- Ревьюер — `maps_review_r2`, GPT-6 Astra, независимый от автора; продолжение R4. Отдельный read-only помощник `tab_contract_r5` проверил точный DS/event contract и подготовил узкий diagnostic. Основной ревьюер прочитал его исходник и лог, самостоятельно повторил запуск и отдельно проверил native evidence. Это дополнительная проверка одной delta, не новый полный аудит продукта.
- Проверенный frozen commit: `ac68af1e1c4c213ba307d35ec8706998802db447`; parent: `1fe0d7e2a6ccf1af289a19b5491c1aabbd45ff8e`; tree: `8ab90c4eb22be90b0a0a1e226a50bb598e0b87da`. Commit, parent и tree самостоятельно получены через git.
- Для review создан `git archive` snapshot `/workspace/scratch/b3dac59f68e2/research/wp01/review-r5-ac68af1e`. Изменяемый checkout автора не использовался как frozen source. Для зависимостей подключена существующая `node_modules`; новых установок не было.
- Tree опубликованного parent commit `d4c7fd597efaa60f5e646687c06338c98e90946d` самостоятельно проверен: тот же `8ab90c4e…`. Reviewed local source и опубликованный tree эквивалентны.
- Targeted plan записан до проверок: `/workspace/scratch/b3dac59f68e2/research/wp01/r5-targeted-plan.json`, SHA-256 `c48d7575336c258df7267d26dd2750ae4cb897351e8db2fccf2f0f259db7d92e`.
- Применены ранее прочитанные root/product AGENTS, engineering review/workflow и локальный iquipage-review. Область намеренно ограничена R4-F1: initial section, программная синхронизация, пользовательский click, route-write semantics и достаточность новых native assertions/frames.
- Product, bridge и remote ревьюер не изменял. Созданы только scratch snapshot, diagnostics, логи, evidence validation и этот отчёт. Full build, backend и широкая повторная проверка остальных потоков в R5 не выполнялись.

### Source fingerprints

| Source | SHA-256 |
| --- | --- |
| `products/sprintique/ui/src/board/task-dialog.js` | `f1fa44a348c3f3c0b57612a588c45d9957ad4d86713ba7657952cdb1ec826a4b` |
| `products/sprintique/tests/maps-task-browser.mjs` | `3bf1ff429545fcefcea1cacc30214bdfa0f0f963e3e8d62294ea9fe4283c72f4` |
| `products/sprintique/tests/fixtures/maps-task-context/main.js` | `b372896e6a5b50c3765e0353222c61d1e0f0a47406ca6c02448361ece97815c0` |
| `products/sprintique/web/main.js` — без изменения относительно R4 | `7f31cfb05b11b8b43c5edec144d5fc34c115889068ab9c426dfc4ad2ef37d2aa` |
| `products/sprintique/web/maps-host.js` — без изменения относительно R4 | `f6d657fa8f799455f1d6c24e01b6a57107d0765ad16cbcd867b01f16d8f5eaea` |
| `products/sprintique/web/maps-task-context.js` — без изменения относительно R4 | `fbbdede95642a8087720fff7ae62c4bde7181e78f638a0353cbd07fed815d28d` |

Номера строк ниже относятся к ac68af1e. Runtime correction затрагивает только product Task adapter; pinned DS и его private implementation не изменены.

## Почему R4-F1 закрыт

### Initial mount получает правильный section

В `ui/src/board/task-dialog.js:150` markup `iq-tabs` теперь получает `initialSection==='work'?'work':'task'`. Host уже передаёт разрешённый contextual section, поэтому Maps `/work` больше не разбирается повторно canonical-only parser при создании DOM. Whitelist оставляет только два допустимых значения.

Pinned `IqTabs` применяет initial `value` в собственном синхронном `mount`: выставляет `aria-selected`, tabIndex/active и видимость panels. Когда initialSection равен `work`, Work panel выбран с момента этой инициализации. Для обычной Task сохранён Task panel. Default `initialSection` общего Task API по-прежнему использует canonical parser, поэтому существующий canonical вызов сохраняет свой исходный контракт.

### Программное переключение действительно активирует panel

В `task-dialog.js:441–453` `setSection` нормализует значение и находит уже поставленную продуктом кнопку `[data-tab="task"|"work"]`. Если она ещё не выбрана, вызывается её штатный `click()`. Это обычная кнопка в supplied markup, а не вызов закрытого DS `activate` или ручное переписывание нескольких внутренних состояний.

В точном `.52` обработчик click вызывает `activate` синхронно. Тот меняет ARIA, tabIndex, active class, `panel.hidden` и `value`, затем синхронно отправляет `iq-change` через `dispatchEvent`. Поэтому `settingSection=true` охватывает всё служебное событие: `syncTab(true)` обновляет footer, но не вызывает `onSectionChange` и не пишет fallback canonical URL. После вызова flag сбрасывается через `finally`. Host сохраняет владение маршрутом своего программного перехода.

Повторный выбор уже выбранной вкладки не нажимает кнопку и не создаёт дополнительного `iq-change`. Обычный пользовательский click выполняется при `settingSection=false` и по-прежнему даёт один callback либо один fallback `history.replaceState`. Новой рекурсии или лишней записи маршрута в проверенной композиции не выявлено.

### Проверен именно текущий pinned DS

Diagnostic извлекает реальные `IqElement` и `IqTabs` из `vendor/iquipage-web-0.6.0-vnext.52.tgz`, а не повторяет их алгоритм. Archive SHA-256: `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`; `package/dist/modules/components.js` SHA-256: `5d1c0798227f4960ea495c2770cf099d3836a5782c8965af6a9ee5f88ad586a1`. Продуктовый блок `setSection` и initial markup expression извлекаются из frozen Task source, который дополнительно сверяется с `git show ac68…`.

В `.52` click activation использует `focus=false`; этот код не вызывает `tab.focus()`. Это ограниченный вывод об исполняемом контракте. Полное browser focus behavior при скрытии панели отдельно не оценивалось и не является основанием verdict.

## Независимая проверка route-write semantics

`/workspace/scratch/b3dac59f68e2/research/wp01/r5-tab-contract.test.mjs`, SHA-256 `40de1f9a3d835c053b0c4adf239952cec4a56805ea4aa29a58fcc183413036b5`.

Помощник исполнил diagnostic, затем основной ревьюер прочитал его целиком и повторил `node --test r5-tab-contract.test.mjs`. **Оба запуска PASS 5/5; повторный child Node exit 0, 0 skipped/cancelled.** Повторный лог: `/workspace/scratch/b3dac59f68e2/research/wp01/r5-tab-contract-reviewer.log`; первоначальный: `r5-tab-contract.log`.

| Проверка exact source | Наблюдение |
| --- | --- |
| Initial `work`, `task`, undefined и некорректное значение | Whitelist корректен; DS initial panel/ARIA/active/tabIndex согласованы. |
| Programmatic Task → Work → Task с `onSectionChange` | **0 callbacks, 0 fallback writes**; panel/ARIA/footer следуют выбранному section. |
| Programmatic Task → Work → Task с default route sink | **0 `replaceState`**; panel/ARIA согласованы. |
| Повторный setSection текущего section / нормализация invalid | Дополнительного `iq-change` нет. |
| Ручной supplied-button click с callback | **Ровно 1 синхронный callback**, fallback не вызван. |
| Ручной supplied-button click с default sink | **Ровно 1 `replaceState`** в canonical Task Work URL, исходный `history.state` передан без подмены. |

Это source-composition diagnostic: DOM/query/click delivery представлены явно обозначенными doubles. Он проверяет actual DS/product event decisions и вклад самого Task adapter в route writes. Native видимость panels подтверждается отдельно нижеследующим artifact. Число callback проверок не выдаётся за число браузерных исторических переходов.

## Свежий native artifact и фактические кадры

Ревьюер лично прочитал `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38212310305/results.json`, SHA-256 `1d5763976c56f423ed7b3ac1aaf73c861ef5398af677114043fc928d919c3a77`.

- Run `38212310305`, job `114689006267`, checked merge `268e60293d36a391a7847a84f294a1bb568e5086`; parent передал его для tree-equivalent опубликованного `d4c7fd5…`.
- Artifact `11729896634`; parent скачал и проверил ZIP SHA-256 `56697cc136a8774fb0a840cf7fda28a3942e593c6529ede3663d98ab4e970e85`. Ревьюер повторно zip не хешировал; самостоятельно сверил JSON, source digests и относящиеся к finding frames.
- **Все 10 recorded sourceSHA256 самостоятельно пересчитаны по frozen ac68 и совпадают**: host/context/route, Maps, Task, link-view, два CSS и два fixture module. Проверка сохранена в `/workspace/scratch/b3dac59f68e2/research/wp01/r5-native-evidence-validation.json`.
- Browser `151.0.7922.34`. Четыре profile: desktop-light, desktop-dark, narrow-light, narrow-dark — runner PASS. У каждого `peakOpenTaskDialogs=1`; `pageErrors=[]`, `externalRequests=[]`, fixture contracts PASS с `readProjectContext`.
- Five mountRecovery entries — PASS. Их observed fields приведены ниже; они прочитаны из raw JSON, а не выведены из общего status.

| Recovery | Конечный route / Task | Выбранная вкладка и видимые panels |
| --- | --- | --- |
| initial-map retry | `#maps/map-a/task/MFX-101`, MFX-101 | `selectedTab=task`, `workTab=task`, `visiblePanels=[task]` |
| initial-task → map | `#maps/map-a`, Task отсутствует | selectedTab/workTab null, `visiblePanels=[]` |
| initial-task → новая Work Task | `#maps/map-a/task/MFX-102/work`, MFX-102 | `selectedTab=work`, `workTab=work`, `visiblePanels=[work]` |
| initial-support → map | `#maps/map-a`, Task отсутствует | selectedTab/workTab null, `visiblePanels=[]` |
| initial-support → новая Work Task | `#maps/map-a/task/MFX-102/work`, MFX-102 | `selectedTab=work`, `workTab=work`, `visiblePanels=[work]` |

### Лично осмотренные frames

Ревьюер открыл и визуально проверил:

- `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38212310305/initial-task-new-task-recovery.png`;
- `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38212310305/initial-support-new-task-recovery.png`;
- `/workspace/scratch/b3dac59f68e2/research/wp01/ci-38212310305/initial-map-map-recovery.png`.

В обоих новых Work recovery frames видны MFX-102, подчёркнутая «Работа агента», заголовки «Работа по задаче» и «Поручите первый шаг», соответствующее Work content. Task fields отсутствуют; карта A остаётся на фоне. Оба кадра одинаковы побайтно: SHA-256 `82cdd88472f854989e5c6f764770945eeae1f0d665ada3c1a764a6d2c27d79d3`. Это отличается от лично осмотренных R4 before frames со значением `43e959fe41005e1f97dde8ad69862ff03f30009f042c80cbb9113bf6053ab3b4`, где были видны Task fields и подчёркнута «Задача».

Initial-map retry frame показывает MFX-101 с выбранной «Задача» и Task fields, согласованно с raw selectedTab/panels. Его SHA-256 `9e2807b4349022333435583a0773e4d3ccec4c5fda6d9195e5cf8034975de246`.

R5 не ограничивается считыванием `value` или доверением status PASS: observed panel fields, реальные кадры и поведение exact source согласованы.

## Почему новые native assertions закрывают прежний пробел

В `tests/maps-task-browser.mjs:41–45` новый `waitSection` требует одновременно:

1. Видимый tab с ожидаемым именем и `selected:true`, то есть фактическим `aria-selected`.
2. Видимость ожидаемого panel.
3. Скрытый противоположный panel.
4. Согласованные raw `workTab`, `selectedTab` и строго единственный `visiblePanels=[section]`.

Fixture `main.js` получает selectedTab из ARIA и visiblePanels из panel `hidden` плюс наличия client rects; это отдельные observable состояния, не переименование прежнего attribute check.

Новые calls проходят после пользовательского выбора Work, после header Close → native Forward, после Escape → Forward, после Back к карте → Forward и после ручного выбора Task (`runner:214–235`), во всех четырёх profiles. В двух Work recovery cases дополнительно проверяются initial Work, same-Task hash к Task, native Back к Work, и затем exact конечный route (`124–134`). Поэтому старое несоответствие «value=work, а видна Task» больше не может пройти эти шаги только за счёт правильного атрибута.

В raw profile result записан summary, а не отдельный DOM dump каждого промежуточного перехода. Вывод об успешном выполнении этих assertions опирается на лично прочитанный frozen runner и завершившийся текущий native run; собственный прямой frame осмотр относится к перечисленным recovery states. Browser fixture по-прежнему исполняет изолированный actual Maps host/whiteboard/Task, не main.js/auth/bootstrap.

## Сохранение предыдущих результатов и предел решения

R1–R4 задним числом не пересмотрены. Самостоятельно подтверждено, что R2, R3 и R4 scratch reports сохраняют прежние SHA-256; frozen bridge copies R3 и R4 побайтно совпадают с этими оригиналами. R4 остаётся changes-requested для e1; **закрытие R4-F1 зафиксировано только настоящим R5**.

R3 queue source, Maps host/context, dirty guards и pinned DS не меняются в этой tab delta. Их прежние scoped результаты не перезаписываются и не расширяются настоящим review. Parent сообщил о 97 Node PASS, build/boundaries/styles PASS и текущем CI Node PASS; основной ревьюер не повторял весь этот набор и не выдаёт его за свой запуск. Собственный узкий Node результат — 5/5 exact-source checks, дополненный текущим native evidence выше.

**Scoped approve закрывает R4-F1 и не оставляет открытых findings в проверенной tab delta.** Он подтверждает Task/Work section behavior в перечисленных isolated native scenarios и route-write semantics adapter. Full-shell browser, backend/persistence/grants, полный визуальный аудит dark/narrow состояний, системный vNext gate и release readiness находятся вне области R5. Никакого merge/deploy действия ревьюер не выполнял.
