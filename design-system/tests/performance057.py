"""A bounded diagnostic, not FPS or a production performance guarantee."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os,json,hashlib,sys
R=Path(__file__).resolve().parents[1];O=R/'evidence';errors=[];results=[];checks=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);p=b.new_page(viewport={'width':1440,'height':1000});p.route('**/*',lambda r:r.abort());p.on('pageerror',lambda e:errors.append(str(e)));p.set_content((R/'whiteboard.html').read_text(),wait_until='domcontentloaded');p.wait_for_selector('iq-whiteboard .wb-stage')
 for size in [16,64,120]:
  data=p.locator('iq-whiteboard').evaluate('''(b,count)=>{const objects=Array.from({length:count},(_,i)=>({id:'n'+i,type:'shape',shape:i%5===0?'diamond':'rectangle',text:'Узел '+(i+1),x:(i%8)*380,y:Math.floor(i/8)*240,width:230,height:130,color:'neutral'}));const connections=objects.slice(1).filter((o,i)=>(i+1)%8!==0).map(o=>({id:'e'+o.id,from:'n'+(+o.id.slice(1)-1),to:o.id,style:'elbow'}));const start=performance.now();b.data={title:'Диагностика',revision:1,objects,connections};b.getBoundingClientRect();return {objects:count,connections:connections.length,initialMilliseconds:performance.now()-start}}''',size)
  p.wait_for_timeout(200)
  update=p.locator('iq-whiteboard').evaluate('''b=>{let d=b.data,routeTimes=[],panTimes=[],path=b.svg.querySelector('.wb-edge-line');for(let i=0;i<18;i++){d.objects[0].x+=1;let t=performance.now();b.updateEdges(d);if(i>=3)routeTimes.push(performance.now()-t);t=performance.now();b.viewport={x:i*2,y:i,zoom:1};if(i>=3)panTimes.push(performance.now()-t)}const stats=xs=>{xs.sort((a,b)=>a-b);return {median:xs[Math.floor(xs.length/2)],p95:xs[Math.ceil(xs.length*.95)-1],samples:xs.length}};return {routes:stats(routeTimes),viewport:stats(panTimes),svgIdentityPreserved:path===b.svg.querySelector('.wb-edge-line')}}''')
  p.wait_for_timeout(150);idle=p.locator('iq-whiteboard').evaluate("b=>b.getAnimations({subtree:true}).filter(a=>a.playState==='running').length")
  results.append({**data,**update,'runningAnimationsAtRest':idle});checks.append({'name':f'{size} nodes stable SVG and idle','passed':update['svgIdentityPreserved'] and idle==0})
 b.close()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r={'version':'0.5.7','htmlSha256':sha(R/'whiteboard.html'),'cssSha256':sha(R/'dist/iquipage.css'),'total':len(checks),'passed':sum(c['passed'] for c in checks),'checks':checks,'javascriptErrors':errors,'measurements':results,'method':'Headless Chromium. Initial assignment includes forced bounding layout; route and viewport are synchronous JS only, 15 samples after 3 warmups. No paint, FPS, full-frame or device guarantee. Simple arranged scenes, not worst-case obstacle packing.'}
(O/'performance-057.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False,indent=2));sys.exit(0 if r['passed']==r['total'] and not errors else 1)
