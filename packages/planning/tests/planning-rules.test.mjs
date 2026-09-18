import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planChange,releaseOverview,descendants} from '../demo/planning-rules.js';
import {memberships,summaries,rows} from '../demo/fixture-projection.js';
import {validDate,addDays,interval} from '../src/date-value.js';
const task=(id,extra={})=>({id,projectId:'p',displayId:id,title:'Задача '+id,revision:1,type:'task',status:'ready',preparation:'ready',planningAdmission:true,releaseId:'r1',releaseAssignment:'assigned',...extra});
const release=(id,extra={})=>({id,projectId:'p',name:id,status:'planned',planningPhase:'active',revision:1,...extra});
const data=(tasks=[task('a')])=>({tasks,releases:[release('r1'),release('r2',{planningPhase:'planned'})],tags:[],taskLinks:[],_pnFixture:[]});
const plan=(s,intent)=>planChange(s,intent,{projectId:'p',now:'2026-09-12T12:00:00Z',newId:()=> 'fixed'});
const applied=(s,p)=>({...s,tasks:s.tasks.map(t=>p.tasks.find(x=>x.id===t.id)||t),releases:[...s.releases.filter(r=>!p.releases.some(x=>x.id===r.id)),...p.releases],_pnFixture:[...s._pnFixture,...p.meta],taskLinks:[...s.taskLinks,...p.links]});
test('date-only helpers validate leap dates and cross DST without local conversion',()=>{
 assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2028-02-29'),true);assert.equal(addDays('2026-03-28',2),'2026-03-30');assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.throws(()=>interval('2026-10-02','2026-10-01'));assert.equal(interval(null,null).end,null);
});
test('none child does not follow moved parent; unrelated fields and source stay intact',()=>{
 const s=data([task('p'),task('c',{parentId:'p',releaseAssignment:'none',releaseId:null,attachmentIds:['file']}),task('i',{parentId:'p',releaseAssignment:'inherit'})]);const before=structuredClone(s);const p=plan(s,{kind:'move',taskIds:['p'],groupId:'r2'}),next=applied(s,p);
 assert.equal(memberships(next.tasks).get('i'),'r2');assert.equal(memberships(next.tasks).get('c'),null);assert.deepEqual(s,before);assert.deepEqual(next.tasks[1].attachmentIds,['file']);assert.equal(p.tasks.length,2);
});
test('selecting parent and child does not double count effective changes',()=>{const s=data([task('p'),task('c',{parentId:'p',releaseAssignment:'inherit'})]);const p=plan(s,{kind:'move',taskIds:['p','c'],groupId:'r2'});assert.equal(p.changes.length,2);});
test('launch preserves review state; default draft blocks; explicit defer pins ready children',()=>{
 const s=data([task('p',{preparation:'draft'}),task('c',{parentId:'p',releaseAssignment:'inherit',status:'review'})]);s.releases[0].planningPhase='planned';
 assert.equal(plan(s,{kind:'start',groupId:'r1'}).blockers.length,1);
 const p=plan(s,{kind:'start',groupId:'r1',draftHandling:'backlog'}),n=applied(s,p);assert.equal(memberships(n.tasks).get('p'),null);assert.equal(memberships(n.tasks).get('c'),'r1');assert.equal(n.tasks[1].status,'review');assert.equal(n.tasks[1].planningAdmission,true);
});
test('closed release retains accepted child when open epic carries forward',()=>{
 const s=data([task('ep',{type:'epic'}),task('done',{parentId:'ep',releaseAssignment:'inherit',planningOutcome:'accepted'}),task('open',{parentId:'ep',releaseAssignment:'inherit',status:'testing'})]);const p=plan(s,{kind:'close',groupId:'r1',destinationId:'r2'}),n=applied(s,p),m=memberships(n.tasks);
 assert.equal(m.get('ep'),'r2');assert.equal(m.get('open'),'r2');assert.equal(m.get('done'),'r1');assert.equal(n.tasks[2].status,'testing');assert.equal(n.tasks[1].releaseAssignment,'assigned');assert.equal(n.releases.find(r=>r.id==='r1').planningSnapshot.carried,2);assert.equal(s.releases[0].planningSnapshot,undefined);
});
test('acceptance is explicit and cannot accept testing or a parent with open external children',()=>{
 const s=data([task('p',{status:'ready_for_release'}),task('c',{parentId:'p',releaseId:'r2'})]);assert.throws(()=>plan(s,{kind:'close',groupId:'r1',acceptTaskIds:['p'],destinationId:'r2'}),/подзадачи/);
 assert.throws(()=>plan(data([task('a',{status:'testing'})]),{kind:'close',groupId:'r1',acceptTaskIds:['a']}),/не готов/);
});
test('all eligible work can be accepted without a recipient; no archive or deployment',()=>{
 const p=plan(data([task('a',{status:'ready_for_release'})]),{kind:'close',groupId:'r1',acceptTaskIds:['a']});assert.equal(p.tasks[0].planningOutcome,'accepted');assert.equal(p.tasks[0].archivedAt,undefined);assert.equal(p.effect.carried,0);assert.equal(p.effect.deployed,undefined);
});
test('new recipient and incomplete disposition are one prepared plan; invalid recipient aborts',()=>{
 const s=data();const p=plan(s,{kind:'close',groupId:'r1',newRelease:{name:'После запуска',format:'flexible'}});assert.equal(p.effect.createdReleaseId,'pn-release-fixed');assert.equal(p.tasks[0].releaseId,p.effect.createdReleaseId);assert.equal(p.releases.length,2);assert.throws(()=>plan(s,{kind:'close',groupId:'r1'}),/куда/);assert.throws(()=>plan(s,{kind:'close',groupId:'r1',destinationId:'r1'}));
});
test('split disposition stays explicit; cancel keeps open tasks and accepted results',()=>{
 const s=data([task('a'),task('b'),task('done',{planningOutcome:'accepted'})]);const p=plan(s,{kind:'cancel',groupId:'r1',destinations:{a:'r2',b:'backlog'}});const n=applied(s,p);assert.equal(n.tasks[0].releaseId,'r2');assert.equal(n.tasks[1].releaseAssignment,'none');assert.equal(n.tasks[2].releaseId,'r1');assert.equal(p.releases[0].planningPhase,'cancelled');assert.throws(()=>plan(s,{kind:'cancel',groupId:'r1',acceptTaskIds:['a'],destinationId:'backlog'}));
});
test('active destination rejects drafts, closed source rejects re-closing',()=>{const s=data([task('a',{preparation:'draft'})]);s.releases[1].planningPhase='active';assert.throws(()=>plan(s,{kind:'move',taskIds:['a'],groupId:'r2'}),/подготовьте/);s.releases[0].planningPhase='closed';assert.throws(()=>plan(s,{kind:'close',groupId:'r1',destinationId:'backlog'}),/закрыт/);});
test('release format validates active timebox and preserves hard deadline separately',()=>{const s=data();assert.throws(()=>plan(s,{kind:'editRelease',groupId:'r1',values:{format:'timeboxed'}}));const p=plan(s,{kind:'editRelease',groupId:'r1',values:{format:'timeboxed',start:'2026-10-01',end:'2026-10-12',deadline:'2026-10-20'}});assert.equal(p.releases[0].deadline,'2026-10-20');assert.equal(p.tasks.length,0);});
test('task interval shift leaves deadline, undated and accepted work alone',()=>{
 const s=data([task('a',{planningStart:'2026-10-01',planningEnd:'2026-10-03',due:'2026-10-08'}),task('b'),task('c',{planningOutcome:'accepted',planningStart:'2026-10-01',planningEnd:'2026-10-03'})]);const p=plan(s,{kind:'shiftDates',groupId:'r1',days:2});assert.equal(p.tasks.length,1);assert.equal(p.tasks[0].planningEnd,'2026-10-05');assert.equal(p.tasks[0].due,'2026-10-08');
});
test('defaults change settings only, not existing release dates or format',()=>{const s=data();const p=plan(s,{kind:'settings',values:{format:'timeboxed',days:10,timeZone:'Europe/Moscow'}});assert.equal(p.releases.length,0);assert.equal(p.meta[0].days,10);assert.throws(()=>plan(s,{kind:'settings',values:{format:'timeboxed',days:0,timeZone:'UTC'}}));});
test('bulk preserves task document and validates tag scope',()=>{const s=data([task('a',{description:'# Текст',attachmentIds:['asset']})]);s.tags=[{id:'tag',projectId:'p'}];const p=plan(s,{kind:'bulk',taskIds:['a'],field:'tags',value:['tag']});assert.equal(p.tasks[0].description,'# Текст');assert.deepEqual(p.tasks[0].attachmentIds,['asset']);assert.throws(()=>plan(s,{kind:'bulk',taskIds:['a'],field:'tags',value:['missing']}));});
test('manual reorder changes planning ranks only and rejects unrelated siblings',()=>{const s=data([task('a',{rank:77}),task('b',{rank:78}),task('c',{parentId:'a',releaseAssignment:'inherit'})]);const p=plan(s,{kind:'reorder',taskIds:['b'],beforeId:'a'});assert.equal(p.tasks.find(t=>t.id==='b').planningRank,1024);assert.equal(p.tasks.find(t=>t.id==='a').rank,77);assert.throws(()=>plan(s,{kind:'reorder',taskIds:['b'],beforeId:'c'}));});
test('temporal dependency uses canonical business relation and rejects cycles',()=>{
 const s=data([task('a'),task('b'),task('c')]);const p=plan(s,{kind:'temporal',values:{fromId:'a',toId:'b',type:'FS',lagDays:2}});assert.equal(p.links[0].fromId,'b');assert.equal(p.links[0].toId,'a');assert.equal(p.meta[0].relationId,p.links[0].id);const n=applied(s,p);assert.throws(()=>plan(n,{kind:'temporal',values:{fromId:'b',toId:'a',type:'FS',lagDays:0}}),/цикл/);const remove=plan(n,{kind:'removeTemporal',entityId:p.meta[0].id});assert.equal(remove.meta[0].removed,true);assert.equal(remove.links.length,0);
});
test('milestone is not a task; invalid dates or closed release fail',()=>{const s=data();const p=plan(s,{kind:'milestone',values:{title:'Первая демонстрация',date:'2026-10-10',releaseId:'r1'}});assert.equal(p.tasks.length,0);assert.equal(p.meta[0].kind,'milestone');assert.throws(()=>plan(s,{kind:'milestone',values:{title:'X',date:'2026-02-30'}}));});
test('take without release preserves status; unprepare explicitly pauses work',()=>{const s=data([task('a',{status:'testing'})]);const p=plan(s,{kind:'take',taskIds:['a']});assert.equal(p.tasks[0].status,'testing');assert.equal(p.tasks[0].releaseAssignment,'none');assert.equal(p.tasks[0].planningAdmission,true);assert.equal(plan(s,{kind:'unprepare',taskIds:['a']}).tasks[0].planningAdmission,false);});
test('fixture rejects cross-project datasets before calculating effects',()=>{const s=data([task('a',{projectId:'other'})]);assert.throws(()=>plan(s,{kind:'prepare',taskIds:['a']}),/область/);});

import {todayInZone} from '../src/date-value.js';
test('new sprint date follows the project timezone, not UTC or browser timezone',()=>{
  const instant=new Date('2026-09-12T00:30:00Z');
  assert.equal(todayInZone('America/Los_Angeles',instant),'2026-09-11');
  assert.equal(todayInZone('Asia/Tokyo',instant),'2026-09-12');
  assert.throws(()=>todayInZone('Invalid/Zone',instant));
});
