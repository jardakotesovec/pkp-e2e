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

2026-10-09 · sync · writing agent, the "Author's Original" rename · the brief's `grep -rn "Author Original"` misses the name where a paragraph wraps between its two words (18 places: 9 in the specs, U45's two among them and U45 not on the brief's list, 4 in issue reports, 5 in suite comments), and the brief said `stable-3_5_0` still shows "Author Original" while its checkouts hold no `versionStage` at all, found only when writing the U49 sentence · a rename brief that greps across line ends (`Author\s+Original` over the joined text) and states which lines have the feature, checked with one grep of the stable checkouts' `locale/en`
2026-10-09 · sync · regression reader rrlead, the format and file windows' "unsaved changes" lead · the lead was a race in the kept check, not a difference between the lines: `shared/playwright/checks/U44/I09/i09.js` `openTab` presses "Identifiers" on a format's "Edit" and on "Edit a file" as soon as the tab strip is drawn, jQuery UI then aborts the first tab's request on a cold fleet, and the window's "Close" asks only when that first tab never arrived, so two housekeeping runs per line read as "3.5 asks, `main` does not" and a reader's session went on telling the lines apart · a legacy tab-set opener in the kit (or a `LegacyIdentifiersWindow.openIdentifiersTab()` that first waits for the first tab's form and `idle`), a patterns.md "Locator pitfalls" line that a tab pressed while another tab loads aborts that load and leaves its panel empty, and a claim check that names a difference between lines only after one run on each line from a fleet in the same state (both just reset or both warm)
