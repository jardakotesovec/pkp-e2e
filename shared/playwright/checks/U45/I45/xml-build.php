<?php
// Read-only helper of i45.js (U45 claim check I45): builds each given work's Crossref XML with the agency's own
// export plugin, format check off (the file "Export DOIs" would download, which the test installs never download:
// the schema fetch goes to the dead [proxy]), and writes it to the path given. OJS and OPS. Prints one JSON line per
// work: bytes, records, DOIs, contributors (surnames), or the exception's class, message and place. Writes nothing
// in the install (the plugin's export writes no temporary file on this path).
// Usage: PKP_CONFIG_FILE=<fleet config> php xml-build.php <app root> <contextPath> <submissionId>=<out.xml>...
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use APP\facades\Repo;
use PKP\plugins\PluginRegistry;

class I45XmlBuild extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        $args = $this->argv;
        $path = array_shift($args);
        $context = Application::getContextDAO()->getByPath($path);
        PluginRegistry::loadCategory('generic', true, $context->getId());
        PluginRegistry::loadCategory('importexport', true, $context->getId());
        $agency = $context->getConfiguredDoiAgency();
        if (method_exists($agency, '_getExportPlugin')) {
            $m = new \ReflectionMethod($agency, '_getExportPlugin');
            $m->setAccessible(true);
            $plugin = $m->invoke($agency);
        } else {
            $plugin = PluginRegistry::getPlugin('importexport', 'CrossrefExportPlugin');
        }
        foreach ($args as $pair) {
            [$id, $out] = explode('=', $pair, 2);
            $res = ['id' => (int) $id];
            try {
                $submission = Repo::submission()->get((int) $id);
                $errs = [];
                $xml = $plugin->exportXML([$submission], $plugin->getSubmissionFilter(), $context, true, $errs);
                file_put_contents($out, $xml);
                preg_match_all('#<doi>([^<]*)</doi>#', $xml, $dois);
                preg_match_all('#<surname>([^<]*)</surname>#', $xml, $surnames);
                preg_match_all('#<(journal_article|posted_content)\b#', $xml, $records);
                $res += ['bytes' => strlen($xml), 'records' => $records[1], 'dois' => $dois[1], 'surnames' => $surnames[1], 'file' => basename($out)];
            } catch (\Throwable $e) {
                $res += ['exception' => get_class($e), 'message' => substr($e->getMessage(), 0, 500), 'at' => str_replace($root . '/', '', $e->getFile()) . ':' . $e->getLine()];
            }
            echo json_encode($res), "\n";
        }
    }
}

$tool = new I45XmlBuild(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
