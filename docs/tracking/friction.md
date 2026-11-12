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
2026-11-12 · U08 · test author tojs · `EditorialChrome.userMenu` found the initials menu by its English name (`nav[aria-label="User Navigation"]`), so S2's new French step timed out 30 s on "Navigation de l'usager", costing one rerun; now located by place (`header.app__header [data-cy="app-user-nav"] nav`) · a patterns.md "Locator pitfalls" line: a page object a scenario drives in another language never locates by a translated aria-label
2026-11-12 · U19 · test author tomp · footnote s says Still Water's abstract is "saved empty on its Title & Abstract page" but names a `manager` only in scenarios 3, 7, 9 and 11, and a published version's page is locked, so working out who empties it and in which order (seed unpublished with its format, empty, then publish on screen) cost a read of the K3 check script · footnote s naming S1's Press Manager (OMP, OPS) and the order: seeded unpublished, emptied, published on screen
2026-11-12 · U39 · test author tomp · S1's new notice bullet read `.app__notifications` with `getByText(…, {exact: true})`, which misses every toast (its text ends "× Close"), so one run failed and a throwaway probe went to finding the toast's DOM; `NotificationsPages.toasts()` already knows it · a patterns.md "Locator pitfalls" line: a page toast is `.app__notifications .pkpNotification` filtered by `hasText`, never an exact `getByText`
2026-11-12 · U39 · test author tops · S1's "nothing shows inside the window" read `[role="alert"], .pkp_notification` in the "Add a file" dialog without `:visible`, and the library form carries hidden placeholders of both, so one run failed on a count of 2 the aria snapshot could not show · a patterns.md "Locator pitfalls" line: a legacy form's own message area exists hidden; an absence read inside a legacy window puts `:visible` on every selector
2026-11-12 · U39 · test author tojs · S1's new "OK" before the upload reads a page notice that is `editor.diana's` trivial notification (Form::validate), which parallel lesson 2 says only an account no concurrent test signs in as may read, yet footnote s recipe 1 puts S1 on the roster Editor; weighing serial/`@solo` against the spec cost a read of U53/U12 headers, and the suite now carries the flake risk in its header · footnote s giving the notice step an account of its own (a scratch context for the "OK" before the upload), or patterns.md naming how a parallel test on a roster persona reads a legacy refusal notice
