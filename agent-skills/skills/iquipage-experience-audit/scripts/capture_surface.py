#!/usr/bin/env python3
"""Passive screenshot + geometry capture. Does not operate the UI or certify it.
Requires Python Playwright and the chosen browser installed separately.
Default network policy permits loopback only. Never installs dependencies.
"""
from __future__ import annotations
import argparse, asyncio, hashlib, ipaddress, json, re, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

PROBE=r'''() => {
 const rect = e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 const visible = e => {const s=getComputedStyle(e), r=e.getBoundingClientRect();return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
 const all=[...document.querySelectorAll('body *')];
 const nodes=all.filter(visible);
 const interactive=nodes.filter(e=>e.matches('button,input,select,textarea,a[href],[role="button"],[role="tab"],[role="checkbox"],[role="switch"]'));
 const textNodes=nodes.filter(e=>e.children.length===0&&e.textContent.trim()).slice(0,250);
 return {
  document:{width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight},
  rootTheme:document.documentElement.getAttribute('data-theme'),bodyTheme:document.body.getAttribute('data-theme'),
  visibleH1: nodes.filter(e=>e.matches('h1')).map(e=>({text:e.textContent.trim().slice(0,120),rect:rect(e)})),
  interactive:interactive.slice(0,1000).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,role:e.getAttribute('role'),name:e.getAttribute('aria-label')||e.textContent.trim().slice(0,120),disabled:e.matches(':disabled')||e.getAttribute('aria-disabled')==='true',selected:e.getAttribute('aria-selected'),pressed:e.getAttribute('aria-pressed'),focusVisible:e.matches(':focus-visible'),rect:rect(e)})),
  textStyles:textNodes.map(e=>{const s=getComputedStyle(e);return {tag:e.tagName.toLowerCase(),text:e.textContent.trim().slice(0,100),rect:rect(e),color:s.color,background:s.backgroundColor,backgroundImage:s.backgroundImage,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,opacity:s.opacity};}),
  overflowCandidates:nodes.filter(e=>{const r=e.getBoundingClientRect();return r.right>document.documentElement.clientWidth+1||r.left< -1;}).slice(0,100).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,classes:String(e.className).slice(0,160),rect:rect(e)})),
  truncation:{interactive:interactive.length>1000,text:nodes.filter(e=>e.children.length===0&&e.textContent.trim()).length>250},
  notes:['Computed colours are not composited contrast measurements.','Shadow roots are not traversed; inspect custom elements separately.','No automated conformance or visual-quality verdict.','Overflow candidates may belong to legitimate inner scrollers.']
 };
}'''

def loopback(url:str)->bool:
    try:
        p=urlsplit(url)
        if p.scheme not in {'http','https','ws','wss'}:return False
        if p.username or p.password:return False
        if p.hostname=='localhost':return True
        return ipaddress.ip_address(p.hostname or '').is_loopback
    except ValueError:return False

def check_url(url:str,allow_remote:bool)->None:
    parsed=urlsplit(url)
    if parsed.scheme not in {'http','https'} or parsed.username or parsed.password:
        raise ValueError('Use HTTP(S) without URL credentials')
    if not allow_remote and not loopback(url):raise ValueError('Remote host refused without --allow-remote; use approved test environment')

async def capture(args):
    from playwright.async_api import async_playwright
    fixture=getattr(args,'html_fixture',None)
    if fixture is None:
        check_url(args.url,args.allow_remote)
    elif not fixture.is_file() or fixture.stat().st_size>10_000_000:
        raise ValueError('Fixture is missing or exceeds 10 MB')
    elif args.storage_state:
        raise ValueError('Storage state is not used with an offline fixture')
    if not re.fullmatch('[0-9a-f]{64}',args.app_fingerprint):raise ValueError('app-fingerprint must be a SHA256')
    if not 240<=args.width<=4000 or not 320<=args.height<=4000:raise ValueError('Invalid viewport')
    args.output.mkdir(parents=True,exist_ok=True)
    screenshot=args.output/'surface.png';report_path=args.output/'capture.json'
    if screenshot.exists() or report_path.exists():raise ValueError('Output already contains capture; choose a new directory')
    events=[];blocked=[]
    async with async_playwright() as pw:
        bt=getattr(pw,args.engine)
        kwargs={'headless':True}
        if args.executable:kwargs['executable_path']=str(args.executable)
        browser=await bt.launch(**kwargs)
        opts={'viewport':{'width':args.width,'height':args.height},'device_scale_factor':1,'service_workers':'block'}
        if args.storage_state:opts['storage_state']=str(args.storage_state)
        context=await browser.new_context(**opts)
        async def route(r):
            u=r.request.url
            if args.allow_remote or loopback(u) or u.startswith(('data:','blob:')):await r.continue_()
            else:
                blocked.append(urlsplit(u).hostname or '[non-http]');await r.abort()
        await context.route('**/*',route)
        if not hasattr(context, 'route_web_socket'):
            await browser.close()
            raise RuntimeError('This passive helper requires Playwright with route_web_socket to block WebSockets')
        async def block_socket(ws):
            await ws.close()
        await context.route_web_socket('**/*', block_socket)
        page=await context.new_page();page.on('pageerror',lambda e:events.append(str(e)[:500]))
        if fixture is None:
            await page.goto(args.url,wait_until='domcontentloaded',timeout=args.timeout)
        else:
            await page.set_content(fixture.read_text(encoding='utf-8'),wait_until='domcontentloaded',timeout=args.timeout)
        await page.locator(args.ready_selector).wait_for(state='visible',timeout=args.timeout)
        await page.evaluate('document.fonts.ready')
        await page.wait_for_timeout(args.settle_ms)
        data=await page.evaluate(PROBE)
        await page.screenshot(path=str(screenshot),full_page=True,animations='allow')
        result={'schema_version':'1.0','kind':'passive-surface-capture','app_fingerprint':args.app_fingerprint,
                'state_label':args.state_label,'timestamp':datetime.now(timezone.utc).isoformat(),
                'environment':{'engine':args.engine,'browser_version':browser.version,'viewport':[args.width,args.height],'storage_state_used':bool(args.storage_state),'remote_network_allowed':args.allow_remote,'websockets':'blocked','load_mode':'offline-fixture' if fixture else 'url-navigation'},
                'screenshot':{'path':'surface.png','sha256':hashlib.sha256(screenshot.read_bytes()).hexdigest()},
                'measurements':data,'javascript_errors':events,'blocked_hosts':sorted(set(blocked)),
                'verdict':'NOT_ASSESSED','limitations':['Passive current URL/state only; no application actions, role checks or persistence tests.',
                    'Auth/sensitive data can appear in screenshots; use approved synthetic data. Storage-state content is never copied into this report.',
                    'No colour or aesthetic pass is inferred from computed styles. Theme is observed, not forced.',
                    'WebSockets and service workers are blocked in this passive capture; realtime must be tested separately.',
                    'Offline-fixture mode, when used, does not test serving, origin, routing, authenticated persistence or deployed application behaviour.']}
        report_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        await browser.close()
    return result

def main()->int:
    p=argparse.ArgumentParser(description=__doc__);source=p.add_mutually_exclusive_group(required=True);source.add_argument('--url');source.add_argument('--html-fixture',type=Path);p.add_argument('--ready-selector',required=True);p.add_argument('--output',required=True,type=Path);p.add_argument('--app-fingerprint',required=True);p.add_argument('--state-label',required=True)
    p.add_argument('--width',type=int,default=1440);p.add_argument('--height',type=int,default=900);p.add_argument('--engine',choices=['chromium','firefox','webkit'],default='chromium');p.add_argument('--executable',type=Path);p.add_argument('--storage-state',type=Path);p.add_argument('--allow-remote',action='store_true');p.add_argument('--timeout',type=int,default=15000);p.add_argument('--settle-ms',type=int,default=400)
    a=p.parse_args()
    try:
        r=asyncio.run(capture(a));print(json.dumps({'capture':'recorded','verdict':r['verdict'],'javascript_errors':len(r['javascript_errors'])}));return 0
    except Exception as e:
        print(f'Capture not completed: {type(e).__name__}: {e}. No dependency installation was attempted.',file=sys.stderr);return 2
if __name__=='__main__':sys.exit(main())
