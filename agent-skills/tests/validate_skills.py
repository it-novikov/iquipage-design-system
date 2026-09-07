#!/usr/bin/env python3
"""Validate this authored bundle's frontmatter, references and shared copies.
Not the upstream skills-ref validator and not a model/trigger evaluation.
"""
from pathlib import Path
import ast, hashlib, json, re, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[];details=[]
SKILLS=['iquipage-discovery','iquipage-experience-audit','iquipage-implement','iquipage-review']
for name in SKILLS:
    folder=ROOT/'skills'/name;p=folder/'SKILL.md'
    if not p.is_file():errors.append(f'{name}: SKILL.md missing');continue
    text=p.read_text();parts=text.split('---',2)
    if len(parts)!=3 or parts[0].strip():errors.append(f'{name}: frontmatter malformed');continue
    fm=parts[1];description=re.search(r'^description: (.+)$',fm,re.M);nm=re.search(r'^name: (.+)$',fm,re.M)
    if not nm or nm.group(1)!=name or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',name) or len(name)>64:errors.append(f'{name}: invalid name')
    try:
        desc=json.loads(description.group(1))
        if not isinstance(desc,str) or not 1<=len(desc)<=1024:raise ValueError('length')
    except Exception:errors.append(f'{name}: invalid description')
    if len(text.splitlines())>=500:errors.append(f'{name}: main instruction too long')
    compatibility=re.search(r'^compatibility: (.+)$',fm,re.M)
    if compatibility and len(json.loads(compatibility.group(1)))>500:errors.append(f'{name}: compatibility too long')
    # Every Markdown local link in the independently installable skill must remain local.
    for m in folder.rglob('*.md'):
        for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',m.read_text()):
            if re.match(r'^[a-z]+:',link) or link.startswith('#'):continue
            dest=link.split('#')[0]
            resolved=(m.parent/dest).resolve()
            if not resolved.is_relative_to(folder.resolve()) or not resolved.is_file():errors.append(f'{name}: broken or nonlocal link {m.relative_to(folder)} -> {link}')
    for script in folder.glob('scripts/*.py'):
        try:ast.parse(script.read_text())
        except SyntaxError as e:errors.append(f'{script.name}: syntax {e}')
    for data in folder.rglob('*.json'):
        try:json.loads(data.read_text())
        except ValueError:errors.append(f'{name}: invalid JSON {data}')
    if not (folder/'agents/openai.yaml').is_file():errors.append(f'{name}: missing optional Codex UI metadata')
    details.append({'name':name,'lines':len(text.splitlines()),'files':len([x for x in folder.rglob('*') if x.is_file()]),'status':'CHECKED'})
for rel in ['references/constitution.md','references/release-map.md','references/gap-protocol.md','references/human-agent.md','references/quality-method.md','references/sources.md','references/capability-index.json','assets/ds-release-lock.json']:
    hashes={hashlib.sha256((ROOT/'skills'/n/rel).read_bytes()).hexdigest() for n in SKILLS}
    if len(hashes)!=1:errors.append(f'Shared content drift: {rel}')
for file,names in [('verify_release.py',['iquipage-review','iquipage-implement']),('integration_scan.py',['iquipage-review','iquipage-implement']),('capture_surface.py',['iquipage-review','iquipage-experience-audit'])]:
    if len({hashlib.sha256((ROOT/'skills'/n/'scripts'/file).read_bytes()).hexdigest() for n in names})!=1:errors.append(f'Script drift: {file}')
for p in ROOT.rglob('*'):
    if p.suffix.lower() in {'.ttf','.otf','.woff','.woff2'}:errors.append(f'Forbidden font in bundle: {p}')
    if p.is_symlink():errors.append(f'Symlink in bundle: {p}')
# Check root documentation local links too, avoiding code example anchors.
for m in [ROOT/'README.md',ROOT/'START-HERE.md',*list((ROOT/'docs').glob('*.md'))]:
    for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',m.read_text()):
        if re.match(r'^[a-z]+:',link) or link.startswith('#'):continue
        resolved=(m.parent/link.split('#')[0]).resolve()
        if not resolved.is_relative_to(ROOT.resolve()) or not resolved.exists():errors.append(f'Broken root doc link: {m.name} -> {link}')
result={'schema_version':'1.0','status':'PASS' if not errors else 'FAIL','skills':details,'errors':errors,'limitation':'Static bundle format/content check only. No model activation or implementation quality is measured.'}
print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(0 if not errors else 1)
