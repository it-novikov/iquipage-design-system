import assert from 'node:assert/strict';
/** Failure injection is scoped to the temporary local acceptance server. */
export async function checkCoverRecovery({page,context,api,task,png,mark}){
  const panel=()=>page.locator('.task-edit-dialog dialog[open]').last();
  const last=()=>page.locator('dialog[open]').last();
  const get=()=>api.get(`/records/tasks/${task.id}?projectId=${task.projectId}`);
  await page.getByRole('button',{name:task.title,exact:true}).click();
  await panel().getByLabel('Название',{exact:true}).fill('Черновик при конфликте обложки');
  await panel().locator('[data-cover-input]').setInputFiles({name:'conflict.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-file-row]')].some(row=>row.textContent.includes('conflict.png')&&row.dataset.state==='ready'));
  const latest=await get();await api.put('tasks',{...latest,description:'Параллельное изменение'});
  await panel().getByRole('button',{name:'Сохранить задачу',exact:true}).click();
  await panel().locator('.map-dialog-form > .map-form-error:not([hidden])').waitFor();
  assert.equal(await panel().getByLabel('Название',{exact:true}).inputValue(),'Черновик при конфликте обложки');
  assert.equal((await get()).coverAttachmentId,latest.coverAttachmentId);
  assert.equal((await get()).description,'Параллельное изменение');
  await panel().locator('.iq-dialog-head [data-close]').click();
  await last().getByRole('button',{name:'Не сохранять',exact:true}).click();
  await page.locator('.task-edit-dialog').waitFor({state:'detached'});
  mark('server: a concurrent task change rejects the cover save without losing canonical data or the user draft');
  let release,held=false;
  const handler=async route=>{
    if(!held&&route.request().method()==='PUT'){
      held=true;await new Promise(resolve=>{release=resolve;});
      await route.continue().catch(()=>{});
    }else await route.fallback();
  };
  await context.route('**/api/files/**',handler);
  await page.reload();
  await page.getByRole('button',{name:task.title,exact:true}).click();
  await panel().locator('[data-file-input]').setInputFiles({name:'cancelled.md',mimeType:'text/plain',buffer:Buffer.from('Отмена загрузки')});
  for(let i=0;i<100&&!held;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(held,true);
  const row=panel().locator('[data-file-row]').filter({hasText:'cancelled.md'});await row.locator('[data-file-remove]').click();
  release();await context.unroute('**/api/files/**',handler);
  await row.waitFor({state:'detached'});
  assert.deepEqual((await get()).attachmentIds,latest.attachmentIds);
  await panel().locator('.iq-dialog-head [data-close]').click();await page.locator('.task-edit-dialog').waitFor({state:'detached'});
  mark('server: cancelling an in-flight upload leaves the task and previous cover unchanged');
  return get();
}
