# A program that sends a contributor's roles back as the REST API lists them gets a server error, and nothing is saved

- **Severity** low
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no contributor roles)
  - 3.4: none (code; no contributor roles)
  - 3.3: none (code; no contributor edit in the REST API)
- **Introduced** `pkp/pkp-lib#12075` for `pkp/pkp-lib#10263` · [1b5f1a59a5](https://github.com/pkp/pkp-lib/commit/1b5f1a59a53bdcf91ea707e43deefebded58adb2) · 2026-01-12 · Hafsa-Naeem (Hafsa-Naeem)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U41 [A32](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a32)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The REST API's contributor edit (`PUT …/contributors/{id}`) and add
(`POST …/contributors`) answer a server error when the request sends
the contributor's roles ("Author", "Translator") in the shape a read of
the contributor gives them, and nothing is saved. The read lists each
role as a record with its id and name; the edit takes only the ids.

The program gets only "Nested arrays may not be passed to whereIn
method.", with no field named. A program that reads a contributor,
changes it and sends it back meets this on every edit; the affiliations
and CRediT roles, in contrast, are taken in the shape the read gives.

## Impact

- **Lost**: nothing stored; the edit is not applied, and the error does
  not say why.
- **Who**: programs that edit or add contributors with the API key of
  an editor or manager, or of an author whom the editor has allowed to
  edit the submission's metadata (only while the version is
  unpublished). A script written for 3.5 that sends a contributor back
  as read, leaving out its empty fields, works there and gets this 500
  on this version, because the read now carries the roles.
- **Way round**: send `contributorRoles` as the list of the roles' ids
  (`[1]` for "Author" in the default dataset).

Low: nothing is lost and the corrected request saves; the failure is
loud, though its message does not help. Not released yet.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`.
- `api_key_secret` set in the install's `config.inc.php` (section
  `[security]`); the dataset leaves it empty, and without it no API key
  can be made.
- `dbarnes`'s API key: as `dbarnes`, Profile › "API Key" › "Create API
  Key", and copy the key (`$KEY` below).

The contributor, with the role "Author" (id 1) and one affiliation, on
an unpublished version:

| App | Submission | Publication | Contributor (id) | Affiliation |
|---|---|---|---|---|
| OJS | 7 "Developing efficacy beliefs in the classroom" | 8 | Domatilia Sokoloff (14) | University College Cork |
| OMP | 1 "The ABCs of Human Survival: A Paradigm for Global Citizenship" | 1 | Arthur Clark (1) | University of Calgary |
| OPS | 1 "The influence of lactation on the quantity and quality of cashmere production" | 1 | Carlo Corino (1) | University of Bologna |

Steps (OJS's values; the table gives the others):

1. Read the contributor:
   `curl -H "Authorization: Bearer $KEY" https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14`.
   Its `contributorRoles` is a list of records, here one:
   `{"_href": …, "contextId": 1, "contributorRoleIdentifier": "AUTHOR", "id": 1, "name": {…}}`.
2. Send a new given name with the type, the roles and the affiliations
   as step 1 read them. The roles alone give the 500; the affiliations
   are there so that a fixed edit keeps them, since an edit without them
   removes them
   ([U41-A30](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A30-api-contributor-edit-drops-affiliations.md)).

   ```
   curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"contributorType":"PERSON","givenName":{"en":"Domatilia Test","fr_CA":""},
          "contributorRoles":[<the record from step 1>],
          "affiliations":[<the list from step 1>]}' \
     https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14
   ```
3. Sign in as `dbarnes`, open the submission, side menu "Contributors",
   "Edit" on the contributor (OJS submission 7, Domatilia Sokoloff; OMP
   submission 1, Arthur Clark; OPS submission 1, Carlo Corino).

**Expected**: step 2 answers 200, and step 3 shows the new given name
("Domatilia Test"; "Arthur Test", "Carlo Test"), the role "Author" and
the institution from the table.

**Observed**: step 2 answers 500:

```
{"error":"Nested arrays may not be passed to whereIn method."}
```

and the server log has `production.ERROR: Nested arrays may not be
passed to whereIn method.` (an `InvalidArgumentException` from
Laravel's query builder). Step 3 shows the contributor unchanged, with
the role and the institution as before.

The same request with `"contributorRoles": [1]` answers 200 and saves
(walked on Dana Phillips, submission 6; OMP Alvin Finkel, submission 2;
OPS Diaga Diouf, submission 4).

## Cause

`PKPSubmissionController::editContributor()` (pkp-lib
`api/v1/submissions/PKPSubmissionController.php`, the `withRoleIds()`
call at line 1910; in `addContributor()` at line 1756) turns the
request's roles into `ContributorRole` records by their ids:

```php
if (isset($params['contributorRoles']) && is_array($params['contributorRoles'])) {
    $params['contributorRoles'] = ContributorRole::withContextId($submissionContext->getId())
        ->withRoleIds($params['contributorRoles'])
        ->get()->all();
}
```

`ContributorRole::scopeWithRoleIds()` passes the list straight to
`whereIn('contributor_role_id', …)`. A list of records is a nested
array, which Laravel's `whereIn()` refuses with an
`InvalidArgumentException`, so the request ends in a 500 before
anything is validated or written. Nothing checks the shape first:
`schemas/author.json` marks `contributorRoles` `readOnly`, so
`PKPSchemaService::addPropValidationRules()` gives it no rule. The
records come from the API itself: the author schema map
(`classes/author/maps/Schema.php`, `case 'contributorRoles'`) writes
each role through `ContributorRole`'s own map.

How the input was handled before:

- 52d3a0f8e7 (`pkp/pkp-lib#11765`) wrapped the query in a helper,
  `contributorRolesToParams()`, which caught the exception and returned
  no roles: on `main` until 2026-01-15, records gave a 400 for an empty
  role list.
- Then four commits for `pkp/pkp-lib#10263`, written over seven weeks
  and landed together with PR `pkp/pkp-lib#12075` on 2026-01-15.
  e2a5acc790 mapped a record to its `id`, so records were accepted.
  10db66d8e1 moved the mapping to the callers and dropped the `catch`;
  05368b7b5d replaced it with `array_map('intval', …)`.
  1b5f1a59a5 ("Simplify contributor role mapping") removed the
  normalisation, after a review comment that it added no protection
  because `whereIn()` takes any value; nested arrays were not
  considered. From here the request's list reaches `whereIn()` as sent,
  and records give the 500. 18fd524ed0 later inlined the helper.

Reach:

- `editContributor()` and `addContributor()` on all three apps: the
  shared pkp-lib controller, no app override (the edit walked; the add
  by the code).
- The contributor form sends the roles as ids and is not affected.
- Other values that are not ids: a role's identifier (`["AUTHOR"]`)
  reaches the query and fails there with another 500 on PostgreSQL
  (`invalid input syntax for type bigint: "AUTHOR"`). A record whose
  `id` is itself a list (`[{"id": [1]}]`) passes `whereIn()`'s check,
  is bound as 1 and saves with "Author" (walked). A single value is a
  separate fault
  ([U41-A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A14-one-role-journal-contributor-save-fails.md)).
- With the roles fixed, the record sent back exactly as read is still
  refused, for an empty ORCID flag
  ([U41-A32 empty flags](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A32-api-contributor-read-empty-flags-refused.md)).

## Proposed fix

Proposed, pending the question below: take each role by its integer id,
also when it is sent as the read's record, and let anything else match
no role, in both the add and the edit
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-roles-as-read-server-error/fix.diff)):

```diff
         if (isset($params['contributorRoles']) && is_array($params['contributorRoles'])) {
+            // Take each role by its id, also when it is sent as the API's own read lists it ({id, name, ...}).
+            // Anything that is not an integer id matches no role, and an empty list is refused by validate().
+            $roleIds = array_filter(
+                array_map(fn ($role) => filter_var(is_array($role) ? ($role['id'] ?? null) : $role, FILTER_VALIDATE_INT), $params['contributorRoles']),
+                fn ($id) => $id !== false
+            );
             $params['contributorRoles'] = ContributorRole::withContextId($submissionContext->getId())
-                ->withRoleIds($params['contributorRoles'])
+                ->withRoleIds(array_values($roleIds))
                 ->get()->all();
         }
```

`withRoleIds()` then always gets a flat list of integers, as the
review on `pkp/pkp-lib#12075` asked of its argument, and no value is
turned into another role (the risk the review saw in `intval`). A list
with no usable id is refused by `PKP\author\Repository::validate()`
with `{"contributorRoles":["There have to be at least one assigned
contributor role."]}`.

The question for the team: the work on `pkp/pkp-lib#10263` accepted
records (e2a5acc790) and then dropped that support. Why? If the API is meant to take ids only, the first
alternative below is the fix instead; this one follows the affiliations
and CRediT roles, which the edit takes in the shape the read gives.

Tried on `main` in all three apps: step 2 then answered 200 and step 3
showed the new given name with "Author" and the institution. The form's
own "Save" with a new given name still saved with the role "Author",
and an edit with `"contributorRoles": []` was still refused with that
400, with the fix in and out. With the fix, `["AUTHOR"]` and
`[{"id": [1]}]` are refused with that 400 too; without it they answer
the 500 above and a save with "Author".

**Alternatives**:

- Validate `contributorRoles` as a list of integers and answer 400 for
  anything else. No server error, but a program that sends back what it
  read is refused, for a shape the API itself gives.
- Change the read to list the ids. That changes what every API client
  and the contributor form read today.

**What goes with it**:

- A test of `editContributor()` with the roles as the read gives them,
  and with a value that is not an id.
- The two copies of the mapping in `addContributor()` and
  `editContributor()` could go back into one helper.
- No data repair (nothing is written) and no backport (3.5 has no
  contributor roles).

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-roles-as-read-server-error/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 5f247d04, 2026-10-20), modes
  `steps` and `neighbour`. It sets `api_key_secret` in the install's
  config, creates `dbarnes`'s key on the Profile page, and sends the
  requests with curl. `steps` takes the Steps and the control with the
  ids; `neighbour` saves a new given name in the form and sends edits
  with an empty role list, `["AUTHOR"]` and `[{"id": [1]}]`. The stored
  rows, the contributor's roles included, are read after each request.
  The `steps` mode writes the given name "<given> h21b" where the Steps
  write "Test".
- Branch tips walked, on PostgreSQL: main OJS 3109a59114 (pkp-lib
  f37a174626), OMP 5777025bec and OPS f048e747b4 (pkp-lib 042726ebf6;
  the controller and the author and contributor role classes are the
  same at both pkp-lib commits). MySQL not checked; the refusal is
  Laravel's, before any query runs, but what `["AUTHOR"]` answers
  without the fix may differ there.
- 3.5 (OJS 1e78ca0c2b, OMP cce424e5e, OPS 5eca7fd603; pkp-lib
  68512b5fda): the script's read shows no `contributorRoles` in the
  record, and the code has no contributor roles. 3.4 (pkp-lib
  85f47442cf) and 3.3 (pkp-lib 867ce82d8e), code: no contributor roles;
  3.3 has no contributor routes.
- Introduced: blame on `->withRoleIds($params['contributorRoles'])`
  gives 18fd524ed0, which only inlined the helper; `git log -L` on the
  helper and its callers gives the history in Cause (52d3a0f8e7,
  e2a5acc790, 10db66d8e1, 05368b7b5d, 1b5f1a59a5). The GitHub API names
  `pkp/pkp-lib#12075` as the merged PR of e2a5acc790 and 1b5f1a59a5; the
  review comment is on that PR, 2026-01-07.
- Fix: tried on `main` (OJS, OMP, OPS) with the script's `steps` with
  the fix and `neighbour` with the fix in and out.
- Not driven: the add request with roles as records (code only).
