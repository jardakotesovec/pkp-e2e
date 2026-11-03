# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U06 | The accept wizard of a newcomer's invitation (OJS `main`), "Enter details" after a "Back" to "Create OJS account" | A Family Name typed on "Enter details" (the invitation carried "Nonce"; typed "Quilltyped") and not yet saved comes back as the invitation's "Nonce" after "Back" and "Save and continue" on step 2, and the account is created with "Nonce"; Affiliation and Country typed the same way are kept. The same at the `main` tip and at the heads of pkp/pkp-lib#13659 + ui-library#1033 round 2, so not that PR's; the accept-side relative of A15 (the manager's wizard) | 2026-10-30 | PR review of pkp/pkp-lib#13517 round 2, OJS: `checks/sync/pkp-lib-13538/s1-accept.js` with `S1_NO_EVENT=1` (records 07b, 09), base and head; the same loss seen on OJS, OMP and OPS in the full run's records 09 and 12 |
| U17 | OMP `main`, Settings › Press › Series, a series with a "Cover Image": its "Delete" link when the cover is already gone (deleted in another tab) | The refusal reads the raw "##manager.categories.form.removeCoverImageFileNotFound##": `SeriesGridHandler::deleteImage()` answers its errors with two keys pkp-lib `main` never had (that one and `…removeCoverImageOnDifferentContextNowAllowed`; both live only in the `stable-3_5_0` line's `lib/pkp`). Older than pkp/omp#2528, which added one more path to it; since OMP `7901cde3d` (pkp/pkp-lib#6002). Code read; the stale-delete reply seen live at the #2528 merge walk | 2026-10-30 | upstream session, `upstream-sync.md` 2026-10-30; OMP `controllers/grid/settings/series/SeriesGridHandler.php:418`, `:436` |
