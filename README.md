# pkp-e2e

Playwright e2e suites, seeding harness, product specs and process docs for
**OJS, OMP and OPS** — everything the e2e campaign produces, in one repo, so
nothing test-related lives on (or ships from) the application repositories.

## How it works

The suites run **from this repo** against its own self-contained app
checkouts (gitignored under `checkouts/`):

```
cp .env.example .env          # defaults to the checkouts/<app> clones below
npm ci
npm run fetch-apps            # clone pkp main into checkouts/<app> (push-protected),
                              # install deps, build the UI, create test DB + configs
npm run mount                 # copy the PHP overlays (seeding API, installers) into the checkouts
npm run test:ojs              # also: test:omp, test:ops
```

Pointing `<APP>_ROOT` at an external checkout still works — `fetch-apps` is
just the provisioner for the default, isolated layout (see
`docs/process/harness.md` "The fleets" for its push-protection details).

- `bin/mount.js` copies `apps/<app>/php/` + `shared/php/` into the app
  checkout (`classes/testing`, `api/v1/_test`, `tools/installTest.php`,
  `lib/pkp/…`), hides the copies via `.git/info/exclude`, and refuses to
  overwrite copies that were edited app-side — **edits belong here**. Re-run
  after changing any PHP overlay; `npm run unmount` removes everything.
- Each app checkout still carries its own `.env.playwright` (`TEST_API_KEY`,
  ports, `PKP_CONFIG_FILE`) and `config.test.inc.php` (DB credentials). See
  `docs/process/harness.md`.
- **Prerequisite** in the checkout: pkp-lib's `Config.php` must honour the
  `PKP_CONFIG_FILE` env var (merged upstream 2026-08, so any current `main`
  carries it). `mount.js` verifies this and says so if it's missing.

## Layout

- `shared/` — the app-agnostic layer: Playwright harness
  (`shared/playwright/`) and the `PKP\testing` PHP seeding classes + `_test`
  API base controller (`shared/php/`, mounted into `lib/pkp/`).
- `apps/{ojs,omp,ops}/` — per-app Playwright suites (`playwright/`) and the
  `APP\testing` PHP overlays (`php/`, mounted into the app root).
- `docs/` — the campaign's single documentation home: `process/` (RUNBOOK,
  TEMPLATE, PRINCIPLES, MAINTENANCE, harness, patterns, scenarios, users),
  `specs/` (the product specs), `tracking/` (PROGRESS, FEATURE-MAP,
  ledgers). `docs/README.md` is the map.
- `configs/` — one Playwright config per app; `bin/` — mount/unmount and the
  `with-app` runner; `.github/workflows/e2e.yml` — the three-app CI matrix.

Start reading at `docs/README.md`.
