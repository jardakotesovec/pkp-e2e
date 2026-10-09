// U63 I09, the DOAJ Export Plugin rows {OJS}: L9 (an article unpublished after it read "Marked registered": its row,
// its stored status, what DOAJ is told) and L10 (the daily deposit and an article that reads "Failed").
// One scratch journal that deposits automatically, its Journal Manager a throwaway (the roster is read-only).
// The list and workflow helpers are the kept I01 check's (../I01/doaj.js).
const {signIn, signOut, idle, tag, note, loc, drainJobs, rawKeys} = require('../../../probe');
const {T, sleep, flat, rel, toolTabs} = require('./lib');
const {helpers} = require('../I01/doaj');

const TASK = 'APP\\plugins\\generic\\doaj\\DOAJInfoSender';
const LIST = '#submissionsListGridContainer .pkp_controllers_grid';
const FORM = 'form#exportSubmissionXmlForm';
const ISSUE = {volume: 1, number: 1, year: 2025};
const FAILED_MSG = '{"error": "u63i09: the record was refused"} (400 Bad Request)';
// key, title, what the drive does with it
const ARTICLES = [
    ['a', 'Quokka dawn foraging'],   // "Mark registered", then unpublished (L9)
    ['b', 'Bittern reed calls'],     // "Mark registered", stays published (control)
    ['c', 'Caracal ear tufts'],      // never touched: "Not Deposited", the daily deposit's own case (control)
    ['e', 'Echidna spine growth'],   // reads "Failed" (L10; the stored state seeded, see seedFailed)
    ['f', 'Fossa canopy routes'],    // "Not Deposited", then unpublished (control of L9)
    ['g', 'Gharial river basking'],  // "Register" on an install that cannot reach DOAJ
];

async function seedD(c) {
    const {app, S, save, fact} = c;
    if (S.D) return S.D;
    const t = tag(`u63i09${c.RUN}d`);
    await app.api.createContext({tag: t, context: {name: `U63 I09 D ${t}`, acronym: 'I09D', contactName: 'I09 Contact', contactEmail: `${t}c@mail.test`, country: 'CA'},
        issues: [{...ISSUE, published: true}],
        users: [{username: `${t}m`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Lovelace'}]});
    const D = {path: t, m: `${t}m`, id: c.q(`select journal_id from journals where path='${t}'`)[0], subs: {}};
    for (const [k, title] of ARTICLES) {
        const r = await app.api.createSubmission({tag: `${t}${k}`.slice(0, 32), context: t, submitter: `${t}au`, title, published: true, issue: ISSUE});
        D.subs[k] = {id: r.submissionId, pub: r.publicationId, title};
    }
    S.D = D; save();
    fact('seedD', D);
    note(`scratch journal D ${t} (Journal Manager ${t}m; Vol. 1 No. 1 (2025) published with ${ARTICLES.map((x) => `"${x[1]}"`).join(', ')}; DOAJ key saved and the automatic-deposit box ticked while the run goes, unticked when it ends).`);
    return D;
}

async function rowsL9L10(c) {
    const {page, fact, snap, app} = c;
    const D = await seedD(c);
    const h = helpers(c);
    const o = {};
    const ids = Object.fromEntries(Object.entries(D.subs).map(([k, v]) => [k, v.id]));
    const byTitle = (list) => Object.fromEntries(ARTICLES.map(([k, title]) => [k, ((list && list.rows || []).find((r) => r.cells.join(' ').includes(title)) || {cells: ['(no row)']}).cells.slice(-1)[0]]));
    const stored = () => Object.fromEntries(ARTICLES.map(([k]) => [k, c.q(`select coalesce((select setting_value from submission_settings where submission_id=${ids[k]} and setting_name='doaj::status'),'-') || ' / pub status ' || (select string_agg(status::text, ',') from publications where submission_id=${ids[k]})`)[0]]));
    const lastJob = () => Number(c.q('select coalesce(max(id),0) from jobs')[0] || 0);
    const lastFailed = () => Number(c.q('select coalesce(max(id),0) from failed_jobs')[0] || 0);
    const keyOf = (sid) => (Object.entries(ids).find(([, v]) => String(v) === String(sid)) || ['other'])[0];
    const jobsSince = (id) => c.q(`select id || '|' || replace(replace(payload, E'\\\\', ''), '|', '/') from jobs where id > ${id} and payload like '%DOAJ%' order by id`).map((l) => {
        const p = l.slice(l.indexOf('|') + 1);
        const objectId = (p.match(/objectId";i:(\d+)/) || [])[1];
        return {job: (p.match(/DOAJ(Register|Delete)/) || [])[0], objectId, article: keyOf(objectId)};
    });
    const failedSince = (id) => c.q(`select replace(replace(payload, E'\\\\', ''), '|', '/') || '|' || left(exception, 200) from failed_jobs where id > ${id} and payload like '%DOAJ%' order by id`).map((l) => {
        const objectId = (l.match(/objectId";i:(\d+)/) || [])[1];
        return {job: (l.match(/DOAJ(Register|Delete)/) || [])[0], article: keyOf(objectId), exception: flat((l.slice(l.lastIndexOf('|') + 1).match(/^[\w\\]+/) || [])[0], 120)};
    });
    const fleet = () => c.q("select j.path || ' ' || ps.setting_name || '=' || case when ps.setting_name='apiKey' then '(set)' else ps.setting_value end from plugin_settings ps join journals j on j.journal_id=ps.context_id where ps.plugin_name='doajexportplugin' and ps.setting_name in ('apiKey','automaticRegistration') and coalesce(ps.setting_value,'') not in ('','0') order by 1");
    /** The Articles tab, read: every row's status by article, the snapshot's name. */
    const articles = async (label) => {
        const l = await h.openDoaj(D.path, 'Articles');
        const s = await snap(label);
        return {tabs: l.tabs, status: byTitle(l.list), rows: h.brief(l.list), empty: l.list && l.list.empty, paging: l.list && l.list.paging, notices: s.notices, snap: s.label};
    };
    /** Press one of the buttons under the list with the ticked rows; lands back on the page. */
    const press = async (name) => {
        const landed = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === 'GET' && r.url().includes('DOAJExportPlugin'), {timeout: 90_000}).catch(() => null);
        await page.locator(`${FORM} button[name="${name}"]`).first().click();
        const r = await landed; await idle(page).catch(() => {});
        return r ? r.status() : null;
    };
    /** One run of the daily task from the command line (no screen starts it), with what it queued. */
    const runTask = (label) => {
        const before = lastJob();
        const depositing = fleet();
        const out = c.cli(['lib/pkp/tools/scheduler.php', 'test', `--name=${TASK}`], 180_000);
        return {label, depositingJournals: depositing, task: out.replace(/u63i09-dummy-key/g, '…'), queued: jobsSince(before), stored: stored()};
    };
    /** Run the fleet's queued jobs (the deposits fail at connection here) and say what failed. */
    const drain = async () => {
        const before = lastFailed();
        const d = await drainJobs(app, {passes: 3}).catch((e) => ({error: flat(e.message, 200)}));
        return {passes: d.passes, counts: d.counts, failed: failedSince(before)};
    };

    await signIn(page, D.m, {contextPath: D.path});
    try {
        // ---- the tool, its settings: a key and the automatic-deposit box
        const open = await h.openDoaj(D.path, null);
        o.settings = {tabs: open.tabs, snap: (await snap('d-01-settings')).label};
        o.rawKeys = await rawKeys(page).catch((e) => `ERR ${flat(e.message, 120)}`);
        o.settingsSave = await h.saveSettings({key: 'u63i09-dummy-key', auto: true});
        const s2 = await snap('d-02-settings-saved');
        o.settingsNotices = s2.notices;
        await loc(page, 'DOAJ Settings: the "DOAJ API Key" box', page.locator('#doajSettingsForm input[name=apiKey]'));
        await loc(page, 'DOAJ Settings: the automatic-deposit tick box', page.locator('#doajSettingsForm input[name=automaticRegistration]'));

        // ---- the Articles list as seeded, what the page offers under it
        o.initial = await articles('d-03-articles-initial');
        o.buttons = await page.locator(`${FORM} button, ${FORM} input[type=submit]`).evaluateAll((bs) => bs.filter((b) => b.offsetParent !== null).map((b) => `${(b.innerText || b.value || '').trim()} [name=${b.getAttribute('name')}]`));
        o.rowActions = await page.locator(LIST).first().locator('tr.gridRow').first().locator('a, button').evaluateAll((as) => as.filter((a) => a.offsetParent !== null).map((a) => (a.innerText || a.getAttribute('title') || '').trim()));
        await loc(page, 'DOAJ Articles: the buttons under the list', page.locator(`${FORM} ul.export_actions button`));
        await loc(page, 'DOAJ Articles: a row\'s status cell', page.locator(LIST).first().locator('tr.gridRow').first().locator('td').last());

        // ---- "Mark registered" on a and b
        await h.tick([ids.a, ids.b]);
        o.markRegistered = {answer: await press('markRegistered'), ...(await articles('d-04-marked-registered')), stored: stored()};

        // ---- "Register" on g: the install cannot reach DOAJ (the fleet's proxy is a dead port)
        await h.tick([ids.g]);
        const jb = lastJob();
        o.register = {answer: await press('deposit')};
        const s5 = await snap('d-05-register-pressed');
        o.register.notices = s5.notices; o.register.snap = s5.label;
        o.register.queued = jobsSince(jb);
        o.register.drain = await drain();
        o.register.after = await articles('d-06-register-after-jobs');
        o.register.stored = stored();

        // ---- e reads "Failed": no screen of a test install gets there (DOAJ never answers), so the stored state
        // registerObject() writes on DOAJ's refusal is put in the database: status `error` and DOAJ's message.
        c.q(`delete from submission_settings where submission_id=${ids.e} and setting_name in ('doaj::status','doaj_failedMsg'); insert into submission_settings (submission_id, locale, setting_name, setting_value) values (${ids.e}, '', 'doaj::status', 'error'), (${ids.e}, '', 'doaj_failedMsg', '${FAILED_MSG}')`);
        o.failed = {seeded: 'submission_settings doaj::status=error, doaj_failedMsg (the state of a deposit DOAJ refused)', ...(await articles('d-07-failed-row'))};
        const failedLink = page.locator(LIST).first().locator('tr.gridRow').filter({hasText: D.subs.e.title}).locator('td').last().locator('a').first();
        o.failed.linkText = flat(await failedLink.innerText().catch(() => null), 60);
        await loc(page, 'DOAJ Articles: the "Failed" link of a row', failedLink);
        if (await failedLink.count()) {
            await failedLink.click();
            const win = page.getByRole('dialog').last();
            await win.waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {}); await sleep(800);
            const s = await snap('d-08-failed-window');
            o.failed.window = {text: flat(s.text && s.text.dialog, 400), snap: s.label};
            await page.keyboard.press('Escape').catch(() => {});
            await sleep(500);
        }

        // ---- unpublish a ("Marked registered") and f ("Not Deposited")
        o.unpublishA = await h.unpublish(D.path, ids.a, D.subs.a.pub);
        o.unpublishA.snap = (await snap('d-09-a-unpublished-workflow')).label;
        o.unpublishF = await h.unpublish(D.path, ids.f, D.subs.f.pub);
        o.afterUnpublish = {...(await articles('d-10-articles-after-unpublish')), stored: stored()};

        // ---- the list's status filter, every choice
        o.filter = {};
        // the filter form folds away after every search and redraw: "Search" at the list's top right shows it again
        const grid = page.locator(LIST).first();
        const openFilter = async () => {
            const f = grid.locator('form.filter').first();
            if (!(await f.isVisible().catch(() => false))) { await grid.locator('a.pkp_linkaction_search').first().click(); await f.waitFor({state: 'visible', timeout: 10_000}).catch(() => {}); }
            return f;
        };
        let form = await openFilter();
        const choices = await form.locator('select[name=statusId]').evaluate((sel) => [...sel.options].map((x) => x.text.trim())).catch(() => []);
        o.filter.choices = choices;
        await loc(page, 'DOAJ Articles: the filter\'s status select', form.locator('select[name=statusId]'));
        await loc(page, 'DOAJ Articles: "Search" at the list\'s top right', grid.locator('a.pkp_linkaction_search'));
        for (const choice of choices) {
            form = await openFilter();
            await form.locator('select[name=statusId]').selectOption({label: choice}).catch((e) => c.log('filter', choice, flat(e.message, 100)));
            const w = page.waitForResponse((r) => /fetch-grid|fetchGrid/.test(r.url()), {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Search', exact: true}).click();
            const r = await w; await idle(page).catch(() => {}); await sleep(500);
            const l = await h.readList();
            o.filter[choice] = {answer: r ? r.status() : null, status: Object.fromEntries(Object.entries(byTitle(l)).filter(([, v]) => v !== '(no row)')), empty: l.empty, snap: (await snap(`d-11-filter-${choice.toLowerCase().replace(/[^a-z]+/g, '-')}`)).label};
        }

        // ---- day 1 of the daily deposit, then its jobs
        o.task1 = runTask('day 1');
        o.task1.list = await articles('d-12-after-task-1');
        o.task1.drain = await drain();
        o.task1.afterJobs = await articles('d-13-after-task-1-jobs');
        // ---- day 2: is anything sent again?
        o.task2 = runTask('day 2');
        o.task2.list = await articles('d-14-after-task-2');
        o.task2.drain = await drain();

        // ---- the way round for the "Failed" article: "Register" by hand
        await h.openDoaj(D.path, 'Articles');
        await h.tick([ids.e]);
        const jb2 = lastJob();
        o.registerFailedByHand = {answer: await press('deposit')};
        const s15 = await snap('d-15-failed-registered-by-hand');
        o.registerFailedByHand.notices = s15.notices;
        o.registerFailedByHand.queued = jobsSince(jb2);
        o.registerFailedByHand.stored = stored();
        o.registerFailedByHand.drain = await drain();

        // ---- a published again: its row, and day 3
        o.republishA = await h.publish(D.path, ids.a, D.subs.a.pub);
        o.afterRepublish = {...(await articles('d-16-articles-a-published-again')), stored: stored()};
        o.task3 = runTask('day 3');
        o.task3.list = await articles('d-17-after-task-3');
        o.task3.drain = await drain();
        o.end = {...(await articles('d-18-end')), stored: stored()};
    } finally {
        // the journal stops depositing, so a later run of the task (another run's, another agent's) leaves it alone
        try { await h.openDoaj(D.path, null); o.untick = await h.saveSettings({auto: false}); } catch (e) { o.untick = `ERR ${flat(e.message, 150)}`; }
        o.depositingAtEnd = fleet();
        fact(`L9L10-${app.name}`, o);
        await signOut(page).catch(() => {});
    }
}

module.exports = {rowsL9L10, seedD, ARTICLES, TASK, LIST, FORM, toolTabs, rel};
