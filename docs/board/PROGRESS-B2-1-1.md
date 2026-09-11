# Board B2.1.1 — завершение обложек

Ветка: `feature/board-production`, существующий PR #2 в `main`.
Merge и production deploy не входят в эту поставку.

## Закрыто

- COV-01: подпись и `aria-pressed` синхронизируются при снятии обложки.
- COV-02: порядок выбора отделён от порядка асинхронных ответов.
- Последнее намерение сохраняется для двух и трёх быстрых выборов.
- Снятие, выбор существующего файла, retry, удаление pending и закрытие документа
  не допускают позднего самовольного назначения.
- Detailed preview и thumbnail подтверждают успешный decode до `ready`.
- No-adapter, corrupt image и late response имеют явное безопасное состояние.
- Server, IndexedDB, автономный HTML, DnD и прежние Maps/Board сценарии сохранены.

Исходное исправление: `696bb5f`. Точные итоговые commit, fingerprint, счётчики,
архив и чистая распаковка фиксируются в `run-state.json` и поставке
`deliveries/board-b2-1-1/`.

Финальная локальная приёмка на Node v22.23.2: build/preview/browser/offline PASS,
167 Node-тестов и 129 browser-сценариев. Проверенный source commit `b622050`,
fingerprint `657b89ca96f7e55ae88477129e4684a889cea9f6e4f3e2279da1c629f5be50a4`.

## За границей

Production Sprintique API/auth/ACL/deploy, AV/CDR, облачный Blob, реальные
Safari/touch/IME/screen reader, нагрузка/виртуализация, live LLM и collaboration.
