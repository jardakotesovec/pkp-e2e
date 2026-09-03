# CI triage — known problems & failing tests

The ledger for the MAINTENANCE standing duty "Keep `main` green"
(`docs/process/MAINTENANCE.md`). It answers one question when a failure
report arrives: **is this already known?** CI reports failures per app as
separate messages, and one root cause commonly reds ojs, omp and ops at
once, so three messages are usually one problem. People also keep merging
to `main`, so a new-looking red is often an already-triaged cause that is
still unfixed.

**Where to look.** Besides this repo's `e2e` workflow, every app repo runs
the suite through its thin hook on every push to its `main`. The latest run
on `pkp/<app>` Actions (main branch) is the authoritative answer to "is the
app's tip red?", and its head SHA is the commit to reproduce against.
Before reproducing, fully sync the environment: `npm run fetch-apps --
--update <app>` (the app name is positional), `composer install`, `npm ci`,
`npm run build`, then `npm run mount` and `npm run reset:<app>`. A stale
dependency or UI bundle fakes or masks failures. The bot's GitHub token is
blocked from the pkp org (fine-grained token lifetime policy), so
`gh -R pkp/<app>` answers 403. Run and job metadata is reachable
unauthenticated through the public REST API; logs and artifacts are not, so
per-test detail comes from a local reproduction at the head SHA.

## Triage protocol (on every incoming failure report)

1. **Match the signature** against the Open rows and the Flake watch:
   failing spec files and tests, error shape, apps. A match means already
   triaged: update the row's *last confirmed* date, note any spread to
   another app, acknowledge briefly if the report came from the team (one
   reply for the three per-app messages), and stop. No re-diagnosis, no
   duplicate finding.
2. **Suspect a flake second.** The flake classes below mimic regressions.
   The tell: does it reproduce on a targeted rerun or in isolation? A
   flake-class match gets a dated tally on its line, not a new row; a line
   keeps its last three incidents.
3. **Only then diagnose as new**, with the same critical triage as the sync
   loop: the commits since the last green run and the issues they link to,
   then a decision on evidence between test drift, an intended change the
   spec must follow, and a regression. The finding lands in its canonical
   home (the owning spec's register, `app-changes.md`, or the private
   security file); this file gets a row pointing at it.
4. **Delete rows** once the fix is verified green on `main` in every
   affected app; git history keeps the row. A fix that has landed in one
   app but not the others is a dated note in the row's Status cell. The
   same goes for a flake class whose cause is fixed. The daily sync
   re-checks every row against the new tips. Rows are cheap; open one for
   anything that could red CI twice.
5. **Rows are one sentence plus a link.** The signature, the apps, the
   canonical entry. The story of the fix lives in the register entry and in
   git; it does not accumulate here. Status cells are updated by dated
   note, never silently rewritten.
6. **A regression stays red.** No skip, no quarantine tag, no test edit
   while the fix is pending. The red is the signal the team wants; this row
   is what makes it a known red.

## Open — known-red tests on `main`

| ID | Signature (what CI shows) | Apps | Canonical entry | Status | First seen / last confirmed |
|----|---------------------------|------|-----------------|--------|-----------------------------|
| U43-A13 🐞 | Entire `U43-funding` suite red, 5 tests per app: saved funders never render in the workflow and wizard funding table | omp, ops | U43 register A13 (regression, #13003) | open on omp and ops. 2026-08-29: fixed on ojs (ui-library `f88b7e6a`, verified green at ojs `979819ae45`); omp and ops still pin the pre-fix ui-library | 2026-08-29 / 2026-09-01 (omp, ops; run 33466736951) |
| U04-A10 🐞 | `U04-orcid` contributor ORCID-delete test 500s; the remaining serial U04 tests skip while their app project is red (fallout, not separate failures) | omp, ops | U04 register A10 (regression, RevokeOrcidToken) | open on omp and ops. 2026-09-01: fixed on ojs (pkp-lib `ecd12271ed` + `d9e9b3fc7c`, U04 fully green in run 33466736951); omp and ops still pin the pre-fix pkp-lib | 2026-08-28 / 2026-09-01 (omp, ops) |

## Flake watch — known non-deterministic failure classes

Not regressions. Match here before opening a row. The response is a
targeted rerun and a dated tally on the line; a real investigation starts
when the class's watch condition trips.

- **Decision-wizard timing under load.** U26 S5/S7/S8, U49 S11 and U21 S10
  exceed their waits during full-suite runs and pass in isolation or on
  retry. The mechanism is app-changes row 9: the post-save publication
  refresh remounts workflow components mid-interaction, and under load the
  window widens. The harness mitigates with outcome-keyed retries and
  content-verified saves (U40 S4 on OJS and OPS, U49 S11 on OJS since
  2026-09-01); the fix is upstream. Reported to the team 2026-08-29.
  Last incidents: U49 S11 red with retries exhausted 2026-08-30 and
  2026-09-01 (watch condition tripped, hardening applied and verified green
  2026-09-01); U21 S13 flaky-passed 2026-09-01. **Watch condition**: a
  hardened test reds again with retries exhausted.
- **A `php -S` worker segfault** (once, OJS run 33106002377, 2026-08-27,
  in-flight request most likely `GET /api/v1/_submissions/viewsCount`).
  The cascade it used to cause is fixed by the server restart loop
  (harness.md "Runtime model"), so a recurrence now costs one test. It was
  never pinned; if it recurs, add core-dump capture to CI before
  diagnosing.
