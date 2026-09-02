# Progress — live state

This file is pure state. Row notes are short (one to three lines) and may
carry register highlights: 🐞 and ❓ counts, the headline finding, anything
low-confidence. Finding detail lives in each spec's Findings register, never
here. Read this file together with `docs/process/RUNBOOK.md` (the loop). Spec
style is in `TEMPLATE.md`, test rules in `PRINCIPLES.md`.

**Where the build stands.** The harness was rebuilt clean-room on 2026-07-31
(the earlier build survives in git history on branch `e2e_ng`; nothing from
it is read back). Since then features are built one per session under the
RUNBOOK loop, picked by the maintainer. Since 2026-08-26 the fleets are the
self-contained `checkouts/<app>` clones of pkp `main` (`npm run fetch-apps`,
harness.md "The fleets"). Everything campaign-related is merged upstream, so
the latest app code is fetched from the pkp remotes and never pushed or
branched there.

**The standing rules.** Fable runs every role, with no per-role model split
and no fallback. A safeguard flag, refusal or downgrade pauses the feature
for maintainer review (RUNBOOK "Model discipline"). Potential security
concerns go to the private `../e2e_ng/security.md` and never into a public
artifact; the fact of routing is always stated, the content never (RUNBOOK
"What goes where"). The lint gate checks reference integrity only; wording
is the writer's judgment.

**Mode: MAINTENANCE** (since 2026-08-29). The resident QA agent runs per
`docs/process/MAINTENANCE.md`, through claude-threads, one session at a time
(MAINTENANCE.md "Session hygiene"). Upstream baselines are in
`docs/tracking/upstream-sync.md`. The CI-failure triage ledger is
`docs/tracking/ci-triage.md`; check it first on any reported failure.
Feature work launched in this mode still follows the RUNBOOK loop. Before
2026-08-29 the mode was REVIEW: the maintainer launched and reviewed each
step.

## Features

One row per feature, in FEATURE-MAP order. Budget is the provisional tier
(H/M/L per RUNBOOK); the maintainer adjusts it on review. Statuses: pending
/ in_progress / done / parked. A note describes the row's state today (tests
per app, register counts, review status, open blockers). History lives in
git and in `upstream-sync.md`; do not append to a note, replace it. All
shipped specs had a plain-English body rewrite on 2026-09-02; claims,
markers and evidence footnotes are unchanged.

| Row | Feature | Apps | Budget | Status | Note |
|---|---|---|---|---|---|
| U01 | Login & sessions | OJS OMP OPS | M | done | Spec verified. 8 tests per app (+setup); scenario 9 declared not covered in the suite headers. Register 6🐞+1❓+1✅. Maintainer review done 2026-08-25: A1–A4 and A7–A8 confirmed with fix rulings, A5 for team triage, A6 intended (pkp/pkp-lib#12162). |
| U02 | Registration & account validation | OJS OMP OPS | M | pending | |
| U03 | User profile | OJS OMP OPS | M | pending | |
| U04 | ORCID integration | OJS OMP OPS | M | done | Spec verified. 9 tests OJS, 8 OMP, 9 OPS (+setup; 2 absence tests). Register 7🐞+5❓+2✅; headliners A5 (Assistant false-success) and A1 (silent close / over-offer). A10 (RevokeOrcidToken 500) fixed upstream in pkp-lib `ecd12271ed` and verified green on OJS; OMP/OPS stay red until their pkp-lib pointer advances (ci-triage U04-A10). ORCID legs run against the dead-port proxy with sandbox dummy credentials; no real ORCID traffic is possible. Maintainer review pending. |
| U05 | Notifications center & email preferences | OJS OMP OPS | M | pending | |
| U06 | User invitations | OJS OMP OPS | M | done | Spec verified. 8 tests OJS, 8 OMP, 9 OPS (+setup). Register 8🐞+2❓ (A1 outcome in the private file). Maintainer review pending. |
| U07 | Journal identity & about pages | OJS OMP OPS | M | pending | |
| U08 | Navigation menus & site chrome | OJS OMP OPS | M | pending | |
| U09 | Custom pages & blocks | OJS OMP OPS | L | pending | |
| U10 | Appearance & theming | OJS OMP OPS | M | pending | |
| U11 | Highlights | OJS OMP OPS | L | pending | |
| U12 | Announcements | OJS OMP OPS | M | pending | |
| U13 | Article landing page & reading | OJS OPS | H | pending | |
| U14 | Reader comments & moderation | OJS | M | pending | |
| U15 | Search | OJS OMP OPS | M | pending | |
| U16 | Categories | OJS OMP OPS | M | pending | |
| U17 | Sections | OJS OMP OPS | M | pending | |
| U18 | Web feeds | OJS OMP OPS | L | pending | |
| U19 | OAI-PMH | OJS OMP OPS | M | pending | |
| U20 | Search-engine metadata & analytics | OJS OMP OPS | L | pending | |
| U21 | Submission wizard | OJS OMP OPS | H | done | Spec verified. 13 tests OJS, 14 OMP, 14 OPS (+setup). Register 10🐞+7❓+2✅; headliners A8 (silent editor auto-assignment failure on every journal but the install's first), OPS3 (silent author-cancel refusal), A11 (regression, pkp-lib `9e2fbac214`: an affiliation-less Author cannot start a submission, wizard start 500s, reds ~100 OJS tests at seeding; fix in pkp-lib PR #13265 e2e-verified, ci-triage U21-A11). A9 ❓ carries an unprobed Site Administrator half. 2 readability frictions open. Maintainer review pending. |
| U22 | My Submissions (author dashboard) | OJS OMP OPS | L | done | Spec verified. 4 tests OJS, 5 OMP, 4 OPS (+setup). Register 1🐞+7❓; headliner OPS2 (OPS authors are offered draft deletion whose confirm always fails); A3 is low-confidence. 1 observation in the private file, verified. 5 minor readability frictions open. Maintainer review pending. |
| U23 | Submissions dashboard (editorial) | OJS OMP OPS | H | done | Spec verified. 13 tests OJS, 13 OMP, 11 OPS (+setup). Register 3🐞+6❓; headliners A5 (sort's "off" state leaves stale sort params in the address), A8 ❓ (opt-out labelled "Weekly" for a monthly email), A7 ❓ (assistants and Section Editors never see declined/cancelled reviewer indicators). Shared EditorialDashboardPage POM. 6 minor readability frictions open. Maintainer review pending. |
| U24 | Workflow screen & stage access | OJS OMP OPS | M | pending | |
| U25 | Submission stage | OJS OMP OPS | M | done | Spec verified. 7 tests OJS, 8 OMP, 2 OPS absence (+setup). Register 3❓+2✅ (the A2 area has private-file items). Maintainer review pending. |
| U26 | Review stage & rounds | OJS OMP | H | done | Spec verified. 12 tests OJS, 13 OMP, 1 OPS absence (+setup). Register 4🐞+9❓+1✅ (A3 observation in the private file). In step with upstream at the 2026-08-29 baselines (i13156 Review Details rework folded). Maintainer review pending. |
| U27 | Reviewer assignment & management | OJS OMP | H | done | Spec verified. 14 tests OJS, 15 OMP, 1 OPS absence (+setup). Register 28 entries: 14🐞+5❓+9✅, 8 of them retired; headliner A18 (silent half-add); 3 observations in the private file. Maintainer triage 2026-08-29: A21 risk accepted, A22 ticket to follow. A25 (dashboard popover's Review Details omits the recommendation, OJS): its scenario and tests are PARKED pending the upstream fix (maintainer request 2026-08-31). Maintainer review pending otherwise. |
| U28 | Reviewer's review | OJS OMP | H | pending | |
| U29 | Review setup & review forms | OJS OMP | M | pending | |
| U30 | Author response to reviews | OJS | M | pending | |
| U31 | Reviewer suggestions | OJS OMP | L | pending | |
| U32 | Copyediting stage | OJS OMP | M | pending | |
| U33 | Production stage | OJS OMP OPS | M | pending | |
| U34 | Editorial decision recording | OJS OMP OPS | H | pending | |
| U35 | Stage participants | OJS OMP OPS | M | pending | |
| U36 | Submission files | OJS OMP OPS | H | pending | |
| U37 | Tasks & discussions | OJS OMP OPS | H | pending | |
| U38 | Submission activity log & notes | OJS OMP OPS | L | pending | |
| U39 | Submission & Publisher Libraries | OJS OMP OPS | L | pending | |
| U40 | Publication metadata | OJS OMP OPS | M | done | Spec verified. 11 tests OJS, 9 OMP, 9 OPS (+setup). Register 7🐞+10❓+6✅; headliners A1 (Plain Language Summary at "Require" permanently blocks Metadata/Permissions/entry-page saves on all apps while OMP publishes and OPS posts without a summary), A2 (reset tool stamps Copyright Year 1970 on unpublished and declined items), A15 (change-language panel acts before its loads settle; app-changes rows 6–8), A11 ❓ ("(Author)" carried into the reader's copyright line). 1 observation in the private file, verified. 3 readability frictions open. Maintainer review pending. |
| U41 | Contributors & affiliations | OJS OMP OPS | M | done | Spec verified. 9 tests OJS, 11 OMP, 9 OPS (+setup). Register 10🐞+9❓+3✅; headliners A15 (a new contributor ties the auto-created author at sequence 0, so order varies between loads), A14 (one-role journals cannot save any contributor, yet each attempt creates a role-less row), A5 (a registry pick on an egress-blocked server saves and publishes nameless), A2 ❓ (deleting the primary contact silently leaves none). Contributors-panel async-refresh remount worked around (app-changes row 9). 1 observation in the private file, verified. ~6 minor readability frictions open. Maintainer review pending. |
| U42 | Citations & references | OJS OMP OPS | M | pending | |
| U43 | Funding | OJS OMP OPS | L | done | Spec verified. 5 tests per app (+setup). Register 4🐞+9❓+1✅; headliner A3 (a registry-picked funder saves permanently nameless when the server cannot reach ROR; reaches the reader page); A1 ❓ ("Require" warns without blocking); A10/A11 low-confidence, need a server with egress. A13 (regression #13003, saved funders never render in the workflow table) fixed upstream and verified on OJS; OMP/OPS red until their ui-library pointer advances (ci-triage U43-A13). 5 readability frictions open. Maintainer review pending. |
| U44 | Identifiers (publisher IDs & URN) | OJS OMP OPS | M | pending | |
| U45 | DOIs | OJS OMP OPS | H | pending | |
| U46 | Galleys | OJS OPS | M | pending | |
| U47 | Media files | OJS OMP OPS | L | pending | |
| U48 | JATS & Body Text | OJS | M | pending | |
| U49 | Publish, schedule & versions | OJS OMP OPS | H | done | Spec verified. 13 tests OJS, 11 OMP, 12 OPS (+setup). Register 7🐞+9❓; headliners OJS2 ("Schedule Only" is not honored on a journal with no published issues; app-changes row 10), OPS4 (the first-post acknowledgement never sends), A5 (the promised amendment notice renders on no reader page), A6 (creating an unpublished version rewrites the live reader date line), OJS3 (mistyped version address gives a blank 500). S11 OJS uses the content-verified save idiom (ci-triage flake watch), green 2026-09-01. ~8 minor readability frictions open. Maintainer review pending. |
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

## Model-fallback log

_Anomalies only — refusals, safeguard flags, downgrades, pauses (date ·
feature · role · what happened); appended by hand (RUNBOOK Model discipline).
Routine agents are not logged._

(none)
