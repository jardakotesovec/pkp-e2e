<?php
/**
 * PR review pkp-lib#13690 (PRs #13692 main, #13691 stable-3_5_0): the
 * PluginSettingsDAO deletes that filtered on `plugin_Name`, driven straight
 * through the DAO on the install's PostgreSQL database, for the paths the
 * custom-block walk (checks/issues/custom-block-delete-fails-postgresql)
 * does not reach:
 *   A. deleteSetting(): one row of a scratch plugin goes, its neighbour stays
 *   B. deleteSettingsByPlugin(): every row of the scratch plugin in context 1
 *      goes; the same plugin's site-wide row (context NULL) and a neighbour
 *      plugin's row stay
 *   C. ThemePlugin::saveOption($name, ''): the default theme's "typography" ("baseColour" is validated to null first, never '')
 *      saved, then saved as '' (the branch that calls deleteSetting())
 * Each step reports the exception class and SQLSTATE line, if any, and the
 * rows left. The scratch rows are removed afterwards with plain SQL.
 *
 * Usage: PKP_CONFIG_FILE=<fleet config> php settings-driver.php <appRoot>
 */
define('APP_ROOT', $argv[1]);
require_once APP_ROOT . '/tools/bootstrap.php';

use Illuminate\Support\Facades\DB;
use PKP\db\DAORegistry;
use PKP\plugins\PluginRegistry;

class PkpLib13690Driver extends \PKP\cliTool\CommandLineTool
{
    private const P = 'e2eprobe13690plugin';
    private const N = 'e2eprobe13690neighbour';

    private function rows(string $plugin): array
    {
        return DB::table('plugin_settings')->where('plugin_name', $plugin)
            ->orderBy('context_id')->orderBy('setting_name')
            ->get(['context_id', 'setting_name'])
            ->map(fn ($r) => ($r->context_id ?? 'null') . ':' . $r->setting_name)->all();
    }

    private function seed(): void
    {
        $this->clean();
        foreach ([[self::P, 1, 'a'], [self::P, 1, 'b'], [self::P, null, 'a'], [self::N, 1, 'a']] as [$p, $c, $s]) {
            DB::table('plugin_settings')->insert(['plugin_name' => $p, 'context_id' => $c, 'setting_name' => $s, 'setting_value' => 'v', 'setting_type' => 'string']);
        }
    }

    private function clean(): void
    {
        DB::table('plugin_settings')->whereIn('plugin_name', [self::P, self::N])->delete();
    }

    private function attempt(callable $fn): array
    {
        try {
            $fn();
            return ['ok' => true];
        } catch (\Throwable $e) {
            $msg = preg_split('/\R/', $e->getMessage())[0];
            return ['ok' => false, 'exception' => get_class($e), 'message' => substr($msg, 0, 160)];
        }
    }

    public function execute(): void
    {
        $dao = DAORegistry::getDAO('PluginSettingsDAO'); /** @var \PKP\plugins\PluginSettingsDAO $dao */
        $out = ['driver' => DB::connection()->getDriverName()];

        $this->seed();
        $out['A_deleteSetting'] = $this->attempt(fn () => $dao->deleteSetting(1, self::P, 'a'))
            + ['left' => $this->rows(self::P), 'neighbour' => $this->rows(self::N)];

        $this->seed();
        $out['B_deleteSettingsByPlugin'] = $this->attempt(fn () => $dao->deleteSettingsByPlugin(1, self::P))
            + ['left' => $this->rows(self::P), 'neighbour' => $this->rows(self::N)];
        $this->clean();

        PluginRegistry::loadCategory('themes', true, 1);
        $theme = PluginRegistry::getPlugin('themes', 'defaultthemeplugin');
        $theme->init();
        $name = $theme->getName();
        $before = DB::table('plugin_settings')->where('plugin_name', $name)->where('context_id', 1)->where('setting_name', 'typography')->first();
        $set = $this->attempt(fn () => $theme->saveOption('typography', 'lato', 1));
        $afterSet = DB::table('plugin_settings')->where('plugin_name', $name)->where('context_id', 1)->where('setting_name', 'typography')->value('setting_value');
        $clear = $this->attempt(fn () => $theme->saveOption('typography', '', 1));
        $afterClear = DB::table('plugin_settings')->where('plugin_name', $name)->where('context_id', 1)->where('setting_name', 'typography')->value('setting_value');
        $out['C_saveOption_empty'] = ['plugin' => $name, 'set' => $set, 'valueAfterSet' => $afterSet, 'clear' => $clear, 'valueAfterClear' => $afterClear];
        // Put the dataset's own row back as it was.
        DB::table('plugin_settings')->where('plugin_name', $name)->where('context_id', 1)->where('setting_name', 'typography')->delete();
        if ($before) {
            DB::table('plugin_settings')->insert((array) $before);
        }

        echo json_encode($out, JSON_UNESCAPED_SLASHES), "\n";
    }
}

(new PkpLib13690Driver($argv))->execute();
