// Claim check H29 (spec U46, docs/specs/U46-galleys.md), housekeeping 2026-10-29 incidentals row 2:
// the workflow's "Galleys" page › "Add galley" › the "Create New Galley" window left without saving,
// and whether the page logs a script error on the way out (3.5's GalleyManager reads
// `closeData.dataChanged[0]` on a close that hands it nothing).
//
// Runs on a dataset fleet (PKP's default test dataset, docs/process/dataset.md) and saves nothing:
// each window is left by its header "Close" (unchanged; changed and the question answered "OK"; after
// a refused "Save") or by its "Cancel", then "Add galley" is pressed again and the page reloaded.
//   main:  PROBE_RUN=r1 PROBE_FEATURE=issues-cc29e PKP_E2E_DATASET=7 PROBE_AGENT=cc29e PROBE_NOTES_FEATURE=U46 \
//            node bin/probe.js <ojs|omp|ops> shared/playwright/checks/U46/H29/h29.js
//   3.5:   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=s1 PROBE_FEATURE=issues-cc29e-3_5 PKP_E2E_DATASET=7 PROBE_AGENT=cc29e …
// (run twice per line: PROBE_RUN r1, r2 on main; s1, s2 on stable-3_5_0). No other script, no PART.
// OJS: submission 5 (Production) as dbarnes (editor), dbuskins (section editor), gcox (layout editor).
// OPS: submission 1 (Production, not posted) as dbarnes (server manager), dbuskins (moderator, box ticked).
// OMP: no galleys; control on submission 4's "Publication Formats" › "Add publication format" as dbarnes.
// USERS=dbarnes narrows the accounts.
const {expect} = require('@playwright/test');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, sql} = require('../../../probe');

const PLAN = {
    ojs: {sub: 5, users: ['dbarnes', 'dbuskins', 'gcox']},
    ops: {sub: 1, users: ['dbarnes', 'dbuskins']},
    omp: {sub: 4, users: ['dbarnes']},
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    const plan = PLAN[app.name];
    const pub = Number(sql(app, `select current_publication_id from submissions where submission_id = ${plan.sub}`));
    const only = process.env.USERS ? process.env.USERS.split(',') : null;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager, GalleyWindow, GALLEYS_TEXT: TEXT} = require('../../../pages/GalleysPages.js');
    const labels = app.name === 'ops' ? {publicationGroup: 'Preprint'} : {};
    const storedGalleys = () => sql(app, app.name === 'omp'
        ? `select publication_format_id from publication_formats where publication_id = ${pub} order by 1`
        : `select galley_id || '|' || label from publication_galleys where publication_id = ${pub} order by seq, galley_id`).split('\n').filter(Boolean);

    for (const user of plan.users) {
        if (only && !only.includes(user)) continue;
        const out = {app: app.name, line: app.line || 'main', user, submission: plan.sub, publication: pub, steps: {}};
        const {page, close} = await launch(app);
        // our own listeners: errors and dialogs attributed to the step that raised them
        let cur = 'start';
        const errors = [];
        const dialogs = [];
        page.on('pageerror', (e) => errors.push({step: cur, kind: 'pageerror', text: flat(e.message)}));
        page.on('console', (m) => { if (m.type() === 'error') errors.push({step: cur, kind: 'console', text: flat(m.text())}); });
        page.on('dialog', async (d) => { dialogs.push({step: cur, type: d.type(), message: flat(d.message())}); await d.accept().catch(() => {}); });
        const step = async (name, fn) => {
            cur = name;
            const e0 = errors.length;
            const d0 = dialogs.length;
            try {
                out.steps[name] = await fn();
            } catch (e) {
                out.steps[name] = {error: flat(e.message, 500)};
                await shot(page, `h29-${user}-fail-${name}`).catch(() => {});
            }
            await sleep(1500); // a script error raised in the close's own callbacks
            out.steps[name] = {...out.steps[name], errors: errors.slice(e0), dialogs: dialogs.slice(d0)};
            record(`h29-${user}`, out);
        };
        try {
            await signIn(page, user);
            const frame = new WorkflowPage(page, app.contextPath, {labels});
            // the side menu, as a person opens it (3.5 takes no workflowMenuKey for a version's page)
            const openMenuPage = async (label) => {
                await page.goto('about:blank');
                await frame.gotoEditorial(plan.sub);
                await idle(page);
                const link = frame.menuLink(label);
                if (!(await link.last().isVisible().catch(() => false))) {
                    if (app.line !== 'stable-3_5_0' && (await frame.latestVersionNode().isVisible().catch(() => false))) await frame.latestVersionNode().click();
                    else await frame.publicationGroup().click();
                }
                await expect(link.last()).toBeVisible({timeout: 30_000});
                await link.last().click();
                await idle(page);
            };
            if (app.name === 'omp') {
                // control: a press's publication formats are a legacy grid, with no Vue close callback
                const fmtDialog = () => page.getByRole('dialog', {name: /publication format/i}).last();
                const addLink = () => frame.dialog().getByRole('link', {name: 'Add publication format', exact: true}).or(frame.dialog().getByRole('button', {name: 'Add publication format', exact: true})).first();
                const openPage = async () => {
                    await openMenuPage('Publication Formats');
                    await expect(addLink()).toBeVisible({timeout: 30_000});
                };
                await step('page', async () => {
                    await openPage();
                    await loc(page, 'Publication Formats: "Add publication format"', addLink());
                    return {screen: await screen(page), formats: storedGalleys()};
                });
                await step('add-close-unchanged', async () => {
                    await addLink().click();
                    await expect(fmtDialog()).toBeVisible({timeout: 30_000});
                    await idle(page);
                    const s = await screen(page);
                    await shot(page, `h29-${user}-add-window`);
                    await fmtDialog().getByRole('button', {name: 'Close', exact: true}).first().click();
                    await expect(fmtDialog()).toHaveCount(0, {timeout: 15_000}).catch(() => {});
                    await idle(page);
                    return {window: s, closed: (await fmtDialog().count()) === 0, after: await screen(page)};
                });
                await step('add-again', async () => {
                    await addLink().click();
                    const opened = await fmtDialog().isVisible({timeout: 15_000}).catch(() => false);
                    await expect(fmtDialog()).toBeVisible({timeout: 15_000}).catch(() => {});
                    const s = await screen(page);
                    if (opened) {
                        await fmtDialog().getByRole('button', {name: 'Close', exact: true}).first().click();
                        await expect(fmtDialog()).toHaveCount(0, {timeout: 15_000}).catch(() => {});
                    }
                    await idle(page);
                    return {opened, window: s, formats: storedGalleys()};
                });
                return;
            }

            const g = new GalleyManager(page, frame);
            const openPage = async () => {
                await openMenuPage('Galleys');
                await g.expectLoaded();
                await idle(page);
            };
            const winOpen = async () => {
                await g.addButton().click();
                const win = new GalleyWindow(page, TEXT.createTitle);
                await win.expectLoaded();
                await idle(page);
                return win;
            };
            const leave = async (win, how) => {
                if (how === 'cancel') await win.cancelControl().click();
                else await win.closeButton().click();
                await expect(win.dialog()).toHaveCount(0, {timeout: 15_000}).catch(() => {});
                await idle(page);
                return {closed: (await win.dialog().count()) === 0};
            };
            await step('page', async () => {
                await openPage();
                await loc(page, 'Galleys: "Add galley"', g.addButton());
                return {screen: await screen(page), labels: await g.labels(), stored: storedGalleys()};
            });
            if (out.steps.page.error) return;
            await step('add-close-unchanged', async () => {
                const win = await winOpen();
                const w = await screen(page);
                await shot(page, `h29-${user}-create-window`);
                await loc(page, 'Create New Galley: header "Close"', win.closeButton());
                const r = await leave(win, 'close');
                return {window: w, ...r, after: await screen(page), labels: await g.labels()};
            });
            await step('add-again-after-close', async () => {
                const win = await winOpen().catch((e) => ({failed: flat(e.message)}));
                if (win.failed) return {opened: false, why: win.failed, screen: await screen(page)};
                const r = await leave(win, 'cancel');
                return {opened: true, cancel: r, labels: await g.labels()};
            });
            await step('add-change-close-ok', async () => {
                const win = await winOpen();
                await win.labelBox().fill('cc29e changed');
                await win.labelBox().blur();
                const r = await leave(win, 'close');
                return {...r, after: await screen(page), labels: await g.labels()};
            });
            await step('add-refused-save-close', async () => {
                const win = await winOpen();
                await win.labelBox().fill('cc29e refused');
                await win.urlPathBox().fill('123');
                await win.saveRefused();
                const refused = flat(await win.form().innerText(), 600);
                await shot(page, `h29-${user}-refused`);
                const r = await leave(win, 'close');
                return {refused, ...r, after: await screen(page), labels: await g.labels()};
            });
            await step('add-cancel', async () => {
                const win = await winOpen();
                await win.labelBox().fill('cc29e cancel');
                const r = await leave(win, 'cancel');
                return {...r, labels: await g.labels()};
            });
            await step('add-again-end', async () => {
                const win = await winOpen().catch((e) => ({failed: flat(e.message)}));
                if (win.failed) return {opened: false, why: win.failed, screen: await screen(page)};
                const r = await leave(win, 'cancel');
                return {opened: true, cancel: r};
            });
            await step('reload', async () => {
                await page.reload();
                await g.expectLoaded().catch(() => {});
                await idle(page);
                return {screen: await screen(page), labels: await g.labels(), stored: storedGalleys()};
            });
            await shot(page, `h29-${user}-end`);
            if (user === plan.users[0] && ['r1', 's1', undefined].includes(process.env.PROBE_RUN)) note(`H29 (cc29e, ${out.line}, ${app.name}): "Create New Galley" header Close is GalleyWindow.closeButton() (dialog named by its title, button "Close"); the form's "Cancel" is a link or button, GalleyWindow.cancelControl(). Attribute script errors per step with an own page.on('pageerror')/console listener and a ~1.5 s wait after the close.`);
        } finally {
            out.errorsTotal = errors.length;
            record(`h29-${user}`, out);
            await close();
        }
    }
});
