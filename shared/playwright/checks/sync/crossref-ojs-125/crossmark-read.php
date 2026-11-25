<?php
// Driver of crossmark.js (PR review of pkp-lib#13766: crossref-ojs#125, pkp-lib#13871, ojs#6118). OJS.
// --prepare (once): the work's first version becomes "PMUR 1.0" and a second version (VoR) is made from it and
//   published; the work's second review round is moved onto it; every completed review is confirmed ("Mark as
//   Complete") and public and gets a DOI, as does every version; the reviews named by --anon=<reviewId,...> become
//   double-anonymous.
// Then (always) prints JSON: the versions, the reviews, the Crossmark <custom_metadata> of each <journal_article> of
// the work's Crossref XML (the plugin's submission filter, validation off; the XML is also written to
// <tmp>/s0-crossmark-<submissionId>.xml for a schema check against local copies of Crossref's 5.4.0 schema), and
// the contributor of each <peer_review> of the reviews' XML.
// Usage: PKP_CONFIG_FILE=<fleet config> php crossmark-read.php <app root> <contextPath> <submissionId> [--prepare] [--anon=ids]
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\facades\Repo;
use APP\core\Application;
use APP\publication\enums\VersionStage;
use Illuminate\Support\Facades\DB;
use PKP\plugins\PluginRegistry;
use PKP\submission\reviewAssignment\ReviewAssignment;

class CrossmarkRead extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        $args = $this->argv;
        $path = array_shift($args);
        $sid = (int) array_shift($args);
        $prepare = in_array('--prepare', $args);
        $anon = [];
        foreach ($args as $a) {
            if (str_starts_with($a, '--anon=')) {
                $anon = array_map('intval', explode(',', substr($a, 7)));
            }
        }
        $context = Application::getContextDAO()->getByPath($path);
        PluginRegistry::loadCategory('generic', true, $context->getId());
        PluginRegistry::loadCategory('importexport', true, $context->getId());
        $out = ['doiVersioning' => (bool) $context->getData('doiVersioning'), 'kinds' => $context->getData('enabledDoiTypes')];

        if ($prepare) {
            // Repo::publication()->version() reads the request's context
            $request = Application::get()->getRequest();
            if (!$request->getRouter()) {
                $request->setRouter(new \APP\core\PageRouter());
            }
            (new \ReflectionProperty(\PKP\core\PKPRouter::class, '_context'))->setValue($request->getRouter(), $context);
            $submission = Repo::submission()->get($sid);
            $first = $submission->getCurrentPublication();
            DB::table('publications')->where('publication_id', $first->getId())->update(['version_stage' => 'PMUR', 'version_major' => 1, 'version_minor' => 0]);
            if (!$first->getData('doiId')) {
                Repo::publication()->edit(Repo::publication()->get($first->getId()), ['doiId' => Repo::doi()->mintDoi($context)]);
            }
            $first = Repo::publication()->get($first->getId());
            $newId = Repo::publication()->version($first, VersionStage::VERSION_OF_RECORD, false);
            $new = Repo::publication()->get($newId);
            if (!$new->getData('doiId') || $new->getData('doiId') === $first->getData('doiId')) {
                Repo::publication()->edit($new, ['doiId' => Repo::doi()->mintDoi($context)]);
                $new = Repo::publication()->get($newId);
            }
            Repo::publication()->publish($new);
            $rounds = DB::table('review_rounds')->where('submission_id', $sid)->orderBy('round')->pluck('review_round_id')->all();
            if (count($rounds) > 1) {
                DB::table('review_rounds')->where('review_round_id', end($rounds))->update(['publication_id' => $newId]);
            }
            foreach (Repo::reviewAssignment()->getCollector()->filterBySubmissionIds([$sid])->getMany() as $ra) {
                $edit = [];
                if ($ra->getDateCompleted()) {
                    // The editor's "Mark as Complete" and "Publicly Show Reviewer Comments" (no seed key confirms a review)
                    $edit += ['considered' => ReviewAssignment::REVIEW_ASSIGNMENT_CONSIDERED, 'dateConsidered' => $ra->getDateCompleted(), 'isReviewPubliclyVisible' => true];
                }
                if (in_array($ra->getId(), $anon)) {
                    $edit['reviewMethod'] = ReviewAssignment::SUBMISSION_REVIEW_METHOD_DOUBLEANONYMOUS;
                }
                if (!$ra->getData('doiId') && $ra->getDateCompleted()) {
                    $edit['doiId'] = Repo::doi()->mintDoi($context);
                }
                Repo::reviewAssignment()->edit($ra, $edit);
            }
            $out['prepared'] = ['firstPublicationId' => $first->getId(), 'newPublicationId' => $newId, 'rounds' => $rounds];
        }

        $submission = Repo::submission()->get($sid);
        $out['versions'] = $submission->getData('publications')->map(fn ($p) => ['id' => $p->getId(),
            'version' => $p->getData('versionStage') . ' ' . $p->getData('versionMajor') . '.' . $p->getData('versionMinor'),
            'status' => $p->getData('status'), 'doi' => $p->getDoi()])->values()->all();
        $out['reviews'] = collect(DB::select('SELECT ra.review_id, ra.reviewer_id, u.username, ra.round, rr.publication_id, ra.review_method, ra.date_completed, ra.date_confirmed, ra.is_review_publicly_visible, ra.reviewer_recommendation_id, d.doi
            FROM review_assignments ra JOIN users u ON u.user_id = ra.reviewer_id JOIN review_rounds rr ON rr.review_round_id = ra.review_round_id LEFT JOIN dois d ON d.doi_id = ra.doi_id
            WHERE ra.submission_id = ? ORDER BY ra.review_id', [$sid]))->all();
        $out['exportableReviewIds'] = Repo::reviewAssignment()->getExportableDOIsPeerReviewIds($context->getId(), (bool) $context->getData('doiVersioning'), [$sid]);

        $plugin = PluginRegistry::getPlugin('importexport', 'CrossrefExportPlugin');
        try {
            $errs = [];
            $xml = $plugin->exportXML([$submission], $plugin->getSubmissionFilter(), $context, true, $errs);
            preg_match_all('#<journal_article\b.*?</journal_article>#s', $xml, $articles);
            foreach ($articles[0] as $a) {
                preg_match('#<doi>([^<]*)</doi>#', $a, $d);
                preg_match('#<custom_metadata>.*?</custom_metadata>#s', $a, $cm);
                $out['articles'][] = ['doi' => $d[1] ?? null, 'custom_metadata' => isset($cm[0]) ? preg_replace('/>\s+</', ">\n<", $cm[0]) : null];
            }
            file_put_contents(sys_get_temp_dir() . "/s0-crossmark-$sid.xml", $xml);
        } catch (\Throwable $e) {
            $out['articleException'] = get_class($e) . ': ' . $e->getMessage() . ' at ' . basename($e->getFile()) . ':' . $e->getLine();
        }
        try {
            $reviews = Repo::reviewAssignment()->getCollector()->filterBySubmissionIds([$sid])->getMany()
                ->filter(fn ($ra) => in_array($ra->getId(), $out['exportableReviewIds']))->values()->all();
            if ($reviews) {
                $errs = [];
                $rxml = $plugin->exportXML($reviews, $plugin->getPeerReviewFilter(), $context, true, $errs);
                preg_match_all('#<peer_review\b.*?</peer_review>#s', $rxml, $prs);
                foreach ($prs[0] as $pr) {
                    preg_match('#<doi>([^<]*)</doi>#', $pr, $d);
                    preg_match('#<person_name.*?</person_name>|<anonymous[^>]*/?>#s', $pr, $who);
                    $out['peerReviews'][] = ['doi' => $d[1] ?? null, 'contributor' => isset($who[0]) ? preg_replace('/\s+/', ' ', $who[0]) : null];
                }
            }
        } catch (\Throwable $e) {
            $out['reviewException'] = get_class($e) . ': ' . $e->getMessage() . ' at ' . basename($e->getFile()) . ':' . $e->getLine();
        }
        echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    }

}

$tool = new CrossmarkRead(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
