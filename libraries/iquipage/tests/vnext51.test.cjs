const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync(require('node:path').join(__dirname,'../src/styles/workspace.css'),'utf8');
test('fluid page canvas is opt-in and leaves original workspace density available',()=>{
 assert.match(css,/\.iq-workspace-page\{max-width:1600px/);
 assert.match(css,/\.iq-workspace-page\.iq-page-fluid,\.iq-agent-directory\.iq-page-fluid\{max-width:none\}/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.ok(css.lastIndexOf('.iq-page-fluid')>css.indexOf('@media(max-width:900px)'));
});
test('compact blocking status uses semantic danger ink without a filled surface or task emphasis change',()=>{
 const rule=css.match(/(?:^|\n)\.iq-task-blocker\{([^}]+)\}/)[1];
 assert.match(rule,/color:var\(--iq-ink\)/);assert.match(rule,/border:1px solid var\(--iq-line\)/);assert.doesNotMatch(rule,/background/);
 assert.match(css,/\.iq-task-signals>iq-tooltip\{display:inline-flex\}/);
 assert.match(css,/\.iq-task-signals>\.task-signal-copy,\.iq-task-blocker\{height:22px\}/);
 assert.match(css,/\.iq-task-signals\{display:flex;align-items:center/);
});
