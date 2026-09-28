import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
import {resolve} from 'node:path';
const context='colima-sprintique-vnext-qa',name='sprintique-vnext-qa-container-check',root=resolve('output/infra');
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const identity=JSON.parse(await readFile(root+'/identity.json','utf8')),storage=JSON.parse(await readFile(root+'/storage.json','utf8'));
for(const target of ['sprintique-vnext-qa-postgres','sprintique-vnext-qa-garage'])if(docker('inspect','--format','{{index .Config.Labels "sprintique.owner"}}',target)!=='vnext-qa')throw Error('Unrelated service');
if(docker('ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}'))throw Error('Previous container check still exists; inspect it before removal');
const networks=JSON.parse(docker('inspect','--format','{{json .NetworkSettings.Networks}}','sprintique-vnext-qa-garage'));
if(!networks['sprintique-vnext-qa'])docker('network','connect','--alias','garage','sprintique-vnext-qa','sprintique-vnext-qa-garage');
const env={SPRINTIQUE_DATABASE_URL:`postgresql://sprintique_app:${identity.database.runtime}@postgres-qa:5432/sprintique`,SPRINTIQUE_PUBLIC_ORIGIN:identity.origin,SPRINTIQUE_OIDC_ISSUER:identity.issuer,SPRINTIQUE_OIDC_CLIENT_ID:identity.clientId,SPRINTIQUE_OIDC_CLIENT_SECRET:identity.clientSecret,
  SPRINTIQUE_STORAGE_ENDPOINT:'http://garage:3900',SPRINTIQUE_STORAGE_REGION:storage.region,SPRINTIQUE_STORAGE_BUCKET:storage.bucket,SPRINTIQUE_STORAGE_ACCESS_KEY_ID:storage.accessKeyId,SPRINTIQUE_STORAGE_SECRET_ACCESS_KEY:storage.secretAccessKey};
await writeFile(root+'/container-check.env',Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
// The image Jib built from the server's production artifact (npm run build, then jibBuildTar), loaded into the owned
// Docker context only.
const image='sprintique-server:2.0.0-alpha.0';
execFileSync('docker',['--context',context,'load','--input','server/build/jib-image.tar'],{stdio:['ignore','pipe','pipe']});
let created=false;
try{
  docker('create','--name',name,'--label','sprintique.owner=vnext-qa','--network','sprintique-vnext-qa','--publish','127.0.0.1:4313:4311','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--cpus','1','--env-file',root+'/container-check.env',image);created=true;
  docker('start',name);let ready=false;
  for(let n=0;n<30;n++){try{const r=await fetch('http://127.0.0.1:4313/ready',{signal:AbortSignal.timeout(2000)});if(r.ok){ready=true;break;}}catch{}await setTimeout(500);}
  if(!ready)throw Error('Container readiness failed; inspect owned container logs without environment values');
  const state=JSON.parse(await readFile(root+'/oidc-browser-state.json','utf8')),cookie=state.cookies.find(c=>c.name==='__Host-sprintique');
  const response=await fetch('http://127.0.0.1:4313/api/v1/session',{headers:{Cookie:cookie.name+'='+cookie.value}});
  if(!response.ok)throw Error('Real session did not authenticate in the container');
  const session=await response.json();if(!session.projects.some(p=>p.slug==='oidc-qa'))throw Error('Container did not read persisted project');
  const uid=docker('exec',name,'id','-u');if(uid==='0')throw Error('Container must not run as root');
  const denied=await fetch('http://127.0.0.1:4313/api/v1/session');if(denied.status!==401)throw Error('Unauthenticated request was not rejected');
  const spec=await fetch('http://127.0.0.1:4313/openapi.json');if(!spec.ok)throw Error('OpenAPI not packaged');
  const imageId=docker('image','inspect','--format','{{.Id}}',image);
  await writeFile(root+'/container-verification.json',JSON.stringify({date:new Date().toISOString(),image:imageId,uid:Number(uid),readOnly:true,capabilitiesDropped:true,ready:true,realSession:true,oidcLoginInsideContainer:'NOT_RUN',unauthenticatedDenied:true,openapi:true},null,2));
  console.log('PASS: container runs non-root/read-only without capabilities; schema + real PostgreSQL/S3 readiness, real session and denied anonymous request.');
}finally{if(created){docker('stop','--time','10',name);docker('rm',name);}}
