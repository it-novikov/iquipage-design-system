from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time,hashlib,os
R=Path(__file__).resolve().parents[1];O=R/'evidence';O.mkdir(exist_ok=True);HTML=(R/'whiteboard.html').read_text();CSS=(R/'dist/iquipage.css').read_text();checks=[];errors=[];page=None
DIST={p.relative_to(R/'dist').as_posix():p.read_bytes() for p in sorted((R/'dist').rglob('*.js'))}
RUNTIME=hashlib.sha256('\n'.join(k+':'+hashlib.sha256(v).hexdigest() for k,v in DIST.items()).encode()).hexdigest()

def need(v,msg='Condition failed'):
 if not v:raise AssertionError(msg)
def wb(js,arg=None):return page.locator('iq-whiteboard').evaluate(js,arg)
def act(id,scope='iq-whiteboard'):page.locator(f'{scope} [data-wb-action="{id}"]:visible').first.click()
def data():return wb('b=>b.data')
def obj(id):return next(o for o in data()['objects'] if o['id']==id)
def edit(id,text):wb('(b,id)=>b.edit(id)',id);page.locator('.wb-inline-input').fill(text);page.wait_for_timeout(40)
def finish():act('finish-edit')
def point(sel):
 e=page.locator(sel);e.scroll_into_view_if_needed();r=e.bounding_box();return(r['x']+r['width']/2,r['y']+r['height']/2)
def drag(a,b):
 ax,ay=point(a);bx,by=point(b);page.mouse.move(ax,ay);page.mouse.down();page.mouse.move(bx,by,steps=14);page.mouse.up();page.wait_for_timeout(60)
def custom_scene():wb('''b=>{b.data={title:'Проверка схемы',objects:[{id:'a',type:'shape',shape:'rectangle',text:'Начало',x:60,y:60,width:230,height:120},{id:'b',type:'shape',shape:'diamond',text:'Достаточно данных?',x:440,y:60,width:270,height:220},{id:'c',type:'shape',shape:'ellipse',text:'Результат',x:830,y:70,width:250,height:150}],connections:[]};b.selection=['a'];b.fit()}''')
def resource(route):
 key=route.request.url.split('/dist/',1)[-1]
 if key in DIST:route.fulfill(body=DIST[key],content_type='text/javascript',headers={'Access-Control-Allow-Origin':'*'})
 else:route.abort()
def fixture(body,setup=''):
 page.set_content('<!doctype html><html lang="ru"><style>'+CSS+'</style><body>'+body+'</body></html>');page.route('https://iq.local/dist/**',resource);page.evaluate('''async()=>{window.api=await import('https://iq.local/dist/iquipage.js');api.registerIquipage()}''')
 if setup:page.evaluate(setup)
 page.wait_for_timeout(60)
def case(name,fn,width=1440,empty=False):
 global page
 page=ctx.new_page();page.set_viewport_size({'width':width,'height':1000 if width>680 else 844});page.set_default_timeout(3500);errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.route('https://**/*',lambda r:r.abort());start=time.perf_counter()
 try:
  if not empty:page.set_content(HTML,wait_until='domcontentloaded');page.wait_for_selector('.wb-stage');page.wait_for_timeout(50)
  fn();need(not errs,'JavaScript errors: '+str(errs));checks.append({'name':name,'passed':True});print('PASS',name,flush=True)
 except Exception as e:
  checks.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e)[:230],flush=True);page.screenshot(path=str(O/f'failed-055-{len(checks)}.png'))
 checks[-1]['milliseconds']=round((time.perf_counter()-start)*1000);errors.extend(errs);page.close()

def composition():
 need(wb('b=>!b.querySelector(".wb-rail")&&!b.querySelector("[data-tool=pen]")&&!b.querySelector("[data-wb-action=list]")'));need(page.locator('.wb-dock [data-tool]').count()==3);page.locator('[data-library-category=shapes]').click();need(page.locator('[data-library-item=shape]').count()==14);page.locator('[data-library-item=shape][data-shape=diamond]').click();need(wb('b=>b.tool==="shape"&&b.shape==="diamond"'));page.locator('.wb-stage').press('Escape');need(wb('b=>b.tool==="select"'))
def note_size():
 before=obj('n3');page.locator('.wb-frame-head [data-id=ideas]').click();page.locator('.wb-inline-input').fill('Привет');finish();new=next(o for o in data()['objects'] if o['text']=='Привет');need(new['width']==before['width'] and new['x']==before['x'] and new['color']==before['color']);need(new['height']<=before['height']+12);need(new['y']>=obj('n4')['y']+obj('n4')['height']+16)
def longtext():
 initial=obj('n1');edit('n1','Нормальная строка с длинным содержанием. '*26);finish();o=obj('n1');need(o['width']==initial['width']);need(200<o['height']<1800);need(obj('n2')['y']>=o['y']+o['height']+16);need(page.locator('[data-object=n1] .wb-object-text').evaluate('e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1'),'Rendered content clips')
def zoom_size():
 edit('n1','Одинаковый текст при любом масштабе. '*6);finish();h=obj('n1')['height']
 for z in [.35,2]:wb('(b,z)=>b.viewport={...b.viewport,zoom:z}',z);edit('n1','Одинаковый текст при любом масштабе. '*6);finish();need(obj('n1')['height']==h)
def markdown():
 edit('n1','Выделенная мысль');page.locator('.wb-inline-input').select_text();page.locator('[data-wb-md=bold]').click();need(page.locator('.wb-inline-input').input_value()=='**Выделенная мысль**');need(page.locator('.wb-md-tools button').count()==17);finish();need(page.locator('[data-object=n1] strong').inner_text()=='Выделенная мысль')
def markdown_height():
 edit('n1','# Большой заголовок\n## Два уровня\n- Первый пункт\n- Второй пункт\n> Цитата');finish();need(page.locator('[data-object=n1] .wb-object-text').evaluate('e=>e.scrollHeight<=e.clientHeight+1'))
def cancel_text():
 old=obj('n1');edit('n1','Новая строка '*25);act('cancel-edit');need(obj('n1')==old);need(not page.locator('.wb-inline-input').count())
def alignments():
 custom_scene()
 for shape in ['rectangle','diamond','ellipse','pill']:
  wb('(b,shape)=>{const d=b.data;d.objects[0].shape=shape;d.objects[0].width=300;d.objects[0].height=240;d.objects[0].minHeight=240;b.data=d}',shape)
  for h in ['left','center','right']:
   for v in ['top','middle','bottom']:
    edit('a','Смысл');page.locator(f'[data-wb-align={h}]').click();page.locator(f'[data-wb-valign={v}]').click();finish();need(obj('a')['align']==h and obj('a')['valign']==v);need(page.locator('[data-object=a] .wb-object-text').evaluate('e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1'))
def shapes():
 custom_scene();need(page.locator('[data-object=b] polygon').count()==1);need(page.locator('[data-object=c] ellipse').count()==1);need(page.locator('[data-object=b] .wb-object-text').evaluate('e=>{let p=e.parentElement.getBoundingClientRect(),t=e.getBoundingClientRect();return Math.abs(t.x+t.width/2-p.x-p.width/2)<1&&Math.abs(t.y+t.height/2-p.y-p.height/2)<1}'))
def connect_clicks():
 custom_scene();page.locator('[data-object=a] [data-port=right]').click();page.locator('[data-object=b] [data-port=left]').click();need(len(data()['connections'])==1);e=data()['connections'][0];need(e['fromPort']=='right' and e['toPort']=='left');act('edge-edit');page.locator('.wb-sheet [name=label]').fill('Данных достаточно');page.locator('.wb-sheet [name=style]').select_option('elbow');page.locator('.wb-sheet [name=direction]').select_option('both');page.locator('.wb-sheet [name=dashed]').check();page.locator('.wb-sheet [type=submit]').click();e=data()['connections'][0];need(e['arrow'] and e['arrowStart'] and e['dashed'] and e['style']=='elbow')
def connect_pointer():
 custom_scene();wb('b=>b.selection=["a","b"]');drag('[data-object=a] [data-port=right]','[data-object=b] [data-port=left]');need(len(data()['connections'])==1)
def reconnect():
 connect_pointer();wb('b=>b.selection=[b.data.connections[0].id]');drag('[data-edge-end=to]','[data-object=c]');need(data()['connections'][0]['to']=='c');act('undo');need(data()['connections'][0]['to']=='b')
def cancel_connection():
 custom_scene();a=point('[data-object=a] [data-port=right]');page.mouse.move(*a);page.mouse.down();page.mouse.move(a[0]+40,a[1]+40,steps=4);page.keyboard.press('Escape');page.mouse.up();need(not data()['connections']);need(wb('b=>!b._edgeDrag&&!b.linkFrame&&!b.linkFrom'))
def reused():
 connect_pointer();wb('b=>{window.edge=b.svg.querySelector("[data-connection]");const n=b.data;for(let i=0;i<40;i++){n.objects[0].x++;b.updateEdges(n)}}');need(wb('b=>window.edge===b.svg.querySelector("[data-connection]")'))
def roundtrip():
 connect_clicks();before=data();wb('b=>b.data=JSON.parse(JSON.stringify(b.data))');need(before==data())
def locked():
 custom_scene();wb('b=>{let d=b.data;d.objects[1].locked=true;b.data=d;b.selection=["b"]}');need(not page.locator('[data-object=b] [data-port]').count());need(not wb('b=>b.connect("a","b")'))
def controlled():
 wb('b=>{b.controlled=true;b.addEventListener("iq-change-request",e=>window.pending=e.detail)}');edit('n1','Ожидает подтверждения');finish();need(wb('b=>!!b.pending'));act('cancel-pending');need(not page.evaluate('pending.accept(pending.value)'));need(obj('n1')['text']!='Ожидает подтверждения')
def external():
 edit('n1','Сохранить при обновлении');wb('b=>{const d=b.data;d.objects[1].text="Внешняя тема";b.data=d}');need(wb('b=>b.conflict.objects.find(o=>o.id==="n1").text==="Сохранить при обновлении"'))
def glyphs():
 edit('n1','Выравниваем');need(page.locator('[data-wb-align] svg[data-glyph=info]').count()==0);need(page.locator('[data-wb-align] svg').count()==3)
def mobile():
 need(page.locator('.wb-library').is_hidden());page.locator('.wb-dock [data-wb-action=library-toggle]').click();need(page.locator('.wb-library').is_visible());page.locator('[data-library-category=shapes]').click();page.locator('[data-library-item=shape][data-shape=ellipse]').click();need(page.locator('.wb-library').is_hidden());page.locator('.wb-stage').press('Escape');page.locator('.wb-header [data-wb-action=quick-note]').click();need(page.locator('.wb-rich-sheet').is_visible());page.locator('.wb-rich-sheet iq-markdown-editor textarea').fill('Мобильная заметка');page.locator('.wb-rich-sheet [name=align]').select_option('right');page.locator('.wb-rich-sheet [name=valign]').select_option('middle');page.locator('.wb-rich-sheet [type=submit]').click();need(any(o['text']=='Мобильная заметка' and o['align']=='right' for o in data()['objects']));need(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
def all_text():
 for id in ['observations','action1','question']:edit(id,'**Редактируемый текст**');finish();need(obj(id)['text']=='**Редактируемый текст**')
def readonly():
 wb('b=>b.readOnly=true');need(page.locator('.wb-header [data-wb-action=quick-note]').is_disabled());need(page.locator('[data-library-item=sticky]').is_disabled());need(not page.locator('.wb-port').count());need(not wb('b=>b.connect("n1","n2")'))
def esm():
 requests=[]
 def serve(route):requests.append(route.request.url);resource(route)
 page.route('https://iq.local/dist/**',serve);page.set_content('<style>'+CSS+'</style>');page.evaluate('''async()=>{window.core=await import('https://iq.local/dist/core.js');core.registerCore();window.ctor=customElements.get('iq-select')}''');need(not any('graph.js' in x or 'roadmap.js' in x or 'image-crop.js' in x or 'whiteboard' in x for x in requests));need(not page.evaluate('!!customElements.get("iq-graph")'));page.evaluate('''async()=>{window.advanced=await import('https://iq.local/dist/advanced.js');advanced.registerAdvanced();advanced.registerAdvanced();window.w=await import('https://iq.local/dist/whiteboard.js');w.registerWhiteboard();const all=await import('https://iq.local/dist/iquipage.js');all.registerIquipage()}''');need(page.evaluate('ctor===customElements.get("iq-select")&&w.IqWhiteboard===customElements.get("iq-whiteboard")'));need(not any('stories' in x or 'app.js' in x or 'sample' in x or 'ui-demo' in x for x in requests));(O/'esm-requests.json').write_text(json.dumps(requests,indent=2))
G='''()=>{window.g=document.querySelector('iq-graph');g.data={revision:1,title:'Карта',nodes:[{id:'a',kind:'task',title:'Текущая задача',text:'Не менять содержание',x:60,y:50,width:260,height:180,domain:{taskId:'SPR-123',extra:true}},{id:'b',kind:'note',title:'СЕКРЕТ',text:'Секретный текст',x:480,y:50,width:260,height:180}],edges:[{id:'e',source:'a',target:'b',kind:'relates',label:'Связь'}]}}'''
def selection():
 fixture('<iq-graph></iq-graph>',G);page.evaluate('g.addEventListener("iq-selection",e=>{(window.selectedEvents||=[]).push(e.detail)})');page.locator('[data-pro-action=view][data-view=list]').click();page.locator('[data-pro-action=select-edge]').click();need(page.evaluate('selectedEvents.length===1&&selectedEvents[0].id==="e"'));page.locator('[data-pro-action=deselect]').click();need(page.evaluate('selectedEvents.length===2&&selectedEvents[1]===null'));page.evaluate('g.selection={kind:"node",id:"a"};g.selection=null');need(page.evaluate('selectedEvents.length===2'))
def rights():
 fixture('<iq-graph></iq-graph>',G);page.evaluate('''g.allowedKinds=['task'];g.kindLabels={task:'Статус'};g.nodePermissions={a:{editContent:false,move:true},b:{read:false,move:true}};g.selection={kind:'node',id:'a'}''');page.wait_for_timeout(60);need(page.locator('[data-graph-field=title]').is_disabled());need(page.locator('[data-graph-field=x]').is_enabled());page.locator('.graph-geometry-section summary').click();page.locator('[data-graph-field=x]').fill('120');page.locator('[data-pro-action=edit-node]').click();need(page.evaluate('g.data.nodes[0].x===120&&g.data.nodes[0].domain.taskId==="SPR-123"&&g.data.nodes[0].text==="Не менять содержание"'));page.evaluate('g.baseAction("cancel");g.selection={kind:"node",id:"b"}');page.wait_for_timeout(30);need('СЕКРЕТ' not in page.locator('iq-graph').inner_text());page.locator('[data-pro-action=view][data-view=list]').click();need('СЕКРЕТ' not in page.locator('iq-graph').inner_text())
def opening():
 fixture('<iq-graph></iq-graph>',G);page.evaluate('g.addEventListener("iq-open",e=>window.opened=e.detail);g.addEventListener("iq-pointer",e=>window.pointer=e.detail)');page.locator('[data-pro-action=open-node][data-node=a]').click();need(page.evaluate('opened.node.domain.taskId==="SPR-123"'));x,y=point('.graph-canvas');page.mouse.move(x,y);page.wait_for_timeout(30);need(page.evaluate('Number.isFinite(pointer.x)&&Number.isFinite(pointer.y)&&pointer.inside'))
def media():
 fixture('<iq-graph></iq-graph>',G);page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d').fillRect(0,0,2,2);const blob=await new Promise(r=>c.toBlob(r));let d=g.data;d.nodes[0].kind='media';d.nodes[0].url='';g.data=d;g.mediaSources=new Map([['a',blob]])}''');page.wait_for_timeout(50);need(page.locator('[data-node-id=a] img').count()==1);need(page.locator('[data-node-id=a] img').get_attribute('src').startswith('blob:'));page.evaluate('g.nodePermissions={a:{read:false,move:true}}');page.wait_for_timeout(40);need(not page.locator('[data-node-id=a] img').count());need(page.evaluate('!g._mediaURLs.size'))
def denied():
 fixture('<iq-graph></iq-graph>',G);page.evaluate('g.permissions={editContent:false,connect:false}');need(not page.evaluate('()=>{const n=g.data;n.nodes[0].text="Подмена";return g.preview(n,{kind:"edit"})}'));need(page.evaluate('g.data.nodes[0].text==="Не менять содержание"'))
def roadmap():
 fixture('<iq-roadmap></iq-roadmap>', '''()=>{window.r=document.querySelector('iq-roadmap');r.data={revision:1,rows:[{id:'a',kind:'task',title:'Родитель',start:'2026-09-10',end:'2026-09-15'},{id:'b',parentId:'a',kind:'task',title:'Дочерняя',start:'2026-09-12',end:'2026-09-16'},{id:'c',parentId:'b',kind:'task',title:'Третий уровень'}],dependencies:[]};r.dependencyCapabilities=false}''');need(page.evaluate('r.data.rows[2].parentId==="b"'));need(not page.evaluate('()=>{const d=r.data;d.dependencies.push({id:"e",from:"a",to:"b",type:"FS",lagDays:0});return r.preview(d,{kind:"dependency"})}'));need(page.evaluate('()=>{const d=r.data;d.rows[0].start="2026-09-09";return r.preview(d,{kind:"date"})}'));page.evaluate('r.baseAction("cancel");r.addEventListener("iq-view-change",e=>window.viewChanged=e.detail)');page.locator('[data-pro-action=next-range]').click();need(page.evaluate('!!viewChanged.range.start'))
def heading():
 fixture('<iq-work-header title="План выпуска и задачи команды" description="Сентябрь"><button slot="actions" class="iq-btn primary">Добавить</button></iq-work-header>');need(page.locator('h1').inner_text()=='План выпуска и задачи команды');page.locator('iq-work-header').evaluate('e=>e.setAttribute("title","Новое название")');need(page.locator('[slot=actions]').count()==1);need(page.locator('iq-work-header').bounding_box()['height']<150)
def crop():
 fixture('<iq-image-crop title="Изображение пространства" eyebrow="ПРОСТРАНСТВО" subtitle="Выберите подходящий кадр"></iq-image-crop>');need(page.locator('.iq-pro-toolbar h3').inner_text()=='Изображение пространства');page.locator('iq-image-crop').evaluate('e=>e.content={title:"Обложка проекта",placeholder:"Добавьте изображение"}');need(page.locator('.iq-pro-toolbar h3').inner_text()=='Обложка проекта')

def frame_header():
 before=obj('observations');child=obj('n1');edit('observations','Большой заголовок области с несколькими строками и пояснением');finish();after=obj('observations');delta=after.get('headerHeight',56)-before.get('headerHeight',56);need(delta>0);need(obj('n1')['y']==child['y']+delta);need(after['width']==before['width']);need(page.locator('[data-object=observations] .wb-object-text').evaluate('e=>e.scrollHeight<=e.clientHeight+1'))
def caption():
 custom_scene();wb("b=>{let d=b.data;d.objects.push({id:'image',type:'image',text:'Подпись',x:50,y:380,width:320,height:232,src:document.createElement('canvas').toDataURL('image/png')});b.data=d;b.fit()}")
 edit('image','**Значимая подпись изображения**, которую важно видеть целиком. '*6);page.locator('[data-wb-align=center]').click();finish();o=obj('image');need(o['width']==320);need(o.get('captionHeight',0)>32);need(page.locator('[data-object=image] .wb-object-text').evaluate('e=>e.scrollHeight<=e.clientHeight+1'))
def alignment_draft():
 edit('n1',obj('n1')['text']);page.locator('[data-wb-align=right]').click();wb('b=>{let d=b.data;d.title="Обновлённая доска";b.data=d}');need(wb('b=>b.conflict?.objects.find(o=>o.id==="n1").align==="right"'))
def dock_keys():
 need(page.locator('.wb-dock button:not(:disabled)[tabindex="0"]').count()==1);e=page.locator('.wb-dock button:not(:disabled)[tabindex="0"]');e.focus();page.keyboard.press('ArrowRight');need(page.locator('.wb-dock button:not(:disabled)[tabindex="0"]').count()==1);need(page.locator('.wb-dock button:not(:disabled)[tabindex="0"]').evaluate('e=>e===document.activeElement'))
def reconnect_source():
 connect_pointer();wb('b=>b.selection=[b.data.connections[0].id]');drag('[data-edge-end=from]','[data-object=c]');need(data()['connections'][0]['from']=='c');page.locator('[data-edge-end=from]').focus();page.keyboard.press('Enter');need(page.locator('.wb-sheet').is_visible());page.locator('.wb-sheet [name=from]').select_option('a');page.locator('.wb-sheet [type=submit]').click();need(data()['connections'][0]['from']=='a')

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);ctx=browser.new_context(accept_downloads=True)
 for name,fn in [('Lower dock and object categories',composition),('Frame note inherits width axis colour',note_size),('Long text and following notes',longtext),('Text size independent of zoom',zoom_size),('Markdown tools',markdown),('Rendered Markdown fits',markdown_height),('Cancel restores exact scene',cancel_text),('4 shapes x 9 alignments',alignments),('Shape geometry',shapes),('Two-click connections and settings',connect_clicks),('Pointer connection',connect_pointer),('Reconnect endpoint and undo',reconnect),('Escape during connection',cancel_connection),('SVG nodes reused in motion',reused),('Connection roundtrip',roundtrip),('Locked ports and connection',locked),('Pending cancel and stale accept',controlled),('External data and text draft',external),('Alignment SVGs',glyphs),('Text frames and actions editing',all_text),('Read-only actions',readonly)]:case(name,fn)
 for name,fn in [('Frame title grows without overlap',frame_header),('Image caption Markdown grows at fixed width',caption),('Alignment-only draft survives external update',alignment_draft),('Dock roving keyboard navigation',dock_keys),('Reconnect source and keyboard exact selection',reconnect_source)]:case(name,fn)
 case('Mobile library and rich editor',mobile,390)
 for name,fn in [('Split ESM imports and shared registry',esm),('Graph selection canvas-list-null',selection),('Graph independent rights',rights),('Domain opening and pointer coordinates',opening),('Authorised Blob and permission release',media),('Forbidden mutation blocked',denied),('Roadmap nesting and capabilities',roadmap),('Compact h1 header',heading),('Crop context',crop)]:case(name,fn,empty=True)
 browser.close()
report={'version':'0.5.7','htmlSha256':hashlib.sha256(HTML.encode()).hexdigest(),'runtimeFingerprint':RUNTIME,'cssSha256':hashlib.sha256(CSS.encode()).hexdigest(),'checks':checks,'passed':sum(c['passed'] for c in checks),'total':len(checks),'javascriptErrors':errors,'environment':'Chromium set_content, actual packaged ESM modules via routing; no server API or physical devices'};(O/'acceptance-055.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('RESULT',report['passed'],'/',report['total'],flush=True)
