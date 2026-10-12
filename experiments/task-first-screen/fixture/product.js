// The same actual product mounts and stylesheet order as the existing tabs-geometry consumer.
// Composition is compiled before mount. This fixture has no variant selector or DOM rearrangement.
import '@iquipage/web/styles.css';
import '../../../products/sprintique/ui/src/maps.css';
import '../../../products/sprintique/ui/src/board/board.css';
import '../../../products/sprintique/ui/shell.css';
import '../../../products/sprintique/web/shell.css';
import '../../../products/sprintique/ui/planning/src/planning.css';
import '../../../products/sprintique/ui/finance/src/finance.css';
import '../../../products/sprintique/ui/planning/src/navigation.css';
import '../../../products/sprintique/web/workbench/workbench.css';
import {registerCore,version} from '@iquipage/web/core';
import {mountTaskBoard} from '../../../products/sprintique/ui/src/board/board.js';
import {mountProjectNavigation} from '../../../products/sprintique/ui/planning/src/project-navigation.js';
import {workFocus} from '../../../products/sprintique/ui/src/board/work-model.js';
import {person,project,navigationContext,scenario,syntheticRepository} from './repository.mjs';

const params=new URLSearchParams(location.search),data=scenario(params.get('case')||'ordinary');
Object.assign(document.documentElement.dataset,{theme:params.get('theme')||'light',density:'comfortable'});
document.documentElement.style.fontSize=params.get('text')==='200'?'200%':'100%';
registerCore();
const fixture=syntheticRepository(data),changes=[];
const focus=workFocus(data.work);
window.taskFirstScreenProbe={ready:false,bootstrapError:null,version,case:data.id,
  focus:{kind:focus.kind,id:focus.item?.id||null},changes,reads:fixture.reads,
  unsupported:fixture.unsupported,attempts:fixture.attempts};
document.addEventListener('iq-change',event=>{
  if(event.target.matches('iq-tabs'))changes.push({label:event.target.getAttribute('label'),value:event.detail.value});
});
let host,nav;
try{
  nav=mountProjectNavigation(document.querySelector('[data-product-nav]'),{
    current:navigationContext,profile:person,catalog:()=>[project],
    projects:async()=>({options:[{value:project.id,label:project.name}],nextCursor:null}),
    onSwitch:()=>{throw Error('Project switching is outside this fixture');},
    onAccount:()=>{},onTeam:()=>{},onSignOut:()=>{},
  });
  nav.setRoute('tasks');nav.setTheme(document.documentElement.dataset.theme);
  history.replaceState(null,'','#tasks');
  host=await mountTaskBoard(document.querySelector('#host-view'),{
    repository:fixture.repository,project,canEdit:true,canManageCatalogs:false,
  });
  await document.fonts.ready;
  window.taskFirstScreenProbe.ready=true;
}catch(error){window.taskFirstScreenProbe.bootstrapError=error.stack||error.message;}
window.addEventListener('pagehide',()=>{nav?.destroy();host?.destroy?.();},{once:true});
