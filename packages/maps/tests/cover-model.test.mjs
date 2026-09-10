import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareAttachment} from '../server/attachment-images.mjs';
import {attachmentMetadata,validateTaskAttachments,commitTaskAttachments,sameAttachment,inspectFile} from '../src/board/attachment-model.js';
const task={id:'task-cover',projectId:'project-cover',attachmentIds:[],coverAttachmentId:null};
const processed={name:'sample.png',mime:'image/png',size:100,image:true,previewMime:'image/webp',sha256:'a'.repeat(64)};
const asset=()=>attachmentMetadata({id:'file-cover',taskId:task.id,projectId:task.projectId},processed,'local-user');
test('cover is optional on new and legacy tasks',()=>{validateTaskAttachments(task,null);validateTaskAttachments({id:task.id,projectId:task.projectId},null);});
test('cover must be an image among attachments of this task',()=>{
  const value={...task,attachmentIds:['file-cover'],coverAttachmentId:'file-cover'};
  validateTaskAttachments(value,null,[asset()]);
  for(const invalid of [{...asset(),taskId:'other'},{...asset(),projectId:'other'},{...asset(),image:false}])assert.throws(()=>validateTaskAttachments(value,null,[invalid]));
  assert.throws(()=>validateTaskAttachments({...value,attachmentIds:[]},null,[asset()]));
});
test('removing a cover retains the file; removing the attachment detaches it',()=>{
  const value={...task,attachmentIds:['file-cover'],coverAttachmentId:'file-cover'};
  const attached=commitTaskAttachments(value,null,[asset()]);assert.equal(attached[0].state,'attached');
  assert.equal(commitTaskAttachments({...value,coverAttachmentId:null},value,attached)[0].state,'attached');
  assert.equal(commitTaskAttachments(task,value,attached)[0].state,'detached');
});
test('same upload identity rejects changed content',()=>{const a=asset();assert.equal(sameAttachment(a,asset()),a);assert.throws(()=>sameAttachment(a,{...a,sha256:'b'.repeat(64)}));});
test('image preparation generates bounded real WebP derivatives',async()=>{
  const bytes=await sharp({create:{width:1800,height:900,channels:3,background:'#345678'}}).png().toBuffer();
  const result=await prepareAttachment('sample.png',bytes);assert.equal(result.metadata.previewMime,'image/webp');
  assert.equal((await sharp(result.blobs.thumb).metadata()).width,640);assert.equal((await sharp(result.blobs.display).metadata()).width,1600);
  assert.deepEqual(result.blobs.original,bytes);
});
test('spoofed image contents and path-like names are rejected',()=>{for(const name of ['sample.png','../sample.txt','page.html'])assert.throws(()=>inspectFile(name,new TextEncoder().encode('not an image')));});
