<?php

/**
 * @file classes/testing/SubmissionScenarioBuilder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class SubmissionScenarioBuilder
 *
 * @brief OMP submission scenario overlays: `series` (path) + `seriesPosition`
 * on the publication (both optional — monographs need no series), and the
 * per-round `stage: internal|external` key on reviewRounds.
 */

namespace APP\testing;

use PKP\context\Context;
use PKP\testing\PKPSubmissionScenarioBuilder;
use PKP\testing\Spec;
use PKP\testing\SpecException;

class SubmissionScenarioBuilder extends PKPSubmissionScenarioBuilder
{
    /**
     * `workType` ('monograph' | 'editedVolume', default monograph) — the OMP
     * start form always posts a work type (the Monograph radio arrives
     * preselected and the field is required), so every wizard-created
     * submission stores one; a direct repository add leaves it null, a state
     * no UI path produces (parity fix, U21).
     */
    protected function parseSubmissionOverlay(Context $context, Spec $root): array
    {
        $workType = (string) $root->get('workType', 'monograph');
        return match ($workType) {
            'monograph' => ['workType' => \APP\submission\Submission::WORK_TYPE_AUTHORED_WORK],
            'editedVolume' => ['workType' => \APP\submission\Submission::WORK_TYPE_EDITED_VOLUME],
            default => throw new SpecException('workType', 'workType must be "monograph" or "editedVolume"'),
        };
    }

    protected function parsePublicationOverlay(Context $context, Spec $root): array
    {
        $props = [];
        $seriesPath = $root->get('series');
        if ($seriesPath !== null) {
            $seriesId = BootstrapSeeder::findSeriesId($context, (string) $seriesPath);
            if (!$seriesId) {
                throw new SpecException('series', "Unknown series path \"{$seriesPath}\" in context \"{$context->getPath()}\"");
            }
            $props['seriesId'] = $seriesId;
        }
        $seriesPosition = $root->get('seriesPosition');
        if ($seriesPosition !== null) {
            $props['seriesPosition'] = (string) $seriesPosition;
        }
        return $props;
    }

    protected function reviewStageIdForRound(Spec $roundSpec): int
    {
        $stage = (string) $roundSpec->get('stage', 'external');
        return match ($stage) {
            'internal' => WORKFLOW_STAGE_ID_INTERNAL_REVIEW,
            'external' => WORKFLOW_STAGE_ID_EXTERNAL_REVIEW,
            default => throw new SpecException("{$roundSpec->path}.stage", 'Review round stage must be "internal" or "external"'),
        };
    }
}
