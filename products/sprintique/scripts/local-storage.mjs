import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {ensureOwnedVolume} from './local-resources.mjs';
// Explicitly isolated context; never selects/restarts the user's default Docker VM.
const context=process.env.SPRINTIQUE_DOCKER_CONTEXT||'colima-sprintique-vnext-qa',container='sprintique-vnext-qa-garage',root=resolve('output/infra');
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
await mkdir(root,{recursive:true,mode:0o700});
let settings;try{settings=JSON.parse(await readFile(root+'/storage.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(!settings){
  settings={endpoint:'http://127.0.0.1:4900',region:'garage',bucket:'sprintique-private',accessKeyId:'GK'+randomBytes(16).toString('hex'),secretAccessKey:randomBytes(32).toString('hex')};
  await writeFile(root+'/storage.json',JSON.stringify(settings),{mode:0o600,flag:'wx'});
  await writeFile(root+'/garage.toml',`metadata_dir = "/data/meta"
data_dir = "/data/objects"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "127.0.0.1:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "${randomBytes(32).toString('hex')}"
[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
`,{mode:0o600,flag:'wx'});
  await writeFile(root+'/garage.env',`GARAGE_DEFAULT_ACCESS_KEY=${settings.accessKeyId}\nGARAGE_DEFAULT_SECRET_KEY=${settings.secretAccessKey}\nGARAGE_DEFAULT_BUCKET=${settings.bucket}\n`,{mode:0o600,flag:'wx'});
}
const found=docker('ps','-a','--filter','name=^/'+container+'$','--format','{{.ID}}');
ensureOwnedVolume(docker,'sprintique-vnext-qa-garage-data',container);
if(!found){
  docker('create','--name',container,'--label','sprintique.owner=vnext-qa','--restart','no','--memory','512m','--cpus','1',
    '--publish','127.0.0.1:4900:3900','--env-file',root+'/garage.env','--volume','sprintique-vnext-qa-garage-data:/data',
    'dxflrs/garage@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690','/garage','server','--single-node','--default-bucket');
  docker('cp',root+'/garage.toml',container+':/etc/garage.toml');
}else if(docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}',container)!=='vnext-qa')throw Error('Refusing to use an unrelated container');
docker('start',container);
console.log(`Private local S3: ${settings.endpoint}; credentials saved mode 0600 in output/infra/storage.json. No public web/admin port.`);
