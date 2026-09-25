<?php

/**
 * @file classes/testing/ContextScenarioBuilder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class ContextScenarioBuilder
 *
 * @brief OJS scratch-journal scenario (a fresh journal gets its default
 * "Articles" section from the Context::add hook; user section assignments
 * resolve by abbrev; the issues[] overlay, U08).
 */

namespace APP\testing;

use PKP\context\Context;
use PKP\testing\PKPContextScenarioBuilder;
use PKP\testing\Spec;

class ContextScenarioBuilder extends PKPContextScenarioBuilder
{
    protected function structureKey(): string
    {
        return 'sections';
    }

    protected function resolveStructureId(Context $context, string $identifier): ?int
    {
        return BootstrapSeeder::findSectionId($context, $identifier);
    }

    /** Same field roster as BootstrapSeeder::parseStructure (kept in step). */
    protected function parseStructure(Spec $spec): array
    {
        return [
            'abbrev' => (string) $spec->require('abbrev'),
            'title' => $spec->get('title'),
            'policy' => $spec->get('policy'),
            'wordCount' => $spec->get('wordCount'),
            'abstractsNotRequired' => (bool) $spec->get('abstractsNotRequired', false),
            'identifyType' => $spec->get('identifyType'),
            'hideTitle' => BootstrapSeeder::parseHideTitle($spec),
        ];
    }

    protected function addStructure(Context $context, array $plan, int $sequence): int
    {
        return BootstrapSeeder::addSection($context, $plan, $sequence);
    }

    /**
     * `issues[]` (U08): the bootstrap payload's issues list, same shape,
     * plus `coverImage` (U13), `datePublished` and `galleys[]` (U50); the
     * galleys' "Language" is checked against the new journal's form
     * languages (primary first).
     */
    protected function parseOverlay(Spec $root): array
    {
        $primaryLocale = (string) ($this->contextParams['primaryLocale'] ?? 'en');
        $formLocales = array_values(array_unique(array_merge([$primaryLocale], (array) ($this->contextParams['supportedFormLocales'] ?? []))));
        return ['issues' => BootstrapSeeder::parseIssues($root, withCover: true, formLocales: $formLocales)];
    }

    /** The bootstrap's own issue path; the response lists the issues. */
    protected function executeOverlay(Context $context, array $overlayPlan): array
    {
        return ['issues' => BootstrapSeeder::addIssues($context, $overlayPlan['issues'] ?? [], asTheForm: true)];
    }
}
