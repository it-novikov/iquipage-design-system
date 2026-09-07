"""Whiteboard workshop acceptance on the exact delivered HTML. No external requests.
Use --phase behavior|layout|screens; each report records artifact hashes.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse,json,hashlib,time,os,re
R=Path(__file__).resolve().parents[1];O=R/'evidence';O.mkdir(exist_ok=True)
A=argparse.ArgumentParser();A.add_argument('--phase',default='behavior',choices=['behavior','layout','screens']);A.add_argument('--only',default='');args=A.parse_args()
HTML=(R/'whiteboard.html').read_text();checks=[];errors=[];page=None

def need(ok,msg='Condition failed'):
 if not ok:raise AssertionError(msg)
def wb(js,arg=None):return page.locator('iq-whiteboard').evaluate(js,arg)
def act(key):page.locator(f'iq-whiteboard [data-wb-action="{key}"]:visible').first.click()
def data():return wb('b=>b.data')
def obj(id):return next(o for o in data()['objects'] if o['id']==id)
def point(sel):
 e=page.locator(sel).first;e.scroll_into_view_if_needed();r=e.bounding_box();return(r['x']+r['width']/2,r['y']+r['height']/2)
def drag(a,b):
 x,y=point(a);xx,yy=point(b);page.mouse.move(x,y);page.mouse.down();page.mouse.move(xx,yy,steps=16);page.mouse.up();page.wait_for_timeout(45)
def theme(t):page.evaluate('(t)=>document.documentElement.dataset.theme=t',t)
def scene():
 wb('''b=>{b.data={title:'Проверка связей',objects:[{id:'a',type:'shape',shape:'rectangle',text:'Начало',x:30,y:100,width:220,height:124},{id:'b',type:'shape',shape:'diamond',text:'Решение',x:420,y:40,width:270,height:240},{id:'c',type:'shape',shape:'pill',text:'Результат',x:880,y:90,width:240,height:128}],connections:[]};b.selection=['a'];b.fit()}''')
def edge():
 scene();page.locator('[data-object=a] [data-port=right]').click();page.locator('[data-object=b] [data-port=left]').click();need(len(data()['connections'])==1)
def open_batch():page.locator('.wb-library-batch').click();page.wait_for_selector('.wb-capture-sheet[open]')
def submit_batch():page.locator('.wb-capture-sheet [type=submit]').click();page.wait_for_timeout(35)
def values():return [t for t in page.locator('.wb-capture-row textarea').evaluate_all('es=>es.map(e=>e.value)')]
def test(name,fn,width=1440,t='light',height=None):
 global page
 if args.only and args.only.lower() not in name.lower():return
 page=ctx.new_page();page.set_viewport_size({'width':width,'height':height or (1000 if width>680 else 844)});page.set_default_timeout(3000);page.route('**/*',lambda r:r.abort());local=[];page.on('pageerror',lambda e:local.append(str(e)));start=time.perf_counter()
 try:
  page.set_content(HTML,wait_until='domcontentloaded');page.wait_for_selector('.wb-shell[data-workshop]');page.wait_for_timeout(80);theme(t);fn();need(not local,str(local));checks.append({'name':name,'passed':True});print('PASS',name,flush=True)
 except Exception as e:
  checks.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e)[:340],flush=True)
  fail=O/'diagnostics';fail.mkdir(exist_ok=True);page.screenshot(path=str(fail/f'failed-{args.phase}-{len(checks)}.png'))
 checks[-1].update(width=width,theme=t,milliseconds=round((time.perf_counter()-start)*1000));errors.extend(local);page.close();save()
def save():
 report={'version':'0.5.7','htmlSha256':hashlib.sha256(HTML.encode()).hexdigest(),'cssSha256':hashlib.sha256((R/'dist/iquipage.css').read_bytes()).hexdigest(),'phase':args.phase,'passed':sum(c['passed'] for c in checks),'total':len(checks),'checks':checks,'javascriptErrors':errors,'environment':'Chromium, set_content exact HTML, external requests blocked; not physical devices or server operations'}
 (O/f'workshop-{args.phase}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
def contrast_pair(fg,bg):
 def lum(v):
  s=[float(x)/255 for x in re.findall(r'[\d.]+',v)[:3]];return sum((x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4)*w for x,w in zip(s,[.2126,.7152,.0722]))
 a,b=sorted([lum(fg),lum(bg)]);return(b+.05)/(a+.05)
def tooltip():
 anchor=page.locator('.wb-dock [data-tool=select]');anchor.hover();page.wait_for_timeout(480);tip=page.locator('.wb-overlay-tip');need(tip.is_visible(),'tooltip not visible');need('Выбрать' in tip.inner_text());styles=tip.evaluate('e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,r:e.getBoundingClientRect().toJSON()})');need(contrast_pair(styles['fg'],styles['bg'])>=4.5,str(styles));need(styles['r']['x']>=0 and styles['r']['right']<=1440);need(anchor.get_attribute('aria-describedby')==tip.get_attribute('id'));page.keyboard.press('Escape');need(tip.is_hidden(),'Escape outside board did not dismiss hovered tooltip');need(anchor.get_attribute('aria-describedby') is None,'Stale description association')
def hoverable():
 a=page.locator('.wb-dock [data-tool=hand]');a.hover();page.wait_for_timeout(480);page.locator('.wb-overlay-tip').hover();page.wait_for_timeout(300);need(page.locator('.wb-overlay-tip').is_visible());page.mouse.move(0,0);page.wait_for_timeout(230);need(page.locator('.wb-overlay-tip').is_hidden())
def keyboard_tip():
 page.mouse.move(0,0);a=page.locator('.wb-dock [data-tool=select]');a.focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(30);need(page.locator('.wb-overlay-tip').is_visible());active=page.evaluate('document.activeElement.dataset.tool');page.keyboard.press('Escape');need(page.locator('.wb-overlay-tip').is_hidden());need(page.evaluate('document.activeElement.dataset.tool')==active)
def tooltip_edit():
 wb('b=>b.edit("n1")');page.locator('[data-wb-md=bold]').hover();page.wait_for_timeout(480);need(page.locator('.wb-overlay-tip').is_visible());need(page.locator('[data-wb-md=bold]').evaluate('e=>getComputedStyle(e,"::after").content')=='none');act('finish-edit');need(page.locator('.wb-overlay-tip').is_hidden())
def library():
 need(page.locator('.wb-library-categories button').count()==3);page.locator('[data-library-category=shapes]').click();need(page.locator('[data-library-item=shape]').count()==14);page.locator('.wb-library-search input').fill('данных');need(page.locator('[data-library-item=shape]').count()==1);need(page.locator('[data-library-item=shape]').get_attribute('data-shape')=='database');page.locator('[data-library-item=shape]').click();need(wb('b=>b.shape==="database"&&b.tool==="shape"'));page.locator('.wb-stage').press('Escape');need(wb('b=>b.tool==="select"'))
def empty_search():
 page.locator('.wb-library-search input').fill('Несуществующий объект');need(page.locator('.wb-library-no-results').is_visible());page.locator('[data-library-category=shapes]').click();need(page.locator('[data-library-item=shape]').count()==14)
def library_add():
 page.locator('[data-library-category=shapes]').click();page.locator('[data-shape=database][data-library-item]').click();n=len(data()['objects']);page.locator('.wb-stage').click(position={'x':page.locator('.wb-stage').bounding_box()['width']-30,'y':20});need(len(data()['objects'])==n+1);need(data()['objects'][-1]['shape']=='database');act('cancel-edit')
def library_drag():
 page.locator('[data-library-category=shapes]').click();n=len(data()['objects']);page.locator('[data-library-item][data-shape=hexagon]').drag_to(page.locator('.wb-stage'),target_position={'x':110,'y':140});need(len(data()['objects'])==n+1);need(data()['objects'][-1]['shape']=='hexagon');act('cancel-edit')
def dock_geometry():
 info=page.locator('.wb-dock button').evaluate_all('es=>es.map(b=>{let a=b.getBoundingClientRect(),i=b.querySelector("svg").getBoundingClientRect();return {w:i.width,h:i.height,dx:Math.abs(i.x+i.width/2-a.x-a.width/2),dy:Math.abs(i.y+i.height/2-a.y-a.height/2)}})');need(all(i['w']==20 and i['h']==20 and i['dx']<1 and i['dy']<1 for i in info),str(info));need(page.locator('[data-tool=pen]').count()==0);need(page.locator('[data-wb-action=list]').count()==0)
def batch_area():
 old=obj('n3');n=len(data()['objects']);open_batch();page.locator('.wb-capture-sheet .iq-select-trigger').click();page.locator('.wb-capture-sheet [role=option][data-value=ideas]').click();need(page.locator('.wb-capture-sheet iq-select').evaluate('e=>e.value')=='ideas');page.locator('.wb-capture-row textarea').nth(0).fill('Первый абзац\n\nВторой абзац');page.locator('.wb-capture-row textarea').nth(1).fill('Вторая мысль');submit_batch();added=data()['objects'][n:];need(len(added)==2);need(added[0]['text']=='Первый абзац\n\nВторой абзац');need(all(o['parentId']=='ideas' and o['width']==old['width'] and o['x']==old['x'] for o in added));act('undo');need(len(data()['objects'])==n);act('redo');need(len(data()['objects'])==n+2)
def batch_keyboard():
 open_batch();el=page.locator('.wb-capture-row textarea');el.nth(0).fill('Одна');el.nth(0).press('Shift+Enter');el.nth(0).press('End');el.nth(0).press('Enter');need(el.nth(1).evaluate('e=>e===document.activeElement'));el.nth(1).fill('Два');page.locator('[data-capture-up="1"]').click();need(values()[0]=='Два');page.locator('[data-capture-remove="1"]').click();need(values()==['Два','']);page.locator('.wb-sheet [data-sheet-close]').last.click();open_batch();need(values()==['Два',''])
def batch_import():
 open_batch();page.locator('.wb-capture-import summary').click();page.locator('[name=importText]').fill('Одна мысль\nДве строки в ней\n\nДругая мысль');page.locator('[name=split]').select_option('paragraph');page.locator('[data-capture-split]').click();need(values()==['Одна мысль\nДве строки в ней','Другая мысль']);submit_batch();need(data()['objects'][-2]['text']=='Одна мысль\nДве строки в ней')
def batch_limits():
 open_batch();need(page.locator('.wb-capture-sheet [type=submit]').is_disabled());need('Добавить заметки' in page.locator('.wb-capture-sheet [type=submit]').inner_text());page.locator('.wb-capture-import summary').click();page.locator('[name=importText]').fill('\n'.join(['Мысль']*101));page.locator('[data-capture-split]').click();need('До 100' in page.locator('.wb-capture-summary').inner_text());need(len(values())==3)
def batch_controlled():
 wb('b=>{b.controlled=true;b.addEventListener("iq-change-request",e=>window.req=e.detail)}');open_batch();page.locator('.wb-capture-row textarea').first.fill('Не потерять');submit_batch();need(wb('b=>!!b.pending'));page.evaluate('req.reject("Нет доступа")');open_batch();need(values()[0]=='Не потерять');submit_batch();act('cancel-pending');need(not page.evaluate('req.accept(req.value)'));need(not any(n['text']=='Не потерять' for n in data()['objects']))
def batch_markup():
 open_batch();page.locator('.wb-capture-row textarea').first.fill('# Заголовок\n\n'+'Длинная, но нормальная строка. '*25);submit_batch();n=data()['objects'][-1];need(page.locator(f'[data-object="{n["id"]}"] .wb-object-text').evaluate('e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1'),'batch Markdown clips')
def batch_mobile():
 act('library-toggle');page.locator('.wb-library-batch').click();page.locator('.wb-capture-row textarea').first.fill('Идея с телефона');page.locator('.wb-capture-sheet .iq-select-trigger').click();page.locator('.wb-capture-sheet [data-value=ideas]').click();submit_batch();need(data()['objects'][-1]['parentId']=='ideas');need(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
def capture_autogrow():
 open_batch();f=page.locator('.wb-capture-row textarea').first;f.fill('Мысль с абзацем, который можно читать целиком. '*5);need(f.evaluate('e=>e.scrollHeight<=e.clientHeight+1'), 'Medium text should grow rather than clip');need(f.bounding_box()['height']>52);f.fill('Строка\n'*80);need(f.bounding_box()['height']<=225);need(f.evaluate('e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==="auto"'));f.fill('Коротко');need(f.bounding_box()['height']<80);need(page.locator('.wb-capture-summary').inner_text().startswith('1 карточка.'))
def edge_label():
 edge();act('edge-label');page.locator('.wb-sheet [name=label]').fill('Данные проверены');page.locator('.wb-sheet [type=submit]').click();need(page.locator('.wb-connection-label text').text_content()=='Данные проверены');page.locator('[data-edge-style=curve]').click();need(data()['connections'][0]['style']=='curve');act('edge-edit');page.locator('.wb-sheet [name=direction]').select_option('both');page.locator('.wb-sheet [name=dashed]').check();page.locator('.wb-sheet [type=submit]').click();e=data()['connections'][0];need(e['arrowStart'] and e['arrow'] and e['dashed'])
def reconnect_to():
 edge();drag('[data-edge-end=to]','[data-object=c]');need(data()['connections'][0]['to']=='c');act('undo');need(data()['connections'][0]['to']=='b')
def reconnect_from():
 edge();drag('[data-edge-end=from]','[data-object=c]');need(data()['connections'][0]['from']=='c');act('undo');need(data()['connections'][0]['from']=='a')
def connect_drag():
 scene();wb('b=>b.selection=["a","b"]');drag('[data-object=a] [data-port=right]','[data-object=b] [data-port=left]');need(len(data()['connections'])==1)
def connect_keyboard():
 scene();page.locator('[data-object=a] [data-port=right]').focus();page.keyboard.press('Enter');page.locator('[data-object=b] [data-port=left]').focus();page.keyboard.press('Enter');need(len(data()['connections'])==1)
def reconnect_keyboard():
 edge();page.locator('[data-edge-end=to]').focus();page.keyboard.press('Enter');page.locator('.wb-sheet [name=to]').select_option('c');page.locator('.wb-sheet [type=submit]').click();need(data()['connections'][0]['to']=='c')
def connect_cancel():
 scene();x,y=point('[data-object=a] [data-port=right]');page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+60,y+60,steps=6);page.keyboard.press('Escape');page.mouse.up();need(not data()['connections']);need(wb('b=>!b._edgeDrag&&!b.linkFrame&&!b.svg.querySelector("[data-link-preview]")'))
def edge_roundtrip():
 edge_label();before=data();wb('b=>b.data=JSON.parse(JSON.stringify(b.data))');need(data()==before);need(page.locator('.wb-connection-label text').text_content()=='Данные проверены')
def svg_reuse():
 edge();need(wb('''b=>{let el=b.svg.querySelector('[data-connection]'),p=el.querySelector('.wb-edge-line'),d=b.data;for(let i=0;i<12;i++){d.objects[0].x+=2;b.updateEdges(d)}return p===b.svg.querySelector('.wb-edge-line')&&el===b.svg.querySelector('[data-connection]')}'''))
def zoom_handles():
 edge()
 for z in [.4,1,2]:
  wb('(b,z)=>b.viewport={x:50,y:40,zoom:z}',z);need(abs(page.locator('[data-edge-end=from]').bounding_box()['width']-18)<.3);need(abs(page.locator('[data-object=a] [data-port=right]').bounding_box()['width']-28)<1)
def edge_denied():
 scene();wb('b=>{const d=b.data;d.objects[1].locked=true;b.data=d}');need(not wb('b=>b.connect("a","b")'));wb('b=>b.readOnly=true');need(not wb('b=>b.connect("a","c")'));need(not data()['connections'])
def shape_text():
 scene()
 for kind in ['rectangle','diamond','pill','ellipse','parallelogram','database','document','predefined','manual','trapezoid','hexagon','delay','connector','offpage']:
  wb('(b,k)=>{let d=b.data;d.objects[0].shape=k;d.objects[0].width=300;d.objects[0].height=250;d.objects[0].minHeight=250;b.data=d;b.edit("a")}',kind);page.locator('.wb-inline-input').fill('**Проверка**\nДве строки');page.locator('[data-wb-align=center]').click();page.locator('[data-wb-valign=middle]').click();act('finish-edit');el=page.locator('[data-object=a] .wb-object-text');need(el.evaluate('e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1'),kind);need(el.locator('strong').text_content()=='Проверка')
def chain():
 page.locator('[data-scenario=chain]').click();need(not any(n['type']=='frame' for n in data()['objects']));need(len(data()['connections'])==5);need('predefined' in [n.get('shape') for n in data()['objects']]);need(page.locator('.wb-links .wb-edge-line').count()==5)
def note_growth():
 old=obj('n3');page.locator('[data-wb-action=area-note][data-id=ideas]').click();page.locator('.wb-inline-input').fill('Привет');act('finish-edit');n=data()['objects'][-1];need(n['width']==old['width'] and n['x']==old['x']);wb('(b,id)=>b.edit(id)',n['id']);page.locator('.wb-inline-input').fill('Сохраняем разумную ширину текста. '*30);act('finish-edit');need(obj(n['id'])['width']==n['width']);need(obj(n['id'])['height']<2000)
def tooltip_fullscreen():
 act('fullscreen');tooltip();need(page.locator('.wb-fullscreen').evaluate('e=>e.open'));page.keyboard.press('Escape');need(not page.locator('.wb-fullscreen').evaluate('e=>e.open'))
def geometry():
 need(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'document overflow')
 if page.locator('.wb-library').is_visible():
  need(page.locator('.wb-library-categories').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),'category overflow');need(page.locator('.wb-library-categories button').evaluate_all('es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)'),'button clips');need(page.locator('.wb-library').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),'library overflow')
 need(page.locator('.wb-dock').evaluate('e=>e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=innerWidth+1'),'dock offscreen')

def layout_case(mode):
 if mode=='shapes':
  if page.locator('.wb-library').is_hidden():act('library-toggle')
  page.locator('[data-library-category=shapes]').click()
 elif mode=='batch':
  if page.locator('.wb-library').is_hidden():act('library-toggle')
  open_batch();page.locator('.wb-capture-row textarea').first.fill('Длинная мысль для проверки. '*8);need(page.locator('.wb-sheet').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),'sheet overflow')
 elif mode in ['diagram','chain']:page.locator('[data-scenario='+mode+']').click()
 elif mode=='editor':
  act('quick-note');el=page.locator('.wb-inline-input') if page.locator('.wb-inline-input').count() else page.locator('.wb-rich-sheet textarea');el.fill('Текст с достаточной длиной для проверки переноса. '*6)
 elif mode=='edge':edge_label()
 elif mode=='readonly':wb('b=>b.readOnly=true')
 geometry()

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);ctx=browser.new_context(accept_downloads=True)
 if args.phase=='behavior':
  cases=[('Light tooltip: readable, described, Escape',tooltip,1440,'light'),('Dark tooltip: readable, described, Escape',tooltip,1440,'dark'),('Tooltip remains hoverable',hoverable,1440,'light'),('Keyboard tooltip does not steal focus',keyboard_tip,1440,'dark'),('Editor uses one tooltip, removed after action',tooltip_edit,1440,'dark'),('Full-screen tooltip and Escape layers',tooltip_fullscreen,1440,'dark'),('Library categories, 14 shapes and search',library,1440,'light'),('Library empty result and category reset',empty_search,1440,'dark'),('Shape creation by choosing and clicking',library_add,1440,'light'),('Shape creation by library drag',library_drag,1440,'dark'),('Dock SVG centred; no pencil or List',dock_geometry,1440,'light'),('Batch target area, multiline text and atomic undo',batch_area,1440,'light'),('Batch keyboard, reorder, delete and draft restore',batch_keyboard,1440,'dark'),('Explicit text import preserves paragraphs',batch_import,1440,'light'),('Batch empty and limit validation',batch_limits,1440,'dark'),('Capture paragraphs grow, then scroll at a bounded height',capture_autogrow,1440,'light'),('Batch denial, cancel and stale response',batch_controlled,1440,'light'),('Batch Markdown measured before placement',batch_markup,1440,'light'),('Batch mobile target and submit',batch_mobile,390,'dark'),('Connection label, style and directions',edge_label,1440,'dark'),('Reconnect target and undo',reconnect_to,1440,'light'),('Reconnect source and undo',reconnect_from,1440,'dark'),('Connect by dragging',connect_drag,1440,'light'),('Connect by keyboard',connect_keyboard,1440,'dark'),('Reconnect by exact keyboard form',reconnect_keyboard,1440,'light'),('Cancel connector with Escape',connect_cancel,1440,'dark'),('Connections survive document roundtrip',edge_roundtrip,1440,'light'),('Stable SVG nodes during movement',svg_reuse,1440,'dark'),('Handle dimensions independent of zoom',zoom_handles,1440,'light'),('Connections respect lock and readonly',edge_denied,1440,'dark'),('All 14 shapes: Markdown and centred content',shape_text,1440,'light'),('Functional chain without enclosing frame',chain,1440,'dark'),('New note inherits width; content does not narrow it',note_growth,1440,'light')]
  for name,fn,width,t in cases:test(name,fn,width,t)
 elif args.phase=='layout':
  for width in [320,390,768,1024,1280,1440]:
   for t in ['light','dark']:
    for m in ['ready','shapes','batch','diagram','chain','editor','readonly']:
     test(f'{m} {width} {t}',lambda m=m:layout_case(m),width,t)
 elif args.phase=='screens':
  captures=[];out=O/'screenshots';out.mkdir(exist_ok=True)
  for mode,width,t in [('ready',1440,'light'),('ready',1440,'dark'),('shapes',1440,'light'),('shapes',390,'dark'),('batch',1440,'light'),('batch',390,'dark'),('diagram',1440,'dark'),('chain',1440,'light'),('chain',390,'dark'),('editor',1440,'dark'),('editor',390,'light'),('edge',1440,'dark'),('ready',320,'light')]:
   def shot(mode=mode,width=width,t=t):
    layout_case(mode);page.wait_for_timeout(100);file=f'{mode}-{t}-{width}.png';page.screenshot(path=str(out/file),full_page=False);captures.append({'file':'evidence/screenshots/'+file,'sha256':hashlib.sha256((out/file).read_bytes()).hexdigest(),'mode':mode,'width':width,'theme':t})
   test(f'{mode} {width} {t}',shot,width,t)
  (O/'screenshots-057.json').write_text(json.dumps({'version':'0.5.7','htmlSha256':hashlib.sha256(HTML.encode()).hexdigest(),'captures':captures},ensure_ascii=False,indent=2))
 browser.close()
print('RESULT',sum(c['passed'] for c in checks),'/',len(checks),flush=True)
if any(not c['passed'] for c in checks):raise SystemExit(1)
