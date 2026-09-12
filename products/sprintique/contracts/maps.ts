import {z} from 'zod';
import {Id,Revision} from './index.js';

const coordinate=z.number().finite().min(-100_000).max(100_000);
const size=z.number().positive().max(10_000);
export const MapObject=z.strictObject({
  id:Id,type:z.enum(['sticky','text','shape','frame','task','image','drawing']),
  text:z.string().max(10_000),x:coordinate,y:coordinate,width:size.min(40),height:size.min(32),
  color:z.enum(['sand','lavender','mint','sky','rose','neutral']).default('sand'),
  parentId:Id.optional(),locked:z.boolean().optional(),author:z.string().max(100).optional(),
  align:z.enum(['left','center','right']).optional(),valign:z.enum(['top','middle','bottom']).optional(),
  autoHeight:z.boolean().optional(),minHeight:size.min(32).max(4000).optional(),headerHeight:size.min(56).max(4000).optional(),captionHeight:size.min(24).max(4000).optional(),layout:z.literal('column').optional(),
  shape:z.enum(['rectangle','diamond','pill','ellipse','parallelogram','database','document','predefined','manual','trapezoid','hexagon','delay','connector','offpage']).optional(),
  assetId:Id.optional(),points:z.array(z.tuple([coordinate.min(0).max(10000),coordinate.min(0).max(10000)])).min(2).max(4000).optional(),
  done:z.boolean().optional(),owner:z.string().max(100).optional(),externalTaskId:Id.optional()
}).superRefine((o,ctx)=>{
  if((o.type==='image')!==!!o.assetId)ctx.addIssue({code:'custom',message:'Only images require an asset reference.'});
  if(o.externalTaskId&&o.type!=='task')ctx.addIssue({code:'custom',message:'Only task objects may reference tasks.'});
  if(o.type==='drawing'&&!o.points)ctx.addIssue({code:'custom',message:'Drawing requires points.'});
});
export const MapConnection=z.strictObject({id:Id,from:Id,to:Id,label:z.string().max(240).optional(),
  style:z.enum(['curve','straight','elbow']).optional(),arrow:z.boolean().optional(),arrowStart:z.boolean().optional(),
  fromPort:z.enum(['auto','top','right','bottom','left']).optional(),toPort:z.enum(['auto','top','right','bottom','left']).optional(),
  dashed:z.boolean().optional(),color:z.enum(['neutral','accent','success','warning','error']).optional(),
  labelPosition:z.number().min(0).max(1).optional(),bend:coordinate.optional()
});
export const MapDocument=z.strictObject({schema:z.literal('iquipage.whiteboard/1'),title:z.string().max(160),revision:Revision,
  objects:z.array(MapObject).max(600),connections:z.array(MapConnection).max(1600)
}).superRefine((doc,ctx)=>{
  const byId=new Map(doc.objects.map(o=>[o.id,o])),ids=new Set(byId.keys());
  if(ids.size!==doc.objects.length)ctx.addIssue({code:'custom',message:'Duplicate object id.'});
  for(const o of doc.objects){
    const seen=new Set([o.id]);let current=o;
    while(current.parentId){const parent=byId.get(current.parentId);if(!parent||parent.type!=='frame'||seen.has(parent.id)){ctx.addIssue({code:'custom',message:'Invalid frame hierarchy.'});break;}seen.add(parent.id);current=parent;}
  }
  for(const edge of doc.connections){if(ids.has(edge.id)||!byId.has(edge.from)||!byId.has(edge.to)||edge.from===edge.to)ctx.addIssue({code:'custom',message:'Invalid connection.'});ids.add(edge.id);}
});
export const MapSession=z.strictObject({phase:z.enum(['collect','discuss','vote','outcomes']),voteLimit:z.number().int().min(1).max(100)});
export const MapInput=z.strictObject({
  title:z.string().trim().min(1).max(160),kind:z.enum(['permanent','session']),status:z.enum(['draft','active','paused','archived']),
  document:MapDocument,summary:z.string().max(50_000).default(''),session:MapSession.nullable().default(null),
  // Executable workflows are a separate, versioned command contract, never arbitrary map JSON.
  flow:z.null().default(null),templateOrigin:z.strictObject({id:Id,version:Revision}).nullable().default(null),
  sourceMapId:Id.nullable().default(null),sourceRevision:Revision.nullable().default(null)
}).refine(v=>(v.kind==='session')===!!v.session);
export const MapVotes=z.record(Id,z.number().int().min(0).max(100)).refine(v=>Object.keys(v).length<=2000);
export const PutMap=z.strictObject({baseRevision:Revision,value:MapInput,
  votes:MapVotes.optional(),timer:z.strictObject({remaining:z.number().int().min(0).max(14_400),running:z.boolean()}).optional()
});
export const MapPage=z.strictObject({cursor:Id.optional()});
export const MapTemplateInput=z.strictObject({title:z.string().trim().min(1).max(160),description:z.string().max(3000).default(''),
  when:z.string().max(3000).default(''),scope:z.enum(['personal','project','workspace']),kind:z.enum(['permanent','session']),
  document:MapDocument,sourceMapId:Id.nullable().default(null),sourceRevision:Revision.nullable().default(null)
});
export const PutMapTemplate=z.strictObject({baseRevision:Revision,value:MapTemplateInput});
export type MapData=z.infer<typeof MapInput>;
export type MapWrite=z.infer<typeof PutMap>;
export type TemplateData=z.infer<typeof MapTemplateInput>;
export const mapSchemas={MapObject,MapConnection,MapDocument,MapInput,PutMap,MapVotes,MapPage,MapTemplateInput,PutMapTemplate};
