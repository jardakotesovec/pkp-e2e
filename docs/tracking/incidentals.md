# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U27 | Workflow › Review › a review's "Export PDF" | On main the PDF export of a review that used a review form answers 500 (`Class "ReviewFormElement" not found`); a review without a form exports. 3.5 exports both | 2026-11-20 | seen on OJS main, dataset fleet; lib/pkp `api/v1/reviews/PKPReviewController.php` `generatePDF()` and its template |
| U28 | Reviewer's review page, uploading a new version of their own review attachment | The upload answers 500 "Invalid parameters!" on main and 3.5; a first upload works | 2026-11-20 | seen on OJS main and 3.5, dataset fleet (file upload wizard, `revisedFileId` of the reviewer's own file) |
| U45 | Tools › Crossref XML Export Plugin, exporting an article | On main the export fails before any XML is produced, in OJS and in OPS (two different faults); 3.5 exports. Not walked further | 2026-11-20 | seen on OJS and OPS main, dataset fleet |
| U51 | Reading a restricted galley as a paid-up association member | On main a member whose membership fee is paid is refused like any other reader: `dateEndMembership` is not in the user schema, so it is neither stored nor read, and `IssueAction::subscribedUser()` never finds it | 2026-11-20 | OJS `classes/issue/IssueAction.php` (`getData('dateEndMembership', 0)`); seen on OJS main, dataset fleet |
