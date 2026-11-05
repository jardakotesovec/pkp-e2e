// Claim check I05A (housekeeping 2026-11-05, incidentals rows U45 and U46), on PKP's default test
// dataset (docs/process/dataset.md), journal/press/server `publicknowledge`. Mutates the dataset:
// reset the fleet before each run (fleet-prep --reset).
//
// PART=u45  OJS: the DataCite "Export DOIs" and "Deposit DOIs" of a supplementary file's galley DOI
//           whose file was given a "Subject" in the upload wizard (spec U45; the TypeError in
//           DataciteXmlFilter). As dbarnes (Journal editor): DOIs Setup (prefix, galley kind),
//           Plugins (DataCite Manager Plugin), Registration (DataCite, test system, fake credentials),
//           submission 17 unpublished, a galley "Data" with component "Data Set" and a Subject added,
//           ordered first, published again, "Assign DOIs", "Export DOIs"; then "Articles" unticked in
//           Setup (the deposit job takes the galley DOIs alone, "Data" first, so the dead outbound
//           connection of the article's record, U45 A18, does not end the job first), "Deposit DOIs"
//           (the queue drained, failed_jobs read), "Articles" ticked again. Control 1: the Subject
//           cleared through "Change File", export again. Control 2: a
//           keyword on the article's Metadata page, export again. OMP and OPS: the Plugins grid read only
//           (no DataCite plugin there).
// PART=u46  all apps: the galley's (OMP: publication format's) window tabs as the author and an editor
//           on a server whose "Publisher ID" settings were never saved (enablePublisherId unset, read
//           from the database), then the window's `identifiers` op and the file API's `identifiers` op
//           requested directly (no screen sends them in that state: the window shows no "Identifiers"
//           tab), as both; then Settings › Workflow › Submission › "Metadata" saved once with no
//           "Publisher ID" box ticked, and the same reads again. Screen notes go to U46.
//
// Runs (each after a fleet reset; outputs in .reports/issues-cc05a/cc05a/ and -3_5 for 3.5):
//   main: PART=u45 PROBE_RUN=r1 PROBE_FEATURE=issues-cc05a PKP_E2E_DATASET=1 PROBE_AGENT=cc05a PROBE_NOTES_FEATURE=U45 \
//           bin/app-lock.sh shared ojs -- node bin/probe.js ojs shared/playwright/checks/U45/I05A/i05a.js
//         PART=u46 PROBE_RUN=r1 … PROBE_NOTES_FEATURE=U46 … node bin/probe.js <ojs|omp|ops> …
//   3.5:  PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc05a-3_5 PROBE_RUN=s1 (s2) …, the same parts.
// Run twice per line (r1, r2; s1, s2). No other script; the server-side build of the same record is
// shared/playwright/checks/sync/pkp-lib-9170/xml-lang.php (scenario H). No assertions: the script
// records, the reader judges.
const fs = require('fs');
const path = require('path');
const {expect} = require('@playwright/test');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, sql, serverLog, drainJobs} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PART = process.env.PART || 'u46';
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const log = (...a) => console.log(...a);
const SUBJECT = 'u45i05a dataset subject';
const KEYWORD = 'u45i05a keyword';

// ------------------------------------------------------------------------------------------------
// shared bits

function traffic(page) {
    const seen = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/\$\$\$call\$\$\$|\/api\/v1\//.test(u)) return;
        const e = {at: new Date().toISOString(), method: r.request().method(), status: r.status(), url: u.replace(/^https?:\/\/[^/]+/, '')};
        if (/identifiers|\/dois\/|exportedFile|edit-galley|edit-format|registrationAgency|contexts\/\d+$/.test(u) || r.status() >= 400) {
            e.body = flat(await r.text().catch(() => ''), 600);
        }
        seen.push(e);
    });
    return {since: (n) => seen.slice(n), get n() { return seen.length; }, all: seen};
}

function noticeRecorder(page) {
    return page.context().addInitScript(() => {
        window.__seenNotices = [];
        const sweep = () => {
            document.querySelectorAll('.app__notifications .pkpNotification, .pkp_notification, [role="alert"]').forEach((e) => {
                const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
                if (t && !window.__seenNotices.includes(t)) window.__seenNotices.push(t);
            });
        };
        new MutationObserver(sweep).observe(document, {childList: true, subtree: true, characterData: true});
    });
}
const notices = (page) => page.evaluate(() => window.__seenNotices || []).catch(() => []);

async function stepper(app, page, name, out) {
    let cur = 'start';
    const errors = [];
    const dialogs = [];
    page.on('pageerror', (e) => errors.push({step: cur, kind: 'pageerror', text: flat(e.message)}));
    page.on('console', (m) => { if (m.type() === 'error') errors.push({step: cur, kind: 'console', text: flat(m.text())}); });
    page.on('dialog', async (d) => { dialogs.push({step: cur, type: d.type(), message: flat(d.message())}); await d.accept().catch(() => {}); });
    const tr = traffic(page);
    const slog = serverLog(app);
    const step = async (id, fn) => {
        cur = id;
        const e0 = errors.length, d0 = dialogs.length, t0 = tr.n, l0 = slog.mark();
        try {
            out.steps[id] = await fn();
        } catch (e) {
            out.steps[id] = {error: flat(e.message, 700)};
            log(`[${id} FAILED]`, flat(e.message, 300));
            await shot(page, `${name}-fail-${id}`).catch(() => {});
        }
        await sleep(800);
        out.steps[id] = {...out.steps[id], errors: errors.slice(e0), dialogs: dialogs.slice(d0),
            requests: tr.since(t0).filter((r) => r.method !== 'GET' || /identifiers|dois|edit-galley|edit-format|exportedFile/.test(r.url) || r.status >= 400),
            serverLog: slog.since(l0).slice(0, 12), pageNotices: await notices(page)};
        await page.evaluate(() => { window.__seenNotices = []; }).catch(() => {});
        record(name, out);
        return out.steps[id];
    };
    return {step, traffic: tr};
}

/** A side-menu page of the workflow ("Galleys", "Publication Formats", "Title & Abstract", "Metadata"). */
async function openMenuPage(app, page, frame, sub, label, {author = false} = {}) {
    await page.goto('about:blank');
    if (author) await frame.gotoAuthor(sub); else await frame.gotoEditorial(sub);
    await idle(page);
    const link = frame.menuLink(label);
    if (!(await link.last().isVisible().catch(() => false))) {
        if (app.line !== 'stable-3_5_0' && (await frame.latestVersionNode().isVisible().catch(() => false))) {
            // main: the current (published) version's node, not a newer one
            const nodes = frame.versionNodes();
            await nodes.first().click();
        } else {
            await frame.publicationGroup().click();
        }
    }
    await expect(link.last()).toBeVisible({timeout: T});
    await link.last().click();
    await idle(page);
}

// ------------------------------------------------------------------------------------------------
// PART u46: the "Identifiers" op on a never-saved "Publisher ID" setting

const U46 = {
    ops: {sub: 1, editor: 'dbarnes', author: 'ccorino', label: 'PDF', page: 'Galleys'},
    ojs: {sub: 17, editor: 'dbarnes', author: 'vkarbasizaed', label: 'PDF', page: 'Galleys'},
    omp: {sub: 14, editor: 'dbarnes', author: 'mdawson', label: 'PDF', page: 'Publication Formats'},
};

async function partU46(app) {
    const plan = U46[app.name];
    const ct = {ojs: 'journal_settings', omp: 'press_settings', ops: 'server_settings'}[app.name];
    const setting = () => sql(app, `select coalesce((select setting_value from ${ct} where setting_name = 'enablePublisherId'), '(no row)')`);
    const pub = Number(sql(app, `select current_publication_id from submissions where submission_id = ${plan.sub}`));
    const rep = app.name === 'omp'
        ? Number(sql(app, `select publication_format_id from publication_formats where publication_id = ${pub} order by 1 limit 1`))
        : Number(sql(app, `select galley_id from publication_galleys where publication_id = ${pub} order by seq, galley_id limit 1`));
    const fileId = app.name === 'omp'
        ? Number(sql(app, `select submission_file_id from submission_files where assoc_type = 521 and assoc_id = ${rep} order by 1 limit 1`))
        : Number(sql(app, `select submission_file_id from publication_galleys where galley_id = ${rep}`));
    const out = {app: app.name, line: app.line || 'main', plan, publication: pub, representation: rep, file: fileId,
        settingAtStart: setting(), steps: {}};
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const labels = app.name === 'ops' ? {publicationGroup: 'Preprint'} : {};
    const name = `u46-${PART}`;

    for (const round of ['unsaved', 'saved-empty']) {
        if (round === 'saved-empty') {
            // Settings › Workflow › Submission › "Metadata": save with no "Publisher ID" box ticked
            const {page, close} = await launch(app);
            const {step} = await stepper(app, page, `u46-settings`, out);
            try {
                await signIn(page, plan.editor);
                await step('settings-metadata-save-empty', async () => {
                    await page.goto(`/index.php/${app.contextPath}/en/management/settings/workflow#submission/metadata`);
                    await idle(page);
                    const group = page.getByRole('group', {name: 'Publisher ID', exact: true});
                    await expect(group).toBeVisible({timeout: T});
                    const s = await screen(page);
                    await shot(page, `u46-metadata-settings`);
                    await loc(page, 'Settings › Workflow › Metadata: the "Publisher ID" group', group);
                    const boxes = await group.locator('input[type="checkbox"]').evaluateAll((bs) => bs.map((b) => ({label: (b.closest('label') || b.parentElement).innerText.trim(), checked: b.checked})));
                    const form = group.locator('xpath=ancestor::form[1]');
                    const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
                    await form.getByRole('button', {name: 'Save', exact: true}).click();
                    const resp = await saved;
                    const body = flat(await resp.text().catch(() => ''), 200);
                    await idle(page);
                    const after = await screen(page);
                    await page.reload();
                    await idle(page);
                    await expect(group).toBeVisible({timeout: T});
                    const boxesAfterReload = await group.locator('input[type="checkbox"]').evaluateAll((bs) => bs.map((b) => ({label: (b.closest('label') || b.parentElement).innerText.trim(), checked: b.checked})));
                    return {screen: s, boxes, save: {status: resp.status(), body}, after, boxesAfterReload, settingAfterSave: setting()};
                });
            } finally {
                await close();
            }
        }
        for (const who of [plan.author, plan.editor]) {
            const author = who === plan.author;
            const {page, close} = await launch(app);
            const {step, traffic: tr} = await stepper(app, page, name, out);
            const key = `${round}-${who}`;
            try {
                await signIn(page, who);
                const frame = new WorkflowPage(page, app.contextPath, {labels});
                let editUrl = null;
                await step(`${key}-page`, async () => {
                    await openMenuPage(app, page, frame, plan.sub, plan.page, {author});
                    const s = await screen(page);
                    await shot(page, `u46-${key}-page`);
                    return {screen: s, setting: setting()};
                });
                await step(`${key}-window`, async () => {
                    const t0 = tr.n;
                    const dlg = frame.dialog();
                    let opened = null;
                    if (app.name === 'omp') {
                        const row = dlg.locator('tr.gridRow').filter({hasText: plan.label}).first();
                        await expect(row).toBeVisible({timeout: T});
                        const extras = row.locator('a.show_extras');
                        if (await extras.count()) await extras.first().click();
                        const edit = dlg.locator('tr').getByRole('link', {name: 'Edit', exact: true}).first();
                        if (await edit.count()) { await edit.click(); opened = 'Edit'; }
                    } else {
                        const menu = dlg.locator('table').locator('tr').filter({hasText: plan.label}).getByRole('button', {name: 'More Actions'}).first();
                        if (await menu.count()) {
                            await menu.click();
                            await sleep(400);
                            const items = await page.getByRole('menuitem').allInnerTexts();
                            const pick = items.map((t) => t.trim()).find((t) => t === 'Edit') || items.map((t) => t.trim()).find((t) => t === 'View');
                            if (pick) { await page.getByRole('menuitem', {name: pick, exact: true}).click(); opened = pick; }
                            out.steps[`${key}-menuItems`] = items.map((t) => t.trim());
                        }
                    }
                    if (!opened) return {opened: null, screen: await screen(page)};
                    const win = page.getByRole('dialog').filter({has: page.locator('form, [id$="Tabs"]')}).last();
                    await expect(win.getByRole('tab').first()).toBeVisible({timeout: T});
                    await idle(page);
                    await sleep(800);
                    const s = await screen(page);
                    await shot(page, `u46-${key}-window`);
                    const tabs = (await win.getByRole('tab').allInnerTexts()).map((t) => t.trim());
                    await loc(page, `${plan.page}: the item's window tabs (${app.name})`, win.getByRole('tab'));
                    const reqs = tr.since(t0);
                    const editReq = reqs.find((r) => /edit-galley|edit-format/.test(r.url));
                    editUrl = editReq ? editReq.url : null;
                    const idReq = reqs.filter((r) => /identifiers/.test(r.url));
                    // leave by the header "Close"
                    await win.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                    await idle(page);
                    return {opened, tabs, editUrl, identifiersRequestsSent: idReq, screen: s};
                });
                await step(`${key}-direct`, async () => {
                    // the two ops, requested directly in this account's session (no screen sends them here)
                    const base = editUrl ? editUrl.split('$$$call$$$')[0] : `/index.php/${app.contextPath}/`;
                    // an account with no "Edit" (a journal's Author) gets the editor's window address
                    const gridPath = {ojs: 'article-galleys/article-galley-grid', ops: 'preprint-galleys/preprint-galley-grid', omp: 'catalog-entry/publication-format-grid'}[app.name];
                    const grid = editUrl ? editUrl.replace(/\/edit-(galley|format)\?/, '/identifiers?')
                        : `${base}$$$call$$$/grid/${gridPath}/identifiers?submissionId=${plan.sub}&publicationId=${pub}&representationId=${rep}`;
                    const file = `${base}$$$call$$$/api/file/manage-file-api/identifiers?submissionFileId=${fileId}&submissionId=${plan.sub}&stageId=5`;
                    const res = {};
                    for (const [k, url] of [['grid', grid], ['file', file]]) {
                        if (!url) { res[k] = {skipped: 'no edit request to model the address on'}; continue; }
                        const l0 = serverLog(app).mark();
                        const r = await page.evaluate(async (u) => {
                            const x = await fetch(u, {credentials: 'same-origin', headers: {'X-Requested-With': 'XMLHttpRequest'}});
                            const t = await x.text();
                            return {status: x.status, length: t.length, body: t.slice(0, 300)};
                        }, url);
                        await sleep(500);
                        res[k] = {url, ...r, serverLog: serverLog(app).since(l0).slice(0, 6)};
                    }
                    return res;
                });
            } finally {
                await close();
            }
        }
    }
    out.settingAtEnd = setting();
    record(name, out);
}

// ------------------------------------------------------------------------------------------------
// PART u45: DataCite export of a supplementary galley with a Subject (OJS)

async function partU45(app) {
    const name = 'u45';
    if (app.name !== 'ojs') {
        // read-only control: no DataCite plugin on a press or a preprint server
        const out = {app: app.name, line: app.line || 'main', steps: {}};
        const {page, close} = await launch(app);
        const {step} = await stepper(app, page, name, out);
        try {
            await signIn(page, 'dbarnes');
            await step('plugins', async () => {
                await page.goto(`/index.php/${app.contextPath}/en/management/settings/website#plugins`);
                await idle(page);
                await expect(page.locator('tr.gridRow[id$="-row-staticpagesplugin"], tr.gridRow[id$="-row-tinymceplugin"]').first()).toBeVisible({timeout: T});
                await idle(page);
                const rows = await page.locator('tr.gridRow[id*="-row-"]').evaluateAll((trs) => trs.map((t) => t.id.replace(/^.*-row-/, '')));
                await shot(page, 'u45-plugins');
                return {screen: await screen(page), dataciteRow: rows.filter((r) => /datacite/i.test(r)), crossrefRow: rows.filter((r) => /crossref/i.test(r)), rowCount: rows.length};
            });
        } finally {
            await close();
        }
        return;
    }
    const is35 = app.line === 'stable-3_5_0';
    const SUB = 17;
    const pub = Number(sql(app, `select current_publication_id from submissions where submission_id = ${SUB}`));
    const out = {app: app.name, line: app.line || 'main', submission: SUB, publication: pub, steps: {}};
    const fx = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
    const fx2 = path.join(REPO, 'apps/ojs/playwright/fixtures/files/not-an-image.txt');
    const {DoiSettings, DoisPage} = require('../../../pages/DoisPages.js');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager, GALLEY_UPLOAD_TITLE} = require('../../../pages/GalleysPages.js');
    const {UploadWizard, WIZARD_STEPS} = require('../../../pages/SubmissionFilesPages.js');
    const {page, close} = await launch(app);
    await noticeRecorder(page);
    const {step, traffic: tr} = await stepper(app, page, name, out);
    const pubStatus = () => sql(app, `select status from publications where publication_id = ${pub}`);
    const galleys = () => sql(app, `select g.galley_id || '|' || g.label || '|' || coalesce(g.submission_file_id::text, '-') || '|' || coalesce(sf.genre_id::text, '-') || '|doi:' || coalesce(d.doi, '-') || '|status:' || coalesce(d.status::text, '-') from publication_galleys g left join submission_files sf on sf.submission_file_id = g.submission_file_id left join dois d on d.doi_id = g.doi_id where g.publication_id = ${pub} order by g.seq, g.galley_id`).split('\n').filter(Boolean);
    const fileSubject = (fid) => sql(app, `select coalesce(string_agg(locale || '=' || setting_value, '; '), '(none)') from submission_file_settings where submission_file_id = ${fid} and setting_name = 'subject'`);
    const articleDoi = () => sql(app, `select coalesce(d.doi, '-') || '|status:' || coalesce(d.status::text, '-') from publications p left join dois d on d.doi_id = p.doi_id where p.publication_id = ${pub}`);
    try {
        await signIn(page, 'dbarnes');
        const settings = new DoiSettings(page, app.contextPath);
        const dois = new DoisPage(page, app.contextPath);
        const frame = new WorkflowPage(page, app.contextPath);
        const g = new GalleyManager(page, frame);

        await step('setup', async () => {
            await settings.goto('Setup');
            await idle(page);
            const before = await screen(page);
            const kinds = await settings.kinds();
            await settings.prefixBox().fill('10.1234');
            const galleyKind = kinds.find((k) => /galleys/i.test(k.label));
            if (galleyKind && !galleyKind.checked) await settings.kindBox(galleyKind.label).check();
            const r = await settings.pressSave(settings.setup);
            await idle(page);
            return {before, kinds, save: r.status(), after: await screen(page),
                stored: sql(app, `select string_agg(setting_name || '=' || setting_value, '; ') from journal_settings where setting_name in ('doiPrefix', 'enabledDoiTypes', 'enableDois', 'doiCreationTime')`)};
        });
        await step('plugin', async () => {
            await settings.gotoPlugins('dataciteplugin');
            const was = await settings.pluginBox('dataciteplugin').isChecked();
            if (!was) await settings.setPluginEnabled('dataciteplugin', true);
            await shot(page, 'u45-plugins');
            return {was, now: await settings.pluginBox('dataciteplugin').isChecked(), screen: await screen(page)};
        });
        await step('registration', async () => {
            await settings.goto('Registration');
            await idle(page);
            const before = await settings.agencyState();
            await settings.chooseAgency('DataCite');
            await idle(page);
            const block = await screen(page);
            await settings.field('username').fill('u45i05a.user');
            await settings.field('password').fill('u45i05a-pass');
            await settings.testingBox('Use the DataCite test system').check();
            await settings.field('testUsername').fill('u45i05a.test');
            await settings.field('testPassword').fill('u45i05a-testpass');
            await settings.field('testDOIPrefix').fill('10.5072');
            const r = await settings.pressSave(settings.registration);
            await idle(page);
            const after = await screen(page);
            await shot(page, 'u45-registration');
            // leave the tabbed screen once with something changed and unsaved
            await settings.field('username').fill('u45i05a.changed');
            await settings.openSideTab('Setup');
            await idle(page);
            const onSetup = await screen(page);
            await settings.openSideTab('Registration');
            const usernameBack = await settings.field('username').inputValue();
            await page.reload();
            await settings.openSideTab('Registration');
            await idle(page);
            const usernameReload = await settings.field('username').inputValue().catch(() => null);
            return {before, block, save: r.status(), after, leaveOnce: {onSetup, usernameBack, usernameReload},
                stored: sql(app, `select string_agg(setting_name || '=' || setting_value, '; ') from journal_settings where setting_name = 'registrationAgency'`)};
        });

        const openPublicationPage = async () => {
            if (!is35) {
                await page.goto(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${SUB}&workflowMenuKey=publication_${pub}_titleAbstract`);
                await idle(page);
            } else {
                await openMenuPage(app, page, frame, SUB, 'Title & Abstract');
            }
            await expect(page.getByRole('button', {name: /^(Unpublish|Publish|Schedule For Publication)$/}).first()).toBeVisible({timeout: T});
        };
        const unpublish = async (id) => step(id, async () => {
            await openPublicationPage();
            const s = await screen(page);
            await page.getByRole('button', {name: 'Unpublish', exact: true}).first().click();
            const dlg = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Unpublish', exact: true})}).last();
            await expect(dlg).toBeVisible({timeout: T});
            const question = flat(await dlg.innerText());
            const done = page.waitForResponse((r) => /\/unpublish/.test(r.url()), {timeout: T});
            await dlg.getByRole('button', {name: 'Unpublish', exact: true}).click();
            const r = await done;
            await idle(page);
            return {before: s, question, status: r.status(), publicationStatus: pubStatus(), after: await screen(page)};
        });
        const publish = async (id) => step(id, async () => {
            await openPublicationPage();
            const btn = page.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).first();
            const label = flat(await btn.innerText());
            await btn.click();
            await sleep(1500);
            await idle(page);
            const s1 = await screen(page);
            await shot(page, `u45-${id}-1`);
            // main: the "Review Publishing Details" panel; 3.5: a confirmation window
            const confirm = page.getByRole('button', {name: 'Confirm', exact: true});
            if (await confirm.isVisible().catch(() => false)) {
                const stage = page.locator('select[name="versionStage"]');
                if (await stage.isVisible().catch(() => false)) {
                    await stage.selectOption('VoR').catch(() => {});
                    await page.locator('select[name="versionIsMinor"]').selectOption('false').catch(() => {});
                }
                const back = page.getByRole('radio', {name: 'Assign To Current/Back Issue'});
                if (await back.isVisible().catch(() => false)) {
                    await sleep(1500);
                    if (!(await page.locator('input[name="assignment"]:checked').count())) await back.check();
                    const sel = page.locator('select[name="issueId"]');
                    if (await sel.isVisible().catch(() => false) && !(await sel.inputValue())) {
                        const opt = sel.locator('option').filter({hasText: /Vol\. 1 No\. 2/});
                        await sel.selectOption((await opt.first().getAttribute('value')) || '');
                    }
                }
                await confirm.click();
                await sleep(1000);
            }
            const dlg = page.getByRole('dialog').filter({has: page.getByRole('button', {name: /^(Publish|Schedule For Publication)$/})}).last();
            await expect(dlg).toBeVisible({timeout: T});
            const s2 = await screen(page);
            await shot(page, `u45-${id}-2`);
            const done = page.waitForResponse((r) => /\/publish(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
            await dlg.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).last().click();
            const r = await done;
            await idle(page);
            await sleep(1000);
            return {button: label, first: s1, confirmWindow: s2, status: r.status(), body: flat(await r.text().catch(() => ''), 300), publicationStatus: pubStatus()};
        });
        const openGalleys = async () => {
            if (!is35) {
                await page.goto(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${SUB}&workflowMenuKey=publication_${pub}_galleys`);
                await frame.expectOpen(SUB);
                await g.expectLoaded();
            } else {
                await openMenuPage(app, page, frame, SUB, 'Galleys');
                await g.expectLoaded();
            }
            await idle(page);
        };
        const exportDois = async (id) => step(id, async () => {
            await dois.goto();
            await idle(page);
            const row = dois.row(SUB);
            await expect(row).toBeVisible({timeout: T});
            await dois.expand(row, SUB).catch(() => {});
            await idle(page);
            const expanded = await screen(page);
            await dois.collapse(row, SUB).catch(() => {});
            await dois.tick([SUB]);
            const dlg = await dois.chooseBulkAction('Export DOIs');
            const question = flat(await dlg.innerText());
            const l0 = serverLog(app).mark();
            const acted = page.waitForResponse((r) => /\/api\/v1\/dois\/submissions\/export/.test(r.url()), {timeout: T});
            const download = page.waitForEvent('download', {timeout: 15_000}).catch(() => null);
            await dlg.getByRole('button', {name: 'Export DOIs', exact: true}).click();
            const r = await acted;
            const body = flat(await r.text().catch(() => ''), 500);
            const dl = await download;
            await sleep(2500);
            await idle(page);
            const after = await screen(page);
            await shot(page, `u45-${id}`);
            return {question, rowExpanded: expanded, status: r.status(), body, download: dl ? dl.suggestedFilename() : null,
                serverLogExport: serverLog(app).since(l0).filter((l) => !/schemaValidate|LibXMLError|XML validation failed|Filter output validation/.test(l)).slice(0, 8), after, notices: await notices(page), galleys: galleys(), articleDoi: articleDoi()};
        });

        await unpublish('unpublish-1');
        await step('add-data-galley', async () => {
            await openGalleys();
            const before = await screen(page);
            const win = await g.openCreate();
            await win.type(win.labelBox(), 'Data');
            await win.save();
            const wizard = new UploadWizard(page, GALLEY_UPLOAD_TITLE);
            await wizard.expectOpen();
            const components = await wizard.optionTexts(wizard.componentSelect());
            await wizard.chooseComponent('Data Set');
            await wizard.attach(fx, 'notes.md');
            await wizard.continueTo(WIZARD_STEPS[1]);
            const fields = await wizard.fieldLabels();
            const step2 = await screen(page);
            await shot(page, 'u45-wizard-step2');
            const subj = wizard.reviewDetailsPanel().getByRole('textbox', {name: /^Subject/}).first();
            await loc(page, 'Galley upload wizard step 2: "Subject" (Data Set component)', subj);
            await subj.fill(SUBJECT);
            await subj.blur();
            await wizard.continueTo(WIZARD_STEPS[2]);
            await wizard.complete();
            await idle(page);
            await sleep(1000);
            const fid = Number(sql(app, `select submission_file_id from publication_galleys where publication_id = ${pub} and label = 'Data'`));
            out.dataFile = fid;
            return {before, components, fields, step2, after: await screen(page), galleys: galleys(), subjectStored: fileSubject(fid)};
        });
        // "Data" first, so a deposit of the galley DOIs alone builds its record before any agency call
        await step('order-data-first', async () => {
            await openGalleys();
            await g.startOrdering();
            await g.arrange(['Data', 'PDF']);
            const r = await g.saveOrder();
            await idle(page);
            return {status: r.status(), labels: await g.labels(), galleys: galleys()};
        });
        await publish('publish-1');
        await step('assign-dois', async () => {
            await dois.goto();
            await idle(page);
            await dois.tick([SUB]);
            const dlg = await dois.chooseBulkAction('Assign DOIs');
            const question = flat(await dlg.innerText());
            const acted = page.waitForResponse((r) => /\/api\/v1\/dois\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
            await dlg.getByRole('button', {name: 'Assign DOIs', exact: true}).click();
            const r = await acted;
            await sleep(2000);
            await idle(page);
            return {question, status: r.status(), body: flat(await r.text().catch(() => ''), 300), after: await screen(page), notices: await notices(page), galleys: galleys(), articleDoi: articleDoi()};
        });
        await exportDois('export-with-subject');
        // the deposit sends every item of the work in one job, the article's record first; on the test
        // install the article's agency call fails to connect (U45 A18) before the galleys are built, so
        // "Articles" is unticked for the deposit (the job then takes the galley DOIs alone, "Data" first)
        const setKind = async (label, want) => {
            await settings.goto('Setup');
            await idle(page);
            const box = settings.kindBox(label);
            if ((await box.isChecked()) !== want) { if (want) await box.check(); else await box.uncheck(); }
            const r = await settings.pressSave(settings.setup);
            await idle(page);
            return {status: r.status(), stored: sql(app, `select setting_value from journal_settings where setting_name = 'enabledDoiTypes'`)};
        };
        await step('untick-articles', async () => setKind('Articles', false));
        await step('deposit-with-subject', async () => {
            await dois.goto();
            await idle(page);
            await dois.tick([SUB]);
            const dlg = await dois.chooseBulkAction('Deposit DOIs');
            const question = flat(await dlg.innerText());
            const f0 = Number(sql(app, 'select coalesce(max(id), 0) from failed_jobs'));
            const acted = page.waitForResponse((r) => /\/api\/v1\/dois\/submissions\/deposit/.test(r.url()), {timeout: T});
            await dlg.getByRole('button', {name: 'Deposit DOIs', exact: true}).click();
            const r = await acted;
            const body = flat(await r.text().catch(() => ''), 300);
            await sleep(2000);
            const ns = await notices(page);
            await drainJobs(app).catch((e) => log('[drainJobs]', flat(e.message, 200)));
            await sleep(1000);
            const failed = sql(app, `select id || ' | ' || left(regexp_replace(exception, '\\s+', ' ', 'g'), 260) from failed_jobs where id > ${f0} order by id`).split('\n').filter(Boolean);
            await dois.goto();
            await idle(page);
            const row = dois.row(SUB);
            await dois.expand(row, SUB).catch(() => {});
            await idle(page);
            const listAfter = await screen(page);
            await shot(page, 'u45-deposit-after');
            return {question, status: r.status(), body, notices: ns, failedJobs: failed, listAfter, galleys: galleys(), articleDoi: articleDoi()};
        });
        await step('retick-articles', async () => setKind('Articles', true));

        // Control 1: the Subject cleared through "Change File"
        await unpublish('unpublish-2');
        await step('clear-subject', async () => {
            await openGalleys();
            const wizard = await g.openChangeFile('Data');
            const step1 = await screen(page);
            await wizard.attach(fx2, 'not-an-image.txt');
            await wizard.continueTo(WIZARD_STEPS[1]);
            const fields = await wizard.fieldLabels();
            const subj = wizard.reviewDetailsPanel().getByRole('textbox', {name: /^Subject/}).first();
            const shown = await subj.isVisible().catch(() => false);
            const value = shown ? await subj.inputValue() : null;
            const step2 = await screen(page);
            await shot(page, 'u45-changefile-step2');
            if (shown) { await subj.fill(''); await subj.blur(); }
            await wizard.continueTo(WIZARD_STEPS[2]);
            await wizard.complete();
            await idle(page);
            await sleep(1000);
            return {step1, fields, subjectShown: shown, subjectValue: value, step2, galleys: galleys(), subjectStored: fileSubject(out.dataFile)};
        });
        await publish('publish-2');
        await exportDois('export-subject-cleared');

        // Control 2: an article-level keyword
        await unpublish('unpublish-3');
        await step('add-keyword', async () => {
            if (!is35) {
                await page.goto(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${SUB}&workflowMenuKey=publication_${pub}_metadata`);
                await idle(page);
            } else {
                await openMenuPage(app, page, frame, SUB, 'Metadata');
            }
            const box = page.locator('[id$="-keywords-control-en"]').first();
            await expect(box).toBeVisible({timeout: T});
            const before = await screen(page);
            await box.fill(KEYWORD);
            await box.press('Enter');
            await sleep(500);
            const saved = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
            await page.getByRole('button', {name: 'Save', exact: true}).last().click();
            const r = await saved;
            await idle(page);
            const after = await screen(page);
            return {before, status: r.status(), after, stored: flat(sql(app, `select coalesce(string_agg(cves.setting_value, '; '), '(none)') from controlled_vocabs cv join controlled_vocab_entries cve on cve.controlled_vocab_id = cv.controlled_vocab_id join controlled_vocab_entry_settings cves on cves.controlled_vocab_entry_id = cve.controlled_vocab_entry_id where cv.assoc_id = ${pub} and cv.symbolic = 'submissionKeyword'`))};
        });
        await publish('publish-3');
        await exportDois('export-keyword');
    } finally {
        record(name, out);
        await close();
    }
}

forEachApp(async (app) => {
    if (PART === 'u45') return partU45(app);
    if (PART === 'u46') return partU46(app);
    throw new Error(`PART=${PART}: u45 or u46`);
});
