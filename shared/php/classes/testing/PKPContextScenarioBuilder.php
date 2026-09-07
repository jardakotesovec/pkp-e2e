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
 * - copyrightNotice (localized) — Settings › Workflow › Submission › "Author
 *   Guidelines" form's Copyright Notice (U21); with it set, the wizard's
 *   Review step gains the "Confirmation" section (ConfirmSubmission).
 * - metadata {keywords?, subjects?, disciplines?, agencies?, coverage?,
 *   rights?, source?, type?, citations?, fundingStatement?, funders?,
 *   dataAvailability?, dataCitations?, plainLanguageSummary?} — the
 *   Settings › Workflow › Submission › "Metadata" screen's items (U21), each
 *   one of the words off / enable / request / require (Context::METADATA_*);
 *   an item the app's context schema lacks is a 400.
 * - submissionAcknowledgement (off / submittingAuthor / allAuthors),
 *   copySubmissionAckPrimaryContact (bool), copySubmissionAckAddress
 *   (string, comma-separated) — Settings › Workflow › Emails "Submission
 *   Confirmation" (U21; PKPEmailSetupForm).
 * All settings passthroughs (review included) are validated and written in
 * ONE PKPContextService::validate + ::edit, exactly as the settings forms'
 * PUT contexts/{id} save is (PKPContextController::edit).
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
        $intakeSettings = $this->parseIntakeSettings($root, $primaryLocale);
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

        // The settings forms' save (Review "Setup" / "Reviewer Guidance",
        // Submission "Author Guidelines" / "Metadata", Emails): PUT
        // contexts/{id} → PKPContextController::edit validates against the
        // context schema with the context's form locales, then
        // PKPContextService::edit writes.
        $formSettings = ($reviewSettings ?? []) + $intakeSettings['settings'];
        if ($formSettings !== []) {
            $specKeys = $intakeSettings['specKeys'] + array_combine(
                array_keys($reviewSettings ?? []),
                array_map(fn ($key) => "review.{$key}", array_keys($reviewSettings ?? []))
            );
            $context = $this->saveFormSettings($context, $formSettings, $specKeys);
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
     * Validate and write settings the way the settings forms' PUT
     * contexts/{id} save does (PKPContextController::edit). A validation
     * error is a 400 naming the spec key of the first refused field.
     *
     * @param array $specKeys context-schema field → dotted spec key
     */
    protected function saveFormSettings(Context $context, array $settings, array $specKeys): Context
    {
        $contextService = app()->get('context'); /** @var \PKP\services\PKPContextService $contextService */
        $errors = $contextService->validate(
            EntityWriteInterface::VALIDATE_ACTION_EDIT,
            $settings + ['id' => $context->getId()],
            (array) $context->getSupportedFormLocales(),
            $context->getPrimaryLocale()
        );
        if (!empty($errors)) {
            // A multilingual error is keyed "field.locale".
            $field = explode('.', (string) array_key_first($errors))[0];
            throw new SpecException($specKeys[$field] ?? $field, 'The settings form would refuse this: ' . json_encode($errors));
        }
        return $contextService->edit($context, $settings, Application::get()->getRequest());
    }

    /**
     * The optional submission-intake passthroughs → the context-settings
     * rows their Settings › Workflow forms save (U21): `copyrightNotice`
     * (Submission › Author Guidelines), `metadata` (Submission › Metadata)
     * and the Emails tab's `submissionAcknowledgement`,
     * `copySubmissionAckPrimaryContact`, `copySubmissionAckAddress`. Only
     * keys the app's context schema carries are accepted.
     *
     * @return array{settings: array, specKeys: array}
     */
    protected function parseIntakeSettings(Spec $root, string $primaryLocale): array
    {
        $schema = app()->get('schema')->get('context'); /** @var \stdClass $schema */
        $hasProperty = fn (string $key) => isset($schema->properties->{$key});
        $settings = [];
        $specKeys = [];

        if ($root->has('copyrightNotice')) {
            $value = $root->get('copyrightNotice');
            if (!is_string($value) && !is_array($value)) {
                throw new SpecException('copyrightNotice', 'copyrightNotice must be a string or a locale map');
            }
            $settings['copyrightNotice'] = $root->localized('copyrightNotice', $primaryLocale);
            $specKeys['copyrightNotice'] = 'copyrightNotice';
        }

        if ($root->has('metadata')) {
            $spec = $root->child('metadata');
            // The Metadata form posts form-encoded strings, so its "off"
            // arrives as the string "0" (the context schema types these
            // items as strings, and its validator refuses the bare integer
            // METADATA_DISABLE); the stored row is "0" either way.
            $modes = [
                'off' => (string) Context::METADATA_DISABLE,
                'enable' => Context::METADATA_ENABLE,
                'request' => Context::METADATA_REQUEST,
                'require' => Context::METADATA_REQUIRE,
            ];
            // The items of PKPMetadataSettingsForm, in its order.
            foreach ([
                'plainLanguageSummary', 'keywords', 'subjects', 'disciplines', 'agencies', 'coverage', 'rights',
                'source', 'type', 'citations', 'fundingStatement', 'funders', 'dataAvailability', 'dataCitations',
            ] as $item) {
                if (!$spec->has($item)) {
                    continue;
                }
                $hasProperty($item) || throw new SpecException("metadata.{$item}", "metadata.{$item} is not a metadata item of this app's Metadata screen");
                $mode = $spec->get($item);
                if (!is_string($mode) || !array_key_exists($mode, $modes)) {
                    throw new SpecException("metadata.{$item}", "metadata.{$item} must be one of: " . implode(', ', array_keys($modes)));
                }
                $settings[$item] = $modes[$mode];
                $specKeys[$item] = "metadata.{$item}";
            }
            $spec->assertConsumed();
        }

        if ($root->has('submissionAcknowledgement')) {
            $options = [
                'off' => Context::SUBMISSION_ACKNOWLEDGEMENT_OFF,
                'submittingAuthor' => Context::SUBMISSION_ACKNOWLEDGEMENT_SUBMITTING_AUTHOR,
                'allAuthors' => Context::SUBMISSION_ACKNOWLEDGEMENT_ALL_AUTHORS,
            ];
            $value = $root->get('submissionAcknowledgement');
            if (!is_string($value) || !array_key_exists($value, $options)) {
                throw new SpecException('submissionAcknowledgement', 'submissionAcknowledgement must be one of: ' . implode(', ', array_keys($options)));
            }
            $settings['submissionAcknowledgement'] = $options[$value];
            $specKeys['submissionAcknowledgement'] = 'submissionAcknowledgement';
        }
        if ($root->has('copySubmissionAckPrimaryContact')) {
            $settings['copySubmissionAckPrimaryContact'] = (bool) $root->get('copySubmissionAckPrimaryContact');
            $specKeys['copySubmissionAckPrimaryContact'] = 'copySubmissionAckPrimaryContact';
        }
        if ($root->has('copySubmissionAckAddress')) {
            // An empty box arrives as null on both the form's PUT and this
            // POST (ConvertEmptyStringsToNull middleware), so null is the
            // cleared state the form itself saves.
            $value = $root->get('copySubmissionAckAddress');
            if (!is_string($value) && $value !== null) {
                throw new SpecException('copySubmissionAckAddress', 'copySubmissionAckAddress must be a string (comma-separated addresses, as the field is typed)');
            }
            $settings['copySubmissionAckAddress'] = $value;
            $specKeys['copySubmissionAckAddress'] = 'copySubmissionAckAddress';
        }

        return ['settings' => $settings, 'specKeys' => $specKeys];
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
                    'included' => (bool) $elementSpec->get('included', true),
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
     * resequence), ReviewFormElementForm::execute per item (`included` as
     * the item window's "Included in message to author" box, on by default;
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
            $reviewFormElement->setIncluded($element['included'] ? 1 : 0);
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
