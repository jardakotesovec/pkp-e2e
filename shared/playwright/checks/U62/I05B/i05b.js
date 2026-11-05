// U62 claim check, chunk I05B (housekeeping 2026-11-05): two incidental rows.
//
// Parts (PART=, default `install,api`), each run twice under its own PROBE_RUN (r1, r2 on main; s1, s2 on
// stable-3_5_0). Driven on dataset fleets (PKP's default dataset): put PROBE_FEATURE=<the fleet's feature>
// PKP_E2E_DATASET=<n> PROBE_NOTES_FEATURE=U62 in front; reset the fleet before and after.
//   install  (U62 row) as `admin` on a scratch journal/press/server's Settings › Website › "Plugins":
//            "Upload A New Plugin" with scratch packages of ./pkg.js (u62i05b<variant><run>), each with an
//            install migration that marks every call of its up() in outFile('markers-install.jsonl'):
//              gok    generic, migration succeeds (the control; installed first)
//              gfail  generic, migration creates its table then fails
//              gfilt  generic, fails the same way, with its own filter/filterConfig.xml
//              tfail  theme (the last plugin category on OJS and OPS), fails, no filter config  (OJS, OPS)
//              tfilt  theme, fails, with its own filter config                                    (OJS, OPS)
//            OMP and OPS run gok and gfail (OPS also the two themes). After each "Save": the notice, the save's
//            answer, the row (present, ticked), the `versions` row, the plugin's folder, its table, the server
//            log lines, and the markers each plugin's up() wrote during that install. Also the upload window
//            left once with a file chosen ("Cancel"); tfail is uploaded a second time after its failure (tfail.retry).
//            gok and gfail are then deleted on screen ("Delete", "OK");
//            everything else (folders, versions and plugin_settings rows, the plugins' tables) is scrubbed in
//            finally on the fleet's own DB, and `git status --short -- plugins` recorded. After the deletes gok is
//            uploaded again (gok.reinstall), then scrubbed with the rest.
//   api      (U29 row) OMP: `api/v1/publicationPeerReviews…` and `api/v1/peerReviews…` (paths of lib/pkp's
//            PeerReviewController) for published monographs 5 and 14, signed out and as `rvaca` (manager);
//            OJS: the same paths for published articles 1 and 17 (`peerReviews` is OJS's entry point). Each
//            address typed in the browser (page.goto): status, content type, body (first 300 characters) and
//            the server log lines of that request.
//
//   bin/app-lock.sh shared ojs -- env PART=install,api PROBE_RUN=r1 PROBE_FEATURE=issues-cc05b PKP_E2E_DATASET=2 PROBE_NOTES_FEATURE=U62 PROBE_AGENT=cc05b node bin/probe.js ojs shared/playwright/checks/U62/I05B/i05b.js
//   (omp, ops alike, one app per call; stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc05b-3_5 PROBE_RUN=s1 …)
// Outputs: .reports/<PROBE_FEATURE>/cc05b/{install,api}-<run>-<app>.json, screens inst-*, api-*.
// Every install writes checkouts[/<line>]/<app>/plugins/<category>/<product>: hold the app lock (shared) for the run.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog, outDir, outFile} = require('../../../probe');
const PKG = require('./pkg');

const PARTS = (process.env.PART || 'install,api').split(',');
const RUN = (process.env.PROBE_RUN || 'r0').toLowerCase().replace(/[^a-z0-9]/g, '');
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? t : String(t).replace(/\s+/g, ' ').trim().slice(0, n));
const log = (...a) => console.log('[i05b]', new Date().toISOString().slice(11, 19), ...a);

const VARIANTS = {
    gok: {kind: 'generic', fail: false, filter: false, displayName: 'U62 I05B Good Plugin'},
    gfail: {kind: 'generic', fail: true, filter: false, displayName: 'U62 I05B Failing Plugin'},
    gfilt: {kind: 'generic', fail: true, filter: true, displayName: 'U62 I05B Failing Filter Plugin'},
    tfail: {kind: 'theme', fail: true, filter: false, displayName: 'U62 I05B Failing Theme'},
    tfilt: {kind: 'theme', fail: true, filter: true, displayName: 'U62 I05B Failing Filter Theme'},
};
const PLAN = {ojs: ['gok', 'gfail', 'gfilt', 'tfail', 'tfilt'], omp: ['gok', 'gfail'], ops: ['gok', 'gfail', 'tfail', 'tfilt']};

const versions = (app, product) => sql(app, `SELECT product_type||' '||product||' '||major||'.'||minor||'.'||revision||'.'||build||' current='||current FROM versions WHERE product='${product}' ORDER BY date_installed`).split('\n').filter(Boolean);
const tableThere = (app, table) => sql(app, `SELECT coalesce(to_regclass('${table}')::text, '(none)')`).trim();
const gitPlugins = (app) => execFileSync('git', ['-C', path.resolve(app.root), 'status', '--short', '--', 'plugins'], {encoding: 'utf8'}).trim();
const readMarkers = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

forEachApp(async (app) => {
    const line = app.line || 'main';
    const fact = (part, k, v) => {
        record(part, {[k]: v}, {merge: true});
        log(app.name, line, part, k, JSON.stringify(v).slice(0, 700));
    };

    // ------------------------------------------------------------ install (U62 row)
    if (PARTS.includes('install')) {
        const P = require('../../../pages/PluginsPages.js');
        const plan = PLAN[app.name];
        const markers = outFile('markers-install.jsonl');
        fs.rmSync(markers, {force: true});
        const pkgDir = path.join(outDir(), `pkg-${RUN}-${app.name}`);
        fs.mkdirSync(pkgDir, {recursive: true});
        const items = plan.map((v) => {
            const product = `u62i05b${v}${RUN}`;
            const spec = {...VARIANTS[v], product, markerFile: markers};
            return {v, ...spec, ...PKG.names(product), file: PKG.build(pkgDir, spec)};
        });
        const scrub = () => items.map((it) => {
            const dir = PKG.folder(path.resolve(app.root), it.kind, it.product);
            if (dir) fs.rmSync(dir, {recursive: true, force: true});
            sql(app, `DELETE FROM versions WHERE product='${it.product}'`);
            sql(app, `DELETE FROM plugin_settings WHERE plugin_name='${it.id}'`);
            sql(app, `DROP TABLE IF EXISTS ${it.table}`);
            return {product: it.product, folderRemoved: !!dir};
        });
        scrub();
        fact('install', 'premise', {
            lib: execFileSync('git', ['-C', path.join(path.resolve(app.root), 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim(),
            staticPagesTable: tableThere(app, 'static_pages'),
            staticPagesVersion: versions(app, 'staticPages'),
            filterConfigFiles: execFileSync('sh', ['-c', `cd ${JSON.stringify(path.resolve(app.root))} && ls plugins/*/*/filter/filterConfig.xml lib/pkp/plugins/*/*/filter/filterConfig.xml 2>/dev/null`], {encoding: 'utf8'}).trim().split('\n'),
        });
        const t = tag('u62i05b');
        const ctx = await app.api.createContext({tag: t, context: {name: `U62 I05B ${t}`, acronym: 'I05B'}});
        const contextPath = ctx.urlPath || ctx.path || ctx.contextPath || t;
        fact('install', 'context', contextPath);
        const {page, close} = await launch(app);
        const browserDialogs = [];
        page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: flat(d.message(), 300)}); await d.accept().catch(() => {}); });
        const snap = async (name) => { const s = await screen(page); record(`inst-${name}`, s); await shot(page, `inst-${name}`).catch(() => {}); return s; };
        const freshNotices = async (ms = 10_000) => {
            const sel = '.app__notifications .pkpNotification:not([data-seen])';
            const end = Date.now() + ms;
            while (Date.now() < end && !(await page.locator(sel).count())) await sleep(150);
            await sleep(300);
            return page.locator(sel).evaluateAll((els) => els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').replace(/\s*×?\s*Close\s*$/, '').trim(), cls: e.className}))).catch(() => []);
        };
        const rowFacts = async (list, id) => {
            const row = list.row(id);
            if (!(await row.count())) return {present: false};
            const cat = {};
            for (const h of ['Generic Plugins', 'Theme Plugins']) cat[h] = await list.rowIn(h, id).count().catch(() => null);
            return {present: true, ticked: await list.box(id).isChecked().catch(() => null), text: flat(await row.innerText().catch(() => null), 200), cat};
        };
        const slog = serverLog(app, {match: /./});
        try {
            await signIn(page, 'admin');
            const w = new P.WebsitePluginsPage(page, contextPath);
            await w.goto();
            await idle(page);
            await snap('01-plugins');
            const list = w.list;
            await loc(page, 'Installed Plugins: Upload A New Plugin', list.uploadLink);

            // The upload window left once with a file chosen, unsaved ("Cancel")
            {
                await P.markNotices(page);
                const win = await list.openUpload();
                await snap('02-upload-window');
                await win.chooseFile(items[0].file);
                await snap('03-upload-file-chosen');
                await win.cancelLink.click();
                await sleep(2000);
                fact('install', 'cancelUnsaved', {dialogOpen: await win.dialog.count(), browserDialogs: [...browserDialogs], notices: await freshNotices(3000), row: await rowFacts(list, items[0].id), versions: versions(app, items[0].product), folder: !!PKG.folder(path.resolve(app.root), items[0].kind, items[0].product), markers: readMarkers(markers).length});
                await P.pastModalCloseWindow(page);
            }

            const uploadOne = async (it, key) => {
                const before = readMarkers(markers).length;
                const from = slog.mark();
                await P.markNotices(page);
                const win = await list.openUpload();
                await win.chooseFile(it.file);
                const resp = await win.save();
                const answer = flat(await resp.text().catch(() => null), 500);
                const notices = await freshNotices();
                await win.dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
                await P.pastModalCloseWindow(page);
                await idle(page);
                const marks = readMarkers(markers).slice(before).map((m) => ({product: m.product, what: m.what, message: m.message, cls: m.class}));
                fact('install', key, {
                    product: it.product, kind: it.kind, fail: it.fail, filter: it.filter,
                    status: resp.status(), answer, notices,
                    row: await rowFacts(list, it.id),
                    versions: versions(app, it.product),
                    folder: !!PKG.folder(path.resolve(app.root), it.kind, it.product),
                    table: tableThere(app, it.table),
                    markers: marks,
                    serverLog: slog.since(from).filter((l) => !/ \[200\]: (GET|POST) |Accepted$|Closing$/.test(l)).map((l) => flat(l, 400)).slice(0, 40),
                });
                await snap(`04-after-${key}`);
            };
            for (const it of items) {
                await uploadOne(it, it.v);
                // a failed install tried again with the same package (its first try's table is still there)
                if (it.v === 'tfail') await uploadOne(it, 'tfail.retry');
            }

            // reload: the rows as the list shows them afresh
            await w.reload();
            await idle(page);
            const afterReload = {};
            for (const it of items) afterReload[it.v] = await rowFacts(list, it.id);
            fact('install', 'rowsAfterReload', afterReload);
            await snap('05-reloaded');

            // the sweep: a failed-migration plugin's row links, then "Delete" "OK" on gok and gfail
            const gfail = items.find((i) => i.v === 'gfail');
            if (await list.row(gfail.id).count()) {
                await list.openArrow(gfail.id).catch(() => {});
                fact('install', 'gfailRowLinks', await list.rowLinks(gfail.id).allInnerTexts().catch(() => null));
                await snap('06-gfail-arrow');
                await list.closeArrow(gfail.id).catch(() => {});
            }
            for (const it of items.filter((i) => ['gok', 'gfail'].includes(i.v))) {
                if (!(await list.row(it.id).count())) continue;
                const from = slog.mark();
                await P.markNotices(page);
                await list.openDelete(it.id);
                const del = await list.confirmDelete();
                fact('install', `delete.${it.v}`, {status: del.status(), notices: await freshNotices(), row: await rowFacts(list, it.id), folder: !!PKG.folder(path.resolve(app.root), it.kind, it.product), versions: versions(app, it.product), table: tableThere(app, it.table), serverLog: slog.since(from).filter((l) => !/ \[200\]: (GET|POST) |Accepted$|Closing$/.test(l)).map((l) => flat(l, 300)).slice(0, 20)});
                await P.pastModalCloseWindow(page);
            }
            await snap('07-after-deletes');
            // the deleted control uploaded again (its version row and its table were left by "Delete")
            await uploadOne(items.find((i) => i.v === 'gok'), 'gok.reinstall');
            fact('install', 'browserDialogs', browserDialogs);
            await signOut(page).catch(() => {});
        } catch (e) {
            fact('install', 'error', flat(e.stack, 1500));
            await snap('err').catch(() => {});
        } finally {
            await close().catch(() => {});
            fact('install', 'allMarkers', readMarkers(markers).map((m) => `${m.product} ${m.what} ${m.uri ? m.uri.replace(/^.*\$\$\$call\$\$\$/, '…') : ''} ${m.message ? flat(m.message, 160) : ''}`));
            fact('install', 'scrubbed', scrub());
            fact('install', 'gitPlugins', gitPlugins(app));
        }
    }

    // ------------------------------------------------------------ api (U29 row)
    if (PARTS.includes('api') && ['omp', 'ojs'].includes(app.name)) {
        const subs = app.name === 'omp' ? [5, 14] : [1, 17];
        const base = app.url(`/index.php/${app.contextPath}/api/v1/`);
        const paths = [];
        for (const ep of ['publicationPeerReviews', 'peerReviews']) {
            paths.push(`${ep}`, `${ep}?submissionIds=${subs[0]}`, `${ep}/open/submissions?submissionIds=${subs.join(',')}`, `${ep}/open/submissions/summary?submissionIds=${subs[0]}`);
            for (const s of subs) paths.push(`${ep}/open/submissions/${s}`, `${ep}/open/submissions/${s}/summary`);
        }
        const {page, close} = await launch(app);
        const slog = serverLog(app, {match: /./});
        const drive = async (who) => {
            const out = [];
            for (const p of paths) {
                const from = slog.mark();
                let r = null;
                let err = null;
                try { r = await page.goto(base + p, {timeout: T}); } catch (e) { err = flat(e.message, 200); }
                await sleep(300);
                const body = r ? await r.text().catch(() => null) : null;
                const lines = slog.since(from).map((l) => flat(l, 500));
                out.push({who, path: p, status: r ? r.status() : null, type: r ? r.headers()['content-type'] || null : null, length: body == null ? null : body.length, body: flat(body, 300), err, log: lines.filter((l) => !/\[(200|30\d)\]:/.test(l) || /publicationPeerReviews|peerReviews/.test(l)).slice(0, 12)});
            }
            return out;
        };
        try {
            fact('api', 'signedOut', await drive('signed out'));
            await page.goto(base + paths[0]).catch(() => {});
            record('api-signedout-last', await screen(page));
            await signIn(page, 'rvaca');
            await page.goto(app.url(`/index.php/${app.contextPath}/dashboard`)).catch(() => {});
            await idle(page);
            fact('api', 'apiBaseUrl', await page.evaluate(() => (window.pkp && pkp.context ? pkp.context.apiBaseUrl : null)).catch(() => null));
            fact('api', 'manager', await drive('rvaca'));
            await signOut(page).catch(() => {});
        } catch (e) {
            fact('api', 'error', flat(e.stack, 1500));
        } finally {
            await close().catch(() => {});
        }
    }
});
