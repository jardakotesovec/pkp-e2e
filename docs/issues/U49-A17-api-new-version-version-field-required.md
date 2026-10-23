# A program creating a version is refused unless it sends a version number the app throws away

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (the version number is a stored field there)
  - 3.4: none (code; the version number is a stored field there)
  - 3.3: none (code; the version number is a stored field there)
- **Introduced** `pkp/pkp-lib#10810` for `pkp/pkp-lib#10669` (`pkp/pkp-lib#4860`) · [958592a159](https://github.com/pkp/pkp-lib/commit/958592a15966ca41ce8b02cfe655b74d7f554241) · 2025-05-30 · Dimitris Efstathiou (defstat)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U49 [A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U49-publish-schedule-and-versions.md#a17)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A program that creates a new version of a submission with `POST
…/submissions/{id}/publications`, sending a title, an abstract and a
section, expects the version to be created. Instead it is refused with
"This field is required." for a field named "version". OJS's API
reference does not list that field, and marks none of the request's
fields as required.

Sending "version" with any number lets the version through, but the
number is dropped: a version is now numbered by its version stage (such
as Version of Record) and a major.minor number, and no version keeps
that field. OMP and OPS ship no API reference.

Only a program meets this: "Create New Version" on screen sends a
different request, `POST …/publications/{id}/version`. No release
carries this code yet, so it can be fixed before the first one that
does.

## Impact

- **Lost**: nothing. The version is not created, and the answer names
  the field.
- **Who**: a program writing to the REST API as an editor or a manager,
  such as an import script or an integration that adds versions, written
  against `main`'s API reference.
- **Way round**: add `"version"` with any number. A program written for
  3.5, which sends it, keeps working.

Low: nothing is lost, and any number sent gets the request through. It
would rise if an integration built on `main`'s API reference were found
failing on it.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`, on
  PostgreSQL.
- `api_key_secret` set to any value in the install's `config.inc.php`
  (section `[security]`); the dataset leaves it empty, and without it no
  API key can be made.
- `dbarnes`'s API key: as `dbarnes`, Profile › "API Key" › "Create API
  Key", and copy the key (`$KEY` below).

The published submission used in each app has one version:

| App | Submission | Current version | Section key |
|---|---|---|---|
| OJS | 17 "Antimicrobial, heavy metal resistance and plasmid profile of coliforms isolated from nosocomial infections in a hospital in Isfahan, Iran" | 18, Version of Record 1.0 | `"sectionId": 1` |
| OMP | 14 "From Bricks to Brains: The Embodied Cognitive Science of LEGO Robots" | 14, Version of Record 1.0 | `"seriesId": 5` |
| OPS | 2 "The Facets Of Job Satisfaction: A Nine-Nation Comparative Study Of Construct Equivalence" | 2, Author's Original 1.0 | `"sectionId": 1` |

OJS's ids are shown below; on OMP and OPS use the ids in the table.

1. Sign in as `dbarnes` and open the submission's workflow. Under
   "Publication" ("Preprint" on OPS) it lists one version, "Version of
   Record 1.0" ("Author's Original 1.0" on OPS).
2. Read the current version's title and abstract. Its answer has
   `versionStage`, `versionMajor`, `versionMinor` and `versionString`,
   and no `version`:
   `curl -H "Authorization: Bearer $KEY" https://<install>/index.php/publicknowledge/api/v1/submissions/17/publications/18`
3. Create a version with step 2's `title` and `abstract` objects as
   they are (every language in them) and the section key from the
   table:

   ```
   curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     https://<install>/index.php/publicknowledge/api/v1/submissions/17/publications \
     --data '{"title": <step 2's title object>, "abstract": <step 2's abstract object>, "sectionId": 1}'
   ```

4. Send step 3 again with `"version": 2` added.
5. Read the version step 4 created (`…/publications/<its id>`).
6. Open the workflow again.

**Expected**: step 3 answers 200 and creates a version without a stage,
and step 6 lists it.

**Observed**: step 3 answers 400 and creates nothing:

```
400 {"version":["This field is required."]}
```

Step 4 answers 200. Step 5's answer has no `version` (the 2 sent is
dropped), `versionStage`, `versionMajor` and `versionMinor` are null,
and `versionString` reads "Unassigned version (2026-10-23)". Step 6
lists that one new version, "Unassigned version (2026-10-23)", above
"Version of Record 1.0".

## Cause

958592a159 (`pkp/pkp-lib#10669` and `#4860`, the version stages) replaced the
publication's `version` property in `schemas/publication.json`
(pkp-lib) with `versionStage`, `versionMajor`, `versionMinor` and
`versionString`, and its migration `I4860_MigratePublicationVersion`
drops the `publications.version` column. It left `version` in the
schema's `required` list (lines 5 to 8), where it has stood since
`pkp/pkp-lib#5356` (ef6a4b2328, 2020):

```json
"required": [
    "submissionId",
    "version"
],
```

`PKPSubmissionController::addPublication()` (line 1253) validates the
request through `Repo::publication()->validate()` (line 1272).
`Repository::validate()` (`classes/publication/Repository.php`, line
165) takes the required list from `PKPSchemaService::getRequiredProps()`
and passes it to `ValidatorFactory::required()`, which, for a new
object, adds "This field is required." for each required property the
request leaves empty (`classes/validation/ValidatorFactory.php`, line
214). So the create is refused without `version`.

Sent, `version` passes validation and is then dropped:
`EntityDAO::_insert()` (line 179) keeps only the schema's properties
(`PKPSchemaService::sanitize()`), and `version` is no longer one. The
apps' own `schemas/publication.json` add `sectionId` to `required` (OJS
and OPS) or nothing (OMP), and none adds a `version` property.

OJS's API reference, built from `docs/dev/swagger-source.json` by
`lib/pkp/tools/buildSwagger.php`, documents the body as
`PublicationEditable`, which is built from the schema's properties: no
`version`, and no `required` list.

Reach:

- `version` is the only entry in any `required` list of the shared or
  the apps' schemas that names no property (all schemas of the three
  apps compared).
- The other three callers of `validate()` edit an existing publication:
  `editPublication()` (`PUT …/publications/{id}`, line 1398),
  `changeVersion()` (`PUT …/publications/{id}/version`, line 1069) and
  OPS's `SubmissionController::relatePublication()` (line 144). For an
  existing object `ValidatorFactory::required()` checks only the fields
  a request sends, so they do not meet this unless a request sends
  `version` empty.
- "Create New Version" sends `POST …/publications/{id}/version`
  (`versionPublication()`), which does not validate through the schema,
  and creates the version (walked on the three apps). No screen sends
  `POST …/publications` (ui-library searched).
- The removed field is still read in two other places, each a separate
  fault with its own fix: OPS's `SendPostedAcknowledgement::handle()`
  chooses the authors' email by it (filed as
  [U49 OPS4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U49-OPS4-first-post-thanked-for-new-version.md)),
  and OJS's `APP\submission\maps\Schema::getPropertyIssueToBePublished()`
  sorts scheduled versions by it, which no longer orders them (code).

## Proposed fix

Drop `version` from the shared schema's `required` list
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-new-version-version-field-required/fix.diff)):

```diff
 	"required": [
-		"submissionId",
-		"version"
+		"submissionId"
 	],
```

No new required field takes its place: a version created without a
stage has neither a stage nor a number (step 5's "Unassigned version").

The fix was tried on `main` in the three apps: step 3 then answered 200
and created "Unassigned version (2026-10-23)", and step 4 did the same.
These behaved the same with and without the fix:

- "Create New Version" on screen created "Version of Record 2.0"
  ("Author's Original 2.0" on OPS);
- an edit of a new version's title alone answered 200;
- a create without a title was refused with an error on `title.en`, and
  on OJS and OPS a create without `sectionId` with an error on
  `sectionId` (without the fix, each answer also names `version`).

The fix keeps `POST …/publications` creating a version as its reference
documents. Whether that request should stay a way to create one at all
(it makes a bare version: no contributors, galleys or stage come from
the current one), or the reference should send integrations to `POST
…/publications/{id}/version`, is an open question for the team.

**Alternatives**:

- Give the schema a `version` property again. That would bring back a
  field the app no longer stores or reads.
- List `version` in the API reference. That documents a field that does
  nothing.

**What goes with it**:

- pkp-lib's
  `PlainLanguageSummaryValidationTest::testNewPublicationWithoutSummaryFails()`
  (`tests/classes/publication/PlainLanguageSummaryValidationTest.php`,
  line 88, added by 1f415a07ca for `pkp/pkp-lib#13584`) sends
  `'version' => 2` to get past this requirement. With the fix that value
  can go; the test passes either way, as it asserts only the
  `plainLanguageSummary` error. Its `Repository` harness is the place
  for the new test: a new publication without `version` gives no error
  on `version`.

Small: one line in the shared schema, one in an existing test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-new-version-version-field-required/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 300c68e, 2026-10-22):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/api-new-version-version-field-required/walk.js [steps|neighbour]`.
  `steps` sets `api_key_secret` in the install's config, creates
  `dbarnes`'s key on the Profile page, reads the workflow's side menu
  before and after, and sends the requests with curl. `neighbour` is the
  check of what the fix must leave alone.
- Branch tips checked, on PostgreSQL: main OJS 3cf9aa91a8, OMP
  178e8b34b2, OPS 5091e916d9 (pkp-lib 1f415a07ca, ui-library e47a4887 in
  all three).
- 3.5 walked (OJS 0b1ae35f04, OMP a150eee76b, OPS 18506a5b4d, pkp-lib
  5b54f59ed7; the 3.5 dataset): `version` is an integer property there
  ("Version numbers should typically be set automatically…", `min:1`),
  required and stored. Step 3 is refused the same way, which is the
  intended rule there; step 4 creates a version with `version: 2`, and
  step 5 reads it back.
- 3.4 (pkp-lib 366030b017) and 3.3 (pkp-lib 126b86bc2e), code:
  `schemas/publication.json` has the `version` property and lists it as
  required (3.3 with `locale` and `title` too).
- Introduced: blame on line 7 of `schemas/publication.json` gives
  ef6a4b2328 (`pkp/pkp-lib#5356`, 2020), when `version` was a property;
  `git log -S'"version"'` on the file names 958592a159 as the only later
  change to it, which removed the property and left the `required`
  entry; its message names `pkp/pkp-lib#4860` throughout.
- Upstream search (2026-10-23): pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library, by the symptom's words ("publication version
  required", "This field is required" with "version") and by
  `addPublication`, `publication.json` and `versionMajor`; no issue or
  PR about this fault.
- Fix trial: `fix.diff` applied to the three apps, `walk.js steps` and
  `walk.js neighbour` walked, then `neighbour` again with it reverted.
- Not driven: MySQL (the fault is in validation and does not depend on
  the database), and any client sending this request today.
