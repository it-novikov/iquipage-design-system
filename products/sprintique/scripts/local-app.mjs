import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=resolve('output/infra'),identity=JSON.parse(await readFile(root+'/identity.json','utf8')),storage=JSON.parse(await readFile(root+'/storage.json','utf8'));
const url=(role,field)=>`postgresql://${role}:${identity.database[field]}@127.0.0.1:${identity.database.port}/sprintique`;
const env={...process.env,NODE_EXTRA_CA_CERTS:root+'/ca.crt',PUBLIC_ORIGIN:identity.origin,PORT:String(new URL(identity.origin).port),HOST:'127.0.0.1',
  OIDC_ISSUER:identity.issuer,OIDC_CLIENT_ID:identity.clientId,OIDC_CLIENT_SECRET:identity.clientSecret,
  MIGRATION_DATABASE_URL:url('sprintique_migrator','migrator'),DATABASE_RUNTIME_ROLE:'sprintique_app',DATABASE_WORKER_ROLE:'sprintique_worker',
  DATABASE_URL:url('sprintique_app','runtime'),WORKER_DATABASE_URL:url('sprintique_worker','worker'),
  S3_ENDPOINT:storage.endpoint,S3_REGION:storage.region,S3_BUCKET:storage.bucket,S3_ACCESS_KEY_ID:storage.accessKeyId,S3_SECRET_ACCESS_KEY:storage.secretAccessKey};
const launch=(file)=>spawn(process.execPath,[file],{env,stdio:'inherit'});
const migration=launch('build/backend/migrate.js');const code=await new Promise((resolve,reject)=>{migration.once('exit',resolve);migration.once('error',reject);});
if(code!==0)throw Error('Migration failed');
if(!process.argv.includes('--migrate-only')){
const children=[launch('build/backend/main.js'),launch('build/backend/worker.js')];
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
for(const child of children)child.once('exit',code=>{if(!stopping){process.exitCode=code||1;stop();}});
console.log(`Sprintique local reference: ${identity.origin}; API + restricted worker; real OIDC and private S3.`);
}
