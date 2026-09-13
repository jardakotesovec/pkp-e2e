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
reported failure. Suite size (RUNBOOK "Budget"; last full `test:final`,
2026-09-11, on the 4-core VM at `PLAYWRIGHT_WORKERS=4`, CI's setting): OJS
209 tests · 10.6 min · OMP 207 · 10.4 min · OPS 144 · 6.1 min (the OJS
serial project did not run behind a flake in the main project).

## Features

Rows in FEATURE-MAP order. Scenarios is the spec's canonical scenario
count once it has them (RUNBOOK "Budget"); status is pending /
in_progress / done / parked.

| Row | Feature | Apps | Scenarios | Status | Note |
|---|---|---|---|---|---|
| U01 | Login & sessions | OJS OMP OPS | 8 | done | 8 OJS · 8 OMP · 8 OPS (+setup; OPS S6 absence). 6🐞+2❓+1✅ (A9 added 2026-09-13). Headliner A9. Budget cuts: 0 states, 0 variants; No seed: a disabled account, Confirm Access (`password_timeout` is run-global), a second site administrator, a forced change on an account signed in elsewhere, the config-file session and reset lifetimes, the password policy and rate limiting. Revised 2026-09-13 (classed table): 0 scenarios added, scenario 9 retired to No seed, all 8 reshaped to the TEMPLATE shape, 6 grew (S1 ×6, S2, S4 ×5, S5, S7 ×4, S8); T-ojs-1/T-omp-1/T-ops-1 folded as A9 ❓ (the last-login date is recorded but no users-management screen shows it; Side effects corrected, S1 reads the Users & Roles row). Verified at the 2026-09-11 baselines, all three full suites green on the first run. Low-confidence: the impersonation activity-log line (Side effects) is Owned by *Submission activity log & notes* with no scenario there yet. |
| U02 | Registration & account validation | OJS OMP OPS | 8 | done | 8 tests per app (+setup; OPS S3 absence). 8🐞+2❓. Headliner A6. 1 in the private file, verified. Budget cuts: 0 states, 0 variants; No seed: every journal closed, a restricted journal (`restrictSiteAccess` passthrough), the site's own statement, `sitewide_privacy_statement`, the Reviewer role and the site-level boxes closed to self-registration (a per-role self-registration passthrough), the 3-day link expiry, the monthly cleanup, reCAPTCHA, the site password policy. Revised 2026-09-13 (classed table): 0 scenarios added, all 8 reshaped to the TEMPLATE shape and a Coverage section added, 5 grew (S1 ×4: the notification box unticked and the Notifications tab, no welcome email, the Login form's link continuing to the interrupted address, the French page's name copied to the primary language; S5 ×2: a disabled journal seeded with `context.enabled: false`, the manager's completion page at the closed and disabled addresses; S6: nothing ticked on the site level; S7 ×4: ALTCHA without JavaScript, the unvalidated account claiming its username, the button's address reopened, a site-level registration with "an account with , but…" and the site's journal list; S8: "View Submissions" opening "Assigned to me"); Rule 13 and S7 name the Login page each sign-in uses, S8's first user is an Author (persona read); OPS titles renamed to S<n>; no test findings. Verified at the 2026-09-11 baselines: OJS and OPS finals green on the first run; OMP on the second, the first red on U26 S1 and U40 S4 only (ci-triage flake-watch class, every U02 test green in both). |
| U03 | User profile | OJS OMP OPS | 12 | in_progress | 12 tests per app (+setup; OPS S6 absence form). 12🐞+6❓+2✅. Headliner A3. 2 in the private file, verified. Revision 2026-09-13 (classed table) PAUSED at the final-run gate: scenarios, readability, all three author suites green once, the step 8 fold and the OPS final (green on the second run, the first red on U01 S8 only, ci-triage line dated) are done; the OJS final failed five times on machine faults, never on a U03 test (a memory kill after 164 green, U49 S13 on a browser transport error, U28 S14 on the reviewer-list-under-load class, an output folder vanishing mid-run, a memory kill at start; load 20–40 on 10 cores from other processes; every U03 test green in the three completed runs, 12 tests summing to 208–220 s); the OMP final has not run. Resume: `test:final --apps ojs` then `--apps omp` on a quiet machine, then step 9 with the note drafted in `.reports/U03/phase-status.md`. Low-confidence: Rule 3 (one-journal site, not drivable on the fleets). |
| U04 | ORCID integration | OJS OMP OPS | 9 | done | 9 OJS · 8 OMP · 9 OPS (+setup; 2 absence tests). 6🐞+5❓+3✅ (A10 retired 2026-09-03, fixed upstream in all three apps). Headliner A5. ORCID legs run against the dead-port proxy with sandbox dummy credentials. |
| U05 | Notifications center & email preferences | OJS OMP OPS | 9 | done | 9 OJS (S9 serial) · 8 OMP · 8 OPS (+setup). 6🐞+8❓. Headliner A10. Blocker: app-changes row 12 (overlay mounted). Low-confidence: Rules 2d/5d (F26, not drivable on the fleets). |
| U06 | User invitations | OJS OMP OPS | 9 | done | 8 OJS · 8 OMP · 9 OPS (+setup). 8🐞+2❓. 1 in the private file. |
| U07 | Journal identity & about pages | OJS OMP OPS |  | pending | |
| U08 | Navigation menus & site chrome | OJS OMP OPS |  | pending | |
| U09 | Custom pages & blocks | OJS OMP OPS |  | pending | |
| U10 | Appearance & theming | OJS OMP OPS |  | pending | |
| U11 | Highlights | OJS OMP OPS |  | pending | |
| U12 | Announcements | OJS OMP OPS |  | pending | |
| U13 | Article landing page & reading | OJS OPS |  | pending | |
| U14 | Reader comments & moderation | OJS |  | pending | |
| U15 | Search | OJS OMP OPS | 11 | done | 9 OJS · 8 OMP · 8 OPS (+setup; serial project). 11🐞+12❓+1✅. Headliner A11. 2 in the private file, verified. |
| U16 | Categories | OJS OMP OPS |  | pending | |
| U17 | Sections | OJS OMP OPS |  | pending | |
| U18 | Web feeds | OJS OMP OPS |  | pending | |
| U19 | OAI-PMH | OJS OMP OPS |  | pending | |
| U20 | Search-engine metadata & analytics | OJS OMP OPS |  | pending | |
| U21 | Submission wizard | OJS OMP OPS | 17 | done | 15 OJS · 16 OMP · 17 OPS (+setup). 11🐞+7❓+3✅. Headliner A8. Budget cuts: 2 states, 3 variants; No seed: task templates, OPS DOIs, the site privacy statement, the start guidance and checklist, the category picker, the reader-site block, a press requiring an abstract, a manager's email opt-out. Revised 2026-09-12 (Budget items as rows): 0 scenarios added, 6 grew by 9 bullets (S2, S4, S5×3, S6, S12, S17×2); S12's Given names the manager's two drafts and both suites now assert the deactivated-section half (T-ojs-1, T-ops-1 settled). Verified at the 2026-09-11 baselines, all three full suites green (the first OPS final, run alongside the OJS final, red on U21 S3 only, a rich-text fill lost under load, green alone; ci-triage flake watch). |
| U22 | My Submissions (author dashboard) | OJS OMP OPS | 4 | done | 4 OJS · 5 OMP · 4 OPS (+setup). 1🐞+7❓. Headliner OPS2. 1 in the private file, verified. Low-confidence: A3. |
| U23 | Submissions dashboard (editorial) | OJS OMP OPS | 17 | done | 15 OJS · 15 OMP · 12 OPS (+setup). 3🐞+6❓. Headliner A5. Budget cuts: 0 states, 0 variants; No seed: overdue reviews, author revisions, recommendations, the Categories filter, the monthly email. Revised 2026-09-12 (Budget items as rows): 1 scenario added (S17, the confirmed review with and without a minimum), 7 grew (S1, S5, S7, S9, S10, S11, S12); S11 now declines and deletes on screen inside the panel (T-ops-1 folded into fn-s11). Verified at the 2026-09-11 baselines, all three full suites green on the first run. Low-confidence: S17 leaves "Needs reviews" at the default setting unasserted (a footnote-only fact). |
| U24 | Workflow screen & stage access | OJS OMP OPS | 10 | done | 8 OJS · 9 OMP · 6 OPS (+setup; OPS runs S1, S5–S8, S10). 4🐞+10❓+2✅. Headliner A9. 1 in the private file, verified. Low-confidence: Rule 15b; Rules 18–19 (no positive control). |
| U25 | Submission stage | OJS OMP OPS | 9 | done | 7 OJS · 8 OMP · 2 OPS absence (+setup). 3❓+2✅. The A2 area has items in the private file. |
| U26 | Review stage & rounds | OJS OMP | 15 | done | 13 OJS · 14 OMP · 1 OPS absence (+setup). 4🐞+10❓+1✅. 1 in the private file. Budget cuts: 5 states, 0 variants (with reasons); No seed: an overdue review (no seed backdates a deadline). Revised 2026-09-12 (coverage rule): 0 scenarios added, 6 grew. Revised 2026-09-13 (Budget items as rows): 1 scenario added (S15, the review minimum at 2: the minimum line replaces the confirmed sentence alone and the submitted sentence stays beneath it, folded from T-ojs-1/T-omp-1 into the Settings bullet and footnote r), 3 grew (S8, S9, S11). Verified at the 2026-09-11 baselines: OJS and OPS finals green first run; the OMP final green on every U26 test in four runs, the accepted run red on U43 S4 only (a click timing out under load, green alone), the first on U40 S4 (ci-triage flake watch), two in between on the CEST-vs-UTC date gap (friction.md). Low-confidence: the cancelled round's files (Rule 12), owned by *Submission files* with no scenario there yet. |
| U27 | Reviewer assignment & management | OJS OMP | 20 | done | 18 OJS · 19 OMP · 1 OPS absence (+setup). 15🐞+7❓+10✅ (9 retired; A26, OMP3, A27 added 2026-09-12; A28 added 2026-09-13). Headliner A18. 3 in the private file. Budget cuts: 8 states, 3 variants (with reasons); No seed: automatic reminders, reviewer files, the OJS "Mark as Complete" gate, a section's default review form, the competing-interests badge, a second reviewer group, "Show All {N} Authors", the same-institution badge. Revised 2026-09-12 (coverage rule): 3 scenarios added, 11 grew; S2's own-row read is owned by *Workflow screen & stage access* (A4 there). Revised 2026-09-13 (Budget items as rows): 1 scenario added (S20, the journal's review setup presetting the request), 6 grew (S1, S2, S5, S7, S9, S16); Rule 5's "{N} active" badge corrected to conditional (T-ojs-5, T-omp-2) and A28 ❓ from T-omp-1 (a never-assigned reviewer drops out of the search while "Reviews completed" is enabled; S2 clears the filter first). Verified at the 2026-09-11 baselines, all three full suites green (the first OPS final red on U40 S3 only, a browser transport error mid rich-text fill, green on the re-run; every U27 test green in both). PARKED: the Review Details entry-path parity scenario and its tests (maintainer, 2026-09-01). |
| U28 | Reviewer's review | OJS OMP | 18 | done | 16 OJS · 16 OMP · 1 OPS absence (+setup). 12🐞+3❓+1✅ (A8, OMP4 retired). Headliner A7. Budget cuts: 1 state, 1 variant; No seed: reviewer files in an earlier round's window, the OJS journal's own recommendations. Revised 2026-09-12 (coverage rule): 1 scenario added (S18), 15 grew. Verified at the 2026-09-11 baselines, all three full suites green (the first OJS final red on U30 S3 only, "Submit Response" disabled under load, green alone; every U28 test green in both). fn-p dated on pkp-lib#13109 (the "Done" stage in the OPS Roles screen). Low-confidence: A13. |
| U29 | Review setup & review forms | OJS OMP | 11 | done | 10 OJS · 9 OMP · 1 OPS absence (+setup). 4🐞+6❓+2✅. Headliner A9. 1 in the private file. Coverage: settings rows only. Low-confidence: A6, A7. |
| U30 | Author response to reviews | OJS | 8 | done | 7 OJS · 1 OMP absence · 1 OPS absence (+setup). 6🐞+3❓. Headliner A7. Budget cuts: 0 states, 0 variants; No seed: "Notify All Authors" at its default and off. Revised 2026-09-13 (Budget items as rows): 1 scenario added (S8, a past round's response beside an empty new round), 4 grew (S1 the declined request, S4 the decision email's button on the journal, S5 the open review's name in the email, S6 the request to two assigned authors); Rule 14 and S6 now name the round id as the address-bar identifier. Verified at the 2026-09-11 baselines, all three full suites green on the first run. Low-confidence: A8 (not seedable). |
| U31 | Reviewer suggestions | OJS OMP | 6 | done | 4 OJS · 5 OMP · 1 OPS absence (+setup). 8🐞+4❓. Headliner A5. 1 in the private file, verified. Budget cuts: 0 states, 0 variants; No seed: the setting switched off after suggestions exist, then on again (Rule 8d; no key changes a journal's setting once it exists). Revised 2026-09-13 (Budget items as rows): 0 scenarios added, 3 grew by 8 bullets (S1 the Edit window closed unsaved, the Journal Manager on the draft, "Submit" with no suggestion, the control reading the panel and the list on the setting-off journal; S2 the Add Reviewer window closed after typing, "Create New Reviewer" with "Email" changed, a submission moved on to Copyediting; S3 the inner window cancelled with a username typed); from the persona read, Rule 8b and Rule 10 name "{name} More Actions" to screen readers and the assigned notice under "Locate a Reviewer", each scenario's address and username its own (fn-s). Verified at the 2026-09-11 baselines, all three full suites green (OJS and OPS first run; OMP on the second, the first red on U26 S10 and U40 S3 only, ci-triage flake-watch class, every U31 test green in both). Low-confidence: A5 (the Enroll path not driven). |
| U32 | Copyediting stage | OJS OMP |  | pending | |
| U33 | Production stage | OJS OMP OPS |  | pending | |
| U34 | Editorial decision recording | OJS OMP OPS |  | pending | |
| U35 | Stage participants | OJS OMP OPS |  | pending | |
| U36 | Submission files | OJS OMP OPS |  | pending | pkp-lib#12352 (2026-09-04) broke the upload wizard's step-1 Cancel restore when another user had renamed the file; reported to the team 2026-09-07 (upstream-sync log); re-filed upstream as pkp-lib#13286, fix PR #13288 verified at its head 2026-09-08. |
| U37 | Tasks & discussions | OJS OMP OPS |  | pending | |
| U38 | Submission activity log & notes | OJS OMP OPS |  | pending | |
| U39 | Submission & Publisher Libraries | OJS OMP OPS |  | pending | |
| U40 | Publication metadata | OJS OMP OPS | 11 | done | 9 OJS · 9 OMP · 9 OPS (+setup; OJS S3b/S6b folded into S3/S6 2026-09-09). 7🐞+11❓+7✅. Headliner A1. 1 in the private file, verified. Sync 2026-09-09 (pkp-lib#13109): Rules 2/9 per version, A4 retired, A16 🐞 (the issue's own case refused on a fresh install: no role holds the Done stage), A17 ❓. |
| U41 | Contributors & affiliations | OJS OMP OPS | 8 | done | 9 OJS · 11 OMP · 9 OPS (+setup). 9🐞+9❓+4✅ (A15 retired 2026-09-03). Headliner A14. 1 in the private file, verified. |
| U42 | Citations & references | OJS OMP OPS |  | pending | |
| U43 | Funding | OJS OMP OPS | 4 | done | 5 tests per app (+setup). 3🐞+9❓+2✅ (A13 retired 2026-09-03). Headliner A3. Low-confidence: A4 (not re-probed at the fixed tips), A10, A11 (need a server with egress). |
| U44 | Identifiers (publisher IDs & URN) | OJS OMP OPS |  | pending | |
| U45 | DOIs | OJS OMP OPS |  | pending | |
| U46 | Galleys | OJS OPS |  | pending | |
| U47 | Media files | OJS OMP OPS |  | pending | |
| U48 | JATS & Body Text | OJS |  | pending | |
| U49 | Publish, schedule & versions | OJS OMP OPS | 16 | done | 13 OJS · 11 OMP · 12 OPS (+setup). 7🐞+9❓. Headliner OJS2. Blocker: app-changes row 10; S11 OJS is on the ci-triage flake watch. |
| U50 | Issues | OJS |  | pending | |
| U51 | Subscriptions & open access control | OJS |  | pending | |
| U52 | Payments & APCs | OJS |  | pending | |
| U53 | Users management | OJS OMP OPS |  | pending | |
| U54 | Roles configuration | OJS OMP OPS |  | pending | |
| U55 | Notify users (bulk email) | OJS OMP OPS |  | pending | |
| U56 | Emails management | OJS OMP OPS |  | pending | |
| U57 | Languages & locales | OJS OMP OPS |  | pending | |
| U58 | Submission intake configuration | OJS OMP OPS |  | pending | |
| U59 | Hosted journals (site admin) | OJS OMP OPS |  | pending | |
| U60 | Site settings | OJS OMP OPS |  | pending | |
| U61 | System administration & jobs | OJS OMP OPS |  | pending | |
| U62 | Plugins management | OJS OMP OPS |  | pending | |
| U63 | Import & export | OJS OMP OPS |  | pending | |
| U64 | Statistics — usage | OJS OMP OPS |  | pending | |
| U65 | Statistics — editorial activity & reports | OJS OMP OPS |  | pending | |
| U66 | Institutions | OJS OMP OPS |  | pending | |
| U67 | Archiving & preservation | OJS |  | pending | |
| U68 | Catalog browse | OMP |  | pending | |
| U69 | Monograph landing page | OMP |  | pending | |
| U70 | Catalog management | OMP |  | pending | |
