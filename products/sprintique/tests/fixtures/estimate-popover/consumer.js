// Existing product helpers and public packaged DS; only the outer host and callbacks are synthetic.
import '@iquipage/web/styles.css';
import '../../../ui/planning/src/planning.css';
import {registerCore,version} from '@iquipage/web/core';
import {estimateEditor} from '../../../ui/src/estimate.js';
import {openMenu} from '../../../ui/src/popover.js';

const params=new URLSearchParams(location.search);
Object.assign(document.documentElement.dataset,{theme:params.get('theme')||'light',density:params.get('density')||'comfortable'});
document.documentElement.style.fontSize=params.get('text')==='200'?'200%':'100%';
registerCore();
const owner=document.querySelector('#fixture-owner'),anchor=document.querySelector('#owner-estimate');
const probe={ready:false,version,saves:[],picks:[],lifecycle:[],
  closeOwner(){probe.lifecycle.push('close-owner');owner.close();},
  removeOwner(){probe.lifecycle.push('remove-owner');owner.remove();},
  removeAnchor(){probe.lifecycle.push('remove-anchor');anchor.remove();}};
window.estimatePopoverProbe=probe;
const openEstimate=(button,format='time')=>estimateEditor(button,{format,value:{value:3,unit:format==='points'?'sp':'h'},
  onSave:value=>{probe.saves.push(structuredClone(value));}});
document.querySelector('#outside-estimate').addEventListener('click',event=>openEstimate(event.currentTarget,params.get('format')==='points'?'points':'time'));
document.querySelector('#outside-menu').addEventListener('click',event=>openMenu(event.currentTarget,{label:'Действия',items:[
  {key:'open',label:'Открыть'},
  {key:'archive',label:'Архивировать',disabled:true},
  {key:'duplicate',label:'Дублировать'},
],onPick:item=>{probe.picks.push(item.key);}}));
document.querySelector('#open-owner').addEventListener('click',()=>owner.showModal());
anchor.addEventListener('click',event=>openEstimate(event.currentTarget));
owner.addEventListener('close',()=>probe.lifecycle.push('owner-close-event'));
await document.fonts.ready;
probe.ready=true;
