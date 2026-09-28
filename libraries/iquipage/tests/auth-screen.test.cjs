const test=require('node:test'),assert=require('node:assert/strict');
global.HTMLElement=class {};
const {safeAuthHref}=require('../src/modules/auth-screen.js');
test('auth destinations permit root paths and credential-free HTTPS',()=>{
 assert.equal(safeAuthHref('/auth/login?return=project'),'/auth/login?return=project');
 assert.equal(safeAuthHref('https://identity.example/login'),'https://identity.example/login');
 for(const value of ['javascript:alert(1)','//evil.example','/\\evil.example','https://user:password@example.com','data:text/html,test','http://example.com',' /auth','/auth\nlogin'])assert.equal(safeAuthHref(value),'',value);
});
test('credential dialog is composed from DS fields, checkbox and alert',()=>{
 const js=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/modules/auth-dialog.js'),'utf8');
 for(const part of ['class="iq-field"','class="iq-input-shell"','class="iq-check iq-auth-remember"','class="iq-alert danger"'])assert.ok(js.includes(part),part);
 assert.doesNotMatch(js,/class="iq-auth-input"/);
});
