// PF04: the same public recipe, separately built from the immutable archives named in the plan.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,realpath,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join,resolve,relative} from 'node:path';
import {data,rows} from './fixture/data.mjs';
import {measureBaseline} from './measure.mjs';
import {exerciseControls} from './interactions.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..'),product=join(repo,'products/sprintique');
const buildOnly=process.argv.includes('--build-only'),variant=process.argv.find(arg=>arg.startsWith('--variant='))?.slice(10);
assert.ok(['control','candidate'].includes(variant),'Choose --variant=control or --variant=candidate');
assert.ok(process.argv.slice(2).every(arg=>arg==='--build-only'||arg==='--variant='+variant),'Unknown argument');
const evidence=resolve(process.env.PROPERTY_REFLOW_EVIDENCE_DIR||join(here,'output',buildOnly?'build-only':'browser',variant));
const sha=value=>createHash('sha256').update(value).digest('hex'),hashFile=async path=>sha(await readFile(path));
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const planBytes=await readFile(join(here,'comparison-plan.json')),plan=JSON.parse(planBytes),target=plan.packages[variant];
await mkdir(evidence,{recursive:true});
const result={status:'NOT_RUN',phase:plan.phase,variant,scope:plan.scope,createdAt:new Date().toISOString(),node:process.version,buildOnly,
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
  assert.equal(value.probe.version,target.version,'Browser uses the pinned public DS');
  assert.deepEqual(value.environment.viewport,profile.viewport,'Exact viewport');assert.equal(value.environment.rootFontSize,profile.root_font_px+'px','Exact root font');
  assert.equal(value.host.rect.width,profile.container_width,'Exact host width');assert.equal(value.environment.date,plan.environment.fixed_browser_time,'Explicit frozen browser time');
  assert.deepEqual(value.rows.map(row=>row.id),rows.map(row=>row.id),'All planned editable/static/reference rows mounted in order');
  assert.deepEqual(value.probe.changes,[],'Passive capture dispatched no value changes');
  for(const expected of rows){
    const actual=value.rows.find(row=>row.id===expected.id);assert.equal(actual.label?.text,expected.label,'Actual public label: '+expected.id);
    assert.ok(actual.value,'Actual value surface: '+expected.id);
    assert.ok(actual.carrier,'Actual outer value carrier: '+expected.id);
    if(expected.kind!=='static')assert.equal(actual.registeredPublicElement,true,'Registered public control: '+expected.id);
    if(expected.kind==='date')assert.equal(actual.controlValue,expected.value,'Date data remains intact');
    else if(expected.kind==='combobox')assert.equal(actual.inputs[0]?.value,expected.value,'Actual native input contains complete value');
    else for(const text of Array.isArray(expected.value)?expected.value:[expected.value])assert.ok(actual.value.text.includes(text),'Complete literal data exists before layout clipping: '+expected.id);
  }
  for(const id of ['owner','reference-owner'])assert.equal(value.rows.find(row=>row.id===id)?.avatar?.text,'АА','Supported option avatar is actually mounted: '+id);
}
function candidateGeometry(value){
  const issues=[];
  for(const row of value.rows.filter(row=>row.group==='property-list')){
    for(const [part,field] of [['label',row.label],['value',row.value]])for(const text of field.textGeometry){
      if(text.decorativeAvatar)continue;
      if(text.rangeClippedCount)issues.push({row:row.id,part,kind:'text-clipped',text:text.text,count:text.rangeClippedCount});
      if(text.graphemes.some(g=>g.text.trim()&&(g.range.left<value.host.rect.left-.75||g.range.right>value.host.rect.right+.75)))
        issues.push({row:row.id,part,kind:'complete-text-outside-host',text:text.text});
    }
  }
  if(value.environment.document.scrollWidth>value.environment.document.clientWidth)issues.push({kind:'document-horizontal-overflow'});
  for(const relation of value.relations.filter(relation=>value.rows.find(row=>row.id===relation.row)?.group==='property-list'))
    if(relation.clipped.count)issues.push({kind:'text-range-intersection',...relation});
  return {status:issues.length?'FAIL':'GEOMETRY_PASS_REVIEW_PENDING',issues,note:'Full text advance geometry, not pixel or human acceptance; input buffers and decorative avatar initials are measured separately.'};
}
async function screenshot(page,entry,name,options={}){
  const file=entry.id+'-'+name+'.png',bytes=await page.screenshot({path:join(evidence,file),...options});
  const capture={kind:name,file,sha256:sha(bytes),fullPage:options.fullPage===true};
  entry.screenshots.push(capture);return capture;
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
    if(variant==='candidate')entry.geometry=candidateGeometry(entry.measurement);
    if(plan.interaction_profiles.includes(profile.id))await exerciseControls(page,profile,async name=>screenshot(page,entry,name,{fullPage:false}),entry.interactions={});
    assert.deepEqual(result.pageErrors.filter(error=>error.profile===profile.id),[],'No page error');
    assert.deepEqual(result.consoleErrors.filter(error=>error.profile===profile.id),[],'No console error');
    assert.deepEqual(result.externalRequests.filter(error=>error.profile===profile.id),[],'No off-origin request');
    entry.status=entry.observations.length?'CAPTURED_WITH_OBSERVED_CONSTRAINTS':'CAPTURED_WITHOUT_CLASSIFIED_CONSTRAINTS';
  }catch(error){
    entry.status='FAILED';entry.error=error.stack||error.message;
    if(entry.interactions)entry.interactions.status='FAILED';
    try{entry.failureMeasurement=await page.evaluate(measureBaseline);await screenshot(page,entry,'failure',{fullPage:false});}
    catch(cause){entry.captureError=cause.stack||cause.message;}
  }finally{
    await writeFile(join(evidence,entry.id+'.json'),JSON.stringify({kind:'profile-capture',provenance:'provenance.json',browser:result.browser,playwright:result.playwright,...entry},null,2)+'\n');
    await context.close();
  }
}

try{
  assert.equal(plan.phase,'candidate-comparison');
  assert.equal(await hashFile(join(here,'baseline-plan.json')),plan.predecessor_plan_sha256,'Historical baseline plan remains immutable');
  result.sourceRevision=git('rev-parse','HEAD');result.sourceTree=git('rev-parse','HEAD^{tree}');
  result.sourceTrees={library:git('rev-parse','HEAD:libraries/iquipage'),product:git('rev-parse','HEAD:products/sprintique')};
  if(result.reportedCIRevision)assert.equal(result.sourceRevision,result.reportedCIRevision,'Actual checkout matches reported CI revision');
  const sourceScope=['experiments/property-list-reflow','.github/workflows/tabs-geometry.yml','products/sprintique/package.json','products/sprintique/package-lock.json','products/sprintique/vendor','libraries/iquipage'];
  result.workingSourceChanges=git('diff','--name-only','HEAD','--',...sourceScope).split('\n').filter(Boolean);
  result.untrackedSource=git('ls-files','--others','--exclude-standard','--',...sourceScope).split('\n').filter(Boolean);
  if(!buildOnly){assert.deepEqual(result.workingSourceChanges,[],'Native capture serves committed source');assert.deepEqual(result.untrackedSource,[],'Native fixture is committed');}
  const deps=await realpath(join(product,'node_modules')),pkg=JSON.parse(await readFile(join(product,'package.json')));
  assert.equal(pkg.dependencies['@iquipage/web'],'file:vendor/iquipage-web-'+plan.packages.control.version+'.tgz','Sprintique has not adopted the trial');
  result.archiveSHA256={};
  for(const [key,item] of Object.entries(plan.packages)){const actual=await hashFile(join(repo,item.path));assert.equal(actual,item.sha256,'Frozen '+key+' archive');result.archiveSHA256[key]=actual;}
  const sourceProof=JSON.parse(await readFile(join(here,'packages/source-proof.json')));
  assert.equal(sourceProof.archive_sha256,plan.packages.candidate.sha256,'Private archive source proof');
  for(const [path,expected] of Object.entries(sourceProof.source_sha256))assert.equal(await hashFile(join(repo,path)),expected,'Packed source unchanged: '+path);
  temporary=await mkdtemp(join(evidence,'.package-'));execFileSync('tar',['-xzf',join(repo,target.path),'-C',temporary]);
  const packedRoot=join(temporary,'package'),packed=JSON.parse(await readFile(join(packedRoot,'package.json'))),packageFiles=await files(packedRoot);
  assert.equal(packed.version,target.version);const packageHashes={};for(const path of packageFiles)packageHashes[path]=await hashFile(join(packedRoot,path));
  result.package={version:packed.version,archiveSHA256:target.sha256,packageJSONSHA256:await hashFile(join(product,'package.json')),
    lockSHA256:await hashFile(join(product,'package-lock.json')),filesSHA256:packageHashes,verifiedPackedFiles:packageFiles.length,adopted:false};
  for(const path of ['compare.mjs','interactions.mjs','measure.mjs','comparison-plan.json','baseline-plan.json','baseline-plan.v1.json','fixture/index.html','fixture/host.css','fixture/consumer.js','fixture/data.mjs','packages/source-proof.json'])result.sourceSHA256[path]=await hashFile(join(here,path));
  for(const path of ['.github/workflows/tabs-geometry.yml','libraries/iquipage/docs/control-contracts.md','libraries/iquipage/src/styles/foundation.css'])result.sourceSHA256[path]=await hashFile(join(repo,path));
  const require=createRequire(join(product,'package.json')),{build,preview}=await import(pathToFileURL(require.resolve('vite')));
  result.vite=JSON.parse(await readFile(join(deps,'vite/package.json'))).version;assert.equal(result.vite,pkg.devDependencies.vite);
  const aliases=['./core','./styles.css'].map(key=>({find:'@iquipage/web/'+key.slice(2),replacement:join(packedRoot,typeof packed.exports[key]==='string'?packed.exports[key]:packed.exports[key].import)}));
  result.publicEntries=Object.fromEntries(aliases.map(alias=>[alias.find,relative(packedRoot,alias.replacement)]));
  const modules=new Set(),outDir=join(evidence,'compiled');
  await build({configFile:false,root:join(here,'fixture'),logLevel:'warn',resolve:{alias:aliases},plugins:[{name:'property-baseline-provenance',moduleParsed(info){modules.add(info.id);}}],
    build:{outDir,emptyOutDir:true,minify:false,cssMinify:false,assetsInlineLimit:0}});
  assert.ok(modules.has(aliases.find(alias=>alias.find==='@iquipage/web/core').replacement),'Exact public core entry is compiled');
  assert.ok(![...modules].some(id=>id.startsWith(join(product,'ui')+'/')||id.startsWith(join(product,'web')+'/')),'No product runtime or CSS is loaded');
  const inputs={};
  for(const id of [...new Set([...modules].map(id=>id.split('?')[0]))].sort())if(id.startsWith(here+'/')||id.startsWith(deps+'/')||id.startsWith(packedRoot+'/')){
    const label=id.startsWith(packedRoot+'/')?'package/'+relative(packedRoot,id):id.startsWith(deps+'/')?'node_modules/'+relative(deps,id):relative(here,id);inputs[label]=await hashFile(id);
  }
  for(const required of ['fixture/consumer.js','fixture/data.mjs','fixture/host.css','package/dist/core.js','package/dist/iquipage.css'])assert.ok(inputs[required],'Real compiled input fingerprint: '+required);
  assert.ok(Object.keys(inputs).some(path=>path.startsWith('package/dist/modules/')),'Actual packed module closure is fingerprinted');
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
    assert.ok(result.profiles.every(profile=>profile.status.startsWith('CAPTURED_')),'A profile failed; inspect preserved raw artifacts');
    if(variant==='candidate'){
      result.targetAcceptance=result.profiles.every(profile=>profile.geometry?.status==='GEOMETRY_PASS_REVIEW_PENDING')?'GEOMETRY_PASS_REVIEW_PENDING':'FAIL';
      assert.notEqual(result.targetAcceptance,'FAIL','Candidate full-text geometry failed; raw control and candidate evidence is preserved');
    }
    result.status=result.profiles.some(profile=>profile.observations.length)?'CAPTURED_WITH_OBSERVED_CONSTRAINTS':'CAPTURED_WITHOUT_CLASSIFIED_CONSTRAINTS';
  }
}catch(error){result.status=buildOnly||browser?'FAILED':'BLOCKED';result.error=error.stack||error.message;process.exitCode=1;}
finally{
  await browser?.close();await server?.close();if(temporary)await rm(temporary,{recursive:true,force:true});
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,build:result.build?.status,targetAcceptance:result.targetAcceptance,profiles:result.profiles.map(p=>({id:p.id,status:p.status,observations:p.observations.length})),evidence,error:result.error},null,2));
}
