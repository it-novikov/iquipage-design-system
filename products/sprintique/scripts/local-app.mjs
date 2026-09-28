import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {gradle,java,SERVER_DIR} from './kotlin-server.mjs';
// The local reference stand: the production artifact against the owned PostgreSQL, Keycloak and Garage of
// output/infra. Migrations first, then the API and the restricted worker. The provider's private CA is trusted by
// the server for the provider only.
const root=resolve('output/infra'),identity=JSON.parse(await readFile(root+'/identity.json','utf8')),storage=JSON.parse(await readFile(root+'/storage.json','utf8'));
const url=(role,field)=>`postgresql://${role}:${identity.database[field]}@127.0.0.1:${identity.database.port}/sprintique`;
const env={...process.env,SPRINTIQUE_PUBLIC_ORIGIN:identity.origin,SPRINTIQUE_PORT:String(new URL(identity.origin).port),SPRINTIQUE_HOST:'127.0.0.1',
  SPRINTIQUE_ENVIRONMENT:'local',SPRINTIQUE_WEB_ROOT:resolve('dist'),
  SPRINTIQUE_OIDC_ISSUER:identity.issuer,SPRINTIQUE_OIDC_CLIENT_ID:identity.clientId,SPRINTIQUE_OIDC_CLIENT_SECRET:identity.clientSecret,SPRINTIQUE_OIDC_TRUST_FILE:root+'/ca.crt',
  SPRINTIQUE_MIGRATION_DATABASE_URL:url('sprintique_migrator','migrator'),SPRINTIQUE_DATABASE_RUNTIME_ROLE:'sprintique_app',SPRINTIQUE_DATABASE_WORKER_ROLE:'sprintique_worker',
  SPRINTIQUE_DATABASE_URL:url('sprintique_app','runtime'),SPRINTIQUE_WORKER_DATABASE_URL:url('sprintique_worker','worker'),
  SPRINTIQUE_STORAGE_ENDPOINT:storage.endpoint,SPRINTIQUE_STORAGE_REGION:storage.region,SPRINTIQUE_STORAGE_BUCKET:storage.bucket,
  SPRINTIQUE_STORAGE_ACCESS_KEY_ID:storage.accessKeyId,SPRINTIQUE_STORAGE_SECRET_ACCESS_KEY:storage.secretAccessKey};
gradle(['bootJar']);
const jar=join(SERVER_DIR,'build','libs','sprintique-server.jar');
const launch=command=>spawn(java(),['-jar',jar,command],{env,stdio:'inherit'});
const migration=launch('migrate');const code=await new Promise((resolveExit,reject)=>{migration.once('exit',resolveExit);migration.once('error',reject);});
if(code!==0)throw Error('Migration failed');
if(!process.argv.includes('--migrate-only')){
  const children=[launch('api'),launch('worker')];
  let stopping=false;const stop=()=>{if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  for(const child of children)child.once('exit',exitCode=>{if(!stopping){process.exitCode=exitCode||1;stop();}});
  console.log(`Sprintique local reference: ${identity.origin}; API + restricted worker; real OIDC and private S3.`);
}
