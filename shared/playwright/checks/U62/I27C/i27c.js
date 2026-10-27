// U62 claim check, chunk I27C (housekeeping 2026-10-27): the incidental row on Rule 18, "an upgrade's
// own steps": which version a plugin's `upgrade.xml` `<upgrade minversion maxversion>` range is
// compared with when a row's "Upgrade" replaces the plugin.
//
// Parts (PART=, default `control,ui`), each run twice under its own PROBE_RUN (r1, r2 on main; s1, s2 on
// stable-3_5_0):
//   walk     the kept walk shared/playwright/checks/sync/pkp-lib-13608/walk.js for this app and line,
//            label cc27c-<PROBE_RUN> (it drives PluginHelper through its driver.php on the fleet's
//            <app>_test DB and restores it); its record .reports/sync/pkp-lib-13608/<line>-<app>-cc27c-<run>.json
//            is summarised into walk-<run>-<app>.json here.
//   control  the same helper path (the kept walk's driver.php, read only) with a scratch plugin of this
//            script's own, u62i27cd<run>, 1.0.0.0 then 1.0.1.0, whose upgrade.xml holds marker steps:
//            always; plugin-range-1.0.0.x (1.0.0.0–1.0.0.9); plugin-max-1.0.0.9 (maxversion alone);
//            core-min-3.0 (minversion 3.0.0.0 alone); core-bracket-3.x (3.0.0.0–3.99.99.99). Each marker
//            line names the installer's current version as the step saw it. Restores the DB rows and folder.
//   ui       OJS main only (other apps and lines skip it): as `admin`, a scratch journal's Settings ›
//            Website › "Plugins": "Upload A New Plugin" with u62i27cu<run> 1.0.0.0, the row's "Upgrade"
//            left once with a file chosen and unsaved ("Cancel"), then "Upgrade" with 1.0.1.0 (same
//            upgrade.xml as control) and "Save"; the page reloaded; the row's "Delete", "OK".
// The markers are written by the plugin's own step into an absolute path baked into the package (the
// kit's outFile('markers-<part>.jsonl')), since a web request carries no environment of ours.
//
//   bin/app-lock.sh shared ojs -- env PART=walk,control,ui PROBE_RUN=r1 PROBE_FEATURE=U62 PROBE_AGENT=cc27c node bin/probe.js ojs shared/playwright/checks/U62/I27C/i27c.js
//   (omp, ops: PART=walk,control; stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=U62-3_5 PROBE_RUN=s1 … ojs)
// Every part writes checkouts/<app>/plugins/generic/<product> and removes it; hold the app lock (shared)
// for the run. Outputs: .reports/<PROBE_FEATURE>/cc27c/{walk,control,ui}-<run>-<app>.json, screens ui-*.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync, spawnSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog, outDir, outFile} = require('../../../probe');
const PKG = require('../../../support/pluginPackages');
const {REPO_ROOT} = require('../../../../../bin/apps.js');

const PARTS = (process.env.PART || 'control,ui').split(',');
const RUN = process.env.PROBE_RUN || 'r0';
const KEPT = path.join(REPO_ROOT, 'shared/playwright/checks/sync/pkp-lib-13608');
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? t : String(t).replace(/\s+/g, ' ').trim().slice(0, n));
const log = (...a) => console.log('[i27c]', new Date().toISOString().slice(11, 19), ...a);

const STEPS = [
    ['always', null, null],
    ['plugin-range-1.0.0.x', '1.0.0.0', '1.0.0.9'],
    ['plugin-max-1.0.0.9', null, '1.0.0.9'],
    ['core-min-3.0', '3.0.0.0', null],
    ['core-bracket-3.x', '3.0.0.0', '3.99.99.99'],
];

/** upgrade.xml and the marker class of 1.0.1.0; the marker appends to `markerFile`. */
function upgradeFiles(product, markerFile) {
    const cls = `${product[0].toUpperCase()}${product.slice(1)}Marker`;
    const code = (name) => `<code file="plugins/generic/${product}/${cls}.php" class="${cls}" function="mark" step="${name}" />`;
    const body = STEPS.map(([name, min, max]) => (min || max
        ? `\t<upgrade${min ? ` minversion="${min}"` : ''}${max ? ` maxversion="${max}"` : ''}>\n\t\t${code(name)}\n\t</upgrade>`
        : `\t${code(name)}`)).join('\n');
    return {
        'upgrade.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE install SYSTEM "../../../lib/pkp/dtd/install.dtd">
<install version="1.0.1.0">
${body}
</install>
`,
        [`${cls}.php`]: `<?php
/** U62 I27C scratch step: records that it ran and the installer's versions as it saw them. */
class ${cls}
{
    public static function mark($installer, $attr)
    {
        file_put_contents(${JSON.stringify(markerFile)}, json_encode([
            'step' => $attr['step'] ?? null,
            'currentVersion' => $installer->getCurrentVersion() ? $installer->getCurrentVersion()->getVersionString(false) : null,
            'newVersion' => $installer->getNewVersion() ? $installer->getNewVersion()->getVersionString(false) : null,
            'sapi' => PHP_SAPI,
        ]) . "\\n", FILE_APPEND);
        return true;
    }
}
`,
    };
}

/** {v100, v101} packages of `product` in `dir`; 1.0.1.0 carries upgradeFiles(). */
function buildPackages(dir, product, displayName, markerFile) {
    fs.mkdirSync(dir, {recursive: true});
    const spec = (version) => ({product, version, displayName, description: `U62 I27C scratch plugin, version ${version}.`});
    const v100 = PKG.buildPlugin(dir, spec('1.0.0.0'));
    PKG.buildPlugin(dir, spec('1.0.1.0'));
    const src = path.join(dir, `src-${product}-1.0.1.0`);
    for (const [rel, body] of Object.entries(upgradeFiles(product, markerFile))) fs.writeFileSync(path.join(src, product, rel), body);
    const v101 = path.join(dir, `${product}-1.0.1.0.tar.gz`);
    execFileSync('tar', ['--format', 'ustar', '-czf', v101, '-C', src, product], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    return {v100, v101};
}

const readMarkers = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const versions = (app, product) => sql(app, `SELECT product_type||' '||product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product='${product}' ORDER BY date_installed, major, minor, revision, build`).split('\n').filter(Boolean);
const coreRows = (app) => sql(app, "SELECT product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product_type='core' ORDER BY date_installed").split('\n').filter(Boolean);
const folderRelease = (app, product) => {
    const f = path.join(path.resolve(app.root), 'plugins/generic', product, 'version.xml');
    if (!fs.existsSync(f)) return null;
    const m = fs.readFileSync(f, 'utf8').match(/<release>([^<]+)<\/release>/);
    return m ? m[1] : '?';
};
function scrub(app, product) {
    const removed = PKG.removePluginFolders(path.resolve(app.root), [product]);
    sql(app, `DELETE FROM versions WHERE product='${product}'`);
    sql(app, `DELETE FROM plugin_settings WHERE plugin_name='${product}plugin'`);
    return removed;
}
const gitPlugins = (app) => execFileSync('git', ['-C', path.resolve(app.root), 'status', '--short', '--', 'plugins'], {encoding: 'utf8'}).trim();

forEachApp(async (app) => {
    const line = app.line || 'main';
    const fact = (part, k, v) => {
        record(part, {[k]: v}, {merge: true});
        log(app.name, line, part, k, JSON.stringify(v).slice(0, 600));
    };

    // ------------------------------------------------------------ walk
    if (PARTS.includes('walk')) {
        const label = `cc27c-${RUN}`;
        const r = spawnSync('node', [path.join(KEPT, 'walk.js'), app.name, label], {cwd: REPO_ROOT, encoding: 'utf8', env: process.env, timeout: 900_000});
        fact('walk', 'exit', r.status);
        const f = path.join(REPO_ROOT, '.reports/sync/pkp-lib-13608', `${line}-${app.name}-${label}.json`);
        if (fs.existsSync(f)) {
            const w = JSON.parse(fs.readFileSync(f, 'utf8'));
            fact('walk', 'summary', {record: path.relative(REPO_ROOT, f), lib: w.lib, coreBefore: w.coreBefore, upgrade101: w.upgrade.upgrade101, markers: w.upgrade.markers, plugin: w.upgrade.plugin, coreAfter: w.upgrade.coreAfter, restored: w.restored});
        } else {
            fact('walk', 'missing', {stderr: flat(r.stderr, 1500)});
        }
        fact('walk', 'gitPlugins', gitPlugins(app));
    }

    // ------------------------------------------------------------ control
    if (PARTS.includes('control')) {
        const product = `u62i27cd${RUN}`.toLowerCase().replace(/[^a-z0-9]/g, '');
        const markers = outFile('markers-control.jsonl');
        fs.rmSync(markers, {force: true});
        const pkg = buildPackages(path.join(outDir(), `pkg-control-${RUN}-${app.name}`), product, 'U62 I27C Driver Plugin', markers);
        scrub(app, product);
        const driver = (...args) => {
            const r = spawnSync('php', [path.join(KEPT, 'driver.php'), ...args], {cwd: path.resolve(app.root), encoding: 'utf8', env: {...process.env, PKP_CONFIG_FILE: path.join(path.resolve(app.root), 'config.test.inc.php')}, timeout: 600_000});
            const last = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
            try { return JSON.parse(last); } catch { return {raw: flat(r.stdout, 600), stderr: flat(r.stderr, 600)}; }
        };
        try {
            fact('control', 'lib', execFileSync('git', ['-C', path.join(path.resolve(app.root), 'lib/pkp'), 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim());
            fact('control', 'coreBefore', coreRows(app));
            fact('control', 'install100', driver('install', pkg.v100));
            fact('control', 'versionsAfterInstall', versions(app, product));
            fact('control', 'upgrade101', driver('upgrade', product, pkg.v101));
            fact('control', 'versionsAfterUpgrade', versions(app, product));
            fact('control', 'folderAfterUpgrade', folderRelease(app, product));
            fact('control', 'markers', readMarkers(markers));
            fact('control', 'ran', Object.fromEntries(STEPS.map(([s]) => [s, readMarkers(markers).some((m) => m.step === s)])));
            fact('control', 'coreAfter', coreRows(app));
        } finally {
            fact('control', 'scrubbed', scrub(app, product));
            fact('control', 'gitPlugins', gitPlugins(app));
        }
    }

    // ------------------------------------------------------------ ui (OJS main)
    if (PARTS.includes('ui') && app.name === 'ojs' && line === 'main') {
        const P = require('../../../pages/PluginsPages.js');
        const product = `u62i27cu${RUN}`.toLowerCase().replace(/[^a-z0-9]/g, '');
        const {id: ROW} = PKG.pluginNames(product);
        const markers = outFile('markers-ui.jsonl');
        fs.rmSync(markers, {force: true});
        const pkg = buildPackages(path.join(outDir(), `pkg-ui-${RUN}-${app.name}`), product, 'U62 I27C Test Plugin', markers);
        scrub(app, product);
        const t = tag('u62i27c');
        const ctx = await app.api.createContext({tag: t, context: {name: `U62 I27C ${t}`, acronym: 'I27C'}});
        fact('ui', 'context', ctx);
        const contextPath = ctx.urlPath || ctx.path || ctx.contextPath || t;
        const {page, close} = await launch(app);
        const browserDialogs = [];
        page.on('dialog', (d) => { browserDialogs.push({type: d.type(), message: flat(d.message(), 300)}); });
        const snap = async (name) => { const s = await screen(page); record(`ui-${name}`, s); await shot(page, `ui-${name}`).catch(() => {}); return s; };
        const freshNotices = async (ms = 10_000) => {
            const sel = '.app__notifications .pkpNotification:not([data-seen])';
            const end = Date.now() + ms;
            while (Date.now() < end && !(await page.locator(sel).count())) await sleep(150);
            await sleep(300);
            return page.locator(sel).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').replace(/\s*×?\s*Close\s*$/, '').trim())).catch(() => []);
        };
        const rowFacts = async (list) => {
            const row = list.row(ROW);
            if (!(await row.count())) return {present: false};
            return {present: true, ticked: await list.box(ROW).isChecked().catch(() => null), text: flat(await row.innerText().catch(() => null), 200)};
        };
        const log0 = serverLog(app);
        try {
            await signIn(page, 'admin');
            const w = new P.WebsitePluginsPage(page, contextPath);
            await w.goto();
            await idle(page);
            await snap('01-plugins');
            const list = w.list;
            await loc(page, 'Installed Plugins: Upload A New Plugin', list.uploadLink);

            // Upload 1.0.0.0
            let from = log0.mark();
            await P.markNotices(page);
            let win = await list.openUpload();
            await snap('02-upload-window');
            await win.chooseFile(pkg.v100);
            let resp = await win.save();
            fact('ui', 'upload100', {status: resp.status(), answer: flat(await resp.text().catch(() => null), 300), notices: await freshNotices()});
            await win.dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
            await P.pastModalCloseWindow(page);
            await idle(page);
            fact('ui', 'row.afterUpload', await rowFacts(list));
            fact('ui', 'versions.afterUpload', versions(app, product));
            fact('ui', 'serverLog.upload', log0.since(from));
            await snap('03-after-upload');

            // Upgrade window left with a file chosen, unsaved ("Cancel")
            await P.markNotices(page);
            win = await list.openUpgrade(ROW);
            fact('ui', 'upgradeWindowText', flat(await win.formText().catch(() => null), 400));
            await snap('04-upgrade-window');
            await loc(page, 'Upgrade Plugin: Cancel', win.cancelLink);
            await win.chooseFile(pkg.v101);
            await snap('05-upgrade-window-file-chosen');
            await win.cancelLink.click();
            await sleep(2000);
            fact('ui', 'cancelUnsaved', {dialogOpen: await win.dialog.count(), browserDialogs: [...browserDialogs], notices: await freshNotices(3000), row: await rowFacts(list), versions: versions(app, product), folder: folderRelease(app, product), markers: readMarkers(markers)});
            await snap('06-after-cancel');
            await P.pastModalCloseWindow(page);

            // Upgrade 1.0.1.0, Save
            from = log0.mark();
            await P.markNotices(page);
            win = await list.openUpgrade(ROW);
            await win.chooseFile(pkg.v101);
            resp = await win.save();
            fact('ui', 'upgrade101', {status: resp.status(), answer: flat(await resp.text().catch(() => null), 300), notices: await freshNotices()});
            await win.dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
            await P.pastModalCloseWindow(page);
            await idle(page);
            fact('ui', 'row.afterUpgrade', await rowFacts(list));
            await sleep(3000);
            fact('ui', 'row.afterUpgrade3s', await rowFacts(list));
            fact('ui', 'versions.afterUpgrade', versions(app, product));
            fact('ui', 'folder.afterUpgrade', folderRelease(app, product));
            fact('ui', 'markers', readMarkers(markers));
            fact('ui', 'ran', Object.fromEntries(STEPS.map(([s]) => [s, readMarkers(markers).some((m) => m.step === s)])));
            fact('ui', 'coreAfter', coreRows(app));
            fact('ui', 'serverLog.upgrade', log0.since(from));
            await snap('07-after-upgrade');

            // reload
            await w.reload();
            await idle(page);
            fact('ui', 'row.afterReload', await rowFacts(list));
            await snap('08-reloaded');

            // Delete, OK (the cleanup, through the screen)
            from = log0.mark();
            await P.markNotices(page);
            await list.openDelete(ROW);
            await snap('09-delete-window');
            const del = await list.confirmDelete();
            fact('ui', 'delete', {status: del.status(), notices: await freshNotices(), row: await rowFacts(list), folder: folderRelease(app, product), versions: versions(app, product)});
            fact('ui', 'serverLog.delete', log0.since(from));
            await snap('10-after-delete');
            fact('ui', 'browserDialogs', browserDialogs);
            await signOut(page).catch(() => {});
        } catch (e) {
            fact('ui', 'error', flat(e.stack, 1200));
            await snap('err').catch(() => {});
        } finally {
            await close().catch(() => {});
            fact('ui', 'scrubbed', scrub(app, product));
            fact('ui', 'gitPlugins', gitPlugins(app));
        }
    }
});
