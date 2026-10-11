import {escapeHTML as esc} from '@iquipage/web/core';
/** Application adapter for the public page-header slots. Markup arguments are owned by the caller. */
export function pageHeader({title='',titleHTML='',description='',eyebrow='',back='',actions='',context='',className='',attrs=''}={}){
 return `<iq-work-header class="sq-page-header ${className}" ${attrs} ${description?`description="${esc(description)}"`:''} ${eyebrow?`eyebrow="${esc(eyebrow)}"`:''}><div slot="title">${titleHTML||`<h1 tabindex="-1">${esc(title)}</h1>`}</div>${back?`<div slot="back">${back}</div>`:''}<div slot="actions" class="sq-page-actions">${actions}</div>${context?`<div slot="context">${context}</div>`:''}</iq-work-header>`;
}
