import '@iquipage/web/styles.css';
import './host.css';
import {registerCore,version,ui,escapeHTML as esc} from '@iquipage/web/core';
import {data,rows} from './data.mjs';

const params=new URLSearchParams(location.search),width=Number(params.get('width')),font=Number(params.get('font'));
if(![615,349,270].includes(width)||![16,32].includes(font))throw Error('Unknown frozen host profile');
document.documentElement.style.fontSize=font+'px';
const host=document.querySelector('#fixture-host');host.style.width=width+'px';
const probe={version,ready:false,bootstrapError:null,rows,data,changes:[]};window.propertyListProbe=probe;
document.addEventListener('iq-change',event=>probe.changes.push({row:event.target.dataset.row||null,value:event.detail?.value}));
try{
  registerCore();
  const ownerOptions=[{value:data.person.id,label:data.person.name,avatar:{text:"АА",tone:"blue"}},{value:'person-2',label:'Михаил Петров'}];
  const owner=(id)=>ui.select('Исполнитель',ownerOptions,`name="${id}" data-row="${id}" searchable value="${data.person.id}"`);
  const due=(id)=>`<iq-date-field data-row="${id}" name="${id}" label="Срок" deadline value="${data.due}"></iq-date-field>`;
  const staticRow=(id,label,value)=>`<dl class="iq-property" data-row="${id}"><dt class="iq-property-label">${esc(label)}</dt><dd class="iq-property-value">${value}</dd></dl>`;
  host.innerHTML=`<p class="fixture-caption">Свойства объекта</p><div class="iq-properties" data-label="wide" data-property-list>
    ${ui.select('Статус',[data.status,{value:'active',label:'В работе',tone:'info'}],'name="status" data-row="status" appearance="pill" value="review"')}
    ${owner('owner')}${due('due')}
    ${ui.select('Приоритет',[data.priority,{value:'normal',label:'Обычный'}],'name="priority" data-row="priority" trigger-icon="none" value="critical"')}
    ${ui.combo('Поиск участника',[data.person.name,'Михаил Петров'],`name="participant" data-row="participant" value="${esc(data.person.name)}"`)}
    <iq-tag-picker data-row="tags" label="Теги" appearance="ghost"></iq-tag-picker>
    ${staticRow('plan','План',esc(data.plan))}
    ${staticRow('author','Автор',`${ui.personAvatar(data.author,{size:'xs'})}<span class="iq-property-text">${esc(data.author.name)}</span><span class="iq-property-meta">${esc(data.author.date)}</span>`)}
    ${staticRow('static-status','Статус',esc(data.staticStatus))}
    ${staticRow('parent','Родитель',`<span class="iq-property-key">${esc(data.parent.key)}</span><span class="iq-property-text">${esc(data.parent.title)}</span>`)}
    </div><section class="fixture-reference" aria-label="Та же информация вне списка свойств"><p class="fixture-caption">Обычные поля той же ширины</p>${owner('reference-owner')}${due('reference-due')}</section>`;
  const picker=host.querySelector('iq-tag-picker');picker.options=data.tags;picker.value=data.tags.map(tag=>tag.value);
  await Promise.all(['iq-select','iq-date-field','iq-combobox','iq-tag-picker'].map(name=>customElements.whenDefined(name)));
  await document.fonts.ready;probe.ready=true;
}catch(error){probe.bootstrapError=error.stack||error.message;}
