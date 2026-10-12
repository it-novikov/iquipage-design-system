// Compare only the declared public recipe. Human reading and popup semantics still need scoped review.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(process.argv[2]||join(here,'output/browser'));
const load=async name=>JSON.parse(await readFile(join(root,name,'results.json')));
const control=await load('control'),candidate=await load('candidate');
const result={status:'NOT_RUN',control:control.package?.archiveSHA256,candidate:candidate.package?.archiveSHA256,
  ordinaryReferences:[],popupResize:[],limits:['Native range checks are not human or painted-ink acceptance.','Task and product adoption remain NOT_RUN.']};
try{
  assert.equal(control.variant,'control');assert.equal(candidate.variant,'candidate');
  assert.equal(control.planSHA256,candidate.planSHA256,'Same comparison plan');assert.equal(control.dataSHA256,candidate.dataSHA256,'Same synthetic data');
  for(const path of ['fixture/consumer.js','fixture/data.mjs','fixture/host.css','fixture/index.html','measure.mjs','interactions.mjs'])
    assert.equal(control.sourceSHA256[path],candidate.sourceSHA256[path],'Same revised fixture: '+path);
  assert.equal(candidate.targetAcceptance,'GEOMETRY_PASS_REVIEW_PENDING','Candidate geometry must pass');
  const plan=JSON.parse(await readFile(join(here,'comparison-plan.json')));
  assert.deepEqual(control.profiles.map(p=>p.id),plan.profiles.map(p=>p.id));assert.deepEqual(candidate.profiles.map(p=>p.id),plan.profiles.map(p=>p.id));
  for(const current of candidate.profiles){
    const original=control.profiles.find(p=>p.id===current.id);
    assert.ok(original.status.startsWith('CAPTURED_'));assert.ok(current.status.startsWith('CAPTURED_'));
    const shape=row=>({width:row.rect.width,height:row.rect.height,style:row.style,
      parts:Object.fromEntries(['label','carrier','value','avatar'].map(key=>[key,row[key]?{
        width:row[key].rect.width,height:row[key].rect.height,left:row[key].rect.left-row.rect.left,top:row[key].rect.top-row.rect.top,style:row[key].style}:null]))});
    for(const id of ['reference-owner','reference-due']){
      assert.deepEqual(shape(current.measurement.rows.find(r=>r.id===id)),shape(original.measurement.rows.find(r=>r.id===id)),current.id+' ordinary field is unchanged: '+id);
      result.ordinaryReferences.push({profile:current.id,row:id,status:'PASS'});
    }
    if(!plan.interaction_profiles.includes(current.id))continue;
    assert.equal(current.interactions?.status,'KEYBOARD_PASS_ANCHOR_REVIEW_PENDING');assert.equal(original.interactions?.status,'KEYBOARD_PASS_ANCHOR_REVIEW_PENDING');
    assert.ok(current.interactions.tagSearch.height>=current.interactions.tagSearch.lineHeight,'Focused candidate tag input has room for its line');
    for(const after of current.interactions.popupResize){
      const before=original.interactions.popupResize.find(p=>p.id===after.id);
      result.popupResize.push({profile:current.id,row:after.id,control:before.resized.anchor,candidate:after.resized.anchor,
        controlScrollEvents:before.resized.scrollEvents-before.before.scrollEvents,candidateScrollEvents:after.resized.scrollEvents-after.before.scrollEvents,
        status:after.resized.anchor.visiblyAdjacent?'CAPTURED_ADJACENT':before.resized.anchor.visiblyAdjacent?'NEW_DETACHMENT_REQUIRES_REVIEW':'EXISTING_DETACHMENT_REQUIRES_REVIEW'});
    }
  }
  result.status='SCOPED_GEOMETRY_KEYBOARD_PASS_VISUAL_ANCHOR_REVIEW_PENDING';
}catch(error){result.status='FAILED';result.error=error.stack||error.message;process.exitCode=1;}
await writeFile(join(root,'comparison.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
