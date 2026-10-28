<?php
/**
 * Kept check for pkp/pkp-lib#9906 (pkp/omp#2456, stable-3_5_0): prints the ONIX 3.0 export of one
 * submission, through the same plugin call the "ONIX 3.0 XML Plugin" export button makes, with its
 * schema validation on. Run from the OMP root with the dataset fleet's config (walk.js does this):
 *   PKP_CONFIG_FILE=$PWD/config.test.ds1.inc.php php <this file> <submissionId> [<contextPath>]
 * stdout: the XML; the deployment's errors and warnings go to stderr, and the exit status is 1 if any.
 */
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';

// A CLI request has no router; plugins that ask for the context while loading then fail. Give it a page router.
$application = \APP\core\Application::get();
$request = $application->getRequest();
if (!$request->getRouter()) {
    $router = new \APP\core\PageRouter();
    $router->setApplication($application);
    $request->setRouter($router);
}

$submissionId = (int) ($argv[1] ?? 0);
$contextPath = $argv[2] ?? 'publicknowledge';
$context = \APP\core\Application::getContextDAO()->getByPath($contextPath);
$plugin = \PKP\plugins\PluginRegistry::loadPlugin('importexport', 'onix30');
$deployment = $plugin->getAppSpecificDeployment($context, null);
$plugin->setDeployment($deployment);
$plugin->getExportSubmissionsDeployment([$submissionId], $deployment, ['noValidation' => 0]);
$problems = [];
$types = (new ReflectionMethod($deployment, 'getObjectTypes'))->invoke($deployment);
foreach (array_keys($types) as $assocType) {
    foreach (['errors' => $deployment->getProcessedObjectsErrors($assocType), 'warnings' => $deployment->getProcessedObjectsWarnings($assocType)] as $kind => $byId) {
        foreach ((array) $byId as $id => $messages) {
            foreach ((array) $messages as $m) {
                $problems[] = "$kind {$types[$assocType]} #$id: $m";
            }
        }
    }
}
if ($deployment->isProcessFailed() || $problems) {
    fwrite(STDERR, implode("\n", $problems ?: ['process failed']) . "\n");
}
$result = $deployment->processResult;
echo $result instanceof DOMDocument ? $result->saveXML() : (string) $result;
exit($problems ? 1 : 0);
