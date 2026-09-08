#!/usr/bin/env python3
"""Read-only IQUIPAGE release verification. Does not execute or extract the DS."""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path, PurePosixPath


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def verify(root: Path, pin: dict, archive: Path | None = None) -> dict:
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError('--ds-root must be an extracted release directory')
    errors: list[str] = []
    warnings: list[str] = []
    manifest = root / 'MANIFEST.sha256'
    if not manifest.is_file() or manifest.is_symlink():
        raise ValueError('Missing or symlinked MANIFEST.sha256; no verification was performed')
    actual_manifest = digest(manifest)
    if actual_manifest != pin['manifest_sha256']:
        errors.append('MANIFEST differs from the explicitly pinned release')
    expected: dict[str, str] = {}
    for number, line in enumerate(manifest.read_text(encoding='utf-8').splitlines(), 1):
        match = re.fullmatch(r'([0-9a-fA-F]{64})\s{2}(.+)', line)
        if not match:
            errors.append(f'Malformed manifest line {number}'); continue
        value, name = match.groups()
        pure = PurePosixPath(name)
        if pure.is_absolute() or '..' in pure.parts or '\\' in name or ':' in name or name in expected:
            errors.append(f'Unsafe or duplicate manifest path at line {number}'); continue
        expected[name] = value.lower()
    if len(expected) != pin['manifest_entries']:
        errors.append('Manifest entry count differs from pin')
    matched = 0
    for name, value in expected.items():
        p = root / name
        if p.is_symlink() or any(x.is_symlink() for x in p.parents if x != root and root in x.parents):
            errors.append(f'Symlink in release: {name}'); continue
        if not p.is_file() or not p.resolve().is_relative_to(root):
            errors.append(f'Missing or unsafe file: {name}'); continue
        if digest(p) != value:
            errors.append(f'Content hash mismatch: {name}')
        else:
            matched += 1
    extras = sorted(str(p.relative_to(root)).replace('\\','/') for p in root.rglob('*')
                    if (p.is_file() or p.is_symlink()) and p != manifest
                    and str(p.relative_to(root)).replace('\\','/') not in expected)
    if extras:
        errors.append('Unmanifested files are present; use a clean release copy, not a build workspace')
    for name, value in pin.get('important_files', {}).items():
        pure=PurePosixPath(name)
        p=root/name
        if pure.is_absolute() or '..' in pure.parts or '\\' in name or ':' in name or not pure.parts:
            errors.append('Unsafe pinned public path');continue
        if not p.resolve().is_relative_to(root) or p.is_symlink() or any(x.is_symlink() for x in p.parents if root in x.parents):
            errors.append('Unsafe pinned public file');continue
        if not p.is_file() or digest(p)!=value:errors.append(f'Pinned public file differs: {name}')
    package_path=root/'package.json'
    if package_path.is_symlink() or not package_path.is_file():
        errors.append('Missing/unsafe package.json');package={}
    else:package=json.loads(package_path.read_text(encoding='utf-8'))
    if package.get('name') != pin['package'] or package.get('version') != pin['version']:
        errors.append('Package identity/version differs from pin')
    archive_sha = None
    if archive is not None:
        if not archive.is_file() or archive.is_symlink():
            raise ValueError('Archive is missing or a symlink')
        archive_sha = digest(archive)
        if archive_sha != pin['archive_sha256']:
            errors.append('ZIP hash differs from pin')
    else:
        warnings.append('Archive bytes not supplied; verified extracted files against the pinned manifest only')
    for issue in pin.get('known_metadata_discrepancies', []):
        warnings.append(f"Known upstream discrepancy: {issue['path']}: {issue['observation']}")
    return {'schema_version':'1.0', 'verification':'PASS' if not errors else 'FAIL',
            'package':package.get('name'), 'version':package.get('version'),
            'manifest_sha256':actual_manifest,'expected_archive_sha256':pin['archive_sha256'],
            'observed_archive_sha256':archive_sha,'manifest_files':len(expected),'matched_files':matched,
            'extra_files':extras,'errors':errors,'warnings':warnings,
            'scope':'Integrity only. Not a runtime, accessibility, UX or application acceptance test.'}


def main() -> int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ds-root',required=True,type=Path)
    p.add_argument('--archive',type=Path)
    p.add_argument('--pin',type=Path,default=Path(__file__).resolve().parent.parent/'assets/ds-release-lock.json')
    p.add_argument('--out',type=Path)
    args=p.parse_args()
    try:
        result=verify(args.ds_root,json.loads(args.pin.read_text(encoding='utf-8')),args.archive)
    except (OSError,ValueError,KeyError,TypeError) as e:
        print(f'Verification could not run: {e}',file=sys.stderr); return 2
    text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.out:
        out=args.out.resolve()
        if out.is_relative_to(args.ds_root.resolve()):
            print('Refusing to write a report inside the immutable DS root',file=sys.stderr);return 2
        if out.exists():
            print('Output exists; choose a new report path',file=sys.stderr);return 2
        out.parent.mkdir(parents=True,exist_ok=True);out.write_text(text,encoding='utf-8')
    print(text,end='')
    return 0 if result['verification']=='PASS' else 1
if __name__=='__main__':sys.exit(main())
