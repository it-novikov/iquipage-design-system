import {PlanningOperation} from '../ui/planning/src/operation.js';

/** Whether to ask first, read fresh from the server: the choice follows the person to every device. */
async function asksFirst(client){
  try{return (await client.request('/profile')).preferences?.confirmReleaseScope!==false;}
  catch{return true;}
}

/**
 * Previews and commits a planning intent without the effects table: the alert already said what changes. The
 * adapter's write-ahead journal keeps a lost answer recoverable, as for every planning command. Resolves true when
 * committed, false when the server refuses the change of release scope to this person (403).
 */
export async function commitIntent(adapter,intent){
  let refusal=null;
  const watched=Object.create(adapter);
  watched.preview=async request=>{try{return await adapter.preview(request);}catch(error){refusal=error;throw error;}};
  const operation=new PlanningOperation(watched,adapter.projectId);
  try{
    await operation.inspect(intent);
    if(operation.state==='failed'&&refusal?.status===403)return false;
    if(operation.state!=='ready')throw Error(operation.error||'Не удалось проверить изменение. Повторите.');
    if(operation.preview.blockers.length)throw Error(operation.preview.blockers.join(' '));
    await operation.submit();
    if(operation.state==='uncertain')await operation.recover();
    if(operation.state==='committed')return true;
    if(operation.state==='uncertain')throw Object.assign(Error('Ответ сервера не получен. Проверим, создана ли задача.'),{uncertain:true});
    throw Error(operation.error||'Задача не создана. Повторите.');
  }finally{operation.destroy();}
}

/**
 * A task created on the board in the release it shows (running or planned) joins that release. The person is asked
 * first unless they chose not to be; then the creation goes through planning (release admission, revision fence,
 * idempotent commit). Without the right to change the release scope (refused as 403 by the preview; today that is
 * tasks:write, so a person who may create may also do this) the task is created in the backlog, as before, and the
 * person is told so. A cancelled question keeps the form open with everything typed.
 */
export async function createInRelease({adapter,client,intent,release,createInBacklog,ask,notify,recover}){
  if(await asksFirst(client)){
    const answer=await ask({release});
    // Cancelling is a choice, not a failure: the form stays open with everything typed and shows no error.
    if(!answer)throw Object.assign(Error('Задача не создана.'),{cancelled:true});
    if(answer.stopAsking){
      try{await client.request('/profile/preferences','PUT',{confirmReleaseScope:false});}
      catch{notify({tone:'warning',message:'Не удалось запомнить выбор. В следующий раз спросим снова.'});}
    }
  }
  let placed;
  // A lost answer is settled from its receipt, never by sending the command again.
  try{placed=await commitIntent(adapter,intent);}
  catch(error){
    if(!error.uncertain||!recover)throw error;
    const outcome=await recover();
    if(outcome?.state==='rejected')throw Error(outcome.message||'Задача не создана.');
    if(outcome?.state!=='committed')throw error;
    placed=true;
  }
  if(placed)return 'release';
  await createInBacklog();
  notify({tone:'warning',message:`Нет права менять состав релиза «${release.name}». Задача создана в бэклоге.`});
  return 'backlog';
}
