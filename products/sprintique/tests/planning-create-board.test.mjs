import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const host=await readFile(new URL('../web/planning-host.js',import.meta.url),'utf8');
test('Planning creation in a sprint or release is admitted to its Board; backlog stays draft',()=>{
  const body=host.match(/const scopedFor=groupId=>\{(.*?)\};/s)[1];
  const scopedFor=new Function('repository','groupId',body);
  const repo={createInBoard:true};
  assert.equal(scopedFor(repo,'sprint-1').createInBoard,true);
  assert.equal(scopedFor(repo,'backlog').createInBoard,false);
  assert.equal(scopedFor(repo,null).createInBoard,false);
  assert.equal(repo.createInBoard,true,'the shared repository is not changed');
  assert.match(host,/repository:scopedFor\(task\?null:groupId\)/);
});
