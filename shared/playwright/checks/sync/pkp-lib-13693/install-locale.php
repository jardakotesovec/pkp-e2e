<?php
/**
 * Kept check for pkp/pkp-lib#13693 (round 2): installs one site locale the way
 * the admin's language install does (Locale::installLocale, 3.3
 * AppLocale::installLocale: the core templates' data, then every plugin's
 * installLocale hook), without touching site.installed_locales. Run from the
 * app root: PKP_CONFIG_FILE=<config> php <this file> <locale>
 */
$root = getcwd();
$locale = $argv[1];
if (file_exists("$root/lib/pkp/classes/cliTool/CommandLineTool.php")) {
    define('INDEX_FILE_LOCATION', "$root/index.php");
    require "$root/lib/pkp/classes/cliTool/CommandLineTool.php";
    new class ($argv) extends \PKP\cliTool\CommandLineTool {};
    \PKP\facades\Locale::installLocale($locale);
} else {
    require "$root/tools/bootstrap.inc.php";
    new class ($argv) extends CommandLineTool {};
    AppLocale::installLocale($locale);
}
echo "installed locale $locale\n";
