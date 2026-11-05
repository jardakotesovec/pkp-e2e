// Kept walk of issue report docs/issues/U45-OJS13-datacite-file-subject-export-fails.md (spec U45 OJS13):
// on a DataCite journal, a work whose supplementary galley file has a "Subject" can be neither exported nor
// deposited. PKP's default test dataset (docs/process/dataset.md), OJS only (OMP and OPS ship no DataCite
// plugin). Mutates the dataset: reset the fleet before each run.
//
// WALK=steps (default)  the report's Steps 1-15 as `dbarnes` (and `admin` for "Failed Jobs"), on submission 17:
//                       DOIs Setup, the DataCite plugin, Registration; unpublish; a galley "Data" with component
//                       "Data Set" and a "Subject"; "Data" ordered first; publish; "Assign DOIs"; "Export DOIs";
//                       "Articles" unticked; "Deposit DOIs"; the DOIs page reloaded until the queue is empty;
//                       Administration › "Failed Jobs" and the new row's details; then the control: "Articles"
//                       ticked, unpublish, "Change File" with the "Subject" emptied, publish, "Export DOIs".
//                       After each export, read.php builds the same records server-side (validation off).
// WALK=nb               the neighbour the fix must leave alone: submission 1 (published, keywords "Professional
//                       Development" and "Social Transformation", galley "PDF"), after Steps 1-3: "Assign DOIs",
//                       "Export DOIs", and read.php's records (the work's and the PDF's subjects are the keywords).
//
// Run (feature and dataset from the fleet file; PROBE_RUN keeps each run's records apart):
//   npm run fleet-prep -- --feature issues-q05a --apps ojs --dataset 3 --reset
//   PROBE_FEATURE=issues-q05a PROBE_AGENT=q05a PROBE_RUN=main bin/app-lock.sh shared ojs -- \
//     node bin/probe.js ojs shared/playwright/checks/issues/datacite-file-subject-export-fails/walk.js
//   3.5: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-q05a-3_5 PROBE_RUN=r35 …, the same.
// No assertions: the script records, the report reads the records.
const path = require('path');
const {expect} = require('@playwright/test');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, sql, serverLog} = require('../../../probe');
const {T, sleep, flat, noticeRecorder, notices, stepper, openMenuPage, readRecords} = require('./lib');

const REPO = path.resolve(__dirname, '../../../../..');
const WALK = process.env.WALK || 'steps';
const SUBJECT = 'hkq05a dataset subject';

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`${app.name}: no DataCite plugin, nothing to walk`);
        return;
    }
    const is35 = app.line === 'stable-3_5_0';
    const SUB = WALK === 'nb' ? 1 : 17;
    const name = `walk-${WALK}`;
    const pub = Number(sql(app, `select current_publication_id from submissions where submission_id = ${SUB}`));
    const out = {app: app.name, line: app.line || 'main', walk: WALK, submission: SUB, publication: pub, steps: {}};
    const fx = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
    const fx2 = path.join(REPO, 'apps/ojs/playwright/fixtures/files/not-an-image.txt');
    const {DoiSettings, DoisPage} = require('../../../pages/DoisPages.js');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager, GALLEY_UPLOAD_TITLE} = require('../../../pages/GalleysPages.js');
    const {UploadWizard, WIZARD_STEPS} = require('../../../pages/SubmissionFilesPages.js');
    const {FailedJobDetailsPage} = require('../../../pages/AdminPages.js');
    const {page, close} = await launch(app);
    await noticeRecorder(page);
    const {step} = stepper(app, page, name, out);
    const pubStatus = () => sql(app, `select status from publications where publication_id = ${pub}`);
    const galleys = () => sql(app, `select g.label || '|seq:' || g.seq || '|genre:' || coalesce(sf.genre_id::text, '-') || '|doi:' || coalesce(d.doi, '-') || '|status:' || coalesce(d.status::text, '-') from publication_galleys g left join submission_files sf on sf.submission_file_id = g.submission_file_id left join dois d on d.doi_id = g.doi_id where g.publication_id = ${pub} order by g.seq, g.galley_id`).split('\n').filter(Boolean);
    const fileSubject = (fid) => sql(app, `select coalesce(string_agg(locale || '=' || setting_value, '; '), '(none)') from submission_file_settings where submission_file_id = ${fid} and setting_name = 'subject'`);
    const articleDoi = () => sql(app, `select coalesce(d.doi, '-') || '|status:' || coalesce(d.status::text, '-') from publications p left join dois d on d.doi_id = p.doi_id where p.publication_id = ${pub}`);
    const records = () => { try { return readRecords(app, SUB); } catch (e) { return {error: flat(e.message, 600)}; } };
    try {
        await signIn(page, 'dbarnes');
        const settings = new DoiSettings(page, app.contextPath);
        const dois = new DoisPage(page, app.contextPath);
        const frame = new WorkflowPage(page, app.contextPath);
        const g = new GalleyManager(page, frame);

        // 1-3: DOIs Setup, the DataCite plugin, Registration
        await step('1-setup', async () => {
            await settings.goto('Setup');
            await idle(page);
            const kinds = await settings.kinds();
            await settings.prefixBox().fill('10.1234');
            const galleyKind = kinds.find((k) => /galleys/i.test(k.label));
            if (galleyKind && !galleyKind.checked) await settings.kindBox(galleyKind.label).check();
            const r = await settings.pressSave(settings.setup);
            await idle(page);
            return {kinds, save: r.status(), after: await screen(page),
                stored: sql(app, `select string_agg(setting_name || '=' || setting_value, '; ') from journal_settings where setting_name in ('doiPrefix', 'enabledDoiTypes', 'enableDois')`)};
        });
        await step('2-plugin', async () => {
            await settings.gotoPlugins('dataciteplugin');
            const was = await settings.pluginBox('dataciteplugin').isChecked();
            if (!was) await settings.setPluginEnabled('dataciteplugin', true);
            return {was, now: await settings.pluginBox('dataciteplugin').isChecked()};
        });
        await step('3-registration', async () => {
            await settings.goto('Registration');
            await idle(page);
            await settings.chooseAgency('DataCite');
            await idle(page);
            await settings.field('username').fill('hkq05a.user');
            await settings.field('password').fill('hkq05a-pass');
            await settings.testingBox('Use the DataCite test system').check();
            await settings.field('testUsername').fill('hkq05a.test');
            await settings.field('testPassword').fill('hkq05a-testpass');
            await settings.field('testDOIPrefix').fill('10.5072');
            const r = await settings.pressSave(settings.registration);
            await idle(page);
            await shot(page, `${name}-registration`);
            return {save: r.status(), after: await screen(page),
                stored: sql(app, `select string_agg(setting_name || '=' || setting_value, '; ') from journal_settings where setting_name = 'registrationAgency'`)};
        });

        const openPublicationPage = async () => {
            if (!is35) {
                await page.goto(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${SUB}&workflowMenuKey=publication_${pub}_titleAbstract`);
                await idle(page);
            } else {
                await openMenuPage(page, frame, SUB, 'Title & Abstract');
            }
            await expect(page.getByRole('button', {name: /^(Unpublish|Publish|Schedule For Publication)$/}).first()).toBeVisible({timeout: T});
        };
        const unpublish = (id) => step(id, async () => {
            await openPublicationPage();
            await page.getByRole('button', {name: 'Unpublish', exact: true}).first().click();
            const dlg = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Unpublish', exact: true})}).last();
            await expect(dlg).toBeVisible({timeout: T});
            const question = flat(await dlg.innerText());
            const done = page.waitForResponse((r) => /\/unpublish/.test(r.url()), {timeout: T});
            await dlg.getByRole('button', {name: 'Unpublish', exact: true}).click();
            const r = await done;
            await idle(page);
            return {question, status: r.status(), publicationStatus: pubStatus()};
        });
        const publish = (id) => step(id, async () => {
            await openPublicationPage();
            const btn = page.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).first();
            const label = flat(await btn.innerText());
            await btn.click();
            await sleep(1500);
            await idle(page);
            const first = await screen(page);
            // main: the "Review Publishing Details" panel, then the confirmation window; 3.5: the window alone
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
            const window = flat(await dlg.innerText(), 500);
            const done = page.waitForResponse((r) => /\/publish(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
            await dlg.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).last().click();
            const r = await done;
            await idle(page);
            await sleep(1000);
            return {button: label, first: flat(first.text && (first.text.dialog || first.text.main), 500), window, status: r.status(), publicationStatus: pubStatus()};
        });
        const openGalleys = async () => {
            if (!is35) {
                await page.goto(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${SUB}&workflowMenuKey=publication_${pub}_galleys`);
                await frame.expectOpen(SUB);
            } else {
                await openMenuPage(page, frame, SUB, 'Galleys');
            }
            await g.expectLoaded();
            await idle(page);
        };
        const bulk = async (label) => {
            await dois.goto();
            await idle(page);
            await expect(dois.row(SUB)).toBeVisible({timeout: T});
            await dois.tick([SUB]);
            const dlg = await dois.chooseBulkAction(label);
            return {dlg, question: flat(await dlg.innerText())};
        };
        const assign = (id) => step(id, async () => {
            const {dlg, question} = await bulk('Assign DOIs');
            const acted = page.waitForResponse((r) => /\/api\/v1\/dois\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
            await dlg.getByRole('button', {name: 'Assign DOIs', exact: true}).click();
            const r = await acted;
            await sleep(2000);
            await idle(page);
            return {question, status: r.status(), body: flat(await r.text().catch(() => ''), 300), notices: await notices(page), galleys: galleys(), articleDoi: articleDoi()};
        });
        const exportDois = (id) => step(id, async () => {
            const {dlg, question} = await bulk('Export DOIs');
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
            await shot(page, `${name}-${id}`);
            return {question, status: r.status(), body, download: dl ? dl.suggestedFilename() : null,
                errorWindow: after.text ? after.text.dialog : null, notices: await notices(page),
                serverLogExport: serverLog(app).since(l0).filter((l) => !/schemaValidate|LibXMLError|XML validation failed|Filter output validation/.test(l)).slice(0, 8),
                galleys: galleys(), articleDoi: articleDoi(), records: records()};
        });
        const setKind = async (label, want) => {
            await settings.goto('Setup');
            await idle(page);
            const box = settings.kindBox(label);
            if ((await box.isChecked()) !== want) { if (want) await box.check(); else await box.uncheck(); }
            const r = await settings.pressSave(settings.setup);
            await idle(page);
            return {status: r.status(), stored: sql(app, `select setting_value from journal_settings where setting_name = 'enabledDoiTypes'`)};
        };

        if (WALK === 'nb') {
            await assign('nb-assign');
            await exportDois('nb-export');
            return;
        }

        // 4-7: a supplementary galley with a subject, ordered first, published again
        await unpublish('4-unpublish');
        await step('5-add-data-galley', async () => {
            await openGalleys();
            const win = await g.openCreate();
            await win.type(win.labelBox(), 'Data');
            await win.save();
            const wizard = new UploadWizard(page, GALLEY_UPLOAD_TITLE);
            await wizard.expectOpen();
            await wizard.chooseComponent('Data Set');
            await wizard.attach(fx, 'notes.md');
            await wizard.continueTo(WIZARD_STEPS[1]);
            const fields = await wizard.fieldLabels();
            const subj = wizard.reviewDetailsPanel().getByRole('textbox', {name: /^Subject/}).first();
            await loc(page, 'Galley upload wizard, "Review Details": "Subject" (English)', subj);
            await subj.fill(SUBJECT);
            await subj.blur();
            await shot(page, `${name}-wizard-review-details`);
            await wizard.continueTo(WIZARD_STEPS[2]);
            await wizard.complete();
            await idle(page);
            await sleep(1000);
            const fid = Number(sql(app, `select submission_file_id from publication_galleys where publication_id = ${pub} and label = 'Data'`));
            out.dataFile = fid;
            return {fields, galleys: galleys(), subjectStored: fileSubject(fid)};
        });
        await step('6-order-data-first', async () => {
            await openGalleys();
            await g.startOrdering();
            await g.arrange(['Data', 'PDF']);
            const r = await g.saveOrder();
            await idle(page);
            return {status: r.status(), labels: await g.labels(), galleys: galleys()};
        });
        await publish('7-publish');

        // 8-9: assign and export
        await assign('8-assign');
        await exportDois('9-export');

        // 10-13: deposit the galleys alone
        await step('10-untick-articles', () => setKind('Articles', false));
        await step('11-deposit', async () => {
            const {dlg, question} = await bulk('Deposit DOIs');
            const f0 = Number(sql(app, 'select coalesce(max(id), 0) from failed_jobs'));
            out.failedBefore = f0;
            const acted = page.waitForResponse((r) => /\/api\/v1\/dois\/submissions\/deposit/.test(r.url()), {timeout: T});
            await dlg.getByRole('button', {name: 'Deposit DOIs', exact: true}).click();
            const r = await acted;
            const body = flat(await r.text().catch(() => ''), 300);
            await sleep(1500);
            const ns = await notices(page);
            const queued = sql(app, `select substring(payload from 'displayName":"([^"]+)') from jobs order by id`).split('\n').filter(Boolean);
            // the dataset runs the queue on web requests (job_runner = On): reload until no deposit is queued
            let loads = 0;
            for (; loads < 30; loads++) {
                await sleep(4000);
                await dois.reload();
                if (loads >= 3 && Number(sql(app, "select count(*) from jobs where payload like '%Deposit%'") || 0) === 0) break;
            }
            return {question, status: r.status(), body, notices: ns, queuedAtOnce: queued, reloads: loads + 1,
                jobsLeft: sql(app, 'select count(*) from jobs'), galleys: galleys(), articleDoi: articleDoi()};
        });
        await step('12-row-after', async () => {
            await dois.reload();
            const row = dois.row(SUB);
            await expect(row).toBeVisible({timeout: T});
            const badge = flat(await dois.rowBadge(row).innerText().catch(() => null));
            await dois.expand(row, SUB).catch(() => {});
            await idle(page);
            await shot(page, `${name}-12-row-after`);
            return {badge, table: flat(await dois.expanded(row).locator('table').innerText().catch(() => null), 500),
                row: flat(await row.innerText().catch(() => null), 600), galleys: galleys(), articleDoi: articleDoi()};
        });
        await step('13-failed-jobs', async () => {
            const failed = sql(app, `select id || ' | ' || substring(payload from 'displayName":"([^"]+)') || ' | ' || split_part(exception, E'\\n', 1) from failed_jobs where id > ${out.failedBefore} order by id`).split('\n').filter(Boolean).map((l) => flat(l, 500));
            await signIn(page, 'admin');
            await page.goto(app.url('/index.php/index/admin/failedJobs'));
            await idle(page);
            await sleep(1000);
            const list = await screen(page);
            await shot(page, `${name}-13-failed-jobs`);
            const details = [];
            for (const line of failed) {
                const id = Number(line.split(' | ')[0]);
                const d = new FailedJobDetailsPage(page);
                await d.goto(id).catch(() => {});
                await idle(page);
                details.push({id, exception: flat(await d.attributeRow('Exception').innerText().catch(() => null), 500)});
                await shot(page, `${name}-13-failed-job-${id}`);
            }
            return {failedJobsDb: failed, list: flat(list.text && list.text.main, 1200), details};
        });

        // 14-15: the control, "Subject" emptied
        await signIn(page, 'dbarnes');
        await step('14a-retick-articles', () => setKind('Articles', true));
        await unpublish('14b-unpublish');
        await step('14c-clear-subject', async () => {
            await openGalleys();
            const wizard = await g.openChangeFile('Data');
            await wizard.attach(fx2, 'not-an-image.txt');
            await wizard.continueTo(WIZARD_STEPS[1]);
            const subj = wizard.reviewDetailsPanel().getByRole('textbox', {name: /^Subject/}).first();
            const shown = await subj.isVisible().catch(() => false);
            const value = shown ? await subj.inputValue() : null;
            if (shown) { await subj.fill(''); await subj.blur(); }
            await wizard.continueTo(WIZARD_STEPS[2]);
            await wizard.complete();
            await idle(page);
            await sleep(1000);
            return {subjectShown: shown, subjectValue: value, galleys: galleys(), subjectStored: fileSubject(out.dataFile)};
        });
        await publish('14d-publish');
        await exportDois('15-export-subject-emptied');
    } finally {
        record(name, out);
        await close();
    }
});
