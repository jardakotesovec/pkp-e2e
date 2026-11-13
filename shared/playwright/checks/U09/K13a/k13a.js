// U09 claim check K13a (housekeeping 2026-11-13, incidentals row): register A20 and footnote f-a20,
// the first form language's "Content" box left under TinyMCE's "Loading..." spinner when the
// second language's editor finishes its set-up last. Does it show on a default `main` install
// (`enable_minified = Off`, the source scripts with pkp/pkp-lib#13490's guard), and does the
// campaign fleet (`enable_minified = On`, the committed js/pkp.min.js) still show it?
//
// Each run seeds its own scratch journal (tag prefix u09ccK13a): English and French under "UI"
// and "Forms", "Custom Block Manager" on, "Static Pages Plugin" on (OJS, OMP), one manager;
// then, signed in as that manager, adds one "Custom Page" item and one static page through the
// screens. Nothing on `publicknowledge` is touched.
// Windows, each opened ROUNDS times per mode in one browser (closed, then opened again):
//   block   Settings › Website › "Plugins" › Custom Block Manager › "Manage Custom Blocks" › "Add Block"
//   itemAdd Settings › Website › "Setup" › "Navigation" › "Add item", type "Custom Page"
//   itemEdit the same tab, the "Custom Page" item's "Edit"
//   static  Settings › Website › "Static Pages" › the page's "Edit" (OJS, OMP)
// Modes (each its own fresh browser):
//   natural nothing held
//   cpu     the browser's CPU slowed CPU× (Chromium's CPU throttling), the "busy browser"
//   hold    the f-a20 provocation: every "load" listener on an iframe whose id holds "-fr_CA-"
//           runs HOLD ms late (as the harness lever PLAYWRIGHT_IFRAME_HOLD='-fr_CA-'), so the
//           French editor finishes its set-up after the English one; HOLD_ROUNDS rounds
//   reopen  the hold on for the first opening of each window, then off: the stuck window closed
//           and opened again on the same page, then after a reload (A20 "Reloading the page and
//           opening the window again", f-a20 "Not driven: … closing and reopening")
// Per round it records each language box (editor present, initialized, spinner shown, its
// aria-busy), the page errors and console errors since the window opened, a press on the English
// box and the letters typed there, and the dialogs on the way out; the window's screen() on the
// first round of each window and mode and on every round with a spinner left.
// Also recorded: which script the page loads (js/pkp.min.js or lib/pkp/js/.../SiteHandler.js)
// and whether its `deactivate` handler carries the `initialized` guard, read off the browser's
// own responses.
//
// Run (one process per app; each phase twice, r1 and r2; nothing else is read or needed):
//   dataset fleet 4 (default `main` config, enable_minified Off; reset first):
//     npm run fleet-prep -- --feature cc-u09 --dataset 4 --reset --notes U09
//     PROBE_FEATURE=cc-u09 PROBE_AGENT=ccK13a PROBE_RUN=r1 bin/app-lock.sh shared ojs -- \
//         node bin/probe.js ojs shared/playwright/checks/U09/K13a/k13a.js
//   campaign fleet (enable_minified On, the control):
//     PROBE_FEATURE=U09 PROBE_AGENT=ccK13a PROBE_RUN=r1 bin/app-lock.sh shared ojs -- \
//         node bin/probe.js ojs shared/playwright/checks/U09/K13a/k13a.js
// Env: MODES=natural,cpu,hold,reopen (default all), WINDOWS=block,itemAdd,itemEdit,static,
// ROUNDS=12 (natural), CPU_ROUNDS=8, CPU=6, HOLD_ROUNDS=4, HOLD=3000.
// Facts: <out>/facts-<run>-<app>.json (summary per mode and window, then every round).
// Read 2026-11-13 (main, lib/pkp ad75b174f0): Off 0 stuck in 2 x 264 openings, no page error;
// On every held opening stuck (English box, the `serialize` error), reopened/reloaded ready.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, loc, note, outFile} = require('../../../probe');
const fs = require('fs');
const H = require('../K1/lib');

const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODES = (process.env.MODES || 'natural,cpu,hold,reopen').split(',');
const WINDOWS = (process.env.WINDOWS || 'block,itemAdd,itemEdit,static').split(',');
const ROUNDS = Number(process.env.ROUNDS || 12);
const CPU_ROUNDS = Number(process.env.CPU_ROUNDS || 8);
const CPU = Number(process.env.CPU || 6);
const HOLD_ROUNDS = Number(process.env.HOLD_ROUNDS || 4);
const HOLD = Number(process.env.HOLD || 3000);
const hasStatic = (app) => app.name !== 'ops';

/** The f-a20 hold, switchable per page through window.__k13aHold. */
function holdScript({pattern, ms}) {
    const re = new RegExp(pattern);
    if (window.__k13aHold === undefined) window.__k13aHold = true;
    window.__k13aHeld = [];
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
        if (type === 'load' && this instanceof HTMLIFrameElement && re.test(this.id || '') && typeof fn === 'function') {
            return add.call(this, type, function (event) {
                const frame = this;
                if (!window.__k13aHold) return fn.call(frame, event);
                window.__k13aHeld.push(frame.id);
                const late = new Proxy(event, {
                    get: (e, k) => (k === 'composedPath' ? () => [frame] : k === 'currentTarget' || k === 'target' ? frame : typeof e[k] === 'function' ? e[k].bind(e) : e[k]),
                });
                setTimeout(() => fn.call(frame, late), ms);
            }, opts);
        }
        return add.call(this, type, fn, opts);
    };
}

forEachApp(async (app) => {
    const run = process.env.PROBE_RUN || 'r0';
    const facts = {app: app.name, run, dataset: app.dataset, url: app.baseURL, scripts: {}, summary: {}, rounds: []};
    const save = () => fs.writeFileSync(outFile('facts.json'), JSON.stringify(facts, null, 1));
    const cfg = require('path').isAbsolute(app.configFile) ? app.configFile : require('path').join(__dirname, '../../../../..', app.configFile);
    const minified = /^enable_minified\s*=\s*On/mi.test(fs.readFileSync(cfg, 'utf8'));
    facts.configFile = app.configFile;
    facts.enableMinified = minified;

    // ---- seed -------------------------------------------------------------
    const t = tag('u09ccK13a');
    const bi = {primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']};
    const plugins = {customblockmanagerplugin: {enabled: true}};
    if (hasStatic(app)) plugins.staticpagesplugin = {enabled: true};
    await app.api.createContext({tag: t, context: {name: `U09 K13a ${t}`, acronym: 'K13A', ...bi},
        users: [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}], plugins});
    const ctx = t;
    const mgr = `${t}mgr`;
    facts.seed = {ctx, mgr};
    const ITEM = 'K13a page';
    const SP_PATH = 'k13a-static';

    const web = (p = '') => app.url(`/index.php/${ctx}/en/management/settings/website${p}`);

    // a browser for a mode: its errors, console errors, dialogs, scripts
    const browser = async (mode) => {
        const b = await launch(app);
        const {page} = b;
        b.errors = [];
        b.dialogs = [];
        page.on('pageerror', (e) => b.errors.push({kind: 'pageerror', message: e.message, at: String(e.stack || '').split('\n').slice(1, 3).join(' | ').replace(/https?:\/\/[^/]+/g, '')}));
        page.on('console', (m) => { if (m.type() === 'error') b.errors.push({kind: 'console', message: m.text().slice(0, 300)}); });
        page.on('dialog', (d) => { b.dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
        page.on('response', async (r) => {
            const u = r.url();
            if (!/\/js\/pkp\.min\.js|\/js\/controllers\/SiteHandler\.js/.test(u)) return;
            const key = u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
            if (facts.scripts[key]) return;
            const body = await r.text().catch(() => '');
            const handler = (body.match(/deactivate['"],\s*function\s*\(\s*(\w+)\s*\)\s*\{(?:\s*\/\/[^\n]*)*[^;]{0,200}/) || [null])[0];
            facts.scripts[key] = {status: r.status(), handler: handler && handler.replace(/\s*\/\/[^\n]*/g, '').replace(/\s+/g, ' ').slice(0, 200),
                guarded: !!handler && /\.target\.initialized/.test(handler)};
        });
        if (mode === 'hold' || mode === 'reopen') await page.context().addInitScript(holdScript, {pattern: '-fr_CA-', ms: HOLD});
        if (mode === 'cpu') {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Emulation.setCPUThrottlingRate', {rate: CPU});
        }
        await signIn(page, mgr, {contextPath: ctx});
        await idle(page);
        return b;
    };

    // ---- the windows ------------------------------------------------------
    const W = {
        block: {
            form: 'form#customBlockForm',
            prefix: 'blockContent',
            async go(page) {
                await page.goto('about:blank');
                await page.goto(web());
                await idle(page);
                await page.locator('#plugins-button').first().click();
                await idle(page);
                const row = page.locator('tr.gridRow[id$="-row-customblockmanagerplugin"]').first();
                await row.waitFor({timeout: T});
                const id = await row.getAttribute('id');
                if (await row.locator('a.show_extras').count()) { await row.locator('a.show_extras').first().click(); await sleep(400); }
                await page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first().click();
                await this.manager(page).locator('.pkp_controllers_grid').first().waitFor({timeout: T});
                await idle(page);
            },
            manager: (page) => page.locator('[role="dialog"]:visible').filter({has: page.locator('[id*="customblockgrid"], [id*="customBlockGrid"], table[id*="customblock"]')}).first(),
            async open(page) {
                await this.manager(page).getByRole('link', {name: 'Add Block', exact: true}).first().click();
            },
        },
        itemAdd: {
            form: 'form#navigationMenuItemsForm',
            prefix: 'content',
            async go(page) {
                await H.openNav(page, app, ctx, 'en');
            },
            async open(page) {
                await page.getByRole('link', {name: 'Add item', exact: true}).click();
                await H.itemWindow(page).locator('select[name="menuItemType"]').waitFor({timeout: T});
                await H.itemWindow(page).locator('select[name="menuItemType"]').selectOption({label: 'Custom Page'});
            },
        },
        itemEdit: {
            form: 'form#navigationMenuItemsForm',
            prefix: 'content',
            async go(page) {
                await H.openNav(page, app, ctx, 'en');
            },
            async open(page) {
                await H.rowAction(page, 'items', ITEM, 'Edit');
            },
        },
        static: {
            form: 'form#staticPageForm',
            prefix: 'content',
            async go(page) {
                await page.goto('about:blank');
                await page.goto(web());
                await idle(page);
                await page.locator('[id="staticPages-button"]').first().click();
                await page.locator('#staticPageGridContainer .pkp_controllers_grid').first().waitFor({timeout: T});
                await idle(page);
            },
            async open(page) {
                const row = page.locator('#staticPageGridContainer tr.gridRow').filter({hasText: SP_PATH}).first();
                const id = await row.getAttribute('id', {timeout: T});
                if (await row.locator('a.show_extras').count()) { await row.locator('a.show_extras').first().click(); await sleep(300); }
                await page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: 'Edit', exact: true}).first().click();
            },
        },
    };
    const win = (page, w) => page.locator('[role="dialog"]:visible').filter({has: page.locator(W[w].form)}).last();

    /** Each language box of the open window: editor, initialized, spinner, aria-busy; the active editor. */
    const boxes = (page, w) => page.evaluate(({form, prefix}) => {
        const f = [...document.querySelectorAll(form)].pop();
        const out = {};
        if (!f) return {absent: true};
        f.querySelectorAll(`textarea[name^="${prefix}["]`).forEach((ta) => {
            const lang = (ta.name.match(/\[(.+)\]/) || [])[1];
            const ed = window.tinymce && tinymce.get(ta.id);
            const c = ed && ed.getContainer();
            const thr = c && c.querySelector('.tox-throbber');
            out[lang] = {
                id: ta.id,
                editor: !!ed,
                initialized: !!(ed && ed.initialized),
                spinner: !!(thr && getComputedStyle(thr).display !== 'none'),
                spinnerText: thr ? thr.innerText.trim() : null,
                busy: c ? c.getAttribute('aria-busy') : null,
                visible: !!(c && c.offsetParent),
            };
        });
        out.active = window.tinymce && tinymce.activeEditor ? (tinymce.activeEditor.id.match(/-(en|fr_CA)-/) || [])[1] || tinymce.activeEditor.id : null;
        out.held = window.__k13aHeld ? window.__k13aHeld.length : null;
        return out;
    }, {form: W[w].form, prefix: W[w].prefix}).catch((e) => ({error: String(e.message || e).split('\n')[0]}));

    const settledBoxes = async (page, w, budget) => {
        const end = Date.now() + budget;
        let b;
        for (;;) {
            b = await boxes(page, w);
            const langs = ['en', 'fr_CA'].map((l) => b[l]).filter(Boolean);
            if (langs.length === 2 && langs.every((x) => x.initialized && !x.spinner)) return b;
            if (Date.now() > end) return b;
            await sleep(250);
        }
    };

    /** A press on the English box and three letters typed; what the English editor holds after. */
    const pressEnglish = async (page, w, b) => {
        const id = b.en && b.en.id;
        if (!id) return {pressed: false, reason: 'no English box'};
        const out = {};
        // the "Content" boxes of other languages stay folded on some windows: the English one is shown
        const body = page.frameLocator(`[id="${id}_ifr"]`).locator('body');
        try {
            await body.click({timeout: 3000});
            out.pressed = true;
        } catch (e) {
            out.pressed = false;
            out.reason = String(e.message).split('\n').filter((l) => /intercepts|not visible|Timeout|waiting/.test(l)).slice(-2).join(' / ').slice(0, 300);
        }
        await page.keyboard.type('k13a', {delay: 20});
        await sleep(300);
        out.content = await page.evaluate((i) => {
            const ed = window.tinymce && tinymce.get(i);
            return ed && ed.initialized ? ed.getContent({format: 'text'}) : null;
        }, id).catch(() => null);
        out.focus = await page.evaluate(() => {
            const a = document.activeElement;
            return a ? `${a.tagName}${a.id ? '#' + a.id : ''}${a.className && typeof a.className === 'string' ? '.' + a.className.split(' ').slice(0, 2).join('.') : ''}` : null;
        }).catch(() => null);
        return out;
    };

    const closeWindow = async (page, w, b) => {
        const d = win(page, w);
        const asked0 = b.dialogs.length;
        // blur first: the legacy form notices a change on blur
        await d.locator('h1, h2').first().click().catch(() => {});
        await sleep(200);
        await d.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
        await sleep(700);
        const conf = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'The data on this form has changed'}).last();
        let pkpAsk = null;
        if (await conf.count()) {
            pkpAsk = (await conf.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
            await conf.getByRole('button', {name: /^(Yes|OK)$/}).first().click().catch(() => {});
            await sleep(500);
        }
        await page.locator(W[w].form).first().waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(700);   // pitfall 4f: the closed slot stays counted 450 ms
        return {asked: b.dialogs.slice(asked0).map((x) => x.message), pkpAsk, closed: !(await page.locator(`${W[w].form}:visible`).count())};
    };

    const snapName = (mode, w, i, extra = '') => `${mode}-${w}-${i}${extra}`;
    const roundOnce = async (b, mode, w, i, budget, opts = {}) => {
        const {page} = b;
        const from = b.errors.length;
        await W[w].open(page);
        await page.locator(W[w].form).first().waitFor({timeout: T});
        await idle(page);
        let bx = await settledBoxes(page, w, budget);
        const stuck = (x) => ['en', 'fr_CA'].some((l) => x[l] && (x[l].spinner || !x[l].initialized));
        let later = null;
        if (stuck(bx)) {
            await sleep(opts.forGood || 10_000);
            later = await boxes(page, w);
        }
        const r = {mode, window: w, round: i, ...opts.label ? {label: opts.label} : {}, boxes: bx, later, stuck: stuck(later || bx)};
        if (i === 1 || r.stuck || opts.snap) {
            const s = await screen(page);
            record(snapName(mode, w, i, opts.label ? `-${opts.label}` : ''), {...s, boxes: bx, later});
            await shot(page, snapName(mode, w, i, opts.label ? `-${opts.label}` : '')).catch(() => {});
        }
        r.press = await pressEnglish(page, w, later || bx);
        r.errors = b.errors.slice(from).map((e) => `${e.kind}: ${e.message}${e.at ? ' @ ' + e.at : ''}`);
        r.close = await closeWindow(page, w, b);
        facts.rounds.push(r);
        save();
        console.log(`[k13a] ${app.name} ${run} ${mode} ${w} #${i}${opts.label ? ' ' + opts.label : ''}: ${r.stuck ? 'STUCK' : 'ready'} en=${JSON.stringify(bx.en && {i: bx.en.initialized, s: bx.en.spinner})} fr=${JSON.stringify(bx.fr_CA && {i: bx.fr_CA.initialized, s: bx.fr_CA.spinner})} press=${r.press.pressed}/${JSON.stringify(r.press.content)} errors=${r.errors.length}`);
        return r;
    };

    // ---- seed through the screens: the item and the static page ---------------
    {
        const b = await browser('seed');
        const {page} = b;
        try {
            await H.openNav(page, app, ctx, 'en');
            record('seed-navigation', await screen(page));
            const r = await H.addItem(page, ITEM, 'Custom Page', {path: 'k13a-page'});
            facts.seed.item = {notice: r.notice, windowOpen: r.windowOpen, posts: r.posts};
            if (hasStatic(app)) {
                await W.static.go(page);
                record('seed-static-tab', await screen(page));
                await page.locator('#staticPageGridContainer').getByRole('link', {name: 'Add Static Page', exact: true}).click();
                const f = page.locator('form#staticPageForm').first();
                await f.waitFor({timeout: T});
                await idle(page);
                await f.locator('input[name="path"]').fill(SP_PATH);
                await f.locator('input[name="title[en]"]').fill('K13a static');
                const w = page.waitForResponse((x) => /static-pages|staticPages|updateStaticPage/i.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
                await win(page, 'static').getByRole('button', {name: 'Save', exact: true}).click();
                const resp = await w;
                await idle(page);
                await sleep(800);
                facts.seed.static = {status: resp ? resp.status() : null, rowShown: await page.locator('#staticPageGridContainer tr.gridRow').filter({hasText: SP_PATH}).count()};
            }
            facts.seed.errors = b.errors.map((e) => e.message);
        } finally {
            await b.close();
        }
        save();
    }

    // ---- the modes --------------------------------------------------------
    const windows = WINDOWS.filter((w) => w !== 'static' || hasStatic(app));
    for (const mode of MODES) {
        const n = mode === 'natural' ? ROUNDS : mode === 'cpu' ? CPU_ROUNDS : mode === 'hold' ? HOLD_ROUNDS : 1;
        const budget = mode === 'cpu' ? 20_000 : mode === 'natural' ? 8000 : HOLD + 8000;
        const b = await browser(mode);
        const {page} = b;
        try {
            for (const w of windows) {
                try {
                    await W[w].go(page);
                    if (mode === 'natural') {
                        record(`${mode}-${w}-0-behind`, await screen(page));
                        if (w === 'block') await loc(page, 'Custom Block Manager window: "Add Block"', W.block.manager(page).getByRole('link', {name: 'Add Block', exact: true}));
                        if (w === 'itemEdit') await loc(page, 'Navigation: the "Custom Page" item row', H.gridRow(page, 'items', ITEM));
                    }
                    if (mode === 'reopen') {
                        // held once, then the same window closed and opened again on the same page; then after a reload
                        const first = await roundOnce(b, mode, w, 1, budget, {label: 'held', snap: true});
                        await page.evaluate(() => { window.__k13aHold = false; });
                        const again = await roundOnce(b, mode, w, 2, 8000, {label: 'reopened', snap: true});
                        // the reload: the hold is on again on the new page, so switch it off before opening
                        await W[w].go(page);
                        await page.evaluate(() => { window.__k13aHold = false; });
                        const reloaded = await roundOnce(b, mode, w, 3, 8000, {label: 'reloaded', snap: true});
                        facts.summary[`${mode}/${w}`] = {held: first.stuck, reopened: again.stuck, reloaded: reloaded.stuck};
                        continue;
                    }
                    const rs = [];
                    for (let i = 1; i <= n; i++) {
                        rs.push(await roundOnce(b, mode, w, i, budget));
                        if (i % 4 === 0 && i < n) await W[w].go(page);   // a fresh page now and then: the race is decided at the window's start-up
                    }
                    facts.summary[`${mode}/${w}`] = {
                        rounds: rs.length,
                        stuck: rs.filter((r) => r.stuck).length,
                        stuckLang: [...new Set(rs.filter((r) => r.stuck).flatMap((r) => ['en', 'fr_CA'].filter((l) => (r.later || r.boxes)[l] && (r.later || r.boxes)[l].spinner)))],
                        pressRefused: rs.filter((r) => !r.press.pressed).length,
                        typedLost: rs.filter((r) => r.press.content !== 'k13a').length,
                        withErrors: rs.filter((r) => r.errors.length).length,
                        errors: [...new Set(rs.flatMap((r) => r.errors.map((e) => e.replace(/ @ .*/, ''))))].slice(0, 6),
                        held: rs.map((r) => r.boxes.held).filter((x) => x !== null),
                        closeAsked: [...new Set(rs.flatMap((r) => [...r.close.asked, r.close.pkpAsk].filter(Boolean)))],
                    };
                } catch (e) {
                    facts.summary[`${mode}/${w}`] = {error: String(e.stack || e).split('\n').slice(0, 3).join(' | ')};
                    await shot(page, `error-${mode}-${w}`).catch(() => {});
                    console.log(`[k13a] ${app.name} ${run} ${mode} ${w} ERROR ${e.message}`);
                }
                save();
            }
        } finally {
            await b.close();
        }
    }
    console.log(`[k13a] ${app.name} ${run} enable_minified=${minified ? 'On' : 'Off'} scripts=${JSON.stringify(facts.scripts)}`);
    console.log(`[k13a] ${app.name} ${run} summary ${JSON.stringify(facts.summary, null, 1)}`);
    save();
});
