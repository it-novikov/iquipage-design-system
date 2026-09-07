---
name: iquipage-review
description: "Проверяет реализацию и код внедрения IQUIPAGE: публичные компоненты, отсутствие локальных UI-замен, визуальное соответствие, сетка, отступы, контраст, состояния, доступность, производительность и сохранение функций. Использовать для приёмки, code review и цикла исправлений после внедрения. Выдаёт конкретные finding IDs и проверяемые способы исправления. По умолчанию read-only; не заменяет discovery или самостоятельное проектирование продукта."
compatibility: "Агент с чтением файлов и кода. Python 3.10+ для помощников; браузер/Playwright для runtime-приёмки. IQUIPAGE предоставляется отдельно. Без автоматического сетевого доступа или deploy."
metadata:
  suite-version: "1.0.0"
  ds-baseline: "0.5.7"
  language: "ru"
---


# Приёмка и исправления внедрения

## Режим
По умолчанию исследуй без правок приложения. Если пользователь разрешил «исправь» или работа идёт внутри разрешённого implement/review-цикла, после фиксации отчёта исправляй root causes и перепроверяй. Не превращай review в необъявленный redesign.

Обязательно прочитай [конституцию](references/constitution.md), [метод проверки](references/quality-method.md), [release map](references/release-map.md), [gap protocol](references/gap-protocol.md). Для агентных процессов — [human-agent](references/human-agent.md). Используй `assets/assessment.example.json` и `assets/findings-report.md`.

## 1. Зафиксируй, что именно проверяешь
Прочитай согласованный scope, текущий DS archive и hash, app revision/dirty diff, migration ledger, surface inventory, реальные test commands и ограничения среды. Проверить только изменённые файлы недостаточно: оценить все затронутые surfaces и shared components. Для полной приёмки нужен полный реестр маршрутов/overlays/ролей, не случайная выборка.

Запусти read-only `scripts/verify_release.py`. Расхождение vendor — finding с точными файлами и хешами; не приводи поставку к baseline автоматически. Предыдущие успешные тесты — supplier evidence, а не результат этой приёмки.

## 2. Статическая разведка — только кандидаты
```sh
python3 SKILL_ROOT/scripts/integration_scan.py --root PROJECT --config WORK_DIR/scan-config.json --out WORK_DIR/scan.json
```
Конфигурация из `assets/scan-config.example.json`; пути source/vendor/adapters определить по реальному проекту. Скрипт ничего не меняет и не запускает код проекта. Не называй regex scan полноценным code review.

Разбери каждый сигнал вручную: native control в exact markup DS; правильная composition; bounded adapter; application integration; confirmed local bypass; unknown. Нет false-positive waiver «весь файл разрешён». Исключение с rule_id/file/line/source SHA/причиной/owner/approval — проверяемая заявка, не доказательство качества.

Проверь не только новые компоненты, но и CSS modules, inline CSS, utility classes, CSS-in-JS, local SVG, portal content, auth forms, native date popup, внутренний DOM DS, старые UI-packages. Простые semantic HTML elements допустимы. Применение DS-токенов к самодельной кнопке не делает её supplied компонентом.

## 3. Code review и публичные контракты
Проследи импорт → rendering → input/event → state → API → подтверждение → reload. Проверить сохранность полей, типы данных, XSS/Markdown, unsafe URLs, утечки приватных media, listeners, AbortController, Blob cleanup, повторное/устаревшее подтверждение и revision conflict. Сопоставить event names с декларациями, не читать internal fields как контракт.

Разделить source of truth приложения и UI draft; не терять ввод при rerender, переключении темы/плотности/панели, смене permissions. Не заменять backend permission disabled-кнопкой. Проверить scopes людей и агентов, идентичность автора/исполнителя и принятие результата.

Проверить routes/deep links, semantic h1, slots, lazy entry graph, отсутствующие wrappers и demo state. Нативная адаптация только с доказанной необходимостью и bounded record. Для suspected DS-defect создать чистую fixture без app styles; если баг подтверждён в vendor, не патчить локально.

## 4. Реальная UI-приёмка
Открой продукт в браузере, дойди до meaningful data, не только splash. Выполни ключевые сценарии в нужных ролях и обоих оформлениях. Составь матрицу по `assets/test-matrix.csv`, добавь риски проекта. Вращать галерею библиотечных образцов вместо продукта недостаточно.

Сначала pointer и keyboard happy path, затем empty/loading/error/retry/denied/pending/conflict/cancel/undo/reload; selected+hover+focus; nested dialog/menu/calendar; mobile and zoom. Контраст меряй после стабилизации анимаций по составным фактическим поверхностям. Ошибка и warning, planned и in-progress различимы по смыслу и цвету.

Скриншоты: минимум крупный/малый размер и обе темы для каждой изменённой композиции; реально просмотреть, не только сгенерировать. Оценить оси, группировку, иерархию, рабочую площадь, масштаб подписи, ритм, icon box, sticky headers, overflow, tooltip, focus, checkbox hit area и название целиком. Не заменять visual review вычислением scrollWidth.

Пассивный `scripts/capture_surface.py` может сохранить кадр/геометрию достигнутой страницы. Он не выполняет сценарий и не даёт автоматический вердикт о всей доступности. При недоступном browser tool отметить NOT_RUN, а не подставлять screenshot макета.

## 5. Качество опыта и производительность
Проверь новичка без специальных знаний и повторную работу эксперта. Есть ли ясный следующий шаг, место для результата, обратимость, предсказуемая навигация, отсутствие лишнего chrome? Соответствует ли композиция качеству DS, а не просто правильным imports? Назови точную переделку, не «сделать красивее».

Отдельно проверь agent path: что поручено, границы, статус выполнения против статуса принятия, конкретный артефакт, журнал действий, безопасный повтор, ручной контроль. Читаемый viewer не должен вызывать acceptance.

Проверить initial JS реального приложения, lazy requests, idle animation/CPU, долгие операции, bounded loading и большие правдоподобные модели. Записать устройство/engine/data/method. Не сравнивать gzip библиотеки с whole-app budget и не выдавать одну JS-duration за FPS.

## 6. Отчёт, гейты, исправления
Каждое finding — доказательство, воспроизведение, принцип DS, причина или честная гипотеза, вред, направление исправления, acceptance и regression. Упорядочить P0→P3. В findings различать confirmed/hypothesis. Отметить положительные границы и отсутствующие проверки, не обобщать «идеально».

Оформить `assessment.json`; поля структуры и состояний описаны в `assets/assessment.schema.json`. Сравнить coverage с утверждённым scope. Нельзя закрыть finding только комментариями, убрать тест или исключить сложный маршрут.

```sh
python3 SKILL_ROOT/scripts/validate_assessment.py WORK_DIR/assessment.json --evidence-root WORK_DIR --current-fingerprint CURRENT_SHA --out WORK_DIR/assessment-validation.json
```
Добавь `--require-ready` для CI-гейта. Валидатор требует доказательства, но не доказывает, что тест честно выполнен: проверь raw logs и код assertions. NOT_RUN/BLOCKED по required checks запрещают ready.

В разрешённом fix-cycle: закрепить finding ID → исправить минимальный общий источник → добавить тест → повторить соседние варианты и обе темы → рецензировать итоговый build → закрыть с evidence. При отсутствии component/capability немедленно DS-GAP пользователю. Не подменять исправления полного UI новым дизайн-направлением.

## Доставка
Человеку: verdict для конкретного scope, главные проблемы и решения, изменения, точные limits. Следующему агенту: assessment.json, findings-report.md, fix-ledger.csv, evidence index, актуальные fingerprints, gap register и reproduction commands. Разрешение на review не даёт разрешения на deploy.
