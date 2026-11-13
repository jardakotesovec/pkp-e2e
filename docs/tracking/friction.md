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
2026-11-13 · sync · upstream session (orchestrator, VM s0) · the configurations run's faults could not be reproduced on the VM: `npm run db -- start mysql` finds no engine, because rootless podman needs the setuid `newuidmap` and the bot's session runs with the "no new privileges" flag (`newuidmap: write to uid_map failed: Operation not permitted`; `sudo` refuses for the same reason), so the `mysql` and `mariadb` lines (harness.md "Other databases and PHP versions") are workstation-only from a claude-threads session; MAINTENANCE "The configurations run" step 3 stalls on the VM · a database server the bot can reach without a container (a native MySQL 8.0 and MariaDB 10.11 on other ports, or a rootful podman socket the e2e user may use), or harness.md and MAINTENANCE saying the step runs on the workstation
2026-11-13 · sync · regression reader rr13788 (pkp/pkp-lib#13788) · `lib/pkp/tools/repairRorAffiliations.php` refuses to run below 100000 `rors` rows and every fleet's registry copy is empty and offline, so each run needed 100000 filler rows inserted by SQL and deleted after; pre-3.5 `author_settings` `affiliation` rows and an upgrade's `author_affiliations` shape have no seed path on main either (SQL by hand) · a probe-kit helper (or `POST site` key) that pads the registry copy for a run and removes it, and a seed key for legacy (pre-3.5) author affiliation settings
2026-11-13 · sync · security probe sec13788 · a probe `page.goto()` on an address the server answers with `text/csv` throws "Download is starting" instead of returning the response, which cost a rerun · patterns.md "Probe kit": a `download(page, url)` helper, or a note to pair `goto` with `waitForEvent('download')`
2026-11-13 · sync · report writer rw13788 (pkp/pkp-lib#13788) · the brief and the reader took the ROR registry copy as empty and offline on every test install, so the walk was planned around 100000 SQL filler rows; PKP's default dataset (main and stable-3_5_0) holds the complete copy (146716 `rors` rows, NSERC among them), so a dataset fleet runs `repairRorAffiliations.php` with no SQL at all, found only by reading the dump; and the contributor "Edit" panel is the dialog "Edit", not "Edit Contributor" (one rerun) · dataset.md naming the dataset's ROR registry copy (complete, its row count) beside its users and submissions, and the contributor panels' dialog names in U41
