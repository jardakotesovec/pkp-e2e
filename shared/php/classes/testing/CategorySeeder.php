<?php

/**
 * @file classes/testing/CategorySeeder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class CategorySeeder
 *
 * @brief The `categories[]` list of both context endpoints, the bootstrap
 * seed and the scratch context (U10): each entry {path*, title?,
 * children[]?}, a category of Settings › <Journal|Press|Server> ›
 * "Categories", its children the subcategories added from the row's "More
 * Actions" › "Add". The screen's "Add Category" › "Save" posts `title`,
 * `path`, an empty `description` and the "Order of …" list's default
 * `sortOption` to `categories` (`?parentCategoryId={id}` for a
 * subcategory), and CategoryCategoryController::add validates it
 * (Repo::category()->validate) and writes it (Repo::category()->add); the
 * seed runs the same validation and the same repository write, the list's
 * default sort option included (parity ledger 2026-08-23, 2026-09-24). The
 * rows are the screen's: `categories` (parent, path, no image) and the
 * `sortOption` and `title` settings; the empty description stores no row.
 * Not run: the controller's image and editorial-assignment steps, which an
 * entry cannot set (no cover image, no "Editorial Assignments").
 *
 * Parse phase (no writes): the window's refusals are the seed's 400s, a path
 * outside the repository's pattern, a path used twice in the context, a
 * title with an empty primary-locale value or in a locale the context's
 * forms lack. The title defaults to the path, as the bootstrap always did.
 */

namespace PKP\testing;

use APP\facades\Repo;
use PKP\context\Context;

class CategorySeeder
{
    /** lib/pkp category\Repository::CATEGORY_PATH_REGEX (private there). */
    public const PATH_REGEX = '/^[a-zA-Z0-9\/._-]+$/';

    /**
     * Read the `categories[]` list of $root into plans (parse phase).
     *
     * @param string[] $formLocales the locales the context's forms carry
     *
     * @return array<int, array{specPath: string, path: string, title: array<string, string>, children: array}>
     */
    public static function parse(Spec $root, string $primaryLocale, array $formLocales): array
    {
        $seen = [];
        return array_map(
            fn (Spec $spec) => self::parseOne($spec, $primaryLocale, $formLocales, $seen),
            $root->childList('categories')
        );
    }

    private static function parseOne(Spec $spec, string $primaryLocale, array $formLocales, array &$seen): array
    {
        $path = $spec->require('path');
        if (!is_string($path) || !preg_match(self::PATH_REGEX, $path)) {
            throw new SpecException("{$spec->path}.path", 'A category path holds letters, digits, "/", ".", "_" and "-" only (the "Add Category" window\'s own refusal)');
        }
        if (isset($seen[$path])) {
            throw new SpecException("{$spec->path}.path", "The category path \"{$path}\" is already used by {$seen[$path]} (the window refuses a path the context already has)");
        }
        $seen[$path] = $spec->path;

        $title = $spec->localized('title', $primaryLocale) ?? [$primaryLocale => $path];
        foreach ($title as $locale => $value) {
            if (!is_string($value)) {
                throw new SpecException("{$spec->path}.title", 'A category title is a string or a locale map of strings');
            }
            if (!in_array($locale, $formLocales, true)) {
                throw new SpecException("{$spec->path}.title", "The title carries \"{$locale}\", which is not among the context's form locales (" . implode(', ', $formLocales) . ')');
            }
        }
        if (trim($title[$primaryLocale] ?? '') === '') {
            throw new SpecException("{$spec->path}.title", "The title needs a value in the primary locale \"{$primaryLocale}\" (the window's \"Name\" is required)");
        }

        return [
            'specPath' => $spec->path,
            'path' => $path,
            'title' => $title,
            'children' => array_map(
                fn (Spec $child) => self::parseOne($child, $primaryLocale, $formLocales, $seen),
                $spec->childList('children')
            ),
        ];
    }

    /**
     * Create one planned category and its children, depth first, the way
     * the window's "Save" does. Returns every created category as
     * {id, path, parentId}, the entry first.
     *
     * @return array<int, array{id: int, path: string, parentId: ?int}>
     */
    public static function add(Context $context, array $plan, ?int $parentId): array
    {
        $category = Repo::category()->newDataObject();
        $category->setData('contextId', $context->getId());
        // The "Order of …" list arrives on its default
        // (Repo::submission()->getDefaultSortOption()) and is always posted.
        $props = [
            'contextId' => $context->getId(),
            'path' => $plan['path'],
            'title' => $plan['title'],
            'sortOption' => Repo::submission()->getDefaultSortOption(),
        ];
        $errors = Repo::category()->validate($category, $props, $context);
        if (!empty($errors)) {
            throw new SpecException($plan['specPath'], 'The "Add Category" window would refuse the entry: ' . json_encode($errors));
        }
        $category->setData('path', $props['path']);
        $category->setData('title', $props['title']);
        $category->setData('parentId', $parentId);
        $category->setData('sortOption', $props['sortOption']);
        $categoryId = Repo::category()->add($category);

        $created = [['id' => $categoryId, 'path' => $plan['path'], 'parentId' => $parentId]];
        foreach ($plan['children'] as $childPlan) {
            array_push($created, ...self::add($context, $childPlan, $categoryId));
        }
        return $created;
    }
}
