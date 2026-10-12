const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/modules/date-field.js'),'utf8');
test('date clear copy is neutral by default, deadline-specific, and overridable',()=>{
  const body=src.match(/clearLabel\(\) \{ (return [^}]*) \}/)[1];
  const label=attrs=>new Function(body).call({getAttribute:n=>attrs[n]??null,hasAttribute:n=>n in attrs});
  assert.equal(label({}),'Очистить дату');
  assert.equal(label({deadline:''}),'Убрать срок');
  assert.equal(label({'clear-label':'Без даты',deadline:''}),'Без даты');
  assert.match(src,/data-date-clear>\$\{components_js_1\.escapeHTML\(this\.clearLabel\(\)\)\}/);
  assert.match(src,/clear\.disabled = this\.hasAttribute\('required'\)/,'required fields still cannot be cleared');
});
