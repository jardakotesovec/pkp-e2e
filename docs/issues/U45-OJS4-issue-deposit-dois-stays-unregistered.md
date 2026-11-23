# "Deposit DOIs" on the "Issues" tab queues the issues' deposits but they still read "Unregistered"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS
  - 3.5: OJS
  - 3.4: OJS (code)
  - 3.3: none (code; no DOIs page, a deposit runs while the manager waits)
- **Introduced** `pkp/ojs#3435` for `pkp/pkp-lib#8020` · [5abe94b642](https://github.com/pkp/ojs/commit/5abe94b6425f28dbad88ccc1fc114899ebfd1d5d) · 2022-06-21 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-11-23)
- **Tracked in** spec U45 [OJS4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#ojs4)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-23: a deposit that cannot connect to the agency now reads
"Error", so the issue is no longer left "Unregistered" for good once its
deposit has run; the fault still shows while the deposit waits.

## Summary

On a journal with Crossref or DataCite configured and "Issues" ticked
under "Items with DOIs", a Journal Manager ticks a published issue on
the DOIs page's "Issues" tab and confirms "Deposit DOIs". The page shows
"Items successfully submitted for deposit" and the issue's deposit is
queued, but the issue still reads "Unregistered". Expanded, it still
reads "The metadata for this item has not been submitted to {agency}."
over a "Deposit DOI(s)" button. The manager expects "Submitted", which
an article gets from the same action and an issue gets from "Deposit
All".

The deposit is not lost: it runs from the queue, and the issue then
reads "Registered" or "Error". Until it has run, the page says the
issue was not sent. A second "Deposit DOIs", the issue's own "Deposit
DOI(s)" or "Deposit All" each queues one more deposit of the same issue,
which sends the agency the same record again.

The wrong "Unregistered" shows on a journal whose queue a worker or a
cron job runs, until the queue is next run. On the default setting,
where queued jobs run at the end of page loads, the deposit runs within
the same page load, and the issue shows the deposit's result as soon as
the list is shown again.

## Impact

- **Lost.** No deposit and no data: only the status is wrong while the
  deposit waits.
- **Who.** A journal manager depositing ticked issues, at every such
  deposit, on an install whose queue a worker or a cron job runs. The
  wrong status lasts until the queue's next run: a few seconds under a
  worker, which polls the queue every 3 seconds by default, and up to a
  day under a nightly cron job. On the default setting it no longer
  shows.
- **Way round.** "Deposit All" in place of ticking the issue marks it
  "Submitted". After "Deposit DOIs" there is nothing to do but wait for
  the queue.

Low: the deposit runs and the status corrects itself when it has. It
would be medium if an agency refused a repeated deposit and left a
registered issue reading "Error"; Crossref's documentation treats a
repeat as an update, and what DataCite does with one was not checked.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main`: the journal `publicknowledge`,
  its published issue "Vol. 1 No. 2 (2014)" and its published submission
  17 ("Antimicrobial, heavy metal resistance and plasmid profile of
  coliforms isolated from nosocomial infections in a hospital in Isfahan,
  Iran"). The dataset has DOIs on for "Articles" only, with no DOI prefix
  and no registration agency, so steps 2 to 4 set Crossref up on screen.
- In `config.inc.php`, the queue is left to a worker or a cron job, so a
  queued deposit waits to be run:

  ```ini
  [queues]
  job_runner = Off
  ```

  The dataset ships `On`; what the page shows then is the last paragraph
  of Observed.
- The install has no outside connection (`[proxy]` `http_proxy` and
  `https_proxy` set to the dead `http://127.0.0.1:9`), so a deposit
  cannot reach the agency. "Testing" (test mode) is left unticked.
- DataCite instead of Crossref: in step 2 tick "DataCite Manager
  Plugin"; in step 4 choose "DataCite" and fill only "Username (symbol)"
  `u45rc`, with "Testing" unticked.

The deposit:

1. Sign in as `dbarnes`.
2. Settings › Website › "Plugins": tick "Crossref Manager Plugin".
3. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`,
   tick "Issues" under "Items with DOIs", "Save".
4. "Registration": "Registration Agency" "Crossref", "Depositor name"
   `Public Knowledge Project`, "Depositor email"
   `dbarnes@mailinator.com`, "Save".
5. Side menu "DOIs", tab "Issues": tick "Vol. 1 No. 2 (2014)"; "Bulk
   Actions" › "Assign DOIs" › "Assign DOIs". It reads "Unregistered".
6. Tab "Articles": tick submission 17; "Bulk Actions" › "Assign DOIs" ›
   "Assign DOIs".
7. Tab "Issues": tick "Vol. 1 No. 2 (2014)"; "Bulk Actions" › "Deposit
   DOIs" › "Deposit DOIs".
8. Reload the page, open the "Issues" tab and expand the issue ("Show
   more details about 1").
9. Tab "Articles": tick submission 17; "Bulk Actions" › "Deposit DOIs" ›
   "Deposit DOIs".
10. On the server, in the OJS directory, run the queue as a cron job
    does: `php lib/pkp/tools/jobs.php run`. Reload the DOIs page, open
    the "Issues" tab and expand the issue.

Depositing again: load the dataset afresh and take steps 1 to 5 and
step 7 once more (not steps 6, 8, 9 or 10), then:

11. Reload, tab "Issues": tick the issue again; "Bulk Actions" ›
    "Deposit DOIs" › "Deposit DOIs".
12. Reload, tab "Issues": expand the issue and press "Deposit DOI(s)",
    then "Deposit DOIs".

**Expected.** Step 7 shows "Items successfully submitted for deposit" and
the issue reads "Submitted", in step 8 too, as the article does in
step 9. Expanded, a "Submitted" issue offers no "Deposit DOI(s)". Once
step 10 has run the queue, the agency's answer sets the issue and the
article "Registered" or "Error".

**Observed.** Step 7 shows "Items successfully submitted for deposit" and
the issue reads "Unregistered". The request answered 200, and the queue
holds the issue's deposit (`SELECT payload FROM jobs` shows one
`APP\jobs\doi\DepositIssue`):

```
PUT /index.php/publicknowledge/api/v1/dois/issues/deposit  → 200
[]
```

Step 8: the issue still reads "Unregistered" and its expanded view ends
with "The metadata for this item has not been submitted to Crossref."
and "Deposit DOI(s)". Step 9 shows the same notice, and the article reads
"Submitted" at once and after a reload.

Step 10: the command-line job runner runs both deposits ("Completed
running 2 jobs in the queue named queue."). With no outside connection
both fail, and the issue and the article read "Error"; their "View
Error" gives
`cURL error 7: Failed to connect to api.crossref.org port 443 via 127.0.0.1 …`.
With DataCite both read "Error" too. An install that reaches the agency
gets the agency's own refusal instead; by the code, Crossref's `401` for
the missing username and password reads "Please check that your
Crossref credentials are correct and try again. (401 Unauthorized)".

Steps 11 and 12 each show the notice again and leave the issue
"Unregistered"; the queue then holds two and three
`APP\jobs\doi\DepositIssue` for the one issue. "Deposit All" › "Deposit
all DOIs" in place of step 11 queues a second one too, and turns the
issue to "Submitted".

With the dataset's own `job_runner = On`, after steps 1 to 5 and step 7
(no step 6): the
deposit had run by the time the list was shown again, and the issue
read "Error" at once, with the same connection error under "View Error".

## Cause

`DoiController::depositIssues()` (OJS `api/v1/dois/DoiController.php`,
lines 157 to 162) queues a `DepositIssue` job per ticked issue and is
meant to collect the issues' DOIs for `markSubmitted()`. Line 160 calls
`array_merge()` and drops what it returns:

```php
$doisToUpdate = [];
foreach ($requestIds as $issueId) {
    dispatch(new DepositIssue($issueId, $context, $agency));
    array_merge($doisToUpdate, Repo::doi()->getDoisForIssue($issueId));
}
Repo::doi()->markSubmitted($doisToUpdate);
```

`$doisToUpdate` is still empty after the loop, so `markSubmitted([])`
updates no row. The request answers 200, and the page shows its notice
for that.

The lines came with 5abe94b642 (`pkp/pkp-lib#8020`, "Use queued jobs for
all DOI deposits"). That change moved a deposit out of the request into
a queued job, and marks the DOI so that it reads "Submitted" while the
job waits. Its twin for articles, `PKPDoiController::depositSubmissions()`
(lib/pkp `api/v1/dois/PKPDoiController.php` line 568), keeps the result:
`$doiIdsToUpdate = array_merge($doiIdsToUpdate, …)`.

Nothing else sets the issue's status until the deposit has run. The
agency plugin's `updateDepositStatus()` then writes "Registered" or
"Error" (`CrossrefExportPlugin::depositXML()`,
`DataciteExportPlugin::depositXML()`). Since `pkp/pkp-lib#13591` both
catch a `TransferException` and write "Error" when the deposit cannot
connect too, so the run of the queue ends the wrong "Unregistered".

Nothing in `depositIssues()` looks at the status either, so each further
request queues another job. A repeated job builds the issue's record
anew: for Crossref the same record under a later `<timestamp>`
(`CrossrefFilterBuilder`, `date('YmdHisv')`), for DataCite the same
metadata, DOI and URL posted again.

Reach (each item seen on screen, unless it says "read in the code"):

- "Deposit DOIs" on ticked issues, and the "Deposit DOI(s)" button of an
  expanded issue, which opens the same window and sends the same request.
- Every registration agency: the controller runs before any agency code.
  Crossref and DataCite walked.
- "Deposit All" and "Automatic Deposit" go through OJS's
  `Repository::depositAll()`, which marks the issues' DOIs
  (`classes/doi/Repository.php` line 397; "Automatic Deposit" read in the
  code). It lists every issue whose DOI reads "Unregistered", "Error" or
  "Needs Sync" (`DAO::getAllDepositableIssueIds()`), so it queues a
  second deposit for an issue whose first is still waiting.
- Articles and galleys: not affected.
- OMP and OPS have no journal issues, so no such action.

## Proposed fix

A proposal, as
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/fix.diff).
The diff as written, with `true`, is not tried. The same assignment
without `true` was tried on `main`; with "Issues" ticked, as in the
Steps, both forms return the same DOI (`Repository::getDoisForIssue()`),
so the result below holds for both. With the fix, step 7 leaves the issue reading "Submitted", in step 8
too, with no "Deposit DOI(s)" in its expanded view, and the article of
step 6, not ticked, still reads "Unregistered". After step 10 the issue
reads "Error" with the connection error under "View Error", as the
article does. A "Deposit All" after step 7 queues nothing more for the
issue. A ticked unpublished issue is
refused as before with nothing marked, and "Deposit All" alone gives the
same result with the fix in and out.

Recommended: keep the result of `array_merge()`, as
`PKPDoiController::depositSubmissions()` does, and take the issue's DOI
only while "Issues" is ticked:

```diff
         foreach ($requestIds as $issueId) {
             dispatch(new DepositIssue($issueId, $context, $agency));
-            array_merge($doisToUpdate, Repo::doi()->getDoisForIssue($issueId));
+            $doisToUpdate = array_merge($doisToUpdate, Repo::doi()->getDoisForIssue($issueId, true));
         }
         Repo::doi()->markSubmitted($doisToUpdate);
```

The controller action owns the rule "queue the deposit, then mark its
DOIs", and issues exist only in OJS, so this is the one place.

The second argument `true` marks exactly the DOIs the deposit writes
back. `CrossrefExportPlugin::updateDepositStatus()` reads an issue's
DOIs with `getDoisForIssue($id, true)` (line 440), and
`Repository::depositAll()` takes issues only while "Issues" is ticked
(line 376). With "Issues" unticked, a state only an API client reaches
since the "Issues" tab is hidden then, the one-argument form would mark
the issue "Submitted" and the Crossref job would never write its answer
back, so the issue would stay "Submitted" for good. With `true` the
issue keeps its status, as today. The three sibling actions (lines 205,
251 and 300) keep the one-argument form: they set a final status
themselves, and no job writes one back.

It can land on its own. A deposit that cannot connect now turns the
issue from "Submitted" to "Error" (`pkp/pkp-lib#13591`), which "Deposit
All" takes again, so marking the issue no longer leaves a failed deposit
stuck at "Submitted".

**Alternatives:**

- Mark the DOI in `DepositIssue::handle()` when the job starts:
  "Submitted" is there to cover the time in the queue, and this would
  mark only at its end.
- One repository method that queues and marks, shared by this action
  and `depositAll()`: it would keep the two paths from drifting apart,
  but it is a refactor, not needed to fix this.

**What goes with it:**

- A "Submitted" issue's expanded view reads "This item has been manually
  registered with a registration agency.", as a "Submitted" article's
  does: that is
  [U45 A4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#a4).
- A deposit job that throws, rather than getting an answer or failing
  to connect, still leaves its DOIs "Submitted" for good, as it does an
  article's: `DepositIssue` and `DepositSubmission` have no `failed()`
  handler (read in the code). With the fix an issue's deposit joins the
  article's there.
- A DataCite deposit in "Testing" mode that succeeds stores no status:
  `DataciteExportPlugin::depositXML()` (line 336) skips
  `updateDepositStatus()` in test mode. The DOIs the action marked stay
  "Submitted": an article's today, and an issue's with the fix (read in
  the code).
- A second "Deposit DOIs" on a ticked "Submitted" issue still queues a
  second deposit, as it does for an article: the action checks no
  status. The fix removes what prompts it.
- Stored data: nothing to repair. A status left "Unregistered" is
  corrected by the agency's answer or by the next deposit.
- The API answers as before (200, an empty body).
- Backport: the diff applies to `stable-3_5_0` as it stands. On
  `stable-3_4_0` the same statement is line 159 of
  `api/v1/dois/DoiHandler.php`.
- Test: none is proposed in OJS's own suites. No test there presses
  "Deposit DOIs" (`tests/jobs/doi/DepositIssueTest.php` covers the job,
  not the action). `cypress/tests/integration/Doi.cy.js` sets no agency,
  so the action is not on its page. `DoiCrossref.cy.js` turns Crossref
  on, but a deposit there would post to `api.crossref.org` from CI:
  queued jobs run at the end of requests, and only
  `[general] sandbox = On` stops the outside call, which the config
  shipped with pkp's datasets leaves `Off`. The regression test is the pkp-e2e U45
  scenario: after "Deposit DOIs" an issue reads "Submitted".

Small: one assignment in one method, following its twin in lib/pkp,
and it lands without a test of OJS's own.

## Evidence

- Kept script that takes the Steps through the screens on OJS, on an
  install loaded from PKP's default test dataset:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/walk.js)
  with [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/lib.js),
  run with
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). Steps 1 to 10 are the
  default walk, steps 11 and 12 `WALK=again`, "Deposit All" after step 7 `WALK=twice`, the
  `job_runner = On` paragraph `WALK=default`, DataCite `AGENCY=datacite`,
  and the refused unpublished issue `WALK=nb`. The script sets
  `job_runner` in the install's config file itself and reads the queue
  and each DOI's stored status from the `jobs`, `failed_jobs` and `dois`
  tables (read only).
- The change behind the update: `pkp/pkp-lib#13591`, merged as
  `pkp/crossref-ojs#117` and `pkp/ojs#5977` on `main` and as
  `pkp/crossref-ojs#118` and `pkp/ojs#5978` on 3.5. Before it (walked
  2026-10-09) the failed connection left the issue "Unregistered" and
  the article "Submitted" after the queue ran.
- Step 10: on 3.5 with Crossref, and on `main` with DataCite, the
  command-line job runner's "Error" kept no message and the agency box
  offered no "View Error": that is a separate fault,
  [U45 A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#a31).
- `job_runner = On` (`WALK=default`): the issue read "Error" about 2
  seconds after the press on `main` and 7 on 3.5, with no deposit job
  left in the queue. The install serves one request at a time
  (`php -S`), so the deposit at the end of the deposit's request ends
  before the list is fetched.
- The worker's poll: `WorkerConfiguration::$sleep = 3` (lib/pkp
  `classes/queue/WorkerConfiguration.php` line 54), the default of
  `jobs.php work --sleep`.
- The fix, tried 2026-11-23 in its one-argument form
  (`getDoisForIssue($issueId)`) on the `main` tip below with
  `bin/try-fix.js` (apply, the walks, revert). The two-argument form now
  in `fix.diff` is not tried: the trial's install had been handed to
  other work by then. Steps 1 to 10 with
  Crossref (`PROBE_RUN=fix`) read "Submitted" in steps 7 and 8 and
  "Error" with the cURL message after step 10, for the issue as for the
  article. Tried 2026-10-09 before `pkp/pkp-lib#13591`: `WALK=twice`
  ("Deposit All" after step 7 queued nothing more for the issue) and
  DataCite with "Deposit All" (`AGENCY=datacite AFTER=all`).
- The control case (`WALK=nb`), with the fix in and out (2026-11-23,
  as on 2026-10-09): "Vol. 1 No. 2
  (2014)" and the unpublished "Vol. 2 No. 1 (2015)" ticked together,
  "Deposit DOIs" answered `400` "One or more invalid publication objects
  were included with the request.", showed no notice, queued nothing and
  left the issue "Unregistered"; "Deposit All" then set it "Submitted"
  and queued one `DepositIssue`.
- A repeated deposit at Crossref: its documentation
  (<https://www.crossref.org/documentation/register-maintain-records/maintaining-your-metadata/updating-your-metadata/>,
  read 2026-10-09) says "During the update process we overwrite the
  existing metadata with the new information you submit" and "the value
  included in the <timestamp> element must be incremented each time a
  DOI is updated"; the plugin writes the time of each build, to the
  millisecond. DataCite: its MDS guide
  (<https://support.datacite.org/docs/mds-api-guide>) documents the calls
  as `PUT` where the plugin sends `POST`. Of the DOI call it says "This
  method will attempt to update the URL if you specify a DOI with an
  existing URL"; nothing was found there on metadata posted again.
- Walked 2026-11-23 on PostgreSQL, each install freshly loaded from
  pkp/datasets
  [abdb5d1](https://github.com/pkp/datasets/commit/abdb5d172e547779ee2b350a8ef5aa76509956bd)
  (2026-11-22), `ojs/main/pgsql` and `ojs/stable-3_5_0/pgsql`, no
  upgrade needed:
  - main: OJS [1e1d3fc49b](https://github.com/pkp/ojs/commit/1e1d3fc49b69290f0931e81982e4be8a35232cb3)
    (lib/pkp 3ea73a1a7e, ui-library 836c01b5, crossref 08da83b), which
    has `pkp/ojs#5977` and `pkp/crossref-ojs#117`: steps 1 to 10 with
    Crossref and with DataCite, and the `job_runner = On` paragraph, as
    Observed. `api/v1/dois/DoiController.php` line 160 is unchanged.
  - stable-3_5_0: OJS [7f23f05a93](https://github.com/pkp/ojs/commit/7f23f05a9347ec72a51b6af638aa580550c5c92c)
    (lib/pkp 9295edd4f0, crossref 622a14d), which has `pkp/ojs#5978` and
    `pkp/crossref-ojs#118`: steps 1 to 10 with Crossref and the
    `job_runner = On` paragraph, as Observed (the message aside, see
    step 10 above). Its `api/v1/dois/DoiController.php` has the same
    statement at line 159.
  - Walked only on 2026-10-09, on OJS `main` 6d5b793c4e and 3.5
    c6e2c3a879, and not again since `pkp/pkp-lib#13591` changes only what
    a deposit writes once it has run: steps 11 and 12, "Deposit All"
    after step 7 (`WALK=twice`), and DataCite with "Deposit All" and the
    fix in (`AGENCY=datacite AFTER=all`).
  - Not database-dependent.
- 3.4, by code: OJS `stable-3_4_0` at 4b437fd4c3,
  `api/v1/dois/DoiHandler.php` line 159: the same statement, with
  `markSubmitted($doisToUpdate)` at line 161. lib/pkp `stable-3_4_0` at
  1310f00fed, `api/v1/dois/PKPDoiHandler.php` line 456, keeps the result
  for articles.
- 3.3, by code: OJS `stable-3_3_0` at de6f4ead8e: no `api/v1/dois` and
  no DOIs page. `PubObjectsExportPlugin::executeExportAction()`
  (`classes/plugins/PubObjectsExportPlugin.inc.php` line 222 on) sends a
  deposit inside the manager's request.
- Introduced: before 5abe94b642 (`git blame` on lines 157 to 162; PR
  `pkp/ojs#3435`, merged 2022-06-22) `depositIssues()` called the agency
  inside the request and set no status first. No release ever marked a
  ticked issue "Submitted", so the Kind is defect, not regression.
- Every instance: a search of OJS, OMP, OPS and lib/pkp (`api`,
  `classes`, `jobs`, `pages`, `plugins`, `controllers`) for an `array_…`
  function called as a statement of its own. The only other hit,
  `array_map(unlink(...), …)` in lib/pkp `PKPTemplateManager.php` line
  1815, is called for its side effect.
- `getDoisForIssue()`: OJS `classes/doi/Repository.php` line 315. The
  "Issues" tab follows `displayIssuesTab`
  (`pages/dois/DoisHandler.php` line 101). DataCite's
  `updateDepositStatus()` writes the issue's own `doiObject`, whatever
  is ticked.
- The Cypress reading: `DoiListPanel.vue` shows "Deposit DOIs" only with
  `isRegistrationPluginConfigured`; `DoiCrossref.cy.js` sets the agency
  back to "None" at its end; `PKPQueueProvider::boot()` and
  `CrossrefExportPlugin::depositXML()` (line 318) both return early
  under `sandbox`; `sandbox = Off` at line 137 of the datasets'
  `ojs/main/pgsql/config.inc.php`.
- Upstream search 2026-11-23 (and 2026-10-09) in pkp/pkp-lib, pkp/ojs
  and pkp/ui-library, by the symptom's words and by `depositIssues`,
  `markSubmitted` and `doisToUpdate`: nothing about this fault.
  `pkp/pkp-lib#13591` (open, fixes merged) names
  `DoiController::depositIssues()` among the deposit paths but is about
  a deposit that cannot connect, not the dropped `array_merge()`. `pkp/pkp-lib#13447` (open,
  PRs `pkp/pkp-lib#13460` and `pkp/ojs#5903`) changes which of an
  article's DOIs a deposit marks; the OJS PR does not touch
  `DoiController.php`.
- Unverified: the agency's answer to an issue's deposit ("Registered" or
  a refusal's "Error") and to a repeated one, read in the code and in
  Crossref's documentation, not seen, since the walked installs reach no
  agency; that Crossref answers the missing credentials with `401` is
  likewise not seen. The fix with "Issues" unticked is read in the code,
  not walked: no screen sends the request then. On the default setting under PHP-FPM, or with an agency that
  takes seconds to answer, the list may be fetched while the deposit
  still runs and read "Unregistered" for that time (not checked). With
  the fix in, the second "Deposit DOIs" on a "Submitted" issue was read
  in the code, not pressed. DataCite was not walked on 3.5.
