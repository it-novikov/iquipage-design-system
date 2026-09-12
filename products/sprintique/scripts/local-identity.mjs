import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import pg from 'pg';
import {ensureOwnedVolume} from './local-resources.mjs';
const context='colima-sprintique-vnext-qa',network='sprintique-vnext-qa',root=resolve('output/infra');
const postgres='sprintique-vnext-qa-postgres',keycloak='sprintique-vnext-qa-keycloak';
const images={postgres:'postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af',keycloak:'quay.io/keycloak/keycloak@sha256:ff4257d0d64efbe99ed1ddfaf07765cc3c36dc7518bf8324d41961327f441c54'};
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const random=()=>randomBytes(32).toString('hex');
await mkdir(root,{recursive:true,mode:0o700});
let config;try{config=JSON.parse(await readFile(root+'/identity.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(!config){
  config={issuer:'https://localhost:9443/realms/sprintique',clientId:'sprintique',clientSecret:random(),origin:'http://localhost:4312',
    database:{port:54329,admin:random(),migrator:random(),runtime:random(),worker:random(),keycloak:random()},
    testUser:{username:'sprintique-qa',password:random()},images};
  await writeFile(root+'/identity.json',JSON.stringify(config),{mode:0o600,flag:'wx'});
}
// Generated private CA is trusted only by the child Node process; never alter system trust.
try{await readFile(root+'/localhost.crt');}catch(error){
  if(error.code!=='ENOENT')throw error;
  const openssl=(...args)=>execFileSync('openssl',args,{stdio:['ignore','pipe','pipe']});
  openssl('req','-x509','-newkey','rsa:3072','-sha256','-days','30','-nodes','-subj','/CN=Sprintique isolated QA CA','-keyout',root+'/ca.key','-out',root+'/ca.crt');
  openssl('req','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout',root+'/localhost.key','-out',root+'/localhost.csr');
  await writeFile(root+'/localhost.ext','subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',{mode:0o600});
  openssl('x509','-req','-in',root+'/localhost.csr','-CA',root+'/ca.crt','-CAkey',root+'/ca.key','-set_serial','1','-days','30','-sha256','-extfile',root+'/localhost.ext','-out',root+'/localhost.crt');
  await chmod(root+'/ca.key',0o600);await chmod(root+'/localhost.key',0o600);
}
if(!docker('network','ls','--filter','name=^'+network+'$','--format','{{.Name}}'))docker('network','create','--label','sprintique.owner=vnext-qa',network);
else if(docker('network','inspect','--format','{{index .Labels "sprintique.owner"}}',network)!=='vnext-qa')throw Error('Unrelated network');
function owned(name){const found=docker('ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}');if(found&&docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}',name)!=='vnext-qa')throw Error('Unrelated container');return !!found;}
if(!owned(postgres)){
  ensureOwnedVolume(docker,'sprintique-vnext-qa-postgres-data',postgres);
  await writeFile(root+'/postgres.env',`POSTGRES_PASSWORD=${config.database.admin}\n`,{mode:0o600});
  docker('create','--name',postgres,'--label','sprintique.owner=vnext-qa','--restart','no','--network',network,'--network-alias','postgres-qa','--memory','512m','--cpus','1','--publish','127.0.0.1:54329:5432','--env-file',root+'/postgres.env','--volume','sprintique-vnext-qa-postgres-data:/var/lib/postgresql',images.postgres);
}
docker('start',postgres);
let admin;
for(let attempt=0;attempt<30;attempt++){
  const candidate=new pg.Client({host:'127.0.0.1',port:54329,user:'postgres',password:config.database.admin,database:'postgres',connectionTimeoutMillis:2000});
  try{await candidate.connect();admin=candidate;break;}catch{await candidate.end().catch(()=>{});await setTimeout(1000);}
}
if(!admin)throw Error('Local PostgreSQL did not become ready');
try{
  for(const [role,field] of [['sprintique_migrator','migrator'],['sprintique_app','runtime'],['sprintique_worker','worker'],['sprintique_identity','keycloak']]){
    if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){
      // Fixed identifiers and locally generated hexadecimal passwords, never caller SQL.
      if(!/^[a-f0-9]{64}$/.test(config.database[field]))throw Error('Unexpected generated credential');
      await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${config.database[field]}'`);
    }
  }
  for(const [name,owner] of [['sprintique','sprintique_migrator'],['sprintique_identity','sprintique_identity']])if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)await admin.query(`CREATE DATABASE ${name} OWNER ${owner}`);
}finally{await admin.end();}
if(!owned(keycloak)){
  const realm={realm:'sprintique',enabled:true,registrationAllowed:false,resetPasswordAllowed:false,sslRequired:'all',bruteForceProtected:true,
    clients:[{clientId:config.clientId,enabled:true,publicClient:false,secret:config.clientSecret,standardFlowEnabled:true,directAccessGrantsEnabled:false,serviceAccountsEnabled:false,
      redirectUris:[config.origin+'/auth/callback'],webOrigins:[config.origin],attributes:{'pkce.code.challenge.method':'S256'},defaultClientScopes:['profile']}],
    users:[{username:config.testUser.username,enabled:true,email:'sprintique-qa@example.invalid',firstName:'Sprintique',lastName:'QA',credentials:[{type:'password',value:config.testUser.password,temporary:false}]}]};
  await writeFile(root+'/sprintique-realm.json',JSON.stringify(realm),{mode:0o600});
  await writeFile(root+'/keycloak.env',`KC_DB=postgres\nKC_DB_URL=jdbc:postgresql://postgres-qa:5432/sprintique_identity\nKC_DB_USERNAME=sprintique_identity\nKC_DB_PASSWORD=${config.database.keycloak}\nKC_HOSTNAME=https://localhost:9443\nKC_HTTP_ENABLED=false\nKC_HTTPS_PORT=9443\nKC_HTTPS_CERTIFICATE_FILE=/opt/keycloak/conf/localhost.crt\nKC_HTTPS_CERTIFICATE_KEY_FILE=/opt/keycloak/conf/localhost.key\nKC_HEALTH_ENABLED=true\n`,{mode:0o600});
  docker('create','--name',keycloak,'--label','sprintique.owner=vnext-qa','--restart','no','--network',network,'--memory','1400m','--cpus','1','--publish','127.0.0.1:9443:9443','--env-file',root+'/keycloak.env',images.keycloak,'start','--import-realm');
}
if(docker('inspect','--format','{{.State.Status}}',keycloak)==='created'){
  // Archive ownership is explicit before startup; no race or world-readable private key.
  const bundle=root+'/keycloak-bundle';await mkdir(bundle+'/conf',{recursive:true,mode:0o700});await mkdir(bundle+'/data/import',{recursive:true,mode:0o700});
  for(const [from,to] of [['localhost.crt','conf/localhost.crt'],['localhost.key','conf/localhost.key'],['sprintique-realm.json','data/import/sprintique-realm.json']])await writeFile(bundle+'/'+to,await readFile(root+'/'+from),{mode:0o600});
  const archive=execFileSync('tar',['--no-xattrs','--no-acls','--no-fflags','--uid','1000','--gid','0','-cf','-','-C',bundle,'conf','data'],{env:{...process.env,COPYFILE_DISABLE:'1'},stdio:['ignore','pipe','pipe']});
  execFileSync('docker',['--context',context,'cp','-a','-',keycloak+':/opt/keycloak'],{input:archive,stdio:['pipe','pipe','pipe']});
}
docker('start',keycloak);
console.log('Isolated PostgreSQL: 127.0.0.1:54329; Keycloak HTTPS: localhost:9443. Startup may take a minute. Credentials: output/infra/identity.json (0600); no system trust changes.');
