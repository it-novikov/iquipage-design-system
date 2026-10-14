import assert from 'node:assert/strict';
import {data} from './fixture/data.mjs';

const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
async function state(page,id){return page.evaluate(id=>{
  const row=document.querySelector(`[data-row="${id}"]`),trigger=row.querySelector('.iq-select-trigger,.iq-date-trigger'),popup=row.querySelector('.iq-popup,.iq-date-popup');
  const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const t=rect(trigger),p=rect(popup),gap=p.top>=t.bottom?p.top-t.bottom:t.top-p.bottom,vv=window.visualViewport;
  return {observedAt:performance.now(),value:row.value,expanded:trigger.getAttribute('aria-expanded'),trigger:t,popup:p,
    popupContainsFocus:popup.contains(document.activeElement),triggerFocused:document.activeElement===trigger,
    viewport:{width:innerWidth,height:innerHeight},hostWidth:document.querySelector('#fixture-host').getBoundingClientRect().width,
    visualViewport:vv?{width:vv.width,height:vv.height,offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop,pageLeft:vv.pageLeft,pageTop:vv.pageTop,scale:vv.scale}:null,
    visualViewportEvents:window.propertyListProbe.visualViewportEvents?{...window.propertyListProbe.visualViewportEvents}:null,
    windowScroll:{x:scrollX,y:scrollY},resizeEvents:window.propertyListProbe.resizeEvents,
    scrollEvents:window.propertyListProbe.scrollEvents,changes:[...window.propertyListProbe.changes],
    anchor:{verticalGap:gap,horizontallyOverlapping:p.left<t.right&&p.right>t.left,
      visiblyAdjacent:gap>=-1&&gap<=10&&p.left<t.right&&p.right>t.left}};
},id);}

export async function exerciseControls(page,profile,capture,result={}){
  Object.assign(result,{status:'NOT_RUN',popupResize:[],checks:[],note:'Synthetic keyboard actions; container-only resize changes only the outer host width. Anchor geometry is a diagnostic, not a repaired popup contract.'});
  await page.evaluate(()=>{
    const probe=window.propertyListProbe;probe.resizeEvents=0;probe.scrollEvents=0;
    probe.visualViewportEvents=window.visualViewport?{resize:0,scroll:0}:null;
    window.addEventListener('resize',()=>probe.resizeEvents++);
    document.addEventListener('scroll',()=>probe.scrollEvents++,{capture:true,passive:true});
    window.visualViewport?.addEventListener('resize',()=>probe.visualViewportEvents.resize++,{passive:true});
    window.visualViewport?.addEventListener('scroll',()=>probe.visualViewportEvents.scroll++,{passive:true});
  });
  const alternate=profile.container_width===615?270:615;
  for(const id of ['owner','due']){
    const locator=page.locator(`[data-row="${id}"]`).locator('.iq-select-trigger,.iq-date-trigger').first(),original=await locator.elementHandle();
    await locator.focus();await page.keyboard.press(id==='owner'?'Enter':'ArrowDown');await settle(page);
    const before=await state(page,id);assert.equal(before.expanded,'true',id+' opens from keyboard');
    await page.evaluate(width=>{document.querySelector('#fixture-host').style.width=width+'px';},alternate);await settle(page);
    const resized=await state(page,id);assert.deepEqual(resized.viewport,before.viewport,'The viewport did not change');
    assert.equal(resized.resizeEvents,before.resizeEvents,'No window resize event was manufactured');assert.equal(resized.hostWidth,alternate);
    const resizeEntry={id,before,resized};result.popupResize.push(resizeEntry);
    resizeEntry.capture=await capture(id+'-container-resize');
    resizeEntry.afterPNG=await state(page,id);
    await settle(page);resizeEntry.afterCaptureFrames=await state(page,id);
    const changed=[];
    for(const [checkpoint,observed] of [['afterPNG',resizeEntry.afterPNG],['afterCaptureFrames',resizeEntry.afterCaptureFrames]]){
      for(const key of ['viewport','hostWidth','windowScroll','resizeEvents','scrollEvents','visualViewport','visualViewportEvents'])
        if(JSON.stringify(observed[key])!==JSON.stringify(resized[key]))changed.push({checkpoint,key,before:resized[key],after:observed[key]});
    }
    resizeEntry.captureObservation={status:changed.length?'CAPTURE_CHANGED_ENVIRONMENT':'CAPTURE_ENVIRONMENT_UNCHANGED',changed,
      note:'Geometry and focus are sampled immediately after viewport PNG and after two further animation frames; an unchanged environment does not prove adjacency.'};
    await page.keyboard.press('Escape');await settle(page);
    const cancelled=await state(page,id);resizeEntry.cancelled=cancelled;
    assert.equal(cancelled.expanded,'false',id+' Escape closes');assert.equal(cancelled.value,id==='owner'?data.person.id:data.due,id+' cancel preserves value');
    assert.equal(cancelled.triggerFocused,true,id+' Escape restores trigger focus');
    assert.equal(await locator.evaluate((node,old)=>node===old,original),true,id+' control identity remains');
    assert.deepEqual(cancelled.changes,[],id+' resize/cancel dispatches no change');
    resizeEntry.identityPreserved=true;
    await page.evaluate(width=>{document.querySelector('#fixture-host').style.width=width+'px';},profile.container_width);await settle(page);
    await original.dispose();
  }
  const owner=page.locator('[data-row="owner"] .iq-select-trigger');
  await owner.focus();await page.keyboard.press('Enter');await settle(page);await page.keyboard.press('End');await page.keyboard.press('Enter');await settle(page);
  result.selected=await state(page,'owner');assert.equal(result.selected.value,'person-2');
  assert.deepEqual(result.selected.changes,[{row:'owner',value:'person-2'}],'One keyboard choice emits one intent');assert.equal(result.selected.triggerFocused,true);
  await page.keyboard.press('Enter');await settle(page);await page.keyboard.press('Home');await page.keyboard.press('Enter');await settle(page);
  result.restored=await state(page,'owner');assert.equal(result.restored.value,data.person.id);
  assert.deepEqual(result.restored.changes,[{row:'owner',value:'person-2'},{row:'owner',value:data.person.id}]);
  result.checks.push('select open/cancel, changed selection and restored selection preserve focus and emit exactly the chosen intents');

  const combo=page.locator('[data-row="participant"] .iq-combo-input');await combo.focus();await page.keyboard.press('End');
  const end=await combo.evaluate(input=>({tag:input.tagName,value:input.value,start:input.selectionStart,end:input.selectionEnd}));
  assert.equal(end.tag,'INPUT');assert.equal(end.value,data.person.name);assert.equal(end.start,end.value.length);assert.equal(end.end,end.value.length);
  await page.keyboard.press('Home');assert.equal(await combo.evaluate(input=>input.selectionStart),0);
  result.singleLineCombo=end;result.checks.push('combobox remains a native single-line input with full buffer and Home/End caret navigation');

  const tagInput=page.locator('[data-row="tags"] .iq-tag-picker-field > input');const tagHandle=await tagInput.elementHandle();
  result.tagTabPath=[];
  for(let step=0;step<4;step++){
    await page.keyboard.press('Tab');await settle(page);
    result.tagTabPath.push(await page.evaluate(()=>{const n=document.activeElement,r=n.getBoundingClientRect();return {tag:n.tagName,className:n.className,row:n.closest('[data-row]')?.dataset.row,width:r.width,height:r.height};}));
    if(await tagInput.evaluate(input=>document.activeElement===input))break;
  }
  assert.equal(await tagInput.evaluate(input=>document.activeElement===input),true,'Tab reaches the existing tag search buffer without forced focus');
  await tagInput.fill('Проверка очень длинной строки поиска');await page.keyboard.press('Escape');await settle(page);
  result.tagSearch=await tagInput.evaluate(input=>{const s=getComputedStyle(input),r=input.getBoundingClientRect();return {tag:input.tagName,value:input.value,height:r.height,lineHeight:parseFloat(s.lineHeight),focused:document.activeElement===input,expanded:input.getAttribute('aria-expanded'),values:input.closest('iq-tag-picker').value};});
  assert.equal(result.tagSearch.tag,'INPUT');assert.equal(result.tagSearch.focused,true);assert.equal(result.tagSearch.expanded,'false');
  assert.deepEqual(result.tagSearch.values,data.tags.map(tag=>tag.value));assert.equal(await tagInput.evaluate((node,old)=>node===old,tagHandle),true);
  await capture('tag-search-focused');await tagHandle.dispose();
  result.finalChanges=await page.evaluate(()=>window.propertyListProbe.changes);
  assert.deepEqual(result.finalChanges,[{row:'owner',value:'person-2'},{row:'owner',value:data.person.id}],'Search/cancel emits no value mutation');
  result.checks.push('tag search stays reachable and single-line; Escape keeps selected tags and input identity');
  assert.deepEqual(result.popupResize.flatMap(entry=>entry.captureObservation.changed),[],'Viewport capture must not resize or scroll the observed environment');
  result.status='KEYBOARD_PASS_ANCHOR_REVIEW_PENDING';return result;
}
