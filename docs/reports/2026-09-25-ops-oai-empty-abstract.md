# On a preprint server, one preprint posted without an abstract makes the server's OAI-PMH record lists fail with a server error

Regression. OPS at `61cd158ce3` (lib/pkp `76a315591b`; also the upstream
`main` tip read on 2026-09-25); introduced by pkp/ops#1337 (`25e6954e81`,
authored 2026-07-07, merged 2026-07-22, for pkp/pkp-lib#12950). OJS: not
affected. OMP: the same code shape, by code only (see Evidence).
stable-3_5_0: does not (by code) at `225e25475e`.
Tracked in spec U17 register OPS6. Temporary: delete once acted on.

## Summary

The server fails: when a preprint server has posted a preprint without
an abstract, its harvesting interface (OAI-PMH) answers a server error
instead of the record list. This happens for the list of the whole
server and for the list of that preprint's section. A section marked "Do
not require abstracts" allows such a preprint. A journal with the same
kind of article lists it normally, and so did preprint servers before
July 2026.

## Impact

Harvesters that collect the server's records (discovery services,
aggregators, repositories that mirror preprints) meet it. The server's
staff and readers see nothing wrong, because the server's own pages are
built without this code. What is lost is every record in the list that
holds the abstract-less preprint, not just that one record. The list is
served in pages of up to 100 records by default, and the page that holds
the preprint fails as a whole. On the server tested that page was the
whole list, so a harvester got none of the server's records. Harvesting
by another section still works. Nothing on screen tells the manager, and
the error stays for as long as the preprint is posted without an
abstract. No workaround was tried. It is reached with a supported
setting, not a misconfiguration. Major: a server can drop out of every
harvester's feed, silently, after one ordinary action.

## Steps to reproduce

Preconditions:

- A fresh OPS install with its default languages.
- One preprint server. Its one section, "Preprints" (abbreviation "PRE"),
  is the new-server default.
- A Preprint Server Manager account and an Author account on it.

1. As the Preprint Server Manager, open Settings › Server › "Sections".
   Open the "Preprints" row's arrow and press "Edit".
2. Under "Section Options", tick "Do not require abstracts" and press
   "Save". "Your changes have been saved." shows.
3. Sign in as the Author and open "Make a Submission". Fill the start
   form and press "Begin Submission".
4. On "Upload Files", upload a PDF as the preprint.
5. On "Details", type a title and leave "Abstract" empty. Go on through
   "Contributors" and "For Readers" to "Review". The "Abstract" line
   reads "None provided", with no complaint.
6. Press "Submit" and confirm.
7. As the Preprint Server Manager, open the submission's workflow and
   press "Post the preprint". The window reads "All requirements have
   been met.". Press "Post".
8. Open
   `http://{host}/index.php/{server}/oai?verb=ListRecords&metadataPrefix=oai_dc`.
9. Open the section's set:
   `http://{host}/index.php/{server}/oai?verb=ListRecords&metadataPrefix=oai_dc&set={server}:PRE`.

**Expected** (what a journal answers for the same case): 200 and an
OAI-PMH `ListRecords` document holding the preprint's record, with no
`dc:description` element.

**Observed:** steps 8 and 9 both answer `500` with an empty body. The
server log reads, for each request:

```
PHP Fatal error:  Uncaught TypeError: APP\plugins\metadata\dc11\filter\Dc11SchemaPreprintAdapter::addLocalizedElements(): Argument #3 ($localizedValues) must be of type array, null given, called in …/plugins/metadata/dc11/filter/Dc11SchemaPreprintAdapter.php on line 108 and defined in …/plugins/metadata/dc11/filter/Dc11SchemaPreprintAdapter.php:231
```

Control: on the same server, the sets of other sections with posted
preprints answer 200 with their records. On a journal, a section with
"Do not require abstracts" and two articles published without an
abstract answers its set's `ListRecords` with 200 and both records.

## Cause

`plugins/metadata/dc11/filter/Dc11SchemaPreprintAdapter.php`,
`extractMetadataFromDataObject()`, line 108:

```php
$this->addLocalizedElements($dc11Description, 'dc:description', $publication->getData('abstract'));
```

`getData('abstract')` is `null` for a publication without an abstract.
`25e6954e81` renamed `_addLocalizedElements($description, $propertyName,
$localizedValues)` to `private function addLocalizedElements(MetadataDescription
&$description, string $propertyName, array $localizedValues): void` (line
231). The new `array` type on the third parameter turns the `null` into a
`TypeError` before the body's own `(array) $localizedValues` cast can
absorb it. The old untyped method took `null` and cast it to an empty
array. The exception is uncaught, so the whole OAI response fails. OJS's
`Dc11SchemaArticleAdapter` passes `(array) $publication->getData('abstract')`
and is not affected. The other calls in the OPS adapter pass arrays
(`getFullTitles()`, `getFullNames()`, the built subjects and publishers)
or cast (`sponsor`, `coverage`).

## Proposed fix

A proposal; the team decides.

1. Cast at the call, as OJS does:
   `(array) $publication->getData('abstract')` on line 108. One line, and
   the same shape as the OJS adapter.
2. Or make the parameter `?array` (or untyped), so that the method's
   existing `(array)` cast handles `null` again for every caller. This
   also covers any other localized value that can be `null` in future.
3. Either way, a test that builds the DC record of a publication without
   an abstract would hold it. OMP's `Dc11SchemaPublicationFormatAdapter`
   got the same typed method in the same change (Evidence), so option 2
   there too, or the cast on its line 112, costs one more line.

## Evidence

- Claim check, chunk K3 (`.reports/U17/cc-K3.md`, K3-7; merged as M36 in
  `.reports/U17/claimcheck-merge.md`), OPS scratch server
  `u17k3cck352uqyoa`, two runs (`.reports/U17/ccK3/run-ops-175351.json`,
  `run-ops-175552.json`).
  - `.reports/U17/ccK3/o-02-oai-listrecords-ops.json` (+ `.txt`): the
    whole server's list gives 500 with an empty body.
  - `o-07-oai-set-records-ops.json`: the server-wide set
    `u17k3cck352uqyoa` and the set `…:NAB` give 500. `…:PRE`, `…:NIX` and
    `…:IDT` give 200 with one record each.
  - OJS control: `o-07-oai-set-records-ojs.json`. All sets give 200, and
    `…:NAB` has 2 records.
  - The section "K3 NoAbstract" (NAB) had "Do not require abstracts"
    ticked on screen. Its two preprints were seeded without an abstract
    and posted through "Post the preprint" › "Post" on screen (the `nab`
    phase). The wizard half, the "Review" step with "Abstract None
    provided" and no abstract complaint, was driven on its own
    (`d-dNAB-review-ops.json`). The complete path of the steps above,
    submit then post then harvest, was not driven in a single run.
- Kept script:
  `PROBE_FEATURE=U17 PROBE_AGENT=<agent> PHASES=seed,seed2,nab,oai,oai2 node bin/probe.js ops shared/playwright/checks/U17/K3/k3.js`
  (phase order in its header). Fixed when `o-07-oai-set-records-ops.json`
  reads 200 for the server-wide set and `…:NAB`.
- Server log: `apps/ops/playwright/.server-logs/server-8250-probe.log`,
  2026-09-25 17:54:02 (`ListRecords`), 17:56:08 (set `u17k3cck352uqyoa`)
  and 17:57:07 (set `…:NAB`). The `[500]` lines carry the `TypeError`
  above, with 6 occurrences of it in all. This log is overwritten by
  later probe servers.
- The introducing commit: `git blame` on `checkouts/ops` gives lines 108
  and 231 to `25e6954e81` (Kaitlin Newson, 2026-07-07). Its diff replaces
  the untyped `_addLocalizedElements()` with the `array`-typed
  `addLocalizedElements()` and leaves the call on line 108 without a
  cast. It came into `main` through pkp/ops#1337 (merge `c1c2e78915`,
  2026-07-22). No later commit touches the file.
- stable-3_5_0, by code only: `checkouts/stable-3_5_0/ops` at
  `225e25475e` still has the untyped
  `_addLocalizedElements(&$description, $propertyName, $localizedValues)`
  (line 224), called with `$publication->getData('abstract')` at line 107.
  The branch does not carry pkp/pkp-lib#12950. Not driven.
- The "before" side on `main` was not driven. It rests on the
  pre-change method.
- Unverified (by the code, not driven):
  - `GetRecord` for the abstract-less preprint fails the same way.
  - `ListIdentifiers` is unaffected, because it builds no metadata.
  - On a server with more than `oai_max_records` (100) records, only the
    list page that holds the preprint fails, but a harvester walking the
    pages in order stops there.
  - A new version of the preprint with an abstract would clear the error.
  - OMP: `plugins/metadata/dc11/filter/Dc11SchemaPublicationFormatAdapter.php`
    got the same `array`-typed `addLocalizedElements()` (line 307) in omp
    `b9f8323fb` (pkp/pkp-lib#12950, 2026-07-07). It calls the method with
    the uncast `$publication->getData('abstract')` at line 112. Whether an
    OMP book can be published without an abstract was not checked, and
    nothing was driven.
