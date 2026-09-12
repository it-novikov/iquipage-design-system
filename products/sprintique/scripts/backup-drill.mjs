import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
import pg from 'pg';
import {Database} from '../build/backend/infrastructure/database.js';
import {S3ObjectStorage,objectKey} from '../build/backend/infrastructure/object-storage.js';
import {createApp} from '../build/backend/http/app.js';

// The local reference only. No arbitrary target, overwrite, restore-in-place or production mode.
const context='colima-sprintique-vnext-qa',source='sprintique-vnext-qa-postgres',root=resolve('output/infra');
const identity=JSON.parse(await readFile(root+'/identity.json','utf8')),storageConfig=JSON.parse(await readFile(root+'/storage.json','utf8'));
assert.equal(identity.origin,'http://localhost:4312');assert.equal(identity.database.port,54329);assert.equal(storageConfig.endpoint,'http://127.0.0.1:4900');
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
assert.equal(docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}',source),'vnext-qa');
assert.equal(docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}','sprintique-vnext-qa-garage'),'vnext-qa');
const sha=value=>createHash('sha256').update(value).digest('hex');
const runId=randomUUID(),target='sprintique-restore-'+runId,objectPrefix='restore-drill/'+runId+'/',backup=root+'/backups/'+runId;
const sourceDb=new pg.Client({host:'127.0.0.1',port:54329,user:'postgres',password:identity.database.admin,database:'sprintique'});
const objects=new S3ObjectStorage(storageConfig),written=[];
let created=false,restoredDb,api,restoredAdmin;
await sourceDb.connect();
async function fingerprints(client,schemas){
  const tables=(await client.query('SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1) ORDER BY schemaname,tablename',[schemas])).rows,result=[];
  for(const t of tables){
    assert.match(t.schemaname,/^[a-z_]+$/);assert.match(t.tablename,/^[a-z0-9_]+$/);
    const name='"'+t.schemaname+'"."'+t.tablename+'"',count=Number((await client.query('SELECT count(*) AS n FROM '+name)).rows[0].n);
    assert.ok(count<=50000,'Local drill is bounded to 50000 records per table; use streaming backup verification for larger deployments.');
    const data=(await client.query('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\') AS data FROM '+name+' t')).rows[0].data;
    result.push({table:t.schemaname+'.'+t.tablename,count,sha256:sha(JSON.stringify(data))});
  }
  return result;
}
try{
  const active=(await sourceDb.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename IN ('sprintique_app','sprintique_worker')")).rows[0].n;
  assert.equal(active,0,'Stop only the owned local API and worker before the consistency checkpoint.');
  let online=false;try{await fetch(identity.origin+'/health',{signal:AbortSignal.timeout(500)});online=true;}catch{}
  assert.equal(online,false,'Local API must remain stopped for backup consistency.');
  await mkdir(backup+'/objects',{recursive:true,mode:0o700});
  const manifest={schema:1,createdAt:new Date().toISOString(),localOnly:true,encrypted:false,files:[],objects:[],tables:await fingerprints(sourceDb,['app','auth','work'])};
  for(const database of ['sprintique','sprintique_identity']){
    const bytes=execFileSync('docker',['--context',context,'exec',source,'pg_dump','-U','postgres','-d',database,'-Fc'],{stdio:['ignore','pipe','pipe'],maxBuffer:128*1024*1024});
    const file=database+'.dump';await writeFile(backup+'/'+file,bytes,{mode:0o600,flag:'wx'});manifest.files.push({file,bytes:bytes.length,sha256:sha(bytes)});
  }
  const assets=(await sourceDb.query("SELECT project_id AS \"projectId\",id,sha256,image,mime FROM app.assets WHERE state IN ('ready','attached','detached') ORDER BY project_id,id")).rows;
  assert.ok(assets.length<=200,'Local drill is bounded to 200 assets.');
  for(const asset of assets)for(const variant of asset.image?['original','display','thumb']:['original']){
    const key=objectKey(asset,variant),bytes=await objects.get(key),file='objects/'+sha(key),mime=variant==='original'?asset.mime:'image/webp';
    await writeFile(backup+'/'+file,bytes,{mode:0o600,flag:'wx'});manifest.objects.push({key,file,mime,sha256:sha(bytes),bytes:bytes.length,projectId:asset.projectId,id:asset.id,variant});
  }
  assert.ok(manifest.objects.length>0,'The drill must include a real private file, not only empty storage.');
  await writeFile(backup+'/manifest.json',JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  assert.deepEqual(await fingerprints(sourceDb,['app','auth','work']),manifest.tables,'Canonical data changed during backup; discard this checkpoint.');
  docker('create','--name',target,'--label','sprintique.owner=restore-drill','--publish','127.0.0.1::5432','--memory','512m','--cpus','1','--env','POSTGRES_HOST_AUTH_METHOD=trust','postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af');created=true;docker('start',target);
  const port=Number(docker('port',target,'5432/tcp').split(':').at(-1));assert.ok(port);
  const url=(role,database='sprintique')=>`postgresql://${role}@127.0.0.1:${port}/${database}`;
  for(let attempt=0;attempt<60;attempt++){
    const client=new pg.Client({connectionString:url('postgres','postgres'),connectionTimeoutMillis:1000});
    try{await client.connect();restoredAdmin=client;break;}catch{await client.end().catch(()=>{});await setTimeout(500);}
  }
  assert.ok(restoredAdmin,'Isolated restore PostgreSQL did not start.');
  for(const role of ['sprintique_migrator','sprintique_app','sprintique_worker','sprintique_identity'])await restoredAdmin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);
  for(const [database,owner] of [['sprintique','sprintique_migrator'],['sprintique_identity','sprintique_identity']]){
    await restoredAdmin.query(`CREATE DATABASE ${database} OWNER ${owner}`);
    const file=manifest.files.find(f=>f.file===database+'.dump'),bytes=await readFile(backup+'/'+file.file);assert.equal(sha(bytes),file.sha256);
    execFileSync('docker',['--context',context,'exec','-i',target,'pg_restore','--exit-on-error','-U','postgres','-d',database],{input:bytes,stdio:['pipe','pipe','pipe'],maxBuffer:2*1024*1024});
  }
  await restoredAdmin.end();restoredAdmin=new pg.Client({connectionString:url('postgres')});await restoredAdmin.connect();
  assert.deepEqual(await fingerprints(restoredAdmin,['app','auth','work']),manifest.tables,'Restored canonical rows differ.');
  for(const file of manifest.objects){const bytes=await readFile(backup+'/'+file.file);assert.equal(sha(bytes),file.sha256);await objects.put(objectPrefix+file.key,bytes,file.mime);written.push(objectPrefix+file.key);assert.equal(sha(await objects.get(objectPrefix+file.key)),file.sha256);}
  const restoredStorage={ready:()=>objects.ready(),get:key=>objects.get(objectPrefix+key),put:async()=>{throw Error('Restore verification is read-only');},remove:async()=>{throw Error('Restore verification is read-only');}};
  restoredDb=new Database(url('sprintique_app'));await restoredDb.checkRuntimeRole();api=await createApp({db:restoredDb,origin:identity.origin,storage:restoredStorage});
  assert.equal((await api.inject('/ready')).statusCode,200);
  const state=JSON.parse(await readFile(root+'/oidc-browser-state.json','utf8')),cookie=state.cookies.find(c=>c.name==='__Host-sprintique');
  const headers={cookie:cookie.name+'='+cookie.value};const session=await api.inject({url:'/api/v1/session',headers});assert.equal(session.statusCode,200);
  const allowed=new Set(session.json().projects.map(p=>p.id));let authenticatedFiles=0;
  for(const file of manifest.objects.filter(f=>allowed.has(f.projectId))){const r=await api.inject({url:`/api/v1/projects/${file.projectId}/assets/${file.id}/${file.variant}`,headers});assert.equal(r.statusCode,200);assert.equal(sha(r.rawPayload),file.sha256);authenticatedFiles++;}
  assert.ok(authenticatedFiles>0);assert.equal((await api.inject('/api/v1/session')).statusCode,401);
  const identityDb=new pg.Client({connectionString:url('postgres','sprintique_identity')});await identityDb.connect();
  let identityUsers;try{identityUsers=Number((await identityDb.query('SELECT count(*) AS n FROM public.user_entity')).rows[0].n);assert.ok(identityUsers>0);}finally{await identityDb.end();}
  assert.deepEqual(await fingerprints(sourceDb,['app','auth','work']),manifest.tables,'Source changed during the isolated restore drill.');
  const evidence={date:new Date().toISOString(),backupId:runId,localOnly:true,canonicalTables:manifest.tables.length,canonicalRows:manifest.tables.reduce((n,t)=>n+t.count,0),dumpFiles:manifest.files.length,privateObjects:manifest.objects.length,authenticatedFiles,identityUsers,identityLoginAfterRestore:'NOT_RUN',sourceUnchanged:true,restoreIsolated:true,productionTouched:false};
  await writeFile(root+'/backup-verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{
  await api?.close();await restoredDb?.close();await restoredAdmin?.end();await sourceDb.end();
  for(const key of written)await objects.remove(key);objects.close();
  if(created){assert.equal(docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}',target),'restore-drill');docker('stop','--time','10',target);docker('rm','--volumes',target);}
}
