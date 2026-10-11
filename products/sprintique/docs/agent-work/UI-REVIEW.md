# SPR-14 UI/DS review

Implementation: GPT 6 Astra. Public package: `@iquipage/web@0.6.0-vnext.39`.

The task has two public DS tabs: task and agent work. The task overview contains one short signal and one contextual action. The work tab focuses one blocking question, result to review, or current step; plan, saved decisions and history are closed until needed. The shared task title stays visible, task drafts remain mounted, and the task-save footer is hidden in the work tab. The canonical optional /work route survives reload and link copying. Structured choices are controls; narratives are plain text. No provider tool traces, lease tokens or raw JSON are rendered. External assignment is explicitly unaccepted until the agent takes it. Completion and human acceptance are distinct.

The directory joins only readable project catalogs. Search and project/mode/state filters lead to a profile with project-specific skills, activity, readable access, an actual task action and existing account settings. Provider setup reuses current settings and the public creatable model combobox. Skills do not imply permissions. The assignment confirmation names its project and API model/limits when supplied by the server.

Work mutations retain idempotency and submitted revision. The view reloads the server state after a mutation, including immutable replay acknowledgements. Open question drafts remain in their dialog while polling updates the underlying revision. Checkpoint/step forms reject a changed snapshot. Human handoff uses the human command and does not acquire another agent's lease. Linked questions open the existing task discussion.

## Public DS boundary

`workEntry`, `workStep`, `workQuestion`, their declarations and public layout styles were added in `libraries/iquipage`. Product code imports only package entries. The archive is consumed exactly at `vendor/iquipage-web-0.6.0-vnext.39.tgz`.

SHA256: `35c1246b5752ca8233bec2101b84be834dde2eb7ef8f662b812a2d30952462dc`.

DS build and test: 456 passed. Product typecheck/build: passed. Product boundaries/styles: passed. Work-state/presentation tests: 7 passed. Sharp was updated to exact 0.35.5 and source-map-js to its patched compatible version; npm audit reported no vulnerabilities.

## Browser evidence

The initial synthetic component pilot was exercised in Chrome at desktop and 390 px width, in light and dark themes. Answer confirmation, accepted-result state, expandable history, profile, search/filter composition and skill selection were inspected. The pilot is not backend integration evidence.

The owner rejected the first continuous layout. It has been recomposed into a separate workspace using existing iq-tabs and public .39 layouts. No new DS version was required.

On 2026-10-11, the replacement was exercised in Chrome against the real isolated backend at localhost:4311, using the disposable agent-work project and WRK-1 task. The main Answer action switched to the work tab and opened the question. Selecting “Передать Клоду” saved the answer and resolved the linked ordinary discussion. The focus then changed to the result awaiting acceptance. Accepting it showed the next step. Human handoff created a new unaccepted session for Клод; stopping it showed “Остановлен”. Reload retained the canonical #/task/WRK-1/work route, selected tab and persisted state. ArrowLeft selected the task tab and updated its route. Editing the task title, switching both tabs and returning preserved the edited value; autosave completed, and the original title was restored. The work tab hid the task-save footer. History showed the answer, acceptance, handoff and stop as short prose entries with details closed.

Main and work compositions were inspected at desktop and 390×844 in both themes. The mobile document width remained 390 px, with no horizontal overflow. Temporary viewport and theme changes were restored. Actual screenshots are saved under products/sprintique/output/spr14-ui-real: main-light-desktop.jpg, work-light-desktop.jpg, main-light-mobile.jpg, work-light-mobile.jpg, main-dark-desktop.jpg, work-dark-desktop.jpg, main-dark-mobile.jpg and work-dark-mobile.jpg. The initial seed had already-authored work with an awaiting-agent session; that seed inconsistency is not realistic execution evidence. The mobile/dark screenshots show the genuinely new handoff session. The additional main-light-desktop-final.jpg and work-light-desktop-final.jpg show the persisted stopped state after the real UI flow.

The real directory opened both agents and the Кодекс profile. A disposable “Проверка сохранения” skill was created, assigned and read back through the UI; it contained only an instruction and granted no access or tools. The profile opened the actual task. directory-dark-desktop.jpg and profile-dark-desktop.jpg capture these real-backend surfaces.

One backend presentation defect was reported: identical answer and decision text appeared twice in the linked discussion. After the backend fix and isolated preview restart, the Q1 answer flow was repeated through the actual UI at 15:33. The resolved discussion contained two messages; the human reply contained exactly one “Передать Клоду” paragraph. The original question still correctly contained that option. The regression passed; linked-answer-regression-final.jpg captures the complete visible answer and resolution state.

Production execution, external-client OAuth, real provider execution, and permission-boundary security tests are separate gates owned by the coordinator. This browser pass does not claim those outcomes.

## Проверка production после выпуска

11 октября 2026 после выпуска eb4574b проверены обе вкладки реальной SPR-14. План и результаты сохранены собственным OAuth-аккаунтом Codex. Прямая ссылка на рабочую вкладку и reload сохраняют выбранный таб; кнопка «Проверить результат» в основной задаче открывает его. Итог показан одним компактным блоком, план и история изначально закрыты. Действия «Принять результат» и «Вернуть на доработку» оставлены человеку. Подтверждения: `output/spr14-ui-real/production-work-final.png` и `production-main-final.png`; они относятся к production, прежние снимки — к синтетической приёмке.
