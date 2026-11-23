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
2026-11-23 · sync · regression reader rr13624 · a contributor-form save waited on `request().method() === 'PUT'` (copied from the kept `checks/sync/pkp-lib-13624/walk.js` `formSwitch`) never matched, because the Vue form tunnels the PUT as a POST with the override header, so status and body came back null and the statuses had to be dug out of the run record · a `waitForSave(page, urlPattern)` in the probe kit that matches the tunnelled method (and a fix of the same filter in walk.js, whose `status` is null for the same reason)
2026-11-23 · plugin-review · plugin drive · the brief asks for screenshots cropped to the plugin's part, but sandbox/ has no crop helper, and a PNG opened by file:// in Chromium is drawn centred on a dark canvas, so clipping it returned blank images and cost a reinstall to retake five shots; the install and settings-save notices are trivial notifications that the page's next `fetchNotification` consumes, so a DOM read missed them and they were read from that response on a re-install · a `crop(png, box)` and a `readNotices(page)` (the `fetchNotification` response) beside `newGuardedContext` in `sandbox/drive-guard.js`
2026-11-23 · plugin-review · plugin drive · reaching a plugin's Settings modal on Website Settings › Plugins took three retries: the grid's id carries a random suffix (`#component-grid-settings-plugins-settingsplugingrid` matches nothing), the "Settings" link sits in a separate control row (`tr[id$=<plugin>-control-row]`) shown only after the row's `a.show_extras` is clicked, and fbv textareas get suffixed ids, so only `textarea[name=…]` finds them; the plugin modal is a `[role=dialog]`, not `.pkp_modal_panel` · a short "Driving the pod's app" note in harness.md (or an `openPluginSettings(page, pluginName)` beside `newGuardedContext`) with the row, control-row and dialog selectors
2026-11-23 · plugin-review · plugin drive · publishing a dataset submission on 3.5 from Playwright cost six retries: the workflow's "Schedule For Publication" button opened no issue dialog on a fresh page load (no request, no error; it did open once after a Metadata save), the Issue menu item has no issue select, so the issue was set and the publication published through `PUT submissions/<id>/publications/<id>` and `…/publish` from the page; and the plugin's Laravel cache entries sit under `app/cache/`, which `snapshot` leaves out, so they were found by hashing the key with an inline `php -r` · a `publish(page, submissionId, issueId)` helper (the API path) and a `cache-entry <review> <key>` subcommand of plugin-sandbox.js, or a note in harness.md "Driving the pod's app"
