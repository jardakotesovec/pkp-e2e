# Progress, `stable-3_5_0` — the build-out's queue and state

One row per feature, in build order: the two pilot features first, then
FEATURE-MAP order. Read it with `docs/process/VERSIONS.md`. A build-out
session takes rows from the top. Status is pending / in_progress / done
/ absent (3.5 has no such feature) / parked; "Apps" is `main`'s badge
until the feature is built. Finding detail lives in each spec's
register, never here.

The 3.5 suite does not run in CI yet: a feature's second green is the
local final run (`VERSIONS.md` step 8).

| Row | Feature | Apps | Scenarios | Status | Note |
|---|---|---|---|---|---|
| U26 | Review stage & rounds | OJS OMP | | pending | OJS: 13 tests and the page objects adapted from a walk of the scenarios, green. Not through the loop yet: no spec in the folder, OMP not started. Notes: `docs/specs/lines/stable-3_5_0/U26-review-stage-and-rounds.md`; walk `lines/stable-3_5_0/shared/playwright/checks/U26/W1/`. |
| U37 | Tasks & discussions | OJS OMP OPS | | pending | Nothing built. `main`'s 11 OJS tests all fail on 3.5 (the feature was rebuilt on `main`). Notes: `docs/specs/lines/stable-3_5_0/U37-tasks-and-discussions.md`; walk `lines/stable-3_5_0/shared/playwright/checks/U37/W1/`. |
| U01 | Login & sessions | OJS OMP OPS | | pending |  |
| U02 | Registration & account validation | OJS OMP OPS | | pending |  |
| U03 | User profile | OJS OMP OPS | | pending |  |
| U04 | ORCID integration | OJS OMP OPS | | pending |  |
| U05 | Notifications center & email preferences | OJS OMP OPS | | pending |  |
| U06 | User invitations | OJS OMP OPS | | pending |  |
| U07 | Journal identity & about pages | OJS OMP OPS | | pending |  |
| U08 | Navigation menus & site chrome | OJS OMP OPS | | pending |  |
| U09 | Custom pages & blocks | OJS OMP OPS | | pending |  |
| U10 | Appearance & theming | OJS OMP OPS | | pending |  |
| U11 | Highlights | OJS OMP OPS | | pending |  |
| U12 | Announcements | OJS OMP OPS | | pending |  |
| U13 | Article landing page & reading | OJS OPS | | pending |  |
| U14 | Reader comments & moderation | OJS | | pending |  |
| U15 | Search | OJS OMP OPS | | pending |  |
| U16 | Categories | OJS OMP OPS | | pending |  |
| U17 | Sections | OJS OMP OPS | | pending |  |
| U18 | Web feeds | OJS OMP OPS | | pending |  |
| U19 | OAI-PMH | OJS OMP OPS | | pending |  |
| U20 | Search-engine metadata & analytics | OJS OMP OPS | | pending |  |
| U21 | Submission wizard | OJS OMP OPS | | pending |  |
| U22 | My Submissions (author dashboard) | OJS OMP OPS | | pending |  |
| U23 | Submissions dashboard (editorial) | OJS OMP OPS | | pending |  |
| U24 | Workflow screen & stage access | OJS OMP OPS | | pending |  |
| U25 | Submission stage | OJS OMP OPS | | pending |  |
| U27 | Reviewer assignment & management | OJS OMP | | pending |  |
| U28 | Reviewer's review | OJS OMP | | pending |  |
| U29 | Review setup & review forms | OJS OMP | | pending |  |
| U30 | Author response to reviews | OJS | | pending |  |
| U31 | Reviewer suggestions | OJS OMP | | pending |  |
| U32 | Copyediting stage | OJS OMP | | pending |  |
| U33 | Production stage | OJS OMP OPS | | pending |  |
| U34 | Editorial decision recording | OJS OMP OPS | | pending |  |
| U35 | Stage participants | OJS OMP OPS | | pending |  |
| U36 | Submission files | OJS OMP OPS | | pending |  |
| U38 | Submission activity log & notes | OJS OMP OPS | | pending |  |
| U39 | Submission & Publisher Libraries | OJS OMP OPS | | pending |  |
| U40 | Publication metadata | OJS OMP OPS | | pending |  |
| U41 | Contributors & affiliations | OJS OMP OPS | | pending |  |
| U42 | Citations & references | OJS OMP OPS | | pending |  |
| U43 | Funding | OJS OMP OPS | | pending |  |
| U44 | Identifiers (publisher IDs & URN) | OJS OMP OPS | | pending |  |
| U45 | DOIs | OJS OMP OPS | | pending |  |
| U46 | Galleys | OJS OPS | | pending |  |
| U47 | Media files | OJS OMP OPS | | pending |  |
| U48 | JATS & Body Text | OJS | | pending |  |
| U49 | Publish, schedule & versions | OJS OMP OPS | | pending |  |
| U50 | Issues | OJS | | pending |  |
| U51 | Subscriptions & open access control | OJS | | pending |  |
| U52 | Payments & APCs | OJS | | pending |  |
| U53 | Users management | OJS OMP OPS | | pending |  |
| U54 | Roles configuration | OJS OMP OPS | | pending |  |
| U55 | Notify users (bulk email) | OJS OMP OPS | | pending |  |
| U56 | Emails management | OJS OMP OPS | | pending |  |
| U57 | Languages & locales | OJS OMP OPS | | pending |  |
| U58 | Submission intake configuration | OJS OMP OPS | | pending |  |
| U59 | Hosted journals (site admin) | OJS OMP OPS | | pending |  |
| U60 | Site settings | OJS OMP OPS | | pending |  |
| U61 | System administration & jobs | OJS OMP OPS | | pending |  |
| U62 | Plugins management | OJS OMP OPS | | pending |  |
| U63 | Import & export | OJS OMP OPS | | pending |  |
| U64 | Statistics — usage | OJS OMP OPS | | pending |  |
| U65 | Statistics — editorial activity & reports | OJS OMP OPS | | pending |  |
| U66 | Institutions | OJS OMP OPS | | pending |  |
| U67 | Archiving & preservation | OJS | | pending |  |
| U68 | Catalog browse | OMP | | pending |  |
| U69 | Monograph landing page | OMP | | pending |  |
| U70 | Catalog management | OMP | | pending |  |
| U71 | Internal Review stage | OMP | | pending |  |
| U72 | Chapters & work type | OMP | | pending |  |
| U73 | Publication formats & proof terms | OMP | | pending |  |
| U74 | ONIX metadata & export | OMP | | pending |  |
| U75 | Preprint relations | OPS | | pending |  |
