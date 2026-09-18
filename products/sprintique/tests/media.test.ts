import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {fixture} from './fixture.js';
import {S3ObjectStorage} from '../backend/infrastructure/object-storage.js';
import {objectKey} from '../backend/application/media.js';
let f:Awaited<ReturnType<typeof fixture>>,storage:S3ObjectStorage;
before(async()=>{
  // Real S3-compatible service is mandatory: no in-memory fallback or skipped integration test.
  storage=new S3ObjectStorage(JSON.parse(await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8')));
  await storage.ready();f=await fixture({prefix:'F',storage});
});
after(async()=>{
  if(f){const rows=(await f.admin.query('SELECT id,project_id AS "projectId",sha256 FROM app.assets WHERE project_id=$1',[f.first.id])).rows;
    for(const row of rows)for(const variant of ['original','display','thumb'])await storage.remove(objectKey(row as {id:string;projectId:string;sha256:string},variant));await f.close();}
  storage?.close();
});
const path=(resource:string)=>`/api/v1/projects/${f.first.id}/${resource}`;
async function reserve(id:string,name:string,bytes:Buffer,targetId='file-task',headers=f.alice.headers){return f.app.inject({method:'POST',url:path('assets'),headers:{...headers,'idempotency-key':'reserve-'+id},payload:{id,name,targetType:'task',targetId,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});}
async function upload(id:string,bytes:Buffer,headers=f.alice.headers){return f.app.inject({method:'PUT',url:path('assets/'+id+'/content'),headers:{...headers,'content-type':'application/octet-stream'},payload:bytes});}
async function putTask(id:string,revision:number,content:Record<string,unknown>){return f.app.inject({method:'PUT',url:path('tasks/'+id),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:revision,task:{title:'Файлы задачи',...content}}});}
const get=(id:string,headers=f.alice.headers,variant='')=>f.app.inject({method:'GET',url:path('assets/'+id+(variant?'/'+variant:'')),headers});
test('F01 real private S3: stage, digest, download isolation, atomic task link and detach',async()=>{
  const bytes=Buffer.from('Private UTF-8 content');const staged=await reserve('text-file','notes.md',bytes);assert.equal(staged.statusCode,200,staged.body);
  const uploaded=await upload('text-file',bytes);assert.equal(uploaded.statusCode,200,uploaded.body);assert.equal(uploaded.json().state,'staged');
  assert.equal((await get('text-file',f.reader.headers)).statusCode,404);assert.equal((await get('text-file',f.bob.headers)).statusCode,404);
  const binary=await get('text-file',f.alice.headers,'original');assert.equal(binary.statusCode,200,binary.body);assert.equal(binary.body,bytes.toString());assert.match(String(binary.headers['content-disposition']),/^attachment;/);assert.equal(binary.headers['x-content-type-options'],'nosniff');
  const saved=await putTask('file-task',0,{attachmentIds:['text-file']});assert.equal(saved.statusCode,200,saved.body);assert.deepEqual(saved.json().attachmentIds,['text-file']);
  assert.equal((await get('text-file',f.reader.headers,'original')).statusCode,200);
  const copied=await putTask('wrong-task',0,{attachmentIds:['text-file']});assert.equal(copied.statusCode,422);
  assert.equal((await putTask('file-task',1,{})).statusCode,200);assert.equal((await get('text-file')).statusCode,404);
});
test('F02 full image decode, WebP variants and cover crop survive a new S3 client',async()=>{
  const bytes=await sharp({create:{width:320,height:180,channels:3,background:'#c3a7cb'}}).png().toBuffer();
  assert.equal((await reserve('cover-file','cover.png',bytes,'cover-task')).statusCode,200);
  const uploaded=await upload('cover-file',bytes);assert.equal(uploaded.statusCode,200,uploaded.body);assert.equal(uploaded.json().previewMime,'image/webp');assert.equal(uploaded.json().width,320);
  const preview=await get('cover-file',f.alice.headers,'display');assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.headers['content-type'],'image/webp');
  assert.equal((await sharp(preview.rawPayload).metadata()).format,'webp');
  const value={attachmentIds:['cover-file'],coverAttachmentId:'cover-file',coverCrop:{attachmentId:'cover-file',x:0,y:0,width:1,height:1}};
  assert.equal((await putTask('cover-task',0,value)).statusCode,200);
  const fresh=new S3ObjectStorage(JSON.parse(await readFile(process.env['TEST_S3_CONFIG']||'output/infra/storage.json','utf8')));
  try{const content=await fresh.get(objectKey({projectId:f.first.id,id:'cover-file',sha256:uploaded.json().sha256},'original'));assert.deepEqual(Buffer.from(content),bytes);}finally{fresh.close();}
  assert.equal((await putTask('cover-task',1,{...value,coverCrop:{...value.coverCrop,width:2}})).statusCode,400);
});
test('F03 spoofed type, malformed images, changed bytes and foreign completion are rejected and quarantined',async()=>{
  const bytes=Buffer.from('not an image');await reserve('bad-image','bad.png',bytes);const bad=await upload('bad-image',bytes);assert.equal(bad.statusCode,422);assert.equal(bad.json().code,'FILE_CONTENT');
  const row=(await f.admin.query('SELECT state FROM app.assets WHERE project_id=$1 AND id=$2',[f.first.id,'bad-image'])).rows[0];assert.equal(row!['state'],'quarantined');
  assert.equal((await get('bad-image')).statusCode,404);
  await reserve('changed','notes.txt',bytes);assert.equal((await upload('changed',Buffer.from('different'))).statusCode,422);
  const truncated=Buffer.from([137,80,78,71,13,10,26,10,0]);await reserve('truncated','bad.png',truncated);assert.equal((await upload('truncated',truncated)).json().code,'IMAGE_DECODE');
  await reserve('foreign','notes.txt',bytes);assert.equal((await upload('foreign',bytes,f.reader.headers)).statusCode,403);
  assert.equal((await upload('foreign',bytes,f.bob.headers)).statusCode,404);
});
test('F04 a task failure cannot attach a staged asset or publish a receipt',async()=>{
  const bytes=Buffer.from('atomic attachment');await reserve('rollback-file','test.txt',bytes,'rollback-task');await upload('rollback-file',bytes);
  const result=await putTask('rollback-task',0,{attachmentIds:['rollback-file'],coverAttachmentId:'rollback-file'});assert.equal(result.statusCode,422);
  assert.equal((await get('rollback-file')).json().state,'staged');
  assert.equal((await f.app.inject({method:'GET',url:path('tasks/rollback-task'),headers:f.alice.headers})).statusCode,404);
});
test('F05 map image linking is target-scoped, atomic, and immutable versions retain their private image',async()=>{
  const bytes=await sharp({create:{width:240,height:160,channels:3,background:'#c3a7cb'}}).png().toBuffer(),id='map-image-history';
  const reservation=await f.app.inject({method:'POST',url:path('assets'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{id,name:'map.png',targetType:'map',targetId:'image-map',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});assert.equal(reservation.statusCode,200,reservation.body);
  assert.equal((await upload(id,bytes)).statusCode,200);
  const image={id:'image',type:'image',assetId:id,text:'Схема',x:0,y:0,width:240,height:160,color:'neutral'};
  const value={title:'Изображение карты',kind:'permanent',status:'active',document:{schema:'iquipage.whiteboard/1',title:'Карта',revision:0,objects:[image],connections:[]}};
  const save=(mapId:string,baseRevision:number,v:unknown)=>f.app.inject({method:'PUT',url:path('maps/'+mapId),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision,value:v}});
  assert.equal((await save('wrong-image-map',0,value)).statusCode,422);assert.equal((await get(id)).json().state,'staged');
  const saved=await save('image-map',0,value);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().document.objects[0].assetId,id);assert.ok(!saved.body.includes('data:image'));
  assert.equal((await get(id,f.reader.headers,'display')).statusCode,200);
  assert.equal((await save('image-map',1,{...value,document:{...value.document,objects:[]}})).statusCode,200);
  assert.equal((await get(id,f.reader.headers,'display')).statusCode,200);
  const history=await f.app.inject({method:'GET',url:path('maps/image-map/history/1'),headers:f.reader.headers});assert.equal(history.statusCode,200,history.body);assert.equal(history.json().document.objects[0].assetId,id);
  const page=await f.app.inject({method:'GET',url:path('maps/image-map/history'),headers:f.reader.headers});assert.deepEqual(page.json().items.map((r:{revision:number})=>r.revision),[2,1]);
  assert.equal((await f.app.inject({method:'GET',url:path('maps/image-map/history/1'),headers:f.bob.headers})).statusCode,404);
});
test('F06 square project avatar uses private S3, is atomically attached, and detachment schedules cleanup',async()=>{
  const bytes=await sharp({create:{width:64,height:64,channels:3,background:'#c3a7cb'}}).webp().toBuffer(),id='project-avatar';
  const reserved=await f.app.inject({method:'POST',url:path('assets'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{id,name:'avatar.webp',targetType:'project-avatar',targetId:f.first.id,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}});assert.equal(reserved.statusCode,200,reserved.body);
  assert.equal((await upload(id,bytes)).statusCode,200);
  const update=(revision:number,avatarAssetId:string|null)=>f.app.inject({method:'PUT',url:path('profile'),headers:{...f.alice.headers,'idempotency-key':randomUUID()},payload:{baseRevision:revision,name:'С аватаром',avatarAssetId}});
  const result=await update(1,id);assert.equal(result.statusCode,200,result.body);assert.equal((await get(id,f.reader.headers,'thumb')).statusCode,200);
  const session=(await f.app.inject({method:'GET',url:'/api/v1/session',headers:f.reader.headers})).json();assert.equal(session.projects[0].avatarAssetId,id);
  assert.equal((await update(2,null)).statusCode,200);assert.equal((await get(id,f.reader.headers,'thumb')).statusCode,404);
  const jobs=(await f.admin.query("SELECT 1 FROM work.jobs WHERE project_id=$1 AND payload->>'assetId'=$2",[f.first.id,id])).rows;assert.ok(jobs.length>=2);
});
