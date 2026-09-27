# Конвенция имён

Статус: **обязательна для нового и изменяемого кода**
Область: Kotlin, TypeScript/JavaScript, CSS, SQL, HTTP/JSON, конфигурация, тесты, документация, git

В примерах `<product>` — имя продукта в нижнем регистре (`sprintique`), `<PRODUCT>` — оно же в верхнем.

## 1. Главный принцип

Имя отвечает на один вопрос без чтения реализации:

- **что это** — для класса, значения, коллекции;
- **что происходит** — для функции, команды, события;
- **какое условие проверяется** — для Boolean;
- **какую границу представляет код** — для API, порта, адаптера.

Выбираем не самое короткое, а самое короткое **точное** имя. Если точное имя выходит слишком длинным, сначала проверьте, не делает ли код слишком много.

```kotlin
// Хорошо
val userAccount = userAccountRepository.findById(userId)
fun revokeSession(sessionToken: SessionToken)

// Плохо
val data = manager.get(id)
fun process(value: String)
```

## 2. Общие правила

1. Имена в коде, SQL, API и конфигурации — на английском.
2. Одно понятие — одно слово во всём проекте. Синонимы запрещены.
3. Сокращаем только общеупотребимые слова (см. таблицу ниже).
4. Тип не повторяется в имени, если он виден из объявления: `userAccounts`, не `userAccountList`.
5. Архитектурный суффикс ставится только при реальной архитектурной роли.
6. Boolean формулируется положительно: `isEnabled`, не `isNotDisabled`.
7. Имя не обещает больше, чем делает код.
8. Переименование делается целиком: код, тесты, SQL, JSON, метрики, документация.
9. Идентификаторы production-кода содержат только латиницу и цифры. `_` — по правилам констант, SQL и private backing properties.
10. Имена функций в обратных кавычках Kotlin — только в тестах.

### Сокращения пишутся как слова

| Понятие | Правильно | Неправильно |
|---|---|---|
| identifier | `userId`, `UserId` | `userID` |
| HTTP | `httpClient`, `HttpClient` | `HTTPClient` |
| API | `authApi` | `AuthAPI` |
| URL | `callbackUrl` | `callbackURL` |
| JSON, SQL, OIDC, JWT, UUID, CSRF | `jsonMapper`, `oidcProvider`, `csrfToken` | `JSONMapper`, `OIDCProvider` |

Исключение — значения, прописанные стандартом вне кода: HTTP-заголовок, код ошибки.

## 3. Запрещённые расплывчатые слова

Требуют отдельного обоснования на ревью: `Manager`, `Helper`, `Util(s)`, `Common`, `General`, `Base`, `Wrapper`, `Processor`, `Handler` вне настоящего обработчика команды или фреймворка, `Data`, `Info`, `Details`, `Item`, `Object` без уточнения, `Misc`, `Temp`, `New`, `Old`, `Impl` как единственное отличие.

| Не использовать | Предпочтительно |
|---|---|
| `UserManager` | `UserRegistration`, `UserAccountRepository` |
| `AuthHelper` | `PasswordPolicy`, `SessionTokenParser` |
| `DateUtils` | `TaskDateFormatter`, `Clock` |
| `UserData` | `UserAccount`, `UserProfile`, `RegisterUserRequest` |
| `StorageImpl` | `S3ObjectStorageAdapter` |

`Service` допустим, если класс представляет понятную прикладную возможность и точнее слова нет: `AuthenticationService`. Класс с одной операцией называется по операции: `RegisterUser`.

## 4. Пакеты, модули, файлы

### Kotlin

- Корневой пакет: `com.<product>`. Пакеты строчными буквами без `_` и `-`.
- Сначала предметная область, затем роль: `com.<product>.task.application`.
- Нет пакетов `common`, `shared`, `utils`, `helpers`, `models`, `misc`. Общий код называется по способности: `com.<product>.database`, `com.<product>.command`.
- Gradle-модули — lowercase kebab-case, по способности: `identity-access`. Без `core`, `common`, `service`.
- Файл с одним основным классом называется как класс. Несколько связанных объявлений — по общему назначению: `SessionTokenExtensions.kt`. Нет `Utils.kt`, `Constants.kt`, `Models.kt`.

### TypeScript и JavaScript

- Файлы и каталоги — kebab-case: `task-dialog.js`, `planning-adapter.js`.
- Классы и типы — `UpperCamelCase`, функции и переменные — `lowerCamelCase`, константы уровня модуля — `UPPER_SNAKE_CASE`.
- Web Components: тег `<prefix>-<name>` (`iq-select`), класс `IqSelect`.
- Слой между API и UI называется по роли: `repository.js`, `maps-adapter.js`.

### CSS

- Классы дизайн-системы имеют префикс `iq-`, продуктовые — префикс продукта или раздела (`board-`, `map-`).
- Состояния — атрибутами `data-*` или `aria-*`, не классами-модификаторами с цветом в имени.
- Цвета, отступы и радиусы — только токенами (`var(--iq-…)`).

## 5. Классы и интерфейсы

Классы — существительные в `UpperCamelCase`. Интерфейсы без префикса `I`. Интерфейс без нескольких реализаций или полезной границы не создаётся «на будущее».

Имя реализации объясняет отличие: `JooqTaskRepository`, `InMemoryTaskRepository`, `OidcIdentityProviderAdapter`. Не `TaskRepositoryImpl`.

### Допустимые суффиксы

| Суффикс | Когда | Пример |
|---|---|---|
| `Controller` | HTTP-вход | `TaskController` |
| `Request` / `Response` | Тело HTTP-запроса / ответа | `PutTaskRequest`, `TaskResponse` |
| `Command` / `Query` | Намерение изменить / прочитать | `PutTaskCommand`, `ListTasksQuery` |
| `Handler` | Обработчик команды, запроса или события | `PutTaskHandler` |
| `Event` | Произошедший факт | `TaskUpdatedEvent` |
| `Port` / `Adapter` | Внешняя граница / её реализация | `ObjectStoragePort`, `S3ObjectStorageAdapter` |
| `Client` | Низкоуровневый клиент протокола | `OidcClient` |
| `Repository` | Хранение предметных объектов | `TaskRepository` |
| `Record` | Представление только для хранения | `TaskRecord` |
| `Properties` / `Configuration` | Настройки / Spring-конфигурация | `StorageProperties`, `WebConfiguration` |
| `Policy` / `Validator` | Правила решения / проверка с ошибками | `ProjectAccessPolicy`, `FileNameValidator` |
| `Factory` / `Mapper` | Составное создание / чистое преобразование | `ProblemResponseMapper` |
| `Exception` | Исключение | `RevisionConflictException` |

`Entity`, `Model`, `Dto` не используем: различие видно из точных имён `Task`, `PutTaskRequest`, `TaskRecord`.

## 6. Предметные понятия

- Сущность — в единственном числе: `Task`. Value object — по значению: `TaskId`, `Revision`.
- Не добавляем `Domain`, `Entity`, `ValueObject`.
- Разные понятия не сводим в универсальный `User`: `Principal` (кто действует), `ProjectMember` (участник проекта), `PersonProfile` (профиль).
- У каждого модуля есть словарь терминов в его README или в документации продукта. Новое слово сначала попадает туда.

Слова доступа: `authenticate` — проверить учётные данные; `authorize` — проверить права после аутентификации; `login` — только в имени внешнего маршрута.

## 7. Функции

`lowerCamelCase`, начинаются с точного глагола.

| Глагол | Значение |
|---|---|
| `create` / `delete` | Создать / удалить |
| `find` | Вернуть или отсутствие: `findTask(): Task?` |
| `get` | Вернуть существующее или ошибку |
| `list` / `count` / `exists` | Набор / количество / наличие |
| `validate` | Вернуть результат проверки или список нарушений |
| `require` | Проверить условие и завершиться ошибкой |
| `insert` / `update` / `upsert` | Новая строка / изменение / явное «создать или изменить» |
| `revoke` | Сделать недействительным разрешение или сессию |
| `to` / `map` | Чистое преобразование |
| `parse` / `format` | Из внешнего текста с ошибкой / в текст |

- Boolean читается как утверждение: `isExpired`, `hasActiveSession`, `canWrite(projectId)`.
- Свойство — для дешёвого стабильного значения без побочных эффектов. Функция — для вычисления, ввода-вывода, изменения состояния или операции, которая может упасть.
- `suspend`-функция и `async`-функция в JS не получают суффикс `Async`.
- Общие глаголы `do`, `run`, `execute`, `handle`, `process`, `perform`, `manage` допустимы, только если смысл задан типом аргумента: `handle(command: PutTaskCommand)`.
- Парные действия — парные слова: `create`/`delete`, `start`/`stop`, `claim`/`release`, `encode`/`decode`.

## 8. Переменные и параметры

- Существительные в `lowerCamelCase`. Коллекции — во множественном числе. Map — `<value>By<key>`: `taskById`.
- Nullable-значение сохраняет предметное имя: `task: Task?`, не `maybeTask`.
- Нет однобуквенных имён, кроме коротких выражений и очевидных лямбд; нет `result1`, `value2`.
- Единицы измерения — типами (`Duration`, `Instant`). Если нужен примитив, единица в имени: `timeoutSeconds`, `payloadSizeBytes`.
- `it` — только в однострочной лямбде с очевидным значением.

## 9. Константы и перечисления

- Константы времени компиляции и глубоко неизменяемые значения — `UPPER_SNAKE_CASE`. Константа живёт рядом с правилом, к которому относится, а не в общем `Constants`.
- Значения enum в Kotlin — `UPPER_SNAKE_CASE`. Если значение пересекает границу API, его сериализованная форма задаётся явно и совпадает с контрактом (`ready_for_release`).

## 10. Команды, запросы, события

- Команда — повелительное действие без `Request`: `PutTaskCommand`. HTTP `PutTaskRequest` преобразуется в команду.
- Запрос точно говорит, что ищет: `ListProjectEventsQuery`.
- Событие — факт в прошедшем времени: `TaskUpdatedEvent`. Тема события в outbox — `<resource>.<past-verb>`: `task.updated`, `thread.resolved`.

## 11. HTTP API и JSON

- Пути: lowercase kebab-case, ресурсы во множественном числе, версия в начале: `/api/v1/projects/{projectId}/tasks`.
- Существительные вместо глаголов: `POST /sessions`, не `/doLogin`. Действие, которое не ложится на ресурс, — подресурс-существительное: `PATCH …/threads/{id}/resolution`.
- Поля JSON — `lowerCamelCase`. Boolean без `is`: `enabled`. ID оканчивается на `Id`, момент времени — на `At`, календарная дата — на `Date` или предметное имя (`due`, `plannedStart`) с форматом `YYYY-MM-DD` в контракте.
- Коды ошибок — `UPPER_SNAKE_CASE` по причине: `REVISION_CONFLICT`, `NOT_FOUND`, `IDEMPOTENCY_CONFLICT`.
- Заголовки — стандартные или `Idempotency-Key`, `X-CSRF-Token`.

## 12. SQL и миграции

- Таблицы и колонки — lowercase `snake_case`. Новая таблица — в единственном числе (`user_account`). Существующие имена во множественном числе не переименовываются ради правила: миграция переименования стоит дороже пользы.
- Первичный ключ `id`, внешний `<target>_id`, момент `created_at`, дата `due_date`, Boolean без `is_`: `enabled`.
- Схемы по назначению: `app` (данные продукта), `auth` (идентичность), `work` (фоновые задания).
- Ограничения и индексы: `pk_<table>`, `fk_<table>__<target>`, `uq_<table>__<columns>`, `ix_<table>__<columns>`, `ck_<table>__<rule>`.
- Миграции Flyway: `V<yyyyMMddHHmmss>__<imperative_description>.sql`. Применённая миграция не переименовывается и не меняется.

## 13. Конфигурация

- Свойства Spring: префикс `<product>`, ключи kebab-case: `<product>.storage.bucket`.
- Переменные окружения: `<PRODUCT>_` + `UPPER_SNAKE_CASE`: `SPRINTIQUE_STORAGE_BUCKET`.
- Секреты называются по назначению: `SPRINTIQUE_OIDC_CLIENT_SECRET`, не `SECRET`.
- Явное имя Spring bean задаётся только при конфликте.

## 14. Логи, метрики, трассировки

- Событие лога — точечная нотация по результату: `http.request.completed`, `job.asset_gc.failed`.
- Метрика — `<product>.<area>.<measure>`: `sprintique.http.request.duration`.
- Поля структурного лога — `snake_case`: `request_id`, `project_id`. Одно значение — одно имя поля.
- Секреты, токены, cookie и тела запросов в телеметрию не попадают.

## 15. Тесты

| Вид | Суффикс Kotlin | Пример | Файл TS/JS |
|---|---|---|---|
| Модульный | `Test` | `PlanningChangeTest` | `planning.test.ts` |
| Интеграционный | `IntegrationTest` | `TaskRepositoryIntegrationTest` | `*.test.ts` с базой |
| Контрактный | `ContractTest` | `OpenApiContractTest` | `api-*.test.ts` |
| Архитектурный | `ArchitectureTest` | `ModuleBoundaryArchitectureTest` | `check-boundaries.mjs` |

Имя теста описывает условие и наблюдаемый результат: ``fun `stale revision is rejected with 409`()``, `test('parallel retries produce one effect')`. Не `test1`, `happyPath`, `worksCorrectly`. Фикстуры называются по состоянию: `projectWithReleasedTasks`, не `testData`.

## 16. Исключения и ошибки

- Исключение называется по причине: `RevisionConflictException`, `ProjectNotFoundException`. Без суффикса `Error` и без общего `BusinessException`.
- Ожидаемая предметная ошибка несёт стабильный код и HTTP-статус. Непредвиденная ошибка превращается в `503 TEMPORARILY_UNAVAILABLE` без подробностей.

## 17. Комментарии и документация

- Имя объясняет **что**, комментарий объясняет **почему**. Комментарий не пересказывает следующую строку.
- KDoc/JSDoc нужен для публичного контракта между модулями, поведения, важного для безопасности, неочевидных ограничений и единиц, гарантий повторного вызова, портов и адаптеров.
- Комментарии в коде — на английском. Документы для людей — на русском. Не смешиваем в одном тексте без необходимости.

## 18. Git

### Ветки

`<type>/<short-kebab-description>`, где type: `feature`, `fix`, `refactor`, `test`, `docs`, `architecture`, `build`, `ci`, `chore`. Без имени разработчика, `temp`, `final`, номера без описания.

### Коммиты

Conventional Commits: `<type>(<scope>): <imperative summary>`.

- Summary по-английски, в повелительном наклонении, без точки.
- Scope — модуль или способность (`identity`, `bridge`), не файл.
- Один коммит — одно логическое изменение. Форматирование и переименование не смешиваются с поведением.
- Тело объясняет причину и последствия, если summary мало. Breaking change — `!` и описание в теле.

## 19. Как выбрать имя

1. Понятие уже есть? Берём имя из словаря.
2. Это новый предмет или новая техническая форма старого?
3. Понятно ли имя без пакета и комментария?
4. Глагол точно описывает побочный эффект и результат?
5. Не прячет ли имя несколько обязанностей?
6. Не синоним ли это принятого термина?
7. Совпадает ли имя в коде, API, SQL, тестах и документации?

Из двух одинаково точных имён выбираем более распространённое в предметной области.

## 20. Чек-лист ревью

- [ ] Класс — существительное, функция — точный глагол.
- [ ] Нет необоснованных `Manager`, `Helper`, `Utils`, `Common`, `Data`, `Info`, `Impl`.
- [ ] `find` допускает отсутствие, `get` требует наличия.
- [ ] Boolean читается как положительное утверждение.
- [ ] Коллекции во множественном числе, map вида `<value>By<key>`.
- [ ] ID, время и единицы названы единообразно.
- [ ] HTTP-запросы и ответы не используются как предметные типы.
- [ ] Имя поставщика не вышло за адаптер.
- [ ] Событие названо в прошедшем времени.
- [ ] Код ошибки стабилен и точнее текста.
- [ ] Тест описывает поведение, а не имя метода.
- [ ] Комментарий объясняет причину.

## 21. Применение

- Конвенция действует для нового и изменяемого кода.
- Массовое переименование старого кода — отдельный refactoring-коммит без изменения поведения.
- Формат и простые правила имён проверяют ktlint, Detekt и линтеры. Смысловую точность проверяет ревьюер.

Основано на [Kotlin coding conventions](https://kotlinlang.org/docs/coding-conventions.html) и [Kotlin API guidelines](https://kotlinlang.org/docs/api-guidelines-consistency.html).
