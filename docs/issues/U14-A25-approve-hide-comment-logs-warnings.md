# A moderator's "Approve Comment" or "Hide Comment" writes two PHP warnings to the server's error log

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS (OMP, OPS: comments posted through the REST API)
  - ore (the OJS branch the ORE project runs): OJS (code)
  - 3.5: none (no public comments)
  - 3.4: none (code; no public comments)
  - 3.3: none (code; no public comments)
- **Introduced** `pkp/pkp-lib#11647` for `pkp/pkp-lib#11576` · [1869f217fd](https://github.com/pkp/pkp-lib/commit/1869f217fda0b6f3ce5c86445b181516ce89e552) · 2025-08-28 · Taslan A. Graham (taslangraham)
- **Upstream** none found (2026-11-16)
- **Tracked in** spec U14 [A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U14-reader-comments-and-moderation.md#a25)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Each press of "Approve Comment" or "Hide Comment" in the comment panel
on the Comments page writes two warnings to the server's PHP error log:
"The setting approvedAt doesn\'t have a defined type, using string
instead" (the backslash is in the logged text) and the same for
approvedByUserId. The change is stored and shows as expected, and no
screen shows the warnings.

Public comments exist only on `main` and the ore branch and are in
no release yet, so this can be fixed before they ship. The cost is
noise: every moderation decision adds two lines an administrator
reading the log has to tell apart from real faults.

## Impact

- **Lost**: nothing.
- **Who**: administrators who read the PHP error log of a journal with
  public comments on (on a press or a preprint server, only for
  comments posted through the REST API), in proportion to how many
  comments its moderators approve or hide.
- **Way round**: none needed.

Low: a log entry nothing downstream relies on.

## Steps to reproduce

Preconditions:

- The default dataset, OJS `main` (OMP and OPS `main` for the bracketed
  variant).
- PHP's `log_errors` on (its default). The warning goes where php.ini's
  `error_log` points, or, unset, to the web server's error log (the
  terminal under `php -S`); `config.inc.php`'s `[logs]` channel never
  receives it.

1. Sign in as `dbarnes`. Open the back office's Settings › Website, its
   "Content" tab, side tab "Comments"; tick "Enable Public Comments",
   "Save".
2. Sign in as `ccorino` and open article 17, "Antimicrobial, heavy metal
   resistance and plasmid profile of coliforms isolated from nosocomial
   infections in a hospital in Isfahan, Iran". Type "u14n16b comment by
   ccorino" in the comment box and press "Submit". [OMP and OPS have no
   comment box: sign in as `zzedd` (OMP) or `ccorino` (OPS), and on the
   "Submissions" page they land on, run in the browser's console the
   request OJS's comment box sends, for OMP book 5 "Bomb Canada and
   Other Unkind Remarks in the American Media" (publication 5) or OPS
   preprint 2 "The Facets Of Job Satisfaction: A Nine-Nation
   Comparative Study Of Construct Equivalence" (publication 2):]

   ```js
   fetch(pkp.context.apiBaseUrl + 'comments', {method: 'POST',
       headers: {'Content-Type': 'application/json', 'X-Csrf-Token': pkp.currentUser.csrfToken},
       body: JSON.stringify({publicationId: 5, commentText: 'u14n16b comment by zzedd'})});
   ```

   [On OPS, `publicationId: 2` and the text "u14n16b comment by ccorino".]
3. Sign in as `dbarnes` and open the side menu's "Content" › "Comments"
   (`/index.php/publicknowledge/en/management/settings/userComments`).
4. On the comment's row press "…" › "View Comment".
5. Press "Approve Comment", and read the server's error log.
6. On the comment's row press "…" › "View Comment" again, press "Hide
   Comment", and read the log.

**Expected**: nothing in the error log at steps 5 and 6.

**Observed**: at each of steps 5 and 6 the notice "The comment has been
updated successfully." shows, the comment moves to the "Approved" tab
(step 5) or back to "Hidden/Needs Approval" (step 6), the request
`PUT …/api/v1/comments/1/setApproval` (sent by the page as a POST with
a method override) answers 200, and the log gains
(PHP 8.3):

```
PHP Warning:  The setting approvedAt doesn\'t have a defined type, using string instead in …/lib/pkp/classes/core/SettingsBuilder.php on line 104
PHP Warning:  The setting approvedByUserId doesn\'t have a defined type, using string instead in …/lib/pkp/classes/core/SettingsBuilder.php on line 104
```

Opening the Comments page (step 3) and the comment panel (step 4)
writes nothing.

## Cause

`PKP\userComment\UserComment` is a model without a JSON schema
(`getSchemaName()` returns `null`) whose two settings,
`getSettings()` = `approvedAt` and `approvedByUserId`, are stored in
`user_comment_settings`. Such a model declares each setting's type in
`casts()`, and `UserComment::casts()` lists the primary columns only.

`UserCommentController::setApproval()` sets both settings (lines
406–407) and calls `save()`. `SettingsBuilder::update()` looks up the
type of each setting being written in the model's casts; for one it
does not find there, it falls back to `string` and raises
`E_USER_WARNING` (lines 100–108), added for `pkp/pkp-lib#10292` to make
such models declare their types. pkp-lib sets no error handler, so the
warning goes to PHP's own log. The two settings came later, with the
moderation screen (`pkp/pkp-lib#11647`), without casts.

Multilingual settings never meet this, since `ModelWithSettings` gives
each one its own cast. The backslash stays in the text because `\'` is
no escape in a PHP double-quoted string.

Reach:

- Both presses, on the three apps (walked). Writing a comment
  (`submit()`, an insert) logs none (walked); the article page's own
  warnings per comment have another cause (spec U14 A24).
- A second effect of the missing cast: the `setApproval` answer
  carries `approvedAt` as `"2026-11-16T04:20:32.207025Z"` (`now()` is
  still a Carbon object), while `GET …/comments` returns the stored
  text, `"2026-11-16 04:54:25"`, beside an ISO 8601 `createdAt`
  (walked). The panel's note reads either.
- The other schema-less models on `SettingsBuilder` (code):
  `ReviewerRecommendation`'s `defaultTranslationKey` has no cast either,
  but is only written when a recommendation is created, an insert,
  which does not look up types. `AuthorResponse`, `Template`,
  `ControlledVocabEntry`, `ReviewerSuggestion` and `EditorialTask`
  either cast their single-value settings or have only multilingual
  ones. No model in the three apps' own `classes/` or bundled plugins
  uses `ModelWithSettings`, so a test on the one model covers today's
  code.

## Proposed fix

Declare the two settings' types in `UserComment::casts()`, as the
model already does for its own `createdAt` and as the other
schema-less models do for their settings
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/approve-hide-comment-logs-warnings/fix.diff)):

```diff
             'isApproved' => 'boolean',
             'createdAt' => 'datetime',
             'updatedAt' => 'datetime',
+            'approvedAt' => 'datetime',
+            'approvedByUserId' => 'int',
         ];
```

Tried on the three apps: with the two lines in, steps 5 and 6 log
nothing. The panel's notes after an approval ("This comment was
approved on 2026-11-16 by Daniel Barnes.") and after a hide, the stored
values, and on OJS the approved comment on the article's page are the
same with and without the fix.

**Alternatives**:

- `'approvedAt' => 'string'`: silences the warning but keeps the date
  untyped, so its reads keep the two formats above.
- Dropping or softening the warning in `SettingsBuilder::update()`:
  it is the only thing that tells a model's author a type is missing,
  and it covers every model.

**What goes with it**:

- The REST API: `approvedAt` in `GET …/comments` and
  `GET …/comments/{id}` becomes an ISO 8601 date like `createdAt` and the
  `setApproval` answer (read in the code; the trial watched the
  `setApproval` answer only, now `"2026-11-16T04:52:03.000000Z"`).
  Public comments are unreleased (3.6), so no client relies on the old
  text.
- No data repair: the stored value keeps its `Y-m-d H:i:s` form.
- The message text in `SettingsBuilder` can drop its backslash in the
  same change; the fix does not need it.
- Guard: a pkp-lib unit test on `UserComment` asserting that each name
  in `getSettings()` has a cast in `getCasts()`; in the e2e suite, a U14
  check that the log stays clean across both presses (a **Planned**
  item in the spec).

Small: two lines and a unit test.

## Evidence

- Kept script: [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/approve-hide-comment-logs-warnings/walk.js)
  (helpers in `lib.js` beside it) takes the Steps on the three apps of
  PKP's default dataset and reads the server's log around each step:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/approve-hide-comment-logs-warnings/walk.js`;
  `neighbour` as its argument runs the check of what the fix leaves
  alone.
- Walked 2026-11-16 on main, PHP 8.3.36, PostgreSQL, each walk on an
  install freshly reset to the default dataset (pkp/datasets
  `961a9871`): ojs `925ed49f3b`, omp `92dd31031`, ops `d75f514776`,
  lib/pkp `3ed5d1c3b3` in all three. Observed as written on each app,
  two warnings per press; the log lines name `SettingsBuilder.php`
  line 104, the `trigger_error()` call.
- Fix trial: `node bin/try-fix.js apply <fix.diff> ojs omp ops`, each
  walk on a fresh reset, the `neighbour` mode with the fix in and after
  the revert.
- Code reads, main: pkp-lib `classes/userComment/UserComment.php`
  (`casts()`, `getSettings()`), `api/v1/comments/UserCommentController.php`
  (`setApproval()`, `submit()`),
  `api/v1/comments/resources/UserCommentResource.php`,
  `classes/core/SettingsBuilder.php` (`update()`, `insertGetId()`),
  `classes/core/traits/ModelWithSettings.php` (the multilingual casts,
  `getCasts()`, `setAttribute()`), `classes/core/traits/EntityUpdate.php`
  (`updateSettings()`: the type is used only through `convertToDB()`,
  which `SettingsBuilder` does not have), and the other schema-less
  models named in the Cause; ui-library
  `src/pages/userComments/UserCommentDetailModal.vue` and
  `src/utils/dateUtils.js` (`formatShortDate()`).
- Introduced: `git blame` on `getSettings()`'s two names and on
  `setApproval()` lines 406–407 lands on `1869f217fd` (squash of
  `pkp/pkp-lib#11647`); `casts()` dates from `3aa127313b`
  (`pkp/pkp-lib#11410`, the comments back end, which had no settings);
  the warning from `47d1b477a9` (`pkp/pkp-lib#10292`, 2024-10-22).
- 3.5 (ojs `6cfc46e6fc` with lib/pkp `bb17ba1380`; omp `3f0fd0a7d`,
  ops `e290d8d8af`, both with lib/pkp `5af8e67ab4`): walked on a fresh
  dataset install, the Website settings have no "Content" tab, so step
  1 cannot be taken; no `classes/userComment/` or `api/v1/comments/`.
- ore (lib/pkp `9353b8232f`, ojs `404f86e4f6`): the same `casts()`,
  `getSettings()`, `setApproval()` lines and warning. Not walked.
- 3.4 (lib/pkp `origin/stable-3_4_0` `2dd24cc5ae`, ojs
  `upstream/stable-3_4_0` `61835656a2`) and 3.3 (lib/pkp `df738d3a66`,
  ojs `b83fb9e44d`): no file of public comments in pkp-lib.
- Tracker searches 2026-11-16 (pkp/pkp-lib, pkp/ojs, pkp/ui-library;
  "defined type", "using string instead", `approvedAt`,
  `approvedByUserId`, `setApproval`, `UserComment` casts, "User
  Comments", "Public Comments" approve): no match.
  `pkp/pkp-lib#12712` (closed) is about schema-derived casts and is
  what `getCasts()` now handles; `pkp/pkp-lib#12972` and
  `pkp/pkp-lib#13052` name `setApproval` for other faults.
- MySQL not checked; the fault does not depend on the database.
- Not walked: `GET …/comments` with the fix in; the other models named
  in the Cause.
