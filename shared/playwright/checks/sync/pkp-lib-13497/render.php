<?php
/**
 * Kept check of the PR review of pkp/pkp-lib#13497 (issue pkp/pkp-lib#12874), 2026-10-10: the text
 * the issue names, "The id {reviewAssignmentId} does not correspond to a valid review assignment",
 * belongs to a refusal no screen or API call reaches (a reviewer's access invitation is made by the
 * application itself, for an assignment that exists). The driver renders it the way
 * ReviewerAccessInvite::getValidationRules() does, with the id 4242, in every language pkp-lib
 * translates the invitation texts into, and with it the two refusals whose Danish and Turkish
 * texts name a variable without its "$". Prints JSON: per language the text, whether a "{" is left
 * in it (unfilled), and whether the language has no text of its own for it (a direct call with a
 * language does not fall back to English). Run from the app root:
 *   PKP_CONFIG_FILE=$PWD/<fleet config> php <this file>
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

class RenderInvitationTexts extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        $cases = [
            'invitation.reviewerAccess.validation.error.reviewAssignmentId.notExisting' => ['reviewAssignmentId' => 4242],
            'invitation.userRoleAssignment.validation.error.user.emailMustNotExist' => ['email' => 'nova@example.org'],
            'invitation.userRoleAssignment.validation.error.userRoles.unexpectedProperties' => ['attribute' => 3, 'properties' => 'colour'],
        ];
        $out = [];
        foreach (glob(getcwd() . '/lib/pkp/locale/*/invitation.po') as $file) {
            $locale = basename(dirname($file));
            foreach ($cases as $key => $params) {
                $text = __($key, $params, $locale);
                $out[$key][$locale] = ['text' => $text, 'unfilled' => str_contains($text, '{'), 'untranslated' => str_starts_with($text, '##')];
            }
        }
        echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
    }
}

(new RenderInvitationTexts($argv ?? []))->execute();
