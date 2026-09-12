import {ui,escapeHTML as esc} from '@iquipage/web/core';
import {dialog,date} from '../ui/src/ui.js';
const names={pending:'Запланировано',running:'Выполняется',failed:'Требует внимания',done:'Готово',cancelled:'Остановлено'};
export async function mountOperations(root,{repository,project,onBack}){
  const base='/projects/'+encodeURIComponent(project.id)+'/operations',abort=new AbortController();
  let closed=false,modal=null,loading=false;
  async function render(){
    if(closed||loading)return;loading=true;
    try{const data=await repository.client.request(base);if(closed)return;
      root.innerHTML=`<section class="host-settings task-settings-page">${ui.btn('Настройки проекта','ghost sm','left','data-ops-back')}<h1>Фоновые операции</h1><p>Очистка несохранённых и удалённых файлов. События проекта доступны через защищённый поток SSE и API с восстановлением позиции.</p>
        <div class="iq-list">${data.counts.map(c=>`<div class="iq-list-item"><span>${esc(names[c.state]||c.state)}</span><strong>${c.count}</strong></div>`).join('')}</div><h2>Текущие операции</h2>
        <div class="iq-list">${data.jobs.length?data.jobs.map(j=>`<div class="iq-list-item"><span>Очистка файла · ${esc(names[j.state])}<br><small>${esc(date(j.availableAt))} · попыток ${j.attempts}${j.errorCode?' · '+esc(j.errorCode):''}</small></span>${j.state==='failed'?ui.btn('Повторить','secondary sm','refresh','data-retry-job="'+esc(j.id)+'"'):''}</div>`).join(''):'<p>Нет операций, требующих внимания.</p>'}</div><p class="iq-helper">Показано до ${data.limit} операций. Удалённые файлы хранятся ещё 24 часа; файлы в истории карт сохраняются вместе с историей.</p></section>`;
    }finally{loading=false;}
  }
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-ops-back]'))return onBack();
    const id=event.target.closest('[data-retry-job]')?.dataset.retryJob;if(!id||modal)return;
    modal=dialog({title:'Повторить фоновую операцию?',description:'Сервер повторит безопасную очистку. Файлы, которые используются в задачах или картах, удалены не будут.',submitLabel:'Повторить',onSubmit:async()=>{
      await repository.client.request(base+'/jobs/'+id+'/retry','POST',{},await repository.key('job-retry:'+id,{}));await render();
    }});modal.addEventListener('iq-close',()=>{modal=null;},{once:true});
  },{signal:abort.signal});
  await render();return {readyToLeave:()=>!modal,destroy(){closed=true;abort.abort();modal?.close(true);root.replaceChildren();}};
}
