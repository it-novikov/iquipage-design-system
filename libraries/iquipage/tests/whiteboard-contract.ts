import {registerWhiteboard,IqWhiteboard,WhiteboardData,ChangeRequest} from '../types/whiteboard.js';
registerWhiteboard();
const board=document.createElement('iq-whiteboard');
const fixture:WhiteboardData={title:'Ретро',revision:1,objects:[],connections:[]};
board.data=fixture;board.view='canvas';board.saveStatus='Все изменения подтверждены';
board.selection=[];board.viewport={x:0,y:0,zoom:1};board.templates=[];board.controlled=true;
board.addEventListener('iq-change-request',event=>{
 const intent:ChangeRequest=event.detail;
 // Example of accepting a newer authoritative version, not an implemented server adapter.
 const accepted:boolean=intent.accept({...intent.value,revision:intent.baseRevision+1});
 console.log(accepted);
});
board.addEventListener('iq-selection',event=>console.log(event.detail.ids));
board.addEventListener('iq-viewport',event=>console.log(event.detail.zoom));
const typed:IqWhiteboard=board;typed.fit();typed.undo();
// @ts-expect-error: unsupported state must not be part of the contract.
board.state='fake-server-success';
