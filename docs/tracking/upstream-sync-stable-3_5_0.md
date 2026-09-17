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

- **2026-09-17 (line set up) — no range read.** The baselines are the
  tips of the day the line was set up (3.5.0.5 on the three apps); the
  first read starts from them. omp and ops sit behind ojs on pkp-lib
  (`78d439c8b8` and `5840f7d737` against `6296625771`), so the first read
  already has their pointer catch-up to list.
