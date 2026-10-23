# REST API: asking a journal for an institution it does not hold answers "200 OK" with an error text

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS (the institution read and the ROR read)
  - 3.5: OJS, OMP, OPS (the institution read and the ROR read)
  - 3.4: none (code; the institution read answers 404, and there is no ROR read)
  - 3.3: none (code; no Institutions page, no ROR read)
- **Introduced** the institution read: `pkp/pkp-lib#9176` for `pkp/pkp-lib#7698` · [71e79e31e3](https://github.com/pkp/pkp-lib/commit/71e79e31e3d5c827e4bfa2443bbe81e5ec4c1dba) · 2023-10-13 · Touhidur Rahman (touhidurabir); the ROR read, new in 3.5 with this fault: `pkp/pkp-lib#10880` for `pkp/pkp-lib#7135` · [d7c67a46fe](https://github.com/pkp/pkp-lib/commit/d7c67a46fee724dfc003eb4b650021b5edb8e915) · 2025-01-31 · Bozana Bokan (bozana)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U66 [A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U66-institutions.md#a13)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A program asks the journal's REST API, as the Journal Manager or the
Site Administrator, for one institution by a number no institution has.
The API answers "200 OK" with a JSON body holding only an `error`
property, "The institution you requested was not found.". A `PUT` or
`DELETE` of the same unknown number answers "404 Not Found".

The read of one ROR record (the registry entries behind the affiliation
fields) answers an unknown number the same way. Authors may call it as
well as editors.

The fix is small: the two read handlers return 404, as edit and delete
already do.

## Impact

- **Lost**: nothing stored. A client that checks only the status treats
  the error body as a record.
- **Who**: programs that read one institution or one ROR record by
  number through the REST API. No screen of the apps sends either read,
  and no plugin shipped with the apps does.
- **Way round**: check the body for an `error` property. For
  institutions, the list also leaves an unknown number out. For ROR
  records the `error` check is the only one, since the list cannot be
  filtered by number.

Low: only programs calling the API meet it, and the body names the
error. It would be medium if a screen or a shipped plugin read one
record by number and acted on the status.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS; OMP and OPS the same, with
  the press or the preprint server for the journal). Its
  `publicknowledge` journal holds no institutions.

Steps:

1. Sign in as `rvaca` (password `rvacarvaca`), the journal manager.
2. Open the Institutions page by its address,
   `/index.php/publicknowledge/en/management/settings/institutions`
   (the side menu hides "Institutions" on the dataset).
3. Press "Add Institution", type "hkq23g Library" in "Name" and press
   "Save". The list shows "hkq23g Library".
4. Open `/index.php/publicknowledge/api/v1/institutions`. The
   institution's `id` is 1.
5. Open the browser's developer tools on the "Network" panel, then open
   `/index.php/publicknowledge/api/v1/institutions/1`. Read the
   request's status there. (Or send the same request with
   `curl -i -b 'OJSSID=<the session cookie>' http://<host>/index.php/publicknowledge/api/v1/institutions/1`;
   the cookie is `OMPSID` on OMP and `OPSSID` on OPS.)
6. In the same way, open
   `/index.php/publicknowledge/api/v1/institutions/999999`. No
   institution on the install has that number.
7. Log out, sign in as `admin` (password `admin`), and repeat step 6.

**Expected**: step 5 answers 200 with "hkq23g Library". Steps 6 and 7
answer 404:

```
GET /index.php/publicknowledge/api/v1/institutions/999999
→ 404 {"error":"The institution you requested was not found."}
```

**Observed**: steps 6 and 7 answer 200 with the same body:

```
GET /index.php/publicknowledge/api/v1/institutions/999999
→ 200 {"error":"The institution you requested was not found."}
```

Nothing is written to the server log. Control: a `DELETE` or a `PUT` of
`/index.php/publicknowledge/api/v1/institutions/999999`, sent from the
browser's console in the same session with the page's CSRF token
(`pkp.currentUser.csrfToken` as `X-Csrf-Token`), answers 404 with the
same body.

The ROR read does the same: as `rvaca`,
`/index.php/publicknowledge/api/v1/rors/999999` (the dataset holds ROR
records 1 to 146716) answers
`200 {"error":"The ror you requested was not found."}`.

## Cause

`PKPInstitutionController::get()` (pkp-lib
`api/v1/institutions/PKPInstitutionController.php`, lines 114–117) checks
`Repo::institution()->exists($id, $contextId)` and, when the journal
does not hold the id, answers
`response()->json(['error' => __('api.institutions.404.institutionNotFound')], Response::HTTP_OK)`.
The locale key itself says 404. The same controller's `edit()` and
`delete()` answer the same miss with `Response::HTTP_NOT_FOUND` (lines
204 and 239), as the other controllers answer a missing item (the
announcement controller's `get()`, line 139, for one).

The line came with 71e79e31e3, which moved the API from Slim to the
Laravel router. The Slim handler it replaced,
`PKPInstitutionHandler::get()`, answered
`$response->withStatus(404)->withJsonError('api.institutions.404.institutionNotFound')`,
and 3.4 still does.

`PKPRorController::get()` (`api/v1/rors/PKPRorController.php`, lines
133–136), added with d7c67a46fe for multiple author affiliations,
copies the same block with `api.rors.404.rorNotFound` and
`Response::HTTP_OK`. Its routes admit managers, section editors,
assistants and authors.

Reach:

- The walk used an id no institution on the install has; in the code,
  another journal's institution gets the same 200 answer with the same
  error body, since `exists()` filters by the request's journal.
- Callers, read in the code: `InstitutionsListPanel.vue` sends the
  list, the add, the edit and the delete; `FieldAffiliations.vue` and
  `FieldFunder.vue` post to `rors`; no file in the three apps' `plugins`
  directories or lib/pkp's names either route.
- No other controller answers an error with `Response::HTTP_OK` (a
  search of lib/pkp `api`, `classes`, `pages` and the three apps' `api`,
  `classes` and `plugins`).

## Proposed fix

Answer the miss with `Response::HTTP_NOT_FOUND` in both controllers
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/institution-unknown-id-answers-success/fix.diff)):

```diff
--- a/lib/pkp/api/v1/institutions/PKPInstitutionController.php
+++ b/lib/pkp/api/v1/institutions/PKPInstitutionController.php
@@ -114,7 +114,7 @@
         if (!Repo::institution()->exists((int) $illuminateRequest->route('institutionId'), $this->getRequest()->getContext()->getId())) {
             return response()->json([
                 'error' => __('api.institutions.404.institutionNotFound')
-            ], Response::HTTP_OK);
+            ], Response::HTTP_NOT_FOUND);
         }
 
         $institution = Repo::institution()->get((int) $illuminateRequest->route('institutionId'));
--- a/lib/pkp/api/v1/rors/PKPRorController.php
+++ b/lib/pkp/api/v1/rors/PKPRorController.php
@@ -133,7 +133,7 @@
         if (!Repo::ror()->exists((int) $illuminateRequest->route('rorId'))) {
             return response()->json([
                 'error' => __('api.rors.404.rorNotFound')
-            ], Response::HTTP_OK);
+            ], Response::HTTP_NOT_FOUND);
         }
 
         $ror = Repo::ror()->get((int) $illuminateRequest->route('rorId'));
```

Tried on `main` on OJS, OMP and OPS. With the fix, steps 6 and 7 and the
ROR read answered 404 with the same bodies, and step 5 still answered
200 with the institution. These checks gave the same answers before and
after the patch, so the fix leaves them alone:

- `rvaca` adds an institution on the Institutions page and reads it
  back on its own (200), and reads ROR record 1 (200).
- A `DELETE` of the unknown id answers 404 and leaves the list as it
  was.
- The section editor `dbuskins` gets 401 for the unknown id and for the
  held one, and a signed-out browser gets 401 for the unknown id.

**Alternatives**

- Fix the institution read alone: the ROR read keeps the same fault,
  and more roles can call it.
- Also restore 3.4's body (`error` holding the key, `errorMessage` the
  text): the other 404s of these controllers and of the announcement
  controller carry `error` alone, so these two reads would answer in a
  different shape from them.

**What goes with it**

- What it touches: an API client asking for an unknown institution or
  ROR record now gets 404 with the same body. No hook is involved, and
  no data needs repair.
- Backport: the diff applies to `stable-3_5_0` as written (a dry run).
  3.4 already answers 404 and has no ROR controller.
- Guard: a `cy.request` check in pkp-lib's
  `cypress/tests/integration/API.cy.js`, which already asserts a status
  that way (`failOnStatusCode: false`, then
  `expect(response.status).to.eq(401)`): ask for an unknown institution
  and an unknown ROR record and expect 404.

Small: one status constant in each of two pkp-lib controllers, and a
Cypress check.

## Evidence

- The script saved in pkp-e2e walks the Steps, the control and the ROR
  read:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/institution-unknown-id-answers-success/walk.js)
  with its helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/institution-unknown-id-answers-success/lib.js).
  From a pkp-e2e checkout, on an install freshly loaded from the default
  dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/institution-unknown-id-answers-success/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5; the argument
  `neighbour` runs the checks listed under Proposed fix).
- Walked on OJS, OMP and OPS on `main` and `stable-3_5_0`, on PostgreSQL
  and PHP 8.3.36, datasets pkp/datasets 300c68e (2026-10-22). Both
  versions gave the same answers. The walk read each status from the
  browser's own response to the typed address. The fault does not touch
  the database, so MySQL was not checked.
- Not checked: plugins outside the three apps (the Plugin Gallery's
  among them) and outside integrations, for callers of the two reads.
- Code reads for 3.4 and 3.3: `origin/stable-3_4_0` and
  `origin/stable-3_3_0` in lib/pkp, `upstream/stable-3_4_0` and
  `upstream/stable-3_3_0` in the apps. On 3.4, the three apps'
  `api/v1/institutions/index.php` serve `PKPInstitutionHandler`
  (line 109 answers 404), and lib/pkp has no `api/v1/rors`. On 3.3,
  lib/pkp has no institution files and the apps no
  `api/v1/institutions`.
- The trace: `git blame` on `PKPInstitutionController.php` lines
  112–122 names 71e79e31e3 for the whole method, and its parent's
  `PKPInstitutionHandler.php` line 109 answered 404. `git blame` on
  `PKPRorController.php` lines 131–137 names d7c67a46fe (committed by
  Gazi Yucel). The GitHub API's `commits/<sha>/pulls` named the PRs.
- Upstream: pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and pkp/ui-library
  searched by the symptom's words (institution not found, 200 instead of
  404, wrong status code) and by `institutionNotFound`, `rorNotFound`
  and `PKPInstitutionController`. Nothing matched; the closest,
  `pkp/pkp-lib#3014` (a wrong status on an authorization failure), is
  another fault.
- Tips. `main`: OJS 3cf9aa91a8, OMP 178e8b34b, OPS 5091e916d9, all with
  lib/pkp 1f415a07ca and ui-library e47a4887. `stable-3_5_0`: OJS
  0b1ae35f04, OMP a150eee76, OPS 18506a5b4d, all with lib/pkp
  5b54f59ed7. `stable-3_4_0`: lib/pkp 366030b017, OJS 3bedd21383, OMP
  95fefd0cf, OPS 47adbcd1e8. `stable-3_3_0`: lib/pkp 126b86bc2e, OJS
  06f01c8010, OMP fbe408e8e, OPS e265883ba4.
