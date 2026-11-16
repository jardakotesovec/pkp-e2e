// Issue report U58 A15 (docs/issues/U58-A15-component-window-outside-press-loses-name.md), for spec U09 A21:
// the custom block window. A press on the shaded page beside the "Add Block" window, or Escape, made while the
// caret is still in a "Block Name" just typed, closes the window without the question its back arrow asks.
//
// Runs on PKP's default test dataset (a dataset fleet), as the manager rvaca, on OJS, OMP and OPS. The kit
// builds nothing: step 2 ticks "Custom Block Manager" (off in the dataset) on screen, and nothing is saved.
// Reset the fleet before each walk.
//   (default)  the Steps: 1-3 the plugin on and "Manage Custom Blocks"; 4-6 "Add Block", "u09n16c block" typed,
//              the press beside; 7-8 the same with Escape; 9 a reload; the control (the window's back arrow asks).
//   neighbour  what the fix must leave alone: N1 an untouched "Add Block", the press beside (no question), then a
//              second press, which closes the "Custom Block Manager" window (no question); N2 "Block Name" typed
//              and left by pressing the window's heading, then the press beside (asks, as today); N3 "Block Name"
//              typed, the form's own "Cancel" (closes unasked, as today); N4 a reload after (no question).
// Every press beside is a real mouse press on the shade, found from the page's left edge half way down. A browser
// question is answered "Cancel" first (the window must stay), then the same way out is taken again and answered "OK".
//
// Reset:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:    PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all \
//           shared/playwright/checks/issues/component-window-outside-press-loses-name/block.js [neighbour]
// 3.5:    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<feature>-3_5 … (the same)
const {forEachApp, launch, signIn, screen, record, idle} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv.slice(2).find((a) => a === 'neighbour') || 'steps';
const PLUGIN = 'customblockmanagerplugin';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('block.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const {PluginsTab} = require('../../../pages/CustomContentPages.js');
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const name = (s) => `block-${MODE}-${s}${run}`;
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

    const plugins = new PluginsTab(page, app.contextPath);
    let manager = null;
    let bw = null;
    const managerOpen = () => (manager ? manager.grid.isVisible().catch(() => false) : false);
    const blockOpen = () => (bw ? bw.form.isVisible().catch(() => false) : false);
    const list = async () => (manager && (await managerOpen())
        ? {rows: await manager.rowNames(), empty: await manager.emptyRow.isVisible().catch(() => null)}
        : {managerOpen: false});
    const openManager = async () => {
        await plugins.goto();
        manager = await plugins.openBlockManager();
        return list();
    };
    // "Add Block" (from the manager window when it is open), a click in "Block Name", the text typed key by key.
    const addAndType = async (text) => {
        if (await blockOpen()) return {skipped: 'the block window is still open'};
        if (!(await managerOpen())) await openManager();
        bw = await manager.addBlock();
        if (text === null) return {opened: true};
        await bw.nameInput('en').click();
        await page.keyboard.type(text);
        return {typed: await bw.nameInput('en').inputValue(), caretInName: (await L.focused(page)) === 'input[name="blockTitle[en]"]' || await bw.nameInput('en').evaluate((el) => el === document.activeElement)};
    };
    const asked = (before) => dialogs.slice(before);
    // A way out; a question is answered "Cancel", and when the window stays the same way out is taken again, "OK".
    const leave = async (how, action) => {
        const before = dialogs.length;
        confirmAnswer = 'dismiss';
        const did = await action();
        await L.sleep(1500);
        const out = {how, did, asked: asked(before), blockWindowOpen: await blockOpen(), managerOpen: await managerOpen()};
        if (out.blockWindowOpen) {
            out.nameKept = await bw.nameInput('en').inputValue().catch(() => null);
            out.focusAfterCancel = await L.focused(page);
            out.messages = await bw.form.locator('label.error:visible').allInnerTexts().catch(() => []);
            record(name(`${how}-asked-cancelled`), await screen(page));
            confirmAnswer = 'accept';
            const again = dialogs.length;
            await action();
            await L.sleep(1500);
            out.second = {asked: asked(again), blockWindowOpen: await blockOpen(), managerOpen: await managerOpen()};
            confirmAnswer = 'dismiss';
        }
        out.listAfter = await list();
        return out;
    };
    const pressBeside = async () => {
        const p = await L.shadePoint(page);
        await page.mouse.click(p.x, p.y);
        return p;
    };
    const pressEscape = () => page.keyboard.press('Escape');
    const pressClose = () => bw.root.getByRole('button', {name: 'Close', exact: true}).first().click();
    const pressCancel = () => bw.cancelLink.click();
    const reload = async () => {
        const before = dialogs.length;
        await page.reload();
        await idle(page);
        manager = null;
        return {asked: asked(before)};
    };

    try {
        await step('1 sign in as rvaca', () => signIn(page, 'rvaca'));
        await step('2 Settings › Website › Plugins, tick "Custom Block Manager"', async () => {
            await plugins.goto();
            return L.enablePlugin(page, PLUGIN);
        });
        await step('3 the arrow › "Manage Custom Blocks"', openManager);
        record(name('3-manager'), await screen(page));
        if (MODE === 'steps') {
            await step('4-5 "Add Block", type "u09n16c block" in "Block Name"', () => addAndType('u09n16c block'));
            record(name('5-typed'), await screen(page));
            await step('6 press the shaded page beside the windows', () => leave('beside', pressBeside));
            record(name('6-after-press'), await screen(page));
            await step('7 "Add Block", type "u09n16c escape" in "Block Name"', () => addAndType('u09n16c escape'));
            await step('8 press Escape', () => leave('escape', pressEscape));
            record(name('8-after-escape'), await screen(page));
            await step('9 reload the page', reload);
            await step('control: "Add Block", type "u09n16c close"', () => addAndType('u09n16c close'));
            await step('control: the "Add Block" window\'s back arrow ("Close")', () => leave('close', pressClose));
            await step('control: reload the page', reload);
        } else {
            await step('N1 "Add Block", nothing typed', () => addAndType(null));
            await step('N1 press beside the untouched window', () => leave('n1-beside', pressBeside));
            await step('N1 press beside again (the "Custom Block Manager" window)', async () => {
                const before = dialogs.length;
                confirmAnswer = 'dismiss';
                const p = await pressBeside();
                await L.sleep(1500);
                return {p, asked: asked(before), managerOpen: await managerOpen()};
            });
            await step('N2 "Add Block", type "u09n16c heading", press the window\'s heading', async () => {
                const out = await addAndType('u09n16c heading');
                await bw.blur();
                return {...out, focusAfterHeading: await L.focused(page)};
            });
            await step('N2 press beside the window', () => leave('n2-beside', pressBeside));
            await step('N3 "Add Block", type "u09n16c cancel"', () => addAndType('u09n16c cancel'));
            await step('N3 the form\'s "Cancel"', () => leave('n3-cancel', pressCancel));
            await step('N4 reload the page', reload);
        }
    } finally {
        facts.dialogs = dialogs;
        record(name('facts'), facts);
        await close();
    }
});
