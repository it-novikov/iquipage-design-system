import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {referenceServer} from './server-fixture.mjs';
const cleanup=[],checks=[];let browser,page,failure;
const api=await referenceServer({after:fn=>cleanup.push(fn)});
const {chromium}=await import(process.env.MAPS_PLAYWRIGHT_MODULE?pathToFileURL(process.env.MAPS_PLAYWRIGHT_MODULE).href:'playwright');
const mark=name=>{checks.push({name,status:'PASS'});console.log('PASS',name);};
try{
  browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
  page=await browser.newPage();await page.goto(api.base);await page.getByRole('button',{name:'Новая задача',exact:true}).waitFor();
  for(const mode of ['atomic','fallback']){
    await page.evaluate(()=>{
      const form=document.createElement('form');form.id='editor-move-fixture';
      form.style.cssText='position:fixed;inset:0;background:var(--iq-raised);z-index:500;padding:20px';
      form.innerHTML='<section data-before></section><section data-editor-parent><iq-markdown-editor label="Проверка переноса" submit-label="Отправить"></iq-markdown-editor></section><section data-after></section>';
      document.body.append(form);
    });
    const editor=page.locator('#editor-move-fixture iq-markdown-editor'),textbox=editor.getByRole('textbox');
    await textbox.fill('Первая версия');await textbox.fill('Вторая версия');await textbox.focus();
    await textbox.evaluate(input=>{input.setSelectionRange(2,6);window.originalEditorInput=input;});
    const moved=await page.evaluate(mode=>{
      const form=document.querySelector('#editor-move-fixture'),parent=form.querySelector('[data-editor-parent]');
      if(mode==='atomic')form.moveBefore(parent,form.firstElementChild);
      else form.insertBefore(parent,form.firstElementChild);
      const editor=parent.querySelector('iq-markdown-editor'),input=parent.querySelector('textarea');
      return {sameInput:input===window.originalEditorInput,value:editor.value,start:input.selectionStart,end:input.selectionEnd};
    },mode);
    assert.equal(moved.sameInput,true);assert.equal(moved.value,'Вторая версия');assert.equal(moved.start,2);assert.equal(moved.end,6);
    await textbox.focus();await page.keyboard.press('Control+z');assert.equal(await textbox.inputValue(),'Первая версия');
    await page.keyboard.press('Control+Shift+z');assert.equal(await textbox.inputValue(),'Вторая версия');
    mark(mode+': moving the editor preserves input identity, selection and Undo/Redo');
    await editor.getByRole('button',{name:'Предпросмотр',exact:true}).click();
    const preview=await page.evaluate(mode=>{
      const form=document.querySelector('#editor-move-fixture'),parent=form.querySelector('[data-editor-parent]');
      if(mode==='atomic')form.moveBefore(parent,null);else form.append(parent);
      return !parent.querySelector('.md-preview').hidden;
    },mode);assert.equal(preview,true);mark(mode+': preview mode survives reordering');
    await editor.evaluate(element=>{element.value='';});
    const empty=await page.evaluate(mode=>{
      const form=document.querySelector('#editor-move-fixture'),parent=form.querySelector('[data-editor-parent]');
      if(mode==='atomic')form.moveBefore(parent,form.firstElementChild);else form.insertBefore(parent,form.firstElementChild);
      return parent.querySelector('iq-markdown-editor').value;
    },mode);assert.equal(empty,'');mark(mode+': empty reply never becomes toolbar text');
    const afterRemoval=await editor.evaluate(async element=>{
      let submissions=0;element.addEventListener('iq-submit',()=>submissions++);element.value='Отправка';
      const form=element.closest('form');form.remove();await Promise.resolve();
      element.querySelector('[data-md-submit]').click();return submissions;
    });assert.equal(afterRemoval,0);mark(mode+': genuine removal cleans up submit listeners');
  }
}catch(error){failure=error;console.error(error);}
finally{
  await mkdir('artifacts/editor-move',{recursive:true});
  await writeFile('artifacts/editor-move/browser.json',JSON.stringify({status:failure?'FAIL':'PASS',checks,error:failure?.message},null,2));
  await browser?.close();for(const fn of cleanup.reverse())await fn();
}
if(failure)process.exitCode=1;
