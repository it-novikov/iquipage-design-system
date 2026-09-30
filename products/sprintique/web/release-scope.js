import {notify} from '@iquipage/web/core';
import {dialog,check} from '../ui/src/ui.js';
import {createInRelease as create} from './release-create.js';
import {recoverPlanningAttempt} from './planning-host.js';

/** What the question says: a running release grows, a planned one only gains a task. */
export function releaseScopeCopy(release){
  const name=`«${release.name}»`;
  return release.lifecycle==='active'
    ?{title:'Добавить задачу в идущий релиз?',text:`${name} уже начат: задача войдёт в его состав, и объём работы релиза вырастет.`}
    :{title:'Добавить задачу в релиз?',text:`${name} ещё не начат: задача войдёт в его состав и будет в работе, когда релиз начнётся.`};
}

/**
 * The alert before a new task joins a release from the board. Resolves {stopAsking} when the person agrees, null when
 * they cancel (Escape, «Отмена», the close button). The consequence is the first thing it says.
 */
export function releaseScopeDialog({release}){
  return new Promise(resolve=>{
    let answer=null;const copy=releaseScopeCopy(release);
    const element=dialog({title:copy.title,description:copy.text,
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

/** The board's creation in a running or planned release, with the DS alert and toasts. */
export const createInRelease=options=>create({...options,ask:releaseScopeDialog,notify,recover:()=>recoverPlanningAttempt(options.adapter)});
