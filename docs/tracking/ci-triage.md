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

| ID | Signature (what CI shows) | Apps | Root cause (canonical entry) | Status | First seen / last confirmed |
|----|---------------------------|------|------------------------------|--------|-----------------------------|
| U43-A13 🐞 | Entire `U43-funding` suite red (5 tests/app): saved funders never render in the workflow/wizard funding table (reader pages fine, data intact) | ojs omp ops | #13003 moved funders publication→submission schema (`747af277a`) but FunderManager still reads `publication.funders` — U43 register A13; reported to team 2026-08-29 | open, upstream fix pending | 2026-08-29 / 2026-08-29 |
| U04-A10 🐞 | `U04-orcid` contributor ORCID-delete test 500s; remaining serial U04 tests **skip** while their app project is red (skips are fallout, not separate failures) | ojs omp ops | RevokeOrcidToken serializes a lazy-hydrated Author — U04 register A10; reported to team 2026-08-29 | open, upstream fix pending | 2026-08-28 / 2026-08-29 |

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
- **Decision-wizard timing under load** — U26 S5/S7/S8 (and U49 S11,
  2026-08-29) exceed waits during full-suite runs; green in isolation/on
  retry. Three U26 incidents 2026-08-27 alone. **Watch condition**: recurs
  in CI with retries exhausted → revisit the decision-wizard waits.
- **Corrupted `.auth` storage-state JSON** — occasional local flake shape
  (2026-08-27); worth a harness look if it appears in CI.

## Resolved

_Newest first; row + closing evidence._

- *(none yet — seeded 2026-08-29)*
