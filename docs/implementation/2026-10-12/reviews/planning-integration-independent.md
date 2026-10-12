# Независимое ревью интеграции Planning + NT05

**Вердикт: approve в scope композиции двух feature branches. Новых подтверждённых P0–P3 findings нет.** Проверенный merge сохраняет рассмотренный Planning и импортирует точную рассмотренную версию NT05 вместе с её неизменённым пакетом ревью. Полный CI составного head ещё не проверен этим reviewer; этот вердикт не закрывает runtime acceptance, S3/A3 Planning или A1–A3 NT05 и не разрешает merge в main либо deploy.

- Reviewer: GPT-6 Astra, независимая read-only сессия `/root/planning_merge_review`, не автор ни одного изменения.
- Дата: 2026-10-12.
- Репозиторий: `it-novikov/iquipage-design-system`, локальная копия `/workspace/scratch/b3dac59f68e2/repo-planning`.
- Метод: targeted integration review по `AGENTS.md`, `engineering/review.md`, продуктовым правилам и локальному `iquipage-review`. Scope задан до проверки: происхождение всех tree entries, сохранность рассмотренных исходников и отчётов, отсутствие лишней дельты и достоверность границ evidence. Широкие исходные ревью не повторялись.

## 1. Неизменяемый предмет

Идентичности ниже прочитаны непосредственно из Git objects. Working tree и подвижное имя ветки предметом ревью не служили.

| Предмет | Commit | Tree |
| --- | --- | --- |
| Рассмотренный authored merge | `71e341a5f641b16fc3d5fd2482ed5ec139f18aa5` | `de8ecc05feb105f3073b54ddb090bbba61c9e42e` |
| Опубликованный alias, сообщённый root и проверенный локально | `549dde23302197124d42f3793733d226a41152ff` | `de8ecc05feb105f3073b54ddb090bbba61c9e42e` |
| Первый parent: Planning PR76 | `dea34bf64ddb469588899f929c5748ed840ff14f` | `b60cb74225e5cd4f78c4510a72c810847a7b41a5` |
| Второй parent: NT05 PR78 | `2424d4724ec411c84b54b85634dbf54228b0ebd8` | `9d508fb50386ec8a81f6d0bec03a83c3fc0086aa` |

Оба merge commits имеют **ровно двух родителей в указанном порядке**. Общий merge base родителей: `f5f941afa4e9be8a709e6de67a92bacf5a9397ca`. Проверка alias подтверждает одинаковый локально доступный Git object content; актуальные remote refs и состояние GitHub run я самостоятельно не запрашивал.

Планирующее решение D2 записано в `.bridge/tasks/20261012-planning-selection-space/task.md` и добавлено в journal: независимо рассмотренное test-only исправление включается как зависимость существующего полного gate, при неизменном Planning runtime. Предоставленное root актуальное разрешение владельца на продолжение работы и feature-публикации покрывает эту интеграцию. Старые ограничения исполнителя в исходной карточке не создают нового запроса разрешения и не означают разрешение на main/deploy.

## 2. Полная композиция дерева

Скрипт прочитал `git ls-tree -r -z` для base, обоих родителей, authored merge и опубликованного alias. Для **каждого** пути сравнивались mode, тип объекта и object ID; проверялись также отсутствующие и новые пути. Это проверка всего дерева, а не только списка файлов от автора.

| Проверка | Фактический результат |
| --- | --- |
| Изменения первого parent от общего base | 27 путей |
| Изменения второго parent от общего base | 8 путей |
| Пересечение этих наборов | Пусто |
| Изменения merge от общего base | Ровно объединение: 35 путей |
| Delta merge относительно Planning parent | 11 путей: 7 новых файлов NT-пакета, изменённый NT05 и 3 изменённых bridge-документа Planning |
| Число tree entries: base / Planning / NT05 / merge | 1912 / 1937 / 1919 / 1944 |
| Потерянные пути относительно любого parent | Нет |
| Пути вне объединения рассмотренных feature deltas | Нет |
| Entries merge, отличающиеся от обоих родителей | Только 3 документа Planning: `evidence.md`, `journal.md`, `task.md` |

**Все восемь импортированных entries точно равны второму parent:** `products/sprintique/tests/notifications.test.ts` и все семь файлов `.bridge/tasks/20261012-notification-time-order/` — карточка, evidence, journal, индексы R1/R2 и полные оригиналы обоих ревью. Набор путей этого пакета также совпадает: отсутствующих или дополнительных файлов нет.

**Все остальные entries точно равны первому parent**, за исключением трёх явно рассмотренных документов Planning. Тем самым сохранены Planning CSS и весь runtime JS/DOM, четыре fixture-файла, browser driver, baseline recognizer, `.github/workflows/vnext.yml`, все manifest/lock/vendor файлы, backend, contracts, migrations, RLS/grants и остальные тесты. Тест NT05 — единственная исполняемая дельта относительно первого parent. В executable-файлах нет нового содержимого, созданного при разрешении конфликтов.

Ключевые object IDs:

| Файл | Blob в merge |
| --- | --- |
| `products/sprintique/tests/notifications.test.ts` | `1c66625cc0e2fcda2bdf402279ca534a21231df0` |
| `products/sprintique/ui/planning/src/planning.css` | `48cb94064ae96f3a0eff8fa127f319c8a163bf95` |
| `products/sprintique/tests/planning-selection-space.browser.mjs` | `455f4e50d4f912ff63d5c66d8cb2272faa4a1051` |
| `products/sprintique/tests/planning-selection-baseline-proof.mjs` | `67d19912e22302d280a87d3f1e4d439d4908163c` |
| `.github/workflows/vnext.yml` | `c57a27002bb563a614776708f753a8758f3019db` |

Дополнительно проверена цепочка до первоначальных scoped approvals. Blob NT05 совпадает не только со вторым parent, но и с рассмотренным R2 commit `9943d62a6036f5052a13dbedb0713204d9407e59` и его published alias `fedf04cb8e4c443b2e4567fb473a1f600868f2bc`; последние имеют общий tree `4cea6e5c7bbbcf24b9284fa2516dcf8dca3ba709`. Относительно рассмотренного Planning R3 commit `b6fb06461dd0b391ac24b4ea0772e92f67c0f1cc` единственное отличие вне `.bridge/` — NT05. Таким образом, исходники и verification harness, к которым относится прежний browser PASS, действительно сохранены.

## 3. Сохранность ревью и честность evidence

Исторические отчёты не переписаны при интеграции. Их SHA256 вычислены заново из frozen Git blobs:

| Оригинал | Bytes | SHA256 |
| --- | ---: | --- |
| NT05 independent R1 | 18005 | `d39ac91a0e968607e3c95305ca1c6dcfb5389596846fa5cdc8b41b0392c62543` |
| NT05 independent R2 | 11130 | `248d0841397f4818610a006017331c962aa81ec7ec4c2c8727ec30d5581ff23c` |
| Planning independent R3 | 16527 | `2fb4cdf04faa7d75101eadf73971847f13971ca81b578f8f07ded868a888acd7` |

Все восемь файлов сохранённой native evidence `native-38211016913/` проверены по bytes и SHA256 из её README. Оба исходных JSON и шесть PNG сохранены; candidate JSON содержит `status: PASS`, три профиля и пустые массивы geometry/interaction/page/external failures. Baseline JSON сохраняет `status: FAIL` и geometry failures. Это независимая проверка целостности и содержания существующего пакета; новый browser run или повторная визуальная приёмка мной не выполнялись. DS archive сохранён с SHA256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`.

Три новые документационные дельты прочитаны полностью. Верхняя секция Planning evidence разделяет три разных факта:

- `.bridge/tasks/20261012-planning-selection-space/evidence.md:8` сохраняет **старый полный FAIL** run `38212609809` на `dea34bf6`: 566 PASS / 1 NT05 FAIL; detached не выполнялся, image пропущен. Она прямо объясняет, что `sourceStable:true` и успешно напечатанный certificate не являются полным PASS.
- `evidence.md:18–22` сохраняет **исторический scoped native browser PASS** run `38211016913` и R3 для точного прежнего tree, с явной synthetic frontend границей. Сохранённые кадры/JSON не маркируются новым merge SHA.
- `evidence.md:12–14`, task S3/A3 и импортированный NT05 R2 оставляют **новый backend/full gate pending**. Ни математическая точность fixture, ни независимый code review не объявляются наблюдением PostgreSQL/API результата.

Указанные сведения о старом полном CI прочитаны из evidence; исходный ZIP `11730566938` и удалённые логи старого run повторно мной не получались. Их согласованность с текущим текстом проверена, новый внешний аудит исторического CI не заявляется.

Workflow blob неизменён. По его исходнику обязательные Planning browser, library/product/real-services/extraction и portable-image шаги сохранены. `continue-on-error` относится к существующим upload шагам; интеграция не переносит его на проверку продукта. Certificate-print шаг по-прежнему может выполняться после сбоя, и новый текст правильно отделяет печать от результата проверок.

## 4. Обсуждение двух перспектив

**Пользователь и продукт.** Главный риск интеграции — потерять уже проверенное устранение перекрытия, изменить действия Planning или принять чужой тестовый PASS за готовность приложения. Полное равенство Planning source/harness первому parent исключает такую новую source-дельту; геометрические и клавиатурные assertions не ослаблены. NT05 также не меняет пользовательскую сортировку, serializer, права или read-команды. Следовательно, перенос теста не создаёт нового пользовательского поведения. Runtime совместимость составного head всё же требует уже запланированного реального CI; сохранность исходников сама по себе её не доказывает.

**Сопровождаемость тестов и CI.** Подключение отдельной test-only ветки увеличивает состав PR76 и может выглядеть как уход от её исходного UI scope. Здесь зависимость конкретна: полный gate остановился на NT05, а D2 фиксирует причину и отдельное R2 approval. Импорт сохраняет точные expected-ID страницы, микросекундную границу cursor и непрочитанную cutoff row. Он не добавляет date framework, зависимости, новую workflow-ветку, skip или mock backend. Отдельный synthetic recipient сохраняет изоляцию от global `dan`; admin insert ограничен заданием ordering fixture, последующие проверки читают и меняют состояние через существующий HTTP путь (`notifications.test.ts:140–185`). Недоказанная runtime сторона остаётся видимой.

Прямой seed не заменяет тестирование генерации уведомлений, но такая замена здесь не внесена: соседние NT01–NT04 и остальная suite сохранены. Проверенные отрицательные сценарии R2 при переносе не потеряны. Отдельное повторное широкое ревью обеих веток не добавило бы доказательств новой source-дельты; для оставшегося риска нужен результат существующего полного workflow на составном head.

## 5. Findings и следующий шаг

**Новых actionable P0–P3 findings в рассмотренной интеграции нет.** Исторические закрытия F1/F2 остаются решениями соответствующих независимых R2/R3; этот отчёт не переоткрывает и не переименовывает их.

Следующее действие уже предусмотрено карточками: получить завершённый full CI, сопоставить проверенный head/CI merge tree с опубликованной интеграцией, прочитать фактический certificate и raw product/detached logs, включая NT05 diagnostic. Для A1 NT05 нужен наблюдаемый `legacyStringOrder:false` с корректными serialized values/expected IDs либо эквивалентное реальное свидетельство; scoped review этого не предоставляет. Успешный отдельный PR78 run не заменит проверку составного Planning head. Это существующий acceptance gate, новых согласований или дополнительных необоснованных прогонов не требуется.

## 6. Проверено / not_run

**Самостоятельно проверено:** immutable commit/tree/ordered parents и published alias; all-entry Git composition с modes/types/OIDs; отсутствие потерянных и посторонних путей; reviewed-blob continuity; три новые Planning doc deltas; NT05 с окружением и R2 packet; R3 index/native README; SHA256 оригиналов ревью, native JSON/PNG и DS; статическое содержание workflow. `git diff --check` от каждого parent к authored merge завершился exit 0. Рабочая копия при начале и завершении проверок была чистой.

**Только предоставленные/исторические результаты:** авторские scoped bridge и product boundary/style PASS; семь старых malformed taskcards при общем bridge check; прежняя визуальная R3 оценка; исходный full CI FAIL и root-сведения о запуске нового workflow. Общий bridge check я не повторял, старые карточки не менял и отдельным gate для этой интеграции не объявляю.

**NOT_RUN:** native TS7/Vite build; Chromium и новые снимки; Kotlin/JDK25/PostgreSQL18 NT05; Gradle; full vNext, detached extraction, portable image; production/browser/AT acceptance и проверки persistence/F03. Известные `/proc/self/exe`, Chromium SIGTRAP и отсутствие JDK25/PG18 не перепроверялись повторными запусками. Текущий удалённый CI и remote refs этим reviewer не опрашивались. Ни один репозиторный файл или remote ref мной не изменён; создан только этот внешний отчёт.

## Итог

- **Вердикт:** approve — только scoped integration review tree `de8ecc05feb105f3073b54ddb090bbba61c9e42e`.
- **Проверено:** состав merge точно соответствует двум рассмотренным родителям и трём честным Planning checkpoint-документам.
- **Не проверено:** runtime результат нового полного workflow. S3/A3 Planning, A1–A3 NT05 и общая готовность остаются открыты до соответствующей фактической evidence.
