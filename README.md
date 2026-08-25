# pkp-e2e

Playwright e2e suites, seeding harness, product specs and process docs for
**OJS, OMP and OPS** — everything the e2e campaign produces, in one repo, so
nothing test-related lives on (or ships from) the application repositories.

## How it works

The suites run **from this repo** against plain app checkouts:

```
cp .env.example .env          # point OJS_ROOT / OMP_ROOT / OPS_ROOT at your checkouts
npm ci
npm run mount                 # copy the PHP overlays (seeding API, installers) into the checkouts
npm run config:ojs > "$OJS_ROOT/config.test.inc.php"   # once per app (or write it by hand)
npm run test:ojs              # also: test:omp, test:ops
```

- `bin/mount.js` copies `apps/<app>/php/` + `shared/php/` into the app
  checkout (`classes/testing`, `api/v1/_test`, `tools/installTest.php`,
  `lib/pkp/…`), hides the copies via `.git/info/exclude`, and refuses to
  overwrite copies that were edited app-side — **edits belong here**. Re-run
  after changing any PHP overlay; `npm run unmount` removes everything.
- Each app checkout still carries its own `.env.playwright` (DB credentials,
  `TEST_API_KEY`) and `config.test.inc.php` — see `docs/process/harness.md`.
- **Prerequisite** in the checkout (until merged upstream): pkp-lib's
  `Config.php` must honour the `PKP_CONFIG_FILE` env var (branch `e2e_ng_2`
  carries it). `mount.js` verifies this and says so if it's missing.

## Layout

- `shared/` — the app-agnostic layer: Playwright harness
  (`shared/playwright/`) and the `PKP\testing` PHP seeding classes + `_test`
  API base controller (`shared/php/`, mounted into `lib/pkp/`).
- `apps/{ojs,omp,ops}/` — per-app Playwright suites (`playwright/`) and the
  `APP\testing` PHP overlays (`php/`, mounted into the app root).
- `docs/` — the campaign's single documentation home: `process/` (RUNBOOK,
  PRINCIPLES, harness, patterns, scenarios, users), `specs/` (the product
  specs), `tracking/` (PROGRESS, FEATURE-MAP, ledgers).
- `configs/` — one Playwright config per app; `bin/` — mount/unmount and the
  `with-app` runner; `.github/workflows/e2e.yml` — the three-app CI matrix.

Start reading at `docs/process/harness.md`.
