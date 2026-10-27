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
2026-10-27 · sync · regression reader rr12647 · a probe script under `.reports/sync/<agent>/` failed on a guessed kit import depth (four `..` instead of three), and Playwright's `click()` on an `aria-disabled` menu item timed out 30 s as "not enabled" where a user's pointer click goes through · patterns.md "Probe kit" naming the `require('../../../shared/playwright/probe')` path for `.reports/<feature>/<agent>/` scripts, and a Locator pitfall line: to test what a pointer does on an aria-disabled element, click its box centre with `page.mouse.click`
