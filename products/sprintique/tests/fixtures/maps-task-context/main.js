// Actual public package and product styles; authentication and main.js bootstrap are intentionally not mounted.
import '@iquipage/web/styles.css';
import '../../../ui/src/maps.css';
import '../../../ui/src/board/board.css';
import '../../../ui/shell.css';
import '../../../web/shell.css';
import '../../../ui/planning/src/planning.css';
import '../../../ui/finance/src/finance.css';
import '../../../ui/planning/src/navigation.css';
import '../../../web/workbench/workbench.css';
import {registerCore} from '@iquipage/web/core';
import {mountMapsHost} from '../../../web/maps-host.js';
import {parseMapRoute} from '../../../web/maps-route.js';
import {mountProjectNavigation} from '../../../ui/planning/src/project-navigation.js';
import {project,syntheticRepository} from './repository.js';

const params=new URLSearchParams(location.search),theme=params.get('theme')==='dark'?'dark':'light';
document.documentElement.dataset.theme=theme;
registerCore();
if(!location.hash)history.replaceState(null,'','#maps/map-a');
const fixture=syntheticRepository(),root=document.querySelector('#host-view');
let host,firstBoard,firstInspector,opener,rememberedTask;
const probe={ready:false,bootstrapError:null,routeErrors:[],historyEvents:[],peakOpenTaskDialogs:0,
  reads:fixture.reads,unsupported:fixture.unsupported,controls:fixture.controls};
window.mapsTaskProbe=probe;
const board=()=>root.querySelector('iq-whiteboard');
const taskDialog=()=>document.querySelector('iq-dialog.task-edit-dialog');
const observeDialogs=()=>{probe.peakOpenTaskDialogs=Math.max(probe.peakOpenTaskDialogs,document.querySelectorAll('.task-edit-dialog dialog[open]').length);};
const observer=new MutationObserver(observeDialogs);
observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
probe.capture=()=>{firstInspector=root.querySelector('.canvas-property-form');opener=root.querySelector('[data-open-linked-task]');return probe.inspect();};
probe.rememberTask=()=>{rememberedTask=taskDialog();};
probe.inspect=()=>({hash:location.hash,mapId:parseMapRoute(host?.routeHash)?.mapId||null,
  mapTitle:board()?.data.title||null,sameBoard:board()===firstBoard&&!!firstBoard?.isConnected,
  viewport:board()?.viewport,selection:board()?.selection,inspectorOpen:root.querySelector('.map-inspector')?.hidden===false,
  sameInspector:root.querySelector('.canvas-property-form')===firstInspector,focusOnOpener:document.activeElement===opener,
  currentTask:host?.currentTask(),sameRememberedTask:!!rememberedTask&&taskDialog()===rememberedTask,
  taskIds:[...document.querySelectorAll('iq-dialog.task-edit-dialog')].filter(el=>el.querySelector('dialog[open]')).map(el=>el.taskController?.taskId),
  workTab:taskDialog()?.querySelector('[data-task-tabs]')?.getAttribute('value')||null});

// Only the isolated Maps host's public route entry is connected to real native history events.
// This is not a copy of, or evidence for, main.js section/auth/navigation behavior.
const onHash=()=>{
  if(!host)return;const hash=location.hash;probe.historyEvents.push(hash);
  void host.openRoute(hash).catch(error=>probe.routeErrors.push({hash,message:error.message}));
};
window.addEventListener('hashchange',onHash);
let nav;
try{
  nav=mountProjectNavigation(document.querySelector('[data-product-nav]'),{
    current:project,profile:{id:'fixture-person',name:'Тестовый участник'},catalog:()=>[project],
    projects:async()=>({options:[{value:project.id,label:project.name}],nextCursor:null}),
    onSwitch:()=>{throw Error('Project switching is outside this fixture');},onAccount:()=>{},onTeam:()=>{},onSignOut:()=>{},
  });
  nav.setRoute('maps');nav.setTheme(theme);
  host=await mountMapsHost(root,{repository:fixture.repository,project,viewState:{}});
  await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  firstBoard=board();probe.ready=true;
}catch(error){probe.bootstrapError=error.stack||error.message;}
window.addEventListener('pagehide',()=>{window.removeEventListener('hashchange',onHash);observer.disconnect();nav?.destroy();void host?.destroy();},{once:true});
