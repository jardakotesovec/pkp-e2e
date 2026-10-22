<?php
// pkp-lib-8920 helper: run ONE search job by hand; the rest of the shared queue is left alone.
//
//   PKP_CONFIG_FILE=<fleet config> php run-one.php <app root> queued <jobId>
//       runs the queued job's own command (the row's serialized payload), then deletes the row, as the
//       worker does on success; prints {"ran": <job id>, "class": <job class>}.
//   PKP_CONFIG_FILE=<fleet config> php run-one.php <app root> index <submissionId>
//       runs UpdateSubmissionSearchJob for that submission, the job a publish queues (main and 3.5);
//       prints {"indexed": <submission id>}.
//
// Works on main and stable-3_5_0 (both have PKP\jobs\submissions\UpdateSubmissionSearchJob).
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

class RunOne extends \PKP\cliTool\CommandLineTool
{
    public function execute()
    {
        [$mode, $id] = [$this->argv[0] ?? '', (int) ($this->argv[1] ?? 0)];
        if ($mode === 'queued') {
            $payload = \Illuminate\Support\Facades\DB::table('jobs')->where('id', $id)->value('payload');
            if (!$payload) {
                echo json_encode(['error' => "no job $id"]) . "\n";
                exit(1);
            }
            $command = unserialize(json_decode($payload, true)['data']['command']);
            $command->handle();
            \Illuminate\Support\Facades\DB::table('jobs')->where('id', $id)->delete();
            echo json_encode(['ran' => $id, 'class' => get_class($command)]) . "\n";
            return;
        }
        if ($mode === 'index') {
            (new \PKP\jobs\submissions\UpdateSubmissionSearchJob($id))->handle();
            echo json_encode(['indexed' => $id]) . "\n";
            return;
        }
        echo "usage: run-one.php <app root> queued <jobId> | index <submissionId>\n";
        exit(1);
    }
}
$tool = new RunOne(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
