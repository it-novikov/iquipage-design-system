"""Self-contained UX R3 source/fixture delivery. No secrets, user storage or font binaries."""
from pathlib import Path
import argparse, hashlib, json, shutil, tempfile, zipfile
root = Path(__file__).resolve().parents[3]
pn = root / 'packages/planning'
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, default=Path.home() / 'Downloads/Sprintique-UX-R3')
args = parser.parse_args(); out = args.out.resolve()
report = json.loads((pn / 'evidence/verification.json').read_text())
if report['status'] != 'PASS': raise SystemExit('Run npm run verify before packaging')
sha = lambda data: hashlib.sha256(data).hexdigest()
items = {}
roots = ['design-system', 'packages/maps', 'packages/planning', 'packages/work-list', 'docs/experience-r3', '.agents/skills', 'agent-skills']
skip_dirs = {'node_modules', '.git', '.build', 'output', 'artifacts', '__pycache__', 'data', '.cache'}
font_types = {'.ttf', '.otf', '.woff', '.woff2', '.eot'}
for folder in roots:
    for path in (root / folder).rglob('*'):
        relative = path.relative_to(root)
        if any(part in skip_dirs for part in relative.parts): continue
        if not path.is_file() or path.is_symlink(): continue
        if path.suffix.lower() in font_types or path.name.startswith('.env') or path.suffix in {'.sqlite', '.db'}: continue
        if 'packages/maps/evidence' in str(relative) or 'packages/maps/preview.html' == str(relative): continue
        if str(relative) == 'packages/planning/dist/Sprintique-Planning-PN2.html' or path.name == 'failure.png': continue
        items[str(relative)] = path.read_bytes()
for name in ['AGENTS.md', 'START-HERE.md']:
    if (root / name).is_file(): items[name] = (root / name).read_bytes()
items['README.md'] = (pn / 'README.md').read_bytes()
expected_html = sha(items['packages/planning/dist/Sprintique-UX-R3.html'])
if expected_html != report['offline']['sha256']: raise SystemExit('Stale offline HTML')
for name, expected in json.loads((pn / 'evidence/source-fingerprint.json').read_text())['files']:
    if sha((pn / name).read_bytes()) != expected: raise SystemExit('Source changed after acceptance: ' + name)
out.mkdir(parents=True, exist_ok=True)
marker = out / '.sprintique-ux-r3'
if any(out.iterdir()) and not marker.exists(): raise SystemExit('Output is not an owned UX R3 delivery directory')
marker.write_text('UX R3 fixture delivery, not production data\n')
manifest = ''.join(f'{sha(data)}  {name}\n' for name, data in sorted(items.items()))
items['MANIFEST.sha256'] = manifest.encode()
archive = out / 'Sprintique-UX-R3.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
    for name, data in sorted(items.items()):
        info = zipfile.ZipInfo('Sprintique-UX-R3/' + name, (2026, 9, 12, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        zipped.writestr(info, data)
with tempfile.TemporaryDirectory(prefix='sprintique-pn2-verify-') as temporary:
    with zipfile.ZipFile(archive) as zipped:
        for name in zipped.namelist():
            if not (Path(temporary) / name).resolve().is_relative_to(Path(temporary).resolve()): raise SystemExit('Unsafe archive path')
        zipped.extractall(temporary)
    extracted = Path(temporary) / 'Sprintique-UX-R3'
    for line in (extracted / 'MANIFEST.sha256').read_text().splitlines():
        expected, name = line.split('  ', 1)
        if sha((extracted / name).read_bytes()) != expected: raise SystemExit('Integrity failure: ' + name)
for source, name in [(pn / 'dist/Sprintique-UX-R3.html', 'Sprintique-UX-R3.html'), (pn / 'README.md', 'README.md'), (pn / 'evidence/verification.json', 'verification.json')]: shutil.copy2(source, out / name)
package_report = {'status': 'PASS_PACKAGE_INTEGRITY', 'scope': 'local UX R3 fixture and sources', 'files': len(items), 'manifestEntries': len(items)-1, 'archiveSha256': sha(archive.read_bytes()), 'backendIntegrated': False, 'productReady': False}
(out / 'package-verification.json').write_text(json.dumps(package_report, indent=2) + '\n')
(out / 'SHA256SUMS').write_text(''.join(f'{sha((out/name).read_bytes())}  {name}\n' for name in ['Sprintique-UX-R3.zip', 'Sprintique-UX-R3.html', 'verification.json', 'package-verification.json']))
print(json.dumps({**package_report, 'output': str(out)}, indent=2))
