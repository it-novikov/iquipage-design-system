import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
import pg from 'pg';
import {ensureOwnedVolume} from './local-resources.mjs';
import {MAIL_DEFAULTS,STAND_ROOT as root,readStand} from './stand-config.mjs';
// The local reference stand's services in the owned Docker context: PostgreSQL and Mailpit, an SMTP relay that keeps
// every letter for reading (sign-in codes) instead of delivering it. Both listen on loopback only.
const context='colima-sprintique-vnext-qa',network='sprintique-vnext-qa';
const postgres='sprintique-vnext-qa-postgres',mailpit='sprintique-vnext-qa-mailpit';
const images={postgres:'postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af',
  // axllent/mailpit v1.31.3
  mailpit:'axllent/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d'};
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const random=()=>randomBytes(32).toString('hex');
await mkdir(root,{recursive:true,mode:0o700});
let config;try{config=await readStand();}catch(error){if(!/No local stand settings/.test(error.message))throw error;}
config??={origin:'http://localhost:4312',database:{port:54329,admin:random(),migrator:random(),runtime:random(),worker:random()},mail:MAIL_DEFAULTS};
// stand.json keeps the same generated values on every run.
await writeFile(root+'/stand.json',JSON.stringify({...config,images}),{mode:0o600,flag:'w'});
if(!docker('network','ls','--filter','name=^'+network+'$','--format','{{.Name}}'))docker('network','create','--label','sprintique.owner=vnext-qa',network);
else if(docker('network','inspect','--format','{{index .Labels "sprintique.owner"}}',network)!=='vnext-qa')throw Error('Unrelated network');
function owned(name){const found=docker('ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}');if(found&&docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}',name)!=='vnext-qa')throw Error('Unrelated container');return !!found;}
if(!owned(postgres)){
  ensureOwnedVolume(docker,'sprintique-vnext-qa-postgres-data',postgres);
  await writeFile(root+'/postgres.env',`POSTGRES_PASSWORD=${config.database.admin}\n`,{mode:0o600});
  docker('create','--name',postgres,'--label','sprintique.owner=vnext-qa','--restart','no','--network',network,'--network-alias','postgres-qa','--memory','512m','--cpus','1','--publish',`127.0.0.1:${config.database.port}:5432`,'--env-file',root+'/postgres.env','--volume','sprintique-vnext-qa-postgres-data:/var/lib/postgresql',images.postgres);
}
docker('start',postgres);
if(!owned(mailpit)){
  docker('create','--name',mailpit,'--label','sprintique.owner=vnext-qa','--restart','no','--network',network,'--network-alias','mailpit-qa','--memory','128m','--cpus','0.5',
    '--publish',`127.0.0.1:${config.mail.smtpPort}:1025`,'--publish',`127.0.0.1:${config.mail.apiPort}:8025`,images.mailpit);
}
docker('start',mailpit);
let admin;
for(let attempt=0;attempt<30;attempt++){
  const candidate=new pg.Client({host:'127.0.0.1',port:config.database.port,user:'postgres',password:config.database.admin,database:'postgres',connectionTimeoutMillis:2000});
  try{await candidate.connect();admin=candidate;break;}catch{await candidate.end().catch(()=>{});await setTimeout(1000);}
}
if(!admin)throw Error('Local PostgreSQL did not become ready');
try{
  for(const [role,field] of [['sprintique_migrator','migrator'],['sprintique_app','runtime'],['sprintique_worker','worker']]){
    if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){
      // Fixed identifiers and locally generated hexadecimal passwords, never caller SQL.
      if(!/^[a-f0-9]{64}$/.test(config.database[field]))throw Error('Unexpected generated credential');
      await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${config.database[field]}'`);
    }
  }
  if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='sprintique'")).rowCount)await admin.query('CREATE DATABASE sprintique OWNER sprintique_migrator');
}finally{await admin.end();}
console.log(`Isolated PostgreSQL: 127.0.0.1:${config.database.port}; SMTP relay: 127.0.0.1:${config.mail.smtpPort}, letters at http://127.0.0.1:${config.mail.apiPort}. Settings: output/infra/stand.json (0600); no system trust changes.`);
