# Граница приёмки PN2

PN2 проверяет frontend consumer и собственные синтетические данные в IndexedDB. Он не закрывает 75 будущих критериев всего R2 и не принимает backend другого агента. Воспроизводимый вход: `npm run verify`.

| Набор | Проверяемое поведение |
|---|---|
| `controller.test.mjs` | Проект/протокол/ревизии проекции, уникальные группы и страницы, отсутствие циклического cursor, независимый выбор, поздние ответы/AbortSignal, retry, destroy |
| `operation.test.mjs` | Нет записи до подтверждения, двойное нажатие, неясный результат, receipt, отказы/expiry/blockers, смена намерения, проверка preview и defensive copy |
| `tests/consumer.ts` | Компиляция публичного TypeScript-контракта потребителя; не TypeScript-проверка каждого JS-файла |
| `browser.mjs` | 16 пользовательских контрактов на реальной IQUIPAGE, включая тот же TaskDetail/Board/Map и локальное сохранение |
| `offline.mjs` | File://, создание/перезагрузка, исходная доска, отсутствие HTTP-запросов |
| Maps unit baseline | 173 прежних модели/HTTP-теста повторно, без изменения source Maps |
| Три актуальных suite v3.4 | Compact editor actions; thread actions; board interactions — повторены отдельно |
| Пакет | Совпадение current fingerprint, HTML SHA и всех записей после распаковки |

Браузерная проверка покрывает группы/детей, sticky общего скролла, keyboard disclosure, reduced motion, selection/filtered context, read retry, draft readiness/start, переходы на доску/карту, DS remote picker, cancel, lost ACK, canonical task save/reload, creation, темы/размеры, stale scope, страницы и отсутствие capabilities. Прямые вызовы fixture в тесте нужны только для постановки сбоя/конкурентной правки; подтверждение, выбор и навигация выполняются через пользовательский UI.

## Что нельзя назвать проверенным
Серверная авторизация, реальный PostgreSQL, агенты/мандаты, многопроцессные транзакции, SSE, сохранённый после закрытия вкладки receipt journal, cursor read нового API, аппаратные touch/скринридеры, измеренный FPS, 10 000 записей, windowed DOM и полный старый browser runner. Новые команды закрытия/роадмапа/migration в PN2 отсутствуют, а не имитируются успешными.

Скриншоты имеют синтетические данные. `failure.png` — историческая находка до исправления, её контекст в DS-AND-REVIEW.md. Решение self-review не объявляется независимым командным исследованием. Все числовые результаты берутся из текущего `evidence/verification.json`, а не из README прошлых поставок.
