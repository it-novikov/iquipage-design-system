import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';

/** Explicit owner choice: neutral focus for buttons only. Applied to copied source, never baseline. */
export async function applyButtonFocusPolicy(build){
  const directory=path.join(build,'src/styles');
  const buttons='button,.iq-btn,[role="button"],input[type="button"],input[type="submit"],input[type="reset"]';
  const exclusion=':not(:where('+buttons+'))';
  let selectors=0;
  for(const filename of (await readdir(directory)).filter(name=>name.endsWith('.css'))){
    const file=path.join(directory,filename),source=await readFile(file,'utf8');
    // Keep selector lists and :is/:not branches intact. Hover and selected branches are untouched.
    let next=source.replace(/:focus-visible\b|:focus(?![-\w])/g,match=>{selectors++;return match+exclusion;});
    next=next.replace(/\.iq-dropzone \.iq-btn:has\(input:focus-visible[^{}]+\{[^{}]+\}/g,'');
    // visual-focus is the catalogue's artificial preview of focus, not an application state.
    next=next.replaceAll('.iq-btn.visual-focus','.iq-btn.visual-focus:not(.iq-btn)');
    if(filename==='foundation.css')next+='\n/* Requested neutral button focus. Keyboard behavior is unchanged; fields retain visible focus. */\n:where('+buttons+'):focus{outline:none}\n';
    await writeFile(file,next);
  }
  if(selectors<50)throw Error('DS focus policy inventory changed; review required');
}
