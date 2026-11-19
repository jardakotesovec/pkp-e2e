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
2026-11-19 · plugin-review · drive agent (pre-review drive) · `page.request` / `context.request` in a `newGuardedContext` context sends every call to the dead proxy (ECONNREFUSED 127.0.0.1:9, the bypass list does not apply to the APIRequestContext), so API calls had to be rewritten as in-page `fetch`; also the 3.5 file-list action menu is cut off in crops near the viewport bottom at 1000 px · a line in the drive-guard.js header saying to use in-page `fetch` (`page.evaluate`) for API calls, and a taller default viewport (1800) in the drive brief for crops of workflow menus
