# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U48 JATS & Body Text | Body Text page, "Export" | A Layout Editor without "Permissions" may use "Export to HTML" / "Create PDF" (the export can carry text not yet saved) while "Save" answers 401; near A2 | 2026-11-09 | pkp-lib#13543 PR review (rounds 3–6), `docs/reports/2026-10-16-pkp-lib-13545.md` history in git; daily session 2026-11-09 |
| U48 JATS & Body Text | `PUT …/publications/{id}/bodyText` | Sent without its `bodyText` field it answers 500 (`setBodyText()` given null, `PKPBodyTextController::save()`) | 2026-11-09 | pkp-lib#13543 PR review side note; daily session 2026-11-09 |
| U48 JATS & Body Text, U46 Galleys | Body Text page; Galleys list | Rule 23 ("the saved text is used nowhere else") and ❓ A5 now read against Rule 24's "Export"; U46's "Name" row does not mention the "Generated from text editor" / "Revision N" marks | 2026-11-09 | pkp-lib#13543 merged 2026-11-07; U48 Rule 24, A23, A24 added by the daily session 2026-11-09 |
| U54 Roles configuration | Settings › Users & Roles › Roles, a role's "Edit" window, "Save" | Saving the Journal Editor role (group 3) after unticking "Permit changes to Settings" removed that role's stage-6 (Done) assignment, which the dataset and a fresh install give it and the window has no box for, and stored a `recommendOnly` setting of 0 the row lacked; the spec says only "Stage 6 (Done) has no column" | 2026-11-10 | OJS main (lib/pkp 6035a6fed8), dataset fleet 9, a security-refinement helper (housekeeping 2026-11-10); the row's `user_group_stage` and `user_group_settings` read before and after |
| U29 Review setup & review forms | A reviewer's review history; Tools › Import/Export native XML export; `PUT`/`DELETE …/api/v1/reviewers/recommendations/{id}` | While a recommendation in use is deactivated, the reviewer's own review history shows it empty and the native XML export writes `peer-review-recommendation` empty (both "Revisions Required" again once reactivated), beyond the "-" A6 records in "Read Review"; a rename or delete of a used one is refused with 406 whose body is the raw key `##api.406.notAcceptable##` | 2026-11-10 | OJS main (lib/pkp 6035a6fed8), dataset fleet 9, review 19 (jjanssen, option 2), a security-refinement helper (housekeeping 2026-11-10) |
