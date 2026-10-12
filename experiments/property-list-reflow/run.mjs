// PF04: preserve a DS-only baseline, never approve the known clipping behaviour or a future candidate.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,realpath,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join,resolve,relative} from 'node:path';
import {data,rows} from './fixture/data.mjs';
import {measureBaseline} from './measure.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..'),product=join(repo,'products/sprintique');
const buildOnly=process.argv.includes('--build-only');assert.ok(process.argv.slice(2).every(arg=>arg==='--build-only'),'Unknown argument');
const evidence=resolve(process.env.PROPERTY_REFLOW_EVIDENCE_DIR||join(here,'output',buildOnly?'build-only':'browser'));
const sha=value=>createHash('sha256').update(value).digest('hex'),hashFile=async path=>sha(await readFile(path));
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const planBytes=await readFile(join(here,'baseline-plan.json')),plan=JSON.parse(planBytes);
await mkdir(evidence,{recursive:true});
const result={status:'NOT_RUN',phase:'baseline',scope:plan.scope,createdAt:new Date().toISOString(),node:process.version,buildOnly,
  planId:plan.id,planRevision:plan.revision,planSHA256:sha(planBytes),predecessorPlanSHA256:plan.predecessor_plan_sha256,
  discoverySHA256:plan.discovery_sha256,dataSHA256:sha(JSON.stringify({data,rows})),sourceRevision:null,sourceTree:null,
  reportedCIRevision:process.env.PROPERTY_REFLOW_SOURCE_REVISION||null,environment:plan.environment,sourceSHA256:{},profiles:[],
  pageErrors:[],consoleErrors:[],externalRequests:[],targetAcceptance:'NOT_RUN',humanAcceptance:'NOT_RUN',backendAcceptance:'NOT_RUN',notRun:plan.not_run};
let temporary,server,browser;
async function files(root){
  const paths=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(entry.isDirectory())paths.push(...(await files(join(root,entry.name))).map(path=>entry.name+'/'+path));
    else {assert.ok(entry.isFile(),'Expected a regular file: '+entry.name);paths.push(entry.name);}
  }
  return paths.sort();
}
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));

// Classification makes review easier. None of these observations is an oracle that the defect must or must not exist.
function observations(value){
  const notes=[];
  for(const row of value.rows){
    for(const [part,field] of [['label',row.label],['value',row.value]]){
      if(!field)continue;
      if(field.scrollWidth>field.clientWidth+1)notes.push({row:row.id,part,kind:'horizontal-scroll-range',clientWidth:field.clientWidth,scrollWidth:field.scrollWidth,overflowX:field.style.overflowX});
      for(const text of field.textGeometry){
        if(text.style.textOverflow==='ellipsis'&&text.style.whiteSpace==='nowrap'&&text.rangeBounds?.width>field.rect.width+.75)
          notes.push({row:row.id,part,kind:'ellipsis-candidate',text:text.text,rangeWidth:text.rangeBounds.width,partWidth:field.rect.width});
        if(text.rangeClippedCount)notes.push({row:row.id,part,kind:'full-text-range-exceeds-clipping-ancestor',text:text.text,graphemes:text.rangeClippedCount,
          note:'DOM text advance boxes, not a pixel mask; inspect image for painted glyph loss.'});
        if(text.estimatedInkClippedCount)notes.push({row:row.id,part,kind:'estimated-ink-exceeds-clipping-ancestor',text:text.text,graphemes:text.estimatedInkClippedCount,
          note:'Canvas/range estimate only; manual PNG inspection remains necessary.'});
      }
      const lineHeight=Number.parseFloat(field.style.lineHeight);
      if(Number.isFinite(lineHeight)&&field.rect.height+.75<lineHeight)notes.push({row:row.id,part,kind:'element-shorter-than-line-height',height:field.rect.height,lineHeight,
        note:'A height constraint, not proof that painted glyphs are clipped.'});
    }
    for(const input of row.inputs)if(input.canvas.width>input.contentWidth+.75)notes.push({row:row.id,part:'input',kind:'native-single-line-buffer-wider-than-control',
      text:input.value,measuredTextWidth:input.canvas.width,contentWidth:input.contentWidth,note:'Native input constraint; no multiline promise.'});
    const valueBounds=row.value?.textGeometry.flatMap(text=>text.graphemes.filter(g=>g.text.trim()).map(g=>g.range))||[];
    if(valueBounds.some(r=>r.right>value.host.rect.right+.75||r.left<value.host.rect.left-.75))notes.push({row:row.id,part:'value',kind:'full-text-range-outside-host',
      note:'Complete text layout can extend beyond an ellipsis clip; inspect the per-grapheme clipping ancestors.'});
  }
  for(const relation of value.relations)if(relation.clipped.count)notes.push({kind:'clipped-text-range-intersection',relation:relation.kind,row:relation.row,next:relation.next||null,
    count:relation.clipped.count,samples:relation.clipped.samples,note:'Overlapping text advance boxes after rectangular clipping; not pixel-exact glyph overlap.'});
  return notes;
}
function verifyCapture(value,profile){
  assert.equal(value.probe?.ready,true,'Fixture is ready');assert.equal(value.probe.bootstrapError,null,'Fixture bootstrap');
  assert.equal(value.probe.version,plan.package_version,'Browser uses the pinned public DS');
  assert.deepEqual(value.environment.viewport,profile.viewport,'Exact viewport');assert.equal(value.environment.rootFontSize,profile.root_font_px+'px','Exact root font');
  assert.equal(value.host.rect.width,profile.container_width,'Exact host width');assert.equal(value.environment.date,plan.environment.fixed_browser_time,'Explicit frozen browser time');
  assert.deepEqual(value.rows.map(row=>row.id),rows.map(row=>row.id),'All planned editable/static/reference rows mounted in order');
  assert.deepEqual(value.probe.changes,[],'Passive capture dispatched no value changes');
  for(const expected of rows){
    const actual=value.rows.find(row=>row.id===expected.id);assert.equal(actual.label?.text,expected.label,'Actual public label: '+expected.id);
    assert.ok(actual.value,'Actual value surface: '+expected.id);
    if(expected.kind!=='static')assert.equal(actual.registeredPublicElement,true,'Registered public control: '+expected.id);
    if(expected.kind==='date')assert.equal(actual.controlValue,expected.value,'Date data remains intact');
    else if(expected.kind==='combobox')assert.equal(actual.inputs[0]?.value,expected.value,'Actual native input contains complete value');
    else for(const text of Array.isArray(expected.value)?expected.value:[expected.value])assert.ok(actual.value.text.includes(text),'Complete literal data exists before layout clipping: '+expected.id);
  }
}
async function screenshot(page,entry,name,options={}){
  const file=entry.id+'-'+name+'.png',bytes=await page.screenshot({path:join(evidence,file),...options});
  entry.screenshots.push({kind:name,file,sha256:sha(bytes)});
}
async function captureProfile(profile,baseURL){
  const entry={...profile,status:'NOT_RUN',screenshots:[],observations:[]};result.profiles.push(entry);
  const context=await browser.newContext({viewport:profile.viewport,deviceScaleFactor:1,locale:'ru-RU',timezoneId:'UTC',reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>result.pageErrors.push({profile:profile.id,message:error.message}));
  page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push({profile:profile.id,message:message.text()});});
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==new URL(baseURL).origin){result.externalRequests.push({profile:profile.id,url:route.request().url()});return route.abort();}
    return route.continue();
  });
  try{
    // Public Playwright Clock API: fixed Date, live timers; no install()/pauseAt() and no custom Date or DOM monkeypatch.
    await page.clock.setFixedTime(new Date(plan.environment.fixed_browser_time));
    await page.goto(baseURL+'?'+new URLSearchParams({width:String(profile.container_width),font:String(profile.root_font_px)}),{waitUntil:'load'});
    await page.waitForFunction(()=>window.propertyListProbe?.ready||window.propertyListProbe?.bootstrapError);await settle(page);
    entry.measurement=await page.evaluate(measureBaseline);
    await screenshot(page,entry,'viewport');await screenshot(page,entry,'document',{fullPage:true});
    entry.afterCapture=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},windowScroll:{x:scrollX,y:scrollY},rootFontSize:getComputedStyle(document.documentElement).fontSize}));
    verifyCapture(entry.measurement,profile);entry.observations=observations(entry.measurement);
    assert.deepEqual(result.pageErrors.filter(error=>error.profile===profile.id),[],'No page error');
    assert.deepEqual(result.consoleErrors.filter(error=>error.profile===profile.id),[],'No console error');
    assert.deepEqual(result.externalRequests.filter(error=>error.profile===profile.id),[],'No off-origin request');
    entry.status=entry.observations.length?'CAPTURED_WITH_OBSERVED_CONSTRAINTS':'CAPTURED_WITHOUT_CLASSIFIED_CONSTRAINTS';
  }catch(error){
    entry.status='FAILED';entry.error=error.stack||error.message;
    try{entry.failureMeasurement=await page.evaluate(measureBaseline);await screenshot(page,entry,'failure',{fullPage:true});}
    catch(cause){entry.captureError=cause.stack||cause.message;}
  }finally{
    await writeFile(join(evidence,entry.id+'.json'),JSON.stringify({kind:'profile-capture',provenance:'provenance.json',browser:result.browser,playwright:result.playwright,...entry},null,2)+'\n');
    await context.close();
  }
}

try{
  assert.equal(plan.phase,'baseline');assert.equal(await hashFile(join(here,'baseline-plan.v1.json')),plan.predecessor_plan_sha256,'Original v1 remains immutable');
  result.sourceRevision=git('rev-parse','HEAD');result.sourceTree=git('rev-parse','HEAD^{tree}');
  result.sourceTrees={library:git('rev-parse','HEAD:libraries/iquipage'),product:git('rev-parse','HEAD:products/sprintique')};
  if(result.reportedCIRevision)assert.equal(result.sourceRevision,result.reportedCIRevision,'Actual checkout matches reported CI revision');
  const sourceScope=['experiments/property-list-reflow','.github/workflows/tabs-geometry.yml','products/sprintique/package.json','products/sprintique/package-lock.json','products/sprintique/vendor','libraries/iquipage'];
  result.workingSourceChanges=git('diff','--name-only','HEAD','--',...sourceScope).split('\n').filter(Boolean);
  result.untrackedSource=git('ls-files','--others','--exclude-standard','--',...sourceScope).split('\n').filter(Boolean);
  if(!buildOnly){assert.deepEqual(result.workingSourceChanges,[],'Native capture serves committed source');assert.deepEqual(result.untrackedSource,[],'Native fixture is committed');}
  const deps=await realpath(join(product,'node_modules')),pkg=JSON.parse(await readFile(join(product,'package.json'))),installed=JSON.parse(await readFile(join(deps,'@iquipage/web/package.json')));
  const archive=join(product,`vendor/iquipage-web-${plan.package_version}.tgz`);
  assert.equal(pkg.dependencies['@iquipage/web'],`file:vendor/iquipage-web-${plan.package_version}.tgz`);assert.equal(installed.version,plan.package_version);
  assert.equal(await hashFile(archive),plan.ds_archive_sha256);temporary=await mkdtemp(join(evidence,'.package-'));execFileSync('tar',['-xzf',archive,'-C',temporary]);
  const packageFiles=await files(join(temporary,'package'));assert.deepEqual(await files(join(deps,'@iquipage/web')),packageFiles);
  for(const path of packageFiles)assert.equal(await hashFile(join(deps,'@iquipage/web',path)),await hashFile(join(temporary,'package',path)),'Installed DS bytes: '+path);
  result.package={version:installed.version,archiveSHA256:plan.ds_archive_sha256,packageJSONSHA256:await hashFile(join(product,'package.json')),
    lockSHA256:await hashFile(join(product,'package-lock.json')),verifiedInstalledFiles:packageFiles.length};
  for(const path of ['run.mjs','measure.mjs','baseline-plan.json','baseline-plan.v1.json','fixture/index.html','fixture/host.css','fixture/consumer.js','fixture/data.mjs'])result.sourceSHA256[path]=await hashFile(join(here,path));
  for(const path of ['.github/workflows/tabs-geometry.yml','libraries/iquipage/docs/control-contracts.md','libraries/iquipage/src/styles/foundation.css'])result.sourceSHA256[path]=await hashFile(join(repo,path));
  const require=createRequire(join(product,'package.json')),{build,preview}=await import(pathToFileURL(require.resolve('vite')));
  result.vite=JSON.parse(await readFile(join(deps,'vite/package.json'))).version;assert.equal(result.vite,pkg.devDependencies.vite);
  const aliases=['./core','./styles.css'].map(key=>({find:'@iquipage/web/'+key.slice(2),replacement:join(deps,'@iquipage/web',typeof installed.exports[key]==='string'?installed.exports[key]:installed.exports[key].import)}));
  result.publicEntries=Object.fromEntries(aliases.map(alias=>[alias.find,relative(join(deps,'@iquipage/web'),alias.replacement)]));
  const modules=new Set(),outDir=join(evidence,'compiled');
  await build({configFile:false,root:join(here,'fixture'),logLevel:'warn',resolve:{alias:aliases},plugins:[{name:'property-baseline-provenance',moduleParsed(info){modules.add(info.id);}}],
    build:{outDir,emptyOutDir:true,minify:false,cssMinify:false,assetsInlineLimit:0}});
  assert.ok(modules.has(aliases.find(alias=>alias.find==='@iquipage/web/core').replacement),'Exact public core entry is compiled');
  assert.ok(![...modules].some(id=>id.startsWith(join(product,'ui')+'/')||id.startsWith(join(product,'web')+'/')),'No product runtime or CSS is loaded');
  const inputs={};
  for(const id of [...new Set([...modules].map(id=>id.split('?')[0]))].sort())if(id.startsWith(here+'/')||id.startsWith(deps+'/')){
    const label=id.startsWith(deps+'/')?'node_modules/'+relative(deps,id):relative(here,id);inputs[label]=await hashFile(id);
  }
  const outputs={};for(const path of await files(outDir))outputs[path]=await hashFile(join(outDir,path));
  result.build={status:'PASS',inputSHA256:inputs,inputGraphSHA256:sha(JSON.stringify(inputs)),filesSHA256:outputs,bundleSetSHA256:sha(JSON.stringify(outputs))};
  await writeFile(join(evidence,'provenance.json'),JSON.stringify({kind:'source-and-build-provenance',...result},null,2)+'\n');
  if(buildOnly)result.status='BUILT_NOT_RENDERED';
  else{
    assert.ok(process.env.PLAYWRIGHT_MODULE,'Use the workflow temporary Playwright package');const pw=resolve(process.env.PLAYWRIGHT_MODULE);
    result.playwright=require(join(pw,'package.json')).version;assert.equal(result.playwright,plan.environment.playwright);
    server=await preview({configFile:false,root:join(here,'fixture'),logLevel:'warn',build:{outDir},preview:{host:'127.0.0.1',port:0,strictPort:true}});
    browser=await require(pw).chromium.launch({headless:true});result.browser=browser.version();
    for(const profile of plan.profiles)await captureProfile(profile,`http://127.0.0.1:${server.httpServer.address().port}/`);
    assert.ok(result.profiles.every(profile=>profile.status.startsWith('CAPTURED_')),'A baseline profile failed; inspect preserved raw artifacts');
    result.status=result.profiles.some(profile=>profile.observations.length)?'CAPTURED_WITH_OBSERVED_CONSTRAINTS':'CAPTURED_WITHOUT_CLASSIFIED_CONSTRAINTS';
  }
}catch(error){result.status=buildOnly||browser?'FAILED':'BLOCKED';result.error=error.stack||error.message;process.exitCode=1;}
finally{
  await browser?.close();await server?.close();if(temporary)await rm(temporary,{recursive:true,force:true});
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,build:result.build?.status,targetAcceptance:result.targetAcceptance,profiles:result.profiles.map(p=>({id:p.id,status:p.status,observations:p.observations.length})),evidence,error:result.error},null,2));
}
