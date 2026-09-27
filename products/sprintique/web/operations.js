import {ui,escapeHTML as esc,formatDateTime} from '@iquipage/web/core';
import {dialog} from '../ui/src/ui.js';
import * as s from './settings-ui.js';
const states={pending:['Запланировано','neutral'],running:['Выполняется','info'],failed:['Требует внимания','warning'],done:['Готово','success'],cancelled:['Остановлено','neutral']};
const errors={storage_unavailable:'Хранилище файлов недоступно',not_found:'Файл уже удалён',timeout:'Хранилище не ответило вовремя'};
/** File cleanup status (admins). A calm "all good" when nothing needs attention; failed jobs can be retried. */
export async function mountOperations(root,{repository,project,tools,onCounts=()=>{}}){
  const base='/projects/'+encodeURIComponent(project.id)+'/operations',abort=new AbortController();
  let closed=false,modal=null,loading=false;
  if(tools)tools.innerHTML=ui.btn('Обновить','ghost sm','refresh','data-ops-refresh');
  async function render(){
    if(closed||loading)return;loading=true;
    try{const data=await repository.client.request(base);if(closed)return;
      const count=state=>data.counts.find(c=>c.state===state)?.count||0,failed=count('failed');
      const status=failed?s.empty({title:`Требуют внимания: ${failed}`,body:'Эти файлы не удалось очистить. Повторите попытку: используемые файлы не удаляются.',glyph:'warning',tone:'warning'}):s.empty({title:'Всё в порядке',body:'Удалённые файлы и незавершённые загрузки очищаются автоматически. Удалённый файл хранится ещё 24 часа.',glyph:'checkCircle',tone:'success'});
      const job=j=>{const [label,tone]=states[j.state]||[j.state,'neutral'];return s.row({media:s.tile('file'),title:'Очистка файла',meta:[esc(formatDateTime(j.availableAt)),`Попыток ${j.attempts}`,j.errorCode?esc(errors[j.errorCode]||'Код ошибки '+j.errorCode):''],aside:s.badge(label,tone),actions:j.state==='failed'?ui.btn('Повторить','secondary sm','refresh',`data-retry-job="${esc(j.id)}"`):''});};
      root.innerHTML=s.panel(status)
        +(failed||count('running')||count('pending')?s.group({title:'Очередь',body:s.panel(s.facts([['Требуют внимания',String(failed)],['Выполняются',String(count('running'))],['Запланированы',String(count('pending'))]]))}):'')
        +(data.jobs.length?s.group({title:'Операции',description:data.jobs.length>=data.limit?`Показаны последние ${data.limit}.`:'',body:s.panel(data.jobs.map(job).join(''))}):'');
      onCounts();
    }finally{loading=false;}
  }
  const onClick=event=>{
    if(event.target.closest('[data-ops-refresh]')){void render();return;}
    const id=event.target.closest('[data-retry-job]')?.dataset.retryJob;if(!id||modal)return;
    modal=dialog({title:'Повторить очистку?',description:'Сервер повторит безопасную очистку. Файлы, которые используются в задачах или картах, удалены не будут.',submitLabel:'Повторить',success:'Очистка запущена снова',onSubmit:async()=>{
      await repository.client.request(base+'/jobs/'+id+'/retry','POST',{},await repository.key('job-retry:'+id,{}));await render();
    }});modal.addEventListener('iq-close',()=>{modal=null;},{once:true});
  };
  root.addEventListener('click',onClick,{signal:abort.signal});tools?.addEventListener('click',onClick,{signal:abort.signal});
  await render();return {readyToLeave:()=>!modal,destroy(){closed=true;abort.abort();modal?.close(true);root.replaceChildren();}};
}
