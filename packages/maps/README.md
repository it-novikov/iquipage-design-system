# IQUIPAGE Maps 0.2 / R4

Переиспользуемые карты, сессии, шаблоны и исполняемые сценарии. Поставка содержит самостоятельный пример и оболочку с доской задач, но модуль не владеет навигацией платформы.

[Открыть и проверить R4](docs/RELEASE-R4.md) · [Внедрение](docs/INTEGRATION.md) · [События](docs/EVENTS-CONTRACT.md) · [Типы](types/index.d.ts)

```sh
npm test
npm run dev
```

Сборка: `npm run build && npm run preview`. Полная приёмка: `npm ci --ignore-scripts`, `npx --no-install playwright install chromium`, `npm run verify`. Под Linux браузеру могут потребоваться системные зависимости через `playwright install --with-deps chromium`.

Исходная IQUIPAGE 05.7 остаётся неизменной; extensions собираются в отдельный candidate. Сервер — однопроцессный локальный пример, не production Sprintique. LLM gateway, права платформы и совместная работа подключаются владельцем продукта.
