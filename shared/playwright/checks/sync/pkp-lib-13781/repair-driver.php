<?php
/**
 * Kept check for pkp/pkp-lib#13781 / #13780 (issue pkp/pkp-lib#13778): runs
 * I13778_RepairRenamedLocaleDefaults::up() on its own against the database the
 * config names, the way the upgrade's last 3.5.0 step would, so a database
 * already upgraded with the broken defaults can be repaired and inspected
 * (inspect.sh beside it). Run from the app root:
 *   PKP_CONFIG_FILE=$PWD/config.test.ds<n>.inc.php php <this file> [--proposed]
 * --proposed runs proposed-fix.php beside it (the report's proposed fix) instead.
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

class RepairRenamedLocaleDefaultsDriver extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        $class = \PKP\migration\upgrade\v3_5_0\I13778_RepairRenamedLocaleDefaults::class;
        if (in_array('--proposed', $this->argv)) {
            require_once __DIR__ . '/proposed-fix.php';
            $class = \PKPE2E\proposed\I13778_RepairRenamedLocaleDefaultsProposed::class;
        }
        $migration = (new ReflectionClass($class))->newInstanceWithoutConstructor();
        $start = microtime(true);
        $migration->up();
        printf("%s ran in %.2fs\n", $class, microtime(true) - $start);
    }
}

$tool = new RepairRenamedLocaleDefaultsDriver($argv ?? []);
$tool->execute();
