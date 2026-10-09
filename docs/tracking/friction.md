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
2026-10-08 · sync · upstream session · two companions whose PRs merged on 2026-09-29 and 2026-09-30 (`13277-main`, `13412`) were never fast-forwarded: a companion's ci-triage row is committed on the companion alone, so `main`'s table read empty and the daily step 5 found nothing; today's two were found only by listing the remote branches · step 5 of the daily session lists `git branch -r` and checks each PR's state, or the row is also added on `main` when the companion is pushed
2026-10-08 · sync · PR review session (pkp/pkp-lib#13475) · a PHP driver that sends the app's own lookup classes to a local stand-in for OpenAlex and Crossref never reached it: the fleet's config routes every outgoing request to the dead proxy, 127.0.0.1 included, and `no_proxy` in the environment is not read (three runs to find) · a line in harness.md beside the dead proxy saying a driver points `Config::getData()['proxy']` at its own stub in its process, as `checks/sync/pkp-lib-13475/lookups.php` does
2026-10-09 · sync · a walk's setup on the default dataset (main session) · a role granted through the kit's `sql()` with `date_start = now()` was not yet in force for a request sent within the same second (the app compares `date_start` with its own clock, whole seconds), so the next API call was refused "You are not allowed to submit in this user role" on the faster app and passed on the slower one: two full reruns to find · a line beside the `user_user_groups` insert in scenarios.md (or patterns.md "Probe kit") saying to back-date it, `now() - interval '1 day'`
