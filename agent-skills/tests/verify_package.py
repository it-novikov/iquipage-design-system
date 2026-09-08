#!/usr/bin/env python3
"""Verify the local skill suite file manifest. No network or code execution."""
from pathlib import Path,PurePosixPath
import hashlib,json,re,sys
root=Path(__file__).resolve().parents[1]
manifest=root/'MANIFEST.sha256';errors=[];expected={}
if not manifest.is_file():
    print('MANIFEST.sha256 is missing',file=sys.stderr);sys.exit(2)
for line in manifest.read_text().splitlines():
    m=re.fullmatch('([0-9a-f]{64})  (.+)',line)
    if not m:errors.append('Invalid manifest line');continue
    h,name=m.groups();pp=PurePosixPath(name)
    if pp.is_absolute() or '..' in pp.parts or '\\' in name or name in expected:
        errors.append('Unsafe/duplicate manifest path');continue
    expected[name]=h;p=root/name
    if p.is_symlink() or any(parent.is_symlink() for parent in p.parents if root in parent.parents) or not p.is_file() or not p.resolve().is_relative_to(root):
        errors.append(f'Missing/unsafe file {name}');continue
    if hashlib.sha256(p.read_bytes()).hexdigest()!=h:errors.append(f'Hash mismatch {name}')
actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p!=manifest and '__pycache__' not in p.parts}
extra=sorted(actual-set(expected))
if extra:errors.append('Unmanifested files present')
print(json.dumps({'status':'PASS' if not errors else 'FAIL','manifest_entries':len(expected),'extra_files':extra,'errors':errors,'scope':'File integrity only; not model or product acceptance.'},indent=2))
sys.exit(0 if not errors else 1)
