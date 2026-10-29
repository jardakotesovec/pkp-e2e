# A program saving a contributor with an unknown CRediT degree or type gets a server error and a half-saved contributor

- **Severity** low
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no CRediT roles, no contributor types)
  - 3.4: none (code; no CRediT roles, no contributor types)
  - 3.3: none (code; no CRediT roles, no contributor types)
- **Introduced** `pkp/pkp-lib#11639` for `pkp/pkp-lib#857` · [036af20d17](https://github.com/pkp/pkp-lib/commit/036af20d176c3dc32d5b36b59c7b41bf5688bcef) · 2025-07-07 · Bozana Bokan (bozana) for the degree; `pkp/pkp-lib#11765` · [52d3a0f8e7](https://github.com/pkp/pkp-lib/commit/52d3a0f8e70659ff8a1507068866a6abdeb8ec90) · 2025-11-11 · jyhein for the contributor type
- **Upstream** none found (2026-10-29)
- **Tracked in** spec U41 [A29](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a29), [A33](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a33)
- **Checked** 2026-10-29, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-29: the same fault also shows when a request sends an unknown contributor type ("person" in lower case), and then every affiliation of the contributor is deleted, even when the request resends them (spec U41 A33, joined here: one cause, one fix). The proposed fix, one validation rule each for the degree and the type in `Repository::validate()`, covers both.

## Summary

The contributor form offers only "Lead", "Equal" and "Supporting" as a
CRediT role's "Degree", or none, and only "Person", "Organization or
group" and "Anonymous" as the "Contributor Type". A program that saves a
contributor through the install's programming interface (the REST API's
contributor edit request) can send any other word ("lead" or "person" in
lower case, for one). The program expects the save to be refused with a
message naming the field, and the contributor to stay as it was.

Instead the save fails with a server error after part of the change is
made. With an unknown degree, the CRediT roles the request lists before
the faulty one take their new degrees, the roles it lists after it are
not saved, and the roles it leaves out are removed. With an unknown
type, every affiliation of the contributor is deleted, even when the
request resends them. Either way the rest of the change, a new given
name for one, is lost.

## Impact

- **Lost**: the change, one contributor per request. The error says
  neither which field was wrong nor what was written. An editor-level
  program can do this to a published version's contributor too; its
  public page and JATS then show the half-changed record (read in the
  code, not tried).
- **Who**: only a program writing to the REST API as an editor, or as
  an author allowed to edit the publication, such as an import script
  or an integration; a native XML import file with an unknown type
  fails the same way (read in the code, not tried). Seen on PostgreSQL.
  On MySQL the two columns are native `ENUM` columns and PKP leaves the
  server's SQL mode as it is: a server in its default strict mode
  refuses the same values, one with strict mode off would store an
  empty value instead (read in the code; MySQL not driven).
- **Way round**: for a degree, send the request again with "LEAD",
  "EQUAL", "SUPPORTING" or no degree; that saves every role and the new
  given name. For a type, the program sends the edit again with
  "PERSON" and the affiliations without their `id`: they are added
  back as new (tried on OJS). An editor can also add the institutions
  again under "Affiliations" in the contributor's "Edit". The API
  reference lists neither value set.

Low: no known client sends such values, and a program can restore the
affiliations itself. It would rise to medium if a client were found
sending them, since the affiliations are then lost on every such edit.

## Steps to reproduce

The steps send the requests a program would send.

Preconditions:

- PKP's default test dataset for `main`, journal `publicknowledge`.
- `api_key_secret` set in the install's `config.inc.php` (section
  `[security]`); the dataset leaves it empty, and without it no API key
  can be made.
- `dbarnes`'s API key: as `dbarnes`, Profile › "API Key" › "Create API
  Key", and copy the key (`$KEY` below).

OJS: submission 7, "Developing efficacy beliefs in the classroom",
publication 8, contributor Domatilia Sokoloff (id 14), affiliation
"University College Cork". [OMP: submission 1, contributor Arthur Clark,
"University of Calgary"; OPS: submission 1, contributor Carlo Corino,
"University of Bologna"; publication 1 and contributor id 1 in both.]

1. Sign in as `dbarnes`, open submission 7, side menu "Contributors",
   "Edit" on Domatilia Sokoloff.
2. Under "CRediT roles and the degrees of contribution", press "Add
   Another Role": a row with the role "Conceptualization". Set its
   "Degree" to "Lead". Press "Add Another Role" again, set the new
   row's role to "Data Curation" and leave its "Degree" empty. "Save".
3. Read the contributor:
   `curl -H "Authorization: Bearer $KEY" https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14`

An unknown degree:

4. Send the record back with `curl -X PUT` to the same address,
   `-H "Content-Type: application/json"`, with the record as read and
   these changes: `contributorRoles` as the roles' ids (`[1]`), the
   fields whose value is `null` left out, and

   ```json
   {"givenName": {"en": "Domatilia h29f", "fr_CA": ""},
    "creditRoles": [
      {"role": "https://credit.niso.org/contributor-roles/conceptualization/", "degree": "EQUAL"},
      {"role": "https://credit.niso.org/contributor-roles/software/", "degree": "lead"}]}
   ```

   The body keeps `"contributorType": "PERSON"` and the `affiliations`
   from the record: an edit without them hits two other faults (see
   the end of Cause).
5. "Edit" on Domatilia Sokoloff again.

An unknown type:

6. Send step 4's body again with Software's degree `"LEAD"`.
7. Send step 6's body once more with `"contributorType": "person"` and
   the given name `"Domatilia h29f2"`. The `affiliations` are still in
   the body as read.
8. "Edit" on Domatilia Sokoloff again.

**Expected**: step 4 answers 400 with an error on
`creditRoles.1.degree`, and step 5 shows what step 2 saved. Step 6
answers 200 and saves the body whole. Step 7 answers 400 with an error
on `contributorType`, and step 8 shows what step 6 saved, "University
College Cork" included.

**Observed**: step 4 answers 500, and the server's error log names the
check constraint `credit_contributor_roles_credit_degree_check`. Step 5
shows "Conceptualization"
"Equal" alone: "Data Curation" is gone and "Software" was not added. The
given name is still "Domatilia", and "University College Cork" is kept.

Step 6 answers 200 and saves it whole: "Conceptualization" "Equal",
"Software" "Lead", the given name "Domatilia h29f".

Step 7 answers 500, and the server's error log names the check
constraint `authors_contributor_type_check`. Step 8 shows the given name "Domatilia h29f" and the
two CRediT roles as step 6 left them, and under "Affiliations" only the
empty search box ("Type the institution name in English"): "University
College Cork" is deleted.

OMP and OPS behave the same with their contributors.

## Cause

The degree and the type a request sends are never checked against the
values the database accepts.

`schemas/author.json` (pkp-lib) declares `creditRoles` with
`"readOnly": true`, because the roles live in their own table
(`credit_contributor_roles`), not in `author_settings`.
`PKPSchemaService::addPropValidationRules()` returns early for a
read-only property, so the schema's validator gets no rule for
`creditRoles` or its `degree`. `contributorType` is declared as a
string whose only rule is `nullable`. `Repository::validate()` in
`classes/author/Repository.php` adds checks of its own for
`contributorRoles` and the competing interests, but none for either
value. The `credit_degree` column accepts only
`CreditRoleDegree::getDegrees()` (LEAD, EQUAL, SUPPORTING) and the
`contributor_type` column only `ContributorType::getTypes()` (PERSON,
ORGANIZATION, ANONYMOUS).

The write then goes through. `author\DAO::update()` runs, in this
order: `Repo::affiliation()->saveAffiliations()`;
`creditContributorRole\Repository::addCreditRoles()`, which deletes the
contributor's CRediT roles the request leaves out, then writes one row
per role in the order sent, `['credit_degree' => $rd['degree'] ??
null]`; `addContributorRoles()`; and last `parent::_update()`, which
writes the contributor's own row and settings. The database refuses the
first unknown degree, or the unknown type at the last write. Nothing
wraps the writes in a transaction, so what was written before the
refusal stays, and the contributor's own row and settings are never
written.

With an unknown type, the handler drops the affiliations from the
request before the writes start. `PKPSubmissionController::editContributor()`
first calls
`removeIrrelevantContributorTypeData()`, which keeps the fields of the
type sent (`Author::CONTRIBUTOR_TYPE_FORM_FIELDS`) and sets every other
type's fields to null. For a type that is not a key of that list,
`Arr::pull()` returns nothing, so every field is nulled, `affiliations`
included. The handler then gives the contributor an empty affiliation
list, and `saveAffiliations()`, the first write, deletes the stored
ones.

Reach:

- Adding a contributor (`PKPSubmissionController::addContributor()`)
  runs the same `validate()`, takes the affiliations out of the
  request, calls `author\DAO::insert()` (the contributor's row, then
  the CRediT roles and the contributor roles), and adds the
  affiliations only after that returns. An unknown type is refused at
  the first write, so nothing is added. An unknown degree stops it in
  the CRediT roles: the new contributor stays in the list with the
  CRediT roles listed before the faulty one, with no contributor role
  (Author, Translator) and with none of its affiliations (read in the
  code, not tried).
- The native XML import writes `contributor_type` from the file through
  `NativeXmlPKPAuthorFilter` and `Repo::author()->add()`, without
  `validate()`; `pkp-native.xsd` types the attribute as any string. A
  file with an unknown type fails there the same way (read in the code,
  not tried; not covered by the fix below). The import carries no
  CRediT roles, and a new version copies the stored ones.
- Neighbouring faults with fixes of their own: an edit that leaves out
  `contributorType` empties the contributor
  ([U41-A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A31-api-contributor-edit-without-type-empties-contributor.md)),
  and one that leaves out the affiliations removes them
  ([U41-A30](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A30-api-contributor-edit-drops-affiliations.md)).
- An unknown CRediT role (`creditRoles.*.role`) is not part of this
  fault: `addCreditRoles()` skips an identifier it does not know and
  saves the rest, with no error. The fix leaves that as it is; refusing
  it too would be a separate decision.

## Proposed fix

Add the rules the schema does not carry in `Repository::validate()`,
beside the checks it already makes there
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/contributor-unknown-credit-degree-server-error/fix.diff)):

```diff
+        $rules = $schemaService->getValidationRules(PKPSchemaService::SCHEMA_AUTHOR, $allowedLocales);
+        // The schema marks creditRoles readOnly (they are stored in their own table), so it adds no
+        // rule for them. Their degree must still be one the credit_degree column accepts, and the
+        // contributor type one the contributor_type column accepts, or the save fails midway.
+        $rules['creditRoles'] = ['nullable', 'array'];
+        $rules['creditRoles.*.degree'] = ['nullable', Rule::in(CreditRoleDegree::getDegrees())];
+        $rules['contributorType'][] = Rule::in(ContributorType::getTypes());
+
         $validator = ValidatorFactory::make(
             $props,
-            $schemaService->getValidationRules(PKPSchemaService::SCHEMA_AUTHOR, $allowedLocales),
+            $rules,
```

(with `use Illuminate\Validation\Rule;` and `use
PKP\author\creditRole\CreditRoleDegree;`). Both the add and the edit
call `validate()` before any write, so a request with an unknown degree
or type is answered 400 and nothing is written; the affiliations nulled
by `removeIrrelevantContributorTypeData()` are never saved. The rule
reads the allowed values from the same enums the columns are built
from, as `AddMediaFiles::rules()` and
`PKPSubmissionController::validateVersionStage()` do with `Rule::in()`
over an enum's cases. The form's empty degree reaches the server as
`null` (Laravel's `ConvertEmptyStringsToNull`), which `nullable`
accepts.

Tried on `main` in the three apps. Step 4 then answered 400 with
`{"creditRoles":{"1":{"degree":["The selected creditRoles.1.degree is invalid."]}}}`
and step 7 with `{"contributorType":["The selected contributor type is
invalid."]}`; steps 5 and 8 showed what steps 2 and 6 saved, the
affiliation included, and the server log had no error. As a neighbour
check, the form's own "Save" (two roles, one without a degree, and a
new given name) and an API edit with the degrees "SUPPORTING" and
`null` and the type "PERSON" stored everything they sent and kept the
affiliation, with the fix in and out.

`removeIrrelevantContributorTypeData()` could also leave the request
alone when the type is not one it knows, so the affiliations do not
depend on `validate()` running before `setAffiliations()`; a one-line
guard worth adding with the rule, not a fix on its own, since the
write would still fail. The fix proposed for
[U41-A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A31-api-contributor-edit-without-type-empties-contributor.md)
(the stored type when a request sends none) touches other lines and a
different case, so the two diffs do not collide.

**Alternatives**:

- Map an unknown degree to none in `addCreditRoles()`
  (`CreditRoleDegree::toValue()`), and an unknown type to the stored
  one. No server error, but the program's "lead" or "person" would be
  dropped without a word.
- Drop `readOnly` from `creditRoles` in the schema and give `degree` an
  `in:` rule there. `readOnly` is also what keeps the DAO from storing
  `creditRoles` in `author_settings`, so this would change the storage,
  not only the validation.

**What goes with it**:

- A unit test of `Repository::validate()` with a degree "lead" and a
  type "person", each expecting one error.
- One transaction around `author\DAO::insert()` and `update()`, so that
  any later database refusal leaves the contributor as it was. It is
  not needed for this fault once the rule is in, and it also covers the
  partial saves of
  [U41-A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A14-one-role-journal-contributor-save-fails.md).
- The native import's `contributor_type` attribute as an
  `enumeration` of the three types in `pkp-native.xsd`, a separate
  small change for the import path.
- The API reference: `creditRoles[].degree` and `contributorType` list
  their allowed values.
- No data repair and no backport: no stored row holds a bad value.

Small: one method and a unit test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/contributor-unknown-credit-degree-server-error/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 2f0edb08, 2026-10-28):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/contributor-unknown-credit-degree-server-error/walk.js [steps|neighbour]`.
  `steps` takes the Steps on each app: it sets `api_key_secret` in the
  install's config, creates `dbarnes`'s key on the Profile page, and
  sends the requests with curl; the stored state is read from the
  database after each step. `wayround` takes the program's way round
  for the type (run on OJS), and `neighbour` is the check of what the
  fix must leave alone. The script records a server error as its
  status and not its answer body; the constraint names in Observed were
  read in the install's server log.
- Step 8 on OJS and OMP was read in a second run of that step alone
  (the script's `s8` mode), on the state the walk left.
- Step 4's body differs from the record the GET returns in two ways,
  both needed for any edit sent back that way, and each filed as a
  report of its own: the GET lists `contributorRoles` as objects
  ([U41-A32, roles](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A32-api-contributor-roles-as-read-server-error.md)),
  and it holds `"orcidVerificationRequested": null`, which the PUT
  refuses ([U41-A32, empty flags](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A32-api-contributor-read-empty-flags-refused.md)).
- Branch tips walked, on PostgreSQL: main OJS 7705b2aeb8, OMP
  3583c1bfd7, OPS 815fbaad1b (pkp-lib df42984b46 in all three). MySQL
  not driven: the columns are built with `$table->enum()`
  (`SubmissionsMigration`, the 3.6.0 upgrade migrations), native `ENUM`
  on MySQL, and `PKPContainer` sets no `strict` key on the connection,
  so the server's SQL mode decides.
- 3.5 walked (OJS 851416bc2d, OMP 50b83d1e67, OPS bd0ef09fd6, pkp-lib
  a6ed3df00a; the same dataset commit): the contributor "Edit" form has
  neither a CRediT field nor a "Contributor Type" in the three apps, so
  the walk stops at step 2. The code agrees: no
  `credit_contributor_roles` table, no `creditRoles` or
  `contributorType` in `schemas/author.json`, no `contributor_type`
  column and no `removeIrrelevantContributorTypeData()`.
- 3.4 (OJS 567c40df4f, OMP 3fd7b430f1, OPS 2e4bf7fd66; pkp-lib
  cbf5446d1b) and 3.3 (OJS bb9835c6e0, OMP 62372ab6eb, OPS 9f42eb0a52;
  pkp-lib fc94a53416), code: `schemas/author.json` has neither
  `creditRoles` nor `contributorType`, and pkp-lib has no CRediT files.
- Introduced: blame on `creditRoles` in `schemas/author.json` (the
  `readOnly` without rules) and on the degree write in
  `addCreditRoles()` leads to 036af20d17 (the first commit of both;
  52d3a0f8e7 later rewrote the write's lines, keeping `$rd['degree'] ??
  null`), merged with `pkp/pkp-lib#11639` (2025-07-16). Blame on
  `contributorType` in the schema and on
  `removeIrrelevantContributorTypeData()` leads to 52d3a0f8e7, merged
  with `pkp/pkp-lib#11765` (2025-11-20).
- Upstream: searched pkp/pkp-lib, pkp/ojs and pkp/ui-library for the
  symptom's words and for `contributorType`, `CreditRoleDegree`,
  `removeIrrelevantContributorTypeData` and the type's column; no
  match.
- Code read for Impact: the published-version case rests on
  `PublicationCanBeEditedPolicy` and `canEditPublication()`, which let
  a manager or an editor with access to unassigned submissions edit a
  published version, and on the public pages and JATS printing the
  stored CRediT roles and affiliations; it was not walked. The way
  round for the type was walked on OJS only (`wayround`): after the
  failed edit, the same record with "PERSON" and the affiliation
  without its `id` answered 200 and stored the affiliation again; an
  affiliation sent with its old `id` is skipped by `saveAffiliations()`
  (read in the code). The API reference is generated from
  `schemas/author.json`, whose `degree` and `contributorType` are plain
  strings.
- Fix trial: `node bin/try-fix.js apply …/fix.diff ojs omp ops`, the
  script's `steps` on the three apps with the fix, `neighbour` with the
  fix in and out (each on a fresh reset), then reverted.
- Not driven: the add request and the native XML import (read in the
  code only), and any client sending these values today.
