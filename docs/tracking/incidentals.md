# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U17 | OMP `main`, Settings › Press › Series, a series with a "Cover Image": its "Delete" link when the cover is already gone (deleted in another tab) | The refusal reads the raw "##manager.categories.form.removeCoverImageFileNotFound##": `SeriesGridHandler::deleteImage()` answers its errors with two keys pkp-lib `main` never had (that one and `…removeCoverImageOnDifferentContextNowAllowed`; both live only in the `stable-3_5_0` line's `lib/pkp`). Older than pkp/omp#2528, which added one more path to it; since OMP `7901cde3d` (pkp/pkp-lib#6002). Code read; the stale-delete reply seen live at the #2528 merge walk | 2026-10-30 | upstream session, `upstream-sync.md` 2026-10-30; OMP `controllers/grid/settings/series/SeriesGridHandler.php:418`, `:436` |
