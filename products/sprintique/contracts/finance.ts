import {z} from 'zod';
import {Id,Revision,DateOnly} from './index.js';

// Project finance: a ledger of income and expense entries in integer minor units of an ISO 4217 currency.
// There are no accounts, transfers or exchange rates; every total stands in its own currency.

/** An ISO 4217 alphabetic code. */
export const CurrencyCode=z.string().regex(/^[A-Z]{3}$/);
/** Integer minor units (kopecks for RUB); at most 10^15 − 1, so every amount is an exact JavaScript number. */
export const AmountMinor=z.number().int().min(1).max(999_999_999_999_999);
/** A total in minor units as decimal text: sums stay exact beyond the range of a JavaScript number. */
export const MinorTotal=z.string().regex(/^-?\d+$/);
export const FinanceDirection=z.enum(['income','expense']);
export const FinanceEntryState=z.enum(['planned','posted','voided']);
export const FINANCE_LIMITS={category:80,description:500,counterparty:160,reference:160,voidReason:300,entries:100_000} as const;

const optionalText=(max:number)=>z.string().trim().min(1).max(max).nullable().default(null);
/** A planned entry expects money on its due date; a posted one records the day it happened. Voiding is a command. */
export const FinanceEntryInput=z.strictObject({
  direction:FinanceDirection,
  state:z.enum(['planned','posted']),
  amountMinor:AmountMinor,
  currencyCode:CurrencyCode,
  dueDate:DateOnly.nullable().default(null),
  postedDate:DateOnly.nullable().default(null),
  category:z.string().trim().min(1).max(FINANCE_LIMITS.category),
  description:z.string().trim().min(1).max(FINANCE_LIMITS.description),
  counterparty:optionalText(FINANCE_LIMITS.counterparty),
  reference:optionalText(FINANCE_LIMITS.reference)
}).refine(v=>v.state==='planned'?v.dueDate!==null&&v.postedDate===null:v.postedDate!==null,'Planned entries need a due date and no posting date; posted ones need a posting date');
export type FinanceEntryData=z.infer<typeof FinanceEntryInput>;
/** Creates an entry at base revision 0 or edits it at its current revision; an edit keeps the state. */
export const PutFinanceEntry=z.strictObject({baseRevision:Revision,value:FinanceEntryInput});
/** Posting records the actual date and amount of a planned entry; voiding is final and needs a reason. */
export const ChangeFinanceEntryState=z.discriminatedUnion('state',[
  z.strictObject({state:z.literal('posted'),baseRevision:Revision,postedDate:DateOnly,amountMinor:AmountMinor}),
  z.strictObject({state:z.literal('voided'),baseRevision:Revision,voidReason:z.string().trim().min(1).max(FINANCE_LIMITS.voidReason)})
]);
export const FinanceSettingsInput=z.strictObject({currencyCode:CurrencyCode});
export const PutFinanceSettings=z.strictObject({baseRevision:Revision,value:FinanceSettingsInput});

const moment=z.iso.datetime();
const fields={
  direction:FinanceDirection,state:FinanceEntryState,amountMinor:AmountMinor,currencyCode:CurrencyCode,
  dueDate:DateOnly.nullable(),postedDate:DateOnly.nullable(),category:z.string(),description:z.string(),
  counterparty:z.string().nullable(),reference:z.string().nullable(),voidReason:z.string().nullable()
};
export const FinanceEntryResponse=z.strictObject({
  id:Id,projectId:Id,...fields,entryDate:DateOnly,revision:Revision,
  createdAt:moment,createdById:z.string(),createdByName:z.string(),updatedAt:moment,updatedById:z.string(),updatedByName:z.string()
});
export type FinanceEntry=z.infer<typeof FinanceEntryResponse>;
export const FinanceEntryPageResponse=z.strictObject({items:z.array(FinanceEntryResponse),total:z.number().int().nonnegative(),nextCursor:z.string().nullable()});
export const FinanceEntryVersionResponse=z.strictObject({
  revision:Revision,change:z.enum(['created','updated','posted','voided']),...fields,
  actorId:z.string(),actorName:z.string(),createdAt:moment
});
export type FinanceEntryVersion=z.infer<typeof FinanceEntryVersionResponse>;
export const FinanceEntryHistoryResponse=z.strictObject({items:z.array(FinanceEntryVersionResponse),nextCursor:z.number().int().positive().nullable()});
export const FinanceSettingsResponse=z.strictObject({projectId:Id,currencyCode:CurrencyCode,revision:Revision,updatedAt:moment.nullable()});
const sums={postedIncome:MinorTotal,postedExpense:MinorTotal,plannedIncome:MinorTotal,plannedExpense:MinorTotal};
const count=z.number().int().nonnegative();
export const FinanceSummaryResponse=z.strictObject({
  from:DateOnly.nullable(),to:DateOnly.nullable(),
  currencies:z.array(z.strictObject({currencyCode:CurrencyCode,...sums,balance:MinorTotal,forecast:MinorTotal,postedCount:count,plannedCount:count,voidedCount:count})),
  months:z.array(z.strictObject({month:z.string().regex(/^\d{4}-\d{2}$/),currencyCode:CurrencyCode,...sums})),
  categories:z.array(z.strictObject({category:z.string(),direction:FinanceDirection,currencyCode:CurrencyCode,posted:MinorTotal,planned:MinorTotal})),
  truncated:z.boolean()
});
export type FinanceSummary=z.infer<typeof FinanceSummaryResponse>;

export const financeSchemas={FinanceEntryInput,PutFinanceEntry,ChangeFinanceEntryState,FinanceSettingsInput,PutFinanceSettings,
  FinanceEntryResponse,FinanceEntryPageResponse,FinanceEntryVersionResponse,FinanceEntryHistoryResponse,FinanceSettingsResponse,FinanceSummaryResponse};
