# Friction — what made an agent's task harder than it needed to be

What cost a screen-driving agent calls, time or retries that a better
brief, doc, kit, seed or fixture would have saved; that agent appends a row
at the end of its task. The maintenance session folds the rows and deletes
them under MAINTENANCE "The daily session".

One line per entry, appended at the end, in this shape:

`YYYY-MM-DD · U<nn> or sync · <role and agent id> · <what cost you calls, time or retries> · <what would have helped>`

Facts only, the same quarantine as everywhere else (nothing
security-shaped, no credentials).

## Entries
2026-09-07 · U21 · harness hU21 · the metadata "off" mode cost two API rounds: the app's own schema refuses the integer Context::METADATA_DISABLE the PHP form config carries, because the Vue form posts form-encoded strings ("0"); and an emptied text box arrives as null on every API route (ConvertEmptyStringsToNull), which cost one more · a scenarios.md "How the endpoints work" line saying settings passthroughs mirror the FORM-ENCODED PUT (strings, empty = null), and that psql on <app>_test is the parity ground truth (the db-diff idiom from U30/U31 harness runs, worth a kit helper)
2026-09-07 · U21 · test author tomp · one full re-run because scenario 17's control names the seeded journal as one "whose setup does not ask for keywords", while scenarios.md already records that a fresh context has keywords at "request" (the field shows, optional); and scenario 6's "contributor named in another language only" has no seed (footnote s says "a builder recipe to settle at test time"), which cost two probe runs to find the screen path (a French-only name is refused client-side; naming in English then switching the submission language works) · a scenario-writer check of the defaults in scenarios.md / seed-facts before naming the seeded context as a control, and a `contributors[]` submission key with locale-mapped names (already listed under "Field shapes not built yet")
2026-09-07 · U21 · test author tojs · one re-run because the activity log's submit entry is OJS-worded ("Article submitted", ojs locale.po) where lib/pkp's string is "Initial submission completed."; and the brief asks for a screenshot as evidence while the config takes none on failure, so the aria error-context files were copied as the screen record · a seed-facts line saying OJS overrides several lib/pkp event-log strings (grep `locale/en/locale.po` before quoting lib/pkp), and either `screenshot: only-on-failure` in config-factory or the brief naming error-context.md as the evidence
2026-09-07 · U21 · test author tops · one wasted probe launch because a throwaway script that reuses the suite's page object (`apps/ops/playwright/pages/SubmissionWizardPages.js`) cannot load it outside the runner: `base-test.js` throws on a missing `PKP_APP_ROOT`, and the fix (`PKP_APP_ROOT=checkouts/<app> PKP_SUITE_DIR=apps/<app>/playwright` on the probe command) is documented nowhere · a patterns.md "Probe kit" line saying page objects load under `bin/probe.js` only with those two variables set, or `bin/probe.js` exporting them per app itself
