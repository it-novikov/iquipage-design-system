"""Archive an explicitly unfinished review snapshot; never issues release acceptance."""
from pathlib import Path
import hashlib, json, shutil, subprocess, tempfile, zipfile
root = Path(__file__).resolve().parents[3]
pn = root / 'packages/planning'
out = Path.home() / 'Downloads/Sprintique-Planning-PN45-Review-20260912'
sha = lambda data: hashlib.sha256(data).hexdigest()
report = json.loads((pn / 'evidence/verification.json').read_text())
if report.get('scope') != 'consumer-view-and-local-fixture':
    raise SystemExit('Unknown verification scope')
for name, expected in json.loads((pn / 'evidence/source-fingerprint.json').read_text())['files']:
    if sha((pn / name).read_bytes()) != expected:
        raise SystemExit('Unverified source change: ' + name)
items = {}
skip = {'node_modules', '.git', '.build', 'output', 'artifacts', '__pycache__', 'data', '.cache'}
for folder in ['design-system', 'packages/maps', 'packages/planning', '.agents/skills']:
    for path in (root / folder).rglob('*'):
        name = path.relative_to(root)
        if any(part in skip for part in name.parts) or not path.is_file() or path.is_symlink(): continue
        if path.suffix.lower() in {'.ttf','.otf','.woff','.woff2','.eot','.sqlite','.db'} or path.name.startswith('.env'): continue
        if str(name).startswith('packages/maps/evidence/') or str(name) == 'packages/maps/preview.html': continue
        items[str(name)] = path.read_bytes()
for name in ['AGENTS.md','START-HERE.md','.github/workflows/planning.yml']:
    items[name] = (root / name).read_bytes()
items['README.md'] = (pn / 'README.md').read_bytes()
if sha(items['packages/planning/dist/Sprintique-Planning-PN2.html']) != report['offline']['sha256']:
    raise SystemExit('HTML differs from verified source')
manifest = ''.join(f'{sha(data)}  {name}\n' for name,data in sorted(items.items()))
items['MANIFEST.sha256'] = manifest.encode()
head = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
state = {'scope':'source review, not a release','sourceCommit':head,'acceptance':report['status'],
         'backendIntegrated':False,'releaseReady':False,'requiredFailure':'PLN-RECOVERY-01',
         'unintegrated':'List drag/windowing is not part of this runnable snapshot'}
items['REVIEW-STATE.json'] = (json.dumps(state,indent=2)+'\n').encode()
out.mkdir(parents=True,exist_ok=True)
marker=out/'.planning-review'
if any(out.iterdir()) and not marker.exists(): raise SystemExit('Refusing to overwrite unrelated files')
marker.write_text('Owned review-only snapshot; does not replace PN2 or a verified release.\n')
archive=out/'Sprintique-Planning-PN45-Review.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as dest:
    for name,data in sorted(items.items()):
        info=zipfile.ZipInfo('Sprintique-Planning-Review/'+name,(2026,9,12,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
        dest.writestr(info,data)
with tempfile.TemporaryDirectory(prefix='planning-review-check-') as temporary:
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            if not (Path(temporary)/name).resolve().is_relative_to(Path(temporary).resolve()): raise SystemExit('Unsafe archive path')
        source.extractall(temporary)
    extracted=Path(temporary)/'Sprintique-Planning-Review'
    for line in manifest.splitlines():
        expected,name=line.split('  ',1)
        if sha((extracted/name).read_bytes())!=expected: raise SystemExit('Archive integrity failed: '+name)
for source,name in [(pn/'dist/Sprintique-Planning-PN2.html','Sprintique-Planning-PN45-Review.html'),
                    (pn/'README.md','README.md'),(pn/'evidence/verification.json','verification.json'),
                    (pn/'docs/FINAL-FINDINGS.md','FINAL-FINDINGS.md')]: shutil.copy2(source,out/name)
state.update({'archiveIntegrity':'PASS','files':len(items),'manifestEntries':len(manifest.splitlines()),'archiveSha256':sha(archive.read_bytes())})
(out/'REVIEW-STATE.json').write_text(json.dumps(state,indent=2)+'\n')
(out/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in sorted(out.iterdir()) if p.is_file() and not p.name.startswith('.') and p.name!='SHA256SUMS'))
print(json.dumps({**state,'output':str(out)},indent=2))
