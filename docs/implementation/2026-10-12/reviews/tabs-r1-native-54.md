# R1 follow-up — WP02-B / PF03, exact `.54`

## Текущий статус

Source/package и independent native/visual follow-up выполнены на frozen `.54`. **R1-F1 и R1-F3 закрыты текущим native evidence. Итоговый verdict и закрытие R1-F2 ожидают текущий full-build результат.** Предыдущий original `review-r1.md` не изменён; его SHA-256 на входе этого раунда: `32702335ce7ea4f30055a155a30fbc19973cea0ec981739d41d885965c00b77f`.

Рецензент R1 не автор. Репозиторий read-only, чтение только immutable Git objects. Аналитические перспективы и scope сохраняются из первого R1: keyboard user, everyday Task user, visual designer, DS maintainer, QA. Это проверка общей tabs geometry и её текущих product consumers, без расширения до всего продукта или release-only сред.

## Независимая идентичность

| Объект | Значение |
|---|---|
| Published candidate head | `8f8d218168074bd4c7c9e1e29dfbe783a27998dd` |
| Candidate tree | `a7bf8ed72f07d975a6837e8f1428382785893833` |
| Authored integration | `5486522081632e8c400d932c31b9c171ada6a759`, тот же tree |
| DS checkpoint | `078faae97694b0631c8fbe90e3dc6cb6867bb8fb` |
| DS checkpoint tree | `9c7feff01838ad18caaf930e0d9480d71a7ef365`, совпадает с author `a8b4a19a8ceaffd31335c6e0f2d2c3d01ae43b07` |
| Exact package | `0.6.0-vnext.54` |
| Archive SHA-256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Independently held plan SHA-256 | `a0165e153cb976c9da17332b1b79baaeb9b10da2e375c9aa290c620bb3889872` |
| Actual native CI merge | `f53af728201b7a4ce2a128c6de7228143d2d50b4`, независимо прочитан Git object, тот же candidate tree |
| Native run / job / artifact | `38221220733` / `114717673229` / `11734645359` |
| Native ZIP SHA-256 | `8b969d7f15bef33032c5b51d630ef75b9ac4385d7b10ff20df0e1568e0d20954` |

Машинные результаты независимого чтения blobs/архивов: `review-r1-followup-54-source-verification.json`.

## Source/package review

Новый tarball прочитан из frozen Git blob; SHA-256 совпадает с независимо переданным значением. Его SHA-512 точно равен SRI product lock. Manifest, public entries, types и package metadata согласованы с `.54`. В продукте `tests/library-contract.ts:5` сохраняет exact literal assertion и теперь ожидает `.54`; R1-F2 исправлен в коде, но не закрыт до актуального consumer build.

Архивы `.52` и `.53` сохранены без изменения. В `.54` те же 176 package files. CSS побайтно равен `.53`; среди 49 runtime modules изменён только `dist/modules/components.js`, и его bytes равны точному изменению frozen `src/modules/components.js` внутри прежнего build wrapper. Core entry меняет только version literal, остальные public entries неизменны. Остальные source-owned packaged файлы сопоставлены с frozen source. Нет product runtime/CSS/маршрутной правки и private override.

Plan diff независимо проверен: revision/package/archive binding и два описательных reason, в которых теперь честно названа внутренняя JS-коррекция keyboard reveal. Checks, profiles, applicability flags, evidence requirements и release gates сохранены. Здесь нет сокращения scope ради PASS.

## R1-F3: проверка выбранной коррекции

`libraries/iquipage/src/modules/components.js:386–391` добавляет `tab.scrollIntoView({block:'nearest',inline:'nearest'})` строго внутри прежней ветки `active && focus`, после существующего `tab.focus()`. Эта ветка используется уже существующей Arrow/Home/End активацией. Pointer и mount paths не получают нового reveal; создание/отправка `iq-change`, ARIA states, roving tabIndex, panel visibility, disabled filtering и public API остаются прежними.

Выбор соответствует собственному наблюдению R1 на `.53`: после последовательного перехода `materials → discussion` браузер оставил видимым лишь начало названия, хотя End раскрывал его целиком. Дополнительное место для внешнего focus само по себе не заставило partially visible tab раскрыться. Общий native nearest reveal адресует этот механизм с небольшой правкой; менять модель фокуса, надписи или product composition не требуется.

Существенный побочный риск — прокрутка внешних ancestors. Его нельзя закрыть одним фактом вызова native API. Новый runner записывает context before и полную geometry after для каждого intent, поэтому failing `/next` больше не теряется в evidence. Контроль добавлен к существующей матрице, без новых поверхностей или ослабления focus criteria.

### Context guard и natural clamp

`tests/tabs-geometry-browser.mjs:41–60` записывает window scroll и scrollable/hidden ancestors, включая document.scrollingElement: их viewport, scroll position/range и scroll-padding. `validContext()` сопоставляет ancestors до/после и проверяет каждую ось, где вся полоса уже помещалась в viewing area до действия. При таком условии keyboard reveal не должен перемещать внешний контейнер.

Изменение панели может укоротить содержимое, поэтому ожидаемая позиция сравнивается с `min(previousPosition, currentMaxRange)`, а не безусловно со старой координатой. Это разрешает естественный clamp до нового конца диапазона; произвольный прыжок внутри оставшегося диапазона не разрешён. Если полоса до действия была за пределами viewing area, условие не требует невозможной неподвижности — фокус должен получить необходимую видимость. Полная raw geometry позволяет рецензенту различить эти случаи, а не считать неприменившийся guard автоматическим доказательством.

Guard применяется только к keyboard intents, поскольку новая runtime ветка keyboard-only. Event delta по stable ownerId сохраняется для всех pointer/keyboard intents; новое измерение записывается до assertions. Допуск 0.51px соответствует уже используемой границе fractional layout; 4px clipping из `.52/.53` им не скрывается.

На этапе source review этот guard признан соразмерным риску. Его фактическое применение, изменения внешних координат и clamp cases независимо проверены ниже; общий PASS без чтения raw не использован как закрытие риска.

## Проверочная зависимость NT05

Root явно включил отдельно одобренный test-only prerequisite PR78 `2424d472`. R1 проверил интеграционную границу: все восемь NT05 файлов (test и семь файлов review packet) побайтно равны этому checkpoint. По сравнению с DS checkpoint `078faae9` merge не меняет library, DS archive, product dependency/lock/type contract, tabs runner/fixtures, product UI/web или workflows. Этот follow-up не выдаёт чужое R2 prerequisite за собственную повторную проверку всего NT05; его семантика остаётся в отдельном review packet.

## Native evidence — собственная проверка R1

Прочитаны `candidate2-browser-11734645359/browser/results.json`, ZIP и `candidate2-browser-job.log`. R1 самостоятельно вычислил SHA-256 ZIP, сверил с ZIP bytes все 80 извлечённых файлов, включая **78 PNG** и два results.json (native/build). Все 14 записанных source SHA-256, actual CI merge tree, package SHA и plan SHA сопоставлены с frozen `8f8d2181`. Это текущий native run: `buildOnly: false`, `status: PASS`, `browserChecks: PASS`; отдельный build-only документ не принят за browser evidence.

Собственные вычисления сохранены в `review-r1-followup-54-native-verification.json`; воспроизводящий read-only script — `review-r1-verify-native-54.py`. Это повторное чтение имеющихся raw records, не новый browser run. Ошибок независимой проверки — 0.

| Проверка | Наблюдение R1 |
|---|---|
| Matrix | Те же 16 profiles: 5 minimal, 5 actual Task/Board, 5 Wiki, 1 nested Task; порядок profiles и всех intents совпадает с baseline3 |
| Geometry | 57 named captures + 177 intent records = 234 полных geometry rows; во всех `scrollHeight === clientHeight`, `scrollTop === maxScrollTop === 0` |
| Intent / state | 41 pointer и 136 keyboard; каждый даёт ровно одно событие своего owner со значением target; одна selected вкладка, ожидаемая panel visibility и roving tabIndex; disabled не выбран |
| Focus | 178 focused rows (136 intents + 42 captures): target focused/focus-visible, solid outline ≥2px, все четыре края помещаются; исключение для oversized label ни разу не применилось |
| Label / underline | Во всех rows подпись помещается в кнопку; selected underline solid 2px и совпадает с ink; шрифт, line-height, текст и размеры кнопок равны matching baseline captures |
| Layout change | Все 57 высот полосы ровно +8px. Все 36 initial/Home сравнений дают +4px относительного left inset; обычный rect 45.5→53.5px, text200 65→73px |
| Product effects | Во всех Board profiles возврат к двум карточкам без write attempts. Wiki: только одна намеренная synthetic-conflict-no-write попытка save; текст черновика сохраняется. Nested: retained connected/open parent с taskId `task-1` |
| Runtime / adapters | pageErrors, externalRequests, unsupported operations — пустые |

Конкретный отказ `.53` воспроизведён в той же последовательности current `.54`: `desktop-light-minimal`, intent index 14, long `ArrowRight → discussion` после materials. Теперь `scrollLeft = 475`, кнопка «Проверка и обсуждение» имеет left/right `179/340`, полный focus left/right `175/344` внутри viewport `24/344`; top/bottom focus `178.5/232` внутри `178.5/232.5`. Не пришлось менять gate или ссылаться только на успешный End. Selected, focus-visible и eventDelta=1 принадлежат этому же intent.

### Внешняя прокрутка — проверено по raw

Guard действительно применился **298 раз по X и 268 раз по Y** на 136 keyboard intents и их ancestors. В каждом actual Task, Wiki и nested profile применились обе оси для всех записанных ancestors. 30 неприменившихся проверок Y относятся только к minimal short: полоса физически видна, но лежит выше optimal viewing area с `HTML scroll-padding-top: 96px`. Эти случаи не выданы за сработавший guard.

R1 дополнительно сравнил фактические позиции ancestors/window независимо от условного guard: **перемещений нет во всех keyboard intents**, и отдельное чтение всех 41 pointer intents также показало 0 перемещений. Ненулевой Wiki text200 `MAIN.scrollTop = 15` сохраняется при изменении диапазона 585↔421. **Natural clamp ни разу не потребовался**, поэтому его правильность в исходнике не объявляется фактически пройденной веткой. Применённость и нулевые дельты достаточны для наблюдаемого риска текущих accepted compositions; они не являются универсальной гарантией для всех возможных будущих consumers.

## Визуальная проверка и разногласия перспектив

Лично просмотрены **35 current after PNG** в исходном разрешении, включая full Task и Work во всех пяти profiles, full Wiki во всех пяти, nested readonly Task, focused strips light/dark/narrow/text200, длинные подписи и возврат Board. Просмотрены соответствующие baseline кадры и сохранённый `.53` failure. Список просмотренных current файлов с SHA-256 — `review-r1-followup-54-visual-manifest.json`. Остальные PNG имеются в artifact, но этот отчёт не утверждает, что каждый из 78 был лично просмотрен R1.

- **Keyboard user:** в baseline фокус обрывался у краёв, а `.53` терял конец выбранной длинной подписи при последовательной стрелке. В `.54` контур замкнут, glyph внутри рамки и выбранная подпись раскрыта; current intent data подтверждает это и для шага, который не имел собственного `.53` crop.
- **Everyday Task user:** порядок и названия разделов, full title, свойства, Work-содержимое и close/return сохраняются. На 1280×720 добавленные 8px делают заголовок «Описание» у нижнего края менее видимым; само тело описания и в baseline не помещалось. Это конкретная цена плотности, предусмотренная контрактом, а не доказательство улучшения всего Task. Новой поломки вкладок/панелей или оснований расширять эту правку на состав свойств/footer не найдено.
- **Visual designer:** выбранность по-прежнему читается по ink и 2px underline в обеих темах. +4px отступ заметен относительно соседней оси, однако даёт рамке нужное место без сжатия текста, изменения gap между подписями или новой фиксированной высоты. В узких Task заголовок переносится прежним образом; на Wiki конфликт, черновик и сравнение различимы. В text200 прежние сокращённые названия некоторых свойств остаются baseline-состоянием.
- **DS maintainer:** изменение остаётся общей геометрией плюс один existing keyboard reveal, API и product runtime не меняются. Immutable `.54` поставка даёт consumer точный проверяемый результат; overwrite `.53`, специальные product overrides и новая модель табов не понадобились.
- **QA:** actual before/after и raw показывают конкретный исходный дефект и его исправление. Synthetic Work-панель не выдаётся за выполненную agent-задачу, synthetic conflict — за backend/persistence проверку, root-font 200% — за browser zoom. Exact full TypeScript build остаётся отдельной незакрытой проверкой.

Для Board return дополнительно самостоятельно сопоставлены bytes всех пяти before/after PNG: они идентичны. Это подтверждает сохранённое изображение после закрытия Task в зафиксированных профилях, без заявления о каждом возможном состоянии доски.

### Wiki text200: граница screenshot comparison

В current raw `wiki-initial` измерен при top `842.1875`, bottom `915.1875`, `MAIN.scrollTop = 0`. Уже `contextBefore` первого pointer содержит top `827.1875` и `MAIN.scrollTop = 15`; сам pointer и все следующие intents оставляют координаты неизменными. Между этими измерениями frozen runner делает `locator.screenshot()`, который раскрывает элемент. Следовательно, смещение происходит при capture, до пользовательского intent.

В baseline initial top также `842.1875`, а End/Home top `836.1875`; ancestors тогда не записывались. **Полные text200 Wiki before/after кадры не pixel-aligned.** Они использованы для оценки окружения и читаемости, а +8/+4 доказаны layout-relative geometry отдельно. Здесь не приписан keyboard runtime лишний сдвиг и не скрыта методическая граница capture.

## Независимое согласование с R2

Собственный source/native вывод R1 и просмотр 35 after кадров завершены до чтения `review-r2.md`. После этого R1 прочитал original R2 целиком и сопоставил результаты: существенных разногласий по identity, nearest reveal, всем intents, внешним scroll deltas, NT05 boundary, цене +8/+4, Task fold и Wiki screenshot nuance нет. R2 самостоятельно получил ту же native позицию; его size-gate вычисления принадлежат его отчёту и не выдаются здесь за собственный запуск R1. Обе стороны сохраняют F2 pending до current full consumer build.

## Findings — после current native artifacts

| Finding | `.53` evidence | `.54` source | Закрытие |
|---|---|---|---|
| R1-F1, кратность intent | Исправлен и подтверждён 177 baseline3 событиями; промежуточные `.53` events также были по одному | Прямые owner-specific event assertions сохранены; added raw не меняет count gate | **Closed:** все 177 current native intents дают ровно одно соответствующее событие |
| R1-F2, stale consumer literal | TS2322 и source mismatch `.52`/`.53` | Exact assertion обновлён до `.54`, согласован с package types | **Pending current full build** |
| R1-F3, clipped selected label/focus | Просмотренный native `.53` failure PNG + recorded sequential intent | Добавлен keyboard nearest reveal; raw/context guard сохранены/усилены | **Closed:** current full native matrix, явный previously failing sequential step, реальные after PNG и 0 outer scroll moves |

Новых подтверждённых source/package/native/visual findings на этом freeze не обнаружено. **Общий final verdict пока pending current full CI `38221220620` и закрытие R1-F2 на реальном consumer TypeScript build.** Проверка не требует повторять известные unavailable local native/TS7/JDK/PG пути. Release-only Safari/VoiceOver/browser zoom, production/bootstrap/auth/persistence, human validation и выполнение agent work остаются вне данного evidence. Этот review не даёт разрешения на merge/deploy/npm publish.
