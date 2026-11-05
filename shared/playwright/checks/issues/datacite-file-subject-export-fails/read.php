<?php
// Read-only helper of walk.js (issue report docs/issues/U45-OJS13-datacite-file-subject-export-fails.md).
// "Export DOIs" and "Deposit DOIs" build one DataCite record per item: the work (when "Articles" is a DOI kind)
// and each galley of its current version that has a DOI. The test installs cannot fetch DataCite's schema, so
// this builds the same records with the plugin's own exportXML() and filters, validation off, and prints one
// JSON line: per object, its <subject> elements and resourceType, or the exception the build threw (with its
// file and line). Writes nothing. OJS `main` and stable-3_5_0.
// Usage: PKP_CONFIG_FILE=<the install's config> php read.php <app root> <contextPath> <submissionId>
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use APP\facades\Repo;
use PKP\plugins\PluginRegistry;

class Ojs13DataciteRead extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        [$path, $id] = $this->argv;
        $context = Application::getContextDAO()->getByPath($path);
        PluginRegistry::loadCategory('generic', true, $context->getId());
        PluginRegistry::loadCategory('importexport', true, $context->getId());
        $plugin = PluginRegistry::getPlugin('importexport', 'DataciteExportPlugin');
        $submission = Repo::submission()->get((int) $id);
        $publication = $submission->getCurrentPublication();
        $objects = [['work', $submission->getId(), null, $submission, $plugin->getSubmissionFilter(), $publication->getDoi()]];
        foreach ($publication->getData('galleys') as $galley) {
            $objects[] = ['galley', $galley->getId(), $galley->getLabel(), $galley, $plugin->getRepresentationFilter(), $galley->getDoi()];
        }
        $out = ['agency' => $context->getData('registrationAgency'), 'enabledDoiTypes' => $context->getData('enabledDoiTypes'), 'objects' => []];
        foreach ($objects as [$kind, $oid, $label, $object, $filter, $doi]) {
            $row = ['kind' => $kind, 'id' => $oid, 'label' => $label, 'doi' => $doi];
            if (!$doi) {
                $row['skipped'] = 'no DOI';
            } else {
                set_error_handler(function ($no, $str, $file, $line) use (&$row) {
                    $row['warnings'][] = $str . ' at ' . basename($file) . ':' . $line;
                    return true;
                });
                try {
                    $errors = [];
                    $xml = $plugin->exportXML($object, $filter, $context, true, $errors);
                    preg_match_all('#<subject\b[^>]*>(.*?)</subject>#s', $xml, $m);
                    $row['subjects'] = $m[1];
                    preg_match('#<resourceType\b[^>]*/?>#', $xml, $rt);
                    $row['resourceType'] = $rt[0] ?? null;
                } catch (\Throwable $e) {
                    $row['exception'] = get_class($e) . ': ' . substr($e->getMessage(), 0, 300) . ' at ' . basename($e->getFile()) . ':' . $e->getLine();
                }
                restore_error_handler();
            }
            $out['objects'][] = $row;
        }
        echo json_encode($out), "\n";
    }
}

$tool = new Ojs13DataciteRead(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
