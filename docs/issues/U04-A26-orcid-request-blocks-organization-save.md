# Adding a contributor fails when ORCID verification was requested and the type then changed from Person

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no "Contributor Type")
  - 3.4: none (code; no "Contributor Type")
  - 3.3: none (code; no "Contributor Type")
- **Introduced** `pkp/pkp-lib#13624` for `pkp/pkp-lib#11972` · [19ca682321](https://github.com/pkp/pkp-lib/commit/19ca6823215ebedddaf56b902473b4e28bc7a32e) · 2026-11-20 · Antti-Jussi Nygård (ajnyga)
- **Upstream** none found (2026-11-27)
- **Tracked in** spec U04 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U04-orcid-integration.md#a26)
- **Checked** 2026-11-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On "Add Contributor", with ORCID enabled, a user presses "Request
verification" under "ORCID iD" for a Person and confirms. If they then
change "Contributor Type" to "Organization or group" or "Anonymous",
"Save" is refused: "The form was not saved because 1 error(s) were
encountered.", and at the form's foot "Go to ORCID iD: ORCID
verification can only be sent to a person.". That type's form has no
ORCID iD field, so nothing on it can be corrected.

Switching back to "Person" does not help: the field reads "Request
verification", but "Save" stays disabled, even with the person's names
and email filled in. The contributor can only be added by closing the
form and starting again without the request.

No release carries it: the refusal came with a change merged on
2026-11-23.

## Impact

- **Lost**: what was typed on the form. Nothing is stored or sent.
- **Who**: anyone who adds contributors (an editor, an author in the
  submission wizard) and changes the type after requesting
  verification. Editing a saved contributor is not affected. An unusual
  order of actions.
- **Way round**: close the form and add the contributor again without
  pressing "Request verification". The error points at a field the
  form does not show, so a user may not think of it.

Low: the refusal is shown, and adding the contributor again saves it.
It would be medium if the form held work that took long to type, such
as a long biography and several affiliations.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OJS. OMP and OPS are the same
  with the submission in brackets.
- ORCID is on: as `dbarnes`, Settings › Users & Roles › "ORCID", tick
  "Enable ORCID functionality", "ORCID API" "Member Sandbox", any Client
  ID and Client Secret, "Save".

Steps:

1. As `dbarnes`, open submission 3, "The Facets Of Job Satisfaction: A
   Nine-Nation Comparative Study Of Construct Equivalence" [OMP: 7,
   "Accessible Elements: Teaching Science Online and at a Distance";
   OPS: 1, "The influence of lactation on the quantity and quality of
   cashmere production"], Publication › "Contributors", "Add
   Contributor".
2. With "Contributor Type" "Person", under "ORCID iD" press "Request
   verification", then "Yes" in the window "Request ORCID verification".
3. Choose "Contributor Type" "Organization or group"; "Organization
   Name" "Org u04hk04a", "Country" "Canada", tick "Author" under
   "Contributor Roles".
4. Press "Save".
5. Choose "Person" again, and look at the ORCID iD field.
6. Choose "Organization or group" again and press "Save".
7. Choose "Person" again; fill "Given Name" "Pia", "Family Name"
   "Person-u04hk04a", "Email address" "pia.u04hk04a@mailinator.com";
   look at "Save".

**Expected**: step 4 saves the organization, with no verification
request, since only persons are asked. Had it not, step 7 would save a
Person with the request.

**Observed**: `POST …/api/v1/submissions/3/publications/4/contributors`
(OMP `…/7/publications/7/…`, OPS `…/1/publications/1/…`) sends
`contributorType=ORGANIZATION` with `orcid=shouldRequestVerification`
and answers 400:

```
{"orcid":["ORCID verification can only be sent to a person."]}
```

The form stays open with the notice "The form was not saved because 1
error(s) were encountered. Please correct these errors and try again."
and the foot "Please correct one error. Go to ORCID iD: ORCID
verification can only be sent to a person. Jump to next error"; no
field on the form shows an error. At step 5 the field reads "Request
verification". Step 6 sends the same request and gets the same 400. At
step 7 "Save" is disabled. Nothing is stored.

## Cause

For a contributor not yet saved, ui-library
`src/components/Form/fields/FieldOrcid.vue` `includePostSaveEmailRequest()`
records the request as the field's value, `shouldRequestVerification`.
pkp-lib `classes/components/forms/FieldOrcid.php` `getConfig()` makes
the field non-inert when there is no `authorId`, on purpose, so that
`Form.vue` `submitValues()` sends that value with the add, and
`PKPSubmissionController::addContributor()` turns it into the request
once the contributor exists.

Changing "Contributor Type" hides the field (its `showWhen` is
`ContributorType::getTypesWithOrcid()`, Person alone), but its value is
still sent. The server is meant to discard what the chosen type does
not use: `PKPSubmissionController::removeIrrelevantContributorTypeData()`
nulls every field `Author::CONTRIBUTOR_TYPE_FORM_FIELDS` lists for the
types not chosen and not for the chosen one (an organization's given
name, for example). `orcid` is in none of those lists, so the request
reaches `addContributor()` with the new type, where `pkp/pkp-lib#13624`
refuses it (lines 1785–1787):

```php
if ($shouldSendOrcidEmail && !in_array($params['contributorType'] ?? null, ContributorType::getTypesWithOrcid())) {
    return response()->json(['orcid' => [__('api.orcid.400.personOnly')]], Response::HTTP_BAD_REQUEST);
}
```

The error is keyed to `orcid`, the hidden field, so the form lists it at
its foot with nowhere to show it. The form keeps "Save" disabled while
that error stands, and only a change to the ORCID iD field would clear
it. With "Person" chosen again the field is mounted anew and reads
"Request verification" (its `verificationRequested` starts from the
stored state), while the form's value is still
`shouldRequestVerification`. In `pkp/pkp-lib#11972`'s discussion the
refusal was meant for API clients ("in the UI only for persons, but
possible via the API for other types"); the form sends it too.

Reach:

- The add form wherever `ContributorForm` is used: the workflow's
  "Contributors" and the submission wizard. "Organization or group" and "Anonymous" alike (walked:
  the workflow, "Organization or group").
- Editing a saved contributor: not reached. `FieldOrcid` sends an
  existing contributor's request at once
  (`orcid/requestAuthorVerification`), so the edit form never carries
  `shouldRequestVerification`, and `Repo::author()->validate()` refuses
  any `orcid` an edit sends (`api.orcid.403.cannotUpdateAuthorOrcid`).
- Before `pkp/pkp-lib#13624` the same value was not refused: the
  organization was saved and sent the ORCID request email.

## Proposed fix

Discard the request with the other fields the chosen type does not use,
in `removeIrrelevantContributorTypeData()`, and drop the refusal this
makes unreachable
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/orcid-request-kept-after-type-change/fix.diff),
pkp-lib only):

```diff
--- a/lib/pkp/api/v1/submissions/PKPSubmissionController.php
+++ b/lib/pkp/api/v1/submissions/PKPSubmissionController.php
@@ -1782,10 +1782,6 @@
             return response()->json($errors, Response::HTTP_BAD_REQUEST);
         }
 
-        if ($shouldSendOrcidEmail && !in_array($params['contributorType'] ?? null, ContributorType::getTypesWithOrcid())) {
-            return response()->json(['orcid' => [__('api.orcid.400.personOnly')]], Response::HTTP_BAD_REQUEST);
-        }
-
         $affiliationParams = $params['affiliations'] ?? [];
         unset($params['affiliations']);
 
@@ -2576,6 +2572,12 @@
                     ? (isset($params[$key]) ? array_map(fn ($_) => null, $params[$key]) : $nulledMProp)
                     : null;
             });
+
+        // The ORCID iD field shows only for the types that can hold an iD, so a verification
+        // request it left on the form before the type was changed belongs to none of the others.
+        if (!in_array($contributorType, ContributorType::getTypesWithOrcid())) {
+            unset($params['orcid']);
+        }
     }
 
     /**
```


Tried on `main` on OJS, OMP and OPS: step 4 saved the organization
(200), with no ORCID request stored and no job queued. A Person added
with "Request verification" was still saved and sent "Requesting ORCID
record access", and an organization added without a request was saved,
with the fix in and out.

- **Where the rule lives.** `removeIrrelevantContributorTypeData()` is
  where both `addContributor()` and `editContributor()` discard what
  the chosen type does not use, so the request is dropped for every
  caller.
- **How the code base does it.** That method already nulls the other
  types' fields, and the form relies on it: "Contributor Type" warns
  that information entered before a type change "will not be saved".
- **Every instance.** `orcid` is the one field the form sends for a
  type that cannot use it with no entry in `CONTRIBUTOR_TYPE_FORM_FIELDS`.
  A near miss of the same list: `rorId` sits under `PERSON` as well as
  `ORGANIZATION`, though the form shows it for Organization only, so a
  ROR ID typed for an organization survives a change to Person (spec
  U41's [A4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a4)
  notes it). Removing `rorId` from `PERSON` would cover it, but it is a
  separate fault, not part of this diff.
- **What the introducing change was for.** Only persons get ORCID
  verification requests. That holds without the 400:
  `SendAuthorMail::handle()` and `OrcidController::requestAuthorVerification()`
  both return early for a type other than Person since the same change,
  so no email reaches an organization. A stored iD is not touched: the
  discussion ruled out removing one on a type change, and
  `Repo::author()->validate()` still refuses that change while an iD is
  held (`author.contributorType.orcidMustBeRemoved`).
- **What it touches.** The contributors API, in both directions it is
  called: an add naming a type other than Person with any `orcid`
  value, `shouldRequestVerification` or an iD, is saved without it
  instead of answering 400; an edit (`PUT`) naming such a type with an
  `orcid` value is saved with the value dropped instead of answering
  400 `cannotUpdateAuthorOrcid`. Persons are unchanged. No stored data;
  nothing to backport.
- **The guard.** pkp-lib has no test of the contributors API; an e2e
  test that requests verification on "Add Contributor", changes the
  type, saves, and asserts the contributor saved with no ORCID email.

**For the team**: the fix gives up the explicit 400 an API client gets
today for a request on a type other than Person, which
`pkp/pkp-lib#11972`'s discussion asked for. Keeping it means fixing the
form instead (the first alternative).

**Alternatives**:

- Keep the refusal and stop the form sending the hidden field's value
  (clearing `FieldOrcid`'s value when the type hides it): two
  repositories, and a field that writes the form's values as it is
  hidden, where every other type-specific field relies on the server.
- Key the refusal to `contributorType` so the form shows it under a
  visible field: the user could then save only as a Person, the
  opposite of what they chose.

**What goes with it**: optionally, `FieldOrcid`'s `verificationRequested`
could start from a value of `shouldRequestVerification`, so that
choosing "Person" again reads "ORCID Verification has been requested!",
which is what saving as a Person then does. Not part of the tried diff.

Small: one condition in one pkp-lib method, the unreachable refusal
removed, and a test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/orcid-request-kept-after-type-change/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/orcid-request-kept-after-type-change/lib.js)
  takes the steps above; `WALK_MODE=neighbour` adds a Person with
  "Request verification" and an organization without one.
- Walked 2026-11-27 on PKP's default test dataset (pkp/datasets
  98360bca), PostgreSQL, each walk on a freshly reset install: steps
  1–6 on `main`, all three apps; step 7 on OJS (where "Save" was also
  read as disabled with "Person" chosen straight after step 4). On 3.5
  the walk stops after step 2. "Anonymous" was not walked; the same
  line refuses it.
- Fix trial: each app's walk run with
  [fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/orcid-request-kept-after-type-change/fix.diff)
  applied, and the neighbour run with it and without it.
- `main` tips: OJS d37c63cc7c, OMP 39fc76c2be, OPS ae2f3c5026 (pkp-lib
  44b36bf802 in all three; ui-library 0549a357 in OJS, 836c01b5 in OMP
  and OPS). `stable-3_5_0` tips: OJS 810ed373fe, OMP d1c296edb5, OPS
  ac52b25153 (pkp-lib db49f73866). 3.4 (pkp-lib 762235e120) and 3.3
  (pkp-lib 486ca25dac) read with `git show`: 3.4's `ContributorForm`
  has an ORCID text box and no type; 3.3's contributor form is the
  legacy author form.
- Trace: `git blame` on the refusal gives 19ca682321, merged by
  `pkp/pkp-lib#13624` (merge d03b7729f6, 2026-11-23).
  `removeIrrelevantContributorTypeData()` and
  `CONTRIBUTOR_TYPE_FORM_FIELDS` come from 52d3a0f8e7 ("Contributor
  Roles and Type", `pkp/pkp-lib#11765`, 2025-11-20), which never listed
  `orcid`.
- Before the change: the spec's probe of 2026-11-24 (OMP `05c0fee47`,
  OPS `a80a5decc1`, without it, ORCID's public API) saw the
  organization saved and sent "Submission ORCID", the public API's
  request email; with the Member API the request email is "Requesting
  ORCID record access".
- `pkp/pkp-lib#11972`'s discussion: the refusal for API clients was
  proposed on 2026-11-10; on 2026-11-11 a stored iD left by a type
  change was noted as not covered by
  `removeIrrelevantContributorTypeData()`, which led to refusing the
  type change instead.
