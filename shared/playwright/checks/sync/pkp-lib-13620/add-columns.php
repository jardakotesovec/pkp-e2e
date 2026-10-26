<?php
/**
 * PR review check for pkp/pkp-lib#13593 (pkp-lib#13620): PKP's `main` dataset already reads 3.6.0.0, so loading
 * it runs no upgrade and its review_round_author_responses table lacks the PR's two columns. This runs the PR's
 * own upgrade migration (up()) on the dataset fleet's database so completion.js can drive the head. Needs the
 * migration's class to load, i.e. the tried fix's file name (fix.diff). Run from the app root:
 *   PKP_CONFIG_FILE=$PWD/config.test.ds1.inc.php php <this file>
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use Illuminate\Support\Facades\Schema;

class AddCompletionColumns extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        if (!Schema::hasColumn('review_round_author_responses', 'date_completed')) {
            (new \PKP\migration\upgrade\v3_6_0\I13593_AddDateCompletedAndDateRevertedToReviewRoundAuthorResponses(new \APP\install\Upgrade([]), []))->up();
        }
        echo json_encode(Schema::getColumnListing('review_round_author_responses')), "\n";
    }
}
(new AddCompletionColumns($argv ?? []))->execute();
