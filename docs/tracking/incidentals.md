# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U45 | A DataCite journal's "Export DOIs" or deposit of a supplementary file's galley DOI, the file given a subject (OJS `main` and `stable-3_5_0`) | The file is never built: `DataciteXmlFilter` fails with `TypeError: Cannot access offset of type string on string` (`DataciteXmlFilter.php:220` on `main`, `:208` on 3.5), since pkp/pkp-lib#11557 read every subject as a keyword entry (`$s['name']`; OJS `07a47a4117`, 3.5 `e4c2e79cca`, 2026-01-12; tags 3.5.0-4, 3.5.0-5). pkp/ojs#5867 (pkp/pkp-lib#9170, open) fixes it on `main` only. Built server-side, not through the screen | 2026-11-03 | PR review of pkp/pkp-lib#9170, `shared/playwright/checks/sync/pkp-lib-9170/xml-lang.php` scenario H at OJS `e7ce037799` and `stable-3_5_0` `0f2de4ff3f`; report `docs/reports/pr-review/2026-11-03-ojs-5867.md` Evidence |
| U46 | OPS (and OMP by code): the galley grid's and file API's `identifiers` ops on a server whose Settings › Distribution was never saved (`enablePublisherId` unset) | Crash, 500 with an empty body: `in_array(): Argument #2 ($haystack) must be of type array, null given` at `controllers/tab/pubIds/form/PublicIdentifiersForm.php:35`; reachable by the author of an unposted preprint (`grid/preprint-galleys/preprint-galley-grid/identifiers`, `api/file/manage-file-api/identifiers`). Guard the setting with `?? []` | 2026-11-03 | OPS `main` dataset fleet, as `ccorino`; OMP's form has the same lines (code read) |
| U29 | OMP `api/v1/publicationPeerReviews` (any request, signed out included) | Crash, 500 with an empty body: `omp/api/v1/publicationPeerReviews/index.php:16` instantiates `PublicationPeerReviewController`, a class that does not exist (lib/pkp ships `api/v1/peerReviews`, which OJS maps); OMP has no working peer-review API route on `main` | 2026-11-03 | OMP `main` dataset fleet, `curl …/api/v1/publicationPeerReviews?submissionIds=5` |
