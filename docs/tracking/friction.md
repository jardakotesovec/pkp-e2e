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
2026-11-17 · sync · PR review merge (VM s1, pkp-lib#13562) · after the developer rebased the app PRs, their e2e hooks ran the companion `13562` (279 commits behind `main`, carrying only a kept walk, no spec change) and went red on OJS and OMP in tests `main` had already accommodated for pkp-lib#13653; diagnosing it cost a log read, a local rerun and a line-number comparison · a companion that holds no spec or test change should not exist as a branch the hooks pick up (keep the walk on `main` at verdict time), or the hook should print "companion found, N commits behind main" when it picks one
