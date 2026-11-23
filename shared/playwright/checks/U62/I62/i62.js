// U62 claim check, chunk I62 (housekeeping 2026-11-23): the incidental row of 2026-11-20 on Rule 18
// ("Upgrade"): an upgraded plugin's install migration (the class getInstallMigration() returns), named by
// its upgrade.xml and run by the Installer::postInstall updateSchema() hook, runs as the pre-upgrade
// copy of the class on the web upgrade path, since Plugin::register() instantiated it on the same
// request before PluginHelper::upgradePlugin() swapped the files; plus Rule 18, Rule 20, Side effects
// and scenario 5 of docs/specs/U62-plugins-management.md.
//
// Parts (PART=, default `web,cli,s5,side`), each run twice under its own PROBE_RUN (r1, r2; main only):
//   web  as `admin` on a scratch journal's Settings › Website › "Plugins": "Upload A New Plugin" with
//        u62i62w<run> 1.0.0.0 (left unticked); its row's "Upgrade" left once with 1.0.1.0 chosen and
//        unsaved (the window's "Close"); "Upgrade" with 1.0.1.0 and "Save". 1.0.1.0's install migration
//        (<Class>Migration, const V) adds a step to up() that makes the table <product>_n, and its
//        upgrade.xml holds the five range steps of I27C plus <migration class="…Migration"/>. Reads:
//        the marker file (each up() call: the class copy's V, its caller, the request), the tables, the
//        versions rows, the core rows, the folder's release; the row after a reload; the site's list and
//        publicknowledge's list (read only) for the new description. Then "Upload A New Plugin" with
//        another plugin, u62i62x<run>, whose request fires postInstall again (which copy runs now), its
//        "Delete". Then "Upgrade" with u62i62w 1.0.2.0, whose upgrade.xml aborts (Rule 20): the notice,
//        the row at once and after reloads on the scratch list, the site's and publicknowledge's.
//   cli  the control: u62i62c<run> 1.0.0.0 by "Upload A New Plugin", then its 1.0.1.0 files put in place
//        by hand and `php lib/pkp/tools/installPluginVersion.php plugins/generic/<product>/version.xml`
//        (cwd the app root, PKP_CONFIG_FILE the fleet's config.test.inc.php); the same reads.
//   s5   scenario 5 as written ("Harbour Test Plugin" ticked, "Upgrade Plugin" window and its "Close",
//        another category's plugin, another plugin, 1.0.1.0 whose upgrade.xml writes a line to a file and
//        names <install version="<core major.minor>.6.2"> (Rule 18's last sentence), "Delete"/"Cancel",
//        "Delete"/"OK", "Harbour Table Plugin" uploaded and deleted with its table read, the site's
//        list, the control reload).
//   side the rest of Side effects bullet 1 on a scratch journal: "Google Analytics Plugin" ticked, then
//        unticked with "Disable" › "OK" (Rules 8, 9), and "Upload A New Plugin" with an archive that has no
//        version.xml (Rule 17, refused): each notice and where it sits; no install happens.
// Every part also reads Side effects bullet 1 (Mailpit since the part began, Tasks-level notifications
// rows and event_log rows added meanwhile) and where the upgrade notice sits.
//
// The plugin folders land in checkouts/<app>/plugins, served by every fleet of the app, and the
// versions table is site-wide: run each app as ONE exclusive command; each part puts back what it
// changed (folders, versions/plugin_settings rows, the scratch tables, the core rows if they moved):
//   bin/app-lock.sh exclusive ojs -- env PROBE_RUN=r1 PROBE_FEATURE=U62 PROBE_AGENT=ccI62 PROBE_NOTES_FEATURE=U62 node bin/probe.js ojs shared/playwright/checks/U62/I62/i62.js
//   (then omp, ops; then PROBE_RUN=r2). Outputs: .reports/U62/ccI62/{web,cli,s5,side}-<run>-<app>.json, screens
//   <part>-NN-*-<run>-<app>.json/.png, markers through outFile('markers-<part>.jsonl'), the run record.
// No other script and no other env part is needed. No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync, spawnSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog, outDir, outFile} = require('../../../probe');
const PKG = require('../../../support/pluginPackages');

const PARTS = (process.env.PART || 'web,cli,s5,side').split(',');
const RUN = process.env.PROBE_RUN || 'r0';
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? t : String(t).replace(/\s+/g, ' ').trim().slice(0, n));
const log = (...a) => console.log('[i62]', new Date().toISOString().slice(11, 19), ...a);
const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
const prod = (p) => `${p}${RUN}`.toLowerCase().replace(/[^a-z0-9]/g, '');

const STEPS = [
    ['always', null, null],
    ['plugin-range-1.0.0.x', '1.0.0.0', '1.0.0.9'],
    ['plugin-max-1.0.0.9', null, '1.0.0.9'],
    ['core-min-3.0', '3.0.0.0', null],
    ['core-bracket-3.x', '3.0.0.0', '3.99.99.99'],
];

// ------------------------------------------------------------------ packages
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

/**
 * A generic plugin whose install migration (autoloaded, as a namespaced plugin's classes are) marks each
 * up() call; from 1.0.1.0 up() also runs the "new step" (table <product>_n). `upgrade`: 'steps' (the I27C
 * range steps plus a <migration> node naming the install migration), 'abort' (one aborting step), none.
 */
function buildMigrationPlugin(dir, {product, version, displayName, markerFile, upgrade}) {
    const C = cap(product);
    const ns = `APP\\plugins\\generic\\${product}`;
    const src = path.join(dir, `src-${product}-${version}`);
    fs.rmSync(src, {recursive: true, force: true});
    const newStep = version !== '1.0.0.0';
    const files = {
        'version.xml': versionXml(product, version),
        [`${C}Plugin.php`]: `<?php
namespace ${ns};

use PKP\\plugins\\GenericPlugin;

class ${C}Plugin extends GenericPlugin
{
    public function register($category, $path, $mainContextId = null)
    {
        $result = parent::register($category, $path, $mainContextId);
        // On a plugin save request only: is the install migration's class in memory once register() is done?
        if (strpos($_SERVER['REQUEST_URI'] ?? '', 'save-upload-plugin') !== false) {
            file_put_contents(${JSON.stringify(markerFile)}, json_encode([
                'product' => '${product}',
                'what' => 'register',
                'pluginV' => '${version}',
                'migrationClassLoaded' => class_exists(${C}Migration::class, false),
                'uri' => $_SERVER['REQUEST_URI'],
            ]) . "\n", FILE_APPEND);
        }
        return $result;
    }

    public function getDisplayName()
    {
        return '${displayName}';
    }

    public function getDescription()
    {
        return 'U62 I62 scratch plugin, version ${version}.';
    }

    public function getInstallMigration()
    {
        return new ${C}Migration();
    }
}
`,
        [`${C}Migration.php`]: `<?php
namespace ${ns};

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

class ${C}Migration extends Migration
{
    public const V = '${version}';

    private function mark(string $what): void
    {
        $file = (new \\ReflectionClass(self::class))->getFileName();
        $onDisk = is_file($file) && preg_match("/const V = '([^']+)'/", file_get_contents($file), $m) ? $m[1] : null;
        $callers = [];
        foreach (array_slice(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 8), 1, 6) as $f) {
            $callers[] = (isset($f['class']) ? substr(strrchr('\\\\' . $f['class'], '\\\\'), 1) . '::' : '') . $f['function'];
        }
        file_put_contents(${JSON.stringify(markerFile)}, json_encode([
            'product' => '${product}',
            'what' => $what,
            'classV' => self::V,
            'fileOnDiskV' => $onDisk,
            'callers' => $callers,
            'uri' => $_SERVER['REQUEST_URI'] ?? PHP_SAPI,
            'sapi' => PHP_SAPI,
            'opcache' => function_exists('opcache_get_status') ? (opcache_get_status(false)['opcache_enabled'] ?? false) : 'absent',
            't' => microtime(true),
        ]) . "\\n", FILE_APPEND);
    }

    public function up(): void
    {
        $this->mark('up');
        if (!Schema::hasTable('${product}_t')) {
            Schema::create('${product}_t', function (Blueprint $table) {
                $table->bigIncrements('id');
            });
        }
${newStep ? `        // The step this release adds.
        $this->mark('new-step');
        if (!Schema::hasTable('${product}_n')) {
            Schema::create('${product}_n', function (Blueprint $table) {
                $table->bigIncrements('id');
            });
        }
` : ''}    }

    public function down(): void
    {
        Schema::dropIfExists('${product}_t');
        Schema::dropIfExists('${product}_n');
    }
}
`,
        'index.php': `<?php
require_once __DIR__ . '/${C}Plugin.php';
return new \\${ns}\\${C}Plugin();
`,
    };
    if (upgrade === 'steps') {
        const code = (name) => `<code file="plugins/generic/${product}/${C}Marker.php" class="${C}Marker" function="mark" step="${name}" />`;
        const body = STEPS.map(([name, min, max]) => (min || max
            ? `\t<upgrade${min ? ` minversion="${min}"` : ''}${max ? ` maxversion="${max}"` : ''}>\n\t\t${code(name)}\n\t</upgrade>`
            : `\t${code(name)}`)).join('\n');
        files['upgrade.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE install SYSTEM "../../../lib/pkp/dtd/install.dtd">
<install version="${version}">
${body}
	<migration class="${ns}\\${C}Migration" />
</install>
`;
        files[`${C}Marker.php`] = `<?php
class ${C}Marker
{
    public static function mark($installer, $attr)
    {
        file_put_contents(${JSON.stringify(markerFile)}, json_encode([
            'product' => '${product}',
            'what' => 'step',
            'step' => $attr['step'] ?? null,
            'currentVersion' => $installer->getCurrentVersion() ? $installer->getCurrentVersion()->getVersionString(false) : null,
            'uri' => $_SERVER['REQUEST_URI'] ?? PHP_SAPI,
        ]) . "\\n", FILE_APPEND);
        return true;
    }
}
`;
    } else if (upgrade === 'abort') {
        files['upgrade.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<install version="${version}">
	<code function="abort" message="U62 I62 upgrade step failed on purpose" />
</install>
`;
    }
    for (const [rel, body] of Object.entries(files)) {
        const f = path.join(src, product, rel);
        fs.mkdirSync(path.dirname(f), {recursive: true});
        fs.writeFileSync(f, body);
    }
    const out = path.join(dir, `${product}-${version}${upgrade ? `-${upgrade}` : ''}.tar.gz`);
    execFileSync('tar', ['--format', 'ustar', '-czf', out, '-C', src, product], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    return {file: out, src: path.join(src, product)};
}

/** Scenario 5's 1.0.1.0: the kept builder's plugin plus an upgrade.xml whose one step writes a line. */
function buildHarbourUpgrade(dir, product, displayName, stepFile, line, installVersion) {
    PKG.buildPlugin(dir, {product, version: '1.0.1.0', displayName});
    const src = path.join(dir, `src-${product}-1.0.1.0`);
    const cls = `${cap(product)}Step`;
    fs.writeFileSync(path.join(src, product, 'upgrade.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE install SYSTEM "../../../lib/pkp/dtd/install.dtd">
<install version="${installVersion}">
	<code file="plugins/generic/${product}/${cls}.php" class="${cls}" function="mark" />
</install>
`);
    fs.writeFileSync(path.join(src, product, `${cls}.php`), `<?php
class ${cls}
{
    public static function mark($installer, $attr)
    {
        file_put_contents(${JSON.stringify(stepFile)}, ${JSON.stringify(line)} . "\\n", FILE_APPEND);
        return true;
    }
}
`);
    const out = path.join(dir, `${product}-1.0.1.0-step.tar.gz`);
    execFileSync('tar', ['--format', 'ustar', '-czf', out, '-C', src, product], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    return out;
}

/** "Harbour Table Plugin": the install migration makes <product>_t. */
function buildTable(dir, product, displayName) {
    return require('../I05B/pkg.js').build(dir, {product, kind: 'generic', fail: false, displayName, markerFile: path.join(dir, `markers-${product}.jsonl`)});
}

// ------------------------------------------------------------------ server-side reads
const readMarkers = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const versions = (app, product) => sql(app, `SELECT product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product='${product}' ORDER BY date_installed, major, minor, revision, build`).split('\n').filter(Boolean);
const coreRows = (app) => sql(app, "SELECT product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product_type='core' ORDER BY date_installed, major, minor, revision, build").split('\n').filter(Boolean);
const hasTable = (app, t) => sql(app, `SELECT to_regclass('public.${t}') IS NOT NULL`) === 't';
const folderRelease = (app, product) => {
    const f = path.join(path.resolve(app.root), 'plugins/generic', product, 'version.xml');
    if (!fs.existsSync(f)) return null;
    const m = fs.readFileSync(f, 'utf8').match(/<release>([^<]+)<\/release>/);
    return m ? m[1] : '?';
};
const maxId = (app, table, col) => Number(sql(app, `SELECT COALESCE(MAX(${col}),0) FROM ${table}`)) || 0;
function sideEffects(app, base, since) {
    return {
        tasksRows: sql(app, `SELECT notification_id||' level='||level||' type='||type||' user='||COALESCE(user_id::text,'') FROM notifications WHERE notification_id>${base.notif} AND level<>1`).split('\n').filter(Boolean),
        eventLogRows: sql(app, `SELECT log_id||' '||assoc_type||' '||COALESCE(message,'') FROM event_log WHERE log_id>${base.ev}`).split('\n').filter(Boolean),
        since: since.toISOString(),
    };
}
function scrub(app, products) {
    const removed = PKG.removePluginFolders(path.resolve(app.root), products);
    for (const p of products) {
        sql(app, `DELETE FROM versions WHERE product='${p}'`);
        sql(app, `DELETE FROM plugin_settings WHERE plugin_name='${p}plugin'`);
        sql(app, `DROP TABLE IF EXISTS ${p}_t`);
        sql(app, `DROP TABLE IF EXISTS ${p}_n`);
    }
    return removed;
}
/** Put the core rows back as they were (only if they moved). */
function restoreCore(app, before) {
    const now = coreRows(app);
    if (JSON.stringify(now) === JSON.stringify(before)) return {moved: false};
    const keep = before.map((r) => r.split(' ')[1]);
    for (const r of now) {
        const v = r.split(' ')[1];
        if (!keep.includes(v)) {
            const [ma, mi, re, bu] = v.split('.');
            sql(app, `DELETE FROM versions WHERE product_type='core' AND major=${ma} AND minor=${mi} AND revision=${re} AND build=${bu}`);
        }
    }
    for (const r of before) {
        const [ma, mi, re, bu] = r.split(' ')[1].split('.');
        sql(app, `UPDATE versions SET current=${r.endsWith('current=1') ? 1 : 0} WHERE product_type='core' AND major=${ma} AND minor=${mi} AND revision=${re} AND build=${bu}`);
    }
    return {moved: true, was: now, now: coreRows(app)};
}
const gitPlugins = (app) => execFileSync('git', ['-C', path.resolve(app.root), 'status', '--short', '--', 'plugins'], {encoding: 'utf8'}).trim();

// ------------------------------------------------------------------ the drive
forEachApp(async (app) => {
    const P = require('../../../pages/PluginsPages.js');
    const ctxHeading = {ojs: 'journal', omp: 'press', ops: 'server'}[app.name];

    async function withBrowser(part, fn) {
        const facts = {};
        const fact = (k, v) => {
            facts[k] = v;
            record(part, {[k]: v}, {merge: true});
            log(app.name, part, k, JSON.stringify(v).slice(0, 700));
        };
        const since = new Date();
        const base = {notif: maxId(app, 'notifications', 'notification_id'), ev: maxId(app, 'event_log', 'log_id')};
        const core0 = coreRows(app);
        fact('coreBefore', core0);
        const t = tag('u62i');
        const ctx = await app.api.createContext({tag: t, context: {name: `U62 I62 ${part} ${t}`, acronym: 'I62'}});
        const contextPath = ctx.urlPath || ctx.path || ctx.contextPath || t;
        fact('context', {tag: t, contextPath, ctxHeading});
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', async (d) => {
            dialogs.push({type: d.type(), message: flat(d.message(), 300)});
            if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
        });
        let n = 0;
        const snap = async (name) => {
            const s = await screen(page);
            const nm = `${part}-${String(++n).padStart(2, '0')}-${name}`;
            record(nm, s);
            await shot(page, nm).catch(() => {});
            return s;
        };
        const freshNotices = async (ms = 10_000) => {
            const sel = '.app__notifications .pkpNotification:not([data-seen])';
            const end = Date.now() + ms;
            while (Date.now() < end && !(await page.locator(sel).count())) await sleep(150);
            await sleep(300);
            return page.locator(sel).evaluateAll((els) => els.map((e) => {
                const r = e.getBoundingClientRect();
                return {text: e.innerText.replace(/\s+/g, ' ').replace(/\s*×?\s*Close\s*$/, '').trim(), cls: e.className, x: Math.round(r.x), y: Math.round(r.y), right: Math.round(window.innerWidth - r.right)};
            })).catch(() => []);
        };
        const srv = serverLog(app);
        const from = srv.mark();
        try {
            await signIn(page, 'admin');
            const website = new P.WebsitePluginsPage(page, contextPath);
            const site = new P.SitePluginsPage(page);
            const pk = new P.WebsitePluginsPage(page, app.contextPath);
            await fn({page, website, site, pk, list: website.list, fact, snap, freshNotices, contextPath});
            await signOut(page).catch(() => {});
        } catch (e) {
            fact('error', flat(e.stack, 1500));
            await snap('err').catch(() => {});
        } finally {
            fact('dialogs', dialogs);
            fact('sideEffects', sideEffects(app, base, since));
            try {
                const adminEmail = sql(app, "SELECT email FROM users WHERE username='admin'");
                const msgs = ((await app.mail._search({to: adminEmail, since})).messages || []).map((m) => ({at: m.Created, subject: flat(m.Subject, 160)}));
                fact('mailSince', {toAdmin: msgs.length, adminEmail, messages: msgs, note: 'the Mailpit is the slot\'s: a message naming another agent\'s tag is not this drive\'s'});
            } catch (e) {
                fact('mailSince', `read failed: ${flat(e.message, 200)}`);
            }
            fact('serverLog', srv.since(from).slice(0, 40));
            await close().catch(() => {});
            fact('coreRestore', restoreCore(app, core0));
        }
        return facts;
    }

    const rowFacts = async (list, id) => {
        const row = list.row(id);
        if (!(await row.count())) return {present: false};
        return {present: true, ticked: await list.box(id).isChecked().catch(() => null), text: flat(await row.innerText().catch(() => null), 200)};
    };
    // `watch`: the description texts to look for in the list's own refetch after the save (fetch-grid).
    const save = async (win, freshNotices, watch) => {
        const refetch = watch ? win.page.waitForResponse((r) => /-plugin-grid\/fetch-grid/.test(r.url()), {timeout: T}).catch(() => null) : null;
        const resp = await win.save();
        const out = {status: resp.status(), answer: flat(await resp.text().catch(() => null), 300), notices: await freshNotices()};
        if (refetch) {
            const r = await refetch;
            const body = r ? await r.text().catch(() => '') : '';
            out.refetch = r ? {status: r.status(), has: Object.fromEntries(watch.map((w) => [w, body.includes(w)]))} : 'none seen';
        }
        await win.dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await P.pastModalCloseWindow(win.page);
        await idle(win.page);
        return out;
    };

    // ------------------------------------------------------------ web
    if (PARTS.includes('web')) {
        const W = prod('u62i62w');
        const X = prod('u62i62x');
        const WID = PKG.pluginNames(W).id;
        const XID = PKG.pluginNames(X).id;
        const markers = outFile('markers-web.jsonl');
        fs.rmSync(markers, {force: true});
        const dir = path.join(outDir(), `pkg-web-${RUN}-${app.name}`);
        fs.mkdirSync(dir, {recursive: true});
        const name = 'U62 I62 Upgrade Plugin';
        const pkg = {
            v100: buildMigrationPlugin(dir, {product: W, version: '1.0.0.0', displayName: name, markerFile: markers}).file,
            v101: buildMigrationPlugin(dir, {product: W, version: '1.0.1.0', displayName: name, markerFile: markers, upgrade: 'steps'}).file,
            v102: buildMigrationPlugin(dir, {product: W, version: '1.0.2.0', displayName: name, markerFile: markers, upgrade: 'abort'}).file,
            x: PKG.buildPlugin(dir, {product: X, version: '1.0.0.0', displayName: 'U62 I62 Other Plugin'}),
        };
        scrub(app, [W, X]);
        try {
            await withBrowser('web', async ({page, website, site, pk, list, fact, snap, freshNotices}) => {
                await website.goto();
                await idle(page);
                await snap('plugins');
                await P.markNotices(page);
                let win = await list.openUpload();
                await snap('upload-window');
                await win.chooseFile(pkg.v100);
                fact('upload100', await save(win, freshNotices));
                fact('row.afterUpload', await rowFacts(list, WID));
                fact('versions.afterUpload', versions(app, W));
                fact('markers.afterUpload', readMarkers(markers));
                await snap('after-upload');

                // "Upgrade" left with a file chosen, unsaved, by the window's "Close"
                await list.openArrow(WID);
                fact('rowLinks', await list.rowLinks(WID).allInnerTexts());
                await snap('row-arrow');
                await P.markNotices(page);
                win = await list.openUpgrade(WID);
                fact('upgradeWindowText', flat(await win.formText().catch(() => null), 400));
                await snap('upgrade-window');
                await loc(page, 'Upgrade Plugin: Close (×)', win.closeButton);
                await win.chooseFile(pkg.v101);
                await snap('upgrade-window-file-chosen');
                await win.closeButton.click();
                await sleep(1500);
                fact('closeUnsaved', {dialogOpen: await win.dialog.count(), notices: await freshNotices(3000), row: await rowFacts(list, WID), versions: versions(app, W), folder: folderRelease(app, W), markers: readMarkers(markers).length});
                await snap('after-close-unsaved');
                await P.pastModalCloseWindow(page);

                // "Upgrade" 1.0.1.0, "Save"
                const m0 = readMarkers(markers).length;
                await P.markNotices(page);
                win = await list.openUpgrade(WID);
                await win.chooseFile(pkg.v101);
                fact('upgrade101', await save(win, freshNotices, ['version 1.0.0.0', 'version 1.0.1.0']));
                fact('row.afterUpgrade', await rowFacts(list, WID));
                fact('versions.afterUpgrade', versions(app, W));
                fact('folder.afterUpgrade', folderRelease(app, W));
                const mk = readMarkers(markers).slice(m0);
                fact('markers.upgradeRequest', mk);
                fact('upgradeRequest', {
                    register: mk.filter((m) => m.what === 'register').map((m) => ({pluginV: m.pluginV, migrationClassLoaded: m.migrationClassLoaded})),
                    upCalls: mk.filter((m) => m.what === 'up').map((m) => ({classV: m.classV, fileOnDiskV: m.fileOnDiskV, via: m.callers.join(' < ')})),
                    newStepRan: mk.some((m) => m.what === 'new-step'),
                    rangeSteps: Object.fromEntries(STEPS.map(([s]) => [s, mk.some((m) => m.step === s)])),
                    stepCurrentVersion: [...new Set(mk.filter((m) => m.what === 'step').map((m) => m.currentVersion))],
                });
                fact('tables.afterUpgrade', {t: hasTable(app, `${W}_t`), n: hasTable(app, `${W}_n`)});
                fact('core.afterUpgrade', coreRows(app));
                await snap('after-upgrade');
                await website.reload();
                fact('row.afterReload', await rowFacts(list, WID));
                await snap('after-upgrade-reload');

                // Side effects bullet 2: the site's list and publicknowledge's (read only) at their next load
                await site.goto();
                fact('site.afterUpgrade', await rowFacts(site.list, WID));
                await snap('site-after-upgrade');
                await pk.goto();
                fact('pk.afterUpgrade', await rowFacts(pk.list, WID));
                await snap('pk-after-upgrade');

                // Another plugin's "Upload A New Plugin": a later request that fires postInstall again
                await website.goto();
                const m1 = readMarkers(markers).length;
                await P.markNotices(page);
                win = await list.openUpload();
                await win.chooseFile(pkg.x);
                fact('uploadOther', await save(win, freshNotices));
                const mx = readMarkers(markers).slice(m1);
                fact('markers.otherUploadRequest', mx);
                fact('tables.afterOtherUpload', {t: hasTable(app, `${W}_t`), n: hasTable(app, `${W}_n`)});
                await snap('after-other-upload');
                await P.markNotices(page);
                await list.openDelete(XID);
                const delx = await list.confirmDelete();
                fact('deleteOther', {status: delx.status(), notices: await freshNotices(), row: await rowFacts(list, XID), folder: folderRelease(app, X)});

                // Rule 20: "Upgrade" with 1.0.2.0 whose own step aborts
                await P.pastModalCloseWindow(page);
                await P.markNotices(page);
                win = await list.openUpgrade(WID);
                await win.chooseFile(pkg.v102);
                fact('upgrade102fail', await save(win, freshNotices));
                fact('row.afterFail.atOnce', await rowFacts(list, WID));
                fact('folder.afterFail', folderRelease(app, W));
                fact('versions.afterFail', versions(app, W));
                await snap('after-failed-upgrade');
                await website.reload();
                fact('row.afterFail.reload', await rowFacts(list, WID));
                await snap('after-failed-upgrade-reload');
                await site.goto();
                fact('site.afterFail', await rowFacts(site.list, WID));
                await snap('site-after-failed-upgrade');
                await pk.goto();
                fact('pk.afterFail', await rowFacts(pk.list, WID));
                await snap('pk-after-failed-upgrade');
            });
        } finally {
            record('web', {scrubbed: scrub(app, [W, X]), gitPlugins: gitPlugins(app)}, {merge: true});
        }
    }

    // ------------------------------------------------------------ cli control
    if (PARTS.includes('cli')) {
        const C = prod('u62i62c');
        const CID = PKG.pluginNames(C).id;
        const markers = outFile('markers-cli.jsonl');
        fs.rmSync(markers, {force: true});
        const dir = path.join(outDir(), `pkg-cli-${RUN}-${app.name}`);
        fs.mkdirSync(dir, {recursive: true});
        const name = 'U62 I62 CLI Plugin';
        const v100 = buildMigrationPlugin(dir, {product: C, version: '1.0.0.0', displayName: name, markerFile: markers}).file;
        const v101 = buildMigrationPlugin(dir, {product: C, version: '1.0.1.0', displayName: name, markerFile: markers, upgrade: 'steps'});
        scrub(app, [C]);
        try {
            await withBrowser('cli', async ({page, website, list, fact, snap, freshNotices}) => {
                await website.goto();
                await P.markNotices(page);
                const win = await list.openUpload();
                await win.chooseFile(v100);
                fact('upload100', await save(win, freshNotices));
                fact('row.afterUpload', await rowFacts(list, CID));
                fact('versions.afterUpload', versions(app, C));
                await snap('after-upload');
                const m0 = readMarkers(markers).length;
                // The manual upgrade: the 1.0.1.0 files put in place, then the CLI tool.
                const dest = path.join(path.resolve(app.root), 'plugins/generic', C);
                fs.rmSync(dest, {recursive: true, force: true});
                fs.cpSync(v101.src, dest, {recursive: true});
                const r = spawnSync('php', ['lib/pkp/tools/installPluginVersion.php', `plugins/generic/${C}/version.xml`], {cwd: path.resolve(app.root), encoding: 'utf8', env: {...process.env, PKP_CONFIG_FILE: path.join(path.resolve(app.root), 'config.test.inc.php')}, timeout: 300_000});
                fact('cliRun', {status: r.status, stdout: flat(r.stdout, 600), stderr: flat(r.stderr, 600)});
                const mk = readMarkers(markers).slice(m0);
                fact('markers.cli', mk);
                fact('cliResult', {
                    upCalls: mk.filter((m) => m.what === 'up').map((m) => ({classV: m.classV, fileOnDiskV: m.fileOnDiskV, via: m.callers.join(' < ')})),
                    newStepRan: mk.some((m) => m.what === 'new-step'),
                    rangeSteps: Object.fromEntries(STEPS.map(([s]) => [s, mk.some((m) => m.step === s)])),
                });
                fact('tables.afterCli', {t: hasTable(app, `${C}_t`), n: hasTable(app, `${C}_n`)});
                fact('versions.afterCli', versions(app, C));
                await website.reload();
                fact('row.afterCliReload', await rowFacts(list, CID));
                await snap('after-cli-reload');
            });
        } finally {
            record('cli', {scrubbed: scrub(app, [C]), gitPlugins: gitPlugins(app)}, {merge: true});
        }
    }

    // ------------------------------------------------------------ scenario 5
    if (PARTS.includes('s5')) {
        const names = {test: prod('u62i62st'), block: prod('u62i62sb'), other: prod('u62i62so'), table: prod('u62i62sx')};
        const ids = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, PKG.pluginNames(v).id]));
        const dir = path.join(outDir(), `pkg-s5-${RUN}-${app.name}`);
        fs.mkdirSync(dir, {recursive: true});
        const stepFile = outFile('s5-upgrade-step.txt');
        fs.rmSync(stepFile, {force: true});
        const stepLine = `harbour upgrade step ${RUN}`;
        const core = coreRows(app).find((r) => r.endsWith('current=1')).split(' ')[1].split('.');
        const installVersion = `${core[0]}.${core[1]}.6.2`;
        const pkg = {
            test100: PKG.buildPlugin(dir, {product: names.test, version: '1.0.0.0', displayName: 'Harbour Test Plugin'}),
            test101: buildHarbourUpgrade(dir, names.test, 'Harbour Test Plugin', stepFile, stepLine, installVersion),
            block: PKG.buildPlugin(dir, {product: names.block, version: '1.0.0.0', displayName: 'Harbour Block Plugin', category: 'blocks'}),
            other: PKG.buildPlugin(dir, {product: names.other, version: '1.0.0.0', displayName: 'Harbour Other Plugin'}),
            table: buildTable(dir, names.table, 'Harbour Table Plugin'),
        };
        const all = Object.values(names);
        scrub(app, all);
        try {
            await withBrowser('s5', async ({page, website, site, list, fact, snap, freshNotices}) => {
                fact('installVersionNamed', installVersion);
                await website.goto();
                await P.markNotices(page);
                let win = await list.openUpload();
                await win.chooseFile(pkg.test100);
                fact('given.upload', await save(win, freshNotices));
                await list.tick(ids.test);
                fact('given.ticked', await freshNotices(5000));
                await website.reload();
                fact('given.row', await rowFacts(list, ids.test));
                await snap('given');

                await list.openArrow(ids.test);
                fact('rowLinks', await list.rowLinks(ids.test).allInnerTexts());
                await snap('arrow');
                win = await list.openUpgrade(ids.test);
                fact('upgradeWindow', {heading: await win.heading.innerText().catch(() => null), text: flat(await win.formText().catch(() => null), 400)});
                await snap('upgrade-window');
                await win.closeButton.click();
                await sleep(1000);
                fact('closed', {dialog: await win.dialog.count(), row: await rowFacts(list, ids.test)});
                await P.pastModalCloseWindow(page);

                for (const [k, file] of [['block', pkg.block], ['other', pkg.other]]) {
                    await P.markNotices(page);
                    win = await list.openUpgrade(ids.test);
                    await win.chooseFile(file);
                    fact(`upgrade.${k}`, await save(win, freshNotices));
                    fact(`row.after.${k}`, await rowFacts(list, ids.test));
                    fact(`rows.${k}.listed`, await list.row(ids[k]).count());
                    await snap(`after-${k}`);
                }

                const v0 = coreRows(app);
                await P.markNotices(page);
                win = await list.openUpgrade(ids.test);
                await win.chooseFile(pkg.test101);
                fact('upgrade.newer', await save(win, freshNotices, ['version 1.0.0.0', 'version 1.0.1.0']));
                fact('row.after.newer', await rowFacts(list, ids.test));
                fact('stepFile', fs.existsSync(stepFile) ? fs.readFileSync(stepFile, 'utf8').split('\n').filter(Boolean) : null);
                fact('versions.after.newer', versions(app, names.test));
                fact('core.after.newer', {before: v0, after: coreRows(app)});
                await snap('after-newer');
                await website.reload();
                fact('row.after.newer.reload', await rowFacts(list, ids.test));

                let confirm = await list.openDelete(ids.test);
                fact('deleteWindow', {text: flat(await confirm.innerText(), 300), buttons: await confirm.getByRole('button').allInnerTexts()});
                await snap('delete-window');
                const sent = [];
                const onReq = (r) => { if (/delete-plugin/.test(r.url())) sent.push(r.url()); };
                page.on('request', onReq);
                await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
                await sleep(1000);
                page.off('request', onReq);
                fact('deleteCancel', {window: await list.deleteWindow.count(), sent, row: await rowFacts(list, ids.test)});
                await P.pastModalCloseWindow(page);
                await P.markNotices(page);
                confirm = await list.openDelete(ids.test);
                const del = await list.confirmDelete();
                fact('deleteOk', {status: del.status(), notices: await freshNotices(), row: await rowFacts(list, ids.test), folder: folderRelease(app, names.test)});
                await snap('after-delete');

                fact('table.beforeUpload', hasTable(app, `${names.table}_t`));
                await P.pastModalCloseWindow(page);
                await P.markNotices(page);
                win = await list.openUpload();
                await win.chooseFile(pkg.table);
                fact('table.upload', await save(win, freshNotices));
                fact('table.row', {inGeneric: await list.rowIn('Generic Plugins', ids.table).count(), row: await rowFacts(list, ids.table)});
                fact('table.afterUpload', hasTable(app, `${names.table}_t`));
                await snap('after-table-upload');
                await P.markNotices(page);
                await list.openDelete(ids.table);
                const delt = await list.confirmDelete();
                fact('table.delete', {status: delt.status(), notices: await freshNotices(), row: await rowFacts(list, ids.table)});
                fact('table.afterDelete', hasTable(app, `${names.table}_t`));

                await site.goto();
                fact('site', {test: await rowFacts(site.list, ids.test), generic: (await site.list.outline()).find((c) => c.heading === 'Generic Plugins')?.names.length});
                await snap('site');
                await website.goto();
                fact('control', await rowFacts(list, ids.test));
                await snap('control');
            });
        } finally {
            record('s5', {scrubbed: scrub(app, all), gitPlugins: gitPlugins(app)}, {merge: true});
        }
    }
    // ------------------------------------------------------------ side effects, Rules 8, 9, 17
    if (PARTS.includes('side')) {
        const GA = 'googleanalyticsplugin';
        const dir = path.join(outDir(), `pkg-side-${RUN}-${app.name}`);
        fs.mkdirSync(dir, {recursive: true});
        const nover = PKG.buildNoVersion(dir, prod('u62i62nv'));
        await withBrowser('side', async ({page, website, list, fact, snap, freshNotices}) => {
            await website.goto();
            fact('ga.before', await rowFacts(list, GA));
            await P.markNotices(page);
            await list.tick(GA);
            fact('tick', {notices: await freshNotices(), row: await rowFacts(list, GA)});
            await snap('after-tick');
            await list.pressTicked(GA);
            await snap('disable-window');
            await P.markNotices(page);
            await list.confirmDisable(GA);
            fact('untick', {notices: await freshNotices(), row: await rowFacts(list, GA)});
            await snap('after-untick');
            await P.pastModalCloseWindow(page);
            await P.markNotices(page);
            const win = await list.openUpload();
            await win.chooseFile(nover);
            fact('refusedUpload', await save(win, freshNotices));
            await snap('after-refused-upload');
            fact('folders', PKG.pluginFolders(path.resolve(app.root), [prod('u62i62nv')]));
        });
    }
});
