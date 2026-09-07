"""Computed contrast of the new workshop chrome on the actual delivered HTML.
Opaque/alpha ancestor backgrounds are composited. Disabled controls are excluded.
This is not a full accessibility, graphic-antialiasing or whole-document audit.
"""
from pathlib import Path
import os,json,re,hashlib,sys
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]; O=R/'evidence'; O.mkdir(exist_ok=True)
checks=[];errors=[];captures=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def rgba(s):
 n=list(map(float,re.findall(r'[\d.]+',s)));return n[:3]+[n[3] if len(n)>3 else 1]
def over(a,b):return [a[i]*a[3]+b[i]*(1-a[3]) for i in range(3)]+[1]
def lum(c):
 v=[x/255 for x in c[:3]];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v];return sum(x*y for x,y in zip(v,[.2126,.7152,.0722]))
def measure(p,theme,phase,selectors,graphic=False):
 for s in selectors:
  rows=p.locator(s).evaluate_all('''es=>es.filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&!e.closest('[hidden],:disabled')).slice(0,5).map(e=>{let n=e,bgs=[],opacity=1;while(n){let c=getComputedStyle(n);bgs.push(c.backgroundColor);opacity*=+c.opacity;n=n.parentElement||(n.getRootNode()?.host??null)}let c=getComputedStyle(e);return {text:(e.textContent||e.getAttribute('aria-label')||e.tagName).trim().slice(0,50),color:c.color,bgs,opacity,font:parseFloat(c.fontSize),weight:parseInt(c.fontWeight)||400}})''')
  if not rows:raise AssertionError('No visible measurement: '+theme+'/'+phase+'/'+s)
  for i,row in enumerate(rows):
   bg=[255,255,255,1]
   for c in reversed(row['bgs']):bg=over(rgba(c),bg)
   fg=rgba(row['color']);fg[3]*=row['opacity'];fg=over(fg,bg);a,z=sorted([lum(fg),lum(bg)]);ratio=(z+.05)/(a+.05)
   minimum=3 if graphic or row['font']>=24 or (row['font']>=18.66 and row['weight']>=700) else 4.5
   checks.append({'name':f'{theme}/{phase}/{s}/{i}','text':row['text'],'ratio':round(ratio,3),'minimum':minimum,'passed':ratio>=minimum,'foreground':fg[:3],'background':bg[:3]})
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 for theme in ['light','dark']:
  p=b.new_page(viewport={'width':1440,'height':1000});p.route('**/*',lambda r:r.abort());p.on('pageerror',lambda e:errors.append(str(e)))
  p.set_content((R/'whiteboard.html').read_text(),wait_until='domcontentloaded');p.wait_for_selector('.wb-shell[data-workshop]');p.evaluate('(t)=>document.documentElement.dataset.theme=t',theme);p.wait_for_timeout(150)
  measure(p,theme,'library',['.wb-library>header h3','.wb-library>header p','.wb-library-categories button','.wb-library-item b','.wb-library-item small','.wb-library-batch b','.wb-library-batch small','.wb-library-tip','.wb-mode-description'])
  measure(p,theme,'dock',['.wb-dock [data-tool=select]','.wb-dock [data-tool=hand]','.wb-zoom [data-wb-action=fit]'],True)
  p.locator('[data-library-item=sticky]').hover();p.wait_for_timeout(150);measure(p,theme,'hover',['[data-library-item=sticky] b','[data-library-item=sticky] small'])
  p.keyboard.press('Tab');p.locator('[data-library-item=sticky]').focus();p.wait_for_timeout(180);measure(p,theme,'keyboard focus',['[data-library-item=sticky] b','[data-library-item=sticky] small'])
  p.locator('[data-library-item=sticky]').click();p.wait_for_timeout(150);measure(p,theme,'selected',['[data-library-item=sticky] b','[data-library-item=sticky] small'])
  p.locator('[data-library-category=shapes]').click();measure(p,theme,'shapes',['.wb-library-family h4','.wb-shape-choice b'])
  p.locator('[data-shape=diamond]').click();p.wait_for_timeout(150);measure(p,theme,'selected shape',['[data-shape=diamond] b'])
  p.locator('.wb-dock [data-tool=select]').click();p.mouse.move(0,0);p.wait_for_timeout(180);p.locator('.wb-dock [data-tool=select]').hover();p.wait_for_timeout(650)
  measure(p,theme,'tooltip',['.wb-overlay-tip span'])
  (O/'screenshots').mkdir(exist_ok=True);f=O/'screenshots'/f'tooltip-{theme}-1440.png';p.screenshot(path=str(f));captures.append({'file':str(f.relative_to(R)),'sha256':sha(f),'mode':'tooltip','width':1440,'theme':theme})
  p.keyboard.press('Escape');p.locator('[data-library-category=notes]').click();p.locator('.wb-library-batch').click();p.wait_for_timeout(120)
  measure(p,theme,'capture empty',['.wb-capture-sheet h3','.wb-capture-sheet p','.wb-capture-row label>span','.wb-capture-summary','.wb-capture-import summary'])
  p.locator('.wb-capture-row textarea').first.fill('Отдельная мысль\nВторой абзац.');measure(p,theme,'capture text',['.wb-capture-row textarea','.wb-capture-summary','.wb-capture-sheet [type=submit]']);p.close()
 b.close()
report={'version':'0.5.7','htmlSha256':sha(R/'whiteboard.html'),'cssSha256':sha(R/'dist/iquipage.css'),'passed':sum(c['passed'] for c in checks),'total':len(checks),'javascriptErrors':errors,'checks':checks,'method':'Computed text/currentColor over ancestor alpha backgrounds; new chrome only, disabled excluded. No full WCAG conformance claim.'}
(O/'contrast-057.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(O/'screenshots-tooltip.json').write_text(json.dumps({'version':'0.5.7','htmlSha256':sha(R/'whiteboard.html'),'captures':captures},ensure_ascii=False,indent=2)+'\n')
print(report['passed'],'/',report['total']);print([c for c in checks if not c['passed']]);sys.exit(0 if report['passed']==report['total'] and not errors else 1)
