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
| ojs | `fcf2f00807` | 2026-08-27 | i12903 sync review + A20 fix verification (claude, interactive w/ maintainer) — see the two 2026-08-27 log entries |
| omp | `244a04311` | 2026-08-27 | same review |
| ops | `94f6bbc59a` | 2026-08-27 | same review |
| pkp-lib | `a9767b7f14` | 2026-08-27 | same review; the #13035 merge commit — all three apps' submodule pointers sit here |

## Sync log

_Append-only, newest first: date · range per repo · outcome (specs/tests
touched, findings filed, Mattermost notifications sent, or "clean")._

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
