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
| 1 | all 16 | Product-owner read of the Findings register (RUNBOOK step 5), rewrite of entries a product owner cannot triage from alone; two specs a day. | 1/4 | — |
| 2 | all 16 | Cut the per-spec boilerplate to GLOSSARY pointers (the Conventions line to its one-line form, the "One spec, three applications" note, the register preamble beyond its first sentence, "Common to all three apps") and trim the scenario preambles and any body sentence that explains what the GLOSSARY defines (test install, seeded and scratch journal, ready account, mail catcher, reaching the Dashboard) to the GLOSSARY's words, and cut by-hand set-up recipes to stated givens (TEMPLATE "Write for a reader who has only this page" and "PRECONDITIONS ARE GIVENS", 2026-09-04; U05 is the model). One persona read per spec, blockers only. | 1/5 | — |
| 3 | U01 | Fold the incidental: a password-reset link opened while signed in lands silently on the dashboard (`docs/tracking/incidentals.md`). | 1/50 | — |
| 4 | U06 | Fold the incidental: the Decline template body already ends "Kind regards," before the signature. | 1/50 | — |
| 5 | U01, U02, U03, U06 | Scenarios at the non-default end for the site-level settings they list (password policy, self-registration flags, registration closed). Site settings are a shared singleton: the scenarios run in the serial project and restore the setting (PRINCIPLES A7 and A9). | 1/4 | U60 Site settings or U54 Roles configuration building the site-settings keys |
| 6 | U27, U26, U25 | Scenarios for the review-setup settings (default review type, deadlines, reminders, review forms, reviewer suggestions, one-click access, minimum reviews). | 1/4 | U28 or U29 building the review-setup keys |
| 7 | U21 | Scenarios for the intake settings (categories for authors, metadata items set to require, references and funders asked, extra required file types). | 1/4 | U58 building the intake keys |
| 8 | U40, U41, U43, U49, U15 | Single settings still documented only (funding statement, ORCID enablement, section word count, fees, items per page). | 1/10 | the key each needs, or a probe-established scenario without one |
