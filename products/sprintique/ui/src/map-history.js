import {dialog,esc,date,icon} from './ui.js';

/** Immutable server history; viewing a version never replaces the open document. */
export async function showMapHistory(feature){
  if(!feature.current||!feature.repository.mapHistory||!await feature.readyToLeave())return;
  const {id,projectId}=feature.current,abort=new AbortController();
  let cursor,loading=false,closed=false,preview=null;
  const el=feature.dialog({title:'История карты',description:'Каждая сохранённая версия остаётся доступна для просмотра.',body:'<div class="iq-list" data-history-list></div><button type="button" class="iq-btn secondary sm" data-history-more>Ещё версии</button><p role="status" data-history-status></p>'});
  const more=el.querySelector('[data-history-more]'),list=el.querySelector('[data-history-list]'),status=el.querySelector('[data-history-status]');
  async function load(){
    if(closed||loading)return;loading=true;more.disabled=true;status.textContent='Загружаем историю…';
    try{
      const page=await feature.repository.mapHistory(projectId,id,cursor,{signal:abort.signal});if(closed)return;
      list.insertAdjacentHTML('beforeend',page.items.map(v=>`<button type="button" class="iq-list-item" data-map-version="${v.revision}"><span><strong>Версия ${v.revision}</strong><br><small>${esc(date(v.createdAt))} · ${esc(v.title)}</small></span>${icon('chevron',16)}</button>`).join(''));
      cursor=page.nextCursor;more.hidden=!cursor;status.textContent=list.children.length?'':'История пока пуста.';
    }catch(error){if(!closed)status.textContent=error.message;}
    finally{loading=false;more.disabled=false;}
  }
  more.addEventListener('click',load,{signal:abort.signal});
  list.addEventListener('click',async event=>{
    const button=event.target.closest('[data-map-version]');if(!button||preview||loading)return;
    button.disabled=true;loading=true;
    try{
      const version=await feature.repository.mapVersion(projectId,id,Number(button.dataset.mapVersion),{signal:abort.signal});if(closed)return;
      preview=dialog({title:`Версия ${version.revision}`,description:`${version.title} · ${date(version.updatedAt)}. Только просмотр.`,wide:true,body:'<div class="map-version-preview"></div>',mount:element=>{
        const board=document.createElement('iq-whiteboard');board.surfaceMode='embedded';board.readOnly=true;board.data=version.document;
        element.querySelector('.map-version-preview').append(board);requestAnimationFrame(()=>{if(board.isConnected)board.fit();});
      }});preview.addEventListener('iq-close',()=>{preview=null;},{once:true});
    }catch(error){if(!closed)status.textContent=error.message;}
    finally{loading=false;button.disabled=false;}
  },{signal:abort.signal});
  el.addEventListener('iq-close',()=>{closed=true;abort.abort();preview?.close(true);},{once:true});
  await load();return el;
}
