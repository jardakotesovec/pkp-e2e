<?php
/**
 * Kept check for pkp/pubmedCentral#9 (pkp/pkp-lib#12356, an imported PMC delivery history): on OJS's
 * dataset fleet with the plugin dropped into plugins/generic/pubmedCentral (walk.sh does both), article 17
 * gets DOI versioning, 1.0 the DOI 10.9999/pmc9.1 and a new major 2.0 the DOI 10.9999/pmc9.2; history.csv
 * imports 1.0 as PMC v1 and a v2 OJS does not have. Each command then prints every version's package name.
 * Run from the app root:
 *   PKP_CONFIG_FILE=$PWD/config.test.ds1.inc.php php <this> setup | names
 *   … mark <pubId>      "Mark registered" (PubObjectsExportPlugin::markRegistered())
 *   … deposit <pubId>   depositXML()'s loop for one object, without the dispatch (prepareDelivery, then "submitted")
 *   … job <pubId>       PubmedCentralDeliver::handle() once the package is uploaded: one object loaded at the
 *                       start, updateStatus(registered), then recordDelivery() (the SFTP upload itself is not run)
 *   … minor <pubId>     a minor version cloned as Repo::publication()->version() clones it, settings included
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\facades\Repo;
use APP\core\Application;
use PKP\plugins\PluginRegistry;
use APP\plugins\PubObjectsExportPlugin;

class Pmc9Driver extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        $ctxDao = Application::getContextDAO();
        $context = $ctxDao->getById(1);
        $cmd = $this->argv[0] ?? 'names';
        $sid = 17;
        if ($cmd === 'setup') {
            $context->setData('doiVersioning', true);
            $ctxDao->updateObject($context);
            $pluginSettings = \PKP\db\DAORegistry::getDAO('PluginSettingsDAO');
            $pluginSettings->updateSetting(1, 'pubmedcentralplugin', 'enabled', true, 'bool');
            $pluginSettings->updateSetting(1, 'pubmedcentralexportplugin', 'nlmTitle', 'J Pub Know', 'string');
            $pub = Repo::publication()->get(18);
            $doi1 = Repo::doi()->add(Repo::doi()->newDataObject(['doi' => '10.9999/pmc9.1', 'contextId' => 1]));
            Repo::publication()->dao->update($pub->setData('doiId', $doi1) ?? $pub);
            $pub = Repo::publication()->get(18);
            // a major version 2.0, as Repo::publication()->version() would clone it, with its own DOI
            $v2 = clone $pub;
            $v2->setData('id', null);
            $v2->setData('versionMajor', 2);
            $v2->setData('versionMinor', 0);
            $v2->setData('datePublished', null);
            $v2->setData('status', \APP\publication\Publication::STATUS_QUEUED);
            $v2->setData('doiId', Repo::doi()->add(Repo::doi()->newDataObject(['doi' => '10.9999/pmc9.2', 'contextId' => 1])));
            $v2->setData('citations', null);
            $id = Repo::publication()->dao->insert($v2);
            echo "setup: pub 18 doi 10.9999/pmc9.1, new major pub $id doi 10.9999/pmc9.2\n";
            return;
        }
        PluginRegistry::loadCategory('importexport');
        $plugin = PluginRegistry::getPlugin('importexport', 'PubmedCentralExportPlugin');
        if (!$plugin) { echo "export plugin not registered\n"; return; }
        if ($cmd === 'mark') {
            $plugin->markRegistered([Repo::publication()->get((int) $this->argv[1])]);
        } elseif ($cmd === 'record') {
            $plugin->recordDelivery(Repo::publication()->get((int) $this->argv[1]), (int) $this->argv[2]);
        } elseif ($cmd === 'prepare') {
            $plugin->prepareDelivery(Repo::publication()->get((int) $this->argv[1]));
        } elseif ($cmd === 'deposit') {
            // depositXML()'s loop for one object, without the dispatch
            $object = Repo::publication()->get((int) $this->argv[1]);
            $plugin->prepareDelivery($object);
            $plugin->updateStatus($object, PubObjectsExportPlugin::EXPORT_STATUS_SUBMITTED);
        } elseif ($cmd === 'job') {
            // PubmedCentralDeliver::handle() once the package is built and uploaded: one object, loaded at the start
            $object = Repo::publication()->get((int) $this->argv[1]);
            $package = ['revision' => $plugin->packageNames($object, $context)['revision']];
            echo "job: delivered " . $plugin->packageNames($object, $context)['package'] . ".zip\n";
            $plugin->updateStatus($object, PubObjectsExportPlugin::EXPORT_STATUS_REGISTERED);
            $plugin->recordDelivery($object, $package['revision']);
        } elseif ($cmd === 'minor') {
            // a minor version, cloned as Repo::publication()->version() clones it (settings included)
            $src = Repo::publication()->get((int) $this->argv[1]);
            $m = clone $src;
            $m->setData('id', null);
            $m->setData('versionMinor', (int) $src->getData('versionMinor') + 1);
            $m->setData('citations', null);
            $m->setData('status', \APP\publication\Publication::STATUS_QUEUED);
            $id = Repo::publication()->dao->insert($m);
            echo "minor: pub $id cloned from {$src->getId()}\n";
        }
        $submission = Repo::submission()->get($sid);
        echo "submission $sid prefix=" . var_export($submission->getData('pubmedCentral::packagePrefix'), true)
            . " lastVersion=" . var_export($submission->getData('pubmedCentral::lastVersion'), true) . "\n";
        foreach ($submission->getData('publications') as $p) {
            $p = Repo::publication()->get($p->getId());
            $names = $plugin->packageNames($p, $context);
            printf("  pub %d %s %d.%d doi=%s status=%s pmc::version=%s stem=%s rev=%s -> package %s, stem %s\n",
                $p->getId(), $p->getData('versionStage'), $p->getData('versionMajor'), $p->getData('versionMinor'),
                $p->getDoi() ?? '-', var_export($p->getData('pubmedCentral::status'), true),
                var_export($p->getData('pubmedCentral::version'), true), var_export($p->getData('pubmedCentral::fileStem'), true),
                var_export($p->getData('pubmedCentral::revision'), true), $names['package'], $names['stem']);
        }
    }
}
(new Pmc9Driver($argv ?? []))->execute();
