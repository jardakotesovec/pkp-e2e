# Harness Guide

This file explains how the Playwright harness is laid out, configured and run.
One pkp-e2e repo covers OJS, OMP and OPS. Everything lives here and runs
against plain app checkouts named in the repo `.env`
(`OJS_ROOT`/`OMP_ROOT`/`OPS_ROOT`). `bin/mount.js` copies the few PHP overlays
into a checkout (see the README). Paths below are relative to the repo root.

Related files: test-authoring rules are in `PRINCIPLES.md`, coding
conventions and pitfalls in `patterns.md`, the seeding API and Mailpit rules
in `scenarios.md`, and the seeded identities in `users.md`.

## The two playwright layers

Every app has two Playwright layers. Picking the wrong one puts a test in the
wrong folder.

**`apps/<app>/playwright/` holds the app's feature suites.** Every feature
test lives here, even when the scenario is common to all three apps. Per-app
suites are derived from the spec, and duplication between apps is fine. The
spec is the artifact we maintain, not shared test code.

```
apps/<app>/playwright/
├── tests/             # Spec files — flat, no subfolder taxonomy
│   └── serial/        # <app>-serial project — globally-scanning specs (queue drains etc.)
├── support/
│   ├── fixtures.js    # App test extension (api alias; feature fixtures land here)
│   ├── legacy.js      # (OJS, OPS) re-exports the shared legacy-jQuery helper
│   └── app.context.js # Capability map + seed.actors archetype map
├── pages/             # App-only POMs
├── fixtures/
│   ├── bootstrap.js   # Static seed for the base context (journal/press/server, 18 users, sections, …)
│   └── files/         # Upload fixtures
└── .auth/             # Storage-state cache per user (gitignored)
```

Both test folders stay **flat**. Add subfolders only once 25 to 30 specs make
natural clusters obvious.

**`shared/playwright/` holds shared infrastructure only.** Base fixtures,
shared POMs, and the bootstrap and login smoke specs. Feature suites never live
here. When in doubt, a file belongs in the app's tree.

```
shared/playwright/
├── tests/                   # bootstrap.setup.js (setup project), login.spec.js (smoke)
├── support/
│   ├── base-test.js         # The extended `test` fixture — start here
│   ├── auth.js              # ensureAuthStateFor — storage-state cache w/ liveness probe
│   ├── api.js               # pkpApi — test-API client (bootstrap, createContext, createSubmission)
│   ├── mail.js              # pkpMail — Mailpit HTTP API wrapper
│   ├── jobs.js              # runJobs — drain the fleet's queued jobs (serial project only)
│   ├── legacy.js            # waitForJQueryIdle — legacy jQuery surfaces (grids, AjaxModals)
│   ├── motion.js            # disableMotion — animations forced to 0.01ms in every context
│   └── env.js               # loadEnv(appRoot) — .env.playwright parser (shell exports win)
├── pages/                   # BasePage, LoginPage, DashboardPage, EditorialDashboardPage, MySubmissionsPage, WorkflowPage
├── data/users.js            # The 18 baseline identities + getPassword()/getEmail()
├── reset.js                 # reset:<app> — drop+recreate DB, wipe files dir + .auth/
├── serve.js                 # serve:<app> — manual PHP server on the fleet's base port
├── make-test-config.js      # config:<app> — generate config.test.inc.php from the app template
└── config-factory.js        # definePkpConfig({appName, appRoot, basePort}) — all three apps
```

The PHP side has the same split. Shared builders live in
`shared/php/classes/testing/` with the gated controller
`shared/php/api/v1/_test/PKPTestController.php`. Each app adds
`api/v1/_test/{index.php,TestController.php}`, `classes/testing/*` subclasses
and `tools/installTest.php` under `apps/<app>/php/`. `bin/mount.js` copies
all of it into the app checkout at its runtime paths (`lib/pkp/…` and the app
root). Edit here, then re-run mount.

## The fleets

| App | Checkout | Base port | Test DB |
|---|---|---|---|
| OJS | `checkouts/ojs` | 8000 | `ojs_test` |
| OMP | `checkouts/omp` | 8100 | `omp_test` |
| OPS | `checkouts/ops` | 8200 | `ops_test` |

The checkouts are **self-contained clones inside this repo** (gitignored),
provisioned by `npm run fetch-apps` (`bin/fetch-apps.js`). The git rule is
simple: the latest code comes from the pkp remotes (`pkp/ojs` `main` and so
on), and nothing is ever pushed or branched there. The script enforces this.
The pkp remote is named `upstream` with its push URL disabled, submodule push
URLs included. The `jardakotesovec` fork is `origin` and the push default, so a
branch, rarely needed, can only go to the fork. The checkouts exist only to
run the suites. Commits happen only in this repo. `fetch-apps --update` moves
an existing checkout to the current upstream `main`.

Test DBs are **PostgreSQL** locally. The harness code itself is
DB-driver-agnostic (PRINCIPLES D8), so Postgres is a local choice, not a
dependency. Postgres-specific defects reproduce in this environment.

Two facts worth knowing before you write a test:

- PDF full-text is **not** indexed on the test installs. A search assertion
  on galley content needs its own indexing arrangements.
- All three apps use the same scenario endpoints and the same
  `publicknowledge` context path.

### Environments

The fleet table above describes **environment 0**. For parallel sessions
(several worktree sessions on one machine, see MAINTENANCE.md "Session
hygiene") there are additional permanent environments. Each is a full
independent copy of the same thing, provisioned once by
`npm run fetch-apps -- --slot N`:

| env | dir | ports (ojs/omp/ops) | DBs | TEST_API_KEY |
|---|---|---|---|---|
| 0 | `checkouts/` | 8000 / 8100 / 8200 | `<app>_test` | `playwright-test-key` |
| 1 | `checkouts-s1/` | 9000 / 9100 / 9200 | `<app>_test_s1` | `playwright-test-key-s1` |
| 2 | `checkouts-s2/` | 10000 / 10100 / 10200 | `<app>_test_s2` | `playwright-test-key-s2` |

Everything is baked into each environment's `.env.playwright` and
`config.test.inc.php` at provision time. Ports shift by N×1000, which leaves
room for one server per worker. The DB name carries the suffix, which also
gives each environment its own session cookie name.

The per-environment `TEST_API_KEY` is a tripwire. If a run adopts a leftover
server from another environment (through `reuseExistingServer`), seeding
fails with a 401 right away instead of silently writing to the wrong DB.

Environments are a symmetric pool. None is reserved for a task type.
`bin/env.js` (`npm run env -- claim [N] | release | status`) claims one
atomically by creating `<env-dir>/.claimed`, and writes the invoking
worktree's `.env` with absolute `<APP>_ROOT` paths. Environments always live
in the main worktree. Sessions live in their own worktrees, which also keeps
`.auth/`, `test-results/`, `.server-logs/` and `.reports/` apart, since all of
them are worktree-relative.

Mailpit stays one shared instance across all environments. That is why two
runs of the same app must never overlap: recipient addresses are scoped per
app, not per environment. The run discipline is in MAINTENANCE.md; the Mailpit
rules and API are in `scenarios.md`.

## One roster, enrolled differently per app

All apps share one roster of seeded users (`users.md`), but each app enrols a
subset in its own way:

- **OMP** splits the four reviewers: `julia`/`paul` become External
  reviewers, `amara`/`adam` Internal reviewers. It seeds the series
  `monographs`/`textbooks`, identified by `path` with no abbrev.
- **OPS** enrols `sectioneditor.*` as Moderators. `ana`/`ravi` are assigned
  to section `PRE`; `omar` is deliberately left unassigned as a visibility
  control. `assistant.rita` is an Editorial Board Member with no stage
  access. OPS has no editor, reviewer, copyeditor, layout or proofreader
  accounts, so `seed.actors` maps those archetypes to null.

## Runtime model

- **One `php -S` server per Playwright worker**, at `basePort +
  parallelIndex`. `php -S` serves one request at a time, so a single server
  would serialize the suite. Playwright's `webServer` array owns the servers'
  lifetime. The ready probe is a static file, so a server counts as up before
  the DB is installed. Each server runs with `max_execution_time=120` and
  inside a small restart loop, so a crashed `php -S` respawns within a second
  instead of stranding its worker for the rest of the run.
- **Worker count**: `PLAYWRIGHT_WORKERS`, or auto-detect when unset. The
  auto-detect uses the performance-core count where the OS exposes it (Apple
  Silicon sysctl, Intel hybrid sysfs), otherwise CPU cores minus 2, with a
  minimum of 2. The measured sweet spot matches the P-core count. Small CI
  runners want workers = cores and pin the env var explicitly (CI uses 4).
- **Server output** goes to
  `apps/<app>/playwright/.server-logs/server-<port>.log` (request log plus
  PHP warnings). Look there when debugging server-side errors. A server
  adopted through `reuseExistingServer`, for example one left over from
  `serve:<app>`, keeps logging wherever it was started.
- **Project chain**: `setup → {shared, <app>} → <app>-serial`. The setup
  project probes `GET /api/v1/_test/bootstrap`. Warm, it is a no-op in under
  a second. Cold, it installs the schema through `tools/installTest.php` and
  seeds. The serial project runs alone at the end and holds only
  globally-scanning specs and queue drains.
- **Animations are globally disabled** (`reducedMotion: 'reduce'` plus the
  `motion.js` CSS in every context). `trace: 'on-first-retry'` records nothing
  while retries are 0. Turn retries on when hunting a failure.
- **One shared DB and files dir per fleet** behind all its worker servers.
  Isolation comes from data namespacing with unique tags, not from separate
  databases. See `patterns.md` tag conventions.

### The validation-variant server

Some behaviors are config keys with no per-entity switch: email validation
(`[email] require_validation`) and the ALTCHA spam check on registration
(`[captcha] altcha`, `altcha_on_register`). PRINCIPLES.md D9 forbids editing
the running config, so each fleet also starts **one fixed extra server at
`basePort + 90`** (8090 for OJS, 8190 for OMP, 8290 for OPS; workers never
reach that offset) that serves the same install through a second config
file. It shares the fleet's DB, files dir and Mailpit; only the config
differs, so users, journals and mail created there are the ordinary seeded
ones.

- The file is `config.test.validation.inc.php` next to the default config.
  `config-factory.js` regenerates it on every Playwright config load from
  the default file, flipping `require_validation = On`, `altcha = on`,
  `altcha_hmackey` (a fixed test key) and `altcha_on_register = on`, and
  re-pointing `base_url` to the variant port. `base_url` matters: the app
  builds the activation link in the validation email from it, and a link to
  worker 0's server would land on a config that says validation is off.
  Never edit the file by hand; it follows the default config, which CI
  generates fresh each run.
- Tests reach it through the `variants` fixture:
  `await page.goto(`${variants.validation}/index.php/publicknowledge/user/register`)`.
  Only explicit navigation goes there. `baseURL`, `storageState`, `asUser`
  and `pkpApi` stay on the worker's own server, so a test on the variant
  logs in through the UI itself.
- Its log is `.server-logs/server-<port>-validation.log`. For poking around
  by hand: `PKP_CONFIG_FILE=<variant file> PLAYWRIGHT_BASE_PORT=<port> npm
  run serve:<app>`.

## config.test.inc.php — the local test config

Each app has a local, gitignored `config.test.inc.php`. The app reads it
through the `PKP_CONFIG_FILE` env var, which is the whole switch between the
dev install and the test install. Generate it from the app's own template with
`npm run config:<app> > "$APP_ROOT/config.test.inc.php"` (the env inputs are
documented in `shared/playwright/make-test-config.js`; CI uses the same
generator), or write it by hand. Besides its own Postgres `<app>_test` DB and
files dir it must carry:

- `allowed_hosts` pinned to `127.0.0.1` (plus the fleet's port)
- `installed_locales = en,fr_CA`. The bilingual base context needs it.
- `[schedule] task_runner = Off` and `[queues] job_runner = Off`. Nothing
  queued or scheduled runs on its own. Serial specs invoke the runners
  explicitly (see the parallel lesson on runners in `patterns.md`).
- `[proxy] http_proxy/https_proxy = http://127.0.0.1:9`, a dead local port.
  PKP wires `[proxy]` into Guzzle and Laravel HTTP, so every server-side
  outbound HTTP call fails fast. Tests never reach real external services,
  and a hung outbound call cannot stall a single-threaded worker server.
  SMTP to Mailpit and other 127.0.0.1 traffic are unaffected. Do not remove
  it, and re-add it by hand on new machines. There is no OS-level firewall
  and no DTD mirror.
- `enable_minified = On`. Backend pages then load `js/pkp.min.js` instead of
  about 107 separate scripts. The bundle is committed in the app. When its
  sources change, recompile it with the Closure minify pass in
  `lib/pkp/tools/buildjs.sh`. That script's lint gate blocks on long-standing
  style nits, so run the final compile step directly.

Never delete `config.test.inc.php` on its own, because the template resets
`installed=Off`. `npm run reset:<app>` is the sanctioned way to wipe an
install, and it refuses any DB whose name lacks "test".

**Always drive the fleets through `127.0.0.1`, never `localhost`.** A page
request carrying `Host: localhost` ends in a bare 400. The 400 comes after the
locale 302, so the first response looks fine and only the followed redirect
fails. The `_test` API answers on either host, which makes the mistake harder
to spot: seeding succeeds and the browser step dies.

## Env vars (`.env.playwright`; shell exports win)

- `PKP_CONFIG_FILE`: absolute path to `config.test.inc.php`
- `PLAYWRIGHT_BASE_PORT` / `PLAYWRIGHT_WORKERS`: worker 0's port, and the
  worker count (unset = auto-detect, see above)
- `TEST_API_KEY`: enables and gates `/api/v1/_test/*`. The namespace answers
  404 unless the var is in the server's environment, and 403 unless the
  request's `X-Test-Key` header matches. Never set it on a production
  install.
- `MAILPIT_URL`: the Mailpit HTTP API (default `http://127.0.0.1:8025`).
  Mailpit is one shared instance across every worker and all three fleets
  (`brew services start mailpit`).

## Running

All commands run from the pkp-e2e root. `ojs` below stands for any of
`ojs`/`omp`/`ops`:

```bash
npx playwright install chromium      # one-time, installs Chromium
npm run test:ojs -- --project=setup  # seed the test DB (cold ~1-3 min; warm <1s no-op)
npm run test:ojs                     # full run for one fleet
npm run test:ojs -- --project=ojs    # only the app project (name varies per app)
npm run test:ojs -- --ui             # Playwright UI mode — best for iterating
PWDEBUG=1 npm run test:ojs           # step-through
npm run reset:ojs                    # nuke the test DB (forces cold bootstrap next run)
npm run serve:ojs                    # manual PHP server on the fleet's base port
```

Reset the DB before any full-suite timing run and every 8 to 10 features.
Long-lived DBs accumulate state that pollutes COUNT assertions and tag
searches. After a reset, the first run can die on a webServer start race, so
relaunch it. Don't run `serve:<app>` while a Playwright run is live, because
both want the same port. After a killed run, kill orphan chromium and php
processes before re-running.

## Quick start: writing a new test

1. **Folder**: a feature test goes in the app's `apps/<app>/playwright/tests/`;
   only shared infrastructure goes in `shared/playwright/`. Name feature
   suites after their spec file, `U<nn>-<feature>.spec.js`, so tests sort in
   FEATURE-MAP order alongside `docs/specs/`.
2. **Import**: a shared spec uses `require('../support/base-test.js')`; an
   app spec uses `require('../support/fixtures.js')`, which adds the app's api
   fixture.
3. **User**: see `users.md`. `test.use({user: 'sectioneditor.ana'})` sets the
   file's default logged-in user; `asUser('reviewer.julia')` opens extra
   authenticated contexts for multi-actor flows.
4. **Screen**: there is no screen map. Read the Vue/PHP sources directly and
   confirm selectors against the running app (`patterns.md`).
5. **Conventions**: `patterns.md` covers locators, waits, parallel lessons
   and tags.
6. **Seed through the API, drive the UI only for what the test exercises**:
   `scenarios.md`.

Rules that live elsewhere: findings and security routing are in RUNBOOK
"What goes where"; git and push rules are in RUNBOOK "Ops & campaign
safeguards".

## CI

- `.github/workflows/e2e.yml` runs the three-app matrix on every push and
  PR of this repo, and nightly against the apps' `main`. Its
  `workflow_dispatch` form takes `ojs_ref`, `omp_ref` and `ops_ref`, so a
  branch of this repo can be run against a pinned app commit:
  `gh workflow run e2e.yml --ref <branch> -f ojs_ref=<sha>`. `gh` works on
  this repo (it lives under `jardakotesovec`, outside the pkp org the bot
  token is blocked from).
- `.github/workflows/run-app.yml` is the reusable job. Each app repo's
  `e2e-tests.yml` calls it on every push and PR with `app_ref` set to the
  commit under test; it runs this repo's `main` unless `e2e_ref` is given.
  The hooks also pass `companion_branch`, the PR's branch name: when a
  pkp-e2e branch of the same name exists, the suite runs from it instead
  (MAINTENANCE "A developer's PR fails the suite").
- CI runs with `PLAYWRIGHT_WORKERS=4` and `--retries=1`. Failure artifacts
  include `.server-logs/`.
- The latest run of `e2e-tests.yml` on an app repo's `main` is the
  authoritative "is the app's tip red?" answer. Without a token:
  `https://api.github.com/repos/pkp/<app>/actions/workflows/e2e-tests.yml/runs?branch=main&per_page=5`
  lists the runs with their head SHAs; logs and artifacts need a token, so
  per-test detail comes from a local reproduction at that SHA.

## Verify before trusting

File paths, selectors and schema fields cited across these docs are
snapshots, and UIs drift faster than docs. Before finalizing a test, open the
named component or class and confirm it, re-grep anything that moved, and run
the test (`npm run test:<app> -- --ui`) before claiming it works. Treat every
doc here as a map, not a GPS.
