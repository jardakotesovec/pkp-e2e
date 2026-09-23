<?php

/**
 * @file classes/testing/PKPSubmissionScenarioBuilder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class PKPSubmissionScenarioBuilder
 *
 * @brief POST /api/v1/_test/scenarios/submission — walk a submission to a
 * declared end-state through the SAME services the wizard and workflow
 * screens use (PRINCIPLES D3): Repo::submission()->add()/submit() (real
 * SubmissionSubmitted event → stage-1 discussion, AssignEditors, tasks),
 * Repo::decision()->add() (real DecisionType::runAdditionalActions — a
 * sendExternalReview decision creates review round 1 itself),
 * EditorAction::addReviewer and ReviewerAction::confirmReview for reviewer
 * states. Tests never script the journey to their starting point.
 *
 * Step-2 core schema: tag*, context* (urlPath), submitter* (username), title,
 * abstract, locale, submitted (explicit false = wizard-resumable draft),
 * decisions[] (real decision names, app-resolved), reviewRounds[] with
 * reviewers[] {username, status: invited|accepted|declined|completed,
 * reviewForm, recommendation, comments}, published.
 * Overlays: OJS section/issue; OMP series/seriesPosition + per-round stage
 * internal|external; OPS section (reviewRounds REJECTED — no review stage).
 * Richer keys return per feature, each with a parity entry.
 *
 * Feature passthroughs so far (each with a parity-ledger entry):
 * - reviewers[].status 'completed' (+ 'recommendation', 'comments') — U30:
 *   the reviewer wizard's own step forms run under the reviewer's identity
 *   (PKPReviewerReviewStep1Form → Step2Form → Step3Form::execute), so the
 *   assignment, the submission comment, the editors' REVIEWER_COMMENT
 *   notifications + REVIEW_COMPLETE email-log rows, the task deletion and
 *   the reviewReady event-log row are the app's own. 'accepted' keeps the
 *   bare confirmReview (step stays 1 — a documented deviation the U28
 *   suites walk from).
 * - participants[] {username*, role*, recommendOnly?, canChangeMetadata?} —
 *   non-submitter stage assignments (U21: an assigned Section Editor opening
 *   another author's draft), the same Repo::stageAssignment()->build() row
 *   the workflow's Assign Participant form writes. recommendOnly and
 *   canChangeMetadata (U35) are that window's "Assignment privileges" and
 *   "Permissions" boxes, defaulting to the user group's own recommendOnly /
 *   permitMetadataEdit as the window pre-ticks them; recommendOnly is
 *   refused on a role below sub-editor level and canChangeMetadata false on
 *   a manager-level role, as the window offers neither. The assignment
 *   email and notification the UI flow sends are deliberately absent
 *   (seed-side, Mail::fake anyway).
 * - author {orcid*, orcidIsVerified?} — ORCID iD fixture state on the
 *   submitter's contributor record (U4): a connected iD is only reachable
 *   through ORCID's own OAuth sign-in, which can never complete in the test
 *   env (outbound HTTP fails fast at the dead-port `[proxy]` in
 *   config.test.inc.php, and the sandbox ORCID credentials are dummies), so
 *   the unauthenticated/verified field states are seeded directly: the same
 *   author_settings rows the emailed link's landing stores
 *   (VerifyIdentityWithOrcid::setIdentityData), a verified iD carrying the
 *   live access token, scope, refresh token and expiry too
 *   (UserSeeder::orcidOAuthData; parity ledger 2026-09-13).
 * - reviewRounds[].reviewers[].reviewForm "<title>" — attaches the context's
 *   ACTIVE review form of that exact title to the assignment (U28), the
 *   same Repo::reviewAssignment()->edit(['reviewFormId']) the reviewer
 *   row's "Edit" window runs (EditReviewForm::execute; the window offers
 *   active forms only). A missing or inactive title is a 400 naming the
 *   active titles.
 * - reviewerSuggestions[] {givenName*, familyName?, email*, affiliation?,
 *   suggestionReason?} — the wizard's "Reviewer Suggestions" step entries
 *   (U31): the same ReviewerSuggestion::create() the step's "Add Reviewer
 *   Suggestion" window runs through POST submissions/{id}/reviewers/
 *   suggestions (ReviewerSuggestionController::add), validated with that
 *   request's own rules (AddReviewerSuggestion::rules + the multilingual
 *   rule) and created before submit(), as the wizard adds them (the API
 *   refuses add/edit/delete on a complete submission). The step exists
 *   only while the context's reviewerSuggestionEnabled is on, so a seed on
 *   a context with it off is a 400; OPS (no API mount, no step) refuses
 *   the key.
 * - userComments[] {user*, text*, approved? (default false), reports[]
 *   {user*, note*}} — reader comments on the published publication and
 *   their reports (U14): the same UserComment::query()->create() the
 *   comments API's POST runs (UserCommentController::submit), the same
 *   Repo::userComment()->addReport() its POST {id}/reports runs, and the
 *   controller's own notifyModerators() fan-out after each (one
 *   NOTIFICATION_LEVEL_TASK row per manager and site admin of the context:
 *   USER_COMMENT_POSTED on the comment, USER_COMMENT_REPORTED on the
 *   report), invoked on the controller by reflection so the moderator
 *   roster and the notification rows are the app's own, never mirrored.
 *   `approved: true` is the moderator's PUT {id}/setApproval written the
 *   way that action writes it (isApproved, approvedAt now, approvedByUserId
 *   the acting moderator — the seeding admin, a manager of every scratch
 *   context). The key needs `published: true` (the comment box exists on a
 *   published landing page only and the API refuses a publication that is
 *   not the current one); a report needs an approved comment (only the
 *   writer sees a pending or hidden one, so the "…" menu offers "Report"
 *   on approved comments alone) and a reporter other than the writer
 *   (one's own comment offers no "Report"). Text and note go through the
 *   form requests' PKPString::stripUnsafeHtml, as posted text does.
 * - galleys[] {label*, locale?, file | urlRemote} — galleys on the
 *   submission's current publication (U33), OJS and OPS only (OMP has
 *   publication formats, so the key is a 400 there): the same
 *   Repo::galley()->add() the "Galleys" page's "Add galley" › "Create New
 *   Galley" window runs (ArticleGalleyForm / PreprintGalleyForm::execute),
 *   followed by the grid handler's own notice recompute (updateGalley:
 *   NotificationManager::updateNotification of the app's galley notice
 *   types on a submission at Copyediting or Production), then, for `file`,
 *   the upload wizard "Upload a File Ready for Publication" step for step:
 *   the file service's add() into the submission's directory, a new
 *   SubmissionFile at SUBMISSION_FILE_PROOF hung on the galley
 *   (ASSOC_TYPE_REPRESENTATION, the app's submission-file repository links
 *   galley.submissionFileId), and the "Review Details" step's save
 *   (SubmissionFilesMetadataForm::execute + PKPManageFileApiHandler::
 *   saveMetadata's author-notification update and MetadataChanged event).
 *   `file` is a basename under apps/<app>/playwright/fixtures/files/,
 *   which bin/mount.js copies to classes/testing/fixtures/ in the checkout;
 *   the genre is the first the wizard's list offers (the context's first
 *   non-dependent genre, "Article Text"). `urlRemote` seeds the window's
 *   "Remotely hosted content" galley with no file (the wizard cancelled).
 * - files[] {file*, genre?, uploader?, note?} and reviewRounds[].files[]
 *   {file*, genre?} — submission files (U36), OJS and OMP only (a preprint
 *   server shows no workflow file list, so OPS refuses both). A root entry
 *   is a file on the Submission stage's "Submission Files" list. Uploaded
 *   by the submitter (the default), it is the submission wizard's "Files"
 *   panel upload, before the submit and as the submitter: the step for step
 *   of POST submissions/{id}/files (PKPSubmissionFileController::add:
 *   the file service's add, Repo::submissionFile()->validate and ->add at
 *   SUBMISSION_FILE_SUBMISSION, the name the uploaded file's own) and the
 *   panel's component choice (PUT submissions/{id}/files/{fileId}
 *   {genreId}: validate, ->edit). Uploaded by anyone else (a manager, the
 *   site admin, or a sub-editor or assistant seeded in participants[]), it
 *   is the workflow's "Upload" on "Submission Files" after the submit,
 *   acting as that user: the upload wizard's step 1
 *   (SubmissionFilesUploadForm::execute) and step 2
 *   (PKPManageFileApiHandler::saveMetadata), as galleys[] runs them. `note`
 *   is the file's "More Information" › "Notes" › "Add Note", posted by the
 *   acting editor (admin): NewFileNoteForm::execute and the handler's own
 *   notePosted event-log row (FileInformationCenterHandler::_logEvent). A
 *   round entry is the "Files for Review" list's "Upload/Select Files" ›
 *   "Upload Review File", acting as the editor, into the round before its
 *   reviewers are added, then that window's "OK" with the uploaded rows
 *   ticked (ManageReviewFilesForm::execute, which marks them viewable),
 *   and every seeded reviewer of the round is granted the round's
 *   files the way the Add Reviewer form's file list (all ticked by
 *   default, LimitReviewFilesGridHandler::isDataElementSelected) grants
 *   them (ReviewerForm::execute → ReviewFilesDAO::grant). `file` is a
 *   fixture basename, as for galleys[]; `genre` the name of one of the
 *   components the upload lists offer (enabled, not dependent), default
 *   the first main-work one ("Article Text", "Book Manuscript").
 *
 * The workflow start stage comes from each app's submission schema default —
 * never hard-coded here (a hard-coded initial stage once made every seeded
 * OPS submission invisible; PRINCIPLES D5).
 */

namespace PKP\testing;

use APP\core\Application;
use APP\facades\Repo;
use PKP\author\contributorRole\ContributorRole;
use PKP\author\contributorRole\ContributorRoleIdentifier;
use PKP\author\contributorRole\ContributorType;
use PKP\context\Context;
use PKP\controllers\grid\users\reviewer\form\traits\HasReviewDueDate;
use PKP\core\Core;
use PKP\core\Registry;
use PKP\db\DAORegistry;
use PKP\core\PKPString;
use PKP\file\FileManager;
use PKP\notification\Notification;
use PKP\observers\events\MetadataChanged;
use PKP\security\Role;
use PKP\stageAssignment\StageAssignment;
use PKP\submission\action\EditorAction;
use PKP\submission\reviewAssignment\ReviewAssignment;
use PKP\submission\reviewer\ReviewerAction;
use PKP\submission\reviewRound\ReviewRound;
use PKP\submission\reviewer\suggestion\ReviewerSuggestion;
use PKP\submissionFile\SubmissionFile;
use PKP\validation\MultilingualInput;
use PKP\validation\ValidatorFactory;
use PKP\testing\Spec;
use PKP\testing\SpecException;
use PKP\user\User;
use PKP\userComment\UserComment;
use PKP\userGroup\UserGroup;

abstract class PKPSubmissionScenarioBuilder
{
    use HasReviewDueDate;

    public const REVIEWER_STATUSES = ['invited', 'accepted', 'declined', 'completed'];

    /** Default "For author and editor" text of a completed seeded review. */
    public const DEFAULT_REVIEW_COMMENTS = 'Seeded review comments for {tag}.';

    /** Defaults of the two required boxes a reviewer suggestion may leave to the seed. */
    public const DEFAULT_SUGGESTION_AFFILIATION = 'Seeded affiliation for {tag}';
    public const DEFAULT_SUGGESTION_REASON = 'Seeded suggestion reason for {tag}.';

    /**
     * Read the app's section/series overlay keys off the root spec and return
     * the publication props they seed (e.g. ['sectionId' => …] OJS/OPS,
     * ['seriesId' => …, 'seriesPosition' => …] OMP). Parse-phase: no writes.
     */
    abstract protected function parsePublicationOverlay(Context $context, Spec $root): array;

    /**
     * App keys stored on the submission record itself at creation (OMP:
     * `workType` — the start form always posts one, so a wizard-created
     * submission never carries the bare column/schema state a direct
     * repository add leaves). Parse-phase: no writes.
     */
    protected function parseSubmissionOverlay(Context $context, Spec $root): array
    {
        return [];
    }

    /** The review stage a round spec seeds into (OMP reads its per-round overlay). */
    protected function reviewStageIdForRound(Spec $roundSpec): int
    {
        return WORKFLOW_STAGE_ID_EXTERNAL_REVIEW;
    }

    /** OPS overrides to reject review seeding outright. */
    protected function assertReviewRoundsSupported(Spec $root): void
    {
    }

    /** OPS overrides to reject reviewer suggestions (no API mount, no wizard step). */
    protected function assertReviewerSuggestionsSupported(Spec $root): void
    {
    }

    /** OMP overrides to reject galleys (a press has publication formats, no "Galleys" page). */
    protected function assertGalleysSupported(Spec $root): void
    {
    }

    /** OPS overrides to reject submission files (no workflow file list on a preprint server). */
    protected function assertFilesSupported(string $specKey): void
    {
    }

    /**
     * The notice types the upload wizard's "Review Details" save recomputes
     * for the authors (PKPManageFileApiHandler::getUpdateNotifications; OMP's
     * ManageFileApiHandler adds the internal-review one).
     */
    protected function fileMetadataNoticeTypes(): array
    {
        return [Notification::NOTIFICATION_TYPE_PENDING_EXTERNAL_REVISIONS];
    }

    /**
     * The notice types the app's galley grid recomputes after a galley is
     * saved (ArticleGalleyGridHandler::updateGalley passes the lib/pkp pair;
     * OPS's PreprintGalleyGridHandler passes "awaiting representations"
     * alone, since a preprint server never raises "assign a production user").
     */
    protected function galleyNoticeTypes(): array
    {
        return [
            Notification::NOTIFICATION_TYPE_ASSIGN_PRODUCTIONUSER,
            Notification::NOTIFICATION_TYPE_AWAITING_REPRESENTATIONS,
        ];
    }

    /** App hook before publish (OJS: issue assignment). Overlay parse happens here too. */
    protected function beforePublish(Context $context, \PKP\submission\PKPSubmission $submission, \PKP\publication\PKPPublication $publication, array $overlayPlan): void
    {
    }

    /** Parse app publish-overlay keys (OJS: issue). */
    protected function parsePublishOverlay(Context $context, Spec $root): array
    {
        return [];
    }

    public function build(array $data): array
    {
        $root = new Spec($data);

        // ---- Parse phase: read everything; unknown keys 400 before writes.
        $tag = (string) $root->require('tag');
        $contextPath = (string) $root->require('context');
        $context = Application::getContextDAO()->getByPath($contextPath);
        if (!$context) {
            throw new SpecException('context', "Unknown context urlPath \"{$contextPath}\"");
        }
        $locale = (string) $root->get('locale', $context->getPrimaryLocale());

        $submitterUsername = (string) $root->require('submitter');
        $submitter = Repo::user()->getByUsername($submitterUsername, true);
        if (!$submitter) {
            throw new SpecException('submitter', "Unknown submitter username \"{$submitterUsername}\"");
        }

        $title = $root->localized('title', $locale, "Submission {$tag}");
        // Default the abstract: the wizard requires one on abstract-requiring
        // sections, so a real completed submission always has it (parity
        // spot-check defect 3).
        $abstract = $root->localized('abstract', $locale, "Seeded abstract for {$tag}.");
        $submitted = (bool) $root->get('submitted', true);
        $published = (bool) $root->get('published', false);
        $publicationProps = $this->parsePublicationOverlay($context, $root);
        $submissionProps = $this->parseSubmissionOverlay($context, $root);

        $decisionNames = (array) $root->get('decisions', []);
        $decisionTypes = [];
        foreach ($decisionNames as $i => $name) {
            $decisionTypes[] = [$name, $this->resolveDecisionType((string) $name, "decisions.{$i}")];
        }

        if ($root->has('reviewRounds')) {
            $this->assertReviewRoundsSupported($root);
        }
        $roundPlans = [];
        foreach ($root->childList('reviewRounds') as $roundSpec) {
            $reviewers = [];
            foreach ($roundSpec->childList('reviewers') as $reviewerSpec) {
                $username = (string) $reviewerSpec->require('username');
                $status = (string) $reviewerSpec->get('status', 'invited');
                if (!in_array($status, self::REVIEWER_STATUSES)) {
                    throw new SpecException("{$reviewerSpec->path}.status", 'Reviewer status must be one of: ' . implode(', ', self::REVIEWER_STATUSES));
                }
                $reviewer = Repo::user()->getByUsername($username, true);
                if (!$reviewer) {
                    throw new SpecException("{$reviewerSpec->path}.username", "Unknown reviewer username \"{$username}\"");
                }
                $reviewFormId = $reviewerSpec->has('reviewForm')
                    ? $this->resolveActiveReviewFormId($context, (string) $reviewerSpec->get('reviewForm'), "{$reviewerSpec->path}.reviewForm")
                    : null;
                // Step-3 inputs of a completed review: the "Recommendation"
                // list (OJS only — a press's step 3 has no such field) and
                // the "For author and editor" box. Meaningless on any other
                // status, so a 400 rather than a silently dropped key.
                foreach (['recommendation', 'comments'] as $step3Key) {
                    if ($reviewerSpec->has($step3Key) && $status !== 'completed') {
                        throw new SpecException("{$reviewerSpec->path}.{$step3Key}", "\"{$step3Key}\" applies to status \"completed\" only");
                    }
                }
                $recommendationId = null;
                if ($status === 'completed' && Application::get()->hasCustomizableReviewerRecommendation()) {
                    $recommendationId = $this->resolveRecommendationId($context, (string) $reviewerSpec->get('recommendation', 'accept'), "{$reviewerSpec->path}.recommendation");
                } elseif ($reviewerSpec->has('recommendation')) {
                    throw new SpecException("{$reviewerSpec->path}.recommendation", 'This app\'s reviewer wizard has no "Recommendation" field');
                }
                // Step 3's box is a TinyMCE editor, which posts a paragraph
                // ("<p>…</p>") for plain typed text: wrap a bare string the
                // same way; a string that already carries markup is kept.
                $comments = null;
                if ($status === 'completed') {
                    $comments = (string) $reviewerSpec->get('comments', str_replace('{tag}', $tag, self::DEFAULT_REVIEW_COMMENTS));
                    if ($comments !== '' && !str_starts_with(ltrim($comments), '<')) {
                        $comments = "<p>{$comments}</p>";
                    }
                }
                $reviewers[] = [
                    'user' => $reviewer,
                    'status' => $status,
                    'reviewFormId' => $reviewFormId,
                    'recommendationId' => $recommendationId,
                    'comments' => $comments,
                ];
            }
            $roundFiles = [];
            if ($roundSpec->has('files')) {
                $this->assertFilesSupported("{$roundSpec->path}.files");
                foreach ($roundSpec->childList('files') as $fileSpec) {
                    $roundFiles[] = [
                        'fixture' => $this->resolveFixture((string) $fileSpec->require('file'), "{$fileSpec->path}.file"),
                        'genreId' => $this->resolveUploadGenreId($context, $fileSpec),
                    ];
                }
            }
            $roundPlans[] = [
                'stageId' => $this->reviewStageIdForRound($roundSpec),
                'reviewers' => $reviewers,
                'files' => $roundFiles,
            ];
        }

        $participantPlans = [];
        if ($root->has('participants')) {
            $userSeeder = new UserSeeder();
            foreach ($root->childList('participants') as $participantSpec) {
                $username = (string) $participantSpec->require('username');
                $roleKey = (string) $participantSpec->require('role');
                $participant = Repo::user()->getByUsername($username, true);
                if (!$participant) {
                    throw new SpecException("{$participantSpec->path}.username", "Unknown participant username \"{$username}\"");
                }
                $userGroup = $userSeeder->resolveUserGroup($context, $roleKey, "{$participantSpec->path}.role");
                // The "Assign Participant" window's two boxes (U35). Each
                // starts from the role's own setting (the window's script
                // pre-ticks them from the Roles screen), so an absent key
                // keeps that default. "Assignment privileges" (recommend
                // only) is offered for manager- and sub-editor-level roles
                // alone (AddParticipantForm::initialize); "Permissions" for
                // every role but a manager-level one, whose assignment
                // always carries the permission (AddParticipantForm::execute
                // forces it). A value the window cannot post is a 400.
                $recommendOnly = (bool) $userGroup->recommendOnly;
                if ($participantSpec->has('recommendOnly')) {
                    $value = $participantSpec->get('recommendOnly');
                    if (!is_bool($value)) {
                        throw new SpecException("{$participantSpec->path}.recommendOnly", 'recommendOnly must be a boolean (the "Assignment privileges" box)');
                    }
                    if ($value && !in_array((int) $userGroup->roleId, [Role::ROLE_ID_MANAGER, Role::ROLE_ID_SUB_EDITOR], true)) {
                        throw new SpecException("{$participantSpec->path}.recommendOnly", "The \"Assign Participant\" window offers \"Assignment privileges\" for editor roles only, not for \"{$roleKey}\"");
                    }
                    $recommendOnly = $value;
                }
                $canChangeMetadata = (bool) $userGroup->permitMetadataEdit;
                if ($participantSpec->has('canChangeMetadata')) {
                    $value = $participantSpec->get('canChangeMetadata');
                    if (!is_bool($value)) {
                        throw new SpecException("{$participantSpec->path}.canChangeMetadata", 'canChangeMetadata must be a boolean (the "Permissions" box)');
                    }
                    if (!$value && (int) $userGroup->roleId === Role::ROLE_ID_MANAGER) {
                        throw new SpecException("{$participantSpec->path}.canChangeMetadata", "An assignment in the manager-level role \"{$roleKey}\" always carries the metadata permission (the window offers no \"Permissions\" box for it)");
                    }
                    $canChangeMetadata = $value;
                }
                $participantPlans[] = [
                    'user' => $participant,
                    'userGroup' => $userGroup,
                    'recommendOnly' => $recommendOnly,
                    'canChangeMetadata' => $canChangeMetadata,
                ];
            }
        }

        $authorPlan = null;
        if (($authorSpec = $root->child('author')) !== null) {
            $authorPlan = [
                'orcid' => (string) $authorSpec->require('orcid'),
                'orcidIsVerified' => (bool) $authorSpec->get('orcidIsVerified', false),
            ];
        }

        $suggestionPlans = [];
        if ($root->has('reviewerSuggestions')) {
            $this->assertReviewerSuggestionsSupported($root);
            $suggestionPlans = $this->parseReviewerSuggestions($context, $root, $tag);
        }

        $publishOverlayPlan = $this->parsePublishOverlay($context, $root);
        $commentPlans = $this->parseUserComments($root, $published);
        $galleyPlans = $this->parseGalleys($context, $root, $locale);
        $filePlans = $this->parseFiles($context, $root, $submitter, $submitted, $participantPlans);
        $root->assertConsumed();

        if ($published && !$submitted) {
            throw new SpecException('published', 'published: true requires a submitted submission');
        }

        // ---- Execute phase.
        $request = Application::get()->getRequest();

        // The seeding request is site-wide, but the services and listeners the
        // build invokes (notification managers, mailables) read
        // $request->getContext(). Force the router's context to the
        // submission's context for the duration of the build.
        $restoreRouterContext = ContextFactory::forceRequestContext($context);
        try {
            return $this->execute($root, $context, $locale, $tag, $submitter, $title, $abstract, $submitted, $published, $submissionProps, $publicationProps, $decisionTypes, $roundPlans, $publishOverlayPlan, $authorPlan, $participantPlans, $suggestionPlans, $commentPlans, $galleyPlans, $filePlans);
        } finally {
            $restoreRouterContext();
        }
    }

    private function execute(
        Spec $root,
        Context $context,
        string $locale,
        string $tag,
        User $submitter,
        array $title,
        ?array $abstract,
        bool $submitted,
        bool $published,
        array $submissionProps,
        array $publicationProps,
        array $decisionTypes,
        array $roundPlans,
        array $publishOverlayPlan,
        ?array $authorPlan = null,
        array $participantPlans = [],
        array $suggestionPlans = [],
        array $commentPlans = [],
        array $galleyPlans = [],
        array $filePlans = []
    ): array {
        $request = Application::get()->getRequest();
        $seededSuggestions = [];
        $seededComments = [];
        $seededGalleys = [];
        $seededFiles = [];

        // Create + (maybe) submit as the submitter — wizard parity.
        $previousActingUser = Registry::get('user');
        Registry::set('user', $submitter);
        try {
            $submitAsUserGroup = $this->resolveSubmitAsUserGroup($context, $submitter);

            $submissionParams = array_merge(
                ['contextId' => $context->getId(), 'locale' => $locale],
                $submissionProps
            );
            $submission = Repo::submission()->newDataObject($submissionParams);
            $publication = Repo::publication()->newDataObject($publicationProps);
            $submissionId = Repo::submission()->add($submission, $publication, $context);
            $submission = Repo::submission()->get($submissionId);
            $publication = Repo::publication()->get($submission->getData('currentPublicationId'));

            Repo::stageAssignment()->build(
                $submission->getId(),
                $submitAsUserGroup->id,
                $submitter->getId(),
                $submitAsUserGroup->recommendOnly,
                $submission->getData('submissionProgress') ? true : $submitAsUserGroup->permitMetadataEdit
            );

            if ((int) $submitAsUserGroup->roleId === Role::ROLE_ID_AUTHOR) {
                $author = Repo::author()->newAuthorFromUser($submitter, $submission, $context);
                $author->setData('publicationId', $publication->getId());
                // Contributor types and roles are absent on the stable-3_5_0 line.
                if (class_exists(ContributorType::class)) {
                    $author->setData('contributorType', ContributorType::PERSON->getName());
                    $author->setContributorRoles(
                        ContributorRole::query()
                            ->withContextId($context->getId())
                            ->withIdentifier(ContributorRoleIdentifier::AUTHOR->getName())
                            ->limit(1)
                            ->get()
                            ->all()
                    );
                }
                $authorId = Repo::author()->add($author);
                Repo::publication()->edit($publication, ['primaryContactId' => $authorId]);

                if ($authorPlan !== null) {
                    // The author_settings rows the OAuth verify landing
                    // stores (orcid, orcidIsVerified, and for a verified iD
                    // the access token, scope, refresh token and expiry),
                    // written through the real author repository.
                    Repo::author()->edit(
                        Repo::author()->get($authorId),
                        UserSeeder::orcidOAuthData($context, $authorPlan['orcid'], $authorPlan['orcidIsVerified'], $tag)
                    );
                    $authorPlan = null;
                }
            }

            if ($authorPlan !== null) {
                throw new SpecException('author', 'author requires the submitter to submit as an Author (no contributor record was created)');
            }

            $publicationEdits = ['title' => $title];
            if ($abstract !== null) {
                $publicationEdits['abstract'] = $abstract;
            }
            // Re-fetch: editing through the pre-primaryContact object would
            // write its stale data back and erase primaryContactId (parity
            // spot-check defect 1).
            $publication = Repo::publication()->get($publication->getId());
            Repo::publication()->edit($publication, $publicationEdits);

            // The wizard's "Reviewer Suggestions" step, while the submission
            // is still incomplete: the same ReviewerSuggestion::create() the
            // step's window runs (ReviewerSuggestionController::add), with
            // the request's own suggestingUserId (the acting author) and
            // submissionId merged in as prepareForValidation does.
            foreach ($suggestionPlans as $plan) {
                $suggestion = ReviewerSuggestion::create(array_merge($plan, [
                    'submissionId' => $submissionId,
                    'suggestingUserId' => $submitter->getId(),
                ]));
                $suggestion->refresh();
                $seededSuggestions[] = [
                    'id' => (int) $suggestion->getKey(),
                    'email' => $suggestion->email,
                ];
            }

            // The wizard's "Files" panel, as the submitter, before submit.
            foreach ($filePlans as $i => $plan) {
                if ($plan['byWizard']) {
                    $filePlans[$i]['submissionFileId'] = $this->uploadThroughSubmissionWizard($context, $submissionId, $submitter, $plan['fixture'], $plan['genreId']);
                }
            }

            if ($submitted) {
                $submission = Repo::submission()->get($submissionId);
                Repo::submission()->submit($submission, $context);

                // The real submit endpoint's tail: create the unpublished-state
                // notifications (APPROVE_SUBMISSION and its app delegates) the
                // workflow's approval UI runs on (parity spot-check defect 2).
                $notificationManagerClass = '\APP\notification\NotificationManager';
                $notificationManager = new $notificationManagerClass();
                $notificationManager->updateNotification(
                    $request,
                    [\PKP\notification\Notification::NOTIFICATION_TYPE_APPROVE_SUBMISSION],
                    null,
                    \PKP\core\PKPApplication::ASSOC_TYPE_SUBMISSION,
                    $submissionId
                );
            }
        } finally {
            Registry::set('user', $previousActingUser);
        }

        // Non-submitter participants: the same stage-assignment row the
        // workflow's Assign Participant form writes (its two boxes, which
        // start from the role's recommendOnly / permitMetadataEdit; no
        // email or notification — recorded parity deviation).
        foreach ($participantPlans as $plan) {
            Repo::stageAssignment()->build(
                $submissionId,
                $plan['userGroup']->id,
                $plan['user']->getId(),
                $plan['recommendOnly'],
                $plan['canChangeMetadata']
            );
        }

        // "Submission Files" › "Upload" by the team, after the submit and
        // before any decision (the Submission stage's list), then each
        // file's "More Information" › "Add Note", by the acting editor.
        $editor = $this->actingEditor();
        foreach ($filePlans as $i => $plan) {
            if (!$plan['byWizard']) {
                $filePlans[$i]['submissionFileId'] = $this->uploadThroughWizard(
                    $context,
                    $submissionId,
                    $plan['uploader'],
                    $plan['fixture'],
                    SubmissionFile::SUBMISSION_FILE_SUBMISSION,
                    null,
                    null,
                    $plan['genreId']
                );
            }
        }
        foreach ($filePlans as $plan) {
            if ($plan['note'] !== null) {
                $this->addFileNote($plan['submissionFileId'], $plan['note'], $editor);
            }
            $seededFiles[] = [
                'submissionFileId' => $plan['submissionFileId'],
                'file' => $plan['fixture']['file'],
                'fileStage' => SubmissionFile::SUBMISSION_FILE_SUBMISSION,
                'reviewRoundId' => null,
                'uploader' => $plan['uploader']->getUsername(),
            ];
        }

        // Decisions + review rounds, acting as the editor (admin).
        $reviewRoundDao = DAORegistry::getDAO('ReviewRoundDAO'); /** @var \PKP\submission\reviewRound\ReviewRoundDAO $reviewRoundDao */
        $roundIndex = 0;
        $seededAssignments = [];

        $previousActingUser = Registry::get('user');
        Registry::set('user', $editor);
        try {
            foreach ($decisionTypes as [$name, $decisionType]) {
                $submission = Repo::submission()->get($submissionId);
                $decision = Repo::decision()->newDataObject();
                $decision->setData('decision', $decisionType->getDecision());
                $decision->setData('submissionId', $submissionId);
                $decision->setData('editorId', $editor->getId());
                $decision->setData('stageId', $decisionType->getStageId());
                if (in_array($decisionType->getStageId(), [WORKFLOW_STAGE_ID_INTERNAL_REVIEW, WORKFLOW_STAGE_ID_EXTERNAL_REVIEW])) {
                    $lastRound = $reviewRoundDao->getLastReviewRoundBySubmissionId($submissionId, $decisionType->getStageId());
                    if ($lastRound) {
                        $decision->setData('reviewRoundId', $lastRound->getId());
                    }
                }
                Repo::decision()->add($decision);

                // A decision that promotes into a review stage creates that
                // round — seed the next declared round spec into it.
                $newStageId = $decisionType->getNewStageId(Repo::submission()->get($submissionId), null);
                if (in_array($newStageId, [WORKFLOW_STAGE_ID_INTERNAL_REVIEW, WORKFLOW_STAGE_ID_EXTERNAL_REVIEW]) && $roundIndex < count($roundPlans)) {
                    $round = $reviewRoundDao->getLastReviewRoundBySubmissionId($submissionId, $newStageId);
                    if ($round) {
                        $seededFiles = array_merge($seededFiles, $this->seedRoundFiles($context, $submissionId, $round, $roundPlans[$roundIndex]['files'], $editor));
                        $seededAssignments = array_merge(
                            $seededAssignments,
                            $this->seedRoundReviewers($context, $submissionId, $round, $roundPlans[$roundIndex]['reviewers'])
                        );
                        $roundIndex++;
                    }
                }
            }

            // Remaining declared rounds (no decision created them): build the
            // round with the same shape the real decision path produces —
            // mirrored from DecisionType::createReviewRound (DecisionType.php
            // ~511-541): PENDING_REVIEWERS status, the latest UNPUBLISHED
            // publication id (getLatestUnPublishedPublicationId, ~556-562),
            // and the REVIEW_ROUND_STATUS notification row the workflow's
            // round header runs on.
            while ($roundIndex < count($roundPlans)) {
                $plan = $roundPlans[$roundIndex];
                $submission = Repo::submission()->get($submissionId);
                $lastRound = $reviewRoundDao->getLastReviewRoundBySubmissionId($submissionId, $plan['stageId']);
                $roundNumber = $lastRound ? $lastRound->getRound() + 1 : 1;
                $publicationId = $submission->getData('publications')
                    ->filter(fn ($publication) => $publication->getData('status') !== \PKP\publication\PKPPublication::STATUS_PUBLISHED)
                    ->reduce(fn ($a, $b) => $a && $a->getId() > $b->getId() ? $a : $b)
                    ?->getId();
                $round = $reviewRoundDao->build(
                    $submissionId,
                    $publicationId,
                    $plan['stageId'],
                    $roundNumber,
                    ReviewRound::REVIEW_ROUND_STATUS_PENDING_REVIEWERS
                );
                $notificationCount = Notification::withAssoc(Application::ASSOC_TYPE_REVIEW_ROUND, $round->getId())
                    ->withType(Notification::NOTIFICATION_TYPE_REVIEW_ROUND_STATUS)
                    ->withContextId($submission->getData('contextId'))
                    ->count();
                if ($notificationCount == 0) {
                    $notificationMgr = new \APP\notification\NotificationManager();
                    $notificationMgr->createNotification(
                        null,
                        Notification::NOTIFICATION_TYPE_REVIEW_ROUND_STATUS,
                        $submission->getData('contextId'),
                        Application::ASSOC_TYPE_REVIEW_ROUND,
                        $round->getId()
                    );
                }
                $seededFiles = array_merge($seededFiles, $this->seedRoundFiles($context, $submissionId, $round, $plan['files'], $editor));
                $seededAssignments = array_merge(
                    $seededAssignments,
                    $this->seedRoundReviewers($context, $submissionId, $round, $plan['reviewers'])
                );
                $roundIndex++;
            }

            // Galleys on the current publication, added the way the "Galleys"
            // page adds them, before a publish: an editor builds the galleys
            // and then publishes, so a published seed carries them published.
            if ($galleyPlans !== []) {
                $seededGalleys = $this->seedGalleys($context, $submissionId, $galleyPlans, $editor);
            }

            if ($published) {
                $submission = Repo::submission()->get($submissionId);
                $publication = Repo::publication()->get($submission->getData('currentPublicationId'));
                $this->beforePublish($context, $submission, $publication, $publishOverlayPlan);
                $publication = Repo::publication()->get($publication->getId());

                // The real publish endpoint validates before publishing
                // (PKPSubmissionController::publishPublication ~1413-1424):
                // a seed the UI would refuse must fail loudly, not publish
                // an impossible state.
                $primaryLocale = $submission->getData('locale');
                $allowedLocales = $context->getData('supportedSubmissionLocales');
                $errors = Repo::publication()->validatePublish($publication, $submission, (array) $allowedLocales, $primaryLocale);
                if (!empty($errors)) {
                    throw new SpecException('published', 'The publish endpoint would refuse this publication: ' . json_encode($errors));
                }

                // Mirrored from PKPSubmissionController::publishPublication:
                // publish without status stamping, then re-derive submission
                // status/current publication off a fresh fetch. The
                // controller's sweep of author stage assignments to
                // canChangeMetadata = 0 was removed upstream by
                // pkp/pkp-lib#13109 (lib/pkp 18f402e585, in every app since
                // 2026-09-08), so the seed no longer mirrors it: an Author's
                // permission survives a seeded publish exactly as it survives
                // a screen publish.
                Repo::publication()->publish($publication, false);

                $submission = Repo::submission()->get($submission->getId());
                Repo::submission()->updateStatus($submission);
                Repo::submission()->updateCurrentPublication($submission);
            }

            if ($commentPlans !== []) {
                $submission = Repo::submission()->get($submissionId);
                $seededComments = $this->seedUserComments(
                    $context,
                    (int) $submission->getData('currentPublicationId'),
                    $commentPlans,
                    $editor
                );
            }
        } finally {
            Registry::set('user', $previousActingUser);
        }

        // ---- Response.
        $submission = Repo::submission()->get($submissionId);
        $rounds = [];
        $roundsIterator = $reviewRoundDao->getBySubmissionId($submissionId);
        while ($round = $roundsIterator->next()) {
            $rounds[] = ['id' => $round->getId(), 'round' => $round->getRound(), 'stageId' => $round->getStageId()];
        }

        return [
            'tag' => $tag,
            'submissionId' => $submissionId,
            'publicationId' => $submission->getData('currentPublicationId'),
            'stageId' => $submission->getData('stageId'),
            'status' => $submission->getData('status'),
            'submissionProgress' => $submission->getData('submissionProgress'),
            'reviewRounds' => $rounds,
            'reviewAssignments' => $seededAssignments,
            'reviewerSuggestions' => $seededSuggestions,
            'userComments' => $seededComments,
            'galleys' => $seededGalleys,
            'files' => $seededFiles,
        ];
    }

    /**
     * Read galleys[] (U33): each entry a galley on the submission's current
     * publication, as the "Galleys" page's "Create New Galley" window and
     * the upload wizard it opens create one. Parse-phase: no writes. The
     * window's refusals are the seed's: a label is required, the language
     * must be one the window's list offers (the context's submission
     * locales and the submission's own), and the entry names exactly one
     * of `file` (a basename under apps/<app>/playwright/fixtures/files/,
     * mounted at classes/testing/fixtures/) or `urlRemote`.
     *
     * @return array<int, array{label: string, locale: string, file: ?string, path: ?string, urlRemote: ?string}>
     */
    protected function parseGalleys(Context $context, Spec $root, string $submissionLocale): array
    {
        if (!$root->has('galleys')) {
            return [];
        }
        $this->assertGalleysSupported($root);
        $offeredLocales = array_unique(array_merge([$submissionLocale], (array) $context->getSupportedSubmissionLocales()));
        $plans = [];
        foreach ($root->childList('galleys') as $spec) {
            $label = $spec->require('label');
            if (!is_string($label) || trim($label) === '') {
                throw new SpecException("{$spec->path}.label", 'label must be a non-empty string (the "Create New Galley" window requires a label)');
            }
            $locale = (string) $spec->get('locale', $submissionLocale);
            if (!in_array($locale, $offeredLocales, true)) {
                throw new SpecException("{$spec->path}.locale", 'locale must be one the "Create New Galley" window\'s language list offers: ' . implode(', ', $offeredLocales));
            }
            $hasFile = $spec->has('file');
            $hasRemote = $spec->has('urlRemote');
            if ($hasFile === $hasRemote) {
                throw new SpecException($spec->path, 'A galley names exactly one of "file" (a fixture basename) or "urlRemote"');
            }
            $file = null;
            $path = null;
            $urlRemote = null;
            if ($hasFile) {
                ['file' => $file, 'path' => $path] = $this->resolveFixture((string) $spec->get('file'), "{$spec->path}.file");
            } else {
                $urlRemote = (string) $spec->get('urlRemote');
                if (trim($urlRemote) === '') {
                    throw new SpecException("{$spec->path}.urlRemote", 'urlRemote must be a non-empty string');
                }
            }
            $plans[] = ['label' => $label, 'locale' => $locale, 'file' => $file, 'path' => $path, 'urlRemote' => $urlRemote];
        }
        return $plans;
    }

    /**
     * Seed the parsed galleys the way the "Galleys" page does, acting as
     * the editor: ArticleGalleyForm / PreprintGalleyForm::execute
     * (Repo::galley()->add), the grid handler's updateGalley notice
     * recompute, then for a file the wizard's SubmissionFilesUploadForm::
     * execute (file service add + Repo::submissionFile()->add at the proof
     * stage on the galley; the app repository links the galley's
     * submissionFileId) and the "Review Details" save
     * (SubmissionFilesMetadataForm::execute → Repo::submissionFile()->edit,
     * PKPManageFileApiHandler::saveMetadata's author-notification update and
     * MetadataChanged event).
     *
     * @return array<int, array{id: int, label: string, submissionFileId: ?int}>
     */
    protected function seedGalleys(Context $context, int $submissionId, array $plans, User $editor): array
    {
        $request = Application::get()->getRequest();
        $seeded = [];
        foreach ($plans as $plan) {
            $submission = Repo::submission()->get($submissionId);
            $publication = Repo::publication()->get($submission->getData('currentPublicationId'));

            // "Create New Galley" › Save (ArticleGalleyForm::execute).
            $galleyId = Repo::galley()->add(Repo::galley()->newDataObject([
                'publicationId' => $publication->getId(),
                'label' => $plan['label'],
                'locale' => $plan['locale'],
                'urlPath' => null,
                'urlRemote' => $plan['urlRemote'],
            ]));

            // ArticleGalleyGridHandler::updateGalley's tail.
            if (in_array((int) $submission->getData('stageId'), [WORKFLOW_STAGE_ID_EDITING, WORKFLOW_STAGE_ID_PRODUCTION], true)) {
                $notificationMgr = new \APP\notification\NotificationManager();
                $notificationMgr->updateNotification(
                    $request,
                    $this->galleyNoticeTypes(),
                    null,
                    Application::ASSOC_TYPE_SUBMISSION,
                    $submissionId
                );
            }

            $submissionFileId = null;
            if ($plan['path'] !== null) {
                // "Upload a File Ready for Publication": the upload wizard.
                $submissionFileId = $this->uploadThroughWizard(
                    $context,
                    $submissionId,
                    $editor,
                    ['file' => $plan['file'], 'path' => $plan['path']],
                    SubmissionFile::SUBMISSION_FILE_PROOF,
                    Application::ASSOC_TYPE_REPRESENTATION,
                    $galleyId,
                    $this->defaultGalleyGenreId($context)
                );
            }

            $seeded[] = [
                'id' => $galleyId,
                'label' => $plan['label'],
                'submissionFileId' => $submissionFileId,
            ];
        }
        return $seeded;
    }

    /**
     * A fixture basename under apps/<app>/playwright/fixtures/files/, which
     * bin/mount.js copies to classes/testing/fixtures/ in the checkout.
     *
     * @return array{file: string, path: string}
     */
    protected function resolveFixture(string $file, string $specKey): array
    {
        $fixtureDir = Core::getBaseDir() . '/classes/testing/fixtures';
        if ($file === '' || $file !== basename($file)) {
            throw new SpecException($specKey, 'file is a basename under apps/<app>/playwright/fixtures/files/, no directory part');
        }
        $path = "{$fixtureDir}/{$file}";
        if (!is_file($path)) {
            throw new SpecException($specKey, "No fixture \"{$file}\" under {$fixtureDir} (bin/mount.js copies apps/<app>/playwright/fixtures/files/ there; re-run npm run mount)");
        }
        return ['file' => $file, 'path' => $path];
    }

    /**
     * The upload wizard (FileUploadWizardHandler), acting as the uploader:
     * step 1 "Upload File" (SubmissionFilesUploadForm::execute: the file
     * service's add into the submission's directory, a new SubmissionFile
     * named after the uploaded file, of the chosen component, on the list's
     * file stage and assoc — a review round is the wizard's reviewRoundId)
     * and step 2 "Review Details" › Continue
     * (PKPManageFileApiHandler::saveMetadata: SubmissionFilesMetadataForm::
     * execute → Repo::submissionFile()->edit with the name and the empty
     * artwork and supplementary boxes, the authors' notice recompute and the
     * MetadataChanged event; its "revisions requested" clean-up needs a
     * review round the handler never authorizes, so it never runs). Step 3
     * writes nothing.
     *
     * @param array{file: string, path: string} $fixture
     */
    protected function uploadThroughWizard(Context $context, int $submissionId, User $uploader, array $fixture, int $fileStage, ?int $assocType, ?int $assocId, int $genreId): int
    {
        $request = Application::get()->getRequest();
        $previousActingUser = Registry::get('user');
        Registry::set('user', $uploader);
        try {
            $submission = Repo::submission()->get($submissionId);
            $fileManager = new FileManager();
            $extension = $fileManager->parseFileExtension($fixture['file']);
            $submissionDir = Repo::submissionFile()->getSubmissionDir($context->getId(), $submissionId);
            $fileId = app()->get('file')->add($fixture['path'], $submissionDir . '/' . uniqid() . '.' . $extension);

            $submissionFile = Repo::submissionFile()->dao->newDataObject();
            $submissionFile->setData('fileId', $fileId);
            $submissionFile->setData('fileStage', $fileStage);
            $submissionFile->setData('name', $fixture['file'], $submission->getData('locale'));
            $submissionFile->setData('submissionId', $submissionId);
            $submissionFile->setData('uploaderUserId', $uploader->getId());
            $submissionFile->setData('assocType', $assocType);
            $submissionFile->setData('assocId', $assocId);
            $submissionFile->setData('genreId', $genreId);
            $submissionFileId = Repo::submissionFile()->add($submissionFile);

            $submissionFile = Repo::submissionFile()->get($submissionFileId);
            Repo::submissionFile()->edit($submissionFile, [
                'name' => [$submission->getData('locale') => $fixture['file']],
                'caption' => null,
                'credit' => null,
                'copyrightOwner' => null,
                'terms' => null,
                'subject' => null,
                'creator' => null,
                'description' => null,
                'publisher' => null,
                'sponsor' => null,
                'source' => null,
                'language' => null,
                'dateCreated' => null,
            ]);
            $submitterAssignments = StageAssignment::withSubmissionIds([$submissionId])
                ->withRoleIds([Role::ROLE_ID_AUTHOR])
                ->get();
            $notificationMgr = new \APP\notification\NotificationManager();
            $notificationMgr->updateNotification(
                $request,
                $this->fileMetadataNoticeTypes(),
                $submitterAssignments->pluck('user_id')->all(),
                Application::ASSOC_TYPE_SUBMISSION,
                $submissionId
            );
            event(new MetadataChanged(Repo::submission()->get($submissionId)));
            return $submissionFileId;
        } finally {
            Registry::set('user', $previousActingUser);
        }
    }

    /**
     * The submission wizard's "Files" panel, acting as the submitter (the
     * caller's acting user): the upload is POST submissions/{id}/files
     * (PKPSubmissionFileController::add, step for step: the file service's
     * add, the name the uploaded file's own, the lone-genre default, the
     * repository's validate against the context's submission metadata
     * locales, then add), and the panel's component choice is PUT
     * submissions/{id}/files/{fileId} {genreId}
     * (PKPSubmissionFileController::edit: validate, then edit).
     *
     * @param array{file: string, path: string} $fixture
     */
    protected function uploadThroughSubmissionWizard(Context $context, int $submissionId, User $submitter, array $fixture, int $genreId): int
    {
        $submission = Repo::submission()->get($submissionId);
        $submissionLocale = $submission->getData('locale');
        $allowedLocales = $context->getSupportedSubmissionMetadataLocales();

        $fileManager = new FileManager();
        $extension = $fileManager->parseFileExtension($fixture['file']);
        $submissionDir = Repo::submissionFile()->getSubmissionDir($context->getId(), $submissionId);
        $fileId = app()->get('file')->add($fixture['path'], $submissionDir . '/' . uniqid() . '.' . $extension);

        $params = [
            'fileStage' => SubmissionFile::SUBMISSION_FILE_SUBMISSION,
            'fileId' => $fileId,
            'submissionId' => $submissionId,
            'uploaderUserId' => (int) $submitter->getId(),
            'name' => [$submissionLocale => $fixture['file']],
        ];
        $genreDao = DAORegistry::getDAO('GenreDAO'); /** @var \PKP\submission\GenreDAO $genreDao */
        $genres = $genreDao->getEnabledByContextId($context->getId());
        [$firstGenre, $secondGenre] = [$genres->next(), $genres->next()];
        if ($firstGenre && !$secondGenre) {
            $params['genreId'] = $firstGenre->getId();
        }
        $errors = Repo::submissionFile()->validate(null, $params, $allowedLocales, $submissionLocale);
        if (!empty($errors)) {
            app()->get('file')->delete($fileId);
            throw new SpecException('files', 'The "Files" panel\'s upload would be refused: ' . json_encode($errors));
        }
        $submissionFileId = Repo::submissionFile()->add(Repo::submissionFile()->newDataObject($params));

        if ((int) ($params['genreId'] ?? 0) !== $genreId) {
            $submissionFile = Repo::submissionFile()->get($submissionFileId);
            $edit = ['genreId' => $genreId];
            $errors = Repo::submissionFile()->validate($submissionFile, $edit, $allowedLocales, $submissionLocale);
            if (!empty($errors)) {
                throw new SpecException('files', 'The "Files" panel\'s component choice would be refused: ' . json_encode($errors));
            }
            Repo::submissionFile()->edit($submissionFile, $edit);
        }
        return $submissionFileId;
    }

    /**
     * Upload the parsed round files into the round, acting as the editor,
     * the way "Files for Review" › "Upload/Select Files" › "Upload Review
     * File" does: the upload wizard on the stage's review-file stage with
     * the round as its assoc (the submission-file DAO writes the
     * review_round_files row), then the window's "OK" over the ticked rows.
     *
     * @return array<int, array{submissionFileId: int, file: string, fileStage: int, reviewRoundId: int, uploader: string}>
     */
    protected function seedRoundFiles(Context $context, int $submissionId, ReviewRound $round, array $plans, User $editor): array
    {
        $fileStage = (int) $round->getStageId() === WORKFLOW_STAGE_ID_INTERNAL_REVIEW
            ? SubmissionFile::SUBMISSION_FILE_INTERNAL_REVIEW_FILE
            : SubmissionFile::SUBMISSION_FILE_REVIEW_FILE;
        $seeded = [];
        foreach ($plans as $plan) {
            $submissionFileId = $this->uploadThroughWizard(
                $context,
                $submissionId,
                $editor,
                $plan['fixture'],
                $fileStage,
                Application::ASSOC_TYPE_REVIEW_ROUND,
                $round->getId(),
                $plan['genreId']
            );
            $seeded[] = [
                'submissionFileId' => $submissionFileId,
                'file' => $plan['fixture']['file'],
                'fileStage' => $fileStage,
                'reviewRoundId' => (int) $round->getId(),
                'uploader' => $editor->getUsername(),
            ];
        }
        if ($seeded !== []) {
            // The window's "OK" with every uploaded row ticked (an upload
            // lands unticked, so the user ticks it): ManageReviewFilesForm::
            // execute over the grid's rows, the round's review files, which
            // marks each viewable (a Repo edit and its fileEdited rows).
            $roundFiles = Repo::submissionFile()
                ->getCollector()
                ->filterBySubmissionIds([$submissionId])
                ->filterByReviewRoundIds([$round->getId()])
                ->filterByFileStages([$fileStage])
                ->getMany();
            $stageSubmissionFiles = [];
            foreach ($roundFiles as $roundFile) {
                $stageSubmissionFiles[$roundFile->getId()] = ['submissionFile' => $roundFile];
            }
            $previousActingUser = Registry::get('user');
            Registry::set('user', $editor);
            try {
                $form = new \PKP\controllers\grid\files\review\form\ManageReviewFilesForm($submissionId, $round->getStageId(), $round->getId());
                $form->setData('selectedFiles', array_keys($stageSubmissionFiles));
                $form->execute($stageSubmissionFiles);
            } finally {
                Registry::set('user', $previousActingUser);
            }
        }
        return $seeded;
    }

    /**
     * "More Information" › "Notes" › "Add Note" on a file, acting as the
     * writer: FileInformationCenterHandler::saveNote's NewFileNoteForm::
     * execute (the note row, the textarea's text as typed) and its
     * notePosted event-log row (the handler's own _logEvent). Not mirrored:
     * the "Note posted." toast for the acting user.
     */
    protected function addFileNote(int $submissionFileId, string $text, User $writer): void
    {
        $request = Application::get()->getRequest();
        $previousActingUser = Registry::get('user');
        Registry::set('user', $writer);
        try {
            $form = new \PKP\controllers\informationCenter\form\NewFileNoteForm($submissionFileId);
            $form->setData('newNote', $text);
            $form->execute();
            $handler = new \PKP\controllers\informationCenter\FileInformationCenterHandler();
            $handler->_logEvent(
                $request,
                Repo::submissionFile()->get($submissionFileId),
                \PKP\log\event\EventLogEntry::SUBMISSION_LOG_NOTE_POSTED,
                Application::ASSOC_TYPE_SUBMISSION_FILE
            );
        } finally {
            Registry::set('user', $previousActingUser);
        }
    }

    /**
     * Read files[] (U36): files on the "Submission Files" list. Parse-phase:
     * no writes. The screens' reach is the seed's: a file uploaded by the
     * submitter is the wizard's (so allowed on a draft); anyone else uploads
     * through the workflow, which exists only once the submission is
     * submitted, and must be someone the "Upload" is offered to there (the
     * site admin, a manager of the context, or a sub-editor or assistant
     * assigned in this request's participants[]). A note needs the
     * workflow's "More Information", so a submitted submission.
     *
     * @param array<int, array{user: User, userGroup: UserGroup}> $participantPlans
     * @return array<int, array{fixture: array, genreId: int, uploader: User, byWizard: bool, note: ?string, submissionFileId: ?int}>
     */
    protected function parseFiles(Context $context, Spec $root, User $submitter, bool $submitted, array $participantPlans): array
    {
        if (!$root->has('files')) {
            return [];
        }
        $this->assertFilesSupported('files');
        $plans = [];
        foreach ($root->childList('files') as $spec) {
            $fixture = $this->resolveFixture((string) $spec->require('file'), "{$spec->path}.file");
            $genreId = $this->resolveUploadGenreId($context, $spec);
            $uploader = $submitter;
            if ($spec->has('uploader')) {
                $username = (string) $spec->get('uploader');
                $uploader = Repo::user()->getByUsername($username, true);
                if (!$uploader) {
                    throw new SpecException("{$spec->path}.uploader", "Unknown uploader username \"{$username}\"");
                }
            }
            $byWizard = $uploader->getId() === $submitter->getId();
            if (!$byWizard) {
                if (!$submitted) {
                    throw new SpecException("{$spec->path}.uploader", 'Only the submitter uploads to a draft (the wizard\'s "Files" panel); anyone else uploads on the workflow, which a draft does not have');
                }
                if (!$this->mayUploadOnWorkflow($context, $uploader, $participantPlans)) {
                    throw new SpecException("{$spec->path}.uploader", "\"{$uploader->getUsername()}\" is offered no \"Upload\" on \"Submission Files\": the uploader must be the submitter, the site admin, a manager of the context, or a sub-editor or assistant assigned in participants[]");
                }
            }
            $note = null;
            if ($spec->has('note')) {
                $note = $spec->get('note');
                if (!is_string($note) || trim($note) === '') {
                    throw new SpecException("{$spec->path}.note", 'note must be a non-empty string (the "Add Note" box\'s text)');
                }
                if (!$submitted) {
                    throw new SpecException("{$spec->path}.note", 'A note is added in the workflow\'s "More Information" window, which a draft does not have');
                }
            }
            $plans[] = [
                'fixture' => $fixture,
                'genreId' => $genreId,
                'uploader' => $uploader,
                'byWizard' => $byWizard,
                'note' => $note,
                'submissionFileId' => null,
            ];
        }
        return $plans;
    }

    /** Whether the workflow's "Submission Files" list offers this user "Upload". */
    protected function mayUploadOnWorkflow(Context $context, User $user, array $participantPlans): bool
    {
        if ($user->hasRole([Role::ROLE_ID_SITE_ADMIN], \PKP\core\PKPApplication::SITE_CONTEXT_ID)
            || $user->hasRole([Role::ROLE_ID_MANAGER], $context->getId())) {
            return true;
        }
        foreach ($participantPlans as $plan) {
            if ($plan['user']->getId() === $user->getId()
                && in_array((int) $plan['userGroup']->roleId, [Role::ROLE_ID_MANAGER, Role::ROLE_ID_SUB_EDITOR, Role::ROLE_ID_ASSISTANT], true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * An entry's `genre`: the name (any locale) of one of the components the
     * upload lists offer — the context's enabled, non-dependent genres, the
     * list of the upload wizard's "Article Component" and of the submission
     * wizard's "What kind of file is this?" (GenreDAO::
     * getByDependenceAndContextId(false)); absent, the first main-work one. A
     * dependent component is offered only by the "Upload a Dependent File"
     * wizard, so it is refused.
     */
    protected function resolveUploadGenreId(Context $context, Spec $spec): int
    {
        $genreDao = DAORegistry::getDAO('GenreDAO'); /** @var \PKP\submission\GenreDAO $genreDao */
        if (!$spec->has('genre')) {
            // The first main-work component (neither dependent nor
            // supplementary: "Article Text", "Book Manuscript"), the first
            // button the wizard's "Files" panel offers; else the first the
            // upload lists offer.
            $genres = $genreDao->getByDependenceAndContextId(false, $context->getId());
            while ($genre = $genres->next()) {
                if (!$genre->getSupplementary()) {
                    return (int) $genre->getId();
                }
            }
            return $this->defaultGalleyGenreId($context);
        }
        $name = (string) $spec->get('genre');
        $genres = $genreDao->getByDependenceAndContextId(false, $context->getId());
        $names = [];
        while ($genre = $genres->next()) {
            if (in_array($name, (array) $genre->getName(null), true)) {
                return (int) $genre->getId();
            }
            $names[] = $genre->getLocalizedName();
        }
        throw new SpecException("{$spec->path}.genre", "No component \"{$name}\" among those the upload lists offer in \"{$context->getPath()}\": " . implode(', ', array_map(fn ($n) => "\"{$n}\"", $names)));
    }

    /**
     * The genre the upload wizard's list offers first: the context's
     * non-dependent genres in their sequence (SubmissionFilesUploadForm::
     * _retrieveGenreList → GenreDAO::getByDependenceAndContextId(false)).
     */
    protected function defaultGalleyGenreId(Context $context): int
    {
        $genreDao = DAORegistry::getDAO('GenreDAO'); /** @var \PKP\submission\GenreDAO $genreDao */
        $genre = $genreDao->getByDependenceAndContextId(false, $context->getId())->next();
        if (!$genre) {
            throw new SpecException('galleys', 'The context has no non-dependent genre for the upload wizard to offer');
        }
        return (int) $genre->getId();
    }

    /**
     * Read userComments[] (U14): each entry a reader's comment on the
     * published publication, optionally approved and reported. Parse-phase:
     * no writes. The refusals follow the screens: no comment without a
     * published publication (the box exists on a published landing page
     * only, and AddComment refuses a publication that is not the
     * submission's current one), no report on a comment that is not
     * approved (nobody but the writer sees a pending or hidden comment, so
     * the "…" menu offers "Report" on approved comments alone), no report
     * by the writer (their own menu offers "Delete Comment" and no
     * "Report"). Text and note are stripped as the form requests strip the
     * posted values (AddComment::validated, AddReport::validated).
     *
     * @return array<int, array{user: User, text: string, approved: bool, reports: array<int, array{user: User, note: string}>}>
     */
    protected function parseUserComments(Spec $root, bool $published): array
    {
        if (!$root->has('userComments')) {
            return [];
        }
        if (!$published) {
            throw new SpecException('userComments', 'userComments needs published: true — the comment box exists on a published item\'s landing page only, and the comments API refuses a publication that is not the submission\'s current published version');
        }
        $plans = [];
        foreach ($root->childList('userComments') as $spec) {
            $username = (string) $spec->require('user');
            $user = Repo::user()->getByUsername($username, true);
            if (!$user) {
                throw new SpecException("{$spec->path}.user", "Unknown username \"{$username}\"");
            }
            $text = $spec->require('text');
            if (!is_string($text) || trim($text) === '') {
                throw new SpecException("{$spec->path}.text", 'text must be a non-empty string (the box\'s "Submit" posts its text; the API refuses an empty one)');
            }
            $approved = $spec->get('approved', false);
            if (!is_bool($approved)) {
                throw new SpecException("{$spec->path}.approved", 'approved must be a boolean (true: approved on the Comments page, false: pending)');
            }
            $reports = [];
            foreach ($spec->childList('reports') as $reportSpec) {
                if (!$approved) {
                    throw new SpecException("{$spec->path}.reports", 'reports need approved: true — nobody but the writer sees a pending or hidden comment on the landing page, so the "…" menu offers "Report" on approved comments alone');
                }
                $reporterName = (string) $reportSpec->require('user');
                $reporter = Repo::user()->getByUsername($reporterName, true);
                if (!$reporter) {
                    throw new SpecException("{$reportSpec->path}.user", "Unknown username \"{$reporterName}\"");
                }
                if ($reporter->getId() === $user->getId()) {
                    throw new SpecException("{$reportSpec->path}.user", 'a comment\'s own writer is offered no "Report" (their menu holds "Delete Comment" alone), so a self-report cannot be seeded');
                }
                $note = $reportSpec->require('note');
                if (!is_string($note) || trim($note) === '') {
                    throw new SpecException("{$reportSpec->path}.note", 'note must be a non-empty string (the "Report Comment" dialog\'s reason box; the API refuses an empty one)');
                }
                $reports[] = ['user' => $reporter, 'note' => PKPString::stripUnsafeHtml($note)];
            }
            $plans[] = [
                'user' => $user,
                'text' => PKPString::stripUnsafeHtml($text),
                'approved' => $approved,
                'reports' => $reports,
            ];
        }
        return $plans;
    }

    /**
     * Write the parsed comments the way the comments API writes them
     * (UserCommentController): the comment through UserComment::create()
     * with the writer as its user (submit), the approval as setApproval
     * writes it (isApproved, approvedAt now, approvedByUserId the acting
     * moderator), each report through Repo::userComment()->addReport()
     * (submitReport), and after the comment and after each report the
     * controller's own notifyModerators() — the task row per manager and
     * site admin of the context that the Tasks panel lists — invoked by
     * reflection so the roster query and the createNotification call are
     * the controller's, not a copy. The request's context is already forced
     * to the submission's (build()), which is what Repo::userComment() and
     * notifyModerators() read.
     *
     * @return array<int, array{id: int, user: string, approved: bool, reports: int[]}>
     */
    protected function seedUserComments(Context $context, int $publicationId, array $plans, User $moderator): array
    {
        $controller = new \PKP\API\v1\comments\UserCommentController();
        $notifyModerators = new \ReflectionMethod($controller, 'notifyModerators');
        $seeded = [];
        foreach ($plans as $plan) {
            $comment = UserComment::query()->create([
                'userId' => $plan['user']->getId(),
                'contextId' => $context->getId(),
                'publicationId' => $publicationId,
                'commentText' => $plan['text'],
                'isApproved' => false,
            ]);
            $notifyModerators->invoke($controller, $comment->id, Application::ASSOC_TYPE_COMMENT, Notification::NOTIFICATION_TYPE_USER_COMMENT_POSTED);

            if ($plan['approved']) {
                $comment->isApproved = true;
                $comment->approvedAt = now();
                $comment->approvedByUserId = $moderator->getId();
                $comment->save();
            }

            $reportIds = [];
            foreach ($plan['reports'] as $report) {
                $reportId = Repo::userComment()->addReport($comment, $report['user'], $report['note']);
                $notifyModerators->invoke($controller, $reportId, Application::ASSOC_TYPE_COMMENT_REPORT, Notification::NOTIFICATION_TYPE_USER_COMMENT_REPORTED);
                $reportIds[] = $reportId;
            }

            $seeded[] = [
                'id' => (int) $comment->id,
                'user' => $plan['user']->getUsername(),
                'approved' => $plan['approved'],
                'reports' => $reportIds,
            ];
        }
        return $seeded;
    }

    /**
     * Read reviewerSuggestions[] and validate each entry with the rules the
     * wizard's "Add Reviewer Suggestion" window is validated with
     * (AddReviewerSuggestion::rules, minus the two DB-exists rules that hold
     * by construction here): givenName required, familyName optional, email
     * required and valid, affiliation and the reason required (defaulted by
     * the seed the way the abstract is), every multilingual box a locale
     * map over the context's form locales with the primary locale present.
     * The API's per-submission unique email is checked within the list —
     * the submission does not exist yet, so nothing else can clash.
     * Parse-phase: no writes.
     *
     * @return array<int, array<string, mixed>> the create() payloads, minus submissionId / suggestingUserId
     */
    protected function parseReviewerSuggestions(Context $context, Spec $root, string $tag): array
    {
        if (!$context->getData('reviewerSuggestionEnabled')) {
            throw new SpecException('reviewerSuggestions', 'The wizard offers the "Reviewer Suggestions" step only while the context\'s "Reviewer Suggestion at Submission" setting is on: seed the context with review.reviewerSuggestionEnabled: true');
        }
        $primaryLocale = $context->getPrimaryLocale();
        // AddReviewerSuggestion::allowedLocales: the form locales plus the site's primary locale.
        $allowedLocales = (array) $context->getSupportedFormLocales();
        $sitePrimaryLocale = Application::get()->getRequest()->getSite()->getPrimaryLocale();
        if (!in_array($sitePrimaryLocale, $allowedLocales)) {
            $allowedLocales[] = $sitePrimaryLocale;
        }
        $rules = [
            'givenName' => ['required', 'array', new MultilingualInput($primaryLocale, $allowedLocales, true)],
            'familyName' => ['sometimes', 'array', new MultilingualInput($primaryLocale, $allowedLocales, false)],
            'email' => ['required', 'email'],
            'affiliation' => ['required', 'array', new MultilingualInput($primaryLocale, $allowedLocales, true)],
            'suggestionReason' => ['required', 'array', new MultilingualInput($primaryLocale, $allowedLocales, true)],
        ];

        $plans = [];
        $emails = [];
        foreach ($root->childList('reviewerSuggestions') as $spec) {
            $plan = [
                'givenName' => $spec->localized('givenName', $primaryLocale),
                'email' => (string) $spec->require('email'),
                'affiliation' => $spec->localized('affiliation', $primaryLocale, str_replace('{tag}', $tag, self::DEFAULT_SUGGESTION_AFFILIATION)),
                'suggestionReason' => $spec->localized('suggestionReason', $primaryLocale, str_replace('{tag}', $tag, self::DEFAULT_SUGGESTION_REASON)),
            ];
            if ($plan['givenName'] === null) {
                throw new SpecException("{$spec->path}.givenName", "Missing required spec key \"{$spec->path}.givenName\"");
            }
            if ($spec->has('familyName')) {
                $plan['familyName'] = $spec->localized('familyName', $primaryLocale);
            }
            // The reason box is a rich-text editor, which posts a paragraph
            // ("<p>…</p>") for plain typed text: wrap a bare string the same
            // way; a string that already carries markup is kept.
            foreach ($plan['suggestionReason'] as $reasonLocale => $reason) {
                $reason = (string) $reason;
                if ($reason !== '' && !str_starts_with(ltrim($reason), '<')) {
                    $plan['suggestionReason'][$reasonLocale] = "<p>{$reason}</p>";
                }
            }
            // The window's "Save" is refused with the same messages.
            $validator = ValidatorFactory::make($plan, $rules);
            if ($validator->fails()) {
                $messages = [];
                foreach ($validator->errors()->toArray() as $field => $fieldMessages) {
                    $messages[] = "{$field}: " . implode(' ', $fieldMessages);
                }
                throw new SpecException($spec->path, 'The "Add Reviewer Suggestion" window would refuse this entry: ' . implode('; ', $messages));
            }
            if (in_array($plan['email'], $emails, true)) {
                throw new SpecException("{$spec->path}.email", "Two suggestions on one submission cannot share the email address \"{$plan['email']}\" (the window refuses the second)");
            }
            $emails[] = $plan['email'];
            // The multilingual validated() drops empty locale values.
            foreach (['givenName', 'familyName', 'affiliation', 'suggestionReason'] as $multilingualKey) {
                if (isset($plan[$multilingualKey])) {
                    $plan[$multilingualKey] = array_filter($plan[$multilingualKey]);
                }
            }
            $plans[] = $plan;
        }
        return $plans;
    }

    /**
     * The wizard's submit-as resolution (PKPSubmissionController::add parity):
     * the user's author/manager group, authors preferred; fall back to
     * enrolling in the context's default author group.
     */
    protected function resolveSubmitAsUserGroup(Context $context, User $submitter): UserGroup
    {
        $submitterUserGroups = UserGroup::withContextIds($context->getId())
            ->withRoleIds([Role::ROLE_ID_MANAGER, Role::ROLE_ID_AUTHOR])
            ->whereHas('userUserGroups', function ($query) use ($submitter) {
                $query->withUserId($submitter->getId())->withActive();
            })
            ->get();

        if ($submitterUserGroups->count()) {
            return $submitterUserGroups
                ->sort(fn (UserGroup $a, UserGroup $b) => ((int) $a->roleId) === Role::ROLE_ID_AUTHOR ? -1 : 1)
                ->first();
        }

        $submitAsUserGroup = UserGroup::withContextIds($context->getId())
            ->withRoleIds(Role::ROLE_ID_AUTHOR)
            ->first();
        if (!$submitAsUserGroup) {
            throw new SpecException('submitter', 'This context has no author user group to submit as');
        }
        Repo::userGroup()->assignUserToGroup($submitter->getId(), $submitAsUserGroup->id);
        return $submitAsUserGroup;
    }

    /**
     * Assign + confirm/decline reviewers on a round through the real editor
     * and reviewer actions.
     *
     * @param array{user: User, status: string}[] $reviewers
     */
    protected function seedRoundReviewers(Context $context, int $submissionId, \PKP\submission\reviewRound\ReviewRound $round, array $reviewers): array
    {
        $request = Application::get()->getRequest();
        $editorAction = new EditorAction();
        $reviewerAction = new ReviewerAction();
        $seeded = [];

        // addReviewer() reads the Add Reviewer form's skipEmail user var; the
        // form's "do not send email" path is the parity-correct one for
        // seeding (scenario-side mail is dropped regardless — Mail::fake).
        // Deviation from the mail-sending path is recorded in the parity
        // ledger (no REVIEW_REQUEST email log row on seeded assignments).
        app('request')->merge(['skipEmail' => 1]);

        // Due dates at Add Reviewer form parity: the app's own
        // HasReviewDueDate trait (review due = today + numWeeksPerReview,
        // response due = today + numWeeksPerResponse, each from its OWN
        // interval with the trait's 4/3-week fallbacks), formatted as the
        // datepicker's Y-m-d altField submits them (parity fix 2026-08-02 —
        // the builder used to seed review due = today + response + review).
        [$reviewDueTimestamp, $responseDueTimestamp] = $this->getDueDates($context);
        $reviewDueDate = date('Y-m-d', $reviewDueTimestamp);
        $responseDueDate = date('Y-m-d', $responseDueTimestamp);

        // The Add Reviewer form always submits a review method: the context's
        // defaultReviewMode with a double-anonymous fallback
        // (ReviewerForm::initData ~206-210; schema default 2). Passing null
        // here would let the review_assignments column default (anonymous)
        // win — a state no UI path produces (parity fix 2026-08-23).
        $reviewMethod = (int) $context->getData('defaultReviewMode');
        if (!$reviewMethod) {
            $reviewMethod = ReviewAssignment::SUBMISSION_REVIEW_METHOD_DOUBLEANONYMOUS;
        }

        // The section/series default review form, exactly as the Add Reviewer
        // form resolves it (ReviewerForm::initData ~212-221) and validates it
        // on save (ReviewerForm::execute ~366-369).
        $submission = Repo::submission()->get($submissionId);
        $sectionId = $submission->getCurrentPublication()->getData(Application::getSectionIdPropName());
        $section = $sectionId ? Repo::section()->get($sectionId, $context->getId()) : null;
        $reviewFormId = $section ? (int) $section->getReviewFormId() : 0;
        $reviewFormDao = DAORegistry::getDAO('ReviewFormDAO'); /** @var \PKP\reviewForm\ReviewFormDAO $reviewFormDao */
        $reviewForm = $reviewFormDao->getById($reviewFormId, Application::getContextAssocType(), $context->getId());

        // The round's files the Add Reviewer form lists (ReviewerForm::
        // execute: the review-file stage of the round's stage).
        $roundFiles = Repo::submissionFile()
            ->getCollector()
            ->filterBySubmissionIds([$submissionId])
            ->filterByReviewRoundIds([$round->getId()])
            ->filterByFileStages([(int) $round->getStageId() === WORKFLOW_STAGE_ID_INTERNAL_REVIEW ? SubmissionFile::SUBMISSION_FILE_INTERNAL_REVIEW_FILE : SubmissionFile::SUBMISSION_FILE_REVIEW_FILE])
            ->getMany();
        $reviewFilesDao = DAORegistry::getDAO('ReviewFilesDAO'); /** @var \PKP\submission\ReviewFilesDAO $reviewFilesDao */

        foreach ($reviewers as $plan) {
            $reviewer = $plan['user'];
            $submission = Repo::submission()->get($submissionId);
            $editorAction->addReviewer(
                $request,
                $submission,
                $reviewer->getId(),
                $round,
                $reviewDueDate,
                $responseDueDate,
                $reviewMethod,
                // pass explicitly: the seeding request is site-wide, so the
                // service must not fall back to $request->getContext()
                (bool) $context->getData('defaultReviewPublicVisibility')
            );
            $assignment = Repo::reviewAssignment()->getCollector()
                ->filterByReviewRoundIds([$round->getId()])
                ->filterByReviewerIds([$reviewer->getId()])
                ->getMany()
                ->first();
            if (!$assignment) {
                throw new SpecException('reviewRounds', "Review assignment for \"{$reviewer->getUsername()}\" was not created");
            }
            // The Add Reviewer form's post-add stamp, mirrored from
            // ReviewerForm::execute ~371-375: notification date, the
            // section's default review form, and considered = NEW.
            Repo::reviewAssignment()->edit($assignment, [
                'dateNotified' => \PKP\core\Core::getCurrentDate(),
                'reviewFormId' => $reviewForm ? $reviewFormId : null,
                'considered' => ReviewAssignment::REVIEW_ASSIGNMENT_NEW,
            ]);

            // The form's file list (the round's review files, every box
            // ticked by default): ReviewerForm::execute grants each. A
            // round seeded without files has none, so nothing is granted.
            foreach ($roundFiles as $roundFile) {
                $reviewFilesDao->grant($assignment->getId(), $roundFile->getId());
            }

            if ($plan['reviewFormId'] !== null) {
                // The reviewer row's "Edit" window (EditReviewForm::execute
                // ~207-215): the assignment's review-form id, valid while
                // the review is not completed. Dates and method are the
                // form's own values here, so the window would send no
                // "assignment changed" notification or email either.
                $assignment = Repo::reviewAssignment()->get($assignment->getId());
                Repo::reviewAssignment()->edit($assignment, ['reviewFormId' => $plan['reviewFormId']]);
            }

            if ($plan['status'] !== 'invited') {
                $assignment = Repo::reviewAssignment()->get($assignment->getId());
                $previousActingUser = Registry::get('user');
                Registry::set('user', $reviewer);
                try {
                    if ($plan['status'] === 'completed') {
                        // "Accept Review, Continue to Step #2" IS the step-1
                        // form (PKPReviewerHandler::saveStep → Step1Form::
                        // execute: competing-interests declaration when the
                        // context asks, step → 2, confirmReview(false)), then
                        // step 2 and step 3's "Submit Review".
                        $this->runReviewerStep($request, $submission, $assignment, 1);
                        $this->completeReview($request, $submission, $assignment, $plan['comments'], $plan['recommendationId']);
                    } else {
                        // accepted / declined: the bare ReviewerAction call,
                        // as before. A seeded acceptance therefore leaves
                        // step = 1 (the UI's accept moves it to 2 and, when
                        // the context asks, declares competing interests);
                        // the U28 suites walk the wizard from step 1 on it,
                        // so this stays a documented deviation
                        // (parity-ledger 2026-09-06).
                        $reviewerAction->confirmReview($request, $assignment, $submission, $plan['status'] === 'declined');
                    }
                } finally {
                    Registry::set('user', $previousActingUser);
                }
            }

            $assignment = Repo::reviewAssignment()->get($assignment->getId());
            $seeded[] = [
                'id' => $assignment->getId(),
                'reviewerId' => $reviewer->getId(),
                'username' => $reviewer->getUsername(),
                'status' => $plan['status'],
                'reviewRoundId' => $round->getId(),
            ];
        }
        return $seeded;
    }

    /**
     * Run one reviewer-wizard step form's execute() on the assignment, the
     * way PKPReviewerHandler::saveStep does after validate(). The form reads
     * the CURRENT assignment row, so callers re-fetch after each step.
     *
     * @param array<string, mixed> $data the step's posted fields (setData)
     */
    protected function runReviewerStep(\PKP\core\PKPRequest $request, \APP\submission\Submission $submission, ReviewAssignment $assignment, int $step, array $data = []): void
    {
        $formClass = "\\PKP\\submission\\reviewer\\form\\PKPReviewerReviewStep{$step}Form";
        $form = new $formClass($request, $submission, $assignment);
        foreach ($data as $key => $value) {
            $form->setData($key, $value);
        }
        $form->execute();
    }

    /**
     * "Continue to Step #3" then "Submit Review" + "OK": the step-2 and
     * step-3 forms (PKPReviewerReviewStep3Form::execute — review comment,
     * dateCompleted + recommendation, editors' REVIEWER_COMMENT notifications
     * and REVIEW_COMPLETE mail log, task removal, reviewReady event log).
     * The step-3 validator refuses a submit that leaves a required
     * review-form question unanswered; the seed refuses the same.
     */
    protected function completeReview(\PKP\core\PKPRequest $request, \APP\submission\Submission $submission, ReviewAssignment $assignment, string $comments, ?int $recommendationId): void
    {
        $assignment = Repo::reviewAssignment()->get($assignment->getId());
        if ($assignment->getReviewFormId()) {
            $reviewFormElementDao = DAORegistry::getDAO('ReviewFormElementDAO'); /** @var \PKP\reviewForm\ReviewFormElementDAO $reviewFormElementDao */
            if ($reviewFormElementDao->getRequiredReviewFormElementIds($assignment->getReviewFormId())) {
                throw new SpecException('reviewRounds', "A completed review cannot be seeded on a review form with required questions (the wizard refuses the submit); use a form without required items or complete the review on screen");
            }
        }
        $this->runReviewerStep($request, $submission, $assignment, 2);
        $assignment = Repo::reviewAssignment()->get($assignment->getId());
        $this->runReviewerStep($request, $submission, $assignment, 3, [
            'reviewFormResponses' => null,
            'comments' => $comments,
            'commentsPrivate' => '',
            'reviewerRecommendationId' => $recommendationId,
        ]);
    }

    /**
     * Resolve a recommendation name (the tail of the app's default
     * recommendation translation key: accept, pendingRevisions, resubmitHere,
     * resubmitElsewhere, decline, seeComments) against the context's ACTIVE
     * recommendations — the ones step 3's "Recommendation" list offers.
     */
    protected function resolveRecommendationId(Context $context, string $name, string $specKey): int
    {
        $prefix = 'reviewer.article.decision.';
        $recommendations = \PKP\submission\reviewer\recommendation\ReviewerRecommendation::query()
            ->withContextId($context->getId())
            ->withActive()
            ->get();
        $names = [];
        foreach ($recommendations as $recommendation) {
            $key = (string) $recommendation->getAttribute(\PKP\submission\reviewer\recommendation\ReviewerRecommendation::DEFAULT_RECOMMENDATION_TRANSLATION_KEY);
            if ($key === $prefix . $name) {
                return (int) $recommendation->getAttribute('reviewerRecommendationId');
            }
            if (str_starts_with($key, $prefix)) {
                $names[] = substr($key, strlen($prefix));
            }
        }
        $available = $names ? implode(', ', $names) : '(none)';
        throw new SpecException($specKey, "Unknown recommendation \"{$name}\". Active recommendations in context \"{$context->getPath()}\": {$available}");
    }

    /**
     * Resolve a review form title against the context's ACTIVE forms — the
     * ones the reviewer row's "Edit" window lists (EditReviewForm::fetch,
     * ReviewFormDAO::getActiveByAssocId). Matches any locale's title.
     */
    protected function resolveActiveReviewFormId(Context $context, string $title, string $specKey): int
    {
        $reviewFormDao = DAORegistry::getDAO('ReviewFormDAO'); /** @var \PKP\reviewForm\ReviewFormDAO $reviewFormDao */
        $forms = $reviewFormDao->getActiveByAssocId(Application::getContextAssocType(), $context->getId())->toArray();
        $titles = [];
        foreach ($forms as $form) {
            $formTitles = (array) $form->getTitle(null);
            if (in_array($title, $formTitles, true)) {
                return (int) $form->getId();
            }
            $titles[] = $form->getLocalizedTitle();
        }
        $available = $titles ? implode(', ', array_map(fn ($t) => "\"{$t}\"", $titles)) : '(none)';
        throw new SpecException($specKey, "No active review form titled \"{$title}\" in context \"{$context->getPath()}\". Active forms: {$available}");
    }

    /** Resolve a decision name against the app's own decision types. */
    protected function resolveDecisionType(string $name, string $specKey): \PKP\decision\DecisionType
    {
        $types = Repo::decision()->getDecisionTypes();
        foreach ($types as $type) {
            if (lcfirst(class_basename($type)) === $name) {
                return $type;
            }
        }
        $available = $types
            ->map(fn ($type) => lcfirst(class_basename($type)))
            ->sort()
            ->values()
            ->join(', ');
        throw new SpecException($specKey, "Unknown decision \"{$name}\". This app's decisions: {$available}");
    }

    /** The editor decisions are attributed to: the installer's admin. */
    protected function actingEditor(): User
    {
        $admin = Repo::user()->getByUsername('admin', true);
        if (!$admin) {
            throw new SpecException('context', 'No admin user found — is the test install bootstrapped?');
        }
        return $admin;
    }
}
