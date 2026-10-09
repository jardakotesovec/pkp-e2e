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
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U45 [OJS4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#ojs4)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

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

The deposit is not lost: it runs from the queue, and the agency's answer
then sets "Registered" or "Error". Until it has run, the page says the
issue was not sent. A second "Deposit DOIs", the issue's own "Deposit
DOI(s)" or "Deposit All" each queues one more deposit of the same issue,
which sends the agency the same record again.

It shows where a worker or a cron job runs the queue, until the next
run. On the default setting, where queued jobs run at the end of page
loads, the deposit is tried within a page load, and "Unregistered" stays
only when that try cannot connect to the agency. There "Unregistered" is
the true status and "Deposit All" takes the issue again, while an
article in the same case is left "Submitted" for good, a fault of its
own
([U45 A18](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#a18)).
Marking the issue "Submitted" would leave it stuck the same way, so this
fix belongs with or after that one.

## Impact

- **Lost.** No deposit and no data. The status is wrong while the
  deposit waits, and a manager who acts on it deposits the issue twice.
  Crossref's documentation treats a repeated deposit as an update that
  overwrites the record; what DataCite answers to one was not checked.
- **Who.** A journal manager depositing ticked issues, at every such
  deposit, on an install whose queue a worker or a cron job runs. On the
  default setting, only when the deposit cannot connect to the agency.
- **Way round.** "Deposit All" in place of ticking the issue marks it
  "Submitted". After "Deposit DOIs" there is nothing to do but wait for
  the queue: every further press queues the issue again.

Low: the deposit runs, the status corrects itself when it has, and a
repeated deposit sends the same record, which Crossref takes as an
update. It would be medium if an agency refused a repeat and left a
registered issue reading "Error"; no agency can be reached from a test
install to see that.

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

Depositing again, on a freshly loaded dataset after steps 1 to 5 and 7:

10. Reload, tab "Issues": tick the issue again; "Bulk Actions" ›
    "Deposit DOIs" › "Deposit DOIs".
11. Reload, tab "Issues": expand the issue and press "Deposit DOI(s)",
    then "Deposit DOIs".

**Expected.** Step 7 shows "Items successfully submitted for deposit" and
the issue reads "Submitted", in step 8 too, as the article does in
step 9. Expanded, a "Submitted" issue offers no "Deposit DOI(s)".

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

Steps 10 and 11 each show the notice again and leave the issue
"Unregistered"; the queue then holds two and three
`APP\jobs\doi\DepositIssue` for the one issue. "Deposit All" › "Deposit
all DOIs" in place of step 10 queues a second one too, and turns the
issue to "Submitted".

With the dataset's own `job_runner = On`, after steps 1 to 5 and 7: the
deposit had been tried once when the list was shown again, and had
failed for good two page loads and about 15 seconds later, since this
install cannot connect to Crossref. The issue read "Unregistered"
throughout.

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
(lib/pkp `api/v1/dois/PKPDoiController.php` line 552), keeps the result:
`$doiIdsToUpdate = array_merge($doiIdsToUpdate, …)`.

Nothing else sets the issue's status until the deposit has an answer.
The agency plugin's `updateDepositStatus()` then writes "Registered" or
"Error" (`CrossrefExportPlugin::depositXML()`,
`DataciteExportPlugin::depositXML()`). A deposit that cannot connect
writes nothing (U45 A18), which leaves the issue "Unregistered".

Nothing in `depositIssues()` looks at the status either, so each further
request queues another job. A repeated job builds the issue's record
anew: for Crossref the same record under a later `<timestamp>`
(`CrossrefFilterBuilder`, `date('YmdHisv')`), for DataCite the same
metadata, DOI and URL posted again.

Reach:

- "Deposit DOIs" on ticked issues, and the "Deposit DOI(s)" button of an
  expanded issue, which opens the same window and sends the same request
  (both seen on screen).
- Every registration agency: the controller runs before any agency code.
  Crossref and DataCite seen on screen. On `main` the queued DataCite
  deposit of an issue then fails on the server, which is
  [U45 OJS2](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#ojs2).
- "Deposit All" and "Automatic Deposit" go through OJS's
  `Repository::depositAll()`, which marks the issues' DOIs
  (`classes/doi/Repository.php` line 397; "Deposit All" seen on screen).
  It lists every issue whose DOI reads "Unregistered", "Error" or "Needs
  Sync" (`DAO::getAllDepositableIssueIds()`), so it queues a second
  deposit for an issue whose first is still waiting (seen on screen with
  "Deposit All").
- Articles and galleys: not affected (the article seen on screen).
- OMP and OPS have no journal issues, so no such action.

## Proposed fix

A proposal, tried on `main` as
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/fix.diff).
With the fix, step 7 leaves the issue reading "Submitted", in step 8
too, with no "Deposit DOI(s)" in its expanded view, and the article of
step 6, not ticked, still reads "Unregistered". A "Deposit All" after
step 7 queues nothing more for the issue. A ticked unpublished issue is
refused as before with nothing marked, and "Deposit All" alone gives the
same result with the fix in and out.

Recommended: keep the result of `array_merge()`, as
`PKPDoiController::depositSubmissions()` does:

```diff
         foreach ($requestIds as $issueId) {
             dispatch(new DepositIssue($issueId, $context, $agency));
-            array_merge($doisToUpdate, Repo::doi()->getDoisForIssue($issueId));
+            $doisToUpdate = array_merge($doisToUpdate, Repo::doi()->getDoisForIssue($issueId));
         }
         Repo::doi()->markSubmitted($doisToUpdate);
```

The controller action owns the rule "queue the deposit, then mark its
DOIs", and issues exist only in OJS, so this is the one place.
`getDoisForIssue()` keeps its one argument, as in the three sibling
actions (lines 205, 251 and 300): the action marks the DOI of every
issue it queued. The two-argument form leaves out an issue's DOI once
"Issues" is unticked, a state only an API client reaches, since the
"Issues" tab is hidden then.

Land it after, or together with, the fixes of U45 OJS2 and U45 A18. On
its own it turns a failed issue deposit from "Unregistered", which
"Deposit All" takes again, into "Submitted", which nothing takes again,
and on a DataCite journal on `main` every issue deposit fails (OJS2).
Tried with DataCite and the fix in: the issue read "Submitted" after its
deposit had failed, and "Deposit All" queued nothing for it.

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
- The fix proposed for A18 records a failed connection in the agency
  plugins' `depositXML()`, which an issue's deposit goes through too
  (read in the code).
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
  queued jobs run at the end of requests, and only `[general] sandbox =
  On` stops the outside call, which the config shipped with pkp's
  datasets leaves `Off`. The regression test is the pkp-e2e U45
  scenario: after "Deposit DOIs" an issue reads "Submitted".

Small: one assignment in one method, following its twin in lib/pkp. It
lands without a test of OJS's own, and its place after OJS2 and A18 is
an ordering, not more work.

## Evidence

- Kept script that takes the Steps through the screens on OJS, on an
  install loaded from PKP's default test dataset:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/walk.js)
  with [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/lib.js),
  run with
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). Steps 10 and 11 are
  `WALK=again`, "Deposit All" after step 7 `WALK=twice`, the
  `job_runner = On` paragraph `WALK=default`, DataCite `AGENCY=datacite`,
  and the refused unpublished issue `WALK=nb`. The script sets
  `job_runner` in the install's config file itself and reads the queue
  and each DOI's stored status from the `jobs`, `failed_jobs` and `dois`
  tables (read only).
- No Crash bullet: no request of this fault answered a server error on
  any walk. The "crash: server" beside this entry in the spec's register
  came from the DataCite issue deposit's `TypeError`, which is U45
  OJS2's.
- After steps 1 to 9 the script ran the queue once
  (`php lib/pkp/tools/jobs.php work --stop-when-empty=1`). The walked
  installs reach no agency, so both deposits failed at connecting
  (`cURL error 7: Failed to connect to api.crossref.org port 443 …`):
  the issue still read "Unregistered" and the article "Submitted", on
  `main` and on 3.5. With DataCite on `main` the issue's `DepositIssue`
  failed with the `TypeError` of U45 OJS2, the article's deposit at
  connecting to `mds.datacite.org`, and the statuses read the same.
- `job_runner = On` (`WALK=default`), on `main`: the job's `attempts`
  read 1 at the first read of the list after the notice, 2 on the next
  load, and the job was in `failed_jobs` on the load after, about 15
  seconds after the press. The install serves one request at a time
  (`php -S`), so the try at the end of the deposit's request ends before
  the list is fetched; under PHP-FPM the list may be fetched while the
  try still runs (not checked).
- The fix, tried 2026-10-09 on the `main` tip below with `bin/try-fix.js`
  (apply, the walks, revert): steps 1 to 9 with Crossref, `WALK=twice`,
  `WALK=nb`, and steps 1 to 9 with DataCite followed by "Deposit All"
  (`AGENCY=datacite AFTER=all`). After the queue ran with the fix in,
  the issue stayed "Submitted" with both agencies, as the article did.
- The control case (`WALK=nb`), with the fix in and out: "Vol. 1 No. 2
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
- Walked 2026-10-09 on PostgreSQL, each install freshly loaded from
  pkp/datasets
  [1a196c3](https://github.com/pkp/datasets/commit/1a196c37c0029404716289c8e4946b77962bc579)
  (2026-10-08), `ojs/main/pgsql` and `ojs/stable-3_5_0/pgsql`, no
  upgrade needed:
  - main: OJS [6d5b793c4e](https://github.com/pkp/ojs/commit/6d5b793c4e78a83986052ad631fdeaeab5150c7e)
    (lib/pkp d1bc3a9ecc, ui-library 38814ea1): as Observed, every
    paragraph; steps 1 to 9 with DataCite too.
  - stable-3_5_0: OJS [c6e2c3a879](https://github.com/pkp/ojs/commit/c6e2c3a87925327667a01b1f8ea0666133ee0610)
    (lib/pkp d702d012dd): steps 1 to 9 with Crossref, as Observed. Its
    `api/v1/dois/DoiController.php` has the same statement at line 159.
  - Not database-dependent.
- 3.4, by code: OJS `stable-3_4_0` at 4dc0c17acf,
  `api/v1/dois/DoiHandler.php` line 159: the same statement, with
  `markSubmitted($doisToUpdate)` at line 161. lib/pkp `stable-3_4_0` at
  8bf0ab5072, `api/v1/dois/PKPDoiHandler.php` line 456, keeps the result
  for articles.
- 3.3, by code: OJS `stable-3_3_0` at a752a1ce8e: no `api/v1/dois` and
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
- `getDoisForIssue()`: OJS `classes/doi/Repository.php` line 315; with
  its second argument `true` it returns the issue's DOI only while
  "Issues" is ticked, the form `CrossrefExportPlugin::updateDepositStatus()`
  uses (line 425). The "Issues" tab follows `displayIssuesTab`
  (`pages/dois/DoisHandler.php` line 101).
- The Cypress reading: `DoiListPanel.vue` shows "Deposit DOIs" only with
  `isRegistrationPluginConfigured`; `DoiCrossref.cy.js` sets the agency
  back to "None" at its end; `PKPQueueProvider::boot()` and
  `CrossrefExportPlugin::depositXML()` (line 308) both return early
  under `sandbox`; `sandbox = Off` at line 137 of the datasets'
  `ojs/main/pgsql/config.inc.php`.
- Upstream search 2026-10-09 in pkp/pkp-lib, pkp/ojs and pkp/ui-library,
  by the symptom's words and by `depositIssues`, `markSubmitted` and
  `doisToUpdate`: nothing about this fault. `pkp/pkp-lib#13447` (open,
  PRs `pkp/pkp-lib#13460` and `pkp/ojs#5903`) changes which of an
  article's DOIs a deposit marks; the OJS PR does not touch
  `DoiController.php`.
- Unverified: the agency's answer to an issue's deposit ("Registered" or
  "Error") and to a repeated one, read in the code and in Crossref's
  documentation, not seen, since the walked installs reach no agency.
  What the page shows on the default setting when the agency is
  reachable follows from that answer and was not seen either. With the
  fix in, the second "Deposit DOIs" on a "Submitted" issue was read in
  the code, not pressed. DataCite was not walked on 3.5.
