# SPR-17 · Независимое DS47 experience review R1

Текущий статус: **APPROVE source/public contract и experience текущей DS50** (узкий повтор ниже; история DS49 сохранена). DS47 первоначально CHANGES REQUESTED; закрытие ниже. Scope: публичные document/tree/editor/outline контракты47, не финальная приёмка wiki runtime. Runtime/source не изменялись reviewer.

**P2 DS47-R1-1 — CSS не совпадает с реальной разметкой дерева.** `libraries/iquipage/src/styles/foundation.css:2640` прячет `.tree-count`, тогда как descendant counts navigation режима создаются как `.tree-node-count` (`src/modules/structured.js:121`). `hide-counts` не выполняет публичное обещание и оставляет числа в тихом rail. Строки2643/2657 задают compact label padding несуществующему `.tree-label`; реальный `.tree-node-label` не получает вертикальных отступов при `align-items:flex-start`/нулевом row padding. Требуется public CSS fix и actual fixture/computed regression; product override недопустим. Отправлено Astra/root.

Source positive checks: document variant меняет CSS, не remount textarea, что сохраняет selection/IME/history при attribute/resize; aria-name textarea остаётся label, preview теперь получает label. CSS скрывает informational hint, но footerActions/cancel/submit и caller hint вне footer сохраняются. Полный toolbar не урезан. Viewer outline создаётся из safe rendered headings, namespace отдельный на viewer, snapshot defensive; focusHeading ограничен своими connectednodes, no hash writes и value update не вызывает focus. Public types/docs отражают добавления. Публичный layout отделён от route/network/draft state. Defaults presentation сохраняются.

Raw471 author tests и root Linux bytes пока считаются внешними свидетельствами; окончательный report дополнит собственное чтение raw и actual desktop/mobile/both-theme editor/tree/outline walkthrough. Нет утверждения, что IME или footer geometry уже проверены браузером.

## Повторная проверка DS48 — APPROVE

DS47-R1-1 закрыт public CSS исправлением: hide-counts обращается к real tree-node-count; compact padding к real tree-node-label в desktop и touch правилах. Consumer override не требуется.

Собственный Chrome walkthrough actual fixture localhost:4320/ds-runtime.html,1280×720 и390×844, обе темы: документ и редактор без декоративной карточки/двойного label читаемы; все17 поддержанных formatter commands остаются, mobile computed44×44; toolbar action «Шаблон» доступен. Нет горизонтального document overflow (scrollWidth390). Подвал с пользовательским выбором, Отмена/Сохранить и hint остаётся видимым; пустой informational footer скрыт. Actual preview рендерит Markdown и имеет имя «Текст страницы — предпросмотр». После возврата к правке фокус снова на textarea. Deep12/fullnames tree представлен и сохраняет real aria-level при ограниченном отступе.

Fixture «Проверить контракты»:10/10 PASS (hide-counts, actual label padding, deepARIA, caller actions, barefooter, preview name, variant samefield/selection, uniqueheadingIDs, outline focus/nohash, invalid no-op). Проверка намеренно использует fixture action, не production. Read-only independent DOM measurements дополнительно подтвердили размеры tools/footer visibility/preview name. Нет отдельного браузерного доказательства физического IME; source CSS-only variant не remount textarea, required composition regression остаётся wiki runtime gate. Reader rights/network state принадлежат product, DS presentation не предоставляет write permissions.

Самостоятельно прочитан raw /tmp/wiki-ds48-tests.log:472/472 PASS, fail0/skipped0. Без повторного запуска сборок независимо сравнены64 dist/types entries archive ↔ builtlibrary ↔ installed, все совпали;58 fixture dist files совпали с archive. Tar SHA256 `5023b875c4a02b7c347b35970c172aa47836f79a911d8a682dc298ae2ed46eed`. Fixture imports exact ds48/dist/core.js и CSS.

Одобрение ограничено публичным контрактом/source и actual component experience исправленной48. Root должен подтвердить fresh officialLinux48 budgets, final source freeze и package adoption в полном gate. Итоговый wiki runtime ещё не принимается: нужны draft/IME/lifecycle/CAS/rights/keyboard/dialog/performance/browser проверки, затем независимые final reviews. Reviewer изменил только этот report; viewport reset.

## Исторический decision DS49 — APPROVE

Независимый delta: `.iq-document-title` имеет `min-height:1.25em/max-height:none`; autosize теперь различает explicit none→Infinity и finite/fallback. Source изменение не заменяет field/value/selection. Самостоятельно прочитан raw474/474PASS (fail0/skipped0) и root officialLinux JSON: Node24.20.0/zlib1.3.2.1-motley, core185161≤185291/CSS101369≤101612, budgets прежние.

Собственный actual exact49 Chrome fixture:1280desktop title one line40px, three lines120px;390mobile one line35px, без прежних80px. Keyboard Shift+Home selection39–52 и текст сохранены при viewport resize. Host по публичному контракту должен повторять autosize после layoutchange; fixture autosize вызывается на input, поэтому сам resize сохраняет прежнюю explicitheight до следующего input — это не автоматическое поведение DS pattern.

На390 document body60lines вырос до1720px с max:none/overflow:hidden. После смены на full значение1969chars и selection1937–1969 сохранились; последующий keyboard input применил прежний finite max600px, height600/scroll1740/overflow:auto. Это actual browser проверка обеих веток. Mobile11/11 fixture contractsPASS;17commands и caller footer по-прежнему доступны, no horizontal overflow390, theme dark переключается без потери ввода.

Самостоятельный readonly bytecompare64dist/types archive↔builtlibrary↔installed и58fixture dist entries:0mismatch. Exact49tar SHA256 `c4ba43d6cf74313b7b43bb657bde818fc15a91e64e4764567fef51ebd7a48225`. Current49 component experience/source одобрены; замечаний P0/P1/P2 в этом delta нет. PhysicalIME и полный product runtime остаются отдельными gates, как выше. Изменён только reviewer report, Chrome viewport reset.

## Текущий decision DS50 — APPROVE

Whole-product expert walkthrough выявил P2 WFR1-1: actual DS49 mobile menu40px, document navigation/history/dialog и task-picker buttons36px вместо принятого44px. После public DS50 repair finding CLOSED; история сохранена в `WIKI-FINAL-EXPERIENCE-REVIEW.md`. Изменён публичный CSS touch contract для narrow≤720/coarse pointer: menu action rows и document bar/rail/dialog buttons имеют минимум44px; icon buttons также ширину44px. Runtime commands, editor state, title/autosize и desktop sizing не менялись. Это не consumer override.

Собственный fresh reload actual4318 с exact50, Chrome390×844: menu4items44px; documentbar navigation/breadcrumb/actions44px; history close/back/versionrows44px; task-page-picker close/Отмена/Прикрепить44px. Scroll width390. Escape закрывает версии, сохраняет hash и возвращает фокус на «Версии страницы»; отмена task picker возвращает фокус на его trigger. При1280 menu40px сохранён. Viewport reset. Product read/editor light+dark и command presence проверены в основном walkthrough; физический touch/IME и screen reader не выдаются за выполненные.

Exact public package `0.6.0-vnext.50`, SHA256 `90380ecbfdeff2cca0e0ced052eefa7ec3e3f4bad320cf6891b866e8156d27a3`. Прочитан package proof:69 entries archive/builtlibrary/installed совпадают,0mismatch; raw library476/476,fail0/skipped0. Прочитан officialLinux proof Node24.20.0/zlib1.3.2.1-motley:core185160≤185291,CSS101397≤101612, прежние budgets.

Свежий actual certificate `output/verification/2026-10-11T14-40-23.871Z/verification.json`14:50:57.978UTC:8/8PASS,sourceStable=true, оба fingerprint `e9360a887834e09d8304ceea60bf9cac09c2ca52ee917ae4d75612e7e05c59ee`, exact50archive. Raw product/detached559each,fail0/skipped0. Public DS50 source/contract/component-experience **APPROVE**, no open confirmed P0/P1/P2. Whole-product scope/limitations и release-candidate verdict находятся в отдельном final report; это не утверждение о production cutover. Изменены только reviewer .md.
