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
2026-11-12 · U30 · test author tojs · footnote s says the console PUT body takes the other submission's author ids "read as admin", but `GET submissions/{id}` carries no publication authors, so a probe round went to finding `GET submissions/{id}/publications/{pubId}` `.authors[].id` · footnote s (or scenarios.md) naming the publications endpoint as where author ids come from
2026-11-12 · U08 · test author tomp · a probe round failed on French pages because the shared `EditorialChrome.openUserMenu()`, `userMenu` and `tasksButton` find the initials menu and the bell by their English names ("User Navigation", /^Tasks/) · `NavigationChromePages.js` locating the initials menu and the bell by structure (data-cy, the bar's buttons) so a French read reuses them
2026-11-12 · U64 · test author tojs · the first whole-file OJS run died in setup with ECONNREFUSED on the worker port 8300 (servers starting or stopping as another run on the slot's OJS fleet started or ended), costing one rerun · a slot-wide per-app run lock, or the setup probe retrying a refused connection for a few seconds
2026-11-12 · U69 · test author tomp · a drag on the Chapters page waited out 30 s because `ChapterList.titleCells()` read through `allTextContents()` is not the bare title while "Order" is on (hidden words in the cell), so one run went to switching to `lines()`; and the chapter drag helper U72 is adding in the same session was uncommitted, so the suite carries its own copy · a `ChapterList.chapterTitles()` reader that returns the bare titles in every mode, committed with the drag helper
2026-11-12 · U64 · test author tomp · on the OMP book page `page.locator('main')` matches nothing (the region is a `div` with role=main), so the first probe of the format links timed out, costing one rerun · a patterns.md "Locator pitfalls" line: reader-facing pages take `getByRole('main')`, never a `main` tag
