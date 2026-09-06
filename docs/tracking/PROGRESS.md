# Progress — live state

One row per feature; the banner names the mode. Read it with
`docs/process/RUNBOOK.md`. Finding detail lives in each spec's Findings
register, never here.

**Mode: MAINTENANCE** (since 2026-08-29). The resident QA agent runs per
`docs/process/MAINTENANCE.md`, one session a day, and never builds a
pending row; feature sessions are launched by the maintainer under the
RUNBOOK loop. Open questions last posted to the team: never yet. Upstream
baselines: `docs/tracking/upstream-sync.md`. CI failures, flake watch and
companion branches: `docs/tracking/ci-triage.md`, checked first on any
reported failure.

## Features

Rows in FEATURE-MAP order. Budget is the tier (H/M/L, RUNBOOK "Budget");
status is pending / in_progress / done / parked.

| Row | Feature | Apps | Budget | Status | Note |
|---|---|---|---|---|---|
| U01 | Login & sessions | OJS OMP OPS | M | done | 8 OJS · 8 OMP · 8 OPS (+setup; scenario 9 declared not covered in the suite headers). 6🐞+1❓+1✅. |
| U02 | Registration & account validation | OJS OMP OPS | M | done | 8 tests per app (+setup; OPS S3 absence). 8🐞+2❓. Headliner A6. 1 in the private file, verified. |
| U03 | User profile | OJS OMP OPS | M | done | 10 tests per app (+setup; OPS S6 absence). 12🐞+6❓+2✅. Headliner A3. 2 in the private file, verified. Low-confidence: Rule 3 (one-journal site, not drivable on the fleets). |
| U04 | ORCID integration | OJS OMP OPS | M | done | 9 OJS · 8 OMP · 9 OPS (+setup; 2 absence tests). 6🐞+5❓+3✅ (A10 retired 2026-09-03, fixed upstream in all three apps). Headliner A5. ORCID legs run against the dead-port proxy with sandbox dummy credentials. |
| U05 | Notifications center & email preferences | OJS OMP OPS | M | done | 9 OJS (S9 serial) · 8 OMP · 8 OPS (+setup). 6🐞+8❓. Headliner A10. Blocker: app-changes row 12 (overlay mounted). Low-confidence: Rules 2d/5d (F26, not drivable on the fleets). |
| U06 | User invitations | OJS OMP OPS | M | done | 8 OJS · 8 OMP · 9 OPS (+setup). 8🐞+2❓. 1 in the private file. |
| U07 | Journal identity & about pages | OJS OMP OPS | M | pending | |
| U08 | Navigation menus & site chrome | OJS OMP OPS | M | pending | |
| U09 | Custom pages & blocks | OJS OMP OPS | L | pending | |
| U10 | Appearance & theming | OJS OMP OPS | M | pending | |
| U11 | Highlights | OJS OMP OPS | L | pending | |
| U12 | Announcements | OJS OMP OPS | M | pending | |
| U13 | Article landing page & reading | OJS OPS | H | pending | |
| U14 | Reader comments & moderation | OJS | M | pending | |
| U15 | Search | OJS OMP OPS | M | done | 9 OJS · 8 OMP · 8 OPS (+setup; serial project). 11🐞+12❓+1✅. Headliner A11. 2 in the private file, verified. |
| U16 | Categories | OJS OMP OPS | M | pending | |
| U17 | Sections | OJS OMP OPS | M | pending | |
| U18 | Web feeds | OJS OMP OPS | L | pending | |
| U19 | OAI-PMH | OJS OMP OPS | M | pending | |
| U20 | Search-engine metadata & analytics | OJS OMP OPS | L | pending | |
| U21 | Submission wizard | OJS OMP OPS | H | done | 13 OJS · 14 OMP · 14 OPS (+setup). 10🐞+7❓+2✅ (A11 retired 2026-09-03). Headliner A8. |
| U22 | My Submissions (author dashboard) | OJS OMP OPS | L | done | 4 OJS · 5 OMP · 4 OPS (+setup). 1🐞+7❓. Headliner OPS2. 1 in the private file, verified. Low-confidence: A3. |
| U23 | Submissions dashboard (editorial) | OJS OMP OPS | H | done | 13 OJS · 13 OMP · 11 OPS (+setup). 3🐞+6❓. Headliner A5. |
| U24 | Workflow screen & stage access | OJS OMP OPS | M | done | 8 OJS · 9 OMP · 6 OPS (+setup; OPS runs S1, S5–S8, S10). 4🐞+10❓+2✅. Headliner A9. 1 in the private file, verified. Low-confidence: Rule 15b; Rules 18–19 (no positive control). |
| U25 | Submission stage | OJS OMP OPS | M | done | 7 OJS · 8 OMP · 2 OPS absence (+setup). 3❓+2✅. The A2 area has items in the private file. |
| U26 | Review stage & rounds | OJS OMP | H | done | 12 OJS · 13 OMP · 1 OPS absence (+setup). 4🐞+9❓+1✅. 1 in the private file. In step with upstream at the 2026-08-29 baselines. |
| U27 | Reviewer assignment & management | OJS OMP | H | done | 14 OJS · 15 OMP · 1 OPS absence (+setup). 13🐞+5❓+10✅ (9 retired). Headliner A18. 3 in the private file. PARKED: the Review Details entry-path parity scenario and its tests (maintainer, 2026-09-01). |
| U28 | Reviewer's review | OJS OMP | H | done | 15 OJS · 15 OMP · 1 OPS absence (+setup). 12🐞+3❓+1✅ (A8, OMP4 retired). Headliner A7. Low-confidence: A13. |
| U29 | Review setup & review forms | OJS OMP | M | done | 10 OJS · 9 OMP · 1 OPS absence (+setup). 4🐞+6❓+2✅. Headliner A9. 1 in the private file. Coverage: settings rows only. Low-confidence: A6, A7. |
| U30 | Author response to reviews | OJS | M | done | 6 OJS · 1 OMP absence · 1 OPS absence (+setup). 6🐞+3❓. Headliner A7. 16 Coverage rows out of tier. Low-confidence: A8 (not seedable). |
| U31 | Reviewer suggestions | OJS OMP | L | done | 4 OJS · 5 OMP · 1 OPS absence (+setup). 8🐞+4❓. Headliner A5. 1 in the private file, verified. 12 Coverage rows out of tier. Low-confidence: A5 (the Enroll path not driven). |
| U32 | Copyediting stage | OJS OMP | M | pending | |
| U33 | Production stage | OJS OMP OPS | M | pending | |
| U34 | Editorial decision recording | OJS OMP OPS | H | pending | |
| U35 | Stage participants | OJS OMP OPS | M | pending | |
| U36 | Submission files | OJS OMP OPS | H | pending | |
| U37 | Tasks & discussions | OJS OMP OPS | H | pending | |
| U38 | Submission activity log & notes | OJS OMP OPS | L | pending | |
| U39 | Submission & Publisher Libraries | OJS OMP OPS | L | pending | |
| U40 | Publication metadata | OJS OMP OPS | M | done | 11 OJS · 9 OMP · 9 OPS (+setup). 7🐞+10❓+6✅. Headliner A1. 1 in the private file, verified. |
| U41 | Contributors & affiliations | OJS OMP OPS | M | done | 9 OJS · 11 OMP · 9 OPS (+setup). 9🐞+9❓+4✅ (A15 retired 2026-09-03). Headliner A14. 1 in the private file, verified. |
| U42 | Citations & references | OJS OMP OPS | M | pending | |
| U43 | Funding | OJS OMP OPS | L | done | 5 tests per app (+setup). 3🐞+9❓+2✅ (A13 retired 2026-09-03). Headliner A3. Low-confidence: A4 (not re-probed at the fixed tips), A10, A11 (need a server with egress). |
| U44 | Identifiers (publisher IDs & URN) | OJS OMP OPS | M | pending | |
| U45 | DOIs | OJS OMP OPS | H | pending | |
| U46 | Galleys | OJS OPS | M | pending | |
| U47 | Media files | OJS OMP OPS | L | pending | |
| U48 | JATS & Body Text | OJS | M | pending | |
| U49 | Publish, schedule & versions | OJS OMP OPS | H | done | 13 OJS · 11 OMP · 12 OPS (+setup). 7🐞+9❓. Headliner OJS2. Blocker: app-changes row 10; S11 OJS is on the ci-triage flake watch. |
| U50 | Issues | OJS | H | pending | |
| U51 | Subscriptions & open access control | OJS | H | pending | |
| U52 | Payments & APCs | OJS | M | pending | |
| U53 | Users management | OJS OMP OPS | M | pending | |
| U54 | Roles configuration | OJS OMP OPS | M | pending | |
| U55 | Notify users (bulk email) | OJS OMP OPS | L | pending | |
| U56 | Emails management | OJS OMP OPS | M | pending | |
| U57 | Languages & locales | OJS OMP OPS | M | pending | |
| U58 | Submission intake configuration | OJS OMP OPS | M | pending | |
| U59 | Hosted journals (site admin) | OJS OMP OPS | M | pending | |
| U60 | Site settings | OJS OMP OPS | M | pending | |
| U61 | System administration & jobs | OJS OMP OPS | M | pending | |
| U62 | Plugins management | OJS OMP OPS | M | pending | |
| U63 | Import & export | OJS OMP OPS | M | pending | |
| U64 | Statistics — usage | OJS OMP OPS | H | pending | |
| U65 | Statistics — editorial activity & reports | OJS OMP OPS | M | pending | |
| U66 | Institutions | OJS OMP OPS | L | pending | |
| U67 | Archiving & preservation | OJS | L | pending | |
| U68 | Catalog browse | OMP | L | pending | |
| U69 | Monograph landing page | OMP | M | pending | |
| U70 | Catalog management | OMP | M | pending | |
