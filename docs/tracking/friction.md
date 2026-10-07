# Friction — what made an agent's task harder than it needed to be

What cost a screen-driving agent calls, time or retries that a better
brief, doc, kit, seed or fixture would have saved; that agent appends a row
at the end of its task. The housekeeping session folds the rows and
deletes them under MAINTENANCE "The housekeeping session".

One line per entry, appended at the end, in this shape:

`YYYY-MM-DD · U<nn>, sync or issues · <role and agent id> · <what cost you calls, time or retries> · <what would have helped>`

Facts only, the same quarantine as everywhere else (nothing
security-shaped, no credentials).

## Entries
2026-10-08 · sync · regression reader rr13438 · a suspicion needed a second site administrator and no scenario key or screen makes one (users.md says so for the key): the reads of users.md and scenarios.md, then a `user_user_groups` row through the kit's `sql()` with its own cleanup on two installs · a seed option for a site-administrator user (or a line in scenarios.md naming the `sql()` insert and the delete that follows it)
2026-10-07 · sync · session (PR review pkp-lib#13447) · `node bin/ci.js dispatch --ojs-ref 2f8c53b706aa` (a 12-character SHA) dispatched a run whose every job failed at checkout after ~2 minutes (actions/checkout fetched it as a branch `refs/heads/2f8c53b706aa*`); only a full 40-character SHA works, which neither harness.md "CI" nor the dispatcher says · bin/ci.js refusing (or resolving through `gh api`) a hex ref shorter than 40 characters before dispatching
2026-10-07 · sync · regression reader rr2 (PR review pkp-lib#13447) · `app.api.createContext({context: {enableDois: …}})` answered 400 "Unsupported spec key \"context.enableDois\"": the DOI setup keys go at the top level of the context spec, beside `tag`, which scenarios.md "POST scenarios/context" lists among the keys without saying they are top-level and not under `context`; also `sql()` returned one newline-joined string for a multi-row result, which the probe-kit text ("rows as lines") reads as an array, so `rows.join` threw · scenarios.md naming the DOI keys as top-level spec keys (with a one-line example), and `sql()` always returning an array of lines
2026-10-07 · sync · regression reader rr1 (PR review pkp-lib#13447) · "Record Decision" on a decision page (Revert Decline) pressed right after `idle()` posted the decision with an empty subject and body (POST …/decisions 400 "This field is required."), as the email composer fills its template after idle; the screen showed nothing, two runs went to finding it · patterns.md "Probe kit" (or a kit `recordDecision(page)` helper) saying a decision page waits on `settled()` over the "Subject" box before "Record Decision"
2026-10-07 · sync · reporter rep (PR review pkp-lib#13447) · on OPS, WorkflowPage.gotoEditorial() opens a declined preprint on its publication pages ("Title & Abstract"), where `[data-cy="workflow-action-items"]` is absent, so "Revert Decline" looked not offered although the API listed it; three probe runs went to finding that the "Production" side-menu item must be clicked first · WorkflowPage.gotoEditorial() (or a kit `recordDecision()` helper, as rr1 asked) landing on the active stage, or patterns.md saying a declined submission opens on its publication
2026-10-07 · sync · fold agent acc (PR review pkp-lib#13447, U45) · the context scenario's `doiCreationTime` takes only copyediting (production), publication and never, so every "Immediately…" walk saved the Setup tab on screen first, and a suite bullet on that setting would have to as well · `PKPContextScenarioBuilder` taking an `immediate` value (→ `immediateCreationTime`) once the PR merges, with its parity line, for U45's Planned "Immediately…" items
