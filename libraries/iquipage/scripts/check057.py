"""Record fresh pure-logic and declaration checks (no browser simulation)."""
from pathlib import Path
import hashlib,json,subprocess,re,sys
R=Path(__file__).resolve().parents[1];O=R/'evidence';O.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def fingerprints():
 paths=sorted([*R.joinpath('src').rglob('*.js'),*R.joinpath('src').rglob('*.css'),*R.joinpath('types').rglob('*.ts')])
 return {str(p.relative_to(R)):sha(p) for p in paths}
unit=subprocess.run(['node','--test',*[str(p.relative_to(R)) for p in sorted((R/'tests').glob('*.test.cjs'))]],cwd=R,capture_output=True,text=True)
(O/'unit-057.tap').write_text(unit.stdout+unit.stderr)
count=lambda key:int(re.search(r'^# '+key+r' (\d+)$',unit.stdout,re.M).group(1))
u={'version':'0.5.7','passed':count('pass'),'total':count('tests'),'failed':count('fail'),'exitCode':unit.returncode,'sourceHashes':fingerprints(),'command':'node --test tests/*.test.cjs'}
(O/'unit-057.json').write_text(json.dumps(u,indent=2)+'\n');print('Unit',u['passed'],'/',u['total'])
checks=[]
for name in ['api-contract.ts','lazy-contract.ts','whiteboard-contract.ts','everyday-contract.ts','workshop-contract.ts']:
 cmd=['tsc','--strict','--noEmit','--lib','ES2023,DOM','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','tests/'+name]
 run=subprocess.run(cmd,cwd=R,capture_output=True,text=True)
 checks.append({'name':name,'passed':run.returncode==0,'command':' '.join(cmd),'output':run.stdout+run.stderr});print('Type',name,run.returncode)
t={'version':'0.5.7','passed':sum(x['passed'] for x in checks),'total':len(checks),'checks':checks,'sourceHashes':fingerprints(),'fixtureHashes':{x['name']:sha(R/'tests'/x['name']) for x in checks}}
(O/'types-057.json').write_text(json.dumps(t,ensure_ascii=False,indent=2)+'\n');sys.exit(0 if not unit.returncode and t['passed']==t['total'] else 1)
