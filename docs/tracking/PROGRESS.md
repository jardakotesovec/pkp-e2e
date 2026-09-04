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
`docs/process/MAINTENANCE.md`, through claude-threads, one session a day
(sync, CI triage, companions), one session at a time (MAINTENANCE.md
"Session hygiene"). Open questions last posted to the team: never yet. Upstream baselines are in
`docs/tracking/upstream-sync.md`. The CI-failure triage ledger is
`docs/tracking/ci-triage.md`; check it first on any reported failure.
The maintenance session never builds a pending row; new specs and suites
are built in feature sessions the maintainer launches, under the RUNBOOK
loop. Before 2026-08-29 the mode was REVIEW: the maintainer launched and
reviewed each step.

## Features

One row per feature, in FEATURE-MAP order. Budget is the provisional tier
(H/M/L per RUNBOOK); the maintainer adjusts it on review. Statuses: pending
/ in_progress / done / parked. A note describes the row's state today (tests
per app, register counts, review status, open blockers). History lives in
git and in `upstream-sync.md`; do not append to a note, replace it. All
shipped specs had a plain-English body rewrite on 2026-09-02; claims,
markers and evidence footnotes are unchanged. On 2026-09-04 every
shipped spec was trimmed to the GLOSSARY reader: the per-spec reading
instructions, the scenario preamble definitions and the by-hand set-up
recipes are gone (TEMPLATE, lint `shape` check); logs in
`.reports/backfill-trim/`.

| Row | Feature | Apps | Budget | Status | Note |
|---|---|---|---|---|---|
| U01 | Login & sessions | OJS OMP OPS | M | done | Spec verified. 8 tests per app (+setup); scenario 9 declared not covered in the suite headers. Register 6🐞+1❓+1✅. Maintainer review done 2026-08-25: A1–A4 and A7–A8 confirmed with fix rulings, A5 for team triage, A6 intended (pkp/pkp-lib#12162). |
| U02 | Registration & account validation | OJS OMP OPS | M | done | Spec verified. 8 tests per app (+setup; OPS scenario 3 is an absence test). Register 8🐞+2❓; headliners A6 (registering on a journal with no technical support contact while email validation is required ends in a server error and strands a disabled account, all apps) and A7 ❓ (Reader granted regardless of its self-registration flag). 1 observation in the private file, verified. Scenario 7 runs on the new validation-variant server (harness.md). App-side RegistrationPages POMs. 9 minor readability frictions open. |
| U03 | User profile | OJS OMP OPS | M | done | Spec verified. 10 tests per app (+setup; OPS scenario 6 is the absence form). Register 12🐞+6❓+2✅; headliners A3 (the site-level email-change "reject" link answers a blank server error), A10 (the site-level change-email mail signs off "Kind regards, Array"), OPS2 (the change-email template is missing from OPS Manage Emails while the mail is still sent), A17 (a Contact save the server refused loses the typed values on the next tab, unasked). 2 observations in the private file, verified. Shared ProfilePage POM. Low-confidence: Rule 3's Site Administrator wording on a one-journal site (not drivable on the fleets). 47 minor readability frictions open (38 on the claim-check fold's spans, 9 on the final Rule 2 / scenario 3 / A17 spans; none rewritten). |
| U04 | ORCID integration | OJS OMP OPS | M | done | Spec verified. 9 tests OJS, 8 OMP, 9 OPS (+setup; 2 absence tests). Register 6🐞+5❓+3✅ (A10 retired 2026-09-03, fixed upstream in all three apps); headliner A5 (Assistant false-success). ORCID legs run against the dead-port proxy with sandbox dummy credentials. |
| U05 | Notifications center & email preferences | OJS OMP OPS | M | done | Spec verified. 9 tests OJS (S9 in the serial project), 8 OMP, 8 OPS (+setup). Register 6🐞+8❓; headliners A10 ("Enable…" unticked stops the needs-editor task but not its email, all apps), OPS3 (a task row on a preprint server lands on "A workflow stage was not specified."), A6 (every Unsubscribe link is a 404 on an install whose config sets no API secret, the shipped default), A11 ❓ (automatic editor assignment on a scratch journal). Build blocker app-changes row 12 (OMP/OPS discussion save dies on a missing app-level Notification class; overlay mounted; report in docs/reports). Shared NotificationsPages POM; ProfilePage extended (U03 re-run green ×3). Low-confidence: Rule 2d/5d one-journal-site wording (F26, not drivable on the fleets). Body trimmed 16% after review (per-spec boilerplate, preamble and set-up recipes cut to GLOSSARY pointers); 26 minor readability frictions open, counted. |
| U06 | User invitations | OJS OMP OPS | M | done | Spec verified. 8 tests OJS, 8 OMP, 9 OPS (+setup). Register 8🐞+2❓ (A1 outcome in the private file). |
| U07 | Journal identity & about pages | OJS OMP OPS | M | pending | |
| U08 | Navigation menus & site chrome | OJS OMP OPS | M | pending | |
| U09 | Custom pages & blocks | OJS OMP OPS | L | pending | |
| U10 | Appearance & theming | OJS OMP OPS | M | pending | |
| U11 | Highlights | OJS OMP OPS | L | pending | |
| U12 | Announcements | OJS OMP OPS | M | pending | |
| U13 | Article landing page & reading | OJS OPS | H | pending | |
| U14 | Reader comments & moderation | OJS | M | pending | |
| U15 | Search | OJS OMP OPS | M | done | Spec verified. 9 tests OJS, 8 OMP, 8 OPS (+setup; serial project, because the index refresh is a queued job). Register 11🐞+12❓+1✅; headliners A11 (the text of galleys is never searched, all apps), A1 (a partial date filter is ignored and the selects then show a date never chosen), A12/A13 (typed-address error pages). 2 observations in the private file, verified. App-side SearchPages POMs. 5 minor readability frictions open. |
| U16 | Categories | OJS OMP OPS | M | pending | |
| U17 | Sections | OJS OMP OPS | M | pending | |
| U18 | Web feeds | OJS OMP OPS | L | pending | |
| U19 | OAI-PMH | OJS OMP OPS | M | pending | |
| U20 | Search-engine metadata & analytics | OJS OMP OPS | L | pending | |
| U21 | Submission wizard | OJS OMP OPS | H | done | Spec verified. 13 tests OJS, 14 OMP, 14 OPS (+setup). Register 10🐞+7❓+2✅; headliner A8 (silent editor auto-assignment failure on every journal but the install's first). A11 (the `9e2fbac214` regression) retired 2026-09-03: fix pkp/pkp-lib#13265 is in every app's lib/pkp and the full suites are green at the tips. |
| U22 | My Submissions (author dashboard) | OJS OMP OPS | L | done | Spec verified. 4 tests OJS, 5 OMP, 4 OPS (+setup). Register 1🐞+7❓; headliner OPS2 (OPS authors are offered draft deletion whose confirm always fails); A3 is low-confidence. 1 observation in the private file, verified. 5 minor readability frictions open. |
| U23 | Submissions dashboard (editorial) | OJS OMP OPS | H | done | Spec verified. 13 tests OJS, 13 OMP, 11 OPS (+setup). Register 3🐞+6❓; headliners A5 (sort's "off" state leaves stale sort params in the address), A8 ❓ (opt-out labelled "Weekly" for a monthly email), A7 ❓ (assistants and Section Editors never see declined/cancelled reviewer indicators). Shared EditorialDashboardPage POM. 6 minor readability frictions open. |
| U24 | Workflow screen & stage access | OJS OMP OPS | M | done | Spec verified. 8 tests OJS, 9 OMP, 6 OPS (+setup; OPS runs scenarios 1, 5–8, 10, the rest have no preprint analogue). Register 4🐞+10❓+2✅; headliners A9 (an old-shape workflow bookmark to a deleted submission is a bare "404 Not Found" on every app) and the corrected Delete rights (the Editor is offered "Delete" on OJS and OMP; U25 corrected to match). 1 observation in the private file, verified. Low-confidence: Rule 15b's per-round wording on a left review stage; the two "no email" claims (Rules 18–19) have no positive control. Shared WorkflowPage POM; ten shipped specs now link U24's anchors; U23's A9 (added and withdrawn this session) is gone. 9 minor readability frictions open. |
| U25 | Submission stage | OJS OMP OPS | M | done | Spec verified. 7 tests OJS, 8 OMP, 2 OPS absence (+setup). Register 3❓+2✅ (the A2 area has private-file items). |
| U26 | Review stage & rounds | OJS OMP | H | done | Spec verified. 12 tests OJS, 13 OMP, 1 OPS absence (+setup). Register 4🐞+9❓+1✅ (A3 observation in the private file). In step with upstream at the 2026-08-29 baselines (i13156 Review Details rework folded). |
| U27 | Reviewer assignment & management | OJS OMP | H | done | Spec verified. 14 tests OJS, 15 OMP, 1 OPS absence (+setup). Register 28 entries: 13🐞+5❓+10✅ (9 retired; A25 retired 2026-09-03, fixed upstream and re-verified live); headliner A18 (silent half-add); 3 observations in the private file. Team triage 2026-08-29: A21 risk accepted, A22 ticket to follow. The Review Details entry-path parity scenario and tests stay PARKED (maintainer ruling 2026-09-01). |
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
| U40 | Publication metadata | OJS OMP OPS | M | done | Spec verified. 11 tests OJS, 9 OMP, 9 OPS (+setup). Register 7🐞+10❓+6✅; headliner A1 (Plain Language Summary at "Require" permanently blocks saves on all apps). 1 observation in the private file, verified. |
| U41 | Contributors & affiliations | OJS OMP OPS | M | done | Spec verified. 9 tests OJS, 11 OMP, 9 OPS (+setup). Register 9🐞+9❓+4✅ (A15 retired 2026-09-03, fixed upstream by pkp-lib `922f895988`, verified live on OJS and OMP); headliner A14 (one-role journals cannot save any contributor). 1 observation in the private file, verified. The suites' order-pinning (`makeFirst`/`pinOrder`) is now plain determinism, no longer an A15 workaround. |
| U42 | Citations & references | OJS OMP OPS | M | pending | |
| U43 | Funding | OJS OMP OPS | L | done | Spec verified. 5 tests per app (+setup). Register 3🐞+9❓+2✅ (A13 retired 2026-09-03, fixed upstream in all three apps); headliner A3 (a registry-picked funder saves nameless when the server cannot reach ROR); A10/A11 low-confidence, need a server with egress. A4 stands, not re-probed at the fixed tips (the OMP/OPS suites save without asserting the table). |
| U44 | Identifiers (publisher IDs & URN) | OJS OMP OPS | M | pending | |
| U45 | DOIs | OJS OMP OPS | H | pending | |
| U46 | Galleys | OJS OPS | M | pending | |
| U47 | Media files | OJS OMP OPS | L | pending | |
| U48 | JATS & Body Text | OJS | M | pending | |
| U49 | Publish, schedule & versions | OJS OMP OPS | H | done | Spec verified. 13 tests OJS, 11 OMP, 12 OPS (+setup). Register 7🐞+9❓; headliner OJS2 ("Schedule Only" is not honored on a journal with no published issues; app-changes row 10). S11 OJS uses the content-verified save idiom (ci-triage flake watch). |
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

## Open harness work

_Harness changes agreed with the maintainer and not yet built. One line
each; delete when done._

- **Scratch-context passthrough keys, built as features need them**
  (maintainer, 2026-09-04, replacing the 2026-09-02 "enrich the bootstrap
  seed" item): `publicknowledge` stays at the install defaults, so nothing
  shipped is re-checked. Each feature that needs a setting at its
  non-default end seeds it through `POST scenarios/context`; the first
  feature to need a key family builds it with its parity row (scenarios.md
  "Configuring a scratch context"; TEMPLATE settings coverage rule). Two
  backlogs wait on families pending features will build: U27, U26 and U25's
  review setup (U28 or U29), and U21's intake settings (U58); they sit in
  `docs/tracking/backfill.md`. When the first reader-facing feature comes
  up (article landing page, issues, catalog browse), seed an enriched
  second journal in the bootstrap fixture rather than touching
  `publicknowledge`.

## Model-fallback log

_Anomalies only — refusals, safeguard flags, downgrades, pauses (date ·
feature · role · what happened); appended by hand (RUNBOOK Model discipline).
Routine agents are not logged._

(none)
