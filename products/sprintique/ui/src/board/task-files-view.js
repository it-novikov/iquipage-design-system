import {dialog,icon,esc} from '../ui.js';
import {uid,requireValue} from '../common.js';
import {fileTypeOf} from '../../../contracts/media.ts';

/** Originals up to this size are fetched to draw a PDF or text preview; larger files show a tile. */
const PREVIEW_ORIGINAL_LIMIT=10*1024*1024;
const MB=1024*1024,GB=1024*MB;
const formatSize=n=>n<MB?`${Math.ceil(n/1024)} КБ`:n<GB?`${(n/MB).toFixed(1).replace('.',',')} МБ`:`${(n/GB).toFixed(2).replace('.',',')} ГБ`;
const extensionOf=name=>name.includes('.')?name.split('.').pop().slice(0,5).toUpperCase():'FILE';
const isVideo=mime=>/^video\//.test(mime||'');
/** Whether the DS preview can draw this file without reading all of it into memory. */
const cheapPreview=(name,mime,size)=>{const type=fileTypeOf(name);return type.previewable||isVideo(mime||type.mime)||((type.mime==='application/pdf'||type.text)&&type.mime!=='image/svg+xml'&&size<=PREVIEW_ORIGINAL_LIMIT);};
import {editCoverImage,coverImageStyle,coverLetterboxed} from './cover-crop.js';

/** Draft changes are committed by the task form, never by a preview. */
export function mountTaskFiles(root,{coverRoot,adapter,task,readOnly=false,onCoverState=()=>{}}){
  let ids=[...(task.attachmentIds||[])],coverId=task.coverAttachmentId||null;
  let locked=false,presetPicker,presetLoading=false,cropDialog,coverCrop=task.coverCrop||null;
  let closed=false,active=0,coverGeneration=0,coverIntent=0,coverURL=null;
  const rows=new Map(),staged=new Set(),requests=new Set(),downloads=new Set();
  const events=new AbortController(),signal=events.signal;
  const target=id=>({id,projectId:task.projectId,taskId:task.id});
  const editable=!readOnly&&!!adapter;
  const size=formatSize;
  // The files zone stays collapsed: one quiet action in the head, and the whole section takes dropped files.
  root.innerHTML=`<div class="iq-section-head">${icon('file',16)}<h3>Файлы</h3><span class="iq-section-count" data-file-count></span><span class="iq-section-actions">${editable?`<iq-file-picker variant="button" multiple label="Прикрепить" drop-target="[data-task-files]" data-file-picker></iq-file-picker>`:''}</span></div>
    <p class="map-form-error" role="alert" data-file-error hidden></p><div data-file-list></div>
    <p class="task-files-empty" data-files-empty>${editable?'Перетащите файлы в этот раздел или нажмите «Прикрепить». Видео, документы, архивы и изображения — до 2 ГБ на файл.':'Файлов пока нет'}</p>
    ${editable?`<iq-file-picker hidden accept=".png,.jpg,.jpeg,.webp" label="Изображение обложки" data-cover-picker></iq-file-picker>`:''}
    ${adapter?'':'<p class="iq-helper">Хранилище файлов не подключено.</p>'}`;
  const list=root.querySelector('[data-file-list]'),error=root.querySelector('[data-file-error]');
  const report=e=>{if(!closed){error.hidden=false;error.textContent=e.message||'Не удалось загрузить файл. Повторите попытку.';}};
  const emit=()=>root.dispatchEvent(new CustomEvent('task-files-change',{bubbles:true}));
  const discard=id=>{if(adapter)Promise.resolve(adapter.discard(target(id))).catch(()=>{});};
  const controller=()=>{const item=new AbortController();requests.add(item);return item;};
  const rowFor=id=>list.querySelector(`[data-file-row="${CSS.escape(id)}"]`);
  const states={queued:'В очереди',uploading:'Загружается',preparing:'Проверка файла',processing:'Сохраняется в хранилище',saving:'Сохраняется',ready:'',failed:'Не загружен',loading:'Чтение',unavailable:'Хранилище не подключено'};
  const percent=row=>row.total?Math.floor(row.loaded/row.total*100):0;
  // Progress of the check and the transfer: a DS progress bar and one line of text, updated in place.
  function progressText(row){
    if(row.state==='preparing')return `Проверка файла ${percent(row)}%`;
    if(row.state==='uploading')return `Загрузка ${percent(row)}% · ${size(row.loaded||0)} из ${size(row.total||row.size||0)}`;
    return null;
  }
  function showProgress(row){
    const element=rowFor(row.id);if(!element)return;
    const bar=element.querySelector('[data-file-progress]'),text=progressText(row),active=['preparing','uploading','processing'].includes(row.state);
    bar.hidden=!active;bar.setAttribute('aria-valuenow',String(row.state==='processing'?100:percent(row)));
    bar.style.setProperty('--progress',`${row.state==='processing'?100:percent(row)}%`);
    if(text)element.querySelector('[data-file-status]').textContent=text;
  }
  const tile=(row,kind)=>{const button=document.createElement('button');button.type='button';button.className='task-file-tile';button.dataset.kind=kind;
    if(kind==='video'){button.dataset.filePlay=row.id;button.setAttribute('aria-label',`Смотреть ${row.name}`);}
    else{button.dataset.fileDownload=row.id;button.setAttribute('aria-label',`Скачать ${row.name}`);}
    button.innerHTML=`${icon(kind==='video'?'play':'file',20)}<span>${esc(kind==='video'?'ВИДЕО':extensionOf(row.name))}</span>`;return button;};
  function placeTile(element,row,kind){element.querySelector('[data-file-preview]')?.replaceWith(tile(row,kind));}
  function controls(row){
    if(row.state==='ready')return `${editable&&row.meta.image?`<button type="button" class="iq-btn ghost icon sm" data-file-cover="${esc(row.id)}" aria-label="Сделать обложкой: ${esc(row.name)}" aria-pressed="${coverId===row.id}">${icon('image',16)}</button>`:''}<button type="button" class="iq-btn ghost icon sm" data-file-download="${esc(row.id)}" aria-label="Скачать ${esc(row.name)}">${icon('download',16)}</button>`;
    return row.state==='failed'?`<button type="button" class="iq-btn ghost sm" data-file-retry="${esc(row.id)}">Повторить</button>`:'';
  }
  function drawRow(row){
    if(closed)return;let element=rowFor(row.id);
    if(!element){element=document.createElement('div');element.className='iq-file-item task-file-row';element.dataset.fileRow=row.id;
      element.innerHTML=`<iq-file-preview data-file-preview></iq-file-preview><div class="file-item-copy"><b></b><small data-file-status></small><div class="iq-progress task-file-progress" role="progressbar" aria-label="Ход загрузки" aria-valuemin="0" aria-valuemax="100" data-file-progress hidden><span></span></div><p class="iq-helper error" data-row-error hidden></p></div><span class="task-file-actions"></span>`;list.append(element);}
    element.dataset.state=row.state;element.querySelector('b').textContent=row.name;
    element.querySelector('[data-file-status]').innerHTML=[size(row.size||0),states[row.state],row.id===coverId?'Обложка':''].filter(Boolean).map(text=>`<span>${esc(text)}</span>`).join('');
    const message=element.querySelector('[data-row-error]');message.hidden=!row.error;message.textContent=row.error||'';
    element.querySelector('.task-file-actions').innerHTML=controls(row)+(editable?`<button type="button" class="iq-btn ghost icon sm" data-file-remove="${esc(row.id)}" aria-label="${row.state==='ready'||row.state==='failed'?'Убрать файл':'Отменить загрузку'}: ${esc(row.name)}">${icon('x',16)}</button>`:'');
    showProgress(row);
    root.querySelector('[data-files-empty]').hidden=rows.size>0;const count=root.querySelector('[data-file-count]');if(count)count.textContent=rows.size?String(rows.size):'';
    if(row.file&&!row.previewStarted){row.previewStarted=true;
      if(cheapPreview(row.file.name,row.file.type,row.file.size))element.querySelector('iq-file-preview').file=row.file;else placeTile(element,row,'file');}
    if(row.meta&&!row.previewStarted&&!row.meta.image&&isVideo(row.meta.mime)&&adapter.url){row.previewStarted=true;placeTile(element,row,'video');}
    if(row.meta&&!row.previewStarted&&!row.meta.image&&!cheapPreview(row.name,row.meta.mime,row.meta.size)){row.previewStarted=true;placeTile(element,row,'file');}
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
    // Without a cover nothing takes space in the drawer; the header's "Обложка" button (addCover) adds one.
    if(!coverId){coverRoot.replaceChildren();coverRoot.hidden=true;onCoverState(false);return;}
    coverRoot.hidden=false;onCoverState(true);
    const row=rows.get(coverId);
    coverRoot.innerHTML=`<div class="task-detail-cover" data-state="loading"><button type="button" data-preview-cover aria-label="Открыть обложку" disabled>${coverLetterboxed(coverCrop)&&coverCrop.attachmentId===coverId?'<img class="task-cover-backdrop" alt="" aria-hidden="true" hidden>':''}<img class="task-cover-image" alt="" decoding="async" style="${coverImageStyle(coverCrop,coverId)}" hidden></button><span data-cover-status>Загрузка обложки…</span></div>
      ${editable?`<iq-menu class="task-cover-menu"><button type="button" class="iq-btn secondary sm">${icon('image',16)}<span>Обложка</span>${icon('down',14)}</button><div data-menu><button type="button" data-recrop-cover>${icon('expand',17)}<span>Изменить кадр</span></button><button type="button" data-add-cover>${icon('image',17)}<span>Заменить</span></button><button type="button" class="danger" data-remove-cover>${icon('trash',17)}<span>Убрать обложку</span></button></div></iq-menu>`:''}`;
    if(!adapter){
      coverRoot.querySelector('.task-detail-cover').dataset.state='unavailable';
      coverRoot.querySelector('[data-cover-status]').textContent='Хранилище файлов не подключено.';
      return;
    }
    const request=controller();let requestURL=null;
    adapter.blob({...target(coverId),variant:'display'},{signal:request.signal}).then(async blob=>{
      if(closed||generation!==coverGeneration)return;
      requireValue(blob.type==='image/webp','FILE_PREVIEW','Изображение недоступно.');
      requestURL=URL.createObjectURL(blob);const image=coverRoot.querySelector('[data-preview-cover] .task-cover-image');
      image.src=requestURL;await image.decode();
      if(closed||generation!==coverGeneration||!image.isConnected)return;
      coverURL=requestURL;requestURL=null;image.hidden=false;
      // The letterbox around the true 12:5 frame is filled with a soft blurred copy, so the band never looks empty.
      const backdrop=coverRoot.querySelector('.task-cover-backdrop');if(backdrop){backdrop.src=coverURL;backdrop.hidden=false;}
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
        if(closed||!rows.has(row.id))return;const phaseChanged=row.state!==progress.phase;
        Object.assign(row,{state:progress.phase,loaded:progress.loaded||0,total:progress.total||row.size});
        if(phaseChanged)drawRow(row);else showProgress(row);
      }});
      if(closed||!rows.has(row.id)){discard(row.id);return;}
      staged.add(row.id);row.meta=meta;row.name=meta.name;row.size=meta.size;row.state='ready';row.file=null;
      if(!ids.includes(row.id))ids.push(row.id);drawRow(row);
      if(row.asCover&&meta.image&&row.coverIntent===coverIntent)setCover(row.id,{user:false,crop:row.crop});emit();
    }catch(e){if(!closed&&rows.has(row.id)){row.state='failed';row.error=e.name==='AbortError'?'Загрузка отменена.':e.message;drawRow(row);}}
    finally{active--;requests.delete(request);row.controller=null;pump();}
  }
  function pump(){for(const row of rows.values()){if(active>=2||closed)break;if(row.state==='queued')void upload(row);}}
  async function add(files,asCover=false,crop=null){
    if(!editable||closed||locked)return;error.hidden=true;
    if(files.length>50){report(Error('За один раз выберите не более 50 файлов.'));return;}
    // Size and format are checked before anything is sent, so a wrong file fails at once, not after a long upload.
    const refused=[],selected=[];
    for(const file of Array.from(files).slice(0,asCover?1:50)){try{await adapter.precheck?.(file);selected.push(file);}catch(e){refused.push(e.message);}}
    if(closed||locked)return;
    if(refused.length)report(Error(refused.join(' ')));if(!selected.length)return;
    const intent=asCover?++coverIntent:null;
    for(const file of selected){
      const row={id:uid('file'),file,name:file.name,size:file.size,state:'queued',asCover,coverIntent:intent,crop};rows.set(row.id,row);drawRow(row);
    }emit();pump();
  }
  function remove(id){
    const row=rows.get(id);if(!row)return;row.controller?.abort();rows.delete(id);rowFor(id)?.remove();ids=ids.filter(value=>value!==id);
    if(staged.has(id)||row.file){discard(id);staged.delete(id);}if(coverId===id)setCover(null);else if(row.asCover&&row.coverIntent===coverIntent)coverIntent++;
    root.querySelector('[data-files-empty]').hidden=rows.size>0;const count=root.querySelector('[data-file-count]');if(count)count.textContent=rows.size?String(rows.size):'';emit();
  }
  function cropNew(file){if(!file||closed||locked)return;cropDialog=editCoverImage(file,{onApply:(source,crop)=>{if(closed||locked)throw Error('Задача уже закрыта.');const name=source.name||'Обложка.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[source.type]||'png');add([new File([source],name,{type:source.type})],true,crop);}});}
  async function cropExisting(id){
    const request=controller(),intent=coverIntent;
    try{const blob=await adapter.blob({...target(id),variant:'original'},{signal:request.signal});if(closed||locked||intent!==coverIntent)return;const row=rows.get(id),file=new File([blob],row.name,{type:row.meta.mime});cropDialog=editCoverImage(file,{crop:coverId===id?coverCrop:null,onApply:(source,crop)=>{if(closed||locked||!rows.has(id))throw Error('Файл больше недоступен.');if(source===file)setCover(id,{crop});else add([new File([source],source.name||'Обложка.png',{type:source.type})],true,crop);}});}
    catch(error){if(error.name!=='AbortError')report(error);}finally{requests.delete(request);}
  }
  function playVideo(id){
    const row=rows.get(id);if(!row?.meta||!adapter?.url)return;
    // DS gap: iq-file-preview plays only a local File; a stored video streams by byte ranges into a native player.
    dialog({title:row.name,description:size(row.meta.size),body:'<div class="task-video"><video controls playsinline preload="metadata"></video></div>',wide:true,mount:element=>{
      const video=element.querySelector('video');video.src=adapter.url(target(id));
      video.addEventListener('error',()=>{const box=element.querySelector('.task-video');if(box)box.innerHTML='<p class="iq-helper">Браузер не может воспроизвести этот формат. Скачайте файл, чтобы открыть его в плеере.</p>';},{once:true});
      element.addEventListener('iq-close',()=>{video.pause();video.removeAttribute('src');video.load();},{once:true});
    }});
  }
  async function downloadFile(id){
    const row=rows.get(id);if(!row?.meta||!adapter)return;
    // A stored file streams straight to the browser's downloads; nothing is held in page memory.
    if(adapter.url){const link=document.createElement('a');link.href=adapter.url(target(id));link.download=row.name;link.rel='noopener';link.click();return;}
    const request=controller();
    try{const blob=await adapter.blob({...target(id),variant:'original'},{signal:request.signal});
      if(closed)return;const url=URL.createObjectURL(blob);downloads.add(url);
      const link=document.createElement('a');link.href=url;link.download=row.name;link.click();
      setTimeout(()=>{URL.revokeObjectURL(url);downloads.delete(url);},30000);
    }catch(e){if(e.name!=='AbortError')report(e);}finally{requests.delete(request);}
  }
  root.addEventListener('click',event=>{
    if(locked)return;
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.fileRemove&&editable)remove(button.dataset.fileRemove);
    if(button.dataset.fileCover&&editable)void cropExisting(button.dataset.fileCover);
    if(button.dataset.fileDownload)void downloadFile(button.dataset.fileDownload);
    if(button.dataset.filePlay)playVideo(button.dataset.filePlay);
    if(button.dataset.fileRetry){const row=rows.get(button.dataset.fileRetry);if(row?.file){row.state='queued';pump();}else if(row)void loadExisting(row.id);}
  },{signal});
  async function openPresetPicker(){
    if(presetLoading)return;presetLoading=true;
    try{
      const {openCoverPresets}=await import('./cover-presets.js');
      if(closed||locked)return;
      presetPicker?.destroy();presetPicker=openCoverPresets(file=>{if(closed||locked)return;if(file)cropNew(file);else root.querySelector('[data-cover-picker]').open();});
    }catch(error){report(error);}finally{presetLoading=false;}
  }
  coverRoot.addEventListener('click',event=>{
    if(locked)return;
    if(event.target.closest('[data-add-cover]')&&editable)void openPresetPicker();
    if(event.target.closest('[data-remove-cover]')&&editable)setCover(null);
    if(event.target.closest('[data-recrop-cover]')&&editable&&coverId)void cropExisting(coverId);
    if(event.target.closest('[data-preview-cover]')&&coverURL){
      const url=coverURL;dialog({title:rows.get(coverId)?.name||'Обложка',body:'<div class="task-cover-lightbox"><img alt="Обложка задачи целиком" data-cover-full></div>',wide:true,mount:element=>{element.querySelector('[data-cover-full]').src=url;}});
    }
  },{signal});
  // DS iq-file-picker owns picking and drag & drop; this view owns validation, upload and the file list.
  root.querySelector('[data-file-picker]')?.addEventListener('iq-files',event=>add(event.detail.files),{signal});
  root.querySelector('[data-cover-picker]')?.addEventListener('iq-files',event=>cropNew(event.detail.files[0]),{signal});
  for(const id of ids){rows.set(id,{id,name:'Файл',size:0,state:'loading'});drawRow(rows.get(id));void loadExisting(id);}
  renderCover();
  return {
    addCover(){if(editable&&!locked&&!closed)void openPresetPicker();},
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
