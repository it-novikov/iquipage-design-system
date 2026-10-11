# Independent final loading-repair experience review — 2026-10-12

**APPROVE** the immutable WFR1-3 loading-repair candidate:

- PR70 CI head: `bbdc515dc43b228c429007718f0c10d5df3c09e3`.
- Source fingerprint: `d47439aacd32ceafda328bf62d4a1647895f2f7321a8d8648a8149254e4ddcb0`.
- Unchanged DS50 archive: `90380ecbfdeff2cca0e0ced052eefa7ec3e3f4bad320cf6891b866e8156d27a3`.

No open confirmed P0/P1/P2 in this narrow reviewed delta. WFR1-3 (P3, false initial empty catalog) is CLOSED. Historical whole-wiki delivery approval of `3e15c730...` and the closed WFR1-1/WFR1-2 findings remain in the frozen product report; this document records subsequent receipts without rewriting those workflow inputs.

## Independent source and actual experience evidence

Reviewed only `products/sprintique/web/wiki.js`, `wiki-model.js`, and `tests/wiki-ui.test.mjs`. Unknown/pending catalogue state is distinct from successful[] and error. Successful cached content survives refresh/failure. Request current checks prevent superseded/closed responses from publishing; asynchronous regression tests exercise those outcomes. Raw targeted42/42 PASS, fail0/skipped0 was independently read; no redundant build/test execution.

Own Chrome1280×720 on the isolated localhost4322 fixture with actual mountWiki/public DS and a controlled synthetic repository verified: pending index/archive have2busy regions and no falseempty; initial error givesretry without empty; real retry restoresloading; successful[] permits trueempty/Create; empty archive says Архив пуст. Cached active and archived entries remain duringrefresh/error, withretry. Close→lateanswer leavesfixtureempty/busy0. This is actual rendered controlled UI evidence, not production HTTP/backend timing proof. Viewport reset. No product/production data write or new-task creation occurred.

## Fresh CI and artifact receipts

Independently read `products/sprintique/output/wiki-release/ci.json`: [run38154680196](https://github.com/it-novikov/iquipage-design-system/actions/runs/38154680196) completed/success for the exact head above. Read `ci-certificate.json` dated `2026-10-11T16:39:32.974Z`:8/8PASS,sourceStable=true,initial/final fingerprints exactly d47439... above, exact DS50 archive. Raw `/tmp/release1-wiki-loading-ci-complete.log` records product-tests/detached-product PASS and unchanged source/build inputs. CI certificate supplies pass/fail status; individual CI test-count totals were not separately asserted from this wrapper log.

Read current `artifacts.json`: matching d47439... source identity; main image `sha256:6ee50f782cd970ddbc6ebedaaadb5f89992203f20d4fcecf6e717e02b9fc2b31`, web index `740b4e124aa61824af715040ec0a6af41979b65e08b8f29eb5cb57c20884d3d7`; fallback is delivered prior wiki image `sha256:94f8d685102e7b629d184fe6648e20c0376cfb592f0a31fa9a35a7c4f9f3788a`, prior web index `55d47d8b1c20d0009ee140fcb5f3041dd677108d8da990075a1170717e8a020f`. Both loaded manifests match archives, amd64,user10001:10001,migration079.

Read root-owned `container-rollback.json` dated16:17:52.029UTC:PASS,main/fallback ready, retained material/task/wiki page/wiki-task-link, previous web match, isolated network/nonroot/readOnly/capabilities dropped. These operational probe results are attributed to root; reviewer did not execute them.

## Limits and release boundary

Approval is for these immutable candidate inputs. Loading-repair production cutover and post-deployment observations are still pending in the root release process; this does not claim the repair already runs in production. Earlier delivered whole-wiki observations remain separate evidence.

The original new-task final-create browser action was rejected by automatic approval review. It was not repeated or bypassed. Staged selection/model/API evidence and completed existing-task link round trip do not substitute for that uncompleted browser final-create scenario. Physical touch, real IME composition, recruited-user usability research, screen-reader testing, other browser engines and the entire wiki matrix were not repeated for this narrow delta. Reader/revocation/production proofs in historical reports remain explicitly attributed.

Reviewer changed only this release document. Product source and frozen product reports remain unchanged.
