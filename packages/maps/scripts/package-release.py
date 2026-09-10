"""Build the portable R4 archive from a verified source tree."""
from pathlib import Path
import hashlib, json, zipfile, argparse
ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, default=REPO / 'deliveries/maps-r4')
OUT = parser.parse_args().out.resolve()
sha = lambda data: hashlib.sha256(data).hexdigest()
report_path = ROOT / 'artifacts/final/verification.json'
report = json.loads(report_path.read_text())
if report['status'] != 'PASS':
    raise RuntimeError('Required verification did not pass')
fingerprint = json.loads((ROOT / 'artifacts/final/fingerprint.json').read_text())
for name, digest in fingerprint['files'].items():
    if sha((ROOT / name).read_bytes()) != digest:
        raise RuntimeError('Source changed after verification: ' + name)
if sha((ROOT / 'preview.html').read_bytes()) != report['previewSha256']:
    raise RuntimeError('Preview changed after verification')
DENY = {'.git', '.build', '.dev-state', 'node_modules', '.venv', '__pycache__', 'artifacts'}
FONTS = {'.ttf', '.otf', '.woff', '.woff2', '.ttc'}
files = {}
source_names = {'package.json', 'package-lock.json'}
for directory in ['src', 'demo', 'server', 'scripts', 'tests', 'types', 'ds-extension']:
    source_names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / directory).rglob('*') if p.is_file())
if source_names != set(fingerprint['files']):
    raise RuntimeError('Source file set changed; rerun verification')
for directory, target in [(REPO / 'design-system', 'design-system'), (ROOT, 'packages/maps')]:
    for p in sorted(directory.rglob('*')):
        rel = p.relative_to(directory)
        if any(part in DENY for part in rel.parts):
            continue
        if p.is_symlink():
            raise RuntimeError('Symlink is not distributable: ' + str(rel))
        if not p.is_file():
            continue
        if p.suffix.lower() in FONTS or p.name.startswith('.env') or p.name in {'server.lock', 'records.json'}:
            raise RuntimeError('Forbidden package input: ' + str(rel))
        if target == 'packages/maps' and rel.as_posix() == 'MANIFEST.sha256':
            continue
        files[target + '/' + rel.as_posix()] = p.read_bytes()
files['README.md'] = (ROOT / 'docs/RELEASE-R4.md').read_bytes()
files['IQUIPAGE-Maps-R4.html'] = (ROOT / 'preview.html').read_bytes()
for folder in ['final', 'r3']:
    for p in sorted((ROOT / 'artifacts' / folder).glob('*')):
        if p.is_file() and p.suffix in {'.json', '.log', '.png'} and 'failure' not in p.name:
            files['packages/maps/evidence/' + folder + '/' + p.name] = p.read_bytes()
files['MANIFEST.sha256'] = ''.join(sha(data) + '  ' + name + '\n' for name, data in sorted(files.items())).encode()
OUT.mkdir(parents=True, exist_ok=True)
archive = OUT / 'IQUIPAGE-Maps-R4.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in sorted(files.items()):
        entry = zipfile.ZipInfo('IQUIPAGE-Maps-R4/' + name, (2026, 9, 10, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        z.writestr(entry, data)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name, data in files.items():
        assert sha(z.read('IQUIPAGE-Maps-R4/' + name)) == sha(data), name
(OUT / 'IQUIPAGE-Maps-R4.html').write_bytes(files['IQUIPAGE-Maps-R4.html'])
(OUT / 'IQUIPAGE-Maps-R4-Verification.json').write_bytes(report_path.read_bytes())
(OUT / 'SHA256SUMS').write_text(''.join(sha(p.read_bytes()) + '  ' + p.name + '\n' for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'SHA256SUMS'))
print(json.dumps({'archive': str(archive), 'files': len(files), 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes()), 'sourceFingerprint': report['sourceFingerprint']}, indent=2))
