import {notify} from '@iquipage/web/core';
import {dialog,check} from '../ui/src/ui.js';
import {createInRunningRelease as create} from './release-create.js';
import {recoverPlanningAttempt} from './planning-host.js';

/**
 * The alert before a new task joins a running release. Resolves {stopAsking} when the person agrees, null when they
 * cancel (Escape, «Отмена», the close button). The consequence is the first thing it says.
 */
export function releaseScopeDialog({release}){
  return new Promise(resolve=>{
    let answer=null;
    const element=dialog({title:'Добавить задачу в идущий релиз?',
      description:`«${release.name}» уже начат: задача войдёт в его состав, и объём работы релиза вырастет.`,
      body:`${check('stopAsking','Больше не показывать')}<p class="iq-helper">Вернуть вопрос можно в настройках: Профиль → Подтверждения.</p>`,
      submitLabel:'Добавить в релиз',
      onSubmit:(values)=>{answer={stopAsking:values.get('stopAsking')==='on'};},
      mount:el=>{
        // An alert dialog: assistive technology reads the consequence together with the question.
        const native=el.querySelector('dialog'),text=native.querySelector('.iq-dialog-head p');
        native.setAttribute('role','alertdialog');
        if(text){text.id||=`release-scope-${crypto.randomUUID()}`;native.setAttribute('aria-describedby',text.id);}
      }});
    // Enter continues the creation the person has just asked for; Escape and Tab reach «Отмена».
    element.querySelector('button[type=submit]')?.focus({preventScroll:true});
    element.addEventListener('iq-close',()=>resolve(answer),{once:true});
  });
}

/** The board's creation in a running release, with the DS alert and toasts. */
export const createInRunningRelease=options=>create({...options,ask:releaseScopeDialog,notify,recover:()=>recoverPlanningAttempt(options.adapter)});
