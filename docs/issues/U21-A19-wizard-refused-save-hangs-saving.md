# After the server refuses one save, the submission wizard hangs on "Saving" and the author cannot submit

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Crash** script
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OMP, OPS; OJS latent (code)
  - 3.4: OPS (code); OJS, OMP latent (code)
  - 3.3: none (code; no autosaving wizard)
- **Introduced** `pkp/ui-library#241` for `pkp/pkp-lib#7191` · [467034aa4](https://github.com/pkp/ui-library/commit/467034aa4171bca0c46fa9e0e4b8b8dcdaa7cee2) · 2022-10-31 · Alec Smecher (asmecher), PR author; commit by Nate Wright (NateWr)
- **Upstream** none found (2026-10-22)
- **Tracked in** spec U21 [A19](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U21-submission-wizard.md#a19), [OMP4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U21-submission-wizard.md#omp4) (the hang after a Chapter Author's refused save); spec U75 [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U75-preprint-relations.md#a7) (the hang after the refused DOI)
- **Checked** 2026-10-22, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-22: walked again after `pkp/pkp-lib#13585`, which stopped
a required plain language summary refusing saves; the Steps now use
refusals each app still makes.

## Summary

When the server refuses one of a step's saves, whatever the field, the
wizard shows its "Error" dialog. Four seconds later, unless another
change is already waiting to be sent, the page's own script fails in
the browser. From then on the footer reads "Saving", nothing more is
sent, both "Save for Later" buttons and "Submit" stay disabled, and
"Review" never gets past "Checking your submission". The wizard should
instead stay connected: show the refusal, keep "Last saved …", and save
the author's next change.

The author's only way on is to reload the page. The reload drops the
refused change, and offers what was typed after it in an "Unsaved
Changes" dialog. "Yes" sends it again; when it holds a form the server
still refuses, the wizard hangs again. A lost connection or a server
failure is retried and recovers; only a refusal hangs.

Reading the server's checks on a submission still being made finds
these refusals; the abstract's required text and word limit, for
instance, are checked only once the submission is sent:

- `main` only, journals and preprint servers: the plain language
  summary is longer than the section's abstract word limit;
- preprint servers, `main`, 3.5 and 3.4: "DOI of the published preprint"
  is typed without its web address, or "Other license URL" holds
  something that is not a web address;
- presses, `main` and 3.5: any save of a submission made as "Chapter
  Author".

## Impact

- **Lost**: the refused change. Each stored save holds one form, whole,
  so the refused field comes back after the reload only when the author
  changed something else in that form after the refusal.
- **Who**: the word-limit case needs a manager who turned the summary
  on and gave a section an abstract word limit; the summary is off by
  default. Every author on a preprint server who says the
  preprint is published elsewhere is asked for that DOI, and the box
  does not say it wants a web address. On a press, a
  submitter is made a "Chapter Author" when that is their only author
  role, or when they hold no submitting role after a manager edited the
  "Author" role; every save they make is refused, and they cannot
  finish the submission.
- **Way round**: a reload, as the dialog says:
  - a summary over the limit, a bare DOI or a license that is not a web
    address: correct the field first (it can still be edited while the
    footer reads "Saving"; a shorter summary, the DOI as
    `https://doi.org/…`), then reload and answer "Yes"; or reload,
    answer "No, discard unsaved changes" and type it again;
  - a Chapter Author: none, since every save is refused. This report's
    fix ends the hang but does not let them submit: the refusal itself
    is a separate fault, not reported to pkp
    ([U21 OMP4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U21-submission-wizard.md#omp4)).

Medium: the error dialog tells the author to reload, and the reload,
with the field corrected, gets them going. It would be high if a
refusal were part of every ordinary submission.

## Steps to reproduce

One group of steps per app, each on a save that app refuses, starting
from PKP's default test dataset on the app's `main` or 3.5.

On a journal (OJS `main`), a summary over the word limit:

- Precondition, as `dbarnes`: Settings › Workflow › "Submission" ›
  "Metadata", "Plain Language Summary": tick "Enable plain language
  summary metadata", choose "Ask the author to provide a plain language
  summary during submission.", "Save". Then Settings › Journal ›
  "Sections", the arrow by "Articles", "Edit", type 10 in "Word Count",
  "Save".

1. Sign in as `ccorino`, an author.
2. Open "Make a Submission" (`/index.php/publicknowledge/en/submission`).
3. Type the title "u21ir23 refused save", choose the section
   "Articles" and "English" (the dataset's journal takes submissions in
   English and French), tick the requirements and privacy boxes, press
   "Begin Submission".
4. On "Upload Files" press "Continue".
5. On "Details" type "u21ir23 abstract typed by the author." in
   "Abstract" and "u21ir23 this plain language summary runs past the
   section word limit of ten words so the server refuses it." (19
   words) in "Plain Language Summary", press "Continue".
6. Press "OK" in the "Error" dialog and wait 20 seconds.
7. Press "Back", replace the summary with "u21ir23 summary typed after
   the refusal.", press "Continue".
8. Press "Continue" until "Review".
9. Reload the page and answer "Yes" in "Unsaved Changes".

On a preprint server (OPS `main` and 3.5), a DOI without its web
address. No precondition:

1. Sign in as `ccorino`, open "Make a Submission", type the title
   "u21ir23 refused save", choose "English", tick both boxes, press
   "Begin Submission".
2. On "Upload Files" press "Continue" (on 3.5 the wizard opens on
   "Details"; skip this step).
3. On "Details" type "u21ir23 abstract typed by the author." in
   "Abstract", then press "Continue" until "For Readers".
4. Choose "This preprint has been published elsewhere.", type
   "10.1234/u21ir23" in "DOI of the published preprint", press
   "Continue". The wizard moves on to "Review".
5. Press "OK" in the "Error" dialog and wait 20 seconds.
6. Press "Back", replace the DOI with
   "https://doi.org/10.1234/u21ir23", press "Continue".
7. Reload the page and answer "Yes" in "Unsaved Changes".

On a press (OMP `main` and 3.5), a Chapter Author:

- Precondition, as `admin`: Administration › "Hosted Presses", the
  arrow by "publicknowledge", "Settings wizard", "Users", search
  "skumar" (a Proofreader with no author role), the row's arrow, "Edit
  User", tick "Chapter Author", "OK".

1. Sign in as `skumar`, open "Make a Submission", type the title
   "u21ir23 refused save", choose "English", tick both boxes, press
   "Begin Submission". The wizard opens on "Upload Files" with no title
   (on 3.5 it opens on "Details"; skip step 2).
2. On "Upload Files" press "Continue".
3. On "Details" type "u21ir23 refused save" in "Title" and "u21ir23
   abstract typed by the author." in "Abstract", press "Continue".
4. Press "OK" in the "Error" dialog and wait 20 seconds.
5. Press "Back", type "u21ir23 abstract typed after the refusal." in
   "Abstract", press "Continue".
6. Press "Continue" until "Review".
7. Reload the page and answer "Yes" in "Unsaved Changes".

**Expected**: after the refused "Continue" the wizard keeps working. The
footer goes back to its "Last saved …" line, the correction typed
afterwards is saved, both "Save for Later" buttons stay enabled, and
"Review" finishes its check and lists what is still missing (the file;
for the Chapter Author also the title). For the Chapter Author the
change typed after the refusal is sent (and refused).

**Observed**: on the journal, step 5's save is refused, the wizard
still moves on to "Contributors" and the dialog opens:

```
PUT …/api/v1/submissions/21/publications/22  → 400
{"plainLanguageSummary":{"en":["The plain language summary is too long. It should be 10 words or less. It is currently 19 words long."]}}

Error
An unexpected error has occurred. Please reload the page and try again.
```

The footer shows "Reconnecting". About four seconds later it shows
"Saving" for good, at the moment the page's script fails with an
uncaught error:

```
Cannot read properties of undefined (reading 'url')
```

Twenty-five seconds later it still reads "Saving". Both "Save for
Later" buttons are disabled and no request has been sent since the
refusal. Step 7 sends nothing. On "Review", "Checking your submission"
never clears, Abstract and Plain Language Summary read "None provided",
and "Submit" is disabled.

After the reload, "Unsaved Changes" opens. "Yes" sends the "Details"
form as it stood after step 7, with the abstract and the shorter
summary, and the server saves it (200).

On the preprint server, `main` and 3.5, step 4's save is refused and the
same dialog opens on "Review":

```
PUT …/api/v1/submissions/20/publications/21  → 400
{"vorDoi":["This is not a valid URL."]}
```

Four seconds later the same page error leaves the footer on "Saving"
and both "Save for Later" buttons disabled. Step 6 sends nothing.
"Review" reads "This preprint has not been published elsewhere." and
"Checking your submission" never clears. In step 7, "Yes" sends the
change made in step 6 again, and the server accepts it (200).

The Chapter Author's step 3 is refused the same way, and from there the
hang is the same, step 5 sending nothing:

```
PUT …/api/v1/submissions/19/publications/19  → 401
{"error":"user.authorization.accessibleWorkflowStage","errorMessage":"You don't currently have access to that stage of the workflow."}
```

In step 7, "Yes" sends the "Details" form as it stood after step 5. It is
refused with the same 401, the "Error" dialog opens again, and four
seconds later the same page error leaves the footer on "Saving" for
good. The same on 3.5.

Control: the same "Continue" on "Details", made while the browser is
offline, shows "Reconnecting". Once the browser is back online the save
is retried after 4 seconds and answered 200, "Last saved …", and both
"Save for Later" buttons are enabled again.

## Cause

Every failed wizard save goes through the autosave mixin's `onError`
in ui-library `mixins/autosave.js` `_sendAutosave()`. For every status,
`onError` stores the payload in the browser and sets
`this.isDisconnected = true`. It then calls the wizard's
`SubmissionWizardPage.vue` `autosaveErrored()`. That method returns at
once for 0 and 500, which leaves the payload to be retried. For any
other status it calls `ajaxErrorCallback({})`, which shows the generic
"An unexpected error has occurred…" dialog. A 403 gets the same dialog
but keeps the payload stored for a retry. For a refusal it removes that form's stored saves,
since sending them again cannot succeed. But it never clears
`isDisconnected`. Its own `this.isDisconnected = true` changes nothing,
because the mixin has already set it. So a refusal leaves the wizard in
the lost-connection state.

`isDisconnected` turning true starts the reconnect loop
(`_runReconnect()`, through the mixin's `isDisconnected` watcher). Four
seconds later the loop calls
`this._sendAutosave(this._getNextAutosave(), …)`. The refused save is
gone, so unless another form's save was queued in those four seconds
(`_runAutosaveJobs()` stores it while disconnected; the loop then sends
it, and an accepted one clears `isDisconnected`), it passes `undefined`.
`_sendAutosave()` sets `isAutosaveRequestPending = true` and
`this.isAutosaving = true`, then throws on `payload.url`. No request
goes out, so no callback clears those flags or `isDisconnected`.

Everything waits on those three flags (two of them component data,
`isAutosaveRequestPending` a module-level variable):

- `_runAutosaveJobs()` returns early while `isDisconnected` or
  `isAutosaveRequestPending` is set. Later changes are only stored in
  the browser, which is why "Unsaved Changes" offers them after a
  reload.
- The footer shows "Saving" while `isAutosaving` is set, and both "Save
  for Later" buttons are disabled by `isDisconnected`
  (`lib/pkp/templates/submission/wizard.tpl`).
- `canSubmit` needs both flags false, so "Submit" stays disabled.
- `validate()`, the "Review" check, waits for them before it sends
  `_validateOnly`, so "Checking your submission" never clears.
- After a reload, "Yes" in "Unsaved Changes" replays the stored saves.
  If the server refuses one of them again, the same hang follows.

The mixin's only user is the submission wizard (searched
`lib/ui-library/src` and `lib/pkp/js`). Every save the wizard's forms
make goes through it, so any server-side refusal of a wizard field
leads here:

- a 400 from the publication's validation: the summary over the word
  limit, the DOI and the license (walked). Every wizard form saves to
  the publication, so the list of these comes from reading
  `PKP\publication\Repository::validate()`, the OJS and OPS
  `APP\publication\Repository::validate()` and the `validation` rules
  in `schemas/publication.json` of the fields the wizard's forms hold.
  Of those, the rules an author can break in the wizard's boxes are
  `url` (`vorDoi`, `licenseUrl`) and the summary's word count; the title
  and subtitle boxes take a single line, so their `no_new_line` rule is
  not reached by typing (pasting not tried). The abstract checks and
  the required title run only once `submissionProgress` is empty, and
  since `pkp/pkp-lib#13585` the required summary does too;
- a 401 from the API's authorization (`PKP\middleware\PolicyAuthorizer`
  answers a refused policy with 401 on `main` and 3.5): a Chapter
  Author's saves, refused by `PublicationWritePolicy`'s
  `StageRolePolicy` because the group has no Submission stage (U21
  OMP4; walked on OMP);
- a 403 takes the other branch, which keeps the save and retries it.
  On 3.4 the API answers a refused policy with 403
  (`APIRouter::handleAuthorizationFailure()`), so a 3.4 Chapter Author
  would get the dialog again at each retry rather than this hang
  (code; not walked).

## Proposed fix

Treat a refusal as what it is: the server answered, so the wizard stays
connected. And stop the reconnect loop when it has nothing to send,
instead of sending nothing. Both changes are in ui-library
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-refused-save-hangs-saving/fix.diff)):

```diff
--- a/lib/ui-library/src/mixins/autosave.js
+++ b/lib/ui-library/src/mixins/autosave.js
@@ _runReconnect()
 			setTimeout(() => {
-				this._sendAutosave(this._getNextAutosave(), {
+				const payload = this._getNextAutosave();
+				if (!payload) {
+					// Nothing is waiting to be sent
+					connectionTimerInterval = 4000;
+					this.isDisconnected = false;
+					return;
+				}
+				this._sendAutosave(payload, {
--- a/lib/ui-library/src/components/Container/SubmissionWizardPage.vue
+++ b/lib/ui-library/src/components/Container/SubmissionWizardPage.vue
@@ autosaveErrored()
-			if (xhr.status !== 403) {
-				let autosaves = this.getLocalStorage(this.autosavesKey);
-				if (autosaves.length) {
-					this.setLocalStorage(
-						this.autosavesKey,
-						autosaves.filter((payload) => payload.id !== autosave.id),
-					);
-				}
+			if (xhr.status === 403) {
+				this.isDisconnected = true;
+				this.ajaxErrorCallback({});
+				return;
 			}
-
-			this.isDisconnected = true;
+			// The server refused the save. Sending it again would be refused
+			// again, so drop it and stay connected: the next change is saved.
+			let autosaves = this.getLocalStorage(this.autosavesKey);
+			if (autosaves?.length) {
+				this.setLocalStorage(
+					this.autosavesKey,
+					autosaves.filter((payload) => payload.id !== autosave.id),
+				);
+			}
+			this.isDisconnected = false;
 			this.ajaxErrorCallback({});
```

The mixin's `onError` still sets `isDisconnected` first. The wizard
sets it back to false in the same tick, so the watcher sees no change
and no reconnect starts. The 0, 500 and 403 paths are unchanged, and an
ended session stays on the 403 path: on `main` the global
`ValidateCsrfToken` middleware runs before `PolicyAuthorizer`
(`PKPRoutingProvider::$globalMiddleware`) and answers a stale token
with 403, so its save is kept and retried as today. The order and the
403 are the same on `stable-3_5_0`, so the backport keeps this too.

The refused text stays in its box as the author typed it. It is not
resent on its own: `addAutosaves()` has already taken that form off its
list of changed forms. The author's next edit to the form sends it
whole, refused field included.

Tried on `main` on OJS, OMP and OPS (2026-10-22), each with its own
steps. With the fix in, the refused "Continue" shows the "Error" dialog
and the footer goes back to "Last saved …". No page error is logged and
both "Save for Later" buttons stay enabled. On the journal and the
preprint server the correction is saved (200), and "Review" finishes
its check and lists the missing file. For the Chapter Author the change
typed after the refusal is sent and refused again, with the dialog
again, and "Review" finishes its check. The offline control recovers
the same way with the fix in and out.

**Alternatives**:

- Only the guard in `_runReconnect()`: the crash goes, but the footer
  still reads "Reconnecting" for four seconds after every refusal, for
  no reason.
- Only the wizard change: it fixes the hang, but leaves the mixin able
  to call `_sendAutosave(undefined)`.
- Re-queue the refused form so it is retried: the server refuses it
  again every minute and the dialog reopens each time.

**What goes with it**:

- `autosaveErrored()` drops the refused form's stored saves by form id
  (`payload.id !== autosave.id`), not only the refused one. After an
  outage, when a retried save is refused, a later save of the same form
  queued during the outage goes too, and it may hold the author's
  correction. The method's comment speaks of deleting "the invalid
  autosave payload", so the wider drop looks unintended. The fix keeps
  it as it is; filtering by `payload.timestamp` instead would drop only
  the refused save. Not tried.
- When a refusal ends a reconnect (the outage's retry is refused),
  `connectionTimerInterval` stays doubled: only `success` and the new
  guard reset it. Harmless, since the next outage starts its retries at
  the longer interval, and a reset in the refusal branch would close it.

- The dialog still names no field, and after the fix the footer reads
  "Last saved …" with the time of the last accepted save, so the refused
  change can look saved. Showing the 400's field errors on the form
  (the forms already take an `errors` prop) would close that gap. It is
  left out here because it changes what every refusal shows, not only
  the hang;
  [U75 A7's report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U75-A7-wizard-refused-doi-no-field-message.md)
  proposes it, on top of this fix.
- No stored data to repair, no REST API or plugin hook change.
- Backport: the two methods are the same on `stable-3_5_0` and
  `stable-3_4_0` (3.4 differs only by a trailing comma), so the diff
  applies there with its context adjusted.
- Guard: a vitest in ui-library: an autosave answered 400 leaves
  `isDisconnected` and `isAutosaving` false and sends no second request.
  No existing test covers a mixin or `$.ajax`, so it needs stubs for the
  global `$` and `pkp.currentUser`, and it must reset the mixin's two
  module-level variables, `isAutosaveRequestPending` and
  `connectionTimerInterval`, between cases.

Small: a few lines in two files of one repo, following the status
handling `autosaveErrored()` already has, plus one unit test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-refused-save-hangs-saving/walk.js),
  with its helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-refused-save-hangs-saving/lib.js),
  run on an install loaded from the default dataset:
  `node bin/probe.js all shared/playwright/checks/issues/wizard-refused-save-hangs-saving/walk.js`.
  Each app takes its own steps (`REFUSAL=wordlimit` on OJS, `vordoi` on
  OPS, `chapter` on OMP, the defaults); `MODE=neighbour` runs the
  offline control.
- Walked 2026-10-22 on PostgreSQL: OJS `main` d05d8078d3, OMP `main`
  fad665a638 and OPS `main` 5091e916d9 (pkp-lib 1f415a07ca, the merge of
  `pkp/pkp-lib#13585`; ui-library e47a4887); OMP `stable-3_5_0`
  60163fe0ad and OPS `stable-3_5_0` 71ad98eb83 (pkp-lib ce67d3f62b,
  ui-library 2576e00a). pkp/datasets de96f3c2 (2026-10-21). The
  "Other license URL" refusal (`REFUSAL=license`, "u21ir23 licence of
  the author" in the box: 400 `{"licenseUrl":["This is not a valid
  URL."]}`, then the same hang) was walked on OPS `main` only; on 3.5
  and 3.4 it is read in the code (OPS `LicenseUrlForm` in the wizard,
  `licenseUrl` validated as `url`). `fix.diff` applies unchanged to
  today's tips on `main` and 3.5.
- `pkp/pkp-lib#13584`, fixed by `pkp/pkp-lib#13585`, names this hang as
  reported apart; its fix does not touch it.
- The 403 path on 3.5: `ValidateCsrfToken` is listed before
  `PolicyAuthorizer` in `PKPRoutingProvider::$globalMiddleware` and
  answers 403 (OMP `stable-3_5_0`, pkp-lib ce67d3f62b).
- 3.5 OJS "latent": it ships the same code (`stable-3_5_0` OJS
  cbf80495db, ui-library 2576e00a, `autosaveErrored()` and
  `_runReconnect()` the same as `main`), but no save its wizard makes is
  refused: the plain language summary exists on `main` only (the walk's
  first precondition finds no "Plain Language Summary" setting on 3.5
  OJS), the DOI and license boxes are OPS's and "Chapter Author" is
  OMP's.
- 3.4 (code): ui-library `origin/stable-3_4_0` ee684b34 has the same
  `autosaveErrored()` and `_runReconnect()`, and
  `lib/pkp/templates/submission/wizard.tpl` (pkp-lib 366030b017) binds
  the footer and "Save for Later" to the same flags. OPS
  `upstream/stable-3_4_0` 47adbcd1e8 validates `vorDoi` as a URL
  (`schemas/publication.json`) and puts the required "Relation status"
  form in the wizard (`pages/submission/SubmissionHandler.php`). OMP
  `upstream/stable-3_4_0` eed62409f8 gives "Chapter Author"
  `stages="4,5"` (`registry/userGroups.xml`), `PKPSubmissionHandler::add()`
  picks a submitter's group by role alone, and `StageRolePolicy`
  refuses an author without the Submission stage, but the refusal
  answers 403 there (`APIRouter::handleAuthorizationFailure()`), which
  `autosaveErrored()` keeps and retries instead of hanging; so OMP stays
  latent on 3.4. Not walked.
- 3.3 (code): ui-library `origin/stable-3_3_0` 96959f9e has no
  `src/mixins/autosave.js` and no `SubmissionWizardPage`. OJS
  6616da8f2f, OMP fbe408e8eb and OPS e265883ba4 use the older
  form-by-form wizard, with no autosave.
- Introduced: `git blame` on the `autosaveErrored()` lines and on
  `_runReconnect()` stops at 467034aa4, which created both (later
  commits touched only formatting: 7f13651e9, c7cb4e12b). Its PR is
  `pkp/ui-library#241`, merged 2022-12-14, first in tag `3_4_0rc1`
  (2023-02-20).
- `pkp/pkp-lib#10929` (open) is behind the
  commented-out Submission-stage filter that lets a Chapter Author
  submit; that is U21 OMP4's cause, not this one.
- Unverified: a browser with storage disabled. There
  `_getNextAutosave()` reads only the in-memory queue. Not driven. The
  3.4 Chapter Author retry loop is read in the code only.
