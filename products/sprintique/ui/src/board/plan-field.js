import {icon,esc} from '../ui.js';
import {transition} from '@iquipage/web/core';
import {validDay,addDays,today,shortDay,planLabel,parseDay,typedDay,normalizePlan,planHelp,planPreset,monthGrid} from './plan-range.js';

let sequence=0;
const EMPTY='Не запланирован';
const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const dayName=value=>new Date(value+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});

/**
 * The plan of a task (plannedStart–plannedEnd) as one row of the properties list: a ghost date trigger that opens a
 * range calendar. Product composition for DS-GAP-G (no iq-date-range-field in the DS yet): the closed state reuses the
 * DS date trigger (ghost in .iq-properties[data-label=wide]), the popup the DS date popup surface; the calendar, fields,
 * presets and footer are tdr- parts on DS tokens. The duration lives in the popup's help line, not in the row.
 * Nothing is saved until "Применить"; onApply saves and may throw, the popup then stays open with the reason.
 */
export function mountPlanField(root,{label='План',start=null,end=null,deadline=()=>null,readOnly=false,onApply=async()=>{}}){
  const id=`tdr-plan-${++sequence}`,abort=new AbortController(),on=(target,type,fn,options={})=>target.addEventListener(type,fn,{signal:abort.signal,...options});
  let saved=normalizePlan(start,end),draft={...saved},month='',focused='',opened=false,busy=false,error='',frame=0;
  // The root is a row of the DS properties list (.iq-property): the label, then the value.
  root.classList.add('iq-property');
  if(readOnly){
    // In the read-only list the row is a term and its description.
    const [term,detail]=root.closest('dl')?['dt','dd']:['span','span'];
    root.innerHTML=`<${term} class="iq-property-label">${esc(label)}</${term}><${detail} class="iq-property-value" data-empty="${!saved.start}">${esc(planLabel(saved.start,saved.end)||EMPTY)}</${detail}>`;
    return {value:()=>({...saved}),set(){},open(){},close(){},destroy(){abort.abort();}};
  }
  root.innerHTML=`<span class="iq-property-label" id="${id}-label">${esc(label)}</span>
    <button type="button" class="iq-date-trigger tdr-plan-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}-popup" aria-labelledby="${id}-label ${id}-value"><span id="${id}-value" data-date-caption></span>${icon('down',16)}</button>
    <div id="${id}-popup" class="iq-date-popup tdr-range" popover="manual" role="dialog" aria-modal="false" aria-labelledby="${id}-caption" aria-describedby="${id}-keys">
      <p class="tdr-range-caption" id="${id}-caption">${esc(label)}: начало и конец</p>
      <div class="tdr-range-fields">
        <label class="tdr-range-field"><span>Начало</span><span class="iq-input-shell"><input data-range-start inputmode="numeric" autocomplete="off" maxlength="10" placeholder="дд.мм.гггг"></span></label>
        <label class="tdr-range-field"><span>Конец</span><span class="iq-input-shell"><input data-range-end inputmode="numeric" autocomplete="off" maxlength="10" placeholder="дд.мм.гггг"></span></label>
      </div>
      <div class="tdr-cal-head"><button type="button" class="iq-btn ghost icon sm" data-month="-1" aria-label="Предыдущий месяц">${icon('left',16)}</button><b id="${id}-month" aria-live="polite"></b><button type="button" class="iq-btn ghost icon sm" data-month="1" aria-label="Следующий месяц">${icon('chevron',16)}</button></div>
      <div class="tdr-cal" role="grid" aria-labelledby="${id}-month"></div>
      <div class="tdr-range-presets" role="group" aria-label="Быстрый выбор"></div>
      <p class="tdr-range-help" role="status"></p>
      <div class="tdr-range-foot"><button type="button" class="iq-btn ghost sm" data-range-clear>Очистить</button><button type="button" class="iq-btn secondary sm" data-range-cancel>Отмена</button><button type="button" class="iq-btn primary sm" data-range-apply>Применить</button></div>
      <p class="sr-only" id="${id}-keys">Первый выбор — начало, второй — конец. Стрелки — день, Page Up и Page Down — месяц. Escape — закрыть без изменений.</p>
    </div>`;
  const trigger=root.querySelector('.tdr-plan-trigger'),popup=root.querySelector('.tdr-range'),grid=popup.querySelector('.tdr-cal');
  const startInput=popup.querySelector('[data-range-start]'),endInput=popup.querySelector('[data-range-end]');
  function sync(){
    const text=planLabel(saved.start,saved.end);
    root.querySelector('[data-date-caption]').textContent=text||EMPTY;
    root.dataset.empty=String(!text);trigger.classList.toggle('is-empty',!text);
  }
  function paint(){
    const due=deadline(),[y,m]=month.split('-').map(Number),now=today();
    popup.querySelector(`#${id}-month`).textContent=`${MONTHS[m-1]} ${y}`;
    const a=draft.start,b=draft.end||draft.start;
    grid.innerHTML=`<div role="row" class="tdr-cal-week">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<span role="columnheader">${d}</span>`).join('')}</div>`+monthGrid(y,m-1).map(week=>`<div role="row">${week.map(({value,inMonth})=>{
      const edge=value===a?'start':value===b?'end':'',inside=a&&value>=a&&value<=b;
      const notes=[value===a&&value===b?'план на один день':value===a?'начало плана':value===b?'конец плана':'',value===due?'срок задачи':'',value===now?'сегодня':''].filter(Boolean);
      return `<span role="gridcell" aria-selected="${Boolean(inside)}"><button type="button" class="tdr-cal-day" data-day="${value}" tabindex="${value===focused?0:-1}" ${inMonth?'':'data-outside'} ${inside?'data-in':''} ${edge?`data-edge="${edge}"`:''} ${a&&a===b&&value===a?'data-single':''} ${value===due?'data-due':''} ${value===now?'data-today':''} aria-label="${esc(dayName(value)+(notes.length?', '+notes.join(', '):''))}">${Number(value.slice(8))}</button></span>`;}).join('')}</div>`).join('');
    const help=error?{tone:'danger',text:error}:planHelp({start:draft.start,end:draft.end,deadline:due});
    const line=popup.querySelector('.tdr-range-help');
    // A live region is rewritten only when its words change, not on every arrow key.
    if(line.dataset.tone!==help.tone||line.textContent!==help.text){line.dataset.tone=help.tone;line.innerHTML=`${help.tone==='muted'?'':icon('warning',14)}<span>${esc(help.text)}</span>`;}
    popup.setAttribute('aria-busy',String(busy));
    // While saving the buttons stay focusable (aria-disabled), so focus never falls out of the popup.
    popup.querySelectorAll('.tdr-range-foot button,[data-preset]').forEach(button=>{if(busy)button.setAttribute('aria-disabled','true');else button.removeAttribute('aria-disabled');});
    popup.querySelector('[data-range-apply]').textContent=busy?'Сохраняем…':'Применить';
  }
  /** Presets are drawn once per opening (the deadline cannot change while the popup is open), so a pressed preset keeps focus. */
  function presets(){
    const due=deadline(),list=[['week','Неделя'],['two-weeks','2 недели'],...(validDay(due)?[['deadline',`До срока ${shortDay(due)}`]]:[])];
    popup.querySelector('.tdr-range-presets').innerHTML=list.map(([kind,text])=>`<button type="button" class="iq-btn ghost sm" data-preset="${kind}">${esc(text)}</button>`).join('');
  }
  function fields(){startInput.value=typedDay(draft.start);endInput.value=typedDay(draft.end);startInput.removeAttribute('aria-invalid');endInput.removeAttribute('aria-invalid');}
  function show(value){month=value.slice(0,7);focused=value;paint();}
  function focusDay(){grid.querySelector(`[data-day="${focused}"]`)?.focus({preventScroll:true});}
  function position(){
    const rect=trigger.getBoundingClientRect(),viewport=window.visualViewport;
    const vx=viewport?.offsetLeft||0,vy=viewport?.offsetTop||0,vw=viewport?.width||innerWidth,vh=viewport?.height||innerHeight;
    const margin=12,gap=8,width=Math.min(352,vw-margin*2);
    popup.style.width=width+'px';popup.style.maxHeight='';
    const natural=popup.scrollHeight,below=Math.max(0,vy+vh-margin-rect.bottom-gap),above=Math.max(0,rect.top-vy-margin-gap);
    const side=below>=natural?'bottom':above>=natural?'top':below>=above?'bottom':'top',height=Math.min(natural,side==='bottom'?below:above);
    popup.style.maxHeight=height+'px';popup.dataset.placement=side;
    popup.style.top=(side==='bottom'?rect.bottom+gap:rect.top-gap-height)+'px';
    popup.style.left=Math.max(vx+margin,Math.min(rect.left,vx+vw-width-margin))+'px';
  }
  function open(){
    if(opened)return;
    opened=true;error='';draft={...saved};fields();presets();
    trigger.setAttribute('aria-expanded','true');
    try{popup.showPopover();}catch{popup.classList.add('is-open');}
    show(draft.start||today());
    position();focusDay();
    transition(popup,[{opacity:0,transform:`translateY(${popup.dataset.placement==='top'?-4:4}px)`},{opacity:1,transform:'translateY(0)'}],160);
  }
  function close(restore=true){
    if(!opened||busy)return;
    opened=false;error='';
    popup.getAnimations().forEach(animation=>animation.cancel());
    try{popup.hidePopover();}catch{}
    popup.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');
    if(restore&&trigger.isConnected)trigger.focus({preventScroll:true});
  }
  /** Reads the typed ends into the draft; false (with the reason shown) when one is not a date. */
  function readFields(){
    const a=parseDay(startInput.value),b=parseDay(endInput.value);
    startInput.toggleAttribute('aria-invalid',a===null);endInput.toggleAttribute('aria-invalid',b===null);
    if(a===null||b===null){error='Введите дату как дд.мм.гггг.';paint();return false;}
    error='';draft={start:a||null,end:b||null};return true;
  }
  async function apply(next=draft){
    if(busy)return;
    const plan=normalizePlan(next.start,next.end);
    if(plan.start===saved.start&&plan.end===saved.end){close();return;}
    busy=true;error='';paint();
    try{await onApply(plan);saved=plan;sync();busy=false;close();}
    catch(cause){busy=false;error=cause?.message||'План не сохранён.';paint();if(opened)popup.querySelector('[data-range-apply]').focus({preventScroll:true});}
  }
  function pick(value){
    // The first choice starts a new plan, the second ends it; choosing before the start swaps the ends.
    if(!draft.start||draft.end)draft={start:value,end:null};
    else draft=value<draft.start?{start:value,end:draft.start}:{start:draft.start,end:value};
    error='';fields();show(value);focusDay();
  }
  on(trigger,'click',()=>opened?close():open());
  on(trigger,'keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();open();}});
  on(popup,'click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled||busy)return;
    if(button.dataset.day)pick(button.dataset.day);
    else if(button.dataset.month){const [y,m]=month.split('-').map(Number),next=new Date(y,m-1+Number(button.dataset.month),1);show(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`);button.focus({preventScroll:true});}
    else if(button.dataset.preset){draft=planPreset(button.dataset.preset,{start:draft.start,deadline:deadline()});error='';fields();show(draft.end||draft.start||today());}
    else if(button.hasAttribute('data-range-clear'))void apply({start:null,end:null});
    else if(button.hasAttribute('data-range-cancel'))close();
    else if(button.hasAttribute('data-range-apply')&&readFields())void apply();
  });
  // Typing keeps the calendar in step; the drawer's autosave never sees these inputs.
  for(const input of [startInput,endInput]){
    on(input,'input',event=>event.stopPropagation());
    on(input,'change',event=>{event.stopPropagation();if(readFields()){paint();if(draft.start||draft.end)show(draft.start||draft.end);}});
    on(input,'keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();if(!busy&&readFields())void apply();}});
  }
  on(grid,'keydown',event=>{
    if(!event.target.closest('[data-day]'))return;
    const steps={ArrowRight:1,ArrowLeft:-1,ArrowDown:7,ArrowUp:-7};
    let next='';
    if(event.key in steps)next=addDays(focused,steps[event.key]);
    else if(event.key==='PageDown'||event.key==='PageUp'){const d=new Date(focused+'T12:00:00'),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+(event.key==='PageDown'?1:-1));d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));next=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
    else if(event.key==='Home'||event.key==='End'){const weekday=(new Date(focused+'T12:00:00').getDay()+6)%7;next=addDays(focused,event.key==='Home'?-weekday:6-weekday);}
    else return;
    event.preventDefault();show(next);focusDay();
  });
  on(popup,'keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key!=='Tab')return;
    // Focus stays inside the open popup, as in the DS date field.
    event.stopPropagation();
    const nodes=[...popup.querySelectorAll('button:not(:disabled),input')].filter(node=>node.tabIndex>=0&&node.getClientRects().length);
    if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}
  });
  on(document,'pointerdown',event=>{if(opened&&!root.contains(event.target))close(false);});
  const reposition=()=>{if(!opened)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(opened)position();});};
  on(window,'resize',reposition);
  on(document,'scroll',event=>{if(!popup.contains(event.target))reposition();},{capture:true,passive:true});
  const host=root.closest('dialog');
  if(host)on(host,'close',()=>close(false));
  sync();
  return {
    value:()=>({...saved}),
    /** Replaces the saved plan (e.g. after a reload of the task); an open popup keeps its draft. */
    set(value){saved=normalizePlan(value?.start,value?.end);sync();},
    open,close,
    destroy(){busy=false;close(false);cancelAnimationFrame(frame);abort.abort();}
  };
}
