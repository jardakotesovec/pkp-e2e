# Progress — live state

**Pure state.** Row notes are SHORT (1–3 lines) and may carry register
highlights (🐞/❓ counts, the headline finding, low-confidence flags); finding
DETAIL lives in each spec's Findings register, never here. Read together with
`RUNBOOK.md` (the loop); style rules in `TEMPLATE.md`; test rules in
`docs/process/PRINCIPLES.md`.

**This run**: branch `e2e_ng_2`, started 2026-07-31 as a clean-room rebuild
(FULL RESET #2 — the previous build survives on branch `e2e_ng` and in git
history; **never read the scratched artifacts back** — regenerating on this
run's own evidence is the point). The harness rebuild (the restart's first step) passed
PRINCIPLES' Rebuild-acceptance on all three fleets 2026-07-31; since then,
features run one per session under the RUNBOOK loop, maintainer-picked.
Since 2026-08-26 the fleets are the self-contained `checkouts/<app>` clones
of pkp `main` (`npm run fetch-apps` — harness.md "The fleets"; everything
campaign-related is merged upstream, so latest code is fetched from the pkp
remotes and never pushed or branched there).

**The process contract**: Fable runs every role — no per-role model split, no
fallback; a safeguard flag/refusal/downgrade PAUSES the feature for
maintainer review (RUNBOOK "Model discipline"). Potential security concerns
go to the private `../e2e_ng/security.md`, never to a public artifact —
writes there are read-first and deduped per the RUNBOOK hygiene rules; the
fact of routing is always stated, the content never (RUNBOOK "What goes
where"). The lint gate checks reference integrity only; wording is the
writer's judgment. The critical goal: accurate QA/PO-readable specs plus
strong-coverage per-app tests derived from them — every rule bends to that.

**Mode: MAINTENANCE** (maintainer ruling, 2026-08-29) — the resident QA
agent per `docs/process/MAINTENANCE.md`, operated via claude-threads,
**one session at a time** for now (single-session ruling, MAINTENANCE.md
"Session hygiene"). Upstream baselines: `docs/tracking/upstream-sync.md`;
CI-failure triage ledger: `docs/tracking/ci-triage.md` (check it FIRST on
any reported failure). Feature work launched under this mode still follows
the RUNBOOK loop. (Prior mode REVIEW/PILOT, 2026-07-31→2026-08-29: the
maintainer launched and reviewed each step.)

## Features

Seeded from `FEATURE-MAP.md` (Phase 0, 2026-07-27) — one row per feature,
order = FEATURE-MAP order. Budget = provisional tier (H/M/L per RUNBOOK);
maintainer adjusts on review. Statuses: pending / in_progress / done / parked.

| Row | Feature | Apps | Budget | Status | Note |
|---|---|---|---|---|---|
| U01 | Login & sessions | OJS OMP OPS | M | done | Spec verified; 8+setup tests per app, green ×2 + post-fold confirm; several observations in private file; **maintainer review DONE 2026-08-25** — register fully triaged (now 6🐞+1❓+1✅ incl. new A8): A1–A4, A7–A8 confirmed with fix rulings, A5 to triage with the team, A6 ✅ intended (pkp/pkp-lib#12162); 2026-08-25 upstream-rebase check: impersonation side-effect updated (#13059 — event log names both users), tests unaffected |
| U02 | Registration & account validation | OJS OMP OPS | M | pending | |
| U03 | User profile | OJS OMP OPS | M | pending | |
| U04 | ORCID integration | OJS OMP OPS | M | done | Re-enabled 2026-08-26 (maintainer): the 2026-08-20 pause resolved — dead-port proxy + sandbox-only dummy credentials ruled sufficient (no real ORCID traffic is possible; S2's popup asserts the sandbox URL without driving it; a drained RevokeOrcidToken job was observed failing fast at 127.0.0.1:9 in-run); all three fleets green post-re-enable (OJS 7+2, OMP 6+2, OPS 8+1). Spec verified; 9 tests OJS, 8 OMP, 9 OPS incl. 2 absence (+setup each), green ×2 + post-fold confirm; register 6🐞+5❓+2✅ (A5 Assistant false-success + A1 silent-close/over-offer are the headliners); claim check 40 claims 0 wrong; OAuth/deposit legs code-anchored (dead-port proxy + dummy ORCID sandbox credentials); skill rule-7 job_runner note fixed (self-healing); 2026-08-25 upstream-rebase check: A7 resolved upstream for OJS/OMP (pkp/pkp-lib#13050), noted in register; maintainer review pending; **2026-08-29 upstream-rebase check (main tips)**: S5 red on all three apps = new A10 🐞 (upstream #13003 — RevokeOrcidToken serializes a lazy-hydrated Author; reported to the team 2026-08-28/29); serial U04 tests skip while the app project is red; the red stands until the fix lands |
| U05 | Notifications center & email preferences | OJS OMP OPS | M | pending | |
| U06 | User invitations | OJS OMP OPS | M | done | Spec verified; 8+setup tests OJS/OMP, 9+setup OPS, green ×2 each; register 8🐞+2❓ (A1 outcome in private file); maintainer review pending |
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
| U21 | Submission wizard | OJS OMP OPS | H | done | Spec verified; 13 tests OJS, 14 OMP, 14 OPS (+setup each), green ×2 + post-fold confirm; register 9🐞+7❓+2✅ (headliners: A8 silent editor-auto-assignment failure on every journal but the install's first, OPS3 silent author-cancel refusal; A9 ❓ silent Author enrolment carries an unprobed Site-Administrator half for maintainer ruling); AFFW-068 waived dead-in-context (UNASSIGNED #7); builder passthroughs + workType overlay in parity ledger; nothing routed to the private security file; 2 readability frictions left open (Rule 13 registry-identifier recognizer, scenario 4's cross-spec address dependency); maintainer review pending |
| U22 | My Submissions (author dashboard) | OJS OMP OPS | L | done | Spec verified; 4 tests OJS, 5 OMP, 4 OPS (+setup each), green ×2 + post-fold confirm ×2; register 1🐞+7❓ (headliner OPS2: OPS authors offered draft deletion whose confirm always fails; A3 is the low-confidence entry — "Scheduled for publication" has no screen feeder on OMP/OPS); 1 observation routed to the private security file and verified; 5 minor readability frictions left open (report); maintainer review pending |
| U23 | Submissions dashboard (editorial) | OJS OMP OPS | H | done | Spec verified; 13 tests OJS, 13 OMP, 11 OPS (+setup each), green ×2 + post-fold confirm; register 3🐞+6❓ (headliners: A5 sort's "off" state leaves stale sort params in the address, A8 ❓ outstanding-tasks opt-out labelled "Weekly" for a monthly email, A7 ❓ assistants/SEs never shown declined/cancelled reviewer indicators); claim check 96 claims, 1 wrong (one word); shared EditorialDashboardPage POM (thin OPS subclass); self-healing: scenarios.md reviewer-params doc fix, patterns.md search-semantics fix, U22 fn-d pin note; nothing routed to the private security file; 6 minor readability frictions left open; maintainer review pending |
| U24 | Workflow screen & stage access | OJS OMP OPS | M | pending | |
| U25 | Submission stage | OJS OMP OPS | M | done | Spec verified; 7 tests OJS, 8 OMP, 2 OPS absence (+setup each), green ×2 + post-fold confirm; register 3❓+2✅ (A2 area has private-file items); 2 readability frictions left open (Actors "onward" wording, OPS1 code-facing sentence); 2026-08-25 upstream-rebase check: clean; maintainer review pending |
| U26 | Review stage & rounds | OJS OMP | H | done | Spec verified; 12 tests OJS, 13 OMP, 1 OPS absence (+setup each), green ×2 + post-fold confirm; register 3🐞+9❓+1✅ (A3 observation in private file); 2026-08-25 upstream-rebase check: clean on shared+OJS ranges (parity holds; PMUR publish-gate note in parity ledger); OMP range: OMP2's form-field half confirmed intended upstream (recommendations flag now false on presses); 2026-08-27 upstream-rebase check: round-cancel reviewer mail is now `ReviewCancel` (i12903 split — fn-f dated, tests unaffected); maintainer review pending; **2026-08-29 upstream-rebase check**: i13156 modify-reviews rework folded — scenario 2 + S2 tests aligned to the Review Details window's "Mark as Complete" (author-side window untouched upstream); suites green both apps |
| U27 | Reviewer assignment & management | OJS OMP | H | done | Spec verified; 13 tests OJS, 14 OMP, 1 OPS absence (+setup each), green ×2 + post-parity-fix confirm; register 12🐞+3❓+1✅+5 retired (A18 silent half-add is the headliner; 3 observations in private file); U26 spec gained A10 + builder parity fixed en route (self-healing); 2026-08-25 upstream-rebase check: A11 fixed upstream (#13162), A5 moot (#10403 revert), Add Reviewer modal now shows the reviewer's email — spec+register updated, tests unaffected; OMP now exposes the reviewAssignments API route (editor edit-review claims worth an OMP re-probe at next touch); 2026-08-27 upstream-rebase check: i12903 unassign/cancel rework folded (template chooser in Fields/Rule 17/S11, mail split with new subjects, fn-k/h reworked; OJS+OMP S11 tests follow — cancelReviewForm id, new cancel subject, chooser assert); register +A20 🐞 (stale pkp.min.js, all apps — reported upstream, fixed same day by the maintainer's recompiles, verified green minified-on and RETIRED 2026-08-27) +OPS1 (RETIRED 2026-08-27 same day, overturned by maintainer ruling + registry check — OPS ships no review email templates by design, the window is unreachable); maintainer review pending; **2026-08-29 upstream-rebase check**: i13156 modify-reviews rework folded — Rules 3/14a/14b/15 + side effects reworked to the Review Details/Modify Review windows, S9/S10/S14 reworked + S16 added (13 commons; tests now 14 OJS / 15 OMP), fn-i rewritten; A10 RETIRED (overturned by design — opening now marks Review Viewed); register +A21 🐞 (rating-click race) +A22 🐞 (guidance promises absent upload) +A23 ❓ +A24 ❓; suites green ×2 both apps; 2026-08-29 maintainer triage (Mattermost): A21 risk accepted, A22 ticket to follow — both re-confirmed in code at that day's main tips |
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
| U40 | Publication metadata | OJS OMP OPS | M | done | Built 2026-08-28 on PINNED apps (local-only, no push/CI; upstream-sync baselines NOT advanced): ojs ac67a6dd76, omp 244a04311c, ops 94f6bbc59a. Spec verified; 11 tests OJS, 9 OMP, 9 OPS (+setup each), full suites green ×2 fresh-reset (OJS parallel-fleet runs shed workers to PHP 30s hard-limit fatals — greens are solo runs; one post-reset bootstrap race relaunched per harness.md); register 7🐞+10❓+6✅ (headliners A1: Plain Language Summary at "Require" permanently blocks Metadata/Permissions/entry-page saves on all apps while OMP publishes and OPS posts without a summary; A2 reset tool stamps Copyright Year 1970 on unpublished+declined items; A15 change-language panel acts before its loads settle — app-changes rows 6–8; A11 ❓ copyright holder carries "(Author)" into the reader's copyright line); claim check 155 claims, 8 wrong (all folded); 1 observation routed to the private security file and verified; AFFW-711 dead candidate → UNASSIGNED #8; U43 atlas Claimed-by markers backfilled (self-healing); Schedule-Only-publishes-immediately + Review-Publishing-Details race + Publish-Issue date overwrite + ##common.help## raw key handed to U49/U50/U08 at spec time; 3 readability frictions left open (publish-gate wording, pin note, Login As); maintainer review pending |
| U41 | Contributors & affiliations | OJS OMP OPS | M | done | Built 2026-08-28 on PINNED apps (local-only, no push/CI; upstream-sync baselines NOT advanced): ojs ac67a6dd76, omp 244a04311c, ops 94f6bbc59a. Spec verified; 9 tests OJS, 11 OMP, 9 OPS (+setup each), full suites green ×2 fresh-reset (loaded box: workers=5 + solo setup-warm after each reset — at 8 workers cold, scenario seeding hits the PHP 30s ceiling; app-changes row 9); register 10🐞+9❓+3✅ (headliners A15: a newly added contributor ties the auto-created author at sequence 0 so list/reader order varies between loads — `getNextSeq()` falsy-zero; A14: one-role journals can't save any contributor yet each attempt creates a role-less row; A5: registry pick on an egress-blocked server saves and publishes NAMELESS; A2 ❓ deleting the primary contact leaves none, silently); claim check 195 claims, 6 wrong (all folded); 1 observation routed to the private security file and verified; contributors-panel async-refresh remount defect worked around content-verified across all 6 ordering sites + retroactively caught U40's OPS S4 harness bug (stale POST payload, payload-probe proof) and hardened U26's Record Decision click both apps (app-changes row 9); atlas: 35 Claimed-by markers, AFFW-396 stale note corrected, GRID-051+AFFW-681..686 dead grid → UNASSIGNED #9; GLOSSARY gains Primary contact (contributor); readability: 1 blocker fixed, re-read clean, ~6 minor frictions left open (4 glossary-legend by one-legend ruling); maintainer review pending |
| U42 | Citations & references | OJS OMP OPS | M | pending | |
| U43 | Funding | OJS OMP OPS | L | done | Built 2026-08-28 on PINNED apps (local-only, no push/CI): ojs ac67a6dd76, omp 244a04311c, ops 94f6bbc59a. Spec verified; 5 tests OJS, 5 OMP, 5 OPS (+setup each), full suites green ×2 fresh-reset + post-fold and post-rewrite confirms; register 3🐞+9❓+1✅ (headliner A3: a registry-picked funder saves permanently NAMELESS when the server can't reach ROR — reaches the reader page, all apps; A1 ❓ "Require" warns without blocking; ✅ OPS1 authors edit their unposted preprint's funders by design; A10/A11 low-confidence — need a server with egress); claim check 85 claims, 7 wrong (all folded, incl. OPS heading "Preprint: Funding" and A4 staleness widened to the wizard Review step on OMP/OPS); funding is core pkp-lib, reader templates forked ×3; nothing routed to the private security file; OMP full-suite had 3 load-flaked runs (PHP 30s fatals at load 13+, different tests each time, clean at normal load); 5 readability frictions left open (template-legend conventions); maintainer review pending; **2026-08-29 (main tips)**: entire suite red on all three apps = new A13 🐞 (upstream #13003 schema move — saved funders never render in the workflow/wizard table; reader pages fine; reported to the team 2026-08-29); reds stand until the fix lands |
| U44 | Identifiers (publisher IDs & URN) | OJS OMP OPS | M | pending | |
| U45 | DOIs | OJS OMP OPS | H | pending | |
| U46 | Galleys | OJS OPS | M | pending | |
| U47 | Media files | OJS OMP OPS | L | pending | |
| U48 | JATS & Body Text | OJS | M | pending | |
| U49 | Publish, schedule & versions | OJS OMP OPS | H | done | Built 2026-08-29 on PINNED apps (local-only, no push/CI; upstream-sync baselines NOT advanced): ojs ac67a6dd76, omp 244a04311c, ops 94f6bbc59a. Spec verified; 13 tests OJS, 11 OMP, 12 OPS (+setup each), full suites green ×2 fresh-reset (solo per-fleet runs, workers=5 + setup warm); register 7🐞+9❓ (headliners OJS2: "Schedule Only" is not honored on a journal with no published issues — the panel's first pick AND a saved settings choice both publish immediately, app-changes row 10; OPS4: the first-post acknowledgement never sends — every post mails "New Version Posted Acknowledgement", keyed on a dropped datum; A5: the promised amendment notice renders on no app's reader page; A6: merely creating an unpublished version rewrites the live reader date line; OJS3: mistyped version address → blank 500); claim check 229 claims, 5 wrong (all folded); 4 draft findings + 2 rule branches contradicted by live probes and dropped/rewritten pre-ship; nothing routed to the private security file; atlas: 51 Claimed-by markers + MAIL-002 correction (sends on OPS too); U40 banner discrepancy re-probed and dismissed (author-facing wording confirmed — U40 stands); readability 1 blocker fixed, re-read 0 blockers, ~8 minor frictions left open; maintainer review pending |
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
