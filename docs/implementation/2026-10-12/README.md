---
schema: sprintique-implementation-checkpoint/1
date: 2026-10-12
kind: evidence-and-handoff
status: accepted-scope-verified
author: GPT-6 Astra (AI agent)
base: f5f941afa4e9be8a709e6de67a92bacf5a9397ca
production_touched: false
merged_to_main: false
---

# Sprintique и IQUIPAGE: реализация плана и проверенные результаты

## 1. Главное

**Количественный лимит PR снят.** Работа продолжается отдельными, обозримыми изменениями с явными зависимостями. Число открытых PR, глубина стека и количество задач в `review` больше не служат причиной остановки. Требования к качеству, независимому ревью и полномочиям на слияние сохраняются. Решение владельца действует в этой работе уже сейчас; его репозиторная формализация находится в [PR74](https://github.com/it-novikov/iquipage-design-system/pull/74).

По принятому problem-first плану сохранены исправление контекста Task поверх Maps, компоновка панели массовых действий Planning и общая правка вкладок DS. **Все пять текущих веток PR74–78 прошли полный CI.** Геометрия Planning и вкладок подтверждена настоящим Chromium на синтетических данных. Реальный consumer typecheck новой `.54` прошёл; оба независимых ревьюера завершили окончательное сопоставление и дали **approve** принятому объёму исправления. F1/F2/F3 закрыты.

Этот документ дополняет [полное исследование V3](https://github.com/it-novikov/iquipage-design-system/blob/docs/problem-first-product-workflow/products/sprintique/docs/experience/research/sprintique_problem_first_research_plan_v3.md), сохраняет первичные результаты и даёт следующему агенту точку продолжения. Он не объявляет весь UX Sprintique переработанным или продукт готовым к релизу.

## 2. Состояние отдельных PR

| PR | Пользовательский или инженерный результат | Фактически подтверждено | Что остаётся |
| --- | --- | --- | --- |
| [74 — исследование, skills и workflow](https://github.com/it-novikov/iquipage-design-system/pull/74) | Problem-first правила и два раунда независимых разборов исследования; сняты численные ограничения PR | Независимое review изменения правил; полный CI текущего head: 567/567 product и 567/567 detached | Рассмотрение и слияние владельцем |
| [75 — Task поверх Maps](https://github.com/it-novikov/iquipage-design-system/pull/75) | Открытие и закрытие задачи сохраняет карту, контекст и историю; обработаны поздние ответы и восстановление mount | 97 Node checks; native: четыре профиля и пять recovery-сценариев; full CI: 609/609 product и 609/609 detached | Рассмотрение и слияние владельцем; отдельная предрелизная приёмка |
| [76 — панель действий Planning](https://github.com/it-novikov/iquipage-design-system/pull/76) | Выбранные строки и команды занимают разные области; высота панели учитывает перенос команд | Реальный before/after и независимое R3; повторный browser на составной ветке PASS; review композиции approve; full CI 567/567 product + 567/567 detached, image PASS | Рассмотрение и слияние владельцем |
| [77 — вкладки общей DS](https://github.com/it-novikov/iquipage-design-system/pull/77) | Нет случайной вертикальной прокрутки, фокус помещается в полосе; длинная выбранная вкладка раскрывается при работе стрелками | Exact `.54`, 478 library tests, native 16 сценариев / 177 действий; full CI 567/567 product + 567/567 detached, consumer TypeScript build и image PASS; финальные R1/R2 approve | Рассмотрение и слияние владельцем; отдельная предрелизная приёмка |
| [78 — точный тест уведомлений](https://github.com/it-novikov/iquipage-design-system/pull/78) | Проверка пагинации различает реальную потерю уведомлений и некорректное сравнение строк времени | Независимые R1/R2; actual serializer counterexample в обеих suites; full CI 567/567 product + 567/567 detached, image PASS | Рассмотрение и слияние владельцем раньше зависимых веток |

Все PR открыты как промежуточные draft. Слияние в `main`, выкладка и публичный npm publish не выполнялись.

### Проверочная зависимость

PR76 и PR77 включают один и тот же точный checkpoint PR78: `2424d4724ec411c84b54b85634dbf54228b0ebd8`. После отдельного рассмотрения PR78 его следует сливать раньше зависимых PR. В самих ветках сохранены оба родителя merge; код Planning не попал в DS-ветку, а новый DS-пакет не попал в Planning.

Для Planning независимый ревьюер сравнил весь Git tree: восемь путей NT05 и его review packet равны второму родителю; всё остальное равно первому родителю, кроме трёх файлов документации о самой интеграции. Потерянных и посторонних изменений не найдено. [Полный оригинал review](reviews/planning-integration-independent.md).

## 3. Вкладки: проблема, причина, варианты и выбранное решение

### Что мешало человеку

В Task узкая полоса переключения «Задача / Работа агента» могла прокручиваться ещё и вертикально на один пиксель. Такая область не несёт пользователю дополнительной информации, выглядит нестабильно и обрезает внешнюю рамку клавиатурного фокуса. Простое скрытие overflow оставило бы человека без полной подсказки о текущем фокусе.

На exact `.52` один и тот же дефект воспроизведён в минимальном публичном `ui.tabs` без стилей Sprintique и в настоящих Task/Wiki. Это локализует причину в общей поставке DS. Связка нижнего border списка с отрицательным нижним margin кнопок выводила их border box в scrollable overflow; внешний focus требовал дополнительного пространства.

### Что сравнили

| Вариант | Польза | Цена и ограничение | Решение |
| --- | --- | --- | --- |
| Только скрыть вертикальный overflow | Прячет случайную прокрутку | Не устраняет обрезанный focus; маскирует причину | Отклонён |
| Устранить отрицательную геометрию и выделить место под существующий внешний focus | Сохраняет принятый focus, underline и типографику; общий результат для потребителей | Полоса становится на 8 CSS px выше | Принят и проверен реальным renderer |
| Перенести focus внутрь кнопки | Может сохранить прежнюю вертикальную плотность | Требует другого focus-рецепта и проверки расстояния до крайних glyph; меняет визуальную модель | Рассмотрен по source/layout, отдельная реализация не создавалась |
| Патч только внутри Task | Быстро меняет один экран | Wiki и новые потребители сохраняют общий дефект; возникает private override | Отклонён |

Первый CSS-кандидат `.53` устранил лишнюю высоту прокрутки, но **провалил реальную проверку**: последовательный `ArrowRight` оставлял длинную выбранную вкладку частично за правым краем. Один `End` показывал её полностью, поэтому проверять только крайние состояния было недостаточно. Вторая независимая проблема `.53` — точный consumer type contract всё ещё ожидал версию `.52`, и полная сборка завершилась TS2322. [Исходный R1 с verdict changes-requested](reviews/tabs-r1-rejected-53.md).

В `.54` после существующего клавиатурного `focus()` добавлено явное раскрытие ближайшего края через `scrollIntoView({block:'nearest',inline:'nearest'})`. Существующие API, выбор панели и события сохранены. Literal consumer contract обновлён до точной `.54`. CSS совпадает с уже измеренным исправлением `.53`; предыдущие архивы не переписаны.

### Что измерено на `.54`

| Наблюдение | `.52` | `.54` |
| --- | --- | --- |
| Обычная полоса: `clientHeight / scrollHeight` | 45 / 46 | 54 / 54 |
| При root text 200% | 64 / 65 | 73 / 73 |
| Непреднамеренный вертикальный диапазон | 1 px | 0 px |
| Высота bounding box в 57 сопоставимых captures | Исходная | Ровно +8 px |
| Размер кнопок, метрики шрифта и underline | Исходные | Сохранены; содержимое смещено внутрь на 4 px |
| Последовательный доступ к длинной выбранной вкладке | `.53` показал неполную видимость | Label и полный focus помещаются |
| События переключения | Baseline: 177 действий, по одному событию | 177 действий, по одному правильному событию |

Все 16 сценариев завершились PASS: пять профилей минимального consumer, пять настоящего Board/Task, пять Wiki и один nested Task. Темы light/dark, ширины 1280/1440/390/320/768 и увеличение root font-size до 200% заданы в [точном acceptance plan](native/tabs/candidate/acceptance-plan.json). Это именно увеличение текста, не реальный browser zoom.

Проверены 57 именованных captures и geometry после каждого из 177 действий, включая 136 клавиатурных переходов. Один screenshot не подменяет проверку промежуточных состояний. В записанных before/after каждого действия внешние scroll-контейнеры и окно не смещались. Page errors и неожиданные внешние запросы отсутствовали.

### Визуальная цена и границы результата

Дополнительные 8 px нужны для полной внешней рамки focus. В desktop Task 1280×720 это сдвигает заголовок «Описание», который и раньше едва появлялся над footer, ниже первого экрана. Содержимое остаётся доступным в прежней области прокрутки. Это явный компромисс плотности; улучшение общей компоновки Task данной правкой не доказано. При увеличенном тексте исходная плотность свойств и сокращённые labels тоже остаются отдельной задачей.

Полные Wiki text200 before/after кадры нельзя считать выровненным pixel-diff. `locator.screenshot()` до первого пользовательского intent раскрывает полосу и прокручивает `MAIN` на 15 px в candidate; baseline также имел подготовительное раскрытие другой величины. Это обнаружено в исходных данных. Вывод +8/+4 сделан по относительным layout-координатам. Отсутствие внешних скачков относится к записанным действиям, а не ко всем операциям подготовки screenshots.

В узком Wiki остаются ранее существовавшие проблемы шапки и навигации. Они не переименованы в результат ремонта tabs. Synthetic fixtures не доказывают удобство для реальных пользователей, сохранение через backend, работу VoiceOver или отсутствие любых лагов во всём продукте.

### Сохранённые реальные кадры

Короткая полоса публичного `ui.tabs`, клавиатурный Home: полный контур фокуса и его место внутри области прокрутки.

| До, точная `.52` | После, точная `.54` |
| --- | --- |
| ![Короткие вкладки до исправления](native/tabs/evidence/visual/before/desktop-light-minimal-short-Home.png) | ![Короткие вкладки после исправления](native/tabs/evidence/visual/after/desktop-light-minimal-short-Home.png) |

Настоящий Task 1280×720 показывает и улучшение полосы, и цену высоты у нижней границы первого экрана. Изображения сохранены без кадрирования и изменения пикселей.

| До, Task `.52` | После, Task `.54` |
| --- | --- |
| ![Task до исправления вкладок](native/tabs/evidence/visual/before/desktop-light-board-task-panel.png) | ![Task после исправления вкладок](native/tabs/evidence/visual/after/desktop-light-board-task-panel.png) |

[Авторский разбор 12 пар](native/tabs/evidence/author-note.md) и [его исходный manifest](native/tabs/evidence/manifest.json) сохранены побайтово. Их пометки `pending` относятся к моменту заморозки авторского пакета; последующий актуальный статус задают этот документ, [полные CI evidence](ci/final-runs.json) и независимые addenda. Отчёты [R1 source/native `.54`](reviews/tabs-r1-native-54.md) и [R2 source/native `.54`](reviews/tabs-r2-native-54.md) тоже сохранены как неизменяемые исторические checkpoint.

## 4. Planning: видны и выбранные задачи, и команды

Исходная панель массовых действий была фиксирована относительно viewport и могла оказаться поверх выбранной строки. Дополнительное место в конце списка не защищало строку в середине прокрутки.

Исправление выделяет панели собственную область в нормальном потоке. Рабочая область над ней остаётся единственным scrollport; панель получает фактическую высоту, включая перенос команд на узком экране. Runtime-дельта — десять строк Planning CSS. Действия, выбор, подписи и операции перемещения не переписаны.

Реальный baseline показывает перекрытие. Исправленный вариант проверен на desktop, compact и narrow: видимое пересечение с учётом overflow clip строго равно нулю. Дополнительно проверены попадание в центр и нижний видимый край строки, меню/Escape, клавиатурный выбор, callback возврата и drag-cancel. Один выбор команды создаёт один intent. Это проверка frontend-компоновки; она не закрывает отдельный сценарий потери ответа при реальном переносе задачи.

[Исходные JSON и шесть before/after PNG](https://github.com/it-novikov/iquipage-design-system/blob/fix/planning-selection-space/.bridge/tasks/20261012-planning-selection-space/evidence/native-38211016913/README.md) и [независимое R3](https://github.com/it-novikov/iquipage-design-system/blob/fix/planning-selection-space/.bridge/tasks/20261012-planning-selection-space/reviews/evidence/independent-R3.md) уже сохранены в PR76. Повторный browser и полный gate на составном head прошли: 478 library, 567 product и 567 detached tests; skipped/cancelled/fail — 0. Actual checkout `fc3503da…` имеет тот же полный tree, что и проверяемый head. [Certificate](ci/planning/verification.json), точные counts и checkout evidence сохранены в [общем индексе CI](ci/final-runs.json).

## 5. Почему потребовался отдельный тест уведомлений

Предыдущий полный Planning run завершился 566 PASS / 1 FAIL в NT05. Сервер уже сортирует по timestamp и ID, а тест сравнивал строковые представления `createdAt`. Старый лог не напечатал конкретную failing pair; мы не утверждаем, что она известна.

PR78 использует отдельного синтетического получателя и управляемые timestamp/ID. Полный ожидаемый порядок проверяется на обеих страницах 20/5, включая микросекунды и группу равных времён на границе cursor. Сохранены read-by-id, unread, чужой ID, неверный cursor и запреты runtime-роли БД. Read-all проверяет включающую границу и запись ровно на 1 µs позже.

Независимое R1 нашло два слабых места первого варианта теста: tie group должна иметь ненулевые микросекунды, а cutoff item должен оставаться непрочитанным до read-all. Оба исправлены, R2 дал scoped code/test approve. [Оригиналы R1/R2](https://github.com/it-novikov/iquipage-design-system/tree/test/notification-time-order/.bridge/tasks/20261012-notification-time-order/reviews/evidence).

Production SQL, serializer, permissions и runtime не меняются. Прежний строковый predicate выводится диагностикой из фактического API-ответа; постоянного требования к нестабильному текстовому формату serializer нет.

**Контрпример теперь подтверждён настоящим Kotlin/PostgreSQL API в обеих suites PR78**, а затем повторно в составных PR76 и PR77. Первые времена ответа:

```json
{
  "legacyStringOrder": false,
  "firstTimes": [
    "2000-01-01T00:00:00.600002Z",
    "2000-01-01T00:00:00.600001Z",
    "2000-01-01T00:00:00.600Z"
  ]
}
```

Это правильное убывание времени, которое прежнее сравнение строк ошибочно отклоняет из-за разной длины дробной части. Exact-ID oracle для обеих страниц и read-boundary проходит. Полный PR78 run завершил 567/567 product и 567/567 detached tests, без fail/skip/cancel/todo; image build тоже PASS. [Certificate](ci/notification/verification.json) и [точные excerpts с номерами строк, SHA256 и исходными логами](ci/final-runs.json) сохранены в Git. Это подтверждает диагностированный класс ошибки; конкретная историческая failing pair прежнего run по-прежнему неизвестна.

## 6. Разбор с разных точек зрения

Это экспертные проверки разными агентами GPT-6 Astra, не интервью с пользователями.

| Позиция | Возражение или риск | Как разрешено |
| --- | --- | --- |
| Человек, который быстро читает Task | Любое увеличение полосы уменьшает первый экран | Цена +8 px измерена и названа; общая плотность Task не объявлена улучшенной и остаётся отдельной работой |
| Пользователь клавиатуры | Вкладка должна быть видима после каждого перехода, а не только Home/End | Реальный отказ `.53` сохранён; `.54` раскрывает выбранный tab, geometry пишется после каждого intent |
| Визуальный дизайнер | Focus, underline и выбранное состояние должны быть различимы в обеих темах | Сохранены типографика и underline; выбран общий внешний focus с измеренным пространством внутри scrollport; просмотрены actual frames |
| Инженер DS | Product override устранит симптом только у одного потребителя | Исправлена общая поставка, проверены exact package, public types и оба production consumers — Task и Wiki |
| Инженер надёжности | Native reveal может сдвинуть внешний экран; тест может пропустить промежуточный дефект | Добавлены raw before/after context каждого действия; независимо проверены также данные вне условных assertions |
| Инженер тестирования | Зелёный повтор flaky NT05 не доказывает исправление причины | Отдельный deterministic test с точными ID/µs/cursor/read-boundary и реальной API-диагностикой; backend gate сохранён |
| Руководитель работ | Численные лимиты мешают сохранять параллельные результаты | Квоты убраны, зависимости и право владельца на merge/deploy сохранены; evidence оформляется отдельной документационной веткой |

Существенные возражения первого review привели к исправлениям, а не к ослаблению проверки. Оригинал неуспешного `.53` и последующие отчёты сохраняются отдельно. R1 и R2 независимо проверили исходники, точный пакет, native raw и реальные кадры, затем явно сопоставили выводы: существенных разногласий нет. Закрытие F2 подтверждается реальным full consumer build.

**Финальные независимые addenda:** [R1 — approve](reviews/review-r1-final-54.md), SHA256 `b5edee586a493ac7bfa8aaf51e4b88d0e5c53e4c0cf3b7a777712dafc65ba984`; [R2 — approve](reviews/review-r2-final-54.md), SHA256 `bf89bba5e018c2ecf88feb3e0e901c20c78db86fd3a2b3f87e729a99e5599480`. Каждый отдельно сверил все 1 224 source inputs с frozen Git blobs и восстановил набор путей из существующего selector. Missing/extra/mismatch — 0. Source/native отчёты и окончательные addenda сохранены побайтово; пути внутри оригиналов отражают исходную рабочую среду. Перенесённые logs/inventories доступны через [индекс CI](ci/final-runs.json), кадры и native raw — через [visual manifest](native/tabs/evidence/manifest.json).

## 7. Источники, fingerprints и воспроизведение

| Объект | Проверенная идентичность / источник |
| --- | --- |
| PR74 head | `4654517bdb94a629c19d514a194495348f08e25e`; [full run 38216365813](https://github.com/it-novikov/iquipage-design-system/actions/runs/38216365813) |
| PR75 head | `6bd396f01c8f1b53b20925deed41024018c23471`; [full run 38213223971](https://github.com/it-novikov/iquipage-design-system/actions/runs/38213223971) |
| PR76 head | `549dde23302197124d42f3793733d226a41152ff`, tree `de8ecc05feb105f3073b54ddb090bbba61c9e42e`; [full run 38220328945](https://github.com/it-novikov/iquipage-design-system/actions/runs/38220328945) |
| PR77 head | `8f8d218168074bd4c7c9e1e29dfbe783a27998dd`, tree `a7bf8ed72f07d975a6837e8f1428382785893833`; [native run 38221220733](https://github.com/it-novikov/iquipage-design-system/actions/runs/38221220733), [full run 38221220620](https://github.com/it-novikov/iquipage-design-system/actions/runs/38221220620) |
| Native `.54` checkout | `f53af728201b7a4ce2a128c6de7228143d2d50b4`, **тот же полный tree**, что у PR77 head |
| PR78 head | `2424d4724ec411c84b54b85634dbf54228b0ebd8`; test checkpoint `fedf04cb8e4c443b2e4567fb473a1f600868f2bc`; [full run 38219290377](https://github.com/it-novikov/iquipage-design-system/actions/runs/38219290377) |
| DS `.54` archive SHA256 | `a726a4536e532fc556f615d0b1a9cda1873dc111e6090710329b9ec1b8204457` |
| Final acceptance-plan SHA256 | `a0165e153cb976c9da17332b1b79baaeb9b10da2e375c9aa290c620bb3889872` |
| Native `.54` original ZIP SHA256 | `8b969d7f15bef33032c5b51d630ef75b9ac4385d7b10ff20df0e1568e0d20954` |
| Baseline `.52` original ZIP SHA256 | `3fd72f6feaf11426f37196d4448dd1fe4d5be1f4b77acd2fb414a4128ff6ac2d` |

[Preservation manifest](preservation-manifest.json) связывает сохранённые файлы с исходными SHA256. Native JSON сохранён полностью, без изменения значений и форматирования, с lossless gzip для уменьшения размера. В manifest есть hashes compressed и исходных bytes. Исходные PNG сохраняются без редактирования.

Пример чтения raw candidate после checkout этой документационной ветки:

```python
import gzip, hashlib, json
from pathlib import Path

root = Path('docs/implementation/2026-10-12')
raw = gzip.decompress((root / 'native/tabs/candidate/results.json.gz').read_bytes())
assert hashlib.sha256(raw).hexdigest() == '44bfdf6a50938f61ca114344d852ca259e4909464ba9c6d1deee2c2072de0cb7'
result = json.loads(raw)
print(result['status'], len(result['profiles']))
```

Certificates PR74/75, исторического отказа PR76 и актуальных PASS PR76/77/78 сохранены в `ci/`. [Индекс завершённых runs](ci/final-runs.json) содержит реальные выводы build/test, line numbers, source hashes, checkout identity и GitHub job steps. Полные product/build/library/detached logs и source inventories последних трёх runs сохранены с lossless gzip. `sourceStable:true` означает только неизменность проверяемого исходника во время run. Успешная печать certificate не подменяет итог его проверок. `fullPlatformReady:false` и `productionTouched:false` сохранены как в исходниках.

Нативный renderer: Chromium `151.0.7922.34`, Playwright `1.62.1`, Node `v24.20.0`, Ubuntu `24.04`. Локальный native Chromium и TypeScript7 не запускались повторно после установленного отказа среды без `/proc`; недоступные локальные JDK25/PG18 проверки выполняет существующий GitHub workflow.

## 8. Передача следующему агенту

1. Продолжать с перечисленных immutable heads; не повторять исходное исследование и baseline без новой причины.
2. Использовать уже завершённые PASS PR76, PR77, PR78 и сохранённые первичные данные. Все восемь certificate checks, product/detached counts, NT05 diagnostic и image steps проверены. Не перезапускать их без конкретной новой причины.
3. Учитывать финальные addenda R1/R2 `.54`: F1/F2/F3 закрыты. Оригиналы source/native review и последующая окончательная приёмка уже сохранены; документация дополняется здесь без изменения проверенных runtime branches ради одной записи.
4. Для дальнейших изменений продолжать problem-first разбор и соразмерную проверку. При реальном отказе выяснить конкретную причину; не повторять запуск ради случайного зелёного результата и не ослаблять assertions.
5. **PF09 уже выполняется** в отдельной ветке `fix/planning-required-dates`: начало/окончание спринта получают существующий `required` contract, необязательный release deadline остаётся очищаемым. Начальный локальный checkpoint: 7/7 существующих related tests, boundaries/styles/syntax PASS; independent review и публикация ещё впереди. Это часть PF09: общий текст календаря «Убрать срок» и более широкий date-field UX не объявлены решёнными. PF10 о различии доставки уведомлений и отвязки Telegram также не требует ожидания общего redesign Workbench.

Полноценный onboarding остаётся в конце плана и требует отдельного явного согласования владельца. Реальные Safari/Firefox/iOS touch/VoiceOver и другие screen reader комбинации проверяются перед релизом, а не при каждой локальной правке. Число открытых PR не блокирует продолжение; merge и deploy требуют отдельного поручения.

Этот документационный PR содержит только evidence и handoff. Его отделение сохраняет уже запущенные проверки кодовых веток и не меняет ни workflow, ни обязательные gates.
