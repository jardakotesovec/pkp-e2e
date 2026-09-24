// U39 K2 side probe: which step raises the page error "There is no handler bound to this element!"
// in the Submission Library window (add, download, edit, delete in turn, a marker after each).
//   PROBE_FEATURE=U39 PROBE_AGENT=ccK2 node bin/probe.js ojs shared/playwright/checks/U39/K2/handler-error.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, idle, outDir, record} = require('../../../probe');
const SUB_GRID = 'div[id^="component-grid-files-submissiondocuments-submissiondocumentsfilesgrid"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = Math.random().toString(36).slice(2, 6);

forEachApp(async (app) => {
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `seed-${app.name}.json`), 'utf8'));
    const A = S.A;
    const pdf = path.join(outDir(), 'files', 'own.pdf');
    const {page, close} = await launch(app);
    const errs = [];
    page.on('pageerror', (e) => { errs.push(String(e.message)); console.log('[stack]', String(e.stack).slice(0, 900)); });
    const steps = [];
    const mark = async (s) => { await idle(page); await sleep(700); steps.push({step: s, errors: errs.length}); console.log(`[${app.name}] ${s}: ${errs.length}`); };
    const grid = () => page.locator(SUB_GRID).first();
    const form = () => page.locator('form').filter({has: page.locator('input[name^="libraryFileName"]')}).last();
    const add = async (name) => {
        await grid().getByRole('link', {name: 'Add a file', exact: true}).first().click();
        await form().waitFor(); await idle(page);
        await form().locator('input[name^="libraryFileName"]').first().fill(name);
        await form().locator('select[name="fileType"]').selectOption({label: 'Other'});
        await form().locator('input[type="file"]').first().setInputFiles(pdf);
        await page.waitForFunction(() => [...document.querySelectorAll('form input[name="temporaryFileId"]')].some((i) => i.value));
        await form().getByRole('button', {name: 'OK', exact: true}).click();
        await form().waitFor({state: 'detached'});
    };
    const dl = async (name) => { const d = page.waitForEvent('download', {timeout: 15000}); await grid().getByRole('link', {name, exact: true}).click(); await d; };
    const arrow = async (name) => { const row = grid().locator('tr.gridRow').filter({has: page.getByRole('link', {name, exact: true})}).first(); await row.locator('a.show_extras').click(); return row.locator('xpath=following-sibling::tr[1]'); };
    try {
        const who = app.name === 'ops' ? A.users.mg.username : A.users.ed.username;
        await signIn(page, who, {contextPath: A.path});
        await page.goto(app.url(`/index.php/${A.path}/en/dashboard/editorial?workflowSubmissionId=${A.S2.submissionId}`)); await idle(page);
        await page.getByRole('button', {name: 'Library', exact: true}).click(); await grid().waitFor(); await mark('open library');
        await add(`HE one ${R}`); await mark('add 1');
        await dl(`HE one ${R}`); await mark('download 1');
        await add(`HE two ${R}`); await mark('add 2');
        await dl(`HE two ${R}`); await mark('download 2');
        let a = await arrow(`HE one ${R}`); await mark('arrow 1');
        await a.getByRole('link', {name: 'Edit', exact: true}).click(); await form().waitFor(); await mark('edit open');
        await form().getByRole('button', {name: 'OK', exact: true}).click(); await form().waitFor({state: 'detached'}); await mark('edit OK');
        await dl(`HE one ${R}`); await mark('download 1 again');
        await add(`HE three ${R}`); await mark('add 3');
        a = await arrow(`HE three ${R}`); await mark('arrow 3');
        await a.getByRole('link', {name: 'Delete', exact: true}).click(); await sleep(800);
        await page.locator('[role="dialog"]:visible').filter({hasText: /Are you sure/}).last().getByRole('button', {name: 'OK', exact: true}).click(); await mark('delete 3 OK');
        await dl(`HE two ${R}`); await mark('download 2 again');
        // A person's pace: press a name, then close the window at once (within the app's two-second timer).
        await sleep(2500); await mark('wait out timers');
        await dl(`HE two ${R}`);
        await page.getByRole('dialog', {name: 'Submission Library'}).getByRole('button', {name: 'Close', exact: true}).first().click();
        await sleep(2500); await mark('download then close window');
        await page.getByRole('button', {name: 'Library', exact: true}).click(); await grid().waitFor(); await sleep(2500); await mark('reopen');
        await dl(`HE two ${R}`); await sleep(2500); await mark('download, wait 2.5 s');
    } catch (e) { console.log('[error]', String(e.message).slice(0, 400)); }
    record('handler-error-steps', {steps, errs});
    await close();
});
