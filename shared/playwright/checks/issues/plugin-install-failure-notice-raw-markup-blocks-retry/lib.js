// Helpers for the U62 A13 walk (issue report docs/issues/U62-A13-plugin-install-failure-notice-raw-markup-blocks-retry.md).
// A copy of the U62 A12 walk's lib.js (plugin-install-step-fails-reported-installed), kept here so this folder stands alone.
// Requiring this file runs nothing.
//
// The packages are scratch plugins of our own, built at run time (the builder is adapted from the U62 I05B
// claim check's pkg.js; `sendPackage`, `freshNotices`, `openWebsitePlugins` and `snap` from the U62 A11 walk's
// lib.js). Each carries an install migration (Plugin::getInstallMigration()) whose `step` is one of:
//   'count'  creates `<product>_runs` when it is not there and adds one row: the row count is how often the
//            step ran (a well-behaved, re-runnable step);
//   'fail'   creates `<product>_items`, then inserts into `<product>_missing`, which does not exist, so the
//            step fails partway;
//   'make'   creates `<product>_items` and returns.
// `filter: true` adds an empty, valid filter/filterConfig.xml; `upgradeTable` (with a later `version`) adds an
// upgrade.xml whose one step creates that table. Every walk writes the app checkout's own
// plugins/<category>/<product>: the caller holds the session's app lock and calls `cleanup()` at its end.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {idle, screen, shot, record, sql} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? t : String(t).replace(/\s+/g, ' ').trim().slice(0, n));
const CAT = {generic: {dir: 'generic', type: 'plugins.generic', base: 'PKP\\plugins\\GenericPlugin', heading: 'Generic Plugins'}, theme: {dir: 'themes', type: 'plugins.themes', base: 'PKP\\plugins\\ThemePlugin', heading: 'Theme Plugins'}};

/** A plugin's names from its product (lower-case letters and digits): class, grid row id. */
function names(product) {
    const className = `${product.charAt(0).toUpperCase()}${product.slice(1)}Plugin`;
    return {product, className, id: className.toLowerCase()};
}

function migrationBody(product, step) {
    if (step === 'count') {
        return `        if (!Schema::hasTable('${product}_runs')) {
            Schema::create('${product}_runs', function (Blueprint $table) {
                $table->bigIncrements('id');
            });
        }
        DB::table('${product}_runs')->insert(['id' => DB::table('${product}_runs')->count() + 1]);`;
    }
    const create = `        Schema::create('${product}_items', function (Blueprint $table) {
            $table->bigIncrements('id');
        });`;
    return step === 'fail' ? `${create}
        DB::statement('INSERT INTO ${product}_missing (id) VALUES (1)');` : create;
}

/**
 * Build one package into `outDir`; returns its path.
 * @param {string} outDir
 * @param {{product: string, displayName: string, kind?: 'generic'|'theme', step: 'count'|'fail'|'make', filter?: boolean, version?: string, upgradeTable?: string}} spec
 */
function build(outDir, {product, displayName, kind = 'generic', step, filter = false, version = '1.0.0.0', upgradeTable = null}) {
    const {className} = names(product);
    const c = CAT[kind];
    const ns = `APP\\plugins\\${c.dir}\\${product}`;
    const mig = `${className}InstallMigration`;
    const src = path.join(outDir, `src-${product}-${version}`);
    fs.rmSync(src, {recursive: true, force: true});
    const files = {
        'version.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE version SYSTEM "../../../lib/pkp/dtd/pluginVersion.dtd">
<version>
	<application>${product}</application>
	<type>${c.type}</type>
	<release>${version}</release>
	<date>2026-11-05</date>
	<lazy-load>1</lazy-load>
	<class>${className}</class>
</version>
`,
        [`${className}.php`]: `<?php
namespace ${ns};

require_once __DIR__ . '/${mig}.php';

use ${c.base};

class ${className} extends ${c.base.split('\\').pop()}
{
${kind === 'theme' ? `    public function init()
    {
    }

` : ''}    public function getDisplayName()
    {
        return '${displayName}';
    }

    public function getDescription()
    {
        return '${displayName}, version ${version}.';
    }

    public function getInstallMigration()
    {
        return new ${mig}();
    }
}
`,
        [`${mig}.php`]: `<?php
namespace ${ns};

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\DB;
use Illuminate\\Support\\Facades\\Schema;

class ${mig} extends Migration
{
    public function up(): void
    {
${migrationBody(product, step)}
    }

    public function down(): void
    {
        Schema::dropIfExists('${product}_items');
        Schema::dropIfExists('${product}_runs');
    }
}
`,
        'index.php': `<?php
require_once __DIR__ . '/${className}.php';
return new \\${ns}\\${className}();
`,
    };
    if (filter) {
        files['filter/filterConfig.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE filterConfig SYSTEM "../../../../lib/pkp/dtd/filterConfig.dtd">
<filterConfig>
</filterConfig>
`;
    }
    if (upgradeTable) {
        files['upgrade.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE install SYSTEM "../../../lib/pkp/dtd/install.dtd">
<install version="${version}">
	<migration class="${ns}\\${className}UpgradeMigration" />
</install>
`;
        files[`${className}UpgradeMigration.php`] = `<?php
namespace ${ns};

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

class ${className}UpgradeMigration extends Migration
{
    public function up(): void
    {
        Schema::create('${upgradeTable}', function (Blueprint $table) {
            $table->bigIncrements('id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('${upgradeTable}');
    }
}
`;
    }
    for (const [rel, body] of Object.entries(files)) {
        const f = path.join(src, product, rel);
        fs.mkdirSync(path.dirname(f), {recursive: true});
        fs.writeFileSync(f, body);
    }
    const out = path.join(outDir, `${product}-${version}.tar.gz`);
    execFileSync('tar', ['--format', 'ustar', '-czf', out, '-C', src, product], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    return out;
}

const folderOf = (app, kind, product) => path.join(path.resolve(app.root), 'plugins', CAT[kind].dir, product);
const folderThere = (app, kind, product) => fs.existsSync(folderOf(app, kind, product));
/** The plugin's recorded versions ("1.0.0.0 current=1"). */
const versions = (app, product) => sql(app, `SELECT major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product='${product}' ORDER BY date_installed, major, minor, revision, build`).split('\n').filter(Boolean);
/** The table's name while it is there, '(none)' once it is not. */
const table = (app, name) => sql(app, `SELECT coalesce(to_regclass('${name}')::text, '(none)')`).trim();
/** Rows in the counter plugin's table (how often its step ran), or null without the table. */
const runs = (app, product) => (table(app, `${product}_runs`) === '(none)' ? null : Number(sql(app, `SELECT count(*) FROM ${product}_runs`).trim()));
const gitPlugins = (app) => execFileSync('git', ['-C', path.resolve(app.root), 'status', '--short', '--', 'plugins'], {encoding: 'utf8'}).trim();

/** Remove our plugins' folders, version and settings rows and tables (the cleanup, not a step). */
function cleanup(app, plugins, extraTables = []) {
    const out = [];
    for (const {product, kind} of plugins) {
        const dir = folderOf(app, kind, product);
        const had = fs.existsSync(dir);
        fs.rmSync(dir, {recursive: true, force: true});
        sql(app, `DELETE FROM versions WHERE product='${product}'`);
        sql(app, `DELETE FROM plugin_settings WHERE plugin_name='${names(product).id}'`);
        for (const t of [`${product}_items`, `${product}_runs`]) sql(app, `DROP TABLE IF EXISTS ${t}`);
        out.push({product, folderRemoved: had});
    }
    for (const t of extraTables) sql(app, `DROP TABLE IF EXISTS ${t}`);
    return out;
}

async function rowFacts(list, kind, id) {
    const row = list.row(id);
    if (!(await row.count())) return {present: false};
    return {
        present: true,
        underHeading: (await list.rowIn(CAT[kind].heading, id).count().catch(() => 0)) > 0 ? CAT[kind].heading : null,
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

/** The notices shown since the last markNotices(): their text and whether amber (warning) or green. */
async function freshNotices(page, ms = 10_000) {
    const sel = '.app__notifications .pkpNotification:not([data-seen])';
    const end = Date.now() + ms;
    while (Date.now() < end && !(await page.locator(sel).count())) await sleep(150);
    await sleep(300);
    return page.locator(sel).evaluateAll((els) => els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').replace(/\s*×?\s*Close\s*$/, '').trim(), cls: e.className}))).catch(() => []);
}

/**
 * "Upload A New Plugin" (`via` 'upload') or a row's "Upgrade" (`via` 'upgrade', `id` the row) with `file`,
 * "Save": the save's status and answer, the notices. Never throws.
 */
async function sendPackage(page, list, via, file, id = null) {
    const P = require('../../../pages/PluginsPages.js');
    const o = {via, file: path.basename(file)};
    try {
        await P.markNotices(page);
        const win = via === 'upload' ? await list.openUpload() : await list.openUpgrade(id);
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
    return o;
}

async function snap(page, name) {
    record(name, await screen(page));
    await shot(page, name).catch(() => {});
}

module.exports = {T, sleep, flat, CAT, names, build, folderOf, folderThere, versions, table, runs, gitPlugins, cleanup, rowFacts, openWebsitePlugins, freshNotices, sendPackage, snap};
