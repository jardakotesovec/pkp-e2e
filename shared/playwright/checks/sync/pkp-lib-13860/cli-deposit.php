<?php
/**
 * Kept check for pkp/pkp-lib#13860 (crossref-ojs#124, ojs#6106/#6107, crossref-ops#81/#82): a DOI deposit
 * run by the command-line job worker. Run from the app root with the fleet's config:
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> dispatch <contextPath> <submissionId>
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> read <contextPath> <submissionId>
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> setup <contextPath> <agency> <n>
 * `setup` (for the lines without the `_test` API, 3.4, on PKP's dataset) does in PHP what the scratch context of
 * cli-deposit.js does through the API: DOIs on for publications with the prefix 10.1234, the agency plugin enabled
 * with test credentials and chosen as the Registration Agency; it prints the id of the context's n-th published
 * submission (0-based, by id) as `submissionId`.
 *   PKP_CONFIG_FILE=… php <this file> stub <contextPath> <submissionId> <httpStatus>
 * `stub` is `dispatch` with the job run in this process instead of queued: a command-line tool, so the plugins are
 * registered with no context as in `jobs.php`, and the agency's answer is stubbed (the Guzzle client the app hands
 * out while PKPContainer says unit tests run: a 3.4/3.5 seam) with <httpStatus> and a short body. On 3.4 only an
 * answer with a response reaches the message (a connection error is not caught there).
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
        [$mode, $path] = $this->argv;
        $submissionId = $mode === 'setup' ? 0 : (int) $this->argv[2];
        $context = \APP\core\Application::getContextDAO()->getByPath($path);
        $out = ['mode' => $mode, 'contextId' => $context->getId()];
        if ($mode === 'setup') {
            $agencyName = $this->argv[2];
            $n = (int) ($this->argv[3] ?? 0);
            $plugin = \PKP\plugins\PluginRegistry::getPlugin('generic', $agencyName);
            $settings = $agencyName === 'crossrefplugin'
                ? ['depositorName' => 'Dep Depositor', 'depositorEmail' => 'dep.depositor@mail.test', 'username' => 'dep-user', 'password' => 'dep-pass']
                : ['username' => 'DEP.USER', 'password' => 'dep-pass'];
            $plugin->updateSetting($context->getId(), 'enabled', true);
            foreach ($settings as $name => $value) {
                $plugin->updateSetting($context->getId(), $name, $value);
            }
            $contextDao = \APP\core\Application::getContextDAO();
            foreach (['enableDois' => true, 'doiPrefix' => '10.1234', 'enabledDoiTypes' => ['publication'], 'registrationAgency' => $agencyName] as $name => $value) {
                $context->setData($name, $value);
            }
            $contextDao->updateObject($context);
            $ids = Repo::submission()->getCollector()->filterByContextIds([$context->getId()])
                ->filterByStatus([\PKP\submission\PKPSubmission::STATUS_PUBLISHED])->getIds()->sort()->values()->all();
            $out['submissionId'] = $ids[$n] ?? null;
            $out['agencyNow'] = \APP\core\Application::getContextDAO()->getById($context->getId())->getData('registrationAgency');
            echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
            return;
        }
        if ($mode === 'dispatch' || $mode === 'stub') {
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
            if ($mode === 'stub') {
                Repo::doi()->markSubmitted(Repo::doi()->getDoisForSubmission($submissionId));
                $status = (int) ($this->argv[3] ?? 403);
                \PKP\core\PKPContainer::getInstance()->setRunningUnitTests();
                \PKP\core\Registry::set('GuzzleClient', new \GuzzleHttp\Client(['handler' => \GuzzleHttp\HandlerStack::create(
                    new \GuzzleHttp\Handler\MockHandler(array_fill(0, 4, new \GuzzleHttp\Psr7\Response($status, [], "Stubbed agency answer {$status}: credentials refused")))
                )]));
                $out['contextInRequest'] = \APP\core\Application::get()->getRequest()->getContext()?->getId();
                $out['schemaHasFailedMsg'] = isset((class_exists(\APP\core\Services::class) ? \APP\core\Services::get('schema') : app()->get('schema'))->get('doi')->properties->{$agency->getName() . '_failedMsg'});
                try {
                    (new DepositSubmission($submissionId, $context, $agency))->handle();
                    $out['handled'] = true;
                } catch (\Throwable $e) {
                    $out['handled'] = get_class($e) . ': ' . substr($e->getMessage(), 0, 300);
                }
            } else {
                dispatch(new DepositSubmission($submissionId, $context, $agency));
                Repo::doi()->markSubmitted(Repo::doi()->getDoisForSubmission($submissionId));
            }
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
