import {escapeHTML as esc} from '@iquipage/web/core';

/*
 * One floating surface at a time under (or above) an anchor: in-place editors of the planning rows, the task drawer's
 * estimate, and the menus of the planning page. It sits in the top layer (Popover API) and closes on Escape, on a
 * press outside, on scroll or resize; focus returns to the anchor.
 */
let current=null;

export function closePopover(){current?.close();}

export function openPopover(anchor,{html,className='',label='',role='dialog',align='start',onMount,onClose}={}){
  closePopover();
  const el=document.createElement('div');
  el.className=`iq-popup pl-pop ${className}`.trim();el.setAttribute('role',role);if(label)el.setAttribute('aria-label',label);
  el.popover='manual';el.innerHTML=html;document.body.append(el);
  try{el.showPopover();}catch{/* without the Popover API it stays a fixed element */}
  const place=()=>{
    const r=anchor.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight,gap=6;
    let left=align==='end'?r.right-w:align==='center'?r.left+r.width/2-w/2:r.left;
    left=Math.max(8,Math.min(left,innerWidth-w-8));
    let top=r.bottom+gap;if(top+h>innerHeight-8&&r.top-h-gap>8)top=r.top-h-gap;
    el.style.left=`${Math.round(left)}px`;el.style.top=`${Math.round(Math.max(8,top))}px`;
  };
  place();
  let closed=false;
  const outside=event=>{if(!el.contains(event.target)&&!anchor.contains(event.target))close();};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}};
  const away=event=>{if(!el.contains(event.target))close();};
  function close(refocus=false){
    if(closed)return;closed=true;if(current?.el===el)current=null;
    document.removeEventListener('pointerdown',outside,true);el.removeEventListener('keydown',key);
    removeEventListener('resize',away);document.removeEventListener('scroll',away,true);
    try{el.hidePopover();}catch{/* already hidden */}
    el.remove();onClose?.();if(refocus&&anchor.isConnected)anchor.focus({preventScroll:true});
  }
  setTimeout(()=>{if(closed)return;document.addEventListener('pointerdown',outside,true);addEventListener('resize',away);document.addEventListener('scroll',away,true);});
  el.addEventListener('keydown',key);
  current={el,close};
  onMount?.(el,{close,place});
  return current;
}

/**
 * A menu of actions: rows with an optional quiet meta on the right, separators and a caption. Arrow keys move,
 * Enter picks, Escape closes; the first enabled row takes focus.
 */
export function openMenu(anchor,{items,caption='',label='',align='start',onPick}){
  const rows=items.map((item,index)=>item.separator?'<hr class="pl-menu-rule">'
    :`<button type="button" role="menuitem" class="pl-menu-item${item.danger?' is-danger':''}" data-index="${index}" ${item.disabled?'disabled':''}><span>${esc(item.label)}</span>${item.meta?`<small>${esc(item.meta)}</small>`:''}</button>`).join('');
  return openPopover(anchor,{className:'pl-menu',role:'menu',label:label||caption,align,
    html:`${caption?`<p class="pl-menu-caption">${esc(caption)}</p>`:''}${rows}`,
    onMount(el,{close}){
      const buttons=()=>[...el.querySelectorAll('.pl-menu-item:not(:disabled)')];
      buttons()[0]?.focus({preventScroll:true});
      el.addEventListener('click',event=>{const button=event.target.closest('.pl-menu-item');if(!button)return;close();onPick(items[Number(button.dataset.index)]);});
      el.addEventListener('keydown',event=>{
        const list=buttons(),at=list.indexOf(document.activeElement);
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=list[(at+(event.key==='ArrowDown'?1:-1)+list.length)%list.length];next?.focus();}
        if(event.key==='Home'||event.key==='End'){event.preventDefault();(event.key==='Home'?list[0]:list.at(-1))?.focus();}
        if(event.key==='Tab'){event.preventDefault();close(true);}
      });
    }});
}
