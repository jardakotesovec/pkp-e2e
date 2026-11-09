// Issue report walk: docs/issues/U11-A12-highlights-list-drops-past-100.md
// (spec U11 register A12). Takes the report's Steps through the screens on a
// dataset fleet (PKP's default test dataset, harness.md "Dataset fleets"):
// signed in as the dataset's manager `rvaca` on `publicknowledge`; the kit
// builds nothing, every highlight is added on screen through "Add Highlight".
// Fact labels carry the report's step numbers. Records every screen with
// screen(), and the list requests the panel itself sends (GET highlights,
// PUT highlights/order) with the size of each answer. Reset the fleet before
// each walk: the walk adds highlights.
//
// Modes (first argument):
//   (none)  the Steps: 100 highlights added (precondition), the 101st and
//           102nd added, a reload, the signed-out home page, then the reach
//           step: "Order" and "Save Order" with nothing moved.
//   api     the Steps' other way to the precondition: highlights 1-100 added by
//           the console snippet the Steps give (the same POST highlights, body
//           and CSRF header the "Add Highlight" form sends), then steps 4 and 6
//           through the screens. Runs alone.
//   nb      the neighbour a fix must leave alone: three highlights added on
//           screen (each listed at once, last), "Order", "u11r3 003" up one,
//           "Save Order"; the list, a reload and the home page show 001, 003,
//           002. Runs alone.
//
// Run (main, then stable-3_5_0):
//   npm run fleet-prep -- --feature issues-u11r3 --dataset 3 --reset
//   PROBE_FEATURE=issues-u11r3 PROBE_AGENT=u11r3 node bin/probe.js all shared/playwright/checks/issues/highlights-list-drops-past-100/walk.js
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-u11r3-3_5 --dataset 3 --reset
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-u11r3-3_5 PROBE_AGENT=u11r3 node bin/probe.js all shared/playwright/checks/issues/highlights-list-drops-past-100/walk.js
const {forEachApp, launch, signIn, screen, shot, record, idle} = require('../../../probe');

const MODE = process.argv[2] || 'steps';
const T = 20_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const title = (n) => `u11r3 ${String(n).padStart(3, '0')}`;

forEachApp(async (app) => {
    const facts = {mode: MODE};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name}] ${k}: ${JSON.stringify(v).slice(0, 600)}`); };
    if (!app.dataset) throw new Error('walk.js drives a dataset fleet (fleet-prep --dataset); this fleet is the campaign\'s');
    const path = app.contextPath; // publicknowledge
    const {page, close} = await launch(app);
    let n = 0;
    async function snap(name) {
        const s = await screen(page);
        record(`${MODE === 'steps' ? '' : MODE + '-'}${String(++n).padStart(2, '0')}-${name}`, s);
        return s;
    }

    // The list answers the panel receives: the refetch after an add and the order save's answer.
    const listCalls = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/\/api\/v1\/highlights(\/order)?(\?|$)/.test(u)) return;
        const m = r.request().method();
        const override = r.request().headers()['x-http-method-override'] || null;
        if (m === 'POST' && !override && !/\/order/.test(u)) return; // the add itself
        let items = null, itemsMax = null;
        try { const j = await r.json(); items = Array.isArray(j.items) ? j.items.length : null; itemsMax = j.itemsMax ?? null; } catch { /* not JSON */ }
        listCalls.push({method: override || m, url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status(), items, itemsMax});
    });
    const lastCall = () => listCalls[listCalls.length - 1] || null;

    const panel = () => page.locator('.highlightsListPanel');
    const rows = () => panel().locator('.listPanel__itemTitle').allInnerTexts().then((a) => a.map((x) => x.trim()));
    const listState = async () => {
        const r = await rows();
        return {count: r.length, first: r.slice(0, 2), last: r.slice(-3), has101: r.includes(title(101)), has102: r.includes(title(102))};
    };
    async function openHighlightsTab() {
        await page.goto(app.url(`/index.php/${path}/en/management/settings/website`));
        await idle(page);
        const setupTab = page.locator('#setup-button').first();
        await setupTab.waitFor({timeout: T});
        if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
        await page.locator('#setup').first().getByRole('tab', {name: 'Highlights', exact: true}).click();
        await panel().waitFor({timeout: T});
        await idle(page);
    }
    async function setRich(d, iframeSel, text) {
        const frame = d.locator(iframeSel).first();
        await frame.waitFor({timeout: T});
        const body = frame.contentFrame().locator('body');
        for (let i = 0; i < 40; i++) {
            if ((await body.getAttribute('contenteditable').catch(() => null)) === 'true') break;
            await pause(200);
        }
        await body.click();
        await page.keyboard.type(text);
        await pause(150);
    }
    // One "Add Highlight" … "Save"; returns the add's status and, once the panel has
    // fetched the list again, that answer.
    async function addHighlight(k) {
        const before = listCalls.length;
        await panel().getByRole('button', {name: 'Add Highlight', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Add Highlight'});
        await d.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: T});
        await setRich(d, '#highlight-title-control-en_ifr', title(k));
        await d.locator('#highlight-url-control').fill(`https://example.org/${k}`);
        await d.locator('#highlight-urlText-control-en').fill('Read more');
        const resp = page.waitForResponse((r) => /\/api\/v1\/highlights(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 15_000}).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        await d.waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
        for (let i = 0; i < 50 && listCalls.length === before; i++) await pause(100);
        await idle(page);
        return {add: r ? r.status() : null, refetch: listCalls.length > before ? lastCall() : null};
    }
    async function press(name) {
        const b = panel().getByRole('button', {name, exact: true});
        if (!(await b.isVisible().catch(() => false))) return `no "${name}" button`;
        await b.click();
        await idle(page); await pause(300);
        return 'pressed';
    }
    async function saveOrder() {
        const before = listCalls.length;
        const p = await press('Save Order');
        for (let i = 0; i < 80 && listCalls.length === before; i++) await pause(100);
        await idle(page); await pause(300);
        return {press: p, answer: listCalls.length > before ? lastCall() : null};
    }
    async function homeSlides() {
        const ctx = await page.context().browser().newContext();
        const p = await ctx.newPage();
        try {
            await p.goto(app.url(`/index.php/${path}`));
            await p.waitForLoadState('load');
            const slides = await p.locator('.highlights li.swiper-slide:not(.swiper-slide-duplicate) .swiper-slide-title').allInnerTexts().then((a) => a.map((x) => x.trim()));
            record(`${MODE === 'steps' ? '' : MODE + '-'}home`, await screen(p));
            return {count: slides.length, last: slides.slice(-3)};
        } finally {
            await ctx.close();
        }
    }

    try {
        // 1
        await signIn(page, 'rvaca', {contextPath: path});
        // 2
        await openHighlightsTab();
        fact('2 list on opening', await listState());
        await snap('highlights-tab');

        if (MODE === 'nb') {
            for (let k = 1; k <= 3; k++) {
                const a = await addHighlight(k);
                fact(`nb add ${title(k)}`, {...a, list: await listState()});
            }
            await snap('three-added');
            fact('nb Order', await press('Order'));
            const upBtn = panel().getByRole('button', {name: `Increase position of ${title(3)}`, exact: true});
            fact('nb up', (await upBtn.isVisible().catch(() => false)) ? (await upBtn.click(), 'pressed') : 'no up arrow');
            await pause(300);
            fact('nb Save Order', await saveOrder());
            fact('nb after save', await rows());
            await snap('after-save-order');
            await openHighlightsTab();
            fact('nb after reload', await rows());
            fact('nb home page', await homeSlides());
            return;
        }

        if (MODE === 'api') {
            // The Steps' console snippet, run on the Highlights settings page.
            const statuses = await page.evaluate(async () => {
                const out = {};
                for (let n = 1; n <= 100; n++) {
                    const r = await fetch(pkp.context.apiBaseUrl + 'highlights', {
                        method: 'POST',
                        headers: {'X-Csrf-Token': pkp.currentUser.csrfToken, 'Content-Type': 'application/x-www-form-urlencoded'},
                        body: new URLSearchParams({'title[en]': `u11r3 ${String(n).padStart(3, '0')}`, url: `https://example.org/${n}`, 'urlText[en]': 'Read more'}),
                    });
                    out[r.status] = (out[r.status] || 0) + 1;
                }
                return out;
            });
            fact('api 1-100 statuses', statuses);
            await openHighlightsTab();
            fact('api list after reload', await listState());
            fact('api 4 add u11r3 101', await addHighlight(101));
            fact('api 4 list', await listState());
            await snap('api-after-101st');
            await openHighlightsTab();
            fact('api 6 list after reload', await listState());
            return;
        }

        // 3 (precondition): 100 highlights through "Add Highlight"
        const pre = [];
        for (let k = 1; k <= 100; k++) {
            const a = await addHighlight(k);
            if (a.add !== 200 || k % 25 === 0 || k === 1) pre.push({k, ...a});
        }
        fact('3 adds 1-100 (every 25th, and any not 200)', pre);
        fact('3 list after the 100th', await listState());
        await snap('hundred-added');

        // 4
        const a101 = await addHighlight(101);
        fact('4 add u11r3 101', a101);
        fact('4 list', await listState());
        await snap('after-101st');
        await shot(page, 'after-101st');

        // 5
        const a102 = await addHighlight(102);
        fact('5 add u11r3 102', a102);
        fact('5 list', await listState());
        await snap('after-102nd');

        // 6
        await openHighlightsTab();
        fact('6 list after reload', await listState());
        await snap('reloaded');

        // 7
        fact('7 home page slides', await homeSlides());

        // 8 (reach): "Order", "Save Order" with nothing moved
        fact('8 Order', await press('Order'));
        fact('8 Save Order', await saveOrder());
        fact('8 list after Save Order', await listState());
        await snap('after-save-order');
        await openHighlightsTab();
        fact('8 list after reload', await listState());
    } catch (err) {
        fact('ERROR', String(err.stack || err).slice(0, 1200));
        await snap('ERROR').catch(() => {});
        await shot(page, 'ERROR').catch(() => {});
        throw err;
    } finally {
        facts.listCallsTail = listCalls.slice(-8);
        record('facts', facts);
        await close();
    }
});
