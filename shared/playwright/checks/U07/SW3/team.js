// U07 drift sweep 2026-10-26, chunk SW3, PART=team: scenarios 7, 8, 9 (OJS OMP), 11 (OJS OMP; OPS the
// Roles-grid read of its note) as each scenario says, on scratch contexts (footnote y recipes), plus register
// A1 (an administrator without a manager role; OJS the control), A2 (the "Edit" link of a role without
// "Permit changes to Settings", pressed), A4 (a listed member disabled on screen), A5 ("Remove User"; a later
// start date reached), A10 (a submitted review cancelled on screen, OJS OMP), A13 (the masthead not based on
// enrollments: the invitation screens, the email, the stored choice; the Reviewer row with listing off and
// on), and Coverage's reviewer-listing default (scenario 9's other end).
// Entry: sw3.js PART=team. Phases (PHASES=a,b): s7 s8 s9 s11 a1 a2 a4 a5 a13. Tags hksw3m*.
// The database is touched only for what no screen does (scenarios.md "users[]"): A1's ended manager role
// and A5's start date moved (the calendar's job).
const {forEachApp, launch, signIn, signOut, loc, note, idle, tag, sql: kitSql} = require('../../../probe');
const C = require('./common.js');
const {sleep, T, flat, namer, readPublic, readList, brief, go, settingsGroup, readSettings, THIS_YEAR, LAST_YEAR, today} = C;
const {record, snap} = namer('tm');
const sql = (app, q) => String(kitSql(app, q) || '').trim();

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const SE = isOjs ? 'Section editor' : isOmp ? 'Series editor' : 'Moderator';
    const F = {app: app.name, errors: []};
    const phases = (process.env.PHASES || 's7,s8,s9,s11,a1,a2,a4,a5,a13').split(',');
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const step = async (name, fn) => {
        if (!phases.includes(name)) return;
        console.log(`[sw3 team ${app.name}] ${name}`);
        try { await fn(); } catch (e) { F.errors.push({step: name, error: String(e.stack || e).slice(0, 900)}); console.log(`[sw3 team ${app.name}] ERROR ${name}`, String(e.message || e).slice(0, 300)); await snap(page, `err-${name}`).catch(() => {}); }
    };
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const mail = (u) => `${u}@mail.test`;
    const SETTINGS = [['Journal', 'context'], ['Website', 'website'], ['Workflow', 'workflow'], ['Distribution', 'distribution'], ['Users & Roles', 'access']];
    const readM = async (ctx, which, name) => {
        const g = await go(page, cu(ctx, which === 'history' ? '/about/editorialHistory' : '/about/editorialMasthead'));
        const d = await readList(page);
        await snap(page, name);
        return {status: g.status, ...d};
    };
    // Users & Roles helpers
    const gotoAccess = async (ctx) => {
        await go(page, cu(ctx, '/management/settings/access'));
        await page.getByRole('table', {name: /Current Users \(/}).waitFor({timeout: T});
        await idle(page);
    };
    const userRow = (email) => page.getByRole('table', {name: /Current Users \(/}).getByRole('row').filter({hasText: email});
    const rowMenu = async (email, item) => {
        await userRow(email).getByRole('button', {name: /management.options|options|More Actions/i}).click();
        await page.getByRole('menuitem').first().waitFor({timeout: T});
        const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => flat(x));
        if (item) await page.getByRole('menuitem', {name: item}).first().click();
        return items;
    };
    const openEdit = async (ctx, email) => {
        await gotoAccess(ctx);
        await rowMenu(email, /^Edit$/);
        await page.getByRole('heading', {name: /Enter details/}).first().waitFor({timeout: T});
        await idle(page); await sleep(800);
    };
    const currentRow = (role) => page.getByRole('row').filter({hasText: role}).filter({hasNot: page.getByLabel(/^Select a new role/)}).first();
    const openRoleForm = async (ctx, roleName) => {
        await go(page, cu(ctx, '/management/settings/access'));
        await page.getByRole('tab', {name: 'Roles', exact: true}).click(); await idle(page);
        const row = page.getByRole('row', {name: new RegExp(`^Settings ${roleName} `)}).first();
        await row.waitFor({timeout: T});
        await row.getByRole('link', {name: 'Settings'}).click();
        await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
        const form = page.locator('#userGroupForm');
        await form.waitFor({timeout: T}); await idle(page);
        return form;
    };
    const setRoleBox = async (ctx, roleName, label, value, name) => {
        const form = await openRoleForm(ctx, roleName);
        const box = form.getByRole('checkbox', {name: label});
        const o = {before: await box.isChecked().catch(() => null)};
        if (value) await box.check(); else await box.uncheck();
        await snap(page, `${name}-window`);
        const w = page.waitForResponse((r) => r.url().includes('update-user-group'), {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'OK'}).click();
        const r = await w; o.status = r ? r.status() : null;
        await idle(page); await sleep(500);
        o.msg = await page.locator('.pkp_notification, [role=status], .ui-pnotify').allInnerTexts().then((a) => a.map((m) => flat(m, 200))).catch(() => []);
        return o;
    };
    /** "Invite to a role" for an existing account, accepted from the mailbox; returns what each step showed. */
    const invite = async (ctx, mgr, u, roleLabel, start, mastheadLabel, nm) => {
        const o = {};
        await signIn(page, mgr, {contextPath: ctx});
        await gotoAccess(ctx);
        await page.getByRole('button', {name: 'Invite to a role'}).click();
        const search = page.getByLabel(/Search for a user by email address/);
        await search.waitFor({timeout: T});
        await search.fill(mail(u));
        await page.getByRole('button', {name: 'Search User', exact: true}).click();
        await page.getByRole('heading', {name: /Enter details/}).first().waitFor({timeout: T});
        await idle(page); await sleep(600);
        let newRow = page.getByRole('row').filter({hasText: 'Select a new role'}).last();
        if (!(await newRow.count())) { await page.getByRole('button', {name: 'Add Another Role'}).click(); newRow = page.getByRole('row').filter({hasText: 'Select a new role'}).last(); }
        o.headers = await page.getByRole('columnheader').allInnerTexts().then((a) => a.map((x) => flat(x))).catch(() => []);
        o.mainText = flat(await page.locator('main').innerText().catch(() => ''), 1500);
        o.roleOptions = await newRow.getByRole('combobox').first().locator('option').allInnerTexts().then((a) => a.map((x) => flat(x)));
        const pick = roleLabel instanceof RegExp ? o.roleOptions.find((x) => roleLabel.test(x)) : roleLabel;
        await newRow.getByRole('combobox').first().selectOption({label: pick});
        await sleep(400);
        o.combos = await newRow.getByRole('combobox').count();
        o.rowText = flat(await newRow.innerText(), 300);
        o.rowCells = await newRow.locator('td').evaluateAll((tds) => tds.map((td) => { const sel = td.querySelector('select'); return sel ? `[select:${[...sel.options].length} options]` : td.innerText.replace(/\s+/g, ' ').trim(); }));
        await newRow.getByRole('textbox').first().fill(start);
        if (o.combos > 1) {
            o.mastheadOptions = await newRow.getByRole('combobox').last().locator('option').allInnerTexts();
            if (mastheadLabel) await newRow.getByRole('combobox').last().selectOption({label: mastheadLabel});
        }
        await snap(page, `${nm}-details`);
        await page.getByRole('button', {name: 'Save And Continue'}).click();
        const subject = page.locator('input[name="subject"]');
        await subject.waitFor({timeout: T}).catch(() => {});
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page); await sleep(600);
        if (!(await subject.isVisible().catch(() => false))) { o.refused = flat(await page.locator('main').innerText(), 800); await snap(page, `${nm}-refused`); return o; }
        const subj = `SW3 invitation ${nm} ${ctx}`;
        await subject.fill(subj);
        o.composeBody = flat(await page.locator('main').innerText().catch(() => ''), 2500);
        await page.getByRole('button', {name: 'Invite user to the role'}).click();
        const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
        await sent.waitFor({timeout: T});
        await sent.getByRole('button', {name: 'View All Users'}).click().catch(() => {});
        await idle(page);
        await signOut(page);
        const summary = await app.mail.find({to: mail(u), contains: subj});
        const full = await app.mail.fullMessage(summary.ID);
        o.mailText = flat(full.Text, 1500);
        const m = full.HTML.match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
        if (m) {
            const inv = await launch(app);
            try {
                const ip = inv.page;
                await ip.goto(m[1].replace(/&amp;/g, '&'));
                await idle(ip);
                await ip.getByRole('button', {name: /^Accept And Continue to/}).waitFor({timeout: T}).catch(() => {});
                const s = await snap(ip, `${nm}-accept-review`);
                o.acceptText = flat(s.text && s.text.main, 1500);
                o.acceptSelects = await ip.locator('main select').count();
                o.placeholders = await ip.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/\{\$\w+\}/.test(n.textContent)) { const el = n.parentElement; const cs = getComputedStyle(el); out.push({text: n.textContent.trim().slice(0, 80), tag: el.tagName, cls: el.className, visible: !!(el.offsetWidth || el.offsetHeight) && cs.visibility !== 'hidden', srOnly: /sr-only|screenReader|pkp_screen_reader/.test(el.className) || el.closest('.sr-only,.-screenReader,.pkp_screen_reader') !== null}); } } return out; });
                await ip.getByRole('button', {name: /^Accept And Continue to/}).click();
                await ip.getByRole('dialog').filter({hasText: /assigned a new role|role/}).first().waitFor({timeout: T}).catch(() => {});
                o.accepted = flat((await snap(ip, `${nm}-accepted`)).text.dialog, 300);
            } finally { await inv.close(); }
        }
        return o;
    };

    try {
        // ── Scenario 7: who the masthead and history list ──────────────────────
        await step('s7', async () => {
            const o = F.s7 = {};
            const t = tag('hksw3ma');
            const se = (u, g, f, extra = {}) => ({username: `${t}${u}`, roles: ['sectionEditor'], givenName: g, familyName: f, ...extra});
            await app.api.createContext({tag: t, users: [
                se('z', 'Zed', 'Zulu'), se('a', 'Al', 'Alpha'),
                se('m', 'Max', 'Mike', {affiliation: 'Masthead University', orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: true}),
                {username: `${t}f`, roles: ['sectionEditor', 'editorialBoardMember'], givenName: 'Fay', familyName: 'Fourth', masthead: {sectionEditor: false}},
                {username: `${t}p`, roles: ['reader'], givenName: 'Pat', familyName: 'Past', affiliation: 'Past University', pastRoles: [{role: 'sectionEditor', dateStart: '2019-01-01', dateEnd: '2024-12-31'}]},
                {username: `${t}q`, roles: ['reader'], givenName: 'Quin', familyName: 'Twice', pastRoles: [{role: 'sectionEditor', dateStart: '2015-01-01', dateEnd: '2016-12-31'}, {role: 'sectionEditor', dateStart: '2020-01-01', dateEnd: '2022-12-31'}]},
            ]});
            o.tag = t;
            await signOut(page).catch(() => {});
            o.masthead = await readM(t, 'masthead', 's7-01-masthead');
            const orcid = page.locator('.page_masthead .orcid a').first();
            if (await orcid.count()) {
                const [popup] = await Promise.all([page.context().waitForEvent('page', {timeout: 8000}).catch(() => null), orcid.click()]);
                o.orcidClick = {newTab: !!popup, url: popup ? popup.url() : null};
                if (popup) await popup.close().catch(() => {});
            }
            await page.locator('.page_masthead > p a').filter({hasText: 'Editorial History'}).first().click();
            await page.waitForLoadState('load'); await idle(page);
            o.history = {url: page.url(), ...(await readList(page))};
            await snap(page, 's7-02-history');
        });

        // ── Scenario 8: changes to the team show at the next load ───────────────
        await step('s8', async () => {
            const o = F.s8 = {};
            const t = tag('hksw3mb');
            const mg = `${t}mg`;
            await app.api.createContext({tag: t, users: [
                {username: mg, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                {username: `${t}ab`, roles: ['sectionEditor', 'reader'], givenName: 'Ann', familyName: 'Able'},
                {username: `${t}ba`, roles: ['sectionEditor'], givenName: 'Ben', familyName: 'Baker'},
                {username: `${t}ca`, roles: ['sectionEditor'], givenName: 'Cal', familyName: 'Carter'},
                {username: `${t}du`, roles: ['reader'], givenName: 'Dee', familyName: 'Dunn'},
                {username: `${t}ev`, roles: ['author'], givenName: 'Eve', familyName: 'Evans'},
            ]});
            o.tag = t;
            await signOut(page).catch(() => {});
            o.before = {m: brief(await readM(t, 'masthead', 's8-01-masthead-before')), h: (await readM(t, 'history', 's8-02-history-before')).pageText};
            o.invite = await invite(t, mg, `${t}du`, SE, today(), 'Appear on the masthead', 's8-03-invite-dunn');
            await signOut(page).catch(() => {});
            o.afterInvite = brief(await readM(t, 'masthead', 's8-04-masthead-after-invite'));
            // "Remove Role" on Able's role
            await signIn(page, mg, {contextPath: t});
            await openEdit(t, mail(`${t}ab`));
            await snap(page, 's8-05-able-edit');
            const row = currentRow(SE);
            o.ableRow = flat(await row.innerText().catch(() => ''), 300);
            await row.getByRole('button', {name: 'Remove Role'}).click();
            const rd = page.getByRole('dialog', {name: 'Remove Role'});
            await rd.waitFor({timeout: T});
            o.removeDialog = flat(await rd.innerText(), 400);
            const ended = page.waitForResponse((r) => r.url().includes('/endRole/'), {timeout: T}).catch(() => null);
            await rd.getByRole('button', {name: 'Remove Role'}).click();
            const er = await ended; o.endRoleStatus = er ? er.status() : null;
            await sleep(800);
            o.ableRowAfter = flat(await currentRow(SE).innerText().catch(() => ''), 300);
            await snap(page, 's8-06-able-removed');
            await signOut(page);
            o.afterRemove = {m: brief(await readM(t, 'masthead', 's8-07-masthead-after-remove')), h: brief(await readM(t, 'history', 's8-08-history-after-remove'))};
            // the masthead choice on Baker
            await signIn(page, mg, {contextPath: t});
            await openEdit(t, mail(`${t}ba`));
            const brow = currentRow(SE);
            o.bakerOptions = await brow.getByRole('combobox').locator('option').allInnerTexts().catch(() => []);
            await brow.getByRole('combobox').selectOption({label: 'Does not appear on the masthead'});
            const md = page.getByRole('dialog', {name: 'Confirm masthead visibility change'});
            await md.waitFor({timeout: T});
            o.mastheadDialog = flat(await md.innerText(), 400);
            const chosen = page.waitForResponse((r) => /\/masthead\//.test(r.url()), {timeout: T}).catch(() => null);
            await md.getByRole('button', {name: 'Confirm'}).click();
            const cr = await chosen; o.mastheadStatus = cr ? cr.status() : null;
            await sleep(1500);
            const errDlg = page.getByRole('dialog').filter({hasText: /Error|unexpected/});
            if (await errDlg.count()) { o.errorDialog = flat(await errDlg.first().innerText(), 300); await snap(page, 's8-09-masthead-choice-error'); await errDlg.first().getByRole('button', {name: /OK|Close/}).first().click().catch(() => {}); }
            await snap(page, 's8-10-baker-chosen');
            await page.reload(); await idle(page); await sleep(800);
            o.bakerSelectAfterReload = await currentRow(SE).getByRole('combobox').inputValue().catch(() => null);
            await signOut(page);
            o.afterChoice = {m: brief(await readM(t, 'masthead', 's8-11-masthead-after-choice')), h: brief(await readM(t, 'history', 's8-12-history-after-choice'))};
            // the role boxes
            await signIn(page, mg, {contextPath: t});
            o.authorTick = await setRoleBox(t, 'Author', 'Consider role in masthead list', true, 's8-13-author-tick');
            await signOut(page);
            o.afterAuthor = brief(await readM(t, 'masthead', 's8-14-masthead-author'));
            await signIn(page, mg, {contextPath: t});
            o.seUntick = await setRoleBox(t, SE, 'Consider role in masthead list', false, 's8-15-se-untick');
            await signOut(page);
            o.afterSeUntick = {m: brief(await readM(t, 'masthead', 's8-16-masthead-se-unticked')), h: (await readM(t, 'history', 's8-17-history-se-unticked')).pageText};
        });

        // ── Scenario 9: "Peer Reviewers in Previous Year"; A10; the listing default; A4 for a reviewer ──
        await step('s9', async () => {
            if (isOps) return;
            const o = F.s9 = {};
            const t = tag('hksw3mc');
            const users = [
                {username: `${t}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
                {username: `${t}ze`, roles: ['externalReviewer'], givenName: 'Zoe', familyName: 'Zeta', affiliation: 'Review University', orcid: 'https://orcid.org/0000-0002-1694-233X', orcidIsVerified: true},
                {username: `${t}be`, roles: ['externalReviewer'], givenName: 'Bob', familyName: 'Beta'},
                {username: `${t}ga`, roles: ['externalReviewer'], givenName: 'Gil', familyName: 'Gamma'},
                {username: `${t}ca`, roles: ['externalReviewer'], givenName: 'Cay', familyName: 'Cancelled'},
            ];
            if (isOmp) users.push({username: `${t}de`, roles: ['internalReviewer'], givenName: 'Dan', familyName: 'Delta'});
            await app.api.createContext({tag: t, enableEnrollmentMastheadReviewers: true, users});
            const subs = {};
            for (const [s, d] of [['ze', `${LAST_YEAR}-06-15`], ['be', `${LAST_YEAR}-06-15`], ['ga', null], ['ca', `${LAST_YEAR}-03-10`]]) {
                const rv = {username: `${t}${s}`, status: 'completed'};
                if (d) rv.dateCompleted = d;
                subs[s] = await app.api.createSubmission({tag: `${t}${s}s`, context: t, submitter: `${t}au`, title: `SW3 review ${s} ${t}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [rv]}]});
            }
            if (isOmp) subs.de = await app.api.createSubmission({tag: `${t}des`, context: t, submitter: `${t}au`, title: `SW3 internal ${t}`, decisions: ['sendInternalReview'], reviewRounds: [{stage: 'internal', reviewers: [{username: `${t}de`, status: 'completed', dateCompleted: `${LAST_YEAR}-07-01`}]}]});
            o.tag = t;
            // the other end of the axis: a context with the listing box at its default
            const d = tag('hksw3md');
            await app.api.createContext({tag: d, users: [{username: `${d}au`, roles: ['author']}, {username: `${d}rv`, roles: ['externalReviewer'], givenName: 'Ray', familyName: 'Default'}]});
            await app.api.createSubmission({tag: `${d}s`, context: d, submitter: `${d}au`, title: `SW3 default ${d}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: `${d}rv`, status: 'completed', dateCompleted: `${LAST_YEAR}-06-15`}]}]});
            o.defaultTag = d;
            await signOut(page).catch(() => {});
            o.masthead = await readM(t, 'masthead', 's9-01-masthead');
            const orcid = page.locator('.page_masthead .orcid a').first();
            o.orcidTarget = await orcid.getAttribute('target').catch(() => null);
            o.defaultMasthead = await readM(d, 'masthead', 's9-02-default-masthead');
            // A10: the submitted review of "Cay Cancelled" cancelled on screen
            await signIn(page, `${t}mg`, {contextPath: t});
            await page.goto(cu(t, `/dashboard/editorial?workflowSubmissionId=${subs.ca.submissionId}`));
            await page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: T});
            await idle(page);
            const table = page.getByRole('table', {name: 'Reviewers', exact: true});
            await table.waitFor({timeout: T});
            await snap(page, 's9-03-reviewers-panel');
            o.a10 = {rows: (await table.getByRole('row').allInnerTexts()).map((x) => flat(x, 200))};
            const row = table.getByRole('row').filter({hasText: 'Cay Cancelled'});
            await row.getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menu').getByRole('menuitem').first().waitFor({timeout: T});
            o.a10.menu = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((x) => flat(x));
            await page.getByRole('menu').getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click();
            const form = page.locator('form#cancelReviewForm');
            await form.waitFor({timeout: T}); await idle(page); await sleep(800);
            await snap(page, 's9-04-cancel-form');
            const w = page.waitForResponse((r) => /cancel-review|cancelReview|unassign/i.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Cancel Reviewer', exact: true}).click();
            const r = await w; o.a10.status = r ? r.status() : null;
            await form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await page.reload(); await page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: T}); await idle(page);
            await table.waitFor({timeout: T});
            o.a10.rowsAfter = (await table.getByRole('row').allInnerTexts()).map((x) => flat(x, 200));
            await snap(page, 's9-05-after-cancel');
            // A4 for a reviewer: Bob Beta disabled on screen
            await gotoAccess(t);
            await rowMenu(mail(`${t}be`), /^Disable/);
            const dd = page.getByRole('dialog').last();
            await dd.getByRole('button', {name: /^OK/}).first().waitFor({timeout: T});
            await dd.getByRole('button', {name: /^OK/}).first().click();
            await dd.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page);
            await signOut(page);
            o.afterCancelAndDisable = await readM(t, 'masthead', 's9-06-masthead-after');
        });

        // ── Scenario 11: an Editor whose role may not change the Settings; A2 ────
        await step('s11', async () => {
            const o = F.s11 = {};
            if (isOps) {
                // the note: the Preprint Server Manager's row offers no "Edit"
                const t = tag('hksw3me');
                await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}]});
                await signIn(page, `${t}mg`, {contextPath: t});
                await go(page, cu(t, '/management/settings/access'));
                await page.getByRole('tab', {name: 'Roles', exact: true}).click(); await idle(page); await sleep(800);
                o.roleRows = await page.getByRole('row').evaluateAll((rs) => rs.map((r) => ({text: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 120), settingsLink: !!r.querySelector('a.show_extras')})).filter((x) => x.text));
                await snap(page, 's11-01-ops-roles');
                return;
            }
            const t = tag('hksw3me');
            await app.api.createContext({tag: t, roles: {editor: {permitSettings: false}}, sidebar: ['informationblockplugin'], users: [
                {username: `${t}ed`, roles: ['editor'], givenName: 'Eli', familyName: 'Editor'},
                {username: `${t}pe`, roles: ['productionEditor'], givenName: 'Pia', familyName: 'Producer'},
            ]});
            o.tag = t;
            const as = async (u, nm) => {
                const r = {};
                await signIn(page, u, {contextPath: t});
                r.landing = await go(page, cu(t, '/submissions'));
                r.menu = await settingsGroup(page);
                await snap(page, `${nm}-landing`);
                r.pages = {};
                for (const [entry, slug] of SETTINGS) { const g = await go(page, cu(t, `/management/settings/${slug}`)); await sleep(400); const s = await readSettings(page); r.pages[entry] = {status: g.status, url: s.url, denied: s.denied, h1: s.h1, tabs: s.tabs.length}; }
                await snap(page, `${nm}-settings-access`);
                r.edits = {};
                for (const [k, p] of [['about', '/about'], ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['readers', '/information/readers']]) {
                    await go(page, cu(t, p));
                    const link = page.locator('.pkp_structure_main a.cmp_edit_link');
                    const e = {count: await link.count()};
                    if (e.count) {
                        e.visible = await link.first().isVisible();
                        await link.first().click(); await page.waitForLoadState('load'); await idle(page); await sleep(600);
                        const s = await readSettings(page);
                        e.landed = {url: s.url, denied: s.denied, h1: s.h1, tabs: s.tabs.map((x) => x.name)};
                        await snap(page, `${nm}-edit-${k}-landed`);
                    }
                    r.edits[k] = e;
                }
                await signOut(page);
                return r;
            };
            o.editor = await as(`${t}ed`, 's11-02-editor');
            o.production = await as(`${t}pe`, 's11-03-production');
        });

        // ── A2: both manager-level roles without "Permit changes to Settings" ─────
        await step('a2', async () => {
            if (isOps) return;
            const o = F.a2 = {};
            const t = tag('hksw3mf');
            await app.api.createContext({tag: t, roles: {editor: {permitSettings: false}, productionEditor: {permitSettings: false}}, users: [
                {username: `${t}pe`, roles: ['productionEditor'], givenName: 'Pip', familyName: 'NoSettings'},
            ]});
            await signIn(page, `${t}pe`, {contextPath: t});
            await go(page, cu(t, '/submissions'));
            o.menu = await settingsGroup(page);
            o.edits = {};
            for (const [k, p] of [['about', '/about'], ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['readers', '/information/readers'], ['masthead', '/about/editorialMasthead'], ['privacy', '/about/privacy']]) {
                await go(page, cu(t, p));
                const link = page.locator('.pkp_structure_main a.cmp_edit_link');
                const e = {count: await link.count()};
                if (e.count) { await link.first().click(); await page.waitForLoadState('load'); await idle(page); const s = await readSettings(page); e.landed = {url: s.url, denied: s.denied}; await snap(page, `a2-pe-edit-${k}-landed`); }
                o.edits[k] = e;
            }
            await signOut(page);
        });

        // ── A1: an administrator without a manager role (OMP OPS; OJS the control) ──
        await step('a1', async () => {
            const o = F.a1 = {};
            const t = tag('hksw3mg');
            const X = await app.api.createContext({tag: t, users: [{username: `${t}xm`, roles: ['manager']}, {username: 'admin', roles: ['sectionEditor']}]});
            o.tag = t;
            o.ended = sql(app, `update user_user_groups set date_end = now() - interval '1 day' where user_id = (select user_id from users where username='admin') and user_group_id in (select user_group_id from user_groups where context_id = ${Number(X.contextId)} and role_id = 16) returning user_group_id`);
            o.adminRoles = sql(app, `select ug.role_id || ' ' || coalesce(uug.date_end::text, 'open') from user_user_groups uug join user_groups ug using (user_group_id) where uug.user_id = (select user_id from users where username='admin') and ug.context_id = ${Number(X.contextId)}`);
            await signIn(page, 'admin');
            await go(page, cu(t, '/submissions'));
            o.menu = await settingsGroup(page);
            await snap(page, 'a1-01-landing');
            o.pages = {};
            for (const [entry, slug] of SETTINGS) {
                const g = await go(page, cu(t, `/management/settings/${slug}`)); await sleep(500);
                const s = await readSettings(page);
                o.pages[entry] = {status: g.status, url: s.url, denied: s.denied, h1: s.h1, tabs: s.tabs.map((x) => x.name)};
                await snap(page, `a1-02-${slug}`);
            }
            // the Administration pages: the hosted list's row actions and its settings wizard
            await go(page, app.url('/index.php/index/admin/contexts')); await sleep(500);
            const row = page.locator('tr.gridRow').filter({hasText: `Scratch context ${t}`}).first();
            await row.locator('a.show_extras').click().catch(() => {}); await idle(page);
            o.rowActions = await row.locator('xpath=following-sibling::tr[1]').locator('a').allInnerTexts().then((a) => a.map((x) => flat(x))).catch(() => []);
            const g = await go(page, app.url(`/index.php/index/admin/wizard/${X.contextId}`)); await sleep(800);
            o.wizard = {status: g.status, ...(await readSettings(page))};
            await snap(page, 'a1-03-admin-wizard');
            await signOut(page);
        });

        // ── A4: a listed member and a past member disabled on screen ─────────────
        await step('a4', async () => {
            const o = F.a4 = {};
            const t = tag('hksw3mh');
            await app.api.createContext({tag: t, users: [
                {username: `${t}mg`, roles: ['manager']},
                {username: `${t}s1`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Serving'},
                {username: `${t}s2`, roles: ['sectionEditor'], givenName: 'Dot', familyName: 'Disabled'},
                {username: `${t}p1`, roles: ['reader'], givenName: 'Pam', familyName: 'Pastdisabled', pastRoles: [{role: 'sectionEditor', dateStart: '2019-01-01', dateEnd: '2023-12-31'}]},
            ]});
            o.tag = t;
            await signOut(page).catch(() => {});
            o.before = {m: brief(await readM(t, 'masthead', 'a4-01-masthead-before')), h: brief(await readM(t, 'history', 'a4-02-history-before'))};
            await signIn(page, `${t}mg`, {contextPath: t});
            for (const u of ['s2', 'p1']) {
                await gotoAccess(t);
                await rowMenu(mail(`${t}${u}`), /^Disable/);
                const dd = page.getByRole('dialog').last();
                await dd.getByRole('button', {name: /^OK/}).first().waitFor({timeout: T});
                await dd.getByRole('button', {name: /^OK/}).first().click();
                await dd.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await idle(page);
            }
            await snap(page, 'a4-03-users-after-disable');
            o.mgrMasthead = (await readM(t, 'masthead', 'a4-04-masthead-manager')).status;
            await signOut(page);
            const m = await readM(t, 'masthead', 'a4-05-masthead-after');
            const h = await readM(t, 'history', 'a4-06-history-after');
            o.after = {mStatus: m.status, m: brief(m), hStatus: h.status, h: brief(h)};
        });

        // ── A5: "Remove User"; a later start date reached ────────────────────────
        await step('a5', async () => {
            const o = F.a5 = {};
            const t = tag('hksw3mi');
            const X = await app.api.createContext({tag: t, users: [
                {username: `${t}mg`, roles: ['manager']},
                {username: `${t}s1`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Serving'},
                {username: `${t}ru`, roles: ['sectionEditor'], givenName: 'Rue', familyName: 'Removeduser'},
                {username: `${t}la`, roles: ['sectionEditor'], givenName: 'Lou', familyName: 'Later'},
            ]});
            o.tag = t;
            const laId = sql(app, `select user_id from users where username = '${t}la'`);
            // the later start date: moved 30 days ahead (no screen sets a past-or-future start on a held role)
            o.moveAhead = sql(app, `update user_user_groups set date_start = now() + interval '30 days' where user_id = ${Number(laId)} returning date_start`);
            await signOut(page).catch(() => {});
            o.before = brief(await readM(t, 'masthead', 'a5-01-masthead-before'));
            await signIn(page, `${t}mg`, {contextPath: t});
            await gotoAccess(t);
            o.menu = await rowMenu(mail(`${t}ru`), 'Remove User');
            const cd = page.getByRole('dialog').last();
            await cd.waitFor({timeout: T}).catch(() => {});
            o.confirm = flat(await cd.innerText().catch(() => ''), 400);
            await snap(page, 'a5-02-remove-user-confirm');
            await cd.getByRole('button', {name: /^OK$|^Remove/}).first().click().catch(() => {});
            await idle(page); await sleep(1000);
            await signOut(page);
            o.afterRemove = {m: brief(await readM(t, 'masthead', 'a5-03-masthead-after-remove')), h: brief(await readM(t, 'history', 'a5-04-history-after-remove'))};
            o.moveBack = sql(app, `update user_user_groups set date_start = now() - interval '1 day' where user_id = ${Number(laId)} returning date_start`);
            o.afterStart = brief(await readM(t, 'masthead', 'a5-05-masthead-start-reached'));
        });

        // ── A13: the masthead not based on enrollments; the Reviewer row ─────────
        await step('a13', async () => {
            const o = F.a13 = {};
            const t = tag('hksw3mj');
            const mg = `${t}mg`;
            await app.api.createContext({tag: t, users: [
                {username: mg, roles: ['manager']},
                {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sal', familyName: 'Section'},
                {username: `${t}r1`, roles: ['reader'], givenName: 'Ria', familyName: 'Invitee'},
                {username: `${t}r2`, roles: ['reader'], givenName: 'Rob', familyName: 'Reviewerinvitee'},
                {username: `${t}r3`, roles: ['reader'], givenName: 'Ron', familyName: 'Reviewerlisted'},
            ]});
            o.tag = t;
            const ctxId = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${t}'`);
            // the enrollment box unticked on screen
            await signIn(page, mg, {contextPath: t});
            await go(page, cu(t, '/management/settings/website'));
            await page.locator('#appearance-button').click(); await idle(page);
            await page.getByRole('tab', {name: 'Editorial Masthead', exact: true}).filter({visible: true}).first().click(); await idle(page); await sleep(500);
            const form = page.locator('#appearance [role="tabpanel"]:visible form').first();
            await form.getByRole('checkbox', {name: 'Present a masthead based on user enrollments', exact: true}).uncheck();
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await w; o.offSave = r ? r.status() : null;
            await sleep(800);
            await snap(page, 'a13-01-enrollment-off');
            o.roleWindowBoxes = await (async () => { const f = await openRoleForm(t, SE); const labels = await f.locator('label').allInnerTexts(); await f.getByRole('button', {name: /Cancel/}).first().click().catch(() => {}); return labels.map((x) => flat(x, 120)); })();
            await openEdit(t, mail(`${t}se`));
            o.editHeaders = await page.getByRole('columnheader').allInnerTexts().then((a) => a.map((x) => flat(x))).catch(() => []);
            o.editCombos = await currentRow(SE).getByRole('combobox').count();
            await snap(page, 'a13-02-edit-page');
            o.inviteOff = await invite(t, mg, `${t}r1`, SE, today(), null, 'a13-03-invite-off');
            const r1Id = sql(app, `select user_id from users where username = '${t}r1'`);
            o.storedOff = sql(app, `select coalesce(uug.masthead::text,'NULL') from user_user_groups uug join user_groups ug using (user_group_id) where uug.user_id = ${Number(r1Id)} and ug.role_id = 17 and ug.context_id = ${Number(ctxId)}`);
            if (!isOps) {
                // enrollment back on, reviewer listing off (the default) then on: the Reviewer row
                await signIn(page, mg, {contextPath: t});
                await go(page, cu(t, '/management/settings/website'));
                await page.locator('#appearance-button').click(); await idle(page);
                await page.getByRole('tab', {name: 'Editorial Masthead', exact: true}).filter({visible: true}).first().click(); await idle(page); await sleep(500);
                const f2 = page.locator('#appearance [role="tabpanel"]:visible form').first();
                await f2.getByRole('checkbox', {name: 'Present a masthead based on user enrollments', exact: true}).check();
                o.reviewersBoxOn = await f2.getByRole('checkbox', {name: 'Enable listing of reviewers on the masthead', exact: true}).isChecked().catch(() => null);
                const w2 = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await f2.getByRole('button', {name: 'Save', exact: true}).click(); await w2; await sleep(600);
                const revLabel = /^(External )?Reviewer$/;
                o.reviewerOff = await invite(t, mg, `${t}r2`, revLabel, today(), null, 'a13-04-invite-reviewer-listing-off');
                await signIn(page, mg, {contextPath: t});
                await go(page, cu(t, '/management/settings/website'));
                await page.locator('#appearance-button').click(); await idle(page);
                await page.getByRole('tab', {name: 'Editorial Masthead', exact: true}).filter({visible: true}).first().click(); await idle(page); await sleep(500);
                const f3 = page.locator('#appearance [role="tabpanel"]:visible form').first();
                await f3.getByRole('checkbox', {name: 'Enable listing of reviewers on the masthead', exact: true}).check();
                const w3 = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await f3.getByRole('button', {name: 'Save', exact: true}).click(); await w3; await sleep(600);
                o.reviewerOn = await invite(t, mg, `${t}r3`, revLabel, today(), null, 'a13-05-invite-reviewer-listing-on');
            }
            await signOut(page).catch(() => {});
        });
    } finally {
        F.dialogs = dialogs;
        record('facts', F, {merge: true});
        await close();
    }
});
