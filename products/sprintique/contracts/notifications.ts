import {z} from 'zod';
import {Revision} from './index.js';

// Personal notifications and their delivery to e-mail and Telegram (docs/decisions/0006-notifications-telegram.md,
// docs/decisions/0007-notification-channels.md).
export const NotificationKind=z.enum(['assigned','mention','request','deadline']);
export type NotificationKind=z.infer<typeof NotificationKind>;
/** Marks the named notifications read, and with `before` every one up to that moment («Прочитать все» of what was seen). */
export const MarkNotificationsRead=z.strictObject({ids:z.array(z.uuid()).max(100).default([]),before:z.iso.datetime().nullable().default(null)});
/** Which external channels are on: the e-mail of the account and Telegram. The bell in the product is always on. */
export const NotificationChannels=z.strictObject({email:z.boolean(),telegram:z.boolean()});
/** Per kind: whether it goes to the channels that are on. In the product every notification is always shown. */
export const NotificationKinds=z.strictObject({assigned:z.boolean(),mention:z.boolean(),request:z.boolean(),deadline:z.boolean()});
export const NotificationPreferences=z.strictObject({channels:NotificationChannels,kinds:NotificationKinds});
/** A one-click answer to a notification (bell): its name, a reply's text, or the date a deadline moves to. */
export const QuickActionName=z.enum(['take','accept','return','postpone','reply']);
export type QuickActionName=z.infer<typeof QuickActionName>;
export const NotificationAction=z.strictObject({action:QuickActionName,text:z.string().min(1).max(20000).optional(),due:z.iso.date().optional()});
/** An empty object: a one-time link to the bot carries no options. */
export const StartTelegramLink=z.strictObject({});
/** «Внешние уведомления» of a project, for e-mail and Telegram; members who may configure the project change it. */
export const ProjectNotifications=z.strictObject({enabled:z.boolean(),baseRevision:Revision});
/** The part of a Bot API update the webhook reads; Telegram adds fields freely. */
export const TelegramUpdate=z.looseObject({update_id:z.number().int().min(0),message:z.looseObject({}).optional(),callback_query:z.looseObject({}).optional()});

export interface Notification {
  id:string;kind:NotificationKind;
  /** The sentence to show, with the task's key: «Вас назначили исполнителем задачи SPR-26». */
  text:string;
  /** Who did it, short («Анна К.»), shown on a quieter line; none for a deadline. */
  author:string|null;
  /** One-click answers the person may give now, with their words. */
  actions:{action:QuickActionName;label:string}[];
  read:boolean;createdAt:string;
  project:{id:string;slug:string;name:string};task:{id:string;key:string;title:string};
  actor:{id:string;name:string|null;avatarRevision:number|null}|null;
}
export interface NotificationPage {items:Notification[];unread:number;nextCursor:string|null}
export interface NotificationSettings {
  /** The account's address, shown read-only; available when the server sends notification letters and there is one. */
  email:{available:boolean;address:string|null};
  telegram:{available:boolean;botUsername:string|null;connection:{username:string|null;linkedAt:string}|null};
  preferences:{channels:{email:boolean;telegram:boolean};kinds:Record<NotificationKind,boolean>};
}
/** What a quick action did, and how to take it back where that is possible. */
export interface NotificationActionResult {
  result:string;read:true;
  undo:{kind:'status';status:string;rank:number;revision:number}|{kind:'due';due:string|null;revision:number}|{kind:'reopen';requestId:string;revision:number}|null;
}
export interface ProjectNotificationSettings {available:boolean;enabled:boolean;revision:number;canChange:boolean}

export const notificationSchemas={MarkNotificationsRead,NotificationAction,NotificationChannels,NotificationKinds,NotificationPreferences,StartTelegramLink,ProjectNotifications,TelegramUpdate};
