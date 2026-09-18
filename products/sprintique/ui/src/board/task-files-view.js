import {dialog,icon,esc} from '../ui.js';
import {uid,requireValue} from '../common.js';
import {FILE_ACCEPT} from './attachment-model.js';
import {editCoverImage,coverImageStyle} from './cover-crop.js';

/** Draft changes are committed by the task form, never by a preview. */
export function mountTaskFiles(root,{coverRoot,adapter,task,readOnly=false}){
  let ids=[...(task.attachmentIds||[])],coverId=task.coverAttachmentId||null;
  let locked=false,presetPicker,presetLoading=false,cropDialog,coverCrop=task.coverCrop||null;
  let closed=false,active=0,coverGeneration=0,coverIntent=0,coverURL=null;
  const rows=new Map(),staged=new Set(),requests=new Set(),downloads=new Set();
  const events=new AbortController(),signal=events.signal;
  const target=id=>({id,projectId:task.projectId,taskId:task.id});
  const editable=!readOnly&&!!adapter;
  const size=n=>n<1024*1024?`${Math.ceil(n/1024)} КБ`:`${(n/1024/1024).toFixed(1).replace('.',',')} МБ`;
  root.innerHTML=`<h3>Файлы</h3>
    <p class="map-form-error" role="alert" data-file-error hidden></p><div data-file-list></div>
    <div class="task-files-empty" data-files-empty ${editable?'hidden':''}><span>Файлов пока нет</span></div>
    ${editable?`<button type="button" class="file-dropwell" data-file-drop>${icon('upload',18)}<span class="task-dropwell-copy"><span>Выберите или перетащите файлы</span><small>До 10 МБ на файл</small></span></button>
    <input class="iq-file-native" type="file" data-file-input multiple accept="${FILE_ACCEPT}" aria-label="Добавить файлы задачи">
    <input class="iq-file-native" type="file" data-cover-input accept=".png,.jpg,.jpeg,.webp" aria-label="Добавить изображение обложки">`:''}
    ${adapter?'':'<p class="iq-helper">Хранилище файлов не подключено.</p>'}`;
  const list=root.querySelector('[data-file-list]'),error=root.querySelector('[data-file-error]');
  const report=e=>{if(!closed){error.hidden=false;error.textContent=e.message||'Не удалось загрузить файл. Повторите попытку.';}};
  const emit=()=>root.dispatchEvent(new CustomEvent('task-files-change',{bubbles:true}));
  const discard=id=>{if(adapter)Promise.resolve(adapter.discard(target(id))).catch(()=>{});};
  const controller=()=>{const item=new AbortController();requests.add(item);return item;};
  const rowFor=id=>list.querySelector(`[data-file-row="${CSS.escape(id)}"]`);
  const states={queued:'В очереди',uploading:'Загружается',preparing:'Подготовка',processing:'Обработка',saving:'Сохраняется',ready:'',failed:'Не загружен',loading:'Чтение',unavailable:'Хранилище не подключено'};
  function controls(row){
    if(row.state==='ready')return `${editable&&row.meta.image?`<button type="button" class="iq-btn ghost icon sm" data-file-cover="${esc(row.id)}" aria-label="Сделать обложкой: ${esc(row.name)}" aria-pressed="${coverId===row.id}">${icon('image',16)}</button>`:''}<button type="button" class="iq-btn ghost icon sm" data-file-download="${esc(row.id)}" aria-label="Скачать ${esc(row.name)}">${icon('download',16)}</button>`;
    return row.state==='failed'?`<button type="button" class="iq-btn ghost sm" data-file-retry="${esc(row.id)}">Повторить</button>`:'';
  }
  function drawRow(row){
    if(closed)return;let element=rowFor(row.id);
    if(!element){element=document.createElement('div');element.className='iq-file-item task-file-row';element.dataset.fileRow=row.id;
      element.innerHTML=`<iq-file-preview data-file-preview></iq-file-preview><div class="file-item-copy"><b></b><small data-file-status></small><p class="iq-helper error" data-row-error hidden></p></div><span class="task-file-actions"></span>`;list.append(element);}
    element.dataset.state=row.state;element.querySelector('b').textContent=row.name;
    element.querySelector('[data-file-status]').innerHTML=[size(row.size||0),states[row.state],row.id===coverId?'Обложка':''].filter(Boolean).map(text=>`<span>${esc(text)}</span>`).join('');
    const message=element.querySelector('[data-row-error]');message.hidden=!row.error;message.textContent=row.error||'';
    element.querySelector('.task-file-actions').innerHTML=controls(row)+(editable?`<button type="button" class="iq-btn ghost icon sm" data-file-remove="${esc(row.id)}" aria-label="${row.state==='ready'?'Убрать файл':'Отменить загрузку'}: ${esc(row.name)}">${icon('x',16)}</button>`:'');
    root.querySelector('[data-files-empty]').hidden=editable||rows.size>0;
    if(row.file&&!row.previewStarted){element.querySelector('iq-file-preview').file=row.file;row.previewStarted=true;}
    if(row.meta&&!row.previewStarted){row.previewStarted=true;const request=controller();
      adapter.blob({...target(row.id),variant:row.meta.image?'display':'original'},{signal:request.signal}).then(blob=>{
        if(closed||!rows.has(row.id)||!element.isConnected)return;
        if(row.meta.image)requireValue(blob.type==='image/webp','FILE_PREVIEW','Миниатюра недоступна.');
        element.querySelector('iq-file-preview').file=new File([blob],row.name,{type:row.meta.image?'image/webp':row.meta.mime});
      }).catch(()=>{}).finally(()=>requests.delete(request));}
  }
  async function loadExisting(id){
    const row=rows.get(id);if(!row)return;if(!adapter){row.state='unavailable';drawRow(row);return;}row.state='loading';row.error='';drawRow(row);
    const request=controller();try{row.meta=await adapter.describe(target(id),{signal:request.signal});
      if(closed||!rows.has(id))return;Object.assign(row,{name:row.meta.name,size:row.meta.size,state:'ready'});drawRow(row);
      if(coverId===id)renderCover();
    }catch(e){if(!closed&&rows.has(id)){row.state='failed';row.error=e.message;drawRow(row);}}finally{requests.delete(request);}
  }
  function renderCover(){
    const generation=++coverGeneration;
    if(coverURL){URL.revokeObjectURL(coverURL);coverURL=null;}
    for(const item of rows.values())drawRow(item);
    if(!coverId){coverRoot.innerHTML=editable?`<button type="button" class="file-dropwell task-cover-dropwell" data-add-cover><span class="task-dropwell-copy"><span>Добавить обложку</span><small>Выберите готовую или загрузите свою</small></span></button>`:'';return;}
    const row=rows.get(coverId);
    coverRoot.innerHTML=`<div class="task-detail-cover" data-state="loading"><button type="button" data-preview-cover aria-label="Открыть обложку" disabled><img alt="" decoding="async" style="${coverImageStyle(coverCrop,coverId)}" hidden></button><span data-cover-status>Загрузка обложки…</span></div>
      ${editable?'<div class="row task-cover-actions"><button type="button" class="iq-btn ghost sm" data-recrop-cover>Кадрировать</button><button type="button" class="iq-btn ghost sm" data-add-cover>Заменить</button><button type="button" class="iq-btn ghost sm" data-remove-cover>Убрать</button></div>':''}`;
    if(!adapter){
      coverRoot.querySelector('.task-detail-cover').dataset.state='unavailable';
      coverRoot.querySelector('[data-cover-status]').textContent='Хранилище файлов не подключено.';
      return;
    }
    const request=controller();let requestURL=null;
    adapter.blob({...target(coverId),variant:'display'},{signal:request.signal}).then(async blob=>{
      if(closed||generation!==coverGeneration)return;
      requireValue(blob.type==='image/webp','FILE_PREVIEW','Изображение недоступно.');
      requestURL=URL.createObjectURL(blob);const image=coverRoot.querySelector('img');
      image.src=requestURL;await image.decode();
      if(closed||generation!==coverGeneration||!image.isConnected)return;
      coverURL=requestURL;requestURL=null;image.hidden=false;
      coverRoot.querySelector('[data-preview-cover]').disabled=false;coverRoot.querySelector('[data-cover-status]').hidden=true;
      coverRoot.querySelector('.task-detail-cover').dataset.state='ready';
    }).catch(()=>{if(!closed&&generation===coverGeneration){
      const detail=coverRoot.querySelector('.task-detail-cover'),status=coverRoot.querySelector('[data-cover-status]');
      if(detail)detail.dataset.state='unavailable';if(status){status.hidden=false;status.textContent='Обложка недоступна. Файл остаётся в задаче.';}
    }}).finally(()=>{if(requestURL)URL.revokeObjectURL(requestURL);requests.delete(request);});
  }
  function setCover(id,{user=true,crop=null}={}){if(user)coverIntent++;coverId=id;coverCrop=crop?{...crop,attachmentId:id}:null;renderCover();emit();}
  async function upload(row){
    active++;row.state='preparing';row.error='';const request=controller();row.controller=request;drawRow(row);
    try{
      const meta=await adapter.upload(target(row.id),row.file,{signal:request.signal,onProgress:progress=>{
        if(closed||!rows.has(row.id))return;row.state=progress.phase;drawRow(row);
        if(progress.total&&progress.phase==='uploading')rowFor(row.id).querySelector('[data-file-status]').textContent=`Загрузка ${Math.round(progress.loaded/progress.total*100)}%`;
      }});
      if(closed||!rows.has(row.id)){discard(row.id);return;}
      staged.add(row.id);row.meta=meta;row.name=meta.name;row.size=meta.size;row.state='ready';row.file=null;
      if(!ids.includes(row.id))ids.push(row.id);drawRow(row);
      if(row.asCover&&meta.image&&row.coverIntent===coverIntent)setCover(row.id,{user:false,crop:row.crop});emit();
    }catch(e){if(!closed&&rows.has(row.id)){row.state='failed';row.error=e.name==='AbortError'?'Загрузка отменена.':e.message;drawRow(row);}}
    finally{active--;requests.delete(request);row.controller=null;pump();}
  }
  function pump(){for(const row of rows.values()){if(active>=2||closed)break;if(row.state==='queued')void upload(row);}}
  function add(files,asCover=false,crop=null){
    if(!editable||closed||locked)return;error.hidden=true;
    if(files.length>50){report(Error('За один раз выберите не более 50 файлов.'));return;}
    const selected=Array.from(files).slice(0,asCover?1:50);if(!selected.length)return;
    const intent=asCover?++coverIntent:null;
    for(const file of selected){
      const row={id:uid('file'),file,name:file.name,size:file.size,state:'queued',asCover,coverIntent:intent,crop};rows.set(row.id,row);drawRow(row);
    }emit();pump();
  }
  function remove(id){
    const row=rows.get(id);if(!row)return;row.controller?.abort();rows.delete(id);rowFor(id)?.remove();ids=ids.filter(value=>value!==id);
    if(staged.has(id)||row.file){discard(id);staged.delete(id);}if(coverId===id)setCover(null);else if(row.asCover&&row.coverIntent===coverIntent)coverIntent++;
    root.querySelector('[data-files-empty]').hidden=editable||rows.size>0;emit();
  }
  function cropNew(file){if(!file||closed||locked)return;cropDialog=editCoverImage(file,{onApply:(source,crop)=>{if(closed||locked)throw Error('Задача уже закрыта.');const name=source.name||'Обложка.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[source.type]||'png');add([new File([source],name,{type:source.type})],true,crop);}});}
  async function cropExisting(id){
    const request=controller(),intent=coverIntent;
    try{const blob=await adapter.blob({...target(id),variant:'original'},{signal:request.signal});if(closed||locked||intent!==coverIntent)return;const row=rows.get(id),file=new File([blob],row.name,{type:row.meta.mime});cropDialog=editCoverImage(file,{crop:coverId===id?coverCrop:null,onApply:(source,crop)=>{if(closed||locked||!rows.has(id))throw Error('Файл больше недоступен.');if(source===file)setCover(id,{crop});else add([new File([source],source.name||'Обложка.png',{type:source.type})],true,crop);}});}
    catch(error){if(error.name!=='AbortError')report(error);}finally{requests.delete(request);}
  }
  async function downloadFile(id){
    const row=rows.get(id);if(!row?.meta||!adapter)return;const request=controller();
    try{const blob=await adapter.blob({...target(id),variant:'original'},{signal:request.signal});
      if(closed)return;const url=URL.createObjectURL(blob);downloads.add(url);
      const link=document.createElement('a');link.href=url;link.download=row.name;link.click();
      setTimeout(()=>{URL.revokeObjectURL(url);downloads.delete(url);},30000);
    }catch(e){if(e.name!=='AbortError')report(e);}finally{requests.delete(request);}
  }
  root.addEventListener('click',event=>{
    if(locked)return;
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-file-drop]'))root.querySelector('[data-file-input]')?.click();
    if(button.dataset.fileRemove&&editable)remove(button.dataset.fileRemove);
    if(button.dataset.fileCover&&editable)void cropExisting(button.dataset.fileCover);
    if(button.dataset.fileDownload)void downloadFile(button.dataset.fileDownload);
    if(button.dataset.fileRetry){const row=rows.get(button.dataset.fileRetry);if(row?.file){row.state='queued';pump();}else if(row)void loadExisting(row.id);}
  },{signal});
  async function openPresetPicker(){
    if(presetLoading)return;presetLoading=true;
    try{
      const {openCoverPresets}=await import('./cover-presets.js');
      if(closed||locked)return;
      presetPicker?.destroy();presetPicker=openCoverPresets(file=>{if(closed||locked)return;if(file)cropNew(file);else root.querySelector('[data-cover-input]').click();});
    }catch(error){report(error);}finally{presetLoading=false;}
  }
  coverRoot.addEventListener('click',event=>{
    if(locked)return;
    if(event.target.closest('[data-add-cover]')&&editable)void openPresetPicker();
    if(event.target.closest('[data-remove-cover]')&&editable)setCover(null);
    if(event.target.closest('[data-recrop-cover]')&&editable&&coverId)void cropExisting(coverId);
    if(event.target.closest('[data-preview-cover]')&&coverURL){
      const url=coverURL;dialog({title:rows.get(coverId)?.name||'Обложка',body:`<div class="task-detail-cover"><img alt="Обложка задачи" data-cover-full style="${coverImageStyle(coverCrop,coverId)}"></div>`,wide:true,mount:element=>{element.querySelector('[data-cover-full]').src=url;}});
    }
  },{signal});
  root.querySelector('[data-file-input]')?.addEventListener('change',event=>{add(event.target.files);event.target.value='';},{signal});
  root.querySelector('[data-cover-input]')?.addEventListener('change',event=>{cropNew(event.target.files[0]);event.target.value='';},{signal});
  const drop=root.querySelector('[data-file-drop]');
  drop?.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer.types).includes('Files')){event.preventDefault();drop.classList.add('dragover');}},{signal});
  drop?.addEventListener('dragleave',()=>drop.classList.remove('dragover'),{signal});
  drop?.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragover');add(event.dataTransfer.files);},{signal});
  for(const id of ids){rows.set(id,{id,name:'Файл',size:0,state:'loading'});drawRow(rows.get(id));void loadExisting(id);}
  renderCover();
  return {
    value:()=>({attachmentIds:[...ids],coverAttachmentId:coverId,coverCrop}),
    dirty:()=>[...rows.values()].some(row=>!!row.file),
    isBusy:()=>active>0,
    setLocked(value){locked=!!value;root.inert=locked;coverRoot.inert=locked;},
    assertReady(){requireValue(!active&&![...rows.values()].some(row=>row.file),'FILES_PENDING','Дождитесь загрузки файлов. Неудавшиеся загрузки можно повторить или убрать.');},
    accepted(saved){for(const id of saved.attachmentIds||[])staged.delete(id);},
    destroy(){
      closed=true;coverGeneration++;coverIntent++;events.abort();presetPicker?.destroy();cropDialog?.close();requests.forEach(request=>request.abort());
      if(coverURL)URL.revokeObjectURL(coverURL);downloads.forEach(url=>URL.revokeObjectURL(url));
      for(const row of rows.values())if(staged.has(row.id)||row.file)discard(row.id);
      rows.clear();staged.clear();root.replaceChildren();coverRoot.replaceChildren();
    }
  };
}
