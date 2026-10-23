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
2026-10-23 · issues · reporter q23d (U06 A15) · a fix walk hung under the exclusive app lock: Playwright `locator.inputValue()` / `option:checked` reads have no timeout in the probe kit, so reading a select whose value matches no option (the fix empties the role row) waited forever and the trial had to be killed and run again · a default action timeout in `launch()` (or a kit `readValue()` helper with one), and a line in patterns.md "Probe kit" that reads of a state the fix brings must be bounded
2026-10-23 · issues · reporter q23f (U72 A14) · a lib/pkp JS fix tried on the stable-3_5_0 dataset fleet changed nothing on screen: that dataset's config has `enable_minified = On` (harness.md "Dataset fleets" says the dataset leaves it Off, true for `main` only), so the page served the unrebuilt `js/pkp.min.js`; a second trial with `enable_minified = Off` set after each reset was needed · state the per-line value in harness.md, or have try-fix warn (or the reset set Off) when a fix touches `lib/pkp/js/` and the fleet serves the minified bundle
2026-10-23 · housekeeping · claim checker cc23a (I23C, U40 row) · on stable-3_5_0 a workflow address with `workflowMenuKey=publication_<id>_titleAbstract` lands on the stage view (the key rewritten to `workflow_5`), so the first OPS 3.5 run read no "Title & Abstract" at all and had to be re-run pressing the menu link; patterns.md "Probe kit" and the OPS `openPublicationPage` helper describe the key as working · a line in patterns.md "Probe kit" (3.5: press the menu entry; main honours the key), or a line-aware `openPublicationPage`
2026-10-23 · housekeeping · claim checker cc23b (I23B, U62 and U10 rows) · the incidentals rows and the brief named Administration's button "Clear Template Cache" (it reads "Delete Template Cache" on main and stable-3_5_0 alike, so the first run waited out a 30 s click) and the U10 row placed the raw `{$themePluginPath}` refusal and the missing `return` on `PUT`, where both sit in the `GET …/theme` handlers (`getTheme()`), so the drive needed GET requests and a switched-off site theme the plan did not name · a row quoting a screen label checks it against the locale file, and a code-read row names the handler method it read
