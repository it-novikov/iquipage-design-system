const test=require('node:test');
const assert=require('node:assert/strict');
const {workEntry,workStep,workQuestion}=require('../src/modules/work-story.js');
test('work prose is escaped, never executable markup or a raw log',()=>{
 const html=workEntry({id:'one',text:'<img src=x onerror=alert(1)>',detail:'<script>bad()</script>'});
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<ul'));assert.ok(!html.includes('<pre'));
});
test('evidence rejects script and protocol-relative URLs',()=>{
 const html=workStep({id:'s',title:'Проверка',state:'done',stateLabel:'Готово',review:'Ждёт проверки',evidence:[{href:'javascript:alert(1)'},{href:'//evil.test'},{href:'https://example.test/result',label:'Результат'}]});
 assert.ok(!html.includes('javascript:'));assert.ok(!html.includes('//evil'));assert.ok(html.includes('https://example.test/result'));assert.ok(html.includes('Ждёт проверки'));
});
test('a selection remains a draft, saved questions expose no decision controls',()=>{
 const base={id:'q',title:'Как продолжить?',options:[{id:'a',label:'Проверить',recommended:true}],value:'a'};
 assert.match(workQuestion(base),/value="a" checked/);
 const saved=workQuestion({...base,state:'answered',decision:'Анна выбрала проверку.'});
 assert.ok(saved.includes('Анна выбрала'));assert.ok(!saved.includes('type="radio"'));assert.ok(!saved.includes('<textarea'));
});
