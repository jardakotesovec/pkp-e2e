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
 * - context.supportedFormLocales (U11) — the same grid's "Forms" column:
 *   ContextFactory::create ticks each listed locale beyond the primary the
 *   way LanguageGridHandler::saveLanguageSetting does (restoreLocaleDefaults,
 *   the reviewer recommendations' localized titles, one
 *   PKPContextService::edit per tick). Each locale must be among
 *   supportedLocales and the primary locale must be listed; the settings
 *   forms and the Highlights panel then carry one field set per locale.
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
 * - citationsMetadataLookup (bool) — the same "Metadata" screen's "References
 *   Metadata Lookup" box, "Enable references structuring and metadata
 *   lookup" (U42; PKPMetadataSettingsForm's FieldOptions over the schema's
 *   boolean, which the form posts whether or not the "References" item is
 *   ticked). A fresh context has no row, which reads as off; on, a reference
 *   added afterwards queues the lookup job chain (Repo::citation()).
 * - enablePublisherId (list of the form's values) — the same "Metadata"
 *   screen's "Publisher ID" boxes (U44; the app's MetadataSettingsForm
 *   FieldOptions, whose options are read from the form itself, so each app
 *   accepts exactly the boxes its screen offers: a journal publication /
 *   galley / issue / issueGalley, a press publication / chapter /
 *   representation / file, a preprint server publication / galley). An
 *   empty list is every box unticked, which the form posts as '' and the
 *   save turns into [].
 * - submissionAcknowledgement (off / submittingAuthor / allAuthors),
 *   copySubmissionAckPrimaryContact (bool), copySubmissionAckAddress
 *   (string, comma-separated) — Settings › Workflow › Emails "Submission
 *   Confirmation" (U21; PKPEmailSetupForm).
 * - postedAcknowledgement (bool) — Settings › Workflow › Emails "Preprint
 *   Posted" (U49; OPS EmailSetupForm::FIELD_POSTED_ACK, read by
 *   SendPostedAcknowledgement and OPS mail\Repository). Only the OPS
 *   context schema carries the key, so OJS and OMP answer 400 on it.
 * - enablePublicComments (bool) — Settings › Website › Content › "Comments"
 *   tab's "Enable Public Comments" box (U14; ContentCommentsForm, a lib/pkp
 *   form the three apps share, so the key applies to all of them). Off on
 *   every fresh context (the schema default, stored as 0); on, a published
 *   item's landing page carries the comments blocks (OJS) and the
 *   moderators' side menu the Content › Comments entry (every app).
 * - enableAnnouncements (bool), announcementsIntroduction (localized),
 *   numAnnouncementsHomepage (int ≥ 0 or null) — Settings › Website › Setup ›
 *   "Announcements" tab's three fields (U12; PKPAnnouncementSettingsForm, a
 *   lib/pkp form the three apps share; OMP labels the text "Additional
 *   Information"). Off / empty / empty on every fresh context.
 * - sidebar (list of block plugin names, e.g. ['AnnouncementFeedBlockPlugin'])
 *   — Settings › Website › Appearance › Setup "Sidebar" (U12;
 *   PKPAppearanceSetupForm, shared by the three apps). Validated as the form's
 *   save is (PKPContextService::validate refuses a block no enabled plugin of
 *   the context provides) after the context's block plugins are loaded the way
 *   a request inside the context loads them (loadBlockPlugins()).
 * - plugins {<lowercased plugin class name>: {enabled*, settings?}} — the
 *   Settings › Website › Plugins grid's enable / disable for that context
 *   (U12; PluginGridHandler::enable: the plugin's `enabled` setting for the
 *   context and the audit-log line, its session-bound toast not mirrored) and
 *   the plugin's own settings window (each setting through
 *   Plugin::updateSetting, as its form's execute writes it). Site-wide plugins
 *   are refused (their state is global, D9); "site-wide" is asked as the
 *   context's grid asks it, so the Custom Block Manager, site-wide only
 *   outside a context, is enabled for the context (U09).
 * - announcementTypes[] {name*} and announcements[] {title*, descriptionShort?,
 *   description?, dateExpire?, type?} — the "Announcement Types" grid's Add
 *   window (AnnouncementTypeForm::execute: AnnouncementTypeDAO::insertObject)
 *   and the Announcements panel's "Add Announcement" › "Save" (U12;
 *   PKPAnnouncementController::add: Repo::announcement()->validate,
 *   Announcement::create, then the controller's own notifyUsers() with "Send
 *   Email" unticked, invoked by reflection). Seeded last, after users[], so
 *   the queued notification reaches the scratch users the way the panel's
 *   Save reaches every user with a role.
 * - roles {<role key>: {recommendOnly?, permitMetadataEdit?, permitSettings?,
 *   masthead?}} — Settings › Users & Roles › Roles, a role's "Edit" › "Role
 *   Options" (U35, U07): the role's "This role is only allowed to
 *   recommend…", "Permit submission metadata edit.", "Consider role in
 *   masthead list" and "Permit changes to Settings" boxes, saved by running
 *   the Roles grid's own form
 *   (UserGroupForm: initData from the stored role, the two boxes set, then
 *   execute — its assignment rewrite on a metadata change, its stage
 *   re-save and its audit-log line included). Keys are the role keys of
 *   users[].roles; recommendOnly is refused where the form offers no box
 *   (roles below sub-editor level) and permitMetadataEdit false on a
 *   manager-level role (the form forces it on); permitSettings true below
 *   manager level (the box is disabled there) and false on the Journal
 *   Manager (no "Settings" link; the lock-out guard). `stages` (U39) is
 *   the same window's "Stage Assignment" boxes: a map of stage word
 *   (ApiCall::STAGES, this app's own) to true (ticked) or false (unticked);
 *   an unnamed box keeps its stored state. Refused: another app's word, a
 *   box the window disables for the role (every box of a manager-level
 *   role, whose box group the window hides; a reviewer's non-review boxes;
 *   a reader's), a non-boolean, and a save leaving no box ticked (the
 *   form's execute then keeps the stored stages). Applied before the
 *   components, the task templates and users[], so a template's `roles`
 *   sees the stages as the screen would after the role's "OK".
 * - components {<name>: false | {metadata?, dependent?, supplementary?,
 *   required?}} — Settings › Workflow › Submission › "Components" (U36),
 *   the component grid of every app: a name among the components every new
 *   context gets (registry/genres.xml, named in the primary locale) with
 *   `false` is that row's "Delete" (GenreGridHandler::deleteGenre: the
 *   in-use check, then the DAO's soft delete), with an object its "Edit"
 *   window's save; any other name is "Add Component"'s save. Both saves run
 *   the grid's own GenreForm (initData from the stored component, the
 *   window's fields as the spec sets them, execute). `metadata` is the
 *   "File Metadata" list (document / artwork / supplementary), the three
 *   booleans the "File Type" boxes and "Require with Submissions". Applied
 *   after the settings forms, before users[].
 * - taskTemplates[] {stage*, title*, type?, dueInterval?, roles?, include?,
 *   message?} — Settings › Workflow › "Tasks and Discussions" (U37): an
 *   installed template of that stage, matched by its primary-locale title,
 *   is its "Edit" › "Save"; any other title the stage's "Add template" ›
 *   "Save". The window's JSON body through AddTaskTemplate /
 *   UpdateTaskTemplate's own rules and PKPEditTaskTemplateController::add /
 *   ::update themselves (ApiCall). `include` is "Auto-add at stage",
 *   `roles` "Limit access to specific roles", `type` "task" with
 *   `dueInterval` (P1W … P3M) the task information. Applied after the
 *   settings forms and components, before users[].
 * - libraryFiles[] {name*, type*, description?, publicAccess?, file?} —
 *   Settings › Workflow › "Publisher Library" ("Press Library",
 *   "Preprint Server Library") (U39): each the tab's "Add a file" window,
 *   its upload and its "OK", acting as the seeding admin
 *   (LibraryFileSeeder: TemporaryFileManager::handleUpload, then the
 *   settings NewLibraryFileForm's execute). `type` is a label of the
 *   window's "Type" list ("Marketing", "Permissions", "Reports", "Other";
 *   a press also "Contracts"), `publicAccess` the "Public Access" box,
 *   `file` a fixture basename (default the app's PDF fixture). Applied
 *   after the task templates, before users[].
 * - categories[] {path*, title?, children[]?} — Settings › <context> ›
 *   "Categories" (U10): the bootstrap payload's own list and seeding path
 *   (CategorySeeder: the "Add Category" window's validation and repository
 *   write; children are the row's "More Actions" › "Add"). Applied after
 *   the structures, before users[]; the response lists every category as
 *   {id, path, parentId}, depth first.
 * All settings passthroughs (review included) are validated and written in
 * ONE PKPContextService::validate + ::edit, exactly as the settings forms'
 * PUT contexts/{id} save is (PKPContextController::edit).
 * App overlays (parseOverlay / executeOverlay, as in PKPBootstrapSeeder):
 * - OJS issues[] {volume*, number*, year*, published?} (U08) — the
 *   bootstrap payload's own issues list and seeding path
 *   (BootstrapSeeder::parseIssues / ::addIssues): Issues › "Create Issue"
 *   with the "Title" box unticked, then "Publish Issue" with the email box
 *   unticked. Applied after users[]; the response lists the issues' ids.
 *   OMP and OPS read no overlay, so the key answers 400 there.
 */

namespace PKP\testing;

use APP\core\Application;
use APP\facades\Repo;
use PKP\announcement\Announcement;
use PKP\context\Context;
use PKP\controllers\grid\settings\roles\form\UserGroupForm;
use PKP\core\Core;
use Illuminate\Support\Facades\DB;
use PKP\db\DAORegistry;
use PKP\orcid\OrcidManager;
use PKP\plugins\Plugin;
use PKP\plugins\PluginRegistry;
use PKP\reviewForm\ReviewFormElement;
use PKP\security\AuditEvent;
use PKP\security\AuditLog;
use PKP\security\Role;
use PKP\services\interfaces\EntityWriteInterface;
use PKP\submission\reviewAssignment\ReviewAssignment;
use Psr\Log\LogLevel;
use PKP\testing\ContextFactory;
use PKP\testing\Spec;
use PKP\testing\SpecException;
use PKP\testing\UserSeeder;
use PKP\workflow\WorkflowStageDAO;

abstract class PKPContextScenarioBuilder
{
    /**
     * The "Role Options" boxes of a role's Roles › "Settings" › "Edit"
     * window the `roles` key sets: "This role is only allowed to
     * recommend…", "Permit submission metadata edit.", "Consider role in
     * masthead list" (masthead) and "Permit changes to Settings".
     */
    public const ROLE_OPTIONS = ['recommendOnly', 'permitMetadataEdit', 'permitSettings', 'masthead'];

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

    /**
     * Parse app-overlay root keys (OJS: `issues[]`, U08). Returns an opaque
     * plan; the default reads nothing, so an overlay key another app does
     * not have is left unconsumed and answers 400.
     */
    protected function parseOverlay(Spec $root): array
    {
        return [];
    }

    /**
     * Execute the app overlay once the context, its structures and users[]
     * exist; returns extra response entries (OJS: `issues`).
     */
    protected function executeOverlay(Context $context, array $overlayPlan): array
    {
        return [];
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
        $categoryPlans = CategorySeeder::parse(
            $root,
            (string) $contextParams['primaryLocale'],
            $contextParams['supportedFormLocales'] ?? [(string) $contextParams['primaryLocale']]
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
        $pluginPlans = $this->parsePlugins($root);
        $rolePlans = $this->parseRoleOptions($root);
        $componentPlans = $this->parseComponents($root, $primaryLocale);
        $templatePlans = $this->parseTaskTemplates($root);
        $libraryFilePlans = LibraryFileSeeder::parse($root, true);
        $announcementTypePlans = $this->parseAnnouncementTypes($root, $primaryLocale);
        $announcementPlans = $this->parseAnnouncements($root, $primaryLocale, $announcementTypePlans);
        $overlayPlan = $this->parseOverlay($root);
        $root->assertConsumed();

        if (Application::getContextDAO()->getByPath((string) $contextData['path'])) {
            throw new SpecException('context.path', "A context with path \"{$contextData['path']}\" already exists — tags must be unique per run");
        }

        // Execute phase. PKPContextService::add resequences every context
        // row (UPDATE journals SET seq …) before it installs the defaults,
        // and inside the request's transaction those row locks are held to
        // the commit — every other worker's context seed queues behind this
        // one for the whole ~2 s build (measured 2026-09-13: eight
        // concurrent seeds finished 2.2 s apart; 7.4 s average wait per
        // seed over a full OJS run). So the context itself is created in
        // autocommit mode, each statement releasing its locks at once, and
        // the transaction resumes for the rest of the build. The parse
        // phase above has already refused every spec error before the
        // first write, so a half-built context needs an unexpected failure.
        $inTransaction = DB::transactionLevel() > 0;
        if ($inTransaction) {
            DB::commit();
        }
        try {
            $context = $this->contextFactory->create($contextParams);
        } finally {
            if ($inTransaction) {
                DB::beginTransaction();
            }
        }

        if ($orcidSettings !== null) {
            // The same service call the ORCID settings tab's form save runs
            // (PUT contexts/{id} → PKPContextService::edit — schema handles
            // the client-secret encryption exactly as the UI path does).
            $contextService = app()->get('context'); /** @var \PKP\services\PKPContextService $contextService */
            $context = $contextService->edit($context, $orcidSettings, Application::get()->getRequest());
        }

        // The Plugins grid's enable / disable and the plugins' own settings
        // windows, before the settings forms: the Appearance "Sidebar" save
        // refuses a block whose plugin is not enabled for the context.
        $touchedPlugins = [];
        foreach ($pluginPlans as $plan) {
            $touchedPlugins[] = $this->applyPlugin($context, $plan);
        }

        // The settings forms' save (Review "Setup" / "Reviewer Guidance",
        // Submission "Author Guidelines" / "Metadata", Emails, Website ›
        // Setup "Announcements", Appearance "Sidebar"): PUT contexts/{id} →
        // PKPContextController::edit validates against the context schema
        // with the context's form locales, then PKPContextService::edit
        // writes.
        $formSettings = ($reviewSettings ?? []) + $intakeSettings['settings'];
        if (array_key_exists('sidebar', $formSettings)) {
            $this->loadBlockPlugins($context, $touchedPlugins);
        }
        if ($formSettings !== []) {
            $specKeys = $intakeSettings['specKeys'] + array_combine(
                array_keys($reviewSettings ?? []),
                array_map(fn ($key) => "review.{$key}", array_keys($reviewSettings ?? []))
            );
            $context = $this->saveFormSettings($context, $formSettings, $specKeys);
        }

        // The Roles tab's "Edit" › "OK" per role, before the components and
        // the task templates: a template window offers the roles that work
        // on its stage, which a role's "Stage Assignment" boxes decide.
        foreach ($rolePlans as $plan) {
            $this->applyRoleOptions($context, $plan);
        }

        $components = [];
        foreach ($componentPlans as $plan) {
            $components[] = $this->applyComponent($context, $plan);
        }

        $taskTemplates = [];
        foreach ($templatePlans as $plan) {
            $taskTemplates[] = $this->applyTaskTemplate($context, $plan);
        }

        // Settings › Workflow › "Publisher Library" › "Add a file" › "OK",
        // acting as the seeding admin (a manager of every scratch context).
        $libraryFiles = [];
        if ($libraryFilePlans !== []) {
            $admin = Repo::user()->getByUsername('admin', true);
            foreach ($libraryFilePlans as $plan) {
                $libraryFiles[] = LibraryFileSeeder::add($context, $plan, null, $admin);
            }
        }

        foreach ($reviewFormPlans as $plan) {
            $this->addReviewForm($context, $plan);
        }

        $sequence = 1;
        foreach ($structurePlans as $plan) {
            $this->addStructure($context, $plan, $sequence++);
        }

        // Settings › <context> › "Categories", after the structures as in
        // the bootstrap (U10).
        $categories = [];
        foreach ($categoryPlans as $plan) {
            array_push($categories, ...CategorySeeder::add($context, $plan, null));
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

        // The app overlay (OJS issues[]), after users[] as in the bootstrap.
        $overlay = $this->executeOverlay($context, $overlayPlan);

        // Announcement types, then announcements: after users[], so the
        // panel's own notification fan-out reaches the scratch users.
        $announcementTypes = [];
        $typeIds = [];
        foreach ($announcementTypePlans as $plan) {
            $typeId = $this->addAnnouncementType($context, $plan);
            $typeIds[$plan['key']] = $typeId;
            $announcementTypes[] = ['id' => $typeId, 'name' => $plan['key']];
        }
        $announcements = [];
        foreach ($announcementPlans as $plan) {
            $announcements[] = $this->addAnnouncement($context, $plan, $typeIds);
        }

        return [
            'tag' => $tag,
            'contextId' => $context->getId(),
            'path' => $context->getPath(),
            'users' => $users,
            'announcementTypes' => $announcementTypes,
            'announcements' => $announcements,
            'components' => $components,
            'taskTemplates' => $taskTemplates,
            'libraryFiles' => $libraryFiles,
            'categories' => $categories,
        ] + $overlay;
    }

    /**
     * The optional `taskTemplates[]` list (U37) → one plan per entry: a
     * template of Settings › Workflow › "Tasks and Discussions". An entry
     * whose title matches a template the new context already holds on
     * that stage (the installed ones, named in the primary locale) is that
     * row's "Edit" › "Save"; any other title is the stage's "Add template"
     * › "Save". Parse phase: shapes and role keys only (the role keys
     * against the roles every new context gets); no writes.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function parseTaskTemplates(Spec $root): array
    {
        if (!$root->has('taskTemplates')) {
            return [];
        }
        $roleKeys = [];
        $xml = simplexml_load_file(Core::getBaseDir() . '/registry/userGroups.xml');
        foreach ($xml->group as $group) {
            $roleKeys[] = preg_replace('/^default\.groups\.name\./', '', (string) $group['name']);
        }
        $intervals = array_column(\PKP\editorialTask\enums\EditorialTaskDueInterval::cases(), 'value');
        $plans = [];
        foreach ($root->childList('taskTemplates') as $spec) {
            $plan = [
                'path' => $spec->path,
                'stageId' => ApiCall::stageId((string) $spec->require('stage'), "{$spec->path}.stage"),
                'title' => (string) $spec->require('title'),
                'fields' => [],
            ];
            if ($spec->has('type')) {
                $type = (string) $spec->get('type');
                if (!in_array($type, ['discussion', 'task'], true)) {
                    throw new SpecException("{$spec->path}.type", 'type must be "discussion" or "task" (the "Enter task information" box)');
                }
                $plan['fields']['type'] = $type;
            }
            if ($spec->has('dueInterval')) {
                $interval = (string) $spec->get('dueInterval');
                if (!in_array($interval, $intervals, true)) {
                    throw new SpecException("{$spec->path}.dueInterval", 'dueInterval must be one of the "Due Date" list\'s values: ' . implode(', ', $intervals) . ' (P1W "1 week from the creation date" … P3M "3 months …")');
                }
                $plan['fields']['dueInterval'] = $interval;
            }
            if ($spec->has('roles')) {
                $roles = $spec->get('roles');
                if (!is_array($roles) || !array_is_list($roles) || $roles === []) {
                    throw new SpecException("{$spec->path}.roles", 'roles must be a non-empty list of role keys ("Limit access to specific roles" with those boxes ticked)');
                }
                foreach ($roles as $i => $roleKey) {
                    if (!in_array((string) $roleKey, $roleKeys, true)) {
                        sort($roleKeys);
                        throw new SpecException("{$spec->path}.roles.{$i}", "Unknown role key \"{$roleKey}\". This app's keys: " . implode(', ', $roleKeys));
                    }
                }
                $plan['fields']['roles'] = array_map('strval', $roles);
            }
            if ($spec->has('include')) {
                $include = $spec->get('include');
                if (!is_bool($include)) {
                    throw new SpecException("{$spec->path}.include", 'include must be a boolean (the "Auto-add at stage" box)');
                }
                $plan['fields']['include'] = $include;
            }
            if ($spec->has('message')) {
                // The "Discussion" box is a rich-text editor, which posts a
                // paragraph for plain typed text; markup is kept.
                $message = (string) $spec->get('message');
                $plan['fields']['message'] = ($message !== '' && !str_starts_with(ltrim($message), '<')) ? "<p>{$message}</p>" : $message;
            }
            $plans[] = $plan;
        }
        return $plans;
    }

    /**
     * Save one template the way its window's "Save" does: the body the
     * window posts (title, stageId, restrictToUserGroups, userGroupIds or
     * null, include, dueInterval or null for a discussion, description,
     * type), for an edit started from the stored template as the window
     * opens with it, validated with AddTaskTemplate / UpdateTaskTemplate's
     * own rules and handed to PKPEditTaskTemplateController::add or
     * ::update itself (ApiCall). The window's own refusals are the seed's:
     * a task needs a "Due Date", a limited template at least one role, and
     * each role must be one of the boxes the window offers (the roles that
     * work on the stage, `userGroups?stageIds=`). A new template's message
     * defaults to a seeded line, since the box is required.
     *
     * @return array{id: int, title: string, stage: string, action: string}
     */
    protected function applyTaskTemplate(Context $context, array $plan): array
    {
        $restore = ContextFactory::forceRequestContext($context);
        try {
            $primaryLocale = $context->getPrimaryLocale();
            $existing = \PKP\editorialTask\Template::query()
                ->withContextId($context->getId())
                ->withStageId($plan['stageId'])
                ->with('userGroups')
                ->get()
                ->first(fn ($template) => $template->getLocalizedData('title', $primaryLocale) === $plan['title']);
            $taskType = \PKP\editorialTask\enums\EditorialTaskType::TASK->value;
            $fields = $plan['fields'];
            if ($existing) {
                if ($fields === []) {
                    throw new SpecException($plan['path'], "An edit of the installed template \"{$plan['title']}\" that sets nothing; give type, dueInterval, roles, include or message");
                }
                $isTask = isset($fields['type']) ? $fields['type'] === 'task' : (int) $existing->type === $taskType;
                $restricted = isset($fields['roles']) ? true : (bool) $existing->restrictToUserGroups;
                $userGroupIds = $existing->userGroups->map(fn ($userGroup) => (int) $userGroup->id)->values()->all();
                $body = [
                    'title' => $existing->getLocalizedData('title'),
                    'include' => (bool) $existing->include,
                    'dueInterval' => $isTask ? ($fields['dueInterval'] ?? $existing->dueInterval) : null,
                    'description' => $existing->getLocalizedData('description') ?? '',
                ];
            } else {
                $isTask = ($fields['type'] ?? 'discussion') === 'task';
                $restricted = isset($fields['roles']);
                $userGroupIds = [];
                $body = [
                    'title' => $plan['title'],
                    'include' => false,
                    'dueInterval' => $isTask ? ($fields['dueInterval'] ?? null) : null,
                    'description' => '<p>Seeded template text for ' . htmlspecialchars($plan['title']) . '.</p>',
                ];
            }
            if (!$isTask && isset($fields['dueInterval'])) {
                throw new SpecException("{$plan['path']}.dueInterval", 'A discussion template has no "Due Date": dueInterval needs type "task"');
            }
            if ($isTask && $body['dueInterval'] === null) {
                throw new SpecException("{$plan['path']}.dueInterval", 'A task template\'s "Due Date" is required: give dueInterval');
            }
            if (isset($fields['roles'])) {
                $offered = \PKP\userGroup\UserGroup::withContextIds([$context->getId()])->withStageIds([$plan['stageId']])->get();
                $userGroupIds = [];
                foreach ($fields['roles'] as $i => $roleKey) {
                    $userGroup = $this->userSeeder->resolveUserGroup($context, $roleKey, "{$plan['path']}.roles.{$i}");
                    if (!$offered->contains(fn ($group) => (int) $group->id === (int) $userGroup->id)) {
                        throw new SpecException("{$plan['path']}.roles.{$i}", "The window offers only the roles that work on the stage; \"{$roleKey}\" does not");
                    }
                    $userGroupIds[] = (int) $userGroup->id;
                }
            }
            $body['stageId'] = $plan['stageId'];
            $body['restrictToUserGroups'] = $restricted;
            $body['userGroupIds'] = $restricted ? $userGroupIds : null;
            $body['include'] = $fields['include'] ?? $body['include'];
            $body['description'] = $fields['message'] ?? $body['description'];
            $body['type'] = $isTask ? $taskType : \PKP\editorialTask\enums\EditorialTaskType::DISCUSSION->value;

            $controller = ApiCall::controller(\PKP\API\v1\editTaskTemplates\PKPEditTaskTemplateController::class);
            if ($existing) {
                $request = ApiCall::request(\PKP\API\v1\editTaskTemplates\formRequests\UpdateTaskTemplate::class, 'PUT', $body, ['templateId' => $existing->id], $plan['path'], 'The template window\'s "Save" would be refused');
                $saved = ApiCall::answer($controller->update($request), $plan['path'], 'The template window\'s "Save" failed');
            } else {
                $request = ApiCall::request(\PKP\API\v1\editTaskTemplates\formRequests\AddTaskTemplate::class, 'POST', $body, [], $plan['path'], 'The template window\'s "Save" would be refused');
                $saved = ApiCall::answer($controller->add($request), $plan['path'], 'The template window\'s "Save" failed');
            }
            return ['id' => (int) $saved['id'], 'title' => $plan['title'], 'stage' => ApiCall::stageWord($plan['stageId']), 'action' => $existing ? 'edited' : 'added'];
        } finally {
            $restore();
        }
    }

    /**
     * The optional `components` map → one plan per entry, in the map's
     * order. A name is matched against the components every new context
     * gets (registry/genres.xml, each named in the context's primary
     * locale, the name the "Components" list shows): a match is that row's
     * "Delete" (false) or "Edit" (an object), anything else an "Add
     * Component". Parse phase: no writes, so every refusal comes before the
     * context exists.
     *
     * @return array<int, array{name: string, key: ?string, remove: bool, fields: array<string, mixed>}>
     */
    protected function parseComponents(Spec $root, string $primaryLocale): array
    {
        $spec = $root->child('components');
        if ($spec === null) {
            return [];
        }
        $raw = (array) $root->get('components');
        if (array_is_list($raw)) {
            throw new SpecException('components', 'components must be a map of component name to false (delete) or {metadata?, dependent?, supplementary?, required?}');
        }
        $defaults = [];
        $xml = simplexml_load_file(Core::getBaseDir() . '/registry/genres.xml');
        foreach ($xml->genre as $genre) {
            $defaults[__((string) $genre['localeKey'], [], $primaryLocale)] = (string) $genre['key'];
        }
        $categories = [
            'document' => \PKP\submission\Genre::GENRE_CATEGORY_DOCUMENT,
            'artwork' => \PKP\submission\Genre::GENRE_CATEGORY_ARTWORK,
            'supplementary' => \PKP\submission\Genre::GENRE_CATEGORY_SUPPLEMENTARY,
        ];
        $plans = [];
        foreach ($raw as $name => $value) {
            $name = (string) $name;
            $key = $defaults[$name] ?? null;
            $specKey = "components.{$name}";
            if (trim($name) === '') {
                throw new SpecException($specKey, 'A component needs a name (the window\'s "Name" box is required)');
            }
            if ($value === false) {
                $spec->get($name);
                if ($key === null) {
                    throw new SpecException($specKey, "No component \"{$name}\" to delete. A new context's components: " . implode(', ', array_map(fn ($n) => "\"{$n}\"", array_keys($defaults))));
                }
                $plans[] = ['name' => $name, 'key' => $key, 'remove' => true, 'fields' => []];
                continue;
            }
            if (!is_array($value)) {
                throw new SpecException($specKey, "{$specKey} must be false (the row's \"Delete\") or an object of the window's fields");
            }
            $planSpec = $spec->child($name);
            $fields = [];
            if ($planSpec->has('metadata')) {
                $metadata = $planSpec->get('metadata');
                if (!is_string($metadata) || !isset($categories[$metadata])) {
                    throw new SpecException("{$specKey}.metadata", '"File Metadata" is one of: ' . implode(', ', array_keys($categories)));
                }
                $fields['category'] = $categories[$metadata];
            }
            foreach (['dependent', 'supplementary', 'required'] as $box) {
                if (!$planSpec->has($box)) {
                    continue;
                }
                $boxValue = $planSpec->get($box);
                if (!is_bool($boxValue)) {
                    throw new SpecException("{$specKey}.{$box}", "{$specKey}.{$box} must be a boolean");
                }
                $fields[$box] = $boxValue;
            }
            $planSpec->assertConsumed();
            if ($key !== null && $fields === []) {
                throw new SpecException($specKey, "{$specKey} changes nothing; give metadata, dependent, supplementary or required, or false to delete it");
            }
            $plans[] = ['name' => $name, 'key' => $key, 'remove' => false, 'fields' => $fields];
        }
        return $plans;
    }

    /**
     * One "Components" grid action on the new context, run the way the grid
     * runs it, with the request's context pointed at the scratch context
     * (the form and the handler read it):
     * - "Delete" (GenreGridHandler::deleteGenre): refused while a
     *   submission file uses the component, else GenreDAO::deleteObject,
     *   which disables the row (a soft delete).
     * - "Edit" › "Save" and "Add Component" › "Save" (updateGenre →
     *   GenreForm::execute): the form initialised as the window opens
     *   (initData from the stored component; a new one empty), the fields
     *   the window posts set — a new component's name in the primary locale
     *   and an empty box for each other form locale, "File Metadata" at its
     *   first option (Document) unless set, unticked boxes absent, "Require
     *   with Submissions" at "No", an empty "Key" — then execute. Not
     *   mirrored: the form's POST and CSRF checks (the request's).
     *
     * @return array{id: int, name: string, action: string}
     */
    protected function applyComponent(Context $context, array $plan): array
    {
        $genreDao = DAORegistry::getDAO('GenreDAO'); /** @var \PKP\submission\GenreDAO $genreDao */
        $restore = ContextFactory::forceRequestContext($context);
        try {
            $genre = $plan['key'] !== null ? $genreDao->getByKey($plan['key'], $context->getId()) : null;
            if ($plan['key'] !== null && !$genre) {
                throw new SpecException("components.{$plan['name']}", "The new context has no component \"{$plan['name']}\"");
            }
            if ($plan['remove']) {
                $inUse = Repo::submissionFile()->getCollector()->filterByGenreIds([$genre->getId()])->getCount();
                if ($inUse) {
                    throw new SpecException("components.{$plan['name']}", __('manager.genres.alertDelete'));
                }
                $genreDao->deleteObject($genre);
                return ['id' => (int) $genre->getId(), 'name' => $plan['name'], 'action' => 'removed'];
            }
            $form = new \PKP\controllers\grid\settings\genre\form\GenreForm($genre ? $genre->getId() : null);
            $form->initData(['gridId' => 'grid-settings-genre-genregrid']);
            if (!$genre) {
                $names = [];
                foreach ((array) $context->getSupportedFormLocales() as $formLocale) {
                    $names[$formLocale] = '';
                }
                $names[$context->getPrimaryLocale()] = $plan['name'];
                $form->setData('name', $names);
                $form->setData('category', \PKP\submission\Genre::GENRE_CATEGORY_DOCUMENT);
                $form->setData('required', 0);
                $form->setData('key', '');
            }
            foreach ($plan['fields'] as $field => $value) {
                $form->setData($field, $field === 'required' ? (int) $value : ($value ?: null));
            }
            $form->execute();
            return ['id' => (int) $form->getGenreId(), 'name' => $plan['name'], 'action' => $genre ? 'edited' : 'added'];
        } finally {
            $restore();
        }
    }

    /**
     * The optional `roles` map → one plan per role key: the "Role Options"
     * boxes of that role's Settings › Users & Roles › Roles "Edit" form.
     * Role keys are checked against the default roles the app installs in
     * every new context (registry/userGroups.xml, the file
     * PKPContextService::add installs), so an unknown key or a box the form
     * does not offer is a 400 before the context exists. Parse phase: no
     * writes.
     *
     * @return array<int, array{key: string, options: array<string, bool>}>
     */
    protected function parseRoleOptions(Spec $root): array
    {
        $spec = $root->child('roles');
        if ($spec === null) {
            return [];
        }
        $raw = $root->get('roles');
        if (array_is_list($raw)) {
            throw new SpecException('roles', 'roles must be a map of role key to {recommendOnly?, permitMetadataEdit?, permitSettings?, masthead?}');
        }
        // Role key → role id, and role key → installed stage ids, from the
        // roles every new context gets.
        $roleIds = UserSeeder::registryRoleIds();
        $installedStages = self::registryRoleStages();
        // UserGroupForm::getRecommendOnlyRoles() and the user-group
        // repository's NOT_CHANGE_METADATA_EDIT_PERMISSION_ROLES.
        $recommendOnlyRoles = [Role::ROLE_ID_MANAGER, Role::ROLE_ID_SUB_EDITOR];
        $alwaysPermitMetadataRoles = Repo::userGroup()::NOT_CHANGE_METADATA_EDIT_PERMISSION_ROLES;

        $plans = [];
        foreach (array_keys($raw) as $key) {
            $key = (string) $key;
            if (!isset($roleIds[$key])) {
                $known = array_keys($roleIds);
                sort($known);
                throw new SpecException("roles.{$key}", "Unknown role key \"{$key}\". This app's keys: " . implode(', ', $known));
            }
            $planSpec = $spec->child($key);
            $options = [];
            foreach (self::ROLE_OPTIONS as $option) {
                if (!$planSpec->has($option)) {
                    continue;
                }
                $value = $planSpec->get($option);
                if (!is_bool($value)) {
                    throw new SpecException("roles.{$key}.{$option}", "roles.{$key}.{$option} must be a boolean (the box ticked or unticked)");
                }
                $options[$option] = $value;
            }
            if (($options['recommendOnly'] ?? false) && !in_array($roleIds[$key], $recommendOnlyRoles, true)) {
                throw new SpecException("roles.{$key}.recommendOnly", "The Roles form offers the recommend-only box for editor roles only, not for \"{$key}\"");
            }
            if (($options['permitMetadataEdit'] ?? true) === false && in_array($roleIds[$key], $alwaysPermitMetadataRoles, true)) {
                throw new SpecException("roles.{$key}.permitMetadataEdit", "The manager-level role \"{$key}\" always permits metadata edit (the Roles form saves it on whatever is posted)");
            }
            // "Permit changes to Settings": the window enables the box for
            // manager-level roles only (UserGroupForm::getPermitSettingsRoles,
            // and execute() stores false on any other role), and disables it
            // on the acting user's only settings role so no one locks
            // themselves out (UserGroupFormHandler::updatePermitSettings).
            // The acting admin holds the Journal Manager role alone when
            // the roles are saved (ContextFactory's enrolment; users[] comes
            // later), and that row has no "Settings" link at all.
            if (($options['permitSettings'] ?? false) && $roleIds[$key] !== Role::ROLE_ID_MANAGER) {
                throw new SpecException("roles.{$key}.permitSettings", "The Roles form offers \"Permit changes to Settings\" for manager-level roles only, not for \"{$key}\"");
            }
            if (($options['permitSettings'] ?? true) === false && $key === 'manager') {
                throw new SpecException("roles.{$key}.permitSettings", 'The Journal Manager role cannot lose "Permit changes to Settings": its Roles row has no "Settings" link, and the form disables the box on the acting user\'s only settings role');
            }
            $stages = $planSpec->has('stages')
                ? $this->parseRoleStages($planSpec->get('stages'), $key, $roleIds[$key], $installedStages[$key] ?? [])
                : null;
            $planSpec->assertConsumed();
            if ($options === [] && $stages === null) {
                throw new SpecException("roles.{$key}", "roles.{$key} sets nothing; give one of " . implode(', ', [...self::ROLE_OPTIONS, 'stages']));
            }
            $plans[] = ['key' => $key, 'options' => $options, 'stages' => $stages];
        }
        return $plans;
    }

    /**
     * Role key → the stage ids the installer gives the role in every new
     * context (registry/userGroups.xml `stages`, the file
     * PKPContextService::add installs). The `roles` plans are parsed before
     * the context exists, so this is what the role's "Edit" window shows
     * ticked when the key's save runs.
     *
     * @return array<string, int[]>
     */
    protected static function registryRoleStages(): array
    {
        $stages = [];
        $xml = simplexml_load_file(Core::getBaseDir() . '/registry/userGroups.xml');
        foreach ($xml->group as $group) {
            $key = preg_replace('/^default\.groups\.name\./', '', (string) $group['name']);
            $list = trim((string) $group['stages']);
            $stages[$key] = $list === '' ? [] : array_map('intval', explode(',', $list));
        }
        return $stages;
    }

    /**
     * `roles.<key>.stages` → the stage ids the role's "Edit" window posts
     * ticked: the boxes the window renders (this app's workflow stages,
     * UserGroupForm::initData's `stages`; none for the Done stage) as the
     * installer ticked them, with each named box ticked (true) or
     * unticked (false). The window disables the boxes of the role's
     * forbidden stages (RoleDAO::getForbiddenStages; UserGroupFormHandler
     * hides the box group when none is left, as for a manager-level role,
     * whose save always stores every stage), so naming one is a 400; so is
     * a result with no box ticked, since UserGroupForm::execute then
     * re-saves nothing and the role keeps its stored stages. Parse phase.
     *
     * @param int[] $installed
     *
     * @return int[]
     */
    protected function parseRoleStages(mixed $raw, string $key, int $roleId, array $installed): array
    {
        $path = "roles.{$key}.stages";
        if (!is_array($raw) || $raw === [] || array_is_list($raw)) {
            throw new SpecException($path, "{$path} must be a non-empty map of stage word to boolean (the \"Stage Assignment\" box ticked or unticked), e.g. {submission: true}");
        }
        $roleDao = DAORegistry::getDAO('RoleDAO'); /** @var \PKP\security\RoleDAO $roleDao */
        $formStages = array_keys(WorkflowStageDAO::getWorkflowStageTranslationKeys());
        $forbidden = $roleDao->getForbiddenStages($roleId);
        $ticked = array_values(array_intersect($installed, $formStages));
        foreach ($raw as $word => $value) {
            $word = (string) $word;
            $stageId = ApiCall::stageId($word, "{$path}.{$word}");
            if (!is_bool($value)) {
                throw new SpecException("{$path}.{$word}", "{$path}.{$word} must be a boolean (the box ticked or unticked)");
            }
            if (in_array($stageId, $forbidden)) {
                throw new SpecException("{$path}.{$word}", array_diff($formStages, $forbidden) === []
                    ? "The Roles form shows no \"Stage Assignment\" boxes for \"{$key}\"" . (in_array($roleId, $roleDao->getAlwaysActiveStages()) ? ' (a manager-level role: its save always stores every stage)' : '')
                    : "The Roles form disables the \"{$word}\" box for \"{$key}\"");
            }
            $ticked = $value
                ? array_values(array_unique([...$ticked, $stageId]))
                : array_values(array_diff($ticked, [$stageId]));
        }
        if ($ticked === []) {
            throw new SpecException($path, "{$path} leaves no \"Stage Assignment\" box ticked; the Roles form's save then keeps the stored stages, so the key cannot mean it");
        }
        sort($ticked);
        return $ticked;
    }

    /**
     * Save one role's "Role Options" the way the Roles grid's "Edit" › "OK"
     * does (UserGroupGridHandler::updateUserGroup → UserGroupForm::execute):
     * the form is initialised from the stored role, exactly the posted
     * fields the unchanged form carries, the two boxes are set as the spec
     * asks, and the form's own execute runs — the role's flags, the rewrite
     * of every existing assignment's canChangeMetadata when the metadata
     * box changed, the role's stages re-saved from the ticked boxes (the
     * form has none for the Done stage, so that row goes; every workflow
     * stage for a manager-level role, as the form always does) and the
     * audit-log line.
     * The form reads the request's context, so the router is pointed at the
     * scratch context for the call. Not mirrored: the grid's trivial toast
     * for the acting user and its validate() (name and abbreviation are the
     * stored ones; the POST and CSRF checks are the request's).
     */
    protected function applyRoleOptions(Context $context, array $plan): void
    {
        $userGroup = $this->userSeeder->resolveUserGroup($context, $plan['key'], "roles.{$plan['key']}");
        $restore = ContextFactory::forceRequestContext($context);
        try {
            $form = new UserGroupForm($context->getId(), $userGroup->id);
            $form->initData();
            // The browser posts the ticked "Stage Assignment" boxes, and the
            // form renders a box only for the app's workflow stages
            // (initData's `stages`), so a stored stage the form has no box
            // for (the installer's Done stage, 6) is not posted and the
            // save drops it, as the screen's save does.
            // `stages` posts the boxes the key leaves ticked instead
            // (parseRoleStages starts from the same narrowed set).
            $form->setData('assignedStages', $plan['stages'] ?? array_values(array_intersect(
                (array) $form->getData('assignedStages'),
                array_keys((array) $form->getData('stages'))
            )));
            foreach ($plan['options'] as $option => $value) {
                $form->setData($option, $value);
            }
            $form->execute();
        } finally {
            $restore();
        }
    }

    /**
     * The optional `plugins` map → one plan per plugin: the plugin instance
     * (every category loaded from disk, as the Plugins grid lists them),
     * its wanted state and its settings. Parse phase: no writes.
     *
     * @return array<int, array{key: string, plugin: Plugin, enabled: bool, settings: array}>
     */
    protected function parsePlugins(Spec $root): array
    {
        $spec = $root->child('plugins');
        if ($spec === null) {
            return [];
        }
        $byName = [];
        foreach (PluginRegistry::loadAllPlugins() as $plugin) {
            $byName[strtolower($plugin->getName())] = $plugin;
        }
        $plans = [];
        foreach (array_keys((array) $root->get('plugins')) as $key) {
            $plugin = $byName[strtolower((string) $key)] ?? throw new SpecException("plugins.{$key}", "plugins.{$key} names no installed plugin (keys are the plugin's lowercased class name, e.g. announcementfeedplugin)");
            if ($this->isSitePluginInContext($plugin)) {
                throw new SpecException("plugins.{$key}", "plugins.{$key} is a site-wide plugin; its state is global, not a scratch context's");
            }
            $planSpec = $spec->child((string) $key);
            $enabled = $planSpec->require('enabled');
            if (!is_bool($enabled)) {
                throw new SpecException("plugins.{$key}.enabled", "plugins.{$key}.enabled must be a boolean");
            }
            if ($enabled ? !$plugin->getCanEnable() : !$plugin->getCanDisable()) {
                throw new SpecException("plugins.{$key}.enabled", "plugins.{$key} cannot be " . ($enabled ? 'enabled' : 'disabled') . ' from the Plugins grid');
            }
            $settings = [];
            if ($planSpec->has('settings') && strtolower($plugin->getName()) === 'customblockmanagerplugin') {
                // Its window ("Manage Custom Blocks") is a list of blocks, not
                // a form of scalar settings; the key does not seed blocks.
                throw new SpecException("plugins.{$key}.settings", "plugins.{$key} has no settings window of scalar settings (its \"Manage Custom Blocks\" list is not seeded by this key)");
            }
            if ($planSpec->has('settings')) {
                $raw = $planSpec->get('settings');
                if (!is_array($raw) || array_is_list($raw)) {
                    throw new SpecException("plugins.{$key}.settings", "plugins.{$key}.settings must be a map of setting name to scalar value");
                }
                foreach ($raw as $name => $value) {
                    if (!is_scalar($value) && $value !== null) {
                        throw new SpecException("plugins.{$key}.settings.{$name}", "plugins.{$key}.settings.{$name} must be a scalar (what the plugin's settings window posts)");
                    }
                    $settings[(string) $name] = $value;
                }
            }
            $planSpec->assertConsumed();
            $plans[] = ['key' => (string) $key, 'plugin' => $plugin, 'enabled' => $enabled, 'settings' => $settings];
        }
        return $plans;
    }

    /**
     * Whether the plugin is site-wide as the context's Plugins grid sees it
     * (PluginLevelRequiredPolicy, PluginGridRow::_canEdit and
     * LazyLoadPlugin::setEnabled all ask Plugin::isSitePlugin() inside the
     * context's request). The builder runs at site level, where a plugin
     * that answers from the request (the Custom Block Manager: "site-wide
     * only when the request has no context") would report itself
     * site-wide, so the question is asked with a stand-in context on the
     * router. Parse phase: the scratch context does not exist yet, and a
     * plugin's answer reads no more than whether a context is present.
     */
    protected function isSitePluginInContext(Plugin $plugin): bool
    {
        $restore = ContextFactory::forceRequestContext(Application::getContextDAO()->newDataObject());
        try {
            return (bool) $plugin->isSitePlugin();
        } finally {
            $restore();
        }
    }

    /**
     * Enable or disable one plugin for the context the way the Plugins
     * grid does (PluginGridHandler::enable / ::disable): the plugin's
     * `enabled` setting for the context (LazyLoadPlugin::setEnabled writes
     * the request's context; the builder names the scratch context) and
     * the audit-log line. Not mirrored: the grid's trivial "plugin
     * enabled" toast for the acting user. Then each setting as the plugin's
     * settings form's execute writes it (Plugin::updateSetting).
     */
    protected function applyPlugin(Context $context, array $plan): Plugin
    {
        $plugin = $plan['plugin']; /** @var Plugin $plugin */
        $plugin->updateSetting($context->getId(), 'enabled', $plan['enabled'], 'bool');
        AuditLog::log($plan['enabled'] ? AuditEvent::PLUGIN_ENABLE : AuditEvent::PLUGIN_DISABLE, LogLevel::NOTICE, [
            'pluginName' => $plugin->getName(),
            'category' => $plugin->getCategory(),
        ]);
        foreach ($plan['settings'] as $name => $value) {
            $plugin->updateSetting($context->getId(), $name, $value);
        }
        return $plugin;
    }

    /**
     * Load the context's block plugins the way a request inside the context
     * has them before the Appearance form's save validates "Sidebar"
     * (PKPContextService::validate: PluginRegistry::loadCategory('blocks',
     * true) must know the block). The builder runs at site level, where
     * the generic plugins registered with no context and provided no
     * blocks, so the stand-alone blocks enabled for the context are loaded
     * for it, and every generic plugin the `plugins` key enabled is
     * registered again for the context (Plugin::register with the context
     * id), which is where a plugin such as the Announcement Feed registers
     * the block it provides.
     *
     * @param Plugin[] $touchedPlugins
     */
    protected function loadBlockPlugins(Context $context, array $touchedPlugins): void
    {
        PluginRegistry::loadCategory('blocks', true, $context->getId());
        foreach ($touchedPlugins as $plugin) {
            if ($plugin->getCategory() === 'generic' && $plugin->getEnabled($context->getId())) {
                $plugin->register('generic', $plugin->getPluginPath(), $context->getId());
            }
        }
    }

    /**
     * The optional `announcementTypes[]` list → one plan per type: its
     * localized name and the primary-locale name announcements[] refer to.
     * Parse phase: no writes.
     */
    protected function parseAnnouncementTypes(Spec $root, string $primaryLocale): array
    {
        $plans = [];
        foreach ($root->childList('announcementTypes') as $spec) {
            $name = $spec->localized('name', $primaryLocale);
            if ($name === null || trim((string) ($name[$primaryLocale] ?? '')) === '') {
                throw new SpecException("{$spec->path}.name", 'An announcement type needs a name in the primary locale (the "Add Announcement Type" window\'s "Name")');
            }
            $key = (string) $name[$primaryLocale];
            if (isset(array_column($plans, 'key', 'key')[$key])) {
                throw new SpecException("{$spec->path}.name", "Two announcement types are named \"{$key}\"; announcements[].type refers to a type by its name");
            }
            $spec->assertConsumed();
            $plans[] = ['key' => $key, 'name' => $name];
        }
        return $plans;
    }

    /**
     * The optional `announcements[]` list → the props the panel's "Save"
     * posts to POST announcements, per entry. Parse phase: the shape and
     * the type reference only; the app's own validation runs at write time
     * against the context's form locales.
     */
    protected function parseAnnouncements(Spec $root, string $primaryLocale, array $typePlans): array
    {
        $typeKeys = array_column($typePlans, 'key');
        $plans = [];
        foreach ($root->childList('announcements') as $spec) {
            $title = $spec->localized('title', $primaryLocale);
            if ($title === null) {
                throw new SpecException("{$spec->path}.title", 'An announcement needs a title (the panel\'s "Title")');
            }
            $params = ['title' => $title];
            foreach (['descriptionShort', 'description'] as $key) {
                if ($spec->has($key)) {
                    $value = $spec->get($key);
                    if (!is_string($value) && !is_array($value)) {
                        throw new SpecException("{$spec->path}.{$key}", "{$key} must be a string or a locale map");
                    }
                    $params[$key] = $spec->localized($key, $primaryLocale);
                }
            }
            if ($spec->has('dateExpire')) {
                // The panel's "Expiry Date" box: typed as YYYY-MM-DD; the
                // app's validator refuses any other shape (400 naming the
                // key). A past date is accepted, as the box accepts it.
                $value = $spec->get('dateExpire');
                if (!is_string($value)) {
                    throw new SpecException("{$spec->path}.dateExpire", 'dateExpire must be a date string, YYYY-MM-DD as the "Expiry Date" box is typed');
                }
                $params['dateExpire'] = $value;
            }
            $type = null;
            if ($spec->has('type')) {
                $type = $spec->get('type');
                if (!is_string($type) || !in_array($type, $typeKeys, true)) {
                    throw new SpecException("{$spec->path}.type", 'type must name an entry of announcementTypes[] by its primary-locale name' . ($typeKeys ? ' (one of: ' . implode(', ', $typeKeys) . ')' : ' (none declared)'));
                }
            }
            $spec->assertConsumed();
            $plans[] = ['path' => $spec->path, 'params' => $params, 'type' => $type];
        }
        return $plans;
    }

    /**
     * Create one announcement type the way the "Announcement Types" grid's
     * Add window does (AnnouncementTypeForm::execute: a new data object
     * with the context id and the localized name, AnnouncementTypeDAO::
     * insertObject).
     */
    protected function addAnnouncementType(Context $context, array $plan): int
    {
        $announcementTypeDao = DAORegistry::getDAO('AnnouncementTypeDAO'); /** @var \PKP\announcement\AnnouncementTypeDAO $announcementTypeDao */
        $announcementType = $announcementTypeDao->newDataObject();
        $announcementType->setContextId($context->getId());
        $announcementType->setName($plan['name'], null);
        return $announcementTypeDao->insertObject($announcementType);
    }

    /**
     * Create one announcement the way the panel's "Save" does
     * (PKPAnnouncementController::add): the props with the app's context
     * assoc type and the context id, Repo::announcement()->validate against
     * the context's form locales (a refusal is a 400 naming the entry's
     * field, the panel's own message), Announcement::create (the model's
     * save fires Announcement::add), then the controller's own
     * notifyUsers() — the queued NewAnnouncementNotifyUsers job for every
     * user of the context subscribed to the notification, with "Send an
     * email about this to all registered users." unticked (the box's
     * default) — invoked by reflection so the roster query and the batch
     * are the controller's, not a copy. The image is a state the panel
     * builds (out of scope).
     *
     * @return array{id: int, title: string}
     */
    protected function addAnnouncement(Context $context, array $plan, array $typeIds): array
    {
        $params = $plan['params'];
        // The panel posts every box, filled or not: an empty "Short
        // Description" / "Announcement" arrives as an empty string per form
        // locale, "Image", "Expiry Date" and the type as empty strings the
        // controller's convertStringsToSchema turns into null, and each is
        // stored as an empty setting row (parity drive 2026-09-17: by-hand
        // rows `description` = '' per locale and `image` = ''), so the
        // builder posts the same.
        foreach ((array) $context->getSupportedFormLocales() as $locale) {
            foreach (['title', 'descriptionShort', 'description'] as $key) {
                $params[$key][$locale] ??= '';
            }
        }
        $params['image'] = null;
        $params['dateExpire'] ??= null;
        $params['typeId'] = $plan['type'] !== null ? $typeIds[$plan['type']] : null;
        $params['assocType'] = Application::getContextAssocType();
        $params['assocId'] = $context->getId();
        $errors = Repo::announcement()->validate(null, $params, (array) $context->getSupportedFormLocales(), $context->getPrimaryLocale());
        if (!empty($errors)) {
            $field = explode('.', (string) array_key_first($errors))[0];
            throw new SpecException("{$plan['path']}.{$field}", 'The Add Announcement panel would refuse this: ' . json_encode($errors));
        }
        $announcement = Announcement::create($params);

        $controller = new \PKP\API\v1\announcements\PKPAnnouncementController();
        $notifyUsers = new \ReflectionMethod($controller, 'notifyUsers');
        $notifyUsers->invoke($controller, Application::get()->getRequest(), $context, $announcement->id, false);

        return ['id' => $announcement->id, 'title' => (string) ($params['title'][$context->getPrimaryLocale()] ?? reset($params['title']))];
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
     * (Submission › Author Guidelines), `metadata` and
     * `citationsMetadataLookup` (U42) and `enablePublisherId` (U44)
     * (Submission › Metadata)
     * and the Emails tab's `submissionAcknowledgement`,
     * `copySubmissionAckPrimaryContact`, `copySubmissionAckAddress` and, on
     * the preprint server only, `postedAcknowledgement` (U49); and the
     * Website › Content › Comments tab's `enablePublicComments` (U14). Only
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

        if ($root->has('citationsMetadataLookup')) {
            // The Metadata screen's "References Metadata Lookup" box (a
            // checkbox FieldOptions over the schema's boolean). The form
            // posts "true" / "false" form-encoded with the rest of the
            // screen, which the save's convertStringsToSchema turns back into
            // the boolean; the stored row is 1 / 0. Shared by the three apps.
            $hasProperty('citationsMetadataLookup') || throw new SpecException('citationsMetadataLookup', 'citationsMetadataLookup is not a setting of this app\'s context schema');
            $value = $root->get('citationsMetadataLookup');
            if (!is_bool($value)) {
                throw new SpecException('citationsMetadataLookup', 'citationsMetadataLookup must be a boolean (true: "Enable references structuring and metadata lookup" ticked, false: unticked)');
            }
            $settings['citationsMetadataLookup'] = $value;
            $specKeys['citationsMetadataLookup'] = 'citationsMetadataLookup';
        }

        if ($root->has('enablePublisherId')) {
            // The Metadata screen's "Publisher ID" boxes (U44): a checkbox
            // FieldOptions whose ticked values the form posts as a list (an
            // empty list as '', which convertStringsToSchema turns into []).
            // The accepted values are the app form's own options, read from
            // the form the Settings page builds; the context schema is wider
            // on a preprint server (it allows issue / issueGalley, which the
            // OPS form does not offer).
            $value = $root->get('enablePublisherId');
            $form = new \APP\components\forms\context\MetadataSettingsForm('', Application::getContextDAO()->newDataObject());
            $offered = array_column($form->getField('enablePublisherId')->options, 'value');
            $expected = 'enablePublisherId must be a list of the "Publisher ID" boxes this app\'s Metadata screen offers: ' . implode(', ', $offered);
            if (!is_array($value) || !array_is_list($value)) {
                throw new SpecException('enablePublisherId', $expected);
            }
            foreach ($value as $i => $item) {
                if (!is_string($item) || !in_array($item, $offered, true)) {
                    throw new SpecException("enablePublisherId.{$i}", $expected);
                }
            }
            if (count(array_unique($value)) !== count($value)) {
                throw new SpecException('enablePublisherId', 'enablePublisherId names a box twice; the screen ticks each box once');
            }
            $settings['enablePublisherId'] = $value;
            $specKeys['enablePublisherId'] = 'enablePublisherId';
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

        if ($root->has('postedAcknowledgement')) {
            // The Emails tab's "Preprint Posted" radio (OPS
            // EmailSetupForm::FIELD_POSTED_ACK): true "Send an email to all
            // authors.", false "Do not send an email.". The field exists in
            // the OPS context schema only; the form posts the radio's value
            // as a string that the PUT's convertStringsToSchema turns back
            // into the schema's boolean, and the stored row is 1 / 0.
            $hasProperty('postedAcknowledgement') || throw new SpecException('postedAcknowledgement', 'postedAcknowledgement is not a setting of this app\'s Emails form (the "Preprint Posted" option exists on OPS only)');
            $value = $root->get('postedAcknowledgement');
            if (!is_bool($value)) {
                throw new SpecException('postedAcknowledgement', 'postedAcknowledgement must be a boolean (true "Send an email to all authors.", false "Do not send an email.")');
            }
            $settings['postedAcknowledgement'] = $value;
            $specKeys['postedAcknowledgement'] = 'postedAcknowledgement';
        }

        if ($root->has('enablePublicComments')) {
            // The Website › Content › "Comments" tab's one box, "Enable
            // Public Comments" (ContentCommentsForm: a checkbox FieldOptions
            // over the schema's boolean, default false). The form posts the
            // box's state form-encoded ("true" / "false"), which the save's
            // convertStringsToSchema turns back into the boolean; the stored
            // row is 1 / 0. Shared by the three apps' context schemas.
            $hasProperty('enablePublicComments') || throw new SpecException('enablePublicComments', 'enablePublicComments is not a setting of this app\'s context schema');
            $value = $root->get('enablePublicComments');
            if (!is_bool($value)) {
                throw new SpecException('enablePublicComments', 'enablePublicComments must be a boolean (true: the "Enable Public Comments" box ticked, false: unticked)');
            }
            $settings['enablePublicComments'] = $value;
            $specKeys['enablePublicComments'] = 'enablePublicComments';
        }

        // Settings › Website › Setup › "Announcements"
        // (PKPAnnouncementSettingsForm, a lib/pkp form the three apps share):
        // the "Enable announcements" box (a checkbox FieldOptions over the
        // schema's boolean), "Introduction" (a multilingual rich text;
        // "Additional Information" on OMP) and "Display on Homepage" (a
        // FieldText over the schema's integer, min:0; emptied it posts null).
        if ($root->has('enableAnnouncements')) {
            $hasProperty('enableAnnouncements') || throw new SpecException('enableAnnouncements', 'enableAnnouncements is not a setting of this app\'s context schema');
            $value = $root->get('enableAnnouncements');
            if (!is_bool($value)) {
                throw new SpecException('enableAnnouncements', 'enableAnnouncements must be a boolean (true: the "Enable announcements" box ticked, false: unticked)');
            }
            $settings['enableAnnouncements'] = $value;
            $specKeys['enableAnnouncements'] = 'enableAnnouncements';
        }
        if ($root->has('announcementsIntroduction')) {
            $hasProperty('announcementsIntroduction') || throw new SpecException('announcementsIntroduction', 'announcementsIntroduction is not a setting of this app\'s context schema');
            $value = $root->get('announcementsIntroduction');
            if (!is_string($value) && !is_array($value)) {
                throw new SpecException('announcementsIntroduction', 'announcementsIntroduction must be a string or a locale map');
            }
            $settings['announcementsIntroduction'] = $root->localized('announcementsIntroduction', $primaryLocale);
            $specKeys['announcementsIntroduction'] = 'announcementsIntroduction';
        }
        if ($root->has('numAnnouncementsHomepage')) {
            $hasProperty('numAnnouncementsHomepage') || throw new SpecException('numAnnouncementsHomepage', 'numAnnouncementsHomepage is not a setting of this app\'s context schema');
            $value = $root->get('numAnnouncementsHomepage');
            if ($value !== null && !is_int($value)) {
                throw new SpecException('numAnnouncementsHomepage', 'numAnnouncementsHomepage must be a whole number (the "Display on Homepage" box) or null (the box emptied)');
            }
            $settings['numAnnouncementsHomepage'] = $value;
            $specKeys['numAnnouncementsHomepage'] = 'numAnnouncementsHomepage';
        }

        // Settings › Website › Appearance › Setup "Sidebar"
        // (PKPAppearanceSetupForm's orderable FieldOptions over the schema's
        // list of block plugin names; shared by the three apps). The list is
        // the blocks in their order; the form's save refuses a name no
        // enabled block plugin of the context carries, and so does the
        // builder (build() loads the context's blocks first).
        if ($root->has('sidebar')) {
            $hasProperty('sidebar') || throw new SpecException('sidebar', 'sidebar is not a setting of this app\'s context schema');
            $value = $root->get('sidebar');
            if (!is_array($value) || !array_is_list($value) || array_filter($value, fn ($name) => !is_string($name) || $name === '') !== []) {
                throw new SpecException('sidebar', 'sidebar must be a list of block plugin names (e.g. ["AnnouncementFeedBlockPlugin"]), in the order the Sidebar shows them');
            }
            $settings['sidebar'] = array_values($value);
            $specKeys['sidebar'] = 'sidebar';
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
