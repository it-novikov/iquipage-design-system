"""Package only a tested, reproducible 05.7 tree and verify every archived byte.
No font files, source-control metadata, caches, nested ZIPs or symbolic links.
"""
from pathlib import Path
import argparse,hashlib,json,subprocess,zipfile,sys
R=Path(__file__).resolve().parents[1]; OUT=R.parent/(R.name+'.zip'); V=R.parent/(R.name+'-package-verification.json'); E=R/'evidence'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
json_write=lambda p,d:p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
EXPECTED={
 'unit-057.json':(209,None),'types-057.json':(5,None),
 'workshop-behavior.json':(33,'whiteboard.html'),'acceptance-055.json':(36,'whiteboard.html'),
 'behavior.json':(28,'index.html'),'everyday-behavior.json':(26,'workbench.html'),
 'workshop-layout.json':(84,'whiteboard.html'),**{f'layout-{w}.json':(171,'index.html') for w in [320,390,1280,1440]},
 'contrast-057.json':(98,'whiteboard.html'),'contrast-056.json':(362,'workbench.html'),
 'performance-057.json':(3,'whiteboard.html'),'workshop-screens.json':(13,'whiteboard.html')}
BANNED_EXT={'.ttf','.otf','.woff','.woff2','.eot','.zip','.pyc','.pyo'}
SKIP_PARTS={'.git','node_modules','__pycache__','.pytest_cache'}
def eligible():
 found=[]
 for p in sorted(R.rglob('*')):
  rel=p.relative_to(R)
  if any(x in SKIP_PARTS for x in rel.parts):continue
  if p.is_symlink():raise AssertionError('No symbolic links: '+str(rel))
  if not p.is_file():continue
  if p.suffix.lower() in BANNED_EXT:raise AssertionError('Excluded artifact type: '+str(rel))
  if str(rel).startswith('evidence/diagnostics/'):raise AssertionError('Old diagnostic images are not current delivery evidence')
  if p.name=='MANIFEST.sha256':continue
  found.append(p)
 return found

def gates():
 checks={};reports=[]
 for name,(count,html) in EXPECTED.items():
  p=E/name;d=json.loads(p.read_text())
  assert d['version']=='0.5.7',name+' wrong version'
  assert d['total']==d['passed']==count,name+' incomplete or failed'
  assert not d.get('javascriptErrors') and not d.get('pageErrors'),name+' JS errors'
  if html:assert d['htmlSha256']==sha(R/html),name+' stale HTML'
  if 'cssSha256'in d:assert d['cssSha256']==sha(R/'dist/iquipage.css'),name+' stale CSS'
  for file,h in d.get('sourceHashes',{}).items():assert sha(R/file)==h,name+' stale source '+file
  for file,h in d.get('fixtureHashes',{}).items():assert sha(R/'tests'/file)==h,name+' stale type fixture '+file
  checks[name]=True;reports.append({'file':'evidence/'+name,'passed':d['passed'],'total':d['total'],'sha256':sha(p)})
 captures=[]
 for name in ['screenshots-057.json','screenshots-tooltip.json']:
  d=json.loads((E/name).read_text());assert d['htmlSha256']==sha(R/'whiteboard.html'),name+' stale HTML'
  for item in d['captures']:
   assert sha(R/item['file'])==item['sha256'],name+' wrong image '+item['file'];captures.append(item)
 assert len(captures)==15,'Missing screenshot'
 visual=json.loads((E/'visual-review.json').read_text())
 for item in visual['reviewed']:assert sha(R/item['file'])==item['sha256'],'Stale reviewed image'
 assert visual['htmlSha256']==sha(R/'whiteboard.html')
 parity=json.loads((E/'foundation-parity.json').read_text());assert parity['passed']==parity['total']==4
 tokens=json.loads((R/'tokens/semantic.json').read_text())
 for group,h in parity['groupHashes'].items():assert hashlib.sha256(json.dumps(tokens[group],sort_keys=True,ensure_ascii=False).encode()).hexdigest()==h
 assert tokens['meta']['version']=='0.5.7'
 for doc in ['README.md','docs/HANDOFF-05.7.md','docs/QUALITY-REPORT.md','docs/QA.md','docs/WHITEBOARD-API.md','docs/INTEGRATION.md']:
  assert (R/doc).is_file(),doc
 return checks,reports,captures

def verify():
 eligible() # Enforce exclusions during verification as well as packaging.
 assert OUT.is_file(),'Archive does not exist'
 expected={}
 for line in (R/'MANIFEST.sha256').read_text().splitlines():
  h,relative=line.split('  ',1);expected[R.name+'/'+relative]=h
 expected[R.name+'/MANIFEST.sha256']=sha(R/'MANIFEST.sha256')
 with zipfile.ZipFile(OUT) as z:
  assert z.testzip() is None,'ZIP CRC'
  assert len(z.namelist())==len(set(z.namelist())),'Duplicate entries'
  assert set(z.namelist())==set(expected),'Wrong archive file set'
  assert all(hashlib.sha256(z.read(n)).hexdigest()==h for n,h in expected.items()),'Archive byte mismatch'
  assert all(sha(R/n.split('/',1)[1])==h for n,h in expected.items()),'Working tree mismatch'
  same={name:hashlib.sha256(z.read(R.name+'/'+name)).hexdigest()==sha(R/name) for name in ['index.html','whiteboard.html','workbench.html']}
 check_results,_,_=gates()
 result={'version':'0.5.7','archive':OUT.name,'bytes':OUT.stat().st_size,'sha256':sha(OUT),'files':len(expected),'checks':{'crc':True,'exactFileSet':True,'allContentHashes':True,'currentTreeMatches':True,'noFontsOrNestedZips':True,'freshEvidence':all(check_results.values()),**{n+'Matches':v for n,v in same.items()}},'htmlSha256':{n:sha(R/n) for n in same},'handoff':'docs/HANDOFF-05.7.md'}
 json_write(V,result);print(json.dumps(result,ensure_ascii=False,indent=2));return result

if __name__=='__main__':
 args=argparse.ArgumentParser();args.add_argument('--verify',action='store_true');a=args.parse_args()
 if a.verify:verify();sys.exit()
 runtime=[*R.joinpath('dist').rglob('*'),R/'index.html',R/'whiteboard.html',R/'workbench.html',R/'tokens/tokens.css']
 before={str(p.relative_to(R)):sha(p) for p in runtime if p.is_file()}
 subprocess.run(['node','scripts/build.mjs'],cwd=R,check=True)
 assert all(sha(R/n)==h for n,h in before.items()),'Build not reproducible; rerun tests after rebuild'
 passed,reports,captures=gates()
 summary={'version':'0.5.7','htmlSha256':{n:sha(R/n) for n in ['index.html','whiteboard.html','workbench.html']},'cssSha256':sha(R/'dist/iquipage.css'),'reports':reports,'totals':{'unit':209,'browserBehavior':123,'layout':768,'contrast':460,'typeFixtures':5,'screenshotFiles':len(captures)},'javascriptErrors':[],'sourceRebuildIdentical':True,'allRequiredGatesPassed':all(passed.values()),'limits':['Chromium only; no native Safari/Firefox/physical touch devices','Local HTML and real ESM request routing, no Sprintique server acceptance','Bounded routing, no arbitrary-scale virtualization or full multi-user editing','No independent human usability study']}
 json_write(E/'verification-summary.json',summary)
 files=eligible();(R/'MANIFEST.sha256').write_text(''.join(sha(p)+'  '+str(p.relative_to(R))+'\n' for p in files))
 files.append(R/'MANIFEST.sha256')
 with zipfile.ZipFile(OUT,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for p in sorted(files):
   info=zipfile.ZipInfo(R.name+'/'+str(p.relative_to(R)),date_time=(2026,9,7,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
 verify()
