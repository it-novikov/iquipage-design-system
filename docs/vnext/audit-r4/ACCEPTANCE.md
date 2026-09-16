# R4 — проверка и границы результата

## Идентичность исходников

- Исследование: `8e189329b84649e20c8e02b70ba7f94f69af8c4d`, отдельный неизменённый worktree.
- Исправления: ветка `feature/sprintique-vnext-audit`.
- Fingerprint проверенных входов: `a8c70c58cb0fca8810a0fdc834ca41eb366328e9e56e336b4757f898c77f2e51` (checkpoint `2026-09-16T11-29-49.878Z`). Прежний инженерный fingerprint `49b51558edd01bcdc99eaac9a863bfc6f8e8836ad8cf236644f1f2a47c27a2a6` относится к состоянию до исправлений по security-находкам.
- DS tar SHA-256: `4b642cf67e7fd2317c0318ca5fea5a57284e00d9122b8cbe1341c6e56c94317c`, выпуск `0.6.0-vnext.2`. Прежний `6490056dd8900177d440431d71d95f5bc7cd4df080cdc99f7743184c704c29ba` заменён: исправления SEC-R4-09…SEC-R4-13 находятся в исходниках библиотеки.
- Исторический `design-system/` не менялся. Библиотека изменена по протоколу `docs/vnext/BOUNDARIES.md`: правка исходников, инкремент версии, build/test/pack, принятие точного tarball продуктом и обновление lockfile. Публичные декларации не расширялись; `mark()` приведён к уже объявленной сигнатуре без аргументов.

## Автоматические прогоны

| Gate | Результат | Доказательство |
| --- | --- | --- |
| Native PostgreSQL18 + real private S3, после security-исправлений |215 DS,142 product,142 detached,0failed/0skipped | `2026-09-16T11-29-49.878Z` |
| Node24 native PostgreSQL18 + real private S3, инженерный этап |209 DS,135 product,135 detached,0failed/0skipped | `2026-09-12T12-32-38.285Z`, завершён12:33:13UTC |
| Docker PostgreSQL + real private S3, инженерный этап |209 DS,135 product,135 detached,0failed/0skipped | `2026-09-12T12-30-32.505Z`. Повтор на обновлённой ветке: NOT_RUN |
| Strict build/public boundaries |PASS в обоих прогонах | Library build, product typecheck/Vite/server/OpenAPI, detached clean npm ci/build |
| Source stability |PASS в обоих прогонах | Before=after fingerprint, включая HTML source и точные lockfiles |
| GitHub CI / Ubuntu 24.04, после security-исправлений |PASS: 215 DS, 142 product, 142 detached; runtime image build | [Run 35089910412](https://github.com/it-novikov/iquipage-design-system/actions/runs/35089910412), commit `2a009e2d3c53e7efa979b186d61e1190f281161c`; скачанные артефакты (`2026-09-16T11-22-10.890Z`) содержат тот же fingerprint и DS hash |
| GitHub CI / Ubuntu 24.04, инженерный этап |PASS: 209 DS, 135 product, 135 detached; runtime image build | [Run 34694446823](https://github.com/it-novikov/iquipage-design-system/actions/runs/34694446823), engineering commit `d597bb7e17d8a0eded9f0b26eb21635875f50747`; проверенные downloaded artifacts содержат тот же fingerprint и DS hash |
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

Глубокий security workflow: **TERMINAL ERROR**. Единственный coordinator, запущенный на неизменённом baseline 12 сентября в 11:35:56 UTC, остановился в 18:16:51 UTC на фазе `discovery`: «Deep Scan stopped after 3 consecutive unsuccessful discovery workers (limit: 3); last failure (transient_error): You've hit your usage limit… try again at Sep 19th, 2026 11:12 AM». Канонического отчёта нет; фазы валидации, цепочек атак и отчёта не выполнялись. Замена не запускалась.

Сохранённое частичное покрытие — 216 файлов в scope, 13 проходов, 37 сырых находок (0 critical, 0 high, 8 medium, 29 low) — дедуплицировано до 15 проблем, проверено вручную по ветке исправлений и закрыто: 12 исправлено, 1 частично, 1 исправлена в коде без прогона, 1 уже была закрыта инженерным этапом. Подробности и точные границы: [SECURITY.md](SECURITY.md). Это не полная security-приёмка и не penetration test.

Предварительный secret/delivery check 12:41 UTC: 471 новый/изменённый файл относительно main, 142 DS archive members, 8 известных приватных QA-значений; совпадений, приватных ключей и запрещённых путей не найдено. Проверка не заменяет анализ неизвестных секретов или полноценный vulnerability scan. Приватные cookie/infra/backup файлы в Git не добавляются.

[PR #4](https://github.com/it-novikov/iquipage-design-system/pull/4) остаётся Draft. Ветка PR #3 не изменена. PR не отмечается готовым, пока покрытие security неполное: прерванная discovery-проверка не заменяет завершённый прогон. GitHub CI на обновлённой ветке пересобрал portable runtime image и прогнал тесты с настоящими эфемерными сервисами. Локальный Docker-gate на этой машине, локальный probe контейнера и браузерные сценарии на обновлённой ветке: NOT_RUN. Merge, deployment, старые данные, публичная npm-публикация: не выполняются. Full-platform-ready=false.
