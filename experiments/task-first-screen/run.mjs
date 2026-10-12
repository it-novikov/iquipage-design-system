// Narrow companion to tabs-geometry, not a production bootstrap or a release/visual gate.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve,relative,dirname} from 'node:path';
import {scenario} from './fixture/repository.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../..'),product=join(repo,'products/sprintique');
const deps=resolve(process.env.TASK_FIRST_SCREEN_NODE_MODULES||join(product,'node_modules'));
const buildOnly=process.argv.includes('--build-only');
assert.ok(process.argv.slice(2).every(arg=>arg==='--build-only'),'Only --build-only is supported');
const evidence=join(here,'output',buildOnly?'build-only':'browser'),sha=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const planBytes=await readFile(join(here,'comparison-plan.json')),plan=JSON.parse(planBytes);
await rm(evidence,{recursive:true,force:true});await mkdir(evidence,{recursive:true});
const result={status:'NOT_RUN',scope:plan.scope,buildOnly,createdAt:new Date().toISOString(),node:process.version,
  sourceRevision:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),frozenRevision:plan.frozen_revision,
  reportedCIRevision:process.env.GITHUB_SHA||null,planSHA256:sha(planBytes),environment:plan.environment,
  designAddendumSHA256:plan.design_addendum_sha256,independentReviewSHA256:plan.independent_review_sha256,
  builds:[],frames:[],nativeProbes:[],engineeringChecks:[],pageErrors:[],externalRequests:[],consoleErrors:[],
  visualAcceptance:'NOT_RUN',humanAcceptance:'NOT_RUN',backendAcceptance:'NOT_RUN',
  limitations:plan.not_run_by_this_fixture,
  knownConstraint:'DS54 property label/value clipping at text200 is recorded, not treated as fixed by grouping.'};
let temporary,browser;const servers=[];
const passed=name=>result.engineeringChecks.push({name,outcome:'PASS'});
const hashFile=async file=>sha(await readFile(file));
async function files(root){
  const out=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(entry.isDirectory())out.push(...(await files(join(root,entry.name))).map(name=>entry.name+'/'+name));
    else {assert.ok(entry.isFile(),'Expected a regular package/build file: '+entry.name);out.push(entry.name);}
  }
  return out.sort();
}
function assertFrozenProduction(){
  for(const [path,tree] of Object.entries(plan.frozen_trees))assert.equal(git('rev-parse','HEAD:'+path),tree,'Frozen tree '+path);
  assert.equal(git('diff','--name-only','HEAD','--',...Object.keys(plan.frozen_trees)),'','Production files must be unchanged');
  assert.equal(git('ls-files','--others','--exclude-standard','--',...Object.keys(plan.frozen_trees)),'','No untracked production source');
}
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
const task=page=>page.locator('iq-dialog.task-edit-dialog').last();
const fixtureProbe=page=>page.evaluate(()=>window.taskFirstScreenProbe);

// Read-only geometry: no scroll mutation, focus(), selection change or DOM arrangement before capture.
async function snapshot(page,firstParagraph){
  return task(page).evaluate((el,paragraph)=>{
    const box=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const describe=node=>node?{tag:node.tagName,id:node.id,name:node.getAttribute('name'),role:node.getAttribute('role'),
      label:node.getAttribute('aria-label'),text:node.textContent?.trim().slice(0,180),control:node.closest('iq-select,iq-date-field,iq-tag-picker')?.getAttribute('label')||null}:null;
    const port=node=>{const r=box(node);return {left:r.left+node.clientLeft,top:r.top+node.clientTop,right:r.left+node.clientLeft+node.clientWidth,bottom:r.top+node.clientTop+node.clientHeight};};
    const measure=node=>{
      if(!node)return null;
      const r=box(node),style=getComputedStyle(node),clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let parent=node.parentElement;parent;parent=parent.parentElement){
        const s=getComputedStyle(parent),p=port(parent);
        if(/auto|scroll|hidden|clip/.test(s.overflowX)){clip.left=Math.max(clip.left,p.left);clip.right=Math.min(clip.right,p.right);}
        if(/auto|scroll|hidden|clip/.test(s.overflowY)){clip.top=Math.max(clip.top,p.top);clip.bottom=Math.min(clip.bottom,p.bottom);}
      }
      const range=document.createRange();range.selectNodeContents(node);
      const textRects=[...range.getClientRects()].map(r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}));
      return {text:node.value??node.textContent?.trim(),rect:r,clip,rendered:node.getClientRects().length>0,
        visibleHeight:Math.max(0,Math.min(r.bottom,clip.bottom)-Math.max(r.top,clip.top)),
        fullyInsideScrollports:r.width>0&&r.height>0&&r.left>=clip.left&&r.right<=clip.right&&r.top>=clip.top&&r.bottom<=clip.bottom,
        clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,
        fontSize:style.fontSize,lineHeight:style.lineHeight,whiteSpace:style.whiteSpace,textOverflow:style.textOverflow,
        overflowX:style.overflowX,overflowY:style.overflowY,textRects};
    };
    const form=el.querySelector('form'),body=el.querySelector('.iq-dialog-body'),properties=el.querySelector('.task-editor-properties');
    const summary=el.querySelector('[data-task-work-summary]'),preview=summary.querySelector(':scope > .iq-work-story-copy');
    const description=el.querySelector('iq-markdown-editor[name=description]'),first=[...description.querySelectorAll('.md-preview p')].find(p=>p.textContent===paragraph);
    const names=['title','status','ownerId','due','priority','type','releaseId','parent','description'],data=new FormData(form);
    const controls=[...el.querySelectorAll('iq-select[name],iq-date-field[name],iq-markdown-editor[name=description]')];
    const formState={values:Object.fromEntries(names.map(name=>[name,data.getAll(name)])),
      nativeCounts:Object.fromEntries(names.map(name=>[name,form.querySelectorAll(`input[name="${name}"],textarea[name="${name}"],select[name="${name}"]`).length])),
      controls:controls.map(node=>({tag:node.tagName,name:node.getAttribute('name'),value:node.value,disabled:node.hasAttribute('disabled')})),
      tags:el.querySelector('iq-tag-picker')?.value,estimate:el.querySelector('[data-task-estimate] [data-date-caption]')?.textContent,
      plan:el.querySelector('[data-task-plan]')?.textContent?.trim()};
    const other=properties.querySelector('[data-task-other-properties]');
    const scrollOwners=[];
    for(let node=first||description;node;node=node.parentElement){
      const style=getComputedStyle(node);
      if(/auto|scroll|hidden|clip/.test(style.overflowX+' '+style.overflowY))scrollOwners.push({node:describe(node),rect:box(node),port:port(node),
        scrollTop:node.scrollTop,scrollLeft:node.scrollLeft,maxScrollTop:Math.max(0,node.scrollHeight-node.clientHeight),
        maxScrollLeft:Math.max(0,node.scrollWidth-node.clientWidth),overflowX:style.overflowX,overflowY:style.overflowY});
    }
    const propertyRows=[...properties.querySelectorAll('iq-select,iq-date-field,[data-task-estimate],[data-task-plan],iq-tag-picker,dl.iq-property')];
    return {focused:describe(document.activeElement),window:{width:innerWidth,height:innerHeight,scrollX,scrollY,dpr:devicePixelRatio},
      rootFontSize:getComputedStyle(document.documentElement).fontSize,dialog:box(el.querySelector('dialog[open]')),
      body:{rect:box(body),port:port(body),scrollTop:body.scrollTop,scrollLeft:body.scrollLeft,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight},
      title:measure(el.querySelector('textarea[name=title]')),descriptionHeading:measure(el.querySelector('.task-editor-description h3')),
      descriptionFirstParagraph:measure(first),descriptionText:description.value,
      summary:{hidden:summary.hidden,text:summary.textContent.trim(),rect:box(summary),
        headline:measure(summary.querySelector('.iq-work-story-head .iq-work-story-copy > p:last-child')),
        status:summary.querySelector('.iq-work-story-head .iq-work-byline')?.textContent||null,
        action:summary.querySelector('[data-work-summary-action]')?.dataset.workSummaryAction||null,
        cta:measure(summary.querySelector('[data-work-summary-action]')),
        previewLabel:preview?.querySelector('.iq-work-byline')?.textContent||null,
        previewText:preview?.querySelector('p:not(.iq-work-byline)')?.textContent||'',preview:measure(preview),
        ctaBeforePreview:!preview||!!(summary.querySelector('[data-work-summary-action]').compareDocumentPosition(preview)&Node.DOCUMENT_POSITION_FOLLOWING),
        duplicatedFullStep:summary.querySelectorAll('[data-step]').length},
      disclosure:other?{open:other.open,summary:measure(other.querySelector('summary')),mountedRows:other.querySelectorAll('.iq-properties > *').length}:null,
      propertyOrder:propertyRows.map(n=>n.getAttribute('label')||n.querySelector('.iq-property-label')?.textContent||n.getAttribute('name')),
      directControls:[...properties.querySelectorAll(':scope > .iq-properties > iq-select,:scope > .iq-properties > iq-date-field')].map(n=>n.getAttribute('name')),
      propertyText:[...properties.querySelectorAll('.iq-control-label,.iq-property-label,.iq-select-label,.iq-property-text,.iq-property-value,[data-date-caption]')].map(measure),
      planReadOnly:!el.querySelector('[data-task-plan] button'),formState,scrollOwners,
      footer:measure(el.querySelector('.iq-dialog-footer')),selectedTab:el.querySelector('[data-task-tabs] [aria-selected=true]')?.dataset.tab};
  },firstParagraph);
}

function assertInitial(entry,data){
  const value=entry.initial;
  assert.equal(value.selectedTab,'task');assert.ok(value.descriptionFirstParagraph,'Real first paragraph is in the mounted preview');
  assert.equal(value.descriptionText,data.tasks[0].description);assert.equal(value.title.text,data.tasks[0].title);
  for(const [name,count] of Object.entries(value.formState.nativeCounts))assert.equal(count,1,'One native form value for '+name);
  assert.equal(value.formState.controls.length,8,'Six selects, one date, one description editor');
  assert.equal(value.planReadOnly,true,'Plan must honestly remain read-only without a planning callback');
  assert.deepEqual(value.propertyOrder,['Статус','Исполнитель','Срок','Приоритет','Оценка','Тип','Релиз','План','Родитель','Теги','Автор']);
  const ordinary=data.id==='ordinary';assert.equal(value.summary.hidden,ordinary);
  if(!ordinary){
    const question=data.id==='question-no-answer';assert.equal(value.summary.action,question?'question:Q1':'review:S1');
    assert.equal(entry.probe.focus.id,question?'Q1':'S1');assert.equal(value.summary.duplicatedFullStep,0);
  }
  if(entry.variant==='baseline'){
    assert.equal(value.disclosure,null);assert.equal(value.summary.preview,null);assert.equal(value.summary.status,null);
  }else{
    assert.equal(value.disclosure?.open,false);assert.equal(value.disclosure.mountedRows,7);
    assert.deepEqual(value.directControls,['status','ownerId','due','priority']);
    if(!ordinary){
      assert.equal(value.summary.status,data.id==='question-no-answer'?'Вопрос ждёт ответа':'Результат на проверке');
      if(data.id!=='question-no-answer'){
        const raw=data.work.workPlan.steps[0].result,preview=value.summary.previewText;
        assert.equal(value.summary.ctaBeforePreview,true);
        if(!raw){assert.equal(value.summary.previewLabel,'Описание результата не добавлено');assert.equal(preview,'');}
        else if(Array.from(raw).length<=160){assert.equal(value.summary.previewLabel,'Результат шага');assert.equal(preview,raw);}
        else {assert.equal(value.summary.previewLabel,'Начало результата');assert.ok(preview.endsWith('…'));assert.ok(raw.startsWith(preview.slice(0,-1)));assert.ok(Array.from(preview).length<=160);}
      }
    }
  }
  // Visibility and text clipping are observations for review, not silently weakened acceptance assertions.
  entry.engineeringChecks='Mounted source, same values/order and selected summary semantics verified';
}

async function openFrame(variant,frame){
  const server=servers.find(s=>s.variant===variant),origin=server.origin;
  const context=await browser.newContext({viewport:frame.viewport,deviceScaleFactor:1,locale:'ru-RU',timezoneId:'UTC',reducedMotion:'reduce',colorScheme:frame.theme});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(new URL(url).origin!==origin){result.externalRequests.push({variant,frame:frame.id,url});return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>result.pageErrors.push({variant,frame:frame.id,message:error.stack||error.message}));
  page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push({variant,frame:frame.id,message:message.text()});});
  await page.clock.setFixedTime(new Date(plan.environment.fixed_time));
  try{
    await page.goto(origin+'/?'+new URLSearchParams({case:frame.case,theme:frame.theme,text:String(frame.text)}),{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.taskFirstScreenProbe?.ready||window.taskFirstScreenProbe?.bootstrapError);
    assert.equal((await fixtureProbe(page)).bootstrapError,null);
    await page.locator('[data-open-task="task-1"]').first().click();
    await page.mouse.move(0,0); // Same neutral corner before screenshots; no focus/scroll repair.
    await page.waitForFunction(()=>{
      const task=document.querySelector('iq-dialog.task-edit-dialog');
      return task?.querySelector('dialog[open]')&&task.querySelector('iq-select[name=releaseId] [role=combobox]')
        &&task.querySelector('[data-task-agents] > .iq-work-story-head')&&task.querySelector('iq-markdown-editor .md-preview p');
    });
    await page.evaluate(()=>document.fonts.ready);await settle(page);
    assert.equal((await fixtureProbe(page)).version,plan.package_version);
    return {context,page};
  }catch(error){await page.screenshot({path:join(evidence,frame.id+'-'+variant+'-open-failure.png')}).catch(()=>{});await context.close();throw error;}
}
async function screenshot(page,name){
  const file=name+'.png';await page.screenshot({path:join(evidence,file),fullPage:false});
  return {file,sha256:await hashFile(join(evidence,file))};
}
async function rememberNodes(page){
  await task(page).evaluate(el=>{
    const controls=[...el.querySelectorAll('iq-select[name],iq-date-field[name],iq-markdown-editor[name=description],iq-tag-picker')];
    window.taskFirstScreenNodes={form:el.querySelector('form'),controls,inputs:controls.flatMap(n=>[...n.querySelectorAll('input[name],textarea[name]')])};
  });
}
async function assertSameNodes(page){
  assert.equal(await page.evaluate(()=>{
    const before=window.taskFirstScreenNodes;
    return [...before.controls,...before.inputs].every(n=>n.isConnected&&n.closest('form')===before.form);
  }),true,'Original controls and named inputs remain connected to the same form');
}
async function accessProbe(variant){
  const frame=plan.frames.find(f=>f.id==='H01'),data=scenario(frame.case),entry={id:'property-access',variant,status:'NOT_RUN',tabTrace:[],controls:[]};
  result.nativeProbes.push(entry);let session;
  try{
    session=await openFrame(variant,frame);const {page}=session,before=await snapshot(page,data.firstParagraph);await rememberNodes(page);
    if(variant==='vt1'){
      // Follow the real initial Tab order; do not programmatically focus the disclosure for this check.
      for(let i=0;i<40;i++){
        await page.keyboard.press('Tab');
        const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),
          name:document.activeElement?.closest('iq-select,iq-date-field')?.getAttribute('label'),disclosure:document.activeElement?.matches('[data-task-other-properties] > summary')}));
        entry.tabTrace.push(focus);if(focus.disclosure)break;
      }
      assert.equal(entry.tabTrace.at(-1)?.disclosure,true,'Disclosure is reachable through native Tab order');
      await page.keyboard.press('Enter');await settle(page);assert.equal(await task(page).locator('[data-task-other-properties]').getAttribute('open'),'');
      entry.opened=await snapshot(page,data.firstParagraph);entry.screenshot=await screenshot(page,'H01-vt1-keyboard-opened');
    }
    for(const name of ['status','ownerId','priority','type','releaseId','parent']){
      const trigger=task(page).locator(`iq-select[name="${name}"]`).getByRole('combobox');
      await trigger.click();await page.waitForFunction(()=>!!document.querySelector('[popover]:popover-open'));
      await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[popover]:popover-open'));
      assert.equal(await trigger.evaluate(n=>n===document.activeElement),true,name+' cancel restores trigger focus');
      entry.controls.push({name,opened:true,cancelled:true});
    }
    for(const [name,selector] of [['due','iq-date-field[name=due] > button'],['estimate','[data-task-estimate] > button']]){
      const trigger=task(page).locator(selector);await trigger.click();await page.waitForFunction(()=>!!document.querySelector('[popover]:popover-open'));
      await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[popover]:popover-open'));
      assert.equal(await trigger.evaluate(n=>n===document.activeElement),true,name+' cancel restores trigger focus');
      entry.controls.push({name,opened:true,cancelled:true});
    }
    await task(page).getByRole('tab',{name:'Работа агента',exact:true}).click();
    await page.setViewportSize({width:1100,height:720});await task(page).locator('[data-task-fullscreen]').click();
    await task(page).getByRole('tab',{name:'Задача',exact:true}).click();await settle(page);await assertSameNodes(page);
    if(variant==='vt1'){
      assert.equal(await task(page).locator('[data-task-other-properties]').getAttribute('open'),'','Disclosure stays open across tabs/resize/fullscreen');
      const summary=task(page).locator('[data-task-other-properties] > summary');await summary.focus();await page.keyboard.press('Enter');
      assert.equal(await task(page).locator('[data-task-other-properties]').getAttribute('open'),null,'Native summary closes explicitly');
    }
    const after=await snapshot(page,data.firstParagraph);assert.deepEqual(after.formState,before.formState,'Access/cancel/tabs/resize do not change form values');
    await assertSameNodes(page);entry.probe=await fixtureProbe(page);assert.deepEqual(entry.probe.attempts,[]);assert.deepEqual(entry.probe.unsupported,[]);
    entry.plan='READ_ONLY_NO_CALLBACK';entry.tags='MOUNTED_VALUE_VERIFIED; picker interaction not probed';entry.status='ENGINEERING_CHECKS_PASSED';
  }catch(error){entry.status='FAILED';entry.error=error.stack||error.message;}
  finally{await session?.context.close();}
}
async function actionProbe(variant,frameId){
  const frame=plan.frames.find(f=>f.id===frameId),entry={id:frameId+'-existing-CTA',variant,status:'NOT_RUN'};
  result.nativeProbes.push(entry);let session;
  try{
    session=await openFrame(variant,frame);const {page}=session;await rememberNodes(page);
    await task(page).locator('[data-work-summary-action]').click();await settle(page);
    assert.equal(await task(page).locator('[data-task-tabs] [aria-selected=true]').getAttribute('data-tab'),'work');
    if(frameId==='H02'){
      const selected=task(page).locator('[data-step="focus-S1"]');assert.equal(await selected.getAttribute('open'),'');
      assert.equal(await selected.locator('summary').evaluate(n=>n===document.activeElement),true);
      entry.screenshot=await screenshot(page,'H02-'+variant+'-existing-review-CTA');
    }else{
      assert.equal(await task(page).locator('[data-work-action="answer:Q1"]').count(),0);
      assert.equal(await task(page).locator('[data-work-answer="Q1"] input:not(:disabled),[data-work-answer="Q1"] textarea:not(:disabled)').count(),0);
    }
    await assertSameNodes(page);entry.probe=await fixtureProbe(page);assert.deepEqual(entry.probe.attempts,[]);assert.deepEqual(entry.probe.unsupported,[]);
    entry.status='ENGINEERING_CHECKS_PASSED';
  }catch(error){entry.status='FAILED';entry.error=error.stack||error.message;}
  finally{await session?.context.close();}
}

try{
  assertFrozenProduction();result.frozenTrees=plan.frozen_trees;passed('Frozen production trees and working source');
  const pkg=JSON.parse(await readFile(join(product,'package.json'))),installed=JSON.parse(await readFile(join(deps,'@iquipage/web/package.json')));
  const archive=join(product,`vendor/iquipage-web-${plan.package_version}.tgz`);
  assert.equal(await hashFile(join(product,'package.json')),plan.package_json_sha256);
  assert.equal(await hashFile(join(product,'package-lock.json')),plan.package_lock_sha256);
  assert.equal(pkg.dependencies['@iquipage/web'],`file:vendor/iquipage-web-${plan.package_version}.tgz`);
  assert.equal(installed.version,plan.package_version);assert.equal(await hashFile(archive),plan.archive_sha256);
  result.package={version:installed.version,archiveSHA256:plan.archive_sha256,lockSHA256:plan.package_lock_sha256};
  temporary=await mkdtemp(join(evidence,'.work-'));const unpacked=join(temporary,'ds');await mkdir(unpacked);
  execFileSync('tar',['-xzf',archive,'-C',unpacked]);
  const packageFiles=await files(join(unpacked,'package'));assert.deepEqual(await files(join(deps,'@iquipage/web')),packageFiles);
  for(const file of packageFiles)assert.equal(await hashFile(join(deps,'@iquipage/web',file)),await hashFile(join(unpacked,'package',file)),'Installed DS bytes: '+file);
  result.package.verifiedInstalledFiles=packageFiles.length;passed('Installed DS54 equals frozen tar, including public CSS/fonts/modules');
  const patchPath=join(here,'vt1.patch'),patch=await readFile(patchPath,'utf8'),paths=Object.keys(plan.modules).sort();
  assert.equal(sha(patch),plan.patch_sha256);result.patchSHA256=sha(patch);
  assert.deepEqual([...patch.matchAll(/^--- a\/(.+)$/gm)].map(m=>m[1]).sort(),paths);
  assert.deepEqual([...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m=>m[1]).sort(),paths);
  const staging=join(temporary,'source');await mkdir(staging);const overlay=new Map();
  for(const path of paths){assert.equal(await hashFile(join(repo,path)),plan.modules[path].baseline_sha256);await mkdir(dirname(join(staging,path)),{recursive:true});await copyFile(join(repo,path),join(staging,path));}
  const patchEnv={...process.env,GIT_CEILING_DIRECTORIES:temporary};delete patchEnv.GIT_DIR;delete patchEnv.GIT_WORK_TREE;delete patchEnv.GIT_INDEX_FILE;
  // Ceiling keeps git apply outside the enclosing checkout. No --unsafe-paths, index or production mutation.
  execFileSync('git',['apply','--check','--whitespace=error-all',patchPath],{cwd:staging,env:patchEnv});
  execFileSync('git',['apply','--whitespace=error-all',patchPath],{cwd:staging,env:patchEnv});
  for(const path of paths){const bytes=await readFile(join(staging,path),'utf8');assert.equal(sha(bytes),plan.modules[path].vt1_sha256);overlay.set(join(repo,path),bytes);}
  result.overlayModules=plan.modules;passed('Exact three-file source overlay applied only to temporary copies');
  result.fixtureSHA256={};
  for(const file of ['run.mjs','fixture/index.html','fixture/product.js','fixture/repository.mjs'])result.fixtureSHA256[file]=await hashFile(join(here,file));
  const {validateTask}=await import(pathToFileURL(join(product,'ui/src/tasks.js')));
  for(const frame of plan.frames)for(const value of scenario(frame.case).tasks)validateTask(value);
  passed('Meaningful fixture tasks satisfy the existing product task validator');
  const {build,preview}=await import(pathToFileURL(join(deps,'vite/dist/node/index.js')));
  result.vite=JSON.parse(await readFile(join(deps,'vite/package.json'))).version;assert.equal(result.vite,pkg.devDependencies.vite);
  const aliases=Object.entries(installed.exports).map(([specifier,target])=>({
    find:new RegExp('^'+('@iquipage/web'+(specifier==='.'?'':specifier.slice(1))).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),
    replacement:join(deps,'@iquipage/web',typeof target==='string'?target:target.import),
  }));
  aliases.push({find:/^zod$/,replacement:join(deps,'zod/index.js')});
  for(const variant of ['baseline','vt1']){
    const loads=new Set(),modules=new Set(),outDir=join(evidence,'builds',variant);
    const config={configFile:false,root:join(here,'fixture'),logLevel:'warn',resolve:{alias:aliases},
      plugins:[{name:'task-first-screen-exact-source',enforce:'pre',
        load(id){if(variant==='vt1'&&overlay.has(id)){loads.add(id);return overlay.get(id);}return null;},
        moduleParsed(info){modules.add(info.id);}}],
      build:{outDir,emptyOutDir:true,minify:false,cssMinify:false,assetsInlineLimit:0}};
    await build(config);
    assert.deepEqual([...loads].sort(),variant==='vt1'?paths.map(p=>join(repo,p)):[],'Exact overlay load set');
    for(const path of ['ui/src/board/board.js','ui/src/board/task-dialog.js','ui/src/board/task-work-view.js'])assert.ok(modules.has(join(product,path)),'Actual product mounted module '+path);
    const inputs={};for(const id of [...modules].sort()){
      if(id.startsWith(repo+'/')||id.startsWith(deps+'/')){
        const label=id.startsWith(deps+'/')?'node_modules/'+relative(deps,id):relative(repo,id);
        inputs[label]=sha(variant==='vt1'&&overlay.has(id)?overlay.get(id):await readFile(id));
      }
    }
    const bundles={};for(const file of await files(outDir))bundles[file]=await hashFile(join(outDir,file));
    result.builds.push({variant,overlayLoads:[...loads].map(id=>relative(repo,id)),inputSHA256:inputs,
      inputGraphSHA256:sha(JSON.stringify(inputs)),filesSHA256:bundles,bundleSetSHA256:sha(JSON.stringify(bundles))});
    if(!buildOnly){
      const server=await preview({configFile:false,root:join(here,'fixture'),build:{outDir},logLevel:'warn',preview:{host:'127.0.0.1',port:0,strictPort:true}});
      servers.push({variant,server,origin:'http://127.0.0.1:'+server.httpServer.address().port});
    }
  }
  passed('Two static Vite builds: zero-overlay baseline and exact compiled VT1');
  if(buildOnly)result.status='BUILT_NOT_RENDERED';
  else{
    assert.ok(process.env.PLAYWRIGHT_MODULE,'PLAYWRIGHT_MODULE must point to the existing temporary Playwright package');
    const require=createRequire(import.meta.url),pw=resolve(process.env.PLAYWRIGHT_MODULE);
    result.playwright=require(join(pw,'package.json')).version;assert.equal(result.playwright,plan.environment.playwright);
    browser=await require(pw).chromium.launch({headless:true});result.browser=browser.version();
    for(const frame of plan.frames)for(const variant of ['baseline','vt1']){
      const data=scenario(frame.case),entry={id:frame.id,stage:frame.stage,variant,case:frame.case,viewport:frame.viewport,theme:frame.theme,text:frame.text,
        question:frame.question,dataSHA256:sha(JSON.stringify(data)),status:'NOT_RUN',pointer:{x:0,y:0}};
      result.frames.push(entry);let session;
      try{
        session=await openFrame(variant,frame);entry.initial=await snapshot(session.page,data.firstParagraph);entry.probe=await fixtureProbe(session.page);
        entry.screenshot=await screenshot(session.page,frame.id+'-'+variant+'-initial');entry.status='CAPTURED';
        assertInitial(entry,data);assert.deepEqual(entry.probe.attempts,[]);assert.deepEqual(entry.probe.unsupported,[]);
        if(variant==='vt1'){
          const baseline=result.frames.find(x=>x.id===frame.id&&x.variant==='baseline');
          assert.equal(entry.dataSHA256,baseline.dataSHA256);assert.deepEqual(entry.initial.formState,baseline.initial.formState,'Same actual form values across compositions');
        }
      }catch(error){entry.status='FAILED';entry.error=error.stack||error.message;}
      finally{await session?.context.close();}
    }
    for(const variant of ['baseline','vt1']){await accessProbe(variant);await actionProbe(variant,'H02');await actionProbe(variant,'question');}
    assert.deepEqual(result.externalRequests,[],'No off-origin requests');assert.deepEqual(result.pageErrors,[],'No page errors');
    assert.ok(result.frames.every(entry=>entry.status==='CAPTURED'),'One or more captures/engineering checks failed; inspect frames');
    assert.ok(result.nativeProbes.every(entry=>entry.status==='ENGINEERING_CHECKS_PASSED'),'Native probe failed; inspect nativeProbes');
    passed('Comparative data, mounted controls, native access/cancel and existing CTA probes');result.status='CAPTURED';
  }
  assertFrozenProduction();passed('Production source unchanged after the experiment');
}catch(error){result.status='FAILED';result.error=error.stack||error.message;process.exitCode=1;}
finally{
  await browser?.close();for(const {server} of servers)await server.close();
  if(temporary)await rm(temporary,{recursive:true,force:true});
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,builds:result.builds.length,frames:result.frames.length,nativeProbes:result.nativeProbes.length,evidence,error:result.error||null},null,2));
}
