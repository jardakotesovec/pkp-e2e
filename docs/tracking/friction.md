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
2026-11-12 · U30 · claim checker ccK1s · the kept k1.js wrote its state file as `k1-state-<app>.json` through `outDir()`, so r1 and r2 run at once would have shared it, and the kit names the run record `run-<app>-<HHMMSS>.json` without `PROBE_RUN` (two runs started in the same second got `run-ojs-112415.json` and `run-ojs-112415-192538.json`, told apart only by the submission ids in their responses) · `npm run lint:probe-imports` flagging a kept check that builds a file path from `outDir()` instead of `outFile()`, and `PROBE_RUN` in the run record's name
