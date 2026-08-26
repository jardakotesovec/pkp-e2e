# pkp-e2e — working notes for agents

This repo is the whole home of the e2e campaign: product specs + Playwright
suites for OJS/OMP/OPS. ALL process rules live in the docs, not here:

- **Start every feature session with `docs/process/RUNBOOK.md`** (the loop,
  model discipline, security routing) **and `docs/tracking/PROGRESS.md`**
  (live state, mode banner). Never re-derive process from memory.
- Test contract: `docs/process/PRINCIPLES.md`. Harness knowledge:
  `docs/process/{harness,patterns,scenarios,users}.md`. Spec contracts:
  `docs/process/TEMPLATE.md` + `docs/specs/GLOSSARY.md`.

Operational facts:

- App checkouts are named in `.env` (`OJS_ROOT`/`OMP_ROOT`/`OPS_ROOT`) —
  default: the self-contained, gitignored `checkouts/<app>` clones from
  `npm run fetch-apps` (pkp upstream `main`, push URLs to pkp disabled).
  `npm run mount` copies the PHP overlays into them (drift-guarded); suites
  run from here: `npm run test:ojs|omp|ops`, `reset:<app>`, `serve:<app>`.
- Commit ONLY in this repo. App checkouts are read-only for campaign work
  (RUNBOOK step 11). App code is fetched from the pkp remotes (`main`);
  never push commits or branches there — branches, rarely needed, go to
  the `jardakotesovec` fork.
- CI: `.github/workflows/e2e.yml` (matrix) + `run-app.yml` (reusable, also
  called by the app repos' thin hooks at run time — a broken `main` here
  breaks every app PR check, so keep `main` green).
