# PR review: pkp/pubmedCentral#9, continue the package names and revisions of articles delivered by another platform

- **Reviewed** round 2, 2026-11-26: [pkp/pubmedCentral#9](https://github.com/pkp/pubmedCentral/pull/9) at `bd922d9629` (kaitlinnewson `12356-main`: round 1's `87f9f31547` unchanged, `range-diff` `=`, plus "Fix deposit statuses and revisions that were saved over"; on the tip `7b70210`), for the item "a workflow for publishers moving platforms" of [pkp/pkp-lib#12356](https://github.com/pkp/pkp-lib/issues/12356); driven on OJS `main` (`d37c63cc7c`, `lib/pkp` `44b36bf802`) with the plugin dropped into `plugins/generic/pubmedCentral`.
- **Model** claude-opus-5-5

Nothing is outstanding. Round 1's four items are fixed at the head:
`updateObject()` sets the saved values on the object (items 1 and 2),
`markRegistered()` records the revision of a correction marked
registered (item 3) and the importer looks the DOI up without case
(item 4).

The plugin ships with no app, so no e2e suite reads it and there is no
CI dispatch; the PR's own check (PHPUnit and Cypress, PHP 8.2/8.3 on
MySQL and PostgreSQL) is green at the head
([45867978357](https://github.com/pkp/pubmedCentral/actions/runs/45867978357)).

**Steps** (kept walk
`shared/playwright/checks/sync/pubmedCentral-9/walk.sh <plugin clone> <ref> [trial-fix.diff]`,
on OJS's dataset fleet, PKP's test dataset): DOI versioning on; article
17's version 1.0 gets the DOI `10.9999/pmc9.1` and a new major version
2.0 the DOI `10.9999/pmc9.2`; `history.csv` imports 1.0 as PMC v1 and
a v2 OJS does not have, so 2.0 is `.v3`. The SFTP upload itself is not
run (the test installs reach no outside host): `driver.php job` runs
the job's lines after it on the object the job loads.

| Case | Round 1 head `87f9f31547` | Head `bd922d9629` |
|---|---|---|
| A. Imported 1.0 deposited over SFTP, twice | `.v1.r1`, `.v1.r2` uploaded; status stays `submitted` | the same uploads; status `registered` after each |
| B. 2.0 delivered by hand, marked registered, then deposited | uploads `.v3.zip` again | uploads `.v3.r1.zip`; `registered`, revision 1 |
| C. 2.0 delivered by hand twice more, each marked registered | `.v3.r1` every time | `.v3.r3`, then `.v3.r4` |
| D. A row with the DOI `10.9999/PMC9.1`, dry run before the import | "Versions not found … Line 2 10.9999/PMC9.1" | "1 publications and 1 submissions would be updated" |

The head's `markRegistered()` records nothing for a version not yet
delivered (B's first mark leaves no revision, and the package is
still `.v3.r1`), so the DOI-versioning switch the README describes
skips no revision number, unlike round 1's trial fix.
