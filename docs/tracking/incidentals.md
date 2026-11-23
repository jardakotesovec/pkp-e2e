# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U27 | Workflow › Review › a review's "Export PDF" | On main the PDF export of a review that used a review form answers 500 (`Class "ReviewFormElement" not found`); a review without a form exports. 3.5 exports both | 2026-11-20 | seen on OJS main, dataset fleet; lib/pkp `api/v1/reviews/PKPReviewController.php` `generatePDF()` and its template |
| U45 | Tools › Crossref XML Export Plugin, exporting an article | On main the export fails before any XML is produced, in OJS and in OPS (two different faults); 3.5 exports. Not walked further | 2026-11-20 | seen on OJS and OPS main, dataset fleet |
| U51 | Reading a restricted galley as a paid-up association member | On main a member whose membership fee is paid is refused like any other reader: `dateEndMembership` is not in the user schema, so it is neither stored nor read, and `IssueAction::subscribedUser()` never finds it | 2026-11-20 | OJS `classes/issue/IssueAction.php` (`getData('dateEndMembership', 0)`); seen on OJS main, dataset fleet |
| U36 | The reviewer's step 3 "Upload File" window (the shared upload wizard), "Change File" after a pick | A14's reach lacks the reviewer: there the window's own removal of the first pick is refused "not authorized" (a PHP warning in the server log), and the first file stays beside the new one; A14 has issue report pkp-e2e#524 | 2026-11-23 | U28 claim check I28 on OJS and OMP main, two runs (I28-2), kept script `shared/playwright/checks/U28/I28/i28-revise.js` |
