<?php
/**
 * Kept check for pkp/pkp-lib#13119 / pkp/ojs#5715 / pkp/crossref-ojs#112 (issue pkp/pkp-lib#13062, regression read
 * rr13062, 2026-10-28): what the DataCite and the Crossref peer-review exports carry for given reviews, built with
 * each agency's own export plugin and XML validation off (the test installs reach no agency). OJS only. Writes
 * nothing to the database: each XML goes to <outDir>/<label>-r<reviewId>-<agency>.xml.
 *
 * For each review id it prints (one JSON line at the end):
 *   meta      review method, reviewer username, round, the round's publication, the current publication,
 *             date_completed, last_modified, considered dates, the review's DOI and status
 *   datacite  (only where the DataCite export plugin has getPeerReviewFilter(), i.e. pkp/ojs#5715 and later;
 *             at the base it prints {"na": "no DataCite review export at this ref"}):
 *             titles, dates, creators block, relatedIdentifiers, resourceType, alternateIdentifiers, the
 *             kernel-4 XSD verdict (--xsd <metadata.xsd>), PHP warnings/deprecations raised while building, the
 *             exception if any, and identity hits (which of the reviewer's names, username, email, ORCID,
 *             affiliations appear anywhere in the file)
 *   crossref  title, resource URL (host stripped), contributors block, warnings, exception, identity hits
 * With --all, the Crossref export of all the given reviews in one file too (the Deposit path), its titles in order.
 * With --as-request, the request's router is given the journal as its context first (what an "Export DOIs" web
 * request has); without it the build runs as the CLI / queue worker does (no request context).
 *
 * Usage (from the OJS root): PKP_CONFIG_FILE=<fleet config> php <this file> <contextPath> <outDir> [--xsd <path>]
 *        [--as-request] [--all] <reviewId>...
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use APP\facades\Repo;
use Illuminate\Support\Facades\DB;
use PKP\plugins\PluginRegistry;

class Rr13119Xml extends \PKP\cliTool\CommandLineTool
{
    protected array $warnings = [];

    protected function watched(callable $fn): array
    {
        $this->warnings = [];
        set_error_handler(function (int $no, string $message, string $file, int $line) {
            $this->warnings[] = $message . ' (' . basename($file) . ':' . $line . ')';
            return true;
        });
        try {
            return [$fn(), null, $this->warnings];
        } catch (\Throwable $e) {
            return [null, get_class($e) . ': ' . substr($e->getMessage(), 0, 400) . ' @' . basename($e->getFile()) . ':' . $e->getLine(), $this->warnings];
        } finally {
            restore_error_handler();
        }
    }

    protected function exportPlugin(string $agencyName)
    {
        $agency = PluginRegistry::getPlugin('generic', $agencyName);
        if (!$agency) {
            return null;
        }
        if (method_exists($agency, '_getExportPlugin')) {
            $m = new \ReflectionMethod($agency, '_getExportPlugin');
            $m->setAccessible(true);
            return $m->invoke($agency);
        }
        foreach (['_exportPlugin', 'exportPlugin'] as $prop) {
            if (property_exists($agency, $prop)) {
                $p = new \ReflectionProperty($agency, $prop);
                $p->setAccessible(true);
                if ($p->getValue($agency)) {
                    return $p->getValue($agency);
                }
            }
        }
        return PluginRegistry::getPlugin('importexport', 'CrossrefExportPlugin');
    }

    /** Which identifying strings of the reviewer appear in $xml. */
    protected function identityHits(string $xml, $reviewer): array
    {
        $tokens = ['username' => $reviewer->getUsername(), 'email' => $reviewer->getEmail(), 'orcid' => $reviewer->getData('orcid')];
        foreach (['givenName', 'familyName', 'affiliation'] as $field) {
            foreach ((array) $reviewer->getData($field) as $loc => $v) {
                if (is_string($v)) {
                    $tokens["{$field}.{$loc}"] = $v;
                }
            }
        }
        $hits = [];
        foreach ($tokens as $k => $v) {
            if (is_string($v) && strlen(trim($v)) >= 3) {
                $needle = preg_replace('#^https?://orcid.org/#', '', trim($v));
                if (stripos($xml, $needle) !== false || stripos($xml, htmlspecialchars($needle, ENT_COMPAT, 'UTF-8')) !== false) {
                    $hits[] = "{$k}={$v}";
                }
            }
        }
        return $hits;
    }

    protected function block(string $xml, string $tag): ?string
    {
        return preg_match("#<{$tag}\\b.*?</{$tag}>|<{$tag}\\b[^>]*/>#s", $xml, $m) ? preg_replace('/\s+/', ' ', $m[0]) : null;
    }

    public function execute()
    {
        $args = $this->argv;
        $path = array_shift($args);
        $outDir = array_shift($args);
        $xsd = null;
        if (($i = array_search('--xsd', $args)) !== false) {
            $xsd = $args[$i + 1];
            array_splice($args, $i, 2);
        }
        $asRequest = in_array('--as-request', $args);
        $all = in_array('--all', $args);
        $ids = array_map('intval', array_values(array_filter($args, fn ($a) => !str_starts_with($a, '--'))));
        @mkdir($outDir, 0777, true);

        $context = Application::getContextDAO()->getByPath($path);
        PluginRegistry::loadCategory('generic', true, $context->getId());
        PluginRegistry::loadCategory('importexport', true, $context->getId());
        if ($asRequest) {
            $router = Application::get()->getRequest()->getRouter();
            $p = new \ReflectionProperty($router, '_context');
            $p->setAccessible(true);
            $p->setValue($router, $context);
        }
        $requestContext = Application::get()->getRequest()->getContext();
        $out = ['context' => $path, 'primaryLocale' => $context->getPrimaryLocale(), 'requestContext' => $requestContext?->getPath(),
            'agency' => $context->getData('registrationAgency'), 'doiVersioning' => (bool) $context->getData('doiVersioning'), 'reviews' => []];

        $dc = $this->exportPlugin('dataciteplugin');
        $cr = $this->exportPlugin('crossrefplugin');
        $reviewsCr = [];
        foreach ($ids as $rid) {
            $ra = Repo::reviewAssignment()->get($rid);
            if (!$ra) {
                $out['reviews'][$rid] = null;
                continue;
            }
            $row = DB::table('review_assignments as ra')->leftJoin('dois as d', 'd.doi_id', '=', 'ra.doi_id')
                ->join('review_rounds as rr', 'rr.review_round_id', '=', 'ra.review_round_id')
                ->join('submissions as s', 's.submission_id', '=', 'ra.submission_id')
                ->where('ra.review_id', $rid)
                ->first(['ra.review_method', 'ra.round', 'rr.publication_id', 's.current_publication_id', 's.submission_id', 'ra.date_completed',
                    'ra.last_modified', 'ra.date_considered', 'ra.date_acknowledged', 'd.doi', 'd.status']);
            $reviewer = Repo::user()->get($ra->getReviewerId(), true);
            $o = ['meta' => (array) $row + ['reviewer' => $reviewer?->getUsername()]];

            if ($dc && method_exists($dc, 'getPeerReviewFilter')) {
                [$xml, $ex, $w] = $this->watched(function () use ($dc, $ra, $context) {
                    $errs = [];
                    return $dc->exportXML($ra, $dc->getPeerReviewFilter(), $context, true, $errs);
                });
                $d = ['exception' => $ex, 'warnings' => array_values(array_unique($w))];
                if ($xml) {
                    $file = "{$outDir}/r{$rid}-datacite.xml";
                    file_put_contents($file, $xml);
                    preg_match_all('#<title\b[^>]*>([^<]*)</title>|<title\b[^>]*/>#', $xml, $titles);
                    preg_match_all('#<date dateType="([^"]+)">([^<]*)</date>#', $xml, $dates, PREG_SET_ORDER);
                    $d += ['file' => $file, 'titles' => $titles[0], 'dates' => array_map(fn ($m) => "{$m[1]}={$m[2]}", $dates),
                        'creators' => $this->block($xml, 'creators'), 'relatedIdentifiers' => $this->block($xml, 'relatedIdentifiers'),
                        'resourceType' => $this->block($xml, 'resourceType'), 'alternateIdentifiers' => $this->block($xml, 'alternateIdentifiers'),
                        'publicationYear' => $this->block($xml, 'publicationYear'), 'language' => $this->block($xml, 'language'),
                        'identityHits' => $reviewer ? $this->identityHits($xml, $reviewer) : null];
                    if ($xsd) {
                        $doc = new \DOMDocument();
                        $doc->loadXML($xml);
                        libxml_use_internal_errors(true);
                        libxml_clear_errors();
                        $d['xsdValid'] = $doc->schemaValidate($xsd);
                        $d['xsdErrors'] = array_values(array_unique(array_map(fn ($e) => trim($e->message), libxml_get_errors())));
                        libxml_clear_errors();
                    }
                }
                $o['datacite'] = $d;
            } else {
                $o['datacite'] = ['na' => $dc ? 'no DataCite review export at this ref' : 'DataCite plugin not loaded'];
            }

            if ($cr && method_exists($cr, 'getPeerReviewFilter')) {
                [$xml, $ex, $w] = $this->watched(function () use ($cr, $ra, $context) {
                    $errs = [];
                    return $cr->exportXML([$ra], $cr->getPeerReviewFilter(), $context, true, $errs);
                });
                $c = ['exception' => $ex, 'warnings' => array_values(array_unique($w))];
                if ($xml) {
                    $file = "{$outDir}/r{$rid}-crossref.xml";
                    file_put_contents($file, $xml);
                    preg_match('#<titles>.*?</titles>#s', $xml, $t);
                    preg_match('#<resource[^>]*>([^<]*)</resource>#', $xml, $u);
                    $c += ['file' => $file, 'titles' => preg_replace('/\s+/', ' ', $t[0] ?? ''),
                        'resource' => isset($u[1]) ? preg_replace('#^https?://[^/]+#', '', html_entity_decode($u[1])) : null,
                        'contributors' => $this->block($xml, 'contributors'),
                        'identityHits' => $reviewer ? $this->identityHits(preg_replace('#<head>.*?</head>#s', '', $xml), $reviewer) : null];
                }
                $o['crossref'] = $c;
                $reviewsCr[] = $ra;
            } else {
                $o['crossref'] = ['na' => 'Crossref plugin not loaded'];
            }
            $out['reviews'][$rid] = $o;
        }
        if ($all && $cr && $reviewsCr) {
            [$xml, $ex, $w] = $this->watched(function () use ($cr, $reviewsCr, $context) {
                $errs = [];
                return $cr->exportXML($reviewsCr, $cr->getPeerReviewFilter(), $context, true, $errs);
            });
            preg_match_all('#<titles>.*?</titles>#s', (string) $xml, $t);
            $out['crossrefAll'] = ['exception' => $ex, 'titles' => array_map(fn ($x) => preg_replace('/\s+/', ' ', $x), $t[0])];
        }
        echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    }
}

$tool = new Rr13119Xml(array_merge([$argv[0]], array_slice($argv, 1)));
$tool->execute();
