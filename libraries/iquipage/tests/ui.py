"""Regression checks against the exact delivered HTML. Requires Python Playwright + Chromium.
No server or network dependency. set_content is used because file navigation is blocked
in the execution environment. This does not validate persisted storage or a deployment.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image
from io import BytesIO
import argparse, hashlib, json, re, os, time

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text()
SHA=hashlib.sha256(HTML.encode()).hexdigest()
EVID=ROOT/'evidence'; EVID.mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['behavior','layout','screens','contrast'],default='behavior');parser.add_argument('--width',type=int,default=1440);args=parser.parse_args()
checks=[];errors=[]
def record(name,ok,detail=None):
 checks.append({'name':name,'passed':bool(ok),'details':detail})
 if not ok: print('FAIL',name,detail,flush=True)
def test(name,fn):
 try:
  detail=fn();record(name,True,detail)
 except Exception as e:record(name,False,str(e))
def require(ok,message):
 if not ok:raise AssertionError(message)
def go(page,route):
 if route=='components/data-chart':route='components/chart'
 page.evaluate('(r)=>location.hash=r',arg=route)
 page.wait_for_function('(r)=>document.querySelector("#app").dataset.route===r',arg=route)
 page.wait_for_timeout(70)
 page.mouse.move(0,0)
def theme(page,t):page.evaluate('(t)=>document.documentElement.dataset.theme=t',t)
def close_task(page):
 page.locator('#task-drawer [data-close]').first.click()
 page.wait_for_function('!document.querySelector("#task-drawer dialog")?.open')
 page.wait_for_timeout(50)
def init(page):
 page.route('**/*',lambda r:r.abort())
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(HTML,wait_until='domcontentloaded');page.wait_for_function('!!window.IQ_CATALOG')
 page.wait_for_timeout(250)

def lum(rgb):
 values=[v/255 for v in rgb[:3]]
 return sum(v*w for v,w in zip([v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values],[.2126,.7152,.0722]))
def contrast(a,b):
 lo,hi=sorted([lum(a),lum(b)]);return (hi+.05)/(lo+.05)

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':args.width,'height':1100},device_scale_factor=1)
 page.set_default_timeout(4500);init(page)
 if args.phase=='layout':
  routes=['overview','examples','landing','objects','workspace/tasks','workspace/board','workspace/plan']+['rules/'+r for r in ['principles','typography','color','motion','media','voice','implementation']]+page.evaluate('IQ_CATALOG.map(x=>"components/"+x.id)')
  routes=list(dict.fromkeys('components/chart' if r=='components/data-chart' else r for r in routes))
  for route in routes:
   print('ROUTE',route,args.width,flush=True)
   go(page,route)
   for t in ['light','dark']:
    theme(page,t)
    result=page.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,title:!!document.querySelector('h1'),main:!!document.querySelector('main'),unrendered:[...document.querySelectorAll('iq-select,iq-dialog,iq-time,iq-plan')].filter(e=>!e.children.length).map(e=>e.tagName)})''')
    record(f'{route} / {args.width}px / {t}',not result['overflow'] and result['main'] and result['title'] and not result['unrendered'],result)
 elif args.phase=='behavior':
  # Import the library as actual ESM with no application module and no network.
  def esm_resource(route):
   p=ROOT/'dist'/route.request.url.split('/dist/',1)[-1]
   if p.is_file():route.fulfill(body=p.read_text(),content_type='text/javascript',headers={'Access-Control-Allow-Origin':'*'})
   else:route.abort()
  def esm():
   page.route('https://iq.local/dist/**',esm_resource)
   r=page.evaluate("""async()=>{window.lib=await import('https://iq.local/dist/iquipage.js');lib.registerIquipage();lib.registerIquipage();return {v:lib.version,e:lib.taskEmphasis({priority:'critical',type:'epic'}),date:!!customElements.get('iq-date-field')}}""")
   require(r=={'v':'0.5.7','e':'critical','date':True},str(r));return r
  test('ESM import, version, shared signal helper and idempotent registration',esm)
  for t in ['light','dark']:
   theme(page,t);go(page,'workspace/board');theme(page,t)
   def board_emphasis():
    a=page.locator('.iq-board .task-card').evaluate_all('''es=>es.map(e=>({id:e.dataset.taskSurface,p:e.dataset.priority,k:e.dataset.taskKind,em:e.dataset.taskEmphasis,bg:getComputedStyle(e).backgroundImage,edge:getComputedStyle(e).borderLeftWidth,before:getComputedStyle(e,'::before').content,hit:getComputedStyle(e,'::after').pointerEvents}))''')
    for x in a:
     expect=x['p'] if x['p'] in ('critical','high') else 'epic' if x['k']=='epic' else 'none'
     require(x['em']==expect,str(x));require((x['bg']!='none')==(expect!='none'),str(x));require(x['edge']=='0px' and x['before']=='none' and x['hit']=='none',str(x))
    return a
   test(t+': cards use exclusive critical/high/epic light, with no left stripe',board_emphasis)
   def hitcard():
    page.locator('.task-card[data-task-surface="SPR-128"]').click(position={'x':8,'y':55})
    require(page.locator('#task-drawer dialog').evaluate('(e)=>e.open'),'drawer not open')
    require('страницу нового релиза' in page.locator('#task-drawer h2').inner_text(),'wrong task')
    close_task(page)
   test(t+': free card surface opens the task',hitcard)
   def menu():
    page.locator('.task-card[data-task-surface="SPR-128"] iq-menu>button').click()
    require(not page.locator('#task-drawer dialog').evaluate('(e)=>e.open'),'menu click opened task')
    require(page.locator('.task-card[data-task-surface="SPR-128"] iq-menu .iq-menu-popup').is_visible(),'menu missing')
    page.keyboard.press('Escape')
   test(t+': card menu stays independent of full-surface hit area',menu)
   go(page,'workspace/tasks');theme(page,t)
   def rows():
    a=page.locator('.workspace-table tr[data-task-surface]').evaluate_all('''es=>es.map(e=>({p:e.dataset.priority,k:e.dataset.taskKind,em:e.dataset.taskEmphasis,bg:getComputedStyle(e).backgroundImage,fill:getComputedStyle(e).backgroundColor,status:e.querySelector('.iq-badge').textContent}))''')
    for x in a:
     expect=x['p'] if x['p'] in ('critical','high') else 'epic' if x['k']=='epic' else 'none'
     require(x['em']==expect,str(x));require((x['bg']!='none')==(expect!='none'),str(x))
     if expect=='none':require(x['fill']=='rgba(0, 0, 0, 0)',str(x))
    require(len({x['status'] for x in a if x['em']=='none'})>=2,'need normal tasks in different statuses')
    return a
   test(t+': only three exceptional rows are illuminated; normal rows are neutral',rows)
   def hitrow():
    page.locator('tr[data-task-surface="SPR-128"] .task-date-cell').click()
    require(page.locator('#task-drawer dialog').evaluate('(e)=>e.open'),'row click did not open task');close_task(page)
   test(t+': row date/surface opens the task',hitrow)
   def checkrow():
    el=page.locator('[data-select-task="SPR-130"]');el.check()
    require(el.is_checked(),'checkbox failed');require(not page.locator('#task-drawer dialog').evaluate('(e)=>e.open'),'selection opened a task')
    require(page.locator('tr[data-task-surface="SPR-130"]').evaluate('(e)=>getComputedStyle(e).backgroundImage')=='none','selection added a coloured signal');el.uncheck()
   test(t+': selection does not colour ordinary rows or open the task',checkrow)
   def sortlist():
    page.locator('[data-sort-tasks]').click();page.locator('[data-action="sort:priority"]').click()
    require(page.locator('tr[data-task-surface]').first.get_attribute('data-priority')=='critical','priority order failed')
    page.locator('[data-sort-tasks]').click();page.locator('[data-action="sort:manual"]').click()
   test(t+': sorting works and preserves emphasis',sortlist)
   def typepriority():
    page.locator('[data-open-task="SPR-130"]').click()
    page.locator('#task-drawer-priority').evaluate("e=>{e.value='high';e.dispatchEvent(new CustomEvent('iq-change',{bubbles:true,detail:{value:'high'}}))}")
    close_task(page)
    require(page.locator('tr[data-task-surface="SPR-130"]').get_attribute('data-task-emphasis')=='high','changed priority did not update light')
    page.locator('[data-open-task="SPR-130"]').click()
    page.locator('#task-drawer-priority').evaluate("e=>{e.value='low';e.dispatchEvent(new CustomEvent('iq-change',{bubbles:true,detail:{value:'low'}}))}")
    close_task(page)
    row=page.locator('tr[data-task-surface="SPR-130"]');require(row.get_attribute('data-task-emphasis')=='none','low should be neutral');require(row.evaluate('(e)=>getComputedStyle(e).backgroundImage')=='none','low remains coloured')
    # Restore normal priority in the same shared model.
    page.locator('[data-open-task="SPR-130"]').click();page.locator('#task-drawer-priority').evaluate("e=>{e.value='normal';e.dispatchEvent(new CustomEvent('iq-change',{bubbles:true,detail:{value:'normal'}}))}");close_task(page)
   test(t+': changing high → low removes the glow without losing the task',typepriority)
  def mobile_spacing():
   page.set_viewport_size({'width':390,'height':844});go(page,'workspace/tasks')
   gaps=page.locator('tr[data-task-surface="SPR-128"]').evaluate("e=>[getComputedStyle(e.children[2]).marginTop,getComputedStyle(e.querySelector('.task-owner-cell')).marginTop,getComputedStyle(e.querySelector('.task-date-cell')).marginTop]")
   require(gaps==['12px','10px','8px'],str(gaps));page.set_viewport_size({'width':1440,'height':1100});return gaps
  test('Mobile list preserves status/person/date vertical spacing',mobile_spacing)
  # Pure CSS behaviour for all combined states using the shared helper.
  def matrix():
   return page.evaluate('''()=>{
    const cases=[];for(const type of ['task','epic'])for(const priority of ['critical','high','normal','low'])for(const status of ['backlog','active','review','done'])cases.push({type,priority,status});
    const host=document.createElement('div');host.className='priority-card-gallery';document.body.append(host);
    const rows=document.createElement('div');rows.className='workspace-table';rows.innerHTML='<table><tbody></tbody></table>';document.body.append(rows);
    for(const v of cases){let card=document.createElement('article');card.className='task-card';card.dataset.taskEmphasis=lib.taskEmphasis(v);card.dataset.priority=v.priority;card.dataset.taskKind=v.type;card.dataset.taskSurface='fixture';host.append(card);
     const tr=document.createElement('tr');Object.assign(tr.dataset,card.dataset);tr.innerHTML='<td>Example</td>';rows.querySelector('tbody').append(tr);
     for(const e of [card,tr]){if((getComputedStyle(e).backgroundImage!=='none')!==(lib.taskEmphasis(v)!=='none'))throw Error(JSON.stringify(v));}
    }host.remove();rows.remove();return {combinations:cases.length,surfaces:cases.length*2};}''')
  test('32 combinations × card/list: status cannot create a glow',matrix)
  go(page,'workspace/board');theme(page,'dark')
  def pointer_drag():
   a=page.locator('[data-task-surface="SPR-128"] [data-drag-handle]');a.scroll_into_view_if_needed();r=a.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
   page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+20,y+12,steps=4);page.wait_for_timeout(80)
   ghost=page.locator('.iq-drag-overlay');require(ghost.count()==1,'drag ghost missing');require(ghost.get_attribute('data-task-emphasis')=='critical','ghost lost emphasis');require(ghost.evaluate('(e)=>getComputedStyle(e).backgroundImage')!='none','ghost lost light')
   dest=page.locator('[data-drop-status="review"] [data-column-cards]').bounding_box();page.mouse.move(dest['x']+dest['width']/2,dest['y']+30,steps=18);page.wait_for_timeout(180);page.mouse.up();page.wait_for_timeout(380)
   require(page.locator('[data-drop-status="review"] [data-task-surface="SPR-128"]').count()==1,'move did not persist');require(page.locator('.iq-drag-overlay,.iq-board-placeholder').count()==0,'drag artifacts remain')
   return 'critical light retained on the moving copy; placement completed'
  test('Pointer drag keeps light and cleans the overlay/placeholder',pointer_drag)
  def undo_drag():
   page.get_by_role('button',name='Отменить',exact=True).last.click();page.wait_for_timeout(200)
   require(page.locator('[data-drop-status="active"] [data-task-surface="SPR-128"]').count()==1,'undo did not restore source column')
  test('Undo restores the original placement',undo_drag)
  def keyboard_drag():
   handle=page.locator('[data-task-surface="SPR-129"] [data-drag-handle]');handle.focus();page.keyboard.press('Enter');page.keyboard.press('ArrowLeft');page.wait_for_timeout(180);page.keyboard.press('Enter');page.wait_for_timeout(350)
   require(page.locator('[data-drop-status="active"] [data-task-surface="SPR-129"]').count()==1,'keyboard move failed')
   require(page.locator('.iq-drag-overlay,.iq-board-placeholder').count()==0,'artifacts remain')
  test('Keyboard drag works with the same emphasis',keyboard_drag)
  def canceled():
   page.locator('[data-task-surface="SPR-131"] [data-drag-handle]').focus();page.keyboard.press('Enter');page.keyboard.press('ArrowRight');page.keyboard.press('Escape');page.wait_for_timeout(250)
   require(page.locator('[data-drop-status="backlog"] [data-task-surface="SPR-131"]').count()==1,'cancel moved the epic');require(page.locator('.iq-drag-overlay').count()==0,'ghost remains')
  test('Escape cancels movement without changing the epic',canceled)
  def idle():
   page.mouse.move(0,0);page.wait_for_timeout(450)
   a=page.locator('.iq-board').evaluate('(e)=>e.getAnimations({subtree:true}).filter(x=>x.playState==="running").length')
   require(a==0,str(a));return {'runningAnimations':a}
  test('No running task animation at rest',idle)
  def reduced():
   page.emulate_media(reduced_motion='reduce')
   a=page.locator('[data-task-surface="SPR-128"]').evaluate('(e)=>getComputedStyle(e,"::after").transitionDuration')
   require(a=='0s',str(a));page.emulate_media(reduced_motion='no-preference');return a
  test('Reduced motion removes light transitions',reduced)
  def forced():
   page.emulate_media(forced_colors='active')
   a=page.locator('[data-task-surface="SPR-128"]').evaluate('(e)=>({bg:getComputedStyle(e).backgroundImage,text:e.textContent,pseudo:getComputedStyle(e,"::after").display})')
   require(a['bg']=='none' and a['pseudo']=='none' and 'Критический' in a['text'],str(a));page.emulate_media(forced_colors='none');return {'gradient':a['bg'],'textPresent':True}
  test('Forced colours removes decorative light but keeps the meaning',forced)
  def fullscreen():
   page.locator('[data-open-task="SPR-128"]').click();page.locator('[data-task-expand]').click();page.wait_for_timeout(220)
   require(page.locator('#task-drawer').get_attribute('expanded') is not None,'not expanded')
   require(page.locator('#task-drawer dialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),'dialog overflow');page.locator('[data-task-expand]').click();close_task(page)
  test('Task full-screen and return remain functional',fullscreen)
 elif args.phase=='screens':
  shots=EVID/'screenshots';shots.mkdir(exist_ok=True)
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':1100 if width==1440 else 844})
   for route in ['workspace/board','workspace/tasks','components/priority']:
    go(page,route)
    for t in ['light','dark']:
     theme(page,t);page.wait_for_timeout(300);page.mouse.move(0,0)
     name=f'{route.replace("/","-")}-{t}-{width}.png';page.screenshot(path=str(shots/name),full_page=True)
     record(name,True)
  # Larger component crops expose the material without needing a zoomed full-page image.
  page.set_viewport_size({'width':1440,'height':1100});go(page,'components/priority')
  for t in ['light','dark']:
   theme(page,t);page.wait_for_timeout(220);page.locator('.priority-catalog').screenshot(path=str(shots/f'priority-detail-{t}.png'))
 elif args.phase=='contrast':
  results=[];page.set_viewport_size({'width':1440,'height':1600})
  for route in ['workspace/board','workspace/tasks']:
   go(page,route)
   for t in ['light','dark']:
    theme(page,t)
    for state in ['rest','hover']:
     page.mouse.move(0,0)
     if state=='hover':page.locator('[data-task-surface="SPR-128"]').hover()
     page.wait_for_timeout(300)
     rects=page.locator('.task-card-id,.task-card-title,.task-signal-copy>span,.task-due,.task-row-meta .task-id,.task-title>button,.task-date-cell,.task-person>span:last-child').evaluate_all('''els=>els.filter(e=>e.getBoundingClientRect().width>0).map(e=>{let r=e.getBoundingClientRect();return {name:e.className,text:e.textContent,em:e.closest('[data-task-emphasis]')?.dataset.taskEmphasis,x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height,color:getComputedStyle(e).color}})''')
     st=page.add_style_tag(content='[data-task-surface]>*{visibility:hidden!important}')
     image=Image.open(BytesIO(page.screenshot(full_page=True))).convert('RGB');st.evaluate('(e)=>e.remove()')
     for r in rects:
      fg=list(map(int,re.findall(r'\d+',r['color'])[:3]));values=[]
      for px in [.05,.25,.5,.75,.95]:
       for py in [.1,.5,.9]:
        x=min(image.width-1,max(0,int(r['x']+r['w']*px)));y=min(image.height-1,max(0,int(r['y']+r['h']*py)))
        values.append(contrast(fg,image.getpixel((x,y))))
      item={**r,'theme':t,'route':route,'state':state,'minContrast':round(min(values),3)};results.append(item)
      record(f'{route}/{t}/{state}/{r["text"][:35]}',item['minContrast']>=4.5,{'ratio':item['minContrast']})
  (EVID/'contrast-samples.json').write_text(json.dumps({'version':'0.5.7','htmlSha256':SHA,'method':'15 background samples per text bounding rectangle; foreground hidden only to capture background. Not a full accessibility audit.','results':results},ensure_ascii=False,indent=2))
 browser_version=browser.version;browser.close()
record('No JavaScript page errors',not errors,errors)
report={'version':'0.5.7','htmlSha256':SHA,'browser':'Chromium '+browser_version,'deliveryLoad':'set_content, network blocked, system fallback font','phase':args.phase,'width':args.width,'total':len(checks),'passed':sum(x['passed'] for x in checks),'checks':checks,'pageErrors':errors}
filename=f'layout-{args.width}.json' if args.phase=='layout' else args.phase+'.json'
(EVID/filename).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(filename,report['passed'],'/',report['total'],flush=True)
raise SystemExit(0 if report['passed']==report['total'] else 1)
