# Backfill

Shipped specs waiting to be brought up to a rule adopted after they
shipped. One line per slice, in priority order; the top slice is the next
one. The maintenance session takes one on a day the sync loop produced
nothing to accommodate (MAINTENANCE "The daily session"), under the same
rules as an accommodate slice: a writing agent edits, the persona reads
the changed spans, a checker drives only where a claim changes, lint to
zero, touched suites green once. A slice is deleted when done; git keeps
it. A slice that waits on a passthrough key family names the pending
feature that will build it and is not started before that feature ships.

Sizes are a rough share of one feature's cost.

| # | Spec | Slice | Size | Waits on |
|---|---|---|---|---|
| 1 | U01 | Fold the incidental: a password-reset link opened while signed in lands silently on the dashboard (`docs/tracking/incidentals.md`). | 1/50 | — |
| 2 | U06 | Fold the incidental: the Decline template body already ends "Kind regards," before the signature. | 1/50 | — |
| 3 | U01, U02, U03, U06 | Scenarios at the non-default end for the site-level settings they list (password policy, self-registration flags, registration closed). Site settings are a shared singleton: the scenarios run in the serial project and restore the setting (PRINCIPLES A7 and A9). | 1/4 | U60 Site settings or U54 Roles configuration building the site-settings keys |
| 4 | U27, U26, U25 | Scenarios for the review-setup settings (default review type, deadlines, reminders, review forms, reviewer suggestions, one-click access, minimum reviews). | 1/4 | — (the review-setup keys were built with U28 on 2026-09-05: `review {…}`, `reviewForms[]`, reviewer `reviewForm`) |
| 5 | U21 | Scenarios for the intake settings (categories for authors, metadata items set to require, references and funders asked, extra required file types). | 1/4 | U58 building the intake keys |
| 6 | U40, U41, U43, U49, U15 | Single settings still documented only (funding statement, ORCID enablement, section word count, fees, items per page). | 1/10 | the key each needs, or a probe-established scenario without one |
| 7 | U28 | Fold the four findings the medium-effort rebuild confirmed and the high build missed: the reviewer's "Review pending." task survives a decline; "Save for Later" on a step with a review form shows the required-fields box beside the toast while "Recommendation" is on "Choose One"; a submitted review's file can still be renamed through "Settings" › "Edit"; a decline logged by the editor shows the reviewer's earlier email decline as its reason. Entries A2, A4, A10, A12 in the medium build's spec (git 9b93cc2, `docs/specs/U28-reviewers-review.md`); A10 and A2 re-driven in `.reports/U28-compare/report.md` (Q5, Q6). | 1/20 | — |
| 8 | every shipped spec | The Coverage section (TEMPLATE, 2026-09-06): the actors and states tables beside the settings one, every row ending in a scenario or a why not; the settings table keeps its rows. One spec per slice, the two review specs first. | 1/50 each | — |
