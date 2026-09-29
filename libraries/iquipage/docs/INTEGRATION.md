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

## Движение

Все длительности и кривые библиотеки — токены из `tokens/semantic.json`; в `src/styles` сырых миллисекунд нет (ratchet `duration-raw` = 0, проверяется `scripts/gates/styles.mjs`).

| Токен | Значение | Для чего |
|---|---|---|
| `--iq-motion-instant` | 0 ms | явное «без движения» |
| `--iq-motion-fast` | 120 ms | отклик: наведение, нажатие, цвет, тень, меню |
| `--iq-motion-standard` | 180 ms | изменение: кнопка, переключатель, диалог (вход и выход), тост |
| `--iq-motion-enter` | 280 ms | появление панели и дровера (вход и выход одинаковы) |
| `--iq-motion-layout` | 360 ms | перестановка: FLIP карточек, прогресс, пришедшее сообщение |
| `--iq-motion-scene` | 800 ms | презентация и индикаторы (spinner, skeleton = 2 × scene) |
| `--iq-ease` / `--iq-ease-spring` / `--iq-ease-out` | кривые | стандартная / пружина для transform / **выход** (ускорение, `cubic-bezier(.4,0,1,1)`; это не ключевое слово `ease-out`) |

Правило: движение — только `transform` и `opacity`; цвет и тень — не дольше `fast`–`standard`; layout-свойства (`width`, `height`, `top`, `grid-template-*`) и фильтры не анимируются. Прогресс `.iq-progress` двигает полосу через `transform: translateX()` — API `--progress: 40%` не изменился. Редактор при переключении предпросмотра больше не анимирует `height`: новая высота применяется сразу, новая панель проявляется через `opacity` и `clip-path`.

**Совет продукту.** `task-dialog.js` в Sprintique анимирует `width` дровера при переходе на весь экран — это 280 мс перекладки всего документа задачи на каждом кадре. Замените на перекрёстный fade содержимого (`opacity`) или FLIP по `transform: scaleX()` с `transform-origin: right`, а ширину меняйте одним шагом.

В JavaScript длительности читаются из тех же токенов: `motionMs('enter')` (миллисекунды, 0 при уменьшенном движении), `motionEase('spring')` — строка кривой для `element.animate()`. Диалог, дровер, меню, тост, редактор и FLIP доски используют их; продукт должен делать так же, а не писать `duration: 200`.

### Уменьшенное движение

Одна стратегия. И системная настройка `@media (prefers-reduced-motion: reduce)`, и атрибут `<html data-motion="reduced">` обнуляют токены `--iq-motion-*` (`src/styles/motion.css`, генерируется кодмодом `scripts/codemods/motion-tokens.mjs` из токенов). Глобальных правил `* { animation: none !important }` больше нет: компонентные переходы просто становятся нулевыми, события `transitionend`/`animationend` продолжают приходить, переходы приложения-хоста не трогаются. Задержка появления загрузки `--iq-loading-delay` (180 мс) — не движение, а защита от мигания, и под уменьшенным движением сохраняется.

В JavaScript единственная проверка — `motionReduced()` из `@iquipage/web/core` (система **или** атрибут). `scrollBehavior()` возвращает `'auto'` или `'smooth'` для `scrollIntoView`.

Атрибут `data-motion` должен стоять на `<html>` **до** загрузки CSS — иначе на первом кадре после навигации сработают `.iq-reveal`, тосты и панели. Ставьте его в inline-скрипте в `<head>` (`src/theme-boot.js` читает те же ключи localStorage, что и тема с акцентом), а не в модуле приложения. Селекторы токенов работают в любой момент, поэтому позднее переключение из настроек тоже корректно.

### Смена темы

`withoutTransitions(() => { root.dataset.theme = theme })` ставит на `<html>` атрибут `data-theme-switching`, под которым `transition: none !important` для всего документа, и снимает его после первого отрисованного кадра. Без этого смена темы (в том числе автоматическая по `prefers-color-scheme`) — рябь разноскоростных перекрасок кнопок, полей и строк. Используйте хелпер в `appearance.js` продукта и в обработчике `prefers-color-scheme change`.

## Загрузка

- Известная форма ответа (список, карточка, документ) — `.iq-skeleton` не дольше ≈3 с: перелив идёт три цикла (`iq-breathe`, 2 × `--iq-motion-scene`), после чего скелет остаётся приглушённым и не мерцает.
- Неизвестная форма или длительная операция — `.iq-spinner` с текстом действия.
- Оба — только внутри контейнера `.iq-loading`: он невидим первые `--iq-loading-delay` (180 мс), поэтому быстрые ответы не мигают.
- `bindLoading(el)` ставит `.iq-loading` и `aria-busy="true"`, а через `--iq-loading-slow` (5 с) добавляет `.iq-loading-slow` и строку статуса «Загружаем дольше обычного…» (`role="status"`). Возвращает функцию, снимающую состояние. Кнопку «Обновить» и причину показывает продукт.
- Под уменьшенным движением перелив и spinner статичны; задержка и текст сохраняются.

## Браузеры

Базовая линия — `.browserslistrc`: последние две версии Chrome, Edge и Firefox, Safari и iOS от 16.4; нативный `popover` появился только в Safari 17, поэтому для Safari 16 нужен guard (`HTMLElement.prototype.hasOwnProperty('popover')` и fallback на обычный слой).

## Перед обновлением приложения

Проверить MANIFEST.sha256, текущие декларации и HANDOFF-05.7.md. Сначала обновить один vendor boundary и повторить API-операции, затем собственную browser-матрицу. Исходный WebKit touch-дефект календаря нельзя закрывать зелёным Chromium-прогоном. Автоматический push/deploy и изменение исходников Sprintique в эту работу не входят.
