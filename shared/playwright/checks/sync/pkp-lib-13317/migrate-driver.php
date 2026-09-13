<?php
/**
 * Kept check for pkp/pkp-lib#13317 (issue #13274), the upgrade half. Drives
 * I7135_CreateNewRorRegistryCacheTables::migrateAffiliations() against legacy
 * author_settings rows planted on the authors of the submissions `migration.js`
 * seeded, once with the cache marked complete and once marked failed, and prints
 * the resulting author_affiliations rows as JSON. Run from the app root with the
 * test config (migration.js does this):
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> <json case file>
 * The case file: {"complete": true|false, "cases": [{"authorId": n, "affiliation": {"en": "..."}|null, "rorId": "..."|null}], "cache": ["https://ror.org/..."]}
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use Illuminate\Support\Facades\DB;

class MigrateAffiliationsDriver extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        $spec = json_decode(file_get_contents($this->argv[0]), true);
        $authorIds = array_column($spec['cases'], 'authorId');

        DB::table('author_affiliation_settings')->whereIn('author_affiliation_id', DB::table('author_affiliations')->whereIn('author_id', $authorIds)->pluck('author_affiliation_id'))->delete();
        DB::table('author_affiliations')->whereIn('author_id', $authorIds)->delete();
        DB::table('author_settings')->whereIn('author_id', $authorIds)->whereIn('setting_name', ['affiliation', 'rorId'])->delete();
        foreach ($spec['cases'] as $case) {
            foreach (($case['affiliation'] ?? []) as $locale => $text) {
                DB::table('author_settings')->insert(['author_id' => $case['authorId'], 'locale' => $locale, 'setting_name' => 'affiliation', 'setting_value' => $text]);
            }
            if (!empty($case['rorId'])) {
                DB::table('author_settings')->insert(['author_id' => $case['authorId'], 'locale' => '', 'setting_name' => 'rorId', 'setting_value' => $case['rorId']]);
            }
        }
        foreach ($spec['cache'] ?? [] as $ror) {
            if (!DB::table('rors')->where('ror', $ror)->exists()) {
                $rorId = DB::table('rors')->insertGetId(['ror' => $ror, 'display_locale' => 'en', 'is_active' => 1, 'search_phrase' => $ror], 'ror_id');
                DB::table('ror_settings')->insert(['ror_id' => $rorId, 'locale' => 'en', 'setting_name' => 'name', 'setting_value' => 'Cached record ' . $ror]);
            }
        }

        $migration = (new ReflectionClass(\PKP\migration\upgrade\v3_5_0\I7135_CreateNewRorRegistryCacheTables::class))->newInstanceWithoutConstructor();
        $migration->migrateAffiliations((bool) $spec['complete']);

        $result = [];
        foreach ($spec['cases'] as $case) {
            $rows = DB::table('author_affiliations')->where('author_id', $case['authorId'])->get();
            $result[] = [
                'case' => $case,
                'rows' => $rows->map(fn ($row) => [
                    'ror' => $row->ror,
                    'names' => DB::table('author_affiliation_settings')->where('author_affiliation_id', $row->author_affiliation_id)->where('setting_name', 'name')->pluck('setting_value', 'locale')->all(),
                ])->values()->all(),
            ];
        }
        echo json_encode(['complete' => (bool) $spec['complete'], 'results' => $result], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
    }
}

$tool = new MigrateAffiliationsDriver($argv ?? []);
$tool->execute();
