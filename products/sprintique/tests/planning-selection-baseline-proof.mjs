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
  assert.ok(profile.selection.intersection>0,`${profile.name}: selected middle row must visibly intersect the bar`);
  assert.ok(profile.lastRow.intersection>0,`${profile.name}: selected last row must visibly intersect the bar`);
  assert.equal(profile.moveIntent.length,1,`${profile.name}: complete the interaction checks`);
}
assert.equal(result.profiles.find(p=>p.name==='narrow').selection.barWrapped,true,'narrow actions must actually wrap');
console.log(`PASS historical PF02 reproduction: selected middle/last rows overlap in ${result.profiles.length} profiles; normal regression remains red.`);
