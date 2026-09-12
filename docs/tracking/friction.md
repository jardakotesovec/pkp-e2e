# Friction — what made an agent's task harder than it needed to be

What cost a screen-driving agent calls, time or retries that a better
brief, doc, kit, seed or fixture would have saved; that agent appends a row
at the end of its task. The maintenance session folds the rows and deletes
them under MAINTENANCE "The daily session".

One line per entry, appended at the end, in this shape:

`YYYY-MM-DD · U<nn> or sync · <role and agent id> · <what cost you calls, time or retries> · <what would have helped>`

Facts only, the same quarantine as everywhere else (nothing
security-shaped, no credentials).

## Entries
2026-09-12 · U26 · test author tojs · two runs lost to screen facts the spec and footnote h leave out: the review-files window lists the round's files only until "Show files from all accessible workflow stages." is ticked, and the upload wizard's "Cancel" link deletes the uploaded file where the header "Close" keeps it · footnote h naming the stage box, and Side effects (or footnote l) naming which close keeps the file
2026-09-12 · U26 · test author tomp · one probe rerun lost to the kit: `screen(page)` after closing a legacy window over the workflow waits 30 s for a second visible dialog and throws, so a "read the screen after the close" step must skip `screen()` and read locators directly · a `screen()` that records however many dialogs are open (zero or one) instead of waiting for the count it saw before
2026-09-12 · U27 · test author tops · one probe lost to the spec naming the wrong screen: scenario 15's "Settings › Workflow › Emails" is a settings form, and the templates list is the "Add and edit templates" link off it (Manage Emails, `management/settings/manageEmails`) · the bullet naming the Manage Emails page, or seed-facts recording where the templates list lives
2026-09-12 · U27 · test author tomp · one probe and one 5-minute hung run lost to a stage-access fact no doc names: a manager who is also an assigned reviewer of the submission is refused the review stage, so scenario 2's "Own row" bullet had no screen; and two reruns lost to `[data-cy="active-modal"]` marking the top window only (a "window closed" read on it never settles) · patterns.md "Side modals" naming that the attribute moves to the active window, and U24 (or footnote a here) naming the reviewer-on-the-submission refusal
2026-09-12 · U28 · test author tojs · two red runs lost to facts no doc names: a roster reviewer's step-3 "Your changes have been saved." toast is drained by a parallel test as the same account (the OMP suite had already moved S5 to a scratch journal for it), and the step-1 competing-interests editor re-initializes after its radio reveals it, so typed text loses its tail · patterns.md parallel lesson 2 naming server-fed form toasts as the same race, and the TinyMCE "UI realities" entry naming the revealed-box re-init
2026-09-12 · U28 · test author tomp · two reruns lost to screen facts no doc names: the wizard's step tabs swap their panel by AJAX a beat after the click, so a radio ticked right after the tab click is lost to the fetched panel (revisit by a typed `?step=N`), and the page's one `#ui-datepicker-div` opened after an "Add Reviewer" window sits under the later "Edit" window, so a date pick hangs its full timeout unless the workflow is reloaded first · patterns.md "Locator pitfalls" naming both (the tab swap under the jQuery UI tabs entry, the datepicker under "Side modals")
2026-09-12 · U28 · test author tops · two red runs lost to the S17 Roles bullet's premises drifting from the fleet's tip: the "Create New Role" window opens on "Manager" (stage boxes already disabled, so a "greys out on Reviewer" control needs a stage-taking level first), and ops `a72cacc1c5` lists a second stage "Done" (the ci-triage pkp-lib#13109 row) that stays enabled under "Reviewer", which the brief and the spec written from a 2026-09-05 probe do not mention · a revision brief naming the open ci-triage rows that touch the feature's screens, or fleet.json carrying the checkouts' commits so an author reads the drift as a tracked regression before re-driving
