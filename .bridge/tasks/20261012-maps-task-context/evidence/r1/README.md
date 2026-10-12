# Исходное независимое ревью и воспроизведения

Это историческое доказательство дефектов первого checkpoint. `independent-R1.md` и два диагностических `.mjs` скопированы дословно из независимого read-only ревью. Упомянутые в отчёте абсолютные scratch-пути — исходное место исполнения, не обязательный путь следующего агента.

Исполняемый source: local `fbaf15fbcae32a672ec5975fc1106a2bff29b709`, опубликованный эквивалент `83f30e77100e8732cc6af50b9b51852dd6d32c6f`, одинаковый tree `dc3377dedc044795cb3380484d0fc30448c7cbd4`. Vendor .52 SHA-256: `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`.

Для повторения извлечь опубликованный commit в отдельную временную рабочую копию. Скопировать отсюда два `.mjs` в её `products/sprintique/tests/`, установить зависимости этого продукта по его lock (`npm ci --ignore-scripts`), затем из product directory:

```bash
node --test tests/maps-task-review-r1-repro.test.mjs
node --experimental-vm-modules tests/maps-task-links-review-r1-repro.mjs
```

Первая команда должна упасть на трёх содержательных assertions. Exit 0 второй означает подтверждённый баг (`CONFIRMED_SILENT_LINK_FAILURE`), а не готовность продукта. Не включать эти исторические отрицательные probes в обычный green test suite.

Текущие положительные regression assertions находятся в `products/sprintique/tests/maps-task-origin.test.mjs`. Они исполняют current MapsFeature.openMap, извлечённые без правок тела shell navigation/hash handler, current mounting host и действующий Task links view. DOM/Task lifecycle doubles не заменяют браузерное доказательство.

Автор также выполнил историческую проверку новых ожиданий: current test driver с `--test-name-pattern=R1-` поверх неизменённого source первого checkpoint. Из 13 сценариев 11 падают на ожидаемых отказах (repaint отменённой карты, неверный route/Task или потерянная ошибка), 2 проходят; на исправленном source проходят все 13. Это дополнительное авторское доказательство чувствительности тестов, не ещё одно независимое ревью.
