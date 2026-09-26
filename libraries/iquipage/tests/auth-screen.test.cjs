const test=require('node:test'),assert=require('node:assert/strict');
global.HTMLElement=class {};
const {safeAuthHref}=require('../src/modules/auth-screen.js');
test('auth destinations permit root paths and credential-free HTTPS',()=>{
 assert.equal(safeAuthHref('/auth/login?return=project'),'/auth/login?return=project');
 assert.equal(safeAuthHref('https://identity.example/login'),'https://identity.example/login');
 for(const value of ['javascript:alert(1)','//evil.example','/\\evil.example','https://user:password@example.com','data:text/html,test','http://example.com',' /auth','/auth\nlogin'])assert.equal(safeAuthHref(value),'',value);
});
test('provider theme has one language and no locale switcher',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');
 assert.match(fs.readFileSync(path.join(root,'keycloak/iquipage/login/theme.properties'),'utf8'),/^locales=ru$/m);
 const css=fs.readFileSync(path.join(root,'keycloak/iquipage/login/resources/css/identity.css'),'utf8');
 assert.match(css,/\.iq-identity #kc-locale,\.iq-identity #kc-locale-wrapper\{display:none!important\}/);
 assert.doesNotMatch(css,/#kc-current-locale-link/);
});
test('credential dialog is composed from DS fields, checkbox and alert',()=>{
 const js=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/modules/auth-dialog.js'),'utf8');
 for(const part of ['class="iq-field"','class="iq-input-shell"','class="iq-check iq-auth-remember"','class="iq-alert danger"'])assert.ok(js.includes(part),part);
 assert.doesNotMatch(js,/class="iq-auth-input"/);
});
