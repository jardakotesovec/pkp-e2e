<?php
// PR review of pkp/ojs#5867 (issue pkp/pkp-lib#9170, "Multilingual Title, Description and Subject in DataCite
// export"): what the DataCite record of an article, an issue and a supplementary file carries in titles, subjects
// and descriptions when the work has two or more translations, built with the DataCite export plugin's own export
// filter (validation off: the fleets cannot fetch the agency's XSD) and then validated against a local copy of
// DataCite's kernel-4 schema, on the DOMDocument the filter returns (what the plugin validates) and once re-parsed.
// Run on PKP's OJS dataset (fleet-prep --dataset): journal publicknowledge, form locales en + fr_CA, articles 1 and
// 17 published in issue 1, galley 1 on article 1's file 12. Translations are set on the in-memory objects; what
// only the database can carry (a supplementary file's genre and its description/subject, article 17's title for
// the issue TOC) goes in inside one transaction that is rolled back. DOIs are given in memory. Writes nothing.
// Prints one JSON line: per scenario the exception or the record's <language>, its titles, subjects and
// descriptions (each as lang|type|text), schemaValid (in memory / re-parsed) and the first schema errors.
// Local schema: metadata.xsd and include/*.xsd of https://schema.datacite.org/meta/kernel-4/ in one directory.
// Usage: PKP_CONFIG_FILE=<fleet config> php xml-lang.php <app root> <contextPath> <xsd dir> [--xml]
$root = $argv[1];
define('INDEX_FILE_LOCATION', $root . '/index.php');
chdir($root);
require $root . '/lib/pkp/classes/cliTool/CommandLineTool.php';

use APP\core\Application;
use APP\facades\Repo;
use Illuminate\Support\Facades\DB;
use PKP\db\DAORegistry;
use PKP\plugins\PluginRegistry;

class Pkp9170XmlLang extends \PKP\cliTool\CommandLineTool
{
    protected $plugin;
    protected $context;
    protected string $xsd;
    protected bool $withXml;

    protected function doi(string $suffix)
    {
        return Repo::doi()->newDataObject(['doi' => '10.1234/' . $suffix, 'contextId' => $this->context->getId()]);
    }

    protected function build(string $label, $object, string $filterGroup): array
    {
        $warnings = [];
        set_error_handler(function (int $no, string $message, string $file, int $line) use (&$warnings) {
            $warnings[] = $message . ' (' . basename($file) . ':' . $line . ')';
            return true;
        });
        try {
            $filterDao = DAORegistry::getDAO('FilterDAO');
            $filters = $filterDao->getObjectsByGroup($filterGroup);
            $filter = array_shift($filters);
            $m = new \ReflectionMethod($this->plugin, '_instantiateExportDeployment');
            $m->setAccessible(true);
            $filter->setDeployment($m->invoke($this->plugin, $this->context));
            $filter->setNoValidation(true);
            libxml_use_internal_errors(true);
            libxml_clear_errors();
            $dom = $filter->execute($object, true);
            libxml_clear_errors();
            $validInMemory = $dom->schemaValidate($this->xsd . '/metadata.xsd');
            $errors = array_map(fn ($e) => trim($e->message) . ' (line ' . $e->line . ')', array_slice(libxml_get_errors(), 0, 4));
            libxml_clear_errors();
            $xml = $dom->saveXML();
            $re = new \DOMDocument();
            $re->loadXML($xml);
            $validReparsed = $re->schemaValidate($this->xsd . '/metadata.xsd');
            libxml_clear_errors();
            $xp = new \DOMXPath($re);
            $xp->registerNamespace('d', 'http://datacite.org/schema/kernel-4');
            $read = function (string $path, string $typeAttr) use ($xp) {
                $out = [];
                foreach ($xp->query($path) as $n) {
                    $lang = $n->getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
                    $text = preg_replace('/\s+/', ' ', trim($n->textContent));
                    $out[] = ($lang === '' ? '-' : $lang) . '|' . ($n->getAttribute($typeAttr) ?: '-') . '|' . (mb_strlen($text) > 70 ? mb_substr($text, 0, 70) . '…' : ($text === '' ? '(empty)' : $text));
                }
                return $out;
            };
            $r = [
                'language' => $xp->query('/d:resource/d:language')->item(0)?->textContent,
                'titles' => $read('/d:resource/d:titles/d:title', 'titleType'),
                'subjects' => $read('/d:resource/d:subjects/d:subject', 'subjectScheme'),
                'descriptions' => $read('/d:resource/d:descriptions/d:description', 'descriptionType'),
                'schemaValid' => ['inMemory' => $validInMemory, 'reparsed' => $validReparsed],
                'schemaErrors' => $errors,
                'warnings' => array_values(array_unique($warnings)),
            ];
            if ($this->withXml) {
                $r['xml'] = $xml;
            }
            return $r;
        } catch (\Throwable $e) {
            return ['exception' => get_class($e) . ': ' . substr($e->getMessage(), 0, 300), 'at' => basename($e->getFile()) . ':' . $e->getLine(),
                'warnings' => array_values(array_unique($warnings))];
        } finally {
            restore_error_handler();
        }
    }

    protected function article(int $id, callable $edit)
    {
        $submission = Repo::submission()->get($id);
        $publication = $submission->getCurrentPublication();
        $publication->setData('doiObject', $this->doi('art' . $id));
        $edit($publication);
        return $submission;
    }

    public function execute()
    {
        [$path, $this->xsd] = array_slice($this->argv, 0, 2);
        $this->withXml = in_array('--xml', $this->argv);
        $this->context = Application::getContextDAO()->getByPath($path);
        PluginRegistry::loadPlugin('generic', 'datacite', $this->context->getId());
        $this->plugin = PluginRegistry::getPlugin('importexport', 'DataciteExportPlugin');
        $p = $this->plugin;
        $out = ['ojs' => trim(shell_exec('git rev-parse --short HEAD')), 'formLocales' => $this->context->getSupportedFormLocales(),
            'primaryLocale' => $this->context->getPrimaryLocale(), 'keywordsShape' => Repo::submission()->get(1)->getCurrentPublication()->getData('keywords'),
            'scenarios' => []];

        DB::beginTransaction();
        try {
            // Article 17's title only in fr_CA (a French-only work in an English-primary journal), for the issue TOC.
            DB::table('publication_settings')->where('publication_id', 18)->where('setting_name', 'title')->where('locale', 'en')->delete();
            DB::table('publication_settings')->updateOrInsert(['publication_id' => 18, 'locale' => 'fr_CA', 'setting_name' => 'title'], ['setting_value' => 'Un article seulement en français']);
            // Galley 1's file 12 made a supplementary file (genre 7, DATASET) with a description and a subject in two locales.
            DB::table('submission_files')->where('submission_file_id', 12)->update(['genre_id' => 7]);
            foreach ([['description', 'en', '<p>Dataset description EN</p>'], ['description', 'fr_CA', '<p>Description du jeu FR</p>'],
                ['subject', 'en', 'Dataset subject EN'], ['subject', 'fr_CA', 'Sujet du jeu FR'], ['subject', 'de', '']] as [$n, $l, $v]) {
                DB::table('submission_file_settings')->updateOrInsert(['submission_file_id' => 12, 'locale' => $l, 'setting_name' => $n], ['setting_value' => $v]);
            }

            $s = &$out['scenarios'];
            $s['A article 1 as in the dataset (en only)'] = $this->build('A', $this->article(1, fn ($pub) => null), $p->getSubmissionFilter());

            $s['B article 1 with en + fr_CA title, abstract, keywords, subjects'] = $this->build('B', $this->article(1, function ($pub) {
                $pub->setData('title', ['en' => $pub->getData('title', 'en'), 'fr_CA' => 'Titre en français']);
                $pub->setData('abstract', ['en' => '<p>English abstract</p>', 'fr_CA' => '<p>Résumé en français</p>']);
                $pub->setData('keywords', ['en' => [['name' => 'kw-en-1'], ['name' => 'kw-en-2']], 'fr_CA' => [['name' => 'mot-fr-1']]]);
                $pub->setData('subjects', ['en' => [['name' => 'subj-en']], 'fr_CA' => [['name' => 'sujet-fr']]]);
            }), $p->getSubmissionFilter());

            $s['C article 1, fr_CA abstract "<p></p>" and "<p>&nbsp;</p>" in a non-form locale'] = $this->build('C', $this->article(1, function ($pub) {
                $pub->setData('abstract', ['en' => '<p>English abstract</p>', 'fr_CA' => '<p></p>', 'es' => '<p>&nbsp;</p>']);
            }), $p->getSubmissionFilter());

            $s['D article 1, empty strings in a locale outside the form locales (de)'] = $this->build('D', $this->article(1, function ($pub) {
                $pub->setData('title', ['en' => $pub->getData('title', 'en'), 'de' => '']);
                $pub->setData('abstract', ['en' => '<p>English abstract</p>', 'de' => '']);
                $pub->setData('keywords', ['en' => [['name' => 'kw-en-1']], 'de' => []]);
            }), $p->getSubmissionFilter());

            $s['E article 1 submitted in fr_CA (publication locale fr_CA), both locales filled'] = $this->build('E', $this->article(1, function ($pub) {
                $pub->setData('locale', 'fr_CA');
                $pub->setData('title', ['en' => $pub->getData('title', 'en'), 'fr_CA' => 'Titre en français']);
                $pub->setData('abstract', ['en' => '<p>English abstract</p>', 'fr_CA' => '<p>Résumé en français</p>']);
            }), $p->getSubmissionFilter());

            $issue = Repo::issue()->get(1);
            $issue->setData('doiObject', $this->doi('iss1'));
            $s['F issue 1 as in the dataset (title and description "" in en and fr_CA)'] = $this->build('F', $issue, $p->getIssueFilter());

            $issue = Repo::issue()->get(1);
            $issue->setData('doiObject', $this->doi('iss1'));
            $issue->setData('title', ['en' => '', 'fr_CA' => 'Numéro spécial']);
            $issue->setData('description', ['en' => '<p>Issue description EN</p>', 'fr_CA' => '<p>Description du numéro FR</p>']);
            $s['G issue 1, title only in fr_CA, description en + fr_CA, article 17 titled only in fr_CA'] = $this->build('G', $issue, $p->getIssueFilter());

            $galley = Repo::galley()->get(1);
            $galley->setData('doiObject', $this->doi('gal1'));
            $s['H galley 1 as a supplementary file, description and subject en + fr_CA (+ de "")'] = $this->build('H', $galley, $p->getRepresentationFilter());
        } finally {
            DB::rollBack();
        }
        echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
    }
}

$tool = new Pkp9170XmlLang(array_merge([$argv[0]], array_slice($argv, 2)));
$tool->execute();
