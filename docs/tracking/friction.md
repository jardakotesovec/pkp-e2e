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
2026-11-06 · plugin-review · drive agent (pg-472 round 2) · `plugin-sandbox.js php` broke a `-r` snippet holding single quotes ("Unclosed '['", exit 255) until they were rebuilt with `chr(39)`; the pod has no `api_key_secret`, so the profile's API Key tab cannot make a key and API steps fell back to the session's CSRF token; no dataset account has `date_validated` and `require_validation` is off, so a validated account had to be set by SQL · note the quoting limit in harness.md "The plugin sandbox", or pass the snippet from a file; give the pod an `api_key_secret` and one validated dataset user
