# A program that sends back a contributor exactly as the REST API returned it is refused over an empty field it never set

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OMP (code; the volume-editor flag)
  - 3.3: none (code; no contributor edit in the REST API)
- **Introduced** `pkp/pkp-lib#10407` for `pkp/pkp-lib#10389` · [0b5bd6977f](https://github.com/pkp/pkp-lib/commit/0b5bd6977f263dec1505b3a5e0fd16a53fb87bb6) · 2024-09-12 · Taslan Graham (taslangraham); on a press the volume-editor flag is older (Evidence)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U41 [A32](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a32)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The REST API's contributor edit (`PUT …/contributors/{id}`) refuses a
contributor sent back as a read returned it, with one field changed:
"This field must be true or false." for `orcidVerificationRequested`,
the field that says whether ORCID verification was requested. The read
itself gives that field as `null` for every contributor whose ORCID was
never requested. On a press in 3.5 and 3.4 the volume-editor field
(`isVolumeEditor`) is refused the same way.

The whole edit is refused; nothing is changed. The fix is to accept
`null` for these flags.

## Impact

- **Lost**: nothing stored; the attempted edit is not applied. The
  refusal names the field.
- **Who**: programs that edit or add contributors with the API key of
  an editor or manager, or of an author whom the editor has allowed to
  edit the submission's metadata (only while the version is
  unpublished), by reading a contributor and sending the record back. A
  script written that way for 3.4 is refused on 3.5 with no change of
  its own, since the flag came with 3.5.
- **Way round**: leave out of the record the fields whose value is
  `null`.

Low: the refusal is clear, nothing is lost, and the way round is
simple.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (3.5: `stable-3_5_0`, the same
  ids), context `publicknowledge`.
- `api_key_secret` set in the install's `config.inc.php` (section
  `[security]`); the dataset leaves it empty, and without it no API key
  can be made.
- `dbarnes`'s API key: as `dbarnes`, Profile › "API Key" › "Create API
  Key", and copy the key (`$KEY` below).
- A contributor with no ORCID, on an unpublished version. The edit
  always refuses a record that carries an ORCID (`orcid` cannot be
  changed through it), so such a contributor never goes back as read.
  The dataset's contributors below have none:

| App | Submission | Publication | Contributor (id) |
|---|---|---|---|
| OJS | 7 "Developing efficacy beliefs in the classroom" | 8 | Domatilia Sokoloff (14) |
| OMP | 1 "The ABCs of Human Survival: A Paradigm for Global Citizenship" | 1 | Arthur Clark (1) |
| OPS | 1 "The influence of lactation on the quantity and quality of cashmere production" | 1 | Carlo Corino (1) |

Steps (OJS's values; the table gives the others):

1. Read the contributor:
   `curl -H "Authorization: Bearer $KEY" https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14 > contributor.json`.
   It holds `"orcidVerificationRequested": null` (on a press in 3.5
   also `"isVolumeEditor": null`).
2. In `contributor.json`, change `givenName.en` to "Domatilia Test".
   [`main`: also replace each record in `contributorRoles` with its
   `id`; the records as read get a server error, a separate fault, see
   Cause.]
3. Send it back:
   `curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d @contributor.json https://<install>/index.php/publicknowledge/api/v1/submissions/7/publications/8/contributors/14`
4. Sign in as `dbarnes`, open the submission, side menu "Contributors",
   "Edit" on the contributor.

**Expected**: step 3 answers 200, and step 4 shows the new given name
("Domatilia Test"; "Arthur Test", "Carlo Test") with everything else as
before.

**Observed**: step 3 answers 400:

```
{"orcidVerificationRequested":["This field must be true or false."]}
```

(on a press in 3.5 also `"isVolumeEditor":["This field must be true or
false."]`). Step 4 shows the old given name.

The same record without the fields whose value is `null` answers 200
and saves the new given name (walked on Dana Phillips, submission 6;
OMP Alvin Finkel, submission 2; OPS Diaga Diouf, submission 4).

## Cause

`schemas/author.json` (pkp-lib) declares `orcidVerificationRequested`
as a boolean with no `validation`, so
`PKPSchemaService::getValidationRules()` gives it Laravel's `boolean`
rule alone, which refuses `null`. The read fills the field from
`$author->getData('orcidVerificationRequested')`, which is null until
an ORCID verification is requested (`OrcidController` and
`addContributor()` then set it to true). So the read gives a value the
edit refuses. The neighbouring `orcidIsVerified` has `"validation":
["nullable"]` and goes back as it is read.

On a press, OMP's own `schemas/author.json` holds `isVolumeEditor` in
3.5 and 3.4: a boolean without `nullable`, null for a contributor never
marked. OMP `main` no longer has that field; volume editors are a
contributor role there.

Reach:

- `editContributor()` and `addContributor()` (`POST …/contributors`) on
  all three apps: both run `PKP\author\Repository::validate()` with the
  schema's rules (the edit walked on `main` and 3.5; the add by the
  code).
- The contributor form does not send the field and is not affected.
- The rest of the record goes back as read, with two limits: a set
  `orcid` is always refused (`Repository::validate()` adds
  `api.orcid.403.cannotUpdateAuthorOrcid`), and the six `readOnly`
  properties (`affiliations`, `contributorRoles`, `creditRoles`,
  `fullName`, `submissionLocale`, `orcidDisplayValue`) get no rule, so
  any value passes the validator. The other booleans pass:
  `includeInBrowse` has a default (true), `orcidIsVerified` is
  `nullable` (code).
- On `main` the record as read fails first, with a server error, on its
  `contributorRoles`
  ([U41-A32 roles](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U41-A32-api-contributor-roles-as-read-server-error.md));
  this fault shows once the roles are sent as ids.

## Proposed fix

Proposed: let the field be `null`, as its neighbour `orcidIsVerified`
is
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-read-empty-flags-refused/fix.diff)):

```diff
 		"orcidVerificationRequested": {
 			"type": "boolean",
-			"apiSummary": false
+			"apiSummary": false,
+			"validation": [
+				"nullable"
+			]
 		},
```

A `null` value deletes the setting, which is what a contributor never
asked for verification holds already, so nothing changes for it. A value
that is neither true, false nor `null` is still refused. A program that
sends `null` for a contributor whose verification was requested clears
the flag, as `false` does today.

Tried on `main` in all three apps: step 3 then answered 200 and step 4
showed the new given name, nothing else changed. An edit sending
`"orcidVerificationRequested": "maybe"` was still refused, and the
form's own "Save" still saved, with the fix in and out.

**Alternatives**:

- Have the read give `false` instead of `null`. It changes what every
  API client reads, and an unset flag would read as a decision.
- Mark the field `writeDisabledInApi`, since only the ORCID handling
  should set it. On its own that changes nothing here: the contributor
  add and edit never call `getWriteDisabledErrors()` (only the
  submission add and edit do), and the validator does not read the
  flag. With that call added, the record sent back would be refused by
  name, which still does not make the round trip work.

**What goes with it**:

- Backport to 3.5: the same line in pkp-lib, and `"validation":
  ["nullable"]` on `isVolumeEditor` in OMP's `schemas/author.json`
  (also on 3.4, where OMP has the same field; whether a 3.4 record sent
  back meets other refusals first was not checked).
- A test that sends back a contributor with no ORCID as read and
  expects 200.
- No data repair.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/api-contributor-read-empty-flags-refused/walk.js)
  with `lib.js` beside it, run on an install freshly loaded from PKP's
  default test dataset (pkp/datasets 5f247d04, 2026-10-20), modes
  `steps` and `neighbour`. It sets `api_key_secret` in the install's
  config, creates `dbarnes`'s key on the Profile page, and sends the
  requests with curl. `steps` takes the Steps and the control without
  the null fields; `neighbour` sends "maybe" for the flag and saves a
  new given name in the form. The stored rows are read after each
  request. The `steps` mode writes the given name "<given> h21b" where
  the Steps write "Test". Every contributor it uses reads `"orcid":
  null`.
- Branch tips walked, on PostgreSQL: main OJS 3109a59114 (pkp-lib
  f37a174626), OMP 5777025bec and OPS f048e747b4 (pkp-lib 042726ebf6;
  `schemas/author.json` and the controller are the same at both pkp-lib
  commits); stable-3_5_0 OJS 1e78ca0c2b, OMP cce424e5e, OPS 5eca7fd603
  (pkp-lib 68512b5fda). MySQL not checked; the refusal is the
  validator's, before any query.
- 3.4, code: pkp-lib 85f47442cf's `schemas/author.json` has no
  `orcidVerificationRequested` (its only boolean, `includeInBrowse`, has
  a default); OMP's `schemas/author.json` on `upstream/stable-3_4_0`
  (e30fa7e38) has `isVolumeEditor` as on 3.5, without `nullable`. Not
  walked. 3.3 (pkp-lib 867ce82d8e): no contributor routes.
- Introduced: `git log -S'"orcidVerificationRequested"'` on
  `schemas/author.json` gives 0b5bd6977f as the commit that added the
  field (blame agrees); the GitHub API names `pkp/pkp-lib#10407` as its
  merged PR (2024-09-20). OMP's `isVolumeEditor` comes from ce205d5836
  (`pkp/pkp-lib#2072`, 2019), older than the contributor edit in the
  REST API (3.4).
- Fix: tried on `main` (OJS, OMP, OPS) with the script's `steps` with
  the fix and `neighbour` with the fix in and out; OMP's 3.5 line not
  tried (no such field on `main`).
- Not driven: the add request (code only).
