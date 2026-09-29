> Обновление 05.6: компактный каркас и Markdown-viewer описаны в [DAILY-WORK-API.md](DAILY-WORK-API.md). Ранее поставленные контракты ниже сохранены.

# Подключение IQUIPAGE 05.7

## Три входа, общие примитивы

```html
<link rel="stylesheet" href="./dist/iquipage.css">
<main>
 <iq-work-header title="План выпуска" eyebrow="Рабочее пространство">
  <button slot="actions" id="open-plan" type="button" class="iq-btn primary">Открыть план</button>
 </iq-work-header>
 <div id="feature"></div>
</main>
<script type="module">
import { registerCore } from './dist/core.js';
registerCore();
let opened = false;
document.querySelector('#open-plan').addEventListener('click', async () => {
 if (opened) return;
 const { registerAdvanced } = await import('./dist/advanced.js');
 registerAdvanced();
 const plan = document.createElement('iq-roadmap');
 plan.data = {revision:1,rows:[],dependencies:[]};
 plan.dependencyCapabilities = false;
 document.querySelector('#feature').append(plan);
 opened = true;
});
</script>
```

Для свободной доски импортируйте `dist/whiteboard.js` и вызовите `registerWhiteboard()`. Каждый узкий register обеспечивает свои core-зависимости, проверяя customElements перед определением. Повторные импорты и любая последовательность регистраторов используют одну identity конструктора при одинаковых URL.

Полный `dist/iquipage.js` сохранён для совместимости и намеренно импортирует все три входа. Не используйте его на основном экране при требовании lazy load. Не копируйте разные версии `dist/modules` под одним URL и не смешивайте CSS/runtime разных поставок. Не подключайте `src/modules` непосредственно — это редактируемые CommonJS-исходники, которые сборка преобразует в нативный граф ESM.

`dist/entry-manifest.json` описывает входы/общие зависимости; `evidence/esm-requests.json` фиксирует размеры фактического транзитивного состава. Сеть в браузерной проверке обслуживала именно файлы dist, а не подставную реализацию.

## Шрифт

Библиотека поставляет Inter сама: `assets/fonts/InterVariable.woff2` (Inter 4.1, OFL 1.1, вес 400–700, оптический размер 14–32, латиница и кириллица, 109 KB) и `tokens/fonts.css` (`@iquipage/web/fonts.css`). `styles.css` уже начинается с этих `@font-face`, поэтому отдельный импорт нужен только тем, кто не подключает `styles.css`. Ось оптического размера заменяет «Inter Display»: `--iq-display` резолвится в тот же файл, браузер берёт дисплейные формы для крупных кеглей сам. Пока файл грузится, текст набирается «Inter Fallback» (Arial с метриками Inter), и подмена не сдвигает вёрстку.

Приложение добавляет в `<head>` предзагрузку: `<link rel="preload" as="font" type="font/woff2" crossorigin href="…/InterVariable.woff2">`, где адрес тот, под которым сборщик раздаёт файл (Vite: `import fontUrl from '@iquipage/web/assets/fonts/InterVariable.woff2?url'`). Внешние шрифтовые CDN не нужны и не должны подключаться. Полный экран без шрифта (офлайн, блокировка) остаётся читаемым на резервном стеке.

## Темизация

Тема, акцент, плотность и движение — четыре атрибута на `<html>`; CSS реагирует только на них, JavaScript библиотеки их не выставляет:

| Атрибут | Значения | Умолчание |
|---|---|---|
| `data-theme` | `light`, `dark` | без атрибута — системная схема (`prefers-color-scheme`) |
| `data-accent` | `blue` (или без атрибута), `violet`, `green` | синий |
| `data-density` | `comfortable`, `compact` | comfortable |
| `data-motion` | `standard`, `reduced` | standard (+ `prefers-reduced-motion`) |

Все значения цвета генерируются из `tokens/semantic.json`: блок `:root` (светлая тема), `[data-theme="dark"]`, системный фолбэк `@media (prefers-color-scheme: dark){:root:not([data-theme="light"])…}` и блоки акцентов `:root[data-accent="violet"]` / `[data-theme="dark"][data-accent="violet"]` (секция `accents`). Документ без `data-theme` следует за системой и без скрипта; явное `data-theme="light"` или `"dark"` побеждает систему.

Чтобы тёмная тема не мигала светлой до загрузки модулей, вставьте `theme-boot.js` (`@iquipage/web/theme-boot.js`, ≈320 байт, обычный синхронный скрипт) inline в `<head>` **до** `<link rel="stylesheet">`:

```html
<head>
 <script>/* содержимое node_modules/@iquipage/web/dist/theme-boot.js */</script>
 <link rel="stylesheet" href="./dist/iquipage.css">
</head>
```

Скрипт читает из `localStorage` ключи `iq-theme`, `iq-accent`, `iq-density`, `iq-motion` (простые строки со значениями из таблицы) и выставляет соответствующие `data-*` на `document.documentElement` до первого кадра. Если `iq-theme` не `light` и не `dark` (нет ключа, значение `system`), тема берётся из `matchMedia('(prefers-color-scheme: dark)')`. Остальные три атрибута ставятся только при наличии ключа. Ошибки доступа к хранилищу (приватный режим, запрет cookies) глотаются: страница получает системную тему.

Приложение хранит выбор пользователя под теми же ключами и при переключении обновляет и атрибут, и ключ; для «следовать системе» удалите `iq-theme` или запишите `system` и подпишитесь на `matchMedia(...).addEventListener('change', …)`, чтобы менять `data-theme` в открытой вкладке. Каталог IQUIPAGE использует эти же ключи. Inline-скрипт требует разрешения в CSP (`script-src` с nonce или hash); хеш содержимого `dist/theme-boot.js` стабилен внутри версии.

Шкала кеглей — в `rem` при `html{font-size:100%}` (тело интерфейса `.875rem` = 14px, документ `1rem`, минимум `--iq-type-meta-size` = `.75rem` = 12px): настройка размера шрифта в браузере масштабирует текст, а отступы, контролы и радиусы остаются в px. В стилях продукта задавайте кегли токенами `var(--iq-type-*-size)` или в `rem`; ниже 12px — нельзя; медиазапросы меняют композицию, а не уменьшают текст. Кикеры пишутся строчными, капитель делает CSS (`text-transform:uppercase`, `--iq-tracking-caps`). Для русских подписей есть `typo(text)` из `@iquipage/web/core` (неразрывные пробелы после коротких слов, перед «—», между числом и единицей, после «№»).

## Состав runtime и размер

`core` не импортирует roadmap, graph, crop, whiteboard. `advanced` не импортирует whiteboard. `whiteboard` не импортирует roadmap/graph/crop. Demo/stories/sample-data/ui-demo и состояние каталога не входят в runtime. Основные примитивы могут иметь нейтральный placeholder, но не демонстрационные модели пользователя.

Поставляется один общий CSS. Это разделение JavaScript, не отдельные тематические CSS-пакеты. Размеры исходного JS и gzip в отчёте — измерения этой библиотеки; они не равны initial bundle Sprintique и не проверяют бюджет приложения 245736 bytes gzip. Для этого агенту нужно собрать приложение с реальным адаптером и маршрутизацией.

## Управление и приложения

Сложные данные назначаются свойствами, не JSON-интерполяцией в HTML. Значение `iq-whiteboard` (`objects/connections`) не равно модели `iq-graph` (`nodes/edges`); автоматической смены доменной схемы нет. `iq-plan` остаётся календарём сроков, `iq-roadmap` — интервалами.

Черновик, pending, отказ, conflict и readonly — состояния компонентов; API-авторизация, маршруты, загрузка, серверное хранение, realtime, права доступа и продуктовые лимиты принадлежат приложению. Подписки снимаются при unmount. В React используйте ref/эффект и event listeners; отдельный production React-адаптер здесь не поставляется.

Полезные типы экспортируются из `types/core.d.ts`, `extensions.d.ts`, `whiteboard.d.ts`; полный вход объединяет их. `tests/lazy-contract.ts` проверяет потребление типов раздельно. Методы, отсутствующие в публичных декларациях, являются внутренними деталями и могут меняться.

## Поставка медиа и CSP

Автономные HTML включают демонстрационные медиа. Библиотека ESM — нет. Для production нужны свои разрешённые материалы. Шрифтов нет в архиве. Контраст/геометрия проверялись на системном резервном шрифте.

Миниатюры PDF — необязательная возможность, и по умолчанию библиотека ничего не загружает из сети: без настройки `iq-file-preview` показывает для PDF плитку-заглушку, а оригинал открывается независимо от неё. Чтобы включить миниатюры, вызовите `configurePDFPreviews({pdfjsUrl, workerUrl})` с адресом собственной (self-hosted) сборки pdf.js, разрешённой вашей CSP, либо передайте собственный renderer `(file, canvas, signal) => Promise<void>`. Если pdf.js всё же берётся с внешнего CDN, добавьте его в `script-src` и проверяйте целостность (SRI/hash) на своей стороне: библиотека этого не делает и не подставляет CDN сама. Байты документа в любом режиме не покидают устройство.

Тестовые HTML содержат inline-стили/скрипт; рабочее приложение должно подключать dist как внешние ресурсы и согласовать CSP самостоятельно. Произвольный HTML из Markdown не исполняется. `mediaSources` графа может принимать Blob, но не выполняет авторизацию за приложение.

## Браузеры

Базовая линия — `.browserslistrc`: последние две версии Chrome, Edge и Firefox, Safari и iOS от 16.4; нативный `popover` появился только в Safari 17, поэтому для Safari 16 нужен guard (`HTMLElement.prototype.hasOwnProperty('popover')` и fallback на обычный слой).

## Перед обновлением приложения

Проверить MANIFEST.sha256, текущие декларации и HANDOFF-05.7.md. Сначала обновить один vendor boundary и повторить API-операции, затем собственную browser-матрицу. Исходный WebKit touch-дефект календаря нельзя закрывать зелёным Chromium-прогоном. Автоматический push/deploy и изменение исходников Sprintique в эту работу не входят.
