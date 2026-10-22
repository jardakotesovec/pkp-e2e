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
2026-10-22 · U01 · harness agent hU01 · the brief said "never start a server; the probe servers are running" while the variant it asked for had no server yet, so the parity drive needed a judgement call (resolved by extending probe-servers --start to the variant) · a harness brief for a config variant says the variant is brought up with `npm run probe-servers -- --start` once its code exists
2026-10-22 · U01 · test author tojs (OJS) · the brief let S10 stay in the parallel file ("changes nothing site-wide"), but two of its answers (the wrong password's generic sentence, "Your last action was not completed…") are `admin`'s stored one-time notices, which any concurrent admin page drains (patterns.md parallel lesson 2), so it moved to a serial `@solo` file after a probe showed where they render · a test-author brief for an `admin`-only scenario that reads a legacy notice says `@solo` (lesson 2) up front, beside the "changes nothing site-wide" test
2026-10-22 · U01 · OPS test author tops · the first S10 run waited about 16 minutes behind an exclusive fix trial on all three apps and my `timeout 420` around bin/app-lock.sh killed it before it held the lock, a run lost; the Confirm Access box is `input[name=password]` with a suffixed id, so `input#password` (the Login form's) missed it and cost a run · the test-author brief says a run under bin/app-lock.sh can queue for many minutes behind a trial, so the four-minute bound is put on the run after "holds", not around the lock; the reauth-variant section of harness.md names the Confirm Access form's locators (`form#confirmPassword`, `input[name=password]`)
2026-10-22 · U01 · OMP test author tomp · the brief said to build S10 on local helpers while the OJS author owned the shared page objects; the shared ConfirmAccessPage/adminNotice/waitPastWindow then landed in AdminPages.js mid-task and the suite was rewritten onto them with one more red run (my own pathname check); a probe also sat ~15 min behind an exclusive fix trial on all three apps · when the owner of a shared page object is writing the very surface (here a new gate form), the brief says to wait for its first version (test-author brief's own 'page_objects' note, U10/U13/U16)
2026-10-22 · flake · flake diagnostician omp-u03s12-contributor-close · the brief named "the harness's PLAYWRIGHT_* levers" for a test whose page lives in its own `browser.newContext()` (U03 `freshLogin`), which no lever reached, so a lever module wrapping `BrowserType.launch` had to be written first; and the brief's "Do NOT edit docs/tracking/ci-triage.md" stood beside two ci-triage edits it asked for (both made, as asked) · fixed in base-test.js this session (every `browser.newContext()` is armed); a flake brief checks whether the failing page is a fixture page before naming levers, and lists the files it wants edited apart from the ones it forbids
