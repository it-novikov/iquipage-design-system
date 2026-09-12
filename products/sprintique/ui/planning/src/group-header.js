import {ui,escapeHTML as esc} from '@iquipage/web/core';
export function groupHeader(group,{capabilities,locked,onOpenBoard}) {
  const history=['closed','cancelled'].includes(group.state),items=[];
  if(group.state!=='backlog') {
    if(history)items.push({label:'Результат релиза',glyph:'file',action:'release-history'});
    else {
      if(capabilities.editRelease)items.push({label:'План и даты',glyph:'calendar',action:'release-edit'});
      if(capabilities.close&&group.state==='active')items.push({label:'Завершить релиз',glyph:'checkCircle',action:'release-close'});
      if(capabilities.cancel)items.push({label:'Отменить релиз',glyph:'x',action:'release-cancel'});
    }
  }
  const label={active:'В работе',planned:'Запланирован',closed:'Завершён',cancelled:'Отменён'}[group.state];
  const actions=[];
  if(group.state==='active'&&onOpenBoard)actions.push(ui.btn('На доску','ghost sm','upRight','data-board'));
  if(group.state==='planned'&&capabilities.start)actions.push(ui.btn('Начать','secondary sm','play',`data-start ${locked?'disabled':''}`));
  if(group.state==='active'&&capabilities.close)actions.push(ui.btn('Завершить','secondary sm','check','data-close-release'));
  if(capabilities.createTask&&!history&&group.state!=='active')actions.push(ui.ib('plus','Добавить задачу в '+group.title,'ghost sm',`data-add ${locked?'disabled':''}`));
  if(items.length)actions.push(ui.menu(ui.ib('more','Действия релиза '+group.title,'ghost sm',locked?'disabled':''),items));
  return `${ui.ib(group.folded?'chevron':'down',`${group.folded?'Раскрыть':'Свернуть'} ${group.title}`,'ghost sm',`data-fold data-focus="group:${esc(group.id)}" aria-expanded="${!group.folded}"`)}<h2>${esc(group.title)}</h2>${label?ui.badge(label,group.state==='active'?'info':'outline'):''}<span class="pn-count" aria-label="${group.matched} из ${group.total} задач">${group.matched===group.total?group.total:`${group.matched} / ${group.total}`}</span><span class="pn-group-date">${esc(group.dateLabel||'')}${group.formatLabel?' · '+esc(group.formatLabel):''}</span><div class="row pn-group-actions">${actions.join('')}</div>`;
}
