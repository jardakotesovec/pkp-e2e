// Kept check for pkp/pkp-lib#13608: updating (or installing) a plugin whose descriptor carries a
// version above the core version must leave the core version alone. PRs #13610 (stable-3_3_0),
// #13611 (stable-3_4_0), #13612 (stable-3_5_0), #13613 (main) add `!$this->isPlugin` to
// Installer::updateVersion(). The fleets never upload plugins with such descriptors, so the plugin
// grid's helper is driven directly (`driver.php`, PluginHelper::installPlugin/upgradePlugin, what the
// "Upload A New Plugin" and "Upgrade" windows call after the upload).
//
//   [PKP_E2E_LINE=<line>] node shared/playwright/checks/sync/pkp-lib-13608/walk.js <app> <label> [--relabel W.X.Y.Z] [--core-upgrade] [--keep]
//
// Scenarios, with V = the core's major.minor + ".6.2" (3.4 → 3.4.6.2, the issue's Dataverse case):
//   upgrade  scratch plugin pkp13608up 1.0.0.0 installed, then upgraded to 1.0.1.0 whose upgrade.xml is
//            <install version="V"> with a marker step, plus a marker step inside
//            <upgrade minversion="1.0.0.0" maxversion="1.0.0.9"> (does the plugin's own range gate see
//            the plugin's version?)
//   install  scratch plugin pkp13608in 1.0.0.0 whose install.xml is <install version="V"> with a marker
//            step (the install path, which the issue does not name)
// --relabel  first rewrites the current core row to W.X.Y.Z (an older site, e.g. 3.4.0.10)
// --core-upgrade  afterwards puts back the core rows the upgrade scenario left and runs `php tools/upgrade.php check` and `upgrade` (what an affected site
//            meets at its next release) and records their output and the versions rows
// --keep     leaves the DB and plugin folders as they end (default: restored to the snapshot)
// Records .reports/sync/pkp-lib-13608/<line>-<app>-<label>.json. No assertions: the reader judges.
const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {resolveApp, REPO_ROOT} = require('../../../../../bin/apps.js');

const [appName, label, ...rest] = process.argv.slice(2);
const flag = (f) => rest.includes(f);
const opt = (f) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : null);
const app = resolveApp(appName); // puts the line's PHP first on PATH
const line = app.line || 'main';
const legacy = fs.existsSync(path.join(app.root, 'lib/pkp/classes/cliTool/CliTool.inc.php'));
const outDir = path.join(REPO_ROOT, '.reports/sync/pkp-lib-13608');
const work = path.join(outDir, `work-${line}-${appName}`);
const markers = path.join(work, 'markers.jsonl');
fs.mkdirSync(work, {recursive: true});
const PRODUCTS = ['pkp13608up', 'pkp13608in'];

const psql = (sql) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'e2e', app.db, '-Atqc', sql], {env: {...process.env, PGPASSWORD: 'e2e'}, encoding: 'utf8'}).trim();
const VCOLS = "product_type||' '||product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current";
const versions = (where) => psql(`select ${VCOLS} from versions where ${where} order by date_installed, major, minor, revision, build`).split('\n').filter(Boolean);
const coreRows = () => versions("product_type='core'");
const pluginRows = () => versions(`product in (${PRODUCTS.map((p) => `'${p}'`).join(',')})`);
const php = (args, extraEnv = {}) => {
    const r = spawnSync('php', args, {cwd: app.root, encoding: 'utf8', env: {...process.env, PKP_CONFIG_FILE: path.join(app.root, 'config.test.inc.php'), PKP13608_MARKERS: markers, ...extraEnv}, timeout: 600_000});
    return {status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim().slice(-3000)};
};
const driver = (...args) => {
    const r = php([path.join(__dirname, 'driver.php'), ...args]);
    const last = r.stdout.split('\n').filter(Boolean).pop();
    // CLI noise: plugins that need a request fail to register; keep the distinct error lines only
    const errors = [...new Set(r.stderr.split('\n').filter((l) => /^(PHP )?(Fatal|Warning|Error|Exception|Plugin )/.test(l)))].slice(0, 12);
    try { return {...JSON.parse(last), stderrLines: errors.length ? errors : undefined}; } catch { return {raw: r}; }
};
const readMarkers = () => (fs.existsSync(markers) ? fs.readFileSync(markers, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// ------------------------------------------------------------------ scratch packages
const versionXml = (product, release, cls) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE version SYSTEM "../../../lib/pkp/dtd/pluginVersion.dtd">
<version>
	<application>${product}</application>
	<type>plugins.generic</type>
	<release>${release}</release>
	<date>2026-10-23</date>
	<lazy-load>1</lazy-load>
	<class>${cls}</class>
</version>
`;
const pluginFiles = (product, cls) => (legacy ? {
    [`${cls}.inc.php`]: `<?php
import('lib.pkp.classes.plugins.GenericPlugin');
class ${cls} extends GenericPlugin {
	function register($category, $path, $mainContextId = null) { return parent::register($category, $path, $mainContextId); }
	function getDisplayName() { return 'pkp-lib#13608 scratch plugin ${product}'; }
	function getDescription() { return 'Scratch plugin of the pkp-lib#13608 kept check.'; }
}
`,
    'index.php': `<?php
require_once('${cls}.inc.php');
return new ${cls}();
`,
} : {
    [`${cls}.php`]: `<?php
namespace APP\\plugins\\generic\\${product};

use PKP\\plugins\\GenericPlugin;

class ${cls} extends GenericPlugin
{
    public function register($category, $path, $mainContextId = null): bool
    {
        return parent::register($category, $path, $mainContextId);
    }

    public function getDisplayName()
    {
        return 'pkp-lib#13608 scratch plugin ${product}';
    }

    public function getDescription()
    {
        return 'Scratch plugin of the pkp-lib#13608 kept check.';
    }
}
`,
    'index.php': `<?php
require_once __DIR__ . '/${cls}.php';
return new \\APP\\plugins\\generic\\${product}\\${cls}();
`,
});
const markerPhp = `<?php
/** Scratch plugin step of the pkp-lib#13608 kept check: records that the descriptor step ran. */
class Pkp13608Marker
{
    public static function mark($installer, $attr)
    {
        file_put_contents(getenv('PKP13608_MARKERS'), json_encode([
            'step' => $attr['step'] ?? null,
            'currentVersion' => $installer->getCurrentVersion() ? $installer->getCurrentVersion()->getVersionString(false) : null,
            'newVersion' => $installer->getNewVersion() ? $installer->getNewVersion()->getVersionString(false) : null,
        ]) . "\\n", FILE_APPEND);
        return true;
    }
}
`;
const step = (product, name) => `<code file="plugins/generic/${product}/Pkp13608Marker.php" class="Pkp13608Marker" function="mark" step="${name}" />`;

function pack(product, release, extra = {}) {
    const cls = product[0].toUpperCase() + product.slice(1) + 'Plugin';
    const src = path.join(work, `src-${product}-${release}`);
    fs.rmSync(src, {recursive: true, force: true});
    const files = {'version.xml': versionXml(product, release, cls), ...pluginFiles(product, cls), ...extra};
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.join(src, product), {recursive: true});
        fs.writeFileSync(path.join(src, product, rel), body);
    }
    const out = path.join(work, `${product}-${release}.tar.gz`);
    execFileSync('tar', ['-czf', out, '-C', src, product]);
    return out;
}

// ------------------------------------------------------------------ state
function restoreCore(snapshot) {
    psql("delete from versions where product_type='core'");
    for (const r of snapshot) {
        const cols = Object.keys(r);
        psql(`insert into versions (${cols.join(',')}) values (${cols.map((c) => (r[c] === null ? 'null' : `'${String(r[c]).replace(/'/g, "''")}'`)).join(',')})`);
    }
}

function cleanup(snapshot) {
    for (const p of PRODUCTS) fs.rmSync(path.join(app.root, 'plugins/generic', p), {recursive: true, force: true});
    psql(`delete from versions where product in (${PRODUCTS.map((p) => `'${p}'`).join(',')})`);
    psql(`delete from plugin_settings where plugin_name in (${PRODUCTS.map((p) => `'${p}plugin'`).join(',')})`);
    if (snapshot) restoreCore(snapshot);
    fs.rmSync(markers, {force: true});
}

const snapshot = JSON.parse(psql("select coalesce(json_agg(v), '[]') from versions v where product_type='core'"));
cleanup(null);
const result = {line, app: appName, label, legacy, lib: execFileSync('git', ['-C', path.join(app.root, 'lib/pkp'), 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), when: new Date().toISOString()};
if (opt('--relabel')) {
    const [a, b, c, d] = opt('--relabel').split('.');
    psql(`update versions set major=${a}, minor=${b}, revision=${c}, build=${d} where product_type='core' and current=1`);
    result.relabelled = opt('--relabel');
}
result.coreBefore = coreRows();
const startCore = JSON.parse(psql("select coalesce(json_agg(v), '[]') from versions v where product_type='core'"));
const [maj, min] = result.coreBefore.find((r) => r.endsWith('current=1')).split(' ')[2].split('.');
const V = `${maj}.${min}.6.2`;
result.descriptorVersion = V;

// upgrade scenario
result.upgrade = {};
result.upgrade.install100 = driver('install', pack('pkp13608up', '1.0.0.0'));
result.upgrade.coreAfterInstall = coreRows();
fs.rmSync(markers, {force: true});
result.upgrade.upgrade101 = driver('upgrade', 'pkp13608up', pack('pkp13608up', '1.0.1.0', {
    'Pkp13608Marker.php': markerPhp,
    'upgrade.xml': `<?xml version="1.0" encoding="UTF-8"?>
<install version="${V}">
	${step('pkp13608up', 'always')}
	<upgrade minversion="1.0.0.0" maxversion="1.0.0.9">
		${step('pkp13608up', 'plugin-range-1.0.0.x')}
	</upgrade>
</install>
`,
}));
result.upgrade.markers = readMarkers();
result.upgrade.coreAfter = coreRows();
result.upgrade.plugin = pluginRows();
const afterUpgradeCore = JSON.parse(psql("select coalesce(json_agg(v), '[]') from versions v where product_type='core'"));

// install scenario, on the core rows as they stood before the upgrade scenario
fs.rmSync(markers, {force: true});
restoreCore(startCore);
const coreMid = coreRows();
result.install = {};
result.install.install = driver('install', pack('pkp13608in', '1.0.0.0', {
    'Pkp13608Marker.php': markerPhp,
    'install.xml': `<?xml version="1.0" encoding="UTF-8"?>
<install version="${V}">
	${step('pkp13608in', 'install')}
</install>
`,
}));
result.install.markers = readMarkers();
result.install.coreBefore = coreMid;
result.install.coreAfter = coreRows();
result.install.plugin = pluginRows().filter((r) => r.includes('pkp13608in'));

if (flag('--core-upgrade')) {
    // the state an affected site is left in: the upgrade scenario's core rows, the scratch plugins
    // kept at their current versions (the replaced 1.0.0.0 row goes: it shares an install second with
    // 1.0.1.0, which trips addPluginVersions' newest-first history read)
    psql(`delete from versions where product in (${PRODUCTS.map((p) => `'${p}'`).join(',')}) and current=0`);
    restoreCore(afterUpgradeCore);
    result.coreUpgrade = {check: php(['tools/upgrade.php', 'check']), upgrade: php(['tools/upgrade.php', 'upgrade'])};
    result.coreUpgrade.coreAfter = coreRows();
}

if (!flag('--keep')) {
    cleanup(snapshot);
    result.restored = coreRows();
}
fs.writeFileSync(path.join(outDir, `${line}-${appName}-${label}.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
