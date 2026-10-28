<?php
/**
 * Kept check for pkp/pkp-lib#13119 / pkp/ojs#5715 (issue pkp/pkp-lib#13062, regression read rr13062, 2026-10-28):
 * runs the DepositSubmission job a "Deposit DOIs" press queued for one work, then the DepositPeerReview jobs that
 * job queued, each through its own handle() taken from the jobs table (the payload the worker would unserialize),
 * in this CLI process (no request context, as `php lib/pkp/tools/jobs.php` runs them). The agency's HTTP calls are
 * answered by a stand-in inside this process (Guzzle's unit-test client hook, PKPApplication::getHttpClient()):
 * nothing leaves the machine. OJS only. Each handled job's row is deleted; nothing else in the queue is touched.
 *
 * Options:
 *   --answer ok|fail      DataCite: 201 to /metadata and /doi, or 422 to every call; Crossref: a 200 deposit
 *                         diagnostic with failure_count 0, or a 403 diagnostic with failure_count 1
 *   --test-mode           the DataCite plugin's "Testing" box on (test prefix 10.5072) while the jobs run, restored after
 *   --peer-as-site-first  the first DepositPeerReview runs after the plugin registry is emptied and only the site's
 *                         generic plugins are loaded (what the request-time job runner has in a site/admin request)
 *   --peer-as-first <path>  the same with the generic plugins of another journal only (a request of that journal)
 *   --switch-none         the journal's Registration Agency set to "None" before the DepositPeerReview jobs run,
 *                         restored after
 * Prints one JSON line: the HTTP calls the stand-in received (method, path, the DOI/url lines or the XML's
 * identifier/title/relatedIdentifier), each job's outcome (ok / exception class: message @file:line), the DOI
 * statuses of the work's publications and reviews before and after, the DepositPeerReview jobs queued.
 *
 * Usage (from the OJS root): PKP_CONFIG_FILE=<fleet config> php <this file> <contextPath> <submissionId> [options]
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use GuzzleHttp\Client;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\Response;
use Illuminate\Support\Facades\DB;
use PKP\core\PKPContainer;
use PKP\core\Registry;
use PKP\plugins\PluginRegistry;

class Rr13119Deposit extends \PKP\cliTool\CommandLineTool
{
    public array $calls = [];
    public string $answer = 'ok';

    protected function statuses(int $sid): array
    {
        $pubs = DB::select('SELECT p.publication_id, p.status AS pst, d.doi, d.status FROM publications p LEFT JOIN dois d ON d.doi_id = p.doi_id WHERE p.submission_id = ? ORDER BY 1', [$sid]);
        $revs = DB::select('SELECT ra.review_id, d.doi, d.status FROM review_assignments ra LEFT JOIN dois d ON d.doi_id = ra.doi_id WHERE ra.submission_id = ? ORDER BY 1', [$sid]);
        $st = [0 => '-', 1 => 'Unregistered', 2 => 'Submitted', 3 => 'Registered', 4 => 'Error', 5 => 'Needs Sync'];
        return [
            'publications' => array_map(fn ($r) => "p{$r->publication_id}" . ($r->pst == 3 ? ' published' : '') . " {$r->doi} " . ($st[(int) $r->status] ?? $r->status), $pubs),
            'reviews' => array_map(fn ($r) => "r{$r->review_id} {$r->doi} " . ($st[(int) $r->status] ?? $r->status), $revs),
        ];
    }

    protected function jobs(string $class, int $sid): array
    {
        return DB::table('jobs')->where('payload', 'like', '%' . str_replace('\\', '\\\\\\\\', $class) . '%')->orderBy('id')->get()
            ->filter(function ($row) use ($sid) {
                $cmd = json_decode($row->payload)->data->command;
                return preg_match('/submissionId";i:' . $sid . ';/', $cmd);
            })->values()->all();
    }

    protected function runJob($row, array &$log, string $label): void
    {
        $job = unserialize(json_decode($row->payload)->data->command);
        try {
            $job->handle();
            $log[] = "{$label} job {$row->id}: ok";
        } catch (\Throwable $e) {
            $log[] = "{$label} job {$row->id}: " . get_class($e) . ': ' . substr($e->getMessage(), 0, 300) . ' @' . basename($e->getFile()) . ':' . $e->getLine();
        }
        DB::table('jobs')->where('id', $row->id)->delete();
    }

    public function execute()
    {
        $args = $this->argv;
        $path = array_shift($args);
        $sid = (int) array_shift($args);
        if (($i = array_search('--answer', $args)) !== false) {
            $this->answer = $args[$i + 1];
        }
        $context = Application::getContextDAO()->getByPath($path);
        $ctxId = $context->getId();
        PluginRegistry::loadCategory('generic', true, $ctxId);
        PluginRegistry::loadCategory('importexport', true, $ctxId);

        // The stand-in: every Guzzle client the app asks for answers here.
        PKPContainer::getInstance()->setRunningUnitTests();
        $self = $this;
        $handler = function ($request, $options) use ($self) {
            $body = (string) $request->getBody();
            $what = preg_match('/^doi=/', $body) ? str_replace("\n", ' | ', $body)
                : (preg_match('#<identifier[^>]*>([^<]*)</identifier>#', $body, $m) ? 'XML identifier ' . $m[1] . (preg_match('#<title[^>]*>([^<]*)</title>#', $body, $t) ? ' title "' . $t[1] . '"' : ' no title') . (preg_match('#relationType="Reviews">([^<]*)<#', $body, $r) ? ' Reviews ' . $r[1] : '')
                : (preg_match_all('#<doi>([^<]*)</doi>#', $body, $d) ? 'Crossref mdFile DOIs ' . implode(',', $d[1]) . (preg_match('#<resource>([^<]*)</resource>#', $body, $u) ? ' resource ' . preg_replace('#^https?://[^/]+#', '', html_entity_decode($u[1])) : '') : substr($body, 0, 120)));
            $self->calls[] = $request->getMethod() . ' ' . $request->getUri()->getHost() . $request->getUri()->getPath() . ' — ' . $what;
            $isCrossref = str_contains($request->getUri()->getHost(), 'crossref');
            if ($self->answer === 'ok') {
                $resp = $isCrossref
                    ? new Response(200, [], '<?xml version="1.0"?><doi_batch_diagnostic status="completed" sp="stub"><submission_id>1</submission_id><batch_id>rr13</batch_id><batch_data><record_count>1</record_count><success_count>1</success_count><warning_count>0</warning_count><failure_count>0</failure_count></batch_data></doi_batch_diagnostic>')
                    : new Response(201, [], 'OK');
            } else {
                $resp = $isCrossref
                    ? new Response(403, [], '<?xml version="1.0"?><doi_batch_diagnostic status="completed" sp="stub"><submission_id>1</submission_id><batch_id>rr13</batch_id><record_diagnostic status="Failure"><msg>stub refusal</msg></record_diagnostic><batch_data><failure_count>1</failure_count><warning_count>0</warning_count></batch_data></doi_batch_diagnostic>')
                    : new Response(422, [], 'stub refusal');
            }
            if ($resp->getStatusCode() >= 400) {
                return Create::rejectionFor(new \GuzzleHttp\Exception\ClientException('stub ' . $resp->getStatusCode(), $request, $resp));
            }
            return Create::promiseFor($resp);
        };
        Registry::set('GuzzleClient', new Client(['handler' => HandlerStack::create($handler)]));

        $dc = PluginRegistry::getPlugin('generic', 'dataciteplugin');
        $restoreTest = null;
        if (in_array('--test-mode', $args) && $dc) {
            $restoreTest = [$dc->getSetting($ctxId, 'testMode'), $dc->getSetting($ctxId, 'testDOIPrefix')];
            $dc->updateSetting($ctxId, 'testMode', true, 'bool');
            $dc->updateSetting($ctxId, 'testDOIPrefix', '10.5072', 'string');
        }

        $out = ['context' => $path, 'agency' => $context->getData('registrationAgency'), 'submission' => $sid, 'answer' => $this->answer,
            'testMode' => (bool) $restoreTest, 'before' => $this->statuses($sid)];
        $log = [];
        $subJobs = $this->jobs('PKP\jobs\doi\DepositSubmission', $sid);
        $out['depositSubmissionJobs'] = count($subJobs);
        foreach ($subJobs as $row) {
            $this->runJob($row, $log, 'DepositSubmission');
        }
        $out['afterSubmission'] = $this->statuses($sid);
        $peerJobs = $this->jobs('PKP\jobs\doi\DepositPeerReview', $sid);
        $out['depositPeerReviewJobs'] = count($peerJobs);

        $restoreAgency = null;
        if (in_array('--switch-none', $args)) {
            $restoreAgency = $context->getData('registrationAgency');
            DB::table('journal_settings')->where('journal_id', $ctxId)->where('setting_name', 'registrationAgency')->update(['setting_value' => 'none']);
        }
        foreach ($peerJobs as $n => $row) {
            $asPath = ($j = array_search('--peer-as-first', $args)) !== false ? $args[$j + 1] : null;
            if ($n === 0 && (in_array('--peer-as-site-first', $args) || $asPath)) {
                $asId = $asPath ? Application::getContextDAO()->getByPath($asPath)->getId() : \PKP\core\PKPApplication::SITE_CONTEXT_ID;
                $saved = Registry::get('plugins');
                $empty = [];
                Registry::set('plugins', $empty);
                PluginRegistry::loadCategory('generic', true, $asId);
                $out['pluginsAsSite'] = array_keys(PluginRegistry::getPlugins('generic') ?? []);
                $this->runJob($row, $log, 'DepositPeerReview (plugins of ' . ($asPath ?? 'the site') . ' only)');
                Registry::set('plugins', $saved);
                continue;
            }
            $this->runJob($row, $log, 'DepositPeerReview');
        }
        if ($restoreAgency !== null) {
            DB::table('journal_settings')->where('journal_id', $ctxId)->where('setting_name', 'registrationAgency')->update(['setting_value' => $restoreAgency]);
        }
        if ($restoreTest) {
            $dc->updateSetting($ctxId, 'testMode', (bool) $restoreTest[0], 'bool');
            $dc->updateSetting($ctxId, 'testDOIPrefix', (string) $restoreTest[1], 'string');
        }
        $out['jobs'] = $log;
        $out['calls'] = $this->calls;
        $out['after'] = $this->statuses($sid);
        $out['peerJobsLeft'] = count($this->jobs('PKP\jobs\doi\DepositPeerReview', $sid));
        $out['failedJobs'] = DB::table('failed_jobs')->count();
        echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    }
}

$tool = new Rr13119Deposit(array_merge([$argv[0]], array_slice($argv, 1)));
$tool->execute();
