---
bridge: 1
id: 20261012-task-first-screen-prototype
title: "PF04: сравнительный первый экран Task на exact source overlay"
status: active
risk: standard
owner: it-novikov
branch: experiments/task-first-screen
base: 8f8d218168074bd4c7c9e1e29dfbe783a27998dd
created: 2026-10-12
updated: 2026-10-12T09:45:58Z
links:
---

# PF04: сравнительный первый экран Task на exact source overlay

## Цель

Получить сопоставимые actual-render evidence текущей Task и уточнённого VT1 на frozen frontend/DS54. Эксперимент проверяет композицию первого экрана и доступ к существующим контролам с синтетическими чтениями; выбор production UI, human PASS и сохранение данных требуют отдельной приёмки.

## Рамки

- **Входит:** два статических Vite build/preview, exact source overlay до первого mount, meaningful H01/H02 и адресные риски narrow/dark/text200/empty/question; отдельный CI companion/artifact.
- **Не входит:** изменение production/DS/dependencies, новый bootstrap/API, fake saves, backend/H11, C/VT2, новые browser/release gates.
- **Ограничения:** пишет только назначенный worktree; GitHub публикацию делает root. Native запуск локально не повторяем. Владелец разрешил промежуточные PR и снял численные квоты PR/stack.

## Приёмка

- [x] A1. Production trees/bytes неизменны; patch затрагивает только три разрешённых модуля; syntax и оба Vite build проходят с exact DS54.
- [ ] A2. CI даёт actual PNG/results для сопоставимых пар, начальный scroll/focus до probes, полные fingerprints и честные NOT_RUN.
- [x] A3. Независимый source review exact overlay сохранён с ограничениями; source approval не означает visual/human/backend PASS.

## Передача

- **Состояние:** Buildable experimental draft; source scoped approve; native NOT_RUN
- **Сейчас:** Freeze source checkpoint для root; runner и workflow готовы
- **Дальше:** Root публикует draft PR к fix/tabs-scroll-geometry (PR77), затем native CI и просмотр PNG/results
- **Незакоммичено:** Изменения experiment/workflow/task-review будут включены в checkpoint commit; generated output ignored
- **Рабочая копия:** 2 файл(ов): .github/workflows/tabs-geometry.yml, experiments/ (1 file changed, 15 insertions(+), 1 deletion(-)) · HEAD 8f8d2181 · снято 2026-10-12T09:45:58Z
- **Ловушки:**
  - Plan readonly без callback; real busy/error/disclosure scenario NOT_RUN
  - Console errors диагностические; CAPTURED не visual/human/backend PASS
- **Проверка:** node --check x3; два Vite build exit0; exact DS54 176 files; production tree unchanged; existing workflow steps preserved
- **Причина:** planned — GPT-6 Astra (AI agent), 2026-10-12T09:45:58Z, передано astra-root: Frozen buildable experiment для draft PR к PR77; native CI и review actual results остаются следующими действиями root. No push by author.

## План

### S1. Fixture, exact overlay и static builds [done]

- **Что:** собрать baseline и refined VT1 на frozen product/DS54.
- **Как:** один fixture, exact patch до mount, две Vite build/preview и source/package fingerprints.
- **Зачем:** спорить о реальном frontend без изменения production UI.
- **Покрывает:** A1
- **Приёмка:**
  - [x] Syntax и обе сборки проходят; production неизменён, все 176 installed DS files равны tar, overlays только три.
- **Итог:** Local Node 24.19.0 / Vite 8.3.0: BUILT_NOT_RENDERED, 2 bundles, 0 frames; native не запускался.

### S2. Source review и узкий CI companion [done]

- **Что:** сохранить независимую проверку композиции и reviewable путь native запуска.
- **Как:** immutable source-R1 packet; добавить только root path и два companion steps к прежнему job.
- **Зачем:** обеспечить честные границы source approval и actual evidence.
- **Покрывает:** A3
- **Приёмка:**
  - [x] Exact overlay scoped approve сохранён; прежние workflow steps побайтово сохранены; пределы в README.
- **Итог:** Review SHA8063c590…; 12 pass / 1 old-copy failure и Plan real-adapter NOT_RUN сохранены без исправления истории.

### S3. Draft PR и actual native evidence [todo]

- **Что:** получить сравнимые кадры и проверить engineering probes.
- **Как:** root публикует checkpoint к PR77; существующий Actions job снимает пары, затем результаты читаются вручную.
- **Зачем:** source approval и build не подменяют браузерный или человеческий результат.
- **Покрывает:** A2
- **Приёмка:**
  - [ ] Actual PNG/results просмотрены, ошибки/ограничения названы; status CAPTURED отдельно от visual/human/backend NOT_RUN.
- **Итог:** Pending publication/native CI.

## Решения

- Baseline — ноль overlay; VT1 — временные patched source bytes до initial mount, без runtime variant flags и DOM moves.
- Existing Task editable/static parity структурно сохранена; create остаётся baseline. Plan без callback — readonly.
- Source review: SHA256 `8063c59009c4ec8a1861999e370aeb1558e4ebf17b112e0856efe8bfdc31e28f`; точные файлы и hashes в `reviews/source-R1/README.md`.
- Старое ожидание question-copy и Plan busy/error/disclosure риск сохранены явно; fake save для обхода не добавляем.

## Вопросы

Actual rendering, usability choice и real backend acceptance пока NOT_RUN. При text200 фиксируем существующее усечение, не считаем его исправленным группировкой.

## Контекст

- `experiments/task-first-screen/README.md`: запуск, маленькая матрица и смысловая точка выбора.
- `experiments/task-first-screen/comparison-plan.json`: frozen sources, hashes, вопросы кадров.
- `node --check experiments/task-first-screen/run.mjs` и fixture modules: syntax.
- `TASK_FIRST_SCREEN_NODE_MODULES=/absolute/exact/product/node_modules node experiments/task-first-screen/run.mjs --build-only`: статические сборки; локально выполнено с repo-tabs deps, exit 0.
- `.github/workflows/tabs-geometry.yml`: прежние PF03 steps сохранены, companion только для PR branch `experiments/task-first-screen`.
