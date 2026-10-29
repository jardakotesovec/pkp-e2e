# API routes — every REST route and the feature that owns it

This file lists every route the three apps register under `/api/v1/`, one
section per controller, read straight from the controllers in the
`checkouts/<app>` clones (the `_test` controllers, harness plumbing, are left
out). Each route has one owner: the feature whose rule it implements, or
`parked` when its atlas atom is parked in `UNASSIGNED.md`. A section title
names the base path, the controller class (`[ojs]` marks an app's own
subclass) and its atom in `atlas/api.md`.

The columns from Route to Roles are generated. **Route** is the route's name
(its key here; an unnamed route is keyed by method and path), **Path** is
relative to `/api/v1/`, **Apps** says which apps serve it, and **Roles** is
the `roleAuthorizer` list of the middleware around it, as a hint for readers
(`none`: no role middleware, so the handler checks access itself or the route
is public). **Owner** and **Gate** are kept by hand. Gate names the
permission grid the route follows, as `U40#edit-gate` for the table after
`<a id="api-grid-edit-gate"></a>` in the U40 spec, or `—`.

`npm run api-routes -- --write` regenerates the file and keeps both hand
columns; a new route comes in with a blank Owner. `npm run api-routes -- --check`
is the lint: it fails on routes missing here, rows no longer in code, an
Owner that is not a feature, and a Gate whose grid does not parse. How the
gates are used: `docs/process/api.md`.

### _dois — BackendDoiController [ojs] (API-050)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_doi.backend.issue.edit` | PUT | `_dois/issues/{issueId}` | ojs | admin manager | U45 | — |
| `_doi.backend.galley.edit` | PUT | `_dois/galleys/{galleyId}` | ojs | admin manager | U45 | — |

### _dois — BackendDoiController [omp] (API-058)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_doi.backend.chapter.edit` | PUT | `_dois/chapters/{chapterId}` | omp | admin manager | U45 | — |
| `_doi.backend.publication.format.edit` | PUT | `_dois/publicationFormats/{publicationFormatId}` | omp | admin manager | U45 | — |
| `_doi.backend.submission.file.edit` | PUT | `_dois/submissionFiles/{submissionFileId}` | omp | admin manager | U45 | — |

### _dois — BackendDoiController [ops] (API-063)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_doi.backend.galley.edit` | PUT | `_dois/galleys/{galleyId}` | ops | admin manager | U45 | — |

### _dois — PKPBackendDoiController (API-001)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_doi.backend.publication.edit` | PUT | `_dois/publications/{publicationId}` | ojs omp ops | admin manager | U45 | — |
| `_doi.backend.peerReview.edit` | PUT | `_dois/peerReviews/{reviewId}` | ojs omp ops | admin manager | U45 | — |
| `_doi.backend.authorResponse.edit` | PUT | `_dois/authorResponses/{responseId}` | ojs omp ops | admin manager | U45 | — |

### _email — PKPEmailController (API-002)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_email.create` | POST | `_email` | ojs omp ops | admin manager | U55 | — |

### _i18n — I18nController (API-003)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_i18n.getTranslations` | GET | `_i18n/ui.js` | ojs omp ops | none | U57 | — |

### _library — PKPLibraryController (API-004)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_library.getLibrary` | GET | `_library` | ojs omp ops | admin manager subEditor | U39 | — |

### _payments — PKPBackendPaymentsSettingsController (API-005)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_payment.backend.edit` | PUT | `_payments` | ojs omp | admin manager | U52 | — |

### _submissions — BackendSubmissionsController [ojs] (API-051)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_submission.payment` | PUT | `_submissions/{submissionId}/payment` | ojs | admin manager subEditor assistant | U52 | — |

### _submissions — BackendSubmissionsController [omp] (API-059)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_submission.displayFlag.save` | POST | `_submissions/saveDisplayFlags` | omp | admin manager | U70 | — |
| `_submission.featuredOrder.save` | POST | `_submissions/saveFeaturedOrder` | omp | admin manager | U70 | — |
| `_submission.catalog.addTo` | PUT | `_submissions/addToCatalog` | omp | admin manager | U70 | — |

### _submissions — PKPBackendSubmissionsController (API-006)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_submission.getMany` | GET | `_submissions` | ojs omp ops | admin manager | U23 | — |
| `_submission.incomplete.delete` | DELETE | `_submissions` | ojs omp ops | admin manager author | U23 | — |
| `_submission.delete` | DELETE | `_submissions/{submissionId}` | ojs omp ops | admin manager author | U23 | — |
| `_submission.assigned` | GET | `_submissions/assigned` | ojs omp ops | manager subEditor assistant author | U23 | — |
| `_submission.reviews` | GET | `_submissions/reviews` | ojs omp ops | manager subEditor assistant author | U23 | — |
| `_submission.getViewsCount` | GET | `_submissions/viewsCount` | ojs omp ops | manager subEditor assistant author reviewer | U23 | — |
| `_submission.getReviewAssignments` | GET | `_submissions/reviewerAssignments` | ojs omp ops | reviewer | U28 | — |

### _uploadPublicFile — PKPUploadPublicFileController (API-007)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `_uploadPublicFile.uploadFile` | POST | `_uploadPublicFile` | ojs omp ops | admin manager subEditor assistant author reviewer reader | U09 | — |

### announcements — PKPAnnouncementController (API-008)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `announcement.getMany` | GET | `announcements` | ojs omp ops | admin manager | U12 | U12#announcements |
| `announcement.getAnnouncement` | GET | `announcements/{announcementId}` | ojs omp ops | admin manager | U12 | U12#announcements |
| `announcement.add` | POST | `announcements` | ojs omp ops | admin manager | U12 | U12#announcements |
| `announcement.edit` | PUT | `announcements/{announcementId}` | ojs omp ops | admin manager | U12 | U12#announcements |
| `announcement.delete` | DELETE | `announcements/{announcementId}` | ojs omp ops | admin manager | U12 | U12#announcements |

### categories — CategoryCategoryController (API-010)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| — | GET | `categories` | ojs omp ops | admin manager | U16 | — |
| — | GET | `categories/categoryFormComponent` | ojs omp ops | admin manager | U16 | — |
| — | POST | `categories` | ojs omp ops | admin manager | U16 | — |
| — | PUT | `categories/{categoryId}` | ojs omp ops | admin manager | U16 | — |
| — | DELETE | `categories/{categoryId}` | ojs omp ops | admin manager | U16 | — |

### comments — UserCommentController (API-012)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `comment.getManyPublic` | GET | `comments/public` | ojs omp ops | none | U14 | — |
| `comment.submit` | POST | `comments` | ojs omp ops | none | U14 | — |
| `comment.delete` | DELETE | `comments/{commentId}` | ojs omp ops | none | U14 | — |
| `comment.submitReport` | POST | `comments/{commentId}/reports` | ojs omp ops | none | U14 | — |
| `comment.getMany` | GET | `comments` | ojs omp ops | admin manager | U14 | — |
| `comment.getComment` | GET | `comments/{commentId}` | ojs omp ops | admin manager | U14 | — |
| `comment.setApproval` | PUT | `comments/{commentId}/setApproval` | ojs omp ops | admin manager | U14 | — |
| `comment.deleteReport` | DELETE | `comments/{commentId}/reports/{reportId}` | ojs omp ops | admin manager | U14 | — |
| `comment.getReport` | GET | `comments/{commentId}/reports/{reportId}` | ojs omp ops | admin manager | U14 | — |
| `comment.getReports` | GET | `comments/{commentId}/reports` | ojs omp ops | admin manager | U14 | — |
| `comment.deleteReports` | DELETE | `comments/{commentId}/reports` | ojs omp ops | admin manager | U14 | — |

### contexts — PKPContextController (API-013)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `context.getMany` | GET | `contexts` | ojs omp ops | admin manager | U59 | — |
| `context.getContext` | GET | `contexts/{contextId}` | ojs omp ops | admin manager | U59 | — |
| `context.getTheme` | GET | `contexts/{contextId}/theme` | ojs omp ops | admin manager | U10 | — |
| `context.edit` | PUT | `contexts/{contextId}` | ojs omp ops | admin manager | U59 | — |
| `context.editTheme` | PUT | `contexts/{contextId}/theme` | ojs omp ops | admin manager | U10 | — |
| `context.edit.doiRegistration` | PUT | `contexts/{contextId}/registrationAgency` | ojs omp ops | admin manager | U45 | — |
| `context.add` | POST | `contexts` | ojs omp ops | admin | U59 | — |
| `context.delete` | DELETE | `contexts/{contextId}` | ojs omp ops | admin | U59 | — |

### contributorRoles — ContributorRoleController (API-014)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `contributorRole.getContributorRole` | GET | `contributorRoles/{roleId}` | ojs omp ops | admin manager | U41 | U41#contributor-roles |
| `contributorRole.getContributorRoles` | GET | `contributorRoles` | ojs omp ops | admin manager | U41 | U41#contributor-roles |
| `contributorRole.getIdentifiers` | GET | `contributorRoles/identifiers` | ojs omp ops | admin manager | U41 | U41#contributor-roles |
| `contributorRole.addContributorRole` | POST | `contributorRoles` | ojs omp ops | admin manager | U41 | U41#contributor-roles |
| `contributorRole.editContributorRole` | PUT | `contributorRoles/{roleId}` | ojs omp ops | admin manager | U41 | U41#contributor-roles |
| `contributorRole.deleteContributorRole` | DELETE | `contributorRoles/{roleId}` | ojs omp ops | admin manager | U41 | U41#contributor-roles |

### dois — DoiController [ojs] (API-052)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `doi.issues.assignDois` | POST | `dois/issues/assignDois` | ojs | admin manager | U45 | — |
| `doi.issues.export` | PUT | `dois/issues/export` | ojs | admin manager | U45 | — |
| `doi.issues.deposit` | PUT | `dois/issues/deposit` | ojs | admin manager | U45 | — |
| `doi.issues.markRegistered` | PUT | `dois/issues/markRegistered` | ojs | admin manager | U45 | — |
| `doi.issues.markUnregistered` | PUT | `dois/issues/markUnregistered` | ojs | admin manager | U45 | — |
| `doi.issues.markStale` | PUT | `dois/issues/markStale` | ojs | admin manager | U45 | — |

### dois — PKPDoiController (API-016)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `doi.getMany` | GET | `dois` | ojs omp ops | admin manager | U45 | — |
| `doi.getDoi` | GET | `dois/{doiId}` | ojs omp ops | admin manager | U45 | — |
| `doi.exports.getFile` | GET | `dois/exports/{fileId}` | ojs omp ops | admin manager | U45 | — |
| `doi.add` | POST | `dois` | ojs omp ops | admin manager | U45 | — |
| `doi.submissions.assignDois` | POST | `dois/submissions/assignDois` | ojs omp ops | admin manager | U45 | — |
| `doi.edit` | PUT | `dois/{doiId}` | ojs omp ops | admin manager | U45 | — |
| `doi.submissions.export` | PUT | `dois/submissions/export` | ojs omp ops | admin manager | U45 | — |
| `doi.submissions.deposit` | PUT | `dois/submissions/deposit` | ojs omp ops | admin manager | U45 | — |
| `doi.submissions.markRegistered` | PUT | `dois/submissions/markRegistered` | ojs omp ops | admin manager | U45 | — |
| `doi.submissions.markUnregistered` | PUT | `dois/submissions/markUnregistered` | ojs omp ops | admin manager | U45 | — |
| `doi.submissions.markStale` | PUT | `dois/submissions/markStale` | ojs omp ops | admin manager | U45 | — |
| `doi.deposite.all` | PUT | `dois/depositAll` | ojs omp ops | admin manager | U45 | — |
| `doi.delete` | DELETE | `dois/{doiId}` | ojs omp ops | admin manager | U45 | — |

### editTaskTemplates — PKPEditTaskTemplateController (API-017)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| — | POST | `editTaskTemplates` | ojs omp ops | admin manager | U37 | — |
| — | PUT | `editTaskTemplates/{templateId}` | ojs omp ops | admin manager | U37 | — |
| — | DELETE | `editTaskTemplates/{templateId}` | ojs omp ops | admin manager | U37 | — |
| — | GET | `editTaskTemplates/variables` | ojs omp ops | admin manager | U37 | — |
| — | GET | `editTaskTemplates` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |

### emailTemplates — PKPEmailTemplateController (API-019)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `emailTemplate.getMany` | GET | `emailTemplates` | ojs omp ops | admin manager subEditor assistant | U56 | — |
| `emailTemplate.getTemplate` | GET | `emailTemplates/{key}` | ojs omp ops | admin manager subEditor assistant | U56 | — |
| `emailTemplate.add` | POST | `emailTemplates` | ojs omp ops | admin manager | U56 | — |
| `emailTemplate.edit` | PUT | `emailTemplates/{key}` | ojs omp ops | admin manager | U56 | — |
| `emailTemplate.restoreDefaults` | DELETE | `emailTemplates/restoreDefaults` | ojs omp ops | admin manager | U56 | — |
| `emailTemplate.delete` | DELETE | `emailTemplates/{key}` | ojs omp ops | admin manager | U56 | — |

### emails — PKPEmailController (API-018)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `emails.getMany` | GET | `emails/authorEmails` | ojs omp ops | author | U38 | — |
| `emails.getEmail` | GET | `emails/{emailId}` | ojs omp ops | manager subEditor author | U38 | — |

### genres — GenreController (API-021)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `genre.getMany` | GET | `genres` | ojs omp ops | admin manager subEditor assistant author | U58 | — |
| `genre.get` | GET | `genres/{genreId}` | ojs omp ops | admin manager subEditor assistant author | U58 | — |

### highlights — HighlightsController (API-022)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `highlight.getMany` | GET | `highlights` | ojs omp ops | admin manager | U11 | — |
| `highlight.get` | GET | `highlights/{highlightId}` | ojs omp ops | admin manager | U11 | — |
| `highlight.add` | POST | `highlights` | ojs omp ops | admin manager | U11 | — |
| `highlight.edit` | PUT | `highlights/{highlightId}` | ojs omp ops | admin manager | U11 | — |
| `highlight.order` | PUT | `highlights/order` | ojs omp ops | admin manager | U11 | — |
| `highlight.delete` | DELETE | `highlights/{highlightId}` | ojs omp ops | admin manager | U11 | — |

### institutions — PKPInstitutionController (API-023)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `institution.getMany` | GET | `institutions` | ojs omp ops | manager | U66 | U66#institutions |
| `institution.getInstitution` | GET | `institutions/{institutionId}` | ojs omp ops | manager | U66 | U66#institutions |
| `institution.add` | POST | `institutions` | ojs omp ops | manager | U66 | U66#institutions |
| `institution.edit` | PUT | `institutions/{institutionId}` | ojs omp ops | manager | U66 | U66#institutions |
| `institution.delete` | DELETE | `institutions/{institutionId}` | ojs omp ops | manager | U66 | U66#institutions |

### invitations — InvitationController (API-024)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `invitation.getMany` | GET | `invitations/{type}` | ojs omp ops | admin manager | U06 | — |
| `invitation.get` | GET | `invitations/{invitationId}` | ojs omp ops | admin manager | U06 | — |
| `invitation.add` | POST | `invitations/add/{type}` | ojs omp ops | admin manager | U06 | — |
| `invitation.populate` | PUT | `invitations/{invitationId}/populate` | ojs omp ops | admin manager | U06 | — |
| `invitation.invite` | PUT | `invitations/{invitationId}/invite` | ojs omp ops | admin manager | U06 | — |
| `invitation.getMailable` | GET | `invitations/{invitationId}/getMailable` | ojs omp ops | admin manager | U06 | — |
| `invitation.cancel` | PUT | `invitations/{invitationId}/cancel` | ojs omp ops | admin manager | U06 | — |
| `invitation.receive` | GET | `invitations/{invitationId}/key/{key}` | ojs omp ops | none | U06 | — |
| `invitation.finalize` | PUT | `invitations/{invitationId}/key/{key}/finalize` | ojs omp ops | none | U06 | — |
| `invitation.refine` | PUT | `invitations/{invitationId}/key/{key}/refine` | ojs omp ops | none | U06 | — |
| `invitation.decline` | PUT | `invitations/{invitationId}/key/{key}/decline` | ojs omp ops | none | U06 | — |

### issues — IssueController [ojs] (API-053)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `issue.getMany` | GET | `issues` | ojs | manager subEditor assistant author reviewer | U50 | — |
| `issue.current` | GET | `issues/current` | ojs | manager subEditor assistant author reviewer | U50 | — |
| `issue.getIssue` | GET | `issues/{issueId}` | ojs | manager subEditor assistant author reviewer | U50 | — |
| `issue.getAssignmentOptions` | GET | `issues/assignmentOptions` | ojs | manager subEditor assistant author reviewer | U50 | — |

### jobs — PKPJobController (API-026)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `job.getMany` | GET | `jobs/all` | ojs omp ops | admin | U61 | — |
| `job.failed.getMany` | GET | `jobs/failed/all` | ojs omp ops | admin | U61 | — |
| `job.redispatch.all` | POST | `jobs/redispatch/all` | ojs omp ops | admin | U61 | — |
| `job.redispatch` | POST | `jobs/redispatch/{jobId}` | ojs omp ops | admin | U61 | — |
| `job.delete.failed` | DELETE | `jobs/failed/delete/{jobId}` | ojs omp ops | admin | U61 | — |

### mailables — PKPMailableController (API-027)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `mailable.getMany` | GET | `mailables` | ojs omp ops | admin manager | U56 | — |
| `mailable.getMailable` | GET | `mailables/{id}` | ojs omp ops | admin manager | U56 | — |

### navigationMenus — PKPNavigationMenuController (API-028)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `navigationMenu.getAllItems` | GET | `navigationMenus/items` | ojs omp ops | admin manager | U08 | — |
| `navigationMenu.getAreas` | GET | `navigationMenus/areas` | ojs omp ops | admin manager | U08 | — |
| `navigationMenu.getItems` | GET | `navigationMenus/{navigationMenuId}/items` | ojs omp ops | admin manager | U08 | — |
| `navigationMenu.add` | POST | `navigationMenus` | ojs omp ops | admin manager | U08 | — |
| `navigationMenu.edit` | PUT | `navigationMenus/{navigationMenuId}` | ojs omp ops | admin manager | U08 | — |

### orcid — OrcidController (API-029)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `orcid.requestAuthorVerification` | POST | `orcid/requestAuthorVerification/{authorId}` | ojs omp ops | admin manager subEditor author | U04 | — |
| `orcid.delete` | POST | `orcid/deleteForAuthor/{authorId}` | ojs omp ops | admin manager subEditor author | U04 | — |

### peerReviews — PeerReviewController (API-030)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `peerReviews.open.submissions.getMany` | GET | `peerReviews/open/submissions` | ojs | none | parked | — |
| `peerReviews.open.submissions.summary.getMany` | GET | `peerReviews/open/submissions/summary` | ojs | none | parked | — |
| `peerReviews.open.submissions.get` | GET | `peerReviews/open/submissions/{submissionId}` | ojs | none | parked | — |
| `peerReviews.open.submissions.summary.get` | GET | `peerReviews/open/submissions/{submissionId}/summary` | ojs | none | parked | — |

### reviewers/recommendations — ReviewerRecommendationController [ojs] (API-054)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `reviewer.recommendations.get` | GET | `reviewers/recommendations/{reviewerRecommendationId}` | ojs | admin manager subEditor | U29 | — |
| `reviewer.recommendations.getMany` | GET | `reviewers/recommendations` | ojs | admin manager subEditor | U29 | — |
| `reviewer.recommendations.add` | POST | `reviewers/recommendations` | ojs | admin manager subEditor | U29 | — |
| `reviewer.recommendations.edit` | PUT | `reviewers/recommendations/{reviewerRecommendationId}` | ojs | admin manager subEditor | U29 | — |
| `reviewer.recommendations.edit.status` | PUT | `reviewers/recommendations/{reviewerRecommendationId}/status` | ojs | admin manager subEditor | U29 | — |
| `reviewer.recommendations.delete` | DELETE | `reviewers/recommendations/{reviewerRecommendationId}` | ojs | admin manager subEditor | U29 | — |

### reviews — PKPReviewController (API-032)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `review.authorResponse.requestAuthorResponse` | POST | `reviews/{submissionId}/{reviewRoundId}/authorResponse/requestResponse` | ojs omp | admin manager subEditor | U30 | — |
| `review.authorResponse.submitAuthorResponse` | POST | `reviews/{submissionId}/{reviewRoundId}/authorResponse` | ojs omp | author | U30 | — |
| `review.authorResponse.editAuthorResponse` | PUT | `reviews/{submissionId}/{reviewRoundId}/authorResponse/{responseId}` | ojs omp | admin manager subEditor | U30 | — |
| `review.authorResponse.deleteAuthorResponse` | DELETE | `reviews/{submissionId}/{reviewRoundId}/authorResponse/{responseId}` | ojs omp | admin manager subEditor | U30 | — |
| `review.get.submission.round.history` | GET | `reviews/history/{submissionId}/{reviewRoundId}` | ojs omp | admin manager reviewer | U28 | — |
| `review.confirm` | PUT | `reviews/{submissionId}/{reviewAssignmentId}/confirmReview` | ojs omp | admin manager subEditor | U27 | — |
| `review.export.pdf` | GET | `reviews/{submissionId}/{reviewAssignmentId}/export-pdf` | ojs omp | admin manager subEditor assistant | U27 | — |
| `review.export.xml` | GET | `reviews/{submissionId}/{reviewAssignmentId}/export-xml` | ojs omp | admin manager subEditor assistant | U27 | — |
| `review.export.getFile` | GET | `reviews/{submissionId}/exports/{fileId}` | ojs omp | admin manager subEditor assistant | U27 | — |
| `review.sendToOrcid` | POST | `reviews/{submissionId}/{reviewAssignmentId}/sendToOrcid` | ojs omp | admin manager subEditor | U04 | — |

### rors — PKPRorController (API-033)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `ror.getRor` | GET | `rors/{rorId}` | ojs omp ops | manager subEditor assistant author | U41 | U41#registry-lookup |
| `ror.getMany` | GET | `rors` | ojs omp ops | manager subEditor assistant author | U41 | U41#registry-lookup |
| `ror.addOrEdit` | POST | `rors` | ojs omp ops | manager subEditor assistant author | U41 | U41#registry-lookup |

### sections — SectionController (API-034)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `section.getMany` | GET | `sections` | ojs | admin manager | U17 | — |
| `section.getSection` | GET | `sections/{sectionId}` | ojs | admin manager | U17 | — |

### site — PKPSiteController (API-035)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `site.getSite` | GET | `site` | ojs omp ops | admin | U60 | — |
| `site.getTheme` | GET | `site/theme` | ojs omp ops | admin | U60 | — |
| `site.edit` | PUT | `site` | ojs omp ops | admin | U60 | — |
| `site.editTheme` | PUT | `site/theme` | ojs omp ops | admin | U60 | — |

### stats/contexts — PKPStatsContextController (API-036)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.context.multipleContextTimeline` | GET | `stats/contexts/timeline` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.context.contextTimeline` | GET | `stats/contexts/{contextId}/timeline` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.context.contextStat` | GET | `stats/contexts/{contextId}` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.context.multipleContextStat` | GET | `stats/contexts` | ojs omp ops | admin manager subEditor | U64 | — |

### stats/editorial — PKPStatsEditorialController (API-037)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.editorial.getEditorialStat` | GET | `stats/editorial` | ojs omp ops | admin manager subEditor | U65 | — |
| `stats.editorial.getAverages` | GET | `stats/editorial/averages` | ojs omp ops | admin manager subEditor | U65 | — |

### stats/issues — StatsIssueController [ojs] (API-056)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.issue.getManyTimeline` | GET | `stats/issues/timeline` | ojs | admin manager subEditor | U64 | — |
| `stats.issue.getIssue` | GET | `stats/issues/{issueId}` | ojs | admin manager subEditor | U64 | — |
| `stats.issue.getTimeline` | GET | `stats/issues/{issueId}/timeline` | ojs | admin manager subEditor | U64 | — |
| `stats.issue.getMany` | GET | `stats/issues` | ojs | admin manager subEditor | U64 | — |

### stats/publications — PKPStatsPublicationController (API-038)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.publication.getMany` | GET | `stats/publications` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.publication.getManyTimeline` | GET | `stats/publications/timeline` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.publication.getSubmission` | GET | `stats/publications/{submissionId}` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.publication.getTimeline` | GET | `stats/publications/{submissionId}/timeline` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.publication.getFiles` | GET | `stats/publications/files` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.publication.getCountries` | GET | `stats/publications/countries` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.publication.getRegions` | GET | `stats/publications/regions` | ojs omp ops | admin manager subEditor | U64 | — |
| `stats.publication.getCities` | GET | `stats/publications/cities` | ojs omp ops | admin manager subEditor | U64 | — |

### stats/sushi — PKPStatsSushiController (API-039)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.sushi.getStatus` | GET | `stats/sushi/status` | ojs omp ops | ? | U64 | — |
| `stats.sushi.getMembers` | GET | `stats/sushi/members` | ojs omp ops | ? | U64 | — |
| `stats.sushi.getReports` | GET | `stats/sushi/reports` | ojs omp ops | ? | U64 | — |
| `stats.sushi.getReportsPR` | GET | `stats/sushi/reports/pr` | ojs omp ops | ? | U64 | — |
| `stats.sushi.getReportsPR1` | GET | `stats/sushi/reports/pr_p1` | ojs omp ops | ? | U64 | — |

### stats/sushi — StatsSushiController [ojs] (API-055)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.sushi.getReportsTR` | GET | `stats/sushi/reports/tr` | ojs | ? | U64 | — |
| `stats.sushi.getReportsTRJ3` | GET | `stats/sushi/reports/tr_j3` | ojs | ? | U64 | — |
| `stats.sushi.getReportsIR` | GET | `stats/sushi/reports/ir` | ojs | ? | U64 | — |
| `stats.sushi.getReportsIRA1` | GET | `stats/sushi/reports/ir_a1` | ojs | ? | U64 | — |

### stats/sushi — StatsSushiController [omp] (API-060)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.sushi.getReportsTR` | GET | `stats/sushi/reports/tr` | omp | ? | U64 | — |
| `stats.sushi.getReportsTRB3` | GET | `stats/sushi/reports/tr_b3` | omp | ? | U64 | — |

### stats/sushi — StatsSushiController [ops] (API-064)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.sushi.getReportsIR` | GET | `stats/sushi/reports/ir` | ops | ? | U64 | — |

### stats/users — PKPStatsUserController (API-040)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `stats.user.getUserStat` | GET | `stats/users` | ojs omp ops | admin manager subEditor | U65 | — |

### submissions — EditorialTaskController (API-044)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `submission.task.add` | POST | `submissions/{submissionId}/tasks` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.edit` | PUT | `submissions/{submissionId}/tasks/{taskId}` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.delete` | DELETE | `submissions/{submissionId}/tasks/{taskId}` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.get` | GET | `submissions/{submissionId}/tasks/{taskId}` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.getMany` | GET | `submissions/{submissionId}/stages/{stageId}/tasks` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.close` | PUT | `submissions/{submissionId}/tasks/{taskId}/close` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.open` | PUT | `submissions/{submissionId}/tasks/{taskId}/open` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.start` | PUT | `submissions/{submissionId}/tasks/{taskId}/start` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.fromTemplate` | GET | `submissions/{submissionId}/stages/{stageId}/tasks/fromTemplate/{templateId}` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.note.add` | POST | `submissions/{submissionId}/tasks/{taskId}/notes` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.note.delete` | DELETE | `submissions/{submissionId}/tasks/{taskId}/notes/{noteId}` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |
| `submission.task.participants.get` | GET | `submissions/{submissionId}/stages/{stageId}/tasks/participants` | ojs omp ops | admin manager subEditor assistant author reviewer | U37 | — |

### submissions — PKPSubmissionController (API-042)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `submission.getMany` | GET | `submissions` | ojs omp ops | manager subEditor assistant author reviewer | U23 | — |
| `submission.getSubmission` | GET | `submissions/{submissionId}` | ojs omp ops | manager subEditor assistant author reviewer | U24 | — |
| `submission.publications.getMany` | GET | `submissions/{submissionId}/publications` | ojs omp ops | manager subEditor assistant author reviewer | U24 | — |
| `submission.publications.get` | GET | `submissions/{submissionId}/publications/{publicationId}` | ojs omp ops | manager subEditor assistant author reviewer | U24 | — |
| `submission.publication.contributor.getMany` | GET | `submissions/{submissionId}/publications/{publicationId}/contributors` | ojs omp ops | manager subEditor assistant author reviewer | U41 | U41#contributor-list |
| `submission.publication.contributor.get` | GET | `submissions/{submissionId}/publications/{publicationId}/contributors/{contributorId}` | ojs omp ops | manager subEditor assistant author reviewer | U41 | U24#publication-pages |
| `submission.participants.getMany` | GET | `submissions/{submissionId}/participants` | ojs omp ops | manager subEditor assistant | U35 | — |
| `submission.participants.stage.getMany` | GET | `submissions/{submissionId}/participants/{stageId}` | ojs omp ops | manager subEditor assistant | U35 | — |
| `submission.decisions.getMany` | GET | `submissions/{submissionId}/decisions` | ojs omp ops | manager subEditor | U34 | — |
| `submission.decision.add` | POST | `submissions/{submissionId}/decisions` | ojs omp ops | manager subEditor | U34 | — |
| `submission.returnToDone` | POST | `submissions/{submissionId}/returnToDone` | ojs omp ops | manager subEditor | U34 | — |
| `submission.delete` | DELETE | `submissions/{submissionId}` | ojs omp ops | manager subEditor | U22 | — |
| `submission.publication.changeLocale` | PUT | `submissions/{submissionId}/publications/{publicationId}/changeLocale` | ojs omp ops | manager subEditor | U40 | — |
| `submission.publication.version` | PUT | `submissions/{submissionId}/publications/{publicationId}/version` | ojs omp ops | manager subEditor | U49 | — |
| `submission.getNextAvailableVersion` | GET | `submissions/{submissionId}/nextAvailableVersion` | ojs omp ops | manager subEditor | U49 | — |
| `submission.publication.add` | POST | `submissions/{submissionId}/publications` | ojs omp ops | manager subEditor assistant | U49 | — |
| `submission.publication.version.get` | POST | `submissions/{submissionId}/publications/{publicationId}/version` | ojs omp ops | manager subEditor assistant | U49 | — |
| `submission.publication.publish` | PUT | `submissions/{submissionId}/publications/{publicationId}/publish` | ojs omp ops | manager subEditor assistant | U49 | — |
| `submission.publication.unpublish` | PUT | `submissions/{submissionId}/publications/{publicationId}/unpublish` | ojs omp ops | manager subEditor assistant | U49 | — |
| `submission.publication.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}` | ojs omp ops | manager subEditor assistant | U49 | — |
| `submission.contributor.add` | POST | `submissions/{submissionId}/publications/{publicationId}/contributors` | ojs omp ops | manager subEditor assistant author | U41 | U40#edit-gate |
| `submission.publication.edit` | PUT | `submissions/{submissionId}/publications/{publicationId}` | ojs omp ops | manager subEditor assistant author | U40 | — |
| `submission.publication.contributor.edit` | PUT | `submissions/{submissionId}/publications/{publicationId}/contributors/{contributorId}` | ojs omp ops | manager subEditor assistant author | U41 | U40#edit-gate |
| `submission.publication.contributor.order.save` | PUT | `submissions/{submissionId}/publications/{publicationId}/contributors/saveOrder` | ojs omp ops | manager subEditor assistant author | U41 | U40#edit-gate |
| `submission.publication.contributor.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}/contributors/{contributorId}` | ojs omp ops | manager subEditor assistant author | U41 | U40#edit-gate |
| `submission.publication._components.metadata` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/metadata` | ojs omp ops | manager subEditor assistant author | U40 | — |
| `submission.publication._components.dataAvailability` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/dataAvailability` | ojs omp ops | manager subEditor assistant author | U40 | — |
| `submission.publication._components.fundingStatement` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/fundingStatement` | ojs omp ops | manager subEditor assistant author | U40 | — |
| `submission.publication._components.titleAbstract` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/titleAbstract` | ojs omp ops | manager subEditor assistant author | U40 | — |
| `submission.publication._components.changeLanguageMetadata` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/changeLanguageMetadata` | ojs omp ops | manager subEditor assistant author | U40 | — |
| `submission.publication._components.identifiers` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/identifier` | ojs omp ops | manager subEditor assistant | U44 | — |
| `submission.publication._components.permissionDisclosure` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/permissionDisclosure` | ojs omp ops | manager subEditor assistant | U40 | — |
| `submission.edit` | PUT | `submissions/{submissionId}` | ojs omp ops | manager subEditor author | U21 | — |
| `submission.saveForLater` | PUT | `submissions/{submissionId}/saveForLater` | ojs omp ops | manager subEditor author | U21 | — |
| `submission.submit` | PUT | `submissions/{submissionId}/submit` | ojs omp ops | manager subEditor author | U21 | — |
| `submission.add` | POST | `submissions` | ojs omp ops | none | U21 | — |

### submissions — SubmissionController [ojs] (API-057)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `submission.publication.issue.assignmentStatus` | GET | `submissions/{submissionId}/publications/{publicationId}/issueAssignmentStatus` | ojs | admin manager subEditor assistant | U49 | — |
| `submission.publication._components.issue` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/issue` | ojs | admin manager subEditor assistant | U49 | — |
| `submission.publication._components.submissionPayment` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/submissionPayment` | ojs | admin manager subEditor assistant | U52 | — |

### submissions — SubmissionController [omp] (API-061)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `submission.publication._components.audience` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/audience` | omp | admin manager subEditor assistant | U74 | — |
| `submission.publication._components.catalogEntry` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/catalogEntry` | omp | admin manager subEditor assistant | U70 | — |
| `submission.publication._components.publicationDates` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/publicationDates` | omp | admin manager subEditor assistant | U72 | — |

### submissions — SubmissionController [ops] (API-065)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `submission.publication.relate` | PUT | `submissions/{submissionId}/publications/{publicationId}/relate` | ops | admin manager subEditor assistant author | U75 | — |
| `submission.publication._components.issue` | GET | `submissions/{submissionId}/publications/{publicationId}/_components/issue` | ops | admin manager subEditor assistant | U49 | — |

### submissions/{submissionId}/files — PKPSubmissionFileController (API-043)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `submission.files.getMany` | GET | `submissions/{submissionId}/files` | ojs omp ops | admin manager subEditor assistant author | U36 | — |
| `submission.files.getFile` | GET | `submissions/{submissionId}/files/{submissionFileId}` | ojs omp ops | admin manager subEditor assistant author | U36 | — |
| `submission.files.add` | POST | `submissions/{submissionId}/files` | ojs omp ops | admin manager subEditor assistant author | U36 | — |
| `submission.files.edit` | PUT | `submissions/{submissionId}/files/{submissionFileId}` | ojs omp ops | admin manager subEditor assistant author | U36 | — |
| `submission.files.delete` | DELETE | `submissions/{submissionId}/files/{submissionFileId}` | ojs omp ops | admin manager subEditor assistant author | U36 | — |
| `submission.files.review` | GET | `submissions/{submissionId}/files/review/{reviewId}` | ojs omp ops | admin manager subEditor assistant reviewer | U27 | — |
| `submission.files.copy` | PUT | `submissions/{submissionId}/files/{submissionFileId}/copy` | ojs omp ops | admin manager subEditor | U36 | — |

### submissions/{submissionId}/publications/{publicationId}/bodyText — PKPBodyTextController (API-009)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `publication.bodyText.get` | GET | `submissions/{submissionId}/publications/{publicationId}/bodyText` | ojs | admin manager subEditor assistant author | U48 | — |
| `publication.bodyText.save` | PUT | `submissions/{submissionId}/publications/{publicationId}/bodyText` | ojs | admin manager subEditor assistant | U48 | — |
| `publication.bodyText.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}/bodyText` | ojs | admin manager subEditor assistant | U48 | — |

### submissions/{submissionId}/publications/{publicationId}/citations — PKPCitationController (API-011)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `citation.getMany` | GET | `submissions/{submissionId}/publications/{publicationId}/citations` | ojs omp ops | manager subEditor assistant author | U42 | — |
| `citation.getCitation` | GET | `submissions/{submissionId}/publications/{publicationId}/citations/{citationId}` | ojs omp ops | manager subEditor assistant author | U42 | — |
| `citation.edit` | PUT | `submissions/{submissionId}/publications/{publicationId}/citations/{citationId}` | ojs omp ops | manager subEditor assistant author | U42 | — |
| `citation.reprocessCitation` | POST | `submissions/{submissionId}/publications/{publicationId}/citations/{citationId}/reprocessCitation` | ojs omp ops | manager subEditor assistant author | U42 | — |
| `citation.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}/citations/{citationId}` | ojs omp ops | manager subEditor assistant author | U42 | — |
| `citation.importAdditionalCitations` | POST | `submissions/{submissionId}/publications/{publicationId}/citations/importAdditionalCitations` | ojs omp ops | manager subEditor assistant author | U42 | — |
| `citation.deleteCitationsByPublicationId` | DELETE | `submissions/{submissionId}/publications/{publicationId}/citations/deleteCitationsByPublicationId` | ojs omp ops | manager subEditor assistant author | U42 | — |
| `citation.reprocessCitationsByPublicationId` | POST | `submissions/{submissionId}/publications/{publicationId}/citations/reprocessCitationsByPublicationId` | ojs omp ops | manager subEditor assistant author | U42 | — |

### submissions/{submissionId}/publications/{publicationId}/dataCitations — PKPDataCitationController (API-015)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `dataCitation.getMany` | GET | `submissions/{submissionId}/publications/{publicationId}/dataCitations` | ojs omp ops | admin manager subEditor assistant author | U42 | — |
| `dataCitation.getDataCitation` | GET | `submissions/{submissionId}/publications/{publicationId}/dataCitations/{dataCitationId}` | ojs omp ops | admin manager subEditor assistant author | U42 | — |
| `dataCitation.add` | POST | `submissions/{submissionId}/publications/{publicationId}/dataCitations` | ojs omp ops | admin manager subEditor assistant author | U42 | — |
| `dataCitation.edit` | PUT | `submissions/{submissionId}/publications/{publicationId}/dataCitations/{dataCitationId}` | ojs omp ops | admin manager subEditor assistant author | U42 | — |
| `dataCitation.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}/dataCitations/{dataCitationId}` | ojs omp ops | admin manager subEditor assistant author | U42 | — |
| `dataCitation.order` | PUT | `submissions/{submissionId}/publications/{publicationId}/dataCitations/order` | ojs omp ops | admin manager subEditor assistant author | U42 | — |

### submissions/{submissionId}/publications/{publicationId}/funders — PKPFunderController (API-020)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `funders.getMany` | GET | `submissions/{submissionId}/publications/{publicationId}/funders` | ojs omp ops | admin manager subEditor assistant author | U43 | U24#publication-pages |
| `funders.getFunder` | GET | `submissions/{submissionId}/publications/{publicationId}/funders/{funderId}` | ojs omp ops | admin manager subEditor assistant author | U43 | U24#publication-pages |
| `funders.add` | POST | `submissions/{submissionId}/publications/{publicationId}/funders` | ojs omp ops | admin manager subEditor assistant author | U43 | U40#edit-gate |
| `funders.edit` | PUT | `submissions/{submissionId}/publications/{publicationId}/funders/{funderId}` | ojs omp ops | admin manager subEditor assistant author | U43 | U40#edit-gate |
| `funders.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}/funders/{funderId}` | ojs omp ops | admin manager subEditor assistant author | U43 | U40#edit-gate |
| `funders.order` | PUT | `submissions/{submissionId}/publications/{publicationId}/funders/order` | ojs omp ops | admin manager subEditor assistant author | U43 | U40#edit-gate |

### submissions/{submissionId}/publications/{publicationId}/jats — PKPJatsController (API-025)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `publication.jats.get` | GET | `submissions/{submissionId}/publications/{publicationId}/jats` | ojs | admin manager subEditor assistant author | U48 | — |
| `publication.jats.add` | POST | `submissions/{submissionId}/publications/{publicationId}/jats` | ojs | admin manager subEditor assistant | U48 | — |
| `publication.jats.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}/jats` | ojs | admin manager subEditor assistant | U48 | — |
| `publication.jats.setVisibility` | PUT | `submissions/{submissionId}/publications/{publicationId}/jats/visibility` | ojs | admin manager subEditor assistant | U48 | — |

### submissions/{submissionId}/publications/{publicationId}/mediaFiles — MediaFilesController (API-041)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `mediaFiles.getMany` | GET | `submissions/{submissionId}/publications/{publicationId}/mediaFiles` | ojs omp ops | admin manager subEditor assistant author | U47 | — |
| `mediaFiles.add` | POST | `submissions/{submissionId}/publications/{publicationId}/mediaFiles` | ojs omp ops | admin manager subEditor assistant | U47 | — |
| `mediaFiles.linkMany` | POST | `submissions/{submissionId}/publications/{publicationId}/mediaFiles/link` | ojs omp ops | admin manager subEditor assistant | U47 | — |
| `mediaFiles.link` | PUT | `submissions/{submissionId}/publications/{publicationId}/mediaFiles/{submissionFileId}/link` | ojs omp ops | admin manager subEditor assistant | U47 | — |
| `mediaFiles.edit` | PUT | `submissions/{submissionId}/publications/{publicationId}/mediaFiles/{submissionFileId}` | ojs omp ops | admin manager subEditor assistant | U47 | — |
| `mediaFiles.delete` | DELETE | `submissions/{submissionId}/publications/{publicationId}/mediaFiles/{submissionFileId}` | ojs omp ops | admin manager subEditor assistant | U47 | — |

### submissions/{submissionId}/reviewAssignments — ReviewAssignmentController (API-067)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `submission.reviewAssignment.getReviewAssignment` | GET | `submissions/{submissionId}/reviewAssignments/{reviewAssignmentId}` | ojs omp | admin manager subEditor assistant | U27 | — |
| `submission.reviewAssignment.editReviewAssignment` | PUT | `submissions/{submissionId}/reviewAssignments/{reviewAssignmentId}` | ojs omp | admin manager subEditor assistant | U27 | — |
| `submission.reviewAssignment.consider` | PUT | `submissions/{submissionId}/reviewAssignments/{reviewAssignmentId}/consider` | ojs omp | admin manager subEditor assistant | U27 | — |
| `submission.reviewAssignment.review.getReview` | GET | `submissions/{submissionId}/reviewAssignments/{reviewAssignmentId}/review` | ojs omp | admin manager subEditor assistant | U27 | — |
| `submission.reviewAssignment.review.editReview` | PUT | `submissions/{submissionId}/reviewAssignments/{reviewAssignmentId}/review` | ojs omp | admin manager subEditor | U27 | — |

### submissions/{submissionId}/reviewers/suggestions — ReviewerSuggestionController (API-031)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `reviewer.suggestions.get` | GET | `submissions/{submissionId}/reviewers/suggestions/{suggestionId}` | ojs omp | admin manager subEditor assistant author | U31 | — |
| `reviewer.suggestions.getMany` | GET | `submissions/{submissionId}/reviewers/suggestions` | ojs omp | admin manager subEditor assistant author | U31 | — |
| `reviewer.suggestions.add` | POST | `submissions/{submissionId}/reviewers/suggestions` | ojs omp | admin manager subEditor assistant author | U31 | — |
| `reviewer.suggestions.edit` | PUT | `submissions/{submissionId}/reviewers/suggestions/{suggestionId}` | ojs omp | admin manager subEditor assistant author | U31 | — |
| `reviewer.suggestions.delete` | DELETE | `submissions/{submissionId}/reviewers/suggestions/{suggestionId}` | ojs omp | admin manager subEditor assistant author | U31 | — |

### temporaryFiles — PKPTemporaryFilesController (API-045)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `temporaryFile.uploadFile` | POST | `temporaryFiles` | ojs omp ops | admin manager subEditor assistant author reviewer | U36 | — |

### userGroups — UserGroupController (API-046)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `userGroups.getMany` | GET | `userGroups` | ojs omp ops | admin manager subEditor assistant author reviewer | U54 | — |

### users — PKPUserController (API-047)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `user.getReviewers` | GET | `users/reviewers` | ojs omp ops | admin manager subEditor | U27 | — |
| `user.getReport` | GET | `users/report` | ojs omp ops | admin manager subEditor | U65 | — |
| `user.getUser` | GET | `users/{userId}` | ojs omp ops | admin manager subEditor | U53 | — |
| `user.getManyUsers` | GET | `users` | ojs omp ops | admin manager subEditor | U53 | — |
| `user.endRole` | PUT | `users/{userId}/endRole/{userGroupId}` | ojs omp ops | admin manager | U53 | — |
| `user.masthead` | PUT | `users/{userId}/masthead/{userUserGroupId}` | ojs omp ops | admin manager | U53 | — |

### vocabs — PKPVocabController (API-049)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `vocab.getMany` | GET | `vocabs` | ojs omp ops | admin manager subEditor assistant author | U40 | — |

### vocabs/interests — PKPInterestController (API-048)

| Route | Method | Path | Apps | Roles | Owner | Gate |
|---|---|---|---|---|---|---|
| `interest.getMany` | GET | `vocabs/interests` | ojs omp | none | U27 | — |
