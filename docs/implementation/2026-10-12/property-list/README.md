# Следующий срез DS: читабельные свойства при увеличенном тексте

**Discovery завершён; новый layout и новая поставка DS ещё не приняты.** [Полный исходный разбор](discovery.md) сохранён побайтно. Его SHA256: `e6e222e503790852a43fd195fd75bab3d2854baf8b93cbfb3301c948448d4e7e`.

Человек должен прочитать подпись и значение свойства, а затем найти нужный редактор. Actual Task при root font-size 200% сокращает их до многоточий. В exact DS54 обнаружены фиксированная колонка120px, nowrap/ellipsis на нескольких уровнях, ghost/pill высотой32/26px и статичные значения с line-height20px. У Plan и автора уже есть переносы, но строки тесные, а длинное слово может выходить вправо. Одно расширение label column или отключение ellipsis не устраняет весь класс причин.

Предпочтительный следующий опыт — адаптивная пара: label/value рядом при достаточном месте, полный label над полным value в тесном контейнере относительно размера текста. Высота следует содержимому, DOM/control identity сохраняется. Конкретный threshold не принят. Варианты постоянных двух колонок и всегда вертикальных пар сопоставлены в оригинале с их ценой.

Публичный `data-columns=auto` управляет количеством колонок свойств, а не внутренней парой label/value. Готовый documented reflow/multiline switch не найден. Поэтому следующий scope должен отличить общую проблему DS от настроек Sprintique, проверить editable/static parity и product-owned readonly pill; новый вариант не маскируется private override внутри Task.

## Первичные наблюдения

- [Прежний Task text200,768×900](../task-first-screen/evidence/text200-light-board-task-panel.png): проблема не ограничена телефонной шириной viewport.
- [Новый Task320×900 после закрытия исправленной оценки](../native/estimate/estimate/browser/task-narrow-text200-final.png): popup исправлен, свойства всё ещё сокращены. Если потребителю нужен точный source path, см. [native inventory](../native/estimate/provenance.json).
- [Source и потребители](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/src/styles/foundation.css), [публичный контракт](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/docs/control-contracts.md).

Начат отдельный минимальный пример публичной DS54 в ветке `fix/property-list-reflow` от PR83. Его цель — получить baseline вне продуктовых стилей до реализации нового CSS. В этом документационном checkpoint минимальный native repro ещё **NOT_RUN**; новые общие defaults, package version и human acceptance не заявлены.

Полное исходное исследование и новый native эксперимент не перезапускаются ради фиксированного количества проверок. Выбор границы reflow проверяется шириной самого контейнера, обычным и увеличенным текстом, полными подписями/значениями, отсутствием overlap и сохранением существующих контролов.
