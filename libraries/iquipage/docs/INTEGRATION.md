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

## Состав runtime и размер

`core` не импортирует roadmap, graph, crop, whiteboard. `advanced` не импортирует whiteboard. `whiteboard` не импортирует roadmap/graph/crop. Demo/stories/sample-data/ui-demo и состояние каталога не входят в runtime. Основные примитивы могут иметь нейтральный placeholder, но не демонстрационные модели пользователя.

Поставляется один общий CSS. Это разделение JavaScript, не отдельные тематические CSS-пакеты. Размеры исходного JS и gzip в отчёте — измерения этой библиотеки; они не равны initial bundle Sprintique и не проверяют бюджет приложения 245736 bytes gzip. Для этого агенту нужно собрать приложение с реальным адаптером и маршрутизацией.

## Управление и приложения

Сложные данные назначаются свойствами, не JSON-интерполяцией в HTML. Значение `iq-whiteboard` (`objects/connections`) не равно модели `iq-graph` (`nodes/edges`); автоматической смены доменной схемы нет. `iq-plan` остаётся календарём сроков, `iq-roadmap` — интервалами.

Черновик, pending, отказ, conflict и readonly — состояния компонентов; API-авторизация, маршруты, загрузка, серверное хранение, realtime, права доступа и продуктовые лимиты принадлежат приложению. Подписки снимаются при unmount. В React используйте ref/эффект и event listeners; отдельный production React-адаптер здесь не поставляется.

Полезные типы экспортируются из `types/core.d.ts`, `extensions.d.ts`, `whiteboard.d.ts`; полный вход объединяет их. `tests/lazy-contract.ts` проверяет потребление типов раздельно. Методы, отсутствующие в публичных декларациях, являются внутренними деталями и могут меняться.

## Поставка медиа и CSP

Автономные HTML включают демонстрационные медиа. Библиотека ESM — нет. Для production нужны свои разрешённые материалы. Для новых PDF подключите собственный renderer через configurePDFPreviews либо подготовьте PDF.js самостоятельно. Шрифтов нет в архиве. Контраст/геометрия проверялись на системном резервном шрифте.

Тестовые HTML содержат inline-стили/скрипт; рабочее приложение должно подключать dist как внешние ресурсы и согласовать CSP самостоятельно. Произвольный HTML из Markdown не исполняется. `mediaSources` графа может принимать Blob, но не выполняет авторизацию за приложение.

## Перед обновлением приложения

Проверить MANIFEST.sha256, текущие декларации и HANDOFF-05.7.md. Сначала обновить один vendor boundary и повторить API-операции, затем собственную browser-матрицу. Исходный WebKit touch-дефект календаря нельзя закрывать зелёным Chromium-прогоном. Автоматический push/deploy и изменение исходников Sprintique в эту работу не входят.
