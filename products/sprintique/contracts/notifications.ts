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
/** An empty object: a one-time link to the bot carries no options. */
export const StartTelegramLink=z.strictObject({});
/** «Внешние уведомления» of a project, for e-mail and Telegram; members who may configure the project change it. */
export const ProjectNotifications=z.strictObject({enabled:z.boolean(),baseRevision:Revision});
/** The part of a Bot API update the webhook reads; Telegram adds fields freely. */
export const TelegramUpdate=z.looseObject({update_id:z.number().int().min(0),message:z.looseObject({}).optional()});

export interface Notification {
  id:string;kind:NotificationKind;
  /** The line to show, made from the task as it is now: «Анна К. назначил(а) вам «…»». */
  text:string;read:boolean;createdAt:string;
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
export interface ProjectNotificationSettings {available:boolean;enabled:boolean;revision:number;canChange:boolean}

export const notificationSchemas={MarkNotificationsRead,NotificationChannels,NotificationKinds,NotificationPreferences,StartTelegramLink,ProjectNotifications,TelegramUpdate};
