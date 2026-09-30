// Keyboard of the Workbench (design-v2 §11.3): one Tab stop per list (roving tabindex), ↑↓ between rows, Home/End,
// → into the row's actions and ← back, Enter opens the task. On a row: E — its verb, D — done, S — snooze,
// J — watch or stop watching («Наблюдаю»), ⌘↑/⌘↓ (Ctrl on other systems) — the order in «Наблюдаю». 1–6 go to the sections of the
// summary line. Nothing here acts by itself: the keys press the row's own labelled controls.

const typing=target=>target.closest?.('input,textarea,select,[contenteditable=""],[contenteditable=true],iq-markdown-editor,iq-date-field,dialog');
const rowsOf=list=>[...list.querySelectorAll(':scope > [data-row]')];

/** Makes the first row of every `[data-list]` in `root` the list's one Tab stop, keeping a current one if present. */
export function arm(root){
  for(const list of root.querySelectorAll('[data-list]')){
    const rows=rowsOf(list);if(!rows.length)continue;
    const current=rows.find(r=>r.tabIndex===0)||rows[0];
    for(const r of rows)r.tabIndex=r===current?0:-1;
  }
}
/** Focus a row, making it its list's Tab stop. */
export function focusRow(row){
  if(!row)return false;
  const list=row.closest('[data-list]');if(list)for(const r of rowsOf(list))r.tabIndex=r===row?0:-1;
  row.focus({preventScroll:false});return true;
}

export function bindKeyboard(root,{onOpen,section=()=>null,signal}){
  // 1–6 work wherever the focus is on the page (the page itself included), unless a dialog or a field has it.
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||typing(event.target)||document.querySelector('dialog[open]'))return;
    if(event.metaKey||event.ctrlKey||event.altKey||!/^[1-6]$/.test(event.key))return;
    const target=section(Number(event.key));if(!target)return;
    event.preventDefault();target.scrollIntoView({block:'start'});
    const first=target.querySelector('[data-list] > [data-row]');(first?focusRow(first):target.querySelector('h2,h3')?.focus());
  },{signal});
  root.addEventListener('keydown',event=>{
    if(event.defaultPrevented||typing(event.target))return;
    const row=event.target.closest('[data-row]'),onRow=row&&event.target===row;
    const mod=event.metaKey||event.ctrlKey;
    if(!row)return;
    const list=row.closest('[data-list]'),rows=list?rowsOf(list):[row],index=rows.indexOf(row);
    const press=selector=>{const control=row.querySelector(selector);if(control&&!control.disabled){event.preventDefault();control.click();return true;}return false;};
    if(mod&&(event.key==='ArrowUp'||event.key==='ArrowDown')){press(`[data-rank="${event.key==='ArrowUp'?'up':'down'}"]`);return;}
    if(!onRow){
      if(event.key==='ArrowLeft'&&!event.target.closest('iq-menu [data-menu]')){event.preventDefault();focusRow(row);}
      return;
    }
    switch(event.key){
      case 'ArrowDown':event.preventDefault();focusRow(rows[Math.min(rows.length-1,index+1)]);break;
      case 'ArrowUp':event.preventDefault();focusRow(rows[Math.max(0,index-1)]);break;
      case 'Home':event.preventDefault();focusRow(rows[0]);break;
      case 'End':event.preventDefault();focusRow(rows.at(-1));break;
      case 'ArrowRight':{const control=row.querySelector('button:not([disabled]),a[href]:not([data-open])');if(control){event.preventDefault();control.focus();}break;}
      case 'Enter':event.preventDefault();onOpen(row);break;
      default:
        if(mod||event.altKey)return;
        if(event.key==='e'||event.key==='E'||event.key==='у'||event.key==='У')press('[data-verb],[data-accept]');
        else if(event.key==='d'||event.key==='D'||event.key==='в'||event.key==='В')press('[data-complete]');
        else if(event.key==='s'||event.key==='S'||event.key==='ы'||event.key==='Ы'){const snooze=row.querySelector('[data-action^="snooze:"]');if(snooze){event.preventDefault();snooze.click();}}
        else if(event.key==='j'||event.key==='J'||event.key==='о'||event.key==='О'){row.dispatchEvent(new CustomEvent('dsk-toggle-participation',{bubbles:true}));event.preventDefault();}
    }
  },{signal});
}
