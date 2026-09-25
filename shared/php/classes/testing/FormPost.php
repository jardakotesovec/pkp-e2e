<?php

/**
 * @file classes/testing/FormPost.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class FormPost
 *
 * @brief Run a legacy (Smarty) form the way its handler runs it on a POST
 * (U51): the variables the window posts stand in the running request for
 * the call, then the form's own readInputData(), validate() and execute(),
 * so the checks that readInputData adds for the posted values, the
 * refusals and the writes are the form's, never a copy (PRINCIPLES D3).
 * Not run: the form's POST and CSRF checks (the request's) and the
 * handler's toast. A refusal is the form's own messages, a 400 naming the
 * spec key.
 *
 * The seeding request is an API call, whose controller answers a request
 * variable first from its own route, query and JSON body, and a seed's
 * body can carry a key of the same name (the context scenario's
 * `subscriptionName`); the body is hidden for the call, so the posted
 * value is the one read.
 */

namespace PKP\testing;

use APP\core\Application;
use PKP\form\Form;
use PKP\form\validation\FormValidatorCSRF;
use PKP\form\validation\FormValidatorPost;
use Symfony\Component\HttpFoundation\InputBag;

class FormPost
{
    /**
     * @param array<string, mixed> $vars the POST as the window sends it
     *   (strings; a multilingual box as a locale map; an unticked box absent)
     *
     * @return mixed what the form's execute() returns
     */
    public static function run(Form $form, array $vars, string $specPath, string $refusal): mixed
    {
        $request = Application::get()->getRequest();
        $previousVars = $request->_requestVars;
        $request->_requestVars = $vars;
        $seedRequest = app('request'); /** @var \Illuminate\Http\Request $seedRequest */
        $seedBody = $seedRequest->json();
        $seedRequest->setJson(new InputBag([]));
        try {
            $form->readInputData();
            $form->_checks = array_values(array_filter(
                $form->_checks,
                fn ($check) => !$check instanceof FormValidatorPost && !$check instanceof FormValidatorCSRF
            ));
            if (!$form->validate()) {
                $messages = [];
                foreach ($form->getErrorsArray() as $field => $message) {
                    $messages[] = "{$field}: {$message}";
                }
                throw new SpecException($specPath, "{$refusal}: " . implode('; ', $messages));
            }
            return $form->execute();
        } finally {
            $request->_requestVars = $previousVars;
            $seedRequest->setJson($seedBody);
        }
    }
}
