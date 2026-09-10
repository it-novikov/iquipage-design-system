# Интеграция Maps в платформу

## Владение интерфейсом

Host создаёт глобальный header, меню проекта, маршруты и контейнер содержимого. Maps создаёт только собственный toolbar, рабочую поверхность, панели и диалоги. Навигация «Обзор / Доска задач / Карты / Материалы / Настройки» в примере — конфигурация оболочки, не встроенная в модуль модель Sprintique.

Весь оставшийся участок экрана отдаётся контейнеру карты: `flex:1;min-height:0;min-width:0`, без `max-width` и внешнего горизонтального padding. При недостаточной высоте управление не должно быть полностью скрыто: проверить zoom 200%, клавиатуру и мобильный viewport. Автоматический вызов browser fullscreen или модального fullscreen DS запрещён для embedded-режима.

Рекомендуется сохранять экземпляр Maps при переходе между соседними разделами, скрывая его контейнер; это сохраняет масштаб и положение. При unmount сначала вызвать `await feature.destroy()` и учитывать `false` — есть неподтверждённый черновик. Перед роутингом `await feature.readyToLeave()`; не закрывать вкладку по обещанию будущего сохранения.

## Подключение

Одна согласованная DS-поставка на приложение. Модуль использует публичные входы `dist/vendor/core.js` и `dist/vendor/whiteboard.js`; нельзя параллельно регистрировать те же Web Components из 05.7 по другому URL. Для production организовать один vendor boundary/alias и повторить API-контракты. React/Vue bridge не должен обращаться к `.wb-*`, `shadowRoot` или внутренним методам DS.

```html
<link rel="stylesheet" href="/maps/dist/vendor/iquipage.css">
<link rel="stylesheet" href="/maps/src/maps.css">
<div id="maps-feature" style="height:100%;min-height:0"></div>
```

```js
import { mountMaps } from '/maps/src/maps.js';

const feature = await mountMaps(document.querySelector('#maps-feature'), {
  project: { id: project.id, name: project.name },
  repository: mapsRepository,
  runtime: workflowRuntime,
  context: { workspaceId: workspace.id, actorId: user.id },
  permissions: { read: true, edit: mayEdit, run: mayRun,
    approve: mayApprove, manageAutomation: mayManageAutomation },
  storageLabel: 'Сохранено в проекте', // только если адаптер действительно подтверждает запись
  onOpenMap: ({ id, projectId }) => hostRouter.updateMapLocation(projectId, id),
  onOpenTasks: ({ ids, projectId }) => hostRouter.openTasks(projectId, ids),
});
```

Host-функции примера не поставляются. Фактический router и auth Sprintique не исследованы в этой реализации; не придумывать их URL или сигнатуры. Не копировать demo/app.js в production как готовую интеграцию.

## Repository contract

Методы `list(collection,projectId)`, `read(collection,id,projectId)`, `write(collection,record,baseRevision,{signal})`. Коллекции: maps, templates, runs, tasks, rules. `write` возвращает полный канонический документ с увеличенной revision или ошибку. Конфликт — `DomainError('CONFLICT',...)`. Повторить текстом ошибки недостаточно: хранение должно атомарно сравнить версию.

Документ карты имеет собственный envelope, а `document` сохраняет whiteboard/1 с objects/connections. Настройки сценария — `flow` с nodes/edges. На сервере нельзя пересобрать документ только из старого поднабора полей и потерять связи, фигуры или геометрию. Нельзя принимать операции изменения архива. Продолжение создаёт новый mapId и sourceMapId/sourceRevision.

Универсальный `subscribe` сообщает только о внешней версии. BrowserRepository использует IndexedDB и BroadcastChannel, это не multi-user realtime. HTTP reference не поставляет поток совместных изменений. Для Sprintique адаптер должен подписываться на серверные изменения и применять ACL на сервере. Cursor/presence не равны сохранённой версии документа.

## Права и изоляция

Права интерфейса по умолчанию закрыты, пример явно открывает их для локального пользователя. Сервер обязан самостоятельно вычислять read/edit/run/approve/manageAutomation, не доверяя флагам клиента, actorId или projectId из тела запроса. Локальный сервер ограничивает origin/Host и подставляет reference identity; это не auth/RBAC.

У шаблона scope personal/project/workspace и ownerId/workspaceId. Проверка видимости в локальном адаптере — удобство reference-приложения, не защита данных нескольких пользователей. В production фильтрация и изменения общей библиотеки выполняются после проверки членства/роли. Обновление версии шаблона не мигрирует автоматически ранее созданные карты. Исполняемый подграф/маркетплейс/публикация библиотек не реализованы.

## Runtime и агенты

Runtime имеет start, approve, cancel, retry. Production-адаптер запускает на сервере опубликованную/разрешённую версию, а не выполняет произвольные клиентские flow. Ключи модели находятся за gateway. `getAgentContext(ids?)` выдаёт структурированный ограниченный контекст. `previewAgentProposal(proposal)` показывает изменение для принятия человеком; raw tool output не имеет права напрямую перезаписать карту.

Поддержанные операции предложений: updateText и addSticky. Есть проверка mapId/projectId/baseRevision, прав и заблокированных объектов. Удаление, обход ACL, запуск инструментов и внешние эффекты через proposal API отсутствуют. Для реального агента следующему исполнителю нужны адаптер вызова модели, журнал мандата и бюджет — не просто textbox с названием AI.

## Состояния и ограничения

Сохранение, локальный preview, отказ, конфликт и серверный запуск различаются. Данные остаются экспортируемыми при ошибке. История DS обслуживает изменения холста; запись метаданных/смена документа сбрасывает историю самого компонента. Это известная граница текущей реализации: undo не откатывает завершение сессии, правки правил или внешние задачи.

Смена проекта: завершить/сохранить текущую правку, согласовать router, затем создать/настроить экземпляр с новым контекстом. Приложение не должно менять projectId уже существующего record через update. Большие данные ограничены 2000 объектами/4000 связями для этого reference-модуля; полноценной виртуализации нет. Бюджеты реальной платформы требуют отдельного нагрузочного измерения.
