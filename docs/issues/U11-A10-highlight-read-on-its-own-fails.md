# REST API: a journal's highlights, announcements and institutions link to the site-level API, where one highlight cannot be read

- **Severity** low
- **Effort** small
- **Kind** regression (the server error; the links are older)
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS (the Site Administrator's highlight request answers 500 in the role check, before the highlight code runs)
  - 3.4: OJS, OMP, OPS (code; highlights on OJS only, behind the unlisted `[features] highlights` setting)
  - 3.3: none (code; an announcement's link names its journal, and there are no highlights or institutions)
- **Introduced**
  - the server error: no PR, for `pkp/pkp-lib#13512` · [07bc43fe67](https://github.com/pkp/pkp-lib/commit/07bc43fe6732e0da9d486cea432ac9898d0603ab) · 2026-10-16 · Alec Smecher (asmecher); on `stable-3_5_0` [092ec34b0f](https://github.com/pkp/pkp-lib/commit/092ec34b0ff6242a3fd9c4c63109f7d45096f259)
  - the links: `pkp/pkp-lib#7064` for `pkp/pkp-lib#5328` · [1f48f6e414](https://github.com/pkp/pkp-lib/commit/1f48f6e4148b410d9e5b731e17e54a751f5ca3b4) · 2021-06-03 · Nate Wright (NateWr)
- **Upstream** none found (2026-11-09)
- **Tracked in** spec U11 [A10](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U11-highlights.md#a10), spec U12 [A19](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U12-announcements.md#a19), spec U66 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U66-institutions.md#a12)
- **Checked** 2026-11-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

**Update 2026-11-09.** Reading one highlight at the journal's API
address now works on `main` and in OJS, OMP and OPS 3.5.0-6, since
07bc43fe67 (092ec34b0f on 3.5). That change made the same request at
the site-level API address fail on the server, for every highlight,
which this report now covers in place of the journal's address. The
links are as they were.

## Summary

Through the REST API, each highlight, announcement and institution of a
journal comes with a link (its `_href`) that points at the site-level
API address instead of the journal's. Following it, the Journal Manager
is refused with 401 for all three. The Site Administrator gets 400 for
an announcement, 401 for an institution, and a server error (500) for a
highlight.

That server error answers every request for one highlight by its id at
the site-level address, the site's own highlights included. The site's
list of highlights still works.

The journal's own address reads each of the journal's items, and the
apps' own screens never read one of these items on its own. The fix is
a line in each of two shared files.

## Impact

- **Lost**: nothing stored. Each failed highlight request logs a
  server error.
- **Who**: programs that use the highlights, announcements or
  institutions through the REST API and read one item by its link or
  its id.
- **Way round**: read the list, the journal's or the site's, which
  carries every property of each item; or, for a journal's item, build
  the address from the journal's path and the id.

Low: no user of the apps meets it. It would be medium if a screen or a
shipped plugin read one of these items on its own.

## Steps to reproduce

The steps add the items on screen, then type the REST API's addresses
into the same signed-in browser.

Preconditions:

- PKP's default test dataset for `main` (OJS; OMP and OPS the same, with
  "Press" or "Server" for "Journal").

A journal's highlight, announcement and institution:

1. Sign in as `rvaca` (password `rvacarvaca`), the journal manager.
2. Go to Settings › "Website" › "Setup" › "Highlights". Press "Add
   Highlight", fill in "Title" "u11r2 Call for papers", "URL"
   "https://example.org/u11r2" and "Button Label" "Read more", and press
   "Save". The list shows "u11r2 Call for papers".
3. Go to Settings › "Website" › "Setup" › "Announcements", tick "Enable
   announcements" and press "Save". Reload the page: the side menu shows
   "Announcements" only from then on. Open it, press "Add
   Announcement", fill in "Title" "u11r2 Announcement", and press
   "Save".
4. Open `/index.php/publicknowledge/en/management/settings/institutions`.
   (The side menu offers "Institutions" only while institutional usage
   statistics, or in OJS payments, are on, and the dataset has neither.)
   Press "Add Institution", fill in "Name" "u11r2 Institution", and
   press "Save".
5. Open `/index.php/publicknowledge/api/v1/highlights`,
   `/index.php/publicknowledge/api/v1/announcements` and
   `/index.php/publicknowledge/api/v1/institutions`. Note each item's
   `id` (1 on a fresh dataset) and its `_href`.
6. Open each `_href`.
7. Open `/index.php/publicknowledge/api/v1/highlights/1`, and the same
   for `announcements/1` and `institutions/1`.
8. Log out and sign in as `admin` (password `admin`). Open the three
   lists of step 5 again, each `_href` they give, and the three
   addresses of step 7.

A site highlight:

9. Still as `admin`, go to Administration › "Hosted Journals" and press
   "Create Journal". Fill in "Journal Title" "u11r2 Second Journal",
   "Journal Initials" "U11R2", the principal contact's name and email,
   "Country" "Canada" and "Path" `u11r2second`. Under "Languages" tick
   English and choose it as the primary locale, tick the box that lets
   the journal appear publicly on the site, and press "Save". "Save"
   opens the new journal's settings wizard. (The Site Settings offer
   "Highlights" only on a site with two or more journals.)
10. Go back to Administration › "Site Settings" › "Site Setup" ›
    "Highlights". Press "Add Highlight", fill in "Title" "u11r2 Site
    highlight", "URL" and "Button Label", and press "Save". [3.5: the
    save answers 500 and the panel stays open, so no site highlight
    exists for step 11.]
11. Open `/index.php/index/api/v1/highlights`. Note the highlight's
    `_href` and open it.

**Expected**: every `_href` of steps 5 and 8 names the journal,
`http://<host>/index.php/publicknowledge/api/v1/<highlights|announcements|institutions>/1`.
The site highlight's `_href` in step 11 names the site. Each item opened
in steps 6, 7, 8 and 11 answers 200 with the item, the same properties
the list gives.

**Observed**:

- Steps 5 and 8: each list answers 200, and each `_href` names the
  site:

  ```
  "_href": "http://<host>/index.php/index/api/v1/highlights/1"
  "_href": "http://<host>/index.php/index/api/v1/announcements/1"
  "_href": "http://<host>/index.php/index/api/v1/institutions/1"
  ```

- Step 6: `rvaca` is refused at each `_href`.

  ```
  GET /index.php/index/api/v1/highlights/1     → 401 {"error":"user.authorization.roleBasedAccessDenied","errorMessage":"The current role does not have access to this operation."}
  GET /index.php/index/api/v1/announcements/1  → 401 {"error":"user.authorization.roleBasedAccessDenied", …}
  GET /index.php/index/api/v1/institutions/1   → 401 {"error":"user.authorization.contextRequired","errorMessage":"You cannot call this operation without a context (press, journal, conference, etc)."}
  ```

- Step 7: each journal address answers 200 with the item.
- Step 8: `admin` gets 200 at the journal's addresses. At the `_href`s:

  ```
  GET /index.php/index/api/v1/highlights/1     → 500
  GET /index.php/index/api/v1/announcements/1  → 400 {"error":"The announcement you requested is not part of this journal."}
  GET /index.php/index/api/v1/institutions/1   → 401 {"error":"user.authorization.contextRequired", …}
  ```

  The highlight's server log, on PHP 8.3:

  ```
  production.ERROR: Call to a member function getId() on null {"exception":"[object] (Error(code: 0): Call to a member function getId() on null at …/lib/pkp/api/v1/highlights/HighlightsController.php:122)
  ```

  The announcement's refusal reads "…not part of this server." on OPS,
  and the raw `##api.announcements.400.contextsNotMatched##` on OMP.

- Step 11: the site's list answers 200, and the site highlight's `_href`
  is `http://<host>/index.php/index/api/v1/highlights/2`. Opening it
  answers 500, with the same server log line.

On 3.5 steps 5 to 8 read the same, except that `admin`'s highlight
`_href` answers 500 in the role check that runs before the highlight
code, the `has.roles` middleware:

```
Error: Call to a member function getId() on null in …/lib/pkp/classes/middleware/HasRoles.php:63
```

Every request to the site-level highlights fails there on 3.5, the
list and the save of step 10 included; that failure is reported
separately
([U11-A5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U11-A5-site-highlights-cannot-be-saved.md)).

## Cause

Two lines are wrong, one per symptom.

**The link.** `PKP\core\maps\Schema::getApiUrl()` (pkp-lib
`classes/core/maps/Schema.php`, line 81) builds an object's API address
for its `_href`. When the caller gives no context path, it uses
`PKPApplication::SITE_CONTEXT_PATH` (`index`), the site's address. Most
maps whose objects belong to a journal pass the path
(`$this->context->getData('urlPath')` in the publication, submission
file, user, ROR, contributor role and email log maps, and OJS's issue
map). Three do not, so a journal's objects get a `_href` at the site's
address:

- highlights: `PKP\highlight\maps\Schema::mapByProperties()`
  (`classes/highlight/maps/Schema.php`, line 81);
- announcements: `PKP\announcement\maps\Schema::mapByProperties()`
  (`classes/announcement/maps/Schema.php`, line 83);
- institutions: `PKP\institution\maps\Schema::mapByProperties()`
  (`classes/institution/maps/Schema.php`, line 83).

The default and the announcement map came in together with
1f48f6e414, the change that introduced these maps. Before it, 3.3's
`PKPAnnouncementService` built an announcement's link from its
journal's path. The default was `CONTEXT_ID_ALL` (`_`) until
[4ebcf37eb4](https://github.com/pkp/pkp-lib/commit/4ebcf37eb4a2bebe2c48b1c30cf1116a56f5314a)
(`pkp/pkp-lib#8333`, 2024-06-10), which named no journal either. The
institution map ([bed0ee4c3b](https://github.com/pkp/pkp-lib/commit/bed0ee4c3bcde7cf48c9f70bdee9400b061a31c1),
`pkp/pkp-lib#6782`) and the highlight map
([9984fe4470](https://github.com/pkp/pkp-lib/commit/9984fe447071d461189e58904f47308e7b2920c4))
followed it.

**The highlight read.** `HighlightsController::get()`
(`api/v1/highlights/HighlightsController.php`, line 122) passes
`$this->getRequest()->getContext()->getId()` to
`Repository::get(int $id, ?int $contextId)`. The controller serves the
site's address too, where the request has no context, so the call fails
before any highlight is looked up, for every id. The controller's other
methods allow for the site: `getMany()` checks for a context (line
147), and `add()`, `edit()`, `order()` and `delete()` pass
`$context?->getId()` (lines 171 to 301).

This half is the regression. The line came with 9984fe4470 in
`api/v1/highlights/HighlightsHandler.php`, passing the context object,
which failed at the journal's address with a `TypeError`; 71e79e31e3
(`pkp/pkp-lib#7698`, the Laravel routing) moved it unchanged into
`HighlightsController.php`. 07bc43fe67, a port of image upload checking
fixes, changed it on the side to pass the id. That mended the journal's
address and broke the site's, where the old line passed `null` and found
the site's highlight.

On `main` the Site Administrator's request reaches the line since the fix for `pkp/pkp-lib#13520` (PR `pkp/pkp-lib#13521`,
[58c2998847](https://github.com/pkp/pkp-lib/commit/58c2998847496a6c3ecdf9c94f74fa4841b005e7)),
which among other things stopped the `has.roles` middleware failing
without a context. On 3.5 that middleware still fails first. 092ec34b0f
is in 3.5.0-6 (tagged 2026-10-31, `lib/pkp` c4c0aa8c52 in all three
apps), so that release reads the journal's highlights and would show
this failure once the middleware is fixed there.

The link half is older and not a regression for highlights and
institutions, whose links were wrong from their start; an
announcement's link named its journal in 3.3.

Each half of the fix mends one symptom. With only the link fixed, a
journal's items read at their own `_href`, and the site's own
highlights still fail. With only the read fixed, the site-level address
answers a site highlight with 200 and a journal's highlight id with 404
"The highlight you requested was not found." (seen with the fix in).

What else the same code touches:

- The Highlights, Announcements and Institutions panels are unaffected.
  They build each item's address from the panel's API address and the
  id, and no screen reads these `_href`s (read in the code). The
  panels' add and edit work on screen.
- No other controller that serves the site's address calls `getId()` on
  the request's context without a check (a search of lib/pkp
  `api/v1`; the announcements controller checks, line 180).
- The section map makes the same `getApiUrl()` call, but the section
  schema has no `_href`, so no answer carries one (read in the code).
- The decision and review assignment maps make the same call, but
  their links (`submissions/{id}/decisions/{id}`,
  `_submissions/reviewAssignments/{id}`) name routes that exist on no
  address, a separate question (read in the code).

## Proposed fix

Make the request's context the default path in the shared
`getApiUrl()`, and allow for the site in `HighlightsController::get()`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/highlight-read-on-its-own-fails/fix.diff)):

```diff
--- a/lib/pkp/classes/core/maps/Schema.php
+++ b/lib/pkp/classes/core/maps/Schema.php
@@ -77,13 +77,16 @@
 
     /**
      * Get the URL to an object in the REST API
+     *
+     * @param ?string $contextPath The path of the context whose API serves the object. Defaults to
+     *   the request's context, which the map holds, and to the site when there is none.
      */
-    protected function getApiUrl(string $route, $contextPath = PKPApplication::SITE_CONTEXT_PATH): string
+    protected function getApiUrl(string $route, ?string $contextPath = null): string
     {
         return $this->request->getDispatcher()->url(
             $this->request,
             PKPApplication::ROUTE_API,
-            $contextPath,
+            $contextPath ?? $this->context?->getData('urlPath') ?? PKPApplication::SITE_CONTEXT_PATH,
             $route,
         );
     }
--- a/lib/pkp/api/v1/highlights/HighlightsController.php
+++ b/lib/pkp/api/v1/highlights/HighlightsController.php
@@ -119,7 +119,7 @@
      */
     public function get(Request $illuminateRequest): JsonResponse
     {
-        $highlight = Repo::highlight()->get((int) $illuminateRequest->route('highlightId'), $this->getRequest()->getContext()->getId());
+        $highlight = Repo::highlight()->get((int) $illuminateRequest->route('highlightId'), $this->getRequest()->getContext()?->getId());
 
         if (!$highlight) {
             return response()->json([
```

The new default is the map's `$this->context`, which is the request's
context (`AppServiceProvider` binds `Context` to the request's), not the
context the object belongs to. That is right for these three maps
because every list and single read they serve is filtered to the
request's context: a journal's address returns only that journal's
highlights, announcements and institutions, and the site's address only
the site's, where the map has no context and the default stays `index`.

The default is where the fix belongs because the three maps make the
same mistake, and the base method is the one place all three share. A
map that passes a path keeps it. Plugin maps were checked: of the
plugins the Plugin Gallery lists, two maps extend the base class (PLN's
deposit and deposit object maps), and neither calls `getApiUrl()`. So
the shared default changes no plugin's link, and it is recommended over
fixing the three maps one by one. The `?->` in `get()` keeps the id
07bc43fe67 passes, and follows the controller's other methods.

Tried on `main` on OJS, OMP and OPS: with the fix every step showed the
Expected, the site highlight included, and nothing was logged. These
answers are the same with the fix in and out:

- `rvaca` adds a highlight on the journal's panel and edits its "URL".
- `rvaca` gets 401 at the site's address for the journal's highlight.
- An unknown id at the journal's address gets 404 "The highlight you
  requested was not found.".
- The section editor `dbuskins` gets 401 at the journal's address for
  one highlight, and so does a signed-out browser.
- `admin` gets 200 on the site's list of highlights.
- A publication's `_href` keeps the journal's address.

One answer changes, as it should: `admin` at the site's address, for the
journal's highlight id or an unknown id, gets 404 "The highlight you
requested was not found." instead of the 500.

**Alternatives**

- Pass `$this->context?->getData('urlPath') ?? PKPApplication::SITE_CONTEXT_PATH`
  in each of the three maps, as the announcement map's `getUrlPath()`
  already does for its `url`. It works too, but leaves the default that
  caused all three in place for the next map.
- Build each link from the object's own `contextId`. It needs a context
  lookup per item, and no list holds another context's items.

**What goes with it**

- What it touches: at a journal's address, the `_href` of its
  highlights, announcements and institutions now names the journal, and
  the decision and review assignment links take the journal's path
  (still no route). At the site's address the links do not change, and
  one highlight can be read. No hook or stored data is involved.
- Backport: recommended for 3.5 too, where the links are as wrong and
  the diff applies as written (a dry run; not walked); its read half is
  reached there once the `has.roles` middleware is fixed. On 3.4 the
  default is `CONTEXT_ID_ALL` (`_`), which the router reads as no
  journal (`PKPRouter::getContext()`, line 186), so the links lead to
  the site-level API there too; and `HighlightsHandler::get()` (line
  111) still passes the context object, so the journal's address fails
  with the `TypeError` (both read in the code). The same two changes fit
  there by hand; whether 3.4 gets them is the team's call.
- Guard: a pkp-lib unit test for the highlight map's `_href` at a
  journal and at the site, beside
  `tests/classes/galley/maps/SchemaTest.php`, which mocks a map's
  request and context the same way; and an API test that reads one
  highlight at a journal's address and one at the site's.

Small: two lines in two pkp-lib files, and a test. Today every request
to the links it changes answers 400, 401 or 500, so no API client can
rely on them.

## Evidence

- The script saved in pkp-e2e walks the Steps:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/highlight-read-on-its-own-fails/walk.js)
  with its helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/highlight-read-on-its-own-fails/lib.js);
  from a pkp-e2e checkout,
  `node bin/probe.js all shared/playwright/checks/issues/highlight-read-on-its-own-fails/walk.js`
  on an install freshly loaded from the default dataset. Its `neighbour`
  mode holds the checks listed under Proposed fix, walked with the fix
  in and out.
- Walked on OJS, OMP and OPS on `main` and `stable-3_5_0`, on PostgreSQL
  and PHP 8.3.36, datasets pkp/datasets 4875b1c5 (2026-11-08). The
  fault does not touch the database, so MySQL was not checked.
- Code reads, `main`:
  - Every `getApiUrl(` call in lib/pkp `classes` and `api` and OJS's
    `classes` and `plugins` (OMP and OPS have none of their own), and
    which schemas carry `_href`.
  - `HighlightsController`: every use of the request's context; the
    other `api/v1` controllers that take a site branch
    (`getSiteRoleAssignments`, `!$request->getContext()`) for an
    unchecked `getContext()->getId()`.
  - The GitHub API lists no PR for 07bc43fe67 or 092ec34b0f; both were
    pushed directly under `pkp/pkp-lib#13512`.
- 3.5 (`stable-3_5_0`, each app's lib/pkp): `HighlightsController.php`
  line 117 and `getApiUrl()` line 81 as on `main`; `HasRoles.php` line
  63 still `$context->getId()`. The apps' `3_5_0-6` tags pin lib/pkp
  c4c0aa8c52, which holds 092ec34b0f and the same two lines.
- 3.4 (`origin/stable-3_4_0` in lib/pkp, `upstream/stable-3_4_0` in the
  apps): the three maps' `_href` lines as on `main`, with the default
  `CONTEXT_ID_ALL`; `HighlightsHandler::get()` line 111 passes the
  context object where `Repository::get(int $id, ?int $contextId)` takes
  an id, and no `pkp/pkp-lib#13512` commit is on the branch;
  `PKPRouter::getContext()` (line 186) gives no context for the path
  `_`, so the `_href`s lead to the site-level API. OJS's
  `SettingsHandler` builds the journal's highlights panel only when
  `[features] highlights` is on; OMP and OPS 3.4 have no
  `api/v1/highlights`. 3.3 (`origin/stable-3_3_0`):
  `PKPAnnouncementService::getProperties()` builds `_href` from the
  announcement's journal `urlPath` (line 124); no highlights or
  institutions.
- Plugin maps (searched 2026-10-15): the default branches of the 115 GitHub repositories
  that pkp/plugin-gallery's `plugins.xml` links, searched for
  `getApiUrl(` and for classes extending `PKP\core\maps\Schema`. Hits:
  pkp/pln's `classes/deposit/Schema.php` and
  `classes/depositObject/Schema.php` (extend the base, no `getApiUrl()`
  call). Plugins outside the gallery were not checked.
- Upstream: pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and pkp/ui-library
  searched by the symptom's words and by `getApiUrl`,
  `HighlightsController`, `SITE_CONTEXT_PATH`, `_href` and the error
  text. Read, and not the same fault: `pkp/pkp-lib#11765` and
  `pkp/pkp-lib#12397` (review comments asking new maps to pass the
  context path), `pkp/pkp-lib#3786` (mapped domains),
  `pkp/pkp-lib#9255` (site-level announcements).
- Tips. `main`: OJS 407246bb8e, OMP d93fcd11a, OPS 40f33453f0, all with
  lib/pkp 6035a6fed8. `stable-3_5_0`: OJS d3e13caf53 (lib/pkp
  40990d1523), OMP eb4c09649 (c4c0aa8c52), OPS ffdd27e05c (e2c62c4b7b).
  `stable-3_4_0`: OJS 61835656a2, lib/pkp 2dd24cc5ae. `stable-3_3_0`:
  lib/pkp df738d3a66.
