# A program that edits a contributor through the REST API without the contributor type erases their name, email, country and affiliations

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no contributor types)
  - 3.4: none (code; no contributor types)
  - 3.3: none (code; no contributor edit in the REST API)
- **Introduced** `pkp/pkp-lib#11765` for `pkp/pkp-lib#11378` · [52d3a0f8e7](https://github.com/pkp/pkp-lib/commit/52d3a0f8e70659ff8a1507068866a6abdeb8ec90) · 2025-11-11 · jyhein (jyhein)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U41 [A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a31)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The REST API's contributor edit (`PUT …/contributors/{id}`) empties the
contributor when the request does not name the contributor type
("Person", "Organization or group" or "Anonymous"), and answers
success. The given and family names, the email, the country and every
affiliation are blanked, even when the request resends the
affiliations, and the new value it sent is not kept either.

The Contributors list then shows a row with no name, and on a published
item the public page lists an author without a name. Every script
written for 3.5, which has no contributor types, sends exactly such
edits, so after an upgrade it erases each contributor it touches. The
old values are gone; they can only be typed in again.

## Impact

- **Lost**: the contributor's names, email, country and affiliations,
  behind a 200 answer. On a published version the article, book or
  preprint page shows the author without a name, and any DOI deposit
  made after the edit carries none. A version made before the edit
  keeps its own copy (code).
- **Who**: programs that edit contributors with the API key of an
  editor or manager, or of an author whom the editor has allowed to edit
  the submission's metadata (only while the version is unpublished).
  Every script written for 3.5 leaves the type out, since 3.5 has none:
  it keeps working there and erases contributors once the install is on
  this version. No PKP screen or bundled plugin sends such an edit.
- **Way round**: name the type in every edit (`"contributorType":
  "PERSON"`). Nothing in the answer or the API's description says it is
  needed: the edit takes every other field as optional.

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
   `dsokoloff@mailinator.com`, and "University College Cork" under
   "Affiliations". "Close".
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

**Expected**: step 3 answers 200, and step 4 shows "Domatilia Test
Sokoloff" with the email, and "University College Cork" under
"Affiliations".

**Observed**: step 3 answers 200 with `"givenName": {"en": "",
"fr_CA": ""}`, the family name the same, and `"affiliations": []`. In
step 4 the row reads only "Author Primary Contact Edit Delete", and its
"Edit" shows empty "Given Name", "Family Name" and "Email" boxes and no
institution. The database holds an empty email and country, and no
names. The server log has:

```
PHP Warning:  Undefined array key "contributorType" in …/lib/pkp/api/v1/submissions/PKPSubmissionController.php on line 2517
PHP Warning:  Array to string conversion in …/lib/pkp/lib/vendor/laravel/framework/src/Illuminate/Collections/Collection.php …
```

(the second three times). The same request with `"contributorType":
"PERSON"` added keeps everything and saves the new given name (walked
on Dana Phillips, submission 6; OMP Alvin Finkel, submission 2; OPS
Diaga Diouf, submission 4).

On a published item, step 3's edit as `dbarnes` leaves the author
without a name on the public page: OJS article 17 (Vajiheh Karbasizaed,
`…/article/view/17`), OMP book 5 (Chantal Allan, `…/catalog/book/5`),
OPS preprint 2 (Catherine Kwantes, `…/preprint/view/2`).

## Cause

`PKPSubmissionController::removeIrrelevantContributorTypeData()`
(pkp-lib `api/v1/submissions/PKPSubmissionController.php`, line 2517)
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
of every type lands in `$dataToRemove`: the names, email, country, ROR
ID, URL, biography and affiliations. Each is set to null, a multilingual
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
request sends. The method came with contributor types, to clear the
other types' fields when a contributor's type changes, and was written
for the contributor form, which always sends the type.

Reach:

- `editContributor()` on all three apps: the shared pkp-lib controller,
  no app override.
- `addContributor()` (`POST …/contributors`) calls the method the same
  way. An add without the type logs the same warnings, but the required
  rule then refuses it with a 400, so nothing is stored (code).
- A published version: managers, and editors who may open unassigned
  submissions, may edit it on `main` (`Repository::canEditPublication()`),
  so its public page shows the nameless author (walked).
- A type that is sent but unknown (`"FOO"`) takes the same path, since
  `Arr::pull()` returns its null default; the schema gives
  `contributorType` no allowed values, so the write then fails on the
  `contributor_type` column. That is the validation gap of
  [U41-A29](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A29-contributor-unknown-credit-degree-server-error.md),
  whose fix adds `Rule::in(ContributorType::getTypes())`; `validate()`
  then refuses the value before anything is written, so it is left out
  here.
- Other writers of contributors (`Repo::author()->edit()` from the ORCID
  handling, the native import) do not go through this method (code).

## Proposed fix

Proposed: when the edit leaves out the type, take the contributor's
stored type, as the edit keeps every other field it leaves out
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-edit-without-type-empties-contributor/fix.diff)):

```diff
         $params = $this->convertStringsToSchema(PKPSchemaService::SCHEMA_AUTHOR, $illuminateRequest->input());
+        // A request that leaves out the type keeps the contributor's own, as it keeps every other field it leaves out
+        $params['contributorType'] ??= $author->getData('contributorType');
         $submissionContext = $request->getContext();
         // Remove extra data that is irrelevant to the selected contributor type
         $this->removeIrrelevantContributorTypeData($params, $submissionContext);
```

in `editContributor()`, where the contributor is already loaded. Every
stored contributor has a type: the install and the upgrade both default
the column to "PERSON". With the type filled in, the method clears only
the fields that do not belong to that type, which such a contributor
holds empty; a field of another type that the request sends is still
dropped, as it is today when the type is sent.

Tried on `main` in all three apps: step 3 then answered 200 with the
given name "Domatilia Test", the family name, email, country and the
institution kept, and step 4 showed them. The form's own "Save" with a
changed given name, and an edit changing the type to "Organization or
group" (which must still clear the person's names), gave the same
results with the fix in and out.

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
  fields someone saved empty, and its old values are gone.
- [U41-A30](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A30-api-contributor-edit-drops-affiliations.md)
  is a separate fault in the same method: an edit that names the type
  but leaves out the affiliations still removes them.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-edit-without-type-empties-contributor/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 5f247d04, 2026-10-20), modes
  `steps`, `neighbour` and `published`. It sets `api_key_secret` in the
  install's config, creates `dbarnes`'s key on the Profile page, and
  sends the requests with curl. `steps` takes the Steps and the control
  with the type; `neighbour` saves a new given name in the form, then
  changes the control contributor's type to "ORGANIZATION";
  `published` reads the public page, sends step 3's edit on the
  published contributor and reads the page again. The stored rows are
  read after each request; on OMP book 5 the family name "Allan" stays
  on the page only inside the book's synopsis. The `steps` mode writes the given name
  "<given> h21b" where the Steps write "Test".
- Branch tips walked, on PostgreSQL: main OJS 3109a59114 (pkp-lib
  f37a174626), OMP 5777025bec and OPS f048e747b4 (pkp-lib 042726ebf6;
  the controller and the author classes are the same at both pkp-lib
  commits); stable-3_5_0 OJS 1e78ca0c2b, OMP cce424e5e, OPS 5eca7fd603
  (pkp-lib 68512b5fda). MySQL not checked; nothing here depends on the
  database.
- 3.5 walked with the same request: 200, the new given name saved, the
  family name, email, country and the affiliations kept. The code
  agrees: 3.5's `editContributor()` has no
  `removeIrrelevantContributorTypeData()` and its `authors` table no
  `contributor_type` column. 3.4 (pkp-lib 85f47442cf), code: no
  contributor types; `editContributor()` passes the request to
  `Repo::author()->edit()`, which merges it. 3.3 (pkp-lib 867ce82d8e),
  code: no contributor routes in `PKPSubmissionHandler.inc.php`.
- Introduced: blame on `$contributorType = $params['contributorType'];`
  and on both calls of the method gives 52d3a0f8e7, which added them;
  the GitHub API names `pkp/pkp-lib#11765` as its merged PR.
- Fix: tried on `main` (OJS, OMP, OPS) with the script's `steps` with
  the fix and `neighbour` with the fix in and out.
- Not driven: the add request without the type and the unknown type
  (code only), the request with an author's key, and a DOI deposit after
  the edit. Third-party integrations were not searched for.
