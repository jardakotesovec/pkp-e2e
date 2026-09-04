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
| ojs | `97663b2850` | 2026-09-04 | claude (daily maintenance session) |
| omp | `a1aefa3fe` | 2026-09-04 | claude (daily maintenance session); tip unchanged |
| ops | `6bda92fb03` | 2026-09-04 | claude (daily maintenance session); tip unchanged |
| pkp-lib | `4ddab4b9cf` | 2026-09-04 | claude (daily maintenance session); OJS's pointer sits here, OMP and OPS sit at `7ab247a737` (everything between is reviewed, so their next bump needs no re-triage) |

## Sync log

_Append-only, newest first. One entry per sync: the date and the range per
repo, then ONE LINE per change reviewed (commit → no impact / spec and
tests touched / finding filed, with a link). Never a narrative; the story
lives in the register entry and in git. A companion-branch merge
(MAINTENANCE "A developer's PR fails the suite") also gets a one-line
entry when it advances a baseline._

- **2026-09-04 (sync) — ojs `762415103f..97663b2850` (4), omp and ops unchanged, pkp-lib `6a902ad50a..4ddab4b9cf` (1, ojs only), ui-library `7611b0b8..5c3da336` (ojs only), lensGalley `025f53c..43c8195` (ojs only).**
  - CI at the tips: ojs run 33771247334, omp 33629780688, ops 33629815586 → all green; nothing red to triage; no open ci-triage rows, no companions.
  - ojs `95b03c34ec` (#13271, `getExportable()` groups by `s.submission_id` too; the pubId export grids errored on PostgreSQL) → not covered yet (the method serves only the export plugins: U45/U63 pending).
  - pkp-lib `4ddab4b9cf` (#13184 merge commit; tree identical to `6a902ad50a`) → no impact.
  - ui-library `5c3da336` (#978, Storybook/chromatic files only, no `src/` change) → no impact; no rebuild needed.
  - lensGalley `43c8195` (the i12311 commit re-landed on `stable-3_5_0`; tree identical to `025f53c`) → no impact.
  - Baselines advanced.
- **2026-09-03 (sync) — ojs `979819ae45..762415103f` (22), omp `d34542e83..a1aefa3fe` (6), ops `3f619a3138..6bda92fb03` (6), pkp-lib `13b621e42..6a902ad50a` (16; omp/ops at `7ab247a737`), ui-library `f88b7e6a..7611b0b8` (ojs) / `30beb5e3..ba2d082b` (omp, ops).**
  - CI at the tips: ojs run 33734101572, omp 33629780688, ops 33629815586 → all green; nothing red to triage.
  - ui-library `f88b7e6a` and pkp-lib `ecd12271ed`+`d9e9b3fc7c` now in omp/ops → U43 A13 and U04 A10 retired (verified by the green omp/ops runs above); ci-triage rows U43-A13 and U04-A10 deleted.
  - ui-library `d3e19fc4` (#971, recommendations passed to the dashboard-opened Review Details window) → U27 A25 retired, verified live on OJS (both entry paths identical); the parity scenario/test stays parked per the 2026-09-01 maintainer ruling.
  - pkp-lib `922f895988` (author seq `!== null` + Collector tie-break) → U41 A15 retired: re-probed live on OJS and OMP (new contributor joins at the end, seq 0/1, stable over reloads, previews, landing page and TOC); OPS by the shared mechanism.
  - pkp-lib #13232 / ojs #5769 / omp #2441 / ops #1381 / lensGalley `025f53c` (i12311 JATS usage tracking; `UsageEvent` gains `publication`, `LogUsageEvent` gates on the publication's status, JATS column only when the plugin is enabled) → no impact (usage statistics is U64, pending; every in-tree caller passes the publication; suites green on CI).
  - pkp-lib `44ef66eb90` (#13191, assistants may fetch reviewer suggestions; the API 401 that logged assistants out of a submission with suggestions) → intended fix in U25 Rule 1 territory, OJS only until omp/ops bump their pointer; not probed (no seed key for suggestions); no spec change.
  - pkp-lib `56d3caac55` (vocab suggestions capped at 200 entries) → no impact (U40 fn-e).
  - pkp-lib `6a902ad50a` (#13184, bulk-email user count) → no impact (U55 pending); OJS only.
  - pkp-lib `84e049ebd9` + profile/login/register template hooks, FBV readonly/hidden field flags → no impact (plugin hook points, no visible behavior; U01/U02/U03 territory).
  - pkp-lib NavigationMenuDAO cache invalidation, `384693429b` + ojs `a7a3c6c8da` (#13261 export-grid link to the version), pkp-lib #13003 affiliation/serialization fixes, ojs `fed8315e6b`/`7819a42e98` (pubId export grids) → no impact (U08/U63 pending; U21/U41 suites green).
  - ojs `e470617a65`/`094218bde4` (#12752 HTML galley sanitizer, Off by default) → no impact (galleys are U46, pending; the filter is Off by default). A config-key report filed the same day was withdrawn: the template's `allowed_hosts` line is a copy-paste remnant, not part of the feature (maintainer, 2026-09-03).
  - ui-library `7611b0b8` (FieldControlledVocab watcher rebuilt from the value) and `e414522e` (vocabulary modal button row) → no impact (U40 suites green on CI at `762415103f`; OJS bundle rebuilt locally).
  - crossref plugin bumps (ojs `a03c4b7`, ops `417a43a`) → no impact (U45 pending).
  - App e2e hooks now pass the PR branch name (ojs `79b0a1ca34`, omp `efe0b7800`, ops `2eabaf670c`) → harness fact already in harness.md "CI".
  - Baselines advanced.
- **2026-09-03 — U15 build session, not a sync; baselines unchanged.**
  - Checkouts moved to ojs `c499837187` (lib/pkp `8d5ddf8192`), omp `a1aefa3fe` and ops `6bda92fb03` (lib/pkp `7ab247a737`); ui-library bumped in all three → rebuilt. The range is UNTRIAGED; the next sync owns it.
  - pkp-lib `eb4cef92` (#13265) present in every app's lib/pkp → U21 A11 retired, ci-triage row U21-A11 deleted; full suites green at the tips: OJS 154, OMP 156, OPS 119 (with the new U15 serial suites).
