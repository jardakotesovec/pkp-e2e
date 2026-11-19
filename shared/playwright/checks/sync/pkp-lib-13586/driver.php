<?php
/**
 * Kept check for pkp/pkp-lib#13586 (issue #12705): drives SettingsBuilder's
 * query-path delete, update and select() against announcements planted in a
 * fresh install, each case in a transaction that is rolled back, and prints
 * one JSON line per case (the outcome, the warnings raised, the rows left).
 * Run from the app root, at the PR's merge result and at its base:
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file>
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use Illuminate\Support\Facades\DB;
use PKP\announcement\Announcement;

class SettingsBuilderDriver extends \PKP\cliTool\CommandLineTool
{
    private function plant(string $title, ?int $typeId = null): int
    {
        $id = DB::table('announcements')->insertGetId(['assoc_type' => 256, 'assoc_id' => 1, 'type_id' => $typeId, 'date_posted' => '2026-01-01 00:00:00'], 'announcement_id');
        DB::table('announcement_settings')->insert(['announcement_id' => $id, 'locale' => 'en', 'setting_name' => 'title', 'setting_value' => $title]);
        return $id;
    }

    private function state(array $ids): array
    {
        return array_map(fn ($id) => [
            'id' => $id,
            'row' => DB::table('announcements')->where('announcement_id', $id)->exists(),
            'title' => DB::table('announcement_settings')->where('announcement_id', $id)->where('setting_name', 'title')->value('setting_value'),
        ], $ids);
    }

    private function run(string $name, callable $case): void
    {
        $warnings = [];
        set_error_handler(function ($no, $str) use (&$warnings) { $warnings[] = $str; return true; });
        DB::beginTransaction();
        try {
            $out = ['case' => $name, 'result' => $case()];
        } catch (\Throwable $e) {
            $out = ['case' => $name, 'error' => get_class($e) . ': ' . strtok($e->getMessage(), "\n")];
        } finally {
            restore_error_handler();
            DB::rollBack();
        }
        $out['warnings'] = array_values(array_unique($warnings));
        echo json_encode($out, JSON_UNESCAPED_SLASHES), "\n";
    }

    public function execute(): void
    {
        $typeA = DB::table('announcement_types')->insertGetId(['context_id' => 1], 'type_id');
        $typeB = DB::table('announcement_types')->insertGetId(['context_id' => 1], 'type_id');
        try {
            // The reviewer's case: a delete filtered on a setting
            $this->run('delete where title', function () {
                $x = $this->plant('X'); $y = $this->plant('Y');
                $n = Announcement::query()->where('title', 'X')->delete();
                return ['returned' => $n, 'state' => $this->state([$x, $y])];
            });
            // The issue's item 2: a delete filtered on a primary column
            $this->run('delete whereKey', function () {
                $x = $this->plant('X'); $y = $this->plant('Y');
                $n = Announcement::query()->whereKey($x)->delete();
                return ['returned' => $n, 'state' => $this->state([$x, $y])];
            });
            // The issue's item 1: a settings update through the query
            $this->run('update whereKey title', function () {
                $x = $this->plant('X'); $y = $this->plant('Y');
                $n = Announcement::query()->whereKey($x)->update(['title' => ['en' => 'X2']]);
                return ['returned' => $n, 'state' => $this->state([$x, $y])];
            });
            // A settings update filtered on the same setting, with a primary value
            $this->run('update where title, title and type_id', function () use ($typeA) {
                $x = $this->plant('X'); $y = $this->plant('Y');
                $n = Announcement::query()->where('title', 'X')->update(['title' => ['en' => 'X2'], 'type_id' => $typeA]);
                return ['returned' => $n, 'state' => $this->state([$x, $y]), 'types' => DB::table('announcements')->whereIn('announcement_id', [$x, $y])->orderBy('announcement_id')->pluck('type_id')->all()];
            });
            // The issue's item 3
            $this->run('select title', function () {
                $x = $this->plant('X');
                return Announcement::query()->select(['title'])->find($x)?->getAttributes();
            });
            // select() of one primary column with distinct: one row per distinct value expected
            $this->run('select type_id distinct', function () use ($typeA, $typeB) {
                foreach ([$typeA, $typeA, $typeA, $typeB] as $t) { $this->plant('T', $t); }
                return Announcement::query()->whereIn('type_id', [$typeA, $typeB])->select('type_id')->distinct()->get()->map(fn ($m) => $m->getAttributes())->all();
            });
            // select() of one primary column with groupBy
            $this->run('select type_id groupBy', function () use ($typeA, $typeB) {
                foreach ([$typeA, $typeA, $typeB] as $t) { $this->plant('T', $t); }
                return Announcement::query()->whereIn('type_id', [$typeA, $typeB])->select('type_id')->groupBy('type_id')->get()->map(fn ($m) => $m->getAttributes())->all();
            });
            // select() of table-qualified columns with a join to a table that shares a column name
            $this->run('join, qualified select', function () use ($typeA) {
                $x = $this->plant('X', $typeA);
                return Announcement::query()
                    ->join('announcement_types', 'announcement_types.type_id', '=', 'announcements.type_id')
                    ->where('announcements.announcement_id', $x)
                    ->select(['announcements.announcement_id', 'announcements.type_id', 'title'])
                    ->get()->map(fn ($m) => $m->getAttributes())->all();
            });
            // The same join, selecting primary columns only
            $this->run('join, qualified select of primary columns', function () use ($typeA) {
                $x = $this->plant('X', $typeA);
                return Announcement::query()
                    ->join('announcement_types', 'announcement_types.type_id', '=', 'announcements.type_id')
                    ->where('announcements.announcement_id', $x)
                    ->select(['announcements.announcement_id', 'announcements.type_id'])
                    ->get()->map(fn ($m) => array_keys($m->getAttributes()))->all();
            });
            // A query-path delete with a join to a table that has the primary key's column
            $this->run('join, delete', function () {
                $x = $this->plant('X'); $y = $this->plant('Y');
                $n = Announcement::query()
                    ->join('announcement_settings as s', 's.announcement_id', '=', 'announcements.announcement_id')
                    ->where('s.setting_value', 'X')
                    ->delete();
                return ['returned' => $n, 'state' => $this->state([$x, $y])];
            });
        } finally {
            DB::table('announcement_types')->whereIn('type_id', [$typeA, $typeB])->delete();
        }
    }
}

$tool = new SettingsBuilderDriver($argv ?? []);
$tool->execute();
