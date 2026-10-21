# A program that changes one field of a contributor through the REST API silently removes all their affiliations

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; the affiliation is a text field the edit keeps)
  - 3.3: none (code; no contributor edit in the REST API)
- **Introduced** `pkp/pkp-lib#10880` for `pkp/pkp-lib#7135` · [d7c67a46fe](https://github.com/pkp/pkp-lib/commit/d7c67a46fee724dfc003eb4b650021b5edb8e915) · 2025-01-31 · Bozana Bokan (bozana), the PR's author; the commit's author is GaziYucel
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U41 [A30](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a30)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The REST API's contributor edit (`PUT …/contributors/{id}`) removes
every affiliation of the contributor when the request does not include
the affiliations, and answers success. Every other field the request
leaves out is kept, so a program that corrects one field, such as a
given name, expects the institutions to stay.

The loss is silent and can only be undone by adding each institution
again. It hits programs written for 3.4, where the same edit kept the
affiliation, and programs that follow the API's own schema, which marks
the affiliations as read-only. On a published version the institutions
disappear from the public page too.

## Impact

- **Lost**: every institution of the contributor. The answer is 200;
  only its `"affiliations": []` shows the loss. On a published version
  they also go from the article, book or preprint page, and from any
  DOI deposit made after the edit. A version made before the edit keeps
  its own copy (code).
- **Who**: programs that edit contributors with the API key of an
  editor or manager, or of an author whom the editor has allowed to edit
  the submission's metadata (only while the version is unpublished).
  A script written for 3.4 that changes a contributor's name or email
  now loses the institutions on 3.5 with no change of its own. No PKP
  screen or bundled plugin sends such an edit.
- **Way round**: send the affiliations back as a `GET` of the
  contributor gives them. Nothing in the API says so: the schema marks
  them read-only.

Medium: data on public pages is lost silently behind a success answer,
in an edit that worked on 3.4, and there is a way round once known. It
would be high if a widely used integration were found sending such
edits; none was looked for outside PKP's own code.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (3.5: `stable-3_5_0`, the same
  ids), context `publicknowledge`.
- `api_key_secret` set in the install's `config.inc.php` (section
  `[security]`); the dataset leaves it empty, and without it no API key
  can be made.
- `dbarnes`'s API key: as `dbarnes`, Profile › "API Key" › "Create API
  Key", and copy the key (`$KEY` below).

The contributor, with one affiliation, on an unpublished version:

| App | Submission | Publication | Contributor (id) | Affiliation |
|---|---|---|---|---|
| OJS | 7 "Developing efficacy beliefs in the classroom" | 8 | Domatilia Sokoloff (14) | University College Cork |
| OMP | 1 "The ABCs of Human Survival: A Paradigm for Global Citizenship" | 1 | Arthur Clark (1) | University of Calgary |
| OPS | 1 "The influence of lactation on the quantity and quality of cashmere production" | 1 | Carlo Corino (1) | University of Bologna |

Steps (OJS's values; the table gives the others):

1. Sign in as `dbarnes`, open submission 7, side menu "Contributors",
   "Edit" on Domatilia Sokoloff. "Affiliations" lists "University
   College Cork". "Close".
2. Change the given name. The body names the contributor type
   ("PERSON"): without it the edit empties the whole contributor, a
   separate fault
   ([U41-A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A31-api-contributor-edit-without-type-empties-contributor.md)).

   ```
   curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"contributorType":"PERSON","givenName":{"en":"Domatilia Test"}}' \
     https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14
   ```

   [3.5 has no contributor types: the body is
   `{"givenName":{"en":"Domatilia Test"}}`.]
3. Reload the page, "Contributors", "Edit" on "Domatilia Test Sokoloff".

**Expected**: step 2 answers 200, and step 3 shows "Domatilia Test",
"Sokoloff" and the email as before, and "University College Cork" under
"Affiliations".

**Observed**: step 2 answers 200 with the new given name and
`"affiliations": []`. Step 3 shows the new name, the family name and the
email, and under "Affiliations" only the empty search box ("Type the
institution name in English"). On 3.5 the server log also has
`PHP Warning:  Undefined array key "affiliations"` and `PHP Warning:
foreach() argument must be of type array|object, null given` (line
1795 of `PKPSubmissionController.php`).

The same edit with `"affiliations"` copied from a `GET` of the
contributor keeps the institution (walked on Dana Phillips, submission
6; OMP Alvin Finkel, submission 2; OPS Diaga Diouf, submission 4).

On a published item, the same edit as `dbarnes` takes the institution
off the public page: OJS article 17 (Vajiheh Karbasizaed, "University of
Tehran", `…/article/view/17`), OMP book 5 (Chantal Allan, "University of
Southern California", `…/catalog/book/5`), OPS preprint 2 (Catherine
Kwantes, "University of Windsor", `…/preprint/view/2`), on `main` and
3.5.

## Cause

`PKPSubmissionController::editContributor()` (pkp-lib
`api/v1/submissions/PKPSubmissionController.php`) builds the
affiliations from `$params['affiliations'] ?? []` and always calls
`$author->setAffiliations($affiliations)` (line 1940; 3.5 line 1814). A
request that leaves the key out sets an empty list. `author\DAO::update()`
then calls `Repo::affiliation()->saveAffiliations()`, which for an empty
list returns early through `deleteByAuthorId()` and deletes every stored
affiliation of the contributor.

Every other field is kept: `Repo::author()->edit()` merges the request
into the stored contributor (`array_merge($author->_data, $params)`), and
the CRediT roles and contributor roles left out keep the stored ones,
which `DAO::fromRow()` loads lazily.

`schemas/author.json` marks `affiliations` `"readOnly": true` (it is
stored in its own table). A client that follows the schema therefore
leaves the list out of every edit and loses it each time. The list
handling came with multiple affiliations (`pkp/pkp-lib#7135`), written
for the contributor form, which always sends the list. Before it, the
affiliation was a text field of the contributor, kept by the merge like
the rest.

Reach:

- `editContributor()` on all three apps: the shared pkp-lib controller,
  no app override.
- `addContributor()` (`POST …/contributors`) reads the list the same
  way, which is right there: a new contributor has nothing to keep. On
  3.5 it reads `$params['affiliations']` without `?? []` (line 1639), so
  an add without affiliations logs a PHP warning there (code).
- A published version: managers, and editors who may open unassigned
  submissions, may edit it on `main` and 3.5
  (`Repository::canEditPublication()`), so its public page and later DOI
  deposits lose the institutions (walked on the public pages; deposits
  by the code, `ArticleCrossrefXmlFilter::appendAffiliationsNode()`).
- The contributor form is not affected: it always sends `affiliations`,
  an empty value when the list is empty, which
  `convertStringsToSchema()` turns into `[]`.
- No other controller replaces a sub-list this way: a search of `api/`
  and `classes/` for `setAffiliations(` and `$params[...] ?? []` finds
  only these two methods. No bundled plugin and no ui-library code
  other than the contributor form calls the contributor edit.

## Proposed fix

Proposed: replace the affiliations only when the request names them
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-edit-drops-affiliations/fix.diff)):

```diff
-        $author->setAffiliations($affiliations);
+        // A request that leaves out the affiliations keeps them, as it keeps every other field it leaves out
+        // (an empty list, or the null that removeIrrelevantContributorTypeData() sets, still removes them all)
+        if (array_key_exists('affiliations', $params)) {
+            $author->setAffiliations($affiliations);
+        }
```

The contributor then keeps its stored affiliations, as it keeps its
CRediT roles and contributor roles. An empty list still removes them
all, and so does the `null` that `removeIrrelevantContributorTypeData()`
sets on `main` when the type changes to "Anonymous". The guard holds
only for an edit that names the type: without it that method sets
`affiliations` to null on `main`, the key is present, and the list is
still emptied; that is
[U41-A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A31-api-contributor-edit-without-type-empties-contributor.md),
whose fix this one needs beside it.

Tried on `main` in all three apps: step 2 then answered 200 with the
affiliation kept, and step 3 showed it. Removing the institution on
screen ("Click to edit or delete" › "Remove institution" › "Yes",
"Save") and an edit sending `"affiliations": []` still removed it, with
the fix in and out.

**Alternatives**:

- Refuse an edit without `affiliations` with a 400. Every other field
  may be left out, and the schema calls this one read-only, so the
  refusal would contradict the API's own description.
- Document that the list must always be sent. That means changing the
  schema's `readOnly` too, and leaves the silent loss for every program
  written before.

**What goes with it**:

- A test of `editContributor()`: an edit with only a given name keeps
  the affiliations; one with `[]` removes them.
- Backport to 3.5: the same guard, plus `?? []` on
  `$params['affiliations']` in `editContributor()` (line 1795) and
  `addContributor()` (line 1639), which ends the warnings.
- The schema's description of `affiliations` could say that an edit
  replaces the list when it is sent.
- No data repair: what was removed cannot be told from an intended
  removal.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-edit-drops-affiliations/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 5f247d04, 2026-10-20), modes
  `steps`, `neighbour` and `published`. It sets `api_key_secret` in the
  install's config, creates `dbarnes`'s key on the Profile page, and
  sends the requests with curl. `steps` takes the Steps and the control;
  `neighbour` removes the institution on screen and sends an edit with
  an empty list; `published` reads the public page, sends step 2's edit
  on the published contributor and reads the page again. The stored
  rows are read after each request. The script's `steps` mode writes
  the given name "<given> h21b" where the Steps write "Test".
- Branch tips walked, on PostgreSQL: main OJS 3109a59114 (pkp-lib
  f37a174626), OMP 5777025bec and OPS f048e747b4 (pkp-lib 042726ebf6;
  the controller and the author and affiliation classes are the same at
  both pkp-lib commits); stable-3_5_0 OJS 1e78ca0c2b, OMP cce424e5e,
  OPS 5eca7fd603 (pkp-lib 68512b5fda). MySQL not checked; nothing here
  depends on the database.
- 3.4 (pkp-lib 85f47442cf), code: `editContributor()` in
  `PKPSubmissionHandler.php` passes the request to
  `Repo::author()->edit()`, which merges it, and `schemas/author.json`
  holds `affiliation` as a multilingual string. 3.3 (pkp-lib
  867ce82d8e), code: `PKPSubmissionHandler.inc.php` has no contributor
  routes.
- Introduced: blame on `$author->setAffiliations($affiliations);` in
  `editContributor()` gives d7c67a46fe, which added the list handling to
  both methods; the GitHub API names `pkp/pkp-lib#10880` as its merged
  PR (2025-02-06). The `?? []` on `main` came later with a47e9df7b6
  (`pkp/pkp-lib#11389`), which kept the replacement.
- Fix: tried on `main` (OJS, OMP, OPS) with the script's `steps` with
  the fix and `neighbour` with the fix in and out; not tried on 3.5.
- Not driven: the request with an author's key, and a DOI deposit after
  the edit (the Crossref filter read only). Third-party integrations
  were not searched for.
