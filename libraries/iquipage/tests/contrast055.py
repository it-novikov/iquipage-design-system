"""Measured solid whiteboard text/surface pairs. Not a full accessibility audit."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import hashlib,json,os
R=Path(__file__).resolve().parents[1];HTML=(R/'whiteboard.html').read_text();cases=[];errors=[]
JS='''()=>{
 const rgba=s=>{const n=s.match(/[\\d.]+/g);return n&&n.length>=3?[+n[0],+n[1],+n[2],n.length>3?+n[3]:1]:[0,0,0,0]};
 const over=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
 const bg=e=>{const nodes=[];for(let n=e;n;n=n.parentElement)nodes.unshift(n);let c=[255,255,255,1];for(const n of nodes)c=over(rgba(getComputedStyle(n).backgroundColor),c);return c};
 const sels='.wb-library-item b,.wb-library-item small,.wb-library-group,.wb-library-hint,.wb-library-tabs button,.wb-header h3,.wb-subtitle,.wb-mode-description,.wb-object-text,.wb-dock button,.wb-zoom button,.wb-format-label,.wb-editor-commandbar button';
 return [...document.querySelectorAll(sels)].filter(e=>e.getClientRects().length&&!e.closest('[hidden]')&&!e.disabled&&e.textContent.trim()).map(e=>{const owner=e.closest('.wb-object');let back=bg(e);const face=owner?.querySelector('.wb-shape-face>*');if(face)back=over(rgba(getComputedStyle(face).fill),back);let opacity=1;for(let n=e;n;n=n.parentElement)opacity*=parseFloat(getComputedStyle(n).opacity)||1;const fg=rgba(getComputedStyle(e).color);fg[3]*=opacity;return {selector:e.className||e.tagName,text:e.textContent.slice(0,80),color:over(fg,back),background:back};})
}'''
def lum(c):
 return sum((v/255/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4)*k for v,k in zip(c[:3],[.2126,.7152,.0722]))
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 p=b.new_page(viewport={'width':1440,'height':1100});p.route('**/*',lambda r:r.abort());p.on('pageerror',lambda e:errors.append(str(e)));p.set_content(HTML);p.wait_for_selector('iq-whiteboard .wb-stage')
 for theme in ['light','dark']:
  p.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
  for scenario in ['brainstorm','diagram']:
   p.locator(f'[data-scenario={scenario}]').click();p.wait_for_timeout(60)
   for state in ['rest','hover','focus']:
    e=p.locator('.wb-dock [data-tool=select]')
    if state=='hover':e.hover()
    elif state=='focus':p.keyboard.press('Tab');e.focus()
    else:p.mouse.move(0,0)
    p.wait_for_timeout(160)
    for x in p.evaluate(JS):
     a,z=sorted([lum(x['color']),lum(x['background'])]);v=(z+.05)/(a+.05);cases.append({'name':f'{theme}/{scenario}/{state}/{x["text"][:25]}','passed':v>=4.5,'ratio':round(v,3),**x})
 b.close()
report={'version':'0.5.7','htmlSha256':hashlib.sha256(HTML.encode()).hexdigest(),'total':len(cases),'passed':sum(c['passed'] for c in cases),'checks':cases,'javascriptErrors':errors,'method':'Computed text colors; alpha-composited solid ancestor backgrounds and shape face. Whole offscreen model may be included. Does not measure focus indicator geometry, all icons or all CSS combinations.'}
(R/'evidence/whiteboard-contrast.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
for c in cases:
 if not c['passed']:print('FAIL',c['name'],c['ratio'],c['color'],c['background'])
print('TOTAL',report['passed'],'/',report['total'],errors)
raise SystemExit(0 if report['passed']==report['total'] and not errors else 1)
