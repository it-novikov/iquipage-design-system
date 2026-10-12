# Следующий срез DS: читабельные свойства при увеличенном тексте

**Discovery и независимый native baseline завершены; новый layout и новая поставка DS ещё не приняты.** [Полный исходный разбор](discovery.md) сохранён побайтно. Его SHA256: `e6e222e503790852a43fd195fd75bab3d2854baf8b93cbfb3301c948448d4e7e`.

Человек должен прочитать подпись и значение свойства, а затем найти нужный редактор. Actual Task при root font-size 200% сокращает их до многоточий. В exact DS54 обнаружены фиксированная колонка120px, nowrap/ellipsis на нескольких уровнях, ghost/pill высотой32/26px и статичные значения с line-height20px. У Plan и автора уже есть переносы, но строки тесные, а длинное слово может выходить вправо. Одно расширение label column или отключение ellipsis не устраняет весь класс причин.

Предпочтительный следующий опыт — адаптивная пара: label/value рядом при достаточном месте, полный label над полным value в тесном контейнере относительно размера текста. Высота следует содержимому, DOM/control identity сохраняется. Конкретный threshold не принят. Варианты постоянных двух колонок и всегда вертикальных пар сопоставлены в оригинале с их ценой.

Публичный `data-columns=auto` управляет количеством колонок свойств, а не внутренней парой label/value. Готовый documented reflow/multiline switch не найден. Поэтому следующий scope должен отличить общую проблему DS от настроек Sprintique, проверить editable/static parity и product-owned readonly pill; новый вариант не маскируется private override внутри Task.

## Первичные наблюдения

- [Прежний Task text200,768×900](../task-first-screen/evidence/text200-light-board-task-panel.png): проблема не ограничена телефонной шириной viewport.
- [Новый Task320×900 после закрытия исправленной оценки](../native/estimate/estimate/browser/task-narrow-text200-final.png): popup исправлен, свойства всё ещё сокращены. Если потребителю нужен точный source path, см. [native inventory](../native/estimate/provenance.json).
- [Source и потребители](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/src/styles/foundation.css), [публичный контракт](https://github.com/it-novikov/iquipage-design-system/blob/6423443d71a0817570281cf28822a3c14f7db684/libraries/iquipage/docs/control-contracts.md).

Минимальный публичный DS54 baseline опубликован в [PR86](https://github.com/it-novikov/iquipage-design-system/pull/86). [Попытка1](baseline-attempt-1/README.md) сохранила кадры, но завершилась FAILED из-за слишком прямого селектора измерения select/combobox. Исправление селектора сохранило plan/fixture/DS/build; [попытка2](baseline-attempt-2/README.md) полностью сняла все пять профилей: **CAPTURED_WITH_OBSERVED_CONSTRAINTS**. Все десять PNG совпадают с соответствующими прежними кадрами; raw обеих попыток неизменён. Это завершённый контроль, не исправление или human PASS.

[Независимый native reviewer](reviews/baseline-native-R1/README.md) лично просмотрел все десять кадров и проверил source/package/actual checkout. В270/root32 геометрия полностью совпадает на viewport320 и1280: причина относится к самому компоненту. В615/root32 значения owner/date читаются, но labels167/136/213px сокращаются в120px. Статичные font28/line20 дают тесные строки и выход за контейнер. Фиксированные height26/32 зарегистрированы отдельно: не каждый выход line box означает отсечение нарисованных glyphs.

## Варианты и решение ближайшего опыта

[Первое предложение](reviews/proposal-initial.md), [позиция оппонента и ответ дизайнера](reviews/proposal-R1/README.md) сохранены как независимые оригиналы. A — intrinsic reflow на существующих wrapper, естественная высота и один ритм; B — явная вертикальная пара с полной шириной подписи там, где это улучшает чтение. Цена A — дополнительные строки длинной подписи в no-grow label; цена B — размерный контракт и обязанность корректной интеграции. Победитель и коэффициенты ещё не утверждены.

У baseline есть два конкретных пробела. Owner/reference-owner не рисуют обещанный avatar, поскольку fixture передал id/name вместо public avatar.text; static author — другой путь. Outer select-wrap и margins/flex bases отдельно не записаны. В новом сравнении control54 и private candidate55 получают один исправленный fixture с явными assertions; исходный контроль не переписывается. Строка «Поиск участника» уже достаточна для сравнения цены label196px против всей строки270px при root32.

Private-pack candidate готовится на actual main220af, product пока остаётся на54. Обычная плотность, полный текст, статичные/редактируемые значения и конкретный resize открытого выбора проверяются до принятия общей поставки. Product-owned readonly pill требует отдельной actual Task adoption. Empty readonly ghost tags — отдельный source finding, не доказанная этим baseline поломка Task и не часть layout patch.


Полное исходное исследование и новый native эксперимент не перезапускаются ради фиксированного количества проверок. Выбор границы reflow проверяется шириной самого контейнера, обычным и увеличенным текстом, полными подписями/значениями, отсутствием overlap и сохранением существующих контролов.
