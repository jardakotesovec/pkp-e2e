# With "DOI Versioning" "Yes", the "Mark DOIs …" actions on a press change only the current version's DOIs

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: none (no screen turns "DOI Versioning" on for a press)
  - 3.4: none (code; the same)
  - 3.3: none (code; no DOI statuses)
- **Introduced** `pkp/pkp-lib#11625` for `pkp/pkp-lib#10553` · [bd8b99b7eb](https://github.com/pkp/pkp-lib/commit/bd8b99b7eb9c27f36023a6e63c807fdd7f0e9a62) · 2025-08-13 · Bozana Bokan (bozana), which put "DOI Versioning" on a press's Setup form
- **Upstream** `pkp/pkp-lib#13447` (open; fix in PRs `pkp/omp#2495` and `pkp/pkp-lib#13460`, not yet in main), covering more than this report: the issue asks for DOIs assigned when an item is created. As read in their diffs, the two pull requests together make all three "Mark DOIs …" actions reach every version on a press ("Mark DOIs Registered" every published one), so merging them fixes this fault. The Effort above is for the one-line fix, owed only if they are held back
- **Tracked in** spec U45 [OMP4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#omp4)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a press with "DOI Versioning" set to "Yes", a Press Manager ticks a
book on the DOIs page and confirms "Mark DOIs Registered". The page
answers "Items successfully marked registered", but only the newest
published version's DOIs change. For a book published as 1.0 and again
as 2.0, made with "Major Revision", the "View all" window shows 2.0's
"Monograph", chapter and "Format / PDF" rows as "Registered" and 1.0's
still as "Unregistered". "Mark DOIs Unregistered" and "Mark DOIs Needs
Sync" skip the earlier versions the same way. A journal and a preprint
server reach every version's DOIs.

OMP comes with no registration agency plugin, so on a press without
one added "Mark DOIs Registered" is the only way a DOI comes to read
"Registered". A status set while a version is the newest one stays, so
marking each version before the next is published works. After that
the DOIs page cannot change it: a press cannot record there that an
earlier version's DOIs were registered later, or take back a status it
set.

"DOI Versioning" is "No" by default on a press, and under "No" the
versions of a book share their DOIs, so the actions reach them all.

## Impact

- **Lost**: nothing is removed. An earlier version's DOIs keep the
  status they had when the next version was published, and the success
  notice does not say they were skipped.
- **Who**: a Press Manager or Press Editor who sets DOI statuses by hand
  for a book with more than one major version, on a press with "DOI
  Versioning" "Yes".
- **Way round**: mark a version's DOIs before the next version is
  published. Afterwards none on screen, short of unpublishing the newer
  versions so that the earlier one is the current one again (read in
  the code, not tried).

Low: a status label in the "View all" window is wrong, and the notice
hides it. Nothing in OMP's own code acts on an earlier version's
status: the DOIs page's status filters and "Deposit All" go by the
current version's DOIs. Whether a registration agency plugin added to a
press sends an earlier version's DOIs, and whether it goes by their
status, was not checked. It would be medium if one chose what to send
by that status.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OMP `main`. The press `publicknowledge`
  has DOIs on for "Monographs", no DOI prefix, no registration agency
  and no DOIs yet. "DOI Versioning" is "No".
- Book 14, "From Bricks to Brains: The Embodied Cognitive Science of
  LEGO Robots": published, one version (1.0), one format ("PDF") and
  four chapters, of which "Chapter 1: Mind Control—Internal or
  External?" has a page of its own and so can have a DOI.
- No registration agency needs to be set up: the three actions write
  by hand the statuses an agency's replies would write.

1. Sign in as `dbarnes`.
2. Settings › Distribution › "DOIs" › "Setup": type `10.1234` in "DOI
   Prefix", tick "Chapters" and "Publication Formats" under "Items with
   DOIs", choose "Yes, assign a unique DOI to every version…" under
   "DOI Versioning" and press "Save".
3. Open "DOIs" in the side menu. Tick the book, choose "Bulk Actions" ›
   "Assign DOIs" and confirm "Assign DOIs".
4. Open the book's workflow and choose "Create New Version" in the side
   menu. Leave "Which version should metadata be copied from?" and
   "Publication Stage" as the window offers them, choose "Revision
   Significance" "Major Revision" and press "Confirm". The workflow
   opens version 2.0. Press "Publish" and confirm it.
5. Open "DOIs". Tick the book, choose "Bulk Actions" › "Mark DOIs
   Registered" and confirm it. Expand the book's row and press "View
   all" beside "There are 2 versions.".
6. In the book's workflow, make version 3.0 as in step 4 and publish
   it.
7. Open "DOIs". Tick the book, choose "Mark DOIs Unregistered" and
   confirm it. Expand the row and press "View all".
8. Tick the book, choose "Mark DOIs Registered" and confirm it. Tick it
   again, choose "Mark DOIs Needs Sync" and confirm it. Expand the row
   and press "View all".

**Expected.** Each action reaches the DOIs of every version. Step 5:
1.0's and 2.0's rows read "Registered". Step 7: the rows of all three
versions read "Unregistered". Step 8: they all read "Needs Sync",
since "Mark DOIs Needs Sync" changes a DOI that reads "Submitted" or
"Registered" and the action before it has registered them all.

**Observed.** Each action answers its success notice ("Items
successfully marked registered", "… marked unregistered", "… marked
needs sync") and changes the newest version alone. The window "DOIs for
all versions" reads, per version, the same status on its "Monograph",
"Chapter 1: Mind Control—Internal or External?" and "Format / PDF"
rows:

```
                          step 5         step 7         step 8
Version of Record 1.0     Unregistered   Unregistered   Unregistered
Version of Record 2.0     Registered     Registered     Registered
Version of Record 3.0     —              Unregistered   Needs Sync
```

Control: a journal (article 17, "Antimicrobial, heavy metal resistance
and plasmid profile of coliforms isolated from nosocomial infections in
a hospital in Isfahan, Iran") and a preprint server (preprint 2, "The
Facets Of Job Satisfaction: A Nine-Nation Comparative Study Of
Construct Equivalence") set every version's DOI at steps 5, 7 and 8.
There the steps differ in two places: step 2 ticks nothing under
"Items with DOIs", so only the work's own DOI is followed, and on the
preprint server "DOI Versioning" is already "Yes" and "Publish" reads
"Post".

## Cause

The three actions are `PKPDoiController::markSubmissionsRegistered()`,
`markSubmissionsUnregistered()` and `markSubmissionsStale()`
(`lib/pkp/api/v1/dois/PKPDoiController.php`). Each asks the app for the
DOIs of the ticked work with `Repo::doi()->getDoisForSubmission($id)`.
The first two set the status of every DOI that comes back. The third
changes those among them that read "Submitted" or "Registered"
(`PKP\doi\DAO::markStale()`).

OMP's `APP\doi\Repository::getDoisForSubmission()`
(`classes/doi/Repository.php`, line 120) collects them from one version:

```php
$publications = [$submission->getCurrentPublication()];
```

OJS's and OPS's read `$submission->getData('publications')`, every
version. The loop under OMP's line is written for several versions and
gets one.

The line is right while all versions share their DOIs.
`pkp/pkp-lib#8027` brought per-version DOIs in 3.4 and widened OJS's
and OPS's method for them. Its OMP commit, 61714ab874 (`pkp/omp#1241`,
2022-11-03, Erik Hanson (ewhanson)), gave a press the setting, stored
as off, and made the press's `version()` clear a new version's DOIs
when the setting is on. It edited `getDoisForSubmission()` too, but
not this line.

That did not show, because only a preprint server's Setup form had the
field. bd8b99b7eb added the field to the shared
`PKPDoiSetupSettingsForm`, and a press could choose "Yes".

Reach ("code" marks a case read in the code and not taken through the
screens):

- OMP, the three "Mark DOIs …" actions, for the book's own, its
  chapters' and its formats' DOIs (on screen). A file DOI ("Files"
  under "Items with DOIs") is collected by submission, not by version,
  so it is reached either way (code).
- "Deposit DOIs" on a press: `depositSubmissions()` marks the same list
  "Submitted", so an earlier version's DOIs keep their status when the
  book is sent (code). OMP ships no registration agency plugin: no
  class in its checkout implements `IDoiRegistrationAgency`, and
  without one "Deposit DOIs" answers `400` and "Deposit All" does
  nothing. What a plugin added to a press sends for an earlier
  version, and which statuses it sets afterwards, was not checked.
- Publishing a major version on a press:
  `PKP\publication\Repository::publish()` would mark the same list
  "Needs Sync". That branch does not run today, because `publish()`
  compares the version with itself
  ([pkp-e2e#229](https://github.com/jardakotesovec/pkp-e2e/issues/229),
  whose OMP diff carries this report's line) (code).
- Under "DOI Versioning" "No", a chapter or format that was removed
  from the current version but is still in an earlier one keeps its
  DOI there. The method never returns that DOI, so the actions skip it
  as well (code).
- 3.5 and 3.4 carry the same line (code). No screen there turns "DOI
  Versioning" on for a press, so the Steps cannot be taken and the
  header counts neither as affected. Two things still reach the line
  there: an API client that sets `doiVersioning` on the press, and the
  removed chapter or format of the item above.
- What else reads a DOI's status goes by the current version as well:
  the check of which ticked books "Mark DOIs Needs Sync" accepts and
  the DOIs page's status filters
  (`APP\submission\Collector::addDoiStatusFilterToQuery()`), and
  "Deposit All" (`APP\doi\DAO::getAllDepositableSubmissionIds()`).
  Those choose the book, not the DOIs to mark, and are not part of
  this fault (code).
- The way round in Impact: the current version is the most mature
  published one (`getCurrentPublicationIdByPublications()`), so with
  the newer versions unpublished the actions reach the earlier one.
  An API client can also set one DOI's `status` through `PUT
  /api/v1/dois/{doiId}`, which no screen sends (code).
- No stored data needs repair: once the actions reach every version,
  "Mark DOIs Registered" or "Mark DOIs Unregistered" sets a status
  that was left behind.

## Proposed fix

Merging `pkp/omp#2495` with `pkp/pkp-lib#13460` fixes this, and is the
route to take: nothing more is owed then than taking the Steps again.
As read at their heads of 2026-10-08 (omp `7b367d7457`, pkp-lib
`d19b2ed294`):

- OMP's `getDoisForSubmission()` collects every version's DOIs, through
  `getDoisForPublication()`. "Mark DOIs Unregistered" and "Mark DOIs
  Needs Sync" still call it.
- "Mark DOIs Registered" and "Deposit DOIs" call a new
  `getPublishedDoisForSubmission()`: the DOIs of every published
  version, so an unpublished version's are left alone.

The pull requests were not tried here.

If that work is held back, the same correction for today's `main` is
one line: read every version in OMP's `getDoisForSubmission()`, as
OJS's and OPS's do. The rule, which DOIs belong to a book, lives in
this method, and every caller gets it from here:

```diff
--- a/classes/doi/Repository.php
+++ b/classes/doi/Repository.php
@@ -116,8 +116,8 @@
         $doiIds = Collection::make();
 
         $submission = Repo::submission()->get($submissionId);
-        /** @var Publication[] $publications */
-        $publications = [$submission->getCurrentPublication()];
+        /** @var \Illuminate\Support\LazyCollection<Publication> $publications */
+        $publications = $submission->getData('publications');
 
         /** @var PressDAO $contextDao */
         $contextDao = Application::getContextDAO();
```

The diff:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/press-mark-dois-current-version-only/fix.diff).

Tried on `main`: with the line applied, the Steps showed the Expected
at steps 5, 7 and 8. A second walk under "DOI Versioning" "No" read
the same with and without it: the three actions on book 14 set the one
DOI its two versions share and left another book's DOI "Unregistered",
and "Mark DOIs Needs Sync" on that other book was still refused.

**Alternatives**

- Collect the versions in each controller action. Three callers would
  repeat what the app's method is for, and `publish()` and the deposit
  would still get one version.

**What goes with it** (the one line, taken without the pull requests)

- "Deposit DOIs" then marks every version's DOIs "Submitted", an
  unpublished version's included, as on a journal today. "Deposit All"
  (`PKP\doi\Repository::depositAll()`) still picks and marks the
  current version's alone, so the two deposit paths of a press would
  differ, which they do not now.
- The risk in that: nothing in OMP's own code moves a DOI on from
  "Submitted"; the agency plugin does. If a plugin added to a press
  reports on the current version only, an earlier version's DOI would
  stay "Submitted" until it is marked by hand, where today it stays as
  it was. Not checked, for want of a plugin, and not tried.
- "Mark DOIs Registered" then marks an unpublished version's DOIs too,
  as on a journal and a preprint server today. The pull requests
  narrow that for all three apps.
- The diff leaves the "Submission files" query inside the loop. It
  filters by submission, so it runs once per version with the same
  result, and `unique()` drops the repeats.
- [pkp-e2e#229](https://github.com/jardakotesovec/pkp-e2e/issues/229)
  proposes the same line for OMP beside a pkp-lib line. With this fix
  in, that report needs its pkp-lib line alone.
- No backport is proposed: 3.5 and 3.4 are not counted as affected
  (the Reach's item on them).
- The guard: a unit test of `getDoisForSubmission()` for a book with
  two versions that have DOIs of their own, or the e2e scenario of the
  Steps.

Small: the one line in OMP's DOI class and a test. Nothing but a walk
of the Steps if the pull requests merge first.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/press-mark-dois-current-version-only/walk.js)
  with
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/press-mark-dois-current-version-only/lib.js)
  (it also needs the `lib.js` of `minor-version-new-galley-dois` and
  of `major-version-earlier-doi-stays-registered` beside it). It takes
  steps 1-8 on OMP and the control on OJS and OPS:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/press-mark-dois-current-version-only/walk.js`;
  on 3.5 with `PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35` in front.
  `WALK=neighbour` with `omp` for `all` is the second walk of the
  Proposed fix, under "DOI Versioning" "No".
- The script also reads every version's DOI statuses from the `dois`
  table (read only). They agreed with the window at each step.
- Chapters 2 to 4 of book 14 have no page of their own and read "Needs
  DOI" in every version throughout; the Observed table leaves them out.
- 3.5, walked: on OJS and OMP the Setup form has no "DOI Versioning"
  field ("Items with DOIs" and the rest are there), so the script
  records the form and stops. On OPS, which has the field, the control
  held: each action set every version's stored status (the "DOIs for
  all versions" window shows no status on 3.5).
- The one-line fix was tried on 2026-10-09 on the `main` tip below:
  `fix.diff` applied to OMP, the Steps and the second walk taken, the
  diff taken out, and the second walk taken once more.
- The second walk starts from a fresh dataset and leaves "DOI
  Versioning" "No": books 14 and 5 ("Bomb Canada and Other Unkind
  Remarks in the American Media") get DOIs, and book 14 a published
  2.0. Under "No" the DOIs page offered no "View all" for it, so the
  read is book 14's row and the stored status of both versions. "Mark
  DOIs Needs Sync" on book 5 answered `400` and the window "DOI
  Updates Failed".
- The way round's first half is what the walk saw of 2.0: marked
  "Registered" at step 5 while it was the newest version, it kept that
  status through steps 6 to 8.
- Walks ran on PostgreSQL, on these tips. `main`: ojs `6d5b793c4e`
  (pkp-lib `d1bc3a9ecc`), omp `57a9235110` and ops `fd78a0bcd8`
  (pkp-lib `27938abd4c`). `stable-3_5_0`: ojs `c6e2c3a879` (pkp-lib
  `d702d012dd`), omp `ddc6abf5a9` and ops `dc8a938ab0` (pkp-lib
  `8094f06bf5`). Dataset: pkp/datasets `1a196c3` (2026-10-08).
- Code reads. 3.5 (omp `ddc6abf5a9`): `classes/doi/Repository.php` line
  121 is the same line; only OPS's `DoiSetupSettingsForm` adds the
  "DOI Versioning" field; the press's setting is stored as `0`
  (`press_settings.doiVersioning`, written by `I8027_DoiVersioning`),
  its `version()` reads it, and `schemas/context.json` carries
  `doiVersioning`, which no form sends. 3.4 (omp `0aec65441f`,
  pkp-lib `8bf0ab5072`): the same line (121), the same migration, the
  three actions in `PKPDoiHandler` calling it. 3.3 (omp `8e72fc8836`,
  pkp-lib `8c5b3f7f5c`): no `classes/doi` in either.
- Introduced: `git blame` puts the line at 440b0394cb (2021-11-30,
  `pkp/pkp-lib#7014`), when no app had per-version DOIs. OJS's method
  was widened in 1327a4576c and OPS's in 33a7b8b1ea, both for
  `pkp/pkp-lib#8027`.
- Upstream, searched 2026-10-09 in pkp/pkp-lib, pkp/omp and
  pkp/ui-library. No issue reports this fault on its own.
- The two pull requests were read on github.com as their diffs
  (`pull/2495.diff`, `pull/13460.diff`) on 2026-10-09, at the heads
  the Proposed fix names. `pkp/omp#2495` replaces the body of
  `getDoisForSubmission()` and says "getDoisForSubmission() now
  considers all versions (like OJS and OPS)". `pkp/pkp-lib#13460`
  changes two calls in `PKPDoiController` (`depositSubmissions()`,
  `markSubmissionsRegistered()`) to `getPublishedDoisForSubmission()`
  and leaves the other two actions' calls as they are. Its last commit
  (`pkp/pkp-lib#13253`) makes "Deposit All" follow the versions too.
- `pkp/pkp-lib#11591`, where the team tracks per-version DOIs in
  DataCite deposits, was read with its comments: it is about what a
  journal's deposit sends, and says nothing of a press or of these
  actions.
- Not driven: a deposit (OMP has no agency plugin); the "Files" kind;
  the removed chapter or format under "DOI Versioning" "No", on any
  version; unpublishing the newer versions as a way round; a status
  set through the API.
- Not checked: any registration agency plugin for a press. None is in
  OMP's checkout, so what one sends for an earlier version and which
  statuses it sets is unknown here.
