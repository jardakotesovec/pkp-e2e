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
 * abbrev/path).
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
            'path' => $spec->get('path'),
            'title' => $spec->get('title'),
            'policy' => $spec->get('policy'),
        ];
    }

    protected function addStructure(Context $context, array $plan, int $sequence): int
    {
        return BootstrapSeeder::addSection($context, $plan, $sequence);
    }
}
