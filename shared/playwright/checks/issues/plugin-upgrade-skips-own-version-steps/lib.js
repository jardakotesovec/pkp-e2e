// Helpers for the U62 A11 walk (issue report docs/issues/U62-A11-plugin-upgrade-skips-own-version-steps.md).
// Requiring this file runs nothing.
//
// The packages are built with shared/playwright/support/pluginPackages.js (product `hkq27b`, "hkq27b
// Range Test Plugin"). 1.0.1.0 and 1.0.2.0 add an `upgrade.xml` and one migration class,
// Hkq27bTableMigration, which creates the table its `table` attribute names: a step a tester can see ran
// by the table it leaves in the database. Every walk writes the app checkout's own
// plugins/generic/hkq27b: the caller holds the session's app lock and calls `removeOurFolders()` and
// `dropOurTables()` at its end. The `sendPackage`, `freshNotices`, `rowFacts`, `openWebsitePlugins` and
// `snap` helpers are copied from the U62 A5 walk's lib.js (failed-upgrade-removes-plugin).
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {idle, screen, shot, record, sql} = require('../../../probe');
const PKG = require('../../../support/pluginPackages');

const PRODUCT = 'hkq27b';
const DISPLAY = 'hkq27b Range Test Plugin';
const {id: ROW_ID} = PKG.pluginNames(PRODUCT);
const MIGRATION = 'Hkq27bTableMigration';
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? t : String(t).replace(/\s+/g, ' ').trim().slice(0, n));

/** The steps of each upgrade.xml: [table, minversion, maxversion]. */
const STEPS = {
    // The report's package: one step for every upgrade, one for sites coming from the plugin's
    // 1.0.0.x, one for application versions 3.0 and later.
    '1.0.1.0': [
        ['hkq27b_always', null, null],
        ['hkq27b_from_1_0_0', '1.0.0.0', '1.0.0.9'],
        ['hkq27b_from_3_0', '3.0.0.0', null],
    ],
    // The neighbour's package (fix trial): from 1.0.1.0 only the 1.0.1.x step is meant to run.
    '1.0.2.0': [
        ['hkq27b_n_always', null, null],
        ['hkq27b_n_from_1_0_0', '1.0.0.0', '1.0.0.9'],
        ['hkq27b_n_from_1_0_1', '1.0.1.0', '1.0.1.9'],
        ['hkq27b_n_from_3_0', '3.0.0.0', null],
    ],
};

function upgradeXml(version) {
    const step = (table) => `<migration class="APP\\plugins\\generic\\${PRODUCT}\\${MIGRATION}" table="${table}" />`;
    const body = STEPS[version].map(([table, min, max]) => (min || max
        ? `\t<upgrade${min ? ` minversion="${min}"` : ''}${max ? ` maxversion="${max}"` : ''}>\n\t\t${step(table)}\n\t</upgrade>`
        : `\t${step(table)}`)).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE install SYSTEM "../../../lib/pkp/dtd/install.dtd">
<install version="${version}">
${body}
</install>
`;
}

const MIGRATION_PHP = `<?php
namespace APP\\plugins\\generic\\${PRODUCT};

use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;
use PKP\\migration\\Migration;

/** An upgrade step that leaves a trace: it creates the table its "table" attribute names. */
class ${MIGRATION} extends Migration
{
    public function up(): void
    {
        Schema::create($this->_attributes['table'], function (Blueprint $table) {
            $table->bigIncrements('id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists($this->_attributes['table']);
    }
}
`;

/** {v100, v101, v102} packages built into `<outDir>/pkg` (absolute paths). */
function buildPackages(outDir) {
    const dir = path.join(outDir, 'pkg');
    fs.mkdirSync(dir, {recursive: true});
    const spec = (version) => ({product: PRODUCT, version, displayName: DISPLAY, description: `hkq27b scratch plugin, version ${version}.`});
    const out = {v100: PKG.buildPlugin(dir, spec('1.0.0.0'))};
    for (const [key, version] of [['v101', '1.0.1.0'], ['v102', '1.0.2.0']]) {
        PKG.buildPlugin(dir, spec(version));
        const src = path.join(dir, `src-${PRODUCT}-${version}`);
        fs.writeFileSync(path.join(src, PRODUCT, 'upgrade.xml'), upgradeXml(version));
        fs.writeFileSync(path.join(src, PRODUCT, `${MIGRATION}.php`), MIGRATION_PHP);
        out[key] = path.join(dir, `${PRODUCT}-${version}.tar.gz`);
        execFileSync('tar', ['--format', 'ustar', '-czf', out[key], '-C', src, PRODUCT], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    }
    return out;
}

/** Step 5's query: the hkq27b tables in the database. */
const ourTables = (app) => sql(app, "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'hkq27b%' ORDER BY 1").split('\n').filter(Boolean);
/** Which of a package's steps ran, by the tables they leave. */
const ran = (app, version) => {
    const t = ourTables(app);
    return Object.fromEntries(STEPS[version].map(([table]) => [table, t.includes(table)]));
};
const pluginVersions = (app) => sql(app, `SELECT major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product='${PRODUCT}' ORDER BY date_installed, major, minor, revision, build`).split('\n').filter(Boolean);
const coreVersions = (app) => sql(app, "SELECT product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product_type='core' ORDER BY date_installed").split('\n').filter(Boolean);
/** Remove our scratch tables and version rows (the cleanup, not a step). */
function dropOurTables(app) {
    const t = ourTables(app);
    for (const table of t) sql(app, `DROP TABLE IF EXISTS ${table}`);
    sql(app, `DELETE FROM versions WHERE product='${PRODUCT}'`);
    sql(app, `DELETE FROM plugin_settings WHERE plugin_name='${ROW_ID}'`);
    return t;
}

const ourFolders = (app) => PKG.pluginFolders(path.resolve(app.root), [PRODUCT]);
const removeOurFolders = (app) => PKG.removePluginFolders(path.resolve(app.root), [PRODUCT]);
const gitPlugins = (app) => execFileSync('git', ['-C', path.resolve(app.root), 'status', '--short', '--', 'plugins'], {encoding: 'utf8'}).trim();
function folderRelease(app) {
    const f = path.join(path.resolve(app.root), 'plugins', 'generic', PRODUCT, 'version.xml');
    if (!fs.existsSync(f)) return null;
    const m = fs.readFileSync(f, 'utf8').match(/<release>([^<]+)<\/release>/);
    return m ? m[1] : '?';
}

async function rowFacts(list) {
    const row = list.row(ROW_ID);
    if (!(await row.count())) return {present: false};
    return {
        present: true,
        name: flat(await list.rowName(ROW_ID).innerText().catch(() => null), 80),
        ticked: await list.box(ROW_ID).isChecked().catch(() => null),
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
 * "Upload A New Plugin" (`via` 'upload') or the row's "Upgrade" (`via` 'upgrade') with `file`, "Save":
 * the save's status and answer, the notices, our row after. Never throws.
 */
async function sendPackage(page, list, via, file) {
    const P = require('../../../pages/PluginsPages.js');
    const o = {via, file: path.basename(file)};
    try {
        await P.markNotices(page);
        const win = via === 'upload' ? await list.openUpload() : await list.openUpgrade(ROW_ID);
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
    o.rowAfter = await rowFacts(list);
    return o;
}

async function snap(page, name) {
    record(name, await screen(page));
    await shot(page, name).catch(() => {});
}

module.exports = {PRODUCT, DISPLAY, ROW_ID, STEPS, sleep, flat, upgradeXml, MIGRATION_PHP, buildPackages, ourTables, ran, pluginVersions, coreVersions, dropOurTables, ourFolders, removeOurFolders, gitPlugins, folderRelease, rowFacts, openWebsitePlugins, sendPackage, freshNotices, snap};
