# CI triage — known problems & failing tests

Live ledger for the MAINTENANCE standing duty "Keep `main` green"
(`docs/process/MAINTENANCE.md`). One purpose: when a CI failure report
arrives, answer **"is this already known?"** before diagnosing anything as
new. CI reports failures **per app as individual messages**, and one root
cause commonly reds ojs+omp+ops at once — three messages are usually one
problem. People also keep merging to `main`, so a new-looking red is often
an already-triaged cause still unfixed.

**Where to look (2026-09-01)**: besides this repo's `e2e` workflow, every
app repo runs the suite via its thin hook on every push to its `main` —
the latest run on `pkp/<app>` Actions (main branch) is the authoritative
"is the app's tip red?" answer, and its head SHA is the exact commit to
reproduce against. **Before reproducing, fully sync the environment**
(maintainer, 2026-09-01) — checkout latest `main` with submodules
(`npm run fetch-apps -- --update <app>` — app name is positional, not
`--app`), `composer install`, `npm ci`, `npm run build`, then
`npm run mount` + `npm run reset:<app>` — a stale dependency or UI bundle
fakes or masks failures. Note: the bot's GitHub token is
currently blocked from the pkp org (fine-grained token >366d lifetime
policy) — `gh -R pkp/<app>` 403s; run/job metadata is reachable
unauthenticated via the public REST API, but logs/artifacts are not, so
per-test detail comes from local repro at the head SHA.

## Triage protocol (on every incoming failure report)

1. **Match the signature** against the Open rows and Flake watch below —
   failing spec files/tests, error shape, app(s). A match = already
   triaged: update the row's *last confirmed* date (and note any spread to
   another app), acknowledge briefly if the report came from the team, and
   stop — no re-diagnosis, no duplicate finding.
2. **Suspect a flake second**: worker-death cascades and under-load timing
   flakes (Flake watch) mimic regressions. The tell: does it reproduce on a
   targeted rerun / in isolation? A flake-class match gets a tally mark on
   its row, not a new row.
3. **Only then diagnose as new** — per MAINTENANCE order of suspicion
   (test drift → spec drift → real regression, each only on evidence).
   The finding still lands in its canonical home (owning spec's Findings
   register / app-changes.md / private security file); this file gets a
   **row pointing at it**, never the detail.
4. **Close rows** when the fix is verified on `main` (suite green at a
   named commit): move the row to Resolved with the date and verifying
   evidence. Rows are cheap — err on the side of opening one for anything
   that could red CI twice.

Row upkeep is append/date-style like the other ledgers: correct by dated
note, don't silently rewrite history.

## Open — known-red tests on `main`

State as of the 2026-08-29 baselines (`upstream-sync.md`): OJS 121✓/6✘,
OMP 123✓/6✘, OPS 90✓/6✘ — **every current ✘ is A13 (×5) or A10 (×1)**.
*2026-08-29 evening tips*: OJS 125✓/1✘ (A13 fixed upstream & verified;
only A10 red + its 2 serial skips); OMP/OPS unchanged — their `main`
still pins the pre-fix ui-library, so A13 (×5) + A10 (×1) remain the
expected reds there.

| ID | Signature (what CI shows) | Apps | Root cause (canonical entry) | Status | First seen / last confirmed |
|----|---------------------------|------|------------------------------|--------|-----------------------------|
| U21-A11 🐞 | **~100/129 OJS tests red at once**: every test that seeds a submission fails fast with `POST …/_test/scenarios/submission failed: 500` — `TypeError: Author::getAffiliations(): … null returned (Author.php:230)`; only U01/U04/U06-ish tests that never create a submission stay green | ojs (omp ops inherit at their next pkp-lib bump) | pkp-lib `9e2fbac214` made `getAffiliations()` throw on the null that `newAuthorFromUser()` stores for affiliation-less users — breaks the real wizard start too (`PKPSubmissionController::add()`), not just seeding — U21 register A11; reported to team 2026-09-01; upstream-ready report: `docs/reports/2026-09-01-author-getaffiliations-null-regression.md`. First red: pkp/ojs run 33536204412 at `d44b186c22` ("Submodule updates") | open, upstream fix pending | 2026-09-01 / 2026-09-01 |
| U43-A13 🐞 | Entire `U43-funding` suite red (5 tests/app): saved funders never render in the workflow/wizard funding table (reader pages fine, data intact) | ~~ojs~~ omp ops | #13003 moved funders publication→submission schema (`747af277a`) but FunderManager still reads `publication.funders` — U43 register A13; reported to team 2026-08-29. *Fix landed*: ui-library `f88b7e6a` reads `submission.funders`; **verified green on OJS** (2026-08-29, ojs `979819ae45`, full U43 suite) — OMP/OPS `main` still pin the pre-fix ui-library, red there until their pointers bump | open — fixed on ojs, omp/ops await ui-library bump | 2026-08-29 / 2026-09-01 (omp+ops, run 33466736951) |
| U04-A10 🐞 | `U04-orcid` contributor ORCID-delete test 500s; remaining serial U04 tests **skip** while their app project is red (skips are fallout, not separate failures) | ~~ojs~~ omp ops | RevokeOrcidToken serializes a lazy-hydrated Author — U04 register A10; reported to team 2026-08-29. *Fix landed*: pkp-lib `ecd12271ed` (+`d9e9b3fc7c` for DepositOrcidSubmission, 2026-08-31) converts the LazyCollections in the job constructors; **U04 fully green on OJS** in scheduled run 33466736951 (2026-09-01) — OMP/OPS `main` still pin the pre-fix pkp-lib, red there until their pointers bump | open — fixed on ojs, omp/ops await pkp-lib bump | 2026-08-28 / 2026-09-01 (omp+ops) |

## Flake watch — known non-deterministic failure classes

Not regressions; match here before opening a row. Standard response:
targeted rerun, tally the recurrence on the class line (dated), escalate to
a real investigation when the class's watch condition trips.

- **Dead-worker cascade** — a worker's `php -S` dies (observed: segfault,
  30 s DB-time-limit fatal), Playwright never restarts it, every test on
  that worker fails in milliseconds (~20–33 test cascade); never reproduces
  on rerun. Tell: cluster of near-instant failures on one worker; check
  `.server-logs/server-<port>.log` in the CI failure artifact. Incidents:
  U04 S7 OJS (2026-08-27, DB-time-limit), OMP 33095432326 + OJS
  33106002377 (2026-08-27, both first failing at U01 S7 impersonation).
  **Watch condition**: another incident first-failing at U01 S7 → chase the
  in-flight request on that screen and consider webServer crash resilience
  (upstream-sync 2026-08-27 entry has the evidence).
  *2026-08-29 root-cause session*: the cascade half is FIXED — the
  config-factory webServer command now wraps `php -S` in a bounded restart
  loop (validated: SIGSEGV'd server respawns in ~1 s and serves again), and
  runs it with `max_execution_time=120` so a merely slow request (the 30 s
  DB-time-limit incident class) no longer turns fatal. The crash half stays
  open: the 33106002377 segfault's in-flight request is (by the healthy-load
  request sequence of that screen) `GET /api/v1/_submissions/viewsCount`;
  unpinnable without a core dump — if it recurs, add core-dump capture to
  CI before diagnosing further. A future incident now costs one test, not a
  cascade.
- **Decision-wizard timing under load** — U26 S5/S7/S8 (and U49 S11 +
  U21 S10, 2026-08-29) exceed waits during full-suite runs; green in
  isolation/on retry. Three U26 incidents 2026-08-27 alone.
  *2026-08-29 worker-sweep tallies*: U40 S4 OJS red in 3 of 4 full runs
  (2/3/4 workers; green at 5w and in isolation, 3.7 s) — but this one is
  NOT a blown wait: the save returns 200 + "Saved" while the row-9
  remount wiped the editor first, so the OLD abstract is committed
  (reader page proved it). Mechanism already known on OPS (its U40 S4
  carries a content-verified save loop); the OJS test now uses the same
  idiom — save response JSON must hold the new abstract. U21 S10 OJS
  red once at 5 workers (wizard step never reached Contributors; green
  in isolation 9 s) — ordinary class member, tallied. **Watch condition**: recurs
  in CI with retries exhausted → revisit the decision-wizard waits.
  *2026-08-29 root-cause session*: this is the app-changes **row 9** race
  wearing a timing costume — the post-save async publication refresh
  remounts workflow components mid-interaction; under load the refresh
  window widens, so clicks land in remounts and outcome waits blow. The
  harness's outcome-keyed retries (Record Decision re-click, ordering
  loops, rich-text commits) are mitigations; the fix is upstream (stop
  remounting on refresh / let in-progress UI state survive it — row 9's
  "app fix" column). Reported to the team with the 2026-08-29 flake report.
  *2026-09-01: watch condition TRIPPED* — U49 S11 OJS red with retries
  exhausted in scheduled run 33466736951 (and red once 2026-08-30, run
  33290463186), both times the same assertion: the saved "Assign To
  Future Issue and Schedule Only" radio comes back unchecked in the
  Schedule For Publication panel — i.e. the Publication Settings save
  committed the OLD assignment (the U40 S4 save-vs-remount mechanism,
  200 + "Saved" with wiped picks). Response: the U40 S4 content-verified
  save idiom applied to U49 S11's Publication Settings save (response
  JSON must hold status 7 READY_TO_SCHEDULE + an issueId, bounded retry).
  **Verification pending** — the U21-A11 seeding blocker (Open row above)
  reds U49 S11 before it reaches this code; re-run when A11 clears.
  U21 S13 flaky (green on retry) in the same 09-01 run — ordinary class
  member, tallied.
- **Corrupted `.auth` storage-state JSON** — occasional local flake shape
  (2026-08-27); worth a harness look if it appears in CI.
  *2026-08-29: FIXED* — root cause was `auth.js` writing the per-user state
  file non-atomically (`context.storageState({path})`) while parallel
  workers read the same path; a reader could see a truncated JSON. Now
  written temp-file + rename (atomic) and the probe tolerates an unreadable
  file by falling through to a fresh login. Recurrence would be a new bug,
  not this class.

## Resolved

_Newest first; row + closing evidence._

- *(none yet — seeded 2026-08-29)*
