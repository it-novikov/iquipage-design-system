"""Reproducible checks for 05.6. Local files injected; no network / fake API.
200%: CSS zoom=2 plus separate equivalent 640/720 CSS-pixel reflow cases.
This is NOT an assertion of native Safari/browser-toolbar zoom conformance.
"""
from pathlib import Path
import os,sys,json,hashlib,argparse,time,re
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];E=R/'evidence';E.mkdir(exist_ok=True);(E/'screenshots').mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['behavior','layout','screens'],default='behavior');args=parser.parse_args()
CSS=(R/'dist/iquipage.css').read_text();HTML=(R/'workbench.html').read_text();checks=[];errors=[];captures=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def require(v,m):
 if not v:raise AssertionError(m)
def test(name,fn):
 try:d=fn();checks.append({'name':name,'passed':True,'detail':d});print('PASS',name,flush=True)
 except Exception as e:checks.append({'name':name,'passed':False,'detail':str(e)});print('FAIL',name,str(e),flush=True)
def theme(p,t):
 if p.locator('#daily-theme').count():
  if p.evaluate('document.documentElement.dataset.theme')!=t:p.locator('#daily-theme').click()
 else:p.evaluate('(t)=>document.documentElement.dataset.theme=t',t)
def top(p):p.evaluate('window.scrollTo(0,0)')
def init(p):
 p.route('**/*',lambda r:r.abort());p.on('pageerror',lambda e:errors.append(str(e)));p.set_content(HTML,wait_until='domcontentloaded');p.wait_for_function('!!customElements.get("iq-work-layout")');p.wait_for_timeout(80)
def load_core(p):
 p.on('pageerror',lambda e:errors.append(str(e)))
 def route(rt):
  url=rt.request.url
  if '/dist/' in url:
   path=R/'dist'/url.split('/dist/',1)[1]
   if path.is_file():rt.fulfill(body=path.read_text(),content_type='text/javascript',headers={'Access-Control-Allow-Origin':'*'});return
  rt.abort()
 p.route('**/*',route);p.set_content('<html lang="ru"><head><style>'+CSS+'</style></head><body><main id="fixture" style="padding:24px;max-width:900px"></main></body></html>')
 p.evaluate('''async()=>{window.core=await import('https://iq.test/dist/core.js');core.registerCore();core.registerCore();}''')
def cap(p,name):
 top(p);p.wait_for_timeout(120);path=E/'screenshots'/(name+'.png');p.screenshot(path=str(path),full_page=False);captures.append({'file':'screenshots/'+path.name,'sha256':sha(path),'artifact':'workbench.html','htmlSha256':sha(R/'workbench.html')})
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);p=b.new_page(viewport={'width':1280,'height':720});p.set_default_timeout(4000);init(p)
 if args.phase=='behavior':
  q=b.new_page(viewport={'width':780,'height':760});q.set_default_timeout(4000);loaded=[];q.on('request',lambda r:loaded.append(r.url));load_core(q)
  def core_contract():
   x=q.evaluate('''()=>({version:core.version,layout:!!customElements.get('iq-work-layout'),viewer:!!customElements.get('iq-markdown-viewer'),graph:!!customElements.get('iq-graph'),whiteboard:!!customElements.get('iq-whiteboard')})''');require(x=={'version':'0.5.7','layout':True,'viewer':True,'graph':False,'whiteboard':False},str(x));require(not any('/everyday-stories.js' in u or '/graph.js' in u or '/whiteboard.js' in u for u in loaded),str(loaded));return x
  test('Core imports new public components without advanced/demo/whiteboard; registration idempotent',core_contract)
  sample='# Проверка\n\n**Результат** и *вывод*.\n\n- Один\n- Два\n  - Вложенный\n\n| A | B |\n|---|---|\n|1|2|\n\n```js\nconst value = "'+('abcdef'*90)+'";\n```\n\n[Документ](https://example.com/docs)\n\n![Фото](https://example.com/private.jpg)'
  for t in ['light','dark']:
   theme(q,t)
   def viewer(s=sample):
    q.evaluate('''s=>{const f=document.querySelector('#fixture');f.replaceChildren();window.v=document.createElement('iq-markdown-viewer');v.value=s;v.setAttribute('label','Отчёт агента');window.ed=document.createElement('iq-markdown-editor');ed.value=s;f.append(v,ed);ed.preview();}''',s)
    x=q.evaluate('''()=>({equal:v.querySelector('article').innerHTML===ed.querySelector('.md-preview').innerHTML,chrome:v.querySelectorAll('button,textarea,input,[contenteditable],footer,[role=toolbar]').length,h2:v.querySelectorAll('h2').length,table:v.querySelectorAll('table').length,lists:v.querySelectorAll('ul').length})''');require(x['equal'] and x['chrome']==0 and x['h2']==1 and x['table']==1 and x['lists']==2,str(x));return x
   test(t+': editor preview and viewer use identical safe markup with no viewer editor chrome',viewer)
   def typography():
    x=q.evaluate('''()=>['h2','p','li','code','th','td'].map(sel=>{const a=getComputedStyle(v.querySelector(sel)),b=getComputedStyle(ed.querySelector('.md-preview').querySelector(sel));return {sel,equal:['fontSize','fontFamily','fontWeight','lineHeight','color'].every(k=>a[k]===b[k])}})''');require(all(r['equal'] for r in x),str(x));return x
   test(t+': rendered typography identical',typography)
   def no_events():
    x=q.evaluate('''()=>{let n=0;for(const k of ['iq-change','iq-submit','iq-commit','iq-accept'])v.addEventListener(k,()=>n++);v.value='# Новый отчёт';v.value='# Новый отчёт';return {n,text:v.textContent,article:v.querySelector('article').getAttribute('aria-label')}}''');require(x=={'n':0,'text':'Новый отчёт','article':'Отчёт агента'},str(x));return x
   test(t+': reading has no accept/submit/change side effects',no_events)
   def empty():
    x=q.evaluate('''()=>{v.value='';const a=v.textContent;v.setAttribute('empty-text','Нет отчёта');const b=v.textContent;v.headingLevel=3;v.value='# После загрузки';return {a,b,h:!!v.querySelector('h3')}}''');require(x=={'a':'Пока нет содержимого.','b':'Нет отчёта','h':True},str(x));return x
   test(t+': empty value, custom message, reactive heading level',empty)
   def limits():
    x=q.evaluate('''()=>{v.value='x'.repeat(1000001);const alerted=v.querySelector('[role=alert]')?.textContent;v.value='Возврат';return {alerted,recovered:v.textContent}}''');require(bool(x['alerted']) and x['recovered']=='Возврат',str(x));return x
   test(t+': oversized document fails explicitly and can recover',limits)
  requests=[];q.on('request',lambda rt:requests.append(rt.url))
  def security():
   dangerous='''<script>window.IQ_ATTACK=1</script>\n<img src="https://private.test/x" onerror="window.IQ_ATTACK=2">\n<svg onload="window.IQ_ATTACK=3"></svg>\n\n[bad](javascript:alert(1)) [data](data:text/html,test) [local](file:///etc/passwd) [good](https://example.com)\n\n![secret](https://private.test/avatar.png)\n\n| Raw | X |\n| --- | --- |\n| <img src=x onerror=alert(1)> | [bad](javascript:x) |'''
   q.evaluate('(s)=>{v.value=s;ed.value=s;ed.preview();ed.preview()}',dangerous);q.wait_for_timeout(150)
   x=q.evaluate('''()=>({attack:!!window.IQ_ATTACK,bad:v.querySelectorAll('script,img,svg,iframe,object,embed,video,audio,style,[onerror]').length,links:[...v.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),rel:a.rel}))})''');require(not x['attack'] and x['bad']==0 and len(x['links'])==2 and all(r['href'].startswith('https://') for r in x['links']),str(x));require(requests==[],str(requests));return {**x,'automaticRequests':len(requests)}
  test('Injection, dangerous schemes and automatic image requests blocked in viewer AND preview',security)
  def overflow_keys():
   q.set_viewport_size({'width':390,'height':844});q.evaluate('(s)=>{v.value=s;ed.hidden=true}',sample)
   q.locator('iq-markdown-viewer pre').focus();before=q.locator('iq-markdown-viewer pre').evaluate('e=>e.scrollLeft');q.keyboard.press('ArrowRight');q.wait_for_timeout(140);after=q.locator('iq-markdown-viewer pre').evaluate('e=>e.scrollLeft')
   x=q.evaluate('''()=>({wide:v.querySelector('pre').scrollWidth>v.querySelector('pre').clientWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,table:v.querySelector('.md-table-scroll').tabIndex,pre:v.querySelector('pre').tabIndex})''');require(x['wide'] and not x['overflow'] and after>before and x['table']==0 and x['pre']==0,str(x));q.locator('iq-markdown-viewer a').first.focus();require(q.locator('iq-markdown-viewer a').first.evaluate('e=>e===document.activeElement'),'link not keyboard focusable');return {**x,'keyboardScroll':after}
  test('Wide code/table contained; actual keyboard scroll and link focus',overflow_keys)
  def wrap():
   x=q.evaluate('''()=>{v.setAttribute('code-wrap','');return {white:getComputedStyle(v.querySelector('pre')).whiteSpace,width:v.querySelector('pre').scrollWidth,box:v.querySelector('pre').clientWidth}}''');require(x['white']=='pre-wrap' and x['width']<=x['box']+1,str(x));return x
  test('Optional code-wrap reflows without removing data',wrap)
  for t in ['light','dark']:
   theme(p,t);p.locator('#daily-work').click();p.set_viewport_size({'width':1280,'height':720})
   def density_identity():
    inp=p.locator('[data-e-search]');inp.fill('проверить');inp.focus()
    x=p.evaluate('''()=>{const input=document.activeElement,l=document.querySelector('iq-work-layout'),h=document.querySelector('iq-work-header h1'),action=document.querySelector('[data-e=create]');l.density='comfortable';const larger=h.getBoundingClientRect().height;l.density='compact';return {focus:document.activeElement===input,input:input.isConnected,value:input.value,action:action===document.querySelector('[data-e=create]'),larger,smaller:h.getBoundingClientRect().height}}''');require(x['focus'] and x['input'] and x['action'] and x['value']=='проверить' and x['larger']>x['smaller'],str(x));inp.fill('');return x
   test(t+': density changes rhythm but preserves node identity, focus and input value',density_identity)
   def searchfilter():
    p.locator('[data-e=filter]').click();require(p.locator('[data-work-row]').count()==4,'filter');p.locator('[data-e=filter]').click();p.locator('[data-e-search]').fill('неттакого');require(p.locator('.daily-empty').is_visible(),'empty missing');p.locator('[data-e-search]').fill('');return 'filter and reset retain full list'
   test(t+': data controls functional, including empty search',searchfilter)
   def create():
    n=p.locator('[data-work-row]').count();p.locator('[data-e=create]').click();p.locator('.daily-dialog-slot input').fill('Проверить компактный экран');p.locator('.daily-dialog-slot button[type=submit]').click();require(p.locator('[data-work-row]').count()==n+1,'new record missing');require('Проверить компактный экран' in p.locator('[data-work-row]').first.inner_text(),'wrong row');return n+1
   test(t+': main action opens supplied dialog and adds real local record',create)
   def viewrow():
    p.locator('.iq-work-open').first.click();v=p.locator('.daily-dialog-slot iq-markdown-viewer');require(v.is_visible(),'reader missing');require(v.locator('button,textarea,footer').count()==0,'editor chrome');require('не принимает результат' in p.locator('.daily-dialog-slot').inner_text(),'missing boundary');p.locator('.daily-dialog-slot [data-close]').last.click();return 'read-only supplied dialog'
   test(t+': row opens reader without editing or acceptance action',viewrow)
   def sticky():
    p.evaluate('window.scrollTo(0,650)');box=p.locator('iq-work-header').bounding_box();act=p.locator('[data-e=create]').bounding_box();require(box['y']>=-1 and act['y']>=0 and act['y']+act['height']<720,str((box,act)));top(p);return {'headerTop':box['y'],'actionTop':act['y']}
   test(t+': current project and primary action stay visible on desktop scroll',sticky)
  def empty_slots():
   x=q.evaluate('''()=>{const l=document.createElement('iq-work-layout');l.density='compact';l.innerHTML='<iq-work-header slot="header" title="Проект"></iq-work-header><div>Содержание</div>';document.querySelector('#fixture').replaceChildren(l);l.syncSlots();const parts=[...l.shadowRoot.querySelectorAll('.part')];return parts.filter(p=>!p.hidden).map(p=>p.dataset.part)}''');require(x==['header','content'],str(x));return x
  test('Missing optional slots do not reserve blank bands',empty_slots)
  def slot_late():
   x=q.evaluate('''async()=>{const l=document.querySelector('iq-work-layout'),b=document.createElement('button');b.slot='toolbar';b.textContent='Фильтр';l.append(b);await new Promise(r=>setTimeout(r,20));const shown=!l.shadowRoot.querySelector('.toolbar').hidden;b.remove();await new Promise(r=>setTimeout(r,20));return {shown,hidden:l.shadowRoot.querySelector('.toolbar').hidden}}''');require(all(x.values()),str(x));return x
  test('Dynamic toolbar slot adds/removes without leaving a blank separator',slot_late)
  q.close()
 elif args.phase=='layout':
  for width,height in [(1280,720),(1440,900),(390,844)]:
   p.set_viewport_size({'width':width,'height':height})
   for t in ['light','dark']:
    theme(p,t)
    for density in ['compact','comfortable']:
     for long in [False,True]:
      p.evaluate('''({d,l})=>{document.querySelector('iq-work-layout').density=d;document.querySelector('iq-work-header').setAttribute('title',l?'Подготовка международного запуска новой коллекции и проверка ключевых сценариев совместной работы':'Выпуск 2.5')}''',{'d':density,'l':long})
      for section in ['tasks','ideas','plan','releases','admin']:
       p.locator(f'[data-e=section][data-kind={section}]').click();p.wait_for_timeout(60);top(p)
       def case():
        x=p.evaluate('''()=>{const plan=!!document.querySelector('iq-everyday-demo iq-roadmap'),rows=[...document.querySelectorAll(plan?(innerWidth<720?'.rm-agenda-row':'.rm-row'):'[data-work-row]')].filter(e=>e.getBoundingClientRect().height),rect=rows[0]?.getBoundingClientRect(),heading=document.querySelector('iq-work-header h1'),action=document.querySelector('[data-e=create]').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,first:rect?{y:rect.top,bottom:rect.bottom}:null,fullRows:rows.filter(e=>e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().bottom<=innerHeight).length,h1:heading.textContent,clipped:heading.scrollHeight>heading.clientHeight+1,actionVisible:action.top>=0&&action.bottom<=innerHeight}}''')
        require(not x['overflow'] and not x['clipped'],str(x))
        if density=='compact':
         require(x['actionVisible'],str(x))
         if section!='plan':require(x['fullRows']>=(3 if width>=1000 else 1),str(x))
         elif width>=1000:require(x['fullRows']>=2,str(x))
         else:require(x['first'] and x['first']['y']<height,str(x))
        return x
       test(f'{section}/{width}x{height}/{t}/{density}/long={long}',case)
  # Source-matched preview/viewer + 200% scaling and equivalent browser-zoom reflow.
  p.locator('#daily-read').click()
  for width,height in [(1280,720),(1440,900),(390,844),(640,360),(720,450),(320,640)]:
   p.set_viewport_size({'width':width,'height':height})
   for t in ['light','dark']:
    theme(p,t)
    for mode in ['viewer','preview']:
     p.locator('[data-read-mode='+mode+']').click();top(p)
     for zoom in [1,2] if width>=1280 else [1]:
      p.evaluate('(z)=>document.documentElement.style.zoom=String(z)',zoom)
      def read_case():
       x=p.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,nonempty:!!document.querySelector('iq-markdown-viewer table'),codeScroll:[...document.querySelectorAll('pre.md-code-scroll')].filter(e=>e.getBoundingClientRect().width).map(e=>({client:e.clientWidth,scroll:e.scrollWidth})),h1:[...document.querySelectorAll('h1')].filter(e=>e.getBoundingClientRect().height).length})''');require(not x['overflow'] and x['nonempty'] and x['h1']==1,str(x));return x
      test(f'reading/{width}/{t}/{mode}/CSSzoom={zoom}',read_case)
     p.evaluate("document.documentElement.style.zoom='1'")
  p.locator('#daily-work').click();p.evaluate("document.querySelector('iq-work-layout').density='compact'");p.locator('[data-kind=tasks]').click()
  for width,height,zoom in [(1280,720,2),(1440,900,2),(640,360,1),(720,450,1),(390,844,1),(320,640,1)]:
   p.set_viewport_size({'width':width,'height':height});p.evaluate('(z)=>document.documentElement.style.zoom=String(z)',zoom);top(p)
   for t in ['light','dark']:
    theme(p,t)
    def zoom_case():
     x=p.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,title:document.querySelector('iq-work-header h1').textContent,clipped:document.querySelector('iq-work-header h1').scrollHeight>document.querySelector('iq-work-header h1').clientHeight+1,rows:document.querySelectorAll('[data-work-row]').length})''');require(not x['overflow'] and not x['clipped'] and x['rows']>0,str(x));return x
    test(f'workspace reflow/{width}/{t}/CSSzoom={zoom}',zoom_case)
   p.evaluate("document.documentElement.style.zoom='1'")
 elif args.phase=='screens':
  for w,h in [(1280,720),(1440,900),(390,844)]:
   p.set_viewport_size({'width':w,'height':h})
   for t in ['light','dark']:
    theme(p,t);p.locator('#daily-work').click();p.locator('[data-kind=tasks]').click();p.locator('iq-work-header').evaluate('(e,v)=>e.setAttribute("title",v)','Выпуск 2.5');cap(p,f'work-{t}-{w}')
    if w==390:p.locator('iq-work-header').evaluate('(e,v)=>e.setAttribute("title",v)','Подготовка международного запуска новой коллекции и проверка ключевых сценариев совместной работы');cap(p,f'work-long-{t}-{w}');p.locator('iq-work-header').evaluate('(e,v)=>e.setAttribute("title",v)','Выпуск 2.5')
    p.locator('[data-kind=plan]').click();cap(p,f'plan-{t}-{w}')
    p.locator('#daily-read').click();cap(p,f'reader-{t}-{w}')
  checks.append({'name':'screenshots saved','passed':True,'detail':len(captures)})
 b.close()
result={'version':'0.5.7','htmlSha256':sha(R/'workbench.html'),'catalogSha256':sha(R/'index.html'),'cssSha256':sha(R/'dist/iquipage.css'),'phase':args.phase,'total':len(checks),'passed':sum(x['passed'] for x in checks),'javascriptErrors':errors,'checks':checks,'method':'Chromium / injected local HTML / no external network; CSS zoom and equivalent viewport reflow, not native browser-toolbar zoom'}
(E/f'everyday-{args.phase}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
if captures:(E/'screenshots-056.json').write_text(json.dumps({'version':'0.5.7','captures':captures,'total':len(captures)},ensure_ascii=False,indent=2)+'\n')
print('RESULT',result['passed'],'/',result['total'],'JS errors',errors,flush=True)
if result['passed']!=result['total'] or errors:sys.exit(1)
