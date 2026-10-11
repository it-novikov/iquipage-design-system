import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkCandidates,taskRelease} from '../ui/src/board/link-candidates.js';
import {canApplyTypeTemplate,instantiateTaskTemplate,starterTaskSettings,withoutUntouchedTemplate} from '../ui/src/board/task-templates.js';
import {taskMarkdown} from '../ui/src/board/task-content.js';
const task=(id,release,extra={})=>({id,title:'Target '+id,displayId:'SPR-'+id,effectiveReleaseId:release,status:'ready',...extra});

test('SPR22: the empty picker contains only effective release context, with completed targets separately',()=>{
  const tasks=[task('self','r'),task('inherited','r',{releaseId:null}),task('other','b'),task('finished','r',{status:'ready_for_release'}),task('accepted','r',{result:'accepted'}),task('archived','r',{archivedAt:'2026-10-11'}),task('none',null)];
  const groups=linkCandidates(tasks,{excludeId:'self',releaseId:'r'});
  assert.deepEqual(groups.current.map(t=>t.id),['inherited']);
  assert.deepEqual(groups.other,[]);
  assert.deepEqual(groups.completed.map(t=>t.id),['finished','accepted']);
});
test('SPR22: a query searches all releases, preserving same-context priority and completed grouping',()=>{
  const tasks=[task('other-done','b',{result:'accepted'}),task('other','b'),task('current','r'),task('current-done','r',{status:'ready_for_release'})];
  const groups=linkCandidates(tasks,{releaseId:'r',query:'tArGeT'});
  assert.deepEqual(groups.current.map(t=>t.id),['current']);
  assert.deepEqual(groups.other.map(t=>t.id),['other']);
  assert.deepEqual(groups.completed.map(t=>t.id),['current-done','other-done']);
  assert.deepEqual(linkCandidates(tasks,{releaseId:'r',query:'SPR-other'}).other.map(t=>t.id),['other']);
});
test('SPR22: an authoritative no-release membership does not fall back to a direct release',()=>{
  assert.equal(taskRelease({effectiveReleaseId:null,releaseId:'old'}),null);
  assert.equal(taskRelease({releaseId:'legacy'}),'legacy');
  assert.deepEqual(linkCandidates([task('none',null,{releaseId:'old'}),task('r','r')],{}).current.map(t=>t.id),['none']);
});
test('SPR21 + SPR12: type templates change while untouched; a person’s edits require explicit replacement',()=>{
  const settings=starterTaskSettings('p');
  const previous=taskMarkdown(instantiateTaskTemplate(settings,'task')),next=taskMarkdown(instantiateTaskTemplate(settings,'bug'));
  assert.notEqual(previous,next);
  assert.equal(canApplyTypeTemplate('',null),true);
  assert.equal(canApplyTypeTemplate('\n'+previous+'  ',previous),true);
  assert.equal(canApplyTypeTemplate(previous+'\nUser detail',previous),false);
  assert.equal(canApplyTypeTemplate('User detail',null),false);
  assert.equal(withoutUntouchedTemplate(next,next),'');
  assert.equal(withoutUntouchedTemplate(next+'\nUser detail',next),next+'\nUser detail');
});
