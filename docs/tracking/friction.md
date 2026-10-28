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
2026-10-28 · sync · regression reader rr13617 · the brief's `fleet-prep -- --feature sync --dataset 1` would rewrite `.reports/sync/fleet.json` as a dataset-only fleet (fleet-prep keeps the other apps' entries only for the same kind of fleet), dropping the campaign ojs/ops/omp entries other readers on PROBE_FEATURE=sync were using; used `--feature sync-rr13617` / `sync-3_5-rr13617` instead · a brief template that names a reader-own feature id for dataset fleets (or fleet-prep writing dataset fleets to their own file, e.g. fleet-ds<n>.json)
2026-10-28 · sync · regression reader rr13637 · on stable-3_5_0 the header's "Create New Version" opens a plain confirmation (no "versionStage"/"versionIsMinor" window as on main), and an OPS scratch server's "Title & Abstract" answers 500 (sections without wordCount, the known un-backported cast), so a 3.5 versioning drive had to be re-run twice from the Galleys page · a seed-facts or patterns line naming 3.5's version confirmation and that OPS 3.5 publication pages other than "Title & Abstract" carry the header "Post"/"Create New Version"
2026-10-28 · sync · regression report writer rw13637 · the report brief named a header model (`checks/sync/pkp-lib-13497/invitation-texts.js`) that does not exist, and prescribed a kept script on scratch contexts of the sync fleet while REPORT.md has the Steps walked on a freshly loaded dataset, so the script grew a dataset mode and a dataset fleet of its own (`--feature sync-rw13637 --dataset 5`) late · a report-brief template that names an existing kept check as the model (e.g. `checks/sync/pkp-lib-13561/cover-on-add.js`) and asks for the dataset walk (with a writer-own feature id and dataset number) from the start
2026-10-28 · sync · regression reader rr13062 · driving a DataCite/Crossref deposit job end to end on the fleet had no kit path: crossref-stub.js answers Crossref only and needs a TLS CA plus a probe-server restart, and `jobs.php run` would also pop the fleet's other queued jobs, so I wrote a driver that runs one work's jobs from the jobs table with the agency answered through PKPApplication::getHttpClient()'s unit-test client hook (sync/pkp-lib-13119/deposit.php); also two 400s from the scenario API (locale keys belong under `context: {}`, a reviewer's `dateCompleted` takes YYYY-MM-DD only) · a kit helper "run this work's queued jobs with the agency answered in-process" (deposit.php generalised) named in patterns.md "Probe kit", and the createContext/createSubmission key shapes in one table there
