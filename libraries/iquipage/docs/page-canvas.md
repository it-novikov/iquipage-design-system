# Page canvas and task signals (.51)

`.iq-page-fluid` is an opt-in modifier for `.iq-workspace-page` and `.iq-agent-directory`: page max-width is removed and horizontal outer padding is zero at every breakpoint. Vertical rhythm, internal cards, controls and document reading measure are unchanged. Existing callers retain their defaults.

`.iq-task-signals` composes one compact horizontal row of the existing `taskSignal` and optional `.iq-task-blocker`. A blocker is a text status with a supplied lock icon, visible wording, and danger ink without a filled badge. Provide visible text and an accessible description of actual blockers. An optional public `iq-tooltip` may expose the full reason on focus and dismiss with Escape; it is not an actionable button and must not be given a false interaction. The host decides from authoritative dependency state; priority and blocking remain independent.

Public settings layout exposes `::part(content)` for content padding and `--iq-settings-measure` for its maximum measure. A fluid host may set the content part's inline padding to zero and the measure to `none`. Slots, internal control padding and the navigation rail remain intact.

Workspace sizing remains composed from native labelled landmarks. Public hooks `--iq-workspace-nav-width` and `--iq-workspace-aside-width` size the navigation and context rails. Plan groups remain reusable for roadmaps, iterations and queues; summaries and responsive comparisons accept host-formatted amounts. These existing contract notes were relocated from runtime CSS comments without changing their rules.
