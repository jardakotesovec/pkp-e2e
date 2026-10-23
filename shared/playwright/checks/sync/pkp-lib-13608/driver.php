<?php
/**
 * Kept check for pkp/pkp-lib#13608 (PRs #13610 3.3, #13611 3.4, #13612 3.5, #13613 main).
 * Installs or upgrades a scratch plugin through PluginHelper, the helper the plugin grid's
 * "Upload A New Plugin" and "Upgrade" windows call once the archive is uploaded, and prints
 * the outcome as JSON. Run from the app root with the test config (walk.js does this):
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> install <archive>
 *   PKP_CONFIG_FILE=$PWD/config.test.inc.php php <this file> upgrade <product> <archive>
 * 3.3 takes the extracted folder instead of the archive, as its grid handler does.
 */
$legacy = file_exists(getcwd() . '/lib/pkp/classes/cliTool/CliTool.inc.php');
define('INDEX_FILE_LOCATION', getcwd() . '/index.php');
if ($legacy) {
    require getcwd() . '/lib/pkp/classes/cliTool/CliTool.inc.php';
    import('lib.pkp.classes.plugins.PluginHelper');
} else {
    require getcwd() . '/lib/pkp/classes/cliTool/CommandLineTool.php';
}

// A CLI request has no router; 3.3 and 3.4 then stop at the first lazy-load plugin that asks for
// the context while the installer loads every plugin. Give it the page router a web request has.
$application = $legacy ? Application::getApplication() : \APP\core\Application::get();
$request = $application->getRequest();
if (!$request->getRouter()) {
    if ($legacy) {
        import('classes.core.PageRouter');
    }
    $routerClass = $legacy ? 'PageRouter' : (class_exists('\\APP\\core\\PageRouter') ? '\\APP\\core\\PageRouter' : '\\PKP\\core\\PKPPageRouter');
    $router = new $routerClass();
    $router->setApplication($application);
    $request->setRouter($router);
}
if ($legacy) {
    AppLocale::initialize($request); // 3.3's dispatcher does this; plugins read the locale through it
}

[$self, $op] = $argv;
$out = ['op' => $op];
try {
    $helperClass = $legacy ? 'PluginHelper' : '\\PKP\\plugins\\PluginHelper';
    $helper = new $helperClass();
    $archive = end($argv);
    $source = $archive;
    if ($legacy) {
        // 3.3's grid handler extracts first, then hands the folder over
        $tmp = sys_get_temp_dir() . '/pkp13608-' . uniqid();
        mkdir($tmp);
        exec('tar -xzf ' . escapeshellarg($archive) . ' -C ' . escapeshellarg($tmp), $o, $rc);
        $source = $tmp . '/' . basename(glob($tmp . '/*')[0]);
    }
    $method = new ReflectionMethod($helper, $op === 'install' ? 'installPlugin' : 'upgradePlugin');
    $args = $op === 'install' ? [$source] : ['generic', $argv[2], $source];
    if (!$legacy) {
        $args[] = basename($archive);
    }
    if ($method->getNumberOfParameters() > count($args)) {
        $args[] = true; // main's $gallerySource: no upload-allowed check
    }
    $version = $method->invokeArgs($helper, $args);
    $out['ok'] = true;
    $out['pluginVersion'] = $version->getVersionString(false);
} catch (Throwable $e) {
    $out['ok'] = false;
    $out['error'] = get_class($e) . ': ' . $e->getMessage();
    $out['at'] = array_slice(explode("\n", $e->getTraceAsString()), 0, 6);
}
echo json_encode($out), "\n";
