#!/usr/bin/env python3
"""Synthetic helper checks: preserve blocked navigation, separately test fixture capture."""
import argparse,asyncio,functools,hashlib,http.server,importlib.util,json,sys,threading
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('capture_surface',ROOT/'skills/iquipage-review/scripts/capture_surface.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'tests/fixtures')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=(ROOT/'tests/fixtures/capture.html').read_text()
def args(key,fp,width=1280):
    return argparse.Namespace(url=f'http://127.0.0.1:{server.server_port}/capture.html',html_fixture=None,allow_remote=False,app_fingerprint=fp,width=width,height=800,output=ROOT/'reports/capture-smoke'/key,engine='chromium',executable=Path('/usr/bin/chromium'),storage_state=None,ready_selector='#ready',timeout=10000,settle_ms=100,state_label=key)
async def run():
    result={'schema_version':'1.0','purpose':'Synthetic helper tests. No production UI, DS conformance, real app behaviour or model invocations.'}
    nav=args('navigation',hashlib.sha256(base.encode()).hexdigest())
    try:
        r=await m.capture(nav)
        result['url_navigation']={'status':'PASS','mode':'local-http','engine':r['environment']['browser_version']}
    except Exception as e:
        result['url_navigation']={'status':'BLOCKED','error':f'{type(e).__name__}: {e}','note':'Preserved as blocked; fixture checks below do not close URL navigation.'}
    cases=[]
    for theme,err,width in [('light',False,1280),('dark',False,390),('dark',True,1280)]:
        key=f'fixture-{theme}-{width}'+('-intentional-error' if err else '')
        fixture=base.replace("new URLSearchParams(location.search)","new URLSearchParams('theme="+theme+("&error=1" if err else "")+"')")
        path=ROOT/'tests/fixtures'/f'{key}.html';path.write_text(fixture)
        a=args(key,hashlib.sha256(fixture.encode()).hexdigest(),width);a.url=None;a.html_fixture=path
        r=await m.capture(a)
        assert r['verdict']=='NOT_ASSESSED'
        assert r['environment']['load_mode']=='offline-fixture'
        assert r['measurements']['rootTheme']==theme
        assert r['measurements']['document']['width']==width
        assert bool(r['javascript_errors'])==err
        assert r['environment']['websockets']=='blocked'
        assert (a.output/'surface.png').is_file()
        cases.append({'case':key,'status':'PASS','assertions':7,'engine':r['environment']['browser_version'],'expected_error_detected':err})
    result['offline_fixture_cases']=cases
    result['fixture_status']='PASS'
    return result
try:
    out=asyncio.run(run());(ROOT/'reports/capture-smoke.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2))
finally:server.shutdown();server.server_close()
