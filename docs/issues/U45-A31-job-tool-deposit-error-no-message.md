# A failed DOI deposit run by the job tool or at a site page's end reads "Error" with no message, for a preprint server's Crossref

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OPS (OJS fixed by `pkp/ojs#6107`, 2026-11-26)
  - 3.5: OPS (OJS fixed by `pkp/ojs#6106` and `#6124`, 2026-11-26)
  - 3.4: none since 2026-11-26 (`pkp/ojs#6123`, `pkp/ops#1528`; before, OJS and OPS for a deposit the agency answers with an error)
  - 3.3: none (code; no job queue)
- **Introduced** not traced; present since at least [2eaf4ccc25](https://github.com/pkp/ojs/commit/2eaf4ccc25c3462a4ca6eb86912189e720dc5bb2) (2025-07-28) for DataCite, and in Crossref on a preprint server since [bda7549](https://github.com/pkp/crossref-ops/commit/bda7549f5ca0ecae9d7c4fe95d7bdc1d56dcc6b8) (2022-01-14)
- **Upstream** `pkp/pkp-lib#13860` (open). Merged 2026-11-26 on every branch: the plugins (`pkp/crossref-ops#82`, `#81`, `#83`; `pkp/crossref-ojs#124`, `#126`), OJS (`pkp/ojs#6107`, `#6106`, `#6124`, `#6123`) and OPS 3.4 (`pkp/ops#1528`). OPS `main` and 3.5 still point `plugins/generic/crossref` at the old commit; the developer moves them with `pkp/pkp-lib#13778`
- **Tracked in** spec U45 [A31](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#a31)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence); 2026-11-26 at the fix PRs' heads (PR review of pkp-lib#13860)
- **Model** claude-opus-5-5

## Summary

A preprint server deposits a DOI with Crossref, and the deposit fails.
The DOI reads "Error" and "Has Error" lists it. The manager expects
"View Error" to say what went wrong. Instead, the row's "View Error"
opens "Registration Error Message" with its first sentence and nothing
under it. The "Crossref" box under the item offers "Deposit DOI(s)"
without "View Error".

No screen tells the manager why the deposit failed. An outage at the
agency cannot be told from a record the agency refused, and a refused
record cannot be corrected, because the agency's reason is not kept. A
Crossref deposit that succeeds keeps no record of the agency's answer
either.

It happens on every failed deposit when the install runs its background
jobs with the command-line job tool, as a worker or a cron job. On the
default setting, where jobs run at the end of page loads, it happens when
the deposit runs at the end of a page outside that server, such as a
site administration page. A journal keeps the message, with Crossref
and, since pkp/ojs#6107, with DataCite.

## Impact

- **Lost**: the agency's answer to a failed deposit: a connection error
  or the reason the agency refused the record. Nobody is told why the
  deposit failed, only that it did.
- **Who**: managers of a preprint server that registers DOIs with
  Crossref, or of a journal that registers them with DataCite. On an
  install whose administrator runs the queue with the job tool, every
  failed deposit is affected. Otherwise only a deposit that runs at the
  end of a page outside that journal or server is affected.
- **Way round**: none on screen. It takes both people. The administrator
  switches the install to running jobs at the end of page loads
  (`[queues] job_runner = On`). Then the manager deposits the item again
  from the journal's or server's DOIs page.

Medium: the failure itself is shown, but its reason is lost. A refused
record cannot be fixed from the screens, in a setup that is not the
default (a DOI agency and the job tool). What would raise it: the same
loss on most deposits made on the default setting.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (`stable-3_5_0` on 3.5): OPS for
  the Crossref steps, OJS for the DataCite ones.
- `config.inc.php`, `[queues]`: `job_runner = Off`, so queued jobs run
  only when the job tool runs, as on an install with a worker or a cron
  job.
- The install cannot reach the agency. In `config.inc.php`, `[proxy]`:
  `http_proxy = "http://127.0.0.1:9"` and
  `https_proxy = "http://127.0.0.1:9"`, a closed port.

Preprint server, Crossref (OPS):

1. Sign in as `dbarnes`.
2. Settings › Website › "Plugins": tick "Crossref Manager Plugin".
3. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`,
   "Save".
4. "Registration": "Registration Agency" "Crossref", "Depositor name"
   `Public Knowledge Project`, "Depositor email"
   `dbarnes@mailinator.com`, "Save".
5. Open the "DOIs" page. Tick preprint 2, "The Facets Of Job
   Satisfaction: A Nine-Nation Comparative Study Of Construct
   Equivalence". Choose "Bulk Actions" › "Assign DOIs" and confirm.
6. Tick it again. Choose "Bulk Actions" › "Deposit DOIs" and confirm. The
   page shows "Items successfully submitted for deposit" and the row
   reads "Submitted".
7. In the install's directory, run `php lib/pkp/tools/jobs.php run`.
8. Reload the "DOIs" page and expand the preprint.
9. Press "View Error" in the "Preprint" row. [3.5: neither the row nor
   the box offers "View Error", so this step cannot be taken.]
10. Press "OK", then press the filter "Has Error".

Journal, DataCite (OJS): the same steps, with these changes:

- Step 2: tick "DataCite Manager Plugin".
- Step 4: "Registration Agency" "DataCite", and any "Username", here
  `u45n23a`. The password and "Testing" stay as they are; the deposit
  never connects.
- Step 5: tick article 17, "Antimicrobial, heavy metal resistance and
  plasmid profile of coliforms isolated from nosocomial infections in a
  hospital in Isfahan, Iran".
- Step 9: press "View Error" in the "Article" row.

At the end of a site page, on the default setting (OJS, DataCite): steps
1 to 6 as above, then:

7. Set `job_runner = On` in `config.inc.php` again.
8. Open the site's Administration address,
   `/index.php/index/admin`, as the first page after the change.
9. Open the journal's "DOIs" page and expand the article.

**Expected**: after step 8 the item reads "Error". Its "Crossref" box
reads "The metadata for this item has not been submitted to Crossref."
over "Deposit DOI(s)" and "View Error". Step 9 opens:

```
Registration Error Message
The deposit to Crossref failed. The details below explain the cause of the error:
cURL error 7: Failed to connect to api.crossref.org port 443 via 127.0.0.1 after 0 ms: Could not connect to server (see https://curl.se/libcurl/c/libcurl-errors.html) for https://api.crossref.org/v2/deposits
```

DataCite's window reads "The deposit to DataCite failed. …" over "cURL
error 7: Failed to connect to mds.datacite.org port 443 … for
https://mds.datacite.org/metadata". Step 10 lists the item.

**Observed**: the job tool reports `Processed: PKP\jobs\doi\DepositSubmission`
and "Completed running 1 jobs". The item reads "Error" and step 10 lists
it. But the box offers "Deposit DOI(s)" alone, and step 9's window reads
only:

```
Registration Error Message
The deposit to Crossref failed. The details below explain the cause of the error:
```

The journal's DataCite window reads "The deposit to DataCite failed. …"
with nothing under it, after the job tool and after the site page alike.

Control: the same job tool steps on the OJS journal with Crossref
("Crossref Manager Plugin", "Depositor name", "Depositor email"), on
article 17, "Antimicrobial, heavy metal resistance and plasmid profile
of coliforms isolated from nosocomial infections in a hospital in
Isfahan, Iran", show the cURL message in both windows on `main`, and so
do the site page steps.

## Cause

The message is written, then dropped on the way to the database.
`CrossrefExportPlugin::depositXML()` and `DataciteExportPlugin::depositXML()`
catch the failure and call `updateDepositStatus()`. That method passes
the status and the message (`crossrefplugin_failedMsg`,
`dataciteplugin_failedMsg`) to `Repo::doi()->edit()`.
`EntityDAO::_update()` keeps only the properties the `doi` schema
declares (`PKPSchemaService::sanitize()`). So it stores the status and
silently drops the message whenever the schema lacks the plugin's
properties.

The properties are added by each plugin's `addToSchema()`, a
`Schema::get::doi` hook. In OPS `CrossrefPlugin` and OJS `DatacitePlugin`
that hook is added in `_pluginInitialization()`. That method is called
from `register()` only when `$this->getEnabled($mainContextId)` holds,
that is, for the context of the process that runs the job:

- The job tool is a `CommandLineTool`. It loads the generic plugins with
  no context (`PluginRegistry::loadCategory('generic')`), so
  `getEnabled()` reads the site's own setting. That setting is off unless
  an administrator has enabled the plugin for the site itself.
- A job run at the end of a web request (`PKPQueueProvider::boot()`'s
  shutdown function, `JobRunner::processJobs()`) runs in that request's
  process. Both plugins are registered on every request (`versions.lazy_load`
  is 0), with the request's context. So the hook is there only when the
  request belongs to a journal or server with that plugin enabled. A
  site-level request has no context, and another journal's request has
  the plugin off (code; the site case walked).

The plugins once meant to cover the command line. `_getExportPlugin()`
calls `_pluginInitialization()` when the export plugin is missing and
there is no `SERVER_NAME`. Since `pkp/pkp-lib#11793` ("always register
…ExportPlugin", `pkp/ojs#5196` and `pkp/crossref-ops#56`), `register()`
always registers the export plugin. So that fallback never runs. OJS
`CrossrefPlugin` adds its `Schema::get::doi` hook in `register()`
whatever the context (since
[6970a0b8](https://github.com/pkp/crossref-ojs/commit/6970a0b89442e405cd984f1b5837d654c3d0dc25),
`pkp/pkp-lib#11590`), which is why a journal's Crossref keeps its message
on `main` with either runner.

Reach:

- Every failed deposit run this way: the "Deposit DOIs" bulk action, an
  item's "Deposit DOI(s)", "Deposit All" and the automatic deposit all
  queue `DepositSubmission`, `DepositIssue` or `DepositContext` jobs
  that end in the same `updateDepositStatus()` (code). Galley and issue
  DOIs on a DataCite journal are covered the same way (code).
- A refusal from the agency loses its message too, not only a connection
  failure (code; the test installs reach no agency).
- On OPS, a successful Crossref deposit loses its batch ID and its
  success message (`crossrefplugin_batchId`, `crossrefplugin_successMsg`),
  so "View Record" is never offered after it (code).
- On 3.5, OJS `CrossrefPlugin` still adds the hook in
  `_pluginInitialization()`, so a journal's Crossref loses its message
  there too (walked with the job tool).
- OMP has no registration agency plugin. Other plugins in the apps'
  trees that extend a schema add the hook in `register()`
  (`CrossrefCitationDoiHandler::registerHooks()`). Plugins from the
  Plugin Gallery (mEDRA) were not checked.
- A message already lost cannot be recovered. Once the fix is in, the
  next deposit records its own message.

## Proposed fix

Move the `Schema::get::doi` hook out of `_pluginInitialization()` and
into `register()`, before the `getEnabled()` check, in two plugins:

- OPS `CrossrefPlugin` (pkp/crossref-ops):
  `Hook::add('Schema::get::doi', [$this, 'addToSchema']);` leaves
  `_pluginInitialization()`, and
  `Hook::add('Schema::get::doi', $this->addToSchema(...));` goes into
  `register()`, right after the export plugin is registered.
- OJS `DatacitePlugin` (pkp/ojs): the same move.

This is what OJS `CrossrefPlugin::register()` already does. The schema
then has the plugin's properties in every process, so the message is
stored however the queue is run. The diffs are against each app's root:
[fix-ops.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/job-tool-deposit-error-no-message/fix-ops.diff)
and
[fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/job-tool-deposit-error-no-message/fix-ojs.diff).
Inside the crossref-ops repository, `fix-ops.diff` applies with `-p4`.

The fix keeps what `pkp/pkp-lib#11793` set out to do. Hooks a plugin
needs without a context are added in `register()`, and the hooks that act
for a context stay behind the enabled check. `addToSchema()` acts on
nothing; it only declares nullable strings: three in OPS Crossref (the
failure message, the batch ID and the success message), one in DataCite
(the failure message).

It was tried on `main`, OPS and OJS, with the job tool. With the fix in,
the walk showed the cURL message in both windows and "View Error" in the
box, on Crossref (OPS) and DataCite (OJS). A second item given a DOI but
not deposited stayed "Unregistered" with no "View Error" and no stored
message, with the fix in and out. The OJS journal's Crossref message was
unchanged. The site page case was not tried with the fix. It is covered
in the code, because `register()` runs on every request and the hook no
longer depends on the context.

**Alternatives**:

- Give the job tool the job's context, so `register()` runs for it. That
  is a wider change, and it would not cover a job run at the end of
  another context's request. A worker serves every context in one
  process, and the `doi` schema is read once per process. A schema
  property cannot depend on the context that happens to be current.
- Make the `_getExportPlugin()` fallback work again. It would add the
  hook after the job has already read the `doi` schema, which the process
  keeps. `DepositSubmission::handle()` loads the submission first, and
  `PublicationDAO` loads each publication's DOI through
  `EntityDAO::fromRow()`. So the message would still be dropped.

**What goes with it**:

- The `doi` schema, and so the REST API's DOI objects, gain the plugin's
  properties (null) on contexts that do not use that agency, as OJS's
  Crossref plugin does on `main` today.
- 3.5 needs the same move in OJS `CrossrefPlugin` too. 3.4 has the same
  code in all three plugins and takes the same change.
- Nothing stored needs repairing.
- The guard: a unit test per plugin that loads the plugin with no context
  and asserts the `doi` schema has the plugin's `_failedMsg` property;
  and an end-to-end check that runs the queue with the job tool, then
  reads the window's message.

Medium: the same two-line move in two repositories (pkp/crossref-ops and
pkp/ojs), following the pattern OJS's Crossref plugin uses, with a unit
test in each; more on 3.5, where the journal's Crossref plugin needs it
too.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/job-tool-deposit-error-no-message/walk.js)
  with its `lib.js`. It sets `job_runner = Off` in the fleet's config,
  takes the Steps through the screens, and runs step 7 as written:
  `php lib/pkp/tools/jobs.php run` in the app root under the install's
  config (the job tool, no context). Run it after a reset of the dataset
  fleet (`npm run fleet-prep -- --feature <f> --dataset <n> --reset`):
  - `PROBE_FEATURE=<f> PROBE_AGENT=<a> node bin/probe.js all <walk.js>`
    (Crossref, OJS and OPS);
  - `WALK=datacite … node bin/probe.js ojs …`;
  - `RUNNER=site …` for the site page steps (step 7 sets `job_runner = On`
    and sends one request for `/index.php/index/admin`, whose 302 is not
    followed, from a blank page);
  - `NEIGHBOUR=1 …` for the neighbour check.

  On 3.5 the same with `PKP_E2E_LINE=stable-3_5_0` in front.
- The fix trial: `node bin/try-fix.js apply fix-ojs.diff ojs`, then
  `apply fix-ops.diff ops`. Then the walk with the fix in (Crossref on
  OPS, DataCite on OJS) and `NEIGHBOUR=1` with the fix in. Then `revert`
  and `NEIGHBOUR=1` on the reverted code, each after a fresh reset.
- The first site page walk signed in as `admin` through the kit. That
  sign-in signs `dbarnes` out on a journal page first, so the job ran
  there and kept the message. The kept script now sends the single
  site-level request instead. With it, the queue emptied on that request
  (302 to `/index.php/index/en/admin`): Crossref kept its message and
  DataCite stored none.
- Tips walked: the pkp/datasets dumps of `abdb5d17` (2026-11-22),
  PostgreSQL, PHP 8.3.
  - OJS `main` `1e1d3fc49b` (lib/pkp `3ea73a1a7e`, crossref `08da83b`);
    OPS `main` `69d3cf6bad` (lib/pkp `3ea73a1a7e`, crossref `0bcf460`).
  - OJS `stable-3_5_0` `7f23f05a93` (lib/pkp `9295edd4f0`, crossref
    `622a14d`); OPS `stable-3_5_0` `5a7aec98df` (lib/pkp `9295edd4f0`,
    crossref `e72c479`).

  On 3.5, Crossref on OJS was walked as well and lost its message the
  same way. The 3.5 ui-library `DoiListItem.vue` shows "View Error" only
  in the box, while `hasErrorMessage`.
- Code reads:
  - OPS `CrossrefPlugin::register()`, `_pluginInitialization()` and
    `_getExportPlugin()`; OJS `DatacitePlugin`, the same methods; OJS
    `CrossrefPlugin::register()`.
  - Both plugins' `depositXML()` and `updateDepositStatus()`.
  - pkp-lib `Repository::edit()` (doi), `EntityDAO::_update()`,
    `PKPSchemaService::get()`, `CommandLineTool::__construct()`,
    `LazyLoadPlugin::getEnabled()`, `tools/jobs.php` `run()` and
    `DepositSubmission::handle()`.
  - For the page-load runner: `PKPQueueProvider::boot()`,
    `Dispatcher::dispatch()` (`loadCategory('generic', true)`),
    `PKPApplication::getEnabledProducts()` and
    `VersionDAO::getCurrentProducts()` (a plugin with `lazy_load` 0 is
    loaded in every context; both plugins' `versions` rows read 0).
- 3.4 (code):
  - OJS `upstream/stable-3_4_0` `4b437fd4c3` and its datacite plugin;
    crossref-ojs at the pointer `865f6f70`.
  - OPS `upstream/stable-3_4_0` `2ae7c4d65f`; crossref-ops at `e374ea32`.
  - lib/pkp `origin/stable-3_4_0` `1310f00fed`: `tools/jobs.php`, and
    `CommandLineTool` loads the generic plugins with no context.

  All three plugins add the hook in `_pluginInitialization()` and
  register the export plugin in `register()`. Their `depositXML()`
  catches only `RequestException`, so a deposit that cannot connect
  stays "Submitted" there. The message is lost only for a deposit the
  agency answers with an error.
- 3.3 (code): OJS `upstream/stable-3_3_0` `de6f4ead8e`, lib/pkp
  `cb68f48e99`. There is no job queue. Deposits run in the export page's
  request or in `CrossrefInfoSender`, and other code stores the message
  as a submission setting.
- Introduced, the trace: blame of the `Schema::get::doi` line in
  `_pluginInitialization()`.
  - OJS DataCite: `2eaf4ccc25` (`pkp/ojs#5030`, for `pkp/pkp-lib#11621`
    "save DataCite deposit errors", Bozana Bokan, bozana), which brought
    the message itself.
  - OPS Crossref: `e1420fc4` only renamed `HookRegistry` to `Hook`. The
    line came with `bda7549` (`pkp/pkp-lib#7014`, Erik Hanson, ewhanson;
    no PR found).
  - `pkp/pkp-lib#11793` (`2a289c7a13` in OJS, `pkp/ojs#5196`; `f4669984`
    in crossref-ops, `pkp/crossref-ops#56`; both by bozana, merged
    2025-11-26) made the `_getExportPlugin()` fallback unreachable.

  Not established: whether that fallback ever kept the message under the
  job tool before then. The queued agency object is serialized with the
  job, and the job reads the `doi` schema before the fallback could run,
  so it probably did not. Hence "not traced" and Kind "defect".
- Upstream search 2026-11-23, pkp/pkp-lib, pkp/ojs, pkp/ops and
  pkp/crossref-ops. `pkp/pkp-lib#13860` (opened 2026-11-22) is this
  fault with the same cause, reported on 3.5.0-6 with a refused Crossref
  deposit. It does not mention the page-load runner. Its PRs were open
  and unmerged on 2026-11-23. `pkp/pkp-lib#11550` (closed in favour of
  #11793) is the earlier DataCite job issue.
- Not part of this fault: with the closed `[proxy]` port, the job tool
  also prints the PHP warnings of the XML schema check, which cannot
  fetch Crossref's and DataCite's `.xsd`. The file is sent unchecked.
- Unverified:
  - a refusal from a live agency;
  - the lost "View Record" after a successful OPS deposit (code only; the
    test installs reach no agency);
  - a job run at the end of another journal's page, which needs a second
    context (code only);
  - how often a deposit on the default setting runs outside its own
    journal's pages.

  MySQL not checked; the fault does not depend on the database.
