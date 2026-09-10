// Final gate: fresh build, node tests, browser flows and the offline artifact.
import {execFileSync} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const hash=data=>createHash('sha256').update(data).digest('hex');
const out=path.join(root,'evidence/final');await mkdir(out,{recursive:true});
const exec=(args)=>execFileSync(process.execPath,args,{cwd:root,env:process.env,encoding:'utf8',maxBuffer:32*1024*1024});
const sourceFiles=[];
async function walk(dir){for(const d of await readdir(path.join(root,dir),{withFileTypes:true})){const file=dir+'/'+d.name;if(d.isDirectory())await walk(file);else sourceFiles.push(file);}}
for(const dir of ['src','server','demo','ds-extension','scripts','types','tests'])await walk(dir);
sourceFiles.push('package.json');sourceFiles.sort();
const fingerprints={};for(const file of sourceFiles)fingerprints[file]=hash(await readFile(path.join(root,file)));
const sourceFingerprint=hash(JSON.stringify(fingerprints));
const report={status:'RUNNING',sourceFingerprint,sourceFiles:fingerprints,checks:[],node:process.version,startedAt:new Date().toISOString()};
try{
  console.log(exec(['scripts/build.mjs']));report.checks.push('build');
  const tests=sourceFiles.filter(f=>f.startsWith('tests/')&&f.endsWith('.test.mjs'));
  const log=exec(['--test','--test-reporter=tap',...tests]);await writeFile(path.join(out,'node-final.tap'),log);
  const total=Number(log.match(/^# tests (\d+)$/m)?.[1]),failed=Number(log.match(/^# fail (\d+)$/m)?.[1]);
  if(!total||failed!==0)throw Error('Incomplete node test report');
  report.nodeTests=total;report.checks.push('node-tests');console.log(`PASS ${total} Node tests`);
  const browserLog=exec(['scripts/test-browser.mjs']);await writeFile(path.join(out,'browser-final.txt'),browserLog);console.log(browserLog);
  const reports=[['artifacts/r3/browser-report.json','browser-r3.json'],['artifacts/final/browser-events.json','browser-events.json']];
  report.browserScenarios=0;
  for(const [input,output] of reports){const value=JSON.parse(await readFile(input,'utf8'));if(value.status!=='PASS')throw Error('Browser check failed: '+input);report.browserScenarios+=value.checks.length;report.browser=value.browser;await copyFile(input,path.join(out,output));}
  report.checks.push('browser-r3','browser-events');console.log(exec(['scripts/preview.mjs']));
  console.log(exec(['tests/preview-smoke.mjs']));
  const preview=JSON.parse(await readFile('artifacts/r3/preview-report.json','utf8'));
  if(preview.status!=='PASS'||preview.network.length)throw Error('Offline preview verification failed');
  await copyFile('artifacts/r3/preview-report.json',path.join(out,'offline-preview.json'));
  report.previewSha256=hash(await readFile('preview.html'));report.checks.push('offline-preview');
  for(const [file,expected] of Object.entries(fingerprints))if(hash(await readFile(file))!==expected)throw Error('Source changed during verification: '+file);
  report.status='PASS';report.finishedAt=new Date().toISOString();
  report.limitations=['Local reference runtime only','Production Sprintique and live LLM not connected','No multi-user editing','No real-device touch or screen-reader audit'];
}catch(error){report.status='FAIL';report.error=error.message;throw error;}
finally{await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');}
