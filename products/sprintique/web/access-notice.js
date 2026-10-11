import {ui} from '@iquipage/web/core';
/** Keep permission feedback outside the horizontal page workspace without replacing its draft. */
export function showAccessNotice(root,onRefresh){
 if(root.querySelector('[data-access-change]'))return;
 const main=root.querySelector('.platform-main');if(!main)return;
 const notice=document.createElement('section');notice.dataset.accessChange='';notice.className='sq-access-notice';
 notice.innerHTML=ui.alert('Права изменились','<span class="sq-access-notice-copy">Несохранённый текст остаётся в открытой форме. Обновите доступ, чтобы применить новые права.</span>'+ui.btn('Обновить доступ','secondary sm'),'warning');
 main.before(notice);notice.querySelector('button').onclick=onRefresh;
 return notice;
}
