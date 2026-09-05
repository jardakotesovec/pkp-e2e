<?php

/**
 * @file classes/testing/PKPContextScenarioBuilder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class PKPContextScenarioBuilder
 *
 * @brief POST /api/v1/_test/scenarios/context — seed a scratch context for
 * tests that need journal/press/server-level mutations (the shared base
 * context is read-only, PRINCIPLES A1).
 *
 * Step-2 core schema: tag* (parallel-isolation key, also the default urlPath —
 * ≤32 chars, single alphanumeric token), context {path, name, acronym,
 * description, primaryLocale, supportedLocales, contactName, contactEmail,
 * enabled}, users[] (throwaway accounts, same shape as the bootstrap roster
 * entries). Setting passthroughs return per feature, each with a parity entry.
 *
 * Feature passthroughs so far (each with a parity-ledger entry):
 * - sections[] / series[] (the app's structure key; U21) — same shape and
 *   machinery as the bootstrap seed's structure list (the FIRST declared
 *   entry renames the hook-created default, further entries are added), so
 *   scratch contexts can carry more than the one default section. Seeded
 *   before users[] so sub-editor assignments resolve.
 * - context.supportedSubmissionLocales (U21) — the Languages settings grid's
 *   submission-locale toggles: sets supportedSubmissionLocales and keeps
 *   supportedSubmissionMetadataLocales / supportedAddedSubmissionLocales in
 *   step, as the grid handler does when a locale is enabled for submissions.
 * - orcid {enabled?, apiType?, clientId?, clientSecret?, city?,
 *   sendMailToAuthorsOnPublication?} — the "ORCID" settings-tab state (U4);
 *   written through PKPContextService::edit(), the same service the tab's
 *   form save runs through, with the tab's defaults-for-tests (enabled,
 *   Public Sandbox, dummy credentials). The OAuth exchange itself can never
 *   complete in the test env (outbound HTTP fails fast at the dead-port
 *   `[proxy]` in config.test.inc.php, and no real ORCID account backs the
 *   dummy sandbox credentials), so dummy credentials are exactly as good as
 *   real ones for every screen this state gates.
 * - review {defaultReviewMode?, defaultReviewPublicVisibility?,
 *   restrictReviewerFileAccess?, reviewerAccessKeysEnabled?,
 *   reviewerSuggestionEnabled?, numWeeksPerResponse?, numWeeksPerReview?,
 *   numReviewsPerSubmission?, numDaysBeforeReviewResponseReminderDue?,
 *   numDaysAfterReviewResponseReminderDue?,
 *   numDaysBeforeReviewSubmitReminderDue?,
 *   numDaysAfterReviewSubmitReminderDue?, reviewGuidelines?,
 *   competingInterests?, showEnsuringLink?, OMP internalReviewGuidelines?}
 *   — the Settings › Workflow › Review "Setup" and "Reviewer Guidance"
 *   forms' fields (U28), validated and saved exactly as their PUT
 *   contexts/{id} save is (PKPContextService::validate + ::edit). A key the
 *   app's context schema lacks is a 400; OPS (no review stage, no Review
 *   tab) refuses the whole key.
 * - reviewForms[] {title*, description?, active? (default true),
 *   elements[] {question*, description?, type*, required?, options?}} —
 *   the Review Forms grid's Create Review Form / Create New Item / Active
 *   paths (U28): the same DAO writes ReviewFormForm::execute,
 *   ReviewFormElementForm::execute and
 *   ReviewFormGridHandler::activateReviewForm run. OPS refuses the key.
 */

namespace PKP\testing;

use APP\core\Application;
use PKP\context\Context;
use PKP\db\DAORegistry;
use PKP\orcid\OrcidManager;
use PKP\reviewForm\ReviewFormElement;
use PKP\services\interfaces\EntityWriteInterface;
use PKP\submission\reviewAssignment\ReviewAssignment;
use PKP\testing\ContextFactory;
use PKP\testing\Spec;
use PKP\testing\SpecException;
use PKP\testing\UserSeeder;

abstract class PKPContextScenarioBuilder
{
    protected ContextFactory $contextFactory;
    protected UserSeeder $userSeeder;

    public function __construct()
    {
        $this->contextFactory = new ContextFactory();
        $this->userSeeder = new UserSeeder();
    }

    /** The user-spec structure key ('sections' or 'series'). */
    abstract protected function structureKey(): string;

    /** Resolve a structure identifier within the scratch context. */
    abstract protected function resolveStructureId(Context $context, string $identifier): ?int;

    /**
     * Read one declared section/series spec (no writes). Apps that support
     * the structure list override this pair; the default refuses the key.
     */
    protected function parseStructure(Spec $spec): array
    {
        throw new SpecException(
            $spec->path,
            "The \"{$this->structureKey()}\" list is not supported by this app's context scenario yet"
        );
    }

    /** Create one declared section/series from its parsed plan. */
    protected function addStructure(Context $context, array $plan, int $sequence): int
    {
        throw new SpecException(
            $this->structureKey(),
            "The \"{$this->structureKey()}\" list is not supported by this app's context scenario yet"
        );
    }

    /** OPS overrides to refuse the review-setup keys (no review stage). */
    protected function assertReviewSupported(string $key): void
    {
    }

    public function build(array $data): array
    {
        $root = new Spec($data);

        $tag = (string) $root->require('tag');
        if (!preg_match('/^[a-zA-Z0-9]{1,32}$/', $tag)) {
            throw new SpecException('tag', 'tag must be a single alphanumeric token of at most 32 characters (it defaults to the context urlPath, varchar(32), and backs search scoping)');
        }

        // The context sub-spec defaults its path to the tag.
        $contextData = (array) ($root->get('context') ?? []);
        $contextData['path'] ??= $tag;
        $contextData['name'] ??= ['en' => "Scratch context {$tag}"];
        $contextSpec = new Spec($contextData, 'context');

        // Parse phase — unknown keys 400 before any write.
        $contextParams = $this->contextFactory->parseParams($contextSpec);
        $contextSpec->assertConsumed();
        $structurePlans = array_map(
            fn (Spec $spec) => $this->parseStructure($spec),
            $root->childList($this->structureKey())
        );
        $userPlans = array_map(
            fn (Spec $spec) => $this->userSeeder->parse($spec, $this->structureKey()),
            $root->childList('users')
        );
        $orcidSettings = $this->parseOrcidSettings($root);
        $primaryLocale = (string) $contextParams['primaryLocale'];
        $reviewSettings = $this->parseReviewSettings($root, $primaryLocale);
        $reviewFormPlans = $this->parseReviewForms($root, $primaryLocale);
        $root->assertConsumed();

        if (Application::getContextDAO()->getByPath((string) $contextData['path'])) {
            throw new SpecException('context.path', "A context with path \"{$contextData['path']}\" already exists — tags must be unique per run");
        }

        // Execute phase.
        $context = $this->contextFactory->create($contextParams);

        if ($orcidSettings !== null) {
            // The same service call the ORCID settings tab's form save runs
            // (PUT contexts/{id} → PKPContextService::edit — schema handles
            // the client-secret encryption exactly as the UI path does).
            $contextService = app()->get('context'); /** @var \PKP\services\PKPContextService $contextService */
            $context = $contextService->edit($context, $orcidSettings, Application::get()->getRequest());
        }

        if ($reviewSettings !== null) {
            // The Review "Setup" / "Reviewer Guidance" forms' save: PUT
            // contexts/{id} → PKPContextController::edit validates against
            // the context schema with the context's form locales, then
            // PKPContextService::edit writes.
            $contextService = app()->get('context'); /** @var \PKP\services\PKPContextService $contextService */
            $errors = $contextService->validate(
                EntityWriteInterface::VALIDATE_ACTION_EDIT,
                $reviewSettings + ['id' => $context->getId()],
                (array) $context->getSupportedFormLocales(),
                $context->getPrimaryLocale()
            );
            if (!empty($errors)) {
                throw new SpecException('review', 'The Review settings form would refuse this: ' . json_encode($errors));
            }
            $context = $contextService->edit($context, $reviewSettings, Application::get()->getRequest());
        }

        foreach ($reviewFormPlans as $plan) {
            $this->addReviewForm($context, $plan);
        }

        $sequence = 1;
        foreach ($structurePlans as $plan) {
            $this->addStructure($context, $plan, $sequence++);
        }

        $users = [];
        foreach ($userPlans as $plan) {
            $user = $this->userSeeder->seed(
                $context,
                $plan,
                fn (string $identifier) => $this->resolveStructureId($context, $identifier)
            );
            $users[] = ['id' => $user->getId(), 'username' => $user->getUsername()];
        }

        return [
            'tag' => $tag,
            'contextId' => $context->getId(),
            'path' => $context->getPath(),
            'users' => $users,
        ];
    }

    /**
     * The optional `orcid` sub-spec → the context-settings rows the "ORCID"
     * settings tab saves. Defaults produce the standard test configuration:
     * enabled, Public Sandbox, dummy credentials.
     */
    protected function parseOrcidSettings(Spec $root): ?array
    {
        $spec = $root->child('orcid');
        if ($spec === null) {
            return null;
        }
        $apiTypes = [
            OrcidManager::API_PUBLIC_PRODUCTION,
            OrcidManager::API_PUBLIC_SANDBOX,
            OrcidManager::API_MEMBER_PRODUCTION,
            OrcidManager::API_MEMBER_SANDBOX,
        ];
        $apiType = (string) $spec->get('apiType', OrcidManager::API_PUBLIC_SANDBOX);
        if (!in_array($apiType, $apiTypes)) {
            throw new SpecException('orcid.apiType', 'orcid.apiType must be one of: ' . implode(', ', $apiTypes));
        }
        $settings = [
            OrcidManager::ENABLED => (bool) $spec->get('enabled', true),
            OrcidManager::API_TYPE => $apiType,
            OrcidManager::CLIENT_ID => (string) $spec->get('clientId', 'APP-TESTCLIENTID'),
            OrcidManager::CLIENT_SECRET => (string) $spec->get('clientSecret', 'test-orcid-client-secret'),
        ];
        if ($spec->has('city')) {
            $settings[OrcidManager::CITY] = (string) $spec->get('city');
        }
        if ($spec->has('sendMailToAuthorsOnPublication')) {
            $settings[OrcidManager::SEND_MAIL_TO_AUTHORS_ON_PUBLICATION] = (bool) $spec->get('sendMailToAuthorsOnPublication');
        }
        return $settings;
    }

    /**
     * The optional `review` sub-spec → the context-settings rows the Review
     * "Setup" and "Reviewer Guidance" forms save. Only keys the app's context
     * schema carries are accepted (the forms are built from that schema:
     * PKPReviewSetupForm::addReviewSuggestionControl, OMP's
     * ReviewGuidanceForm), so a key foreign to the app is a 400.
     */
    protected function parseReviewSettings(Spec $root, string $primaryLocale): ?array
    {
        if (!$root->has('review')) {
            return null;
        }
        $this->assertReviewSupported('review');
        $spec = $root->child('review');

        $schema = app()->get('schema')->get('context'); /** @var \stdClass $schema */
        $hasProperty = fn (string $key) => isset($schema->properties->{$key});
        $refuse = fn (string $key) => throw new SpecException("review.{$key}", "review.{$key} is not a setting of this app's Review forms");

        $settings = [];

        if ($spec->has('defaultReviewMode')) {
            $modes = [
                'anonymous' => ReviewAssignment::SUBMISSION_REVIEW_METHOD_ANONYMOUS,
                'doubleAnonymous' => ReviewAssignment::SUBMISSION_REVIEW_METHOD_DOUBLEANONYMOUS,
                'open' => ReviewAssignment::SUBMISSION_REVIEW_METHOD_OPEN,
            ];
            $mode = $spec->get('defaultReviewMode');
            $settings['defaultReviewMode'] = $modes[$mode] ?? (in_array((int) $mode, $modes, true) ? (int) $mode : throw new SpecException('review.defaultReviewMode', 'review.defaultReviewMode must be one of: ' . implode(', ', array_keys($modes)) . ' (or the form\'s integer 1, 2, 3)'));
        }
        foreach (['defaultReviewPublicVisibility', 'restrictReviewerFileAccess', 'reviewerAccessKeysEnabled', 'reviewerSuggestionEnabled', 'showEnsuringLink'] as $key) {
            if ($spec->has($key)) {
                $hasProperty($key) || $refuse($key);
                $settings[$key] = (bool) $spec->get($key);
            }
        }
        foreach ([
            'numWeeksPerResponse', 'numWeeksPerReview', 'numReviewsPerSubmission',
            'numDaysBeforeReviewResponseReminderDue', 'numDaysAfterReviewResponseReminderDue',
            'numDaysBeforeReviewSubmitReminderDue', 'numDaysAfterReviewSubmitReminderDue',
        ] as $key) {
            if ($spec->has($key)) {
                $hasProperty($key) || $refuse($key);
                $value = $spec->get($key);
                if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
                    throw new SpecException("review.{$key}", "review.{$key} must be a whole number");
                }
                $settings[$key] = (int) $value;
            }
        }
        foreach (['reviewGuidelines', 'internalReviewGuidelines', 'competingInterests'] as $key) {
            if ($spec->has($key)) {
                $hasProperty($key) || $refuse($key);
                $settings[$key] = $spec->localized($key, $primaryLocale);
            }
        }
        $spec->assertConsumed();
        return $settings;
    }

    /**
     * The optional `reviewForms[]` list → plans for the Review Forms grid's
     * create / add-item / activate paths. Parse phase: no writes.
     */
    protected function parseReviewForms(Spec $root, string $primaryLocale): array
    {
        if (!$root->has('reviewForms')) {
            return [];
        }
        $this->assertReviewSupported('reviewForms');
        $types = [
            'smalltextfield' => ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_SMALL_TEXT_FIELD,
            'textfield' => ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXT_FIELD,
            'textarea' => ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXTAREA,
            'checkboxes' => ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_CHECKBOXES,
            'radiobuttons' => ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_RADIO_BUTTONS,
            'dropdownbox' => ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_DROP_DOWN_BOX,
        ];
        $multi = (new ReviewFormElement())->getMultipleResponsesElementTypes();

        $plans = [];
        foreach ($root->childList('reviewForms') as $formSpec) {
            $title = $formSpec->localized('title', $primaryLocale);
            if ($title === null) {
                throw new SpecException("{$formSpec->path}.title", 'A review form needs a title');
            }
            $elements = [];
            foreach ($formSpec->childList('elements') as $elementSpec) {
                $question = $elementSpec->localized('question', $primaryLocale);
                if ($question === null) {
                    throw new SpecException("{$elementSpec->path}.question", 'A review form item needs a question');
                }
                $typeKey = $elementSpec->require('type');
                $type = $types[strtolower((string) $typeKey)] ?? (in_array((int) $typeKey, $types, true) ? (int) $typeKey : throw new SpecException("{$elementSpec->path}.type", 'Item type must be one of: ' . implode(', ', array_keys($types)) . ' (or the form\'s integer 1-6)'));
                $options = null;
                if ($elementSpec->has('options')) {
                    if (!in_array($type, $multi, true)) {
                        throw new SpecException("{$elementSpec->path}.options", 'options belong to checkboxes, radiobuttons and dropdownbox items only');
                    }
                    $raw = (array) $elementSpec->get('options');
                    // A bare list is wrapped under the primary locale; a
                    // locale map of lists passes through (the listbuilder
                    // stores one list per form locale).
                    $options = array_is_list($raw) ? [$primaryLocale => array_values($raw)] : $raw;
                } elseif (in_array($type, $multi, true)) {
                    throw new SpecException("{$elementSpec->path}.options", 'A checkboxes, radiobuttons or dropdownbox item needs options');
                }
                $elements[] = [
                    'question' => $question,
                    'description' => $elementSpec->localized('description', $primaryLocale, ''),
                    'required' => (bool) $elementSpec->get('required', false),
                    'type' => $type,
                    'options' => $options,
                ];
            }
            $plans[] = [
                'title' => $title,
                'description' => $formSpec->localized('description', $primaryLocale, ''),
                'active' => (bool) $formSpec->get('active', true),
                'elements' => $elements,
            ];
        }
        return $plans;
    }

    /**
     * Create one review form the way the Review Forms grid does:
     * ReviewFormForm::execute (inactive, sequence REALLY_BIG_NUMBER, then
     * resequence), ReviewFormElementForm::execute per item (included,
     * sequence REALLY_BIG_NUMBER, then resequence; possibleResponses only on
     * the multiple-response types), and the grid's "Active" checkbox
     * (ReviewFormGridHandler::activateReviewForm: setActive(1) + update).
     * The activate handler's trivial notification (a toast for the manager)
     * is not created — a UI feedback row nobody reads back.
     */
    protected function addReviewForm(Context $context, array $plan): int
    {
        $reviewFormDao = DAORegistry::getDAO('ReviewFormDAO'); /** @var \PKP\reviewForm\ReviewFormDAO $reviewFormDao */
        $reviewFormElementDao = DAORegistry::getDAO('ReviewFormElementDAO'); /** @var \PKP\reviewForm\ReviewFormElementDAO $reviewFormElementDao */
        $assocType = Application::getContextAssocType();

        $reviewForm = $reviewFormDao->newDataObject();
        $reviewForm->setAssocType($assocType);
        $reviewForm->setAssocId($context->getId());
        $reviewForm->setActive(0);
        $reviewForm->setSequence(REALLY_BIG_NUMBER);
        $reviewForm->setTitle($plan['title'], null);
        $reviewForm->setDescription($plan['description'], null);
        $reviewFormId = $reviewFormDao->insertObject($reviewForm);
        $reviewFormDao->resequenceReviewForms($assocType, $context->getId());

        foreach ($plan['elements'] as $element) {
            $reviewFormElement = $reviewFormElementDao->newDataObject();
            $reviewFormElement->setReviewFormId($reviewFormId);
            $reviewFormElement->setSequence(REALLY_BIG_NUMBER);
            $reviewFormElement->setQuestion($element['question'], null);
            $reviewFormElement->setDescription($element['description'], null);
            $reviewFormElement->setRequired($element['required'] ? 1 : 0);
            $reviewFormElement->setIncluded(1);
            $reviewFormElement->setElementType($element['type']);
            $reviewFormElement->setPossibleResponses($element['options'], null);
            $reviewFormElementDao->insertObject($reviewFormElement);
            $reviewFormElementDao->resequenceReviewFormElements($reviewFormId);
        }

        if ($plan['active']) {
            $reviewForm = $reviewFormDao->getById($reviewFormId, $assocType, $context->getId());
            $reviewForm->setActive(1);
            $reviewFormDao->updateObject($reviewForm);
        }
        return $reviewFormId;
    }
}
