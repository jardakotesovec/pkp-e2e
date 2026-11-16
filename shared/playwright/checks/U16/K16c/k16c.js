// U16 claim check, chunk K16c (an incidentals chunk, docs/tracking/incidentals.md): a category path that
// differs from another only in letter case, on each database. Spec: docs/specs/U16-categories.md, Fields
// row "Path" (its case sentences), canonical scenario S1 "A path in capitals" and "The old address and the
// address in capitals", Rule 5 "The path is the address" (case and address sentences), Rule 13 "An unknown
// path"; footnotes d, g, td2.
//
// One entry script, no other script and no state file. Run it twice per database, each run under its own
// PROBE_RUN, one after the other (two runs seeding one MySQL database at once disturbed its index):
//
//   PROBE_RUN=r1 PROBE_FEATURE=U16 PROBE_AGENT=ccK16c node bin/probe.js all shared/playwright/checks/U16/K16c/k16c.js
//   PROBE_RUN=my1 PKP_E2E_LINE=mysql PROBE_FEATURE=cfg-mysql PROBE_AGENT=ccK16c PROBE_NOTES_FEATURE=U16 \
//       node bin/probe.js all shared/playwright/checks/U16/K16c/k16c.js
//   PROBE_RUN=ma1 PKP_E2E_LINE=mariadb PROBE_FEATURE=cfg-mariadb PROBE_AGENT=ccK16c PROBE_NOTES_FEATURE=U16 \
//       node bin/probe.js all shared/playwright/checks/U16/K16c/k16c.js
//   (r2, my2, ma2 the same.) PostgreSQL is the slot's U16 fleet; MySQL 8.0 and MariaDB 10.11 the lines'
//   fleets (.reports/cfg-mysql/fleet.json, .reports/cfg-mariadb/fleet.json), fresh installs of `main`.
//
// Per app: a scratch journal (press, server) with a throwaway Journal (Press, Server) Manager `${tag}mg`,
// no category. As the manager, Settings › Journal (Press, Server) › "Categories": "Add Category" "Arts"
// (path "arts"), "Science" ("science"), then "Crafts" with "ARTS" and "Weaving" with "Arts" (a refused one
// is retried with "crafts" / "weaving"); the tab reloaded; "Crafts" opened in "Edit Category", its name
// changed and the window closed unsaved; "Science" edited to "SCIENCE" and reopened after a reload. As a
// visitor, signed out, and as the manager: each category address in other capitals, and an unknown path.
//
// Outputs (.reports/<feature>/ccK16c/): k16c-<step>-<run>-<app>.json, each with the kit's screen() and the
// step's facts (the categories API's status and body for a save); k16c-facts-<run>-<app>.json the digest;
// run-<run>-<app>-*.json the run record (crashes, notices, dialogs). No assertions: the reader judges.
const {expect} = require('@playwright/test');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag} = require('../../../probe');

const T = 30_000;

forEachApp(async (app) => {
    const {CategoriesTab, CategoryWindow, CategoryPage} = require('../../../pages/CategoriesPages.js');
    const t = tag('u16k16c');
    const mg = `${t}mg`;
    const word = app.name === 'ops' ? 'preprints' : 'catalog';
    const facts = {line: app.line || 'main', database: process.env.PKP_E2E_DATABASE || 'pgsql', context: t, steps: {}};
    await app.api.createContext({
        tag: t,
        users: [{username: mg, givenName: 'Mona', familyName: 'Manager', email: `${mg}@mail.test`, roles: ['manager']}],
    });

    const {page, close} = await launch(app);
    const visitor = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message()});
        await d.accept().catch(() => {});
    });
    const tab = new CategoriesTab(page, t);

    /** Record a step's screen and facts; keep the facts in the digest. */
    async function step(name, data, p = page) {
        const scr = await screen(p);
        record(`k16c-${name}`, {...data, screen: scr});
        facts.steps[name] = {...data, notices: scr.notices};
        return scr;
    }

    /** What the window shows after a save: open or not, the "Path" messages, the footer summary. */
    async function windowState(win) {
        const open = (await win.root().count()) > 0 && (await win.pathBox().isVisible().catch(() => false));
        return {
            open,
            pathValue: open ? await win.pathBox().inputValue().catch(() => null) : null,
            pathErrors: open ? (await win.fieldErrors('Path').allInnerTexts()).map((s) => s.trim()) : [],
            nameErrors: open ? (await win.fieldErrors('Name').allInnerTexts()).map((s) => s.trim()) : [],
            summary: open ? (await win.errorSummary().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : null,
            saveEnabled: open ? await win.saveButton().isEnabled().catch(() => null) : null,
        };
    }

    /** Press "Save" and read the answer and the window; on an accepted save wait for the tab to list the name. */
    async function saveAndRead(win, name, stepName, extra = {}) {
        const resp = await win.save();
        let body = null;
        try {
            body = await resp.json();
        } catch (e) {
            body = null;
        }
        const status = resp.status();
        if (status === 200) {
            await expect(win.root()).toHaveCount(0, {timeout: T});
            await expect(tab.row(name)).toBeVisible({timeout: T});
        } else {
            await expect(win.fieldErrors('Path').first()).toBeVisible({timeout: T}).catch(() => {});
        }
        const state = await windowState(win);
        const names = (await tab.nameCells().allInnerTexts()).map((s) => s.trim());
        await step(stepName, {...extra, name, status, body, ...state, tabNames: names});
        return {status, ...state};
    }

    async function add(name, path, stepName) {
        const win = await tab.openAdd();
        await win.nameBox('en').fill(name);
        await win.pathBox().fill(path);
        const r = await saveAndRead(win, name, stepName, {typedPath: path});
        return {win, ...r};
    }

    async function retry(win, name, path, stepName) {
        await win.pathBox().fill(path);
        return saveAndRead(win, name, stepName, {typedPath: path, retry: true});
    }

    /** A category address: status, heading, header and link counts, the screen. */
    async function visit(p, path, who) {
        const cat = new CategoryPage(p, t, {word});
        const resp = await p.goto(cat.url(path));
        await idle(p);
        const h1 = await p.getByRole('heading', {level: 1}).first().innerText({timeout: 5000}).catch(() => null);
        const read = {
            who,
            address: cat.url(path),
            status: resp ? resp.status() : null,
            heading: h1 ? h1.trim() : null,
            headerCount: await p.locator('header, .pkp_structure_head').count(),
            linkCount: await p.locator('a').count(),
            title: await p.title(),
        };
        await step(`visit-${who}-${path}`, read, p);
        return read;
    }

    try {
        await signIn(page, mg, {contextPath: t});
        await tab.goto();
        await step('01-tab-empty', {names: (await tab.nameCells().allInnerTexts()).map((s) => s.trim())});
        await loc(page, 'the "Categories" tab table', tab.table());

        facts.arts = (await add('Arts', 'arts', '02-add-arts')).status;
        facts.science = (await add('Science', 'science', '03-add-science')).status;

        // "Crafts" with "ARTS": the path differs from "arts" only in case.
        let r = await add('Crafts', 'ARTS', '04-add-crafts-ARTS');
        facts.craftsUpper = {status: r.status, pathErrors: r.pathErrors, summary: r.summary, open: r.open, saveEnabled: r.saveEnabled};
        if (r.status !== 200) {
            await shot(page, 'k16c-04-refused');
            await loc(page, 'the "Path" field error', r.win.fieldErrors('Path').first());
            const again = await retry(r.win, 'Crafts', 'crafts', '05-crafts-retry-lower');
            facts.craftsPath = again.status === 200 ? 'crafts' : `refused ${again.status}`;
        } else {
            facts.craftsPath = 'ARTS';
        }

        // "Weaving" with "Arts": a mixed-case variant of "arts" (the other end of "only in case").
        r = await add('Weaving', 'Arts', '06-add-weaving-Arts');
        facts.weavingMixed = {status: r.status, pathErrors: r.pathErrors, summary: r.summary, open: r.open};
        if (r.status !== 200) {
            const again = await retry(r.win, 'Weaving', 'weaving', '07-weaving-retry-lower');
            facts.weavingPath = again.status === 200 ? 'weaving' : `refused ${again.status}`;
        } else {
            facts.weavingPath = 'Arts';
        }

        // The tab after a reload (the read that rests on the stored rows).
        await tab.reload();
        facts.tabAfterReload = (await tab.nameCells().allInnerTexts()).map((s) => s.trim());
        await step('08-tab-reload', {names: facts.tabAfterReload});

        // "Crafts" reopened: its stored path; then a name change left unsaved through "Close".
        let win = await tab.openEdit('Crafts');
        facts.craftsStoredPath = await win.pathBox().inputValue();
        await step('09-edit-crafts', {storedPath: facts.craftsStoredPath});
        await win.nameBox('en').fill('Crafts changed');
        await win.nameBox('en').blur();
        const before = dialogs.length;
        await win.closeButton().click();
        await page.waitForTimeout(2500);
        facts.leaveUnsaved = {
            dialogs: dialogs.slice(before),
            windowOpen: (await page.getByRole('dialog', {name: 'Edit Category'}).count()) > 0,
        };
        await step('09b-closed-unsaved', facts.leaveUnsaved);
        await tab.reload();
        facts.namesAfterUnsavedClose = (await tab.nameCells().allInnerTexts()).map((s) => s.trim());
        await step('09c-tab-after-unsaved-close', {names: facts.namesAfterUnsavedClose});

        // "Science" edited to "SCIENCE": another case of its own path.
        win = await tab.openEdit('Science');
        await win.pathBox().fill('SCIENCE');
        r = await saveAndRead(win, 'Science', '10-edit-science-SCIENCE', {typedPath: 'SCIENCE'});
        facts.scienceUpper = {status: r.status, pathErrors: r.pathErrors, open: r.open};
        if (r.open) await win.closeButton().click().catch(() => {});
        await tab.reload();
        win = await tab.openEdit('Science');
        facts.scienceStoredPath = await win.pathBox().inputValue();
        await step('11-edit-science-reopened', {storedPath: facts.scienceStoredPath});
        await win.closeButton().click();
        await expect(page.getByRole('dialog', {name: 'Edit Category'})).toHaveCount(0, {timeout: T});

        // The addresses, as a visitor signed out and as the manager.
        const paths = ['arts', 'ARTS', 'Arts', 'aRtS', 'crafts', 'CRAFTS', 'weaving', 'WEAVING', 'science', 'SCIENCE', 'Science', `${t}nosuch`];
        facts.visits = {visitor: {}, manager: {}};
        for (const p of paths) {
            const v = await visit(visitor.page, p, 'visitor');
            facts.visits.visitor[p] = `${v.status} ${v.heading}`;
        }
        await shot(visitor.page, 'k16c-visit-unknown');
        for (const p of ['ARTS', 'Arts', 'science', `${t}nosuch`]) {
            const v = await visit(page, p, 'manager');
            facts.visits.manager[p] = `${v.status} ${v.heading}`;
        }
    } catch (e) {
        facts.error = String(e && e.stack ? e.stack : e).slice(0, 1500);
        await shot(page, 'k16c-error').catch(() => {});
    } finally {
        facts.dialogs = dialogs;
        record('k16c-facts', facts);
        console.log(JSON.stringify({app: app.name, ...facts, steps: undefined}, null, 1));
        await visitor.close();
        await close();
    }
});
