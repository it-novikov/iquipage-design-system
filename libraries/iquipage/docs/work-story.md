# Work stories and decisions, vnext.39

Import `workEntry`, `workStep`, `workQuestion` from `@iquipage/web/core`. These are text-only HTML compositions. They neither start work nor save answers. The application supplies confirmed server state and owns identity, revision, permissions, paging and cancellation.

Inside a public `.iq-thread-content`, a work question shares the surrounding thread frame instead of drawing a second one (vnext.41).

Place them in `.iq-work-story`. Use `.iq-work-story-head`, `.iq-work-story-copy`, `.iq-work-tools` and `.iq-work-history` for a heading, connected prose, contextual controls and entries. Narrative text uses paragraphs, not generated report bullets. `.iq-agent-directory` and `.iq-agent-directory-filters` provide a responsive full-page directory around the existing settings rows.

`workEntry({id,text,by,time,detail,state})` gives an action a readable sentence and optional disclosure. `state` is empty, `error`, `waiting` or `complete`; never derive a made-up percentage. Append new entries by stable `data-entry` identity. Do not rebuild the reading surface or scroll to the bottom on each update. Keep one short live region for meaningful state changes, not the full log.

`workStep({id,title,state,stateLabel,summary,result,evidence,review,expanded})` renders a native details element. Evidence is `{href,label}` with HTTP(S), same-origin absolute paths or anchors. Rejected schemes are omitted. The host may populate `[data-step-actions]` with DS buttons. A completed step and an approved result remain distinct.

`workQuestion({id,title,context,options,name,value,answer,state,decision,disabled})` renders a question with native radio choices and a comment field. Each option has `id`, `label`, optional `description`, `recommended`. `__other` is reserved for the custom answer. Use globally unique question IDs and unique radio names in the form. `state` is `open`, `answered`, `resolved` or `stale`. A saved state displays the decision instead of editable options. The host inserts DS actions into `[data-question-actions]` and sets `[data-question-status]` after a confirmed command. Selection is only a draft; confirmation must check revision and permissions. Retain the question node during polling so focus and drafts survive. On conflict preserve the draft and require review of the fresh version.

Use light/dark tokens, native keyboard behavior and the public focus treatment. These patterns add no animation or idle timers. Test narrow containers, long text, delayed responses, permission loss and reload in the consuming application.

In vnext.43, `.iq-work-details` uses a full-width native summary at the surrounding text size, with 12px vertical padding and 12px before expanded content. Keyboard focus uses an outline without a text underline. Group related disclosures in `.iq-work-story-copy` for a compact rhythm. The same public treatment applies to entry details; no separate caption-sized click target is needed.
