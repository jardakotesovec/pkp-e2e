// U63 I09, row L9's control on stable-3_5_0 {OJS}: an article that reads "Marked registered", unpublished.
// 3.5 has no "Needs Sync" and no "Failed" status (its DOAJ tool is plugins/importexport/doaj), so the control reads
// what its Articles list shows and what is stored. The daily task is not run there (3.5 deposits inside the task,
// with no job). The seed's `published` key reaches a main-only method on 3.5, so the articles are seeded in Production and
// published on screen (Publication › "Issue" › "Assign to Issue", then "Publish").
const {signIn, signOut, idle, tag, note} = require('../../../probe');
const {T, sleep, flat} = require('./lib');
const {helpers} = require('../I01/doaj');

const LIST = '#submissionsListGridContainer .pkp_controllers_grid';
const FORM = 'form#exportSubmissionXmlForm';
const ISSUE = {volume: 1, number: 1, year: 2025};
const ARTICLES = [['a', 'Quokka dawn foraging'], ['b', 'Bittern reed calls'], ['c', 'Caracal ear tufts']];

async function rowL9on35(c) {
    const {page, fact, snap, app, S, save} = c;
    const h = helpers(c);
    const o = {line: app.line || 'main'};
    if (!S.D) {
        const t = tag(`u63i09${c.RUN.replace(/[^a-z0-9]/g, '')}d`);
        await app.api.createContext({tag: t, context: {name: `U63 I09 D ${t}`, acronym: 'I09D', contactName: 'I09 Contact', contactEmail: `${t}c@mail.test`, country: 'CA'},
            issues: [{...ISSUE, published: true}],
            users: [{username: `${t}m`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Lovelace'}]});
        const D = {path: t, m: `${t}m`, subs: {}};
        for (const [k, title] of ARTICLES) {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`.slice(0, 32), context: t, submitter: `${t}au`, title, decisions: ['skipExternalReview', 'sendToProduction']});
                D.subs[k] = {id: r.submissionId, pub: r.publicationId, title};
            } catch (e) { D.seedError = flat(e.message, 400); break; }
        }
        S.D = D; save();
        note(`3.5 scratch journal D ${t} (Journal Manager ${t}m) for row L9's control.`);
    }
    const D = S.D;
    o.seed = D;
    if (D.seedError) { fact(`L9-35-${app.name}`, o); return; }
    const ids = Object.fromEntries(Object.entries(D.subs).map(([k, v]) => [k, v.id]));
    const byTitle = (list) => Object.fromEntries(ARTICLES.map(([k, title]) => [k, ((list && list.rows || []).find((r) => r.cells.join(' ').includes(title)) || {cells: ['(no row)']}).cells.slice(-1)[0]]));
    const stored = () => Object.fromEntries(ARTICLES.map(([k]) => [k, c.q(`select coalesce((select setting_value from submission_settings where submission_id=${ids[k]} and setting_name='doaj::status'),'-') || ' / pub status ' || (select string_agg(status::text, ',') from publications where submission_id=${ids[k]})`)[0]]));
    const articles = async (label) => {
        const l = await h.openDoaj(D.path, 'Articles');
        const s = await snap(label);
        return {tabs: l.tabs, status: byTitle(l.list), rows: h.brief(l.list), empty: l.list && l.list.empty, notices: s.notices, snap: s.label};
    };
    /** 3.5: Publication › "Issue" › "Assign to Issue" (the issue, "Save"), then the header's "Publish" and its window. */
    const publish35 = async (sid, label) => {
        const r = {};
        await page.goto(c.cu(D.path, `/en/dashboard/editorial?workflowSubmissionId=${sid}&workflowMenuKey=publication_issue`));
        await idle(page).catch(() => {});
        const controls = page.locator('[data-cy="workflow-controls-right"]');
        await controls.waitFor({timeout: T}).catch(() => {});
        await sleep(1500);
        const assign = page.getByRole('button', {name: /^(Assign to Issue|Change Issue)$/}).first();
        if (await assign.isVisible().catch(() => false)) {
            await assign.click();
            const win = page.getByRole('dialog').filter({has: page.locator('select[name="issueId"]')}).last();
            const select = win.locator('select[name="issueId"]');
            await select.waitFor({state: 'visible', timeout: T});
            const value = await select.locator('option').filter({hasText: 'Vol. 1 No. 1 (2025)'}).first().getAttribute('value');
            await select.selectOption(value || '');
            const saved = page.waitForResponse((x) => /\/publications\/\d+$/.test(new URL(x.url()).pathname) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: /^(Save|Assign|OK)$/}).last().click();
            const sv = await saved;
            r.issueSave = sv ? sv.status() : null;
            await idle(page).catch(() => {}); await sleep(1200);
        } else r.noAssign = await page.getByRole('dialog').last().getByRole('button').allInnerTexts().catch(() => []);
        r.buttons = await controls.getByRole('button').allInnerTexts().catch(() => []);
        await controls.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).first().click().catch((e) => { r.pressErr = flat(e.message, 150); });
        await idle(page).catch(() => {}); await sleep(1500);
        const confirm = page.getByRole('dialog').filter({has: page.getByRole('button', {name: /^Publish$/})}).last();
        r.confirm = flat(await confirm.innerText().catch(() => null), 240);
        const w = page.waitForResponse((x) => /\/publications\/\d+\/publish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: /^Publish$/}).last().click().catch((e) => { r.clickErr = flat(e.message, 150); });
        const resp = await w;
        r.status = resp ? resp.status() : null;
        await idle(page).catch(() => {}); await sleep(1200);
        r.snap = (await snap(label)).label;
        return r;
    };
    await signIn(page, D.m, {contextPath: D.path});
    try {
        if (!S.published) {
            o.publish = {};
            for (const [k] of ARTICLES) o.publish[k] = await publish35(ids[k], `d35-00-published-${k}`);
            o.publish.stored = stored();
            S.published = Object.values(stored()).every((v) => / 3$/.test(v)); save();
        }
        const open = await h.openDoaj(D.path, null);
        o.settings = {tabs: open.tabs, snap: (await snap('d35-01-settings')).label};
        o.settingsSave = await h.saveSettings({key: 'u63i09-dummy-key', auto: true});
        o.initial = await articles('d35-02-articles-initial');
        o.buttons = await page.locator(`${FORM} button, ${FORM} input[type=submit]`).evaluateAll((bs) => bs.filter((b) => b.offsetParent !== null).map((b) => `${(b.innerText || b.value || '').trim()} [name=${b.getAttribute('name')}]`));
        const grid = page.locator(LIST).first();
        if (!(await grid.locator('form').first().isVisible().catch(() => false))) await grid.locator('.header .actions a').filter({hasText: /Search/}).first().click().catch(() => {});
        o.statusChoices = await grid.locator('select[name=statusId]').evaluate((sel) => [...sel.options].map((x) => x.text.trim())).catch(() => []);
        await h.tick([ids.a, ids.b]);
        o.markRegistered = {answer: await h.markRegistered(), ...(await articles('d35-03-marked-registered')), stored: stored()};
        // unpublish a: the workflow's "Title & Abstract" page (3.5's menu key carries no publication id), "Unpublish"
        await page.goto(c.cu(D.path, `/en/dashboard/editorial?workflowSubmissionId=${ids.a}&workflowMenuKey=publication_titleAbstract`));
        await idle(page).catch(() => {});
        const controls = page.locator('[data-cy="workflow-controls-right"]');
        await controls.waitFor({timeout: T}).catch(() => {});
        await sleep(1500);
        const u = {buttons: await controls.getByRole('button').allInnerTexts().catch(() => [])};
        const btn = controls.getByRole('button', {name: 'Unpublish', exact: true});
        if (await btn.count()) {
            await btn.click();
            const win = page.getByRole('dialog').filter({hasText: /Are you sure you don't want this to be/}).last();
            await win.waitFor({timeout: T}).catch(() => {});
            u.confirm = flat(await win.innerText().catch(() => null), 200);
            const w = page.waitForResponse((x) => /\/unpublish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: /^(Unpublish|Yes|OK)$/}).last().click().catch((e) => { u.clickErr = flat(e.message, 150); });
            const r = await w;
            u.status = r ? r.status() : null;
            await idle(page).catch(() => {}); await sleep(1000);
        }
        u.snap = (await snap('d35-04-a-unpublished-workflow')).label;
        o.unpublishA = u;
        o.afterUnpublish = {...(await articles('d35-05-articles-after-unpublish')), stored: stored()};
    } finally {
        try { await h.openDoaj(D.path, null); o.untick = await h.saveSettings({auto: false}); } catch (e) { o.untick = `ERR ${flat(e.message, 150)}`; }
        fact(`L9-35-${app.name}`, o);
        await signOut(page).catch(() => {});
    }
}

module.exports = {rowL9on35};
