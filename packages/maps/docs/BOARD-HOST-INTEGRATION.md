# Подключение доски и обложек к приложению

Проверенная база: B2.1. Дополнительная приёмка выявила COV-02 — гонку
последовательных замен. До её закрытия текущий PR не принимается к выпуску.
Подробности: ../../../docs/board/COVER-FINAL-FINDINGS.md.

## Граница модуля

Приложение владеет авторизацией, проектом, маршрутом и хранилищами.
Доска получает их через конфигурацию; demo/app.js не нужно копировать в проект.
Пакет находится в workspace: packages/maps. Он private и не заявлен опубликованным
в npm. Используйте локальную workspace-зависимость или поставленный ESM.

Одна копия DS на всё приложение; загрузите совместимые стили в порядке:
`dist/vendor/iquipage.css`, `src/maps.css`, `src/board/board.css`.
Контейнер доски получает оставшуюся высоту и `min-height:0; min-width:0`.
Не импортируйте вторую сборку тех же customElements параллельно.

```js
import {mountTaskBoard} from '@iquipage/maps/board';
const board = await mountTaskBoard(root, {
  repository: taskRepository,
  project: {id: project.id, name: project.name},
  attachmentAdapter: taskFileAdapter,
  canEdit: permissions.editTasks,
  canManageCatalogs: permissions.manageProject,
});
// root, project, permissions and both adapters are supplied by your application.
```

## Контракт файлов

Типы: `types/attachments.d.ts` — AttachmentAdapter; `types/board.d.ts` — BoardConfig.
Адаптер реализует upload, describe, blob и discard; collect необязателен.
Он получает `{id, projectId, taskId}`. id стабилен для повтора одной загрузки.
`blob` возвращает Blob, не URL; варианты: original, thumb, display.
Изображения thumb/display — проверенные WebP; MIME должен быть image/webp.
URL.createObjectURL принадлежит интерфейсу и освобождается при завершении.
Оригинал скачивается отдельно. Не храните base64 или публичный URL в Task.

`Task.attachmentIds` и `Task.coverAttachmentId` сохраняются через repository.write
вместе с остальными полями и baseRevision. Назначение/снятие обложки не является
отдельной записью и не должно перезаписывать более свежую версию задачи.
Обложка — null либо ID изображения из списка вложений этой же задачи.
Снятие обложки оставляет вложение. Удаление вложения снимает и выбранную обложку.

Временная загрузка не создаёт задачу. Серверу нужны права на staging в проекте,
проверка размера/формата, идемпотентность, транзакционная фиксация связей,
срок хранения несвязанных файлов, квоты и проверка содержимого.
HttpAttachmentAdapter — контракт локального reference API, не production ACL.
При иной авторизации/маршрутах реализуйте AttachmentAdapter в проекте.

## Навигация и завершение

`await board.openTask(taskId)` читает текущую задачу в пределах проекта.
Используйте это для одиночной ссылки из карты; не копируйте текст или статус.
Перед сменой маршрута проверьте `await board.readyToLeave()`.
Если результат false, сохраняйте открытый документ и оставайтесь на маршруте.
После разрешённого ухода вызовите board.destroy(); repository принадлежит host.
Смена проекта/пользователя требует нового экземпляра с новым контекстом.
