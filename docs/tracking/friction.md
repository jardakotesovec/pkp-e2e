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
2026-09-08 · sync · regression reader rr2 · `npm run reset:ojs` leaves a cold database on which the probe kit's `bootstrapProbe()` and every `_test/scenarios/*` call answer 500 (`sessions` table absent), so the first probe run failed and the fix (run the suites' setup project, `npx playwright test -c configs/ojs.config.js --project=setup`) had to be dug out of `bootstrap.setup.js` and the fleet setup log; 4 calls · the regression-read brief's "Reset first (`npm run reset:<app>`)" should name the setup command that follows it, or `reset:<app>` should run it
