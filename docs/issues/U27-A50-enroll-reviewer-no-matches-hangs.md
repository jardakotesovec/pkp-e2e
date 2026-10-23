# An editor who picks "No Matches" in "Enroll Existing User" gets a server error and a window stuck on a spinner

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS, OMP
  - 3.5: OJS, OMP
  - 3.4: OJS, OMP (code)
  - 3.3: OJS, OMP (code)
- **Introduced** `pkp/pkp-lib#143` for PKP bug 8707 · [1782215d77](https://github.com/pkp/pkp-lib/commit/1782215d77bd2999a6dba02d50cd3a00e3b86038) · 2014-08-07 · Michael Thessel (MichaelThessel): the jQuery UI 1.11.0 upgrade, from which on "No Matches" can be picked; the server-side check that throws came later (Evidence)
- **Upstream** `pkp/pkp-lib#11521` (closed: the same server error, reached on a 3.5 pre-release by picking an existing reviewer the search then listed; its fix put reviewers back out of the search, and left the pickable "No Matches" and the throwing check)
- **Tracked in** spec U27 [A50](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a50)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

When an editor enrolls "No Matches" as a reviewer, the app fails on the
server. "Enroll Existing User" searches only people in the journal who
are not yet reviewers. A name that finds nobody, a reviewer's name
included, gets a single suggestion, "No Matches", and the editor can
pick it, by a click or by Arrow Down and Enter, like a name. "Add
Reviewer" then fails on the server: the window stays open with a spinner
beside a greyed-out "Add Reviewer", nothing on screen says what
happened, and after a reload the Reviewers panel shows that nobody was
added.

The editor expected either that "No Matches" could not be picked or that
the form would say a user is needed, as it does when the box is empty.
The editor has to leave the window, and a request letter they had already
written is lost with it.

## Impact

- **Lost**: the review request, and any text the editor wrote into its
  letter. After a reload the form opens again with the unedited
  template.
- **Who**: editors adding a reviewer on "Add Reviewer" › "Enroll Existing
  User" who type a name the search does not find (an existing reviewer, a
  misspelling, a person with no role in this journal) and then pick "No
  Matches". A name that matches only reviewers always gets "No Matches".
  That was so on 3.4 as well, so the case has not become more common.
- **Way round**: reload the page, open the form again and retype the name
  to pick a listed person. An existing reviewer is added through the
  window's reviewer list, and someone with no account through "Create New
  Reviewer".

Medium: it takes a deliberate pick of "No Matches", but the save then
fails without a word, and leaving the stuck window throws away the letter
the editor wrote.

## Steps to reproduce

Preconditions:
- The default dataset, OJS `main` (OMP `main`: the press's submission
  named in step 2).

Steps:
1. Sign in as `dbarnes` (Journal editor; on OMP, Press editor).
2. Open the workflow of "Sodium butyrate improves growth performance of
   weaned piglets during the first period after weaning" (submission 12,
   Review, Round 1). [OMP: "The West and Beyond: New Perspectives on an
   Imagined Region", submission 2, External Review, Round 1.]
3. In "Reviewers", press "Add Reviewer".
4. At the foot of the window, press "Enroll Existing User". The form
   "Enroll an Existing User as Reviewer" opens.
5. In "Search By Name", type "Janssen" (Julie Janssen, who already holds
   a reviewer role). The list under the box offers one entry, "No
   Matches".
6. Click "No Matches" (or press Arrow Down, then Enter).
7. Press "Add Reviewer".
8. Reload the page and look at "Reviewers".

**Expected**: "No Matches" cannot be picked. The box stays empty, and
"Add Reviewer" shows "This field is required." under it, as it does for
an empty box.

**Observed**: the box reads "No Matches". After "Add Reviewer" the window
stays open, with a spinner beside a greyed-out "Add Reviewer" and no
message, still so five seconds later. The request fails:

```
POST /index.php/publicknowledge/$$$call$$$/grid/users/reviewer/reviewer-grid/enroll-reviewer  → 500 (empty body)
PHP Fatal error: Uncaught Exception: invalid user or userGroup ID in …/lib/pkp/controllers/grid/users/reviewer/form/EnrollExistingReviewerForm.php:107
```

After the reload, "Reviewers" lists the same reviewers as before, and a
letter typed before step 5 is gone when the form is opened again. A name
nobody has ("Zqxwvu") offers the same single "No Matches" entry. Enter
alone, with no entry highlighted, picks nothing: it sends the form with
an empty user, which is refused with the notice "An existing user must
be entered.".

Control: in the same form, "Fritz" offers "Maria Fritz
(mfritz@mailinator.com)"; picked and added, the notice reads "Maria
Fritz was assigned to review this submission and sent an email
notification." and her row reads "Request Sent".

## Cause

The search behind "Search By Name",
`PKPReviewerGridHandler::getUsersNotAssignedAsReviewers()`, answers a term
that matches no eligible user with
`GridHandler::noAutocompleteResults()`:
`[{"label":"No Matches","value":""}]`. The browser side,
`AutocompleteHandler.itemSelected()`
(`lib/pkp/js/controllers/AutocompleteHandler.js`, line 143), is meant to
ignore that entry: its comment says the empty value "allows us to return
a 'no items' label", and it writes a pick into the hidden `userId` only
when `ui.item.value !== ''`.

That test never fails. jQuery UI's autocomplete normalizes every item
before the menu and the select event see it, filling an empty value from
the label. Up to 1.10 the item's own empty value won
(`$.extend({label: …, value: item.value || item.label}, item)`); from
1.11.0 on it does not (`$.extend({}, item, {label: …, value: item.value ||
item.label})`). pkp-lib moved to 1.11.0 in 1782215d77, and the apps
ship 1.14.1 on `main`.

So `ui.item.value` is "No Matches", and the handler writes it into the
hidden `userId` and the box. The form's only check on `userId`,
in the browser and on the server, is "required" (`FormValidator`), which
any non-empty text passes.

The server side then breaks the legacy form convention that bad input is
refused by a validator in `validate()`, not by an exception in
`execute()`. `EnrollExistingReviewerForm::execute()` casts `userId` to
0, `isValidUserAndGroup()` finds no such user, and line 107 throws
`\Exception('invalid user or userGroup ID')`: an uncaught exception, a
500 with an empty body. `AjaxFormHandler.submitForm()` posts with a
success callback only, so on the 500 nothing hides the spinner,
re-enables the button or shows a notice. The check came in 103420d9c6 for
`pkp/pkp-lib#9541` as a `fatalError()` and became an exception in
ac0e09ebe2; it stops the enrolment, but as a crash rather than a refusal.

Reach:
- Any other bad `userId` meets the same crash. An editor picks Sarah
  Vogt in the form in one tab; in a second tab the same editor (or
  another one) enrolls Sarah Vogt as a reviewer; "Add Reviewer" in the
  first tab then gives the same 500 and spinner (walked on OJS and OMP
  `main`).
- `noAutocompleteResults()` has one caller, and `AutocompleteHandler`
  one user: this form's "Search By Name", the only `type="autocomplete"`
  field in pkp-lib, OJS, OMP, OPS and their bundled plugins (code).
- The same mistake elsewhere: `ReviewerForm::execute()` throws `Invalid
  reviewer id.` for a reviewer already on the round, which the "Select
  Reviewer" path reaches when two tabs add the same reviewer (code, not
  walked).
- Stored data: none on `main`, 3.5 and 3.4, where the check comes
  before `assignUserToGroup()`. On 3.3 (code) the form has no user
  check, so `execute()` first writes a reviewer-group row for user id 0
  (`user_user_groups` has no foreign key there). Then
  `ReviewerForm::_isValidReviewer()`, which looks the id up among
  `users`, refuses user 0, and the save stops in `fatalError('Invalid
  reviewer id.')`. The row stays; a retry rewrites the same row (the
  write is an upsert), so it never meets the unique key.

## Proposed fix

Refuse a bad user, and a bad group, as form errors, and make the browser
guard work again. The diff,
[`fix.diff`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/enroll-reviewer-no-matches-hangs/fix.diff),
applies to the app root:

1. In `EnrollExistingReviewerForm`, split `isValidUserAndGroup()` into
   `isValidUser()` (exists, no reviewer role in this context) and
   `isValidUserGroup()` (a reviewer group of this context), and check
   each field with a `FormValidatorCustom` beside its "required" check,
   as `CreateReviewerForm` checks its `userGroupId` (and this form did on
   3.3). Each field then gets its own message, at most one.
   `Form::validate()` posts a failed check as the error notice the window
   already shows for "Create New Reviewer"'s refusals, and the form
   handler re-enables the button. `isValidUserAndGroup()` stays, built
   from the two, for the check in `execute()`.

   ```php
   $this->addCheck(new FormValidatorCustom($this, 'userGroupId', 'required', 'user.profile.form.usergroupRequired', fn ($userGroupId) => $this->isValidUserGroup((int) $userGroupId)));
   $this->addCheck(new FormValidatorCustom($this, 'userId', 'required', 'manager.people.existingUserRequired', fn ($userId) => $this->isValidUser((int) $userId)));
   ```

2. In `AutocompleteHandler.fetchAutocomplete()`, mark an entry with an
   empty value before jQuery UI fills it in, and test the mark in
   `itemSelected()` and `itemFocused()` instead of `ui.item.value !== ''`:

   ```js
   response($.map(data.content, function(item) {
       return $.extend({}, item, {noValue: item.value === ''});
   }));
   ```

Tried on OJS and OMP `main`: clicking "No Matches" leaves the box empty
once it loses focus, and "Add Reviewer" shows "This field is required."
under it without a request. In the second-tab case the first tab is
refused with the notice "An existing user must be entered." and the
button active, where the unpatched code gave the 500. Maria Fritz is
still added.

**Alternatives**:
- The browser fix alone: closes this way in, but the second-tab case
  still crashes the save.
- The server check alone: the save is refused with a notice, but the box
  still takes "No Matches" as if it were a name.
- One validator on `userId` calling `isValidUserAndGroup()`: a bad group
  would then show "An existing user must be entered." under the user
  field, and an empty group two messages.
- An empty answer instead of the "No Matches" entry: the editor would
  get no sign that the search found nobody.
- Catching the exception in `saveReviewerForm()`: a workaround at one
  caller; the legacy forms refuse input through their validators.

**What goes with it**:
- The check in `execute()` stays, for a caller that skips `validate()`.
- The JavaScript change reaches installs that serve the minified
  bundle (`js/pkp.min.js`) once the app's build regenerates it, as for
  any change under `lib/pkp/js`.
- The refusal reuses `manager.people.existingUserRequired` ("An existing
  user must be entered."). A message naming an existing reviewer would
  need a new locale key.
- `ReviewerForm::execute()`'s `Invalid reviewer id.` (Reach) could get
  the same validator in `AdvancedSearchReviewerForm`; it is left out
  here.
- Backport: applies as written to `stable-3_5_0`, where both files are
  identical. `stable-3_4_0` has `isValidUserAndGroup()` and the same
  guard, so both parts apply there with the hunks moved. `stable-3_3_0`
  already checks the group and has no `isValidUserAndGroup()`, so the
  user check is written there. A 3.3 backport also deletes the rows the
  crash left: `user_user_groups` rows whose `user_id` has no `users` row
  (user id 0).
- Test: a Planned item in U27. Picking "No Matches" ends in "This field
  is required.", and a user enrolled from a second tab is refused with a
  notice.

Small: two validators and a split method in one pkp-lib form, and a few
lines in the shared autocomplete handler, tried on OJS and OMP.

## Evidence

- Kept script: [`shared/playwright/checks/issues/enroll-reviewer-no-matches-hangs/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/enroll-reviewer-no-matches-hangs/walk.js)
  (helpers in its `lib.js`), on PKP's default test dataset (pkp/datasets
  300c68e, 2026-10-22, PostgreSQL):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js <ojs|omp> shared/playwright/checks/issues/enroll-reviewer-no-matches-hangs/walk.js`.
  The default mode takes steps 1-8, the "Zqxwvu" menu and the control;
  `WALK_MODE=nb` takes the second-tab case; `WALK_MODE=keys` takes step 6
  by Arrow Down and Enter (and Enter alone), with a note typed into the
  letter first and read again after the reload.
- Walked 2026-10-23 on OJS and OMP, `main` and `stable-3_5_0`, the same
  on all four. Tips: `main` OJS 3cf9aa91a8, OMP 178e8b34b2, OPS
  5091e916d9, lib/pkp 1f415a07ca, lib/ui-library e47a4887;
  `stable-3_5_0` OJS 0b1ae35f04, OMP a150eee76b, OPS 18506a5b4d, lib/pkp
  5b54f59ed7, lib/ui-library 2576e00a. The keyboard pick and the letter
  after a reload were walked on `main` (OJS and OMP). The way out walked
  is a reload; the window's "Cancel" and "Close" stay active after the
  500 (only the submit button is disabled, `FormHandler.disableFormControls()`)
  but were not pressed.
- OPS not walked: a preprint has no review stage and no "Reviewers"
  panel.
- Fix trial on `main`, OJS and OMP: the diff applied, then the default
  mode and `WALK_MODE=nb` with the fix in, then `WALK_MODE=nb` after the
  revert (the 500), each on a freshly loaded dataset. The installs serve
  the unminified scripts, so the patched `AutocompleteHandler.js` needed
  no build. A bad or empty `userGroupId` cannot be sent from the screen
  (a one-option select); the per-field messages for it are read in the
  code, not walked.
- Introduced: `git blame` of `AutocompleteHandler.js` line 143 gives
  639c37ad18 and 01ab552619 (2012), when the guard worked. jQuery UI's
  `_normalize()` was read at the tags 1.8.24, 1.9.2, 1.10.4 (the item's
  value wins) and 1.11.0, 1.11.4, 1.12.1, 1.13.0, 1.13.3 (the filled
  value wins). pkp-lib's 1.11.0 upgrade is 1782215d77; GitHub's
  `commits/<sha>/pulls` gives `pkp/pkp-lib#143`. The throwing check:
  `git blame` of `EnrollExistingReviewerForm.php` lines 106-107 gives
  103420d9c6 (2024-01-25, Vitalii Bezsheiko, `pkp/pkp-lib#9541`, as
  `fatalError()`) and ac0e09ebe2 (2024-07-11, Alec Smecher, "Use
  exceptions instead of fatalError").
- 3.5 (walked, and read): `EnrollExistingReviewerForm.php`,
  `AutocompleteHandler.js` and the enroll template are identical to
  `main`; jQuery UI 1.14.1 in both.
- 3.4 (code): lib/pkp `origin/stable-3_4_0` 366030b017, OJS
  `upstream/stable-3_4_0` 3bedd21383, OMP 95fefd0cf0. The same
  `noAutocompleteResults()`, the same guard, jQuery UI 1.13.3
  (`composer.json`), and `isValidUserAndGroup()` with `fatalError()`,
  which logs the reason, prints it as a page and exits. The window should
  hang the same way, though the response is not a 500 (not walked).
- 3.3 (code): lib/pkp `origin/stable-3_3_0` 126b86bc2e, OJS
  `upstream/stable-3_3_0` 06f01c8010, OMP fbe408e8eb. The same entry,
  guard and jQuery UI 1.13.3, and the same template (`disableSync`).
  `EnrollExistingReviewerForm::execute()` calls
  `UserGroupDAO::assignUserToGroup(0, <group>)`, whose
  `UserGroupAssignmentDAO::insertObject()` is `DAO::replace()` (an
  upsert on `user_id`, `user_group_id`); `RolesAndUserGroupsMigration`
  gives `user_user_groups` indexes and a unique key, no foreign key.
  `ReviewerForm::execute()` then calls `_isValidReviewer()`, which on 3.3
  looks the id up in `UserDAO::getReviewersNotAssignedToSubmission()`, a
  query from `users`, so user 0 is refused and `fatalError('Invalid
  reviewer id.')` logs, prints and dies before `addReviewer()`. Not
  walked: the 3.3 line was read only.
- Upstream search 2026-10-23 (pkp/pkp-lib, pkp/ojs, pkp/omp,
  pkp/ui-library). The fix of `pkp/pkp-lib#11521` is
  `pkp/pkp-lib#11524` (60f3f8445e; on 3.5 92d7079b2d, before the first
  3.5 tag), which adds `filterByContextIds()` to the search: the main
  user collector applies `filterExcludeUserGroupIds()` only when a group
  filter is set. 3.4's collector applies the exclusion on its own, so
  reviewers were left out there too. `pkp/pkp-lib#9541` is the
  origin of the check. `pkp/pkp-lib#4737` (a script error building the
  same field, 2019) and `pkp/pkp-lib#10901` (the search itself failing)
  are different faults, both fixed.
- MySQL not checked; nothing here depends on the database.
