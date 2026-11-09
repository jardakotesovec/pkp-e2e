<?php
// Read-only: why CrossrefCitationDoiCheckTask finds nothing to check (PR review pkp-lib#13591 round 2).
require dirname(getenv('APP_ROOT')) . '/' . basename(getenv('APP_ROOT')) . '/tools/bootstrap.php';
use PKP\plugins\PluginRegistry; use APP\facades\Repo;
class Gates extends \PKP\cliTool\CommandLineTool {
  public function execute() {
    PluginRegistry::loadCategory('generic', true);
    $p = PluginRegistry::getPlugin('generic', 'crossrefplugin');
    if (getenv('SEED')) { foreach (['username' => 'u45pr13591', 'password' => 'u45pr13591'] as $k => $v) { $p->updateSetting(1, $k, $v); } echo "seeded credentials\n"; }
    echo 'plugin: ', $p ? get_class($p) : 'none', "\n";
    foreach (\APP\core\Application::getContextDAO()->getAll(true)->toIterator() as $j) {
      $id = $j->getId();
      echo "journal $id enabled=", var_export($p->getEnabled($id), true), ' citations=', var_export($p->citationsEnabled($id), true), ' creds=', var_export($p->hasCrossrefCredentials($id), true), "\n";
      $h = $p->getCitationDoiHandler();
      $ids = Repo::submission()->getIdsBySetting($h->getAutoCheckSettingName(), true, $id)->toArray();
      echo "  flagged submissions: ", json_encode($ids), "\n";
    }
  }
}
(new Gates($argv ?? []))->execute();
