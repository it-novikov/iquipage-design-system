# Публикация workflow и сопоставление версий

Запись от **2026-10-12**, подготовлена `astra-architecture` по факту публикации, подтверждённому root. Это учётная запись; автор не проводит новое независимое ревью и не присваивает заключения `/root/repo_patch_audit`.

## Авторизация и текущий результат

2026-10-12 пользователь явно разрешил публикацию существующей ветки/PR и выполнение плана с промежуточными push/PR. После этого root опубликовал workflow через GitHub API: [PR №74](https://github.com/it-novikov/iquipage-design-system/pull/74), ветка `docs/problem-first-product-workflow`, commit [`be77902b24fc19a0e9cf81c3879207d4210f8ad9`](https://github.com/it-novikov/iquipage-design-system/commit/be77902b24fc19a0e9cf81c3879207d4210f8ad9).

Прежний auto-review отказ 2026-10-11 остаётся в журнале как историческое событие. CLI push после нового разрешения не прошёл аутентификацию; его нельзя описывать как тот же permission rejection. Эта запись не подтверждает merge или deploy.

## Сопоставление

| Артефакт | Идентификатор и смысл |
|---|---|
| База исходного ревью | `f5f941afa4e9be8a709e6de67a92bacf5a9397ca` |
| Одобренный non-bridge patch | SHA256 `026a6a118b8daa75a23a4136119cb737f755900f9f2c6a30a794cf5c5e14b8f9` |
| Локальный содержательный commit | `0d3ebb4045438a419f4422db10e8a21d85c2fa96`; именно этот ID сохранён в исходных reviews |
| Локальный commit review/bridge | `1fccc374727c88859024bae9bb92e2a912efa013` |
| Локальный HEAD с записью первоначального отказа | `7296e8982909a94840a902f398601fb28e6a0cd2` |
| Опубликованный GitHub commit | `be77902b24fc19a0e9cf81c3879207d4210f8ad9` |
| Общий Git tree двух последних строк | `f338d4e9cc4f9b22f40cd7e3b4988799fc873ab6`; равенство файлов, не равенство истории commit |
| Canonical manifest исходного bundle | SHA256 `f3c4bc0e8df5d175ef8afc7b8bd560fe8f72d8c0e7d14a98030c3271cb4dbea8` |
| Итоговый MD от 2026-10-11 | SHA256 `d8d43a7264f9af19b544e7a4edc340bf9c832572ddc5155c6ae61baa05f760a3`; добавляется как отдельный неизменяемый research snapshot после первоначальной публикации |

Root восстановил объект remote commit и синхронизировал текущую ветку при равном tree; первоначальная локальная цепочка сохранена в `archive/problem-first-local-reviewed`. Независимые [R1](R1.md), [R2](R2.md) и их исходные evidence-файлы не переписаны. Их local SHA не объявляются remote SHA и не означают повторного review опубликованного Git object.

## Предел этой записи

Архив находится в [product research](../../../../products/sprintique/docs/experience/research/README.md). Для добавления архива и текущего handoff проверяются точное равенство bytes/SHA256, сохранность исходных review-файлов, относительные ссылки, `bridge check` и `git diff --check`. Полный suite и исследование продукта заново не выполняются: приложение, DS, schemas и переносимые skills на этом этапе не меняются. Эта metadata-дельта не выдаётся за новый independent, browser, пользовательский или model benchmark PASS.
