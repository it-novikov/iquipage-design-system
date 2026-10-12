// The same public DS and product styles as web/main.js, without auth/backend startup.
import '@iquipage/web/styles.css';
import '../../../ui/src/maps.css';
import '../../../ui/src/board/board.css';
import '../../../ui/shell.css';
import '../../../web/shell.css';
import '../../../ui/planning/src/planning.css';
import '../../../ui/finance/src/finance.css';
import '../../../ui/planning/src/navigation.css';
import '../../../web/workbench/workbench.css';
import {mountPlanning} from '../../../ui/planning/src/index.js';
import {mountProjectNavigation} from '../../../ui/planning/src/project-navigation.js';
import {dialog} from '../../../ui/src/ui.js';
import {planningData} from './data.ts';

const params=new URLSearchParams(location.search);
document.documentElement.dataset.theme=params.get('theme')==='dark'?'dark':'light';
document.documentElement.dataset.density=params.get('density')==='compact'?'compact':'comfortable';
const project={id:planningData.projectId,name:'Проверка Planning',workspaceId:'test-workspace',workspaceName:'Тест',projectName:'Проверка Planning'};
const state={ready:false,moves:[],opened:[],unsupported:[],viewState:{}};
window.planningProbe=state;
const unsupported=name=>async()=>{state.unsupported.push(name);throw Error(`Synthetic fixture does not implement ${name}`);};
const adapter={
  containers:async()=>structuredClone(planningData),
  releases:async()=>({items:[]}),
  subscribe:()=>()=>{},
  // Record one outgoing intent. Reject rather than simulate persistence or a successful move.
  move:async intent=>{state.moves.push(structuredClone(intent));throw Error('Synthetic boundary: move intent recorded; no server mutation.');},
  settings:unsupported('settings'),preview:unsupported('preview'),commit:unsupported('commit'),receipt:unsupported('receipt'),
};
const nav=mountProjectNavigation(document.querySelector('[data-product-nav]'),{
  current:project,profile:{id:'test-person',name:'Тестовый участник'},catalog:()=>[project],projects:async()=>({items:[]}),
  onSwitch:unsupported('project switch'),onAccount:()=>{},onSignOut:()=>{},onTeam:()=>{},
});
nav.setRoute('planning');
state.feature=await mountPlanning(document.querySelector('#host-view'),{
  adapter,project,viewState:state.viewState,
  onCreateTask:unsupported('task creation'),
  onOpenTask:(id,callbacks)=>{
    state.opened.push(id);
    // Real product dialog wrapper; Task content/backend is deliberately substituted.
    const modal=dialog({title:'Проверка возврата в Planning',body:'<p>В этой fixture проверяется callback возврата; полная Task и сервер не подключены.</p>'});
    modal.addEventListener('iq-close',()=>callbacks.onClose(),{once:true});
    return modal;
  },
});
await document.fonts.ready;
state.ready=true;
