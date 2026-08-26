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
| ojs | `20fc190b5956` | 2026-08-26 | seeded at charter — corresponds to the 2026-08-25/26 upstream-rebase check of all shipped specs (see PROGRESS row notes) |
| omp | `cdf5213ccb82` | 2026-08-26 | seeded at charter (same check) |
| ops | `12c625bd7efa` | 2026-08-26 | seeded at charter (same check) |
| pkp-lib | `00e6a1423a9e` | 2026-08-26 | seeded at charter (same check); all three apps' submodule pointers sat here |

## Sync log

_Append-only, newest first: date · range per repo · outcome (specs/tests
touched, findings filed, Mattermost notifications sent, or "clean")._

- **2026-08-26** — baselines seeded from the self-contained checkouts at
  charter time; the preceding 2026-08-25 upstream-rebase check (shipped
  specs U01, U04, U22, U25, U26, U27 — outcomes in their PROGRESS notes)
  covered the history up to these tips. No unreviewed range outstanding.
