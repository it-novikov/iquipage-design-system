import {z} from 'zod';

/** Capture before loading a project snapshot; subscribe from this position afterwards. */
export const EventHeadResponse=z.strictObject({cursor:z.string().min(1).max(3000)});
export type EventHead=z.infer<typeof EventHeadResponse>;
