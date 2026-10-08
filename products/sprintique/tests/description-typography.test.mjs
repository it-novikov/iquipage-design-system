import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
// The owner: a task description read at a different size than while editing. DS vnext.37 makes an editor's preview
// read at its source's size and line height (pinned there with a cascade test over dist/iquipage.css); here the
// product keeps every place that shows a task description on that DS contract and never sizes the text itself.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ds=fileURLToPath(new URL('../node_modules/@iquipage/web/',import.meta.url));

test('the description in the drawer, full screen and create dialog is the compact editor with preview on blur',()=>{
  const dialog=read('ui/src/board/task-dialog.js');
  const tag=/<iq-markdown-editor label="Описание" name="description"[^>]*>/.exec(dialog)?.[0];
  assert.ok(tag,'the description editor');
  assert.match(tag,/ density="compact"/);
  assert.match(tag,/ preview-on-blur/);
});

test('template previews in the project settings read like the description they become',()=>{
  const settings=read('ui/src/board/project-settings.js');
  const viewers=settings.match(/<iq-markdown-viewer[^>]*>/g)||[];
  assert.equal(viewers.length,2);
  for(const viewer of viewers)assert.match(viewer,/density="compact"/,viewer);
});

test('the installed DS sizes the preview from the source, and the product never sizes Markdown text',()=>{
  const pkg=JSON.parse(readFileSync(join(ds,'package.json'),'utf8'));
  assert.match(pkg.version,/^0\.6\.0-vnext\.(3[7-9]|[4-9]\d|\d{3,})$/);
  const css=readFileSync(join(ds,'dist','iquipage.css'),'utf8');
  assert.ok(css.includes('.markdown-editor .md-preview,iq-markdown-viewer[density=compact] .md-document{font-size:var(--iq-md-text-size);line-height:var(--iq-md-text-leading);max-width:none}'));
  assert.match(css,/\.markdown-editor \.md-input\{[^}]*font-size:var\(--iq-md-text-size\);line-height:var\(--iq-md-text-leading\)/);
  const sheets=[];
  const walk=dir=>{for(const entry of readdirSync(new URL('../'+dir,import.meta.url),{withFileTypes:true})){
    const path=dir+'/'+entry.name;
    if(entry.isDirectory()){if(!['node_modules','dist'].includes(entry.name))walk(path);}
    else if(entry.name.endsWith('.css'))sheets.push(path);
  }};
  for(const dir of ['ui','web'])walk(dir);
  assert.ok(sheets.length>3);
  for(const sheet of sheets)for(const [,selector,body] of read(sheet).matchAll(/([^{}]*(?:md-|markdown|task-description)[^{}]*)\{([^}]*)\}/g))
    assert.doesNotMatch(body,/(^|;)\s*(font|font-size|line-height)\s*:/,`${sheet}: ${selector.trim()}`);
});
