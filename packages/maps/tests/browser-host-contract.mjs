// Local browser contract for host-restricted creation and external task references.
import {pathToFileURL} from 'node:url';
const origin=new URL(process.env.MAPS_TEST_URL||'http://127.0.0.1:4317').origin;
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Local test origin required');
const modulePath=process.env.MAPS_PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.MAPS_CHROMIUM_PATH?{executablePath:process.env.MAPS_CHROMIUM_PATH}:{})});
try{
  const page=await browser.newPage();await page.goto(origin);await page.locator('iq-whiteboard').first().waitFor({state:'attached'});
  const result=await page.evaluate(async()=>{
    const detached=document.createElement('iq-whiteboard');
    const fitBeforeConnect=detached.fit(),holder=document.createElement('div');holder.append(detached);document.body.append(holder);holder.remove();
    const fitAfterDisconnect=detached.fit();
    const board=document.createElement('iq-whiteboard');board.style.cssText='display:block;width:900px;height:600px';document.body.append(board);
    board.allowedCreateTypes=['sticky'];
    board.data={schema:'iquipage.whiteboard/1',revision:1,title:'Contract',objects:[],connections:[]};
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const blocked=board.add('shape',20,20,'Blocked'),sticky=board.add('sticky',20,20,'Allowed'),countAfterAllowed=board.data.objects.length;
    board.data={schema:'iquipage.whiteboard/1',revision:2,title:'Contract',objects:[{id:'map-task',type:'task',externalTaskId:'task-42',text:'Server title',owner:'Team',done:false,x:10,y:20,width:248,height:144}],connections:[]};
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const moved=structuredClone(board.data);moved.objects[0].x=80;board.applyDocument(moved,2,'move');
    let contentBlocked=false;const changed=structuredClone(board.data);changed.objects[0].text='Changed';try{board.applyDocument(changed,3,'edit-text');}catch{contentBlocked=true;}
    const opened=new Promise(resolve=>board.addEventListener('iq-open-task',event=>resolve(event.detail),{once:true}));
    board.querySelector('[data-object="map-task"] [data-wb-action="task-toggle"]').click();
    const detail=await opened;
    return{fitBeforeConnect,fitAfterDisconnect,blocked,sticky,countAfterAllowed,movedX:board.data.objects[0].x,text:board.data.objects[0].text,contentBlocked,detail};
  });
  if(result.fitBeforeConnect!==false||result.fitAfterDisconnect!==false)throw Error('Detached fit guard failed: '+JSON.stringify(result));
  if(result.blocked!==undefined||!result.sticky||result.countAfterAllowed!==1||result.movedX!==80||result.text!=='Server title'||!result.contentBlocked)throw Error('Host capability or external task immutability failed: '+JSON.stringify(result));
  if(result.detail.objectId!=='map-task'||result.detail.taskId!=='task-42')throw Error('Open task event failed: '+JSON.stringify(result.detail));
  console.log('Host capability and external task contract: PASS');
}finally{await browser.close();}
