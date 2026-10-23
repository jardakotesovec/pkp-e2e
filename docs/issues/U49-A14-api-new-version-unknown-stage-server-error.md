# A program creating a version with a stage the app does not know gets a server error instead of a refusal

- **Severity** low
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no version stages)
  - 3.4: none (code; no version stages)
  - 3.3: none (code; no version stages)
- **Introduced** `pkp/pkp-lib#10810` for `pkp/pkp-lib#10669` · [958592a159](https://github.com/pkp/pkp-lib/commit/958592a15966ca41ce8b02cfe655b74d7f554241) · 2025-05-30 · Dimitris Efstathiou (defstat)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U49 [A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U49-publish-schedule-and-versions.md#a14)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A program can create a new version of a submission through the REST API
(`POST /api/v1/submissions/{id}/publications`), naming the version's
stage by a code in the `versionStage` field. When it sends a code the
app does not have, it should be refused with a message on that field.
Instead the request fails with a server error, and no version is
created.

A journal and a press have three stages: `AO` (Author's Original),
`PMUR` (Published Manuscript Under Review) and `VoR` (Version of
Record). A preprint server has only `AO`. So a preprint server fails on
`PMUR` and `VoR`, and every app fails on any code outside its own set.
The screens' "Create New Version" offers only the app's own stages, so
only a program meets this.

No release has version stages yet, so the missing check can be added
before the first one ships them.

## Impact

- **Lost**: nothing. The version is not created, and sending the
  request again with a valid stage creates it.
- **Who**: a program writing to the REST API as an editor or an
  assistant, such as an import script, or an integration copying
  versions from a journal to a preprint server.
- **Way round**: send one of the app's own codes, or leave
  `versionStage` out for a version without a stage. The API reference
  does not list the codes.

Low: it would rise if an integration were found sending other stages.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`, on
  PostgreSQL. (MySQL and MariaDB are covered under Cause, read in the
  code, not walked.)
- `api_key_secret` set in the install's `config.inc.php` (section
  `[security]`); the dataset leaves it empty, and without it no API key
  can be made.
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
   "Publication" ("Preprint" on OPS) it lists one version.
2. Read the current version's title and abstract:
   `curl -H "Authorization: Bearer $KEY" https://<install>/index.php/publicknowledge/api/v1/submissions/17/publications/18`
3. Create a version, with the title and abstract as read, the section
   key from the table, and `"version": 2`, which the request requires
   although the version's number is in `versionMajor` and `versionMinor`:

   ```
   curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     https://<install>/index.php/publicknowledge/api/v1/submissions/17/publications \
     --data '{"title": <as read>, "abstract": <as read>, "sectionId": 1,
              "version": 2, "versionMajor": 2, "versionMinor": 0, "versionStage": "XYZ"}'
   ```

4. On OPS, send step 3 again with `"versionStage": "VoR"`, then with
   `"PMUR"`.
5. Open the workflow again.

**Expected**: step 3 (and step 4 on OPS) answers 400 with an error on
`versionStage`, as the request answers for any other invalid field, and
step 5 still lists one version:

```
400 {"versionStage":["The selected version stage is invalid."]}
```

**Observed**: step 3 answers `500` in the three apps, and step 4 on OPS
answers `500` for both codes. The server log has:

```
production.ERROR: SQLSTATE[23514]: Check violation: 7 ERROR: new row for relation "publications" violates check constraint "publications_version_stage_check"
```

Step 5 lists the same one version as step 1.

Step 3 with the app's own stage (`"VoR"` on OJS and OMP, `"AO"` on OPS)
answers 200 and adds "Version of Record 2.0" ("Author's Original 2.0"
on OPS) to the workflow.

## Cause

Some of the requests that write `versionStage` check it against the
app's stages, and some do not. The database accepts no other value in
any of them.

`schemas/publication.json` (pkp-lib) gives `versionStage` only
`"validation": ["nullable"]`. The shared schema cannot name the stages,
because each app has its own `APP\publication\enums\VersionStage`:
`AO`, `PMUR` and `VoR` in OJS and OMP, `AO` alone in OPS.
`Repository::validate()` in `classes/publication/Repository.php`
(line 152; its `ValidatorFactory::make()` call on line 159) builds its
rules from that schema alone, so any string passes.

Each app's install migration makes `publications.version_stage` an enum
of its own `VersionStage` cases (`OJSMigration`, `OMPMigration`,
`OPSMigration`). On PostgreSQL that is a check constraint, which refuses
the insert, and the request answers 500.

`PKPSubmissionController::validateVersionStage()` (line 2494) holds the
right rule, `Rule::in(array_column(VersionStage::cases(), 'value'))`.
Three requests call it:

- `changeVersion()`, `PUT …/publications/{id}/version`;
- `getNextAvailableVersion()`;
- `editPublication()`, `PUT …/publications/{id}`, only when the request
  carries both `versionStage` and `versionIsMinor` (line 1405).

`addPublication()` (line 1253) never calls it.

Reach:

- An edit (`PUT …/publications/{id}`) that carries `versionStage` but no
  `versionIsMinor` fails the same way, with a 500 on
  `publications_version_stage_check` (walked on the three apps, on an
  unpublished version).
- MySQL and MariaDB (read in the code, not walked): there the column is
  a native `ENUM('AO','PMUR','VoR')` (`ENUM('AO')` on OPS), and PKP sets
  no `strict` or `modes` for the connection, so the server's own
  `sql_mode` decides. With `STRICT_TRANS_TABLES`, the default of current
  MySQL and MariaDB, the insert is refused and the request answers 500
  as on PostgreSQL. Without it, the server stores an empty string with a
  warning and the request answers 200. `PKPPublication::getVersion()`
  (line 518) then calls `VersionStage::from('')`, which throws a
  `ValueError` wherever that version's number is read.
- "Create New Version" (`versionPublication()`, `POST
  …/publications/{id}/version`, line 1301) turns an unknown stage into
  no stage through `VersionStage::tryFrom()`, and creates a version
  without a stage. The screens send only the app's own stages. The fix
  leaves this as it is; refusing there too is a follow-up for the team
  to decide (code).
- A related gap the fix does not cover: the Native XML import reads
  `version_stage` through `PublicationVersionInfo::fromArray()`, whose
  `VersionStage::from()` throws a `ValueError` on a stage the app does
  not have, such as a journal's `VoR` imported into a preprint server
  (code, not walked).

## Proposed fix

Add the rule the shared schema cannot carry in `Repository::validate()`,
beside the schema's own rules, so the add, the edit and the version
change all apply it
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-new-version-unknown-stage-server-error/fix.diff)):

```diff
+use Illuminate\Validation\Rule;
 …
+        $rules = $this->schemaService->getValidationRules($this->dao->schema, $allowedLocales);
+        // The stage must be one of this application's VersionStage cases: the publications.version_stage
+        // column accepts no other value. The shared schema cannot list them, since they differ per application.
+        $rules['versionStage'][] = Rule::in(array_column(VersionStage::cases(), 'value'));
+
         $validator = ValidatorFactory::make(
             $props,
-            $this->schemaService->getValidationRules($this->dao->schema, $allowedLocales),
+            $rules,
             $this->getErrorMessageOverrides(),
         );
```

`Repository.php` already imports the app's `VersionStage`. Each request
calls `validate()` before it writes anything, so an unknown stage is
refused with 400 and nothing is written. `nullable` still lets a version
without a stage through.

The fix was tried on `main` in the three apps. Step 3, step 4 on OPS
and the edit without `versionIsMinor` then answered `400
{"versionStage":["The selected version stage is invalid."]}`, and no
version was created. With and without the fix, these still worked:
"Create New Version" and the new version's "Publish" ("Post" on OPS) on
screen, the create request with no stage, `null` or each of the app's
own stages, and an edit of the title alone.

The status code is the team's choice. Two requests already refuse an
unknown stage with 422, from `validateVersionStage()`, and answer 400
once the fix is in, because `validate()` runs first (walked on the three
apps):

- `PUT …/publications/{id}/version` (the version change);
- `PUT …/publications/{id}` carrying both `versionStage` and
  `versionIsMinor`.

The message stays the same. To keep 422 there, move those two calls of
`validateVersionStage()` ahead of `validate()`. The only other caller
of `validate()`, OPS's `SubmissionController::relatePublication()`
(`api/v1/submissions/SubmissionController.php:144`), passes only
`relationStatus` and `vorDoi`, so the fix does not change it.

**Alternatives**:

- Call `validateVersionStage()` in `addPublication()` when the stage is
  sent. That leaves the edit without `versionIsMinor` unchecked, and
  puts the rule in two places.
- Give `versionStage` an `in:` rule in each app's own
  `schemas/publication.json`. That is three files to keep in step with
  three enums, where the rule above reads the enum itself.

**What goes with it**:

- A unit test of `Repository::validate()`: `versionStage` `XYZ` (and
  `VoR` on OPS) gives one error; `null` and the app's own stages give
  none.
- The API reference lists the allowed codes for `versionStage`. The
  refusal names only the field ("The selected version stage is
  invalid.", `validator.in`, like every `in` rule in the API). A message
  listing the codes would need a new locale key with a `{$values}`
  placeholder in `getErrorMessageOverrides()`.
- No data repair and no backport: PostgreSQL refused every such value,
  and no release has version stages.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-new-version-unknown-stage-server-error/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 300c68e, 2026-10-22):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/api-new-version-unknown-stage-server-error/walk.js [steps|neighbour]`.
  `steps` sets `api_key_secret` in the install's config, creates
  `dbarnes`'s key on the Profile page, reads the workflow's side menu
  and sends the requests with curl, the two edit requests included.
  `neighbour` is the check of what the fix must leave alone.
- Branch tips checked, on PostgreSQL: main OJS 3cf9aa91a8, OMP
  178e8b34b2, OPS 5091e916d9 (pkp-lib 1f415a07ca, ui-library e47a4887 in
  all three). MySQL and MariaDB were not walked. The Cause's reading
  rests on Laravel's `MySqlGrammar::typeEnum()`, on
  `MySqlConnector::getSqlMode()` (no `sql_mode` set when the config has
  neither `strict` nor `modes`), and on PKP's connection config in
  `PKPContainer`, which sets neither.
- 3.5 walked (OJS 0b1ae35f04, OMP a150eee76b, OPS 18506a5b4d, pkp-lib
  5b54f59ed7; the 3.5 dataset): the same request, with `"version": 2` and
  no `versionMajor`, answers 200 for `XYZ`, `PMUR`, `VoR` and `AO` in the
  three apps and adds a version each time. The code agrees: 3.5's
  `schemas/publication.json` has no `versionStage`, and the publication
  table no stage column, so the value is dropped.
- 3.4 (OJS 3bedd21383, OMP 95fefd0cf0, OPS 47adbcd1e8; pkp-lib
  366030b017) and 3.3 (OJS 06f01c8010, OMP fbe408e8eb, OPS e265883ba4;
  pkp-lib 126b86bc2e), code: `schemas/publication.json` has no
  `versionStage`, and the apps' install migrations no `version_stage`.
- Introduced: blame on `versionStage` in `schemas/publication.json` leads
  to 270015f5b5 (`pkp/pkp-lib#10553`, which only sorted the properties),
  and at its parent to 958592a159, the first commit with the property
  (`git log -S`), which also added `validateVersionStage()`. The GitHub
  API names `pkp/pkp-lib#10810` as its merged PR (2025-05-29, defstat).
  The apps' side of the same work (`pkp/pkp-lib#4860`, Dimitris
  Efstathiou) added the enum columns in the install migrations (OJS
  bf0c4fe5c5, OMP 36edfeaca, OPS eadd8a5ff6) and later the per-app enum
  files (OJS 66361dfdde, OMP a2b461f6f, OPS f839cc39cd, "Separate
  VersionStage enum into OJS, OMP, OPS").
- Upstream search (2026-10-23): pkp/pkp-lib, pkp/ojs, pkp/ops and
  pkp/ui-library, by the symptom's words and by `versionStage`,
  `validateVersionStage` and `publications_version_stage_check`;
  `pkp/pkp-lib#13584` touches the version request for another reason.
- Fix trial: `node bin/try-fix.js apply …/fix.diff ojs omp ops`, then
  `walk.js steps` and `walk.js neighbour` on the three apps, each on a
  freshly loaded dataset; `node bin/try-fix.js revert`, and
  `walk.js neighbour` again on the reverted code.
- Not driven: the Native XML import (code only), and any client sending
  these values today.
