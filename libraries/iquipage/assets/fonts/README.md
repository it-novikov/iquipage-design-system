# Шрифт

`InterVariable.woff2` — Inter 4.1 (Rasmus Andersson и The Inter Project Authors), лицензия SIL OFL 1.1 (`OFL.txt`).

Источник: https://github.com/rsms/inter/releases/tag/v4.1, архив `Inter-4.1.zip`
(sha256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`), файл `InterVariable.ttf`.

Что сделано с файлом (`scripts/subset-inter.py`, fonttools 4 + brotli):

- ось `wght` ограничена 400–700 (библиотека использует 400/500/550/600/650/700), ось `opsz` 14–32 сохранена целиком:
  она и есть «Inter Display» — браузер берёт дисплейные формы для крупных кеглей сам;
- подмножество: Basic Latin, Latin-1, Latin Extended-A, Cyrillic, Cyrillic Supplement, общая пунктуация, валюты,
  №, ™, базовые стрелки и знаки сравнения; 668 глифов;
- все OpenType-функции сохранены (`tnum`, `cv*`, `ss*`, `case`, `frac`, `zero`).

Результат: 109 172 байта, sha256 `c8126c77db9d9370281a3e473ecba9232f1b6582a69df77c9f9cd825253c1225`.
Курсив не поставляется: библиотека использует его в четырёх правилах, браузер синтезирует наклон.

Пересборка: `python3 scripts/subset-inter.py <Inter-4.1/InterVariable.ttf> assets/fonts/InterVariable.woff2`.
