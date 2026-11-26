<?php
/**
 * Kept check for pkp/pkp-lib#13860 (crossref-ojs#124, ojs#6106/#6107, crossref-ops#81/#82): a DOI deposit
 * run by the command-line job worker. Run from the app root with the fleet's config:
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> dispatch <contextPath> <submissionId>
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> read <contextPath> <submissionId>
 * `dispatch` queues the job the DOI manager's "Deposit DOIs" queues (PKPDoiController::depositSubmissions():
 * DepositSubmission with the context's configured agency, then markSubmitted), publishing the work and creating its DOIs first
 * when it has none (an OJS article goes into the journal's seeded issue). The caller then runs `php lib/pkp/tools/jobs.php work --stop-when-empty` (job_runner Off in
 * the test config) and `read`, which prints the DOIs' status and every doi_settings row as JSON. The test
 * config's [proxy] is a dead port, so the agency is never reached and every deposit fails.
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\facades\Repo;
use Illuminate\Support\Facades\DB;
use PKP\jobs\doi\DepositSubmission;

class CliDepositDriver extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        [$mode, $path, $submissionId] = $this->argv;
        $submissionId = (int) $submissionId;
        $context = \APP\core\Application::getContextDAO()->getByPath($path);
        $out = ['mode' => $mode, 'contextId' => $context->getId()];
        if ($mode === 'dispatch') {
            $submission = Repo::submission()->get($submissionId);
            if ($submission->getData('status') !== \PKP\submission\PKPSubmission::STATUS_PUBLISHED) {
                // Published here, not by the seed: the 3.5 seed's publish step fails on OPS, and an OJS article
                // must sit in an issue (the journal's seeded issue).
                $publication = $submission->getCurrentPublication();
                if (class_exists(\APP\issue\Issue::class)) {
                    $issue = Repo::issue()->getCollector()->filterByContextIds([$context->getId()])->getMany()->first();
                    Repo::publication()->edit($publication, ['issueId' => $issue->getId()]);
                    $publication = Repo::publication()->get($publication->getId());
                }
                Repo::publication()->publish($publication);
                $submission = Repo::submission()->get($submissionId);
                $out['published'] = $submission->getData('status');
            }
            if (!count(Repo::doi()->getDoisForSubmission($submissionId))) {
                $out['createDois'] = Repo::submission()->createDois($submission);
            }
            $agency = $context->getConfiguredDoiAgency();
            $out['agency'] = $agency ? $agency->getName() : null;
            dispatch(new DepositSubmission($submissionId, $context, $agency));
            Repo::doi()->markSubmitted(Repo::doi()->getDoisForSubmission($submissionId));
            $out['queued'] = DB::table('jobs')->count();
        }
        $doiIds = Repo::doi()->getDoisForSubmission($submissionId);
        $out['dois'] = DB::table('dois')->whereIn('doi_id', $doiIds)->get(['doi_id', 'doi', 'status'])->all();
        $out['doiSettings'] = DB::table('doi_settings')->whereIn('doi_id', $doiIds)->orderBy('doi_id')->orderBy('setting_name')->get()->all();
        $out['failedJobs'] = DB::table('failed_jobs')->count();
        echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
    }
}

(new CliDepositDriver($argv ?? []))->execute();
