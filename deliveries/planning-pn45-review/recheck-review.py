"""Reproduce the exact unfinished snapshot; a known failing test is still FAIL."""
from pathlib import Path
import hashlib, json, os, subprocess, tempfile, zipfile
base=Path(__file__).resolve().parent
archive=base/'Sprintique-Planning-PN45-Review.zip'
steps=[];report={};failure=None
try:
    with tempfile.TemporaryDirectory(prefix='planning-pn45-review-') as temporary:
        dest=Path(temporary).resolve()
        with zipfile.ZipFile(archive) as source:
            for name in source.namelist():
                if not (dest/name).resolve().is_relative_to(dest): raise ValueError('Unsafe archive path')
            source.extractall(dest)
        root=dest/'Sprintique-Planning-Review'
        for line in (root/'MANIFEST.sha256').read_text().splitlines():
            expected,name=line.split('  ',1)
            if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected: raise ValueError('Manifest mismatch: '+name)
        env=dict(os.environ)
        if Path('/opt/homebrew/opt/node@24/bin').exists(): env['PATH']='/opt/homebrew/opt/node@24/bin:'+env.get('PATH','')
        for package in ['maps','planning']:
            result=subprocess.run(['npm','ci','--ignore-scripts','--no-fund','--no-audit'],cwd=root/'packages'/package,env=env,capture_output=True,text=True,timeout=240)
            (base/f'recheck-{package}-install.log').write_text(result.stdout+result.stderr)
            steps.append({'name':package+'-install','exitCode':result.returncode})
            if result.returncode: raise RuntimeError(package+' install failed')
        result=subprocess.run(['npm','run','verify'],cwd=root/'packages/planning',env=env,capture_output=True,text=True,timeout=600)
        (base/'recheck-verify.log').write_text(result.stdout+result.stderr)
        steps.append({'name':'verify','exitCode':result.returncode})
        report=json.loads((root/'packages/planning/evidence/verification.json').read_text())
        rebuilt=root/'packages/planning/dist/Sprintique-Planning-PN2.html'
        supplied=base/'Sprintique-Planning-PN45-Review.html'
        identical=hashlib.sha256(rebuilt.read_bytes()).hexdigest()==hashlib.sha256(supplied.read_bytes()).hexdigest()
        if not identical: raise RuntimeError('Non-identical rebuilt HTML')
except Exception as error: failure=str(error)
summary={'archiveIntegrity':'PASS' if not failure else 'FAIL','productAcceptance':report.get('status','NOT_RUN'),
         'nodeTests':report.get('nodeTests'),'baseNodeTests':report.get('baseNodeTests'),'browserPassed':report.get('browserScenarios'),
         'failedChecks':[x['name'] for x in report.get('checks',[]) if x['exitCode']!=0],
         'rebuildIdentical':not failure and bool(report),'steps':steps,'error':failure,'releaseReady':False}
(base/'clean-recheck.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
if failure: raise SystemExit(1)
