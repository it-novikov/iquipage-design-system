#!/usr/bin/env python3
"""Synthetic regression tests of helpers. Never evaluates real model obedience or product UX."""
from __future__ import annotations
import copy,hashlib,importlib.util,json,tempfile,unittest,sys
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1];S=ROOT/'skills/iquipage-review/scripts'
def load(name):
    spec=importlib.util.spec_from_file_location(name,S/f'{name}.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
gate=load('validate_assessment');scan=load('integration_scan');net=load('capture_surface');fingerprint=load('fingerprint_inputs');release=load('verify_release')
sha=lambda b:hashlib.sha256(b).hexdigest()
T0='2026-09-06T10:00:00+00:00';T1='2026-09-07T10:00:00+00:00';T2='2026-09-07T10:01:00+00:00'

def fixture(root):
    """Fictitious complete plan/report. Semantic assertions not claimed by this fixture."""
    A=ROOT/'skills/iquipage-review/assets';p=json.loads((A/'acceptance-plan.example.json').read_text());r=json.loads((A/'assessment.example.json').read_text())
    p['approval']={'ref':'SYNTHETIC-TEST-NOT-USER-APPROVAL','owner':'fixture'};p['scope_type']='full-integration'
    p['surfaces'][0]['source_ref']='fixture-route-inventory';fp='a'*64
    for c in p['checks']:c['environment']['engine']='synthetic-not-browser';c['acceptance']='Assertion encoded in a synthetic test only'
    r['baseline']['app_fingerprint']=fp;r['evidence']=[];r['verdict']={'scope_ready':True,'summary':'SYNTHETIC CONTRACT TEST, NOT PRODUCT ACCEPTANCE'}
    for index,c in enumerate(r['checks']):
        spec=p['checks'][index];c['environment']=copy.deepcopy(spec['environment']);c['expected']=spec['acceptance'];c['actual']='Synthetic result for testing the validator';c['app_fingerprint']=fp;c['status']='PASS';c['reason']=None;c['executed_at']=T1
        c['evidence_ids']=[]
        for k in spec['evidence_kinds']:
            eid=f'E-{index}-{k}';path=root/(eid+'.txt');path.write_text('Synthetic test content for '+eid)
            r['evidence'].append({'id':eid,'path':path.name,'sha256':sha(path.read_bytes()),'kind':k,'app_fingerprint':fp,'ds_archive_sha256':p['ds_archive_sha256'],'captured_at':T1});c['evidence_ids'].append(eid)
    for x in r['coverage']+r['dimensions']:x['status']='PASS'
    r['baseline']['plan_sha256']=gate.canonical_sha(p)
    return p,r

class GateV2Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.p,self.r=fixture(self.root);self.fp='a'*64;self.ds=self.p['ds_archive_sha256'];self.pin=gate.canonical_sha(self.p)
    def tearDown(self):self.tmp.cleanup()
    def repin(self):self.pin=gate.canonical_sha(self.p);self.r['baseline']['plan_sha256']=self.pin
    def result(self):return gate.validate(self.r,self.root,self.fp,self.p,self.pin,self.ds)
    def ready(self):
        x=self.result();self.assertTrue(x['gate_ready'],x)
    def reject(self):
        x=self.result();self.assertFalse(x['gate_ready'],x)
    def finding(self,**kw):
        f={'id':'F1','severity':'P2','classification':'confirmed','status':'open','category':'spacing','title':'Synthetic spacing defect','surface_ids':['workspace/tasks'],'dimensions':['visual'],'detected_at':T0,'detected_fingerprint':'b'*64,'reproduction':'Fixture action','recommendation':'Fixture correction','acceptance':'Fixture screenshot after repair','evidence_ids':[self.r['evidence'][0]['id']],'related_check_ids':['VISUAL-001'],'repair':None,'owner':None,'approval_ref':None}
        f.update(kw);return f
    def resolved(self):
        f=self.finding(status='resolved',repair={'description':'Actual fixture source changed','changed_paths':['src/view.tsx'],'app_fingerprint':self.fp,'verified_at':T2,'verification_check_ids':['VISUAL-001']});self.r['findings']=[f];self.r['checks'][0]['finding_ids']=['F1']
    def test_complete_synthetic_plan(self):self.ready()
    def test_scope_ready_false_overrides_all_pass(self):self.r['verdict']['scope_ready']=False;self.reject()
    def test_missing_independent_plan(self):self.assertFalse(gate.validate(self.r,self.root,self.fp)['gate_ready'])
    def test_missing_independent_plan_hash(self):self.pin=None;self.reject()
    def test_missing_independent_ds_hash(self):self.ds=None;self.reject()
    def test_missing_independent_app_hash(self):self.fp=None;self.reject()
    def test_unapproved_template(self):self.p['approval']['ref']='PENDING';self.repin();self.reject()
    def test_scope_shrinking(self):
        self.p['surfaces'].append({'id':'admin','description':'Admin modal','source_ref':'routes.ts:5'});self.repin();self.reject()
    def test_self_modified_plan_hash(self):
        self.p['approval']['ref']='forged';self.r['baseline']['plan_sha256']=gate.canonical_sha(self.p);self.reject()
    def test_app_fingerprint_stale(self):self.r['baseline']['app_fingerprint']='e'*64;self.reject()
    def test_ds_fingerprint_stale(self):self.r['baseline']['ds_archive_sha256']='e'*64;self.reject()
    def test_wrong_engine(self):self.r['checks'][0]['environment']['engine']='other-engine';self.reject()
    def test_wrong_viewport(self):self.r['checks'][0]['environment']['viewport']=[320,800];self.reject()
    def test_wrong_role(self):self.r['checks'][0]['environment']['role']='admin';self.reject()
    def test_wrong_input(self):self.r['checks'][0]['environment']['input']='pointer';self.reject()
    def test_wrong_theme(self):self.r['checks'][0]['environment']['theme']='light';self.reject()
    def test_fixture_cannot_substitute_app(self):self.r['checks'][0]['environment']['load_mode']='fixture';self.reject()
    def test_wrong_dataset(self):self.r['checks'][0]['environment']['data_profile']='other';self.reject()
    def test_wrong_method(self):self.r['checks'][0]['method']='automated';self.reject()
    def test_visual_requires_screenshot(self):self.r['evidence'][0]['kind']='log';self.reject()
    def test_plan_cannot_call_log_visual_review(self):self.p['checks'][0]['evidence_kinds']=['log'];self.r['evidence'][0]['kind']='log';self.repin();self.reject()
    def test_stale_evidence_current_check(self):self.r['evidence'][0]['app_fingerprint']='b'*64;self.reject()
    def test_missing_timestamp(self):self.r['checks'][0]['executed_at']=None;self.reject()
    def test_naive_timestamp(self):self.r['evidence'][0]['captured_at']='2026-09-07T10:00:00';self.reject()
    def test_mutated_evidence(self):(self.root/self.r['evidence'][0]['path']).write_text('changed');self.reject()
    def test_missing_evidence(self):(self.root/self.r['evidence'][0]['path']).unlink();self.reject()
    def test_evidence_symlink(self):
        p=self.root/self.r['evidence'][0]['path'];q=self.root/'other';p.rename(q);p.symlink_to(q);self.reject()
    def test_escape_path(self):self.r['evidence'][0]['path']='../private';self.reject()
    def test_duplicate_evidence_role(self):
        e=copy.deepcopy(self.r['evidence'][0]);e['id']='OTHER';e['kind']='log';self.r['evidence'].append(e);self.reject()
    def test_missing_planned_check(self):self.r['checks'].pop();self.reject()
    def test_addition_without_plan(self):c=copy.deepcopy(self.r['checks'][0]);c['id']='NEW';self.r['checks'].append(c);self.reject()
    def test_dim_without_tests(self):self.r['dimensions'][0]['check_ids']=[];self.reject()
    def test_dim_unrelated_check(self):self.r['dimensions'][0]['check_ids']=['CODE-001'];self.reject()
    def test_required_case_not_in_coverage(self):self.r['coverage'][0]['check_ids'].pop();self.reject()
    def test_na_without_plan_decision(self):self.r['checks'][0].update(status='NOT_APPLICABLE',reason='Unavailable browser',approval_ref='invented');self.reject()
    def test_authorized_na_case(self):
        self.p['checks'][0]['na_approval_ref']='approved-not-applicable';self.r['checks'][0].update(status='NOT_APPLICABLE',reason='Defined scenario unavailable by product design',approval_ref='approved-not-applicable')
        extra=copy.deepcopy(self.p['checks'][0]);extra['id']='VISUAL-002';extra['na_approval_ref']=None;self.p['checks'].append(extra)
        c=copy.deepcopy(self.r['checks'][0]);c.update(id='VISUAL-002',status='PASS',reason=None,approval_ref=None);self.r['checks'].append(c)
        self.r['coverage'][0]['check_ids'].append('VISUAL-002');self.r['dimensions'][0]['check_ids'].append('VISUAL-002');self.repin();self.ready()
    def test_all_visual_checks_waived_not_pass(self):
        self.p['checks'][0]['na_approval_ref']='authorized-case-only';self.r['checks'][0].update(status='NOT_APPLICABLE',reason='Scenario not relevant',approval_ref='authorized-case-only');self.repin();self.reject()
    def test_pinned_finding_cannot_be_dropped(self):
        self.p['known_finding_ids']=['F1'];self.repin();self.reject()
    def test_pinned_finding_can_be_closed_with_repair(self):
        self.resolved();self.p['known_finding_ids']=['F1'];self.repin();self.ready()
    def test_orphan_risk_acceptance_rejected(self):
        self.p['risk_acceptances']=[{'finding_id':'F-MISSING','owner':'fixture','approval_ref':'fixture','reason':'Synthetic decision'}];self.repin();self.reject()
    def test_dismissal_cannot_use_stale_evidence(self):
        self.r['findings']=[self.finding(classification='hypothesis',status='dismissed',dismissal={'reason':'Fixture investigation','reviewer':'fixture','reviewed_at':T2,'verification_check_ids':['VISUAL-001']})];self.r['checks'][0]['finding_ids']=['F1'];self.r['evidence'][0]['captured_at']=T0;self.reject()
    def test_dismissal_cannot_use_wrong_dimension(self):
        self.r['findings']=[self.finding(classification='hypothesis',status='dismissed',dismissal={'reason':'Fixture investigation','reviewer':'fixture','reviewed_at':T2,'verification_check_ids':['CODE-001']})]
        for c in self.r['checks']:
            if c['id']=='CODE-001':c['finding_ids']=['F1']
        self.reject()
    def test_hypothesis_dismissed_with_current_investigation(self):
        self.r['findings']=[self.finding(classification='hypothesis',status='dismissed',dismissal={'reason':'Fixture candidate is supplied public markup','reviewer':'fixture','reviewed_at':T2,'verification_check_ids':['VISUAL-001']})];self.r['checks'][0]['finding_ids']=['F1'];self.ready()
    def test_dismissal_without_investigation(self):
        self.r['findings']=[self.finding(classification='hypothesis',status='dismissed')];self.reject()
    def test_confirmed_issue_cannot_be_dismissed(self):
        self.r['findings']=[self.finding(status='dismissed',dismissal={'reason':'Ignore this confirmed bug','reviewer':'fixture','reviewed_at':T2,'verification_check_ids':['VISUAL-001']})];self.r['checks'][0]['finding_ids']=['F1'];self.reject()
    def test_no_agent_product_honest_na(self):
        d='human-agent';self.p['dimension_applicability'][d]={'applicable':False,'reason':'No agent feature in fixture','approval_ref':'fixture decision'};self.p['checks']=[c for c in self.p['checks'] if d not in c['dimensions']];self.r['checks']=[c for c in self.r['checks'] if d not in c['dimensions']];self.r['coverage'][0]['check_ids'].remove('HUMAN_AGENT-001')
        for x in self.r['dimensions']:
            if x['name']==d:x.update(status='NOT_APPLICABLE',check_ids=[],approval_ref='fixture decision')
        self.repin();self.ready()
    def test_full_integration_cannot_omit_visual(self):self.p['dimension_applicability']['visual'].update(applicable=False,reason='skip',approval_ref='fixture');self.repin();self.reject()
    def test_open_p1(self):self.r['findings']=[self.finding(severity='P1')];self.reject()
    def test_p1_cannot_be_waived(self):self.r['findings']=[self.finding(severity='P1',status='accepted-risk',owner='x',approval_ref='x')];self.p['risk_acceptances']=[{'finding_id':'F1','owner':'x','approval_ref':'x','reason':'fixture only'}];self.repin();self.reject()
    def test_p2_accepted_independently(self):self.r['findings']=[self.finding(status='accepted-risk',owner='x',approval_ref='x')];self.p['risk_acceptances']=[{'finding_id':'F1','owner':'x','approval_ref':'x','reason':'fixture only'}];self.repin();self.ready()
    def test_unapproved_p2_waiver(self):self.r['findings']=[self.finding(status='accepted-risk',owner='x',approval_ref='x')];self.reject()
    def test_bypass_cannot_waive(self):self.r['findings']=[self.finding(severity='P3',category='unapproved-ds-bypass',status='accepted-risk',owner='x',approval_ref='x')];self.reject()
    def test_resolved_positive(self):self.resolved();self.ready()
    def test_generic_test_cannot_resolve(self):self.resolved();self.r['checks'][0]['finding_ids']=[];self.reject()
    def test_repair_requires_changed_paths(self):self.resolved();self.r['findings'][0]['repair']['changed_paths']=[];self.reject()
    def test_same_build_repair_rejected(self):self.resolved();self.r['findings'][0]['detected_fingerprint']=self.fp;self.reject()
    def test_repair_old_evidence(self):self.resolved();self.r['evidence'][0]['captured_at']=T0;self.reject()
    def test_repair_old_execution(self):self.resolved();self.r['checks'][0]['executed_at']=T0;self.reject()
    def test_repair_before_test(self):self.resolved();self.r['findings'][0]['repair']['verified_at']='2026-09-07T09:00:00Z';self.reject()
    def test_repair_unrelated_dimension(self):self.resolved();self.r['findings'][0]['repair']['verification_check_ids']=['CODE-001'];self.r['checks'][2]['finding_ids']=['F1'];self.reject()
    def test_hypothesis_not_closed_as_fixed(self):self.resolved();self.r['findings'][0]['classification']='hypothesis';self.reject()
    def test_fail_not_hidden(self):self.r['checks'][0]['status']='FAIL';self.r['verdict']['scope_ready']=False;self.assertTrue(any('no related finding' in s for s in self.result()['errors']))
    def test_boolean_not_integer(self):self.p['revision']=True;self.repin();self.reject()
    def test_duplicate_json_keys(self):
        p=self.root/'x.json';p.write_text('{"x":1,"x":2}')
        with self.assertRaises(ValueError):gate.load_json(p)
    def test_nonfinite_json(self):
        p=self.root/'x.json';p.write_text('{"x":NaN}')
        with self.assertRaises(ValueError):gate.load_json(p)

# Schema rejection cases check that direct library calls fail cleanly, not by AttributeError.
def malformed(field,value):
    def test(self):self.r[field]=value;self.reject()
    return test
for field,value in [('scope',None),('checks',[None]),('checks',[5]),('checks','text'),('coverage',[[]]),('dimensions',None),('baseline',[]),('findings',[False]),('evidence',[None]),('verdict',{}),('scope',{'surface_ids':[{}]})]:
    setattr(GateV2Tests,'test_malformed_'+field+'_'+str(len(str(value))),malformed(field,value))
def omit(field):
    def test(self):self.r.pop(field);self.reject()
    return test
for field in ['findings','dimensions','coverage','scope','baseline','verdict']:
    setattr(GateV2Tests,'test_omitted_'+field,omit(field))

class HelperSafetyTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);(self.root/'src').mkdir()
    def tearDown(self):self.tmp.cleanup()
    def source(self,text,name='src/test.ts'):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);return p
    def test_quoted_secret_default_not_copied(self):
        self.source('const x={"token":"SYNTHETIC_SECRET","color":"#fff"}');r=scan.scan(self.root,{'source_roots':['src']});self.assertNotIn('SYNTHETIC_SECRET',json.dumps(r));self.assertFalse(r['snippets_included'])
    def test_explicit_snippet_quotes_redacted(self):
        self.source('const x={"token":"SYNTHETIC_SECRET","color":"#fff"}');r=scan.scan(self.root,{'source_roots':['src'],'include_snippets':True});self.assertNotIn('SYNTHETIC_SECRET',json.dumps(r))
    def test_exclusions_are_accounted(self):
        self.source('x','#no') if False else None
        self.source('export const safe=1');self.source('x{color:#fff}','src/admin/x.css');r=scan.scan(self.root,{'source_roots':['src'],'excluded_paths':['src/admin']});self.assertEqual(r['status'],'INCOMPLETE');self.assertEqual(r['exclusion_ledger'][0]['path'],'src/admin')
    def test_reviewed_exclusion_record_remains(self):
        self.source('export const safe=1');self.source('x{color:#fff}','src/gen.css');r=scan.scan(self.root,{'source_roots':['src'],'excluded_paths':['src/gen.css'],'exclusion_decisions':[{'path':'src/gen.css','reason':'generated fixture','owner':'test','approval_ref':'fixture'}]});self.assertEqual(r['status'],'SCANNED');self.assertTrue(r['exclusion_ledger'][0]['reviewed'])
    def test_parent_path_rejected(self):
        self.source('code')
        with self.assertRaises(ValueError):scan.scan(self.root,{'source_roots':['src/../src']})
    def test_absolute_path_rejected(self):
        with self.assertRaises(ValueError):scan.scan(self.root,{'source_roots':[str(self.root/'src')]})
    def test_source_symlink_parent_rejected(self):
        self.source('code','actual/sub/code.ts');(self.root/'linked').symlink_to(self.root/'actual',target_is_directory=True)
        with self.assertRaises(ValueError):scan.scan(self.root,{'source_roots':['linked/sub']})
    def test_newline_line_numbers(self):
        self.source('line1\nline2\nconst color="#fff"');r=scan.scan(self.root,{'source_roots':['src']});self.assertEqual(r['findings'][0]['line'],3)
    def test_fingerprint_changes(self):
        p=self.source('one');a=fingerprint.snapshot(self.root,['src/test.ts']);p.write_text('two');b=fingerprint.snapshot(self.root,['src/test.ts']);self.assertNotEqual(a['app_fingerprint'],b['app_fingerprint'])
    def test_fingerprint_explicit_files_only(self):
        with self.assertRaises(ValueError):fingerprint.snapshot(self.root,['src'])
    def test_fingerprint_no_secret(self):
        self.source('private','src/.env')
        with self.assertRaises(ValueError):fingerprint.snapshot(self.root,['src/.env'])
    def test_fingerprint_duplicate(self):
        self.source('a')
        with self.assertRaises(ValueError):fingerprint.snapshot(self.root,['src/test.ts','src/test.ts'])
    def test_fixture_no_network(self):self.assertEqual(net.allowed_origins(None,[],True),set())
    def test_local_only_same_origin(self):
        origins=net.allowed_origins('http://127.0.0.1:8000/a',[])
        self.assertTrue(net.request_allowed('http://127.0.0.1:8000/b','GET',origins));self.assertFalse(net.request_allowed('http://127.0.0.1:9000/b','GET',origins))
    def test_remote_exact_allowlist(self):
        a=net.allowed_origins('https://approved.example/a',['https://approved.example']);self.assertTrue(net.request_allowed('https://approved.example/a','GET',a));self.assertFalse(net.request_allowed('https://thirdparty.example','GET',a))
    def test_remote_without_allowlist(self):
        with self.assertRaises(ValueError):net.allowed_origins('https://approved.example/a',[])
    def test_credentials_even_allowed_refused(self):
        with self.assertRaises(ValueError):net.allowed_origins('https://user:secret@approved.example',['https://approved.example'])
    def test_no_allowlist_path(self):
        with self.assertRaises(ValueError):net.allowed_origins(None,['https://example/a'])
    def test_mutating_methods_refused(self):
        for method in ['POST','PATCH','PUT','DELETE','CONNECT']:
            self.assertFalse(net.request_allowed('https://approved.example/a',method,{'https://approved.example:443'}))
    def test_fake_domain_not_allowed(self):self.assertFalse(net.request_allowed('https://approved.example.evil/path','GET',{'https://approved.example:443'}))
    def test_port_normalization(self):self.assertEqual(net.origin('https://APPROVED.example/'),'https://approved.example:443')
    def test_ipv6_origin(self):self.assertEqual(net.origin('http://[::1]:8000/'),'http://[::1]:8000')
    def test_embedded_data(self):self.assertTrue(net.request_allowed('data:image/png;base64,AA','GET',set()))
    def test_file_protocol_not_allowed(self):self.assertFalse(net.request_allowed('file:///etc/passwd','GET',set()))

if __name__=='__main__':unittest.main(verbosity=2)
