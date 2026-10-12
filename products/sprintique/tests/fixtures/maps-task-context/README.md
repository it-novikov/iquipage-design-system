# Maps → Task → same Maps: isolated browser fixture

This fixture mounts the actual `web/maps-host.js`, its contextual controller, the actual Maps/whiteboard, Task dialog, relation map, comment editor and Work tab. It imports the same public `.52` package and product styles as `web/main.js`. A real product navigation header supplies the frame. The main application bootstrap, authentication and section switching are not mounted or replaced by a second shell implementation.

The repository adapter supplies deterministic synthetic reads only: map A is older than map B; A explicitly links to task MFX-101; MFX-101 and MFX-102 have a related-task link. The Work endpoint returns a legitimate empty story for testing its real tab. Unsupported operations and every attempted write throw and are recorded. No production endpoint, account, cookie, fixture login or user data is used.

## Commands

Run from `products/sprintique` with its installed dependencies. The runner checks the `.52` package version and fixed vendor archive SHA256.

```sh
node tests/maps-task-browser.mjs --build-only
PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node tests/maps-task-browser.mjs
```

Both modes first apply the product's existing `readProjectContext`, `validateMap` and `validateTask` to the synthetic data. Navigation receives the same explicit project projection as `web/main.js`; its catalog still contains project rows. This preflight validates those frontend data contracts, not backend/authentication behavior.

`--build-only` bundles the real fixture into memory and leaves browser evidence `NOT_RUN`; it does not launch a browser. `PLAYWRIGHT_MODULE` (or `MAPS_PLAYWRIGHT_MODULE`) selects an already installed Playwright module outside the product manifest. The scoped `Maps task context` GitHub workflow provides Chromium and uploads evidence independently of the existing full product/backend gate. No browser installation or system changes occur inside this runner. `MAPS_EVIDENCE_DIR` changes the artifact directory; its default is ignored `output/maps-task-context/`. CI supplies `MAPS_SOURCE_REVISION` alongside the source digests and timestamp.

## What it checks

- Core path in light/dark at 1280×720 and 390×844: actual inspector button → full Task → Work tab → header Close/Escape/native Back/Forward → the same connected board, viewport, selection and inspector form. Focus returns to the originating inspector button.
- One desktop profile additionally activates the actual relation-map buttons: a null T2 read and a rejected support read keep the same T1 and show the error; successful handoff shows T2 with one observed native Task open; closing T1 while T2 support is delayed cancels the handoff even when the adapter releases the old response after abort.
- A real unpublished comment makes native Back ask for confirmation. Cancelling that confirmation preserves the Task, draft, map and contextual URL. Clearing the synthetic draft then permits normal close.

Initial selection and pan/zoom are deterministic fixture setup through the public whiteboard `select`/`viewport` APIs. The inspector, opening button, Task links, tabs, textarea, dialog controls and browser history are real interactions. A minimal `hashchange` listener calls the host's actual `openRoute`; success is evidence for that isolated boundary, not proof of `main.js` integration. The MutationObserver records the maximum observed number of native Task dialogs; it is not a frame-timing or no-flicker measurement.

`results.json` records source digests, exact package, profile/check results, errors and evidence paths. Screenshots are created only by an actual successful browser launch. Parse/build success does not imply browser PASS. The local research environment cannot launch Chromium because `/proc` is absent: use `--build-only` and retain browser `NOT_RUN` there. An authorized CI run records its own actual browser PASS/FAIL separately.

Persistence, grants, replay, cross-project switching, hard reload state restoration, real Safari/Firefox/iOS touch and assistive technology are outside this fixture. Existing product gates remain separate and unchanged.
