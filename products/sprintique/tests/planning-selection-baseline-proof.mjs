// Recognise only the intended historical red result; a browser failure is not a reproduction.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const result=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(result.status,'FAIL','the unchanged baseline must fail the normal no-overlap assertions');
assert.deepEqual(result.pageErrors,[],'baseline must render without an application error');
assert.deepEqual(result.externalRequests,[],'baseline must remain synthetic and local');
assert.deepEqual(result.interactionFailures,[],'launch, timeout and interaction errors are not overlap evidence');
assert.deepEqual(result.profiles.map(p=>p.name),['desktop','compact','narrow']);
for(const profile of result.profiles){
  assert.ok(profile.selection.visibleIntersection>0,`${profile.name}: selected middle row must visibly intersect the bar after overflow clipping`);
  assert.equal(profile.moveIntent.length,1,`${profile.name}: complete the interaction checks`);
}
const narrow=result.profiles.find(p=>p.name==='narrow');
assert.equal(narrow.selection.barWrapped,true,'narrow actions must actually wrap');
// The wide baseline's footer/end inset happens to keep its last row above the bar.
// The counterexample is a middle row in every profile and the last row with wrapped actions.
// The normal candidate regression still requires every middle/last row to remain uncovered.
assert.ok(narrow.lastRow.visibleIntersection>0,'narrow: selected last row must visibly intersect the wrapped bar after overflow clipping');
console.log(`PASS historical PF02 reproduction: selected middle rows overlap in ${result.profiles.length} profiles and the narrow last row overlaps; normal regression remains red.`);
