<?php
// PR review of pkp/pkp-lib#13807 (crossref-ojs#123, crossref-ops#80 on stable-3_4_0, where walk.js of
// checks/issues/crossref-title-ampersand-italic-codes does not drive the screens). On a dataset fleet: turns
// DOIs on (prefix 10.1234, articles/preprints, agency Crossref, the Crossref plugin enabled with a depositor),
// stores each work's "Title", "Subtitle" and "Prefix" as the rich-text boxes save them, assigns its DOI and
// builds the Crossref file with the plugin's own exportXML() (validation off). Prints one JSON line: per work
// the stored parts and the file's <titles>. WRITES to the fleet's database.
// Usage: PKP_CONFIG_FILE=<config> php8.2 drive.php <app root> <contextPath> <id>[|<title>|<subtitle>|<prefix>]...
//   a part given as "-" (or left out) is left as stored.
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use APP\facades\Repo;
use PKP\context\Context;
use PKP\db\DAORegistry;
use PKP\plugins\PluginRegistry;

class Pr13807Drive extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        $args = $this->argv;
        $path = array_shift($args);
        $contextDao = Application::getContextDAO();
        $context = $contextDao->getByPath($path);
        $context->setData(Context::SETTING_ENABLE_DOIS, true);
        $context->setData(Context::SETTING_DOI_PREFIX, '10.1234');
        $context->setData(Context::SETTING_ENABLED_DOI_TYPES, [Repo::doi()::TYPE_PUBLICATION]);
        $context->setData(Context::SETTING_CONFIGURED_REGISTRATION_AGENCY, 'crossrefplugin');
        $contextDao->updateObject($context);
        $pluginSettings = DAORegistry::getDAO('PluginSettingsDAO');
        $pluginSettings->updateSetting($context->getId(), 'crossrefplugin', 'enabled', true, 'bool');
        $pluginSettings->updateSetting($context->getId(), 'crossrefplugin', 'depositorName', 'Public Knowledge Project', 'string');
        $pluginSettings->updateSetting($context->getId(), 'crossrefplugin', 'depositorEmail', 'dbarnes@mailinator.com', 'string');
        $context = $contextDao->getById($context->getId());
        PluginRegistry::loadCategory('generic', true, $context->getId());
        PluginRegistry::loadCategory('importexport', true, $context->getId());
        $plugin = PluginRegistry::getPlugin('importexport', 'CrossrefExportPlugin');
        $out = ['app' => Application::get()->getName(), 'plugin' => (bool) $plugin, 'works' => []];
        foreach ($args as $arg) {
            $parts = explode('|', $arg);
            $id = (int) array_shift($parts);
            $submission = Repo::submission()->get($id);
            $publication = $submission->getCurrentPublication();
            $edit = [];
            foreach (['title', 'subtitle', 'prefix'] as $i => $key) {
                if (isset($parts[$i]) && $parts[$i] !== '-') {
                    $edit[$key] = ['en' => $parts[$i]];
                }
            }
            if ($edit) {
                Repo::publication()->edit($publication, $edit);
            }
            $submission = Repo::submission()->get($id);
            Repo::submission()->createDois($submission);
            $submission = Repo::submission()->get($id);
            $publication = $submission->getCurrentPublication();
            $work = ['stored' => [
                'prefix' => $publication->getData('prefix', 'en'),
                'title' => $publication->getData('title', 'en'),
                'subtitle' => $publication->getData('subtitle', 'en'),
            ], 'doi' => $publication->getDoi()];
            try {
                $errors = [];
                $xml = $plugin->exportXML([$submission], $plugin->getSubmissionFilter(), $context, true, $errors);
                preg_match_all('#<titles>.*?</titles>#s', (string) $xml, $titles);
                $work['titles'] = array_map(fn ($t) => preg_replace('/\s+/', ' ', $t), $titles[0]);
                $dom = new DOMDocument();
                $work['wellFormed'] = $xml ? (bool) @$dom->loadXML($xml) : false;
                $work['errors'] = $errors;
            } catch (\Throwable $e) {
                $work['exception'] = get_class($e) . ': ' . substr($e->getMessage(), 0, 400) . ' at ' . basename($e->getFile()) . ':' . $e->getLine();
            }
            $out['works'][$id] = $work;
        }
        echo json_encode($out, JSON_UNESCAPED_UNICODE), "\n";
    }
}

$tool = new Pr13807Drive(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
