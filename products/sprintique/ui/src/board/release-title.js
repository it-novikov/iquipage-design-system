import {ui} from '@iquipage/web/core';
import {boardReleaseItems,boardReleasePick} from './model.js';
/**
 * SPR-13: the board's title is the release it shows and the switcher that changes it. It is the DS switcher of the
 * workspace and project in the top bar at the title's size (the 24px/600 page title gains only the chevron and the
 * menu): the running releases, then the planned ones, each with its state as a quiet word, then «Без релиза»; the
 * shown one checked. The switcher is rebuilt only when its choices change, so a reload never closes an open menu, and
 * focus stays on it after a pick. `onPick(value)` gets a release id or 'backlog' other than the one shown.
 */
export function mountReleaseTitle(title,{onPick,signal}){
  let key='',shown={backlog:true};
  function render(releases,next){
    shown=next||{backlog:true};
    const items=boardReleaseItems(releases,shown),label=shown.backlog?'Без релиза':shown.name,now=JSON.stringify([label,items]);
    if(now===key)return;key=now;
    const focused=title.contains(document.activeElement);
    title.innerHTML=ui.switcher({label,name:'Релиз на доске',size:'title',items});
    if(focused)title.querySelector('.iq-switcher')?.focus({preventScroll:true});
  }
  title.addEventListener('iq-action',event=>{
    const value=boardReleasePick(event.detail?.action);if(!value)return;
    event.stopPropagation();
    if(value!==(shown.backlog?'backlog':shown.releaseId))onPick(value);
  },{signal});
  return {render};
}
