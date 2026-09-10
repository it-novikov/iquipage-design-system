import { blankDocument } from './document.js';
export const frame = (id,text,x,y,width=304,height=460) => ({id,type:'frame',text,x,y,width,height,color:'neutral'});
export const note = (id,text,x,y,color='sand',parentId) => ({id,type:'sticky',text,x,y,width:252,height:148,color,...(parentId?{parentId}:{}),autoHeight:true});
export const shape = (id,text,x,y,kind='rectangle') => ({id,type:'shape',text,x,y,width:236,height:104,color:'neutral',shape:kind});
export const edge = (id,from,to,label='') => ({id,from,to,label,style:'elbow',arrow:true});
export const columns = (title,labels,prompts) => ({...blankDocument(title),objects:labels.flatMap((label,i)=>[frame(`area-${i}`,label,40+i*340,30),note(`note-${i}`,prompts[i],66+i*340,108,['sand','lavender','mint','sky'][i%4],`area-${i}`)]),connections:[]});
export const steps = (title,labels) => ({...blankDocument(title),objects:labels.map((t,i)=>shape(`step-${i}`,t,50+i*295,190,i===0?'pill':'rectangle')),connections:labels.slice(1).map((_,i)=>edge(`link-${i}`,`step-${i}`,`step-${i+1}`))});
export const make = (id,title,description,when,category,kind,document,extra={}) => ({id,title,description,when,category,kind,scope:'built-in',version:1,document,...extra});
