# REST API: an announcement added without the email choice writes a warning to the server's error log

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code; a PHP notice on PHP 7)
- **Introduced** `pkp/pkp-lib#7547` for `pkp/pkp-lib#7213` · [adf443ba49](https://github.com/pkp/pkp-lib/commit/adf443ba4935e48e67db50ddbaec6ec9ad54e925) · 2021-12-15 · rahmanramsi (rahmanramsi); on `main` [5726086916](https://github.com/pkp/pkp-lib/commit/572608691618ed10ae9fda0730b51c43e9cf0d2f) · 2021-12-20 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U12 [A20](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U12-announcements.md#a20)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A program that adds an announcement through the REST API without
`sendEmail` gets what it asked for: the announcement is saved and
nobody is emailed. But each such add writes
`PHP Warning:  Undefined array key "sendEmail"` to the server's PHP
error log.

This holds for a journal's, a press's and a preprint server's
announcements, and, by the code, for the site's announcements too. The
apps' own "Add Announcement" form always sends `sendEmail`, so only
programs meet it. The fix is a one-line default.

## Impact

- **Lost**: nothing. The log gains one warning per add, noise an
  administrator has to sort from real faults.
- **Who**: programs (an integration, a script) that add announcements
  through the REST API. The API documentation for adding an
  announcement does not list `sendEmail`, so a program written from it
  meets this on every add.
- **Way round**: the program sends `"sendEmail": false` with each add.

## Steps to reproduce

Step 4 is typed in the browser's developer console, in the manager's
own session; step 7, the form's own add, is the control.

Preconditions:

- PKP's default test dataset for `main` (OJS; OMP and OPS the same).
- Access to the web server's PHP error log.

Steps:

1. Sign in as `rvaca` (password `rvacarvaca`), the journal manager.
2. Go to Settings › "Website" › "Setup" › "Announcements", tick "Enable
   announcements" and press "Save" (the dataset has it unticked, and the
   Announcements page lists nothing until it is ticked).
3. Reload the page (the side menu adds "Announcements" only when a page
   loads), then press "Announcements" in the side menu.
4. In the browser console, add an announcement with a title, a short
   description and a text, and no `sendEmail`:
   ```js
   await fetch(pkp.context.apiBaseUrl + 'announcements', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': pkp.currentUser.csrfToken}, body: JSON.stringify({title: {en: 'hkq23k Call for papers'}, descriptionShort: {en: '<p>Submissions are open.</p>'}, description: {en: '<p>Submissions are open until 1 June.</p>'}})}).then(async r => [r.status, await r.json()])
   ```
5. Read the end of the PHP error log.
6. Reload the Announcements page.
7. Press "Add Announcement", type "Title" "hkq23k Screen add", leave
   "Send an email about this to all registered users." unticked, press
   "Save", and read the log again.

**Expected**: step 4 answers 200 with the announcement and, like step
7's add, writes nothing to the log.

**Observed**: step 4 answers 200 with the announcement (`id` 1), and
step 6 lists "hkq23k Call for papers". But step 5 finds a new line in
the log:

```
PHP Warning:  Undefined array key "sendEmail" in …/lib/pkp/api/v1/announcements/PKPAnnouncementController.php on line 226
```

Step 7's add posts `sendEmail=false` and logs nothing.

## Cause

lib/pkp `PKPAnnouncementController::add()` reads the email choice as
`(bool) filter_var($params['sendEmail'], FILTER_VALIDATE_BOOLEAN)`
(line 226 on `main`) with no default. `sendEmail` is not a property of
the announcement schema, so `convertStringsToSchema()` neither fills it
nor checks it, and the REST API documentation's body for the add
(`AnnouncementEditable`, built from that schema) does not name it.

A request without the key makes PHP raise "Undefined array key" before
`filter_var()` sees the `null`, which then reads as `false`. The
outcome is the one the program wanted, with a warning on the way.

The line came with `pkp/pkp-lib#7547`, which restored the "New
Announcement" email for `pkp/pkp-lib#7213` on `stable-3_3_0` and was
ported to `main` the same week. It was written for the panel's form,
which always posts the key. Later changes turned it into the
`$sendEmail` variable (`pkp/pkp-lib#7286`) and moved it
(`pkp/pkp-lib#9253`, site announcements), always without a default.

Reach:

- A site announcement added by program without `sendEmail`
  (`/index.php/index/api/v1/announcements`, the Site Administrator):
  the same line runs before the `if ($context)` that skips notifying,
  so it logs the same warning (code).
- An edit (`edit()`) never reads `sendEmail`, so it logs nothing
  (code).
- The "Add Announcement" form posts the key every time:
  `sendEmail=false` on `main`, `sendEmail=` on 3.5, `true` when ticked.
  This was watched on the journal's screen; the site's form is the same
  `PKPAnnouncementForm` (code).
- No other `api/` controller reads an optional request key this way
  (code). `api/v1/_email/PKPEmailController.php` reads its `copy` flag
  with `!empty()`, and `PKPSubmissionController::validateVersionIsMinor()`
  reads `versionIsMinor` with `?? true`.

## Proposed fix

A proposal: give the key the default the form's unticked box means, in
`PKPAnnouncementController::add()`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-announcement-add-logs-warning/fix.diff)):

```diff
-        $sendEmail = (bool) filter_var($params['sendEmail'], FILTER_VALIDATE_BOOLEAN);
+        $sendEmail = (bool) filter_var($params['sendEmail'] ?? false, FILTER_VALIDATE_BOOLEAN);
```

The controller is the only reader of the key, so the one line covers
the journal's and the site's adds. It keeps what `pkp/pkp-lib#7547` was
for: a ticked box (`sendEmail=true`) still emails, an unticked one
(`false`, or empty on 3.5) still does not. It reads the optional key
as `PKPSubmissionController::validateVersionIsMinor()` does with
`?? true`.

Tried on OJS, OMP and OPS `main`: with the fix, step 4's add logs
nothing. The emails were checked with the fix and without it, with the
same result both times. An add through the API without `sendEmail`
and a form add with the box unticked email nobody. A form add with the
box ticked emails the same users as before: 19 on OJS, 21 on OMP and 6
on OPS.

**Alternatives**:

- `$illuminateRequest->boolean('sendEmail')` (Laravel's own reader,
  default `false`): equally correct, but no pkp-lib controller uses it
  yet.
- Add `sendEmail` to the announcement schema: it is a choice made at
  the add, not a property of the announcement, and would be stored with
  it.

**What goes with it**:

- Nothing an API client or plugin relies on changes, and no stored data
  needs repair. The REST API documentation could name `sendEmail` as an
  optional boolean of the add, default `false`.
- Backport: 3.5 takes the diff as written (line 220). 3.4's
  `PKPAnnouncementHandler::add()` has the same line (239), and 3.3's
  `PKPAnnouncementHandler::add()` reads it in an `if` (line 208); both
  take the same `?? false`.
- The guard: a test that adds an announcement through the REST API
  without `sendEmail` and checks that nothing is logged and nobody is
  emailed.

## Evidence

- Kept script:
  [`shared/playwright/checks/issues/api-announcement-add-logs-warning/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-announcement-add-logs-warning/walk.js)
  (helpers in `lib.js` beside it). It takes the Steps on a fresh load of
  PKP's default test dataset (pkp/datasets 300c68e, 2026-10-22, the
  `pgsql` dumps; PostgreSQL), reading the server log from a mark before
  each request; `MODE=nb` runs the email check of the fix trial. Run, after
  `npm run fleet-prep -- --feature issues --dataset --reset`:
  `PROBE_FEATURE=issues PROBE_AGENT=ir node bin/probe.js all shared/playwright/checks/issues/api-announcement-add-logs-warning/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Tips walked: `main` OJS 3cf9aa91a8, OMP 178e8b34b2, OPS 5091e916d9,
  each with lib/pkp 1f415a07ca; `stable-3_5_0` OJS 0b1ae35f04, OMP
  a150eee76b, OPS 18506a5b4d, each with lib/pkp 5b54f59ed7.
- Walks: the Steps on OJS, OMP and OPS on both lines, each on a fresh
  load: step 4 answered 200 and logged the warning (line 226 on
  `main`, 220 on 3.5), step 6 listed the announcement, step 7 posted
  `sendEmail=false` (`main`) or `sendEmail=` (3.5) and logged nothing.
- Fix trial: `node bin/try-fix.js apply shared/playwright/checks/issues/api-announcement-add-logs-warning/fix.diff ojs omp ops`,
  then the walk (default mode) and `MODE=nb` on each app after a fresh
  load, then `revert` and `MODE=nb` again on the reverted code. The
  email check reads the mail catcher by each announcement's title. It
  waits until the ticked add's email has arrived, sent by the dataset's
  job runner (`job_runner = On`), so the job runner had run when the
  other two adds showed no email. Without the fix the API add in that
  check logged the warning again; with the fix it logged nothing.
- Code reads: lib/pkp `api/v1/announcements/PKPAnnouncementController.php`
  `add()` and `notifyUsers()`, `classes/core/PKPBaseController.php`
  `convertStringsToSchema()`, `schemas/announcement.json` (no
  `sendEmail`), `classes/components/forms/announcement/PKPAnnouncementForm.php`
  (the `sendEmail` field), ojs `docs/dev/swagger-source.json` (the add's
  body is `AnnouncementEditable`, which lib/pkp `tools/buildSwagger.php`
  builds from the schema's editable properties; the file has no
  `sendEmail` property), on `main` and in
  `checkouts/stable-3_5_0` (the same line at 220). 3.4: lib/pkp
  `origin/stable-3_4_0` (366030b017)
  `api/v1/announcements/PKPAnnouncementHandler.php` line 239, the same
  line; the apps' `upstream/stable-3_4_0` (ojs 3bedd21383)
  `api/v1/announcements/index.php` hands the request to that handler in
  all three apps. 3.3: lib/pkp `origin/stable-3_3_0` (126b86bc2e)
  `api/v1/announcements/PKPAnnouncementHandler.inc.php` line 208,
  `if(filter_var($params['sendEmail'], FILTER_VALIDATE_BOOLEAN))`, a
  notice ("Undefined index") on PHP 7 and the same warning on PHP 8;
  the apps' `upstream/stable-3_3_0` (ojs 06f01c8010) route to it in all
  three apps.
- Introduced: `git log -S"params['sendEmail']"` finds adf443ba49 on
  `stable-3_3_0` (PR `pkp/pkp-lib#7547`, rahmanramsi, "Fix Announcement
  Email", for `pkp/pkp-lib#7213`) and 5726086916 on `main` (Nate
  Wright, no PR, the same code); `git log -L` on `main`'s line: the
  Cause's later changes are 640018cfbe (`pkp/pkp-lib#7286`) and
  b0be24e79b (`pkp/pkp-lib#9253`).
- Upstream search (2026-10-23): pkp/pkp-lib, pkp/ojs and pkp/ui-library
  for "sendEmail announcement", "Undefined array key" sendEmail,
  "PKPAnnouncementController sendEmail" and announcement API warning
  words; `pkp/pkp-lib#7213` (the email restored) and
  `pkp/pkp-lib#10382` (the announcement refactor) touch the code but
  not this fault.
- Not driven: the site's add by program (code only); the 3.4 and 3.3
  lines. MySQL not checked (the fault does not depend on the database).
