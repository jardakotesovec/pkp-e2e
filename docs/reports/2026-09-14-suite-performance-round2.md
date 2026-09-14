# Suite performance, round 2: the CI runner, 2026-09-14

The first round (`2026-09-14-suite-performance.md`) was measured on the
Mac. This round is measured only on GitHub's 4-vCPU `ubuntu-latest`
runners, because that is where the suites run and because the Mac was busy.
Every branch here sits on top of `perf-pkplib-ci`, that is `main` plus the
pkp-lib installer patch applied to `lib/pkp` before the run (the maintainer
is taking that patch upstream this week, so it counts as given). The goal
was the OJS suite from about 22 minutes to 15.

Runner-to-runner variance is the first finding, and it decides how the
rest reads: the unchanged base commit ran at 21.8, 22.4 and 17.1 minutes
(summed test time 4,237 / 4,264 / 3,402 s), and the round-2 commit at
17.0, 19.9, 19.5 and 18.2 minutes, each pair of runs a uniform shift in
every spec file. One sample cannot resolve anything under about 20%, so
the table gives every sample, averages are compared over all of them, and
the per-file ratio is the tool that separates a change from a slow VM: a
real change shows up in the files that exercise it, a slow VM slows every
file alike.

## The numbers

OJS, 4 workers, the Playwright step only (pre-test steps are under two
minutes and cached; they are not part of this round). "Summed" is the sum
of the parallel project's test durations.

| branch | suite wall | summed | what it adds |
|---|---|---|---|
| `perf-pkplib-ci` (the base) | 21.8 / 22.4 / 17.1 min | 4,237 / 4,264 / 3,402 s | the installer patch |
| `perf-testside-ci` | 17.9 min | 3,726 s (−12%) | the six test-side commits |
| `perf-ci-workers6` | 19.7 min | 5,236 s | 6 workers (per-test +23%, throughput up) |
| `perf-ci-persistent` | 20.6 min | 4,041 s (−5%) | pkp-lib patch: persistent PDO connection |
| `perf-auth` | 22.1 min | 4,289 s | session endpoint + cheap seeded hashes (see below) |
| `perf-ci-opcache` | 21.9 min | 4,246 s | opcache for `php -S`: nothing, dropped |
| **`perf-round2`** | **17.0 / 19.9 / 19.5 / 18.2 min** | **3,497 / 3,984 / 3,912 / 3,753 s** | test-side + auth + persistent |
| `perf-round2-n1` | 18.2 min | 3,667 s | round 2 + the context-cache patch |
| `perf-round2-w6` | 19.0 min | 5,201 s | round 2 at 6 workers |

OMP and OPS from the same runs, suite wall in minutes:

| branch | OMP | OPS |
|---|---|---|
| base | 19.6 / 15.2 / 19.3 | 10.2 / 10.1 / 10.3 |
| test-side | 19.3 | 10.7 |
| round 2 | 17.3 / 16.4 / 12.9 / 11.6 | 8.1 / 8.9 / 8.4 / 9.2 |
| round 2 + context cache | 15.9 | 8.5 |
| round 2, 6 workers | 15.7 | 9.1 |

Reading it honestly: averaged over every sample, round 2's summed test
time is 3,786 s against the base's 3,968 s, **−4.6%**, and its mean wall
18.7 minutes against 20.4. Per file (averaged the same way) the change is
where the profile said it would be, U27 0.84, U29 0.89, U49 and U04 0.90,
U26 0.91, U24/U25 0.92, and flat on the base-journal specs (U02, U05, U06
1.00–1.02, U28 1.00); U21 is the one file slower, 1.13, which points at
the `page.clock` change in U21 S3 on the runner and deserves a look before
that commit is kept. The within-run measurements are firmer than the
cross-run ones: the profile shows the prelude 780 → 640 s and the form
sign-ins gone, and the persistent connection is 10 ms of every request.
Put together that is 5–10% of the suite, not the 30% the target needed.
The 15-minute mark was not reached; on today's VMs the same commit lands
anywhere between 17 and 22 minutes, and that spread is larger than
everything this round changed.

## Where the runner's time goes

`perf-ci-profile` runs the step reporter and a per-request PHP profiler on
the runner and uploads both (`profile-<app>` artifacts). OJS, 213 tests in
the parallel project, 4,650 s summed:

- **Navigations 1,679 s (36%).** 884 page loads at 1.85 s average; the
  editorial dashboard alone is 278 loads at 2.65 s = 779 s (17% of the
  suite). A dashboard load is the page, the stylesheet through PHP, the
  i18n bundle, `_submissions/assigned`, `viewsCount` and two notification
  polls, all queued on the worker's single-threaded `php -S`.
- **Seeding and sign-in before the first browser action 780 s (17%).**
  162 context seeds at 2.5 s (1.13 s of it CPU, half of that bcrypt at cost
  12 for the seeded users), 335 submission seeds at 0.8 s, 238 form
  sign-ins at 0.5 s plus their login page, 500 profile probes.
- **Expects 1,202 s (26%)**: waiting for the UI after an action, which is
  the API calls behind it.
- **PHP: 13,211 requests, 3,165 s wall, 1,153 s CPU.** The floor per
  request is about 85 ms on the runner (35 ms on the Mac); the biggest
  single endpoint is `_submissions/assigned` at 525 × 818 ms = 430 s, which
  runs 1,055 SQL statements per dashboard load.

The runner is CPU-bound: 4 vCPUs shared by four PHP servers, four
Chromiums and the Playwright process. Every request costs three to four
times what it costs on an idle Mac, and cutting CPU anywhere is wall time
everywhere. That is also why 6 workers gain less than the Mac's 10 did.

## What was tried

### Kept on `perf-round2`

1. **The six test-side commits** from `perf/test-side` (the U21 autosave
   through `page.clock`, U27/U30/U21 reloads and duplicate navigations
   dropped, U23 S7 batched seeds, the rowCounts wait). Alone: OJS 22 → 17.9
   minutes on CI, the single biggest item of the round.
2. **`POST /api/v1/_test/session`** (`PKPTestController::session`): the
   app registers the session server-side and answers with the cookie, one
   request instead of the login page plus a bcrypt verify, or the
   three-request liveness probe of the old `.auth` cache. `auth.js` mints a
   state per call and keeps the form as the fallback; the cache, its probe
   and the `reset.js` wipe are gone; `users.md`, `patterns.md` and
   `harness.md` follow. On the runner: 335 mints at 208 ms, zero form
   sign-ins, the prelude 780 → 640 s.
3. **Seeded users hashed at bcrypt cost 4** (`UserSeeder.php`). A seeded
   user is a fixture; the app's cost 12 is 250–350 ms of CPU per user and
   some 400 users are seeded per OJS run. `password_verify` accepts any
   cost, and a real form login rehashes the row at cost 12 (Laravel's
   rehash-on-login), so U01/U02/U03 see the app's own behaviour. Context
   seed CPU on the runner 1,131 → 530 ms.
4. **pkp-lib patch: `[database] persistent = On`**
   (`docs/reports/2026-09-14-pkp-lib-persistent-db-connection.patch`, 5
   lines in `PKPContainer.php`, the test config sets the key). Every
   request opened a new Postgres connection, 16 ms on the Mac, more against
   a Docker service; with `php -S` one process serves one worker for the
   whole run, so the connection is reused. Trivial request 38 → 27 ms, the
   dashboard list 463 → 420 ms in isolation; on CI −5% summed in the
   single-lever run. Upstream shape: this restores the `persistent` switch
   OJS 3.3 had under ADOdb.

### Measured, not kept, or left to the maintainer

- **The context-cache patch**
  (`docs/reports/2026-09-14-pkp-lib-request-scoped-context-cache.patch`,
  on `perf-round2-n1`; 4 files, +123/−7). A request-scoped memo in
  `ContextDAO::getById()/getByPath()` (flushed by every write path) and
  the publication version string taken from the already-joined
  submission context instead of a submission fetch per row. The dashboard
  list drops from 1,055 to about 470 statements and the responses are
  byte-identical, but the CI sample landed on a slow VM (every file +5–14%)
  and the effect, an estimated 130 s of DB round trips per run, is under
  the noise floor. Worth an upstream PR on its own merits; one caveat to
  state there: a long-lived CLI process (queue worker, scheduler) keeps the
  memo across jobs.
- **6 workers.** Wall −10% alone (19.7 vs 21.8/22.4) but +23% per test,
  and on round 2 it gained nothing (19.0 vs 17.0/19.9). More flakes under
  contention (OMP U21 S3, U41 S2). Not recommended for the runner.
- **opcache for `php -S`** (`opcache.enable_cli=1`): no gain on the runner
  either (21.9 min), and the round's flakiest OMP run. Dropped.
- **Emulated prepares** (`PDO::ATTR_EMULATE_PREPARES`): a trivial request
  38 → 6 ms in the sandbox, but the app errors under it. Dropped.

## What would reach 15 minutes

The harness and small-patch levers are measured and in; what is left is
test-side and structural, the maintainer's call. One fact frames all of
it: the runner's CPU is the bottleneck, and the VM a run lands on moves
the suite by ±15%, more than any single item below.

1. **Fewer editorial-dashboard loads.** 278 per OJS run at 2.65 s; 144 of
   them are followed straight by a click into a submission. A test that
   deep-links to the workflow page instead saves the list load and its
   four API calls, roughly 1.5 s each, about 200 s summed (5%) if every
   candidate is converted, without changing what the test asserts about
   the workflow page. The dashboard walks that are the test's subject stay.
2. **`PHP_CLI_SERVER_WORKERS=2..4`.** A page's eight requests would no
   longer queue on one PHP process. −7% on the Mac in round 1, but it
   exposes the five client-state races (U03 S2, U06 S2, U28 S10, U49
   S4/S6); the branch `perf/php-server-workers` keeps it opt-in. Once those
   five are fixed as flakes, this is the next harness lever.
3. **U28 S10 on the runner.** It failed its first attempt in six of the
   twelve OJS runs today (never on the Mac), costing a worker 1.4–1.7
   minutes each time, and it lands late enough to stretch the tail. A fix
   for that one test is worth a minute of wall time on its own.
4. **Test count.** The coverage-revision growth (173 → 222 OJS tests since
   2026-09-04) is the remaining multiplier; the earlier note on assertion
   redundancy stands.

## Method notes

- A private sandbox for single-request work: a copy of `checkouts/ojs`
  without `.git` and `node_modules`, its own `*_test` database installed
  with `tools/installTest.php`, `php -S` on a free port, `POST
  _test/bootstrap` with the app context's `seed.bootstrap`. The shared
  checkout was never edited while other sessions ran suites on it.
- Per-run logs and profiles: `gh run view <id> --log`, artifacts
  `profile-<app>` from the `perf-ci-profile` branches; the comparison
  scripts (`ci-projects.py`, `ci-files.py`) in the job's tmp dir.
- Flakes seen: U28 S10 (OJS, most runs), OMP U21 S3/S5/S13/S16 (the
  wizard rail class), OMP U27 S9, OMP U03 S12, OMP U41 S2, OPS U01 S4;
  all pre-existing classes, none new to the branches.
