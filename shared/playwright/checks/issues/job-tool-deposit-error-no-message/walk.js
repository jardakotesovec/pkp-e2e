// Issue report docs/issues/U45-A31-job-tool-deposit-error-no-message.md
// (U45 A31): a failed DOI deposit run by the command-line job tool reads
// "Error" with no message. Takes the report's Steps through the screens on a
// dataset fleet freshly reset to PKP's default test dataset. Preconditions
// the script sets as an administrator sets them in config.inc.php:
// `[queues] job_runner = Off` (lib.js holdQueue, written after each reset);
// `[proxy]` at a dead port is already the fleet's config.
//   1.   sign in as dbarnes
//   2.   Settings › Website › "Plugins": tick the agency's plugin
//   3.   DOIs › "Setup": "DOI Prefix" 10.1234, "Save"
//   4.   DOIs › "Registration": the agency and its fields, "Save"
//   5.   DOIs page: "Assign DOIs" on the item (OJS 17, OPS 2)
//   6.   "Deposit DOIs" on it
//   7.   run the job tool: `php lib/pkp/tools/jobs.php run` in the app root
//   8.   reload the DOIs page, expand the item
//   9.   the row's "View Error" (and the agency panel's, when offered)
//   10.  the filter "Has Error"
// WALK=crossref (default; OJS, where it is the control, and OPS) or
// WALK=datacite (OJS only).
// NEIGHBOUR=1, a mode of its own (the fix trial's check that the fix reaches
// no further): Crossref on both apps, a second published item (OJS 1, OPS 5)
// given a DOI in step 5 but not deposited; after the job tool it must still
// read "Unregistered" with no "View Error" and no stored message, and on OJS
// the journal's Crossref message (a plugin the fix leaves alone) still shows.
// RUNNER=site: step 7 instead leaves the journal's pages, turns `job_runner`
// back On (the default) and requests the site's Administration address
// (`/index.php/index/admin`, no context), at whose end the queue runs, outside
// the journal (the developer's question; walked on OJS Crossref).
// OMP has no registration agency plugin: no surface, skipped.
// Reset first, then run (main):
//   npm run fleet-prep -- --feature issues-n23a --dataset 1 --reset
//   bin/app-lock.sh shared ojs,ops -- env PROBE_FEATURE=issues-n23a PROBE_AGENT=n23a node bin/probe.js all shared/playwright/checks/issues/job-tool-deposit-error-no-message/walk.js
// On 3.5: PKP_E2E_LINE=stable-3_5_0 in front of both, feature issues-n23a-3_5,
// and PROBE_RUN=r35 in front of the run.
const {forEachApp, launch, signIn, screen, shot, record, idle, sql} = require('../../../probe');
const {flat, holdQueue, releaseQueue, runJobTool, queueFacts, storedDois, storedMessages} = require('./lib');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WALK = process.env.WALK || 'crossref';
const NEIGHBOUR = !!process.env.NEIGHBOUR;
const RUNNER = process.env.RUNNER || 'tool';

const ITEMS = {ojs: {walk: 17, neighbour: 1, type: 'Article'}, ops: {walk: 2, neighbour: 5, type: 'Preprint'}};
const AGENCY = {
    crossref: {plugin: 'crossrefplugin', label: 'Crossref', apps: ['ojs', 'ops'],
        fields: {depositorName: 'Public Knowledge Project', depositorEmail: 'dbarnes@mailinator.com'}},
    datacite: {plugin: 'dataciteplugin', label: 'DataCite', apps: ['ojs'], fields: {username: 'u45n23a'}},
};

forEachApp(async (app) => {
    const walk = NEIGHBOUR ? 'crossref' : WALK;
    const agency = AGENCY[walk];
    if (!agency.apps.includes(app.name)) {
        console.log(`[walk] ${app.name}: no ${agency.label} plugin, no surface; skipped`);
        return;
    }
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const {DoiSettings, DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
    const {expect} = require('@playwright/test');
    const ctx = app.contextPath;
    const {walk: id, neighbour: nid, type} = ITEMS[app.name];
    const pre = `${walk}${NEIGHBOUR ? '-nb' : ''}${RUNNER === 'site' ? '-site' : ''}`;
    const facts = {app: app.name, line: app.line || 'main', walk, neighbour: NEIGHBOUR, run: process.env.PROBE_RUN || null,
        runner: RUNNER === 'site' ? 'end of a site-level page (job_runner On after step 6)' : 'job tool: php lib/pkp/tools/jobs.php run (job_runner Off)'};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1500)}`);
    };

    fact('0 job_runner', holdQueue(app));
    const {page, close} = await launch(app);
    try {
        await recordNotices(page);
        // 1
        await signIn(page, 'dbarnes', {contextPath: ctx});
        const settings = new DoiSettings(page, ctx);
        const dois = new DoisPage(page, ctx);

        // 2
        await settings.gotoPlugins(agency.plugin);
        await settings.setPluginEnabled(agency.plugin, true);
        fact('2 plugin on', await settings.pluginBox(agency.plugin).isChecked());

        // 3
        await settings.goto('Setup');
        await settings.prefixBox().fill('10.1234');
        const r3 = await settings.save(settings.setup);
        fact('3 setup save', {status: r3.status()});

        // 4
        await settings.goto('Registration');
        await settings.chooseAgency(agency.label);
        for (const [name, value] of Object.entries(agency.fields)) {
            await expect(settings.field(name)).toBeVisible({timeout: T});
            await settings.field(name).fill(value);
        }
        const r4 = await settings.save(settings.registration);
        fact('4 registration save', {status: r4.status(), agency: await settings.agencyState()});

        // 5
        await dois.goto();
        const row = dois.row(id);
        const nrow = dois.row(nid);
        await row.waitFor({timeout: T});
        const assigned = await dois.runBulk('Assign DOIs', NEIGHBOUR ? [id, nid] : [id]);
        fact('5 assign', {status: assigned.status(), name: flat(await dois.rowLink(row).innerText()), badge: flat(await dois.rowBadge(row).innerText()),
            neighbourBadge: NEIGHBOUR ? flat(await dois.rowBadge(nrow).innerText()) : undefined});

        // 6
        const deposited = await dois.runBulk('Deposit DOIs', [id]);
        await sleep(800);
        record(`${pre}-6-after-deposit`, await screen(page));
        fact('6 deposit', {status: deposited.status(), badge: flat(await dois.rowBadge(row).innerText()),
            notices: await page.evaluate(() => window.__doiNotices || []), queue: queueFacts(sql, app), dois: storedDois(sql, app)});

        // 7
        if (RUNNER === 'site') {
            // the default runner, on a page outside the journal: job_runner back On, then
            // the site's own sign-in and Administration pages, at whose end the queue runs
            // the browser leaves the journal first, so no journal page runs the queue;
            // then one request for the site's Administration address, its redirect not followed
            await page.goto('about:blank');
            fact('7 job_runner', releaseQueue(app));
            const hits = [];
            for (let i = 0; i < 5 && queueFacts(sql, app).queued.some((q) => /Deposit/.test(q)); i++) {
                const r = await page.request.get(app.url('/index.php/index/admin'), {maxRedirects: 0, failOnStatusCode: false});
                hits.push({status: r.status(), location: r.headers().location || null});
                await sleep(3000);
            }
            fact('7 site page runner', {requests: hits, queue: queueFacts(sql, app), dois: storedDois(sql, app), messages: storedMessages(sql, app)});
            await signIn(page, 'dbarnes', {contextPath: ctx});
            await dois.goto();
        } else {
            fact('7 job tool', {...runJobTool(app), queue: queueFacts(sql, app), dois: storedDois(sql, app), messages: storedMessages(sql, app)});
        }

        // 8
        await dois.reload();
        await dois.expand(row, id);
        const s8 = await screen(page);
        record(`${pre}-8-expanded`, s8);
        await shot(page, `${pre}-8-expanded`).catch(() => {});
        const after = {
            badge: flat(await dois.rowBadge(row).innerText()),
            doiTable: flat(await dois.expanded(row).locator('table').first().innerText()),
            panelSentence: flat(await dois.agencySentence(row).innerText().catch(() => null)),
            panelButtons: (await dois.agencyButtons(row).allInnerTexts()).map((t) => flat(t)),
            rowViewError: await dois.rowViewError(row, type).count(),
            panelViewError: await dois.agencyViewError(row).count(),
        };
        if (NEIGHBOUR) {
            await dois.expand(nrow, nid);
            after.neighbour = {
                badge: flat(await dois.rowBadge(nrow).innerText()),
                panelButtons: (await dois.agencyButtons(nrow).allInnerTexts()).map((t) => flat(t)),
                rowViewError: await dois.rowViewError(nrow, type).count(),
            };
            await dois.collapse(nrow, nid);
        }
        fact('8 after the job tool', after);

        // 9
        const windows = {};
        for (const [where, button] of [['row', dois.rowViewError(row, type)], ['panel', dois.agencyViewError(row)]]) {
            if ((await button.count()) === 0) {
                windows[where] = 'no "View Error" offered';
                continue;
            }
            const win = await dois.openErrorMessage(button.first()).catch(() => null);
            if (!win) {
                windows[where] = 'no window opened';
                continue;
            }
            await idle(page);
            const s = await screen(page);
            record(`${pre}-9-view-error-${where}`, s);
            windows[where] = flat(s.text && s.text.dialog, 900);
            await dois.closeErrorMessage().catch(() => page.keyboard.press('Escape'));
        }
        fact('9 view error windows', windows);

        // 10
        await dois.collapse(row, id);
        await dois.pressFilter('Has Error');
        await sleep(500);
        fact('10 has error filter', {rows: await dois.rowNames(), empty: flat(await dois.emptyLine().innerText().catch(() => null))});
        record(`${pre}-10-has-error`, await screen(page));
    } finally {
        record(`${pre}-facts`, facts);
        await close();
    }
});
