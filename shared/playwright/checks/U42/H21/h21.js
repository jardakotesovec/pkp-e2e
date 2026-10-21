// Claim check cc21e, U42 chunk H21 (incidentals row, housekeeping 2026-10-21): where a web address in a
// reference links to when it holds an apostrophe ("…/kilo's-page") or stands in brackets ("(https://…/f8).").
// Runs on a DATASET fleet (PKP's default test dataset), main or stable-3_5_0; it changes the data, so reset
// the fleet before each run:
//
//   npm run fleet-prep -- --feature issues-cc21e --dataset 7 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc21e PKP_E2E_DATASET=7 PROBE_AGENT=cc21e PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U42/H21/h21.js        (then omp, ops)
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc21e-3_5 … PROBE_RUN=s1 node bin/probe.js all shared/playwright/checks/U42/H21/h21.js
//
// As dbarnes, on the dataset's published item (OJS article 17, OMP book 5, OPS preprint 2):
//   1 Unpublish (Unpost) on screen
//   2 Publication › "References": type REFS, "Add" (3.5: the "References" box, "Save"); the rows; again after a reload
//   3 main only: Settings › Workflow › "Metadata", lookup on; back on "References", "Reprocess all references" › OK;
//     jobs drained; the rows' links; "Edit citation" of Kilo and Lima (URL, DOI boxes), closed unsaved
//   4 Publish (Post) on screen
//   5 signed out: the landing page's "References" block, each link's href and text
// Facts go to facts-h21-<run>-<app>.json (merged, so a resumed run adds to it); no assertions. On main, H21_FROM=publish
// resumes a run that stopped after step 3 (steps 4 and 5 only).
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, drainJobs} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const REFS = [
    "Kilo, K. (2011). A link with an apostrophe. https://example.org/kilo's-page",
    'Lima, L. (2012). In brackets (https://doi.org/10.1234/f8).',
    'Alpha, A. (2020). A plain link. https://example.org/alpha',
];
const ITEM = {ojs: 17, omp: 5, ops: 2};
const wf = (page) => page.locator('[role="dialog"]:visible').first();
const controls = (page) => page.locator('[data-cy="workflow-controls-right"]');

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('h21.js runs on a dataset fleet only');
    const isOPS = app.name === 'ops';
    const main = !app.line || app.line === 'main';
    const sid = ITEM[app.name];
    const pid = Number(sql(app, `select max(publication_id) from publications where submission_id=${sid}`));
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, submission: sid, publication: pid};
    const fact = (k, v) => { facts[k] = v; console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`); };
    const ctx = app.contextPath;
    const u = (p) => app.url(`/index.php/${ctx}${p}`);
    const snap = async (page, name) => { record(name, await screen(page)); await shot(page, name).catch(() => {}); };
    const stored = () => sql(app, `select seq, raw_citation from citations where publication_id=${pid} order by seq`).split('\n').filter(Boolean);
    const storedSettings = () => sql(app, `select c.seq, cs.setting_name, cs.setting_value from citations c join citation_settings cs on cs.citation_id=c.citation_id where c.publication_id=${pid} and cs.setting_name in ('url','doi','arxiv','handle','urn') order by 1,2`).split('\n').filter(Boolean);

    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: ctx});

        // ---------------------------------------------------------------- main (3.6)
        if (main) {
            const openWf = async (key) => {
                await page.goto(u(`/dashboard/editorial?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`));
                await idle(page);
                await wf(page).waitFor({timeout: T}).catch(() => {});
                await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                await idle(page);
                await sleep(500);
            };
            const openRefs = async () => {
                await openWf(`publication_${pid}_titleAbstract`);
                const entry = wf(page).getByRole('link', {name: 'References', exact: true}).first();
                if (!(await entry.isVisible().catch(() => false))) {
                    const group = wf(page).getByRole('link', {name: /^(Publication|Preprint)$/}).first();
                    if (await group.count()) { await group.click(); await idle(page); }
                }
                await entry.click({timeout: T});
                await wf(page).getByRole('heading', {name: /^(Publication|Preprint): References$/}).first().waitFor({timeout: T}).catch(() => {});
                await idle(page);
                await sleep(500);
            };
            const table = () => page.locator('table[aria-label="Structured References"]:visible').first();
            const rows = async () => table().locator('tbody tr').evaluateAll((els) => els.map((e) => ({
                text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
                links: [...e.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), target: a.getAttribute('target')})),
            }))).catch((e) => ({error: e.message.slice(0, 200)}));

            if (process.env.H21_FROM !== "publish") { // H21_FROM=publish resumes a run stopped after step 3
            // 1 Unpublish
            await openWf(`publication_${pid}_titleAbstract`);
            await snap(page, '1-workflow-published');
            const label = isOPS ? 'Unpost' : 'Unpublish';
            await controls(page).getByRole('button', {name: label, exact: true}).click({timeout: T});
            const uw = page.getByRole('dialog').filter({hasText: /Are you sure you don't want this to be/}).last();
            await uw.waitFor({timeout: T});
            const ur = page.waitForResponse((r) => /\/unpublish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await uw.getByRole('button', {name: label, exact: true}).click();
            const urr = await ur;
            await sleep(1500); await idle(page);
            fact('1 unpublish', {status: urr ? urr.status() : null});

            // 2 References, lookup off as installed
            await openRefs();
            await snap(page, '2-references-empty');
            const box = wf(page).getByRole('textbox', {name: /^References/}).first();
            await box.fill(REFS.join('\n'));
            const added = page.waitForResponse((r) => /\/citations/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await wf(page).getByRole('button', {name: 'Add', exact: true}).click();
            const ar = await added;
            await table().locator('tbody tr').filter({hasText: 'Alpha, A.'}).first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await snap(page, '2-references-added');
            fact('2 add', {status: ar ? ar.status() : null, url: ar ? ar.url().replace(/^.*\/api\/v1\//, '') : null});
            fact('2 rows (same page)', await rows());
            await openRefs();
            await snap(page, '2-references-reload');
            fact('2 rows (after reload)', await rows());
            fact('2 stored raw_citation', stored());
            fact('2 stored identifiers', storedSettings());

            // 3 lookup on, reprocess
            await page.goto(u('/management/settings/workflow'));
            await idle(page);
            const tab = page.locator('#metadata-button');
            if (await tab.count()) { await tab.first().click(); await idle(page); }
            const lookup = page.getByRole('checkbox', {name: 'Enable references structuring and metadata lookup', exact: true});
            await lookup.waitFor({state: 'visible', timeout: T});
            const before = await lookup.isChecked();
            await lookup.check();
            const form = page.locator('form').filter({has: lookup});
            const sv = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const svr = await sv;
            await sleep(1000);
            await snap(page, '3-settings-lookup-on');
            fact('3 lookup switched on', {before, status: svr ? svr.status() : null});

            await openRefs();
            await snap(page, '3-references-lookup-on');
            await page.getByRole('button', {name: 'Reprocess all references', exact: true}).click({timeout: T});
            const ok = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'OK', exact: true})}).last();
            await ok.waitFor({timeout: T}).catch(() => {});
            const okText = flat(await ok.innerText().catch(() => null), 300);
            const rp = page.waitForResponse((r) => /citations/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await ok.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            const rpr = await rp;
            await idle(page);
            fact('3 reprocess', {window: okText, status: rpr ? rpr.status() : null, url: rpr ? rpr.url().replace(/^.*\/api\/v1\//, '') : null});
            await drainJobs(app).catch((e) => fact('3 drainJobs error', e.message.slice(0, 300)));
            await sleep(1000);
            fact('3 stored identifiers after the lookup', storedSettings());
            await openRefs();
            await snap(page, '3-references-reprocessed');
            fact('3 rows (lookup on, after reload)', await rows());
            const edit = {};
            for (const name of ['Kilo, K.', 'Lima, L.', 'Alpha, A.']) {
                const row = table().locator('tbody tr').filter({hasText: name}).first();
                try {
                    await row.getByRole('button', {name: 'More Actions'}).click({timeout: 10_000});
                    await page.getByRole('menuitem', {name: 'Edit', exact: true}).click({timeout: 5000});
                    const panel = page.getByRole('dialog', {name: 'Edit citation'});
                    await panel.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
                    await idle(page); await sleep(300);
                    const val = async (l) => panel.getByRole('textbox', {name: new RegExp(`^${l}`)}).first().inputValue().catch(() => null);
                    edit[name] = {raw: await val('Edit Raw Citation'), url: await val('URL'), doi: await val('DOI')};
                    await snap(page, `3-edit-${name[0].toLowerCase()}`);
                    await panel.getByRole('button', {name: 'Close', exact: true}).first().click();
                    await panel.waitFor({state: 'detached', timeout: 10_000}).catch(() => {});
                    await idle(page);
                } catch (e) { edit[name] = {error: e.message.slice(0, 200)}; }
            }
            fact('3 "Edit citation" boxes', edit);

            }
            // 4 Publish / Post
            await openWf(`publication_${pid}_titleAbstract`);
            const pub = {};
            if (isOPS) {
                const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
                const postControl = controls(page).getByRole('button', {name: 'Post', exact: true});
                await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
                if (!(await postControl.isVisible().catch(() => false)) && await stageAction.isVisible()) await stageAction.click();
                await postControl.click({timeout: T});
            } else {
                await controls(page).getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).click({timeout: T});
            }
            const panel = page.getByRole('dialog', {name: 'Review Publishing Details'});
            const confirmWin = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).last();
            if (app.name === 'ojs') {
                // the panel, or straight to the confirmation for a version whose panel was confirmed before;
                // the first press is sometimes swallowed (U49 fn-k): press once more when nothing opened
                if (!(await panel.or(confirmWin).first().waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false))) {
                    await controls(page).getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).click({timeout: T});
                }
                await panel.or(confirmWin).first().waitFor({state: 'visible', timeout: T});
                pub.panelShown = await panel.isVisible().catch(() => false);
            }
            if (app.name === 'ojs' && pub.panelShown) {
                await idle(page); await sleep(800);
                for (const [sel, v] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
                    const x = panel.locator(sel);
                    if (await x.isVisible().catch(() => false) && !(await x.inputValue().catch(() => ''))) await x.selectOption(v).catch(() => {});
                }
                pub.panel = flat(await panel.innerText().catch(() => ''), 500);
                await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
            }
            const win = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).last();
            await win.waitFor({timeout: T});
            await idle(page); await sleep(600);
            for (const [sel, v] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
                const x = win.locator(sel);
                if (await x.isVisible().catch(() => false) && !(await x.inputValue().catch(() => ''))) await x.selectOption(v).catch(() => {});
            }
            pub.window = flat(await win.innerText().catch(() => ''), 400);
            const pw = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/}).last().click();
            const pwr = await pw;
            pub.status = pwr ? pwr.status() : null;
            await controls(page).getByRole('button', {name: /^(Unpublish|Unpost|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await snap(page, '4-workflow-republished');
            pub.dbStatus = sql(app, `select status from publications where publication_id=${pid}`);
            fact('4 publish', pub);
        } else {
            // ------------------------------------------------------------ stable-3_5_0
            // 3.5 has the same workflow window over the dashboard, with one Publication menu (no version ids)
            const openWf35 = async () => {
                await page.goto(u(`/dashboard/editorial?workflowSubmissionId=${sid}&workflowMenuKey=publication_titleAbstract`));
                await idle(page);
                await wf(page).waitFor({timeout: T}).catch(() => {});
                await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                await idle(page); await sleep(800);
            };
            await openWf35();
            await snap(page, '1-workflow-published');
            const label = isOPS ? 'Unpost' : 'Unpublish';
            await page.getByRole('button', {name: label, exact: true}).first().click({timeout: T});
            const uw = page.getByRole('dialog').filter({hasText: /Are you sure you don't want this to be/}).last();
            await uw.waitFor({timeout: T});
            const ur = page.waitForResponse((r) => /\/unpublish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await uw.getByRole('button', {name: label, exact: true}).last().click();
            const urr = await ur;
            await sleep(1500); await idle(page);
            fact('1 unpublish', {status: urr ? urr.status() : null});

            const openRefs = async () => {
                await openWf35();
                await wf(page).getByRole('link', {name: 'References', exact: true}).first().click({timeout: T});
                await idle(page); await sleep(1000);
            };
            await openRefs();
            await snap(page, '2-references-empty');
            const box = wf(page).getByRole('textbox', {name: /^References/}).first();
            await box.fill(REFS.join('\n'));
            const sv = page.waitForResponse((r) => /\/publications\/\d+$/.test(r.url().split('?')[0]) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await wf(page).getByRole('button', {name: 'Save', exact: true}).last().click();
            const svr = await sv;
            await sleep(1000); await idle(page);
            await snap(page, '2-references-saved');
            fact('2 save', {status: svr ? svr.status() : null});
            await openRefs();
            await snap(page, '2-references-reload');
            fact('2 box after reload', await wf(page).getByRole('textbox', {name: /^References/}).first().inputValue().catch(() => null));
            fact('2 stored raw_citation', stored());

            // 4 Publish / Post
            await openWf35();
            const pub = {};
            await page.getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/}).first().click({timeout: T});
            const win = page.getByRole('dialog').last();
            await win.waitFor({timeout: T});
            await idle(page); await sleep(1500);
            pub.window = flat(await win.innerText().catch(() => ''), 500);
            await snap(page, '4-publish-window');
            const pw = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/}).last().click();
            const pwr = await pw;
            pub.status = pwr ? pwr.status() : null;
            await sleep(1500); await idle(page);
            await snap(page, '4-workflow-republished');
            pub.dbStatus = sql(app, `select status from publications where publication_id=${pid}`);
            fact('4 publish', pub);
        }

        // 5 the landing page, signed out
        await signOut(page);
        const landing = {ojs: `/article/view/${sid}`, omp: `/catalog/book/${sid}`, ops: `/preprint/view/${sid}`}[app.name];
        await page.goto(u(landing));
        await idle(page);
        await snap(page, '5-landing');
        const block = page.locator('.item.references').first();
        fact('5 landing "References"', await block.evaluate((el) => ({
            heading: el.querySelector('h2')?.innerText.trim(),
            paragraphs: [...el.querySelectorAll('.value p')].map((p) => ({
                text: p.innerText.trim(),
                links: [...p.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), resolved: a.href, target: a.getAttribute('target'), attrs: a.getAttributeNames()})),
            })),
            html: el.querySelector('.value').innerHTML.trim().slice(0, 2500),
        })).catch((e) => ({error: e.message.slice(0, 200)})));
        const raw = await page.request.get(page.url()).then((r) => r.text()).catch(() => '');
        fact('5 landing source (references paragraphs)', (raw.match(/<(section|div) class="item references">[\s\S]*?<\/(section|div)>\s*<\/(section|div)>/) || [''])[0].replace(/\s+/g, ' ').slice(0, 2500));
        // the Kilo link pressed: where the new tab goes
        const kilo = block.locator('a').filter({hasText: /kilo/}).first();
        if (await kilo.count()) {
            const popup = page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null);
            await kilo.click({timeout: 5000}).catch(() => {});
            const tabPage = await popup;
            if (tabPage) {
                await tabPage.waitForLoadState('commit', {timeout: 10_000}).catch(() => {});
                fact('5 Kilo link pressed: new tab address', tabPage.url());
                await tabPage.close().catch(() => {});
            } else fact('5 Kilo link pressed: new tab address', null);
        }
    } finally {
        await close();
    }
    record('facts-h21', facts, {merge: true});
});
