<?php

/**
 * @file classes/testing/SubmissionScenarioBuilder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class SubmissionScenarioBuilder
 *
 * @brief OJS submission scenario overlays: `section` (abbrev; defaults to the
 * journal's first section), for published scenarios `issue`
 * ({volume, number, year} matching a seeded issue) with `accessStatus`
 * (U51: the issue's "Open Access" box for the article), and `jats` (U48: the
 * "JATS XML" publication page's "Upload" and "Make available with
 * publication" box).
 */

namespace APP\testing;

use APP\core\Application;
use APP\facades\Repo;
use Illuminate\Http\Request;
use PKP\API\v1\jats\PKPJatsController;
use PKP\context\Context;
use PKP\core\Registry;
use PKP\publication\PKPPublication;
use PKP\submission\PKPSubmission;
use PKP\submissionFile\SubmissionFile;
use PKP\testing\ApiCall;
use PKP\testing\PKPSubmissionScenarioBuilder;
use PKP\testing\Spec;
use PKP\testing\SpecException;
use PKP\user\User;

class SubmissionScenarioBuilder extends PKPSubmissionScenarioBuilder
{
    protected function parsePublicationOverlay(Context $context, Spec $root): array
    {
        $abbrev = $root->get('section');
        if ($abbrev !== null) {
            $sectionId = BootstrapSeeder::findSectionId($context, (string) $abbrev);
            if (!$sectionId) {
                throw new SpecException('section', "Unknown section abbrev \"{$abbrev}\" in context \"{$context->getPath()}\"");
            }
            return ['sectionId' => $sectionId];
        }
        $firstSection = Repo::section()->getCollector()
            ->filterByContextIds([$context->getId()])
            ->getMany()
            ->first();
        return $firstSection ? ['sectionId' => $firstSection->getId()] : [];
    }

    protected function parsePublishOverlay(Context $context, Spec $root): array
    {
        $issueSpec = $root->child('issue');
        // `accessStatus` (U51): the issue's "Table of Contents" tab's "Open
        // Access" box for this article, `open` (ticked) or `issueDefault`
        // (unticked, as every article arrives). The column is there only on
        // a journal that requires subscriptions, in an issue whose "Access
        // status" is "Subscription", and lists the articles in the issue,
        // so the key needs `issue` and `published: true`.
        $accessStatus = null;
        if ($root->has('accessStatus')) {
            $statuses = ['issueDefault' => \APP\submission\Submission::ARTICLE_ACCESS_ISSUE_DEFAULT, 'open' => \APP\submission\Submission::ARTICLE_ACCESS_OPEN];
            $word = $root->get('accessStatus');
            if (!is_string($word) || !isset($statuses[$word])) {
                throw new SpecException('accessStatus', 'accessStatus must be open (the "Open Access" box ticked on the issue\'s "Table of Contents" tab) or issueDefault (unticked)');
            }
            if (!$issueSpec || !$root->get('published', false)) {
                throw new SpecException('accessStatus', 'The "Open Access" box is on the "Table of Contents" tab of the article\'s issue: accessStatus needs issue and published: true');
            }
            if ((int) $context->getData('publishingMode') !== \APP\journal\Journal::PUBLISHING_MODE_SUBSCRIPTION) {
                throw new SpecException('accessStatus', 'The "Open Access" column shows only on a journal that requires subscriptions');
            }
            $accessStatus = $statuses[$word];
        }
        if (!$issueSpec) {
            return [];
        }
        $volume = $issueSpec->get('volume');
        $number = $issueSpec->get('number');
        $year = $issueSpec->get('year');

        $issues = Repo::issue()->getCollector()
            ->filterByContextIds([$context->getId()])
            ->getMany();
        foreach ($issues as $issue) {
            if (
                ($volume === null || (int) $issue->getData('volume') === (int) $volume) &&
                ($number === null || (string) $issue->getData('number') === (string) $number) &&
                ($year === null || (int) $issue->getData('year') === (int) $year)
            ) {
                if ($accessStatus !== null && (int) $issue->getData('accessStatus') !== \APP\issue\Issue::ISSUE_ACCESS_SUBSCRIPTION) {
                    throw new SpecException('accessStatus', 'The "Open Access" column shows only in an issue whose "Access status" is "Subscription"');
                }
                return ['issueId' => $issue->getId(), 'accessStatus' => $accessStatus];
            }
        }
        throw new SpecException('issue', 'No issue matches the given volume/number/year in this context');
    }

    /**
     * The "Open Access" box (U51), after the publish: the "Table of
     * Contents" tab's toggle, TocGridHandler::setAccessStatus, whose whole
     * write is Repo::publication()->edit of the current publication's
     * accessStatus to the posted status.
     */
    protected function afterPublish(Context $context, int $submissionId, array $overlayPlan): void
    {
        if (($overlayPlan['accessStatus'] ?? null) === null) {
            return;
        }
        $submission = Repo::submission()->get($submissionId);
        $publication = $submission->getCurrentPublication();
        Repo::publication()->edit($publication, ['accessStatus' => $overlayPlan['accessStatus']]);
    }

    protected function beforePublish(Context $context, PKPSubmission $submission, PKPPublication $publication, array $overlayPlan): void
    {
        if (!empty($overlayPlan['issueId'])) {
            Repo::publication()->edit($publication, ['issueId' => $overlayPlan['issueId']]);
        }
    }

    /**
     * `jats` {file?, makePublic?} (U48): the current publication's "JATS
     * XML" page. `file` is a fixture basename (`article.xml`), uploaded
     * the way the page's "Upload" uploads it; `makePublic` is the page's
     * "Make available with publication" box, ticked (true) or unticked
     * (false) and confirmed. At least one of the two. The page is on the
     * workflow, so a draft refuses the key. Parse-phase: no writes.
     */
    protected function parseJats(Context $context, Spec $root, bool $submitted): ?array
    {
        $spec = $root->child('jats');
        if ($spec === null) {
            return null;
        }
        if (!$submitted) {
            throw new SpecException('jats', 'The "JATS XML" page is on the workflow, which a draft does not have: jats needs submitted: true');
        }
        $plan = ['fixture' => null, 'makePublic' => null];
        if ($spec->has('file')) {
            $file = $spec->get('file');
            if (!is_string($file)) {
                throw new SpecException('jats.file', 'jats.file must be a fixture basename (e.g. "article.xml")');
            }
            $plan['fixture'] = $this->resolveFixture($file, 'jats.file');
        }
        if ($spec->has('makePublic')) {
            $value = $spec->get('makePublic');
            if (!is_bool($value)) {
                throw new SpecException('jats.makePublic', 'jats.makePublic must be a boolean (the "Make available with publication" box ticked or unticked)');
            }
            $plan['makePublic'] = $value;
        }
        $spec->assertConsumed();
        if ($plan['fixture'] === null && $plan['makePublic'] === null) {
            throw new SpecException('jats', 'jats needs file, makePublic or both');
        }
        return $plan;
    }

    /**
     * The "JATS XML" page, acting as the editor (admin), through the JATS
     * API's own actions (PKPJatsController, the controller OJS mounts at
     * submissions/{id}/publications/{id}/jats), their authorized objects
     * set directly (ApiCall):
     * - "Upload": the page's FileUploader posts the chosen file as the
     *   multipart field `file` with the query `fileStage` (the JATS stage),
     *   and ::add reads the upload from $_FILES, converts the request's
     *   input with convertStringsToSchema and hands both to
     *   Repo::jats()->addJatsFile (the file service's add into the
     *   submission's directory, a SubmissionFile at the JATS stage on the
     *   publication, named after the uploaded file). The fixture stands in
     *   for PHP's upload temp file in $_FILES for the one call.
     * - The box: "Confirm" in "Enable JATS XML Download" / "Disable JATS XML
     *   Download" sends PUT …/jats/visibility {jatsPublicVisibility}, run
     *   through ::setVisibility (Repo::publication()->edit and the public
     *   copy's cache cleared).
     */
    protected function seedJats(Context $context, int $submissionId, array $plan, User $editor): ?array
    {
        $previousActingUser = Registry::get('user');
        Registry::set('user', $editor);
        try {
            $submission = Repo::submission()->get($submissionId);
            $publication = Repo::publication()->get($submission->getData('currentPublicationId'));
            $routeParams = ['submissionId' => $submissionId, 'publicationId' => $publication->getId()];
            $authorized = [Application::ASSOC_TYPE_SUBMISSION => $submission, Application::ASSOC_TYPE_PUBLICATION => $publication];
            $seeded = ['submissionFileId' => null, 'file' => null, 'makePublic' => (bool) $publication->getData('jatsPublicVisibility')];

            if ($plan['fixture'] !== null) {
                $previousFiles = $_FILES;
                $_FILES = ['file' => [
                    'name' => $plan['fixture']['file'],
                    'type' => mime_content_type($plan['fixture']['path']) ?: 'application/octet-stream',
                    'tmp_name' => $plan['fixture']['path'],
                    'error' => UPLOAD_ERR_OK,
                    'size' => filesize($plan['fixture']['path']),
                ]];
                try {
                    $request = ApiCall::request(Request::class, 'POST', ['fileStage' => (string) SubmissionFile::SUBMISSION_FILE_JATS], $routeParams, 'jats.file', 'The "JATS XML" page\'s "Upload" would be refused');
                    $answer = ApiCall::answer(ApiCall::controller(PKPJatsController::class, $authorized)->add($request), 'jats.file', 'The "JATS XML" page\'s "Upload" was refused');
                } finally {
                    $_FILES = $previousFiles;
                }
                $seeded['submissionFileId'] = (int) $answer['id'];
                $seeded['file'] = $plan['fixture']['file'];
            }

            if ($plan['makePublic'] !== null) {
                $authorized[Application::ASSOC_TYPE_PUBLICATION] = Repo::publication()->get($publication->getId());
                $request = ApiCall::request(Request::class, 'PUT', ['jatsPublicVisibility' => $plan['makePublic']], $routeParams, 'jats.makePublic', 'The "Make available with publication" box would be refused');
                $answer = ApiCall::answer(ApiCall::controller(PKPJatsController::class, $authorized)->setVisibility($request), 'jats.makePublic', 'The "Make available with publication" box was refused');
                $seeded['makePublic'] = (bool) $answer['jatsPublicVisibility'];
            }
            return $seeded;
        } finally {
            Registry::set('user', $previousActingUser);
        }
    }
}
