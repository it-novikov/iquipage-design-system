# R4 — проверка и границы результата

## Идентичность исходников

- Исследование: `8e189329b84649e20c8e02b70ba7f94f69af8c4d`, отдельный неизменённый worktree.
- Исправления: ветка `feature/sprintique-vnext-audit`.
- Fingerprint проверенных входов: `49b51558edd01bcdc99eaac9a863bfc6f8e8836ad8cf236644f1f2a47c27a2a6`.
- DS tar SHA-256: `6490056dd8900177d440431d71d95f5bc7cd4df080cdc99f7743184c704c29ba`, не изменён.
- Исходные DS `src/types`, consumed archive и исторический `design-system/` в R4 не менялись. Изменение библиотеки R4 — только отсутствовавший независимый package-lock.

## Автоматические прогоны

| Gate | Результат | Доказательство |
| --- | --- | --- |
| Node24 native PostgreSQL18 + real private S3 |209 DS,135 product,135 detached,0failed/0skipped | `2026-09-12T12-32-38.285Z`, завершён12:33:13UTC |
| Docker PostgreSQL + real private S3 |209 DS,135 product,135 detached,0failed/0skipped | `2026-09-12T12-30-32.505Z`, включая последнее исправление FE-R4-09 |
| Strict build/public boundaries |PASS в обоих прогонах | Library build, product typecheck/Vite/server/OpenAPI, detached clean npm ci/build |
| Source stability |PASS в обоих прогонах | Before=after fingerprint, включая HTML source и точные lockfiles |
| GitHub CI / Ubuntu 24.04 |PASS: 209 DS, 135 product, 135 detached; runtime image build | [Run 34694446823](https://github.com/it-novikov/iquipage-design-system/actions/runs/34694446823), engineering commit `d597bb7e17d8a0eded9f0b26eb21635875f50747`; проверенные downloaded artifacts содержат тот же fingerprint и DS hash |
| Harness regressions |PASS | Ошибка spawn, ненулевой exit, signal exit и graceful0 после forwarded SIGINT/SIGTERM не маскируются |

Логи лежат в игнорируемом `products/sprintique/output/verification/<timestamp>/`; безопасные отчёты включаются в комплект поставки. Схема2 инвентаризации отделяет реальные входные шаблоны/модули от проверенных генерируемых HTML/иконок DS. Drift fence — защита от случайного изменения исходников во время проверки, не криптографическая аттестация недоверенной машины или изменяемого окружения.

## Runtime container

12:34:12UTC: `sha256:174a9b8cb8615d39f352f04545bc4bb94d2a17b7a8a41e7eb6edd6db232cf72e` прошёл probe:

- UID1000, read-only filesystem, cap-drop ALL, no-new-privileges, ограниченные CPU/RAM.
- Настоящие QA PostgreSQL/S3; schema/readiness, существующая OIDC-session, новый events/head, anonymous401, packaged OpenAPI.
- Только loopback4315; временный контейнер удалён после проверки. База и storage не удалялись.

Образ пересобран после последнего исправления FE-R4-09. Полный OIDC-login внутри контейнера, registry publication, облачная нагрузка и deployment: NOT_RUN. Browser host использует отдельный loopback4313, исходный4312 не перезапускался.

## Browser: actual components и настоящий API

Независимый frontend-специалист проверил actual DS/product modules с синтетическими адаптерами и заблокированным `/api/**`:100 инвалидаций→одна3-request волна; отсутствие false empty state; отменённое открытиеA→B→позднийA не меняетB; committed temporal+failed readback освобождает refresh/выход и не повторяет команду. Светлый1440×900 и тёмный390×844 снимки просмотрены. Подробности: [frontend record](../../../products/sprintique/docs/frontend-audit-r4.md).

Ведущий отдельно проверил production build на локальной реальной OIDC/PG/S3 инфраструктуре, отдельная браузерная сессия `sprintique-r4-root`:

- Через UI создан отдельный синтетический проект `audit-r4` и задачаRQA-1 с описанием и готовой обложкой через DS crop. Сохранение, полная перезагрузка и повторное открытие по `#/task/RQA-1` успешны; описание/изображение сохранены сервером.
- Обсуждение с признаком «Требует решения» опубликовано во второй QA-вкладке. Первая получает его автоматически; текст её неопубликованного черновика остаётся неизменным. После проверки очищен только этот собственный черновик.
- После прогрева9 публичных JS/CSS: `transferSize=0`, `decodedBodySize=1122702`, все9 взяты из браузерного кэша. До исправления9 базовых файлов размером1118728 байт возвращали no-store/без ETag. Разница размера текущей сборки и холодной/тёплой загрузки не смешивается с заявлением об SLA.
- Светлая доска1440×900 и тёмный drawer390×844 просмотрены; отдельная таблица responsive геометрии фиксируется в безопасном browser evidence. Reduced-motion включён для узкой проверки.
- Фактические viewport/document/drawer width:390/390/390. Escape закрывает drawer и возвращает #tasks. Planning загружает RQA-1. Переход из Planning в пустые Maps и полный reload сохраняют #maps на подтверждённой сборке `index-D0283_V1.js`.

Один ожидаемый404 при проверке существования ещё не созданного discussion ID сохраняется в консоли второго окна; последующая запись и realtime успешно подтверждены. Это не объявлено «нулём console errors». Первый ошибочный QA-клик по Save был заблокирован открытым crop-диалогом; после выбора «Использовать кадр» сохранение прошло. Не меняли приложение ради обхода корректной блокировки модального слоя.

Native Safari/Firefox/physical touch, все комбинации ролей/тем/клавиатуры, screen-reader, FPS/heap нагрузка: NOT_RUN. API-тесты reader/foreign/revoked/stale не заменяют такой browser coverage.

## Security и доставка

Глубокий security workflow: RUNNING. Его единственный coordinator запущен на неизменённом baseline; отсутствие доступного итогового отчёта не трактуется как чистая security-проверка. Окончательный статус должен быть обновлён перед передачей результата.

Предварительный secret/delivery check 12:41 UTC: 471 новый/изменённый файл относительно main, 142 DS archive members, 8 известных приватных QA-значений; совпадений, приватных ключей и запрещённых путей не найдено. Проверка не заменяет анализ неизвестных секретов или полноценный vulnerability scan. Приватные cookie/infra/backup файлы в Git не добавляются.

[PR #4](https://github.com/it-novikov/iquipage-design-system/pull/4) создан как Draft; GitHub CI успешно завершён 12:46:37 UTC. Его артефакты скачаны и сверены с локальным source fingerprint. Ветка PR #3 не изменена. До результата глубокого security workflow PR не отмечается готовым. Merge, deployment, старые данные, публичная npm-публикация: не выполняются. Full-platform-ready=false.
