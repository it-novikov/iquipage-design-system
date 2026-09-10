"""Recheck the delivered ZIP in a fresh directory; never uses a working database."""
from pathlib import Path, PurePosixPath
import tempfile, zipfile, json, hashlib, subprocess, os
OUT = Path(__file__).resolve().parent
archive = OUT / 'Sprintique-Board-B2.zip'
sha = lambda data: hashlib.sha256(data).hexdigest()
root = Path(tempfile.mkdtemp(prefix='board-b2-recheck-'))
with zipfile.ZipFile(archive) as z:
    for name in z.namelist():
        p = PurePosixPath(name)
        assert not p.is_absolute() and '..' not in p.parts
        assert p.suffix.lower() not in {'.ttf', '.otf', '.woff', '.woff2', '.ttc'}
    z.extractall(root)
base = root / 'Sprintique-Board-B2'
module = base / 'packages/maps'
lines = (base / 'MANIFEST.sha256').read_text().splitlines()
for line in lines:
    digest, name = line.split('  ', 1)
    assert sha((base / name).read_bytes()) == digest, name
subprocess.run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=module, check=True, timeout=120)
result = subprocess.run(['npm', 'run', 'verify'], cwd=module, env=os.environ.copy(),
                        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=240)
print(result.stdout)
(OUT / 'clean-recheck.log').write_text(result.stdout)
assert result.returncode == 0
verification = json.loads((module / 'artifacts/final/verification.json').read_text())
original = json.loads((OUT / 'Sprintique-Board-B2-Verification.json').read_text())
assert verification['status'] == 'PASS'
assert verification['sourceFingerprint'] == original['sourceFingerprint']
assert sha((module / 'preview.html').read_bytes()) == sha((OUT / 'Sprintique-Board-B2.html').read_bytes())
report = {'status': 'PASS', 'archiveSha256': sha(archive.read_bytes()),
          'manifestEntries': len(lines), 'nodeTests': verification['nodeTests'],
          'browserScenarios': verification['browserScenarios'],
          'sourceFingerprint': verification['sourceFingerprint'],
          'identicalRebuiltPreview': True, 'recheckDirectory': str(base),
          'checks': verification['checks']}
(OUT / 'archive-recheck.json').write_text(json.dumps(report, indent=2) + '\n')
(OUT / 'SHA256SUMS').write_text(''.join(sha(p.read_bytes()) + '  ' + p.name + '\n'
    for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'SHA256SUMS'))
print(json.dumps(report, indent=2))
