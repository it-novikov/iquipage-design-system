// Actual Task Compact regression. Synthetic read responses do not establish backend, aesthetic or human acceptance.
// Local: node tests/task-overview-state-browser.mjs --build-only
// Native CI: PLAYWRIGHT_MODULE=/temporary/node_modules/playwright node tests/task-overview-state-browser.mjs
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,realpath,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve,relative} from 'node:path';
import {build,preview} from 'vite';
import {validateTask} from '../ui/src/tasks.js';
import {scenario,literalResult,literalPreview} from './fixtures/task-overview-state/data.mjs';

const product=resolve(fileURLToPath(new URL('../',import.meta.url))),repo=resolve(product,'../..');
const fixture=join(product,'tests/fixtures/task-overview-state'),buildOnly=process.argv.includes('--build-only');
assert.ok(process.argv.slice(2).every(arg=>arg==='--build-only'),'Unknown runner argument');
const evidence=resolve(process.env.TASK_OVERVIEW_EVIDENCE_DIR||join(product,'output/task-overview-state',buildOnly?'build-only':'browser'));
const sha=value=>createHash('sha256').update(value).digest('hex'),hashFile=async path=>sha(await readFile(path));
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const planBytes=await readFile(join(fixture,'acceptance-plan.json')),plan=JSON.parse(planBytes);
await mkdir(evidence,{recursive:true});
const result={status:'NOT_RUN',scope:plan.scope,planId:plan.id,planSHA256:sha(planBytes),createdAt:new Date().toISOString(),node:process.version,buildOnly,
  environment:plan.environment,reportedCIRevision:process.env.TASK_OVERVIEW_SOURCE_REVISION||null,sourceSHA256:{},cases:[],
  nativeAcceptance:'NOT_RUN',compositionAssessment:'NOT_RUN',visualInspection:'NOT_RUN',humanAcceptance:'NOT_RUN',backendAcceptance:'NOT_RUN',notRun:plan.not_run};
let temporary,server,browser;
const saveJSON=(name,value)=>writeFile(join(evidence,name),JSON.stringify(value,null,2)+'\n');
const checkpoint=()=>saveJSON('results.json',result);

async function files(root){
  const paths=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(entry.isDirectory())paths.push(...(await files(join(root,entry.name))).map(path=>entry.name+'/'+path));
    else {assert.ok(entry.isFile(),'Expected regular file: '+entry.name);paths.push(entry.name);}
  }
  return paths.sort();
}
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
const task=page=>page.locator('iq-dialog.task-edit-dialog');
const adapter=page=>page.evaluate(()=>window.taskOverviewProbe||null);

// Passive geometry: no focus, scroll, forced expansion, content changes or fit oracle.
async function snapshot(page){
  return page.evaluate(()=>{
    const box=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const textRects=node=>{
      const ranges=[],walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
      for(let text=walker.nextNode();text;text=walker.nextNode())if(text.textContent.trim()){
        const range=document.createRange();range.selectNodeContents(text);
        ranges.push({text:text.textContent,rects:[...range.getClientRects()].map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}))});
      }
      return ranges;
    };
    const measure=node=>{
      if(!node)return null;
      const style=getComputedStyle(node),rect=box(node),clip={left:0,top:0,right:innerWidth,bottom:innerHeight},ancestors=[];
      for(let parent=node.parentElement;parent;parent=parent.parentElement){
        const s=getComputedStyle(parent),x=/(auto|scroll|hidden|clip)/.test(s.overflowX),y=/(auto|scroll|hidden|clip)/.test(s.overflowY);
        if(!x&&!y)continue;
        const r=box(parent),port={left:r.left+parent.clientLeft,top:r.top+parent.clientTop,
          right:r.left+parent.clientLeft+parent.clientWidth,bottom:r.top+parent.clientTop+parent.clientHeight};
        if(x){clip.left=Math.max(clip.left,port.left);clip.right=Math.min(clip.right,port.right);}
        if(y){clip.top=Math.max(clip.top,port.top);clip.bottom=Math.min(clip.bottom,port.bottom);}
        ancestors.push({tag:parent.tagName,className:parent.className,port,overflowX:s.overflowX,overflowY:s.overflowY,scrollTop:parent.scrollTop,scrollLeft:parent.scrollLeft});
      }
      const visible={left:Math.max(rect.left,clip.left),right:Math.min(rect.right,clip.right),top:Math.max(rect.top,clip.top),bottom:Math.min(rect.bottom,clip.bottom)};
      visible.width=Math.max(0,visible.right-visible.left);visible.height=Math.max(0,visible.bottom-visible.top);
      return {tag:node.tagName,className:node.className,text:node.textContent.trim(),value:node.value??null,rect,visibleBox:visible,
        textRanges:textRects(node),clipAncestors:ancestors,fontSize:style.fontSize,lineHeight:style.lineHeight,color:style.color,fontWeight:style.fontWeight,
        display:style.display,overflowX:style.overflowX,overflowY:style.overflowY,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,
        clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop,scrollLeft:node.scrollLeft};
    };
    const host=document.querySelector('iq-dialog.task-edit-dialog'),native=host?.querySelector('dialog'),summary=host?.querySelector('[data-task-work-summary]');
    const heading=summary?.querySelector('h3'),extraStatus=summary?.querySelector('p.task-work-status');
    const button=summary?.querySelector('[data-work-summary-action]'),preview=summary?.querySelector('.task-work-result');
    const describe=node=>node?{tag:node.tagName,id:node.id,name:node.getAttribute('name'),action:node.dataset.workSummaryAction||node.dataset.workAction||null,text:node.textContent.trim()}:null;
    return {viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,visualViewportScale:visualViewport?.scale||null},rootFontSize:getComputedStyle(document.documentElement).fontSize,
      theme:document.documentElement.dataset.theme,density:document.documentElement.dataset.density,dateNow:new Date().toISOString(),windowScroll:{x:scrollX,y:scrollY},
      fonts:[...document.fonts].map(font=>({family:font.family,status:font.status})),active:describe(document.activeElement),
      native:native?{open:native.open,modal:native.matches(':modal'),rect:box(native)}:null,
      tabs:host?{value:host.querySelector('[data-task-tabs]')?.getAttribute('value'),
        selected:[...host.querySelectorAll('[data-task-tabs] [role="tab"][aria-selected="true"]')].map(tab=>tab.dataset.tab)}:null,
      summary:summary?{...measure(summary),hidden:summary.hidden,
        heading:heading?{...measure(heading),attention:heading.dataset.attention??null}:null,
        mainText:summary.querySelector('.iq-work-story-copy > p:not(.task-work-status)')?.textContent,
        extraStatus:extraStatus?measure(extraStatus):null,
        cta:button?{...measure(button),action:button.dataset.workSummaryAction,primary:button.classList.contains('primary'),secondary:button.classList.contains('secondary')}:null,
        result:preview?{...measure(preview),label:preview.querySelector('.task-work-result-label')?.textContent,elementChildren:preview.children.length,
          childTags:[...preview.children].map(node=>node.tagName),emElements:preview.querySelectorAll('em').length}:null}:null,
      title:measure(host?.querySelector('[name="title"]')),body:measure(host?.querySelector('.iq-dialog-body')),
      properties:['status','ownerId','due','priority'].map(name=>({name,...measure(host?.querySelector(`[name="${name}"]`))})),
      disclosure:measure(host?.querySelector('[data-task-more]')),disclosureSummary:measure(host?.querySelector('[data-task-more]>summary')),
      description:measure(host?.querySelector('.task-editor-description')),
      measurementLimits:'Rectangles and DOM text ranges are geometry, not exact painted glyph masks or proof of human discoverability. Visible box intersects viewport and rectangular scrollports only.'};
  });
}
async function capture(page,entry,name){
  const state=await snapshot(page),file=entry.id+'-'+name+'.png';
  // Keep raw measurements even if screenshot creation fails.
  const item={name,state,screenshot:file};entry.captures.push(item);
  const bytes=await page.screenshot({path:join(evidence,file),fullPage:false});item.screenshotSHA256=sha(bytes);
  return state;
}
function assertOverviewCommon(value,data){
  assert.equal(value.native?.open,true,'Actual native Task dialog is open');assert.equal(value.native.modal,true);
  assert.deepEqual(value.tabs.selected,['task'],'Overview is read in the Task panel');
  assert.equal(value.summary?.hidden,false,'Work overview exists and is not hidden');
  const heading=data.id.startsWith('question-')?(data.work.permissions.canAnswer?'Нужно ваше решение':'Агент ждёт ответа'):
    data.id.startsWith('review-')?'Результат на проверке':'Работа агента';
  assert.equal(value.summary.heading?.text,heading+' · '+data.work.sessions[0].agentName,'Exact current state/agent heading is preserved');
  assert.equal(value.summary.extraStatus,null,'Compact has no extra status paragraph; its status class is on the heading');
}
async function semanticCase(page,entry,data,before){
  const summary=task(page).locator('[data-task-work-summary]'),work=task(page).locator('[data-task-agents]');
  const isStep=entry.scenario==='completed-rejected'||entry.scenario==='completed-blocked',isReview=entry.scenario==='review-literal';
  const isQuestion=entry.scenario==='question-no-answer'||entry.scenario==='question-can-answer',canAnswer=entry.scenario==='question-can-answer';
  const expectedTitle=isQuestion?data.work.workPlan.questions[0].title:data.work.workPlan.steps[0].title;
  assertOverviewCommon(before,data);assert.equal(await summary.isVisible(),true,'Overview is actually visible');
  assert.equal(await summary.locator('[data-work-summary-action]').count(),1,'One next-action CTA');
  assert.equal(await summary.locator('[data-work-action^="approve:"],[data-work-action^="reject:"],[data-work-action^="answer:"],[data-work-action="new-question"]').count(),0,'Overview has no write-decision or new-question controls');
  if(isStep){
    assert.equal(before.summary.heading.attention,null,'Selected unresolved step retains the ordinary agent context');
    assert.equal(before.summary.mainText,expectedTitle,'Full selected-step identity is retained');
    assert.ok(!before.summary.text.includes('Работа завершена'),'Overview does not imply the unresolved step is complete');
    assert.equal(before.summary.cta.text,'Открыть работу');assert.equal(before.summary.cta.action,'open');
    assert.equal(before.summary.cta.secondary,true);assert.equal(before.summary.cta.primary,false);assert.equal(before.summary.result,null);
  }else if(isReview){
    assert.equal(before.summary.heading.attention,'true');
    assert.equal(before.summary.mainText,expectedTitle);assert.equal(before.summary.result?.text,'Начало результата '+literalPreview,'Exact independent prefix, not the full69-code-point result');
    assert.equal(before.summary.result.label,'Начало результата');assert.equal(before.summary.result.elementChildren,1,'Literal angle brackets did not create markup');
    assert.deepEqual(before.summary.result.childTags,['SPAN'],'Only the honest prefix label is an element');assert.equal(before.summary.result.emElements,0);
    assert.equal(before.summary.cta.text,'Проверить результат');assert.equal(before.summary.cta.action,'review:S1');assert.equal(before.summary.cta.primary,true);assert.equal(before.summary.cta.secondary,false);
  }else if(isQuestion){
    assert.equal(before.summary.heading.attention,String(canAnswer));
    assert.equal(before.summary.mainText,expectedTitle);assert.equal(before.summary.result,null,'Question takes precedence over the pending result');
    assert.ok(!before.summary.text.includes('Работа завершена'),'An open question does not claim completion');
    assert.equal(before.summary.cta.text,canAnswer?'Ответить агенту':'Открыть вопрос');assert.equal(before.summary.cta.action,'question:Q1');
    assert.equal(before.summary.cta.secondary,!canAnswer);assert.equal(before.summary.cta.primary,canAnswer);
  }else{
    assert.equal(entry.scenario,'genuine-complete','Every semantic scenario has an explicit oracle');
    assert.equal(before.summary.heading.attention,null,'Completion retains the ordinary agent context');
    assert.equal(before.summary.mainText,'Работа завершена','Genuine completion retains a nonempty main status');
    assert.equal(before.summary.cta.text,'Открыть работу');assert.equal(before.summary.cta.action,'open');assert.equal(before.summary.result,null);
    assert.equal(before.summary.cta.secondary,true);assert.equal(before.summary.cta.primary,false);
  }
  await summary.getByRole('button',{name:before.summary.cta.text,exact:true}).click();await settle(page);
  await capture(page,entry,'after-cta');
  assert.equal(await task(page).locator('[data-panel="work"]').isVisible(),true,'Existing CTA opens the actual Work panel');
  assert.equal(await task(page).locator('[data-tab="work"]').getAttribute('aria-selected'),'true','Work tab semantic state matches panel');
  assert.equal(await work.locator(':scope > .iq-work-story-head .iq-work-byline').innerText(),'Работа завершена','Existing full Work session wording is retained; F2 remains a separate UX finding');
  if(isStep){
    const focus=work.locator(':scope > section.iq-work-story-copy');
    assert.equal(await focus.getByRole('heading',{name:expectedTitle,exact:true}).isVisible(),true);
    assert.equal(await focus.locator('.iq-work-byline').innerText(),entry.scenario==='completed-rejected'?'Нужна доработка':'Нужен ответ');
  }else if(isReview){
    const focus=work.locator('[data-step="focus-S1"]');assert.equal(await focus.evaluate(node=>node.open),true);
    assert.equal(await focus.locator(':scope > summary > span').first().innerText(),expectedTitle);
    const fullResult=focus.locator('.iq-work-step-body > p').first();
    assert.equal(await fullResult.innerText(),literalResult,'Full selected69-code-point literal result is available');
    assert.equal(await fullResult.locator('*').count(),0,'Full result remains literal, without interpreted markup');
    assert.equal(await fullResult.locator('em').count(),0);
    assert.equal(await focus.locator(':scope > summary').evaluate(node=>node===document.activeElement),true,'Review CTA focuses its real selected step');
    assert.equal(await focus.getByRole('button',{name:'Принять результат',exact:true}).isVisible(),true,'Existing allowed decision remains in the full review, without being invoked');
    assert.equal(await focus.getByRole('button',{name:'Вернуть на доработку',exact:true}).isVisible(),true);
  }else if(isQuestion){
    const question=work.locator('[data-work-answer="Q1"]');
    assert.equal(await question.count(),1,'CTA selects exactly the existing Q1');
    assert.equal(await question.getByRole('heading',{name:expectedTitle,exact:true}).isVisible(),true);
    assert.equal(await work.locator('[data-step="focus-S1"]').count(),0,'Pending review did not replace the question focus surface');
    if(canAnswer){
      const firstChoice=question.locator('input[type="radio"][name="work-answer-Q1"][value="O1"]');
      assert.equal(await firstChoice.isEnabled(),true);assert.equal(await firstChoice.isVisible(),true);
      assert.equal(await firstChoice.evaluate(node=>node===document.activeElement),true,'Answer CTA focuses the existing first enabled Q1 choice');
      assert.deepEqual(await question.locator('input[type="radio"]:enabled').evaluateAll(nodes=>nodes.map(node=>node.value)),['O1','O2','__other']);
      assert.equal(await question.locator('textarea:enabled').count(),1,'Full question has its permitted answer field');
      assert.equal(await question.locator('[data-work-action="answer:Q1"]').count(),1);
      assert.equal(await question.getByRole('button',{name:'Подтвердить ответ',exact:true}).isEnabled(),true,'Confirm remains an explicit full-Work command, never invoked');
    }else{
      assert.equal(await question.locator('input:enabled,textarea:enabled').count(),0,'Answer fields remain unavailable under canAnswer=false');
      assert.equal(await question.locator('[data-work-action="answer:Q1"]').count(),0,'No confirm-answer command is offered');
      assert.equal(await question.getByRole('heading',{name:expectedTitle,exact:true}).evaluate(node=>node===document.activeElement),true,'Neutral CTA focuses the actual question');
    }
    assert.equal(await question.locator('input:checked').count(),0,'Opening the question did not choose an answer');
    assert.equal(await question.locator('textarea').inputValue(),'','Opening the question did not author an answer');
  }else{
    const complete=work.locator(':scope > section.iq-work-story-copy');
    assert.equal(await complete.getByRole('heading',{name:'Работа завершена',exact:true}).isVisible(),true);
    assert.equal(await complete.locator('p').innerText(),data.work.sessions[0].summary,'Genuine completion retains its existing full session summary');
  }
}
async function runCase(spec,baseURL){
  const profile=plan.profiles[spec.profile],data=scenario(spec.scenario);
  const entry={...spec,profileData:profile,status:'RUNNING',dataSHA256:sha(JSON.stringify(data)),captures:[],pageErrors:[],consoleErrors:[],externalRequests:[]};
  result.cases.push(entry);
  const context=await browser.newContext({viewport:profile.viewport,deviceScaleFactor:1,locale:plan.environment.locale,timezoneId:plan.environment.timezone,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>entry.pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')entry.consoleErrors.push(message.text());});
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==new URL(baseURL).origin){entry.externalRequests.push(route.request().url());return route.abort();}
    return route.continue();
  });
  try{
    await page.clock.setFixedTime(new Date(plan.environment.date_now));
    await page.goto(baseURL+'?scenario='+encodeURIComponent(spec.scenario),{waitUntil:'load'});
    await page.waitForFunction(()=>window.taskOverviewProbe?.ready||window.taskOverviewProbe?.bootstrapError);
    assert.equal((await adapter(page)).bootstrapError,null);assert.equal((await adapter(page)).version,plan.package_version);
    await page.getByRole('button',{name:'Открыть задачу',exact:true}).click();
    await page.waitForFunction(()=>window.taskOverviewProbe?.openError||document.querySelector('[data-task-work-summary] [data-work-summary-action]'));
    assert.equal((await adapter(page)).openError,null,'Real openTaskDialog bootstrap succeeds');
    await page.evaluate(()=>document.fonts.ready);await settle(page);
    assert.equal(await task(page).count(),1,'One real Task dialog');
    const before=await capture(page,entry,'overview');
    assert.equal(before.rootFontSize,profile.root_font_px+'px');assert.equal(before.dateNow,plan.environment.date_now);
    assert.equal(before.theme,profile.theme);assert.equal(before.density,profile.density);
    assert.equal(before.viewport.width,profile.viewport.width);assert.equal(before.viewport.height,profile.viewport.height);
    assert.equal(before.viewport.devicePixelRatio,1);assert.equal(before.viewport.visualViewportScale,1);
    assertOverviewCommon(before,data);
    if(spec.kind==='semantic')await semanticCase(page,entry,data,before);
    // Long review is an informational record. Its dimensions cannot pass or fail a Compact hypothesis.
    entry.adapter=await adapter(page);assert.deepEqual(entry.adapter.unsupported,[],'No unsupported adapter operation');
    assert.deepEqual(entry.adapter.attempts,[],'No synthetic write attempt');
    assert.ok(entry.adapter.reads.some(read=>read.scenario===spec.scenario),'Actual work read reached the scenario adapter');
    assert.deepEqual(entry.pageErrors,[]);assert.deepEqual(entry.consoleErrors,[]);assert.deepEqual(entry.externalRequests,[]);
    entry.status=spec.kind==='semantic'?'PASS':'CAPTURED';
  }catch(error){entry.status='FAIL';entry.error=error.stack||error.message;}
  finally{
    if(entry.status==='FAIL')try{await capture(page,entry,'failure');}catch(error){entry.captureError=error.stack||error.message;}
    try{entry.adapter=await adapter(page);}catch(error){entry.adapterError=error.message;}
    // Persist each case and all completed work before any context/browser shutdown.
    await saveJSON(entry.id+'.json',{provenance:'provenance.json',browser:result.browser,playwright:result.playwright,...entry});
    await checkpoint();
    await context.close();
  }
}

try{
  assert.equal(plan.predecessor_plan_file,'acceptance-plan.v2.json','Current predecessor is preserved v2, not v1');
  for(const original of plan.preserved_plans){
    const bytes=await readFile(join(fixture,original.file));assert.equal(sha(bytes),original.sha256,'Historical plan bytes: '+original.file);
    assert.equal(JSON.parse(bytes).revision,original.revision);
  }
  assert.equal(await hashFile(join(fixture,plan.predecessor_plan_file)),plan.predecessor_plan_sha256,'Original v2 plan remains immutable');
  const previous=JSON.parse(await readFile(join(fixture,plan.predecessor_plan_file)));
  assert.equal(previous.predecessor_plan_sha256,await hashFile(join(fixture,'acceptance-plan.v1.json')),'Preserved v2 still points to original v1');
  assert.equal(literalResult,plan.literal_witness.source);assert.equal(literalPreview,plan.literal_witness.overview);
  assert.equal([...literalResult].length,69);assert.equal([...literalPreview].length,58);
  assert.equal(plan.literal_witness.label,'Начало результата');
  result.sourceRevision=git('rev-parse','HEAD');result.sourceTree=git('rev-parse','HEAD^{tree}');
  result.productTree=git('rev-parse','HEAD:products/sprintique');result.libraryTree=git('rev-parse','HEAD:libraries/iquipage');
  if(result.reportedCIRevision)assert.equal(result.sourceRevision,result.reportedCIRevision,'Actual checkout equals CI revision');
  const scope=['products/sprintique/ui','products/sprintique/web','products/sprintique/package.json','products/sprintique/package-lock.json',
    'products/sprintique/tests/task-overview-state-browser.mjs','products/sprintique/tests/fixtures/task-overview-state','products/sprintique/tests/fixtures/tabs-geometry',
    '.github/workflows/tabs-geometry.yml'];
  result.workingSourceChanges=git('diff','--name-only','HEAD','--',...scope).split('\n').filter(Boolean);
  result.untrackedSource=git('ls-files','--others','--exclude-standard','--',...scope).split('\n').filter(Boolean);
  if(!buildOnly){assert.deepEqual(result.workingSourceChanges,[],'Native source is a frozen committed checkout');assert.deepEqual(result.untrackedSource,[]);}
  const deps=await realpath(join(product,'node_modules')),pkg=JSON.parse(await readFile(join(product,'package.json')));
  const installed=JSON.parse(await readFile(join(deps,'@iquipage/web/package.json'))),archive=join(product,`vendor/iquipage-web-${plan.package_version}.tgz`);
  assert.equal(pkg.dependencies['@iquipage/web'],`file:vendor/iquipage-web-${plan.package_version}.tgz`);assert.equal(installed.version,plan.package_version);
  assert.equal(await hashFile(archive),plan.ds_archive_sha256);
  temporary=await mkdtemp(join(evidence,'.package-'));execFileSync('tar',['-xzf',archive,'-C',temporary]);
  const packageFiles=await files(join(temporary,'package'));assert.deepEqual(await files(join(deps,'@iquipage/web')),packageFiles);
  for(const path of packageFiles)assert.equal(await hashFile(join(deps,'@iquipage/web',path)),await hashFile(join(temporary,'package',path)),'Installed archive bytes: '+path);
  result.package={version:installed.version,archiveSHA256:plan.ds_archive_sha256,packageJSONSHA256:await hashFile(join(product,'package.json')),
    lockSHA256:await hashFile(join(product,'package-lock.json')),verifiedInstalledFiles:packageFiles.length};
  for(const path of ['ui/src/board/task-work-view.js','ui/src/board/work-model.js','ui/src/board/task-dialog.js','ui/src/board/board.css',
    'tests/task-overview-state-browser.mjs','tests/fixtures/tabs-geometry/repository.js',
    ...['acceptance-plan.json','acceptance-plan.v1.json','acceptance-plan.v2.json','data.mjs','index.html','consumer.js','README.md'].map(name=>'tests/fixtures/task-overview-state/'+name)])result.sourceSHA256[path]=await hashFile(join(product,path));
  result.sourceSHA256['.github/workflows/tabs-geometry.yml']=await hashFile(join(repo,'.github/workflows/tabs-geometry.yml'));
  const data=Object.fromEntries([...new Set(plan.cases.map(item=>item.scenario))].map(id=>[id,scenario(id)]));
  for(const row of Object.values(data))validateTask(row.task);
  result.dataSHA256=sha(JSON.stringify(data));result.fixtureContracts='Task validation PASS; synthetic work read shapes, not server transition acceptance';
  await saveJSON('fixture-data.json',data);
  result.vite=JSON.parse(await readFile(join(deps,'vite/package.json'))).version;assert.equal(result.vite,pkg.devDependencies.vite);
  const modules=new Set(),outDir=join(evidence,'compiled');
  await build({configFile:false,root:fixture,logLevel:'warn',plugins:[{name:'task-overview-input-provenance',moduleParsed(info){modules.add(info.id);}}],
    build:{outDir,emptyOutDir:true,minify:false,cssMinify:false,assetsInlineLimit:0,rollupOptions:{input:join(fixture,'index.html')}}});
  for(const path of ['ui/src/board/task-dialog.js','ui/src/board/task-work-view.js','ui/src/board/work-model.js'])assert.ok(modules.has(join(product,path)),'Actual product module compiled: '+path);
  const inputs={};
  for(const id of [...new Set([...modules].map(id=>id.split('?')[0]))].sort())if(id.startsWith(product+'/')||id.startsWith(deps+'/')){
    const label=id.startsWith(deps+'/')?'node_modules/'+relative(deps,id):relative(product,id);inputs[label]=await hashFile(id);
  }
  const outputs={};for(const path of await files(outDir))outputs[path]=await hashFile(join(outDir,path));
  for(const path of ['ui/src/board/task-dialog.js','ui/src/board/task-work-view.js','ui/src/board/work-model.js','tests/fixtures/task-overview-state/consumer.js'])
    assert.ok(inputs[path],'Actual product and fixture source is fingerprinted: '+path);
  assert.ok(outputs['index.html'],'Compiled fixture entry exists');
  result.build={status:'PASS',inputSHA256:inputs,inputGraphSHA256:sha(JSON.stringify(inputs)),filesSHA256:outputs,bundleSetSHA256:sha(JSON.stringify(outputs))};
  await saveJSON('provenance.json',result);
  if(buildOnly)result.status='BUILT_NOT_RENDERED';
  else{
    assert.ok(process.env.PLAYWRIGHT_MODULE,'Use existing temporary Playwright package');
    const require=createRequire(import.meta.url),pw=resolve(process.env.PLAYWRIGHT_MODULE);
    result.playwright=require(join(pw,'package.json')).version;assert.equal(result.playwright,plan.environment.playwright);
    server=await preview({configFile:false,root:fixture,logLevel:'warn',build:{outDir},preview:{host:'127.0.0.1',port:0,strictPort:true}});
    const baseURL=`http://127.0.0.1:${server.httpServer.address().port}/`;
    browser=await require(pw).chromium.launch({headless:true});result.browser=browser.version();
    for(const spec of plan.cases)await runCase(spec,baseURL);
    assert.ok(result.cases.every(entry=>entry.status===(entry.kind==='semantic'?'PASS':'CAPTURED')),'At least one native regression or informational capture failed; retained per-case evidence');
    result.status='PASS';result.nativeAcceptance='PASS';
  }
}catch(error){result.status=buildOnly||browser?'FAIL':'BLOCKED';result.error=error.stack||error.message;result.nativeAcceptance=buildOnly?'NOT_RUN':result.status;process.exitCode=1;}
finally{
  await checkpoint();
  for(const [name,cleanup] of [['browser',()=>browser?.close()],['server',()=>server?.close()],['temporary package',()=>temporary&&rm(temporary,{recursive:true,force:true})]]){
    try{await cleanup();}catch(error){(result.cleanupErrors??=[]).push({name,message:error.message});result.status='FAIL';process.exitCode=1;}
  }
  await checkpoint();
  console.log(JSON.stringify({status:result.status,build:result.build?.status,nativeAcceptance:result.nativeAcceptance,compositionAssessment:result.compositionAssessment,
    cases:result.cases.map(({id,status})=>({id,status})),evidence,error:result.error},null,2));
}
