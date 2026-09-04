# Incidentals

Things a session saw in passing on screens that belong to another feature.
A probe, claim check or test run notices them while working its own
feature; the owning spec is the only place they can become a finding. One
line per item: the owning feature, the screen, what was seen, the date, and
where the evidence sat. The orchestrator writes rows from the fold logs'
"left in `.reports/`" lists and the claim-check merge's incidentals (RUNBOOK
"What goes where"). A spec author reads their feature's rows at step 2 and
puts each on the probe list or into the draft. A row is deleted when the
owning spec absorbs it, or when a later probe of that screen finds it gone.
Nothing security-shaped goes here (it goes to the private file).

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U08 Navigation menus & site chrome | Editorial header, every screen, all three apps | The header shows the raw key `##common.help##` beside "Tasks" for every account; the workflow side panel's help link shows the same key. | 2026-09-03 | U03 probes pA, pB, pD, pE, pG |
| U56 Emails management | Manage Emails | Typing "Change Email" into the search box leaves the full list showing; whether the search needs Enter or a longer wait was not pursued. | 2026-09-03 | U03 probe pD |
| U06 User invitations | Decline-invitation email composer | The Decline template body already ends "Kind regards," before the signature is appended, so the composer shows "Kind regards, / Kind regards, Sven Editorson". | 2026-09-04 | U03 claim check K2; also seen by probe pC |
| U53 Users management | Users & Roles, OPS with the French UI | The role column prints raw keys `##default.groups.name.manager##`, `##default.groups.name.sectionEditor##`; OJS and OMP print translated names. | 2026-09-04 | U03 claim check K2 |
| U01 Login & sessions | Password-reset link opened while signed in | Lands silently on the dashboard, no message. | 2026-09-04 | U03 claim check K5 |
| U57 Languages & locales | Settings › Website › Setup › Languages | The "Forms" box saved on the first click without flipping on screen. | 2026-09-04 | U03 claim check K6 |
| U38 Submission activity log & notes | Workflow › "Activity Log & Notes" modal on a seeded submission | Rendered blank for about 30 seconds. | 2026-09-04 | U03 claim check K3 |
| U07 Journal identity & about pages | Editorial Masthead public page | Content and layout observed while checking affiliations; the U03 spec keeps only a pointer. | 2026-09-03 | U03 probes pF, pJ |
| U37 Tasks & discussions | Workflow › Discussions "Add" (and reply), OMP and OPS | Saving a discussion fails with `Class "APP\notification\Notification" not found`; the row is stored, no task or email follows (app-changes row 12 overlay works around it on the fleets). | 2026-09-04 | U05 probe pN |
| U62 Plugins management | Settings › Website › Plugins › Plugin Gallery, all three apps | The Plugin Gallery grid answers a 500 instead of a message when outbound HTTP is unavailable (the fleets have a dead proxy). | 2026-09-04 | U05 probe pR P6 |
| U35 Stage participants | Workflow › Participants › Assign, OPS | The "Assign" list offers Managers as automatic editors (OJS and OMP offer no Manager group there). | 2026-09-04 | U05 probe pR P2 |
| U37 Tasks & discussions | Workflow › Discussions, an open discussion, OPS | The Author's second message in a discussion did not save in two attempts while the Manager's reply went through (seen once). | 2026-09-04 | U05 claim check ccK2 (K2-2) |
| U08 Navigation menus & site chrome | Reader-side header "Dashboard" item, all three apps | Its target varies by role: Section Editor and Reader land on the profile, Author on My Submissions, Reviewer on review assignments, Manager and assistants on the editorial dashboard. | 2026-09-04 | U05 claim check ccK1 |
| U59 Hosted journals (site admin) | Administration › Hosted Journals › Create Journal, OJS | Save answered 400 with no error text shown (seen once). | 2026-09-04 | U05 claim check ccK3 (K3-4) |
| U49 Publish, schedule & versions (shipped spec) | Workflow stage button "Schedule For Publication", OMP | The button lands on Publication › Title & Abstract instead of opening the scheduling window. | 2026-09-04 | U05 claim check ccK4 |
| U27 Reviewer assignment & management (shipped spec) | Review step 3, OMP | The step has no "Recommendation" list, so the review-submitted email subject reads "recommends None". | 2026-09-04 | U05 claim check ccK4 |
| U56 Emails management | Settings › Workflow › Emails, OMP and OPS | The "Editorial statistics" description says "the journal" on a press and a preprint server; the emails list has no "Discussion…" template. | 2026-09-04 | U05 claim check ccK3 (K3-R7) |
| U02 Registration & account validation (shipped spec) | Register page, all three apps | The password boxes carry `maxlength=32`, cutting a longer typed password silently. | 2026-09-04 | U05 claim check ccK3 (K3-3) |
| U50 Issues | Issues › Future Issues › Create Issue, OJS | The form's "Title" show-box arrives ticked, so Save with an empty title is refused with no visible error line (the form re-renders, the grid stays "No Items"). | 2026-09-04 | U05 test author tojs |
