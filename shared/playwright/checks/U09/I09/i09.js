// U09 claim check, chunk I09 (housekeeping 2026-10-09): incidentals row L14 against
// docs/specs/U09-custom-pages-and-blocks.md Rule 30b, register A19 (footnote f-a19) and A19's
// Coverage item. The question: with the block window open (Settings › Website › "Plugins" ›
// "Custom Block Manager" › "Manage Custom Blocks" › "Add Block", or a saved block's "Edit") and a
// change made only in "Content", does the browser ask "Leave site?" when the manager goes to
// another address, reloads, or presses a side-menu link, and is anything stored afterwards?
//
// What the script drives, per run, on a scratch context of its own (nothing on `publicknowledge`),
// as the scratch context's manager; one case = a fresh page load, the window, one change, one way out:
//   look    the screens as data: the "Custom Block Manager" window, the block window on "Add Block"
//           and on "Edit", every link the pointer can reach while the window is open, and
//           Appearance › "Setup" › "Sidebar" (the path the row names) with what a custom block's
//           line offers there
//   block   the block window. Change: "Content" only | "Block Name" only (the rule's control) |
//           "Show Name" ticked only | both boxes | nothing. Focus when leaving: the window's
//           heading pressed first | "Block Name" pressed first | the caret left in the changed box.
//           Way out: another address | a reload (and the F5 key) | presses where a side-menu link sits (the page
//           behind the window is covered: each press closes the window on top, until the link is
//           reached) | the window's own top bar: the initials button, then the profile link.
//           Answer: "Leave" | "Cancel" first, then "Leave". Afterwards: the list's rows, and for
//           "Edit" the saved block's name and text read again.
//   static  the comparison {OJS OMP}: the static page window, "Content" only, "Title" only and
//           "Path" only, then another address (Rule 30b's other half, walked 2026-10-01)
//   admin   the other permission level: the site administrator (a manager of every scratch
//           context), "Content" only on "Add Block", then another address
// No assertions: the script records, the reader judges. Facts: facts-<run>-<app>.json.
//
//   bin/app-lock.sh shared <app> -- env PROBE_FEATURE=U09 PROBE_AGENT=ccI09 PROBE_RUN=r1 \
//       node bin/probe.js <app> shared/playwright/checks/U09/I09/i09.js
//   PHASES=look,block,static,admin (default: all)   CASES=<key,key> narrows the block cases
//   CHUNK=a|b|c|d|e|f runs a part of it (a few minutes each, so a run holds the app lock briefly);
//   (chunk e's F5 cases record that the key reloads nothing: Playwright's keys reach the page, not the
//   browser's own shortcuts, headless or headed under xvfb, 2026-10-09; the reload there is `page.reload()`)
//   the chunks of one PROBE_RUN fold into the same facts file, each on a scratch context of its own
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, tag} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const CHUNKS = {
    a: {phases: 'look,block', cases: 'c-add-head-addr,c-add-caret-addr,c-add-name-addr,c-add-head-reload,c-edit-head-addr'},
    b: {phases: 'block', cases: 'c-add-head-link,c-edit-head-link,c-add-head-menu,c-edit-head-menu,u-add-addr,u-edit-addr'},
    c: {phases: 'block', cases: 'n-add-head-addr,n-add-caret-addr,n-add-head-reload,n-add-head-link,n-edit-head-addr,n-add-head-menu'},
    d: {phases: 'block,static,admin', cases: 's-add-addr,cn-add-head-addr'},
    e: {phases: 'block', cases: 'n-add-caret-reload,n-add-caret-f5,c-add-caret-f5'},
    f: {phases: 'static', cases: ''},
};
const CHUNK = process.env.CHUNK || '';
if (CHUNK && !CHUNKS[CHUNK]) throw new Error(`CHUNK is one of ${Object.keys(CHUNKS)}`);
const PHASES = (CHUNK ? CHUNKS[CHUNK].phases : process.env.PHASES || 'look,block,static,admin').split(',');
const CASES = CHUNK ? CHUNKS[CHUNK].cases.split(',') : process.env.CASES ? process.env.CASES.split(',') : null;
const on = (p) => PHASES.includes(p);
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const log = (...a) => console.log(`[i09 ${RUN}]`, ...a);

// key: window, change, what is pressed before leaving, way out, answers to a question
const BLOCK_CASES = [
    ['c-add-head-addr', 'add', 'content', 'heading', 'address', ['leave']],
    ['c-add-caret-addr', 'add', 'content', 'none', 'address', ['leave']],
    ['c-add-name-addr', 'add', 'content', 'name', 'address', ['leave']],
    ['c-add-head-reload', 'add', 'content', 'heading', 'reload', ['leave']],
    ['c-add-head-link', 'add', 'content', 'heading', 'sidelink', ['leave']],
    ['c-edit-head-addr', 'edit', 'content', 'heading', 'address', ['leave']],
    ['c-edit-head-link', 'edit', 'content', 'heading', 'sidelink', ['leave']],
    ['c-add-head-menu', 'add', 'content', 'heading', 'usermenu', ['leave']],
    ['c-edit-head-menu', 'edit', 'content', 'heading', 'usermenu', ['leave']],
    ['n-add-head-addr', 'add', 'name', 'heading', 'address', ['stay', 'leave']],
    ['n-add-caret-addr', 'add', 'name', 'none', 'address', ['leave']],
    ['n-add-head-reload', 'add', 'name', 'heading', 'reload', ['leave']],
    ['n-add-caret-reload', 'add', 'name', 'none', 'reload', ['leave']],
    ['n-add-caret-f5', 'add', 'name', 'none', 'f5', ['leave']],
    ['c-add-caret-f5', 'add', 'content', 'none', 'f5', ['leave']],
    ['n-add-head-link', 'add', 'name', 'heading', 'sidelink', ['stay', 'leave']],
    ['n-edit-head-addr', 'edit', 'name', 'heading', 'address', ['stay', 'leave']],
    ['n-add-head-menu', 'add', 'name', 'heading', 'usermenu', ['stay', 'leave']],
    ['s-add-addr', 'add', 'show', 'none', 'address', ['leave']],
    ['cn-add-head-addr', 'add', 'both', 'heading', 'address', ['leave']],
    ['u-add-addr', 'add', 'none', 'none', 'address', ['leave']],
    ['u-edit-addr', 'edit', 'none', 'none', 'address', ['leave']],
];

forEachApp(async (app) => {
    const {PluginsTab, SidebarSetup, StaticPagesTab} = require('../../../pages/CustomContentPages.js');
    const hasStatic = app.name !== 'ops';
    const facts = {};
    const fact = (k, v) => { facts[k] = v; record('facts', {[k]: v}, {merge: true}); log(app.name, k, JSON.stringify(v).slice(0, 900)); };

    // ------------------------------------------------------------------ seed
    const t = tag('u09i09');
    const MGR = `${t}mg`;
    const plugins = {customblockmanagerplugin: {enabled: true}};
    if (hasStatic) plugins.staticpagesplugin = {enabled: true};
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `U09 I09 ${RUN} ${t}`, acronym: 'ININE'},
        users: [{username: MGR, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}],
        plugins,
    });
    const CTX = ctx.path || t;
    const ELSEWHERE = app.url(`/index.php/${CTX}/en/management/settings/context`);
    const C = CHUNK ? `-${CHUNK}` : '';
    fact(`seed${C}`, {run: RUN, line: app.line || 'main', context: CTX, manager: MGR, elsewhere: ELSEWHERE});

    const {page} = await launch(app);
    const WHO = {name: MGR};   // the signed-in account, as the top bar's initials button names it
    const snap = async (name, extra = {}) => {
        const s = await screen(page).catch((e) => ({error: String(e.message || e)}));
        record(name, {...s, ...extra});
        await shot(page, name).catch(() => {});
        return s;
    };
    const guarded = async (name, fn) => {
        try { return await fn(); } catch (e) {
            fact(`ERROR-${name}`, flat(e.stack || e, 900));
            await shot(page, `error-${name}`).catch(() => {});
            return null;
        }
    };

    /** The page's form tracking as the browser holds it (an incidental read, never the claim). */
    const tracked = () => page.evaluate(() => {
        try {
            const h = window.$.pkp.classes.Handler.getHandler(window.$('body'));
            return Object.values(h.unsavedFormElements_ || {}).filter((x) => x !== undefined);
        } catch (e) { return `unreadable: ${e.message}`; }
    }).catch((e) => `unreadable: ${flat(e.message, 100)}`);

    /** Leave the page for good between cases, whatever it asks. */
    const park = async () => {
        const h = (d) => d.accept().catch(() => {});
        page.on('dialog', h);
        await page.goto('about:blank').catch(() => {});
        page.off('dialog', h);
    };

    /** Settings › Website › "Plugins" › the Custom Block Manager's arrow › "Manage Custom Blocks". */
    const openManager = async () => {
        await park();
        const tab = new PluginsTab(page, CTX, {locale: 'en'});
        await tab.goto();
        const manager = await tab.openBlockManager();
        return manager;
    };

    /** Every link the page shows outside the block window, and whether the pointer reaches it. */
    const reachableLinks = () => page.evaluate(() => {
        const out = [];
        const form = document.querySelector('form#customBlockForm, form#staticPageForm');
        for (const a of document.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript')) continue;
            const r = a.getBoundingClientRect();
            if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            const top = document.elementFromPoint(x, y);
            const land = a.closest('nav[aria-label], [role="dialog"], header, main, footer');
            out.push({
                text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60),
                href: href.replace(/^https?:\/\/[^/]+/, ''),
                where: land ? `${land.tagName.toLowerCase()}${land.getAttribute('aria-label') ? `[${land.getAttribute('aria-label')}]` : ''}${land.getAttribute('role') ? `[${land.getAttribute('role')}]` : ''}` : null,
                inWindow: !!(form && form.closest('[role="dialog"]') && form.closest('[role="dialog"]').contains(a)),
                reached: !!(top && a.contains(top)),
                covering: top && !a.contains(top) ? `${top.tagName.toLowerCase()}.${String(top.className && top.className.baseVal !== undefined ? top.className.baseVal : top.className).replace(/\s+/g, '.').slice(0, 80)}` : null,
                x, y,
            });
        }
        return out;
    });

    /**
     * A side-menu link that leads away from this page, and a point of it the pointer can press:
     * on the link itself, or on the shade a window lays over the page (a window's panel may
     * cover the rest of the link).
     */
    const sideLink = () => page.evaluate(() => {
        const here = location.pathname;
        const nav = [...document.querySelectorAll('nav[aria-label]')].find((n) => /Site Navigation/.test(n.getAttribute('aria-label')));
        if (!nav) return null;
        const cls = (e) => String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className);
        let shaded = null;
        for (const a of nav.querySelectorAll('a[href]')) {
            const href = (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '');
            if (!href || href.startsWith('#') || href.split('#')[0] === here) continue;
            const r = a.getBoundingClientRect();
            if (!r.width || !r.height || r.top < 0 || r.bottom > window.innerHeight) continue;
            const y = Math.round(r.top + r.height / 2);
            for (let x = Math.round(r.left + 6); x < r.right - 4; x += 6) {
                const top = document.elementFromPoint(x, y);
                if (!top) continue;
                const link = {text: a.innerText.replace(/\s+/g, ' ').trim().slice(0, 60), href, x, y};
                if (a.contains(top)) return {...link, reached: true, covering: null};
                if (!shaded && /DialogOverlay/.test(cls(top))) shaded = {...link, reached: false, covering: `${top.tagName.toLowerCase()}.${cls(top).replace(/\s+/g, '.').slice(0, 60)}`};
            }
        }
        return shaded;
    });

    // One attempt to leave; returns what the browser asked and where the manager is afterwards.
    const leave = async (key, how, answer, form) => {
        const asked = [];
        const handler = (d) => {
            asked.push({type: d.type(), message: d.message()});
            (answer === 'leave' ? d.accept() : d.dismiss()).catch(() => {});
        };
        page.on('dialog', handler);
        await page.evaluate((k) => { window.__i09 = k; }, key);
        const from = page.url();
        let nav = null, pressed = null;
        const first = (e) => flat(String(e.message || e).split('\n')[0], 160);
        if (how === 'address') nav = await page.goto(ELSEWHERE, {timeout: T}).then((r) => ({status: r ? r.status() : null})).catch((e) => ({error: first(e)}));
        if (how === 'reload') nav = await page.reload({timeout: T}).then((r) => ({status: r ? r.status() : null})).catch((e) => ({error: first(e)}));
        if (how === 'f5') {
            // The reload key, pressed where the caret is (`newPageLoaded` says whether the browser took it)
            await page.keyboard.press('F5');
            nav = {key: 'F5'};
        }
        if (how === 'sidelink') {
            pressed = await sideLink();
            if (pressed) await page.mouse.click(pressed.x, pressed.y);
        }
        if (how === 'usermenu') {
            // The window carries the page's top bar: the initials button, then the profile link
            const profile = async () => (await reachableLinks()).find((l) => l.reached && /\/user\/profile/.test(l.href)) || null;
            pressed = await profile();
            if (!pressed) {
                await page.locator('[role="dialog"]:visible').filter({has: page.locator('form#customBlockForm, form#staticPageForm')}).last()
                    .getByRole('button', {name: WHO.name}).first().click();
                await sleep(600);
                pressed = await profile();
            }
            if (pressed) await page.mouse.click(pressed.x, pressed.y);
            else pressed = {none: 'no profile link reachable', offered: (await reachableLinks()).filter((l) => l.reached).map((l) => `${l.text} | ${l.href}`)};
        }
        await sleep(2500);
        await idle(page).catch(() => {});
        page.off('dialog', handler);
        const sameDocument = await page.evaluate(() => window.__i09 || null).catch(() => 'unreadable');
        return {
            how, answer, asked, nav, pressed,
            from: from.replace(/^https?:\/\/[^/]+/, ''), url: page.url().replace(/^https?:\/\/[^/]+/, ''),
            newPageLoaded: sameDocument !== key,
            windowOpen: await form.isVisible().catch(() => false),
        };
    };

    // ------------------------------------------------------------------ sign in, one saved block
    await signIn(page, MGR, {contextPath: CTX});
    let SAVED = null;          // the saved block's row name
    const SAVED_NAME = `Partners ${t}`;
    const SAVED_TEXT = 'First saved text.';
    await guarded('saved-block', async () => {
        const manager = await openManager();
        fact(`manager-empty${C}`, {rows: await manager.rowNames(), empty: await manager.emptyRow.isVisible().catch(() => null)});
        const win = await manager.addBlock();
        await win.nameInput('en').click();
        await page.keyboard.type(SAVED_NAME);
        await win.content('en').type(SAVED_TEXT);
        const status = await win.save();
        await win.form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page);
        const rows = await manager.rowNames();
        SAVED = rows[0] || null;
        fact(`saved-block${C}`, {status, rows, saved: SAVED});
    });

    /** Read the list again on a fresh load, and the saved block's boxes through "Edit". */
    const stored = async (readSaved) => {
        const manager = await openManager();
        const out = {rows: await manager.rowNames()};
        if (readSaved && SAVED) {
            const win = await manager.editBlock(SAVED);
            out.savedName = await win.nameInput('en').inputValue();
            out.savedText = flat(await win.content('en').text());
            out.savedShowName = await win.showNameBox.isChecked();
            await win.cancel();
            await win.form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        }
        return out;
    };

    // ------------------------------------------------------------------ look
    if (on('look')) {
        await guarded('look', async () => {
            const manager = await openManager();
            await snap('look-manager');
            await loc(page, 'the "Custom Block Manager" window\'s list', manager.grid);
            await loc(page, '"Add Block"', manager.addLink);
            let win = await manager.addBlock();
            await snap('look-block-add');
            await loc(page, 'the block window\'s form', win.form);
            await loc(page, '"Block Name" (English)', win.nameInput('en'));
            await loc(page, '"Content" (English), the box\'s textarea', win.content('en').textarea);
            await loc(page, '"Show Name" box', win.showNameBox);
            await loc(page, '"Save"', win.saveButton);
            await loc(page, '"Cancel"', win.cancelLink);
            const links = await reachableLinks();
            fact('look-links-with-window-open', {
                outsideReached: links.filter((l) => !l.inWindow && l.reached).map((l) => `${l.where} | ${l.text} | ${l.href}`),
                outsideCovered: links.filter((l) => !l.inWindow && !l.reached).map((l) => `${l.where} | ${l.text} | ${l.href} | under ${l.covering}`),
                inWindow: links.filter((l) => l.inWindow).map((l) => `${l.text} | ${l.href} | ${l.reached ? 'reached' : `under ${l.covering}`}`),
            });
            fact('look-window-controls', await win.root.evaluate((root) => ({
                closeControls: [...root.querySelectorAll('button, a')].filter((e) => e.offsetParent !== null && !e.closest('.tox-tinymce'))
                    .map((e) => `${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim()}"`),
                boxes: [...root.querySelectorAll('input:not([type=hidden]), textarea, select')].map((e) => `${e.tagName.toLowerCase()}[name="${e.getAttribute('name')}"]${e.type ? `[type=${e.type}]` : ''}${e.offsetParent === null ? ' (not shown)' : ''}`),
            })));
            // The window's own top bar: the help link, "Tasks", the initials button and its menu
            fact('look-window-top-bar', await guarded('look-top-bar', async () => {
                const help = await win.root.locator('a[href*="docs.pkp"]').first().evaluate((a) => ({href: a.href, target: a.getAttribute('target'), name: a.innerText.trim()})).catch(() => null);
                const before = (await reachableLinks()).filter((l) => l.reached).map((l) => `${l.text} | ${l.href}`);
                await win.root.getByRole('button', {name: WHO.name}).first().click();
                await sleep(600);
                await snap('look-block-add-user-menu');
                const menu = (await reachableLinks()).filter((l) => l.reached).map((l) => `${l.text} | ${l.href}`).filter((l) => !before.includes(l));
                await win.root.getByRole('button', {name: WHO.name}).first().click();
                await sleep(400);
                return {help, userMenuLinks: menu, windowStillOpen: await win.form.isVisible()};
            }));
            await win.cancel();
            await win.form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            if (SAVED) {
                await sleep(600);
                win = await manager.editBlock(SAVED);
                await snap('look-block-edit', {name: await win.nameInput('en').inputValue(), text: flat(await win.content('en').text())});
                await win.cancel();
                await win.form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            }
            // The path the row names: Appearance › "Setup" › "Sidebar" › a custom block
            await park();
            const setup = new SidebarSetup(page, CTX, {locale: 'en'});
            await setup.goto();
            await idle(page);
            await snap('look-sidebar');
            fact('look-sidebar', await setup.form.evaluate((form) => {
                const box = form.querySelector('input[name="sidebar"]');
                const field = box ? box.closest('fieldset, .pkpFormField') || form : form;
                return {
                    lines: [...field.querySelectorAll('input[name="sidebar"]')].map((i) => `${(i.closest('label, li') || i.parentElement).innerText.replace(/\s+/g, ' ').trim()} = ${i.value}${i.checked ? ' (ticked)' : ''}`),
                    linksAndButtons: [...field.querySelectorAll('a, button')].filter((e) => e.offsetParent !== null).map((e) => `${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()}"`),
                };
            }));
        });
    }

    // ------------------------------------------------------------------ block
    const blockCase = async (who, [key, which, change, press, how, answers]) => {
        const k = `${who}-${key}`;
        await guarded(k, async () => {
            const manager = await openManager();
            const rowsBefore = await manager.rowNames();
            const win = which === 'edit' ? await manager.editBlock(SAVED) : await manager.addBlock();
            const typedText = `Unsaved ${key} text`;
            const typedName = which === 'edit' ? ' renamed' : `Unsaved ${key}`;
            if (change === 'content' || change === 'both') await win.content('en').type(which === 'edit' ? ` ${typedText}` : typedText);
            if (change === 'name' || change === 'both') {
                await win.nameInput('en').click();
                await page.keyboard.press('End');
                await page.keyboard.type(typedName);
            }
            if (change === 'show') await win.showNameBox.click();
            if (press === 'heading') await win.blur();
            if (press === 'name') await win.nameInput('en').click();
            await sleep(400);
            const held = {
                name: await win.nameInput('en').inputValue(),
                text: flat(await win.content('en').text()),
                showName: await win.showNameBox.isChecked(),
                focusOn: await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.name ? `[name="${a.name}"]` : ''}${a.id && /_ifr$/.test(a.id) ? ' (the Content box)' : ''}` : null; }),
                tracked: await tracked(),
            };
            await snap(`${k}-1-changed`, {held});
            const attempts = [];
            for (const answer of answers) {
                const a = await leave(k, how, answer, win.form);
                if (a.windowOpen) {
                    a.kept = {name: await win.nameInput('en').inputValue().catch(() => null), text: flat(await win.content('en').text().catch(() => null))};
                }
                attempts.push(a);
                await snap(`${k}-2-after-${attempts.length}`, {attempt: a});
                // A question asked and answered "Leave", or a way out that asked nothing: done
                if (a.newPageLoaded || !a.asked.length) break;
            }
            const last = attempts[attempts.length - 1];
            // A press beside the window closes it without leaving the page: follow the link now, after
            // the closed window's page-leave handler has had its two seconds (patterns.md, Probe kit)
            let followed = null;
            if (how === 'sidelink' && !last.newPageLoaded && !last.windowOpen) {
                followed = [];
                for (let n = 2; n <= 4; n++) {
                    const link = await sideLink();
                    if (!link) break;
                    const asked = [];
                    const h = (d) => { asked.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); };
                    page.on('dialog', h);
                    await page.mouse.click(link.x, link.y);
                    await sleep(2500);
                    await idle(page).catch(() => {});
                    page.off('dialog', h);
                    const press = {press: n, link: `${link.text} | ${link.href}`, reached: link.reached, covering: link.covering, asked,
                        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
                        newPageLoaded: (await page.evaluate(() => window.__i09 || null).catch(() => 'unreadable')) !== k,
                        managerOpen: await manager.grid.isVisible().catch(() => false)};
                    followed.push(press);
                    await snap(`${k}-3-press-${n}`, {press});
                    if (press.newPageLoaded) break;
                }
            }
            const after = await stored(which === 'edit');
            fact(k, {who, window: which, change, pressedBefore: press, rowsBefore, held, attempts, followed, after,
                newRow: after.rows.filter((r) => !rowsBefore.includes(r))});
        });
    };

    if (on('block')) {
        for (const c of BLOCK_CASES) {
            if (CASES && !CASES.includes(c[0])) continue;
            if (c[1] === 'edit' && !SAVED) { fact(`mgr-${c[0]}`, {skipped: 'no saved block'}); continue; }
            await blockCase('mgr', c);
        }
    }

    // ------------------------------------------------------------------ static {OJS OMP}
    if (on('static') && hasStatic) {
        for (const [key, change] of [['st-c-addr', 'content'], ['st-t-addr', 'title'], ['st-p-addr', 'path']]) {
            await guarded(key, async () => {
                await park();
                const tab = new StaticPagesTab(page, CTX, {locale: 'en'});
                await tab.goto();
                await tab.tabButton.click().catch(() => {});
                await tab.waitList();
                const rowsBefore = await tab.rowCells();
                const win = await tab.addPage();
                if (change === 'content') await win.content('en').type(`Unsaved ${key} text`);
                if (change === 'title') { await win.titleInput('en').click(); await page.keyboard.type('x'); }
                if (change === 'path') { await win.pathInput.click(); await page.keyboard.type('x'); }
                await win.heading.click();
                await sleep(400);
                const held = {path: await win.pathInput.inputValue(), title: await win.titleInput('en').inputValue(), text: flat(await win.content('en').text()), tracked: await tracked()};
                await snap(`${key}-1-changed`, {held});
                const a = await leave(key, 'address', 'leave', win.form);
                await snap(`${key}-2-after`, {attempt: a});
                await park();
                await tab.goto();
                await tab.tabButton.click().catch(() => {});
                await tab.waitList();
                fact(key, {window: 'static page, "Add Static Page"', change, rowsBefore, held, attempt: a, rowsAfter: await tab.rowCells()});
            });
        }
    }

    // ------------------------------------------------------------------ admin
    if (on('admin')) {
        await guarded('admin', async () => {
            await park();
            await signIn(page, 'admin', {contextPath: CTX});
            WHO.name = 'admin';
            await blockCase('admin', BLOCK_CASES.find((c) => c[0] === 'c-add-head-addr'));
            await blockCase('admin', BLOCK_CASES.find((c) => c[0] === 'n-add-head-addr'));
        });
    }
    await park();
    fact(`done${C}`, {at: new Date().toISOString(), errors: Object.keys(facts).filter((k) => k.startsWith('ERROR-'))});
});
