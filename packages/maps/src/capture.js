import {validateDocument} from './document.js';
import {clone,uid,requireValue,validText} from './common.js';

/** Card types are document types, not task-board statuses or runtime node types. */
export const CARD_TYPES = [
  ['sticky','Заметка'],['text','Текст'],['task','Задача'],
  ['shape','Фигура'],['frame','Область'],['image','Изображение']
];
export const SHAPES = [
  ['rectangle','Прямоугольник'],['diamond','Решение'],['pill','Начало или конец'],
  ['ellipse','Овал'],['parallelogram','Вход или выход'],['database','Данные'],
  ['document','Документ'],['predefined','Подпроцесс'],['manual','Ручное действие'],
  ['trapezoid','Подготовка'],['hexagon','Условие'],['delay','Ожидание'],
  ['connector','Соединитель'],['offpage','Переход']
];
export function cardEntry(type='sticky') {
  requireValue(CARD_TYPES.some(([id])=>id===type),'CARD_TYPE','Выберите тип объекта.');
  return {id:uid('entry'),type,text:'',color:'sand',shape:'rectangle',owner:'',src:''};
}
export function hasContent(entry) { return !!entry.text?.trim() || (entry.type==='image' && !!entry.src); }
/** Pure batch construction. Revisions and locked parents are checked again on submit. */
export function appendCards(document,entries,{areaId='',origin={x:80,y:80}}={}) {
  const next=validateDocument(document);
  requireValue(Array.isArray(entries)&&entries.length<=100,'BATCH_LIMIT','За один раз можно добавить до 100 объектов.');
  const cards=entries.filter(hasContent);
  requireValue(cards.length>0,'EMPTY_BATCH','Заполните хотя бы одну карточку.');
  const byId=new Map(next.objects.map(o=>[o.id,o]));
  const parent=areaId?byId.get(areaId):null;
  if(areaId){
    requireValue(parent?.type==='frame','MISSING_AREA','Область уже удалена. Выберите другое место.');
    let p=parent;const seen=new Set();
    while(p){requireValue(!p.locked&&!seen.has(p.id),'LOCKED_AREA','Область зафиксирована. Выберите другое место.');seen.add(p.id);p=byId.get(p.parentId);}
  }
  let y=parent?Math.max(parent.y+70,...next.objects.filter(o=>o.parentId===areaId).map(o=>o.y+o.height+24)):origin.y;
  let rowHeight=0;const ids=[];
  for(const [i,entry] of cards.entries()){
    requireValue(CARD_TYPES.some(([type])=>type===entry.type),'CARD_TYPE','Неизвестный тип карточки.');
    requireValue(validText(entry.text),'TEXT_LIMIT','Один объект — до 10 000 символов.');
    requireValue(['sand','lavender','mint','sky','rose','neutral'].includes(entry.color),'CARD_COLOR','Неизвестный цвет карточки.');
    if(entry.type==='shape')requireValue(SHAPES.some(([id])=>id===entry.shape),'CARD_SHAPE','Выберите фигуру.');
    if(entry.type==='image')requireValue(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(entry.src||'')&&entry.src.length<=7500000,'IMAGE','Выберите PNG, JPEG или WebP до 5 МБ.');
    const width=parent?Math.max(160,parent.width-48):entry.type==='frame'?304:252;
    const height=entry.type==='frame'?260:entry.type==='image'?188:entry.type==='text'?96:entry.type==='shape'?148:164;
    if(!parent&&i>0&&i%3===0){y+=rowHeight+28;rowHeight=0;}
    const x=parent?parent.x+24:origin.x+(i%3)*340;
    const object={id:uid('object'),type:entry.type,text:entry.text.trim(),x,y,width,height,color:entry.type==='sticky'?entry.color:'neutral',autoHeight:!['image','frame'].includes(entry.type)};
    if(parent)object.parentId=areaId;
    if(entry.type==='shape')object.shape=entry.shape;
    if(entry.type==='task'){object.owner=String(entry.owner||'').slice(0,120);object.done=false;}
    if(entry.type==='image')object.src=entry.src;
    if(entry.type==='frame'){object.headerHeight=56;object.layout='column';}
    next.objects.push(object);ids.push(object.id);rowHeight=Math.max(rowHeight,height);
    if(parent)y+=height+24;
  }
  if(parent)parent.height=Math.max(parent.height,y-parent.y+24);
  return {document:validateDocument(next),ids};
}

export function layoutCaptured(document,ids,{areaId='',origin={x:80,y:80}}={}) {
  const next=validateDocument(document),selected=new Set(ids);
  const objects=ids.map(id=>next.objects.find(o=>o.id===id));
  requireValue(objects.every(Boolean),'BATCH_ID','Объект предложения не найден.');
  const parent=areaId?next.objects.find(o=>o.id===areaId):null;
  let y=parent?Math.max(parent.y+70,...next.objects.filter(o=>o.parentId===areaId&&!selected.has(o.id)).map(o=>o.y+o.height+24)):origin.y;
  for(let i=0;i<objects.length;){
    const row=objects.slice(i,i+(parent?1:3));
    row.forEach((o,j)=>{o.x=parent?parent.x+24:origin.x+j*340;o.y=y;});
    y+=Math.max(...row.map(o=>o.height))+28;i+=row.length;
  }
  if(!parent&&objects.length){
    // Keep existing work intact: move the whole measured batch to a free band.
    const obstacles=next.objects.filter(o=>!selected.has(o.id));
    const left=Math.min(...objects.map(o=>o.x)),right=Math.max(...objects.map(o=>o.x+o.width));
    for(let pass=0;pass<=obstacles.length;pass++){
      const top=Math.min(...objects.map(o=>o.y)),bottom=Math.max(...objects.map(o=>o.y+o.height));
      const hits=obstacles.filter(o=>left<o.x+o.width+24&&right+24>o.x&&top<o.y+o.height+24&&bottom+24>o.y);
      if(!hits.length)break;
      const shift=Math.max(...hits.map(o=>o.y+o.height))+48-top;
      objects.forEach(o=>o.y+=shift);
    }
  }
  if(parent){parent.height=Math.max(parent.height,y-parent.y+24);let child=parent;const seen=new Set();
    while(child.parentId&&!seen.has(child.id)){seen.add(child.id);const ancestor=next.objects.find(o=>o.id===child.parentId);if(!ancestor)break;ancestor.height=Math.max(ancestor.height,child.y+child.height-ancestor.y+24);child=ancestor;}
  }
  return validateDocument(next);
}
