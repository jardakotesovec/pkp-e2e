# PR review: pkp/pubmedCentral#9, continue the package names and revisions of articles delivered by another platform

- **Reviewed** round 1, 2026-11-26: [pkp/pubmedCentral#9](https://github.com/pkp/pubmedCentral/pull/9) at `87f9f31547` (kaitlinnewson `12356-main`, one commit on the tip `7b70210`), for the item "a workflow for publishers moving platforms" of [pkp/pkp-lib#12356](https://github.com/pkp/pkp-lib/issues/12356); driven on OJS `main` (`d37c63cc7c`, `lib/pkp` `44b36bf802`) with the plugin dropped into `plugins/generic/pubmedCentral`.
- **Model** claude-opus-5-5

The plugin ships with no app, so no e2e suite reads it and there is no
CI dispatch; the PR's own check (PHPUnit and Cypress, PHP 8.2/8.3 on
MySQL and PostgreSQL) is green at the head
([45837925549](https://github.com/pkp/pubmedCentral/actions/runs/45837925549)).

**Setup for every item** (kept walk
`shared/playwright/checks/sync/pubmedCentral-9/walk.sh <plugin clone> <ref> [trial-fix.diff]`,
on OJS's dataset fleet, PKP's test dataset): DOI versioning on; article
17's version 1.0 gets the DOI `10.9999/pmc9.1` and a new major version
2.0 the DOI `10.9999/pmc9.2`; then

```
php tools/importExport.php PubmedCentralExportPlugin importHistory publicknowledge history.csv

doi,package_prefix,version,last_revision,file_stem,in_pmc
10.9999/pmc9.1,jpk-1-jpk.1-17,1,0,jpk-1-1001,Y
10.9999/pmc9.x,jpk-1-jpk.1-17,2,1,jpk-1-1002,Y
```

prints "1 publications and 1 submissions were updated."; 1.0 is then
`jpk-1-jpk.1-17.v1.r1` and 2.0 `jpk-1-jpk.1-17.v3`, as the README
says. The SFTP upload itself is not run (the test installs reach no
outside host): `driver.php job` runs the job's lines after it on the
object the job loads, and `deposit` runs `depositXML()`'s loop without
the dispatch.

## 1. An imported article's status stays "Submitted" after every successful deposit (high)

**Steps**

1. "Deposit" version 1.0 (SFTP set up); the job uploads
   `jpk-1-jpk.1-17.v1.r1.zip`.
   Expected: the status reads "Registered".
   Observed: `pubmedCentral::status` is `submitted`; the revision is
   recorded (`1`). Deposited again, it uploads `.v1.r2` and stays
   `submitted`.

**Cause** `jobs/PubmedCentralDeliver.php:91` and `:102`:
`updateStatus($object, REGISTERED)` and then `recordDelivery($object, …)`
each save through `updateObject()`, which is `Repo::publication()->edit($object, $params)`.
`edit()` builds the saved publication from `$object->_data` plus the
params, and `EntityUpdate::updateSettings()` writes every setting of
it and deletes the ones it lacks, so the second save, from the same
`$object` the job loaded while it read `submitted`, writes that status
back. Only articles with an imported history are hit (`recordDelivery()`
saves nothing for the others). A later minor version is cloned with
`submitted`, which `handlePublicationPublishing()` does not mark stale,
so the automatic deposit never sends the correction.

**Fix** In `PubmedCentralExportPlugin`, override `updateObject()` to
set the saved params on `$object` after the parent's save, so a later
save from the same object carries them (`trial-fix.diff`, beside the
walk). Tried: "Registered" after each deposit, revisions `.r1`, `.r2`.

## 2. A version marked registered and then deposited goes out under its first package's name again (medium)

**Steps**

1. Export version 2.0 (`jpk-1-jpk.1-17.v3.zip`), deliver it by hand,
   "Mark registered". The page now names it `….v3.r1`.
2. "Deposit" it over SFTP.
   Expected: `jpk-1-jpk.1-17.v3.r1.zip`.
   Observed: `jpk-1-jpk.1-17.v3.zip`, the name PubMed Central already
   has.

**Cause** `PubmedCentralExportPlugin.php:637` (`depositXML()`): `prepareDelivery($object)`
records revision `0` and `updateStatus($object, SUBMITTED)` straight
after it, from the same `$object`, deletes it (item 1's cause); the job
then sees a `submitted` version with no revision.

**Fix** Item 1's fix. Tried: `….v3.r1.zip`.

## 3. Packages delivered by hand never get past ".r1" (medium)

**Steps**

1. As item 2 step 1, then export again, deliver by hand, "Mark
   registered", twice.
   Expected: `….v3.r1`, then `….v3.r2`.
   Observed: `….v3.r1` every time; version 1.0 likewise stays at
   `….v1.r1`.

**Cause** Only the SFTP job records a revision (`recordDelivery()`);
"Mark registered" (`PubObjectsExportPlugin::markRegistered()`) sets the
status alone, and `deliveredRevision()` reads a marked version as its
version's first package. The README offers Export as a way to deliver
by hand.

**Fix** Override `markRegistered()` to `recordDelivery()` the revision
`packageNames()` gives, for an article with imported history, before
the parent's (in `trial-fix.diff`; it needs item 1's fix, since the
status save would delete the revision). Tried: `.r1` … `.r4`. A version
marked registered without having been delivered (the DOI-versioning
switch the README describes) then skips a revision number.

## 4. A history row whose DOI differs in letter case is "not found" (low)

**Steps**

1. Import the row `10.9999/PMC9.1,jpk-1-jpk.1-17,1,0,jpk-1-1001,Y`
   with `--dry-run`.
   Expected: version 1.0 found, as for the lower-case DOI.
   Observed: "Versions not found in the journal, by DOI or by package
   prefix (1): Line 2 10.9999/PMC9.1".

**Cause** `DeliveryHistoryImporter::findPublications()` compares
without case (`strcasecmp`, lower-cased keys) but finds the submission
with `Repo::submission()->getByDoi()`, whose SQL compares exactly
(`lib/pkp/classes/submission/DAO.php:201`).

**Fix** Not tried: look the DOI up without case (`LOWER(d.doi)` in a
query of the importer's own), or say in the README that the DOI is
written as OJS holds it.
