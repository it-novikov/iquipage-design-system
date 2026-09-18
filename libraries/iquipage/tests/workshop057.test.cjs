'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const B=require('../src/modules/whiteboard-core.js'),R=require('../src/modules/whiteboard-routing.js'),S=require('../src/modules/whiteboard-shapes.js'),U=require('../src/modules/whiteboard-experience-core.js');
const shape=(id,x,y,kind='rectangle')=>({id,type:'shape',shape:kind,text:id,x,y,width:240,height:150});
for(const id of S.SHAPES){
 test('shape '+id+': silhouette, safe text region, four anchors and serialized identity',()=>{
  const s=S.shapeDefinition(id);a.equal(s.id,id);a.equal(s.inset.length,4);a(s.inset[0]+s.inset[2]<90);a(s.inset[1]+s.inset[3]<90);a(!/NaN|Infinity/.test(S.face(id,...s.size)));
  const obj={...shape('a',30,40,id),width:s.size[0],height:s.size[1]};a.equal(B.validateBoard({objects:[obj],connections:[]}).objects[0].shape,id);
  for(const side of R.SIDES.slice(1)){const p=R.anchor(obj,side);a(p.x>=obj.x&&p.x<=obj.x+obj.width);a(p.y>=obj.y&&p.y<=obj.y+obj.height);a.equal(Math.abs(p.nx)+Math.abs(p.ny),1);}
 });
}
for(const kind of ['rectangle','diamond','parallelogram','trapezoid','manual'])test(kind+': orthogonal route around a blocking object',()=>{
 const s=shape('a',0,60,kind),t=shape('b',780,60,kind),ob=shape('barrier',365,-40);ob.height=360;
 const g=R.route(s,t,{style:'elbow',fromPort:'right',toPort:'left'},[s,t,ob]);
 a(!/NaN|Infinity/.test(g.path));a.equal(g.points[0].x,g.source.x);a.equal(g.points.at(-1).x,g.target.x);
 a(g.points.slice(1).every((p,i)=>p.x===g.points[i].x||p.y===g.points[i].y));
 a(R.clear(g.points,[{x:ob.x-8,y:ob.y-8,r:ob.x+ob.width+8,b:ob.y+ob.height+8}]),g.path);
});
test('14 shapes x 3 styles x 16 pairs of sides remain finite',()=>{
 for(const id of S.SHAPES)for(const style of ['elbow','curve','straight'])for(const fromPort of R.SIDES.slice(1))for(const toPort of R.SIDES.slice(1)){
  const g=R.route(shape('a',20,20,id),shape('b',600,450,id),{style,fromPort,toPort});a(!/NaN|Infinity/.test(g.path));a([g.x,g.y].every(Number.isFinite));
 }
});
test('route is deterministic and does not mutate document or ports',()=>{const objects=[shape('a',0,0),shape('b',700,160),shape('c',350,80)],e={style:'curve',label:'Значимая связь',labelPosition:.7,bend:10};const before=JSON.stringify({objects,e});const x=R.route(objects[0],objects[1],e,objects);a.deepEqual(x,R.route(objects[0],objects[1],e,objects));a.equal(JSON.stringify({objects,e}),before)});
test('route updates when a remote obstruction changes',()=>{const objects=[shape('a',0,0),shape('b',700,0),shape('c',340,500)],e={style:'elbow'};const x=R.route(objects[0],objects[1],e,objects).path;objects[2].y=0;a.notEqual(x,R.route(objects[0],objects[1],e,objects).path)});
test('all connection options and new shape kinds survive JSON roundtrip',()=>{const d=B.validateBoard({objects:[shape('a',0,0,'database'),shape('b',600,0,'document')],connections:[{id:'c',from:'a',to:'b',style:'curve',fromPort:'bottom',toPort:'left',arrow:false,arrowStart:true,dashed:true,label:'Согласовано',labelPosition:.65,bend:67,color:'accent'}]});a.deepEqual(B.validateBoard(JSON.parse(JSON.stringify(d))),d)});
test('limits, invalid geometry and missing endpoints are rejected',()=>{a.throws(()=>B.validateBoard({objects:[shape('a',0,0)],connections:[{id:'c',from:'a',to:'missing'}]}));a.throws(()=>B.validateBoard({objects:[{...shape('a',0,0),width:NaN}],connections:[]}))});
test('batch preserves multiline ideas, peer width and semantic area',()=>{const f={...shape('f',0,0),type:'frame',text:'Результаты',width:400,height:500};const old={...shape('n',30,80),type:'sticky',color:'lavender',parentId:'f',width:316};const scene=B.validateBoard({objects:[f,old],connections:[]});const x=U.appendNotes(scene,['Абзац один\n\nАбзац два','Следующий шаг'],{areaId:'f'});a.equal(x.ids.length,2);for(const n of x.value.objects.slice(-2)){a.equal(n.parentId,'f');a.equal(n.width,316);a.equal(n.x,30);a.equal(n.color,'lavender')}a.equal(x.value.objects.at(-2).text,'Абзац один\n\nАбзац два');a.equal(scene.objects.length,2)});
test('locked target area rejects batch atomically',()=>{const scene=B.validateBoard({objects:[{...shape('f',0,0),type:'frame',locked:true}],connections:[]});a.throws(()=>U.appendNotes(scene,['Идея'],{areaId:'f'}));a.equal(scene.objects.length,1)});
test('group batch enforces 100 object cap',()=>{a.throws(()=>U.appendNotes(B.blank(),Array(101).fill('Идея')))});
test('roundtrip preserves legacy drawings without enabling a drawing tool',()=>{const obj={...shape('p',0,0),type:'drawing',points:[[0,0],[40,60]]};a.equal(B.validateBoard({objects:[obj],connections:[]}).objects[0].type,'drawing')});
