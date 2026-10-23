<?php
/**
 * Kept check for the omp-stable-3_5_0 / omp-main Cypress flakes of 2026-10-23
 * (CallanSubmission.cy.js:168 waiting for epilogue.pdf, Z_MonographViewDCMetadata.cy.js:501
 * waiting for chapter3.pdf): both tick the first file of "Select Files" (the proof files grid,
 * whose rows come from Repo::submissionFile()->getCollector() in SubmissionFilesCategoryGridDataProvider),
 * expecting the newest upload, and the Collector sorts by created_at alone (one-second precision).
 *
 * On PKP's default dataset, in a transaction that is rolled back (nothing is stored), the Callan
 * submission's submission-stage files are given equal created_at values, as a fast runner does,
 * and the Collector's order is read:
 *   pair  chapter4.pdf and epilogue.pdf in the same second (the failed CI runs' shape)
 *   all   all six files in the same second
 * Reads fixed when every case's `first` is epilogue.pdf and `order` is by submission_file_id
 * descending (fix-<line>.diff). Run from the app root:
 *   PKP_CONFIG_FILE=$PWD/config.test.ds<n>.inc.php php <this file>
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\facades\Repo;
use Illuminate\Support\Facades\DB;
use PKP\submissionFile\SubmissionFile;

class ProofFileOrderDriver extends \PKP\cliTool\CommandLineTool
{
    /** The Collector's order of the submission's submission-stage files, as the grid lists them. */
    protected function order(int $submissionId): array
    {
        $names = [];
        foreach (Repo::submissionFile()->getCollector()->filterBySubmissionIds([$submissionId])->getMany() as $id => $file) {
            if ($file->getData('fileStage') == SubmissionFile::SUBMISSION_FILE_SUBMISSION) {
                $names[] = $id . ':' . $file->getLocalizedData('name', 'en');
            }
        }
        return $names;
    }

    public function execute(): void
    {
        $files = DB::table('submission_files as sf')
            ->join('submission_file_settings as s', function ($join) {
                $join->on('s.submission_file_id', '=', 'sf.submission_file_id')
                    ->where('s.setting_name', 'name')->where('s.locale', 'en');
            })
            ->where('sf.file_stage', SubmissionFile::SUBMISSION_FILE_SUBMISSION)
            ->whereIn('sf.submission_id', DB::table('submission_files as e')
                ->join('submission_file_settings as es', 'es.submission_file_id', '=', 'e.submission_file_id')
                ->where('es.setting_value', 'epilogue.pdf')
                ->select('e.submission_id'))
            ->orderBy('sf.submission_file_id')
            ->get(['sf.submission_id', 'sf.submission_file_id', 'sf.created_at', 's.setting_value as name']);
        $submissionId = (int) $files->first()->submission_id;
        $ids = $files->pluck('submission_file_id', 'name');
        $epilogueAt = $files->firstWhere('name', 'epilogue.pdf')->created_at;

        $out = ['submissionId' => $submissionId, 'stored' => $files->map(fn ($f) => $f->submission_file_id . ':' . $f->name . ' ' . $f->created_at)->all()];
        $out['asStored'] = $this->order($submissionId);
        $cases = [
            'pair' => [$ids['chapter4.pdf'], $ids['epilogue.pdf']],
            'all' => $ids->values()->all(),
        ];
        foreach ($cases as $case => $tied) {
            DB::beginTransaction();
            try {
                DB::table('submission_files')->whereIn('submission_file_id', $tied)->update(['created_at' => $epilogueAt]);
                $order = $this->order($submissionId);
            } finally {
                DB::rollBack();
            }
            $out[$case] = ['tied' => $tied, 'first' => explode(':', $order[0])[1], 'order' => $order];
        }
        echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    }
}

$tool = new ProofFileOrderDriver($argv ?? []);
$tool->execute();
