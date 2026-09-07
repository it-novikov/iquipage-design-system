#!/usr/bin/env python3
"""Deterministic tests of skill helpers on synthetic fixtures, not product QA."""
from __future__ import annotations
import copy, hashlib, importlib.util, json, os, tempfile, unittest, sys
sys.dont_write_bytecode=True
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SCRIPTS=ROOT/'skills/iquipage-review/scripts'

def load(name):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
verify=load('verify_release');scanner=load('integration_scan');gate=load('validate_assessment');capture=load('capture_surface')
def sha(b):return hashlib.sha256(b).hexdigest()

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/'ds';self.root.mkdir()
        (self.root/'package.json').write_text(json.dumps({'name':'@test/ds','version':'1.0'}))
        (self.root/'runtime.js').write_text('export const fixture = true;')
        manifest=''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in sorted(self.root.iterdir()))
        (self.root/'MANIFEST.sha256').write_text(manifest)
        self.pin={'manifest_sha256':sha(manifest.encode()),'manifest_entries':2,'package':'@test/ds','version':'1.0','archive_sha256':'a'*64,'important_files':{'runtime.js':sha((self.root/'runtime.js').read_bytes())}}
    def tearDown(self):self.temp.cleanup()
    def test_clean(self):self.assertEqual(verify.verify(self.root,self.pin)['verification'],'PASS')
    def test_tamper(self):
        (self.root/'runtime.js').write_text('tampered')
        self.assertEqual(verify.verify(self.root,self.pin)['verification'],'FAIL')
    def test_missing(self):
        (self.root/'runtime.js').unlink();self.assertEqual(verify.verify(self.root,self.pin)['verification'],'FAIL')
    def test_extra(self):
        (self.root/'unapproved.css').write_text('x');self.assertTrue(verify.verify(self.root,self.pin)['extra_files'])
    def test_manifest_change(self):
        (self.root/'MANIFEST.sha256').write_text('wrong');self.assertEqual(verify.verify(self.root,self.pin)['verification'],'FAIL')
    def test_path_traversal(self):
        (self.root/'MANIFEST.sha256').write_text('a'*64+'  ../outside\n');self.assertEqual(verify.verify(self.root,self.pin)['verification'],'FAIL')
    def test_archive_mismatch(self):
        p=Path(self.temp.name)/'x.zip';p.write_bytes(b'synthetic');self.assertIn('ZIP hash differs from pin',verify.verify(self.root,self.pin,p)['errors'])
    def test_archive_match(self):
        p=Path(self.temp.name)/'x.zip';p.write_bytes(b'synthetic');self.pin['archive_sha256']=sha(p.read_bytes());self.assertEqual(verify.verify(self.root,self.pin,p)['verification'],'PASS')
    def test_symlink(self):
        target=self.root/'runtime.js';outside=Path(self.temp.name)/'other';outside.write_bytes(target.read_bytes());target.unlink();target.symlink_to(outside)
        self.assertEqual(verify.verify(self.root,self.pin)['verification'],'FAIL')

class ScanTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'src').mkdir()
        self.cfg={'source_roots':['src'],'vendor_roots':['vendor/iquipage'],'adapter_roots':['src/adapters'],'excluded_paths':[]}
    def tearDown(self):self.temp.cleanup()
    def make(self,text,name='src/example.tsx'):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);return p
    def rules(self,result):return {f['rule_id'] for f in result['findings']}
    def test_supplied_button_allowed(self):
        self.make('<button className="iq-btn primary">Сохранить</button>');self.assertNotIn('IQ013',self.rules(scanner.scan(self.root,self.cfg)))
    def test_native_button_candidate_not_failure(self):
        self.make('<button>Save</button>');r=scanner.scan(self.root,self.cfg);self.assertIn('IQ013',self.rules(r));self.assertEqual(r['status'],'SCANNED');self.assertEqual(r['findings'][0]['disposition'],'needs-review')
    def test_native_date(self):
        self.make('<input type="date">');self.assertIn('IQ005',self.rules(scanner.scan(self.root,self.cfg)))
    def test_internal_import(self):
        self.make("import thing from '@iquipage/web/dist/modules/date-field.js'");self.assertIn('IQ001',self.rules(scanner.scan(self.root,self.cfg)))
    def test_vendor_excluded(self):
        self.make('export const a = 1;');self.make('a{color:#fff!important}','vendor/iquipage/x.css');self.assertEqual(scanner.scan(self.root,self.cfg)['files_scanned'],1)
    def test_adapter_not_waiver(self):
        self.make('x{outline:none!important}','src/adapters/a.css');r=scanner.scan(self.root,self.cfg);self.assertTrue(all(f['adapter_candidate'] for f in r['findings']));self.assertIn('IQ006',self.rules(r))
    def test_missing_root(self):
        self.cfg['source_roots']=['nope'];self.assertEqual(scanner.scan(self.root,self.cfg)['status'],'INCOMPLETE')
    def test_no_sources(self):
        with self.assertRaises(ValueError):scanner.scan(self.root,{})
    def test_escape_root(self):
        self.cfg['source_roots']=['../external'];
        with self.assertRaises(ValueError):scanner.scan(self.root,self.cfg)
    def test_fingerprint_changes(self):
        p=self.make('const n = 1');a=scanner.scan(self.root,self.cfg)['source_snapshot_sha256'];p.write_text('const n = 2');self.assertNotEqual(a,scanner.scan(self.root,self.cfg)['source_snapshot_sha256'])
    def test_symlink_is_skipped(self):
        p=self.make('source');(self.root/'src/link.ts').symlink_to(p);self.assertEqual(scanner.scan(self.root,self.cfg)['status'],'INCOMPLETE')
    def test_large_file_visible(self):
        self.make('x'*101);self.cfg['max_file_bytes']=100;self.assertEqual(scanner.scan(self.root,self.cfg)['skipped'][0]['reason'],'file-size-limit')
    def test_annotation_not_suppression(self):
        self.make('x{color:#ff0000}','src/x.css');f=scanner.scan(self.root,self.cfg)['findings'][0]
        self.cfg['exceptions']=[dict({k:f[k] for k in ['rule_id','path','line','source_sha256']},reason='Synthetic approved asset colour',owner='fixture',approval_ref='fixture-only')]
        r=scanner.scan(self.root,self.cfg);self.assertEqual(r['candidate_count'],1);self.assertIn('exception_request',r['findings'][0])
    def test_stale_annotation(self):
        self.make('const a=1');self.cfg['exceptions']=[{'rule_id':'IQ004','path':'src/no.css','line':1,'source_sha256':'a'*64,'reason':'x','owner':'fixture','approval_ref':'fixture'}]
        self.assertTrue(scanner.scan(self.root,self.cfg)['exception_errors'])
    def test_broad_annotation(self):
        self.make('const a=1');self.cfg['exceptions']=[{'rule_id':'IQ004','path':'src/*','line':1,'source_sha256':'a'*64,'reason':'x','owner':'fixture','approval_ref':'fixture'}]
        self.assertTrue(scanner.scan(self.root,self.cfg)['exception_errors'])
    def test_sensitive_snippet_redacted(self):
        self.make("const token = 'sample-data'");r=scanner.scan(self.root,self.cfg);self.assertIn('redacted',r['findings'][0]['snippet'])
    def test_local_primitive(self):
        self.make('function CustomButton() {}');self.assertIn('IQ008',self.rules(scanner.scan(self.root,self.cfg)))
    def test_parallel_ui_kit(self):
        self.make("import Button from '@mui/material/Button'");self.assertIn('IQ007',self.rules(scanner.scan(self.root,self.cfg)))

class GateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);p=self.root/'fixture-evidence.txt';p.write_text('SYNTHETIC UNIT TEST ONLY, NOT REAL ACCEPTANCE')
        self.e=[{'path':p.name,'sha256':sha(p.read_bytes())}];self.fp='a'*64
        self.r={'schema_version':'1.0','kind':'integration-review','baseline':{'ds_archive_sha256':'b'*64,'app_fingerprint':self.fp},
          'scope':{'approval_ref':'synthetic-test-only','surface_ids':['screen'],'required_check_ids':['C1'],'required_dimensions':sorted(gate.DIMENSIONS)},
          'coverage':[{'surface_id':'screen','status':'PASS','check_ids':['C1'],'evidence':self.e}],
          'checks':[{'id':'C1','surface_id':'screen','status':'PASS','app_fingerprint':self.fp,'expected':'fixture expectation','actual':'fixture observation','environment':{'engine':'synthetic-test'},'evidence':self.e}],
          'dimensions':[{'name':d,'status':'PASS','summary':'Synthetic unit fixture only','evidence':self.e} for d in sorted(gate.DIMENSIONS)],'findings':[],
          'verdict':{'release_ready':True,'summary':'SYNTHETIC UNIT TEST ONLY'}}
    def tearDown(self):self.temp.cleanup()
    def result(self):return gate.validate(self.r,self.root,self.fp)
    def notready(self):self.assertFalse(self.result()['gate_ready'])
    def finding(self,**kw):
        f={'id':'F1','severity':'P1','classification':'confirmed','status':'open','title':'fixture','surface_ids':['screen'],'reproduction':'fixture steps','recommendation':'fixture correction','evidence':self.e}
        f.update(kw);return f
    def test_valid_fixture(self):self.assertTrue(self.result()['gate_ready'])
    def test_no_independent_fingerprint(self):self.assertFalse(gate.validate(self.r,self.root)['gate_ready'])
    def test_stale(self):self.assertFalse(gate.validate(self.r,self.root,'c'*64)['gate_ready'])
    def test_no_scope_approval(self):self.r['scope']['approval_ref']=None;self.notready()
    def test_missing_surface(self):self.r['scope']['surface_ids'].append('missing');self.notready()
    def test_required_check_not_run(self):self.r['checks'][0]['status']='NOT_RUN';self.r['checks'][0]['reason']='unavailable';self.notready()
    def test_required_check_absent(self):self.r['scope']['required_check_ids'].append('C2');self.notready()
    def test_no_evidence(self):self.r['checks'][0]['evidence']=[];self.notready()
    def test_wrong_evidence_hash(self):self.e[0]['sha256']='d'*64;self.notready()
    def test_missing_evidence_file(self):(self.root/'fixture-evidence.txt').unlink();self.notready()
    def test_escape_evidence(self):self.e[0]['path']='../private';self.notready()
    def test_no_dimension(self):self.r['dimensions'].pop();self.notready()
    def test_duplicate_check(self):self.r['checks'].append(copy.deepcopy(self.r['checks'][0]));self.notready()
    def test_unknown_check_surface(self):self.r['checks'][0]['surface_id']='other';self.notready()
    def test_open_critical(self):self.r['findings']=[self.finding()];self.notready()
    def test_critical_cannot_waive(self):self.r['findings']=[self.finding(status='accepted-risk',owner='x',approval_ref='x')];self.notready()
    def test_p2_without_acceptance(self):self.r['findings']=[self.finding(severity='P2')];self.notready()
    def test_p2_explicit_risk(self):self.r['findings']=[self.finding(severity='P2',status='accepted-risk',owner='fixture',approval_ref='fixture')];self.assertTrue(self.result()['gate_ready'])
    def test_bypass_cannot_waive(self):self.r['findings']=[self.finding(severity='P3',status='accepted-risk',owner='fixture',approval_ref='fixture',category='unapproved-ds-bypass')];self.notready()
    def test_resolved_needs_test(self):self.r['findings']=[self.finding(status='resolved')];self.notready()
    def test_resolved_test(self):self.r['findings']=[self.finding(status='resolved',verification_check_ids=['C1'])];self.assertTrue(self.result()['gate_ready'])
    def test_n_a_needs_reason_and_approval(self):self.r['checks'][0].update(status='NOT_APPLICABLE',reason='fixture');self.notready()
    def test_fail_must_be_visible(self):self.r['checks'][0].update(status='FAIL');self.r['verdict']['release_ready']=False;self.assertTrue(any('no related finding' in e for e in self.result()['errors']))
    def test_false_ready_claim_rejected(self):self.r['coverage'][0]['status']='BLOCKED';self.assertTrue(any('contradicts' in e for e in self.result()['errors']))
    def test_symlink_evidence(self):
        p=self.root/'fixture-evidence.txt';p.rename(self.root/'original');p.symlink_to(self.root/'original');self.notready()

class NetworkTests(unittest.TestCase):
    def test_loopback(self):self.assertTrue(capture.loopback('http://127.0.0.1:8000'))
    def test_ipv6(self):self.assertTrue(capture.loopback('http://[::1]:8000'))
    def test_localhost(self):capture.check_url('http://localhost:8000',False)
    def test_remote_denied(self):
        with self.assertRaises(ValueError):capture.check_url('https://example.com',False)
    def test_remote_explicit(self):capture.check_url('https://example.com',True)
    def test_credentials_denied(self):
        with self.assertRaises(ValueError):capture.check_url('https://user:pass@example.com',True)
    def test_non_http_denied(self):
        with self.assertRaises(ValueError):capture.check_url('file:///tmp/a',True)
    def test_fake_localhost(self):self.assertFalse(capture.loopback('http://localhost.example.com'))

if __name__=='__main__':unittest.main(verbosity=2)
