import {escapeHTML as esc} from '@iquipage/web/core';
// Only geometry is application-owned. Every painted placeholder is the public DS skeleton atom.
const bar=(shape='line')=>`<span class="iq-skeleton load-${shape}"></span>`;
const repeat=(n,make)=>Array.from({length:n},(_,i)=>make(i)).join('');
const row=(person=false)=>`<div class="load-row">${person?bar('avatar'):''}<div class="load-copy">${bar()}${bar('short')}</div>${bar('meta')}</div>`;
const card=()=>`<div class="load-card">${bar('short')}${bar()}${bar('line')}${bar('meta')}</div>`;
const panel=(n=3)=>`<div class="load-panel">${bar('heading')}${repeat(n,()=>row())}</div>`;
const form=()=>`<div class="load-form">${repeat(3,()=>`<div class="load-field">${bar('short')}${bar('control')}</div>`)}</div>`;
const facts=()=>`<div class="load-facts">${repeat(3,()=>`<div>${bar('short')}${bar()}</div>`)}</div>`;
const settingsShapes={account:'account',notifications:'preferences',appearance:'none','service-accounts':'connections',profile:'profile',members:'people',access:'access',tags:'tags',templates:'templates',planning:'facts',agents:'agents',operations:'operations',workspace:'workspace','workspace-members':'people',presets:'presets',invitations:'invitations','ai-connections':'connections'};
const shapes={
 list:n=>repeat(n,()=>row()),
 people:n=>repeat(n,()=>row(true)),
 form:()=>form(),
 board:()=>`<div class="load-board">${repeat(6,()=>`<div class="load-column">${bar('heading')}${repeat(2,card)}</div>`)}</div>`,
 planning:()=>panel(4)+panel(3),
 workbench:()=>`<div class="load-dashboard"><div>${panel(3)}</div><div>${panel(2)}</div><div class="load-wide">${panel(3)}</div></div>`,
 week:n=>`<div class="load-week">${repeat(n,()=>`<div class="load-day">${bar('short')}${card()}</div>`)}</div>`,
 overview:()=>`<div class="load-metrics">${repeat(3,()=>`<div>${bar('short')}${bar('number')}${bar('meta')}</div>`)}</div>${panel(3)}`,
 ledger:n=>`<div class="load-ledger">${repeat(n,()=>`<div>${bar()}${bar('short')}${bar('meta')}${bar('short')}</div>`)}</div>`,
 agents:n=>`<div class="load-filters">${bar('control')}${bar('control')}</div>${repeat(n,()=>row(true))}`,
 maps:()=>`<div class="load-canvas"><div class="load-canvas-tools">${bar('control')}${bar('control')}</div><div class="load-canvas-dock">${repeat(5,()=>bar('tool'))}</div></div>`,
 profile:()=>form()+facts(),
 account:()=>`<div class="load-row">${bar('avatar')}<div class="load-copy">${bar('heading')}</div></div>${form()}`,
 preferences:()=>panel(2)+panel(5),
 connections:n=>`${bar('heading')}${repeat(n,()=>`<div class="load-row">${bar('tool')}<div class="load-copy">${bar()}${bar('short')}</div>${bar('meta')}</div>`)}`,
 facts:()=>facts(),
 tags:n=>`${bar('heading')}${repeat(n,()=>`<div class="load-row">${bar('dot')}${bar('short')}${bar('meta')}</div>`)}`,
 templates:()=>panel(1)+panel(3),
 access:()=>panel(2)+`${bar('heading')}${row(true)}${row(true)}`+facts(),
 workspace:()=>form()+panel(3)+panel(2),
 presets:()=>panel(3)+panel(4),
 invitations:n=>`<div class="load-filters">${bar('control')}${bar('control')}</div>${repeat(n,()=>row())}${facts()}`,
 operations:()=>`<div class="load-result">${bar('tool')}${bar('heading')}${bar()}</div>${facts()}${panel(3)}`,
 work:()=>`${bar('short')}${bar('heading')}<div class="load-copy">${bar()}${bar()}</div><div class="load-filters">${bar('control')}</div>${bar('heading')}${bar('heading')}`,
 'wiki-document':()=>`${bar('heading')}<div class="load-copy">${repeat(5,()=>bar())}</div>${bar('heading')}<div class="load-copy">${repeat(3,()=>bar())}</div>`,
 wiki:()=>`<div class="load-dashboard"><div>${panel(4)}</div><div>${bar('heading')}${repeat(6,()=>bar())}</div></div>`,
 none:()=>'',
 history:n=>repeat(n,()=>row(true)),
 search:n=>repeat(n,()=>row()),
 notifications:n=>repeat(n,()=>row(true)),
 navigation:n=>repeat(n,()=>`<div class="load-row">${bar('tool')}${bar('short')}</div>`),
};
/** Label is spoken once; decorative outlines reserve the actual content's arrangement. No false controls or data. */
export function loadingMarkup(label,{rows=null,title=false,className='',variant='list'}={}){
 const shape=shapes[variant]||shapes.list;
 return `<div class="iq-loading product-loading ${className}" data-loading-shape="${esc(variant)}" role="status" aria-busy="true"><span class="sr-only">${esc(label)}</span><div aria-hidden="true">${title?bar('title'):''}${shape(rows??(variant==='week'?7:4))}</div></div>`;
}
/** Route/section projection, kept explicit so new pages cannot silently inherit a demo shimmer. */
export function sectionLoadingShape(mode,section=''){
 if(mode==='settings')return settingsShapes[section]||'form';
 return {tasks:'board',planning:'planning',workbench:'workbench',finance:'overview',agents:'agents',maps:'maps',wiki:'wiki'}[mode]||'list';
}
