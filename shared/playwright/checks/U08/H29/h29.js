// U08 housekeeping chunk H29 (incidentals row, 2026-10-29), checker cc29d: on the site's own
// pages (/index.php/index/index), does the Site Administrator's user-menu "Dashboard" show its
// unread-task number in a wide window, in the narrow "Open Menu" list, or both?
// Spec: docs/specs/U08-navigation-menus-and-site-chrome.md Rules 19b, 19c, register A27.
// Report: .reports/U08/cc-H29.md.
//
// Runs on a dataset fleet (PKP's default test dataset; harness.md "Dataset fleets"), twice per
// line, each run under its own PROBE_RUN, the main runs inside the app lock:
//   bin/app-lock.sh shared ojs -- env PROBE_RUN=r1 PROBE_FEATURE=issues-cc29d PKP_E2E_DATASET=7 \
//     PROBE_NOTES_FEATURE=U08 PROBE_AGENT=cc29d node bin/probe.js ojs shared/playwright/checks/U08/H29/h29.js
//   (omp, ops the same; then PROBE_RUN=r2)
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=s1 PROBE_FEATURE=issues-cc29d-3_5 PKP_E2E_DATASET=7 \
//     PROBE_NOTES_FEATURE=U08 PROBE_AGENT=cc29d node bin/probe.js all shared/playwright/checks/U08/H29/h29.js
//   (then PROBE_RUN=s2)
// On a campaign fleet it runs the same way with PROBE_FEATURE=U08 and no PKP_E2E_DATASET.
// PHASES=seed,read,zero narrows the phases (default all, in this order).
//   seed  one enabled scratch context (tag u08h29): the site's pages show a home page only
//         while two or more contexts are enabled (the dataset holds publicknowledge alone);
//         its author submits one submission there, a task for its managers (admin among them),
//         so admin's number is not 0 on every app (jobs drained with the kit's drainJobs())
//   read  `admin` and the dataset's editor `dbarnes` (control: no number expected) on the
//         site's home page, a 1280 px window, then 375 px with "Open Menu" pressed: every
//         user-menu entry's text, its rendered text, the .task_count element's text, computed
//         display and Playwright visibility; then "Dashboard" pressed at each width
//   zero  the other end of the number: admin's unread task notifications marked read (SQL),
//         the two reads again, then put back unread
// Files: h29-state[-<run>]-<app>.json (the seed, through outFile(); RESEED=1 seeds again),
// h29-facts[-<run>]-<app>.json (every fact). No other script is needed.
const fs = require('fs');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, tag, outFile, sql, note, drainJobs} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'read', 'zero'];
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');

forEachApp(async (app) => {
    const factsFile = outFile('h29-facts.json');
    const facts = fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : {};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${app.name}] ${k} ${JSON.stringify(v).slice(0, 1500)}`);
        fs.writeFileSync(factsFile, JSON.stringify(facts, null, 1));
    };
    const ct = app.contextTables;
    const stateFile = outFile('h29-state.json');
    const unread = (u) => sql(app, `select count(*) from notifications n join users u on u.user_id = n.user_id where u.username = '${u}' and n.level = 3 and n.date_read is null`);
    let st = fs.existsSync(stateFile) && !process.env.RESEED ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    const enabledNow = () => Number(sql(app, `select count(*) from ${ct.table} where enabled = 1`));
    if (on('seed') && !st) {
        const before = enabledNow();
        const t = tag('u08h29');
        const r = await app.api.createContext({tag: t, context: {name: `U08 H29 site ${t}`, acronym: 'H29', enabled: true},
            users: [{username: `${t}m`, roles: ['manager'], givenName: 'Hal', familyName: 'H29Manager'},
                {username: `${t}a`, roles: ['author'], givenName: 'Ada', familyName: 'H29Author'}]});
        const adminBefore = unread('admin');
        // one submission submitted there: a "needs an editor" task for its managers, admin among them
        // (createContext enrols the Site Administrator as a manager), so the number is not 0
        const sub = await app.api.createSubmission({tag: `${t}p`, context: r.path, submitter: `${t}a`, title: `H29 submitted ${t}`});
        await drainJobs(app).catch((e) => fact('drain-error', String(e).slice(0, 300)));
        st = {t, path: r.path, sub: sub.submissionId || sub.id, enabledBefore: before, enabledAfter: enabledNow(), adminUnreadBefore: adminBefore, adminUnreadAfter: unread('admin')};
        fs.writeFileSync(stateFile, JSON.stringify(st, null, 1));
        fact('seed', st);
    }

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    const SITE = app.url('/index.php/index/index');
    const wide = () => page.setViewportSize({width: 1280, height: 900});
    const narrow = () => page.setViewportSize({width: 375, height: 800});
    const snap = async (name, png = true) => {
        const s = await screen(page).catch((e) => ({error: String(e)}));
        record(name, s);
        if (png) await shot(page, name).catch(() => {});
        return s;
    };
    /** The user menu as rendered: per entry the DOM text, the rendered text, the count element. */
    const userMenu = () => page.evaluate(() => {
        const ul = document.getElementById('navigationUser');
        if (!ul) return null;
        const one = (a) => {
            const c = a.querySelector('.task_count');
            const cs = c ? getComputedStyle(c) : null;
            const r = c ? c.getBoundingClientRect() : null;
            const ar = a.getBoundingClientRect();
            return {text: a.textContent.replace(/\s+/g, ' ').trim(), shown: a.innerText.replace(/\s+/g, ' ').trim(),
                href: a.getAttribute('href'), linkShown: ar.width > 0 && ar.height > 0,
                count: c ? c.textContent.trim() : null, countDisplay: cs ? cs.display : null,
                countBox: r ? [Math.round(r.width), Math.round(r.height)] : null};
        };
        return [...ul.children].filter((li) => li.tagName === 'LI').map((li) => {
            const a = li.querySelector(':scope > a');
            const sub = li.querySelector(':scope > ul');
            return {...one(a), children: sub ? [...sub.querySelectorAll(':scope > li > a')].map(one) : null};
        });
    }).catch((e) => ({error: String(e)}));
    const dashLoc = () => page.locator('#navigationUser > li > ul a').filter({hasText: /Dashboard/}).first();
    const countVisible = async () => ({
        dashboardCount: await dashLoc().locator('.task_count').isVisible().catch(() => null),
        dashboardLink: await dashLoc().isVisible().catch(() => null),
        usernameCount: await page.locator('#navigationUser > li > a .task_count').first().isVisible().catch(() => null),
    });
    const readSite = async (key, user) => {
        await wide();
        await page.goto(SITE); await idle(page);
        const landedAt = rel(page.url());
        await snap(`${key}-wide`);
        const wideMenu = await userMenu();
        const wideVis = await countVisible();
        // hover the username, as a person opens the list in a wide window
        await page.locator('#navigationUser > li').filter({hasText: user}).first().hover().catch(() => {}); await sleep(400);
        const wideHoverVis = await countVisible();
        const wideHoverShown = await dashLoc().innerText().catch(() => null);
        await snap(`${key}-wide-hover`);
        await narrow(); await sleep(400);
        const toggle = page.locator('button.pkp_site_nav_toggle');
        const toggleInfo = await toggle.evaluate((b) => ({text: b.innerText.trim(), aria: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded')})).catch(() => null);
        const narrowClosedVis = await countVisible();
        await toggle.click().catch(() => {}); await sleep(600);
        await snap(`${key}-narrow-open`);
        const narrowMenu = await userMenu();
        const narrowVis = await countVisible();
        const narrowShown = await dashLoc().innerText().catch(() => null);
        // press "Dashboard" from the narrow list
        await dashLoc().click({timeout: 8000}).catch(() => {});
        await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {});
        const narrowDest = {url: rel(page.url()), title: await page.title()};
        await snap(`${key}-narrow-dashboard-dest`);
        // and from the wide list
        await wide();
        await page.goto(SITE); await idle(page);
        await page.locator('#navigationUser > li').filter({hasText: user}).first().hover().catch(() => {}); await sleep(400);
        await dashLoc().click({timeout: 8000}).catch(() => {});
        await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {});
        const wideDest = {url: rel(page.url()), title: await page.title()};
        await snap(`${key}-wide-dashboard-dest`, false);
        fact(key, {user, unread: unread(user), landedAt, wide: {menu: wideMenu, vis: wideVis, hoverVis: wideHoverVis, hoverShown: wideHoverShown},
            narrow: {toggle: toggleInfo, closedVis: narrowClosedVis, menu: narrowMenu, vis: narrowVis, shown: narrowShown},
            dest: {wide: wideDest, narrow: narrowDest}, enabled: enabledNow()});
    };

    try {
        if (on('read')) {
            await signIn(page, 'admin'); await idle(page).catch(() => {});
            await readSite('admin', 'admin');
            await signOut(page).catch(() => {});
            await signIn(page, 'dbarnes'); await idle(page).catch(() => {});
            await readSite('dbarnes', 'dbarnes');
            await signOut(page).catch(() => {});
        }
        if (on('zero')) {
            const ids = sql(app, `select n.notification_id from notifications n join users u on u.user_id = n.user_id where u.username = 'admin' and n.level = 3 and n.date_read is null`).split('\n').filter(Boolean);
            fact('zero-ids', ids);
            if (ids.length) sql(app, `update notifications set date_read = now() where notification_id in (${ids.join(',')})`);
            try {
                await signIn(page, 'admin'); await idle(page).catch(() => {});
                await readSite('admin-zero', 'admin');
                await signOut(page).catch(() => {});
            } finally {
                if (ids.length) sql(app, `update notifications set date_read = null where notification_id in (${ids.join(',')})`);
                fact('zero-restored', unread('admin'));
            }
        }
        fact('dialogs', dialogs);
        if (on('read') && process.env.PROBE_RUN === 'r1' && app.name === 'ojs') {
            note('cc29d: site pages user menu, narrow: page.setViewportSize 375 then button.pkp_site_nav_toggle ("Open Menu"); the Dashboard count is #navigationUser > li > ul a .task_count, read with isVisible() and getComputedStyle().display, not textContent (the text carries the number at both widths) (2026-10-29).');
        }
    } finally {
        await close();
    }
});
