"""Text contrast on actual new surfaces (computed RGB, no external resources)."""
from pathlib import Path
import hashlib,json,re,sys
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];checks=[];errors=[]
def luminance(rgb):
 v=[float(x)/255 for x in rgb[:3]];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v];return sum(a*b for a,b in zip(v,[.2126,.7152,.0722]))
def blend(a,b):return [a[i]*a[3]+b[i]*(1-a[3]) for i in range(3)]+[1]
def parse(c):
 n=list(map(float,re.findall(r'[\d.]+',c)));return n[:3]+[n[3] if len(n)>3 else 1]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);p=b.new_page(viewport={'width':1440,'height':900});p.route('**/*',lambda r:r.abort());p.on('pageerror',lambda e:errors.append(str(e)));p.set_content((R/'workbench.html').read_text(),wait_until='domcontentloaded')
 for theme in ['light','dark']:
  p.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
  for mode in ['work','read']:
   p.locator('#daily-'+mode).click()
   selectors='iq-work-header h1,iq-work-header p,.iq-work-navigation button,.iq-work-summary b,.iq-work-toolbar button,.iq-work-open,.iq-work-table td,.iq-work-table th,.iq-work-table .iq-badge,.iq-work-row-title small' if mode=='work' else 'iq-markdown-viewer h2,iq-markdown-viewer h3,iq-markdown-viewer h4,iq-markdown-viewer p,iq-markdown-viewer li,iq-markdown-viewer th,iq-markdown-viewer td,iq-markdown-viewer a,iq-markdown-viewer pre,iq-markdown-viewer .md-task-mark,iq-markdown-viewer .md-image-note'
   for state in ['normal','focus'] if mode=='read' else ['normal']:
    if state=='focus':p.locator('iq-markdown-viewer a').first.focus()
    vals=p.locator(selectors).evaluate_all('''es=>es.filter(e=>e.getBoundingClientRect().width&&e.textContent.trim()).map(e=>{const s=getComputedStyle(e);let n=e,bgs=[];while(n){bgs.push(getComputedStyle(n).backgroundColor);n=n.parentElement||(n.getRootNode()?.host??null);}return {text:e.textContent.slice(0,60),color:s.color,bgs,font:parseFloat(s.fontSize),weight:s.fontWeight,tag:e.tagName}})''')
    for item in vals:
     bg=[255,255,255,1]
     for c in item['bgs'][::-1]:bg=blend(parse(c),bg)
     fg=blend(parse(item['color']),bg);a,z=sorted([luminance(bg),luminance(fg)]);ratio=(z+.05)/(a+.05);limit=3 if item['font']>=24 or (item['font']>=18.66 and int(item['weight'])>=700) else 4.5
     checks.append({'name':f'{theme}/{mode}/{state}/{item["tag"]}/{item["text"]}','passed':ratio>=limit,'ratio':round(ratio,3),'minimum':limit,'fg':fg[:3],'bg':bg[:3]})
 b.close()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out={'version':'0.5.7','htmlSha256':sha(R/'workbench.html'),'cssSha256':sha(R/'dist/iquipage.css'),'total':len(checks),'passed':sum(c['passed'] for c in checks),'javascriptErrors':errors,'checks':checks}
(R/'evidence/contrast-056.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(out['passed'],'/',out['total']);print([c for c in checks if not c['passed']]);sys.exit(0 if out['total']==out['passed'] and not errors else 1)
