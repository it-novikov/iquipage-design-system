import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../../maps/node_modules/playwright/index.mjs';
import {startServer} from '../scripts/server.mjs';
const server=await startServer(0),out=new URL('../evidence/r3-guards/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(10000);
const checks=[],errors=[];
let failure;
page.on('pageerror',error=>errors.push(error.message));
const pass=message=>{checks.push(message);console.log('PASS',message);};
async function idle(){await page.waitForFunction(()=>{const c=window.planningFixture.view?.controller;return c&&!c.loading&&!c.error&&c.groups.every(g=>!g.busy);});}
try{
  await page.goto(server.url+'/?fixture=r3-guards-'+crypto.randomUUID());
  await page.locator('[data-select]').first().waitFor();await idle();
  await page.evaluate(async()=>{
    const {mountProjectNavigation}=await import('/packages/planning/src/project-navigation.js');
    const root=document.createElement('header');root.id='guard-navigation';document.body.prepend(root);
    window.guard={themes:0,reply:'invalid',current:{id:'one',workspaceName:'Space',projectName:'One'}};
    window.guard.nav=mountProjectNavigation(root,{
      current:window.guard.current,profile:{name:'Test user'},
      projects:async()=>({options:[{value:'two',label:'Two',description:'Other space'}],nextCursor:null}),
      onSwitch:()=>window.guard.reply==='pending'?new Promise(resolve=>{window.guard.resolve=resolve;}):window.guard.reply==='cancel'?false:undefined,
      onTheme:()=>{window.guard.themes++;}
    });
  });
  const nav=page.locator('#guard-navigation');
  await nav.getByRole('button',{name:'Переключить тему',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.guard.themes),1,'Public theme callback must work without demo-specific onclick');
  pass('Public navigation theme button invokes the host callback once');
  await nav.getByRole('button',{name:'Сменить пространство или проект',exact:true}).click();
  const chooser=page.getByRole('dialog',{name:'Пространства и проекты',exact:true});
  await chooser.getByRole('combobox').fill('Two');await chooser.getByRole('option',{name:/Two/}).click();
  await chooser.getByRole('button',{name:'Открыть проект',exact:true}).click();
  assert.equal(await chooser.isVisible(),true,'Malformed host response must not report a successful switch');
  assert.equal(await nav.locator('[data-project-name]').textContent(),'One');
  assert.match(await chooser.locator('[data-error]').textContent(),/подтверждённый контекст/);
  pass('Invalid context response keeps the original project and offers an explicit error');
  await page.evaluate(()=>{window.guard.reply='pending';});
  await chooser.getByRole('button',{name:'Открыть проект',exact:true}).click();
  await page.waitForFunction(()=>typeof window.guard.resolve==='function');
  assert.equal(await chooser.getByRole('button',{name:'Отмена',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.guard.nav.destroy()),false);
  await page.evaluate(()=>window.guard.resolve(false));
  await chooser.getByRole('button',{name:'Отмена',exact:true}).waitFor();
  await chooser.getByRole('button',{name:'Отмена',exact:true}).click();
  await chooser.waitFor({state:'hidden'});
  assert.equal(await nav.locator('[data-project-name]').textContent(),'One');
  await page.waitForFunction(()=>window.guard.nav.readyToLeave());
  assert.equal(await page.evaluate(()=>window.guard.nav.readyToLeave()),true);
  pass('Pending context switch rejects teardown; host cancellation retains the original context');
  await page.evaluate(()=>{window.guard.nav.destroy();window.guard.nav.update(window.guard.current);document.querySelector('#guard-navigation').remove();});
  pass('Disposed navigation ignores late context updates and has no retained UI');
  await quickFieldChecks();assert.deepEqual(errors,[]);
}catch(error){failure=error;console.error(error);await page.screenshot({path:new URL('failure.png',out).pathname});}
finally{
  await writeFile(new URL('report.json',out),JSON.stringify({status:failure?'FAIL':'PASS',scope:'public UI contracts with local fixtures',checks,errors,error:failure?.stack},null,2)+'\n');
  await browser.close();await server.close();
}
if(failure)process.exitCode=1;

async function quickFieldChecks(){
  await page.getByRole('button',{name:'Исполнитель SPR-1',exact:true}).click();
  let editor=page.getByRole('dialog',{name:'Исполнитель задачи',exact:true});
  await editor.getByRole('combobox').fill('Марк');await editor.getByRole('option',{name:'Марк Ли',exact:true}).click();
  await page.evaluate(()=>{window.planningFixture.adapter.failNextRead=true;});
  await editor.getByRole('button',{name:'Сохранить',exact:true}).click();
  await editor.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(async()=> (await window.planningFixture.repository.read('tasks','pn-task-1','pn-project')).owner),'Марк Ли');
  await page.waitForFunction(()=>window.planningFixture.view.readyToLeave());
  assert.equal(await page.evaluate(()=>window.planningFixture.view.readyToLeave()),true);
  await page.getByRole('button',{name:'Обновить список',exact:true}).click();await idle();
  pass('Committed field change survives a failed readback and does not block leaving the view');
  await page.getByRole('button',{name:'Исполнитель SPR-1',exact:true}).click();
  await editor.getByRole('combobox').fill('Денис');await editor.getByRole('option',{name:'Денис Соколов',exact:true}).click();
  await page.evaluate(()=>{const a=window.planningFixture.adapter;window.guardReceipt=a.receipt;a.commit=async()=>{throw Error('Lost response');};a.receipt=async()=>({state:'rejected',message:'Права на изменение отозваны.'});});
  await editor.getByRole('button',{name:'Сохранить',exact:true}).click();
  await editor.getByRole('button',{name:'Проверить результат',exact:true}).click();
  assert.match(await editor.locator('[data-error]').textContent(),/Права на изменение отозваны/);
  await editor.getByRole('button',{name:'Отмена',exact:true}).click();await editor.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(async()=> (await window.planningFixture.repository.read('tasks','pn-task-1','pn-project')).owner),'Марк Ли');
  pass('Definitive rejection during receipt recovery shows the server reason without changing data');
}
