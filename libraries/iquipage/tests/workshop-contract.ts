import {registerWhiteboard, BoardShape, BoardObject, BoardConnection, WhiteboardData, IqWhiteboard} from '../types/whiteboard.js';
const shapes:BoardShape[]=['rectangle','diamond','pill','ellipse','parallelogram','database','document','predefined','manual','trapezoid','hexagon','delay','connector','offpage'];
const objects:BoardObject[]=shapes.map((shape,i)=>({id:`shape-${i}`,type:'shape',shape,text:'**Содержание**',x:i*320,y:80,width:280,height:200,color:'neutral',align:'center',valign:'middle'}));
const connection:BoardConnection={id:'route',from:'shape-0',to:'shape-1',label:'Далее',fromPort:'right',toPort:'left',style:'elbow',dashed:false,arrow:true,arrowStart:false,color:'accent',labelPosition:.5,bend:0};
const model:WhiteboardData={title:'Схема',revision:1,objects,connections:[connection]};
registerWhiteboard();const board:IqWhiteboard=document.createElement('iq-whiteboard');board.data=model;board.controlled=true;
board.addEventListener('iq-change-request',event=>{event.detail.reject('Сервер в примере отсутствует');});
board.addEventListener('iq-selection',event=>console.log(event.detail.ids));
// @ts-expect-error Only the fourteen supported shape geometries are portable.
const invalid:BoardShape='custom-bpmn';
// @ts-expect-error Viewport is a coordinate object, not a CSS transform.
board.viewport='translate(10px)';
console.log(invalid);
