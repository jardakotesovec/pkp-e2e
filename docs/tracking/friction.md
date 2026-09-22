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
2026-09-22 · sync · regression reader rr14 (pkp/ojs#5813) · A scratch journal has no ISSN, so every default JATS it produces fails the JATS 1.2 DTD on `journal-meta` (`issn+`) whatever the change under read, and a `published: true` seed copies the journal licence at publish time, so a licence set after the seed never reaches the publication: run 1 of the check read as invalid and licence-less for those two reasons and had to be re-run on a second scratch journal with `onlineIssn`, `publishingMode` and `licenseUrl` PUT before seeding · A context scenario key for `onlineIssn`/`printIssn` and `licenseUrl` (or a seed-facts line saying a scratch journal has no ISSN and that the licence is copied at publish), and a scenarios.md line that `GET submissions?status=3` on `publicknowledge` lists no published submission for `manager.maya`, so a read-only "published seeded article" does not exist there
