# Maps → Task: исходные браузерные доказательства

Этот каталог сохраняет фактические результаты GitHub Actions и выбранные PNG непосредственно в Git, поскольку CI artifacts имеют ограниченный срок хранения. Файлы скопированы побайтово; изображения не перерисованы. Все данные синтетические.

## Проверенный исходный код

| Поле | До исправления вкладки | После исправления вкладки |
|---|---|---|
| PR | #75 | #75 |
| Run | [38210846541](https://github.com/it-novikov/iquipage-design-system/actions/runs/38210846541) | [38212310305](https://github.com/it-novikov/iquipage-design-system/actions/runs/38212310305) |
| Job | 114684421451 | 114689006267 |
| Published head | `1fe0d7e2a6ccf1af289a19b5491c1aabbd45ff8e` | `d4c7fd597efaa60f5e646687c06338c98e90946d` |
| Local authored equivalent | `e1e33787f3b13f64b87e68ff5687ddd525421a3a` | `ac68af1e1c4c213ba307d35ec8706998802db447` |
| Actual checked merge | `aac5f0927fa1c278668af1ff620c7d9c6f01720b` | `268e60293d36a391a7847a84f294a1bb568e5086` |
| Tree | `adb0814a7ff0c2cd19b0baf0cb58d33766989ff5` | `8ab90c4eb22be90b0a0a1e226a50bb598e0b87da` |
| Artifact | 11728884460 | 11729896634 |
| Artifact ZIP SHA-256 | `22200d381480ae27a5e45e827ab8c1b2b0872ea6026c7a5a533f2270a6a5894c` | `56697cc136a8774fb0a840cf7fda28a3942e593c6529ede3663d98ab4e970e85` |
| Runner status | PASS, но видимая Work panel не проверялась | PASS с проверкой selected ARIA tab и видимых panels |

Оба источника используют `@iquipage/web` из pinned archive `.52`, SHA-256 `989fab4822db78e10bfeeb62ad2724d8bb389a08ddf012c196b469af33cde758`. Browser Chromium `151.0.7922.34`, Ubuntu Actions, Node 24.20.0; временный Playwright 1.62.1. Пакет, lock и vendor не изменены.

Текущий runner и Node suite выполнялись на указанном checked merge; его tree совпадает с published head. Все 10 source digests из current results.json сверены с immutable source. Последующие documentation-only commits не означают новую проверку runtime: связь с этим source указана явно.

## Что обнаружило независимое ревью

На старых recovery кадрах MFX-102 имела URL `/work`, а видимыми оставались «Задача» и её поля. Старый runner читал атрибут `value`, который в DS Tabs применяется при mount и сам по себе позднее не переключает содержимое. Поэтому исторический PASS сохранён как исходное свидетельство несовершенной проверки, а не приёмка вкладки.

Исправление передаёт нормализованную секцию при mount и использует обычное действие предоставленной вкладки для последующего переключения. После исправления выбранная «Работа агента», текст «Работа по задаче» и единственная видимая Work panel совпадают с URL. Ранние и поздние маршруты не дают второму route writer повторить переход.

| Сценарий | До | После |
|---|---|---|
| Во время initial Task read выбран другой Task/Work | [Кадр](before-38210846541/initial-task-new-task-recovery.png) | [Кадр](after-38212310305/initial-task-new-task-recovery.png) |
| Во время initial support read выбран другой Task/Work | [Кадр](before-38210846541/initial-support-new-task-recovery.png) | [Кадр](after-38212310305/initial-support-new-task-recovery.png) |

Два after recovery кадра изменились; остальные 19 PNG нового полного artifact побайтно совпадают с предшествующим artifact. Это диагностический факт, а не замена просмотра изменившихся кадров.

## Проверенные пользовательские сценарии

- Четыре viewport/theme profiles: desktop1280×720 и narrow390×844, light/dark. Все четыре PASS.
- Настоящая Maps под настоящим Task: открытие из inspector, Work tab, Close, Escape, native Back/Forward, восстановление той же map instance, viewport, selection, inspector и фокуса на opener.
- Desktop light: недоступная связанная Task и ошибка support read оставляют текущую Task и понятный error sink; handoff открывает одну следующую Task; закрытие отменяет позднюю замену.
- Dirty comment: отказ в подтверждении Back сохраняет новый текст, Task и contextual URL. Дополнительно проверены actual conflict → failed Task/support reload → новый comment → native Back refusal.
- Пять initial recovery cases: initial map failure с настоящей Retry; удержанный Task/support read с выбором map-only или другой Task/Work. Поздние ответы специально игнорируют AbortSignal для проверки защиты.
- Для Work на click, Forward, initial recovery и same-Task native Back проверяется selected tab по ARIA, видимость правильной panel, скрытое противоположное содержимое и согласованность inspect state. Initial Task проверяется аналогично.
- 97/97 Node checks PASS в том же job: 42 target и 55 related. Shell queue, canonical transitions и Map guard дополнительно проверены actual-source tests с внешними адаптерами.

`pageErrors=[]`, `externalRequests=[]`. Две зарегистрированные попытки изменения Task — специально ожидаемый synthetic CONFLICT без записи. Остальные записи fixture отклоняет.

## Дополнительные сохранённые кадры

| Зачем сохранён | Файл |
|---|---|
| Исходная карта с выделением и inspector | [Карта](after-38212310305/desktop-light-map.png) |
| Work поверх карты | [Task Work](after-38212310305/desktop-light-work-tab.png) |
| Карта после возврата; synthetic error после негативного пути остаётся видимым | [Возврат](after-38212310305/desktop-light-returned-map.png) |
| Узкий тёмный экран | [Narrow Work](after-38212310305/narrow-dark-work-tab.png) |
| Новый comment после неудачного Task reload | [Task read draft](after-38212310305/desktop-light-reload-task-read-draft.png) |
| Новый comment после неудачного support reload | [Support read draft](after-38212310305/desktop-light-reload-support-read-draft.png) |

Полные исходные результаты: [before JSON](before-38210846541/results.json), [after JSON](after-38212310305/results.json). Размеры и SHA-256 всех сохранённых raw JSON/PNG: [file-digests.json](file-digests.json).

## Граница доказательств

Fixture монтирует actual Maps host, Maps, Task, product navigation/styles и public DS. Он не монтирует auth и полный main bootstrap; не доказывает backend persistence, native canonical section switch в полном приложении, production session или восстановление viewport через hard reload. Shell интеграция покрыта source-level сценариями, а не этим native fixture.

Browser PASS и независимое scoped review не заменяют обязательный full vNext build/backend/real services/extraction/runtime-image gate. Реальные Safari, Firefox, iOS touch и VoiceOver проверяются перед релизом по ранее согласованной release matrix. Onboarding не входит в этот этап.

