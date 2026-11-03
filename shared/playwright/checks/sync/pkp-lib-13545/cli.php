<?php
// PR review of pkp/pkp-lib#13543 round 5 (pkp-lib 2222768ff7 "Make user nullable in case of command line usage"):
// ewhanson's question, can the export run from the CLI or a job, with no user and no context in the request?
// Calls the Body Text repository directly from a CommandLineTool (it signs in the site's first admin; the
// request has no context) on PKP's OJS dataset (fleet-prep --dataset, fleet 1):
//   H1 Repo::bodyText()->createHtmlFile() on submission 15 / publication 16 (Production, no galleys)
//   H2 the same again (a revision of H1's galley)
//   P1 Repo::bodyText()->createPdfGalley() on submission 5 / publication 6 (Production, no galleys)
//   then with the request's user cleared (as in a queued job; a CommandLineTool signs in the first admin):
//   N1 createPdfGalley() on another Production submission without galleys, N2 the same again (a revision)
//   N3 createHtmlFile() on it
// For each: the request's user and context, the exception (class, message, file:line, first pkp-lib frames) or
// the galley id, its file id, the file's revision count, submission_files.uploader_user_id, the newest event_log
// rows on the file (user_id), and the files rows before/after (a failed export must leave none).
// Writes to the dataset (it is reset before each walk). Prints one [fact] line per call.
// Usage: PKP_CONFIG_FILE=<checkout>/config.test.ds1.inc.php php cli.php <ojs root>
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use APP\facades\Repo;
use Illuminate\Support\Facades\DB;

class Pkp13543Cli extends \PKP\cliTool\CommandLineTool
{
    protected function call(string $label, callable $fn): void
    {
        $filesBefore = DB::table('files')->count();
        $out = ['call' => $label, 'requestUser' => Application::get()->getRequest()->getUser()?->getId(), 'requestContext' => Application::get()->getRequest()->getContext()?->getId()];
        try {
            $galley = $fn();
            $fileId = $galley->getData('submissionFileId');
            $out['galleyId'] = $galley->getId();
            $out['label'] = $galley->getData('label');
            $out['submissionFileId'] = $fileId;
            $out['revisions'] = count(Repo::submissionFile()->getRevisions($fileId));
            $out['uploaderUserId'] = DB::table('submission_files')->where('submission_file_id', $fileId)->value('uploader_user_id');
            $out['eventLog'] = DB::table('event_log')->where('assoc_type', Application::ASSOC_TYPE_SUBMISSION_FILE)->where('assoc_id', $fileId)
                ->orderByDesc('log_id')->limit(2)->get(['message', 'user_id'])->map(fn ($r) => $r->message . '|user=' . var_export($r->user_id, true))->all();
        } catch (\Throwable $e) {
            $out['exception'] = get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
            $out['frames'] = collect($e->getTrace())->filter(fn ($f) => isset($f['file']) && str_contains($f['file'], '/lib/pkp/classes/'))
                ->take(4)->map(fn ($f) => substr($f['file'], strpos($f['file'], '/classes/') + 1) . ':' . $f['line'])->values()->all();
            if ($e->getPrevious()) {
                $p = $e->getPrevious();
                $out['previous'] = get_class($p) . ': ' . $p->getMessage() . ' @ ' . basename($p->getFile()) . ':' . $p->getLine();
            }
        }
        $out['filesRows'] = $filesBefore . '->' . DB::table('files')->count();
        echo '[fact] ' . json_encode($out, JSON_UNESCAPED_SLASHES) . "\n";
    }

    public function execute()
    {
        $this->call('H1 html 15/16', fn () => Repo::bodyText()->createHtmlFile('<!DOCTYPE html><html><body><p>Exported from the command line.</p></body></html>', 16));
        $this->call('H2 html 15/16 again', fn () => Repo::bodyText()->createHtmlFile('<!DOCTYPE html><html><body><p>Exported from the command line, second time.</p></body></html>', 16));
        $pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
        $this->call('P1 pdf 5/6', fn () => Repo::bodyText()->createPdfGalley($pdf, 6));

        // As a queued job: no user in the request
        $registered = &\PKP\core\Registry::get('user', true, null);
        $registered = null;
        $row = DB::table('submissions as s')->where('s.stage_id', 5)->whereNotIn('s.submission_id', [5, 15])
            ->whereNotExists(fn ($q) => $q->from('publication_galleys as g')->whereColumn('g.publication_id', 's.current_publication_id'))
            ->orderBy('s.submission_id')->first(['s.submission_id', 's.current_publication_id']);
        echo '[fact] ' . json_encode(['noUserTarget' => $row]) . "\n";
        $pubs = [16, 6];
        if ($row) {
            $pubs[] = $row->current_publication_id;
            $this->call("N1 pdf {$row->submission_id}/{$row->current_publication_id}, no user", fn () => Repo::bodyText()->createPdfGalley($pdf, $row->current_publication_id));
            $this->call("N2 pdf {$row->submission_id}/{$row->current_publication_id} again, no user", fn () => Repo::bodyText()->createPdfGalley($pdf, $row->current_publication_id));
            $this->call("N3 html {$row->submission_id}/{$row->current_publication_id}, no user", fn () => Repo::bodyText()->createHtmlFile('<!DOCTYPE html><html><body><p>Exported by a job.</p></body></html>', $row->current_publication_id));
        }
        $galleys = DB::table('publication_galleys')->whereIn('publication_id', $pubs)->get(['galley_id', 'publication_id', 'label', 'submission_file_id']);
        echo '[fact] ' . json_encode(['galleys' => $galleys->all()], JSON_UNESCAPED_SLASHES) . "\n";
    }
}

(new Pkp13543Cli($argv))->execute();
