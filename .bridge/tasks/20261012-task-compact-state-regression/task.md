---
bridge: 1
id: 20261012-task-compact-state-regression
title: "Task Compact: точная native проверка состояния и перехода"
status: active
risk: standard
owner: it-novikov
branch: test/task-compact-state-regression
base: 5bd09d647f79f06c7a7c844f91a6914907ed8e8b
created: 2026-10-12
updated: 2026-10-12T13:56:28Z
links:
  - https://github.com/it-novikov/iquipage-design-system/pull/90
  - https://github.com/it-novikov/iquipage-design-system/pull/88
---

# Task Compact: точная native проверка состояния и перехода

## Цель

Человек открывает задачу и сразу различает результат на проверке, вопрос к нему, вопрос без права ответа и незавершённую работу. Единственная команда сводки должна вести к правильному шагу или вопросу, где доступен полный исходный текст. PR90 сокращает композицию, но его зелёный Tabs/Estimate native job использовал `workPlan:null` и не проверял эту сводку. Закрыть конкретный пробел доказательств новым regression на actual Task, не менять выбранный runtime и не объявлять эстетическую гипотезу принятой.

## Рамки

- **Входит:** corrected PR88 runner/fixture с новым Compact plan v3; точные ожидания headline и literal prefix; все пять прежних semantic cases плюс can-answer; два текущих long captures; два companion CI steps; собственная карточка и provenance независимого reconciliation.
- **Не входит:** runtime, DS, CSS, API, permissions, stored data, redesign Compact, новые write paths, merge/deploy/package publish. Task runtime PR88 не переносится поверх PR90.
- **Ограничения:** исходный HEAD `5bd09d647f79f06c7a7c844f91a6914907ed8e8b`, tree `6d4a4e4a66b7a46e6bda4f8378a0975def2aea7c`; точный DS54. Работа test-only. `standard` выбран консервативно: пользовательское поведение не меняется, но неверный gate мог бы скрыть регрессию. Source R1 и независимый native visual R2 нужны для доверия к оракулам и текущему UI. Root ведёт Git index/commit/refs/push/PR, автор их не меняет.

## Приёмка

- [x] A1. Новый план v3 закреплён до реализации и native; v1 и v2 сохранены побайтно с правильной цепочкой digest. Runtime и supply boundary PR90 неизменны.
- [ ] A2. Все пять прежних semantic сценариев сохранены, can-answer добавлен шестым. Проверяются exact heading/title/CTA, отсутствие ложного завершения и decision controls в overview, S1/Q1 target/focus, буквальный prefix и полный исходный result, нулевые writes/errors/off-origin.
- [ ] A3. Длинные desktop1280×900 и narrow390×844 состояния сняты на текущем build с raw rectangles/text ranges/PNG; результат CAPTURED, без выдуманного выигрыша или human/Compact acceptance.
- [ ] A4. Два companion steps используют существующий native setup и `!cancelled()`; Tabs/Estimate сохранены. Scoped local checks, source R1, native R2 и актуальные CI fingerprints записаны отдельно и честно.

## Передача

- **Состояние:** Independent SOURCE_R1 APPROVE_IN_SCOPE; original report, four independent proof outputs, review manifest and frozen author checkpoint/patch preserved. Native NOT_RUN.
- **Сейчас:** S3: record test-only descendant of accepted Compact; main5d integration has identical whole source tree to reviewed base5bd.
- **Дальше:** Publish separate test-only PR against main; run actual six semantic states and two long captures, then independent native R2.
- **Незакоммичено:** Only test fixture/runner/workflow and review/Bridge evidence. Pending no-source-diff merge of main5d records accepted ancestry.
- **Рабочая копия:** 3 файл(ов): .github/workflows/tabs-geometry.yml, products/sprintique/tests/fixtures/task-overview-state/, products/sprintique/tests/task-overview-state-browser.mjs (1 file changed, 17 insertions(+)) · HEAD 5bd09d647
- **Ловушки:** Исторические пять cases включают genuine-complete; can-answer — новый шестой. `.task-work-status` теперь h3, extra status p не существует. Старые размеры Compact82 и PASS88 не являются результатами90. Локальные Chromium/TS7/JDK25/PG18 ограничения известны: native и полный gate локально повторно не запускаются.
- **Проверка:** Root verified all24 author file hashes before claim. Independent R1 verified24 patch hunks,197inputs,12outputs,14sourcehashes,176DS54files;15model tests belong to authored run. No runtime/DS change.
- **Причина:** review — gpt-6-astra-task-compact, 2026-10-12T13:36:43Z, передано gpt-6-astra-root: Source/build готовы независимому R1. Автор останавливает запись и передаёт lease; root ведёт Git/publication/native. Все acceptance кроме A1 остаются pending до свежего native и review.

## План

### S1. Зафиксировать проблему, происхождение и новый контракт [done]

- **Что:** Test-only scope, immutable v1/v2 и новый plan v3 до исполнения.
- **Как:** Сохранить оригинал независимого reconciliation; указать exact PR90 head/tree и исторический PR88; определить шесть semantic и два long случая, literal oracle и expected environment.
- **Зачем:** Не переносить старую приёмку на новую композицию и не ослаблять тесты ради PASS.
- **Приёмка:**
  - [x] Plan v3 hash передан root до изменения runner, старые планы равны immutable PR88.
- **Покрывает:** A1, A2, A3
- **Итог:** Plan v3 SHA256 acd56ea3aef4666275b5691482e6c82880e01a8cbd10f4d70d2bf8d53b093503 зафиксирован 13:29:45Z до runner; v1/v2 immutable, root получил digest, Bridge check PASS.

### S2. Адаптировать regression и проверить source [done]

- **Что:** Исправленный native runner, fixture и companion workflow steps.
- **Как:** Actual openTaskDialog с исходным read adapter и DS54; exact Compact headline/prefix, прежние meaning/focus invariants; raw long geometry. Scoped model, syntax, boundaries и complete fixture build.
- **Зачем:** Проверить понятный следующий шаг и доступ к полному результату, не подменяя приложение макетом.
- **Приёмка:**
  - [x] Runtime/UI/DS bytes совпадают с PR90; тесты и build-only дают проверяемый результат без native claim.
  - [x] Полный working patch и manifest готовы независимому source R1.
- **Покрывает:** A1, A2, A4
- **Итог:** Test-only layer готов source R1: current15/15 model tests, syntax3/3, boundary/styles PASS; build197 inputs (61 product),12 outputs,14 source hashes; exact176 DS54 files. Scope/runtime/workflow integrity PASS. Полный patch и manifest фиксируются при handoff, Git/root публикация ещё впереди.
- **Зависит от:** S1

### S3. Проверить текущий native и передать результат [active]

- **Что:** Новый immutable CI capture и независимая человеческая интерпретация кадра.
- **Как:** Root публикует проверенный test-only descendant, сохраняет exact head/tree; CI проверяет шесть semantic cases и два long captures, рецензент смотрит реальные PNG, raw geometry и limitations.
- **Зачем:** Build и source review не доказывают, что текущая композиция понятна, видима и пригодна.
- **Приёмка:**
  - [ ] Новый native verdict, source/native review, hashes и открытые UX вопросы сохранены на своём точном source; никаких обещаний backend/human acceptance.
- **Покрывает:** A2, A3, A4
- **Зависит от:** S2

## Решения

- **D1.** Источник проблемы подтверждён: PR90 Tabs fixture возвращает пустой workPlan. Самый короткий достаточный способ проверки — восстановить только corrected test layer PR88 поверх runtime90. Полный merge PR88 конфликтует и откатывает Compact; вручную построенный overview не проверяет actual renderer.
- **D2.** Исходные пять semantic cases сохраняются, can-answer добавлен шестым как необходимый контраст Q1/focus/permissions. Root подтвердил уточнение до реализации. Ни реальные права, ни write команды не меняются и не вызываются.
- **D3.** Literal source сохраняет все 69 code points. Preview ожидает заранее записанные 58 code points с многоточием, label «Начало результата», один label span и ноль em elements; полный S1 обязан показать исходные 69. Оракул не вызывает workResultPreview.
- **D4.** Компактность — гипотеза; raw кадры оценивают внимание к статусу, полному title и CTA, полезность prefix и доступ к свойствам. Не устанавливать порог высоты, не уменьшать текст, не переносить численные выигрыши82.
- **D5.** F1: длинная композиция требует текущих PNG; F2: общий язык статусов full Work остаётся OPEN; F3: причина недоступного ответа в форме остаётся OPEN; D1 прежнего native review: BODY focus общего Open work требует отдельного keyboard воспроизведения, failure ещё не доказан. Новый test-only scope эти вопросы не закрывает.

## Вопросы

Блокирующих вопросов нет. Онбординг остаётся последним и только по отдельному согласованию; реальные Safari/Firefox/iOS/VoiceOver — prerelease проверки.

## Контекст

- [Независимое reconciliation и provenance](evidence/reconciliation/README.md).
- `products/sprintique/tests/fixtures/task-overview-state/acceptance-plan.json` — новый активный план; исторические v1/v2 рядом.
- `products/sprintique/tests/task-overview-state-browser.mjs` — actual consumer, синтетические только reads.
- `engineering/bridge/bin/bridge check 20261012-task-compact-state-regression` — структура карточки.
- `node --test products/sprintique/tests/work-model.test.mjs`; `npm run check:boundaries` из продукта; fixture `--build-only` — разрешённые local checks.
