#!/usr/bin/env python3
"""Validate explicit evidence and a separately pinned acceptance plan. No UI truth oracle.
Uses only the emitted schema vocabulary, not a general JSON Schema implementation.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

STATES={'PASS','FAIL','BLOCKED','NOT_RUN','NOT_APPLICABLE'}
DIMENSIONS={'visual','ux','code','accessibility','human-agent','performance'}
SHA=re.compile(r'^[0-9a-f]{64}$')
ASSETS=Path(__file__).resolve().parent.parent/'assets'
LIMIT=100*1024*1024

def canonical_sha(data):
    return hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def schema_errors(value,schema,path='$'):
    """The strict subset used by the bundled schemas; unsupported keywords fail closed."""
    out=[]
    known={'$schema','title','description','type','properties','required','additionalProperties','items','minItems','maxItems','uniqueItems','minLength','pattern','minimum','maximum','enum','const','anyOf'}
    if set(schema)-known:return [f'{path}: unsupported schema keywords {sorted(set(schema)-known)}']
    if 'anyOf' in schema:
        if not any(not schema_errors(value,s,path) for s in schema['anyOf']):out.append(f'{path}: no anyOf alternative matches')
        return out
    if 'const' in schema and (value!=schema['const'] or type(value)!=type(schema['const'])):out.append(f'{path}: wrong constant')
    if 'enum' in schema and not any(type(value)==type(v) and value==v for v in schema['enum']):out.append(f'{path}: invalid enum value')
    def matches(t):
        return {'object':type(value)is dict,'array':type(value)is list,'string':type(value)is str,'boolean':type(value)is bool,'integer':type(value)is int,'null':value is None}.get(t,False)
    types=schema.get('type');types=[types] if isinstance(types,str) else types
    if types and not any(matches(t) for t in types):return out+[f'{path}: wrong type']
    if isinstance(value,dict):
        for k in schema.get('required',[]):
            if k not in value:out.append(f'{path}.{k}: missing required field')
        props=schema.get('properties',{})
        if schema.get('additionalProperties') is False:
            for k in value.keys()-props.keys():out.append(f'{path}.{k}: unknown field')
        for k,v in value.items():
            if k in props:out+=schema_errors(v,props[k],path+'.'+k)
    if type(value)is list:
        if len(value)<schema.get('minItems',0) or len(value)>schema.get('maxItems',10**9):out.append(f'{path}: array length')
        if schema.get('uniqueItems') and len({json.dumps(x,sort_keys=True,ensure_ascii=False) for x in value})!=len(value):out.append(f'{path}: duplicate array item')
        for i,v in enumerate(value):out+=schema_errors(v,schema.get('items',{}),f'{path}[{i}]')
    if isinstance(value,str):
        if len(value.strip())<schema.get('minLength',0):out.append(f'{path}: empty/short text')
        if 'pattern' in schema and not re.search(schema['pattern'],value):out.append(f'{path}: invalid pattern')
    if type(value)is int:
        if value<schema.get('minimum',-10**30) or value>schema.get('maximum',10**30):out.append(f'{path}: out of range')
    return out

def _time(value,errors,context):
    try:
        t=datetime.fromisoformat(value.replace('Z','+00:00'))
        if t.tzinfo is None:raise ValueError('Timezone required')
        return t.astimezone(timezone.utc)
    except (ValueError,TypeError,AttributeError):errors.append(f'{context}: invalid timezone-aware timestamp');return None

def _unique(items,key,errors,context):
    result={}
    for x in items:
        if x[key] in result:errors.append(f'{context}: duplicate {x[key]}')
        result[x[key]]=x
    return result

def _safe_file(root,name):
    rel=Path(name)
    if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name or not rel.parts:raise ValueError('Unsafe evidence path')
    p=root/rel
    if p.is_symlink() or any(x.is_symlink() for x in p.parents if root in x.parents):raise ValueError('Symlink evidence')
    if not p.resolve().is_relative_to(root) or not p.is_file():raise ValueError('Missing/escaping evidence')
    if p.stat().st_size>LIMIT:raise ValueError('Evidence exceeds 100 MiB bound')
    return p

def _hash_file(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def validate(data,evidence_root,current_fingerprint=None,plan=None,plan_sha256=None,current_ds_sha256=None):
    errors=[];blocks=[]
    def output():
        return {'schema_version':'2.0','structure_valid':not errors,'gate_ready':not errors and not blocks,'scope_type':plan.get('scope_type') if isinstance(plan,dict) else None,'errors':errors,'blocking_reasons':blocks,'limitation':'Structural readiness for the independently scoped review only. Does not authenticate approvals, prove execution, evaluate aesthetics, certify the entire product or authorize deployment.'}
    if isinstance(data,dict) and data.get('schema_version')=='1.0':
        # Retain old diagnostics; historical reports never provide a release gate.
        import importlib.util
        s=importlib.util.spec_from_file_location('_iq_legacy',Path(__file__).with_name('legacy_assessment.py'))
        old=importlib.util.module_from_spec(s);s.loader.exec_module(old)
        try:r=old.validate(data,Path(evidence_root),current_fingerprint)
        except (ValueError,TypeError,AttributeError,KeyError,OSError) as e:r={'errors':[f'Malformed legacy report: {type(e).__name__}'],'blocking_reasons':[],'structure_valid':False}
        r['gate_ready']=False;r.setdefault('blocking_reasons',[]).append('Legacy schema 1.0 is diagnostic only; migrate to schema 2.0 and pin an independent plan.')
        return r
    errors+=schema_errors(data,json.loads((ASSETS/'assessment.schema.json').read_text()))
    if errors:return output()
    if plan is None:blocks.append('Independent acceptance plan is required');return output()
    errors+=schema_errors(plan,json.loads((ASSETS/'acceptance-plan.schema.json').read_text()),'plan')
    if errors:return output()
    try:root=Path(evidence_root).resolve(strict=True)
    except OSError:errors.append('Evidence root does not exist');return output()
    b=data['baseline'];sc=data['scope']
    actual_plan_sha=canonical_sha(plan)
    for given,key in [(current_fingerprint,'app_fingerprint'),(current_ds_sha256,'ds_archive_sha256'),(plan_sha256,'plan_sha256')]:
        if not isinstance(given,str) or not SHA.fullmatch(given) or given=='0'*64:blocks.append(f'Independently supplied {key} is required')
        elif b[key]!=given:errors.append(f'baseline.{key}: differs from independent value')
    if actual_plan_sha!=b['plan_sha256'] or (plan_sha256 and actual_plan_sha!=plan_sha256):errors.append('Acceptance plan bytes differ from pinned canonical digest')
    if b['ds_archive_sha256']!=plan['ds_archive_sha256']:errors.append('Plan and report refer to different DS releases')
    if plan['approval']['ref'].upper().startswith(('PENDING','TBD','REPLACE')) or plan['approval']['owner'].upper()=='PENDING':blocks.append('Plan is not approved')
    if sc['plan_id']!=plan['id'] or sc['plan_revision']!=plan['revision']:errors.append('Wrong plan identity/revision')
    surfaces=_unique(plan['surfaces'],'id',errors,'plan.surfaces')
    if set(sc['surface_ids'])!=set(surfaces):errors.append('Report scope differs from independently pinned surfaces')
    specs=_unique(plan['checks'],'id',errors,'plan.checks');checks=_unique(data['checks'],'id',errors,'checks')
    if set(checks)!=set(specs):errors.append('Report checks differ from pinned plan; missing or unplanned check IDs')
    applicable={d for d,a in plan['dimension_applicability'].items() if a['applicable']}
    for d,a in plan['dimension_applicability'].items():
        if not a['applicable'] and not a['approval_ref']:errors.append(f'{d}: N/A applicability lacks a decision')
    if plan['scope_type']=='full-integration' and not {'visual','ux','code','accessibility','performance'}<=applicable:errors.append('Full integration cannot omit core review dimensions')
    for cid,p in specs.items():
        if p['surface_id'] not in surfaces:errors.append(f'{cid}: plan references unknown surface')
        if not set(p['dimensions'])<=applicable:errors.append(f'{cid}: check references inapplicable dimension')
    for sid in surfaces:
        if not any(p['required'] and p['surface_id']==sid for p in specs.values()):errors.append(f'{sid}: no required check planned')
    for d in applicable:
        if not any(p['required'] and d in p['dimensions'] for p in specs.values()):errors.append(f'{d}: no required check planned')
    # At least one substantive review per applicable dimension, not six summaries of one generic log.
    for dim in applicable:
        related=[p for p in specs.values() if p['required'] and dim in p['dimensions']]
        if dim=='visual' and not any(p['method']=='manual-inspection' and 'screenshot' in p['evidence_kinds'] for p in related):
            errors.append('visual: a required inspected screenshot is missing from the plan')
        if dim=='code' and not any('source-review' in p['evidence_kinds'] for p in related):
            errors.append('code: a source review record is required')
        if dim=='performance' and not any('measurement' in p['evidence_kinds'] for p in related):
            errors.append('performance: measured evidence is required')
    ev=_unique(data['evidence'],'id',errors,'evidence');times={};hash_cache={}
    if len({e['path'] for e in ev.values()})!=len(ev):errors.append('One evidence registry ID per physical path; reuse that ID rather than relabeling the same file')
    for eid,e in ev.items():
        times[eid]=_time(e['captured_at'],errors,eid)
        if e['ds_archive_sha256']!=b['ds_archive_sha256']:errors.append(f'{eid}: evidence DS differs')
        try:
            p=_safe_file(root,e['path'])
            if str(p) not in hash_cache:hash_cache[str(p)]=_hash_file(p)
            actual=hash_cache[str(p)]
            if actual!=e['sha256']:errors.append(f'{eid}: evidence hash mismatch')
        except (ValueError,OSError) as exc:errors.append(f'{eid}: {exc}')
    def refs(ids,context,current=False):
        result=[]
        for eid in ids:
            if eid not in ev:errors.append(f'{context}: unknown evidence {eid}');continue
            e=ev[eid];result.append(e)
            if current and e['app_fingerprint']!=b['app_fingerprint']:errors.append(f'{context}: stale evidence fingerprint {eid}')
        return result
    check_times={}
    for cid,c in checks.items():
        p=specs.get(cid)
        if not p:continue
        for k in ['surface_id','dimensions','method','environment']:
            if c[k]!=p[k]:errors.append(f'{cid}: {k} differs from expected plan')
        if c['app_fingerprint']!=b['app_fingerprint'] or c['ds_archive_sha256']!=b['ds_archive_sha256']:errors.append(f'{cid}: stale build or DS')
        evidence=refs(c['evidence_ids'],cid,True)
        if c['status'] in {'PASS','FAIL'}:
            check_times[cid]=_time(c['executed_at'],errors,cid)
            if not evidence:errors.append(f'{cid}: executed check needs evidence')
            kinds={e['kind'] for e in evidence}
            if not set(p['evidence_kinds'])<=kinds:errors.append(f'{cid}: required evidence kind missing')
        else:
            if not c['reason']:errors.append(f'{cid}: nonexecuted check needs reason')
            if c['status']=='NOT_APPLICABLE' and (not p['na_approval_ref'] or c['approval_ref']!=p['na_approval_ref']):errors.append(f'{cid}: N/A not authorized in pinned plan')
        if p['required'] and c['status'] not in {'PASS','NOT_APPLICABLE'}:blocks.append(f'{cid}: required check is {c["status"]}')
    coverage=_unique(data['coverage'],'surface_id',errors,'coverage')
    if set(coverage)!=set(surfaces):errors.append('Coverage differs from plan surfaces')
    for sid,c in coverage.items():
        expected={p['id'] for p in specs.values() if p['surface_id']==sid and p['required']}
        if not expected<=set(c['check_ids']):errors.append(f'{sid}: required checks missing from coverage')
        for cid in c['check_ids']:
            if cid not in checks or checks[cid]['surface_id']!=sid:errors.append(f'{sid}: unrelated coverage check')
        if not any(checks.get(cid,{}).get('status')=='PASS' for cid in expected):blocks.append(f'{sid}: no required case actually passed')
        if c['status']!='PASS':blocks.append(f'{sid}: surface not accepted')
        elif any(checks.get(cid,{}).get('status') not in {'PASS','NOT_APPLICABLE'} for cid in expected):errors.append(f'{sid}: PASS contradicts required checks')
    dims=_unique(data['dimensions'],'name',errors,'dimensions')
    if set(dims)!=DIMENSIONS:errors.append('All six applicability decisions must be explicit')
    for d,v in dims.items():
        a=plan['dimension_applicability'][d]
        if not a['applicable']:
            if v['status']!='NOT_APPLICABLE' or v['approval_ref']!=a['approval_ref'] or v['check_ids']:errors.append(f'{d}: inapplicable dimension misrepresented')
            continue
        wanted={c['id'] for c in specs.values() if c['required'] and d in c['dimensions']}
        if not wanted<=set(v['check_ids']):errors.append(f'{d}: missing dimensional checks')
        for cid in v['check_ids']:
            if cid not in checks or d not in checks[cid]['dimensions']:errors.append(f'{d}: unrelated dimensional check')
        if not any(checks.get(cid,{}).get('status')=='PASS' for cid in wanted):blocks.append(f'{d}: applicable dimension has no actual PASS')
        if v['status']!='PASS':blocks.append(f'{d}: dimension not accepted')
        elif any(checks.get(cid,{}).get('status') not in {'PASS','NOT_APPLICABLE'} for cid in wanted):errors.append(f'{d}: PASS contradicts checks')
    findings=_unique(data['findings'],'id',errors,'findings');accepts=_unique(plan['risk_acceptances'],'finding_id',errors,'risk_acceptances')
    if not set(plan['known_finding_ids'])<=set(findings):errors.append('Previously pinned findings were dropped from the report')
    if not set(accepts)<=set(findings):errors.append('Risk acceptance refers to a finding absent from the report')
    for fid,f in findings.items():
        if not set(f['surface_ids'])<=set(surfaces) or not set(f['dimensions'])<=applicable:errors.append(f'{fid}: unknown surface/dimension')
        refs(f['evidence_ids'],fid)
        if f['classification']=='confirmed' and not f['evidence_ids']:errors.append(f'{fid}: confirmed issue lacks evidence')
        detected=_time(f['detected_at'],errors,fid)
        for cid in f['related_check_ids']:
            if cid not in checks:errors.append(f'{fid}: unknown related check {cid}')
        if f['status']=='dismissed':
            decision=f.get('dismissal')
            if f['classification']!='hypothesis' or not decision:
                errors.append(f'{fid}: dismissal requires an investigated hypothesis and explicit decision');continue
            reviewed=_time(decision['reviewed_at'],errors,fid+'.dismissal')
            if detected and reviewed and reviewed<=detected:errors.append(f'{fid}: dismissal predates investigation')
            relevant=set()
            for cid in decision['verification_check_ids']:
                c=checks.get(cid)
                if not c or c['status']!='PASS' or fid not in c['finding_ids'] or c['surface_id'] not in f['surface_ids'] or not set(c['dimensions'])&set(f['dimensions']):
                    errors.append(f'{fid}: dismissal lacks relevant reciprocal verification');continue
                relevant.add(c['surface_id'])
                ct=check_times.get(cid)
                if not ct or (detected and ct<=detected) or (reviewed and ct>reviewed):errors.append(f'{fid}: dismissal timing invalid')
                for eid in c['evidence_ids']:
                    if detected and times.get(eid) and times[eid]<=detected:errors.append(f'{fid}: stale dismissal evidence')
            if not set(f['surface_ids'])<=relevant:errors.append(f'{fid}: not all surfaces investigated for dismissal')
        elif f['status']=='resolved':
            fix=f['repair']
            if fix is None:errors.append(f'{fid}: no repair record');continue
            if f['classification']!='confirmed':errors.append(f'{fid}: hypothesis cannot masquerade as repaired confirmed issue')
            if fix['app_fingerprint']!=b['app_fingerprint']:errors.append(f'{fid}: repair fingerprint differs')
            if f['detected_fingerprint']==b['app_fingerprint']:errors.append(f'{fid}: unchanged fingerprint cannot prove a code repair')
            verified=_time(fix['verified_at'],errors,f'{fid}.repair');covered=set()
            if detected and verified and verified<=detected:errors.append(f'{fid}: repair verification is not newer than detection')
            for cid in fix['verification_check_ids']:
                c=checks.get(cid)
                if not c or c['status']!='PASS' or fid not in c['finding_ids']:errors.append(f'{fid}: repair lacks reciprocal dedicated PASS check');continue
                if c['surface_id'] not in f['surface_ids'] or not set(c['dimensions'])&set(f['dimensions']):errors.append(f'{fid}: unrelated repair verification')
                covered.add(c['surface_id'])
                ct=check_times.get(cid)
                if detected and (not ct or ct<=detected):errors.append(f'{fid}: verification test predates finding')
                if verified and ct and ct>verified:errors.append(f'{fid}: repair claimed before verification executed')
                for eid in c['evidence_ids']:
                    if detected and times.get(eid) and times[eid]<=detected:errors.append(f'{fid}: stale repair evidence')
            if not set(f['surface_ids'])<=covered:errors.append(f'{fid}: not all affected surfaces rechecked')
        else:
            blocking=f['severity'] in {'P0','P1'} or f['category'] in {'unapproved-ds-bypass','mandatory-ds-gap'}
            if blocking:blocks.append(f'{fid}: blocking finding not resolved')
            elif f['status']=='open':blocks.append(f'{fid}: open finding without accepted risk')
            if f['status']=='accepted-risk':
                a=accepts.get(fid)
                if not a or not f['owner'] or f['approval_ref']!=a['approval_ref'] or f['owner']!=a['owner']:errors.append(f'{fid}: risk acceptance differs from pinned decision')
    for cid,c in checks.items():
        for fid in c['finding_ids']:
            if fid not in findings:errors.append(f'{cid}: unknown finding ID')
        if c['status']=='FAIL' and not any(cid in f['related_check_ids'] for f in findings.values()):errors.append(f'{cid}: failed check has no related finding')
    if not data['verdict']['scope_ready']:blocks.append('Reviewer explicitly withholds scope readiness')
    elif errors or blocks:errors.append('Claimed ready contradicts plan/evidence/coverage')
    return output()

def load_json(path):
    if path.stat().st_size>10*1024*1024:raise ValueError('JSON input exceeds 10 MiB')
    def pairs(items):
        d={}
        for k,v in items:
            if k in d:raise ValueError('Duplicate JSON key: '+k)
            d[k]=v
        return d
    return json.loads(path.read_text(encoding='utf-8'),object_pairs_hook=pairs,parse_constant=lambda x:(_ for _ in ()).throw(ValueError('Non-finite JSON number')))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('report',type=Path);p.add_argument('--evidence-root',required=True,type=Path);p.add_argument('--current-fingerprint');p.add_argument('--ds-archive-sha256');p.add_argument('--plan',type=Path);p.add_argument('--plan-sha256');p.add_argument('--out',type=Path);p.add_argument('--require-ready',action='store_true')
    a=p.parse_args()
    try:
        result=validate(load_json(a.report),a.evidence_root,a.current_fingerprint,load_json(a.plan) if a.plan else None,a.plan_sha256,a.ds_archive_sha256)
        text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
        if a.out:
            if a.out.exists():raise ValueError('Output exists; choose a new evidence file')
            a.out.parent.mkdir(parents=True,exist_ok=True)
            with a.out.open('x',encoding='utf-8') as f:f.write(text)
        print(text,end='');return 1 if not result['structure_valid'] else 2 if a.require_ready and not result['gate_ready'] else 0
    except (OSError,ValueError,KeyError,TypeError,AttributeError,RecursionError) as e:print(f'Validation unavailable: {e}',file=sys.stderr);return 3
if __name__=='__main__':sys.exit(main())
