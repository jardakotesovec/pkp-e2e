<?php
/**
 * Kept check for pkp/pkp-lib#13821 (PRs #13823 stable-3_5_0, #13822 stable-3_4_0): adds and edits
 * contributors through Repo::author(), the calls the contributors API and form make, so the stored
 * `seq` is the one getNextSeq() gives. Run from the app root (walk.js does this):
 *   PKP_CONFIG_FILE=<dataset config> php <this file> add <publicationId> <givenName>...
 *   PKP_CONFIG_FILE=<dataset config> php <this file> edit <authorId> <givenName>
 *   PKP_CONFIG_FILE=<dataset config> php <this file> read <publicationId>
 * Prints JSON.
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\facades\Repo;

class Pr13821Driver extends \PKP\cliTool\CommandLineTool
{
    public function execute(): void
    {
        [$action, $id] = [$this->argv[0], (int) $this->argv[1]];
        $out = [];
        if ($action === 'add') {
            $publication = Repo::publication()->get($id);
            $submission = Repo::submission()->get($publication->getData('submissionId'));
            $locale = $submission->getData('locale');
            foreach (array_slice($this->argv, 2) as $name) {
                $author = Repo::author()->newDataObject([
                    'publicationId' => $id,
                    'givenName' => [$locale => $name],
                    'familyName' => [$locale => 'Tie13821'],
                    'email' => strtolower($name) . '.tie13821@example.org',
                    'country' => 'CA',
                    'includeInBrowse' => true,
                    'userGroupId' => Repo::author()->getCollector()->filterByPublicationIds([$id])->getMany()->first()?->getData('userGroupId'),
                ]);
                $authorId = Repo::author()->add($author);
                $out[] = ['id' => $authorId, 'name' => $name, 'seq' => Repo::author()->get($authorId)->getData('seq')];
            }
        } elseif ($action === 'edit') {
            $author = Repo::author()->get($id);
            $locale = array_key_first($author->getData('givenName') ?? []) ?: 'en';
            Repo::author()->edit($author, ['givenName' => [$locale => $this->argv[2]]]);
            $out = ['id' => $id, 'givenName' => $this->argv[2]];
        } elseif ($action === 'read') {
            $publication = Repo::publication()->get($id);
            foreach ($publication->getData('authors') as $author) {
                $out[] = ['id' => $author->getId(), 'name' => $author->getFullName(false), 'seq' => (int) $author->getData('seq')];
            }
        }
        echo json_encode($out), "\n";
    }
}

(new Pr13821Driver($argv ?? []))->execute();
