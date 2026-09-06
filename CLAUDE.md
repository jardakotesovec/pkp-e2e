# pkp-e2e — working notes for agents

This repo is the whole home of the e2e campaign: product specs plus
Playwright suites for OJS, OMP and OPS. The process rules live in the docs,
not here. `docs/README.md` is the map of the documentation.

- **Start every feature session with `docs/process/RUNBOOK.md`** (the loop,
  what goes where, model discipline) **and `docs/tracking/PROGRESS.md`**
  (live state and the mode banner). Never re-derive the process from memory.
- **Maintenance sessions** (the resident QA agent) also read
  `docs/process/MAINTENANCE.md`, `docs/tracking/upstream-sync.md` and
  `docs/tracking/ci-triage.md`. Check ci-triage FIRST when a CI failure is
  reported: one root cause often reds ojs, omp and ops as three messages.
- Test contract: `docs/process/PRINCIPLES.md`. Harness knowledge:
  `docs/process/{harness,patterns,scenarios,users}.md`. Spec contract:
  `docs/process/TEMPLATE.md` plus `docs/specs/GLOSSARY.md`.

Operational facts:

- App checkouts are named in `.env` (`OJS_ROOT`/`OMP_ROOT`/`OPS_ROOT`). The
  default is the self-contained, gitignored `checkouts/<app>` clones from
  `npm run fetch-apps` (pkp upstream `main`, with push URLs to pkp
  disabled). `npm run mount` copies the PHP overlays into them, with a guard
  against app-side edits; the checkouts are read-only and commits happen
  only in this repo (RUNBOOK step 10). Suites run from here:
  `npm run test:ojs|omp|ops`, `reset:<app>`.
- CI: `.github/workflows/e2e.yml` (the matrix) and `run-app.yml` (reusable,
  also called by the app repos' thin hooks at run time). A broken `main`
  here breaks every app PR check, so keep `main` green.
