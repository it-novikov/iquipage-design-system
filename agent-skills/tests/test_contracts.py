#!/usr/bin/env python3
"""Schema/frontmatter/cross-skill contracts and CLI exit codes; synthetic data only."""
import copy,hashlib,json,subprocess,sys,tempfile,unittest
from pathlib import Path
from test_review_hardening import gate,fixture
ROOT=Path(__file__).resolve().parents[1];S=ROOT/'skills/iquipage-review/scripts';A=ROOT/'skills/iquipage-review/assets'
try:import jsonschema,yaml
except ImportError:jsonschema=yaml=None

@unittest.skipIf(jsonschema is None,'Developer verification requires jsonschema and PyYAML; not a helper runtime dependency')
class ContractTests(unittest.TestCase):
    def test_published_schemas_are_valid(self):
        for f in ['assessment.schema.json','acceptance-plan.schema.json']:
            jsonschema.Draft202012Validator.check_schema(json.loads((A/f).read_text()))
    def test_templates_validate_but_are_not_run(self):
        for a,b in [('assessment.schema.json','assessment.example.json'),('acceptance-plan.schema.json','acceptance-plan.example.json')]:
            schema=json.loads((A/a).read_text());data=json.loads((A/b).read_text());jsonschema.Draft202012Validator(schema).validate(data);self.assertEqual(gate.schema_errors(data,schema),[])
        self.assertFalse(json.loads((A/'assessment.example.json').read_text())['verdict']['scope_ready'])
    def test_emitted_subset_agrees_on_fixture_and_mutations(self):
        with tempfile.TemporaryDirectory() as tmp:
            p,r=fixture(Path(tmp));schema=json.loads((A/'assessment.schema.json').read_text());v=jsonschema.Draft202012Validator(schema)
            variants=[r]
            for key in r:
                x=copy.deepcopy(r);x.pop(key);variants.append(x)
                x=copy.deepcopy(r);x[key]=None;variants.append(x)
            for x in variants:self.assertEqual(bool(gate.schema_errors(x,schema)),bool(list(v.iter_errors(x))))
    def test_frontmatter_yaml_and_default_prompts(self):
        for folder in (ROOT/'skills').iterdir():
            text=(folder/'SKILL.md').read_text();fm=yaml.safe_load(text.split('---',2)[1]);self.assertEqual(fm['name'],folder.name);self.assertLessEqual(len(fm['description']),1024);self.assertLessEqual(len(fm['compatibility']),500);self.assertTrue(all(isinstance(v,str) for v in fm['metadata'].values()));self.assertEqual(fm['metadata']['suite-version'],'1.1.0')
            ui=yaml.safe_load((folder/'agents/openai.yaml').read_text());self.assertIn('$'+folder.name,ui['interface']['default_prompt'])
    def test_shared_new_rules_identical(self):
        for file in ['execution-contract.md','design-review.md']:
            hs={hashlib.sha256((s/'references'/file).read_bytes()).hexdigest() for s in (ROOT/'skills').iterdir()};self.assertEqual(len(hs),1)
    def test_plan_copy_identical(self):
        for file in ['acceptance-plan.schema.json','acceptance-plan.example.json']:
            self.assertEqual((A/file).read_bytes(),(ROOT/'skills/iquipage-implement/assets'/file).read_bytes())
    def test_model_cases_remain_not_run(self):
        d=json.loads((ROOT/'examples/evaluation-cases.json').read_text());self.assertEqual(len(d['cases']),40);self.assertEqual(len({c['id'] for c in d['cases']}),40);self.assertTrue(all(c['status']=='NOT_RUN' for c in d['cases']))
    def test_pinned_ds_unchanged(self):
        suite=json.loads((ROOT/'suite.json').read_text())
        for skill in (ROOT/'skills').iterdir():self.assertEqual(json.loads((skill/'assets/ds-release-lock.json').read_text())['archive_sha256'],suite['ds_baseline']['archive_sha256'])

class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.p,self.r=fixture(self.root);self.plan=self.root/'plan.json';self.report=self.root/'report.json'
    def tearDown(self):self.tmp.cleanup()
    def run_gate(self,extras=()):
        self.plan.write_text(json.dumps(self.p));self.report.write_text(json.dumps(self.r));cmd=[sys.executable,str(S/'validate_assessment.py'),str(self.report),'--plan',str(self.plan),'--evidence-root',str(self.root),'--current-fingerprint','a'*64,'--ds-archive-sha256',self.p['ds_archive_sha256'],'--plan-sha256',gate.canonical_sha(self.p),*extras]
        return subprocess.run(cmd,capture_output=True,text=True,timeout=10)
    def test_positive_exit_zero(self):self.assertEqual(self.run_gate(['--require-ready']).returncode,0)
    def test_withheld_ready_exit_two(self):self.r['verdict']['scope_ready']=False;self.assertEqual(self.run_gate(['--require-ready']).returncode,2)
    def test_diagnostic_exit_zero_without_ready_claim(self):self.r['verdict']['scope_ready']=False;r=self.run_gate();self.assertEqual(r.returncode,0);self.assertFalse(json.loads(r.stdout)['gate_ready'])
    def test_missing_fields_exit_one(self):self.r.pop('findings');self.assertEqual(self.run_gate().returncode,1)
    def test_no_overwrite_existing_report(self):
        out=self.root/'old-output.json';out.write_text('PRESERVE');r=self.run_gate(['--out',str(out)]);self.assertEqual(r.returncode,3);self.assertEqual(out.read_text(),'PRESERVE')
    def test_scanner_no_overwrite_config(self):
        (self.root/'src').mkdir();(self.root/'src/a.ts').write_text('const a=1');cfg=self.root/'cfg.json';cfg.write_text('{"source_roots":["src"]}');old=cfg.read_bytes();p=subprocess.run([sys.executable,str(S/'integration_scan.py'),'--root',str(self.root),'--config',str(cfg),'--out',str(cfg)],capture_output=True,timeout=10);self.assertNotEqual(p.returncode,0);self.assertEqual(cfg.read_bytes(),old)
    def test_fingerprint_no_overwrite_input(self):
        code=self.root/'a.ts';code.write_text('const a=1');inp=self.root/'inputs.json';inp.write_text('["a.ts"]');p=subprocess.run([sys.executable,str(S/'fingerprint_inputs.py'),'--root',str(self.root),'--inputs',str(inp),'--out',str(code)],capture_output=True,timeout=10);self.assertNotEqual(p.returncode,0);self.assertEqual(code.read_text(),'const a=1')

if __name__=='__main__':unittest.main(verbosity=2)
