# A preprint server's Crossref deposit run by the job tool sends the site's address, so DOIs lead to "Login"

- **Severity** high
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OPS
  - 3.5: OPS
  - 3.4: OPS (code)
  - 3.3: none (code; no job queue)
- **Introduced** no PR (OPS's development before its first release) · [d527a8e0e5](https://github.com/pkp/ops/commit/d527a8e0e54d720c0a9742a137eda74eeadfd154) · 2020-02-22 · Antti-Jussi Nygård (ajnyga)
- **Upstream** none found (2026-11-23)
- **Tracked in** spec U45 [OPS8](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#ops8)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A preprint server registers its DOIs with Crossref and runs its
background jobs with the command-line job tool, as a worker or a cron
job. A manager deposits a posted preprint and expects Crossref to be
given the preprint's page.

Instead, the deposit gives the preprint's address under the site,
`…/index.php/index/preprint/view/…`, where the server's own path
belongs. A reader who follows the DOI lands on the site's "Login" page.
No screen shows the address a deposit sends, so nobody notices, and the
manager cannot correct it.

Where jobs run at the end of page loads (`job_runner = On`, as an
install ships), a deposit run at the end of one of the server's own
pages sends the right address. One run at the end of a site
administration page sends the site's.

## Impact

- **Lost**: the link from each DOI to its preprint. A reader who
  follows it lands on the site's "Login" page; signed in, on a site page
  that reads "You cannot call this operation without a context (press,
  journal, conference, etc)." Nobody is told.
- **Who**: preprint servers that register DOIs with Crossref, the only
  DOI agency OPS offers. With the job tool, every deposit is affected:
  "Deposit DOIs", "Deposit All" and the automatic deposit. Where jobs
  run at the end of page loads, the deposits that wait in the queue and
  then run at the end of a page outside the server are affected. Every
  server on an install is affected the same way.
- **Way round**: one, and it takes the administrator and the manager.
  The administrator sets `job_runner = On`. The manager then deposits
  from the server's DOIs page while nothing else is queued
  (Administration › "Jobs" lists the queue). The deposit runs at the end
  of that same request and sends the right address. For preprints
  already registered, "Deposit All" does not help: it skips rows that
  read "Registered". The manager ticks those rows and chooses "Deposit
  DOIs", and the new deposit replaces the address Crossref holds.
  Nothing lists which preprints went out wrong.

High: the address Crossref holds is wrong for every preprint deposited
this way, silently, on a preprint server with Crossref and the job
tool. What would raise it: most deposits made with jobs run at the end
of page loads running outside the server's own pages.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (`stable-3_5_0` on 3.5), OPS.
- `config.inc.php`, `[queues]`: `job_runner = Off`, so queued jobs run
  only when the job tool runs, as on an install with a worker or a cron
  job; `process_jobs_at_task_scheduler = Off`, as the dataset ships it,
  so the scheduled tasks do not run the queue either.
- `config.inc.php`, `[proxy]`: `http_proxy = "http://127.0.0.1:9"` and
  `https_proxy = "http://127.0.0.1:9"`, a closed port, so the deposits
  never reach Crossref. The address the file carries does not depend on
  Crossref's answer.
- No screen shows the file a deposit sends, and the plugin deletes it
  right after the send. So a terminal copies each one from the
  install's `files_dir`, `temp/` folder, as soon as it is written:

  ```sh
  cd <files_dir>/temp
  while :; do for f in crossrefplugin-*.xml; do [ -s "$f" ] && cp -n "$f" /tmp/; done; sleep 0.01; done
  ```

Set up Crossref:

1. Sign in as `dbarnes`.
2. Settings › Website › "Plugins": tick "Crossref Manager Plugin".
3. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`,
   "Save".
4. "Registration": "Registration Agency" "Crossref", "Depositor name"
   `Public Knowledge Project`, "Depositor email"
   `dbarnes@mailinator.com`, "Save".

With the job tool:

5. Open the "DOIs" page. Tick preprint 2, "The Facets Of Job
   Satisfaction: A Nine-Nation Comparative Study Of Construct
   Equivalence". Choose "Bulk Actions" › "Assign DOIs" and confirm.
6. Tick it again. Choose "Bulk Actions" › "Deposit DOIs" and confirm.
   The row reads "Submitted".
7. In the install's directory, run `php lib/pkp/tools/jobs.php run`.
   It prints PHP warnings
   (`DOMDocument::schemaValidate(https://www.crossref.org/schemas/crossref5.4.0.xsd): Failed to open stream: Connection refused`,
   PHP 8.3): the closed proxy port blocks the fetch of Crossref's
   schema. The deposit still writes its file and tries to send it.
8. Read `<resource>` in the copied
   `/tmp/crossrefplugin-<date>-<time>-preprints-2-1.xml`.
9. Open that address in a private window, not signed in.

**Expected**: the preprint's own page:

```
<resource>{base url}/index.php/publicknowledge/preprint/view/2/version/2</resource>
```

Step 9 shows "The Facets Of Job Satisfaction: …".

**Observed**: the job tool reports `Processed: PKP\jobs\doi\DepositSubmission`
[3.5: among the dataset's other queued jobs], and the file carries the
site's path:

```
<resource>{base url}/index.php/index/preprint/view/2/version/2</resource>
```

Step 9 is redirected to `/index.php/index/en/preprint/view/2/version/2`
and then to `/index.php/index/en/login?source=…`, the site's "Login"
page.

With jobs run at the end of page loads, at the end of a server page and
of a site page:

10. Set `job_runner = On` in `config.inc.php`.
11. On the "DOIs" page, tick preprint 5, "Investigating the Shared
    Background Required for Argument: A Critique of Fogelin's Thesis on
    Deep Disagreement". Choose "Assign DOIs", then "Deposit DOIs". The
    deposit runs at the end of that request.
12. Set `job_runner = Off` again.
13. Tick preprint 6, "Developing efficacy beliefs in the classroom".
    Choose "Assign DOIs", then "Deposit DOIs". The row reads
    "Submitted".
14. Open a blank page in the DOIs page's tab, so that no page of the
    server reaches the install before step 16. Nothing else may reach
    it meanwhile.
15. Set `job_runner = On`.
16. As the next page, type the site's Administration address,
    `/index.php/index/admin`. As `dbarnes` it reads "The current role
    does not have access to this operation."; the deposit runs at the
    end of that request either way.
17. Read `<resource>` in the copied files for preprints 5 and 6.

**Expected**: `/index.php/publicknowledge/preprint/view/5/version/6`
and `/index.php/publicknowledge/preprint/view/6/version/7`.

**Observed**: preprint 5, deposited at the end of the server's own
request, has `/index.php/publicknowledge/preprint/view/5/version/6`.
Preprint 6, deposited at the end of the site page, has
`/index.php/index/preprint/view/6/version/7`.

Control: the file "Bulk Actions" › "Export DOIs" builds for preprint 2
in the browser has `/index.php/publicknowledge/preprint/view/2/version/2`.
A journal's deposit (OJS, the same steps on article 17, "Antimicrobial,
heavy metal resistance and plasmid profile of coliforms isolated from
nosocomial infections in a hospital in Isfahan, Iran", and on article
1, "Signalling Theory Dividends") has the journal's own
`/index.php/publicknowledge/article/view/…` with the job tool and at
the end of the site page.

## Cause

OPS's Crossref plugin builds each record's address without naming the
server. `PreprintCrossrefXmlFilter::createPostedContentNode()` passes
`null` as the context path to `Dispatcher::url()`
([crossref-ops `filter/PreprintCrossrefXmlFilter.php`, line 218](https://github.com/pkp/crossref-ops/blob/0bcf460c288e68665f83312e563c00ce52f92073/filter/PreprintCrossrefXmlFilter.php#L218)):

```php
$url = $dispatcher->url($request, Application::ROUTE_PAGE, null, 'preprint', 'view', [...], null, null, true, '');
```

With `null`, `PKPRouter::_urlGetBaseAndContext()` takes the context of
the current request, and the site's path `index`
(`Application::SITE_CONTEXT_PATH`) when there is none. A deposit is a
queued job, `DepositSubmission`, which carries its server as
`$context` and passes it down to the filter's deployment. But the
filter asks the request instead. Run by the job tool (a
`CommandLineTool`), the request has no context, so the address gets
`index`. Run at the end of a web request (`PKPQueueProvider::boot()`'s
shutdown function), it gets the context of whatever page drained the
queue.

The line named the server until
[d527a8e0e5](https://github.com/pkp/ops/commit/d527a8e0e54d720c0a9742a137eda74eeadfd154)
("Plugin for Crossref deposits on publish action", 2020) replaced
`$request->url($context->getPath(), …)` with the dispatcher call and
`null`. Deposits then always ran in the server's own requests, so
nothing showed. Since deposits became queued jobs with DOI management
(`pkp/pkp-lib#7014`, 3.4), the job may run outside them. OJS's filter
passes `$context->getPath()` in every address it builds
(`ArticleCrossrefXmlFilter`, `IssueCrossrefXmlFilter`,
`PeerReviewCrossrefXmlFilter`), which is why a journal's deposit is
right however it runs.

Reach:

- Every deposit run by the job tool, as a worker (`jobs.php work`) or a
  cron job (`jobs.php run`): "Deposit DOIs", an item's "Deposit DOI(s)",
  "Deposit All" (`DepositContext`) and the automatic deposit, which the
  scheduled task `DepositDois` queues (code; "Deposit DOIs" walked).
- With jobs run at the end of page loads (`job_runner = On`), a
  deposit left in the queue after its own
  request runs at the end of whatever page comes next. A site page
  gives the site's path (walked with Administration). Another server's
  or journal's page gives that context's path (code; one context in the
  dataset). A second server on the install gets the site's path from
  the job tool the same way (code).
- With `process_jobs_at_task_scheduler = On`, the scheduled task
  `ProcessQueueJobs` runs the queue, from the command line or at the
  end of a page, with the same outcome (code).
- An install that gives the server its own domain with
  `base_url[<server path>]` gets the site's base URL from the job tool
  (code: `_urlGetBaseAndContext()` reads `base_url[index]`).
- Only the `<resource>` address. The rest of the record reads the
  server from the deployment's context (`createHeadNode()`, the
  depositor and publisher). The file "Export DOIs" builds runs in the
  server's own request and is right (walked).
- Addresses already sent stay wrong at Crossref until the preprint is
  deposited again.

## Proposed fix

Name the server in the address, from the deployment's context, as OJS's
filter does. In crossref-ops `PreprintCrossrefXmlFilter::createPostedContentNode()`:

```diff
         // DOI data
+        // The server's own path, not the request's: a deposit job runs with no context, or another one
         $dispatcher = $this->_getDispatcher($request);
-        $url = $dispatcher->url($request, Application::ROUTE_PAGE, null, 'preprint', 'view', [...], null, null, true, '');
+        $url = $dispatcher->url($request, Application::ROUTE_PAGE, $deployment->getContext()->getPath(), 'preprint', 'view', [...], null, null, true, '');
```

The whole diff, against the OPS root, is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/preprint-deposit-job-tool-site-address/fix.diff);
inside the crossref-ops repository it applies with `-p4`.
`$deployment` is already in scope there, and `getContext()` is the
server the job carries, the same one `createHeadNode()` reads. With an
explicit path, `_urlGetBaseAndContext()` also takes that server's own
`base_url[…]` override.

It was tried on `main`, OPS. With the fix in, the job tool's deposit of
preprint 2 sent `/index.php/publicknowledge/preprint/view/2/version/2`,
which opened the preprint, and the site page's deposit of preprint 6
sent `/index.php/publicknowledge/…` too. Two files the fix must leave
alone kept the server's address with the fix in and out: a deposit run
at the end of the server's own request, and the file "Export DOIs"
builds.

**Alternatives**:

- Give the job tool a request context for the job's server. That is a
  wider change in pkp-lib, and it does not cover a job run at the end of
  another context's request. A worker serves every context in one
  process.
- Build the address from `$request->url($context->getPath(), …)`, as
  before 2020. It does the same, through the call the code base has
  since moved away from.

**What goes with it**:

- The same `null` is in OJS's DOAJ XML filter, `DOAJXmlFilter::process()`
  (`fullTextUrl`, lines 212 and 214). DOAJ's deposits do not use it:
  they go through `DOAJJsonFilter`, which already passes the journal's
  path. The XML file is built by "Export" in the journal's own request,
  so no screen gets the wrong address. Built from the command line, the
  filter's `$request->getDispatcher()` falls back to the application's
  dispatcher (`PKPRequest::getDispatcher()`), so the same one-word
  change would cover it there too (code; not run).
- Addresses already deposited wrong are at Crossref, not in the
  install, and the install does not record which runner sent each
  deposit. So no upgrade step can pick them out. Marking every
  registered preprint "Needs Sync" in a migration would re-deposit the
  right ones too, for a migration's cost. The release note can tell
  servers that ran the job tool to tick their registered preprints and
  choose "Deposit DOIs".
- 3.5 takes the diff as it stands (line 308). 3.4 has the same `null`
  (line 280) with `getBestId()` in the arguments, so the backport is the
  same one-word change by hand.
- The guard: the end-to-end check that runs the queue with the job
  tool and reads the sent file. A unit test beside crossref-ops'
  `TitleFaceMarkupTest` needs more than that test's deployment mock:
  `createPostedContentNode()` reads the submission's current
  publication, its authors, titles, dates, abstract, licence and
  relations. Simpler is to move the URL call into a small method of the
  filter, `getResourceUrl($submission, $publication)`, and test that
  with a deployment whose context path is `publicknowledge` and the
  test run's request, which has no context.

Small: one argument in one plugin, following the pattern OJS's Crossref
filter already uses, and a test. The correction of addresses already
sent is the managers' re-deposit, not code.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/preprint-deposit-job-tool-site-address/walk.js)
  with its `lib.js`. It sets `job_runner` in the fleet's config as the
  Steps say, takes the Steps through the screens as `dbarnes`, runs
  step 7 as written (`php lib/pkp/tools/jobs.php run` in the app root
  under the install's config), and runs a watcher that copies each
  `crossrefplugin-*.xml` from `files_dir/temp` as it appears (a Node
  process doing what the Steps' shell loop does). Step 14 is an
  `about:blank` in the tab and step 16 a browser navigation to
  `/index.php/index/admin`, so no server page runs the queue first. Run it after a reset of the dataset
  fleet (`npm run fleet-prep -- --feature <f> --dataset <n> --reset`):
  `ONLY=ojs,ops PROBE_FEATURE=<f> PROBE_AGENT=<a> node bin/probe.js all <walk.js>`;
  `NEIGHBOUR=1 … node bin/probe.js ops …` for the neighbour check;
  `READER=1 … node bin/probe.js ops …` for what `ccorino` (Author,
  Reader) and `dbarnes` see at the job tool's address, signed in (both:
  `/index.php/index/en/user/authorizationDenied?message=user.authorization.contextRequired`). On
  3.5 the same with `PKP_E2E_LINE=stable-3_5_0` in front.
- The fix trial, as one command under the exclusive lock on OPS:
  `node bin/try-fix.js apply fix.diff ops`, a reset, the walk
  (`PROBE_RUN=fix`), a reset, `NEIGHBOUR=1` (`nb-in`), `revert`, a
  reset, `NEIGHBOUR=1` (`nb-out`). The fix touches OPS only; the OJS
  control is unchanged by it.
- Tips walked: the pkp/datasets dumps of `abdb5d17` (2026-11-22),
  PostgreSQL, PHP 8.3.
  - OPS `main` `69d3cf6bad` (lib/pkp `3ea73a1a7e`, crossref-ops
    `0bcf460`); OJS `main` `1e1d3fc49b` (crossref-ojs `08da83b`).
  - OPS `stable-3_5_0` `5a7aec98df` (lib/pkp `9295edd4f0`, crossref-ops
    `e72c479`); OJS `stable-3_5_0` `7f23f05a93` (crossref-ojs
    `622a14d`).
- Code reads:
  - crossref-ops `PreprintCrossrefXmlFilter::createPostedContentNode()`,
    `createHeadNode()`, `_getDispatcher()`; `CrossrefExportPlugin::exportAndDeposit()`
    (the file is written to `files_dir/temp` and deleted after
    `depositXML()`), `ImportExportPlugin::getExportPath()` and
    `getExportFileName()`.
  - crossref-ojs `ArticleCrossrefXmlFilter`, `IssueCrossrefXmlFilter`,
    `PeerReviewCrossrefXmlFilter` (all pass `$context->getPath()`).
  - pkp-lib `PKPRouter::_urlGetBaseAndContext()`,
    `DepositSubmission::handle()`, `DepositContext`,
    `classes/task/DepositDois.php`, `Doi\Repository::depositAll()`,
    `PKPQueueProvider::boot()` and `JobRunner` (at most
    `job_runner_max_jobs`, 30, and 30 s per request).
  - For the way round and the repair: `Doi\DAO::getAllDepositableSubmissionIds()`
  ("Deposit All" takes the statuses unregistered, error and stale
  only), `PKPDoiController::depositSubmissions()` (refuses only
  unpublished items), `ProcessQueueJobs::executeActions()`,
  `PKPRequest::getDispatcher()` and `AdminHandler::jobs()`. A re-deposit
  of a registered preprint was not walked: the test installs reach no
  agency, so no DOI reads "Registered".
- The search for other instances: every `ROUTE_PAGE, null` in the
    filters and export plugins of OJS, OMP and OPS on `main`. Only
    crossref-ops' line and OJS's `DOAJXmlFilter` lines 212 and 214 have
    one. OMP has no registration agency plugin.
- 3.5 (walked and code): crossref-ops `e72c479`
  `PreprintCrossrefXmlFilter.php` line 308 has the same `null`; the fix
  diff applies there with an offset.
- 3.4 (code): OPS `upstream/stable-3_4_0` `2ae7c4d65f`, crossref-ops at
  the pointer `e374ea32`, line 280: the same `null`. lib/pkp
  `origin/stable-3_4_0` `1310f00fed` has `jobs/doi/DepositSubmission.php`,
  `tools/jobs.php` and the end-of-request runner, and
  `_urlGetBaseAndContext()` falls back to `index` the same way.
- 3.3 (code): OPS `upstream/stable-3_3_0` `a16131dc32`, lib/pkp
  `cb68f48e99`. `plugins/importexport/crossref` has the same `null`, but
  there is no job queue: deposits run in the server's export page and on
  publish, in the server's own request. The plugin's scheduled task file
  is empty. Its command-line `register` would build the address with no
  request dispatcher (`CliTool` sets a router only), so it does not
  reach this address. Not run.
- Introduced, the trace: `git blame` of line 218 gives `b7527c35`
  (`pkp/pkp-lib#699`, the locale argument) and `b697c0a` (the
  `urlPath`), both on the same call; `git log -L` back through
  `bda7549` (`pkp/pkp-lib#7014`, the move to queued deposits, which kept
  the `null`) and the plugin's first commit `b43eb84` (2021-04-01) to
  OPS's `plugins/importexport/crossref`, where `d527a8e0e5` replaced
  `$request->url($context->getPath(), …)` (from `383acb2e76`,
  2020-02-06, "Crossref plugin for OPS") with the `null`. The commit has
  no PR (`commits/<sha>/pulls` is empty; OPS was developed on a fork
  then) and is in every OPS release tag. Kind "defect": no released
  version had the right address from a context-less run.
- Upstream search 2026-11-23, pkp/pkp-lib, pkp/ops, pkp/crossref-ops and
  pkp/ui-library, by the symptom (crossref preprint url index, DOI login
  page, deposit job context url) and by `PreprintCrossrefXmlFilter` and
  `_urlGetBaseAndContext`: no issue or PR about this fault.
  `pkp/pkp-lib#13181` (closed) is the same mistake elsewhere: invitation
  URLs built from the request's context in a queued job, fixed by
  passing the invitation's own context. `pkp/pkp-lib#7222` (open) is
  about which version's address a preprint's DOI should carry, not its
  path. `pkp/crossref-ops#81` and `#82` (open, `pkp/pkp-lib#13860`)
  change the plugin's schema hook, not the filter.
- Not part of this fault: with the closed `[proxy]` port, the job tool
  prints the PHP warnings of the XML schema check, which cannot fetch
  Crossref's `.xsd`, and the file is sent unchecked
  ([U45 A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#a31)
  is the lost error message of such a deposit).
- Unverified:
  - what Crossref stores from a live deposit (the test installs reach
    no agency); the address was read in the file the plugin sends;
  - a deposit run at the end of another context's page, the automatic
    deposit and "Deposit All" (code only);
  - the DOAJ XML file built from the command line.

  MySQL not checked; the fault does not depend on the database.
