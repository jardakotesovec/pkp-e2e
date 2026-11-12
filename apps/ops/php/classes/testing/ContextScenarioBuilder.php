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
 * @brief OPS scratch-server scenario (a fresh server gets its default section
 * from the Context::add hook; user section assignments resolve by
 * abbrev/path). OPS has no review stage and no Settings › Workflow › Review
 * tab, so the `review` and `reviewForms` keys are REJECTED outright — never
 * silently ignored.
 */

namespace APP\testing;

use PKP\context\Context;
use PKP\testing\PKPContextScenarioBuilder;
use PKP\testing\Spec;
use PKP\testing\SpecException;

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
            'path' => $spec->get('path'),
            'title' => $spec->get('title'),
            'policy' => $spec->get('policy'),
            'wordCount' => $spec->get('wordCount'),
            'abstractsNotRequired' => (bool) $spec->get('abstractsNotRequired', false),
            // U23: the section window's "Mark this section as inactive…" and
            // editors-only boxes (context scenario only; the bootstrap
            // payload reads neither).
            'isInactive' => self::parseStructureBox($spec, 'isInactive', 'Mark this section as inactive and do not allow new submissions to be made to it.'),
            'editorRestricted' => self::parseStructureBox($spec, 'editorRestricted', 'Items can only be submitted by Managers and Moderators.'),
        ];
    }

    /**
     * The section window's and the "Inactive" box's refusal of the last
     * active section (SectionForm::validate, SectionGridHandler::
     * deactivateSection: "At least one section must be active. …").
     */
    protected function lastActiveRefusal(): ?string
    {
        return __('manager.sections.confirmDeactivateSection.error');
    }

    protected function addStructure(Context $context, array $plan, int $sequence): int
    {
        return BootstrapSeeder::addSection($context, $plan, $sequence);
    }

    /**
     * "Automatic DOI Assignment" names its first option "Upon reaching the
     * production stage" on a preprint server (U45).
     */
    protected function doiStageCreationWord(): string
    {
        return 'production';
    }

    protected function assertReviewSupported(string $key): void
    {
        throw new SpecException($key, "OPS has no review stage — {$key} cannot be seeded on this app");
    }
}
