# Upstream sync, the stable line — last-read `stable-3_5_0` commits

The last commit of each repo's `stable-3_5_0` branch the daily session has
read for regressions (`docs/process/MAINTENANCE.md` "The stable line:
`stable-3_5_0`"). The regression hunt alone runs here: no spec, no suite
and no CI follows this branch. `main`'s baselines are in
`upstream-sync.md`.

## Baselines

| Repo | Last-read commit | Date | Read by |
|------|------------------|------|---------|
| ojs | `fa19f69e6f` | 2026-09-17 | starting point, not read |
| omp | `77fc278999` | 2026-09-17 | starting point, not read |
| ops | `50ddd4d7b7` | 2026-09-17 | starting point, not read |
| pkp-lib | `6296625771` (ojs) · `78d439c8b8` (omp) · `5840f7d737` (ops) | 2026-09-17 | starting point, not read; pkp-lib `stable-3_5_0` at `6296625771`; ui-library `1a7a4750` (ojs, omp, ops) |

## Read log

_Newest first; one entry per read: the date and the range per repo, then
one line per commit (sha → `=main <sha>` with the date of the `main` read /
`~main <sha>` with what the backport changed / `stable-only`; the
regression verdict; what was filed)._

- **2026-09-18 — pulled, listed, `main`'s findings carried over; the range NOT read, baselines stay.** `main` came first: today's `main` sync accommodated three specs (U06, U40, U03), so the line's own range waits for the next session (MAINTENANCE "The stable line" step 6).
  - Tips: ojs `63c7e555cc`, omp `7c20fb4a1`, ops `129a31a48d` (one pointer bump each), lib/pkp `9ce915e07e` on all three (the pointers have converged), ui-library `1a7a4750` unchanged; pkp-lib `stable-3_5_0` at `a607062f75` (#12163, in no app pointer yet).
  - The listing (`bin/line-range.js`), for the next read: pkp-lib from `6296625771` (ojs) 5 commits: `d3079f201e` `=main 2ecbd331ee` (#13313; `main` read 2026-09-18, U06 A9's gap not driven on the line), `2ddc9eb57e` + `35905e27bd` + `45530b23aa` `~main 462d628de3,2b13599365,c967e34ba4` (#12702: the backport touches `api/v1/jats/PKPJatsController.php` alone, 3.5 has no Body Text or Media controller; same route split and policy drop as `main`'s JATS part by a read of the diff, range-diff not run), `9ce915e07e` `=main 1bcd4dd55f` (#13348). From `78d439c8b8` (omp) the same plus `d7ab1e91a4` `=main b50be82a3d`, `b50ae1d0d7` `=main f80f5b9483`, `6296625771` `=main efbba94ae7`. From `5840f7d737` (ops) 21: those plus merge `88d52314d4` (#13276), six `stable-only` commits of #13041 (the web task runner's database last-run tracker, `09534070b5`..`0ff9e3c568`, merge `8a4bd6dfa9`), `f53e83b153` + `ee997759d2` `~main` and `d477f69239` `=main` (#13299), `ac6b031624` + `78d439c8b8` `~main` (#13181).
  - Carried over from `main`: **pkp-lib#13181, 3.5 shows it too** at ojs `63c7e555cc` / lib/pkp `9ce915e07e` (the kept `checks/sync/pkp-lib-13181/emailchange-links.js` on the line's fresh OJS fleet, `.reports/sync-3_5/s18-13181-ojs/`: both landings `index/en/user/profile#contact`, the old-shape decline link ending in GET 500 with the request pending); ci-triage row and `docs/reports/2026-09-17-pkp-lib-13181.md` updated, one report. pkp-lib#12352: 3.5 does not carry the introducing commit (`git log --grep '#12352'` empty). Today's private-file observations: their standing on the line is in the maintainers' DMs, by code read only.
  - For the #12702 read: `checks/sync/pkp-lib-12702/jats-upload.js` does not run on the line as it is (`.reports/sync-3_5/s18-12702-ojs/`: the shared `WorkflowPage.selectPage()` waits for `main`'s version node in the Publication menu, which 3.5's menu does not have); the seed calls worked, so the drive needs its own navigation to Publication › JATS XML.
- **2026-09-17 (line set up) — no range read.** The baselines are the
  tips of the day the line was set up (3.5.0.5 on the three apps); the
  first read starts from them. omp and ops sit behind ojs on pkp-lib
  (`78d439c8b8` and `5840f7d737` against `6296625771`), so the first read
  already has their pointer catch-up to list.
