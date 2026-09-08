#!/usr/bin/env python3
"""Hash explicitly listed application/build inputs without executing them.
This is an identity helper, not proof that the caller listed all required inputs.
"""
from __future__ import annotations
import argparse,hashlib,json,sys
from pathlib import Path

def snapshot(root:Path,inputs:list[str])->dict:
    root=root.resolve(strict=True)
    if not root.is_dir() or not isinstance(inputs,list) or not inputs:raise ValueError('Provide project directory and explicit non-empty input file list')
    if any(not isinstance(x,str) for x in inputs) or len(set(inputs))!=len(inputs):raise ValueError('Input paths must be unique strings')
    records=[]
    for name in sorted(inputs):
        rel=Path(name)
        if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name or not rel.parts:raise ValueError('Use normalized relative paths')
        p=root/rel
        if p.is_symlink() or any(x.is_symlink() for x in p.parents if root in x.parents) or not p.resolve().is_relative_to(root):raise ValueError('Symlink/escaping input refused')
        if not p.is_file():raise ValueError('Each input must be an existing file: '+name)
        if p.name.startswith('.env') or any(x in {'secrets','credentials'} for x in rel.parts):raise ValueError('Do not include secret files; use approved configuration identity instead')
        h=hashlib.sha256()
        with p.open('rb') as f:
            for b in iter(lambda:f.read(1048576),b''):h.update(b)
        records.append({'path':rel.as_posix(),'sha256':h.hexdigest()})
    fp=hashlib.sha256(json.dumps(records,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return {'schema_version':'1.1','kind':'explicit-input-fingerprint','app_fingerprint':fp,'files':records,'limitation':'Hash identity only. Caller/reviewer must establish completeness of source, build, lockfile, runtime and non-secret configuration inputs.'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',required=True,type=Path);p.add_argument('--inputs',required=True,type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args()
    try:
        inputs=json.loads(a.inputs.read_text());r=snapshot(a.root,inputs)
        a.out.parent.mkdir(parents=True,exist_ok=True)
        with a.out.open('x',encoding='utf-8') as f:json.dump(r,f,ensure_ascii=False,indent=2);f.write('\n')
        print(r['app_fingerprint']);return 0
    except (OSError,ValueError,TypeError) as e:print(str(e),file=sys.stderr);return 2
if __name__=='__main__':sys.exit(main())
