# A program that edits a contributor through the REST API without the contributor type erases the contributor's names, email, country, biography, homepage URL and affiliations

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no contributor types)
  - 3.4: none (code; no contributor types)
  - 3.3: none (code; no contributor edit in the REST API)
- **Introduced** `pkp/pkp-lib#11765` for `pkp/pkp-lib#11378` · [52d3a0f8e7](https://github.com/pkp/pkp-lib/commit/52d3a0f8e70659ff8a1507068866a6abdeb8ec90) · 2025-11-11 · jyhein (jyhein)
- **Upstream** none found (2026-10-29)
- **Tracked in** spec U41 [A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a31)
- **Checked** 2026-10-29, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-29: walked again on `main` and 3.5 with the contributor's
"Preferred Public Name", "Homepage URL" and "Bio Statement" filled in
first: the edit erases those three too. A type that is sent but is not
one of the install's types fails with a server error and deletes the
affiliations; that is U41
[A33](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a33),
tracked in [pkp-e2e#978](https://github.com/jardakotesovec/pkp-e2e/issues/978)
(U41 A29's report), whose fix covers it. The proposed fix now fills in
the type only when the request leaves the key out, so a type sent empty
stays refused.

## Summary

The REST API's contributor edit (`PUT …/contributors/{id}`) empties the
contributor when the request does not name the contributor type
("Person", "Organization or group" or "Anonymous"), and answers
success. The given, family and preferred public names, the email, the
country, the "Bio Statement", the "Homepage URL" and every affiliation
are blanked, even when the request resends the affiliations. The new
value the request sends is not saved either.

The Contributors list then shows a row with no name, and on a published
item the public page lists an author without a name. Every script
written for 3.5, which has no contributor types, sends exactly such
edits, so on 3.6 (the release `main` becomes) it erases each
contributor it touches. The values are gone from the edited version:
they can be copied back by hand from an earlier version of the
submission where one exists, and otherwise only typed in again.

## Impact

- **Lost**: everything the Summary lists, behind a 200 answer. On a
  published version the article, book or preprint page shows the author
  without a name, and any DOI deposit made after the edit carries none.
- **Who**: programs that edit contributors with the API key of a
  manager or an editor, or of anyone assigned to the submission whose
  assignment may change its metadata; an author only while the version
  is unpublished. No PKP screen or bundled plugin sends such an edit.
- **Way round**: name the type in every edit
  (`"contributorType": "PERSON"`), and send the affiliations again as
  read, since an edit that leaves them out removes them
  ([U41-A30](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A30-api-contributor-edit-drops-affiliations.md)).
  Nothing in the answer or the API's description says either is needed: the edit takes every other field as optional.

Medium: a contributor's identity is erased silently, on public pages
too, by scripts that worked on the previous version, and there is a way
round once known. That `main` is not released yet makes it cheaper to
fix, not less severe. It would be high if a widely used integration were
found editing contributors; none was looked for outside PKP's own code.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`.
- `api_key_secret` set in the install's `config.inc.php` (section
  `[security]`); the dataset leaves it empty, and without it no API key
  can be made.
- `dbarnes`'s API key: as `dbarnes`, Profile › "API Key" › "Create API
  Key", and copy the key (`$KEY` below).

The contributor, with one affiliation, on an unpublished version:

| App | Submission | Publication | Contributor (id) | Email | Affiliation (id) |
|---|---|---|---|---|---|
| OJS | 7 "Developing efficacy beliefs in the classroom" | 8 | Domatilia Sokoloff (14) | dsokoloff@mailinator.com | University College Cork (9) |
| OMP | 1 "The ABCs of Human Survival: A Paradigm for Global Citizenship" | 1 | Arthur Clark (1) | aclark@mailinator.com | University of Calgary (1) |
| OPS | 1 "The influence of lactation on the quantity and quality of cashmere production" | 1 | Carlo Corino (1) | ccorino@mailinator.com | University of Bologna (1) |

Steps (OJS's values; the table gives the others):

1. Sign in as `dbarnes`, open submission 7, side menu "Contributors",
   "Edit" on Domatilia Sokoloff: "Domatilia", "Sokoloff",
   `dsokoloff@mailinator.com`, "Ireland", and "University College Cork"
   under "Affiliations". Type "h29e Public Name" in "Preferred Public
   Name", `https://example.org/h29e` in "Homepage URL" and "h29e
   biography" in "Bio Statement" (English), and "Save". The row now
   reads "h29e Public Name".
2. Read the contributor:
   `curl -H "Authorization: Bearer $KEY" https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14`
3. Send a new given name and the `affiliations` array exactly as step 2
   returned it, without the type (on OMP and OPS the array holds that
   app's ids, from the table):

   ```
   curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"givenName":{"en":"Domatilia Test","fr_CA":""},
          "affiliations":[{"authorId":14,"id":9,"name":{"en":"University College Cork","fr_CA":""},"ror":null,"rorObject":null}]}' \
     https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14
   ```
4. Reload the page, "Contributors"; "Edit" on the contributor's row.

**Expected**: step 3 answers 200, and step 4 shows "Domatilia Test"
and "Sokoloff" with the preferred public name, the email, the homepage
URL, the country and the biography of step 1, and "University College
Cork" under "Affiliations".

**Observed**: step 3 answers 200 with
`"givenName": {"en": "", "fr_CA": ""}`, the family name the same, and
`"affiliations": []`. In step 4 the row reads only "Author Primary
Contact Edit Delete". Its
"Edit" shows empty "Given Name", "Family Name", "Preferred Public
Name", "Email", "Homepage URL" and "Country" boxes, an empty "Bio
Statement" ("0/2 languages completed") and no institution. The database
holds an empty email, and no names, country, biography or URL. The
server log has:

```
PHP Warning:  Undefined array key "contributorType" in …/lib/pkp/api/v1/submissions/PKPSubmissionController.php on line 2524
PHP Warning:  Array to string conversion in …/lib/pkp/lib/vendor/laravel/framework/src/Illuminate/Collections/Collection.php …
```

(the second three times). After the same step 1, the same request with
`"contributorType": "PERSON"` added keeps everything and saves the new
given name (walked on Dana Phillips, submission 6; OMP Alvin Finkel,
submission 2; OPS Diaga Diouf, submission 4).

On a published item, the same edit without the type (a new given name
only) as `dbarnes` leaves the author without a name on the public
page: OJS article 17 (Vajiheh Karbasizaed,
`…/article/view/17`), OMP book 5 (Chantal Allan, `…/catalog/book/5`),
OPS preprint 2 (Catherine Kwantes, `…/preprint/view/2`).

## Cause

`PKPSubmissionController::removeIrrelevantContributorTypeData()`
(pkp-lib `api/v1/submissions/PKPSubmissionController.php`, line 2524)
takes the type from the request only:

```php
$contributorType = $params['contributorType'];
// … ($nulledMProp: every form locale mapped to null)
$typeFields = Author::CONTRIBUTOR_TYPE_FORM_FIELDS;
$selectedTypeField = Arr::pull($typeFields, $contributorType);
$dataToRemove = collect($typeFields)->flatten()->diff($selectedTypeField)->unique();
```

With the key missing, `$contributorType` is null, and `Arr::pull()`
with a null key returns the whole array of every type's fields instead
of one type's. `diff()` then compares field names with arrays (the
"Array to string conversion" warnings), removes none, and every field
of every type lands in `$dataToRemove` (all of
`Author::CONTRIBUTOR_TYPE_FORM_FIELDS`): the given, family and preferred
public names, the organization name, the email, the country, the ROR
ID, the URL, the biography and the affiliations. Each is set to null, a multilingual
one to null in every locale, and `Repo::author()->edit()` saves those.
For the affiliations the path is different: `editContributor()` loops
over `$params['affiliations'] ?? []`, now null, calls
`$author->setAffiliations([])`, and `author\DAO::update()` then deletes
them in `Repo::affiliation()->saveAffiliations()`. The list the request
sent is never read.

`editContributor()` calls the method before validating, and
`Repo::author()->validate()` does not catch the missing type: the schema
lists `contributorType` as required, but on an edit
`ValidatorFactory::required()` checks only the required fields the
request sends: a request that sends the type empty (`null`) is refused
with 400 `{"contributorType":["This field is required."]}` and changes
nothing, while one that leaves the key out passes.

`removeIrrelevantContributorTypeData()` came with contributor types, to
clear the other types' fields when a contributor's type changes. It was
written for the contributor form, which always sends the type.

Reach:

- `editContributor()` on all three apps: the shared pkp-lib controller,
  no app override.
- `addContributor()` (`POST …/contributors`) calls the method the same
  way. An add without the type logs the same warnings, but the required
  rule then refuses it with a 400, so nothing is stored (code).
- A published version: managers and editors who may open unassigned
  submissions may edit it on `main`, and so may anyone assigned in a
  role other than author whose assignment may change the metadata
  (`Repository::canEditPublication()`). Its public page then shows the
  nameless author (walked).
- A type that is sent but is not one of the install's types
  (`"person"` in lower case) takes the same path, since `Arr::pull()`
  returns its null default. The schema gives `contributorType` no
  allowed values, so `validate()` passes it, `author\DAO::update()`
  deletes the affiliations, and the update of the `authors` row then
  fails the check on the `contributor_type` column: a server error, the
  affiliations gone (walked). This server error is tracked as
  [U41-A33](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a33),
  in [U41-A29's report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A29-contributor-unknown-credit-degree-server-error.md).
  That report's fix adds `Rule::in(ContributorType::getTypes())`, so
  `validate()` refuses such a value before anything is written. The fix
  below does not reach it: it fills in the type only when the key is
  missing.
- Other writers of contributors (`Repo::author()->edit()` from the ORCID
  handling, the native import) do not go through this method (code).

## Proposed fix

Proposed: when the edit leaves out the type key, take the contributor's
stored type, as the edit keeps every other field it leaves out
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-edit-without-type-empties-contributor/fix.diff)):

```diff
         $params = $this->convertStringsToSchema(PKPSchemaService::SCHEMA_AUTHOR, $illuminateRequest->input());
+        // A request that leaves out the type keeps the contributor's own, as it keeps every other field it leaves out;
+        // a type sent empty is still refused by validate()
+        if (!array_key_exists('contributorType', $params)) {
+            $params['contributorType'] = $author->getData('contributorType');
+        }
         $submissionContext = $request->getContext();
         // Remove extra data that is irrelevant to the selected contributor type
         $this->removeIrrelevantContributorTypeData($params, $submissionContext);
```

in `editContributor()`, where the contributor is already loaded. Every
stored contributor has a type: the install and the upgrade both default
the column to "PERSON". With the type filled in, the method clears only
the fields that do not belong to that type, which such a contributor
holds empty; a field of another type that the request sends is still
dropped, as it is today when the type is sent. A type sent empty
(`null`) is left as it is, so `validate()` still refuses it with 400;
`??=` would fill that in too and save the edit under the stored type.

Tried on `main` in all three apps: step 3 then answered 200 with the
given name "Domatilia Test", and the family name, preferred public
name, email, country, biography, homepage URL and institution were
kept; step 4 showed them all. Three neighbours gave the same results
with the fix in and out: the form's own "Save" with a changed given
name; an edit changing the type to "Organization or group", which must
still clear the person's names; and an edit sending the type as `null`
with a new email, refused with 400 "This field is required." and
nothing changed.

**Alternatives**:

- Return early from `removeIrrelevantContributorTypeData()` when no
  type is sent. One line that also quiets `addContributor()`, but an
  edit sending another type's field would then store it.
- Refuse an edit without the type with a 400. The edit takes every
  other field as optional, and requiring this one would break every
  script written for 3.5, which has no type to send.

**What goes with it**:

- A test of `editContributor()`: an edit with only a given name keeps
  the names, email, country and affiliations of a "Person" contributor.
- Optionally the early return in `removeIrrelevantContributorTypeData()`
  as well, so that an add without the type is refused without the PHP
  warnings.
- No data repair: an emptied contributor cannot be told from one whose
  fields someone saved empty, and its old values survive only in an
  earlier version, where one exists.
- [U41-A30](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A30-api-contributor-edit-drops-affiliations.md)
  is a separate fault in the same method: an edit that names the type
  but leaves out the affiliations still removes them.

Small: a few lines in the shared controller, and a test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-edit-without-type-empties-contributor/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 2f0edb08, 2026-10-28), modes
  `steps`, `neighbour` and `published`:
  `PROBE_FEATURE=<feature> node bin/probe.js all <walk.js> steps` after
  `npm run fleet-prep -- --feature <feature> --dataset <n> --reset`. It
  sets `api_key_secret` in the install's config, creates `dbarnes`'s key
  on the Profile page, and sends the requests with curl. `steps` takes
  the Steps (step 1 on the form, typing the biography into the "Bio
  Statement" editor) and the control with the type, after the same step
  1; `neighbour` saves a new given name in the form, changes the
  control contributor's type to "ORGANIZATION", and sends the type
  empty (`null`) with a new email; `published` reads the
  public page, sends a new given name without the type for the
  published contributor and reads the page again. The stored rows are read after each request; on
  OMP book 5 the family name "Allan" stays on the page only inside the
  book's synopsis.
- Branch tips walked, on PostgreSQL: main OJS 7705b2aeb8, OMP
  3583c1bfd7, OPS 815fbaad1b (pkp-lib df42984b46); stable-3_5_0 OJS
  851416bc2d, OMP 50b83d1e67, OPS bd0ef09fd6 (pkp-lib a6ed3df00a). MySQL
  not checked; nothing here depends on the database.
- 3.5 walked with the same Steps: step 3 answered 200, the new given
  name was saved, and the family and preferred public names, email,
  country, biography, homepage URL and affiliation were kept. The code
  agrees: 3.5's `editContributor()` has no
  `removeIrrelevantContributorTypeData()` and its `authors` table no
  `contributor_type` column. 3.4 (pkp-lib cbf5446d1b, OJS 567c40df4f),
  code: no contributor types; `editContributor()` in
  `PKPSubmissionHandler.php` passes the request to
  `Repo::author()->edit()`, which merges it. 3.3 (pkp-lib fc94a53416,
  OJS bb9835c6e0), code: no contributor routes in
  `PKPSubmissionHandler.inc.php`.
- Introduced: blame on `$contributorType = $params['contributorType'];`
  and on both calls of the method gives 52d3a0f8e7, which added them;
  the GitHub API names `pkp/pkp-lib#11765` as its merged PR.
- Fix: `node bin/try-fix.js apply <fix.diff> ojs omp ops`, then the
  script's `steps`, and its `neighbour` with the fix in and again after
  the revert.
- Recovery from an earlier version, code: `Repo::publication()->version()`
  clones each author into new rows of the new version, so an edit of
  the latest version leaves the earlier versions' contributors as they
  were.
- The type sent empty and the unknown type (`"person"`): walked on
  `main` (OJS, OMP, OPS) on 2026-10-29 by
  `shared/playwright/checks/U41/H29/h29.js`, on the same tips and
  dataset.
- Not driven: the add request without the type (code only), the request
  with an author's key, and a DOI deposit after the edit. Third-party
  integrations were not searched for.
