import {cardEntry,CARD_TYPES,SHAPES,hasContent,appendCards,layoutCaptured} from './capture.js';
import {button,select,input,esc,icon} from './ui.js';
import {requireValue,clone} from './common.js';

async function readImage(file) {
  requireValue(file&&['image/png','image/jpeg','image/webp'].includes(file.type)&&file.size>0&&file.size<=5*1024*1024,'IMAGE','Выберите PNG, JPEG или WebP до 5 МБ.');
  const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Не удалось прочитать изображение.'));r.readAsDataURL(file);});
  // Decode before commit. No URL fetching, SVG or arbitrary HTML is accepted.
  await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(new Error('Этот файл не удалось открыть как изображение.'));img.src=src;});
  return src;
}
export async function captureDialog(feature) {
  requireValue(feature.permissions.edit&&feature.current?.status!=='archived','READ_ONLY','Карта доступна только для просмотра.');
  if(!(await feature.readyToLeave()))return;
  requireValue(feature.view==='canvas','VIEW','Объекты добавляются в карту. Для сценария используйте «Добавить шаг».');
  const mapId=feature.current.id,board=feature.board;
  const cardTypes=CARD_TYPES.filter(([type])=>feature.uiCapabilities.allowedCreateTypes.includes(type));
  requireValue(cardTypes.length>0,'FEATURES','Приложение не разрешило создание объектов.');
  const defaultType=cardTypes.some(([type])=>type==='sticky')?'sticky':cardTypes[0][0];
  const draft=feature.captureDrafts?.get(mapId)||{type:defaultType,area:'',entries:[cardEntry(defaultType),cardEntry(defaultType)]};
  if(!cardTypes.some(([type])=>type===draft.type))draft.type=defaultType;
  draft.entries=draft.entries.map(entry=>cardTypes.some(([type])=>type===entry.type)?entry:{...cardEntry(defaultType),id:entry.id,text:entry.text});
  feature.captureDrafts ||= new Map();feature.captureDrafts.set(mapId,draft);
  const areas=feature.current.document.objects.filter(o=>o.type==='frame'&&!o.locked);
  const el=feature.dialog({title:'Несколько объектов',description:'У каждой карточки свой тип. Можно добавить сразу заметки, задачи, текст, фигуры, области и изображения.',wide:true,
    body:`<div class="map-capture-settings">${select('defaultType','Тип новых карточек',draft.type,cardTypes)}${select('area','Разместить',draft.area,[['','На свободном месте'],...areas.map(a=>[a.id,a.text||'Без названия'])])}</div><div class="map-capture-rows"></div><div class="map-capture-bottom"><button type="button" class="iq-btn secondary sm" data-add-card>${icon('plus',17)}<span>Ещё карточка</span></button><span class="map-explanation">Enter — следующая карточка · Shift + Enter — новая строка</span></div><details class="iq-accordion"><summary>Добавить из готового текста ${icon('plus',16)}</summary><div class="map-capture-import"><label class="iq-field"><span class="iq-control-label">Список или несколько абзацев</span><span class="iq-input-shell"><textarea name="splitText" rows="3" maxlength="50000"></textarea></span></label>${select('splitBy','Создавать карточку','line',[['line','На каждую строку'],['paragraph','На каждый абзац']])}<button type="button" class="iq-btn secondary sm" data-split>Разобрать текст</button><p class="map-explanation">Используется выбранный тип новых карточек. Для изображения нужен файл в каждой карточке.</p></div></details><p class="map-capture-summary map-explanation" role="status"></p>`,
    submitLabel:'Добавить объекты',onSubmit:async()=>{
      requireValue(feature.current.id===mapId&&feature.board===board,'CONFLICT','Выбрана другая карта. Черновик остался в исходной карте.');
      if(!(await feature.readyToLeave()))throw Error('Сначала сохраните изменения карты.');
      requireValue(!pendingFiles,'IMAGE_LOADING','Дождитесь чтения изображений.');
      const view=board.viewport,rect=board.getBoundingClientRect();
      const placement={areaId:draft.area,origin:{x:(rect.width/2-view.x)/view.zoom-400,y:(rect.height/2-view.y)/view.zoom-150}};
      const result=appendCards(feature.current.document,draft.entries,placement);
      const document=layoutCaptured(board.prepareDocument(result.document,result.ids),result.ids,placement);
      requireValue(board.applyDocument(document,feature.current.revision,'capture-objects'),'SAVE_FAILED','Объекты не применены. Черновик сохранён.');
      if(feature.savingPromise)await feature.savingPromise;
      requireValue(!board.dirty,'SAVE_FAILED','Сохранение не подтверждено. Карточки оставлены для восстановления.');
      feature.captureDrafts.delete(mapId);board.select(result.ids);board.fit(result.ids);
    }});
  let pendingFiles=0;
  const rows=el.querySelector('.map-capture-rows'),summary=el.querySelector('.map-capture-summary');
  const update=()=>{const count=draft.entries.filter(hasContent).length;summary.textContent=`Заполнено карточек: ${count} из ${draft.entries.length}. Добавление — один шаг истории.`;el.querySelector('[type=submit]').disabled=!count||pendingFiles>0;el.querySelector('[data-add-card]').disabled=draft.entries.length>=100;};
  const rowHTML=(entry,index)=>`<article class="map-capture-card" data-entry="${entry.id}"><header><span class="map-capture-index">${String(index+1).padStart(2,'0')}</span>${select('type-'+entry.id,'Тип карточки '+(index+1),entry.type,cardTypes)}<button type="button" class="iq-btn ghost icon sm" data-up="${entry.id}" aria-label="Выше: карточка ${index+1}" ${index===0?'disabled':''}>${icon('arrowUp',16)}</button><button type="button" class="iq-btn ghost icon sm" data-remove="${entry.id}" aria-label="Удалить карточку ${index+1}">${icon('x',16)}</button></header><label class="iq-field"><span class="iq-control-label">${entry.type==='image'?'Подпись изображения':entry.type==='frame'?'Название области':entry.type==='task'?'Что нужно сделать':'Содержание'}</span><span class="iq-input-shell"><textarea data-text rows="3" maxlength="10000" aria-label="Текст карточки ${index+1}" placeholder="${entry.type==='task'?'Опишите конкретное действие…':'Введите текст…'}">${esc(entry.text)}</textarea></span></label>${entry.type==='shape'?select('shape-'+entry.id,'Форма',entry.shape,SHAPES):''}${entry.type==='task'?input('owner-'+entry.id,'Ответственный',entry.owner,{maxlength:120,placeholder:'Можно назначить позже'}):''}${entry.type==='image'?`<label class="iq-field"><span class="iq-control-label">PNG, JPEG или WebP до 5 МБ</span><input type="file" data-image accept="image/png,image/jpeg,image/webp"></label>${entry.src?`<img class="map-capture-image" src="${entry.src}" alt="Предпросмотр выбранного изображения">`:''}`:''}<p class="map-form-error" data-image-error role="alert" hidden></p></article>`;
  const wire=row=>{
    const entry=draft.entries.find(e=>e.id===row.dataset.entry);
    row.querySelector('iq-select[name^=type-]').addEventListener('iq-change',event=>{entry.type=event.currentTarget.value;const next=document.createElement('div');next.innerHTML=rowHTML(entry,draft.entries.indexOf(entry));const fresh=next.firstElementChild;row.replaceWith(fresh);wire(fresh);fresh.querySelector('textarea')?.focus({preventScroll:true});update();});
    row.querySelector('iq-select[name^=shape-]')?.addEventListener('iq-change',event=>{entry.shape=event.currentTarget.value;});
    row.querySelector('[data-text]').addEventListener('input',e=>{entry.text=e.target.value;update();});
    row.querySelector('[name^=owner-]')?.addEventListener('input',e=>{entry.owner=e.target.value;});
    row.querySelector('[data-image]')?.addEventListener('change',async e=>{
      const file=e.target.files?.[0];if(!file)return;pendingFiles++;update();const error=row.querySelector('[data-image-error]');error.hidden=true;
      try{entry.src=await readImage(file);if(row.isConnected){let img=row.querySelector('img');if(!img){img=document.createElement('img');img.className='map-capture-image';img.alt='Предпросмотр выбранного изображения';row.insertBefore(img,error);}img.src=entry.src;}}
      catch(ex){error.textContent=ex.message;error.hidden=false;}finally{pendingFiles--;update();}
    });
  };
  const render=()=>{rows.innerHTML=draft.entries.map(rowHTML).join('');rows.querySelectorAll('[data-entry]').forEach(wire);update();};
  const add=()=>{if(draft.entries.length>=100)return;draft.entries.push(cardEntry(draft.type));render();rows.querySelector('[data-entry]:last-child textarea').focus();};
  el.querySelector('iq-select[name=defaultType]').addEventListener('iq-change',e=>{draft.type=e.currentTarget.value;});
  el.querySelector('iq-select[name=area]').addEventListener('iq-change',e=>{draft.area=e.currentTarget.value;});
  el.querySelector('[data-add-card]').onclick=add;
  rows.addEventListener('click',e=>{
    const b=e.target.closest('[data-remove],[data-up]');if(!b)return;const index=draft.entries.findIndex(x=>x.id===(b.dataset.remove||b.dataset.up));
    if(b.dataset.remove){draft.entries.splice(index,1);if(!draft.entries.length)draft.entries.push(cardEntry(draft.type));}
    else if(index>0)[draft.entries[index-1],draft.entries[index]]=[draft.entries[index],draft.entries[index-1]];
    render();rows.querySelectorAll('[data-text]')[Math.max(0,Math.min(index-(b.dataset.up?1:0),draft.entries.length-1))]?.focus();
  });
  rows.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.metaKey||e.isComposing||!e.target.matches('[data-text]'))return;e.preventDefault();const fields=[...rows.querySelectorAll('[data-text]')],index=fields.indexOf(e.target);if(index===fields.length-1)add();else fields[index+1].focus();});
  el.querySelector('[data-split]').onclick=()=>{
    const by=el.querySelector('iq-select[name=splitBy]').value,parts=el.querySelector('[name=splitText]').value.split(by==='paragraph'?/\n\s*\n/:/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const entries=[...draft.entries.filter(hasContent),...parts.map(text=>({...cardEntry(draft.type),text}))];
    if(entries.length>100||parts.some(v=>v.length>10000)){summary.textContent='Не больше 100 карточек и 10 000 символов на карточку.';return;}
    draft.entries=entries.length?entries:[cardEntry(draft.type)];render();el.querySelector('details').open=false;
  };
  render();return el;
}
