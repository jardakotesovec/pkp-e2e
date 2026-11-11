# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U29 Review setup & review forms | A reviewer's review history; Tools › Import/Export native XML export; `PUT`/`DELETE …/api/v1/reviewers/recommendations/{id}` | While a recommendation in use is deactivated, the reviewer's own review history shows it empty and the native XML export writes `peer-review-recommendation` empty (both "Revisions Required" again once reactivated), beyond the "-" A6 records in "Read Review"; a rename or delete of a used one is refused with 406 whose body is the raw key `##api.406.notAcceptable##` | 2026-11-10 | OJS main (lib/pkp 6035a6fed8), dataset fleet 9, review 19 (jjanssen, option 2), a security-refinement helper (housekeeping 2026-11-10) |
| U24 Workflow screen & stage access | The workflow header of a published submission (OJS, PKP's default dataset, submission 1), signed in as `sberardo`, a Section editor assigned with "Only allowed to recommend" | "Return to Workflow" is offered; "Confirm" in its window opens the page's "Error" window "You do not have permission to record this decision on this submission." with "OK", the browser's `POST …/submissions/1/decisions` (`decision`) answers 401, the submission stays in Done and the button stays offered after a reload; Actors row "Return to Workflow" gives it to deciding editors only (Rule 18) | 2026-11-11 | U54 incidentals claim check I32 (housekeeping 2026-11-11), `shared/playwright/checks/U54/I32/i32.js` `PART=before`, dataset fleet 3 |
