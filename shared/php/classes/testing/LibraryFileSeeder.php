<?php

/**
 * @file classes/testing/LibraryFileSeeder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class LibraryFileSeeder
 *
 * @brief The `libraryFiles[]` keys (U39) of both scenario endpoints: files
 * of the context's Publisher Library (Settings › Workflow › "Publisher
 * Library", "Press Library", "Preprint Server Library") and of one
 * submission's Submission Library (the workflow header's "Library"), each
 * the "Add a file" window's two requests, acting as the uploader:
 *  1. the upload area's `uploadFile` (LibraryFileGridHandler::uploadFile:
 *     TemporaryFileManager::handleUpload, the temporary_files row named
 *     after the uploaded file), run here through handleUpload itself with
 *     the fixture standing in for the POSTed file (the one step a seed
 *     cannot take is PHP's move_uploaded_file, so the fixture is copied);
 *  2. "OK", `saveFile`: the grid's own NewLibraryFileForm (settings or
 *     submissionDocuments), its data set the way readInputData reads the
 *     POST (every form locale posted, the empty ones as ''; the "Public
 *     Access" box "1" when ticked, absent otherwise), then execute(): the
 *     type-coded stored name, the library_files row and its settings, the
 *     temporary file deleted, the form's execute hook.
 * Not run: the form's POST and CSRF checks and the grid's refresh event.
 * The window's refusals are the seed's (parse phase): a name in the
 * primary locale of at most 255 characters, a type among the "Type"
 * list's labels, a fixture file.
 */

namespace PKP\testing;

use APP\core\Application;
use APP\file\LibraryFileManager;
use PKP\context\Context;
use PKP\context\LibraryFileDAO;
use PKP\core\Core;
use PKP\core\PKPString;
use PKP\core\Registry;
use PKP\db\DAORegistry;
use PKP\file\TemporaryFileManager;
use PKP\user\User;

class LibraryFileSeeder
{
    /**
     * The "Type" list of this app's "Add a file" window: its English label
     * ("Marketing", "Permissions", "Reports", "Other"; a press also
     * "Contracts") → the type code the window posts.
     *
     * @return array<string, int>
     */
    public static function typeLabels(): array
    {
        $labels = [];
        foreach ((new LibraryFileManager(0))->getTypeTitleKeyMap() as $typeId => $titleKey) {
            $labels[__($titleKey, [], 'en')] = (int) $typeId;
        }
        return $labels;
    }

    /**
     * Read a `libraryFiles[]` list (parse phase, no writes). `publicAccess`
     * is read only for the Publisher Library: the Submission Library's
     * window has no such box, so there the key is left unread and the
     * strict reader refuses it.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function parse(Spec $root, bool $publisherLibrary): array
    {
        if (!$root->has('libraryFiles')) {
            return [];
        }
        $labels = self::typeLabels();
        $plans = [];
        foreach ($root->childList('libraryFiles') as $spec) {
            $name = $spec->require('name');
            if (!is_string($name) && !is_array($name)) {
                throw new SpecException("{$spec->path}.name", 'name is a string or a locale map (the "Name" box, one per form language)');
            }
            foreach ((array) $name as $locale => $value) {
                if (!is_string($value) || mb_strlen($value) > 255) {
                    throw new SpecException("{$spec->path}.name", 'Each "Name" is a string of at most 255 characters (the box takes no more)');
                }
            }
            $type = (string) $spec->require('type');
            if (!isset($labels[$type])) {
                throw new SpecException("{$spec->path}.type", "Unknown type \"{$type}\". This app's \"Type\" list: " . implode(', ', array_keys($labels)));
            }
            $description = $spec->get('description');
            if ($description !== null && !is_string($description) && !is_array($description)) {
                throw new SpecException("{$spec->path}.description", 'description is a string or a locale map');
            }
            $publicAccess = false;
            if ($publisherLibrary) {
                $publicAccess = $spec->get('publicAccess', false);
                if (!is_bool($publicAccess)) {
                    throw new SpecException("{$spec->path}.publicAccess", 'publicAccess is a boolean (the "Public Access" box)');
                }
            }
            $plans[] = [
                'path' => $spec->path,
                'name' => $name,
                'type' => $type,
                'typeId' => $labels[$type],
                'description' => $description,
                'publicAccess' => $publicAccess,
                'fixture' => self::resolveFixture($spec->has('file') ? (string) $spec->get('file') : null, "{$spec->path}.file"),
            ];
        }
        return $plans;
    }

    /**
     * A fixture basename under apps/<app>/playwright/fixtures/files/
     * (mounted at classes/testing/fixtures/); without one, the app's PDF
     * fixture (the first *.pdf there: article.pdf, a preprint server's
     * preprint.pdf).
     *
     * @return array{file: string, path: string}
     */
    public static function resolveFixture(?string $file, string $specKey): array
    {
        $fixtureDir = Core::getBaseDir() . '/classes/testing/fixtures';
        if ($file === null) {
            $pdfs = glob("{$fixtureDir}/*.pdf") ?: [];
            sort($pdfs);
            if (!$pdfs) {
                throw new SpecException($specKey, "No PDF fixture under {$fixtureDir} (re-run npm run mount)");
            }
            return ['file' => basename($pdfs[0]), 'path' => $pdfs[0]];
        }
        if ($file === '' || $file !== basename($file)) {
            throw new SpecException($specKey, 'file is a basename under apps/<app>/playwright/fixtures/files/, no directory part');
        }
        $path = "{$fixtureDir}/{$file}";
        if (!is_file($path)) {
            throw new SpecException($specKey, "No fixture \"{$file}\" under {$fixtureDir} (bin/mount.js copies apps/<app>/playwright/fixtures/files/ there; re-run npm run mount)");
        }
        return ['file' => $file, 'path' => $path];
    }

    /**
     * The "Add a file" window's upload and "OK", acting as $uploader, into
     * the Publisher Library ($submissionId null) or the submission's
     * Submission Library.
     *
     * @return array{id: int, name: string, type: string, fileName: string, originalFileName: string, publicAccess: bool}
     */
    public static function add(Context $context, array $plan, ?int $submissionId, User $uploader): array
    {
        $primaryLocale = $context->getPrimaryLocale();
        $formLocales = (array) $context->getSupportedFormLocales();
        $localized = function (mixed $value, string $key) use ($formLocales, $primaryLocale, $plan): array {
            $map = array_fill_keys($formLocales, '');
            if (is_array($value)) {
                $unknown = array_diff(array_keys($value), $formLocales);
                if ($unknown) {
                    throw new SpecException("{$plan['path']}.{$key}", 'The window has a box per form language only (' . implode(', ', $formLocales) . '), not ' . implode(', ', $unknown));
                }
                return array_merge($map, $value);
            }
            $map[$primaryLocale] = (string) ($value ?? '');
            return $map;
        };
        $names = $localized($plan['name'], 'name');
        if (trim((string) ($names[$primaryLocale] ?? '')) === '') {
            throw new SpecException("{$plan['path']}.name", __('settings.libraryFiles.nameRequired') . " (the primary locale {$primaryLocale})");
        }

        $restoreContext = ContextFactory::forceRequestContext($context);
        $previousActingUser = Registry::get('user');
        Registry::set('user', $uploader);
        try {
            $temporaryFile = self::upload($plan['fixture'], $uploader);

            $form = $submissionId === null
                ? new \PKP\controllers\grid\settings\library\form\NewLibraryFileForm($context->getId())
                : new \PKP\controllers\grid\files\submissionDocuments\form\NewLibraryFileForm($context->getId(), $submissionId);
            $form->setData('temporaryFileId', (string) $temporaryFile->getId());
            $form->setData('libraryFileName', $names);
            $form->setData('description', $localized($plan['description'], 'description'));
            $form->setData('fileType', (string) $plan['typeId']);
            $form->setData('publicAccess', $plan['publicAccess'] ? '1' : null);
            $fileId = (int) $form->execute();
        } finally {
            Registry::set('user', $previousActingUser);
            $restoreContext();
        }

        $libraryFileDao = DAORegistry::getDAO('LibraryFileDAO'); /** @var LibraryFileDAO $libraryFileDao */
        $libraryFile = $libraryFileDao->getById($fileId);
        return [
            'id' => $fileId,
            'name' => (string) $names[$primaryLocale],
            'type' => $plan['type'],
            'fileName' => (string) $libraryFile->getServerFileName(),
            'originalFileName' => (string) $libraryFile->getOriginalFileName(),
            'publicAccess' => (bool) $libraryFile->getPublicAccess(),
        ];
    }

    /**
     * The upload area's request: TemporaryFileManager::handleUpload over
     * the `uploadedFile` field, the fixture standing in for PHP's upload
     * (copied rather than moved, the one step a seed cannot take).
     */
    protected static function upload(array $fixture, User $uploader): \PKP\file\TemporaryFile
    {
        $previousFiles = $_FILES;
        $_FILES['uploadedFile'] = [
            'name' => $fixture['file'],
            'type' => PKPString::mime_content_type($fixture['path'], pathinfo($fixture['file'], PATHINFO_EXTENSION)),
            'tmp_name' => $fixture['path'],
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($fixture['path']),
        ];
        try {
            $manager = new class () extends TemporaryFileManager {
                public function uploadFile($fileName, $destFileName)
                {
                    $destDir = dirname($destFileName);
                    if (!$this->fileExists($destDir, 'dir')) {
                        $this->mkdirtree($destDir);
                    }
                    if (!isset($_FILES[$fileName]) || !copy($_FILES[$fileName]['tmp_name'], $destFileName)) {
                        return false;
                    }
                    return $this->setMode($destFileName, self::FILE_MODE_MASK);
                }
            };
            $temporaryFile = $manager->handleUpload('uploadedFile', $uploader->getId());
            if (!$temporaryFile) {
                throw new \RuntimeException("The library upload of fixture \"{$fixture['file']}\" failed");
            }
            return $temporaryFile;
        } finally {
            $_FILES = $previousFiles;
        }
    }
}
