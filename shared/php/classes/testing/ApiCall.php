<?php

/**
 * @file classes/testing/ApiCall.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class ApiCall
 *
 * @brief Run an app API controller's own action the way a screen's JSON
 * call reaches it, inside a build (U37): the request is the action's own
 * FormRequest (or a plain request) carrying the JSON body the screen sends
 * and the route parameters of its URL, validated with that FormRequest's
 * own prepareForValidation() and rules(), and handed to the controller
 * action itself, so the model writes, the event-log rows, the
 * notifications and the email-log rows are the controller's, never a copy
 * (PRINCIPLES D3). Not run: the route middleware and the authorization
 * policies (the seed is the harness, not a user); the objects the policies
 * would have put in the controller's authorized context are set directly.
 * A validation failure is the screen's own refusal and becomes a 400.
 *
 * Also the app-neutral workflow-stage vocabulary the task keys use.
 */

namespace PKP\testing;

use APP\core\Application;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use PKP\core\PKPBaseController;
use PKP\security\authorization\AuthorizationDecisionManager;

class ApiCall
{
    /**
     * Stage words → workflow stage ids. Each app accepts the words of its
     * own stages (Application::getApplicationStages()): `internalReview`
     * is OMP's alone, a preprint server has `production` only.
     */
    public const STAGES = [
        'submission' => WORKFLOW_STAGE_ID_SUBMISSION,
        'internalReview' => WORKFLOW_STAGE_ID_INTERNAL_REVIEW,
        'review' => WORKFLOW_STAGE_ID_EXTERNAL_REVIEW,
        'copyediting' => WORKFLOW_STAGE_ID_EDITING,
        'production' => WORKFLOW_STAGE_ID_PRODUCTION,
    ];

    /** A stage word of this app → its stage id; anything else is a 400 naming the app's words. */
    public static function stageId(string $word, string $specKey): int
    {
        $appStages = Application::getApplicationStages();
        $words = array_keys(array_filter(self::STAGES, fn (int $id) => in_array($id, $appStages, true)));
        if (!in_array($word, $words, true)) {
            throw new SpecException($specKey, "Unknown stage \"{$word}\". This app's stages: " . implode(', ', $words));
        }
        return self::STAGES[$word];
    }

    /** The word of a stage id (for responses and messages). */
    public static function stageWord(int $stageId): string
    {
        return (string) array_search($stageId, self::STAGES, true);
    }

    /**
     * Build the request a screen's JSON call arrives as and validate it the
     * way the router would: the FormRequest's prepareForValidation(), then
     * its rules() and messages() through the container's validation
     * factory. $adjustRules may lift one rule for a documented seed state
     * (the caller says which and why). A refusal throws a SpecException
     * naming $specPath with the fields' messages.
     *
     * @param class-string<Request> $class the action's request class
     * @param array<string, int|string> $routeParams the URL's route parameters
     * @param ?callable(array): array $adjustRules
     */
    public static function request(string $class, string $method, array $body, array $routeParams, string $specPath, string $refusal, ?callable $adjustRules = null): Request
    {
        $request = $class::create('/', $method, [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], json_encode($body));
        $route = new Route($method, '/', fn () => null);
        $route->parameters = array_map(fn ($value) => (string) $value, $routeParams);
        $request->setRouteResolver(fn () => $route);
        if (!$request instanceof FormRequest) {
            return $request;
        }
        $request->setContainer(app());
        $prepare = new \ReflectionMethod($request, 'prepareForValidation');
        $prepare->invoke($request);
        $rules = $request->rules();
        if ($adjustRules !== null) {
            $rules = $adjustRules($rules);
        }
        $validator = app()->get('validator')->make($request->all(), $rules, $request->messages(), $request->attributes());
        // The request's own after-validation checks, as the router's
        // FormRequest::getValidatorInstance() adds them (U47: the media
        // requests check ownership and resolutions there).
        if (method_exists($request, 'after')) {
            $validator->after($request->after());
        }
        if ($validator->fails()) {
            $messages = [];
            foreach ($validator->errors()->toArray() as $field => $fieldMessages) {
                $messages[] = "{$field}: " . implode(' ', $fieldMessages);
            }
            throw new SpecException($specPath, "{$refusal}: " . implode('; ', $messages));
        }
        $request->setValidator($validator);
        $passed = new \ReflectionMethod($request, 'passedValidation');
        try {
            $passed->invoke($request);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            throw new SpecException($specPath, "{$refusal}: " . $e->getResponse()->getContent());
        }
        return $request;
    }

    /**
     * Run $fn with $controller standing as the API controller of the
     * running route (the seeding request's APIHandler), for the form
     * requests that read the authorized objects through it
     * (MediaFileValidationTrait::getBaseApiController(), U47). The _test
     * controller is put back afterwards.
     *
     * @template T
     *
     * @param callable(): T $fn
     *
     * @return T
     */
    public static function asRouteController(PKPBaseController $controller, callable $fn): mixed
    {
        $handler = Application::get()->getRequest()->getRouter()->getHandler();
        $property = new \ReflectionProperty(\PKP\handler\APIHandler::class, 'apiController');
        $previous = $property->getValue($handler);
        $property->setValue($handler, $controller);
        try {
            return $fn();
        } finally {
            $property->setValue($handler, $previous);
        }
    }

    /**
     * A controller whose authorized context holds what its policies would
     * have put there (assoc type → object: the submission, the task).
     *
     * @template T of PKPBaseController
     *
     * @param class-string<T> $class
     *
     * @return T
     */
    public static function controller(string $class, array $authorized = []): PKPBaseController
    {
        $controller = new $class();
        $manager = new AuthorizationDecisionManager();
        foreach ($authorized as $assocType => $object) {
            $manager->_authorizedContext[$assocType] = $object;
        }
        $property = new \ReflectionProperty(PKPBaseController::class, '_authorizationDecisionManager');
        $property->setValue($controller, $manager);
        return $controller;
    }

    /** The decoded body of a controller action's JSON answer; a non-2xx answer is a 400 naming $specPath. */
    public static function answer(\Illuminate\Http\JsonResponse $response, string $specPath, string $refusal): array
    {
        $data = $response->getData(true);
        if ($response->getStatusCode() >= 300) {
            throw new SpecException($specPath, "{$refusal} (HTTP {$response->getStatusCode()}): " . json_encode($data));
        }
        return $data;
    }
}
