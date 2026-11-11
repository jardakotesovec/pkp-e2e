<?php
/**
 * PR review check for pkp/pkp-lib#13779: drives I7191_InstallSubmissionHelpDefaults::getContextName()
 * on the corner cases the 3.3 dataset does not hold, against an upgraded dataset fleet's context 1.
 * Each case replaces the context's `name` rows inside a transaction that is rolled back, so the
 * database is left as it was. Run from the app root (context-names.sh does this):
 *   PKP_CONFIG_FILE=$PWD/config.test.ds1.inc.php php <this file>
 * Prints one JSON line per case and preferred locale: the name returned, or the exception.
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use Illuminate\Support\Facades\DB;

class ContextNameDriver extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        $migration = (new ReflectionClass(\APP\migration\upgrade\v3_4_0\I7191_InstallSubmissionHelpDefaults::class))->newInstanceWithoutConstructor();
        $table = (new ReflectionProperty($migration, 'CONTEXT_SETTINGS_TABLE'))->getValue($migration);
        $column = (new ReflectionProperty($migration, 'CONTEXT_COLUMN'))->getValue($migration);
        $method = new ReflectionMethod($migration, 'getContextName');

        // primary locale 'en' throughout, as the dataset's context is
        $cases = [
            'two names' => ['en' => 'Name EN', 'fr_CA' => 'Nom FR'],
            'three names' => ['en' => 'Name EN', 'fr_CA' => 'Nom FR', 'es' => 'Nombre ES'],
            'preferred empty' => ['en' => 'Name EN', 'fr_CA' => ''],
            'primary empty' => ['en' => '', 'fr_CA' => 'Nom FR', 'es' => 'Nombre ES'],
            'preferred and primary missing' => ['de' => 'Name DE'],
            'all empty' => ['en' => '', 'fr_CA' => ''],
        ];
        foreach ($cases as $name => $rows) {
            foreach (['en', 'fr_CA', 'es'] as $preferred) {
                DB::beginTransaction();
                try {
                    DB::table($table)->where($column, 1)->where('setting_name', 'name')->delete();
                    foreach ($rows as $locale => $value) {
                        DB::table($table)->insert([$column => 1, 'locale' => $locale, 'setting_name' => 'name', 'setting_value' => $value]);
                    }
                    $result = ['returned' => $method->invoke($migration, 1, $preferred, 'en')];
                } catch (Throwable $e) {
                    $result = ['exception' => $e->getMessage()];
                } finally {
                    DB::rollBack();
                }
                echo json_encode(['case' => $name, 'preferred' => $preferred] + $result, JSON_UNESCAPED_UNICODE), "\n";
            }
        }
    }
}

$tool = new ContextNameDriver($argv ?? []);
$tool->execute();
