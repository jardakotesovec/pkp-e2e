# Friction — what made an agent's task harder than it needed to be

What cost a screen-driving agent calls, time or retries that a better
brief, doc, kit, seed or fixture would have saved; that agent appends a row
at the end of its task. The housekeeping session folds the rows and
deletes them under MAINTENANCE "The housekeeping session".

One line per entry, appended at the end, in this shape:

`YYYY-MM-DD · U<nn>, sync or issues · <role and agent id> · <what cost you calls, time or retries> · <what would have helped>`

Facts only, the same quarantine as everywhere else (nothing
security-shaped, no credentials).

## Entries
2026-11-11 · U24 · claim checker cc1111d (incidentals I34) · `dataset.md` lists each submission's editors but not which assignments are "Only allowed to recommend", so finding the recommend-only assignment on a published item in each app meant reading `stage_assignments` out of the three dumps · a "recommend-only" mark on the editor names in `dataset.md`'s submission tables (OJS `sberardo` on 1, `minoue` on 2; OMP `minoue` on 6; OPS none)
2026-11-11 · U34 · claim checker cc1111e (incidentals I35) · the spec gives typed decision addresses by constant name only, and OPS's "Decline Submission" and "Revert Decline" are 8 and 16 (INITIAL_DECLINE, REVERT_INITIAL_DECLINE), not the DECLINE (6) and REVERT_DECLINE (15) a reader of `Decision.php` picks, so the first OPS run read "This decision could not be found." for both and had to be rerun · a per-app table of the typed decision numbers in `patterns.md` ("UI realities", beside the workflow-address bullet) or in the spec's scenarios footnote, OPS row included
2026-11-11 · issues · issue reporter ir1111c (U34 OPS3) · a published (Done) submission's workflow opens on its Done view, which has no "Participants" panel, so `ParticipantsPanel.openEdit()` timed out on the first run and the walk had to select "Production" first and be rerun · a line in `patterns.md` ("UI realities") or `dataset.md` saying the Done view carries no Participants panel on `main` (select the "Production" entry), and an option on `ParticipantsPanel.goto()` to land there
2026-11-11 · sync · regression reader rr1 (pkp/pkp-lib#13767 PR review) · two things cost a rerun each. (1) Selecting an in-text citation on "Body Text" does not open "Selected Element" (the section stays folded under "References"), and `BodyTextPage` has no helper to edit a citation's "In-text citation" text. (2) Whether "Send to Text Editor" turns a Word citation field into a citation meant building a DOCX by hand and running pandoc-wasm under Node, only to learn that pandoc 3.10 reads `docx+styles` with `citations` off · a `BodyTextPage.editCitation(index, text)` that opens "Selected Element" and presses "Update"; a line in U48 (import) or `patterns.md` saying that a DOCX import never yields citations (`docx+styles`, no `+citations`), with `.reports/sync/rr1/pandoc-check.mjs` as the way to check a reader
2026-11-11 · sync · security verification probe sec (pkp/pkp-lib#13767 PR review) · `BodyTextPage.citeButton()` returns a reference's "Cite", but that button stays disabled after `typeAtEnd()` (the editor's caret is not a selection it accepts), so the first run timed out on it and was rerun with `dragReference()` · a comment on `citeButton()` saying when "Cite" is enabled, or a `BodyTextPage.citeReference(index)` that inserts a citation by the path that works
