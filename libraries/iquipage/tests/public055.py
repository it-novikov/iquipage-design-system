"""05.5 integration checks through actual split ESM (no application or private DOM patches)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,hashlib,os,re,time
R=Path(__file__).resolve().parents[1];O=R/'evidence';CSS=(R/'dist/iquipage.css').read_text();results=[];errors=[]
DIST={p.relative_to(R/'dist').as_posix():p.read_bytes() for p in sorted((R/'dist').rglob('*.js'))}
RUNTIME=hashlib.sha256('\n'.join(k+':'+hashlib.sha256(v).hexdigest() for k,v in DIST.items()).encode()).hexdigest()
def need(v,m='assertion failed'):
 if not v:raise AssertionError(m)
def serve(route):
 key=route.request.url.split('/dist/',1)[-1]
 if key in DIST:route.fulfill(body=DIST[key],content_type='text/javascript',headers={'Access-Control-Allow-Origin':'*'})
 else:route.abort()
def setup(body,code='',dark=False,touch=False):
 global p,ctx
 ctx=b.new_context(viewport={'width':390 if touch else 1440,'height':844 if touch else 1000},has_touch=touch)
 p=ctx.new_page();p.set_default_timeout(4500);p.on('pageerror',lambda e:errors.append(str(e)));p.route('**/*',lambda r:r.abort());p.route('https://iq.local/dist/**',serve)
 p.set_content('<html lang="ru" data-theme="'+('dark' if dark else 'light')+'"><style>'+CSS+'body{padding:20px;margin:0}</style><body>'+body+'</body></html>');p.evaluate("async()=>{window.api=await import('https://iq.local/dist/iquipage.js');api.registerIquipage()}")
 if code:p.evaluate(code)
 p.wait_for_timeout(50)
def test(name,fn):
 start=len(errors)
 try:fn();need(len(errors)==start,errors[start:]);results.append({'name':name,'passed':True});print('PASS',name,flush=True)
 except Exception as e:results.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e)[:220],flush=True)
 finally:
  try:ctx.close()
  except:pass
G="""window.g=document.querySelector('iq-graph');g.data={revision:1,nodes:[{id:'a',kind:'task',title:'Секретный заголовок',text:'Закрытая инструкция',x:20,y:20,domain:{taskId:42}},{id:'b',kind:'note',title:'B',x:450,y:20}],edges:[{id:'e',source:'a',target:'b',label:'Секретная подпись'}]};g.selection={kind:'node',id:'a'}"""
def calendar(dark,nested,touch):
 body='<iq-date-field label="Срок" value="2026-09-18"></iq-date-field>'
 if nested:body='<iq-dialog id="dlg" label="Проверка даты">'+body+'</iq-dialog>'
 setup(body,"window.f=document.querySelector('iq-date-field');"+("document.querySelector('iq-dialog').show();" if nested else ''),dark,touch)
 interact=lambda locator:locator.tap() if touch else locator.click()
 interact(p.locator('.iq-date-trigger'));interact(p.locator('[data-month="1"]'));need(p.locator('[data-date="2026-10-12"]').is_visible());interact(p.locator('[data-date="2026-10-12"]'));need(p.evaluate('f.value')=='2026-10-12');interact(p.locator('.iq-date-trigger'));p.keyboard.press('Escape');need(not p.evaluate('f.opened'));need(p.locator('.iq-date-trigger').evaluate('e=>e===document.activeElement'))
 p.locator('.iq-date-trigger').focus();p.keyboard.press('Enter');p.locator('[data-month="-1"]').focus();p.keyboard.press('Enter');p.locator('[data-date="2026-09-16"]').focus();p.keyboard.press('Enter');need(p.evaluate('f.value')=='2026-09-16')
def tag(dark,state):
 setup('<iq-tag-input label="Метки"></iq-tag-input>',"document.querySelector('iq-tag-input').value=['Новая метка']",dark)
 e=p.locator('[data-tag-remove]')
 if state=='hover':e.hover()
 else:p.keyboard.press('Tab');e.focus()
 values=e.evaluate('e=>{let c=getComputedStyle(e);return [c.color,c.backgroundColor]}')
 rgb=lambda s:[int(x) for x in re.findall(r'\d+',s)[:3]]
 def lum(c):return sum((x/255/12.92 if x/255<=.04045 else ((x/255+.055)/1.055)**2.4)*k for x,k in zip(c,[.2126,.7152,.0722]))
 a,z=sorted([lum(rgb(v)) for v in values]);ratio=(z+.05)/(a+.05);need(ratio>=3,{'colors':values,'contrast':ratio});e.click();need(p.locator('.iq-tag-token').count()==0)
 results.append({'name':('dark' if dark else 'light')+' tag '+state+' contrast','passed':True,'ratio':round(ratio,2),'colors':values})
def pending_rights():
 setup('<iq-graph></iq-graph>',G+";g.controlled=true;g.addEventListener('iq-change-request',e=>window.req=e.detail);const d=g.data;d.nodes[0].x+=30;g.preview(d,{kind:'move'});g.requestCommit();");need(p.evaluate('g.pending'));p.evaluate('g.permissions={move:false}');need(not p.evaluate('req.accept(req.value)'));need(p.evaluate('g.session.dirty&&!g.pending'));need(not p.evaluate('g.requestCommit()'))
def read_geometry():
 setup('<iq-graph></iq-graph>',G+";g.nodePermissions={a:{read:false,move:true,resize:true,editContent:false,open:false}};")
 need(not p.locator('iq-graph').evaluate('e=>e.innerHTML.includes("Секретный")||e.innerHTML.includes("Закрытая инструкция")||e.innerHTML.includes("Секретная подпись")'))
 need(p.evaluate('()=>{let d=g.data;d.nodes[0].x+=20;return g.preview(d,{kind:"move"})}'))
 p.locator('[data-pro-action=apply]').click();need(p.evaluate('g.data.nodes[0].domain.taskId')==42)
 p.evaluate('g.issue="Проверка";g.schedule()');p.wait_for_timeout(30);need(not p.locator('iq-graph').inner_text().find('Секретный')>=0)
def separate_relations():
 setup('<iq-graph></iq-graph>',G+";g.permissions={connect:false,move:false,editRelations:true,deleteRelations:true};g.selection={kind:'edge',id:'e'};")
 need(p.evaluate('()=>{let d=g.data;d.edges[0].label="Новая подпись";return g.preview(d,{kind:"edit"})}'));need(p.evaluate('g.requestCommit()'));need(p.evaluate('g.data.edges[0].label')=='Новая подпись')
 need(p.evaluate('()=>{let d=g.data;d.edges=[];return g.preview(d,{kind:"delete"})}'));need(p.evaluate('g.requestCommit()'))
def disallowed_field():
 setup('<iq-graph></iq-graph>',G+";g.permissions={fields:{title:false},editContent:true};")
 need(p.locator('[data-graph-field=title]').is_disabled());need(p.evaluate('()=>{let d=g.data;d.nodes[0].text="Содержание";return g.preview(d,{kind:"edit"})}'));p.evaluate('g.baseAction("cancel")');need(not p.evaluate('()=>{let d=g.data;d.nodes[0].title="Другое";return g.preview(d,{kind:"edit"})}'))
def crop():
 setup('<iq-image-crop></iq-image-crop>',"""window.c=document.querySelector('iq-image-crop');window.can=document.createElement('canvas');can.width=200;can.height=100;const x=can.getContext('2d');x.fillStyle='rgb(255,0,0)';x.fillRect(0,0,100,100);x.fillStyle='rgb(0,0,255)';x.fillRect(100,0,100,100);window.loaded=new Promise(r=>can.toBlob(async blob=>{await c.load(blob);r()}));""")
 p.evaluate('loaded');p.evaluate('c.value={x:100,y:0,width:100,height:100}')
 color=p.evaluate('''async()=>{let im=await createImageBitmap(await c.export({size:64}));let d=document.createElement('canvas');d.width=d.height=64;let x=d.getContext('2d');x.drawImage(im,0,0);let a=[...x.getImageData(32,32,1,1).data];im.close();return a}''');need(color==[0,0,255,255],color)
 p.evaluate('c.controlled=true;c.addEventListener("iq-crop-request",e=>window.req=e.detail);c.request()');p.wait_for_function('!!window.req');p.evaluate('c.content={title:"Изображение пространства"}');need(p.evaluate('c.pending'));p.locator('[data-crop-action=cancel]').click();need(not p.evaluate('req.accept()'))
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 for d in [False,True]:
  for nested in [False,True]:
   for touch in [False,True]:test(f'Date: {"dark" if d else "light"}/{"dialog" if nested else "standalone"}/{"touch" if touch else "mouse"} and keyboard',lambda d=d,n=nested,t=touch:calendar(d,n,t))
  for state in ['hover','focus']:test(f'Tag remove {d}/{state}',lambda d=d,state=state:tag(d,state))
 for name,fn in [('Pending acceptance invalidated after permission change',pending_rights),('Read denial and independent geometry',read_geometry),('Relation edit/delete independent from create',separate_relations),('Field-specific denial',disallowed_field),('Crop configured copy / real pixels / cancellation',crop)]:test(name,fn)
 b.close()
report={'version':'0.5.7','librarySha256':hashlib.sha256((R/'dist/iquipage.js').read_bytes()).hexdigest(),'runtimeFingerprint':RUNTIME,'cssSha256':hashlib.sha256(CSS.encode()).hexdigest(),'checks':results,'passed':sum(x['passed'] for x in results),'total':len(results),'javascriptErrors':errors,'browser':'Chromium','touch':'Playwright touchscreen.tap with has_touch=true; NOT WebKit/Safari or physical iPhone'};(O/'public-055.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('TOTAL',report['passed'],'/',report['total'])
