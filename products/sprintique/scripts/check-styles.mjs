// Keeps product presentation on the public IQUIPAGE contract: type, radius and colour tokens,
// public component variants, no reach into component internals, no ad-hoc inline styling.
import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';

const root=new URL('..',import.meta.url).pathname;
async function files(dir,pattern){
  const out=[];
  for(const entry of await readdir(join(root,dir),{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await files(path,pattern));
    else if(pattern.test(entry.name))out.push(path);
  }
  return out;
}
// Private markup of DS components. Public variants exist for each: dialog data-layout=form,
// iq-select density/label-hidden, .iq-switcher for menu triggers.
const INTERNALS=/\.iq-(select-trigger|control-label|combo-input|check-box|switch-track|dialog-(head|footer|inner|panel)|menu-(item|list|panel)|upload-art|dropzone)\b|iq-menu\s*>\s*button|iq-select\s*>/;
const problems=[];
const report=(file,line,message)=>problems.push(`${relative(root,join(root,file))}:${line}: ${message}`);
const lineOf=(text,index)=>text.slice(0,index).split('\n').length;

for(const file of [...await files('ui',/\.css$/),...await files('web',/\.css$/)]){
  const css=await readFile(join(root,file),'utf8');
  for(const match of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)){
    const [,selector,body]=match,line=lineOf(css,match.index),sel=selector.trim();
    // SVG thumbnails draw labels in viewBox units; they are artwork, not interface text.
    const artwork=/(^|\s)text$/.test(sel);
    if(!artwork&&/font-size:\s*[\d.]+px/.test(body))report(file,line,`px font-size in "${sel.slice(-60)}"; use var(--iq-type-*-size)`);
    if(/border-radius:\s*(?!0\b|50%|999px|inherit)[\d.]+px/.test(body))report(file,line,`raw border-radius in "${sel.slice(-60)}"; use var(--iq-radius-*)`);
    const withoutVars=body.replace(/var\([^()]*(\([^()]*\))*[^()]*\)/g,'');
    if(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(withoutVars))report(file,line,`raw colour in "${sel.slice(-60)}"; use an --iq-* token`);
    if(INTERNALS.test(sel))report(file,line,`selector reaches into DS component internals: "${sel.slice(-80)}"`);
  }
}
for(const file of [...await files('ui',/\.js$/),...await files('web',/\.js$/)]){
  const js=await readFile(join(root,file),'utf8');
  for(const match of js.matchAll(/\bstyle="([^"]*)"/g)){
    const value=match[1];
    // Allowed: CSS custom properties for depth, and the validated cover crop helper.
    if(/^\$\{coverImageStyle\(/.test(value)||/^(--[\w-]+:[^;]+;?)+$/.test(value))continue;
    report(file,lineOf(js,match.index),`inline style "${value.slice(0,50)}"; use a class or public variant`);
  }
}
if(problems.length){console.error(`Style contract: ${problems.length} problem(s)\n`+problems.join('\n'));process.exit(1);}
console.log('PASS: type, radius and colour tokens, public DS variants, no inline styling.');
