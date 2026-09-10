"""Package R4 only when current source and offline bytes match passing acceptance."""
from pathlib import Path
import hashlib, json, subprocess, zipfile
ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
OUT = REPO / 'deliveries/maps-r4'
PREFIX = 'IQUIPAGE-Maps-R4/'
DENY = {'.git', '.build', '.dev-state', 'node_modules', '.venv', '__pycache__', 'artifacts'}
FONTS = {'.ttf', '.otf', '.woff', '.woff2', '.ttc'}
sha = lambda data: hashlib.sha256(data).hexdigest()
ART = ROOT / 'artifacts/final'
report = json.loads((ART / 'verification.json').read_text())
assert report['status'] == 'PASS', 'Run npm run verify successfully first'
current = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {fingerprint} from './scripts/fingerprint.mjs'; console.log(JSON.stringify(await fingerprint()));"], cwd=ROOT, text=True))
assert current['sha256'] == report['sourceFingerprint'], 'Source changed after acceptance'
assert sha((ROOT / 'preview.html').read_bytes()) == report['previewSha256'], 'Preview changed'
assert report['nodeTests'] > 0 and report['browserScenarios'] > 0
files = {}
for directory, target in [(REPO / 'design-system', 'design-system'), (ROOT, 'packages/maps')]:
    for p in sorted(directory.rglob('*')):
        rel = p.relative_to(directory)
        if any(part in DENY for part in rel.parts):
            continue
        if p.is_symlink():
            raise RuntimeError('Symlink is not distributable: ' + str(rel))
        if not p.is_file():
            continue
        if p.suffix.lower() in FONTS or p.name.startswith('.env') or p.name == 'server.lock':
            raise RuntimeError('Forbidden package input: ' + str(rel))
        if target == 'packages/maps' and str(rel) == 'MANIFEST.sha256':
            continue
        files[target + '/' + rel.as_posix()] = p.read_bytes()
files['README.md'] = (ROOT / 'docs/RELEASE-R4.md').read_bytes()
files['IQUIPAGE-Maps-R4.html'] = (ROOT / 'preview.html').read_bytes()
reports = {'artifacts/final/verification.json': 'verification.json',
           'artifacts/final/fingerprint.json': 'fingerprint.json',
           'artifacts/r3/browser-report.json': 'browser-r3.json',
           'artifacts/final/browser-events.json': 'browser-events.json',
           'artifacts/final/browser-recovery.json': 'browser-recovery.json',
           'artifacts/r3/preview-report.json': 'offline-preview.json'}
for source, dest in reports.items():
    data = (ROOT / source).read_bytes()
    parsed = json.loads(data)
    if dest != 'fingerprint.json':
        assert parsed['status'] == 'PASS', source
    files['packages/maps/evidence/final/' + dest] = data
for name in ['build', 'preview', 'node', 'browser', 'offline']:
    files['packages/maps/evidence/final/' + name + '.log'] = (ART / (name + '.log')).read_bytes()
for name in ['delivery-journal.png', 'delivery-mobile.png']:
    p = ART / name
    if p.is_file():
        files['packages/maps/evidence/final/screenshots/' + name] = p.read_bytes()
manifest = ''.join(sha(data) + '  ' + name + '\n' for name, data in sorted(files.items()))
files['MANIFEST.sha256'] = manifest.encode()
OUT.mkdir(parents=True, exist_ok=True)
archive = OUT / 'IQUIPAGE-Maps-R4.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in sorted(files.items()):
        entry = zipfile.ZipInfo(PREFIX + name, (2026, 9, 10, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        z.writestr(entry, data)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name, data in files.items():
        assert sha(z.read(PREFIX + name)) == sha(data), name
(OUT / 'IQUIPAGE-Maps-R4.html').write_bytes(files['IQUIPAGE-Maps-R4.html'])
(OUT / 'IQUIPAGE-Maps-R4-Verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
(OUT / 'SHA256SUMS').write_text(''.join(sha(p.read_bytes()) + '  ' + p.name + '\n' for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'SHA256SUMS'))
print(json.dumps({'archive': str(archive), 'files': len(files), 'bytes': archive.stat().st_size,
                  'sha256': sha(archive.read_bytes()), 'nodeTests': report['nodeTests'],
                  'browserScenarios': report['browserScenarios']}, indent=2))
