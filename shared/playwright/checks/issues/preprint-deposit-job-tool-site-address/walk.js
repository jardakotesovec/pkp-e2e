// Issue report docs/issues/U45-OPS8-preprint-deposit-job-tool-site-address.md
// (U45 OPS8): a preprint server's Crossref deposit run by the job tool gives
// each preprint the site's address. Takes the report's Steps through the
// screens on a dataset fleet freshly reset to PKP's default test dataset.
// Preconditions the script sets as an administrator sets them:
// `[queues] job_runner` in config.inc.php (lib.js holdQueue/releaseQueue,
// written after each reset); `[proxy]` at a dead port is already the fleet's
// config; the Steps' terminal watcher on files_dir/temp (lib.js watchSent),
// which copies each deposit file before the plugin deletes it.
//   1-4  sign in as dbarnes; tick "Crossref Manager Plugin"; DOI prefix
//        10.1234; "Registration": Crossref, depositor name and email
//   5-9  job tool: "Assign DOIs" and "Deposit DOIs" on OPS 2 (OJS 17), run
//        `php lib/pkp/tools/jobs.php run`, read the sent <resource>, open it
//        without a session
//   10-12 default runner at the end of a server page (OPS only): job_runner
//        On, "Assign DOIs" and "Deposit DOIs" on OPS 5, read the sent file
//   13-17 default runner at the end of a site administration page: job_runner
//        Off, "Assign DOIs" and "Deposit DOIs" on OPS 6 (OJS 1), job_runner On,
//        type /index.php/index/admin, read the sent file
//   control "Export DOIs" on OPS 2 (OJS 17): the file the export builds
// The report's Steps number the same actions 1-9, 10-11 (server page) and
// 12-16 (site page); the facts keep the numbers above.
// NEIGHBOUR=1, a mode of its own (the fix trial's check that the fix reaches
// no further, OPS): steps 1-4, the "Export DOIs" control on OPS 2, then steps
// 10-12 on OPS 5; both files must keep the server's own address.
// READER=1, a mode of its own (OPS, read-only): what a signed-in reader
// (ccorino, Author and Reader) and the manager (dbarnes) see at the address the
// job tool's deposit sends, /index.php/index/preprint/view/2/version/2.
// OMP has no registration agency plugin: no surface, skipped.
// Reset first, then run (main):
//   npm run fleet-prep -- --feature issues-n23k --dataset 1 --reset
//   bin/app-lock.sh shared ojs,ops -- env PROBE_FEATURE=issues-n23k PROBE_AGENT=n23k node bin/probe.js all shared/playwright/checks/issues/preprint-deposit-job-tool-site-address/walk.js
// On 3.5: PKP_E2E_LINE=stable-3_5_0 in front of both, feature issues-n23k-3_5,
// and PROBE_RUN=r35 in front of the run.
const {forEachApp, launch, signIn, screen, record, idle, outFile, serverLog} = require('../../../probe');
const {flat, holdQueue, releaseQueue, runJobTool, tempDir, watchSent, readCrossrefFile, crossrefFiles} = require('./lib');
const path = require('path');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEIGHBOUR = !!process.env.NEIGHBOUR;
const READER = !!process.env.READER;
const ITEMS = {ojs: {tool: 17, site: 1, exp: 17}, ops: {tool: 2, server: 5, site: 6, exp: 2}};

forEachApp(async (app) => {
    if (app.name === 'omp') {
        console.log('[walk] omp: no Crossref plugin, no surface; skipped');
        return;
    }
    if (NEIGHBOUR && app.name !== 'ops') {
        console.log(`[walk] ${app.name}: the neighbour check is OPS's (the fix touches crossref-ops only); skipped`);
        return;
    }
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    if (READER) {
        if (app.name !== 'ops') return;
        const {page, close} = await launch(app);
        const out = {};
        try {
            for (const user of ['ccorino', 'dbarnes']) {
                await signIn(page, user, {contextPath: app.contextPath});
                const resp = await page.goto(app.url('/index.php/index/preprint/view/2/version/2'));
                await idle(page).catch(() => {});
                const s = await screen(page);
                record(`reader-${user}`, s);
                out[user] = {status: resp && resp.status(), landed: page.url(), title: await page.title(),
                    heading: flat(await page.locator('h1').first().innerText({timeout: 5000}).catch(() => null)),
                    main: flat(s.text && s.text.main, 400)};
                console.log(`[fact] ${app.name} reader ${user}: ${JSON.stringify(out[user])}`);
            }
        } finally {
            record('reader-facts', out);
            await close();
        }
        return;
    }
    const {DoiSettings, DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
    const {expect} = require('@playwright/test');
    const ctx = app.contextPath;
    const items = ITEMS[app.name];
    const pre = NEIGHBOUR ? 'nb' : 'walk';
    const facts = {app: app.name, line: app.line || 'main', neighbour: NEIGHBOUR, run: process.env.PROBE_RUN || null};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1500)}`);
    };
    const temp = tempDir(app);
    const watcher = watchSent(temp, outFile('sent.xml').replace(/\.xml$/, ''));
    const slog = serverLog(app);
    // the copy of the file a deposit of `id` sent (named `…-<objects>-<id>-<contextId>.xml`)
    const sentFor = async (id, wait = 20_000) => {
        const until = Date.now() + wait;
        for (;;) {
            const hit = watcher.list().filter((c) => new RegExp(`-${id}-\\d+\\.xml$`).test(c.file));
            if (hit.length || Date.now() > until) return hit;
            await sleep(500);
        }
    };

    fact('0 job_runner', holdQueue(app));
    const {page, close} = await launch(app);
    try {
        await recordNotices(page);
        const settings = new DoiSettings(page, ctx);
        const dois = new DoisPage(page, ctx);
        const assignAndDeposit = async (id) => {
            await dois.goto();
            await dois.row(id).waitFor({timeout: T});
            const a = await dois.runBulk('Assign DOIs', [id]);
            const d = await dois.runBulk('Deposit DOIs', [id]);
            await sleep(800);
            return {assign: a.status(), deposit: d.status(), badge: flat(await dois.rowBadge(dois.row(id)).innerText())};
        };
        const openWithoutSession = async (url, name) => {
            const anon = await page.context().browser().newContext();
            try {
                const p = await anon.newPage();
                const resp = await p.goto(url, {timeout: T}).catch((e) => ({error: e.message}));
                await idle(p).catch(() => {});
                const s = await screen(p);
                record(`${pre}-${name}`, s);
                return {asked: url, landed: p.url(), status: resp && resp.status ? resp.status() : resp, title: await p.title(),
                    heading: flat(await p.locator('h1').first().innerText({timeout: 5000}).catch(() => null))};
            } finally {
                await anon.close();
            }
        };

        // 1-4
        await signIn(page, 'dbarnes', {contextPath: ctx});
        await settings.gotoPlugins('crossrefplugin');
        await settings.setPluginEnabled('crossrefplugin', true);
        fact('2 plugin on', await settings.pluginBox('crossrefplugin').isChecked());
        await settings.goto('Setup');
        await settings.prefixBox().fill('10.1234');
        fact('3 setup save', {status: (await settings.save(settings.setup)).status()});
        await settings.goto('Registration');
        await settings.chooseAgency('Crossref');
        for (const [name, value] of Object.entries({depositorName: 'Public Knowledge Project', depositorEmail: 'dbarnes@mailinator.com'})) {
            await expect(settings.field(name)).toBeVisible({timeout: T});
            await settings.field(name).fill(value);
        }
        const r4 = await settings.save(settings.registration);
        fact('4 registration save', {status: r4.status(), agency: await settings.agencyState()});

        const exportControl = async () => {
            await dois.goto();
            await dois.row(items.exp).waitFor({timeout: T});
            if (NEIGHBOUR) await dois.runBulk('Assign DOIs', [items.exp]);
            const before = new Set(crossrefFiles(temp));
            await dois.tick([items.exp]);
            const dialog = await dois.chooseBulkAction('Export DOIs');
            const acted = page.waitForResponse((r) => /\/api\/v1\/dois\/.*export/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
            await dialog.getByRole('button', {name: 'Export DOIs', exact: true}).click();
            const resp = await acted;
            await sleep(1500);
            await idle(page).catch(() => {});
            const s = await screen(page);
            record(`${pre}-export`, s);
            const built = crossrefFiles(temp).filter((f) => !before.has(f));
            await dois.closeErrorDialog().catch(() => page.keyboard.press('Escape'));
            return {status: resp.status(), body: flat(await resp.text().catch(() => null), 300), dialog: flat(s.text && s.text.dialog, 400),
                built: built.map((f) => readCrossrefFile(path.join(temp, f)))};
        };

        if (!NEIGHBOUR) {
            // 5-6
            fact('5-6 job tool: assign, deposit', await assignAndDeposit(items.tool));
            record(`${pre}-6-after-deposit`, await screen(page));
            // 7
            const from = slog.mark();
            fact('7 job tool', runJobTool(app));
            // 8
            const sent = await sentFor(items.tool, 3000);
            fact('8 sent file (job tool)', sent);
            // 9
            const res = sent[0] && sent[0].resources[0];
            fact('9 open without a session', res ? await openWithoutSession(res, '9-resource') : 'no file copied');
            fact('7 server log', slog.since(from).map((l) => flat(l, 300)).slice(0, 10));
        }

        if (items.server) {
            // 10-12
            fact('10 job_runner', releaseQueue(app));
            fact('11 server page: assign, deposit', await assignAndDeposit(items.server));
            fact('12 sent file (end of a server page)', await sentFor(items.server));
        }

        if (!NEIGHBOUR) {
            // 13-17
            fact('13 job_runner', holdQueue(app));
            fact('14 site page: assign, deposit', await assignAndDeposit(items.site));
            await page.goto('about:blank');
            fact('15 job_runner', releaseQueue(app));
            const resp = await page.goto(app.url('/index.php/index/admin'));
            await idle(page).catch(() => {});
            const s16 = await screen(page);
            record(`${pre}-16-site-admin`, s16);
            fact('16 site administration address', {status: resp && resp.status(), landed: page.url(), title: await page.title()});
            fact('17 sent file (end of a site page)', await sentFor(items.site));
            await page.goto(app.url(`/index.php/${ctx}/dois`)).catch(() => {});
        }

        // control
        fact('control export DOIs', await exportControl());
    } finally {
        fact('copies', watcher.stop().map((c) => c.file));
        record(`${pre}-facts`, facts);
        await close();
    }
});
