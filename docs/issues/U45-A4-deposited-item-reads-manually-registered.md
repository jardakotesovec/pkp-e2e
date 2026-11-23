# After "Deposit DOIs", the item's agency box says it "has been manually registered", though nobody marked it

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OPS
  - 3.5: OJS, OPS
  - 3.4: OJS, OPS (code)
  - 3.3: none (code; no DOIs page)
- **Introduced** `pkp/ui-library#240` for `pkp/pkp-lib#7521` · [c475c5cf76](https://github.com/pkp/ui-library/commit/c475c5cf7627a48cb9279299767f9a6842d858f3) · 2023-02-02 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-11-23)
- **Tracked in** spec U45 [A4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#a4)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-23: `pkp/crossref-ojs#117`, `pkp/crossref-ops#74` and
`pkp/ojs#5977` (for `pkp/pkp-lib#13591`, on `main` and `stable-3_5_0`)
record a deposit that cannot connect to the agency as "Error". Such an
item no longer stays "Submitted" with the wrong sentence, so the
Summary, Impact and Steps now follow the item until the deposit job has
run, with the queue run both ways: at the end of page loads and by the
job tool. The fault itself, its cause and the fix are unchanged.

## Summary

On the DOIs page, an item whose DOI was sent for deposit reads
"Submitted", and the agency box in its expanded view says "This item has
been manually registered with a registration agency." Expected: "The
metadata for this item has been submitted to {agency}.", since nobody
marked it registered.

On a default install, where queued jobs run at the end of page loads,
managers never see the wrong sentence: the deposit has run before the
list is drawn again. It shows only where a worker or a cron job runs the
queue with the command-line job tool, and lasts until that tool's next
run: a minute or a night, as the administrator scheduled it. The badge,
the deposit and the stored status are right; the box picks the wrong one
of two sentences.

It needs Crossref or DataCite configured, which a press cannot have. It
hits every deposit of an item until an agency has registered its DOI
once: the first, and any made again after an "Error". An item deposited
again after an agency registered it reads the right sentence.

## Impact

- **Lost.** No data. While the deposit waits in the queue, the box tells
  the manager the DOI is already registered, by hand.
- **Who.** A journal or preprint server manager on an install that runs
  its queue with the job tool, who expands an item on the DOIs page
  before the tool's next run, after any deposit of an item no agency has
  registered yet.
- **Way round.** The badge is right, and the box offers no button in this
  state, so the sentence leads to no wrong action on screen. It turns
  into the right one once the deposit job has run.

Low: a wrong sentence, and the deposit goes through. A manager who
believed it and so never looked again at a deposit the queue never runs
would make it medium.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, `main` (OJS; OPS where the steps say so).
- In `config.inc.php`, `[queues]`: `job_runner = Off`, so queued jobs run
  only when the job tool runs, as on an install with a worker or a cron
  job. (The dataset ships `job_runner = On`; see "Jobs at page loads"
  below.)
- The install does not reach the agency, so no test deposit leaves it.
  In `config.inc.php`, `[proxy]`:

  ```ini
  http_proxy = "http://127.0.0.1:9"
  https_proxy = "http://127.0.0.1:9"
  ```

  (a closed port). Step 4 gives no credentials, so an agency that answers
  refuses the deposit; either way the deposit ends in "Error".

Steps:

1. Sign in as `dbarnes`.
2. Settings › Website › "Plugins": tick "Crossref Manager Plugin".
3. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`,
   "Save" (the dataset has no prefix).
4. "Registration": "Registration Agency" "Crossref", "Depositor name"
   `Public Knowledge Project`, "Depositor email" `dbarnes@mailinator.com`,
   "Save".
5. Side menu "DOIs": tick submission 17, "Antimicrobial, heavy metal
   resistance and plasmid profile of coliforms isolated from nosocomial
   infections in a hospital in Isfahan, Iran" [OPS: submission 2, "The
   Facets Of Job Satisfaction: A Nine-Nation Comparative Study Of Construct
   Equivalence"]; "Bulk Actions" › "Assign DOIs" › "Assign DOIs". Expand
   the item ("Show more details about 17" [OPS: "Show more details about
   2"]) and read the "Crossref" box under the DOI table.
6. Tick the item; "Bulk Actions" › "Deposit DOIs" › "Deposit DOIs". Read
   the box.
7. Reload the DOIs page, expand the item, read the box.
8. In the app's directory, run the job tool once:
   `php lib/pkp/tools/jobs.php run`. Reload the DOIs page, expand the
   item, read the box.
9. Tick the item; "Bulk Actions" › "Mark DOIs Registered" › "Mark DOIs
   Registered". Expand the item, read the box.

With DataCite (OJS): the same, with "DataCite Manager Plugin" in step 2,
and in step 4 "Registration Agency" "DataCite" and "Username (symbol)"
`u45n23d` in place of the two Crossref fields (the form does not require
the username; "Password" left empty), and "DataCite" for "Crossref" in
the box.

**Expected.** Step 5: badge "Unregistered", "The metadata for this item
has not been submitted to Crossref." with "Deposit DOI(s)". Steps 6 and
7: badge "Submitted", "The metadata for this item has been submitted to
Crossref." Step 8: badge "Error", "The metadata for this item has not
been submitted to Crossref." with "Deposit DOI(s)" and "View Error".
Step 9: badge
"Registered", "This item has been manually registered with a
registration agency."

**Observed.** Step 5 as expected. Steps 6 and 7: badge "Submitted", and
the box reads

```
Crossref
This item has been manually registered with a registration agency.
```

with no button. Step 8: badge "Error" and the "has not been submitted"
sentence, as expected. On OJS with Crossref the box offers "Deposit
DOI(s)" and "View Error"; on OPS with Crossref and on OJS with DataCite
it offers "Deposit DOI(s)" alone, because the job tool's run keeps no
error message there, a separate fault
([U45 A31 report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U45-A31-job-tool-deposit-error-no-message.md)).
Step 9 as expected. With DataCite the box is headed "DataCite" and
reads the same in steps 5 to 7 and 9.

**Jobs at page loads.** With `job_runner = On`, as the dataset ships it,
and step 8 left out: in steps 6 and 7 the item already reads "Error",
with "The metadata for this item has not been submitted to Crossref.",
"Deposit DOI(s)" and "View Error". The deposit ran at the end of the
"Deposit DOIs" request, before the list was drawn again, so the wrong
sentence never showed. Step 9 reads as expected.

## Cause

The box's sentence is chosen in ui-library
`src/components/ListPanel/doi/DoiListItem.vue`, lines 187 to 195. For an
item that `isDeposited()`, it shows the "manually registered" sentence
when `itemRegistrationAgency` is null, and the "submitted to {agency}"
sentence otherwise. `isDeposited()` (`useDoi.js`, line 75) is true for
two statuses, "Submitted" and "Registered".

A DOI's `registrationAgency` is written only when it becomes
"Registered". The agency plugins set it in `updateDepositStatus()` when
the agency accepted the deposit: `CrossrefExportPlugin.php` line 457 on
OJS and line 501 on OPS, and OJS `DataciteExportPlugin.php` line 358.
`Repo::doi()->markRegistered()` sets it to null for "Mark DOIs
Registered" (lib/pkp `classes/doi/Repository.php` line 267).

Queuing a deposit changes the status alone (`DAO::markSubmitted()`,
lib/pkp `classes/doi/DAO.php` line 161). A DOI deposited for the first
time is therefore "Submitted" with no agency, and the component takes
the missing agency for a registration by hand without testing that the
DOI is registered.

`pkp/pkp-lib#7521` asked for the manual sentence on an item that was
marked registered. Its ui-library change put the null test under
`isDeposited`, which also covers "Submitted". The change went in before
3.4.0, the first release with the DOIs page, so every release has shown
the manual sentence for a "Submitted" item.

Reach:

- Every "Submitted" item whose DOI no agency registered before, with
  Crossref (journal, preprint server) and DataCite (journal): seen on
  screen, with the job tool.
- How long an item stays "Submitted" depends on the queue and on the
  agency plugin, not on this component. Since `pkp/pkp-lib#13591` a
  deposit that cannot connect ends in "Error" on `main` and
  `stable-3_5_0`. On `stable-3_4_0` the plugins still catch only
  `RequestException` (Crossref `CrossrefExportPlugin.php` line 324 on
  OJS and line 388 on OPS,
  DataCite `DataciteExportPlugin.php` line 301), so a deposit that
  cannot connect fails its job and the item stays "Submitted", with the
  wrong sentence, for good: code read, not walked.
- An item registered through the agency, marked "Needs Sync" and
  deposited again keeps its stored agency while "Submitted". Today it
  reads "submitted to {agency}" with the agency that registered it
  before, which is the wrong name if the agency was changed since. Code
  read, not walked (it needs an agency's answer).
- A work with several versions: `itemRegistrationAgency` (line 415) reads
  `item.doiObjects[0]`, the first DOI of all versions, while the status
  comes from `currentVersionDoiObjects[0]` (`useDoi.js`, line 57). The
  two can be different DOIs, so the box can pair one version's status
  with another version's agency. Code read, not walked.
- The DOIs page's "Issues" tab on a journal renders its items with the
  same component: code read, not walked.
- The component is the field's only reader. In ui-library the one other
  mention is the mapper that passes it on (`DoiListPanel.vue` line 1050);
  in PHP only the writers above and the 3.4 upgrade migration
  `I7014_DoiMigration.php` touch it.

## Proposed fix

In `DoiListItem.vue`, show the manual sentence only for a DOI that is
"Registered" without an agency, and name the configured agency while the
DOI is "Submitted":

```diff
 						isDeposited(itemDepositStatus)
-							? itemRegistrationAgency === null
+							? isManuallyRegistered
 								? t('manager.dois.registration.manuallyMarkedRegistered')
 								: t('manager.dois.registration.submittedDescription', {
-										registrationAgency: itemRegistrationAgencyName,
+										registrationAgency: depositedAgencyName,
 									})
```

with two computed properties: `isManuallyRegistered` (the status is
`pkp.const.DOI_STATUS_REGISTERED` and `itemRegistrationAgency` is null)
and `depositedAgencyName` (`registrationAgencyInfo['displayName']` while
the status is `pkp.const.DOI_STATUS_SUBMITTED`, otherwise
`itemRegistrationAgencyName`). The full diff:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/deposited-item-reads-manually-registered/fix.diff).

The rule belongs in the component, which alone gives the null its
meaning. The "not submitted" sentence beside it already names the
configured agency through `registrationAgencyInfo['displayName']`, and a
queued deposit goes to that agency. On `main` the status comparisons
live in `useDoi.js` (`isDeposited()`, `isStale()`, `hasErrors()`), so
the team may prefer the "Registered" and "Submitted" tests as two
helpers there; the diff keeps them in the component, next to the agency
they are paired with, and behaves the same.

Tried on `main`, OJS and OPS with Crossref and the job tool: with the
fix in, steps 6 and 7 read "The metadata for this item has been
submitted to Crossref.", and steps 5, 8 and 9 read as before. An item
marked registered without a deposit reads the "not submitted" sentence,
then the "manually registered" one, with the fix in and out.

Also recommended, not tried and not in the diff: read the agency from the
same DOI as the status, `currentVersionDoiObjects[0]` in place of
`item.doiObjects[0]` in `itemRegistrationAgency`. Without it the fixed
test can still pick the wrong sentence on a work with several versions.
It belongs in the same PR: it is one line in the same component, and the
new `isManuallyRegistered` pairs the current version's status with
`itemRegistrationAgency`, so the two must read the same DOI for the test
to mean what it says. It is out of the diff only because seeing it needs
an earlier version's DOI registered through an agency, which no walk
here could produce.

**Alternatives:**

- Storing the agency when the deposit is queued
  (`Repo::doi()->markSubmitted()`): the field would then mean
  "registered with" and "sent to", its callers (four in OJS, two in OPS)
  would have to pass the agency, and a deposit that ends in "Error" would
  keep an agency that never registered the DOI.
- Dropping "Submitted" from `isDeposited()`: it also drives the item's
  badge, each DOI row's status badge, the greyed "Edit" button, the
  "View record" and "Deposit DOI(s)" buttons, and the same badges and
  "Edit" in `DoiItemVersionModal.vue`, all of which must stay as they
  are for a "Submitted" item.

**What goes with it:**

- No stored data, API or plugin hook changes.
- Backport: on `stable-3_5_0` and `stable-3_4_0` the template line reads
  `isDeposited` (a computed property there), so the first hunk is applied
  by hand; the two computed properties apply as written, and status
  comparisons in the component are the pattern there. Not tried on
  either.
- Test: ui-library has no component tests for the DOI list; one for
  `DoiListItem.vue` would set a "Submitted" DOI without an agency and
  read the box's sentence.

Small: one component, no data repair, no API change.

## Evidence

- Kept script, which takes the Steps through the screens:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/deposited-item-reads-manually-registered/walk.js)
  with its helpers in `lib.js` beside it. Run it on an install loaded
  from the default dataset with
  `RUNNER=jobtool PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/deposited-item-reads-manually-registered/walk.js`
  (`RUNNER=pageloads`, the default, for "Jobs at page loads";
  `WALK=datacite` for DataCite on OJS; `NEIGHBOUR=1` for the fix's
  neighbour check; `PKP_E2E_LINE=stable-3_5_0` in front for 3.5). Where
  the walk differs from the Steps: `RUNNER=jobtool` writes
  `job_runner = Off` into the install's config before step 1 and runs
  the job tool itself in step 8; `RUNNER=pageloads` reloads every 4 s
  until no DOI reads "Submitted" (none was by step 7). It reads each
  DOI's stored status and `registrationAgency`, and the `jobs` and
  `failed_jobs` tables, from the database (read only). With the job
  tool, the `DepositSubmission` job was queued in steps 6 and 7, and no
  run left a failed job.
- The fix was tried with
  `node bin/try-fix.js apply shared/playwright/checks/issues/deposited-item-reads-manually-registered/fix.diff ojs ops`
  (which rebuilds the JavaScript), walk.js with `RUNNER=jobtool` on OJS
  and OPS, and `NEIGHBOUR=1` on both, then
  `node bin/try-fix.js revert` with the same arguments and `NEIGHBOUR=1`
  again on the reverted code. The neighbour gives a second published
  item (OJS submission 1, OPS submission 5) a DOI and marks it
  registered without a deposit. DataCite was not walked with the fix
  in; the component does not distinguish the agencies.
- Walked on PostgreSQL, each install freshly loaded from pkp/datasets
  [abdb5d17](https://github.com/pkp/datasets/commit/abdb5d172e547779ee2b350a8ef5aa76509956bd)
  (2026-11-22), each way the queue runs:
  - main: OJS [1e1d3fc49b](https://github.com/pkp/ojs/commit/1e1d3fc49b69290f0931e81982e4be8a35232cb3)
    (crossref-ojs 08da83b18960, lib/pkp 3ea73a1a7e), OPS
    [69d3cf6bad](https://github.com/pkp/ops/commit/69d3cf6badeb6fd9947aeb54ef5c7be4eb64d133)
    (crossref-ops 0bcf460c288e, lib/pkp 3ea73a1a7e), ui-library
    [836c01b500](https://github.com/pkp/ui-library/commit/836c01b500360d4e3bd6d17f7cb57ef50e110ca5):
    as Observed, Crossref on both with the job tool and at page loads,
    DataCite on OJS with the job tool. The stored DOI was status 2
    ("Submitted") without a `registrationAgency` in steps 6 and 7, status
    4 ("Error") after the job, and status 3 without one after step 9.
  - stable-3_5_0: OJS [7f23f05a93](https://github.com/pkp/ojs/commit/7f23f05a9347ec72a51b6af638aa580550c5c92c)
    (crossref-ojs 622a14df8d0c), OPS
    [5a7aec98df](https://github.com/pkp/ops/commit/5a7aec98dfe69febe20006b711b854627bd9b5fb)
    (crossref-ops e72c479a645c), lib/pkp 9295edd4f0, ui-library
    [fd00e45f6e](https://github.com/pkp/ui-library/commit/fd00e45f6e1b45b2ae5879f7080d50b967f0e055):
    as Observed, Crossref on both, with the job tool and at page loads;
    DataCite not walked. The code has the same test (`DoiListItem.vue`
    line 151, `isDeposited` a computed over "Submitted" and "Registered",
    line 379), the same `markSubmitted()` (`DAO.php` line 176), and the
    `pkp/pkp-lib#13591` backport (`pkp/crossref-ojs#118`,
    `pkp/crossref-ops#75`, `pkp/ojs#5978`).
- Code reads, not walked, each at its `stable-*` tip:
  - 3.4: ui-library
    [ee684b341b](https://github.com/pkp/ui-library/commit/ee684b341bacfcdd330b95073394a1fbf34a1f4f)
    contains c475c5cf76: `DoiListItem.vue` line 139 has the null test
    under `isDeposited` (line 431, both statuses). pkp-lib
    [1310f00fed](https://github.com/pkp/pkp-lib/commit/1310f00fed01d4dd7adc4f43032acca204c66783)
    `classes/doi/DAO.php` line 175 `markSubmitted()` updates the status
    alone. OJS
    [4b437fd4c3](https://github.com/pkp/ojs/commit/4b437fd4c3ebe685fd8d555d5539e95a29a92607)
    (its DataCite plugin) and crossref-ojs
    [eb026ac182](https://github.com/pkp/crossref-ojs/commit/eb026ac1821395804da3d21332bb110c29d62bb7)
    and crossref-ops
    [459daf7eae](https://github.com/pkp/crossref-ops/commit/459daf7eae2272c97de45a0ee513529082c727c4)
    have no `pkp/pkp-lib#13591` change: the three plugins catch
    `RequestException` only, and Guzzle 7.9.2 (pkp-lib's
    `composer.lock`) raises `ConnectException`, a `TransferException`,
    for a refused connection.
  - 3.3: ui-library
    [96959f9ed4](https://github.com/pkp/ui-library/commit/96959f9ed4e7357c0eede0179add0e9728e1f708)
    has no DOI list component, and OJS
    [de6f4ead8e](https://github.com/pkp/ojs/commit/de6f4ead8edad1543654c3275dc75a8b909133d6)
    has no DOIs page.
- Introduced: `git blame` on `DoiListItem.vue` line 188 gives c475c5cf76,
  authored 2022-12-13. `pkp/ui-library#240` was merged into `main` on
  2023-02-02 by rebase: the PR's merge commit is c475c5cf76 itself, which
  sits on `main`'s first-parent line after b046a797 (2023-02-02), with no
  merge commit of its own. Its parent showed the "submitted to" sentence with
  the configured agency's name for both statuses, but was never
  released, hence Kind defect.
- Upstream search (2026-11-23): pkp/pkp-lib, pkp/ojs, pkp/ops and
  pkp/ui-library, by the symptom's words and by
  `manuallyMarkedRegistered`, `itemRegistrationAgency` and
  `DoiListItem`; only `pkp/pkp-lib#7521` and its PRs came up, and the
  open `pkp/pkp-lib#13462`, which asks to tell a deposited DOI from one
  marked registered by hand on the same page: a wording and status
  proposal, not this fault.
- Unverified: the "Issues" tab, an item deposited again after an
  agency's registration, a work with several versions, how long an item
  reads "Submitted" at page loads when the agency does answer (the walks
  could not reach one), and 3.4's stuck "Submitted" after a refused
  connection, were not walked.
