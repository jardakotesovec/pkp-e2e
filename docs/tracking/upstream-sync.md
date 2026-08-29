# Upstream sync — last-reviewed app commits

Baselines for the MAINTENANCE upstream-sync loop
(`docs/process/MAINTENANCE.md`): the tip of pkp `main` each app was last
reviewed at. After `npm run fetch-apps -- --update`, diff
`<baseline>..HEAD` per app (and lib/pkp once — it is shared), triage, then
advance the row and append a log line. **The baseline advances only when its
range is fully triaged.**

## Baselines

| Repo | Last-reviewed commit | Date | Reviewed by |
|------|----------------------|------|-------------|
| ojs | `979819ae45` | 2026-08-29 | funder-fix verification cycle (claude, w/ maintainer) — see the second 2026-08-29 log entry |
| omp | `d34542e83` | 2026-08-29 | #13003 aftermath + i13156 maintenance cycle — no new commits since |
| ops | `3f619a3138` | 2026-08-29 | funder-fix verification cycle |
| pkp-lib | `13b621e42` | 2026-08-29 | unmoved; all three apps' submodule pointers sit here |

## Sync log

_Append-only, newest first: date · range per repo · outcome (specs/tests
touched, findings filed, Mattermost notifications sent, or "clean")._

- **2026-08-29, second cycle (funder-fix verification)** — ojs
  `0471e029b9..979819ae45` (3 commits), ops `28d4cb1dff..3f619a3138`
  (1 commit), omp none, pkp-lib none. The range = the A13 fix and more
  #13003 fix-ups: ui-library `f88b7e6a` points `funderManagerStore` at
  `submission.funders` (pinned in ojs only — omp/ops still pre-fix);
  galleys-as-JSON-array serialization fix (`->values()` on the publication
  schema map; ojs `b08ae56ccd` + the identical ops `3f619a3138`); ojs
  jatsTemplate bump (lazy-loading fix-ups, no suite-owned surface).
  **A13 fix verified on OJS**: UI rebuilt, full suite at `979819ae45` =
  125✓/2✘ — all five U43 funding tests green (register + ci-triage rows
  annotated; entry retires when omp/ops bump their ui-library pointers);
  the ✘s are the known A10 (pkp-lib unmoved) and a U40 S4 under-load
  timing flake (green in isolation 3.7 s — tallied on the flake-watch
  class). Galleys fix vouched by the green run (shared code path covers
  ops). **First 4-worker run** (maintainer ruling, encoded in
  MAINTENANCE.md): full OJS suite in 7m13s wall on the 4-core VM.
  Baselines advanced (omp/pkp-lib naturally unmoved). — ojs
  `fcf2f00807..0471e029b9`, omp `244a04311..d34542e83`, ops
  `94f6bbc59a..28d4cb1dff`, pkp-lib `a9767b7f14..13b621e42` (50 commits;
  interactive with the maintainer). The range = the full #13003 batch-loading
  chain plus its fix-up wave, the i13156 modify-reviews rework (4017a024f),
  and app-side ports. **i13156 accommodated in place**: the editor read-review
  window (readReview.tpl/ReadReviewHandler/grid op, deleted upstream) is now
  the Vue Review Details + Modify Review windows — U27 Rules 3/14a/14b/15,
  status table, side effects, S9/S10/S14 reworked, **S16 added**, fn-i
  rewritten; U26 scenario 2 aligned; OJS+OMP suites reworked (new POM helpers;
  row state assertable only after the dialog closes — patterns.md locator
  pitfall 6) and green ×2. **U27 A10 retired** (overturned by design: opening
  now marks Review Viewed). **New i13156 findings**: A21 🐞 rating-click race
  (no reliable settled signal — suites guard, never assert), A22 🐞 stale
  guidance (upload control moved to Modify Review; key fuzzy upstream),
  A23 ❓ duplicate recommendation display {OJS}, A24 ❓ latent editReview
  completion stamp (code-read). **Two #13003 regressions filed and reported
  to the team** (maintainer posted 2026-08-29): U43 **A13** 🐞 — funders
  moved publication→submission schema (747af277a) but FunderManager still
  reads `publication.funders`: saved funders never render in the
  workflow/wizard table on any app (reader pages fine, data intact; entire
  U43 suite red = the bug); U04 **A10** 🐞 — contributor ORCID delete 500s
  (RevokeOrcidToken serializes a lazy-hydrated Author; found 2026-08-28,
  still present at these tips). **#13003 otherwise verified**: the wave
  suites (U40/U41/U49) + all pre-wave suites pass at main — the fix-up chain
  ("Collections are truthy", keying-by-ID restores, eager submissions, funder
  moves) triaged against them; misc range commits (untranslated pageTitles
  fix, base-URL/typo/PHPUnit cleanups) no-impact. Plugin submodule bumps
  (crossref/jatsTemplate/pfl + routine) skimmed: no suite-owned surface.
  Suite states at the tips: OJS 121✓/6✘, OMP 123✓/6✘, OPS 90✓/6✘ — every ✘
  = A13 (×5) + A10 (×1); serial U04 tests skip while their app project is
  red. U49 S11 full-run failure re-ran green in isolation (the known
  under-load timing-flake class). Baselines advanced; work committed locally
  only — **nothing pushed** (maintainer holds the push while the wave and
  these reds sit ahead of origin).
- **2026-08-27 (third pass — CI plumbing + dead-worker evidence)** — no new
  range (baselines unchanged). **CI**: `run-app.yml` gained an `e2e_ref` input
  (pkp-e2e branch/PR runs now test their own tree — they silently tested
  `main` before; app hooks unchanged, still float on main) and `e2e.yml`
  gained dispatch app-repo/ref pins — the fix-verification combo is
  `gh workflow run e2e.yml --ref <fix-branch> -f <app>_ref=<sha>` (both
  validated on-branch before merge, `580ee4b`). Failure artifacts now really
  contain `.server-logs/` (`5dde560` — upload-artifact@v4 skips hidden dirs
  unless `include-hidden-files`, so the path had uploaded nothing since day
  one). That fix immediately paid off on the standing "server process gone →
  cascade" watch item — **two more dead-worker incidents today, both at the
  reviewed tips, cause now evidenced**: OMP run 33095432326 (worker 0,
  socket hang-up from the login smoke + U01 S7 onward; pre-fix, so no server
  log; targeted rerun green) and OJS run 33106002377 (worker 2 —
  `Segmentation fault (core dumped)` at the tail of
  `.server-logs/server-8002.log`, seconds after
  `/api/v1/invitations/userRoleAssignment` +
  `/api/v1/users?…includePermissions=true` served for U01 S7's Users & Roles
  screen; ~20-test cascade; rerun green). Pattern across all three incidents
  (with the earlier U04 S7 DB-time-limit fatal): a worker's `php -S` dies,
  Playwright never restarts it, every test on that worker fails in
  milliseconds; none reproduce on rerun. Both of today's first failed at U01
  S7 impersonation on different apps — if it recurs, chase the in-flight
  request on that screen (PHP error log/core capture in CI) and consider
  webServer crash resilience.
- **2026-08-27 (second pass)** — ojs `014c084231..fcf2f00807`, omp
  `d0226ccac..244a04311`, ops `5b7157a984..94f6bbc59a`, pkp-lib
  `774240665..a9767b7f14` (the #13035 merge commit). The range is exactly the
  maintainer's same-day fix for A20 — "pkp/pkp-lib#12903 Update pkp.min.js"
  in each app (`ReviewerActionFormHandler` now in all three bundles).
  Verified live minified-on, fresh resets: OJS + OMP U27 S7 and S11 green,
  chooser present, new cancel subject received. **A20 retired** in the U27
  register (dated). **OPS1 also retired same day, overturned** — maintainer
  ruling (OPS has no review process) + registry check: OPS has never
  registered reviewer-flow email templates (one `REVIEW*` entry, the
  author-response round template, vs 19 in OJS), so the i12903 companion was
  never applicable there and the window behind the would-be fatal is
  unreachable; the earlier framing measured OPS against the OJS/OMP
  baseline instead of its own. CI at this tip (first un-pinned run,
  33081733204): all three apps green — one flaky-passed test, OJS U26 S7
  "cancel a round" (wizard completion link >30 s on attempt 1, retry green
  in 42 s) — the third U26-under-load timing flake today (with the local
  S5/S8 one-offs); none reproduce in isolation. Watch the decision-wizard
  waits if the pattern recurs.
- **2026-08-27** — ojs `20fc190b5956..014c084231`, omp `cdf5213ccb82..d0226ccac`,
  ops `12c625bd7efa..5b7157a984`, pkp-lib `00e6a1423a9e..774240665` (interactive
  session with the maintainer, prompted by the red e2e hook on pkp/omp `main`).
  Headline: the unassign/cancel rework (pkp/pkp-lib#13035, issue #12903,
  merged into all three apps 2026-08-26/27) — **accommodated in place**: U27
  spec folded (per-action template chooser; unassign/cancel mail split with
  new subjects; fn-k/h reworked) + OJS/OMP U27 S11 tests updated
  (`cancelReviewForm` id, new cancel subject, chooser assert); U26 fn-f:
  round-cancel reviewer mail is now `ReviewCancel`. **Two upstream defects
  filed** (both in the U27 register, reported to the team): A20 — none of the
  three apps recompiled `js/pkp.min.js` after the rework, so with
  `enable_minified = On` the Send Reminder/Unassign/Cancel/Reinstate windows
  open without their message editor (U27 S7+S11 stay red on OJS+OMP until the
  apps recompile — the reds are the bug, not drift); OPS1 (latent) — OPS took
  only the `minifiedScripts.txt` fragment of the app-side companion, its
  unassign window would fatal on the never-installed REVIEWER_UNASSIGN
  template. **CI**: retired the `e2e_ng_2` pin in `e2e.yml`/`run-app.yml`
  (both one-liners it carried are upstream — app-changes rows 1–2 noted);
  CI now tests `pkp/<app>@main`; the 2026-08-27 OMP-hook red was the pinned
  old lib/pkp running against the new app code. Rest of range triaged
  no-impact for shipped specs (#13117 review-form checkbox normalization,
  #13128 email URL fixes + migration, #13141 invitation cc/bcc payloads,
  #13218 masthead ordering, #13235 iframe-title escaping — no suite asserts
  the touched surfaces). Suites at the new baselines: OMP 90/92 (only A20's
  S7+S11 red), OJS 84/88 with the same two A20 reds plus two one-off local
  flakes that passed a targeted rerun (U26 S5/S8; a corrupted `.auth`
  storage-state JSON is a recurring flake shape worth a harness look), OPS
  62/62 green. Drive-bys: one full OJS run died on a
  30 s DB-time-limit fatal during U04 S7 (server process gone → 33-test
  cascade; did not reproduce) — watch; the top-nav help button's
  screen-reader label renders `##common.help##` (`TopNavActions.vue` uses a
  key absent from every en locale; predates this range; no owning spec —
  recorded here + told to the team). Notifications: findings handed to the
  maintainer in-session for the Mattermost channel.
- **2026-08-26** — baselines seeded from the self-contained checkouts at
  charter time; the preceding 2026-08-25 upstream-rebase check (shipped
  specs U01, U04, U22, U25, U26, U27 — outcomes in their PROGRESS notes)
  covered the history up to these tips. No unreviewed range outstanding.
