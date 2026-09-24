<?php

/**
 * @file classes/testing/BootstrapSeeder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class BootstrapSeeder
 *
 * @brief OJS base seed: sections (by abbrev) and the issues overlay.
 */

namespace APP\testing;

use APP\facades\Repo;
use PKP\context\Context;
use PKP\core\Core;
use PKP\plugins\Hook;
use PKP\testing\PKPBootstrapSeeder;
use PKP\testing\Spec;
use PKP\testing\SpecException;

class BootstrapSeeder extends PKPBootstrapSeeder
{
    protected function structureKey(): string
    {
        return 'sections';
    }

    protected function parseStructure(Spec $spec): array
    {
        return [
            'abbrev' => (string) $spec->require('abbrev'),
            'title' => $spec->get('title'),
            'policy' => $spec->get('policy'),
            'wordCount' => $spec->get('wordCount'),
            'abstractsNotRequired' => (bool) $spec->get('abstractsNotRequired', false),
            'identifyType' => $spec->get('identifyType'),
        ];
    }

    protected function addStructure(Context $context, array $plan, int $sequence): int
    {
        return self::addSection($context, $plan, $sequence);
    }

    protected function resolveStructureId(Context $context, string $identifier): ?int
    {
        return self::findSectionId($context, $identifier);
    }

    public static function addSection(Context $context, array $plan, int $sequence): int
    {
        $locale = $context->getPrimaryLocale();
        $localize = fn ($value, $default = null) => is_array($value) ? $value : [$locale => $value ?? $default];

        // The Context::add hook already created the default "Articles"
        // section; the FIRST declared section renames/updates it (as a journal
        // manager would) instead of seeding a same-abbrev duplicate.
        if ($sequence === 1) {
            $existing = Repo::section()->getCollector()
                ->filterByContextIds([$context->getId()])
                ->getMany();
            if ($existing->count() === 1) {
                $params = [
                    'title' => $localize($plan['title'], $plan['abbrev']),
                    'abbrev' => $localize($plan['abbrev']),
                    'abstractsNotRequired' => $plan['abstractsNotRequired'] ?? false,
                ];
                if (($plan['policy'] ?? null) !== null) {
                    $params['policy'] = $localize($plan['policy']);
                }
                if (($plan['wordCount'] ?? null) !== null) {
                    $params['wordCount'] = (int) $plan['wordCount'];
                }
                if (($plan['identifyType'] ?? null) !== null) {
                    $params['identifyType'] = $localize($plan['identifyType']);
                }
                $defaultSection = $existing->first();
                Repo::section()->edit($defaultSection, $params);
                return $defaultSection->getId();
            }
        }

        $section = Repo::section()->newDataObject();
        $section->setData('contextId', $context->getId());
        $section->setData('sequence', $sequence);
        $section->setData('editorRestricted', false);
        $section->setData('metaIndexed', true);
        $section->setData('metaReviewed', true);
        $section->setData('abstractsNotRequired', $plan['abstractsNotRequired'] ?? false);
        foreach ($localize($plan['title'], $plan['abbrev']) as $l => $value) {
            $section->setData('title', $value, $l);
        }
        foreach ($localize($plan['abbrev']) as $l => $value) {
            $section->setData('abbrev', $value, $l);
        }
        if (($plan['policy'] ?? null) !== null) {
            foreach ($localize($plan['policy']) as $l => $value) {
                $section->setData('policy', $value, $l);
            }
        }
        if (($plan['wordCount'] ?? null) !== null) {
            $section->setData('wordCount', (int) $plan['wordCount']);
        }
        if (($plan['identifyType'] ?? null) !== null) {
            foreach ($localize($plan['identifyType']) as $l => $value) {
                $section->setData('identifyType', $value, $l);
            }
        }
        return Repo::section()->add($section);
    }

    /** Match a section by abbrev (any locale), case-insensitively. */
    public static function findSectionId(Context $context, string $identifier): ?int
    {
        $sections = Repo::section()->getCollector()
            ->filterByContextIds([$context->getId()])
            ->getMany();
        foreach ($sections as $section) {
            $abbrevs = (array) ($section->getData('abbrev') ?? []);
            foreach ($abbrevs as $abbrev) {
                if (strcasecmp((string) $abbrev, $identifier) === 0) {
                    return $section->getId();
                }
            }
        }
        return null;
    }

    protected function parseOverlay(Spec $root): array
    {
        return ['issues' => self::parseIssues($root)];
    }

    protected function executeOverlay(Context $context, array $overlayPlan): void
    {
        self::addIssues($context, $overlayPlan['issues'] ?? []);
    }

    /**
     * The `issues[]` list, shared by the bootstrap payload and the context
     * scenario (U08): {volume*, number*, year*, published?}. Parse phase
     * only; an unknown key in an entry is left unconsumed, so it 400s.
     *
     * @return array<int, array{volume: int, number: string, year: int, published: bool}>
     */
    public static function parseIssues(Spec $root): array
    {
        $issues = [];
        foreach ($root->childList('issues') as $spec) {
            $published = $spec->get('published', false);
            if (!is_bool($published)) {
                throw new SpecException("{$spec->path}.published", 'published must be a boolean');
            }
            $whole = function (string $key) use ($spec): int {
                $value = $spec->require($key);
                if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
                    throw new SpecException("{$spec->path}.{$key}", "{$key} must be a whole number");
                }
                return (int) $value;
            };
            $number = $spec->require('number');
            if (!is_int($number) && !is_string($number)) {
                throw new SpecException("{$spec->path}.number", 'number must be a string or a whole number');
            }
            $issues[] = [
                'volume' => $whole('volume'),
                'number' => (string) $number,
                'year' => $whole('year'),
                'published' => $published,
            ];
        }
        return $issues;
    }

    /**
     * Create (and publish) the parsed issues in order: Issues › Future
     * Issues › "Create Issue" › "Save" with volume, number and year and the
     * "Title" show-box unticked (no title), then, for `published`, the
     * row's "Publish Issue" › "OK" with "Send an email about this to all
     * registered users." unticked. Returns one row per issue for the
     * scenario response.
     *
     * $asTheForm (the context scenario, U08 parity drive 2026-09-24) adds
     * the two writes the form's save makes that the base seed never made:
     * an empty "Title" and "Description" row in each of the journal's form
     * locales (the form posts both boxes empty) and the form's closing
     * Repo::issue()->edit, which stamps last_modified on an issue left
     * unpublished. The bootstrap keeps its rows as they were (PRINCIPLES
     * "Bootstrap data policy"); neither difference shows on any screen.
     *
     * @return array<int, array{id: int, volume: int, number: string, year: int, published: bool}>
     */
    public static function addIssues(Context $context, array $plans, bool $asTheForm = false): array
    {
        $created = [];
        foreach ($plans as $plan) {
            $issue = Repo::issue()->newDataObject();
            $issue->setData('journalId', $context->getId());
            $issue->setData('volume', $plan['volume']);
            $issue->setData('number', $plan['number']);
            $issue->setData('year', $plan['year']);
            $issue->setData('showVolume', true);
            $issue->setData('showNumber', true);
            $issue->setData('showYear', true);
            // Access status as the Create Issue form derives it from the
            // journal's publishing mode (IssueForm::execute ~246-258):
            // subscription/none → ISSUE_ACCESS_SUBSCRIPTION, open (and the
            // seed's unset default) → ISSUE_ACCESS_OPEN.
            $issue->setData('accessStatus', match ((int) $context->getData('publishingMode')) {
                \APP\journal\Journal::PUBLISHING_MODE_SUBSCRIPTION,
                \APP\journal\Journal::PUBLISHING_MODE_NONE => \APP\issue\Issue::ISSUE_ACCESS_SUBSCRIPTION,
                default => \APP\issue\Issue::ISSUE_ACCESS_OPEN,
            });
            $issue->setData('published', false);
            if ($asTheForm) {
                // IssueForm::execute: setTitle / setDescription from the
                // form's per-locale boxes, posted empty ("Title" unticked).
                foreach ($context->getSupportedFormLocales() ?: [$context->getPrimaryLocale()] as $locale) {
                    $issue->setData('title', '', $locale);
                    $issue->setData('description', '', $locale);
                }
            }
            Repo::issue()->add($issue);
            if ($asTheForm) {
                // The form's closing save (IssueForm::execute ~306).
                Repo::issue()->edit($issue, []);
            }

            if ($plan['published']) {
                // The publish flow, mirrored from
                // IssueGridHandler::publishIssue (~544-633): DOI creation
                // (internally a no-op unless the journal enables issue DOIs
                // — a fresh journal enables publication DOIs only), published
                // flag + datePublished, the publish hook, current-issue
                // update, stale-DOI marking. The handler's delayed-open-access
                // branch (subscription journals only), its scheduled-
                // publication sweep (nothing is assigned to a new issue) and
                // its notification batch (the dialog's email box, seeded
                // unticked) don't apply here.
                Repo::issue()->createDoi($issue);
                $issue->setData('published', true);
                if (!$issue->getData('datePublished')) {
                    $issue->setData('datePublished', Core::getCurrentDate());
                }
                Hook::call('IssueGridHandler::publishIssue', [&$issue]);
                Repo::issue()->updateCurrent($context->getId(), $issue);
                Repo::doi()->issueUpdated($issue);
            }
            $created[] = [
                'id' => (int) $issue->getId(),
                'volume' => $plan['volume'],
                'number' => $plan['number'],
                'year' => $plan['year'],
                'published' => $plan['published'],
            ];
        }
        return $created;
    }
}
