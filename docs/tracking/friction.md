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
2026-09-08 · U23 · test author tojs · the shared `EditorialDashboardPage.js` was edited by the OJS and OMP test authors at the same time: both added an `activityCell(row)`, the later duplicate (a wrong cell index, the ID column being a row header) silently overrode the first and failed an OJS test until the two were merged by hand · the brief could name one author as the shared page object's owner for the session, the other returning its locator needs as proposed methods, or the run could lint duplicate class members
2026-09-08 · U23 · test author tomp · Two test authors extended `shared/playwright/pages/EditorialDashboardPage.js` at the same minute: my insertion landed on a file the OJS author had already changed, one botched write corrupted it and cost a repair from its intact head, and a later fix of mine found the method already rewritten under me · A revision brief could hand the shared page object to one author (the other returns its needs as method names), or ask each to append only under a per-app marker comment so writes never overlap
