// Issue report U58 A15 (docs/issues/U58-A15-component-window-outside-press-loses-name.md): a press on the
// dimmed page beside the "Add a Component" window, or Escape, made while the cursor is still in a "Name"
// just typed, closes the window without the question its "Close" asks; the browser's leave-page question
// comes at the next reload instead.
//
// Runs on PKP's default test dataset (a dataset fleet), as the manager rvaca, on OJS, OMP and OPS.
// Nothing is saved; reset the fleet before each walk all the same.
//   (default)  the report's Steps 1-9 and the control ("Close" asks)
//   neighbour  what the fix must leave alone: an untouched window still closes at the press without a
//              question; a "Name" left with Tab asks at the press (as today); the form's "Cancel" closes
//              unasked; N4: an existing component's "Name" cleared with the cursor left in it, then the press
//              (what the box's own check on leaving shows when the fix takes the focus out).
//   reach      the Cause's reach: another window on the same form framework (Users & Roles › "Roles" ›
//              "Create New Role", the press beside with the cursor in "Role Name"), and a reload of the
//              settings page while the component window is open with the cursor in "Name".
// Every press beside the window is a real mouse press at the left edge of the 1280 px wide page. A browser
// question is answered by the step that expects it: "Cancel" first (the window must stay), then "OK".
//
// Reset:  npm run fleet-prep -- --feature issues-h21v --dataset 8 --reset
// Run:    PROBE_FEATURE=issues-h21v PROBE_AGENT=h21v node bin/probe.js all \
//           shared/playwright/checks/issues/component-window-outside-press-loses-name/walk.js [neighbour]
// 3.5:    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21v-3_5 … (the same)
const {forEachApp, launch, signIn, screen, record, idle} = require('../../../probe');

const MODE = process.argv.slice(2).find((a) => a === 'neighbour' || a === 'reach') || process.env.WALK || 'steps';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = {ojs: 'Article Components', omp: 'Monograph Components', ops: 'Preprint Components'};
const OUTSIDE = {x: 30, y: 450}; // the dimmed page left of the side window

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const {WorkflowSubmissionSettings} = require('../../../pages/SubmissionIntakePages.js');
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const name = (s) => `${MODE}-${s}${run}-${app.name}`;
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const {page, close} = await launch(app);
    const dialogs = [];
    let confirmAnswer = 'dismiss';
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message()});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {});
        else if (confirmAnswer === 'accept') await d.accept().catch(() => {});
        else await d.dismiss().catch(() => {});
    });
    const step = async (label, action) => {
        try {
            const out = await action();
            fact(label, out === undefined ? 'done' : out);
            return out;
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
            return null;
        }
    };

    const settings = new WorkflowSubmissionSettings(page, app.contextPath, {listTitle: LIST[app.name]});
    const list = settings.components;
    const form = page.locator('form#genreForm');
    const windowOpen = () => form.isVisible().catch(() => false);
    const nameBox = form.locator('input[name="name[en]"]');
    const rowsWith = async (text) => {
        const names = await list.names();
        return {rows: names.length, hasName: names.includes(text)};
    };
    const asked = (before) => dialogs.slice(before);

    // Open the window and type into "Name" as a person does (click, keys); the cursor stays in the box.
    const addAndType = async (text) => {
        if (await windowOpen()) return {skipped: 'a window is still open'};
        await list.openAdd();
        await nameBox.click();
        await page.keyboard.type(text);
        const focused = await nameBox.evaluate((el) => el === document.activeElement);
        return {typed: await nameBox.inputValue(), cursorInName: focused};
    };
    // A way out (the press beside, Escape, "Close", "Cancel"), the question answered "Cancel"; when the window
    // stays, the same way out again answered "OK".
    const leave = async (how, action) => {
        const before = dialogs.length;
        confirmAnswer = 'dismiss';
        await action();
        await sleep(1500);
        const out = {how, asked: asked(before), windowOpen: await windowOpen()};
        if (out.windowOpen) {
            out.nameKept = await nameBox.inputValue().catch(() => null);
            // Where the focus is once the question was answered "Cancel", and any message under a box.
            out.focusAfterCancel = await page.evaluate(() => {
                const el = document.activeElement;
                return el ? `${el.tagName.toLowerCase()}${el.name ? `[name="${el.name}"]` : ''}${el.id ? `#${el.id}` : ''}` : null;
            });
            out.messages = await form.locator('label.error:visible').allInnerTexts().catch(() => []);
            record(name(`${how}-asked-cancelled`), await screen(page));
            confirmAnswer = 'accept';
            const again = dialogs.length;
            // "OK" from the question: the same way out once more.
            await action();
            await sleep(1500);
            out.second = {asked: asked(again), windowOpen: await windowOpen()};
            confirmAnswer = 'dismiss';
        }
        return out;
    };
    const pressBeside = () => page.mouse.click(OUTSIDE.x, OUTSIDE.y);
    const pressEscape = () => page.keyboard.press('Escape');
    const pressClose = () => page.getByRole('dialog').filter({has: form}).getByRole('button', {name: /^Close/}).first().click();
    const pressCancel = () => form.getByRole('link', {name: 'Cancel', exact: true}).click();
    const reload = async () => {
        const before = dialogs.length;
        await page.reload();
        await settings.waitLoaded();
        await settings.openSideTab('Components');
        await idle(page);
        return {asked: asked(before), rows: (await list.names()).length};
    };

    try {
        await step('1 sign in as rvaca', () => signIn(page, 'rvaca'));
        await step('2 Settings › Workflow › Submission › Components', async () => {
            await settings.goto('Components');
            await idle(page);
            return {title: LIST[app.name], rows: (await list.names()).length};
        });
        if (MODE === 'steps') {
            await step('3-4 Add a Component, type "h21v component" in Name', () => addAndType('h21v component'));
            await step('5 press the dimmed page beside the window', () => leave('beside', pressBeside));
            record(name('5-after-press'), await screen(page));
            await step('5 the list after', () => rowsWith('h21v component'));
            await step('6 reload the page', reload);
            await step('7 Add a Component, type "h21v escape" in Name', () => addAndType('h21v escape'));
            await step('8 press Escape', () => leave('escape', pressEscape));
            record(name('8-after-escape'), await screen(page));
            await step('8 the list after', () => rowsWith('h21v escape'));
            await step('9 reload the page', reload);
            await step('control: Add a Component, type "h21v close"', () => addAndType('h21v close'));
            await step('control: the window\'s "Close"', () => leave('close', pressClose));
            await step('control: reload the page', reload);
        } else if (MODE === 'reach') {
            await step('R1 Add a Component, type "h21v reload", reload with the window open', async () => {
                const out = await addAndType('h21v reload');
                return {...out, reload: await reload()};
            });
            await step('R2 Users & Roles › Roles › Create New Role', async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/access`));
                await idle(page);
                await page.getByRole('main').getByRole('tab', {name: 'Roles', exact: true}).click();
                await idle(page);
                await page.getByRole('link', {name: 'Create New Role', exact: true}).click();
                const role = page.locator('form#userGroupForm input[name="name[en]"]');
                await role.waitFor({timeout: 30_000});
                await idle(page);
                await role.click();
                await page.keyboard.type('h21v role');
                return {typed: await role.inputValue(), cursorInName: await role.evaluate((el) => el === document.activeElement)};
            });
            const roleForm = page.locator('form#userGroupForm');
            await step('R2 press beside the "Create New Role" window', async () => {
                const before = dialogs.length;
                confirmAnswer = 'accept';
                await pressBeside();
                await sleep(1500);
                return {asked: asked(before), windowOpen: await roleForm.isVisible().catch(() => false)};
            });
            record(name('R2-after-press'), await screen(page));
            await step('R2 reload the page', async () => {
                const before = dialogs.length;
                await page.reload();
                await idle(page);
                return {asked: asked(before)};
            });
        } else {
            await step('N1 Add a Component, nothing typed', async () => {
                await list.openAdd();
                return {windowOpen: await windowOpen()};
            });
            await step('N1 press beside the untouched window', () => leave('n1-beside', pressBeside));
            await step('N2 Add a Component, type "h21v tabbed", then Tab', async () => {
                const out = await addAndType('h21v tabbed');
                await page.keyboard.press('Tab');
                return {...out, cursorInName: await nameBox.evaluate((el) => el === document.activeElement)};
            });
            await step('N2 press beside the window', () => leave('n2-beside', pressBeside));
            await step('N2 reload the page', reload);
            await step('N3 Add a Component, type "h21v cancel"', () => addAndType('h21v cancel'));
            await step('N3 "Cancel"', () => leave('n3-cancel', pressCancel));
            await step('N3 the list after', () => rowsWith('h21v cancel'));
            await step('N3 reload the page', reload);
            await step('N4 the first row › Edit, clear "Name" (the cursor stays)', async () => {
                const first = (await list.names())[0];
                await list.openEdit(first);
                await nameBox.click();
                await page.keyboard.press('ControlOrMeta+a');
                await page.keyboard.press('Backspace');
                return {row: first, name: await nameBox.inputValue(), cursorInName: await nameBox.evaluate((el) => el === document.activeElement)};
            });
            await step('N4 press beside the window', () => leave('n4-beside', pressBeside));
            await step('N4 reload the page', reload);
        }
    } finally {
        facts.dialogs = dialogs;
        record(name('facts'), facts);
        await close();
    }
});
