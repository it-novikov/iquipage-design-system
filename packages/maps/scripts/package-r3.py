"""Package the verified R3 without runtime databases, credentials or font files."""
from pathlib import Path
import hashlib, json, subprocess, zipfile
ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
OUT = REPO / 'deliveries/maps-r3'
PREFIX = 'IQUIPAGE-Maps-R3/'
DENY = {'.git', '.build', '.dev-state', 'node_modules', '.venv', '__pycache__', 'artifacts'}
FONTS = {'.ttf', '.otf', '.woff', '.woff2', '.ttc'}
sha = lambda data: hashlib.sha256(data).hexdigest()
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
files['README.md'] = (ROOT / 'docs/RELEASE-R3.md').read_bytes()
files['IQUIPAGE-Maps-R3.html'] = (ROOT / 'preview.html').read_bytes()
for source, name in [('browser-report.json', 'browser-release.json'), ('preview-report.json', 'preview-release.json')]:
    data = (ROOT / 'artifacts/r3' / source).read_bytes()
    if json.loads(data)['status'] != 'PASS':
        raise RuntimeError('A required browser report has not passed')
    files['packages/maps/evidence/r3/' + name] = data
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
report = {'release': 'R3', 'sourceCommit': commit, 'nodeTests': 62, 'browserScenarios': 13,
          'offlinePreview': 'PASS', 'scope': 'local-reference',
          'previewSha256': sha(files['IQUIPAGE-Maps-R3.html']),
          'baseManifestSha256': sha((REPO / 'design-system/MANIFEST.sha256').read_bytes()),
          'notIncluded': ['unverified transactional outbox', 'production Sprintique adapter', 'live LLM', 'multi-user editing'],
          'notTested': ['real touch devices', 'screen readers', 'Safari/WebKit']}
report_bytes = (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode()
files['packages/maps/evidence/r3/verification-release.json'] = report_bytes
manifest = ''.join(sha(data) + '  ' + name + '\n' for name, data in sorted(files.items()))
files['MANIFEST.sha256'] = manifest.encode()
OUT.mkdir(parents=True, exist_ok=True)
archive = OUT / 'IQUIPAGE-Maps-R3.zip'
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
(OUT / 'IQUIPAGE-Maps-R3.html').write_bytes(files['IQUIPAGE-Maps-R3.html'])
(OUT / 'IQUIPAGE-Maps-R3-Verification.json').write_bytes(report_bytes)
(OUT / 'SHA256SUMS').write_text(''.join(sha(p.read_bytes()) + '  ' + p.name + '\n' for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'SHA256SUMS'))
print(json.dumps({'archive': str(archive), 'files': len(files), 'bytes': archive.stat().st_size, 'sha256': sha(archive.read_bytes())}, indent=2))
