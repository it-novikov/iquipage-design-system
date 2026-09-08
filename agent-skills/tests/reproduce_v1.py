from pathlib import Path
import importlib.util, json, copy, hashlib, tempfile
import argparse
p=argparse.ArgumentParser();p.add_argument('--baseline',required=True,type=Path);args=p.parse_args()
ROOT=args.baseline.resolve(strict=True)
s=importlib.util.spec_from_file_location('oldtests', ROOT/'tests/test_tools.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
t=m.GateTests();t.setUp(); rows=[]
def check(id, mutate, desc):
 d=copy.deepcopy(t.r);mutate(d);r=m.gate.validate(d,t.root,t.fp);rows.append({'id':id,'description':desc,'observed_gate_ready':r['gate_ready'],'errors':r['errors']})
check('R01',lambda d:None,'One synthetic check and one file declared as evidence for every dimension receives gate_ready')
check('R02',lambda d:d['verdict'].update(release_ready=False),'Author explicitly says not ready but computed gate_ready still true')
check('R03',lambda d:d.pop('findings'),'Required top-level findings field omitted, runtime validator accepts')
check('R04',lambda d:d['findings'].append(t.finding(status='resolved',verification_check_ids=['C1'])),'Finding can be resolved with generic existing test without repair, timestamp or cross-link')
check('R05',lambda d:d['checks'][0].update(environment={'anything':'arbitrary'}),'No actual browser, input, theme, role or viewport are required by gate')
check('R06',lambda d:d['verdict'].update(summary=''),'Empty verdict summary accepted although schema requires field')
t.tearDown()
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp);(p/'src').mkdir();(p/'src/config.ts').write_text('const config = {"token": "SYNTHETIC_PRIVATE_VALUE", "color":"#fff"};')
 r=m.scanner.scan(p,{'source_roots':['src']}); rows.append({'id':'R07','description':'Quoted credential key bypasses redaction and is copied to candidate snippet','observed_leak':any('SYNTHETIC_PRIVATE_VALUE' in x['snippet'] for x in r['findings'])})
 (p/'src/a.ts').write_text('export const safe = 1;');r=m.scanner.scan(p,{'source_roots':['src'],'excluded_paths':['src/config.ts']}); rows.append({'id':'R08','description':'Excluded application file absent from per-file coverage and skip ledger','status':r['status'],'skipped':r['skipped']})
print(json.dumps({'basis':'Original 1.0 bytes; all files/data synthetic. No product acceptance.', 'cases':rows},ensure_ascii=False,indent=2))
