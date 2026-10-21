# Users & Roles › "Notify": "Copy" ticked and then unticked before "Save" still sends the manager a copy

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#6374` for `pkp/pkp-lib#4017` · [891eba2020](https://github.com/pkp/pkp-lib/commit/891eba202036ec9d41ff8896949330918c0a4565) · 2020-11-25 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U55 [A5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U55-notify-users.md#a5)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On Settings › Users & Roles › "Notify", a manager who ticks "Copy"
("Send a copy of this email to me at {email}.") and unticks it again
before pressing "Save" and then "Send Email" still gets the email, once,
besides the members of the ticked roles. The box shows unticked at
"Save", and the recipient count in the "Send Email" confirmation window
leaves the copy out, so nothing warns the manager. A box never ticked
sends no copy.

The tab is there only for a journal, press or server the Site
Administrator allows bulk email (Administration › Site Settings › "Site
Setup" › "Bulk Emails").

## Impact

- **Lost**: nothing; the manager receives one email they chose not to.
- **Who**: managers and the Site Administrator who change their mind
  about "Copy" before sending.
- **Way round**: open the "Notify" tab again and fill it in without
  touching "Copy".

Low: the task gets done and no one else is affected.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OJS (OMP and OPS the same; their
  names in brackets). `rvaca` is the Journal manager [Press manager,
  Preprint Server manager] and holds no other role. "Section editor"
  ["Series editor", "Moderator"] is held by `dbuskins`, `sberardo` and
  `minoue`.
- The dataset allows no journal bulk email, so step 1 turns it on.

Steps:

1. Sign in as `admin`. Open Administration › "Site Settings" › "Site
   Setup" › "Bulk Emails", tick "Journal of Public Knowledge" ["Public
   Knowledge Press", "Public Knowledge Preprint Server"] and press
   "Save". Sign out.
2. Sign in as `rvaca` and open Settings › Users & Roles › "Notify"
   (`/index.php/publicknowledge/en/management/settings/access#notify`).
3. Tick "Section editor" ["Series editor", "Moderator"].
4. Tick "Copy" ("Send a copy of this email to me at
   rvaca@mailinator.com."), then untick it again.
5. Type "Editorial meeting" in "Subject" and "The editors meet on
   Friday." in "Email".
6. Press "Save". The window "Send Email" reads "You are about to send an
   email to 3 users. Are you sure you want to send this email?". Press
   "Send Email".
7. Let the queued jobs run (the dataset's install runs them on page
   requests), then look for the emails "Editorial meeting" in the
   install's mail catcher (Mailpit, MailHog or similar). One is needed:
   the screens show no recipient list.

**Expected** Step 7: three emails, one each to `dbuskins`, `sberardo`
and `minoue`, and none to `rvaca@mailinator.com`, since "Copy" was
unticked at "Save".

**Observed** Step 6: the page shows "Emails are successfully queued to
be sent at the earliest convenience.", and the send carried the
unticked box as `copy=false`:

```
POST /index.php/publicknowledge/api/v1/_email   200
userGroupIds[]=5&subject=Editorial meeting&body=<p>The editors meet on Friday.</p>&copy=false
{"totalBulkJobs":1}
```

Step 7: four emails, to `dbuskins`, `minoue`, `sberardo` and
`rvaca@mailinator.com`, each addressed to that person alone.

## Cause

`PKPEmailController::create()` (pkp-lib,
`api/v1/_email/PKPEmailController.php`) reads the posted "copy" with a
plain cast, then adds the sender when it is not empty:

```php
case 'copy':
    $params[$param] = (bool) $val;
    break;
...
if (!empty($params['copy'])) {
    $currentUserId = $this->getRequest()->getUser()->getId();
    if (!in_array($currentUserId, $userIds)) {
        $userIds[] = $currentUserId;
    }
}
```

The form posts the box's state as a string. `PKPNotifyUsersForm` gives
the "Copy" field a scalar value (`'value' => 0`), so the ui-library's
`FieldOptions` binds the checkbox to `true` or `false` rather than to a
list of ticked options. The tab renders the ui-library's
`src/components/Form/context/NotifyUsersForm.vue`, which extends
`Form.vue`: its `nextPage()` computes the total, opens the "Send Email"
window and, on "Send Email", calls the inherited `Form.vue::submit()`.
That sends `submitValues` form-encoded through `$.ajax`, which writes
the booleans as text. A box never touched posts `copy=0`, a ticked one
`copy=true`, and one ticked and then unticked `copy=false`. PHP's
`(bool) "false"` is `true`, so the sender is added.

Elsewhere the API reads a posted `"false"` as false:
`PKPBaseController::convertStringsToSchema()` does so for every boolean
an entity schema declares. `create()` has no schema and casts by hand.

Reach:

- Any client of `POST /api/v1/_email` that sends `copy=false` or
  `"copy": "false"` gets the copy too (code). A JSON `false` is read
  right.
- The same `(bool) $val` cast reads other request values in pkp-lib's
  controllers: the `isEnabled` filter of `GET contexts`, `isModified` of
  `GET emailTemplates`, `hasDois`, `isOnDoiPage` and
  `isInEditingOrPublished` of `GET submissions` (and OJS's `isPublished`,
  `hasDois` of `GET issues`), and `authorFriendly` of the review
  exports. These are query filters, not a form's checkbox, and they are
  left out of this fix. The review exports' screen
  (`ReviewerManagerReadReviewModal.vue`) sends `authorFriendly` as `1` or
  `0`, which the cast reads right; the screens behind the other filters
  were not traced.
- One checkbox does go through such a cast:
  `PKPJatsController::setVisibility()` reads `(bool)
  $params['jatsPublicVisibility']`. It is read right, because
  `WorkflowPublicationJats.vue` sends it as a JSON boolean.

## Proposed fix

Read "copy" as a boolean string in `PKPEmailController::create()`,
the way the announcement controller reads its "sendEmail" box and the
task template requests read "include"
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/notify-copy-unticked-still-sent/fix.diff)):

```diff
                 case 'copy':
-                    $params[$param] = (bool) $val;
+                    $params[$param] = filter_var($val, FILTER_VALIDATE_BOOLEAN);
                     break;
```

`FILTER_VALIDATE_BOOLEAN` reads `"false"`, `"0"`, `""` and `0` as
false and `"true"`, `"1"`, `1` and a JSON `true` as true, so the form
and every other client of the endpoint are read right.

Tried on `main` on all three apps: the Steps now give three emails, to
the three editors, and none to `rvaca`. A send with "Copy" ticked at
"Save" still reaches the editors and `rvaca`, with the fix in and out.

**Alternatives**

- Giving the field an array value in `PKPNotifyUsersForm`
  (`'value' => []`), so an unticked box posts nothing: it fixes this
  form only, leaves the endpoint misreading `"false"` from any other
  client, and changes the field's shape for a plugin that reads it.
- Comparing to the string, as the payments settings controller does
  (`$val === 'true'`): it reads a JSON `true` and a posted `1` as false.

**What goes with it**

- Overlap: the fix proposed in
  [Notify users: the "Send Email" window counts a person once per ticked role and leaves out the copy](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U55-A3-notify-total-counts-person-per-role.md)
  moves this cast unchanged into a new `getParams()` method of the same
  controller. Whoever merges the second of the two fixes makes this
  one-line change in `getParams()`; with both in, the window counts the
  copy exactly when one is sent.
- No stored data and no screen changes. A client that relied on
  `copy=false` sending a copy is unlikely, and it now gets none.
- Backport: the line applies to 3.5 as it stands (the file is the same).
  3.4's `PKPEmailHandler::create()` and 3.3's
  `PKPEmailHandler.inc.php` carry the same `case 'copy'` cast, their
  forms post an unticked box as `false` the same way (the same scalar
  field, `FieldOptions.vue` and `Form.vue`), and they take the same
  one-line change.
- Guard: a pkp-lib API test posting `copy=false` to `_email` and
  checking the queued job's recipients, or the e2e scenario the spec
  lists as Planned (a send to one role with "Copy" ticked and then
  unticked reaching only that role).

Small: one line and an API test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/notify-copy-unticked-still-sent/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/notify-copy-unticked-still-sent/lib.js).
  It takes the Steps on OJS, OMP and OPS on an install loaded from PKP's
  default test dataset, and is run from the pkp-e2e repo:
  `node bin/probe.js all shared/playwright/checks/issues/notify-copy-unticked-still-sent/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). `neighbour` as its
  argument runs the neighbouring sends alone ("Copy" never touched, then
  ticked at "Save").
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS, each on an
  install freshly loaded from pkp/datasets 5f247d04 (2026-10-20),
  PostgreSQL; the fault does not depend on the database. No request
  answered a server error and no page script failed on any walk.
- Branch tips:
  - main: OJS 3109a59114 (pkp-lib f37a174626), OMP 5777025be and OPS
    f048e747b4 (pkp-lib 042726ebf6); ui-library 99abe252 in all three.
    `PKPEmailController.php` is the same file in all three.
  - stable-3_5_0: OJS 1e78ca0c2b, OMP cce424e5e, OPS 5eca7fd603; pkp-lib
    68512b5fda, ui-library 2576e00a.
  - stable-3_4_0: OJS 0012bd1022, OMP e30fa7e38, OPS 0f1e21a117; pkp-lib
    85f47442cf, ui-library ee684b34.
  - stable-3_3_0: OJS d7d9dd14ec, OMP 8e72fc883, OPS c5532e2161; pkp-lib
    867ce82d8e, ui-library 96959f9e.
- Code reads: the files the Cause and the Backport bullet name, at the
  tips above; 3.4 and 3.3 were read in the code only, not driven.
- Introduced: `git blame` on the cast gives e3f570bc37 (2021-04-20,
  PSR-12 formatting, unchanged content); before it the line is in
  [891eba2020](https://github.com/pkp/pkp-lib/commit/891eba202036ec9d41ff8896949330918c0a4565)
  as written, with the field's `'value' => 0`. GitHub's
  `commits/<sha>/pulls` names PR `pkp/pkp-lib#6374`.
- Upstream: pkp/pkp-lib, pkp/ui-library, pkp/ojs, pkp/omp and pkp/ops
  searched for notify users copy, bulk email copy (unchecked, sent
  anyway), "send a copy of this email to me", notifyUsers copy,
  `PKPEmailController` copy, copy checkbox ignored, and a boolean
  checkbox posted as "false". `pkp/pkp-lib#7316` (closed) is about which
  address the copy goes to, not about an unticked box.
- Unverified: the other `(bool) $val` filters of Reach were read in the
  code; what each screen sends was traced for `authorFriendly` only.
