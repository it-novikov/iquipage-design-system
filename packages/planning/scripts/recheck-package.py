"""Verify a delivered ZIP in an owned temporary directory; never use a user's database."""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, tempfile, zipfile
parser = argparse.ArgumentParser()
parser.add_argument('delivery', type=Path)
args = parser.parse_args()
delivery = args.delivery.resolve()
archive = delivery / 'Sprintique-UX-R3.zip'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
steps = []; result = {'archiveIntegrity': 'NOT_RUN', 'acceptance': 'NOT_RUN', 'rebuildIdentical': False}
def run(name, command, cwd):
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True, timeout=300)
    (delivery / (name + '.log')).write_text(completed.stdout + completed.stderr)
    steps.append({'name': name, 'exitCode': completed.returncode})
    if completed.returncode: raise RuntimeError(name + ' failed')
try:
    with tempfile.TemporaryDirectory(prefix='sprintique-planning-clean-') as temporary:
        base = Path(temporary).resolve()
        with zipfile.ZipFile(archive) as zipped:
            names = zipped.namelist()
            if len(names) != len(set(names)): raise ValueError('Duplicate archive entry')
            for name in names:
                if not (base / name).resolve().is_relative_to(base): raise ValueError('Unsafe archive path')
            zipped.extractall(base)
        root = base / 'Sprintique-UX-R3'
        lines = (root / 'MANIFEST.sha256').read_text().splitlines()
        for line in lines:
            digest, name = line.split('  ', 1)
            path = (root / name).resolve()
            if not path.is_relative_to(root) or sha(path) != digest: raise ValueError('Manifest mismatch: ' + name)
        result.update(archiveIntegrity='PASS', manifestEntries=len(lines))
        for package in ['maps', 'work-list', 'planning']:
            run(package + '-install', ['npm', 'ci', '--ignore-scripts', '--no-fund', '--no-audit'], root / 'packages' / package)
        run('clean-verify', ['npm', 'run', 'verify'], root / 'packages/planning')
        report = json.loads((root / 'packages/planning/evidence/verification.json').read_text())
        if report['status'] != 'PASS': raise RuntimeError('Clean verification did not pass')
        generated = root / 'packages/planning/dist/Sprintique-UX-R3.html'
        result['rebuildIdentical'] = sha(generated) == sha(delivery / 'Sprintique-UX-R3.html')
        if not result['rebuildIdentical']: raise RuntimeError('Rebuilt HTML differs')
        original = json.loads((delivery / 'verification.json').read_text())
        if original['sourceFingerprint'] != report['sourceFingerprint']: raise RuntimeError('Source fingerprint differs')
        result.update(acceptance='PASS', nodeTests=report['nodeTests'], baseNodeTests=report['baseNodeTests'], browserScenarios=report['browserScenarios'], sourceFingerprint=report['sourceFingerprint'])
except Exception as error:
    result.update(acceptance='FAIL', error=str(error))
result.update(steps=steps, scope='clean frontend consumer and local fixtures', backendIntegrated=False, productionReady=False)
(delivery / 'clean-recheck.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
if result['acceptance'] != 'PASS': raise SystemExit(1)
