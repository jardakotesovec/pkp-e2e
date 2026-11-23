// Helpers for the U62 A14 walk (issue report docs/issues/U62-A14-plugin-upgrade-runs-replaced-install-step.md).
// Requiring this file runs nothing.
//
// The packages: `u62n23i` ("u62n23i Schema Test Plugin"), a generic plugin whose installation step
// (getInstallMigration(), U62n23iSchemaMigration) creates u62n23i_items; its 1.0.1.0 also creates
// u62n23i_tags and carries an upgrade.xml with no steps of its own (as pkp/pln's), so the upgrade runs
// the plugin's installation step through Installer::postInstall. `u62n23ix` ("u62n23i Other Plugin"),
// a plugin with no installation step; its 1.0.1.0 (the neighbour's) names an upgrade-only migration
// class in upgrade.xml that creates u62n23ix_upgraded. Every walk writes the app checkout's own
// plugins/generic/u62n23i[x]: the caller holds the app's lock exclusive and calls `cleanup()` at its
// end. `sendPackage`, `freshNotices`, `rowFacts`, `openWebsitePlugins` and `snap` are copied from the
// U62 A11 walk's lib.js (plugin-upgrade-skips-own-version-steps).
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {idle, screen, shot, record, sql} = require('../../../probe');
const PKG = require('../../../support/pluginPackages');

const MAIN = 'u62n23i';
const OTHER = 'u62n23ix';
const DISPLAY = {[MAIN]: 'u62n23i Schema Test Plugin', [OTHER]: 'u62n23i Other Plugin'};
const ROW = {[MAIN]: PKG.pluginNames(MAIN).id, [OTHER]: PKG.pluginNames(OTHER).id};
const TABLES = ['u62n23i_items', 'u62n23i_tags', 'u62n23ix_upgraded'];
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? t : String(t).replace(/\s+/g, ' ').trim().slice(0, n));
const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;

function versionXml(product, version) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE version SYSTEM "../../../lib/pkp/dtd/pluginVersion.dtd">
<version>
	<application>${product}</application>
	<type>plugins.generic</type>
	<release>${version}</release>
	<date>2026-11-23</date>
	<lazy-load>1</lazy-load>
	<class>${cap(product)}Plugin</class>
</version>
`;
}

function pluginPhp(product, version, migration) {
    const C = cap(product);
    return `<?php
namespace APP\\plugins\\generic\\${product};

use PKP\\plugins\\GenericPlugin;

class ${C}Plugin extends GenericPlugin
{
    public function getDisplayName()
    {
        return '${DISPLAY[product]}';
    }

    public function getDescription()
    {
        return '${DISPLAY[product]}, version ${version}.';
    }
${migration ? `
    public function getInstallMigration()
    {
        return new ${migration}();
    }
` : ''}}
`;
}

/** u62n23i's installation step: u62n23i_items, and from 1.0.1.0 also u62n23i_tags. */
function schemaMigrationPhp(version) {
    const tags = version !== '1.0.0.0';
    return `<?php
namespace APP\\plugins\\generic\\${MAIN};

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

class U62n23iSchemaMigration extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('u62n23i_items')) {
            Schema::create('u62n23i_items', function (Blueprint $table) {
                $table->bigIncrements('item_id');
            });
        }
${tags ? `        // Added in 1.0.1.0
        if (!Schema::hasTable('u62n23i_tags')) {
            Schema::create('u62n23i_tags', function (Blueprint $table) {
                $table->bigIncrements('tag_id');
            });
        }
` : ''}    }

    public function down(): void
    {
        Schema::dropIfExists('u62n23i_tags');
        Schema::dropIfExists('u62n23i_items');
    }
}
`;
}

const UPGRADE_MIGRATION_PHP = `<?php
namespace APP\\plugins\\generic\\${OTHER};

use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;
use PKP\\migration\\Migration;

/** An upgrade-only step: it creates u62n23ix_upgraded. */
class U62n23ixUpgradeMigration extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('u62n23ix_upgraded')) {
            Schema::create('u62n23ix_upgraded', function (Blueprint $table) {
                $table->bigIncrements('id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('u62n23ix_upgraded');
    }
}
`;

function upgradeXml(version, body = '') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE install SYSTEM "../../../lib/pkp/dtd/install.dtd">
<install version="${version}">
${body}</install>
`;
}

function tgz(dir, product, version, files) {
    const src = path.join(dir, `src-${product}-${version}`);
    fs.rmSync(src, {recursive: true, force: true});
    for (const [rel, body] of Object.entries(files)) {
        const f = path.join(src, product, rel);
        fs.mkdirSync(path.dirname(f), {recursive: true});
        fs.writeFileSync(f, body);
    }
    const out = path.join(dir, `${product}-${version}.tar.gz`);
    execFileSync('tar', ['--format', 'ustar', '-czf', out, '-C', src, product], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    return out;
}

/** {main100, main101, other100, other101} built into `<outDir>/pkg` (absolute paths). */
function buildPackages(outDir) {
    const dir = path.join(outDir, 'pkg');
    fs.mkdirSync(dir, {recursive: true});
    const index = (product) => `<?php
require_once __DIR__ . '/${cap(product)}Plugin.php';
return new \\APP\\plugins\\generic\\${product}\\${cap(product)}Plugin();
`;
    const main = (version, extra = {}) => tgz(dir, MAIN, version, {
        'version.xml': versionXml(MAIN, version),
        'index.php': index(MAIN),
        'U62n23iPlugin.php': pluginPhp(MAIN, version, 'U62n23iSchemaMigration'),
        'U62n23iSchemaMigration.php': schemaMigrationPhp(version),
        ...extra,
    });
    const other = (version, extra = {}) => tgz(dir, OTHER, version, {
        'version.xml': versionXml(OTHER, version),
        'index.php': index(OTHER),
        'U62n23ixPlugin.php': pluginPhp(OTHER, version, null),
        ...extra,
    });
    return {
        main100: main('1.0.0.0'),
        main101: main('1.0.1.0', {'upgrade.xml': upgradeXml('1.0.1.0')}),
        other100: other('1.0.0.0'),
        other101: other('1.0.1.0', {
            'upgrade.xml': upgradeXml('1.0.1.0', `\t<migration class="APP\\plugins\\generic\\${OTHER}\\U62n23ixUpgradeMigration" />\n`),
            'U62n23ixUpgradeMigration.php': UPGRADE_MIGRATION_PHP,
        }),
    };
}

/** Step 5's query (and the neighbour's table). */
const ourTables = (app) => sql(app, `SELECT table_name FROM information_schema.tables WHERE table_name IN (${TABLES.map((t) => `'${t}'`).join(', ')}) ORDER BY 1`).split('\n').filter(Boolean);
const pluginVersions = (app) => sql(app, `SELECT product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product IN ('${MAIN}', '${OTHER}') ORDER BY product, date_installed, major, minor, revision, build`).split('\n').filter(Boolean);
const coreVersions = (app) => sql(app, "SELECT product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product_type='core' ORDER BY date_installed").split('\n').filter(Boolean);
const ourFolders = (app) => PKG.pluginFolders(path.resolve(app.root), [MAIN, OTHER]);
const gitPlugins = (app) => execFileSync('git', ['-C', path.resolve(app.root), 'status', '--short', '--', 'plugins'], {encoding: 'utf8'}).trim();
function folderRelease(app, product) {
    const f = path.join(path.resolve(app.root), 'plugins', 'generic', product, 'version.xml');
    if (!fs.existsSync(f)) return null;
    const m = fs.readFileSync(f, 'utf8').match(/<release>([^<]+)<\/release>/);
    return m ? m[1] : '?';
}

/** Put the checkout and the database back (not a step). */
function cleanup(app) {
    const tables = ourTables(app);
    for (const t of tables) sql(app, `DROP TABLE IF EXISTS ${t}`);
    sql(app, `DELETE FROM versions WHERE product IN ('${MAIN}', '${OTHER}')`);
    sql(app, `DELETE FROM plugin_settings WHERE plugin_name IN ('${ROW[MAIN]}', '${ROW[OTHER]}')`);
    return {tables, folders: PKG.removePluginFolders(path.resolve(app.root), [MAIN, OTHER]), gitPlugins: gitPlugins(app)};
}

async function rowFacts(list, product) {
    const id = ROW[product];
    const row = list.row(id);
    if (!(await row.count())) return {present: false};
    return {
        present: true,
        name: flat(await list.rowName(id).innerText().catch(() => null), 80),
        ticked: await list.box(id).isChecked().catch(() => null),
        text: flat(await row.innerText().catch(() => null), 200),
    };
}

/** Settings › Website › "Plugins" of a context; required inside forEachApp's function. */
async function openWebsitePlugins(page, contextPath) {
    const {WebsitePluginsPage} = require('../../../pages/PluginsPages.js');
    const w = new WebsitePluginsPage(page, contextPath);
    await w.goto();
    return w;
}

async function freshNotices(page, ms = 10_000) {
    const sel = '.app__notifications .pkpNotification:not([data-seen])';
    const end = Date.now() + ms;
    while (Date.now() < end && !(await page.locator(sel).count())) await sleep(150);
    await sleep(300);
    return page.locator(sel).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').replace(/\s*×?\s*Close\s*$/, '').trim())).catch(() => []);
}

/**
 * "Upload A New Plugin" (`via` 'upload') or `product`'s row "Upgrade" (`via` 'upgrade') with `file`,
 * "Save": the save's status and answer, the notices, the row after. Never throws.
 */
async function sendPackage(page, list, via, file, product) {
    const P = require('../../../pages/PluginsPages.js');
    const o = {via, file: path.basename(file)};
    try {
        await P.markNotices(page);
        const win = via === 'upload' ? await list.openUpload() : await list.openUpgrade(ROW[product]);
        o.windowText = flat(await win.formText().catch(() => null), 300);
        await win.chooseFile(file);
        const resp = await win.save();
        o.status = resp.status();
        o.answer = flat(await resp.text().catch(() => null), 300);
        await win.dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await P.pastModalCloseWindow(page);
    } catch (e) {
        o.error = flat(e.message, 300);
    }
    o.notices = await freshNotices(page);
    await idle(page).catch(() => {});
    await sleep(500);
    o.rowAfter = await rowFacts(list, product);
    return o;
}

async function snap(page, name) {
    record(name, await screen(page));
    await shot(page, name).catch(() => {});
}

module.exports = {MAIN, OTHER, DISPLAY, ROW, TABLES, sleep, flat, versionXml, pluginPhp, schemaMigrationPhp, UPGRADE_MIGRATION_PHP, upgradeXml, buildPackages, ourTables, pluginVersions, coreVersions, ourFolders, gitPlugins, folderRelease, cleanup, rowFacts, openWebsitePlugins, freshNotices, sendPackage, snap};
