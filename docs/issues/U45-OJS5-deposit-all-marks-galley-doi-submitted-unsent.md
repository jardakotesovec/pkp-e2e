# DataCite deposits leave a galley DOI "Submitted" and unsent when its article has no DOI

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS
  - 3.5: OJS ("Deposit DOIs" fails as on `main`; "Deposit All" marks the galley's DOI "Submitted" and queues no deposit at all, an older fault)
  - 3.4: OJS (code; as 3.5)
  - 3.3: none (code; no DOIs page and no "Deposit All")
- **Introduced** `pkp/pkp-lib#7014` · [81664e1421](https://github.com/pkp/ojs/commit/81664e142122e18afc5333eb9602d3e1ea48b2a3) · 2022-02-15 · Erik Hanson (ewhanson) wrote the DataCite plugin's list of what a deposit sends, which takes the article without asking for its DOI
- **Upstream** none found for this fault (2026-11-23). The older "Deposit All" fault of 3.5 and 3.4 is `pkp/pkp-lib#13253` (closed, fixed on `main` only, no backport)
- **Tracked in** spec U45 [OJS5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#ojs5)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

**Update 2026-11-23.** Since `pkp/pkp-lib#13591` a deposit that cannot
connect reads "Error"; this fault is unchanged on `main`, and on 3.5 its
job now ends in a type error (Observed).

**Update 2026-10-15.** The report now covers "Export DOIs" on the same
article and the second way into the state, ticking "Articles" after the
galleys got DOIs.

**Update 2026-10-12.** `pkp/pkp-lib#13253` fixed on `main` the "Deposit
All" fault this report was first filed for; the report now describes
the fault `main` still has, an article with no DOI.

## Summary

On a journal that deposits article and galley DOIs with DataCite, the
background deposit of a published article that has a galley DOI but no
DOI of its own fails on the server, and the galley's DOI is never sent.
A manager who presses "Deposit All", or ticks the article and presses
"Deposit DOIs", sees "Items successfully submitted for deposit" and the
galley's row turn "Submitted".

The row stays "Submitted", which reads as a deposit on its way, and
later presses of "Deposit All" skip it. Only Administration › "Failed
Jobs" lists the failure. The way round is "Assign DOIs" on the article,
then "Deposit DOIs" on it.

It takes an article without a DOI of its own whose galley has one: its
"Article" DOI was emptied on the DOIs page, or the journal ticked
"Articles" after its galleys got DOIs. A journal with "Articles"
unticked is not hit: its galley DOIs are deposited. The other articles
the same "Deposit All" takes are deposited too.

"Export DOIs" accepts such an article, though it refuses one with no DOI
anywhere. The file it builds holds the article's record with an empty
DOI beside the galley's, which DataCite's format check refuses: the
export stops with an "Error" window that points at the empty identifier,
and nothing downloads, the galley's record included.

That is `main`. On 3.5 and 3.4 "Deposit All" also has an older and wider
fault, which `main` no longer has: it marks a galley DOI "Submitted" and
starts no deposit unless the article's own DOI goes out with it. So it
also leaves galley DOIs unsent when the article's DOI is already
"Registered" (galley DOIs turned on after the articles were registered)
and when "Articles" is unticked.

## Impact

- **Lost.** That galley's DOI is not registered with DataCite, so it
  does not resolve. An export of that article downloads nothing.
- **Who.** Managers of journals that deposit article and galley DOIs
  with DataCite, the only agency that takes galley DOIs. An article gets
  into the state in two ways. A manager empties its "Article" DOI box on
  the DOIs page and leaves the galley's. Or a journal that gave only its
  galleys DOIs ticks "Articles" later: every older article whose galley
  DOI is not yet registered is then in the state, until "Assign DOIs"
  gives the article one.
- **Way round.** There is one on screen, once the manager knows to look
  for it: "Assign DOIs" gives the articles DOIs (a bulk action on the
  ticked articles), and "Deposit DOIs" or "Export DOIs" then carries
  both. Nothing points the manager there: the expanded row reads
  `Article Needs DOI` beside `PDF Submitted`, and nothing on the DOIs
  page says the galley's deposit failed. A journal that wants an article
  without a DOI of its own has no way round short of unticking
  "Articles" for the whole journal.

Medium. A rarely met state with a way round on screen would be low; the
success notice over a deposit that never happens, with nothing on the
page to say so, raises it one level. A settings change can also bring
the state about, but only on journals that gave galleys DOIs before
articles, and "Assign DOIs" puts each such article right, which keeps
it below high.

The older "Deposit All" fault of 3.5 and 3.4 has another cause and
another fix and is not weighed here. It has no report of its own: this
issue,
[pkp-e2e#931](https://github.com/jardakotesovec/pkp-e2e/issues/931),
was filed for it as high on 2026-10-06, before `main` lost it, and
`pkp/pkp-lib#13253` tracks it upstream (What goes with it). A backport
to the release lines would be scheduled from `pkp/pkp-lib#13253`.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main`. Its journal has DOIs on with
  only "Articles" ticked, no prefix, no registration agency and no DOI on
  any work.
- The install runs queued jobs on page loads (`[queues] job_runner = On`,
  as the dataset ships). A failing job is tried three times, 5 seconds
  apart, so the deposit's outcome shows after about 20 s of page loads.
  To see what is queued right after a press, read the `jobs` table
  (`SELECT payload FROM jobs`, a `DepositSubmission` per queued work).
  Administration › "View Jobs" as `admin` may already be empty: the page
  loads it takes to get there can run the job.
- Or the administrator runs jobs with the job tool: `job_runner = Off`
  in `config.inc.php`, and in step 8 `php lib/pkp/tools/jobs.php run`
  in the install's folder, as a cron job does, once more after each
  failed try until nothing is queued (three runs, 5 seconds apart). The
  Observed is the same either way.
- PHP runs with assertions off (`zend.assertions = -1`, the production
  setting `php.ini-production` ships). This matters on 3.5 only. There,
  the type error under Observed shows with assertions off. A development
  install with assertions on (`zend.assertions = 1`) stops the job
  earlier, at `AssertionError: assert(!empty($doi))`, before anything is
  posted (by the code); the PDF stays "Submitted" all the same.

Setting up:

1. Sign in as `dbarnes`.
2. Settings › Website › "Plugins": tick "DataCite Manager Plugin".
3. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`,
   tick "Article galleys, such as a published PDF", "Save".
4. "Registration": "Registration Agency" "DataCite", "Username (symbol)"
   `u45rf1` (any value serves), "Save".
5. Side menu "DOIs": tick submission 17, "Antimicrobial, heavy metal
   resistance and plasmid profile of coliforms isolated from nosocomial
   infections in a hospital in Isfahan, Iran"; "Bulk Actions" › "Assign
   DOIs" › "Assign DOIs". The "Article" and "PDF" rows get DOIs.
6. Expand it ("Show more details about …"), "Edit", empty the "Article"
   DOI box, "Save". It reads `Article Needs DOI` and `PDF Unregistered`.

"Deposit All":

7. "Deposit All" (above the list) › "Deposit all DOIs". Check the queue
   at once.
8. Reload the DOIs page every 5 s or so for about 20 s (or run the job
   tool); expand the work.
9. Sign in as `admin`: Administration › "Failed Jobs", "Details" on the
   row.
10. Sign in as `dbarnes`: "DOIs", "Deposit All" › "Deposit all DOIs" once
    more; expand the work.

"Deposit DOIs", from a freshly loaded dataset, steps 1 to 6 as above:

7. Tick submission 17; "Bulk Actions" › "Deposit DOIs" › "Deposit DOIs".
8. Reload the DOIs page for about 20 s; expand the work.
9. As `admin`: Administration › "Failed Jobs".

"Articles" ticked later, from a freshly loaded dataset, on its own:

1. Sign in as `dbarnes`.
2. Settings › Website › "Plugins": tick "DataCite Manager Plugin".
3. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`,
   tick "Article galleys, such as a published PDF", untick "Articles",
   "Save".
4. "Registration": "Registration Agency" "DataCite", "Username (symbol)"
   `u45rf1`, "Save".
5. Side menu "DOIs": tick submission 17; "Bulk Actions" › "Assign DOIs"
   › "Assign DOIs". Only the "PDF" row gets a DOI.
6. "Setup": tick "Articles", "Save". The work reads `Article Needs DOI`
   and `PDF Unregistered`.
7. "DOIs": "Deposit All" › "Deposit all DOIs".
8. Reload the DOIs page for about 20 s; expand the work.
9. As `admin`: Administration › "Failed Jobs".

"Export DOIs", from a freshly loaded dataset, steps 1 to 6 as above:

7. Tick submission 17; "Bulk Actions" › "Export DOIs" › "Export DOIs".
8. Read the "Error" window. An install that cannot fetch DataCite's
   schema names the failed fetch instead of the reason. The file the
   export built stays in the files directory's `temp` folder
   (`dataciteplugin-<Ymd>-<His>-galleys-3-1.tar.gz`); to check it by
   hand, on a machine that reaches DataCite, unpack it and run
   `php -r '$d = new DOMDocument(); $d->load($argv[1]); var_dump($d->schemaValidate("http://schema.datacite.org/meta/kernel-4/metadata.xsd"));' <file>.xml`
   on each record: the check the plugin runs
   (`xmllint --noout --schema` against a downloaded copy of the kernel-4
   folder does the same).

**Expected.** The work's deposit sends the PDF's DOI to DataCite and
leaves out the article, which has none, as a deposit on a journal with
"Articles" unticked does. The PDF then reads "Registered", or "Error"
with DataCite's answer. On an install that cannot reach DataCite, the
PDF reads "Error", and its "View Error" names the failed connection.
(With the job tool the message is lost, a separate fault:
[report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U45-A31-job-tool-deposit-error-no-message.md).)
"Export DOIs" downloads the PDF's record alone, as on a journal with
"Articles" unticked.

**Observed.** "Deposit All": step 7 shows "Items successfully submitted
for deposit", and one `PKP\jobs\doi\DepositSubmission` is queued. Step 8:
`Article Needs DOI` and `PDF Submitted`, on every load, above "The
metadata for this item has not been submitted to DataCite.". Step 9:
"There's a total of 1 failed job(s).", one row,
`PKP\jobs\doi\DepositSubmission`, whose exception reads:

```
{"message":"DataCite export: no DOI assigned to the object being deposited.","code":0,"file":".../plugins/generic/datacite/DataciteExportPlugin.php","line":273,...}
```

Step 10: the same notice; nothing is queued and the PDF still reads
"Submitted".

"Deposit DOIs": step 7 shows the same notice and queues one deposit;
steps 8 and 9 read the same, with the same failed job and exception.

"Export DOIs": step 7 asks "You are about to export DOI metadata records
for 1 item(s) for DataCite. Are you sure you want to export these
records?". "Export DOIs" answers 400, and on the test install the
"Error" window reads "An XML validation error occurred and the XML could
not be exported." over "Failed to locate the main schema resource at
'http://schema.datacite.org/meta/kernel-4/metadata.xsd'.". The file it
built holds two records:

- the article's, with an empty `<identifier identifierType="DOI"/>` and a
  `relatedIdentifier` "HasPart" naming the PDF's DOI;
- the PDF's, with its DOI.

Checked against that schema, the PDF's record passes and the article's
fails:

```
Element '{http://datacite.org/schema/kernel-4}identifier': [facet 'minLength'] The value has a length of '0'; this underruns the allowed minimum length of '1'.
```

"Articles" ticked later: as "Deposit All" above. Step 6 reads
`Article Needs DOI` and `PDF Unregistered`; step 7 shows the notice and
queues one deposit, the PDF reads "Submitted", and the failed job
carries the same exception.

[3.5, "Deposit All": the same notice, nothing queued and no failed job.
The expanded view there has no status column, so the PDF's status is
read from the database:
`SELECT status FROM dois WHERE doi = '<the PDF's DOI>'` gives `2`,
"Submitted" (`Doi::STATUS_SUBMITTED`). "Deposit DOIs": a deposit is
queued and the PDF's DOI turns "Submitted" and stays so. The deposit
posts the article's record first, without a DOI. On the test installs
that post fails at connecting to `mds.datacite.org`, and "Failed Jobs"
lists one failed `DepositSubmission`, whose exception reads (PHP 8.3,
assertions off):

```
PKP\doi\Repository::edit(): Argument #1 ($doi) must be of type PKP\doi\Doi, null given, called in .../plugins/generic/datacite/DataciteExportPlugin.php on line 354
```

"Export DOIs" fails the same way: the same file, refused by the schema check the same way,
and nothing downloads. The endpoint's 400 there carries "An XML
validation error occurred and the XML could not be exported." without
the reason, and the page showed no message at all, a separate fault.]

With step 6 left out (the article keeps its DOI), the same press queues
a deposit that gets as far as DataCite's address, no job fails, and both
rows read "Error" with "View Error" naming the failed connection;
"Export DOIs" builds both records with their DOIs, and both pass the
schema check. On a journal with "Articles" unticked, the PDF's
deposit gets as far too.

## Cause

`DatacitePlugin::depositSubmissions()` (OJS
`plugins/generic/datacite/DatacitePlugin.php`, lines 155–166) lists what
a work's deposit sends. It adds a galley only when the galley has a DOI
(line 161), but adds the work itself whenever "Articles" is ticked
(lines 156–158), without asking whether its current publication has a
DOI.

`DataciteExportPlugin::exportAndDeposit()` (lines 159–179) posts the
listed objects in that order, the article first. For an article without
a DOI, `depositXML()` (lines 272–274) throws "DataCite export: no DOI
assigned to the object being deposited.". The exception ends the loop
before the galley, the job fails on each of its three tries
(`BaseJob::$tries`), and it is recorded as a failed job. Each work has a
job of its own, so the other works' deposits are not touched (code
read).

By then the galley's DOI is already marked. "Deposit All"
(`Repository::depositAll()`, lib/pkp `classes/doi/Repository.php`,
lines 302–318) queues the work of every DOI that
`getAllDepositableSubmissionIds()` lists and marks those DOIs
"Submitted"; since `pkp/pkp-lib#13253` the row of a galley's DOI carries
its work's id. "Deposit DOIs" (`PKPDoiController::depositSubmissions()`,
lines 565–571) queues each ticked published work and marks the DOIs of
its published versions. The job's own check,
`getExportableDOIsSubmissionIds()`, accepts a work on a galley's DOI
alone since the same change (`whereHasDoi()`, OJS
`classes/publication/DAO.php` line 163).

Nothing moves the DOI on after the failure. The plugin's
`updateDepositStatus()` (lines 347–361) runs only after an object's
post, on DataCite's answer or, since `pkp/pkp-lib#13591` (`pkp/ojs#5977`),
on a post that cannot connect (the `TransferException` catches, lines
307–313 and 326–332). The article's throw comes before its post, and the
galley is never posted. "Deposit All" lists only DOIs reading
"Unregistered", "Error" or "Needs Sync" (OJS `classes/doi/DAO.php`, line
121).

The fault is as old as the list, which is why the Kind is defect. Until
`pkp/pkp-lib#13115` (`pkp/ojs#5719`,
[e730e7ab3d](https://github.com/pkp/ojs/commit/e730e7ab3d5eb22e13ff88106e9f98bc719807cf),
2026-07-30) the throw was an `assert()`, which PHP skips unless
assertions are turned on. The article's record was then posted without a
DOI, and on DataCite's answer (an error, or a success outside the
plugin's test mode) `updateDepositStatus()` handed the article's missing
DOI object to `Repo::doi()->edit()`, which takes a `Doi`: a type error,
before the galley. That change moved where the job stops, not whether
the galley is sent.

3.5 and 3.4 have the same list and the `assert()`:

- "Deposit DOIs" there reaches the list, since the job has no check of
  its own. With PHP assertions off (the Preconditions' setting) the
  article's record is posted without a DOI. With them on, the
  `assert()` stops the job as the throw does on `main`.
- On 3.5 a post that cannot connect also reaches
  `updateDepositStatus()` (line 305), since `pkp/ojs#5978`, the 3.5
  copy of `pkp/ojs#5977`. So the type error above
  (`Repo::doi()->edit()`, line 354) ends the job before the galley, as
  walked.
- On 3.4 the post's catch takes only a `RequestException` (line 301).
  In Guzzle 7 a failed connection is a `ConnectException`, which is not
  one. So on 3.4 the job fails at the connection itself. The type error
  follows only when DataCite answers (code read).
- "Deposit All" there does not reach the list. Its query gives a galley
  DOI's row no work id, and `depositAll()` marks every listed DOI but
  queues only a row that has one. So the galley's DOI is marked and
  nothing is queued: with the article's DOI emptied or already
  "Registered" (both walked on 3.5), or with "Articles" unticked (code
  read). That is the fault `pkp/pkp-lib#13253` fixed on `main`, with its
  own cause and fix.

Reach:

- The scheduled automatic deposit ("Automatic Deposit" on) runs
  `depositAll()` (lib/pkp `classes/task/DepositDois.php` dispatches
  `DepositContext`). Code read, not walked.
- "Deposit DOI(s)" in an expanded work's DataCite box calls the same
  endpoint as "Deposit DOIs" (`DoiListItem.vue` emits
  `deposit-triggered`). Code read.
- "Export DOIs" on the same work: `DatacitePlugin::exportSubmissions()`
  (lines 120–131) builds its list the same way. On `main` the endpoint
  (`PKPDoiController::exportSubmissions()`) lets the work through on its
  galley's DOI, by the same `getExportableDOIsSubmissionIds()`; on 3.5
  and 3.4 it lets any published work through. `DataciteXmlFilter` then
  writes the article's record around an empty `<identifier>` (line
  199), which fails the schema's `minLength` of 1. `exportXML()` (OJS
  `classes/plugins/PubObjectsExportPlugin.php`, line 565) hands the
  error back, and the endpoint answers 400 for the whole export, the
  galley's record included. 3.4 does the same (code read).
- "DOI Versioning" "Yes": the job accepts a work on any published
  version's DOI, but the plugin deposits the current version. A current
  version without an article DOI therefore fails the same way. Code
  read, not walked.
- OPS has no DataCite plugin and OMP no registration agency plugin, so
  neither has the surface.

## Proposed fix

List the article only when it has a DOI, as the galley loop beside it
already does. In OJS `plugins/generic/datacite/DatacitePlugin.php`, the
same change in `depositSubmissions()` and `exportSubmissions()`:

```diff
         foreach ($submissions as $submission) {
-            if (in_array(Repo::doi()::TYPE_PUBLICATION, $context->getEnabledDoiTypes())) {
+            // An article without a DOI of its own is left out, as a galley without one is: its galleys' DOIs still go
+            if (in_array(Repo::doi()::TYPE_PUBLICATION, $context->getEnabledDoiTypes()) && $submission->getCurrentPublication()->getDoi()) {
                 $items[] = $submission;
             }
```

The diff, against OJS's root:
[fix-datacite-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/deposit-without-doi-reports-success/fix-datacite-ojs.diff).
DataCite's XML for a galley already copes with an article that has no
DOI (`DataciteXmlFilter::createRelatedIdentifiersNode()` skips the empty
one). The exception in `depositXML()` stays as the last guard.

**An empty list.** With the change the list can be empty: the article
has no DOI and no galley is listed. That happens when galley DOIs are
unticked after the galleys got theirs (`whereHasDoi()` counts a galley's
DOI whatever is ticked), and under "DOI Versioning" "Yes" when the
current version has no DOI at all.

- A deposit then sends nothing and the job ends without failing
  (`exportAndDeposit()` returns success for no objects), where it fails
  today. The manager sees the same success notice as today.
- An export would throw "DataCite export: no objects were exported." in
  `exportAsDownload()` (line 228), which the endpoint does not catch: a
  server error. The diff therefore makes `exportSubmissions()` return an
  error for an empty list, and the endpoint answers its 400:

  ```diff
  +        if (empty($items)) {
  +            return ['temporaryFileId' => null, 'xmlErrors' => [__('api.dois.400.invalidPubObjectIncluded')]];
  +        }
  ```

Tried on `main`, with the fix in:

- Both deposit paths of the Steps showed the Expected as far as a test
  install can. No job failed, and the PDF read "Error", its "View Error"
  holding the failed connection:
  `cURL error 7: Failed to connect to mds.datacite.org port 443 …`
  (without the message under the job tool, the separate fault named
  under Expected). Without the fix the PDF stayed "Submitted" and the
  job failed on the article.
- The deposit control (the article keeps its DOI), "Deposit All" with
  the fix in and out: the same both times, no job failed and both the
  article and the PDF read "Error" with the failed connection.
- The empty list (galley DOIs unticked again after step 6): "Deposit
  DOIs" showed the notice, sent nothing, marked nothing and no job
  failed, where the job fails without the fix. "Export DOIs" answered
  400 with "An XML validation error occurred and the XML could not be
  exported." over "One or more invalid publication objects were
  included with the request.": since `pkp/pkp-lib#13507` the endpoint
  puts the first sentence over every error the agency returns. A
  dedicated answer for an empty list would need the endpoint changed
  too; the team may prefer it.
- "Export DOIs" on the work of the Steps: the file the export built
  held the PDF's record alone, which passes DataCite's schema check,
  where without the fix it also held the article's record with the
  empty DOI. The test install itself still stops at fetching the schema.
- The export's control (the article keeps its DOI): with the fix in and
  out, the file held both records with their DOIs, the article's with
  "HasPart" and the PDF's with "IsPartOf" naming each other, and both
  passed the schema check.

**Alternatives:**

- Skip an object without a DOI inside `exportAndDeposit()` or
  `depositXML()` instead of throwing. It would cover an issue without a
  DOI too, but `pkp/pkp-lib#13115` put the exception there on purpose,
  and a caller that passes an object without a DOI should hear of it.
- Catch the exception per object in `exportAndDeposit()`, so that one
  object's failure does not stop the others. That changes how every
  DataCite deposit reports errors, and the article has no DOI row to
  hold the error.
- Refuse the work before it is queued (make `whereHasDoi()` ask for the
  article's DOI while "Articles" is ticked). The galley's DOI would then
  stay "Unregistered", which is honest, but it could never be deposited,
  while the same galley on a journal with "Articles" unticked can.

**What goes with it:**

- 3.5 and 3.4, "Deposit DOIs": this fix's hunks apply there as written,
  at other line numbers. By the code (the trial ran on `main` only),
  they stop the deposit posting an article record without a DOI, which
  also removes the type error that ends the 3.5 job, and the galley is
  sent.
- 3.5 and 3.4, "Deposit All": this fix alone does not make it send a
  galley DOI there. Those branches also need the query change of
  `pkp/pkp-lib#13253` (lib/pkp
  [60f66f4332](https://github.com/pkp/pkp-lib/commit/60f66f43327923d5c5934e7c84f2e3a941439633),
  OJS
  [4a841ab206](https://github.com/pkp/ojs/commit/4a841ab206911ae663da9e923e1eacd6a231fe99)).
  That issue is closed with milestone 3.6, and neither `stable-3_5_0`
  nor `stable-3_4_0` has a backport. Backporting both changes is one
  decision.
- Stored data: galley DOIs already stuck at "Submitted" cannot be told
  from deposits still queued, so no migration is proposed. After the fix,
  "Deposit DOIs" on the work sends them. A release note should say so.
- The empty list under "DOI Versioning" "Yes": the current version has
  no DOI at all, and an older published version has one. "Deposit DOIs"
  still marks the older version's DOIs "Submitted"
  (`getPublishedDoisForSubmission()`). Today the job then fails, and its
  failed job is the only trace of those stuck DOIs; with the fix the job
  ends quietly. DataCite deposits only the current version, so those
  DOIs are not sent either way (the open `pkp/ojs#5866` changes that).
  To keep the trace, `depositSubmissions()` can throw on an empty list,
  as `exportAsDownload()` does (not tried).
- The open `pkp/ojs#5715` (DataCite peer-review DOIs, `pkp/pkp-lib#13062`)
  edits the same file, not these lines. The open `pkp/ojs#5866`
  (DataCite DOI versioning, `pkp/pkp-lib#11591`) moves both loops into
  one `_getSubmissionItems()` that lists each publication without asking
  for its DOI, so it keeps the fault; if it lands first, the condition
  goes there once, as `$publication->getDoi()`.
- Test: OJS has DataCite unit tests on `main`
  (`plugins/generic/datacite/tests/DataciteExportPluginTest.php`, added
  by `pkp/pkp-lib#13591`, and `DataciteXmlFilterTest.php`; 3.5 has the
  first). `DataciteExportPluginTest` is the pattern: a partial Mockery
  mock of the export plugin with `updateDepositStatus()` expected. The
  obstacle is in `DatacitePlugin`: both methods fetch the export plugin
  through the private `_getExportPlugin()`, from the plugin registry,
  which a test cannot replace. Making it protected (or moving the list
  into a method of its own) lets a test hand in a mocked export plugin
  and assert that an article without a DOI and a galley with one send
  the galley alone.

Small: one condition in two methods and a guard of three lines, in one
OJS plugin class, following the galley check beside it, with no data
repair. A unit test adds the small seam named above.

## Evidence

- Kept script, shared with
  [U45-A15-deposit-without-doi-reports-success.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U45-A15-deposit-without-doi-reports-success.md):
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/deposit-without-doi-reports-success/walk.js)
  with [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/deposit-without-doi-reports-success/lib.js),
  run on an install loaded from the default dataset with
  `WALK=galleyall PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/deposit-without-doi-reports-success/walk.js`
  for "Deposit All", `WALK=galley` for "Deposit DOIs",
  `WALK=galleyfirst` for "Articles" ticked later and `WALK=galleyexport`
  for "Export DOIs"; `RUNNER=jobtool` for the job tool, and
  `PKP_E2E_LINE=stable-3_5_0` in front for 3.5. Its other modes:
  `WAYROUND=1` the way round after the Steps,
  `NEIGHBOUR=1 WALK=galleyall` the control, `WALK=galleyonly` a journal
  with "Articles" unticked, `WALK=galleylater` galley DOIs turned on
  after the article was marked registered, `WALK=galleyleft` the empty
  list, `NEIGHBOUR=1 WALK=galleyexport` the export's control.
- Where the walk differs from the Steps: it reads the queue, each DOI's
  stored status and message and the failed job's exception from the
  database (read only) instead of "View Jobs" and "Details". The
  export's records were put through DataCite's kernel-4 schema in a PHP
  CLI outside the install, which cannot fetch the schema.
- Walked 2026-11-23 on PostgreSQL, PHP 8.3.36 with
  `zend.assertions = -1`, each install freshly loaded from pkp/datasets
  [abdb5d1](https://github.com/pkp/datasets/commit/abdb5d172e547779ee2b350a8ef5aa76509956bd)
  (2026-11-22), with no upgrade needed:
  - main: OJS [1e1d3fc49b](https://github.com/pkp/ojs/commit/1e1d3fc49b69290f0931e81982e4be8a35232cb3)
    (lib/pkp [3ea73a1a7e](https://github.com/pkp/pkp-lib/commit/3ea73a1a7e3e49f1167db3d31913d3068603c0b5)):
    `WALK=galleyall` and `WALK=galley`, each at page loads and with
    `RUNNER=jobtool`, as Observed.
  - stable-3_5_0: OJS [7f23f05a93](https://github.com/pkp/ojs/commit/7f23f05a9347ec72a51b6af638aa580550c5c92c)
    (lib/pkp [9295edd4f0](https://github.com/pkp/pkp-lib/commit/9295edd4f0d02f70cdde54958260dcddd7a83de5)):
    `WALK=galleyall` at page loads, and `WALK=galley` at page loads and
    with `RUNNER=jobtool`, as Observed.
  - Not walked again, since `pkp/pkp-lib#13591` changes only what
    follows a post: `WALK=galleyfirst`, the "Export DOIs" walks and the
    way round. Their results are from the walks of 2026-10-15 below.
- The fix, tried 2026-11-23 on the `main` tip above, as one command
  under `bin/app-lock.sh exclusive ojs`: `node bin/try-fix.js apply`
  of `fix-datacite-ojs.diff` on OJS, then `WALK=galleyall`,
  `WALK=galley` and `WALK=galley RUNNER=jobtool`, then
  `NEIGHBOUR=1 WALK=galleyall` with the fix in and, after the revert,
  out. The empty list (`WALK=galleyleft`) and the export
  (`WALK=galleyexport`, with its control) were tried on 2026-10-12 and
  2026-10-15 on the tips below.
- Walked 2026-10-15 on PostgreSQL, PHP 8.3 with `zend.assertions = -1`,
  each install freshly loaded from pkp/datasets
  [7912e09](https://github.com/pkp/datasets/commit/7912e09c2191e44b25b6926d1755bc5f2aa00f09)
  (2026-10-14):
  - main: OJS [378eced941](https://github.com/pkp/ojs/commit/378eced94154d9367f9a6fd02a7fc363400f7f6b)
    (lib/pkp [b17fadae59](https://github.com/pkp/pkp-lib/commit/b17fadae59156c99746754a740caf75b753e0aa1)):
    `WALK=galleyall`, `WALK=galley`, `WALK=galleyfirst` and
    `WALK=galleyexport`; the way round (`WAYROUND=1`), which gave the
    article a DOI and deposited both.
  - stable-3_5_0: OJS [ca763c91cd](https://github.com/pkp/ojs/commit/ca763c91cda7ac28d679bce0f6c1e25de9eb7c78)
    (lib/pkp [4045d9241e](https://github.com/pkp/pkp-lib/commit/4045d9241ea25d818136a12aaf824bd24f5df1d7)):
    `WALK=galleyexport`, and the way round after "Deposit DOIs".
- Walked 2026-10-12, pkp/datasets
  [fac2371](https://github.com/pkp/datasets/commit/fac23716137c760359271218bc335a421061f115):
  main OJS [d0b69b108d](https://github.com/pkp/ojs/commit/d0b69b108da49a53ff8a6cc15ffe0ea7b7824950)
  (lib/pkp [1ec9023e8a](https://github.com/pkp/pkp-lib/commit/1ec9023e8a9f3d701bfab396b8b148249c374dab)),
  `WALK=galleylater` and `WALK=galleyonly`, each of which queued a
  deposit (the two cases `pkp/pkp-lib#13253` fixed); stable-3_5_0 OJS
  [c90dfdb577](https://github.com/pkp/ojs/commit/c90dfdb577e9870229206ead446f7771d8300338),
  `WALK=galleylater`, which queued nothing and left the PDF's DOI
  "Submitted".
- Code reads, not walked: 3.4, OJS `upstream/stable-3_4_0`
  [4b437fd4c3](https://github.com/pkp/ojs/commit/4b437fd4c3ebe685fd8d555d5539e95a29a92607)
  (2026-11-23: `DatacitePlugin::depositSubmissions()` lines 138–149,
  `depositXML()` lines 271, 301, 320 and 355, Guzzle 7.9.2 in lib/pkp's
  `composer.lock`, `getAllDepositableSubmissionIds()` lines 42 and 71,
  and no `pkp/pkp-lib#13591` in the branch's log) and lib/pkp
  `origin/stable-3_4_0`
  [1310f00fed](https://github.com/pkp/pkp-lib/commit/1310f00fed01d4dd7adc4f43032acca204c66783)
  (`depositAll()`, `DepositSubmission::handle()`), with no
  `pkp/pkp-lib#13253` in either branch's log, nor in 3.5's; the export:
  `DatacitePlugin::exportSubmissions()` lines 111–122, the filter's
  `<identifier>` at line 185 from the object's `getDoi()` (line 179),
  and `PKPDoiHandler::exportSubmissions()` accepting any published work
  and answering 400 on an XML error, as on 3.5. 3.3, OJS
  `upstream/stable-3_3_0`
  [d7d9dd14ec](https://github.com/pkp/ojs/commit/d7d9dd14ec9d08d48b30d55c49cc97d714866b61)
  (lib/pkp 5e84acd11b): no `api/v1/dois`, no DOIs page and no
  `depositAll()`; deposits go through the agencies' export pages.
- Introduced: `git blame` on `DatacitePlugin.php` lines 121 and 156
  (both loops) leads through 2eaf4ccc25 (`pkp/pkp-lib#11621`, which
  added the "Articles" test) to 81664e1421, which wrote the loops with
  the article and every galley listed unchecked (no PR found for that
  commit).
  [f120d1a91f](https://github.com/pkp/ojs/commit/f120d1a91fcaf577f72028328bfcdadb91ae4d7f)
  (`pkp/pkp-lib#9044`, Bozana Bokan, 2023-05-31) then gave the galley
  loop its `getDoi()` check and left the article unchecked: the
  asymmetry the fix closes. On `main` the export reaches the loop for this
  work since `pkp/pkp-lib#13460` (`whereHasDoi()`); before it, the
  endpoint refused the work.
- Upstream search, 2026-10-12, 2026-10-15 and 2026-11-23: pkp/pkp-lib,
  pkp/ojs and pkp/ui-library, by the symptom (DataCite, galley DOI, deposit,
  export, empty identifier, article without a DOI, "Submitted", "Deposit
  All") and by `DatacitePlugin`, `depositSubmissions`,
  `exportSubmissions`, `getExportableDOIsSubmissionIds`, `depositXML`
  the exception's text and `updateDepositStatus`. Read and set aside: `pkp/pkp-lib#13519` (with
  `pkp/ojs#5935`, now closed and merged), issue DOIs on DataCite, another
  fault; `pkp/pkp-lib#13591`, the failed connection reading "Error",
  whose fix this report's update names; `pkp/pkp-lib#1585` (closed),
  Crossref's scheduled task of an older version passing articles
  without a DOI to its status update, another plugin and another code
  path; `pkp/ojs#5866`, named under "What goes with it".
- Unverified: the export's window on an install that can fetch the
  schema (by the code, `PKPDoiController::getXmlExportFailedMessage()`
  line 518 lists the `minLength` line under its first sentence);
  DataCite's answer to a galley deposited without its article, and to
  the article record without a DOI that 3.5 posts (the test installs
  cannot reach DataCite); the `AssertionError` on 3.5 with assertions
  on (by the code); the second route into the state with a galley DOI
  already "Registered" that later reads "Needs Sync" (by the code
  "Deposit All" takes it and fails the same way); the journal with
  "Articles" unticked on 3.5 and 3.4 (code read); the "Reach" items
  marked code read.
