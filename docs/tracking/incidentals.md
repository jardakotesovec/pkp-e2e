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
| U05 Notifications center & email preferences | Profile › Notifications, OPS | A stray space in a notification row's label. | 2026-09-03 | U03 probe pH |
| U56 Emails management | Manage Emails | Typing "Change Email" into the search box leaves the full list showing; whether the search needs Enter or a longer wait was not pursued. | 2026-09-03 | U03 probe pD |
| U06 User invitations | Decline-invitation email composer | The Decline template body already ends "Kind regards," before the signature is appended, so the composer shows "Kind regards, / Kind regards, Sven Editorson". | 2026-09-04 | U03 claim check K2; also seen by probe pC |
| U53 Users management | Users & Roles, OPS with the French UI | The role column prints raw keys `##default.groups.name.manager##`, `##default.groups.name.sectionEditor##`; OJS and OMP print translated names. | 2026-09-04 | U03 claim check K2 |
| U01 Login & sessions | Password-reset link opened while signed in | Lands silently on the dashboard, no message. | 2026-09-04 | U03 claim check K5 |
| U57 Languages & locales | Settings › Website › Setup › Languages | The "Forms" box saved on the first click without flipping on screen. | 2026-09-04 | U03 claim check K6 |
| U38 Submission activity log & notes | Workflow › "Activity Log & Notes" modal on a seeded submission | Rendered blank for about 30 seconds. | 2026-09-04 | U03 claim check K3 |
| U07 Journal identity & about pages | Editorial Masthead public page | Content and layout observed while checking affiliations; the U03 spec keeps only a pointer. | 2026-09-03 | U03 probes pF, pJ |
