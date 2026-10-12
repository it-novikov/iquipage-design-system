// Actual product mounts/styles. Only the outer bootstrap and adapter responses are synthetic.
import '@iquipage/web/styles.css';
import '../../../ui/src/maps.css';
import '../../../ui/src/board/board.css';
import '../../../ui/shell.css';
import '../../../web/shell.css';
import '../../../ui/planning/src/planning.css';
import '../../../ui/finance/src/finance.css';
import '../../../ui/planning/src/navigation.css';
import '../../../web/workbench/workbench.css';
import {registerCore,version} from '@iquipage/web/core';
import {mountTaskBoard} from '../../../ui/src/board/board.js';
import {openTaskDialog} from '../../../ui/src/board/task-dialog.js';
import {mountWiki} from '../../../web/wiki.js';
import {wikiHash} from '../../../web/wiki-model.js';
import {mountProjectNavigation} from '../../../ui/planning/src/project-navigation.js';
import {project,person,navigationContext,tasks,wikiPageId,syntheticRepository} from './repository.js';

const params=new URLSearchParams(location.search),surface=params.get('surface')||'board';
Object.assign(document.documentElement.dataset,{theme:params.get('theme')||'light',density:params.get('density')||'comfortable'});
document.documentElement.style.fontSize=params.get('text')==='200'?'200%':'100%';
registerCore();
const fixture=syntheticRepository(),root=document.querySelector('#host-view');
const probe={ready:false,bootstrapError:null,version,reads:fixture.reads,unsupported:fixture.unsupported,attempts:fixture.attempts};
window.tabsGeometryProbe=probe;
let host,nav;
try{
  nav=mountProjectNavigation(document.querySelector('[data-product-nav]'),{
    current:navigationContext,profile:person,catalog:()=>[project],projects:async()=>({options:[{value:project.id,label:project.name}],nextCursor:null}),
    onSwitch:()=>{throw Error('Project switching is outside this fixture');},onAccount:()=>{},onTeam:()=>{},onSignOut:()=>{},
  });
  nav.setRoute(surface==='wiki'?'wiki':'tasks');nav.setTheme(document.documentElement.dataset.theme);
  if(surface==='wiki'){
    root.dataset.section='wiki';history.replaceState(null,'',wikiHash(wikiPageId));
    host=await mountWiki(root,{repository:fixture.repository,project});
  }else if(surface==='nested'){
    history.replaceState(null,'','#task/TFX-101');
    // The Task's existing fallback link opens another real Task dialog without a host-owned handoff.
    host=await openTaskDialog(tasks[0],{repository:fixture.repository,project,tasks,canEdit:false,canManage:false});
  }else{
    history.replaceState(null,'','#tasks');
    host=await mountTaskBoard(root,{repository:fixture.repository,project,canEdit:true,canManageCatalogs:false});
  }
  await document.fonts.ready;
  probe.ready=true;
}catch(error){probe.bootstrapError=error.stack||error.message;}
window.addEventListener('pagehide',()=>{nav?.destroy();host?.destroy?.();},{once:true});
