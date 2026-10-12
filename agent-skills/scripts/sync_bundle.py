#!/usr/bin/env python3
"""Synchronize authored suite copies/manifests. Default: check only; no network.

Shared references are authored in discovery; templates in templates/. Each skill
stays independently installable. --client-root is explicit and touches only the
four names in suite.json; unknown client files are never deleted.
"""
from pathlib import Path
import argparse
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
SHARED = ['execution-contract.md', 'design-review.md', 'constitution.md',
          'release-map.md', 'gap-protocol.md', 'human-agent.md', 'quality-method.md',
          'sources.md', 'capability-index.json', 'problem-first.md']


def files(root):
    result = {}
    for path in sorted(root.rglob('*')):
        if '__pycache__' in path.parts:
            continue
        if path.is_symlink():
            raise ValueError(f'Symlink is not supported: {path}')
        if path.is_file():
            result[path.relative_to(root).as_posix()] = path
    return result


def manifest(root):
    return ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}\n'
                   for name, path in files(root).items() if name != 'MANIFEST.sha256').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='report drift without writes (default)')
    mode.add_argument('--write', action='store_true', help='write reviewed copies and manifests')
    parser.add_argument('--client-root', type=Path, help='optional existing/desired .agents/skills directory')
    args = parser.parse_args()
    names = json.loads((ROOT / 'suite.json').read_text())['skills']
    if len(names) != 4 or any(not name.startswith('iquipage-') or '/' in name or '..' in name for name in names):
        raise ValueError('Expected the four named IQUIPAGE skills')
    folders = [ROOT / 'skills' / name for name in names]
    files(ROOT)  # Refuse symlinks before any write.
    client = args.client_root.absolute() if args.client_root else None
    if client:
        if client.is_symlink() or any(p.is_symlink() for p in client.parents):
            raise ValueError('Client root must not traverse a symlink')
        for folder in folders:
            destination = client / folder.name
            if destination.is_symlink():
                raise ValueError(f'Client skill is a symlink: {destination}')
            extra = set(files(destination)) - set(files(folder))
            if extra:
                raise ValueError(f'Unknown client files in {folder.name}; review manually: {sorted(extra)}')

    changed = []

    def sync(path, content):
        if path.is_file() and path.read_bytes() == content:
            return
        changed.append(str(path))
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

    common = ROOT / 'skills' / 'iquipage-discovery' / 'references'
    for folder in folders:
        for name in SHARED:
            sync(folder / 'references' / name, (common / name).read_bytes())
        for template in sorted((ROOT / 'templates').glob('*.md')):
            destination = folder / 'assets' / template.name
            if destination.exists() or template.name == 'solution-brief.md':
                sync(destination, template.read_bytes())
        sync(folder / 'MANIFEST.sha256', manifest(folder))

    # Run again after --write: manifests then describe the written, independent skills.
    if client:
        for folder in folders:
            for name, source in files(folder).items():
                sync(client / folder.name / name, source.read_bytes())
    sync(ROOT / 'MANIFEST.sha256', manifest(ROOT))
    print(json.dumps({'mode': 'write' if args.write else 'check', 'changed': changed,
                      'status': 'UPDATED' if changed and args.write else 'DRIFT' if changed else 'PASS',
                      'scope': 'Copy/file integrity only; not model or product acceptance.'}, indent=2))
    return 0 if args.write or not changed else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
