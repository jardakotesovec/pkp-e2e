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
2026-11-16 · U27, sync · claim checker ccS13653 · the OMP UI bundle on slot s0 (js/build.js, 2026-11-11) predated the lib/ui-library tip (836c01b5), so the first OMP run read the retired "Mark as Complete" behaviour and was redriven after `npm run fetch-apps -- omp --rebuild` (about 10 calls); a waiter on `pgrep -f "probe.js <app>"` never ended because it matched itself · fleet-prep or the probe kit checking the bundle's age against `git -C lib/ui-library log -1` and refusing a stale one; a done-file idiom in patterns.md "Probe kit"
2026-11-16 · daily upstream session (VM s0) · `npm run fetch-apps -- --update` at the start found ojs/omp/ops `main` already at their tips (lib/ui-library `836c01b5`, moved there by an earlier session) and so skipped the UI build ("--update rebuilds when lib/ui-library moved"), leaving OMP's and OPS's `js/build.js` from 2026-11-11, older than the ui-library they run; caught only by a checker's misread (above), then `fetch-apps -- <app> --rebuild` for both · `fetch-apps --update` (and the SessionStart hook's line) comparing `js/build.js`'s time with `git -C lib/ui-library log -1` and rebuilding a stale bundle whether or not this run moved the pointer
2026-11-16 · U53 revision · test author tops1116 (OPS) · waiting on a backgrounded playwright run: a foreground `sleep` is blocked and an until-loop on `pgrep -f` of the run's own command line matched itself and hung to its time limit (3 calls) · the brief or harness.md "Running" naming one wait idiom for a run (the backgrounded run's completion notification, or an until-loop on the log's "passed|failed" summary line alone)
2026-11-16 · U27 revision · test author tojs1116 (OJS) · a Vue form's refusal summary ("Please correct one error.") read with `getByText` found nothing, because the count is a bare text node beside the "Go to …" list inside `.pkpFormErrors`: one red run and a rerun · a patterns.md "Locator pitfalls" line naming `.pkpFormErrors` as the summary to read whole (U29's page objects already carry an `errorSummary`)
