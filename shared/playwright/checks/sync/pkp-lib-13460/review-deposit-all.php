<?php
// Read-only helper of review-deposit-all.js (pkp/pkp-lib#13460 round 4, OJS): prints, as one JSON line,
// the lists "Deposit All" and the deposit jobs work from, for the scratch journal and the given works:
// - exportable: Repo::reviewAssignment()->getExportableDOIsPeerReviewIds() (the reviews the
//   DepositSubmission / DepositPeerReview jobs and "Export DOIs" send), in both "DOI Versioning" modes;
// - depositable: OJS doi\DAO::getAllDepositableSubmissionIds() (what "Deposit All" marks "Submitted",
//   and the work ids it queues a DepositSubmission job for);
// - published: Repo::doi()->getPublishedDoisForSubmission() (what "Deposit DOIs" marks "Submitted").
// Writes nothing. Usage: PKP_CONFIG_FILE=<fleet config> php review-deposit-all.php <ojs root> <contextPath> <submissionId>...
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

class ReviewDepositAllRead extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        $context = \APP\core\Application::getContextDAO()->getByPath($this->argv[0]);
        $ids = array_map('intval', array_slice($this->argv, 1));
        $exportable = [];
        foreach ([false, true] as $versioning) {
            $exportable[$versioning ? 'versioning' : 'single'] = \APP\facades\Repo::reviewAssignment()
                ->getExportableDOIsPeerReviewIds($context->getId(), $versioning, $ids);
        }
        $depositable = app(\APP\doi\DAO::class)->getAllDepositableSubmissionIds($context)
            ->map(fn ($r) => ['submissionId' => $r->submission_id, 'doiId' => $r->doi_id])->values()->all();
        $published = [];
        foreach ($ids as $id) {
            $published[$id] = \APP\facades\Repo::doi()->getPublishedDoisForSubmission($id);
        }
        echo json_encode(['exportable' => $exportable, 'depositable' => $depositable, 'published' => $published]), "\n";
    }
}

$tool = new ReviewDepositAllRead(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
