/** PN2 acceptance of the consumer/fixture slice, not a production-backend verdict. */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),maps=path.resolve(root,'../maps'),repo=path.resolve(root,'../..'),out=path.join(root,'evidence');
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fingerprint(){const files=[];async function walk(dir){for(const item of await readdir(path.join(root,dir),{withFileTypes:true})){const name=path.join(dir,item.name);if(item.isDirectory())await walk(name);else files.push(name);}}for(const dir of ['src','types','demo','tests','scripts'])await walk(dir);files.push('package.json','package-lock.json');const entries=[];for(const name of files.sort())entries.push([name,sha(await readFile(path.join(root,name)))]);return {sha256:sha(JSON.stringify(entries)),files:entries};}
await mkdir(out,{recursive:true});const baseline=await fingerprint(),checks=[],startedAt=new Date().toISOString();let failure;
function execute(name,args,cwd=root){const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:240000,maxBuffer:24*1024*1024});const log=(result.stdout||'')+(result.stderr||'');checks.push({name,exitCode:result.status,error:result.error?.message});return {result,log};}
async function run(name,args,cwd=root){const {result,log}=execute(name,args,cwd);await writeFile(path.join(out,name+'.log'),log);if(result.status!==0)throw Error(name+' failed: '+(result.error?.message||result.status));console.log('PASS',name);return log;}
let nodeTests=0,baseNodeTests=0,browserScenarios=0;
try{
 const manifest=await readFile(path.join(repo,'design-system/MANIFEST.sha256'),'utf8');
 if(sha(manifest)!=='f252a499e00d7bab6088640126a406075a86bf109e673a257a002d8e90e9195c')throw Error('Unrecognized DS baseline');
 for(const line of manifest.trim().split('\n')){const [hash,...segments]=line.split('  ');const name=segments.join('  ');if(!name||path.isAbsolute(name)||name.split('/').includes('..')||sha(await readFile(path.join(repo,'design-system',name)))!==hash)throw Error('DS integrity failed: '+name);}
 checks.push({name:'pinned-ds-integrity',exitCode:0,files:manifest.trim().split('\n').length});
 await run('base-build',['scripts/build.mjs'],maps);
 const tests=(await readdir(path.join(root,'tests'))).filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x);
 nodeTests=Number((await run('unit',['--test','--test-reporter=tap',...tests])).match(/^# tests (\d+)$/m)?.[1]);
 await run('consumer-types',['node_modules/typescript/bin/tsc','-p','tests/tsconfig.json']);
 const baseTests=(await readdir(path.join(maps,'tests'))).filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x);
 baseNodeTests=Number((await run('base-unit',['--test','--test-reporter=tap',...baseTests],maps)).match(/^# tests (\d+)$/m)?.[1]);
 await run('browser',['tests/browser.mjs']);
 await run('offline-build',['scripts/offline.mjs']);await run('offline-smoke',['tests/offline.mjs']);
 for(const suite of ['browser-editor-actions-v34','browser-thread-actions-v34','browser-board-interactions'])await run('base-'+suite,['tests/'+suite+'.mjs'],maps);
 const browser=JSON.parse(await readFile(path.join(out,'browser.json'),'utf8'));
 const offline=JSON.parse(await readFile(path.join(out,'offline.json'),'utf8'));
 if(browser.status!=='PASS'||offline.status!=='PASS'||!nodeTests||!baseNodeTests)throw Error('Missing successful report');
 browserScenarios=browser.checks.length;
 if((await fingerprint()).sha256!==baseline.sha256)throw Error('Source changed during acceptance');
}catch(error){failure=error;console.error(error.message);}
const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
const report={stage:'PN2',status:failure?'FAIL':'PASS',scope:'consumer-view-and-local-fixture',startedAt,finishedAt:new Date().toISOString(),sourceCommit:git.status===0?git.stdout.trim():null,sourceFingerprint:baseline.sha256,node:process.version,nodeTests,baseNodeTests,browserScenarios,checks,error:failure?.message,backendIntegrated:false,productionReady:false,limitations:['Fixture persistence and receipt simulation use isolated IndexedDB, not the new backend','No production authentication or tenant/agent authorization accepted','Consumer TypeScript declarations compiled; implementation is JavaScript, not a strict TypeScript codebase','No virtualization, list DnD, release closure, roadmap or optional migration in PN2','No measured real-device FPS or physical touch/screen-reader acceptance','Full historical upstream browser runner not claimed passing; three current v3.4 suites rerun']};
try{report.offline=JSON.parse(await readFile(path.join(root,'dist/offline.json'),'utf8'));report.dsCandidate=JSON.parse(await readFile(path.join(maps,'dist/candidate.json'),'utf8'));}catch(error){report.artifactError=error.message;report.status='FAIL';}
await writeFile(path.join(out,'source-fingerprint.json'),JSON.stringify(baseline,null,2)+'\n');
await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,nodeTests,baseNodeTests,browserScenarios,sourceFingerprint:baseline.sha256}));if(report.status!=='PASS')process.exitCode=1;
