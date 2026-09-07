#!/usr/bin/env python3
"""Validate audit structure, evidence references and a fail-closed release gate.
This does not prove that reported tests were honestly run or that the UI is good.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path

STATES={'PASS','FAIL','BLOCKED','NOT_RUN','NOT_APPLICABLE'}
DIMENSIONS={'visual','ux','code','accessibility','human-agent','performance'}
SHA=re.compile(r'^[0-9a-f]{64}$')

def validate(data:dict, evidence_root:Path, current_fingerprint:str|None=None)->dict:
    errors=[];blocks=[];seen_evidence=set()
    root=evidence_root.resolve(strict=True)
    if data.get('schema_version')!='1.0':errors.append('Unsupported schema_version')
    if data.get('kind')!='integration-review':errors.append('Gate applies only to kind=integration-review')
    baseline=data.get('baseline',{})
    for k in ['ds_archive_sha256','app_fingerprint']:
        if not isinstance(baseline.get(k),str) or not SHA.fullmatch(baseline[k]):errors.append(f'Invalid baseline.{k}')
    if not current_fingerprint or not SHA.fullmatch(current_fingerprint):blocks.append('No independently supplied current application fingerprint')
    elif baseline.get('app_fingerprint')!=current_fingerprint:errors.append('Report is stale for the current application fingerprint')
    scope=data.get('scope',{})
    if not scope.get('approval_ref'):blocks.append('Scope has no approval reference')
    surfaces=scope.get('surface_ids',[]);required=scope.get('required_check_ids',[])
    if not isinstance(surfaces,list) or not surfaces or len(set(surfaces))!=len(surfaces):errors.append('surface_ids must be a non-empty unique list');surfaces=[]
    if not isinstance(required,list) or not required or len(set(required))!=len(required):errors.append('required_check_ids must be a non-empty unique list');required=[]
    dims=scope.get('required_dimensions',[])
    if not isinstance(dims,list) or set(dims)!=DIMENSIONS:errors.append('All six explicit review dimensions are required')
    def evidence(items,context,mandatory=True):
        if not isinstance(items,list):errors.append(f'{context}: evidence must be a list');return
        if mandatory and not items:errors.append(f'{context}: missing evidence');return
        for e in items:
            if not isinstance(e,dict) or not isinstance(e.get('path'),str) or not SHA.fullmatch(str(e.get('sha256',''))):errors.append(f'{context}: malformed evidence reference');continue
            rel=Path(e['path']);p=root/rel
            if rel.is_absolute() or '..' in rel.parts or '\\' in e['path'] or ':' in e['path'] or not p.resolve().is_relative_to(root):
                errors.append(f'{context}: evidence path escapes its root');continue
            if p.is_symlink() or any(x.is_symlink() for x in p.parents if x!=root and root in x.parents):errors.append(f'{context}: symlink evidence is disallowed');continue
            if not p.is_file():errors.append(f'{context}: missing evidence {e["path"]}');continue
            actual=hashlib.sha256(p.read_bytes()).hexdigest()
            if actual!=e['sha256']:errors.append(f'{context}: evidence hash mismatch {e["path"]}')
            seen_evidence.add(e['path'])
    checks={}
    if not isinstance(data.get('checks'),list):errors.append('checks must be a list')
    for c in data.get('checks',[]):
        cid=c.get('id')
        if not isinstance(cid,str) or not cid or cid in checks:errors.append('Missing/duplicate check ID');continue
        checks[cid]=c
        status=c.get('status')
        if status not in STATES:errors.append(f'{cid}: invalid status');continue
        if c.get('surface_id') not in surfaces:errors.append(f'{cid}: unknown surface_id')
        if c.get('app_fingerprint')!=baseline.get('app_fingerprint'):errors.append(f'{cid}: stale build fingerprint')
        if not c.get('expected') or not c.get('actual'):errors.append(f'{cid}: expected and actual descriptions required')
        if not isinstance(c.get('environment'),dict) or not c['environment']:errors.append(f'{cid}: missing environment')
        if status in {'PASS','FAIL'}:evidence(c.get('evidence'),cid)
        else:
            evidence(c.get('evidence',[]),cid,False)
            if not c.get('reason'):errors.append(f'{cid}: {status} needs reason')
        if status=='NOT_APPLICABLE' and not c.get('approval_ref'):errors.append(f'{cid}: N/A requires an explicit scope decision reference')
        if cid in required and status not in {'PASS','NOT_APPLICABLE'}:blocks.append(f'Required check {cid} is {status}')
    for cid in required:
        if cid not in checks:errors.append(f'Required check missing: {cid}')
    coverage={}
    for item in data.get('coverage',[]):
        sid=item.get('surface_id')
        if sid not in surfaces or sid in coverage:errors.append(f'Unknown/duplicate coverage surface {sid}');continue
        coverage[sid]=item
        if item.get('status') not in STATES:errors.append(f'{sid}: invalid coverage status')
        if item.get('status')!='PASS':blocks.append(f'Surface {sid} is not fully checked')
        ids=item.get('check_ids',[])
        if not ids:blocks.append(f'Surface {sid} has no checks')
        for cid in ids:
            if cid not in checks or checks[cid].get('surface_id')!=sid:errors.append(f'{sid}: incorrect check reference {cid}')
        if item.get('status')=='PASS' and any(checks.get(cid,{}).get('status') not in {'PASS','NOT_APPLICABLE'} for cid in ids):errors.append(f'{sid}: PASS contradicts referenced check')
        evidence(item.get('evidence',[]),f'surface {sid}',item.get('status')=='PASS')
    for sid in surfaces:
        if sid not in coverage:errors.append(f'Missing coverage: {sid}')
    dimensions={}
    for d in data.get('dimensions',[]):
        name=d.get('name')
        if name not in DIMENSIONS or name in dimensions:errors.append('Unknown/duplicate review dimension');continue
        dimensions[name]=d
        if d.get('status') not in STATES:errors.append(f'Dimension {name}: invalid status')
        if d.get('status')!='PASS':blocks.append(f'Dimension {name} is not accepted')
        if not d.get('summary'):errors.append(f'Dimension {name}: missing substantive summary')
        evidence(d.get('evidence',[]),f'dimension {name}',d.get('status')=='PASS')
    for name in DIMENSIONS:
        if name not in dimensions:errors.append(f'Missing review dimension {name}')
    fids=set()
    for f in data.get('findings',[]):
        fid=f.get('id')
        if not fid or fid in fids:errors.append('Missing/duplicate finding id');continue
        fids.add(fid)
        if f.get('severity') not in {'P0','P1','P2','P3'}:errors.append(f'{fid}: invalid severity')
        if f.get('classification') not in {'confirmed','hypothesis'}:errors.append(f'{fid}: distinguish confirmed/hypothesis')
        if f.get('status') not in {'open','resolved','accepted-risk'}:errors.append(f'{fid}: invalid finding status')
        for key in ['title','reproduction','recommendation']:
            if not f.get(key):errors.append(f'{fid}: missing {key}')
        if not f.get('surface_ids') or any(s not in surfaces for s in f['surface_ids']):errors.append(f'{fid}: missing/unknown surfaces')
        evidence(f.get('evidence',[]),f'finding {fid}',f.get('classification')=='confirmed')
        if f.get('status')=='resolved':
            ids=f.get('verification_check_ids',[])
            if not ids or any(checks.get(cid,{}).get('status')!='PASS' for cid in ids):errors.append(f'{fid}: resolved without new PASS verification')
        else:
            if f.get('severity') in {'P0','P1'} or f.get('category') in {'unapproved-ds-bypass','mandatory-ds-gap'}:
                blocks.append(f'{fid}: release-blocking finding is not resolved')
            elif f.get('status')=='open':blocks.append(f'{fid}: unresolved finding has no explicit risk acceptance')
            if f.get('status')=='accepted-risk' and (not f.get('approval_ref') or not f.get('owner')):errors.append(f'{fid}: risk acceptance needs owner and approval')
    # A failed optional test must not vanish from the report narrative.
    for cid,c in checks.items():
        if c.get('status')=='FAIL' and not any(cid in f.get('related_check_ids',[]) for f in data.get('findings',[])):
            errors.append(f'Failed check {cid} has no related finding')
    gate=not errors and not blocks
    claim=data.get('verdict',{}).get('release_ready')
    if not isinstance(claim,bool):errors.append('verdict.release_ready must be boolean')
    if claim is True and not gate:errors.append('Claimed ready contradicts evidence/coverage/gates')
    return {'schema_version':'1.0','structure_valid':not errors,'gate_ready':not errors and not blocks,
            'errors':errors,'blocking_reasons':blocks,'counts':{'surfaces':len(surfaces),'checks':len(checks),'findings':len(fids),'verified_evidence_files':len(seen_evidence)},
            'limitation':'Valid structure is not proof of truthful execution or UI/UX quality. Read raw evidence and test assertions.'}

def main()->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('report',type=Path);p.add_argument('--evidence-root',required=True,type=Path);p.add_argument('--current-fingerprint');p.add_argument('--out',type=Path);p.add_argument('--require-ready',action='store_true')
    a=p.parse_args()
    try:
        data=json.loads(a.report.read_text(encoding='utf-8'))
        if not isinstance(data,dict):raise ValueError('Top-level report must be object')
        result=validate(data,a.evidence_root,a.current_fingerprint)
        text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
        if a.out:
            if a.out.resolve()==a.report.resolve():raise ValueError('Output cannot overwrite input report')
            a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(text,encoding='utf-8')
        print(text,end='')
        return 1 if not result['structure_valid'] else 2 if a.require_ready and not result['gate_ready'] else 0
    except (OSError,ValueError,KeyError,TypeError,AttributeError) as e:print(f'Could not validate: {e}',file=sys.stderr);return 3
if __name__=='__main__':sys.exit(main())
