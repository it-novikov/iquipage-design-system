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
export const FINANCE_LIMITS={category:80,description:500,counterparty:160,reference:160,voidReason:300,entries:100_000,
  categories:200,plans:50,planName:120,planLines:500,planVersions:100,planNote:300,lineNote:300,varianceNote:500,taskTitle:240} as const;
/** Who a category is for: income, expense or both. An entry and a plan line take a category of their direction. */
export const FinanceCategoryDirection=z.enum(['income','expense','both']);

const optionalText=(max:number)=>z.string().trim().min(1).max(max).nullable().default(null);
/** A planned entry expects money on its due date; a posted one records the day it happened. Voiding is a command. */
export const FinanceEntryInput=z.strictObject({
  direction:FinanceDirection,
  state:z.enum(['planned','posted']),
  amountMinor:AmountMinor,
  currencyCode:CurrencyCode,
  dueDate:DateOnly.nullable().default(null),
  postedDate:DateOnly.nullable().default(null),
  /** A category of the project, of the entry's direction or both; archived only when the entry already has it. */
  categoryId:Id,
  /** A release or sprint of the same project, or null. */
  releaseId:Id.nullable().default(null),
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
  dueDate:DateOnly.nullable(),postedDate:DateOnly.nullable(),
  /** The category's name when this revision was written: a historical label, read only. */
  category:z.string(),categoryId:Id,releaseId:Id.nullable(),description:z.string(),
  counterparty:z.string().nullable(),reference:z.string().nullable(),voidReason:z.string().nullable()
};
export const FinanceEntryResponse=z.strictObject({
  id:Id,projectId:Id,...fields,
  /** The category's current name. */
  categoryName:z.string(),
  entryDate:DateOnly,revision:Revision,
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
/** `timeZone` is the project's (or its workspace's): "today", periods and overdue entries are read in it. */
export const FinanceSettingsResponse=z.strictObject({projectId:Id,currencyCode:CurrencyCode,revision:Revision,updatedAt:moment.nullable(),timeZone:z.string()});
const sums={postedIncome:MinorTotal,postedExpense:MinorTotal,plannedIncome:MinorTotal,plannedExpense:MinorTotal};
const count=z.number().int().nonnegative();
export const FinanceSummaryResponse=z.strictObject({
  from:DateOnly.nullable(),to:DateOnly.nullable(),
  currencies:z.array(z.strictObject({currencyCode:CurrencyCode,...sums,balance:MinorTotal,forecast:MinorTotal,postedCount:count,plannedCount:count,voidedCount:count})),
  months:z.array(z.strictObject({month:z.string().regex(/^\d{4}-\d{2}$/),currencyCode:CurrencyCode,...sums})),
  categories:z.array(z.strictObject({categoryId:Id,category:z.string(),direction:FinanceDirection,currencyCode:CurrencyCode,posted:MinorTotal,planned:MinorTotal})),
  truncated:z.boolean()
});
export type FinanceSummary=z.infer<typeof FinanceSummaryResponse>;

// The budget plan (docs/decisions/0009-finance-plan.md): categories, a plan as a series of versions with lines for
// the whole period, approval that freezes a version, revision into a new draft, the overview against the plan and
// explanations of variances.

const planText=(max:number)=>z.string().trim().min(1).max(max);
/** Creates a category at base revision 0 or changes it; `archived` hides it from new entries and lines. */
export const FinanceCategoryInput=z.strictObject({
  name:planText(FINANCE_LIMITS.category),
  direction:FinanceCategoryDirection,
  archived:z.boolean().default(false)
});
export const PutFinanceCategory=z.strictObject({baseRevision:Revision,value:FinanceCategoryInput});
export const FinanceCategoryResponse=z.strictObject({
  id:Id,projectId:Id,name:z.string(),direction:FinanceCategoryDirection,archived:z.boolean(),archivedAt:moment.nullable(),
  revision:Revision,updatedAt:moment
});
export type FinanceCategory=z.infer<typeof FinanceCategoryResponse>;
export const FinanceCategoryListResponse=z.strictObject({items:z.array(FinanceCategoryResponse)});

/** The header of a plan. The period and the release are fixed once a version of the plan has been approved. */
export const FinancePlanInput=z.strictObject({
  name:planText(FINANCE_LIMITS.planName),
  periodStart:DateOnly,
  periodEnd:DateOnly,
  /** A plan for one release or sprint of the project; null plans the whole project. */
  releaseId:Id.nullable().default(null)
}).refine(v=>v.periodStart<=v.periodEnd,'The period starts before it ends');
/** Creates a plan with an empty draft at base revision 0, or changes its header at its revision. */
export const PutFinancePlan=z.strictObject({baseRevision:Revision,value:FinancePlanInput});
/** A sum for the whole period of the plan, in one currency, for one category and direction. Zero is a plan too. */
export const FinancePlanLineInput=z.strictObject({
  direction:FinanceDirection,
  categoryId:Id,
  amountMinor:z.number().int().min(0).max(999_999_999_999_999),
  currencyCode:CurrencyCode,
  /** Only on lines of a plan for the whole project. */
  releaseId:Id.nullable().default(null),
  note:optionalText(FINANCE_LIMITS.lineNote)
});
export const FinancePlanDraftInput=z.strictObject({
  /** Why this version differs from the one before. */
  note:optionalText(FINANCE_LIMITS.planNote),
  lines:z.array(FinancePlanLineInput).max(FINANCE_LIMITS.planLines)
});
const PlanVersionNumber=z.number().int().min(1).max(FINANCE_LIMITS.planVersions);
/** Replaces the draft, its note and all its lines, at the draft's revision. */
export const PutFinancePlanDraft=z.strictObject({baseRevision:Revision,version:PlanVersionNumber,value:FinancePlanDraftInput});
/** Approves the draft exactly as seen: its number and its revision. The approved version before it is superseded. */
export const ApproveFinancePlan=z.strictObject({baseRevision:Revision,version:PlanVersionNumber});
/** Starts a new draft from a copy of the approved version, at that version's revision. */
export const ReviseFinancePlan=z.strictObject({baseRevision:Revision,version:PlanVersionNumber,note:optionalText(FINANCE_LIMITS.planNote)});

/** Discards the draft as seen, with its lines. A plan whose only version was this draft goes with it. */
export const DiscardFinancePlanDraft=z.strictObject({baseRevision:Revision,version:PlanVersionNumber});
export const FinancePlanVersionState=z.enum(['draft','approved','superseded']);
const person={id:z.string(),name:z.string()};
export const FinancePlanVersionSummary=z.strictObject({
  version:PlanVersionNumber,state:FinancePlanVersionState,note:z.string().nullable(),revision:Revision,lineCount:z.number().int().nonnegative(),
  approvedAt:moment.nullable(),approvedBy:z.strictObject(person).nullable(),
  createdAt:moment,createdBy:z.strictObject(person),updatedAt:moment
});
export const FinancePlanLineResponse=z.strictObject({
  position:z.number().int().min(1).max(FINANCE_LIMITS.planLines),direction:FinanceDirection,categoryId:Id,categoryName:z.string(),
  amountMinor:z.number().int().min(0).max(999_999_999_999_999),currencyCode:CurrencyCode,releaseId:Id.nullable(),note:z.string().nullable()
});
const planHeader={
  id:Id,projectId:Id,name:z.string(),periodStart:DateOnly,periodEnd:DateOnly,releaseId:Id.nullable(),releaseName:z.string().nullable(),
  /** The release was archived after the plan named it: the plan and its history stay. */
  releaseArchived:z.boolean(),revision:Revision,createdAt:moment,updatedAt:moment,
  approvedVersion:PlanVersionNumber.nullable(),draftVersion:PlanVersionNumber.nullable(),versionCount:z.number().int().nonnegative()
};
export const FinancePlanListResponse=z.strictObject({items:z.array(z.strictObject(planHeader))});
/** A plan with every version, and the lines of one: the one asked for, else the draft, else the approved one. */
export const FinancePlanResponse=z.strictObject({
  ...planHeader,
  versions:z.array(FinancePlanVersionSummary),
  selected:FinancePlanVersionSummary.extend({lines:z.array(FinancePlanLineResponse)}).nullable()
});
export type FinancePlan=z.infer<typeof FinancePlanResponse>;
export const FinanceDraftDiscardResponse=z.strictObject({planId:Id,planDeleted:z.boolean(),plan:FinancePlanResponse.nullable()});

/** What the explanation is about: one variance of one plan version. Fixed once written. */
export const FinanceVarianceNoteInput=z.strictObject({
  planId:Id,version:PlanVersionNumber,categoryId:Id,direction:FinanceDirection,currencyCode:CurrencyCode,
  text:planText(FINANCE_LIMITS.varianceNote)
});
/** The task that acts on the variance; created through the task module, once per explanation. Needs tasks.write. */
export const FinanceVarianceTaskInput=z.strictObject({
  title:planText(FINANCE_LIMITS.taskTitle),
  ownerId:Id.nullable().default(null),
  due:DateOnly.nullable().default(null)
});
export const PutFinanceVarianceNote=z.strictObject({
  baseRevision:Revision,value:FinanceVarianceNoteInput,createTask:FinanceVarianceTaskInput.nullable().default(null)
});
export const FinanceVarianceNoteResponse=z.strictObject({
  id:Id,projectId:Id,planId:Id,version:PlanVersionNumber,categoryId:Id,direction:FinanceDirection,currencyCode:CurrencyCode,
  text:z.string(),taskId:Id.nullable(),taskDisplayId:z.string().nullable(),
  /** The forecast the explanation was written for. */
  forecastMinorAtNote:MinorTotal,revision:Revision,
  createdAt:moment,createdBy:z.strictObject(person),updatedAt:moment,updatedBy:z.strictObject(person)
});

/**
 * The one sentence about the state of the budget, as a code the interface turns into words:
 * `no_plan` — no plan, so no variance can be judged; `not_approved` — the plan has no approved version, or a draft or superseded version is shown for comparison;
 * `variance_unexplained` — a variance needs an explanation (`detail` names the largest);
 * `explanation_outdated` — every variance is explained, but one for another forecast; `variance_explained`;
 * `within_plan` — the forecast is within the plan.
 */
export const FinanceOverviewStateCode=z.enum(['no_plan','not_approved','variance_unexplained','explanation_outdated','variance_explained','within_plan']);
const sideTotals=z.strictObject({plan:MinorTotal.nullable(),fact:MinorTotal,expected:MinorTotal,forecast:MinorTotal,variance:MinorTotal.nullable()});
export const FinanceOverviewResponse=z.strictObject({
  plan:z.strictObject({id:Id,name:z.string(),periodStart:DateOnly,periodEnd:DateOnly,releaseId:Id.nullable(),releaseName:z.string().nullable(),releaseArchived:z.boolean()}).nullable(),
  version:z.strictObject({version:PlanVersionNumber,state:FinancePlanVersionState,approvedAt:moment.nullable(),approvedBy:z.strictObject(person).nullable()}).nullable(),
  /** The entry dates counted: the plan's period, or every date when there is no plan. */
  period:z.strictObject({from:DateOnly,to:DateOnly}).nullable(),
  /** Today in the project's time zone: expected entries before it are overdue. */
  today:DateOnly,
  state:z.strictObject({
    code:FinanceOverviewStateCode,
    /** Variances that still need an explanation or a new one. */
    attentionCount:z.number().int().nonnegative(),
    detail:z.strictObject({currencyCode:CurrencyCode,categoryId:Id,categoryName:z.string(),direction:FinanceDirection,planned:z.boolean(),amountMinor:MinorTotal}).nullable()
  }),
  /** Per currency, never added across currencies. Variance is signed: positive is saving on expense, excess on income. */
  currencies:z.array(z.strictObject({
    currencyCode:CurrencyCode,income:sideTotals,expense:sideTotals,
    /** Чистый результат (fact) and Ожидаемый результат (forecast): income minus expense. */
    net:z.strictObject({fact:MinorTotal,forecast:MinorTotal}),
    overdue:z.strictObject({count:z.number().int().nonnegative(),income:MinorTotal,expense:MinorTotal})
  })),
  categories:z.array(z.strictObject({
    categoryId:Id,categoryName:z.string(),categoryArchived:z.boolean(),direction:FinanceDirection,currencyCode:CurrencyCode,
    /** False: «не было в плане»; plan, variance and percent are then null. */
    planned:z.boolean(),
    plan:MinorTotal.nullable(),fact:MinorTotal,expected:MinorTotal,forecast:MinorTotal,variance:MinorTotal.nullable(),
    /** Variance as a percentage of the plan, one decimal; null without a plan or with a zero plan. */
    variancePercent:z.number().nullable(),
    overdueCount:z.number().int().nonnegative(),overdue:MinorTotal,
    status:z.enum(['ok','needs_explanation','explained','explanation_outdated']),
    note:z.strictObject({id:Id,text:z.string(),forecastMinorAtNote:MinorTotal,current:z.boolean(),taskId:Id.nullable(),taskDisplayId:z.string().nullable(),
      revision:Revision,updatedAt:moment,updatedBy:z.strictObject(person)}).nullable()
  })),
  truncated:z.boolean()
});
export type FinanceOverview=z.infer<typeof FinanceOverviewResponse>;

export const financeSchemas={FinanceEntryInput,PutFinanceEntry,ChangeFinanceEntryState,FinanceSettingsInput,PutFinanceSettings,
  FinanceEntryResponse,FinanceEntryPageResponse,FinanceEntryVersionResponse,FinanceEntryHistoryResponse,FinanceSettingsResponse,FinanceSummaryResponse,
  FinanceCategoryInput,PutFinanceCategory,FinanceCategoryResponse,FinanceCategoryListResponse,
  FinancePlanInput,PutFinancePlan,FinancePlanLineInput,FinancePlanDraftInput,PutFinancePlanDraft,ApproveFinancePlan,ReviseFinancePlan,DiscardFinancePlanDraft,FinanceDraftDiscardResponse,
  FinancePlanListResponse,FinancePlanResponse,FinanceVarianceNoteInput,FinanceVarianceTaskInput,PutFinanceVarianceNote,
  FinanceVarianceNoteResponse,FinanceOverviewResponse};
