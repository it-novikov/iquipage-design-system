# Planning R4.1 — API contract between server and UI

All paths are under `/api/v1/projects/{projectId}`. Wire names are fixed; the UI is built against them in parallel.
Russian user-facing messages, no bullet lists in product text.

## Project setting `planning.estimateFormat`

Stored in `app.projects.planning_defaults` (jsonb) next to `format` and `days`:
`{estimateFormat: 'time'|'points' (default 'time'), hoursPerDay: 1..24 (default 8), hoursPerWeek: 1..168 (default 40)}`.
The existing settings intent `{kind:'settings', values:{format, days, timeZone, inheritTimeZone?}}` gains optional
`estimateFormat`, `hoursPerDay`, `hoursPerWeek` (absent keeps the stored value). `GET planning/view/settings` returns
them too. Changing the format never rewrites stored estimates.

## Task `estimate`

`TaskInput.estimate: {value: number > 0 and <= 9999 (max 2 decimals), unit: 'h'|'d'|'w'|'sp'} | null`, default null.
Task documents (GET/PUT task, MCP `get_task`/`create_task`/`update_task`, board rows) carry `estimate` the same way.
Columns: `app.tasks.estimate_value numeric(8,2)`, `app.tasks.estimate_unit text` (both null or both set).
`estimateHours` (server-derived) = value for h, value*hoursPerDay for d, value*hoursPerWeek for w; for sp it is null
and `estimatePoints` = value. A task whose unit does not match the project format (sp in a time project or h/d/w in a
points project) is `estimateMismatch: true` and counts in no sum.

## Release `goal`

`app.releases.goal text` (<= 240, null). Release create/edit values gain optional `goal: string|null`.

## Containers projection — `POST planning/view/containers` (body `{}`)

```
{ protocol: 'sprintique.planning-containers/1', projectId, revision: '<planning revision>', today: 'YYYY-MM-DD',
  estimate: {format:'time'|'points', hoursPerDay, hoursPerWeek},
  capabilities: {plan: bool /* tasks.write: move, edit due/estimate, create task */,
                 manageReleases: bool /* releases.manage: create/edit/start sprint or release */,
                 completeSprint: bool /* releases.manage, human */},
  completed: {count},                       // closed or cancelled sprints and releases
  containers: [Container] }                 // order: active sprint(s), planned sprints by start, open releases
                                            // (flexible, planned or active) by deadline then name, backlog last
Container = { id /* release id or 'backlog' */, kind: 'sprint'|'release'|'backlog', state: 'active'|'planned'|'backlog',
  name, goal: string|null, start: date|null, end: date|null, deadline: date|null, revision: number|null,
  summary: {total, done, open, estimateHours, remainingHours, estimatePoints, remainingPoints, noDue},
  rows: [Row] }                              // tree order: depth-first, siblings by rank; done rows NOT reordered
Row = { id, key, title, kind: 'epic'|'task', type: 'task'|'bug'|'epic', parentId: string|null, depth: 0..,
  status, done: bool /* status ready_for_release or accepted */, priority, ownerId: string|null, ownerLabel: string,
  due: date|null, estimate: {value, unit}|null, estimateHours: number|null, estimatePoints: number|null,
  estimateMismatch: bool, rank: number, revision: number,
  crumb: string|null        /* parent title when the parent lives in another container */,
  afterSprintEnd: bool      /* sprint row with due > sprint end */,
  noDue: bool               /* release row without due */,
  rollup: null | {here: {total, done, estimateHours, estimatePoints}, elsewhere: [{containerId, name, count}]} }
```

`kind` is `epic` when `type == 'epic'` or the task has children. `depth` is relative to the container: a child whose
parent sits in the same container is nested under it; otherwise it is a root row with `crumb`. Summary counts leaf
work only (tasks and subtasks, not epics). No paging, no filters.

## Move — `POST planning/view/move` (Idempotency-Key required)

```
{ ids: [taskId] (1..200), containerId: 'backlog'|releaseId, afterId: taskId|null /* null = first */,
  withChildren: bool = true, expectedRevision?: string }
-> { status:'committed', operationId, revision, moved: [taskId], containers: [{id, summary}],
     undo: {kind:'restore', expectedRevision, items:[{id, containerId, inherit: bool, rank}]},
     warnings: [{taskId, code:'AFTER_SPRINT_END'|'NO_DUE', message}] }
```

Transactional, one planning operation with ranks and audit (`task.plan.changed`, `release.scope.changed`).
`withChildren`: an epic takes its descendants that sit in the same source container (not those elsewhere). With
`false` the descendants stay where they are (pinned to their old container). Ranks: the moved block lands right after
`afterId` among the target container's root rows (or at the top), keeping the block's internal order. Moving within
the same container is a reorder. Accepted (closed) results cannot move (409 RESULT_PINNED). Finished releases refuse
(409 RELEASE_FINISHED). Humans with `tasks.write` apply directly; agents get 403 HUMAN_REQUIRED and use the
`place` preview intent `{kind:'place', ids, containerId, afterId, withChildren}` (approval flow).

Undo: `POST planning/view/move` with body `{restore: <undo object>}` (also idempotent). Refused with 409
UNDO_STALE when the planning revision moved past `expectedRevision`.

## Dates — policy `planning-r4.0`

Conflicts between dates (constraint violations, due after sprint end, planned end after due) are warnings: previews
list them in `changes` with label «Конфликт дат…», commits succeed. Only cycles are refused (422 TEMPORAL_CYCLE).
Due edit uses the existing `bulk` intent (`field:'due'`) or `taskEdit`. Estimate edit uses `bulk` with
`field:'estimate'`, `value: {value, unit}|null`.

## Sprint completion

Existing `close` intent: `{kind:'close', groupId, acceptAllCandidates:true, destinationId?: releaseId,
destinations: {taskId: releaseId|'backlog'}}` (no destinationId means backlog). Done = status `ready_for_release`; under
r4.0 a done task is accepted whatever its preparation. Epics follow: an epic whose open subtasks carry over goes with
them. `POST planning/view/release {groupId}` keeps describing counts for the dialog. Completing needs
`releases.manage` from a person.
