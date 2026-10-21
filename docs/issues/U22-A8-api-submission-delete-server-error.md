# Deleting an unpublished submission through the REST API answers a server error, though it is deleted

- **Severity** low
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#10810` for `pkp/pkp-lib#10669` · [958592a159](https://github.com/pkp/pkp-lib/commit/958592a15966ca41ce8b02cfe655b74d7f554241) · 2025-05-30 · Dimitris Efstathiou (defstat)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U22 [A8](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U22-my-submissions.md#a8)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The REST API request that deletes a submission, `DELETE
{context}/api/v1/submissions/{id}`, answers HTTP 500 with the error
"Call to a member function getData() on null" when the submission has
never been published, drafts included. The submission is deleted all the
same, so a client is told the delete failed when it worked.

A published submission deleted the same way answers 200, but the record
it returns lists each contributor without their role. Both come from one
fault and one fix, and this report covers both.

Only programs that send the HTTP request meet it. No screen sends it,
and a plugin that deletes a submission in PHP is not affected.

## Impact

- **Lost**: nothing is lost. A client is told the delete failed when it
  worked.
- **Wrong record**: for a published submission, the deleted record's
  `authorsString` drops every contributor's role ("Vajiheh Karbasizaed
  ()" for "Vajiheh Karbasizaed (Author)"); a client that keeps the answer
  as the last copy of the record keeps it without the roles.
- **Who**: an API client acting as any role that may delete a
  submission (a manager, a section editor, the Site Administrator), for
  any submission not yet published. A plugin calling the delete in PHP
  is not affected: the failure is in building the HTTP answer.
- **Way round**: the client sends `GET …/submissions/{id}`; a 404
  "Invalid submission." confirms the delete went through.

Low: no screen sends the request, and a client can confirm the outcome.
A client that alerts or rolls back on a 500 without checking would make
it medium.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (context `publicknowledge`).
- The unpublished submission: OJS 16, "Influence of long-term nutrition
  with different dietary fats on fatty acid composition of heavy pigs
  backfat" (Submission stage); OMP 10, "Lost Tracks: Buffalo National
  Park, 1909-1939" (Submission stage); OPS 1, "The influence of lactation
  on the quantity and quality of cashmere production" (Production, not
  posted).
- The published submission: OJS 17, "Antimicrobial, heavy metal
  resistance and plasmid profile of coliforms isolated from nosocomial
  infections in a hospital in Isfahan, Iran"; OMP 14, "From Bricks to
  Brains: The Embodied Cognitive Science of LEGO Robots"; OPS 19,
  "Finocchiaro: Arguments About Arguments".

Steps (each request typed in the browser's developer console; the IDs
are OJS's, use 10 and 14 on OMP, 1 and 19 on OPS):

1. Sign in as `dbarnes` and open the dashboard ("Submissions").
2. Read the unpublished submission's record, and note its
   `publications[0].versionString` and `authorsString`:
   ```js
   await fetch(pkp.context.apiBaseUrl + 'submissions/16').then(async r => [r.status, await r.json()])
   ```
3. Delete it:
   ```js
   await fetch(pkp.context.apiBaseUrl + 'submissions/16', {method: 'DELETE', headers: {'X-Csrf-Token': pkp.currentUser.csrfToken}}).then(async r => [r.status, await r.json()])
   ```
4. Read it again, as in step 2.
5. Read the published submission's record (`submissions/17`), as in
   step 2.
6. Delete it (`submissions/17`), as in step 3.
7. Read it again.

**Expected**: steps 3 and 6 answer 200 with the record steps 2 and 5
gave, and steps 4 and 7 answer 404.

**Observed**: step 2 gives `versionString` "Unassigned version
(2026-10-20)" and `authorsString` "Rosanna Rossi (Author)". Step 3
answers 500, the same on all three apps:

```
DELETE /index.php/publicknowledge/api/v1/submissions/16 → 500
{"error":"Call to a member function getData() on null"}
```

The server log:

```
production.ERROR: Call to a member function getData() on null {"exception":"[object] (Error(code: 0): Call to a member function getData() on null at …/lib/pkp/classes/publication/Repository.php:937)
[500]: DELETE /index.php/publicknowledge/api/v1/submissions/16
```

Step 4 answers 404 `{"error":"user.authorization.invalidSubmission",
"errorMessage":"Invalid submission."}`: the submission was deleted.

Step 5 gives `authorsString` "Vajiheh Karbasizaed (Author)". Step 6
answers 200 with the record, but its `authorsString` reads "Vajiheh
Karbasizaed ()" (OMP 14: "Michael Dawson (Author); Brian Dupuis
(Author); Michael Wilson (Author)" becomes "Michael Dawson (); Brian
Dupuis (); Michael Wilson ()"; OPS 19: "Zita Woods (Author)" becomes
"Zita Woods ()"). Step 7 answers 404.

On `stable-3_5_0`, steps 3 and 6 answer 200 with the record steps 2 and
5 gave, on all three apps.

## Cause

`PKP\API\v1\submissions\PKPSubmissionController::delete()` maps the
submission to its record, deletes it, and only then encodes the record
in `response()->json()`
([PKPSubmissionController.php#L980-L984](https://github.com/pkp/pkp-lib/blob/042726ebf6da656b4d3485644d644a0a6fc3b48f/api/v1/submissions/PKPSubmissionController.php#L980-L984)):

```php
$submissionProps = Repo::submission()->getSchemaMap()->map($submission, $userGroups, $genres, $userRoles);

Repo::submission()->delete($submission);

return response()->json($submissionProps, Response::HTTP_OK);
```

The record is not a snapshot. `Submission\DAO::fromRow()` stores the
submission's publications as a `LazyCollection`
([submission/DAO.php#L195-L203](https://github.com/pkp/pkp-lib/blob/042726ebf6da656b4d3485644d644a0a6fc3b48f/classes/submission/DAO.php#L195-L203)),
and the map's `publications` entry is a `->map()` over it
([submission/maps/Schema.php#L524-L526](https://github.com/pkp/pkp-lib/blob/042726ebf6da656b4d3485644d644a0a6fc3b48f/classes/submission/maps/Schema.php#L524-L526)),
so it stays lazy. Each publication is summarized only when
`json_encode()` walks it, which is after the delete. A summary property
that reads the database then finds the rows already gone.

The one that fails is `versionString`
([publication/maps/Schema.php#L206-L207](https://github.com/pkp/pkp-lib/blob/042726ebf6da656b4d3485644d644a0a6fc3b48f/classes/publication/maps/Schema.php#L206-L207)).
For a publication without a version yet, which is every publication not
yet published, `Publication\Repository::getVersionString()` looks the
submission up again to read the context's date format
([Repository.php#L931-L937](https://github.com/pkp/pkp-lib/blob/042726ebf6da656b4d3485644d644a0a6fc3b48f/classes/publication/Repository.php#L931-L937)).
`Repo::submission()->get()` returns null for the deleted submission, and
`$submission->getData('contextId')` throws. A published version carries
its version, so the lookup is skipped and the answer is 200.

The publications and their authors are still in memory at that point.
The map's eager `metadataLocales` property, computed before the delete,
calls `Submission::getPublicationLanguageNames()`, which walks the
publications and, through `Publication::getLanguages()`, each
publication's authors. That fills the DAO caches both lazy collections
read from (`$cache->publications`, and `$cache->authors` with
`remember()`). The contributor roles are another lazy collection
(`Author\DAO::fromRow()`, `setContributorRoles()`,
[author/DAO.php#L155-L158](https://github.com/pkp/pkp-lib/blob/042726ebf6da656b4d3485644d644a0a6fc3b48f/classes/author/DAO.php#L155-L158)),
and the empty brackets in the answer show that nothing reads them
before `authorsString` does, inside the lazy summary, after the roles
are deleted.

The lookup in `getVersionString()` came with `pkp/pkp-lib#10810`
(version support for publications), which added `versionString` to the
publication map; the map-then-delete order in `delete()` is older and
did no harm while nothing in the lazy summary read the database.

Reach:

- The dashboard's bulk delete and the wizard's "Cancel" (`DELETE
  _submissions?ids[]=…`) and the workflow's "Delete" (`DELETE
  _submissions/{id}`, `useWorkflowActions.js`) go through
  `PKPBackendSubmissionsController`, not this handler (code). The
  handler's only ui-library caller, `SubmissionsListItem.vue`, is
  mounted on no page (code).
- `PKPSubmissionController::deletePublication()` follows the same
  order; its top-level properties are computed before the delete, but
  its nested `authors` list is lazy too (code; not walked, and no screen
  sends it).
- `deleteContributor()` and the announcement, highlight, institution
  and email template delete handlers map then delete the same way, but
  their maps hold no lazy collection (code).
- `Publication\DAO::fromRow()` also calls `getVersionString()` without
  the submission, at load time, when the submission still exists (code).

## Proposed fix

Encode the record before the delete, in
`PKPSubmissionController::delete()`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-submission-delete-server-error/fix.diff)).
`response()->json()` encodes its data when the response is built, so
building the response first freezes the record as it was:

```php
$response = response()->json(
    Repo::submission()->getSchemaMap()->map($submission, $userGroups, $genres, $userRoles),
    Response::HTTP_OK
);

Repo::submission()->delete($submission);

return $response;
```

Tried on `main` in OJS, OMP and OPS: both deletes answer 200 with the
record exactly as the `GET` before gave it ("Unassigned version
(2026-10-20)", "Rosanna Rossi (Author)"), and the submissions are
deleted. The submission's author sending the same request is still
refused with 401, and nothing is deleted.

**Alternatives**:

- Pass the map's submission and context to the lookup
  (`Repo::publication()->getVersionString($publication,
  $this->submission, $this->context)` in the publication map): it ends
  the crash and saves a query per unpublished publication, but the
  record would still be read after the delete and keep losing the
  contributors' roles. Worth doing beside the fix, not instead of it.
- Resolve the lazy collections inside the submission map: it changes
  what every list endpoint does for one handler's sake.

**What goes with it**:

- The same reorder in `deletePublication()`, whose nested authors are
  read after its delete.
- No backport: 3.5 and older have no `versionString` lookup.
- A test: an API test deleting an unpublished submission as a manager
  expects 200 and the record's `publications[0].versionString` and
  `authorsString` as a `GET` gave them before the delete.

Small: a reorder in one method, and a test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-submission-delete-server-error/walk.js)
  (helpers in `lib.js` beside it) takes steps 1-7 on an install reset to
  the default dataset, and reads the `submissions` and `publications`
  rows before and after each delete.
- Branch tips: OJS `main` 3109a59114 with pkp-lib f37a174626, OMP `main`
  5777025be and OPS `main` f048e747b4 with pkp-lib 042726ebf6 (the files
  the Cause names are identical in both pkp-lib commits); OJS, OMP, OPS
  `stable-3_5_0` 1e78ca0c2b, cce424e5e, 5eca7fd603 with pkp-lib
  68512b5fda. Default dataset from pkp/datasets 5f247d04 (2026-10-20).
  PostgreSQL; the fault does not depend on the database.
- Walked on `main` in OJS, OMP and OPS, as written: the 500 and the log
  line on each, the submission and publication rows gone after step 3.
  Walked on `stable-3_5_0` in OJS, OMP and OPS: every delete answered 200
  with the record, whose `authorsString` matches the one read before
  the delete (3.5 writes no roles in it).
- Error display: the installs ran with `debug`, `show_stacktrace` and
  `display_errors` Off, as `config.TEMPLATE.inc.php` ships them.
- In-process callers: `Repo::submission()->delete()` itself completes;
  the exception is thrown while `response()->json()` encodes the record
  in the controller (code, and the rows gone after the 500).
- 3.4 (code): `git show upstream/stable-3_4_0` (0012bd1022) and pkp-lib
  `origin/stable-3_4_0` (85f47442cf): `PKPSubmissionHandler::delete()`
  maps, deletes, then encodes, but the publication map has no
  `versionString` and 958592a159 is not on the branch. 3.3 (code): app
  d7d9dd14ec, pkp-lib 867ce82d8e: `PKPSubmissionHandler::delete()` takes
  `getFullProperties()`, plain arrays built before the delete.
- Introduced: `git blame` on `classes/publication/maps/Schema.php`
  L206-L207 and `Repository.php` L928-L937 gives 958592a159 (PR #10810,
  merged 2025-05-29, author defstat), not an ancestor of
  `stable-3_5_0`. `delete()`'s order: L980 8328068d1e (2025-01-17),
  L982 1f48f6e414 (2021-06-03), L984 71e79e31e3 (2023-10-13).
- Upstream: pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops, pkp/ui-library
  searched for the symptom ("delete submission API 500", "getData() on
  null", "unassigned version") and for `getVersionString`,
  `PKPSubmissionController delete`. `pkp/pkp-lib#11900` ("Exception
  while attempting to delete a submission") is a different fault, a
  foreign key on galleys shared between versions.
- Fix trial: `fix.diff` applied to OJS, OMP and OPS `main`, each reset
  and walked, then reverted. The trial ran an earlier form of the script,
  which found each submission through the dashboard's search before and
  after the delete instead of the `GET`s and compared the delete's
  answer with the record the workflow fetches; the requests and the
  fields compared were the same. A second mode of the script
  (`walk.js neighbour`), to show the fix changes no refusal, had the
  author (`rrossi`, `jbrower`, `ccorino`) send the DELETE with
  the fix in and again after the revert: 401 "The current role does not
  have access to this operation." both times, nothing deleted, and the
  editor's workflow version entry and record unchanged.
- Not driven: a draft (incomplete submission) made in the wizard (the
  same unpublished publication without a version; the spec's footnote
  a8 drove one on 2026-10-19 with the same 500), an API key as
  `Authorization: Bearer`, and `deletePublication()`. MySQL not checked.
