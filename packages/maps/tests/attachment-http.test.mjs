import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {referenceServer} from './server-fixture.mjs';
import {createTask} from '../src/tasks.js';

const headers={'Content-Type':'application/octet-stream','X-Maps-Client':'reference'};
test('HTTP attachments: staged upload, task commit, variants, replacement and access isolation',async t=>{
  const api=await referenceServer(t),task=createTask({projectId:'files-http',title:'Обложка HTTP'});
  const bytes=await sharp({create:{width:960,height:480,channels:3,background:'#336688'}}).png().toBuffer();
  const endpoint=id=>`${api.base}/api/files/${id}?projectId=${task.projectId}&taskId=${task.id}&name=cover.png`;
  assert.equal((await api.get('/capabilities')).attachments,true);
  const response=await fetch(endpoint('cover-1'),{method:'PUT',headers,body:bytes});assert.equal(response.status,200);
  const file=await response.json();assert.equal(file.state,'staged');assert.equal(file.image,true);
  assert.equal((await api.get('/records/tasks?projectId='+task.projectId)).length,0);
  const retry=await fetch(endpoint('cover-1'),{method:'PUT',headers,body:bytes});assert.equal((await retry.json()).id,file.id);
  const changed=await fetch(endpoint('cover-1').replace('cover.png','other.png'),{method:'PUT',headers,body:bytes});assert.equal(changed.status,409);
  let saved=await api.put('tasks',{...task,attachmentIds:[file.id],coverAttachmentId:file.id});
  const binary=variant=>`${api.base}/api/files/${file.id}/${variant}?projectId=${task.projectId}&taskId=${task.id}`;
  const thumb=await fetch(binary('thumb'));assert.equal(thumb.headers.get('content-type'),'image/webp');
  const dimensions=await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();assert.ok(dimensions.width<=640);
  const original=await fetch(binary('original'));assert.equal(original.headers.get('content-type'),'application/octet-stream');
  assert.ok(original.headers.get('content-disposition').startsWith('attachment;'));assert.equal(original.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes);
  assert.equal((await fetch(binary('original').replace('files-http','foreign'))).status,403);
  assert.equal((await fetch(api.base+'/api/records/attachments?projectId='+task.projectId)).status,404);
  saved=await api.put('tasks',{...saved,coverAttachmentId:null});assert.equal((await fetch(binary('original'))).status,200);
  saved=await api.put('tasks',{...saved,attachmentIds:[]});assert.equal((await fetch(binary('original'))).status,403);
});
test('HTTP attachments: invalid files and untrusted writes cannot create metadata',async t=>{
  const api=await referenceServer(t),base=api.base+'/api/files/bad?projectId=files-http&taskId=new-task&name=';
  for(const name of ['bad.png','bad.svg','../bad.txt','constructor']){
    const response=await fetch(base+encodeURIComponent(name),{method:'PUT',headers,body:'not an image'});assert.equal(response.status,400,name);
  }
  let response=await fetch(base+'safe.txt',{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:'hello'});assert.equal(response.status,403);
  response=await fetch(base+'safe.txt',{method:'PUT',headers:{...headers,Origin:'https://outside.example'},body:'hello'});assert.equal(response.status,403);
  response=await fetch(base+'safe.txt',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,400);
  response=await fetch(base+'safe.txt',{method:'PUT',headers,body:''});assert.equal(response.status,400);
  assert.equal((await fetch(base+'safe.txt')).status,403);
});
test('HTTP attachments: temporary upload can be discarded without a task',async t=>{
  const api=await referenceServer(t),endpoint=api.base+'/api/files/staged-doc?projectId=files-http&taskId=draft&name=notes.md';
  let response=await fetch(endpoint,{method:'PUT',headers,body:'## Notes'});assert.equal(response.status,200);
  assert.equal((await response.json()).image,false);
  response=await fetch(endpoint,{method:'DELETE',headers:{'X-Maps-Client':'reference'}});assert.equal(response.status,200);
  assert.equal((await response.json()).discarded,true);
  assert.equal((await fetch(endpoint)).status,403);
  assert.equal((await api.get('/records/tasks?projectId=files-http')).length,0);
});
