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
2026-10-06 · sync · regression reader rr1 (pkp-lib#13375) · no probe-kit or page-object helper drives the submission wizard, so the walk was hand-rolled and lost two reruns: the Review step's "Submit" is disabled (not refused by the server) while validation errors stand, and a review panel's "Edit" is reached by `[aria-describedby="review<stepId>"]`, not a panel-scoped role query · a small wizard helper in the probe kit (resume a `submitted: false` draft, Continue to Review, read the review panels and their warnings, open a step from its panel) or a patterns.md note on these two facts
