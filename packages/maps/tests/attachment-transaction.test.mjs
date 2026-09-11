import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {FileRepository} from '../server/file-repository.mjs';
import {FileAttachmentStore} from '../server/attachment-store.mjs';
import {createTask} from '../src/tasks.js';
async function setup(t){
  const directory=await mkdtemp(path.join(os.tmpdir(),'board-file-transaction-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const repository=await new FileRepository(directory).init(),store=await new FileAttachmentStore(repository).init();
  const task={...createTask({projectId:'files-project',title:'Задача с файлами'}),id:'files-task'};
  const bytes=await sharp({create:{width:64,height:32,channels:3,background:'#447799'}}).png().toBuffer();
  const file=await store.upload({id:'file-one',projectId:task.projectId,taskId:task.id,name:'cover.png'},bytes);
  return {directory,repository,store,task,bytes,file};
}
test('attachment transaction: creation links staged bytes and optional cover atomically',async t=>{
  const {repository,store,task,file}=await setup(t);
  assert.equal(await repository.read('tasks',task.id,task.projectId),null);
  const saved=await repository.write('tasks',{...task,attachmentIds:[file.id],coverAttachmentId:file.id},0);
  assert.equal(repository.data.attachments.get(file.id).state,'attached');assert.equal(saved.coverAttachmentId,file.id);
  assert.ok((await store.blob({id:file.id,projectId:task.projectId,taskId:task.id,variant:'thumb'})).bytes.length>0);
});
test('attachment transaction: restart restores both task and file references',async t=>{
  const {directory,repository,task,file}=await setup(t);
  await repository.write('tasks',{...task,attachmentIds:[file.id],coverAttachmentId:file.id},0);
  const reopened=await new FileRepository(directory).init();
  assert.equal((await reopened.read('tasks',task.id,task.projectId)).coverAttachmentId,file.id);assert.equal(reopened.data.attachments.get(file.id).state,'attached');});
test('attachment transaction: removing only cover retains downloadable attachment',async t=>{
  const {repository,store,task,file}=await setup(t);
  const saved=await repository.write('tasks',{...task,attachmentIds:[file.id],coverAttachmentId:file.id},0);
  const next=await repository.write('tasks',{...saved,coverAttachmentId:null},saved.revision);
  assert.deepEqual(next.attachmentIds,[file.id]);assert.equal(repository.data.attachments.get(file.id).state,'attached');
  assert.ok((await store.describe({id:file.id,projectId:task.projectId,taskId:task.id})).image);
});
test('attachment transaction: removing file revokes reads without deleting task',async t=>{
  const {repository,store,task,file}=await setup(t);
  const saved=await repository.write('tasks',{...task,attachmentIds:[file.id],coverAttachmentId:file.id},0);
  const next=await repository.write('tasks',{...saved,attachmentIds:[],coverAttachmentId:null},saved.revision);
  assert.equal(next.id,task.id);assert.equal(repository.data.attachments.get(file.id).state,'detached');
  await assert.rejects(store.describe({id:file.id,projectId:task.projectId,taskId:task.id}),{code:'FILE_ACCESS'});
});
test('attachment transaction: stale save does not detach the committed cover',async t=>{
  const {repository,task,file}=await setup(t);
  const saved=await repository.write('tasks',{...task,attachmentIds:[file.id],coverAttachmentId:file.id},0);
  await assert.rejects(repository.write('tasks',{...saved,attachmentIds:[],coverAttachmentId:null},0),{code:'CONFLICT'});
  assert.equal(repository.data.attachments.get(file.id).state,'attached');assert.equal((await repository.read('tasks',task.id,task.projectId)).coverAttachmentId,file.id);
});
test('attachment transaction: failed disk write preserves task and staged file',async t=>{
  const {directory,repository,task,file}=await setup(t),prior=await readFile(path.join(directory,'records.json'),'utf8');
  const persist=repository.persist;repository.persist=async()=>{throw Error('synthetic disk failure');};
  await assert.rejects(repository.write('tasks',{...task,attachmentIds:[file.id],coverAttachmentId:file.id},0),/synthetic disk failure/);
  repository.persist=persist;assert.equal(repository.data.attachments.get(file.id).state,'staged');assert.equal(repository.data.tasks.has(task.id),false);
  assert.equal(await readFile(path.join(directory,'records.json'),'utf8'),prior);
});test('attachment transaction: generic attachment records cannot bypass validation',async t=>{
  const {repository,file}=await setup(t);
  await assert.rejects(repository.write('attachments',{...file,state:'attached'},file.revision),{code:'FILE_METHOD'});
  assert.equal(repository.data.attachments.get(file.id).state,'staged');
});
test('attachment transaction: file of another task or project is not attachable',async t=>{
  const {repository,task,file}=await setup(t);
  await assert.rejects(repository.write('tasks',{...task,id:'other-task',attachmentIds:[file.id]},0),{code:'TASK_FILE_ACCESS'});
  await assert.rejects(repository.write('tasks',{...task,projectId:'other-project',attachmentIds:[file.id]},0),{code:'TASK_FILE_ACCESS'});
  assert.equal(repository.data.tasks.size,0);assert.equal(repository.data.attachments.get(file.id).state,'staged');
});
