<?php
// Read-only helper of deposit-all-datacite-versions.js and export-galley-only.js (pkp/pkp-lib#13460 round 8,
// the pkp/pkp-lib#13253 commit, OJS): prints, as one JSON line, for the scratch journal and the given works,
// - mode: the journal's stored "DOI Versioning", its ticked DOI kinds, its agency;
// - new[single|versioning]: OJS doi\DAO::getAllDepositableSubmissionIds() (what "Deposit All" marks "Submitted",
//   each row with the work id it queues a DepositSubmission job for), with "DOI Versioning" set on the in-memory
//   journal only (never saved), as [{submissionId, doiId, doi, status}];
// - old: round 7's query on the same rows (the commit's minus lines: the current publication only, the work id
//   through submissions.current_publication_id), article and galley branches;
// - exportable / exportableOld[single|versioning]: which of the given works
//   Repo::publication()->getExportableDOIsSubmissionIds() accepts ("Export DOIs" and the DepositSubmission job),
//   and which round 7's condition (`p.doi_id IS NOT NULL`) accepted;
// - works[id]: every version with its DOI and its galleys' DOIs; `datacite`: the objects
//   DatacitePlugin::depositSubmissions() hands its export (the work when "Articles" is ticked, then the CURRENT
//   version's galleys that carry a DOI); `xml` (with --xml): the DOIs in the XML the configured agency's export
//   plugin builds for the work with validation off, or the exception it throws.
// Writes nothing. Usage: PKP_CONFIG_FILE=<fleet config> php deposit-lists.php <ojs root> <contextPath> [--xml] <submissionId>...
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use APP\facades\Repo;
use Illuminate\Support\Facades\DB;
use PKP\plugins\PluginRegistry;

class DepositListsRead extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        $args = $this->argv;
        $path = array_shift($args);
        $flags = array_values(array_filter($args, fn ($a) => str_starts_with($a, '--')));
        $ids = array_map('intval', array_values(array_filter($args, fn ($a) => !str_starts_with($a, '--'))));
        $context = Application::getContextDAO()->getByPath($path);
        $ctxId = $context->getId();
        PluginRegistry::loadCategory('generic', true, $ctxId);
        PluginRegistry::loadCategory('importexport', true, $ctxId);

        $stored = (bool) $context->getData('doiVersioning');
        $kinds = $context->getData('enabledDoiTypes') ?? [];
        $out = ['contextId' => $ctxId, 'mode' => ['doiVersioning' => $stored, 'kinds' => $kinds, 'agency' => $context->getData('registrationAgency')]];
        $rows = function ($coll) {
            return collect($coll)->map(function ($r) {
                $d = DB::table('dois')->where('doi_id', $r->doi_id)->first(['doi', 'status']);
                return ['submissionId' => $r->submission_id === null ? null : (int) $r->submission_id, 'doiId' => (int) $r->doi_id, 'doi' => $d->doi, 'status' => (int) $d->status];
            })->sortBy(['doiId', 'submissionId'])->values()->all();
        };
        foreach ([false, true] as $v) {
            $k = $v ? 'versioning' : 'single';
            $context->setData('doiVersioning', $v);
            $out['new'][$k] = $rows(app(\APP\doi\DAO::class)->getAllDepositableSubmissionIds($context));
            $all = Repo::publication()->getExportableDOIsSubmissionIds($ctxId, $v);
            $out['exportable'][$k] = array_values(array_intersect($ids, $all));
            $oldAll = DB::table('publications as p')->join('submissions as s', function ($j) use ($v) {
                $j->on('p.submission_id', '=', 's.submission_id');
                if (!$v) {
                    $j->on('s.current_publication_id', '=', 'p.publication_id');
                }
            })->where('s.context_id', $ctxId)->where('p.status', 3)->whereNotNull('p.doi_id')->pluck('p.submission_id')->all();
            $out['exportableOld'][$k] = array_values(array_intersect($ids, array_unique($oldAll)));
        }
        $context->setData('doiVersioning', $stored);
        $out['old'] = $rows(DB::select($this->oldSql($kinds), [$ctxId]));

        foreach ($ids as $id) {
            $submission = Repo::submission()->get($id);
            if (!$submission) {
                $out['works'][$id] = null;
                continue;
            }
            $w = ['currentPublicationId' => $submission->getData('currentPublicationId'), 'versions' => []];
            foreach ($submission->getData('publications') as $p) {
                $galleys = [];
                foreach ($p->getData('galleys') ?? [] as $g) {
                    $galleys[] = ['galley' => $g->getId(), 'doi' => $g->getDoi()];
                }
                $w['versions'][] = ['id' => $p->getId(), 'version' => $p->getData('versionStage') . ' ' . $p->getData('versionMajor') . '.' . $p->getData('versionMinor'),
                    'published' => $p->getData('status') == 3, 'doi' => $p->getDoi(), 'galleys' => $galleys];
            }
            $current = $submission->getCurrentPublication();
            $items = [];
            if (in_array('publication', $kinds)) {
                $items[] = ['object' => 'article (current publication ' . $current->getId() . ')', 'doi' => $current->getDoi()];
            }
            if (in_array('representation', $kinds)) {
                foreach ($current->getData('galleys') as $g) {
                    if ($g->getDoi()) {
                        $items[] = ['object' => 'galley ' . $g->getId(), 'doi' => $g->getDoi()];
                    }
                }
            }
            $w['datacite'] = $items;
            if (in_array('--xml', $flags)) {
                $w['xml'] = $this->xml($context, $submission);
            }
            $out['works'][$id] = $w;
        }
        echo json_encode($out), "\n";
    }

    /** The DOIs in the XML the configured agency's export plugin builds for the work, validation off; or the exception. */
    protected function xml($context, $submission)
    {
        try {
            $agency = $context->getConfiguredDoiAgency();
            if (!$agency) {
                return ['agency' => null];
            }
            $plugin = null;
            foreach (['CrossrefExportPlugin', 'DataciteExportPlugin'] as $name) {
                $candidate = PluginRegistry::getPlugin('importexport', $name);
                if ($candidate && str_contains(strtolower(get_class($agency)), strtolower(substr($name, 0, 6)))) {
                    $plugin = $candidate;
                    break;
                }
            }
            if (!$plugin) {
                $m = new \ReflectionMethod($agency, '_getExportPlugin');
                $m->setAccessible(true);
                $plugin = $m->invoke($agency);
            }
            $errs = [];
            if ($plugin instanceof \APP\plugins\generic\datacite\DataciteExportPlugin) {
                $xml = $plugin->exportXML($submission, $plugin->getSubmissionFilter(), $context, true, $errs);
            } else {
                $xml = $plugin->exportXML([$submission], $plugin->getSubmissionFilter(), $context, true, $errs);
            }
            preg_match_all('#<(?:doi|identifier)[^>]*>([^<]*)</(?:doi|identifier)>#', $xml, $m);
            return ['plugin' => get_class($plugin), 'dois' => $m[1], 'bytes' => strlen($xml)];
        } catch (\Throwable $e) {
            return ['exception' => get_class($e) . ': ' . substr($e->getMessage(), 0, 500), 'at' => basename($e->getFile()) . ':' . $e->getLine()];
        }
    }

    /** Round 7's getAllDepositableSubmissionIds(), article and galley branches (the commit's minus lines). */
    protected function oldSql(array $kinds): string
    {
        $or = [];
        if (in_array('publication', $kinds)) {
            $or[] = "d.doi_id IN (SELECT p.doi_id FROM publications p LEFT JOIN submissions s ON p.publication_id = s.current_publication_id
                WHERE p.publication_id = s.current_publication_id AND p.doi_id IS NOT NULL AND p.status = 3)";
        }
        if (in_array('representation', $kinds)) {
            $or[] = "d.doi_id IN (SELECT g.doi_id FROM publication_galleys g LEFT JOIN publications p ON g.publication_id = p.publication_id
                LEFT JOIN submissions s ON p.publication_id = s.current_publication_id
                WHERE p.publication_id = s.current_publication_id AND g.doi_id IS NOT NULL AND p.status = 3)";
        }
        $where = $or ? '(' . implode(' OR ', $or) . ')' : 'FALSE';
        return "SELECT s.submission_id, d.doi_id FROM dois d LEFT JOIN publications p ON d.doi_id = p.doi_id
            LEFT JOIN submissions s ON p.publication_id = s.current_publication_id
            WHERE d.context_id = ? AND {$where} AND d.status IN (1, 4, 5)";
    }
}

$tool = new DepositListsRead(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
