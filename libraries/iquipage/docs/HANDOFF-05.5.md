# Передача агенту внедрения: IQUIPAGE 05.5

Основание — предоставленный запрос следующей поставки к 05.2. Roadmap/graph/crop из принятой версии расширяются точечно. Общая палитра и approved tokens сохранены. Следующая таблица отделяет поставленный контракт, выполненный DS-тест и проверку реального приложения.

| Пункт запроса | Поставка | Фактическая приёмка здесь |
|---|---|---|
| WebKit touch календаря | Исправлена обработка pointer/focus, не снимается keyboard-путь | Chromium: настоящее touchscreen.tap с has_touch=true, standalone/dialog, обе темы; mouse/keyboard рядом. **WebKit не установлен, пункт не закрыт независимо** |
| Контраст удаления тега | Согласованная пара foreground/background с достаточной специфичностью | Измерены hover/focus обеих тем и выполнено удаление после добавления |
| Selection графа | Canvas/list/keyboard и null-deselect; setters без feedback | Прямой ESM fixture проверяет count/payload событий и программное снятие |
| Lazy runtime | core/advanced/whiteboard, shared modules, independent registers, exports/types | Фактические запросы модулей проверены. Бюджет Sprintique 245736 bytes gzip здесь не измерен |
| Roadmap dependencies | false или create/update/delete по отдельности, guard на preview/apply | Изменения дат допустимы при отключённых связях; stale apply не возвращает отозванные права |
| task → subtask | parentId для task, более глубокая иерархия | Валидируются существование, циклы, metadata; обычная задача не объявляется эпиком |
| scale/range | iq-view-change, setters silent | Проверен пользовательский переход диапазона |
| graph kinds/permissions | allowedKinds, kindLabels, permissions, nodePermissions, fields | Прямой fixture: readonly содержание и изменяемая геометрия, запрет title, независимые edit/delete relations, unknown domain fields после движения |
| Open/discuss | iq-open и iq-discussion, не маршрутизатор/сервер комментариев | Проверен доменный open. Реальное обсуждение и переход — обработчик Sprintique |
| Archive cluster | Отдельные агрегаты archiveClusters с open-intent | Не заменяет архивную visual group. Внешние вычисления/серверный lifecycle не исполняются библиотекой |
| Media/presence | Map ID→Blob/HTTPS, lifecycle object URL; iq-pointer world coords | Проверены Blob preview, отзыв read и освобождение URL; pointer payload. Авторизация/realtime проверяются приложением |
| Crop contexts | Нейтральные тексты/content и прежний Blob/rect API | Измерены реальные экспортированные пиксели; отмена, pending, контекст |
| Work header | iq-work-header с настоящим h1, compact/comfortable, actions/context | Каталог и изолированный заголовок, длинный title, 320/390/768/1440. Реальная шапка с глобальной навигацией Sprintique не подменяется стендом |

## Требуемое независимое продолжение

1. Сверить manifest, diff публичных типов и одну границу vendor.
2. Установить Playwright WebKit и запустить исходные tap-сценарии 390×844 в обеих темах, standalone и supplied dialog. PASS Chromium не закрывает FAIL WebKit. Playwright WebKit не обозначать Safari; физический iPhone отдельно.
3. Выполнить API create/edit/reload/denied/conflict/cancel с настоящими моделями. Проверить, что сохранение metadata и отозванные права корректны на сервере, а не только в UI.
4. Зафиксировать реальный initial JS gzip и verification-summary приложения. Не сравнивать с полным ZIP или суммой CSS/изображений.
5. Проверить CSP, собственные шрифты, целевые браузеры, keyboard/touch и плотность реального плана/карты. После принятия переходить к cutover по отдельному процессу.

Не предоставленные файлы, на которые ссылается исходная заявка (`ds-acceptance.md`, `roadmap-ds-gaps.md` и трассы), не реконструированы из предположений. Повторена поставленная здесь диагностика; не утверждается воспроизведение неизвестного независимого harness. Сохранён журнал отказа установки браузеров `evidence/browser-install.log`.
