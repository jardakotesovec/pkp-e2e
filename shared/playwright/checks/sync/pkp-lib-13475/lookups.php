<?php
/**
 * Kept check for pkp/pkp-lib#13475 (issue pkp/pkp-lib#13455 items 3 and 4, PR review 2026-10-08):
 * the two lookup services answer through the app's own `Inbound::getWork()`, pointed at stub.php
 * (served here on a free local port; both classes carry a public `$url`). No request leaves the
 * machine: the fleet's config sends every outgoing request to a dead proxy, so the driver points
 * that setting (in this process only) at the stub, which answers by the path whatever the host. Each case prints what `getWork()` put on the citation and every PHP warning it raised:
 *   names       OpenAlex authors "Plato", "UNESCO", "Lovelace, Ada", "Grace Hopper",
 *               "World Health Organization"
 *   noauthors   an OpenAlex work with no `authorships`
 *   crossref    a Crossref hit (score 120, its title in the reference's text) with no `author`
 * With a citation id as the argument, the "names" result is stored on that citation the way
 * OpenAlexJob::handle() stores it (status OPEN_ALEX, `Repo::citation()->edit()`), so that walk.js
 * can read the row and the "Edit citation" panel. Run from the app root:
 *   PKP_CONFIG_FILE=$PWD/config.test.ds<n>.inc.php php <this file> [citation id]
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\facades\Repo;
use PKP\citation\Citation;
use PKP\citation\enum\CitationProcessingStatus;
use PKP\citation\externalServices\crossref\Inbound as CrossrefInbound;
use PKP\citation\externalServices\openAlex\Inbound as OpenAlexInbound;

class LookupsDriver extends \PKP\cliTool\CommandLineTool
{
    protected array $warnings = [];

    /** Run $fn, returning its result and the warnings it raised. */
    protected function watched(callable $fn): array
    {
        $this->warnings = [];
        set_error_handler(function (int $no, string $message, string $file, int $line) {
            $this->warnings[] = $message . ' (' . basename(dirname($file)) . '/' . basename($file) . ':' . $line . ')';
            return true;
        });
        try {
            $result = $fn();
        } catch (\Throwable $e) {
            $result = ['threw' => get_class($e) . ': ' . $e->getMessage()];
        } finally {
            restore_error_handler();
        }
        return [$result, $this->warnings];
    }

    protected function citation(string $raw, ?string $doi = null): Citation
    {
        $citation = new Citation();
        $citation->setData('rawCitation', $raw);
        if ($doi) {
            $citation->setData('doi', $doi);
        }
        return $citation;
    }

    public function execute(): void
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $port = (int) substr(strrchr(stream_socket_get_name($socket, false), ':'), 1);
        fclose($socket);
        $stub = proc_open(['php', '-S', "127.0.0.1:{$port}", __DIR__ . '/stub.php'], [['file', '/dev/null', 'r'], ['file', '/dev/null', 'w'], ['file', '/dev/null', 'w']], $pipes);
        for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) {
            usleep(100_000);
        }

        $out = ['stub' => "http://127.0.0.1:{$port}"];
        $config = &\PKP\config\Config::getData();
        $config['proxy']['http_proxy'] = $config['proxy']['https_proxy'] = $out['stub'];
        try {
            $openAlex = new OpenAlexInbound('');
            $openAlex->url = $out['stub'];
            $crossref = new CrossrefInbound('');
            $crossref->url = $out['stub'];

            $names = $this->citation('pr13475 Alpha study of things. Journal of Things; 2020.', '10.1234/names');
            [$result, $warnings] = $this->watched(fn () => $openAlex->getWork($names));
            $out['names'] = [
                'returned' => $result instanceof Citation ? 'citation' : $result,
                'status' => $openAlex->statusCode,
                'authors' => $result instanceof Citation ? $result->getData('authors') : null,
                'warnings' => $warnings,
            ];

            $none = $this->citation('pr13475 Alpha study of things. Journal of Things; 2020.', '10.1234/noauthors');
            [$result, $warnings] = $this->watched(fn () => $openAlex->getWork($none));
            $out['noauthors'] = [
                'returned' => $result instanceof Citation ? 'citation' : $result,
                'title' => $result instanceof Citation ? $result->getData('title') : null,
                'authors' => $result instanceof Citation ? $result->getData('authors') : null,
                'warnings' => $warnings,
            ];

            $hit = $this->citation('pr13475 Alpha study of things. Journal of Things; 2020.');
            [$result, $warnings] = $this->watched(fn () => $crossref->getWork($hit));
            $out['crossref'] = [
                'returned' => $result instanceof Citation ? 'citation' : $result,
                'doi' => $result instanceof Citation ? $result->getData('doi') : null,
                'warnings' => $warnings,
            ];

            if (!empty($this->argv[0])) {
                $stored = Repo::citation()->get((int) $this->argv[0]);
                $stored->setData('doi', '10.1234/names');
                [$result, $warnings] = $this->watched(function () use ($openAlex, $stored) {
                    $changed = $openAlex->getWork($stored);
                    $changed->setProcessingStatus(CitationProcessingStatus::OPEN_ALEX->value);
                    Repo::citation()->edit($changed, []);
                    return Repo::citation()->get($changed->getId())->getData('authors');
                });
                $out['stored'] = ['citationId' => (int) $this->argv[0], 'authors' => $result, 'warnings' => $warnings];
            }
        } finally {
            proc_terminate($stub);
            proc_close($stub);
        }
        echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    }
}

$tool = new LookupsDriver($argv ?? []);
$tool->execute();
