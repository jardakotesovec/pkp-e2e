# Upstream sync — last-reviewed app commits

Baselines for the MAINTENANCE upstream-sync loop
(`docs/process/MAINTENANCE.md`): the tip of pkp `main` each app was last
reviewed at. After `npm run fetch-apps -- --update`, diff
`<baseline>..HEAD` per app (and lib/pkp once — it is shared), triage, then
advance the row and add a log entry in the shape below. **The baseline
advances only when its range is fully triaged.** The log keeps entries
back to the oldest open item in `ci-triage.md` or `companion-branches.md`
and nothing older.

## Baselines

| Repo | Last-reviewed commit | Date | Reviewed by |
|------|----------------------|------|-------------|
| ojs | `979819ae45` | 2026-08-29 | claude with the maintainer (second 2026-08-29 entry) |
| omp | `d34542e83` | 2026-08-29 | claude with the maintainer |
| ops | `3f619a3138` | 2026-08-29 | claude with the maintainer |
| pkp-lib | `13b621e42` | 2026-08-29 | claude with the maintainer; all three apps' pointers sit here |

## Sync log

_Append-only, newest first. One entry per sync: the date and the range per
repo, then ONE LINE per change reviewed (commit → no impact / spec and
tests touched / finding filed, with a link). Never a narrative; the story
lives in the register entry and in git. A companion-branch merge
(MAINTENANCE "A developer's PR fails the suite") also gets a one-line
entry when it advances a baseline._

- **2026-09-01 — red-CI triage, not a sync; baselines unchanged.**
  - OMP/OPS reds → the known U43-A13 and U04-A10 rows (dates bumped).
  - pkp-lib `ecd12271ed` → U04 A10 fixed on OJS (U04 fully green, run 33466736951); omp/ops pending their pointer bump.
  - U49 S11 red with retries exhausted → decision-wizard flake class; content-verified save applied to the test, verified green the same day.
  - pkp-lib `9e2fbac214` (via ojs `d44b186c22`) → new regression, U21 register A11 + ci-triage row U21-A11; reported to the team.
  - pkp-lib `13b621e424..6f0a39733a` and the ojs/ui-library companions → UNREVIEWED apart from A11; the next sync owns the range.
- **2026-08-29 (second) — ojs `0471e029b9..979819ae45` (3), ops `28d4cb1dff..3f619a3138` (1), omp none, pkp-lib none.**
  - ui-library `f88b7e6a` (funders read from `submission.funders`) → U43 A13 fixed on OJS, verified: full suite at `979819ae45` 125✓/2✘, the ✘ being the known A10 and one U40 S4 flake; omp/ops still pin the pre-fix ui-library.
  - ojs `b08ae56ccd` / ops `3f619a3138` (galleys serialized as a JSON array) → no impact, vouched by the green run.
  - ojs jatsTemplate bump → no impact.
  - First 4-worker full run, 7m13s on the 4-core VM → ruling encoded in MAINTENANCE.md.
  - Baselines advanced.
- **2026-08-29 — ojs `fcf2f00807..0471e029b9`, omp `244a04311..d34542e83`, ops `94f6bbc59a..28d4cb1dff`, pkp-lib `a9767b7f14..13b621e42` (50 commits, with the maintainer).**
  - pkp-lib `4017a024f` (i13156 modify-reviews rework) → accommodated in place: U27 Rules 3/14a/14b/15, status table, side effects, S9/S10/S14 reworked, S16 added, fn-i rewritten; U26 scenario 2; OJS+OMP suites green ×2; U27 A10 retired; new U27 A21 🐞, A22 🐞, A23 ❓, A24 ❓.
  - pkp-lib `747af277a` and the #13003 batch-loading chain → U43 A13 🐞 filed and reported (funders never render); U04 A10 🐞 filed and reported (ORCID delete 500s); otherwise no impact (U40/U41/U49 and all earlier suites pass).
  - Misc range commits (pageTitles, base-URL, PHPUnit cleanups) and plugin submodule bumps → no impact.
  - Suite state at the tips: OJS 121✓/6✘, OMP 123✓/6✘, OPS 90✓/6✘, every ✘ = A13 or A10. Baselines advanced; committed locally, push held by the maintainer.
- **2026-08-27 (third pass) — no new range.**
  - CI: `run-app.yml` gained an `e2e_ref` input and `e2e.yml` dispatch pins (`580ee4b`); failure artifacts now include `.server-logs/` (`5dde560`).
  - Two dead-worker incidents (OMP run 33095432326, OJS run 33106002377) → ci-triage flake class, since resolved.
- **2026-08-27 (second pass) — ojs `014c084231..fcf2f00807`, omp `d0226ccac..244a04311`, ops `5b7157a984..94f6bbc59a`, pkp-lib `774240665..a9767b7f14`.**
  - `pkp.min.js` recompiled in all three apps (#12903) → U27 A20 retired, verified live with minification on.
  - U27 OPS1 retired the same day (overturned by maintainer ruling: OPS ships no reviewer email templates, the window is unreachable).
  - CI run 33081733204 green on all three apps; one U26 S7 flaky pass → decision-wizard flake class.
- **2026-08-27 — ojs `20fc190b5956..014c084231`, omp `cdf5213ccb82..d0226ccac`, ops `12c625bd7efa..5b7157a984`, pkp-lib `00e6a1423a9e..774240665` (with the maintainer, prompted by the red hook on pkp/omp).**
  - pkp/pkp-lib#13035 (issue #12903, unassign/cancel rework) → accommodated in place: U27 spec (template chooser, mail split, fn-k/h) and OJS/OMP S11 tests; U26 fn-f (round-cancel mail is `ReviewCancel`).
  - Same rework → U27 A20 🐞 filed (apps did not recompile `pkp.min.js`) and OPS1 (latent); reported to the team.
  - CI: `e2e_ng_2` pin retired, CI now tests `pkp/<app>@main` (app-changes rows 1–2); the OMP-hook red was the pinned old lib/pkp against new app code.
  - #13117, #13128, #13141, #13218, #13235 → no impact.
  - Drive-by: the top-nav help button's screen-reader label renders `##common.help##` (no owning spec yet; told the team).
  - Suites at the new baselines: OMP 90/92 and OJS 84/88 (the A20 reds plus flakes), OPS 62/62.
- **2026-08-26** — baselines seeded from the self-contained checkouts at
  charter time; the 2026-08-25 upstream-rebase check of the shipped specs
  covered the history up to these tips. No unreviewed range outstanding.
