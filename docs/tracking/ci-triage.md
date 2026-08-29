# CI triage — known problems & failing tests

Live ledger for the MAINTENANCE standing duty "Keep `main` green"
(`docs/process/MAINTENANCE.md`). One purpose: when a CI failure report
arrives, answer **"is this already known?"** before diagnosing anything as
new. CI reports failures **per app as individual messages**, and one root
cause commonly reds ojs+omp+ops at once — three messages are usually one
problem. People also keep merging to `main`, so a new-looking red is often
an already-triaged cause still unfixed.

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
| U43-A13 🐞 | Entire `U43-funding` suite red (5 tests/app): saved funders never render in the workflow/wizard funding table (reader pages fine, data intact) | ~~ojs~~ omp ops | #13003 moved funders publication→submission schema (`747af277a`) but FunderManager still reads `publication.funders` — U43 register A13; reported to team 2026-08-29. *Fix landed*: ui-library `f88b7e6a` reads `submission.funders`; **verified green on OJS** (2026-08-29, ojs `979819ae45`, full U43 suite) — OMP/OPS `main` still pin the pre-fix ui-library, red there until their pointers bump | open — fixed on ojs, omp/ops await ui-library bump | 2026-08-29 / 2026-08-29 |
| U04-A10 🐞 | `U04-orcid` contributor ORCID-delete test 500s; remaining serial U04 tests **skip** while their app project is red (skips are fallout, not separate failures) | ojs omp ops | RevokeOrcidToken serializes a lazy-hydrated Author — U04 register A10; reported to team 2026-08-29 | open, upstream fix pending (re-confirmed red on ojs `979819ae45`, 2026-08-29 — pkp-lib pointer unmoved) | 2026-08-28 / 2026-08-29 |

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
- **Decision-wizard timing under load** — U26 S5/S7/S8 (and U49 S11,
  2026-08-29; U40 S4 OJS, 2026-08-29 — first 4-worker run, post-publish
  abstract wait blew 30 s, green in isolation in 3.7 s) exceed waits
  during full-suite runs; green in isolation/on retry. Three U26
  incidents 2026-08-27 alone. **Watch condition**: recurs
  in CI with retries exhausted → revisit the decision-wizard waits.
  *2026-08-29 root-cause session*: this is the app-changes **row 9** race
  wearing a timing costume — the post-save async publication refresh
  remounts workflow components mid-interaction; under load the refresh
  window widens, so clicks land in remounts and outcome waits blow. The
  harness's outcome-keyed retries (Record Decision re-click, ordering
  loops, rich-text commits) are mitigations; the fix is upstream (stop
  remounting on refresh / let in-progress UI state survive it — row 9's
  "app fix" column). Reported to the team with the 2026-08-29 flake report.
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
