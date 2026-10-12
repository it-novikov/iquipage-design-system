# Исправление bootstrap фикстуры

Первый native CI: [run 38208579979](https://github.com/it-novikov/iquipage-design-system/actions/runs/38208579979), job 114677451438, head ac9393cc, checked merge cc3ce4bd8401f70f5e7498fe6addf2a8de1f5cea. 79 scoped Node PASS. Browser step FAIL: `readProjectContext` отказал raw catalog project без projectName. До Task/Maps browser scenarios выполнение не дошло.

Fixture теперь использует отдельную navigation projection, как shell; обе synthetic Maps содержат обязательную schema. Existing readProjectContext/validateMap/validateTask вызываются runner до браузера. Runtime validators и production adapter не изменялись. Node syntax, diff, actual validator preflight (1 navigation +2 Maps +2 Task), fixture bundle PASS. Browser поведение требует нового CI; build-only не равно PASS браузера.

Этот checkpoint публикует fixture correction и immutable R2 findings. Runtime R2 исправления идут следующим отдельным checkpoint; три P1 остаются открытыми, release не разрешён.
