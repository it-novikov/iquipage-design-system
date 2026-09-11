import {input,select,check,icon,esc,dialog} from './ui.js';
import {motionReduced} from '../dist/vendor/core.js';
const names={sticky:'Заметка',text:'Текст',shape:'Фигура',frame:'Область',task:'Действие',image:'Изображение',drawing:'Рисунок'};
const colors=[['sand','Песочный'],['lavender','Лавандовый'],['mint','Мятный'],['sky','Голубой'],['rose','Розовый'],['neutral','Нейтральный']];
const shapes=['rectangle','diamond','pill','ellipse','parallelogram','database','document','predefined','manual','trapezoid','hexagon','delay','connector','offpage'];
const shapeNames=['Прямоугольник','Ромб','Скруглённый блок','Эллипс','Параллелограмм','База данных','Документ','Подпроцесс','Ручной ввод','Трапеция','Шестиугольник','Задержка','Соединитель','Вне страницы'];
const sides=[['auto','Автоматически'],['top','Сверху'],['right','Справа'],['bottom','Снизу'],['left','Слева']];
export async function leaveCanvasInspector(feature){return !feature.canvasInspector||await feature.canvasInspector.close();}
export async function showCanvasInspector(feature,ids,{focusText=false}={}){
  if(feature.view!=='canvas'||!feature.alive)return;
  const id=ids[0];if(feature.canvasInspector?.id===id){if(focusText)feature.inspector.querySelector('iq-markdown-editor')?.focusEditor();return;}
  const previous=feature.canvasInspector?.id;
  if(!(await leaveCanvasInspector(feature))){feature.board.select(previous?[previous]:[],false);return;}
  if(!id||ids.length!==1||!feature.alive)return;
  const board=feature.board,scene=board.data,object=scene.objects.find(o=>o.id===id),edge=scene.connections.find(e=>e.id===id),record=object||edge;if(!record)return;
  feature.sessionOpen=false;feature.renderSessionCard?.();
  const root=feature.inspector,abort=new AbortController();let baseline='',saving=false,closed=false;
  const parents=new Map(scene.objects.map(o=>[o.id,o]));let locked=!!object?.locked,p=object;while(p?.parentId){p=parents.get(p.parentId);if(p?.locked)locked=true;}
  const readOnly=board.readOnly||locked,linked=!!object?.externalTaskId;
  const pair=html=>`<div class="canvas-property-pair">${html}</div>`;
  const geometry=object?pair(input('x','X',object.x,{type:'number'})+input('y','Y',object.y,{type:'number'}))+pair(input('width','Ширина',object.width,{type:'number'})+input('height','Высота',object.height,{type:'number'})):'';
  const text=object&&!linked&&object.type!=='drawing'?'<iq-markdown-editor label="Текст объекта" variant="compact" name="objectText" maxlength="10000"></iq-markdown-editor>':'';
  const fields=object?`${text}${linked?`<button type="button" class="iq-btn secondary" data-open-linked-task>Открыть задачу ${icon('upRight',16)}</button>`:''}${geometry}${select('color','Цвет',object.color,colors)}${object.type==='shape'?select('shape','Форма',object.shape||'rectangle',shapes.map((id,i)=>[id,shapeNames[i]])):''}${object.type!=='drawing'?pair(select('align','По горизонтали',object.align||'left',[['left','Слева'],['center','По центру'],['right','Справа']])+select('valign','По вертикали',object.valign||'top',[['top','Сверху'],['middle','По центру'],['bottom','Снизу']]))+check('autoHeight','Высота по содержимому',object.autoHeight!==false):''}${object.type==='frame'?select('layout','Размещение',object.layout||'free',[['free','Свободно'],['column','Колонкой']]):''}${object.type==='task'&&!linked?input('owner','Ответственный',object.owner||'')+check('done','Выполнено',object.done):''}${object.type==='image'?input('src','Адрес изображения',object.src||'',{maxlength:2000000}):''}`:
  `${input('label','Подпись связи',edge.label||'')}${pair(select('from','Начало',edge.from,scene.objects.filter(o=>!['frame','drawing'].includes(o.type)).map(o=>[o.id,o.text.slice(0,60)||names[o.type]]))+select('to','Конец',edge.to,scene.objects.filter(o=>!['frame','drawing'].includes(o.type)).map(o=>[o.id,o.text.slice(0,60)||names[o.type]])))}${pair(select('fromPort','Откуда',edge.fromPort||'auto',sides)+select('toPort','Куда',edge.toPort||'auto',sides))}${select('style','Линия',edge.style||'curve',[['curve','Плавная'],['elbow','Ортогональная'],['straight','Прямая']])}${select('direction','Стрелки',edge.arrowStart?(edge.arrow?'both':'start'):(edge.arrow?'end':'none'),[['end','В конце'],['start','В начале'],['both','С обеих сторон'],['none','Без стрелок']])}${select('color','Цвет',edge.color||'neutral',[['neutral','Нейтральный'],['accent','Акцент'],['success','Зелёный'],['warning','Янтарный'],['error','Красный']])}${pair(input('labelPosition','Положение подписи, %',Math.round((edge.labelPosition??.5)*100),{type:'number'})+input('bend','Изгиб',edge.bend||0,{type:'number'}))}${check('dashed','Пунктир',edge.dashed)}`;
  root.hidden=false;root.dataset.canvasInspector='true';root.innerHTML=`<form class="canvas-property-form"><header class="map-panel-header"><h2>${object?names[object.type]:'Связь'}</h2><button type="button" class="iq-btn ghost icon sm" data-close-canvas aria-label="Закрыть свойства">${icon('x',18)}</button></header><div class="map-panel-body">${fields}<p role="alert" class="map-form-error" hidden></p>${readOnly?'<p class="iq-helper">Объект доступен только для просмотра.</p>':'<button type="submit" class="iq-btn primary">Сохранить изменения</button>'}</div></form>`;
  const form=root.querySelector('form'),editor=form.querySelector('iq-markdown-editor');if(editor)editor.value=object.text||'';
  const value=()=>{const data=new FormData(form),v=Object.fromEntries(data);for(const select of form.querySelectorAll('iq-select'))v[select.getAttribute('name')]=select.value;if(editor)v.text=editor.value;return v;};
  baseline=JSON.stringify(value());
  const dirty=()=>!readOnly&&JSON.stringify(value())!==baseline;
  const close=async()=>{if(saving)return false;if(dirty()){let discarded=false;const confirm=dialog({title:'Закрыть свойства без сохранения?',description:'Изменения объекта ещё не сохранены.',submitLabel:'Не сохранять',onSubmit:async()=>{discarded=true;}});await new Promise(resolve=>confirm.addEventListener('iq-close',resolve,{once:true}));if(!discarded)return false;}closed=true;abort.abort();if(!motionReduced()){await root.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(16px)'}],{duration:180,easing:'ease-out'}).finished.catch(()=>{});}root.hidden=true;root.replaceChildren();delete root.dataset.canvasInspector;if(feature.canvasInspector?.id===id)feature.canvasInspector=null;return true;};
  feature.canvasInspector={id,close,dirty};
  if(!motionReduced())root.animate([{opacity:0,transform:'translateX(16px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});
  root.querySelector('[data-close-canvas]').addEventListener('click',()=>void close(),{signal:abort.signal});
  form.querySelector('[data-open-linked-task]')?.addEventListener('click',()=>{feature.config.onOpenTasks?.({ids:[object.externalTaskId],focusTaskId:object.externalTaskId,projectId:feature.project.id});},{signal:abort.signal});
  if(readOnly)form.querySelectorAll('input,iq-select,iq-markdown-editor').forEach(el=>el.setAttribute('disabled',''));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(readOnly||saving||closed)return;const error=form.querySelector('[role=alert]');error.hidden=true;saving=true;
    try{const v=value(),next=structuredClone(scene),target=object?next.objects.find(o=>o.id===id):next.connections.find(e=>e.id===id);
      if(object){for(const key of ['x','y','width','height'])target[key]=Number(v[key]);target.color=v.color;if(!linked&&editor)target.text=v.text;if(object.type!=='drawing'){target.align=v.align;target.valign=v.valign;target.autoHeight=v.autoHeight==='on';target.minHeight=target.height;}if(object.type==='shape')target.shape=v.shape;if(object.type==='frame'){if(v.layout==='column')target.layout='column';else delete target.layout;}if(object.type==='task'&&!linked){target.owner=v.owner;target.done=v.done==='on';}if(object.type==='image')target.src=v.src;}
      else Object.assign(target,{label:v.label,from:v.from,to:v.to,fromPort:v.fromPort,toPort:v.toPort,style:v.style,color:v.color,arrow:['end','both'].includes(v.direction),arrowStart:['start','both'].includes(v.direction),dashed:v.dashed==='on',labelPosition:Number(v.labelPosition)/100,bend:Number(v.bend)});
      if(object?.type==='frame'){
        const family=new Set([id]);let changed=true;while(changed){changed=false;for(const child of next.objects)if(child.parentId&&family.has(child.parentId)&&!family.has(child.id)){family.add(child.id);changed=true;}}
        const dx=target.x-object.x,dy=target.y-object.y;
        for(const child of next.objects)if(child.id!==id&&family.has(child.id)){child.x+=dx;child.y+=dy;}
      }
      const prepared=object&&!linked?board.prepareDocument(next,[id]):next;
      if(!board.applyDocument(prepared,scene.revision,'host-edit'))throw Error('Изменение пока не принято.');
      if(feature.savingPromise)await feature.savingPromise;if(board.dirty)throw Error('Изменение не сохранено. Ваш ввод остаётся в свойствах.');baseline=JSON.stringify(value());saving=false;await close();
    }catch(cause){error.textContent=cause.message;error.hidden=false;}finally{saving=false;}
  },{signal:abort.signal});
  if(focusText)editor?.focusEditor();
}
