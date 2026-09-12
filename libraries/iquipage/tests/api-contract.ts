import {IqRoadmap,IqGraph,IqImageCrop,registerAdvanced,type CropRequest,type GraphData} from '../types/extensions.js';
registerAdvanced();
const plan=new IqRoadmap();
plan.data={rows:[{id:'g',title:'Цель',kind:'goal'},{id:'e',parentId:'g',kind:'epic',title:'Выпуск',start:null,end:null}]};
plan.collapsedIds=['e'];plan.selection={kind:'row',id:'g'};
const graph=new IqGraph();
const data:GraphData={nodes:[{id:'n',kind:'note',title:'Заметка',status:'done'}],edges:[]};
graph.data=data;graph.viewport={x:0,y:0,zoom:1};graph.selection={kind:'node',id:'n'};
const crop=new IqImageCrop();crop.source=new Blob([], {type:'image/png'});crop.controlled=true;
crop.addEventListener('iq-crop-request',e=>{const r=(e as CustomEvent<CropRequest>).detail;void r.blob;r.reject('Отказ приложения')});
void crop.export({size:256,type:'image/webp'});
// @ts-expect-error a viewport scale must be numeric
 graph.viewport={x:0,y:0,zoom:'auto'};
// @ts-expect-error unsupported export format
void crop.export({type:'image/svg+xml'});
