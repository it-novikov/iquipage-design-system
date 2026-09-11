# Sprintique Board B2.1.1

Полная поставка переиспользуемого модуля и локального reference-стенда.
Она не является production-развёртыванием Sprintique и не перезаписывает B2.1.

## Быстрый просмотр

Откройте `Sprintique-Board-B2.1.1.html` в Chromium. Автономный режим использует
IndexedDB этого браузера и не выполняет внешние HTTP-запросы.

Для локального сервера распакуйте ZIP и из `packages/maps` выполните:

```sh
npm ci --ignore-scripts --no-fund --no-audit
npx --no-install playwright install chromium
npm run verify
npm run dev
```

CI и финальная чистая перепроверка используют Node.js 22. Проверка выполняется
на синтетических данных в отдельных временных каталогах и профилях.

## Состав изменения

B2.1.1 сохраняет полный B2.1 и закрывает порядок конкурентных выборов обложки,
снятие/выбор во время pending upload, chooser cancel, retry с тем же ID,
удаление pending и закрытие без сохранения. Preview и thumbnail подтверждают
decode до состояния ready; no-adapter и повреждённое изображение показывают
явное безопасное состояние; поздний ответ после destroy не меняет новый DOM.

Проверенные счётчики и fingerprint находятся в
`Sprintique-Board-B2.1.1-Verification.json`, checksum — в `SHA256SUMS`, результат
чистой распаковки — в `archive-recheck.json`.

Production API/auth/ACL/deploy, AV/CDR, облачное хранение, реальные Safari/touch/
IME/screen reader, нагрузка, live LLM и collaboration остаются за границей.
