import {z} from 'zod';
import type {NotificationKind} from './notifications.js';

// The inbox of notifications (docs/decisions/0008-mentions-and-service-inbox.md): the rows of the bell, read oldest
// first by a service account (or a person) catching up, through REST and the MCP tools list_inbox and mark_inbox_read.
/** Marks the named items read, and with `upTo` every unread item up to and including that one, in inbox order. */
export const MarkInboxRead=z.strictObject({ids:z.array(z.uuid()).max(100).default([]),upTo:z.uuid().nullable().default(null)});

export interface InboxItem {
  id:string;kind:NotificationKind;
  /** The line a person reads: «Анна К. упомянул(а) вас в «…»». */
  text:string;read:boolean;createdAt:string;
  project:{id:string;name:string};task:{id:string;key:string;title:string;url:string};
  actor:{id:string;name:string|null;kind:'human'|'service'|'agent'|null}|null;
  /** A mention's message or a request's note (else its thread's first message): one line, ≤280 characters, mentions as «@Имя». */
  quote:string|null;
  /** The thread to answer in: a mention's thread, or the request's. */
  threadId:string|null;messageId:string|null;
  request:{id:string;kind:string|null}|null;due:string|null;
}
export interface InboxPage {items:InboxItem[];unread:number;nextCursor:string|null}
export interface InboxMarked {marked:number;unread:number}

export const inboxSchemas={MarkInboxRead};
