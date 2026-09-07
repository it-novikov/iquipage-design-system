from pathlib import Path
from playwright.sync_api import sync_playwright
import json,hashlib,os
R=Path(__file__).resolve().parents[1];O=R/'evidence';S=O/'screenshots';S.mkdir(exist_ok=True);html=(R/'whiteboard.html').read_text();checks=[];errors=[]
def check(p,name):
 d=p.evaluate('''()=>{const root=document.querySelector('iq-whiteboard'),shell=root.querySelector('.wb-shell');return {overflow:document.documentElement.scrollWidth>innerWidth+1,dock:!!root.querySelector('.wb-dock'),canvas:root.querySelector('.wb-stage').clientWidth>=100,pencil:!!root.querySelector('[data-tool=pen]'),list:!!root.querySelector('[data-wb-action=list]'),bad:[...root.querySelectorAll('.wb-dock button,.wb-library-item,.wb-formatting')].filter(e=>e.getClientRects().length&&!e.closest('[hidden]')).filter(e=>e.scrollWidth>e.clientWidth+3).map(e=>e.className)}}''');ok=not d['overflow'] and d['dock'] and d['canvas'] and not d['pencil'] and not d['list'] and not d['bad'];checks.append({'name':name,'passed':ok,'details':d});
 if not ok:print('FAIL',name,d,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 for width in [320,390,768,1440]:
  for theme in ['light','dark']:
   p=b.new_page(viewport={'width':width,'height':1000 if width>=768 else 844});p.route('**/*',lambda r:r.abort());p.on('pageerror',lambda e:errors.append(str(e)));p.set_content(html);p.wait_for_selector('.wb-stage');p.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
   for scenario in ['brainstorm','retro','mindmap','diagram','chain','blank']:
    p.locator('[data-scenario='+scenario+']').click();p.wait_for_timeout(60);check(p,f'{scenario}/{width}/{theme}/ready')
    if width in [390,1440] and scenario in ['brainstorm','diagram']:p.screenshot(path=str(S/f'{scenario}-{theme}-{width}.png'),full_page=True)
   p.locator('[data-scenario=brainstorm]').click();p.wait_for_timeout(50)
   for panel in ['help','frames','search','outcomes','more']:
    p.locator('iq-whiteboard').evaluate('(e,k)=>{e.panel=k;e.renderPanel()}',panel);check(p,f'panel-{panel}/{width}/{theme}')
   p.locator('iq-whiteboard').evaluate('e=>{e.panel="";e.render();e.libraryOpen=true;e.render()}');check(p,f'library/{width}/{theme}');p.locator('iq-whiteboard').evaluate('e=>{e.libraryOpen=false;e.render()}')
   for state in ['loading','error']:
    p.locator('iq-whiteboard').evaluate('(e,s)=>e.state=s',state);check(p,f'{state}/{width}/{theme}')
   p.locator('iq-whiteboard').evaluate('e=>{e.state="ready";e.readOnly=true}');check(p,f'readonly/{width}/{theme}')
   p.locator('iq-whiteboard').evaluate('e=>{e.readOnly=false;e.edit("n1")}');p.wait_for_timeout(80);check(p,f'editor/{width}/{theme}')
   if width>=680:
    p.locator('.wb-inline-input').fill('## Главная мысль\n\n**Чёткая формулировка**\n- Первое наблюдение\n- Следующий шаг');p.wait_for_timeout(60);check(p,f'editor-long/{width}/{theme}')
    if width==1440:p.screenshot(path=str(S/f'markdown-alignment-{theme}.png'),full_page=True)
    p.locator('[data-wb-action=finish-edit]').click()
   else:
    if width==390:p.screenshot(path=str(S/f'mobile-editor-{theme}.png'),full_page=True)
    p.keyboard.press('Escape')
   p.close()
 b.close()
report={'version':'0.5.7','htmlSha256':hashlib.sha256(html.encode()).hexdigest(),'checks':checks,'passed':sum(c['passed'] for c in checks),'total':len(checks),'javascriptErrors':errors,'environment':'Chromium, set_content, offline; offscreen canvas objects are intentionally excluded from viewport overflow'};(O/'matrix-055.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('TOTAL',report['passed'],'/',report['total'],'errors',errors,flush=True)
