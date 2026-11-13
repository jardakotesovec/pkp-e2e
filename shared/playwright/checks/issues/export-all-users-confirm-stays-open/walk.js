// Kept walk for docs/issues/U63-A27-export-all-users-confirm-stays-open.md: "OK" in the "Export All
// Users" window downloads the file but leaves the "Confirm" window open over the list.
// On PKP's default test dataset, OJS and OMP (OPS ships no Users XML Plugin), as `rvaca`:
//   1. Tools › Import/Export › "Users XML Plugin"; 2. the "Export Users" tab;
//   3. "Export All Users", the "Confirm" window; 4. "OK": the download, then 5 s;
//   5. tick the row "dbarnes" (taken or not); 6. if the window is still open, "Cancel" when it can be
//   pressed, else the Escape key; 7. tick the row "dbarnes" again.
// Records each screen, the downloaded file's name and root, whether the window is open after "OK",
// and what the press on the row's box did. Each step records rather than throws.
//
// MODE=dismiss (OJS) presses Escape after "OK", then, on a second "OK", the backdrop at the row's box.
// MODE=nb runs only the neighbour check (the same kind of window whose "OK" leaves the page), as
// `admin`: Administration › "Hosted Journals" › the journal's "Settings wizard" › "Users", search
// "rvaca", the row's "Login As", "OK": the page must leave the wizard, signed in as rvaca.
//
// Reset first:  npm run fleet-prep -- --feature issues-n13d --dataset 2 --reset
// Run:          PROBE_FEATURE=issues-n13d PROBE_AGENT=n13d [PROBE_RUN=fix|nb-in|nb-out] [MODE=nb] \
//                 node bin/probe.js all shared/playwright/checks/issues/export-all-users-confirm-stays-open/walk.js
const fs = require('fs');
const {forEachApp, launch, signIn, record, screen, idle, note} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const MODE = process.env.MODE || 'walk';

/** Run one step; record its outcome or its error, never throw. */
async function step(f, name, fn) {
    try {
        f[name] = await fn();
    } catch (e) {
        f[name] = {error: flat(e.message.split('\n')[0], 300)};
    }
}

async function walk(app, page, f) {
    const downloads = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    const ctx = app.contextPath;
    const confirm = page.getByRole('dialog', {name: 'Confirm'});
    const row = page.locator('#usersGridContainer tr.gridRow').filter({hasText: 'dbarnes@mailinator.com'}).first();
    const box = row.locator('input[name="selectedUsers[]"]');

    await signIn(page, 'rvaca', {contextPath: ctx});
    await step(f, 'tools', async () => {
        await page.goto(app.url(`/index.php/${ctx}/management/tools`));
        await page.locator('.pkp_page_importexport_plugins li').first().waitFor({timeout: 30_000});
        await idle(page).catch(() => {});
        return {url: page.url(), lines: await page.locator('.pkp_page_importexport_plugins li').evaluateAll((l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)))};
    });
    await step(f, 'tool', async () => {
        await page.locator('.pkp_page_importexport_plugins').getByRole('link', {name: 'Users XML Plugin', exact: true}).click();
        await page.getByRole('heading', {name: 'Users XML Plugin', level: 1}).waitFor({timeout: 30_000});
        await page.getByRole('tab', {name: 'Export Users', exact: true}).click();
        await row.waitFor({timeout: 30_000});
        await idle(page).catch(() => {});
        const s = await screen(page);
        record('list', s);
        return {url: page.url(), exportAll: await page.locator('a.pkp_linkaction_exportAllUsers').innerText()};
    });
    await step(f, 'confirm', async () => {
        await page.locator('a.pkp_linkaction_exportAllUsers').click();
        await confirm.waitFor({timeout: 15_000});
        const s = await screen(page);
        record('confirm', s);
        return {dialog: s.text.dialog, buttons: await confirm.getByRole('button').allInnerTexts()};
    });
    await step(f, 'ok', async () => {
        const dl = page.waitForEvent('download', {timeout: 30_000});
        const url0 = page.url();
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        const d = await dl;
        const xml = fs.readFileSync(await d.path(), 'utf8');
        await sleep(5_000);
        const s = await screen(page);
        record('after-ok', s);
        return {
            file: d.suggestedFilename(),
            root: (xml.match(/<(?!\?)([A-Za-z:]+)[\s>]/) || [])[1],
            users: (xml.match(/<username>/g) || []).length,
            hasRvaca: xml.includes('<username>rvaca</username>'),
            urlStayed: page.url() === url0,
            confirmOpen5s: await confirm.isVisible(),
            dialog: s.text.dialog,
        };
    });
    await step(f, 'tickWhileOpen', async () => {
        try {
            await box.check({timeout: 3_000});
            return {ticked: await box.isChecked()};
        } catch (e) {
            return {ticked: await box.isChecked().catch(() => null), error: flat(e.message.split('\n').filter((l) => /intercepts|Timeout/.test(l)).join(' | '), 300)};
        }
    });
    await step(f, 'cancel', async () => {
        if (!(await confirm.isVisible())) return {open: false};
        const n = downloads.length;
        const url0 = page.url();
        const cancel = confirm.getByRole('button', {name: 'Cancel', exact: true});
        const o = {open: true, okDisabled: await confirm.getByRole('button', {name: 'OK', exact: true}).isDisabled(), cancelDisabled: await cancel.isDisabled()};
        if (!o.cancelDisabled) {
            await cancel.click({timeout: 5_000});
            await confirm.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
            o.closedByCancel = !(await confirm.isVisible());
        }
        if (await confirm.isVisible()) {
            // Neither button answers: the keyboard's Escape, as a person tries next.
            await page.keyboard.press('Escape');
            await sleep(1_500);
            o.closedByEscape = !(await confirm.isVisible());
        }
        await sleep(1_000);
        record('after-cancel', await screen(page));
        return {...o, newDownloads: downloads.length - n, urlStayed: page.url() === url0};
    });
    await step(f, 'tickAfter', async () => {
        if (!(await box.isChecked())) await box.check({timeout: 10_000});
        return {ticked: await box.isChecked()};
    });
    f.downloads = downloads;
}

async function neighbour(app, page, f) {
    await signIn(page, 'admin');
    await step(f, 'contexts', async () => {
        await page.goto(app.url('/index.php/index/admin/contexts'));
        const r = page.locator('#contextGridContainer tr.gridRow').first();
        await r.waitFor({timeout: 30_000});
        await idle(page).catch(() => {});
        await r.locator('a.show_extras').click();
        await page.getByRole('link', {name: 'Settings wizard', exact: true}).first().click();
        await page.waitForURL(/\/admin\/wizard\//, {timeout: 30_000});
        await idle(page).catch(() => {});
        return {url: page.url()};
    });
    await step(f, 'users', async () => {
        await page.getByRole('tab', {name: 'Users', exact: true}).click();
        const grid = page.locator('#userGridContainer');
        await grid.locator('tr.gridRow').first().waitFor({timeout: 30_000});
        await idle(page).catch(() => {});
        await grid.locator('a.pkp_linkaction_search').click().catch(() => {});
        await grid.locator('input[name="search"]').fill('rvaca');
        await grid.locator('form.filter').getByRole('button', {name: 'Search', exact: true}).click();
        await idle(page).catch(() => {});
        await grid.locator('tr.gridRow').filter({hasText: 'rvaca@mailinator.com'}).first().waitFor({timeout: 20_000});
        await sleep(500);
        return {rows: await grid.locator('tr.gridRow').filter({visible: true}).allInnerTexts().then((a) => a.map((t) => flat(t, 120)))};
    });
    await step(f, 'loginAs', async () => {
        const grid = page.locator('#userGridContainer');
        const r = grid.locator('tr.gridRow').filter({hasText: 'rvaca@mailinator.com'}).first();
        await r.locator('a.show_extras').click();
        await grid.getByRole('link', {name: 'Login As', exact: true}).filter({visible: true}).first().click();
        const dlg = page.getByRole('dialog', {name: 'Login As'});
        await dlg.waitFor({timeout: 15_000});
        const s0 = await screen(page);
        record('nb-confirm', s0);
        const url0 = page.url();
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        await page.waitForURL((u) => u.toString() !== url0, {timeout: 30_000}).catch(() => {});
        await page.waitForLoadState('load').catch(() => {});
        await idle(page).catch(() => {});
        const s = await screen(page);
        record('nb-after-ok', s);
        const head = await page.locator('header, .app__header, nav').first().innerText().catch(() => null);
        return {dialog: s0.text.dialog, from: url0, to: page.url(), left: page.url() !== url0, header: flat(head, 300), rvacaShown: /rvaca/i.test(head || '') || /rvaca/i.test(JSON.stringify(s.aria || ''))};
    });
}

/**
 * MODE=dismiss: the other ways out of the window after "OK", OJS only. (a) "OK", then the Escape key;
 * (b) "Export All Users" again, "OK", then a real mouse press on the row "dbarnes"'s box, which lies
 * outside the window, on its backdrop. After each: is the window gone, did the press tick the box, can the
 * box then be ticked.
 */
async function dismiss(app, page, f) {
    const downloads = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    const ctx = app.contextPath;
    const confirm = page.getByRole('dialog', {name: 'Confirm'});
    const row = page.locator('#usersGridContainer tr.gridRow').filter({hasText: 'dbarnes@mailinator.com'}).first();
    const box = row.locator('input[name="selectedUsers[]"]');
    const exportAll = page.locator('a.pkp_linkaction_exportAllUsers');
    const okAndDownload = async () => {
        for (let i = 0; i < 5 && !(await confirm.isVisible()); i++) {
            await exportAll.click();
            await confirm.waitFor({timeout: 3_000}).catch(() => {});
        }
        const dl = page.waitForEvent('download', {timeout: 30_000});
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        const d = await dl;
        await sleep(3_000);
        return {file: d.suggestedFilename(), openAfterOk: await confirm.isVisible(),
            okDisabled: await confirm.getByRole('button', {name: 'OK', exact: true}).isDisabled().catch(() => null),
            cancelDisabled: await confirm.getByRole('button', {name: 'Cancel', exact: true}).isDisabled().catch(() => null)};
    };
    const untick = async () => { if (await box.isChecked()) await box.uncheck({timeout: 5_000}).catch(() => {}); };

    await signIn(page, 'rvaca', {contextPath: ctx});
    await page.goto(app.url(`/index.php/${ctx}/management/tools`));
    await page.locator('.pkp_page_importexport_plugins').getByRole('link', {name: 'Users XML Plugin', exact: true}).click();
    await page.getByRole('heading', {name: 'Users XML Plugin', level: 1}).waitFor({timeout: 30_000});
    await page.getByRole('tab', {name: 'Export Users', exact: true}).click();
    await row.waitFor({timeout: 30_000});
    await idle(page).catch(() => {});

    await step(f, 'escape', async () => {
        const o = await okAndDownload();
        await page.keyboard.press('Escape');
        await sleep(1_500);
        o.closedByEscape = !(await confirm.isVisible());
        record('dismiss-escape', await screen(page));
        await box.check({timeout: 5_000}).catch((e) => { o.tickError = flat(e.message.split('\n')[0], 200); });
        o.tickedAfter = await box.isChecked();
        await untick();
        return o;
    });
    await sleep(1_500);
    await step(f, 'outside', async () => {
        const o = await okAndDownload();
        const bb = await box.boundingBox();
        // The window's own frame (the ui-library Dialog's `.DialogContent`), not the full-screen wrapper.
        const win = await confirm.locator('.DialogContent').first().boundingBox().catch(() => null);
        if (win) { win.w = win.width; win.h = win.height; }
        const x = bb.x + bb.width / 2;
        const y = bb.y + bb.height / 2;
        o.point = {x: Math.round(x), y: Math.round(y)};
        o.window = win && {x: Math.round(win.x), y: Math.round(win.y), w: Math.round(win.w), h: Math.round(win.h)};
        o.pointOutsideWindow = !win || x < win.x || x > win.x + win.w || y < win.y || y > win.y + win.h;
        await page.mouse.click(x, y);
        await sleep(1_500);
        o.closedByOutsidePress = !(await confirm.isVisible());
        o.pressTickedBox = await box.isChecked();
        record('dismiss-outside', await screen(page));
        if (!o.pressTickedBox) await box.check({timeout: 5_000}).catch((e) => { o.tickError = flat(e.message.split('\n')[0], 200); });
        o.tickedAfter = await box.isChecked();
        return o;
    });
    f.downloads = downloads;
}

forEachApp(async (app) => {
    const f = {app: app.name, line: app.line || 'main', mode: MODE};
    const {page, close} = await launch(app);
    page.setDefaultTimeout(20_000);
    try {
        if (MODE === 'nb') await neighbour(app, page, f);
        else if (MODE === 'dismiss') await dismiss(app, page, f);
        else await walk(app, page, f);
    } catch (e) {
        f.error = flat(e.stack, 600);
        note(`n13d ${app.name} ${MODE}: ${f.error}`);
    } finally {
        record(MODE === 'walk' ? 'facts' : `${MODE}-facts`, f);
        console.log(JSON.stringify(f, null, 1));
        await close();
    }
});
