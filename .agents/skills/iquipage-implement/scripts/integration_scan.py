#!/usr/bin/env python3
"""Read-only heuristic source scan. Candidates require human/agent code review."""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path

EXTENSIONS={'.js','.jsx','.ts','.tsx','.mjs','.cjs','.css','.scss','.sass','.less','.html','.vue','.svelte','.kt','.kts','.swift','.xml'}
PRUNE={'.git','node_modules','.next','.nuxt','.turbo','coverage','__pycache__','.venv','venv','.gradle'}
RULES=[
 ('IQ001','P1',r'''(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*(?:@iquipage/[^/"']+/(?:src|dist/modules)|(?:vendor|iquipage)[^"']*/(?:src|dist/modules))''','Internal DS import; use supported public entry'),
 ('IQ002','P1',r'''(?:shadowRoot|customElements\.get\([^\n]+\)\.prototype|\.prototype\.[\w]+\s*=)''','Possible DOM/prototype bypass; inspect whether read-only tests or actual mutation'),
 ('IQ003','P2',r'!important\b','Local cascade override; inspect DS patch and source of the conflict'),
 ('IQ004','P2',r'''(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\([^)]*\)|\bColor\(0x[0-9a-fA-F]+\))''','Hardcoded colour candidate; distinguish data/asset colour from design role'),
 ('IQ005','P1',r'''(?:type\s*=\s*["'](?:date|datetime-local|time)["']|\.showPicker\s*\()''','Possible native date/time popup bypass'),
 ('IQ006','P1',r'''(?:outline\s*:\s*(?:none|0\b)|outline\s*=\s*["']none)''','Focus suppression candidate; verify a visible equivalent in all relevant states'),
 ('IQ007','P1',r'''(?:from\s*|import\s*\(|require\s*\()\s*["'](?:@mui/|antd|@chakra-ui/|@radix-ui/|@headlessui/|shadcn|@mantine/)|import\s+androidx\.compose\.material''','Parallel UI library/platform base; distinguish approved native adapter'),
 ('IQ008','P2',r'''\b(?:export\s+)?(?:function|class|const)\s+(?:[A-Z]\w*)?(?:Button|Select|Dialog|Modal|DatePicker|Tooltip|Switch|Checkbox|Calendar)\b''','Local primitive candidate; inspect wrapper behaviour and visual boundary'),
 ('IQ009','P2',r'<svg\b|<path\s+d\s*=','Inline/custom vector candidate; approved source icon/complex graphic may be valid'),
 ('IQ010','P1',r'''(?:sample-data|whiteboard-stories|advanced-stories|ui-demo|everyday-stories)''','Possible catalogue/demo code included in application runtime'),
 ('IQ011','P1',r'''(?:dangerouslySetInnerHTML|innerHTML\s*=|insertAdjacentHTML\s*\()''','HTML insertion: prove trusted supplied markup or proper escaping/safe renderer'),
 ('IQ012','P2',r'''\b(?:font-size|border-radius|gap|margin(?:-\w+)?|padding(?:-\w+)?)\s*:\s*\d+(?:\.\d+)?px''','Unmapped layout/type literal candidate; no automatic arbitrary-pixel ban'),
]
COMPILED=[(a,b,re.compile(c),d) for a,b,c,d in RULES]

def digest(b:bytes)->str:return hashlib.sha256(b).hexdigest()
def safe_rel(root:Path,s:str)->Path:
    p=(root/s)
    if not p.resolve().is_relative_to(root):raise ValueError(f'Path escapes project root: {s}')
    return p

def scan(root:Path,config:dict)->dict:
    root=root.resolve(strict=True)
    if not root.is_dir():raise ValueError('Project root is not a directory')
    sources=config.get('source_roots')
    if not isinstance(sources,list) or not sources:raise ValueError('Explicit non-empty source_roots is required')
    exclude=config.get('excluded_paths',[])+config.get('vendor_roots',[])
    excluded=[safe_rel(root,s) for s in exclude]
    adapters=[safe_rel(root,s) for s in config.get('adapter_roots',[])]
    limit=int(config.get('max_file_bytes',1_000_000))
    if not 1<=limit<=10_000_000:raise ValueError('max_file_bytes must be 1..10000000')
    paths=set();skipped=[];missing=[]
    for value in sources:
        start=safe_rel(root,value)
        if not start.exists():missing.append(value);continue
        # Manual walk, never follow symlinks, including directory symlinks.
        stack=[start]
        while stack:
            p=stack.pop()
            rel=p.relative_to(root).as_posix()
            if p.is_symlink():skipped.append({'path':rel,'reason':'symlink'});continue
            if any(p==e or e in p.parents for e in excluded):continue
            if p.is_dir():
                if p.name in PRUNE:continue
                stack.extend(sorted(p.iterdir(),reverse=True));continue
            if not p.is_file() or p.suffix.lower() not in EXTENSIONS:continue
            if p.name.startswith('.env') or any(x in p.parts for x in ['secrets','credentials']):
                skipped.append({'path':rel,'reason':'sensitive-path'});continue
            if p.stat().st_size>limit:skipped.append({'path':rel,'reason':'file-size-limit'});continue
            paths.add(p)
    records=[];findings=[]
    for p in sorted(paths):
        rel=p.relative_to(root).as_posix();raw=p.read_bytes();h=digest(raw)
        try:text=raw.decode('utf-8')
        except UnicodeDecodeError:skipped.append({'path':rel,'reason':'non-utf8'});continue
        if '\x00' in text:skipped.append({'path':rel,'reason':'binary'});continue
        records.append({'path':rel,'sha256':h})
        is_adapter=any(p==a or a in p.parents for a in adapters)
        for rule,severity,regex,message in COMPILED:
            for m in regex.finditer(text):
                line=text.count('\n',0,m.start())+1
                snippet=text.splitlines()[line-1].strip()[:200]
                # Avoid leaking obvious values from source-level credentials in snippets.
                if re.search(r'(password|secret|token|api[_-]?key)\s*[:=]',snippet,re.I):snippet='[redacted credential-like source line]'
                fid='IQ-'+digest(f'{rule}\0{rel}\0{line}\0{m.group(0)}'.encode())[:12]
                findings.append({'id':fid,'rule_id':rule,'suggested_severity':severity,'path':rel,'line':line,'source_sha256':h,
                                 'message':message,'snippet':snippet,'adapter_candidate':is_adapter,'disposition':'needs-review'})
        # Native controls already using supplied classes are not universally prohibited.
        for m in re.finditer(r'<(button|input|select|textarea)\b[^>]*>',text,re.S):
            tag=m.group(0)
            if re.search(r'\biq-[\w-]+',tag):continue
            line=text.count('\n',0,m.start())+1
            findings.append({'id':'IQ-'+digest(f'native\0{rel}\0{line}\0{tag}'.encode())[:12], 'rule_id':'IQ013','suggested_severity':'P2','path':rel,'line':line,'source_sha256':h,
                             'message':'Native control without an inline iq- class; may be valid supplied markup with parent styling. Trace before confirming.',
                             'snippet':f'<{m.group(1)}>','adapter_candidate':is_adapter,'disposition':'needs-review'})
    # Explicit, narrow exception requests are annotated, never silently suppressed.
    exception_errors=[]
    for i,e in enumerate(config.get('exceptions',[])):
        keys=['rule_id','path','line','source_sha256','reason','owner','approval_ref']
        if not isinstance(e,dict) or any(not e.get(k) for k in keys):exception_errors.append(f'Exception {i} is incomplete');continue
        if any(c in e['path'] for c in '*?[]') or not re.fullmatch('[0-9a-f]{64}',e['source_sha256']):exception_errors.append(f'Exception {i} is broad or unpinned');continue
        found=False
        for f in findings:
            if all(f[k]==e[k] for k in ['rule_id','path','line','source_sha256']):
                f['exception_request']={k:e[k] for k in ['reason','owner','approval_ref']};found=True
        if not found:exception_errors.append(f'Exception {i} is stale or does not match a candidate')
    records.sort(key=lambda x:x['path'])
    snapshot=digest(json.dumps(records,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())
    return {'schema_version':'1.0','kind':'heuristic-candidates','source_snapshot_sha256':snapshot,
            'source_roots':sources,'excluded_paths':exclude,'files':records,'files_scanned':len(records),
            'missing_source_roots':missing,'skipped':skipped,'exception_errors':exception_errors,
            'findings':findings,'candidate_count':len(findings),
            'status':'INCOMPLETE' if missing or skipped or not records else 'SCANNED',
            'limitations':['Regex scan, not AST, architecture proof, UX review or release approval.',
                           'Vendor is excluded here and must be verified independently.',
                           'Snapshots include only reported source files; include build/env inputs separately.',
                           'No absence-of-bypass claim can be made from zero candidates.']}

def main()->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',required=True,type=Path);p.add_argument('--config',required=True,type=Path);p.add_argument('--out',required=True,type=Path)
    a=p.parse_args()
    try:
        result=scan(a.root,json.loads(a.config.read_text(encoding='utf-8')))
        if a.out.resolve() in [(a.root/f['path']).resolve() for f in result['files']]:raise ValueError('Refusing to overwrite a scanned source file')
        a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:result[k] for k in ['status','files_scanned','candidate_count','source_snapshot_sha256']},ensure_ascii=False))
        return 2 if result['status']=='INCOMPLETE' or result['exception_errors'] else 0
    except (OSError,ValueError,TypeError,KeyError) as e:print(str(e),file=sys.stderr);return 2
if __name__=='__main__':sys.exit(main())
