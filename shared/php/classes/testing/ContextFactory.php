<?php

/**
 * @file classes/testing/ContextFactory.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class ContextFactory
 *
 * @brief Creates a journal/press/server through the SAME service the admin
 * "hosted contexts" flow uses — schema defaults, default user groups, genres,
 * navigation menus, email templates, default editorial task templates,
 * Context::add hooks, and the acting user's auto-enrolment as Manager all
 * included (that acting user is the
 * seeding request's admin, which is why every scratch context counts admin
 * among its managers — recorded parity fact).
 *
 * parseParams() is read-only (spec + service validation); create() mutates.
 *
 * context.supportedFormLocales (U11) — the Languages settings grid's "Forms"
 * column: create() runs, per locale ticked beyond the primary, the steps
 * LanguageGridHandler::saveLanguageSetting runs for a `supportedFormLocales`
 * tick (PKPContextService::restoreLocaleDefaults, the reviewer
 * recommendations' localized titles, then one PKPContextService::edit with
 * the sorted list), never a raw settings write.
 */

namespace PKP\testing;

use APP\core\Application;
use PKP\context\Context;
use PKP\facades\Repo;
use PKP\services\interfaces\EntityWriteInterface;

class ContextFactory
{
    /**
     * @param Spec $spec context keys: path*, name, acronym, description,
     *   primaryLocale, supportedLocales, supportedSubmissionLocales,
     *   supportedFormLocales, contactName, contactEmail, enabled
     */
    public function parseParams(Spec $spec): array
    {
        $request = Application::get()->getRequest();
        $site = $request->getSite();
        $primaryLocale = (string) $spec->get('primaryLocale', $site->getPrimaryLocale());
        $supportedLocales = (array) $spec->get('supportedLocales', [$primaryLocale]);
        $supportedSubmissionLocales = $spec->get('supportedSubmissionLocales');
        $supportedFormLocales = $spec->get('supportedFormLocales');
        $path = (string) $spec->require('path');

        $params = array_filter([
            'urlPath' => $path,
            'name' => $spec->localized('name', $primaryLocale, ['en' => "Context {$path}"]),
            'acronym' => $spec->localized('acronym', $primaryLocale),
            'description' => $spec->localized('description', $primaryLocale),
            'primaryLocale' => $primaryLocale,
            'supportedLocales' => $supportedLocales,
            'contactName' => (string) $spec->get('contactName', 'Site Admin'),
            'contactEmail' => (string) $spec->get('contactEmail', 'admin@mail.test'),
        ], fn ($value) => $value !== null);
        $params['enabled'] = (bool) $spec->get('enabled', true);

        if ($supportedSubmissionLocales !== null) {
            // The Languages settings grid's submission toggles: enabling a
            // locale for submissions also keeps the metadata-locale list a
            // superset (LanguageGridHandler::saveLanguageSetting) and records
            // it among the added submission locales.
            $params['supportedSubmissionLocales'] = (array) $supportedSubmissionLocales;
            $params['supportedSubmissionMetadataLocales'] = (array) $supportedSubmissionLocales;
            $params['supportedAddedSubmissionLocales'] = (array) $supportedSubmissionLocales;
        }

        if ($supportedFormLocales !== null) {
            // The Languages settings grid's "Forms" column. The grid lists the
            // site's locales and refuses to untick the primary locale, so the
            // list must be a set of locale codes carrying the primary; the
            // builder further requires each one under "UI" (supportedLocales)
            // — a form locale with no UI locale is a state no scenario needs.
            $key = ($spec->path === '' ? '' : "{$spec->path}.") . 'supportedFormLocales';
            if (!is_array($supportedFormLocales) || $supportedFormLocales === [] || array_keys($supportedFormLocales) !== range(0, count($supportedFormLocales) - 1)) {
                throw new SpecException($key, 'supportedFormLocales must be a non-empty list of locale codes (the Languages grid\'s "Forms" column)');
            }
            foreach ($supportedFormLocales as $locale) {
                if (!is_string($locale) || $locale === '') {
                    throw new SpecException($key, 'supportedFormLocales must be a list of locale code strings');
                }
                if (!in_array($locale, $supportedLocales, true)) {
                    throw new SpecException($key, "supportedFormLocales carries \"{$locale}\", which is not among the context's supportedLocales (tick it under \"UI\" first)");
                }
            }
            if (!in_array($primaryLocale, $supportedFormLocales, true)) {
                throw new SpecException($key, "supportedFormLocales must carry the primary locale \"{$primaryLocale}\" (the Languages grid refuses to untick it)");
            }
            $params['supportedFormLocales'] = array_values(array_unique($supportedFormLocales));
        }

        $contextService = app()->get('context'); /** @var \PKP\services\PKPContextService $contextService */
        $errors = $contextService->validate(
            EntityWriteInterface::VALIDATE_ACTION_ADD,
            $params,
            $site->getSupportedLocales(),
            $primaryLocale
        );
        if (!empty($errors)) {
            throw new SpecException(
                $spec->path === '' ? 'context' : $spec->path,
                'Invalid context spec: ' . json_encode($errors)
            );
        }
        return $params;
    }

    public function create(array $params): Context
    {
        $request = Application::get()->getRequest();
        $contextService = app()->get('context'); /** @var \PKP\services\PKPContextService $contextService */
        // The "Forms" locales are ticked on the Languages grid after the
        // context exists (add() itself sets the primary locale alone).
        $supportedFormLocales = $params['supportedFormLocales'] ?? null;
        unset($params['supportedFormLocales']);
        $context = Application::getContextDAO()->newDataObject();
        $context->setAllData($params);
        $context = $contextService->add($context, $request);
        if ($supportedFormLocales !== null) {
            $context = $this->enableFormLocales($context, $supportedFormLocales);
        }
        // The admin hosted-contexts endpoint's tail (PKPContextController::add,
        // since pkp/pkp-lib#12593, 2026-08-03): the registry's default
        // editorial task templates (`registry/taskTemplates.xml`, all
        // include=false) are installed into every new context. Parity
        // ledger 2026-09-11. The stable-3_5_0 line has no such repository.
        if (method_exists(Repo::class, 'editorialTask')) {
            Repo::editorialTask()->installTaskTemplates($context);
        }
        return $context;
    }

    /**
     * Tick locales under the Languages settings grid's "Forms" column the way
     * LanguageGridHandler::saveLanguageSetting does for
     * `setting=supportedFormLocales&value=1`, one tick per locale not yet
     * ticked: restore that locale's default context settings
     * (PKPContextService::restoreLocaleDefaults), add the reviewer
     * recommendations' localized titles, then PKPContextService::edit with
     * the pushed-and-sorted list. Not mirrored: the grid's trivial
     * "Locale settings saved." notification for the acting user (a
     * session-bound toast, parity ledger 2026-09-16).
     */
    public function enableFormLocales(Context $context, array $locales): Context
    {
        $request = Application::get()->getRequest();
        $contextService = app()->get('context'); /** @var \PKP\services\PKPContextService $contextService */
        foreach ($locales as $locale) {
            $current = (array) $context->getData('supportedFormLocales');
            if (in_array($locale, $current, true)) {
                continue;
            }
            array_push($current, $locale);
            sort($current);
            $contextService->restoreLocaleDefaults($context, $request, $locale);
            if (method_exists(Repo::class, 'reviewerRecommendation')) { // main only; a no-op on stable-3_5_0 (MAINTENANCE "The stable line")
                Repo::reviewerRecommendation()->setLocalizedDataOnNewLocaleAdd($context, $locale);
            }
            $context = $contextService->edit($context, ['supportedFormLocales' => array_values(array_unique($current))], $request);
        }
        return $context;
    }
}
