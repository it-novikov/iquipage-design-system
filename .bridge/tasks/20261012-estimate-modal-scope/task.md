---
bridge: 1
id: 20261012-estimate-modal-scope
title: "Оценка: фокус, Escape и границы всплывающего редактора"
status: active
risk: standard
owner: it-novikov
branch: fix/estimate-modal-scope
base: 2c757009d7bf3e3d0fc3648241d499d980ebdbb9
created: 2026-10-12
updated: 2026-10-12T10:30:00Z
links:
---

# Оценка: фокус, Escape и границы всплывающего редактора

## Цель

Человек открывает оценку задачи, вводит число и может отменить ввод, оставаясь в той же задаче. В настоящем Chromium исходный редактор открывается вне modal, не получает фокус, а Escape закрывает Task и оставляет popup поверх Board. В том же редакторе часть единиц, подсказки и кнопки сохранения выходит за доступную ширину. Исправить владение всплывающей поверхностью и её собственную компоновку, сохранив значения, права и способ сохранения.

## Рамки

- **Входит:** существующий продуктовый `ui/src/popover.js` (modal ownership и cleanup), фокус без прокрутки в `estimate.js`, grid/flex-композиция оценки; общий рецепт правильной интеграции в DS docs; адресная native regression и review.
- **Не входит:** новый generic DS API/контрол, vendor update, новая модель оценки, backend, Task first-screen overlay, общий redesign Planning или глобального segmented/popup CSS.
- **Ограничения:** база main `2c757009…`, DS54. Пользователь разрешил реализацию, push/PR и снял численные квоты. Merge/deploy/npm publish не выполняются. Данные синтетические; известные локальные ограничения Chromium/TS7/JDK25/PG18 повторно не проверяются.

## Приёмка

- [ ] A1. В Task оценка получает фокус внутри modal; Escape закрывает только её и возвращает фокус на trigger. Изменение ввода до отмены не вызывает запись.
- [ ] A2. Закрытие/удаление владельца или anchor не оставляет orphan popup/listeners. Вне modal прежние редактор и меню Planning сохраняют доступность.
- [ ] A3. Единицы, подсказка и команды доступны без горизонтальной прокрутки popup в desktop/narrow/dark и при увеличенном тексте; реальные кадры и geometry сохранены.
- [ ] A4. Независимое review и применимые CI относятся к точному кандидату. Backend save, human/release acceptance не присваиваются fixture.

## Передача

- **Состояние:** Причина и варианты определены по immutable native failure; реализация начата.
- **Сейчас:** S2 — product fix и адресная regression.
- **Дальше:** Frozen source review → draft PR → actual CI.
- **Незакоммичено:** Карточка, реализация и новый native harness.
- **Ловушки:** Attempt2 stack217:54 — ожидание закрытия после Escape, не открытия216; ранняя интерпретация отозвана отдельным addendum. Не менять assertions/force/retry ради PASS.

## План

### S1. Подтвердить проблему и источник [done]

- **Что:** Сопоставить исходники main и frozen capture.
- **Как:** Artifact11739838266,13 passive events каждой пары, source hashes и реальные after-click/failure PNG.
- **Зачем:** Отличить modal ownership от show/scroll race и геометрии формы.
- **Приёмка:**
  - [x] Popup открыт под BODY вне dialog; focus остаётся на trigger; после Escape Task исчезает, popup остаётся. Scroll/removal events отсутствуют.
- **Покрывает:** A1, A2
- **Итог:** Failure есть в baseline и VT1; popup/estimate байты равны текущему main. Независимый investigator подтвердил cause boundary; after-fix ещё NOT_RUN.

### S2. Исправить владение и компоновку [active]

- **Что:** Host под owning native dialog root с body fallback; cleanup владельца/anchor; форма сжимаемых колонок и переносимых рядов.
- **Как:** Существующий helper и продуктовый CSS, public DS54. Popup form вне родительской Task form. Native tests вызывают actual Task и helpers с read adapter.
- **Зачем:** Пользователь остаётся в контексте и видит весь редактор.
- **Приёмка:**
  - [ ] Syntax, boundary, existing estimate model checks и native regression готовы; исходные oracles сохранены.
- **Покрывает:** A1, A2, A3

### S3. Независимая проверка и публикация [todo]

- **Что:** Проверить и сохранить exact candidate.
- **Как:** Read-only review, draft PR, Chromium и применимые общие gates; raw logs/PNGs/source hashes.
- **Зачем:** Source fix не подменяет результат взаимодействия.
- **Приёмка:**
  - [ ] Точные checks/findings/остаток сохранены; нет fake PASS.
- **Покрывает:** A1, A2, A3, A4

## Решения

- **D1.** Ошибка интеграции приложения: DS dialog корректно использует showModal. Body sibling вне modal focus scope. Popup принадлежит owning dialog, как существующие DS fields; собственная форма не вкладывается в Task form.
- **D2.** Одного preventScroll недостаточно для inertness. Глобальный перехват Escape не возвращает фокус вводу и вмешивается в другие overlays. Nested modal для маленького редактора меняет модель взаимодействия без необходимости.
- **D3.** Исправляется существующий общий product helper, сохраняя nonmodal callers. Правило добавляется в DS integration docs; новый универсальный API до исследования других consumers не нужен. Это application-integration, не доказанный ds-defect.
- **D4.** Геометрия относится к intrinsic grid/flex размерам формы оценки. Исправить её композицию; не менять общий публичный popup/segmented ради одного продукта.
- **D5.** Исходные FAILED captures сохраняются. Native проверяет focus/Escape/cleanup/геометрию и callback boundaries; реальная запись через backend не симулируется как PASS.

## Вопросы

Нет блокирующих вопросов к владельцу. Полная приёмка сохранения, iOS/VoiceOver — последующий этап.

## Контекст

- [Native failure run38234809826](https://github.com/it-novikov/iquipage-design-system/actions/runs/38234809826), artifact11739838266, ZIP SHA256 `68c9f552716e8b9cc6255f78d93138892b69a6762f26ee8a9ca80ef47939cbef`.
- Actual checkout `e7a4bb9eb1f9ed8878edd00d4128bdc332e6dd8e`, tree `a294b5e551154bc8f57103e5158a72b0e49682dc`, exact head `2f66973538605035bf354ed264ee0c95f2a34ec5`; estimates/popover source equal main.
- Trace не содержит отдельного keydown/cancel; Escape ordering следует из exact runner/stack и конечного DOM. Не переносить старый CI на новый кандидат.
- [HTML modal dialogs and inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#modal-dialogs-and-inert-subtrees).
