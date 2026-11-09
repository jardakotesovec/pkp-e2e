# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U48 JATS & Body Text | Body Text page, "Export" | A Layout Editor without "Permissions" may use "Export to HTML" / "Create PDF" (the export can carry text not yet saved) while "Save" answers 401; near A2 | 2026-11-09 | pkp-lib#13543 PR review (rounds 3–6), `docs/reports/2026-10-16-pkp-lib-13545.md` history in git; daily session 2026-11-09 |
| U48 JATS & Body Text | `PUT …/publications/{id}/bodyText` | Sent without its `bodyText` field it answers 500 (`setBodyText()` given null, `PKPBodyTextController::save()`) | 2026-11-09 | pkp-lib#13543 PR review side note; daily session 2026-11-09 |
| U48 JATS & Body Text, U46 Galleys | Body Text page; Galleys list | Rule 23 ("the saved text is used nowhere else") and ❓ A5 now read against Rule 24's "Export"; U46's "Name" row does not mention the "Generated from text editor" / "Revision N" marks | 2026-11-09 | pkp-lib#13543 merged 2026-11-07; U48 Rule 24, A23, A24 added by the daily session 2026-11-09 |
