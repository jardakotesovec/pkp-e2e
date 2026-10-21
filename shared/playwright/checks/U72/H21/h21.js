// U72 "Chapters & work type" claim check, chunk H21 (housekeeping 2026-10-21): two incidentals
// rows with one suspected mechanism, a legacy list redrawn in the page without the server.
//   Row U72: what a chapter with no authors shows under it ("No Items") after "Order" and
//            "Cancel ordering", on the workflow's Chapters page and in the wizard's Details list,
//            at once and after a reload (Rule 8a, register A12).
//   Row U21: on a preprint server, the Review step's "Files" panel after the galleys were
//            reordered on "Upload Files" ("Order", "Done"), at once and after a reload (U21 Rule 12,
//            OPS9; U72 A13's OPS reach).
// Runs on a DATASET fleet (PKP's default test dataset, press/server `publicknowledge`): never
// bootstrap, the dataset's own users. Modes (argument; one app per process):
//   workflow (OMP)  dbarnes, submission 3 "The Political Economy of Workplace Injury in Canada":
//                   "Add Chapter" EMPTY (no contributor), then four cases, each from a freshly
//                   opened page and each read after the drag, after the end of ordering and after
//                   a reload:
//                     noDrag     "Order", "Cancel ordering"
//                     emptyDrag  "Order", EMPTY dragged above the first chapter, "Cancel ordering"
//                     fullDrag   "Order", the chapter above EMPTY (it has an author) dragged above
//                                the first chapter, "Cancel ordering" (the control)
//                     emptyDone  "Order", EMPTY dragged above the first chapter, "Done"
//                   then EMPTY deleted again (the dataset book as it was, but for the saved order
//                   of the other chapters, which emptyDone leaves as it was).
//   wizard (OMP)    aclark: "New Submission", contributor Ben Barrow added, on "Details" the
//                   chapters "Tides" (Ben Barrow), "Deltas" (Ben Barrow), "Harbours" (none); the
//                   same four cases (EMPTY = "Harbours", the chapter above it = "Deltas"); the
//                   reload opens the wizard's first step, so "Continue" back to "Details".
//   galleys (OPS)   ccorino: "New Submission", on "Upload Files" "Add File" "PDF", then "Poster"
//                   (each a PDF as "Preprint Text"); "Review": "Files"; "Upload Files": "Order",
//                   "Poster" dragged above "PDF", "Done"; "Upload Files" read; "Review": "Files";
//                   reload, "Upload Files" read, "Review": "Files". Then a control "Order",
//                   "Cancel ordering" with no drag (the galley grid is a plain grid: no "No Items"
//                   line under a row to lose).
// Each read records `screen()` and the list top to bottom ("# chapter", author names,
// "(No Items)" per visible "No Items" line, with the chapter it belongs to and the one it stands
// under).
// Run (main, inside the app lock; 3.5 takes none):
//   bin/app-lock.sh shared omp -- env PROBE_FEATURE=issues-cc21a PKP_E2E_DATASET=6 PROBE_AGENT=cc21a PROBE_RUN=r1 \
//     node bin/probe.js omp shared/playwright/checks/U72/H21/h21.js workflow
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc21a-3_5 PKP_E2E_DATASET=6 PROBE_AGENT=cc21a PROBE_RUN=s1 \
//     node bin/probe.js omp shared/playwright/checks/U72/H21/h21.js wizard
// Outputs: .reports/<PROBE_FEATURE>/cc21a/ (h21-<mode>-facts-<run>-<app>.json, <mode>-*.json/png).
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, tag} = require('../../../probe');

const ROOT = path.resolve(__dirname, '../../../../..');
const MODE = ['workflow', 'wizard', 'galleys'].find((m) => process.argv.includes(m)) || 'workflow';
const RUN = process.env.PROBE_RUN || 'r0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SUB = 3;

async function snap(page, name) {
    let s;
    try {
        s = await screen(page);
    } catch (e) {
        s = {url: page.url(), screenError: String(e.message || e).slice(0, 200)};
    }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

/** The chapter list as drawn, with every visible "No Items" line placed (copied from the A12 walk). */
async function layout(list) {
    return list.grid().evaluate((root) => {
        const vis = (e) => !!(e && e.getClientRects().length);
        const text = (e) => ((e && e.innerText) || '').replace(/\s+/g, ' ').trim();
        const titleOf = (tb) => {
            const tr = tb && tb.querySelector(':scope > tr.gridRow');
            return tr ? text(tr.querySelector('td .gridCellContainer')) : null;
        };
        const lines = [];
        const noItems = [];
        const placeholders = [];
        let last = null;
        for (const tb of root.querySelectorAll('table > tbody')) {
            if (tb.classList.contains('ui-sortable-placeholder') || tb.classList.contains('ui-sortable-helper')) continue;
            if (tb.classList.contains('category_grid_body') && !tb.classList.contains('empty')) {
                const rows = [...tb.querySelectorAll(':scope > tr.gridRow')].filter(vis);
                rows.forEach((tr, i) => lines.push(i === 0 ? `# ${text(tr.querySelector('td .gridCellContainer'))}` : text(tr.querySelector('td .gridCellContainer'))));
                last = tb;
            } else if (tb.classList.contains('category_placeholder')) {
                const owner = document.getElementById(tb.id.replace(/-emptyPlaceholder$/, ''));
                placeholders.push({belongsTo: titleOf(owner), standsUnder: titleOf(last), visible: vis(tb), style: tb.getAttribute('style')});
                if (vis(tb)) {
                    lines.push('(No Items)');
                    noItems.push({belongsTo: titleOf(owner), standsUnder: titleOf(last), text: text(tb)});
                }
            }
        }
        return {lines, noItems, placeholders};
    });
}

/** Drag a chapter by its title cell above another chapter's block (the A12/A13 walks' drag). */
async function dragChapterAbove(list, title, aboveTitle) {
    const page = list.page;
    const cell = list.chapterRow(title).locator('td').first();
    const target = list.chapterBlock(aboveTitle);
    await cell.scrollIntoViewIfNeeded();
    const a = await cell.boundingBox();
    const b = await target.boundingBox();
    if (!a || !b) return {noBox: true};
    const x = a.x + Math.min(a.width / 2, 200);
    await page.mouse.move(x, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, a.y + a.height / 2 - 5, {steps: 5});
    await page.mouse.move(x, b.y + 3, {steps: 30});
    await sleep(400);
    await page.mouse.up();
    await idle(page);
    await sleep(600);
    return {ok: true};
}

async function done(list) {
    const page = list.page;
    const saved = page.waitForResponse((r) => /save-sequence/i.test(r.url()) && r.request().method() === 'POST', {timeout: 20_000}).catch(() => null);
    await list.doneLink().click();
    const r = await saved;
    await idle(page);
    await sleep(800);
    return {status: r ? r.status() : null, body: r ? ((await r.text().catch(() => '')) || '').slice(0, 200) : null, stillOrdering: await list.doneLink().count()};
}

async function cancel(list) {
    const page = list.page;
    let sent = 0;
    const onReq = (r) => {
        if (r.url().includes('$$$call$$$') || r.url().includes('/api/')) sent++;
    };
    page.on('request', onReq);
    await list.cancelOrderingLink().click();
    await idle(page);
    await sleep(800);
    page.off('request', onReq);
    return {stillOrdering: await list.doneLink().count(), requestsSent: sent};
}

/** Press "Order" with the list in the middle of the screen. */
async function startOrder(list) {
    await list.grid().evaluate((e) => e.scrollIntoView({block: 'center'})).catch(() => {});
    await sleep(200);
    await list.startOrdering();
    await sleep(500);
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('h21.js runs on a dataset fleet');
    if (MODE === 'galleys' ? app.name !== 'ops' : app.name !== 'omp') return;
    const line = app.line || 'main';
    const facts = {line, mode: MODE, run: RUN};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[h21 ${app.name} ${line} ${RUN}] ${k}: ${JSON.stringify(v && v.lines ? {lines: v.lines, noItems: v.noItems} : v).slice(0, 900)}`);
    };
    const step = async (k, fn) => {
        try {
            return await fn();
        } catch (e) {
            fact(`${k}.FAILED`, String(e.stack || e).slice(0, 900));
            await snap(page, `${MODE}-zz-failed-${k}`);
            return null;
        }
    };
    const {page, close} = await launch(app);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
    const omp = (file) => require(path.join(ROOT, 'apps/omp/playwright/pages', file));

    // ---- OMP chapter lists ------------------------------------------------------------------
    // `reopen()` gives a freshly drawn list (the workflow page opened again, or the wizard reloaded
    // and walked back to "Details"); `prefix` names the snapshots.
    const cases = async (prefix, reopen, emptyTitle, aboveEmpty) => {
        let list = await reopen('start');
        const order0 = (await layout(list)).lines.filter((l) => l.startsWith('# ')).map((l) => l.slice(2));
        const first = order0[0];
        fact(`${prefix}.start`, {order: order0, layout: await layout(list)});
        await snap(page, `${prefix}-start`);
        const plan = [
            {k: 'noDrag', drag: null, end: 'cancel'},
            {k: 'emptyDrag', drag: [emptyTitle, first], end: 'cancel'},
            {k: 'fullDrag', drag: [aboveEmpty, first], end: 'cancel'},
            {k: 'emptyDone', drag: [emptyTitle, first], end: 'done'},
        ];
        for (const c of plan) {
            const k = `${prefix}.${c.k}`;
            await step(k, async () => {
                await startOrder(list);
                fact(`${k}.ordering`, await layout(list));
                if (c.drag) {
                    fact(`${k}.drag`, await dragChapterAbove(list, c.drag[0], c.drag[1]));
                    fact(`${k}.afterDrag`, await layout(list));
                    await snap(page, `${prefix}-${c.k}-after-drag`);
                }
                fact(`${k}.end`, c.end === 'cancel' ? await cancel(list) : await done(list));
                fact(`${k}.afterEnd`, await layout(list));
                await snap(page, `${prefix}-${c.k}-after-${c.end}`);
                list = await reopen(c.k);
                fact(`${k}.afterReload`, await layout(list));
                await snap(page, `${prefix}-${c.k}-after-reload`);
            });
        }
        return list;
    };

    try {
        if (MODE === 'workflow') {
            const {WorkflowPage} = require(path.join(ROOT, 'shared/playwright/pages/WorkflowPage.js'));
            const {ChapterList} = omp('ChapterPages.js');
            const EMPTY = `Appendix ${tag('cc21a')}`;
            fact('emptyTitle', EMPTY);
            const open = async () => {
                const frame = new WorkflowPage(page, app.contextPath);
                if (line === 'stable-3_5_0') {
                    await frame.gotoEditorial(SUB, {menuKey: 'publication_chapters'});
                } else {
                    await frame.gotoEditorial(SUB);
                    await frame.selectPage('Chapters');
                }
                const list = new ChapterList(page);
                await list.expectLoaded();
                await idle(page);
                await sleep(500);
                return list;
            };
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            let list = await open();
            fact('before', await layout(list));
            const titles = (await layout(list)).lines.filter((l) => l.startsWith('# ')).map((l) => l.slice(2));
            const leftovers = titles.filter((t) => /^Appendix cc21a/.test(t));
            for (const t of leftovers) {
                await step(`cleanup-${t}`, async () => list.confirmDelete(await list.openDelete(t)));
            }
            await list.addChapter({title: EMPTY});
            await idle(page);
            await sleep(800);
            const added = await layout(list);
            fact('added', added);
            await snap(page, 'workflow-added');
            const ts = added.lines.filter((l) => l.startsWith('# ')).map((l) => l.slice(2));
            const aboveEmpty = ts[ts.indexOf(EMPTY) - 1];
            fact('aboveEmpty', aboveEmpty);
            list = await cases('workflow', async () => open(), EMPTY, aboveEmpty);
            await step('cleanup', async () => {
                list = await open();
                await list.confirmDelete(await list.openDelete(EMPTY));
                await sleep(600);
                fact('cleanup.after', await layout(list));
            });
        } else if (MODE === 'wizard') {
            const W = omp('SubmissionWizardPages.js');
            const {ChapterList} = omp('ChapterPages.js');
            const list = new ChapterList(page);
            const T = tag('cc21a');
            const currentStep = async () => ((await page.locator('.pkpSteps__step__label--current').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
            const continueUntil = async (label) => {
                const re = new RegExp(`${label}$`);
                for (let i = 0; i < 6 && !re.test(await currentStep()); i++) {
                    await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click();
                    await sleep(1200);
                    await idle(page);
                    await page.locator('.submissionWizard__loadingReview').waitFor({state: 'detached', timeout: 20_000}).catch(() => {});
                }
                if (!re.test(await currentStep())) throw new Error(`"Continue" did not reach ${label}: on ${await currentStep()}`);
            };
            const toStep = async (label) => {
                await W.gotoStep(page, label);
                await page.locator('.submissionWizard__loadingReview').waitFor({state: 'detached', timeout: 20_000}).catch(() => {});
                await idle(page);
                await sleep(600);
            };
            await signIn(page, 'aclark', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            await page.goto(app.url(`/index.php/${app.contextPath}/en/submission`));
            await idle(page);
            const english = page.getByRole('radio', {name: 'English', exact: true});
            if (await english.count()) await english.check();
            await W.fillStartTitle(page, `Chapters ${T}`);
            for (const re of [/meets all of these requirements/, /agree to have my data collected/]) {
                const box = page.getByRole('checkbox', {name: re});
                if (await box.count()) await box.check();
            }
            await page.getByRole('button', {name: 'Begin Submission'}).click();
            await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 30_000});
            await W.expectWizardOpen(page);
            await idle(page);
            fact('submissionId', Number(new URL(page.url()).searchParams.get('id')));
            fact('firstStep', await currentStep());
            await continueUntil('Contributors');
            // "Add Contributor" Ben Barrow with the Author role (the A13 walk's addContributor()).
            await page.getByRole('button', {name: 'Add Contributor'}).click();
            const modal = page.locator('[data-cy="active-modal"]').last();
            await modal.getByRole('textbox', {name: /^Given Name/}).first().fill('Ben');
            await modal.getByRole('textbox', {name: /^Family Name/}).first().fill('Barrow');
            await modal.getByRole('textbox', {name: /^Email/}).fill(`ben.barrow.${T}@mailinator.com`);
            await modal.getByRole('combobox', {name: /^Country/}).selectOption({label: 'Iceland'});
            const box = modal.getByRole('checkbox', {name: 'Author', exact: true});
            if (await box.count()) await box.check();
            else await modal.getByRole('radio', {name: 'Author', exact: true}).check();
            const saved = page.waitForResponse((r) => r.url().includes('/contributors') && r.request().method() === 'POST' && r.ok(), {timeout: 30_000});
            await modal.getByRole('button', {name: 'Save', exact: true}).click();
            await saved;
            await page.locator('.listPanel--contributor li.listPanel__item').filter({hasText: 'Ben'}).first().waitFor({timeout: 20_000});
            await idle(page);
            await continueUntil('Review');
            await toStep('Details');
            await list.expectLoaded();
            await list.addChapter({title: 'Tides', authors: ['Ben Barrow']});
            await sleep(600);
            await list.addChapter({title: 'Deltas', authors: ['Ben Barrow']});
            await sleep(600);
            await list.addChapter({title: 'Harbours'});
            await idle(page);
            await sleep(600);
            fact('added', await layout(list));
            await snap(page, 'wizard-added');
            await cases(
                'wizard',
                async (k) => {
                    if (k === 'start') return list;
                    await page.reload();
                    await idle(page);
                    await sleep(1000);
                    fact(`wizard.${k}.reloadOpenedOn`, await currentStep());
                    await continueUntil('Details');
                    await list.expectLoaded();
                    await idle(page);
                    await sleep(500);
                    return list;
                },
                'Harbours',
                'Deltas'
            );
        } else {
            const W = require(path.join(ROOT, 'apps/ops/playwright/pages/SubmissionWizardPages.js'));
            const T = tag('cc21a');
            const grid = page.locator('[id^="component-grid-preprintgalleys-preprintgalleygrid"]').first();
            const rows = async () => grid.locator('tbody:not(.empty) tr.gridRow').evaluateAll((trs) => trs.filter((tr) => tr.getClientRects().length).map((tr) => ((tr.querySelector('td') || {}).innerText || '').replace(/\s+/g, ' ').trim()));
            const filesPanel = async () => {
                const p = page.locator('.submissionWizard__reviewPanel').filter({has: page.locator('h3').filter({hasText: /^\s*Files\s*$/})}).first();
                return (await p.count()) ? (await p.innerText()).replace(/\s+/g, ' ').trim() : null;
            };
            const currentStep = async () => ((await page.locator('.pkpSteps__step__label--current').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
            const continueUntil = async (label) => {
                const re = new RegExp(`${label}$`);
                for (let i = 0; i < 6 && !re.test(await currentStep()); i++) {
                    await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click();
                    await sleep(1200);
                    await idle(page);
                    await page.locator('.submissionWizard__loadingReview').waitFor({state: 'detached', timeout: 20_000}).catch(() => {});
                }
                if (!re.test(await currentStep())) throw new Error(`"Continue" did not reach ${label}: on ${await currentStep()}`);
            };
            const toStep = async (label) => {
                await W.gotoStep(page, label);
                await page.locator('.submissionWizard__loadingReview').waitFor({state: 'detached', timeout: 20_000}).catch(() => {});
                await idle(page);
                await sleep(600);
            };
            const orderLink = () => grid.locator('a.pkp_linkaction_orderItems:visible');
            const doneLink = () => grid.locator('.order_finish_controls a.saveButton:visible');
            const cancelLink = () => grid.locator('.order_finish_controls a.cancelFormButton:visible');
            await signIn(page, 'ccorino', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            await page.goto(app.url(`/index.php/${app.contextPath}/en/submission`));
            await idle(page);
            await snap(page, 'galleys-start-form');
            const english = page.getByRole('radio', {name: 'English', exact: true});
            if (await english.count()) await english.check();
            await W.fillStartTitle(page, `Galleys ${T}`);
            for (const re of [/meets all of these requirements/, /agree to have my data collected/]) {
                const b = page.getByRole('checkbox', {name: re});
                if (await b.count()) await b.check();
            }
            await page.getByRole('button', {name: 'Begin Submission'}).click();
            await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 30_000});
            await W.expectWizardOpen(page);
            await idle(page);
            fact('submissionId', Number(new URL(page.url()).searchParams.get('id')));
            fact('firstStep', await currentStep());
            await continueUntil('Upload Files');
            await W.addGalleyFile(page, {label: 'PDF'});
            await sleep(800);
            await W.addGalleyFile(page, {label: 'Poster'});
            await idle(page);
            fact('upload.rows', await rows());
            await snap(page, 'galleys-upload-two');
            await continueUntil('Review');
            fact('review.before', await filesPanel());
            await snap(page, 'galleys-review-before');
            await toStep('Upload Files');
            await grid.evaluate((e) => e.scrollIntoView({block: 'center'}));
            fact('orderOffered', await orderLink().count());
            await step('reorder', async () => {
                await orderLink().click();
                await doneLink().waitFor({timeout: 20_000});
                await sleep(500);
                await snap(page, 'galleys-ordering');
                const from = grid.locator('tr.gridRow').filter({hasText: 'Poster'}).locator('td').first();
                const to = grid.locator('tr.gridRow').filter({hasText: 'PDF'}).first();
                const a = await from.boundingBox();
                const b = await to.boundingBox();
                const x = a.x + Math.min(a.width / 2, 150);
                await page.mouse.move(x, a.y + a.height / 2);
                await page.mouse.down();
                await page.mouse.move(x, a.y + a.height / 2 - 5, {steps: 5});
                await page.mouse.move(x, b.y + 2, {steps: 25});
                await sleep(300);
                await page.mouse.up();
                await idle(page);
                fact('reorder.afterDrag', await rows());
                const saved = page.waitForResponse((r) => /save-sequence/i.test(r.url()) && r.request().method() === 'POST', {timeout: 20_000}).catch(() => null);
                await doneLink().click();
                const r = await saved;
                await idle(page);
                await sleep(800);
                fact('reorder.done', {status: r ? r.status() : null, body: r ? ((await r.text().catch(() => '')) || '').slice(0, 400) : null});
                fact('reorder.uploadAfterDone', await rows());
                await snap(page, 'galleys-upload-after-done');
            });
            await toStep('Review');
            fact('review.afterDone', await filesPanel());
            await snap(page, 'galleys-review-after-done');
            await page.reload();
            await idle(page);
            await sleep(1000);
            fact('reload.openedOn', await currentStep());
            await continueUntil('Upload Files').catch(async () => toStep('Upload Files'));
            fact('reload.uploadRows', await rows());
            await snap(page, 'galleys-upload-after-reload');
            await continueUntil('Review');
            fact('review.afterReload', await filesPanel());
            await snap(page, 'galleys-review-after-reload');
            // Control: "Order", "Cancel ordering" with no drag, then a drag cancelled.
            await toStep('Upload Files');
            await step('cancelControl', async () => {
                await grid.evaluate((e) => e.scrollIntoView({block: 'center'}));
                await orderLink().click();
                await doneLink().waitFor({timeout: 20_000});
                await cancelLink().click();
                await idle(page);
                await sleep(600);
                fact('cancelControl.rows', await rows());
                await snap(page, 'galleys-cancel-control');
            });
        }
    } finally {
        fact('pageErrors', pageErrors);
        record(`h21-${MODE}-facts`, facts);
        await close();
    }
});
