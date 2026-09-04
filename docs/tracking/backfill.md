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
| 1 | U03 | Rewrite the 47 open readability frictions that change how a reader would execute a rule or scenario (`.reports/U03/persona-3.md`, `persona-5.md`); persona on the rewritten spans. | 1/10 | — |
| 2 | U02, U24 | Rewrite the open frictions the same way (9 each; reports under `.reports/U02/`, `.reports/U24/`). | 1/10 | — |
| 3 | U15, U22, U23 | Fresh persona read of the body (their reports are gone), rewrite the execution-changing frictions. | 1/10 | — |
| 4 | all 16 | Product-owner read of the Findings register (RUNBOOK step 5), rewrite of entries a product owner cannot triage from alone; two specs a day. | 1/4 | — |
| 5 | all 16 | One agent checks the four shipped conventions of TEMPLATE "Write for a reader who has only this page" across the preambles and title notes; fix the misses. | 1/20 | — |
| 6 | U01 | Fold the incidental: a password-reset link opened while signed in lands silently on the dashboard (`docs/tracking/incidentals.md`). | 1/50 | — |
| 7 | U06 | Fold the incidental: the Decline template body already ends "Kind regards," before the signature. | 1/50 | — |
| 8 | U01, U02, U03, U06 | Scenarios at the non-default end for the site-level settings they list (password policy, self-registration flags, registration closed); needs a site-settings passthrough family. | 1/4 | the first feature that builds site-settings keys, or a maintenance session with the maintainer's go-ahead |
| 9 | U27, U26, U25 | Scenarios for the review-setup settings (default review type, deadlines, reminders, review forms, reviewer suggestions, one-click access, minimum reviews). | 1/4 | U28 or U29 building the review-setup keys |
| 10 | U21 | Scenarios for the intake settings (categories for authors, metadata items set to require, references and funders asked, extra required file types). | 1/4 | U58 building the intake keys |
| 11 | U40, U41, U43, U49, U15 | Single settings still documented only (funding statement, ORCID enablement, section word count, fees, items per page). | 1/10 | the key each needs, or a probe-established scenario without one |
