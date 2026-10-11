import {z} from 'zod';
import {Id,Revision} from './index.js';

export const WikiPageInput=z.strictObject({
  title:z.string().trim().min(1).max(200),body:z.string().max(100000),
  parentId:Id.nullable(),archived:z.boolean()
});
export const PutWikiPage=z.strictObject({baseRevision:Revision,value:WikiPageInput});
export const RestoreWikiVersion=z.strictObject({baseRevision:Revision.min(1),version:Revision.min(1)});
export const WikiMetadata=z.strictObject({
  id:Id,projectId:Id,parentId:Id.nullable(),title:WikiPageInput.shape.title,
  revision:Revision.min(1),archivedAt:z.iso.datetime({offset:true}).nullable(),
  createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true}),updatedBy:Id
});
export const WikiPage=WikiMetadata.extend({body:WikiPageInput.shape.body});
export const WikiCatalog=z.array(WikiMetadata).max(1000);
export const WikiReceipt=z.strictObject({receipt:z.literal('wiki-page'),id:Id,projectId:Id,
  revision:Revision.min(1),updatedAt:z.iso.datetime({offset:true})});
export const WikiWriteResponse=z.union([WikiPage,WikiReceipt]);
export const WikiVersionSummary=z.strictObject({revision:Revision.min(1),title:WikiPageInput.shape.title,
  actorId:Id,createdAt:z.iso.datetime({offset:true})});
export const WikiHistory=z.strictObject({items:z.array(WikiVersionSummary).max(50),nextCursor:Revision.min(1).nullable()});
export const WikiVersion=WikiVersionSummary.extend({body:WikiPageInput.shape.body});
export const WikiSearch=z.strictObject({items:z.array(WikiMetadata.extend({excerpt:z.string().max(240)})).max(50),nextCursor:z.string().max(3000).nullable()});
export const PutWikiTaskLink=z.strictObject({baseRevision:Revision,archived:z.boolean()});
export const WikiTaskLink=z.strictObject({taskId:Id,pageId:Id,projectId:Id,revision:Revision.min(1),
  archivedAt:z.iso.datetime({offset:true}).nullable(),createdAt:z.iso.datetime({offset:true})});
export const WikiTaskLinks=z.array(WikiTaskLink).max(100);
export const WikiLinkReceipt=z.strictObject({receipt:z.literal('wiki-task-link'),taskId:Id,pageId:Id,projectId:Id,revision:Revision.min(1)});
export const WikiLinkWriteResponse=z.union([WikiTaskLink,WikiLinkReceipt]);
export const WikiBacklinks=z.strictObject({items:z.array(z.strictObject({id:Id,displayId:z.string(),title:z.string(),
  revision:Revision.min(1)})).max(50),nextCursor:Id.nullable()});
export const wikiSchemas={WikiPageInput,PutWikiPage,RestoreWikiVersion,WikiMetadata,WikiPage,WikiCatalog,
  WikiReceipt,WikiWriteResponse,WikiVersionSummary,WikiHistory,WikiVersion,WikiSearch,PutWikiTaskLink,WikiTaskLink,WikiTaskLinks,WikiBacklinks,WikiLinkReceipt,WikiLinkWriteResponse};
