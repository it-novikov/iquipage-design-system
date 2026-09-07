
const exports={};
const deps={};
(function(exports,require){
'use strict';
/** Shared geometry for the library, object face, text inset and connector binding.
 * Percent-space silhouettes. Application-specific symbols are intentionally not inferred.
 */
const definitions = [
 ['rectangle','Процесс','Основные', [240,112], [10,16,10,16], '<rect x="1" y="1" width="98" height="98" rx="6"/>'],
 ['diamond','Решение','Основные', [260,200], [27,27,27,27], '<polygon points="50,1 99,50 50,99 1,50"/>'],
 ['pill','Начало / конец','Основные', [240,100], [15,18,15,18], '<rect x="1" y="1" width="98" height="98" rx="49"/>'],
 ['ellipse','Событие','Основные', [200,150], [17,17,17,17], '<ellipse cx="50" cy="50" rx="49" ry="49"/>'],
 ['parallelogram','Ввод / вывод','Данные', [240,126], [12,22,12,22], '<polygon points="19,1 99,1 81,99 1,99"/>'],
 ['database','База данных','Данные', [200,160], [25,14,18,14], '<path d="M1 15 C1 -3 99 -3 99 15 L99 85 C99 103 1 103 1 85Z"/><path class="wb-shape-detail" d="M1 15 C1 33 99 33 99 15"/>'],
 ['document','Документ','Данные', [230,150], [12,14,25,14], '<path d="M1 1H99V82C68 64 32 112 1 92Z"/>'],
 ['predefined','Подпроцесс','Действия', [250,116], [12,20,12,20], '<rect x="1" y="1" width="98" height="98" rx="5"/><path class="wb-shape-detail" d="M14 1V99M86 1V99"/>'],
 ['manual','Ручной ввод','Действия', [240,128], [28,13,13,13], '<polygon points="1,23 99,1 99,99 1,99"/>'],
 ['trapezoid','Ручная операция','Действия', [250,130], [12,23,12,23], '<polygon points="1,1 99,1 78,99 22,99"/>'],
 ['hexagon','Подготовка','Действия', [250,130], [12,24,12,24], '<polygon points="20,1 80,1 99,50 80,99 20,99 1,50"/>'],
 ['delay','Ожидание','Действия', [240,120], [15,26,15,12], '<path d="M1 1H51C115 1 115 99 51 99H1Z"/>'],
 ['connector','Соединитель','Переходы', [96,96], [18,18,18,18], '<circle cx="50" cy="50" r="49"/>'],
 ['offpage','Другой фрагмент','Переходы', [180,150], [14,14,30,14], '<polygon points="1,1 99,1 99,68 50,99 1,68"/>']
];
const SHAPE_DEFS=Object.fromEntries(definitions.map(([id,label,group,size,inset,svg])=>[id,{id,label,group,size,inset,svg}]));
function shapeDefinition(id){return SHAPE_DEFS[id]||SHAPE_DEFS.rectangle;}
function face(id,width=240,height=110){return id==='pill'?`<rect x="1" y="1" width="98" height="98" rx="${Math.min(49,49*height/width)}" ry="49"/>`:shapeDefinition(id).svg;}
function boundary(id,side){
 if(id==='parallelogram'&&side==='left')return [.1,.5];
 if(id==='parallelogram'&&side==='right')return [.9,.5];
 if(id==='manual'&&side==='left')return [.01,.5];
 if(id==='trapezoid'&&side==='left')return [.115,.5];
 if(id==='trapezoid'&&side==='right')return [.885,.5];
 if(id==='manual'&&side==='top')return [.5,.12];
 if(id==='document'&&side==='bottom')return [.5,.88];
 return ({top:[.5,0],right:[1,.5],bottom:[.5,1],left:[0,.5]})[side]||[1,.5];
}
exports.SHAPE_DEFS=SHAPE_DEFS;exports.SHAPES=definitions.map(d=>d[0]);exports.shapeDefinition=shapeDefinition;exports.face=face;exports.boundary=boundary;

})(exports,id=>{if(!(id in deps))throw new Error('Missing module '+id);return deps[id]});
export default exports;
