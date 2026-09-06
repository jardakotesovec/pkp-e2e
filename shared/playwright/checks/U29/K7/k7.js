// U29 claim check · chunk K7 — access by role, OPS, the screenless sections.
// Spec lines: Purpose 14–42, Actors 43–60, Settings 393–423, Cross-feature 425–451, scenario 11, register headings.
// Rule 9 / Side effects "automatic reminder" / A1 are declared no-screen (daily clock off on the test installs).
//
// Sections (K7_ONLY=a,b,… narrows; default all, in this order):
//   roles    seeded roster on every app: sidebar "Settings" group, expanded entries, "Workflow"; the typed address
//            for the sub-manager levels; for the manager-level accounts the "Review" tab tour (side tabs, each
//            tab's "Save", the sliders' "No reminder set", the guidance boxes, "Create Review Form", the OJS
//            recommendations table with a row menu). OPS: the Workflow Settings tabs (scenario 11).
//   emails   OJS/OMP manager.maya: Settings › Workflow › Emails, the two automated reminder templates and subjects.
//   inuse    OJS/OMP scratch context (mgr, ed, au, rev1, rev2; three review forms; one submission whose accepted
//            reviewer carries "K7 In Use"): Review Forms rows and menus as ed and admin; the in-use form's window
//            (Preview) and the spare form's Edit window (tab states); OJS recommendations rows/menus before and
//            after rev1 submits a review choosing "Accept Submission" (row 59's in-use end).
//   section  OJS scratch: Settings › Journal › Sections › the default section's "Review Form" set to "K7 Spare";
//            Add Reviewer for rev2 then shows which form is preselected (Settings entry line 415–419).
//   lang     OJS/OMP scratch: Website › Setup › Languages, French "Forms" box; Reviewer Guidance's language control.
//   rolesw   OJS/OMP scratch, LAST: Users & Roles › Roles › the editor group's "Permit changes to Settings" off;
//            then ed's sidebar and typed address (Settings entry line 410–414).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} = require('../../../probe');

const ONLY = (process.env.K7_ONLY || 'roles,emails,inuse,section,lang,rolesw').split(',').map((s) => s.trim()).filter(Boolean);
const on = (s) => ONLY.includes(s);
const outDir = path.resolve(__dirname, '../../../../../.reports', process.env.PROBE_FEATURE || 'U29', process.env.PROBE_AGENT || 'ccK7');
fs.mkdirSync(outDir, {recursive: true});
const scratchFile = (app) => path.join(outDir, `scratch-${app.name}.json`);
const log = (...a) => console.log(...a);
const texts = (l) => l.allInnerTexts().then((a) => a.map((s) => s.trim()).filter(Boolean));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MANAGER_LEVEL = ['manager.maya', 'editor.diana', 'admin'];
const ROSTER = {
    ojs: ['manager.maya', 'editor.diana', 'admin', 'sectioneditor.ana', 'assistant.rita', 'reviewer.julia', 'author.alex', 'reader.rosa'],
    omp: ['manager.maya', 'editor.diana', 'admin', 'sectioneditor.ana', 'assistant.rita', 'reviewer.julia', 'author.alex', 'reader.rosa'],
    ops: ['manager.maya', 'admin', 'sectioneditor.ana', 'assistant.rita', 'author.alex', 'reader.rosa'],
};

forEachApp(async (app) => {
    const facts = {app: app.name, browserDialogs: [], errors: {}};
    const scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : {};
    const saveScratch = () => fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
    const {page, close} = await launch(app);
    page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });

    const full = async (name) => { let d; try { d = await screen(page); } catch (e) { d = {url: page.url(), error: String(e.message)}; } record(`${name}-${app.name}`, d); await shot(page, `${name}-${app.name}`).catch(() => {}); return d; };
    const dlg = () => page.locator('[role="dialog"]:visible').last();
    const waitModal = () => page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 8000}).catch(() => {});
    const noModal = () => page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 8000}).catch(() => {});
    const modalInfo = async () => {
        const d = dlg();
        if (!(await d.isVisible().catch(() => false))) return null;
        return {title: await texts(d.locator('h1, h2, h3, [class*="title"]').first()).catch(() => []), text: (await d.innerText()).trim().slice(0, 1500), buttons: await texts(d.locator('button:visible, a.pkp_button:visible'))};
    };
    const nav = () => page.getByRole('navigation', {name: 'Site Navigation'});
    const workflowUrl = (ctx) => app.url(`/index.php/${ctx}/management/settings/workflow`);
    const topTabs = async () => (await page.locator('main').getByRole('tablist').first().getByRole('tab').allInnerTexts().catch(() => [])).map((t) => t.trim());
    const bodyHead = async () => (await page.locator('body').innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 400);

    // Sidebar facts: the collapsed "Settings" group, its entries once opened, and the "Workflow" link.
    const sidebar = async (expand) => {
        const n = nav();
        const out = {navCount: await n.count(), settingsButtons: 0, workflowLinks: 0, groupEntries: [], navText: []};
        if (!out.navCount) return out;
        out.navText = (await n.innerText().catch(() => '')).trim().split('\n').map((s) => s.trim()).filter(Boolean);
        const settings = n.getByRole('button', {name: 'Settings', exact: true});
        out.settingsButtons = await settings.count();
        out.workflowLinksBefore = await n.getByRole('link', {name: 'Workflow', exact: true}).count();
        if (expand && out.settingsButtons) {
            if ((await settings.getAttribute('aria-expanded').catch(() => null)) !== 'true') { await settings.click(); await idle(page); }
            out.groupEntries = (await settings.locator('xpath=..').innerText()).trim().split('\n').map((s) => s.trim()).filter(Boolean);
        }
        out.workflowLinks = await n.getByRole('link', {name: 'Workflow', exact: true}).count();
        return out;
    };
    const denied = async () => ({finalUrl: page.url(), hasMain: (await page.locator('main').count()) > 0, sidebarNavs: await nav().count(), body: await bodyHead()});

    const clickTab = async (name) => { await page.getByRole('tab', {name, exact: true}).first().click(); await idle(page); };
    const panel = (name) => page.getByRole('tabpanel', {name, exact: true});
    // The "Review" tab tour for a manager-level account on a journal/press.
    const reviewTour = async (label, {recommendations}) => {
        const out = {};
        await clickTab('Review');
        const reviewPanel = panel('Review');
        out.sideTabs = (await reviewPanel.getByRole('tab').allInnerTexts()).map((t) => t.trim());
        await clickTab('Setup');
        const setup = panel('Setup');
        out.setup = {
            saveButtons: await setup.getByRole('button', {name: 'Save', exact: true}).count(),
            noReminderSet: await setup.getByText('No reminder set', {exact: true}).count(),
            sliderLabels: await texts(setup.locator('.pkpFormField--slider .pkpFormFieldLabel, .pkpFormField--slider label, label').filter({hasText: /Reminder|Due Date/})),
            legends: await texts(setup.locator('legend, .pkpFormGroup__heading, .pkpFormFieldLabel')),
        };
        await full(`${label}-setup`);
        await clickTab('Reviewer Guidance');
        const guidance = panel('Reviewer Guidance');
        out.guidance = {
            saveButtons: await guidance.getByRole('button', {name: 'Save', exact: true}).count(),
            boxLabels: await texts(guidance.locator('.pkpFormField__heading, .pkpFormFieldLabel, legend')),
            editors: await guidance.locator('iframe').count(),
        };
        await full(`${label}-guidance`);
        await clickTab('Review Forms');
        const forms = panel('Review Forms');
        await forms.locator('.pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
        out.reviewForms = {createLinks: await forms.getByRole('link', {name: 'Create Review Form', exact: true}).count(), gridText: (await forms.innerText()).trim().replace(/\s+/g, ' ').slice(0, 300)};
        await full(`${label}-reviewforms`);
        if (recommendations) {
            await clickTab('Reviewer Recommendations');
            const root = page.locator('[data-cy="reviewer-recommendation-manager"]');
            await root.locator('tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
            out.recommendations = await recTable();
            out.recommendations.firstMenu = await openRecMenu(out.recommendations.rows[0]?.title);
            await page.keyboard.press('Escape').catch(() => {});
            await full(`${label}-recommendations`);
        }
        return out;
    };

    // ---- the OJS recommendations table
    const recRoot = () => page.locator('[data-cy="reviewer-recommendation-manager"]');
    const recTable = async () => recRoot().evaluate((root) => ({
        buttons: [...root.querySelectorAll('button')].filter((b) => !b.closest('tbody')).map((b) => b.innerText.trim() || b.getAttribute('aria-label')),
        columns: [...root.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...root.querySelectorAll('tbody tr')].map((tr) => ({
            title: (tr.querySelector('th, td') || {}).innerText?.trim(),
            checked: tr.querySelector('input[type=checkbox]')?.checked ?? null,
            hasTick: !!tr.querySelector('input[type=checkbox]'),
            menu: [...tr.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
        })),
    }));
    const recRow = (title) => recRoot().locator('tbody tr').filter({has: page.locator('th, td').filter({hasText: new RegExp(`^${esc(title)}$`)})}).first();
    const openRecMenu = async (title) => {
        if (!title) return {present: false, items: []};
        const btn = recRow(title).getByRole('button', {name: 'More Actions'});
        if (!(await btn.count())) return {present: false, items: []};
        await btn.click();
        await page.waitForFunction(() => document.querySelector('[role="menuitem"]'), null, {timeout: 4000}).catch(() => {});
        const items = await texts(page.locator('[role="menuitem"]:visible'));
        return {present: true, items};
    };
    const openRecTab = async (ctx) => {
        await page.goto(workflowUrl(ctx)); await idle(page);
        await clickTab('Review'); await clickTab('Reviewer Recommendations');
        await recRoot().locator('tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
    };

    // ---- the Review Forms grid (legacy grid: a row, then a hidden tr.row_controls with the actions)
    const openFormsGrid = async (ctx) => {
        await page.goto(workflowUrl(ctx)); await idle(page);
        await clickTab('Review'); await clickTab('Review Forms');
        const forms = panel('Review Forms');
        await forms.locator('.pkp_controllers_grid tbody tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        return forms;
    };
    const formRows = async () => {
        const forms = panel('Review Forms');
        const rows = forms.locator('.pkp_controllers_grid tbody tr.gridRow');
        const out = [];
        for (let i = 0; i < await rows.count(); i++) {
            const row = rows.nth(i);
            const cells = (await row.locator('td').allInnerTexts()).map((s) => s.trim().replace(/\s+/g, ' '));
            const controls = row.locator('xpath=following-sibling::tr[1][contains(@class,"row_controls")]');
            if (!(await controls.isVisible().catch(() => false))) { await row.locator('.show_extras').first().click(); await idle(page); }
            const actions = (await controls.locator('a').allInnerTexts()).map((a) => a.trim()).filter(Boolean);
            out.push({cells, actions, hasTick: (await row.locator('input[type=checkbox]').count()) > 0, ticked: await row.locator('input[type=checkbox]').first().isChecked().catch(() => null)});
        }
        return out;
    };
    const formAction = async (title, action) => {
        const forms = panel('Review Forms');
        const row = forms.locator('.pkp_controllers_grid tbody tr.gridRow').filter({hasText: title}).first();
        const controls = row.locator('xpath=following-sibling::tr[1][contains(@class,"row_controls")]');
        if (!(await controls.isVisible().catch(() => false))) { await row.locator('.show_extras').first().click(); await idle(page); }
        await controls.getByRole('link', {name: action, exact: true}).first().click();
        await waitModal(); await idle(page);
        const d = dlg();
        const tabs = d.locator('#editReviewFormTabs [role="tab"], [role="tablist"] [role="tab"]');
        await tabs.first().waitFor({timeout: 10000}).catch(() => {});
        const tabState = await tabs.evaluateAll((ts) => ts.map((t) => ({text: t.innerText.trim(), selected: t.getAttribute('aria-selected'), disabled: t.getAttribute('aria-disabled') || (t.classList.contains('ui-state-disabled') ? 'class' : null), classes: t.className})));
        return {title: await texts(d.locator('h1, h2, h3').first()).catch(() => []), tabs: tabState, text: (await d.innerText()).trim().replace(/\s+/g, ' ').slice(0, 400)};
    };
    const closeWindow = async () => { await dlg().getByRole('button', {name: 'Close'}).first().click().catch(() => {}); await noModal(); await idle(page); };

    try {
        // ================================================================ roles (every app)
        if (on('roles')) {
            const r = {};
            for (const user of ROSTER[app.name]) {
                const f = {user};
                try {
                    await signIn(page, user, {contextPath: app.contextPath}); await idle(page);
                    f.landingUrl = page.url();
                    const isMgr = MANAGER_LEVEL.includes(user);
                    Object.assign(f, {sidebar: await sidebar(isMgr)});
                    await full(`roles-${user}-landing`);
                    if (isMgr && f.sidebar.workflowLinks) {
                        const wf = nav().getByRole('link', {name: 'Workflow', exact: true});
                        if (user === 'manager.maya') await loc(page, 'sidebar Settings › "Workflow" entry', wf);
                        await wf.first().click(); await idle(page);
                    } else {
                        await page.goto(workflowUrl(app.contextPath)); await idle(page);
                    }
                    f.workflow = {url: page.url(), heading: (await page.locator('h1').first().innerText().catch(() => '')).trim(), topTabs: await topTabs(), ...(await denied())};
                    await full(`roles-${user}-workflow`);
                    if (isMgr && f.workflow.topTabs.includes('Review')) {
                        f.tour = await reviewTour(`roles-${user}`, {recommendations: app.name === 'ojs'});
                    }
                    if (!isMgr && f.workflow.topTabs.length === 0) {
                        // the typed address: also typed with the #review/reviewSetup hash a bookmark would carry
                        await page.goto(`${workflowUrl(app.contextPath)}#review/reviewSetup`); await idle(page);
                        f.typedWithHash = await denied();
                    }
                } catch (e) { f.error = String(e.message).slice(0, 400); await full(`roles-${user}-error`).catch(() => {}); }
                log(`[roles ${app.name}] ${user}: settingsGroup=${f.sidebar?.settingsButtons} workflowLink=${f.sidebar?.workflowLinks} entries=${JSON.stringify(f.sidebar?.groupEntries || [])} tabs=${JSON.stringify(f.workflow?.topTabs || [])} url=${f.workflow?.finalUrl} ${f.tour ? 'side=' + JSON.stringify(f.tour.sideTabs) + ' setupSave=' + f.tour.setup.saveButtons + ' guidSave=' + f.tour.guidance.saveButtons + ' boxes=' + JSON.stringify(f.tour.guidance.boxLabels) + ' create=' + f.tour.reviewForms.createLinks + (f.tour.recommendations ? ' recMenu=' + JSON.stringify(f.tour.recommendations.firstMenu) : '') : ''} ${f.error ? 'ERR ' + f.error : ''}`);
                r[user] = f;
                await signOut(page).catch(() => {});
            }
            facts.roles = r;
        }

        // ================================================================ emails (OJS, OMP)
        if (on('emails') && app.name !== 'ops') {
            const f = {};
            try {
                await signIn(page, 'manager.maya', {contextPath: app.contextPath}); await idle(page);
                await page.goto(workflowUrl(app.contextPath)); await idle(page);
                await clickTab('Emails');
                const emails = panel('Emails');
                // The "Emails" tab carries an "Email Templates" section whose link opens the Manage Emails page.
                const link = emails.getByRole('link', {name: /Email Templates|Add and edit templates/}).or(emails.getByRole('button', {name: /Email Templates|Add and edit templates/})).first();
                f.emailsTabLinks = await texts(emails.locator('a, button'));
                await full('emails-tab');
                if (await link.count()) { await link.click(); await idle(page); } else { await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/manageEmails`)); await idle(page); }
                f.manageUrl = page.url();
                f.manageHeading = (await page.locator('h1').first().innerText().catch(() => '')).trim();
                const main = page.locator('main');
                await main.locator('.listPanel__item').first().waitFor({timeout: 30000}).catch(() => {});
                f.templates = {};
                for (const name of ['Review Response Overdue (Automated)', 'Review Reminder (Automated)']) {
                    const search = main.getByRole('searchbox').or(main.locator('input[type="search"]')).first();
                    await search.fill(name); await idle(page);
                    await page.waitForFunction((n) => [...document.querySelectorAll('.listPanel__item')].some((i) => i.innerText.includes(n)), name, {timeout: 10000}).catch(() => {});
                    const item = main.locator('.listPanel__item').filter({hasText: name}).first();
                    const present = (await item.count()) > 0;
                    let detail = null;
                    if (present) {
                        await item.getByRole('button', {name: /Expand|Details|Edit/}).first().click().catch(() => {});
                        await idle(page); await waitModal();
                        detail = {item: (await item.innerText()).trim().replace(/\s+/g, ' ').slice(0, 600), window: await modalInfo(),
                            fields: await dlg().locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value.slice(0, 200)}))).catch(() => null)};
                        if (detail.window) { await dlg().getByRole('button', {name: /Close|Cancel/}).first().click().catch(() => {}); await noModal(); }
                    }
                    f.templates[name] = {present, detail, listText: (await main.innerText()).trim().replace(/\s+/g, ' ').slice(0, 400)};
                    await full(`emails-${name.replace(/[^a-z]+/gi, '-').toLowerCase()}`);
                }
            } catch (e) { f.error = String(e.message).slice(0, 400); await full('emails-error').catch(() => {}); }
            log(`[emails ${app.name}] ${JSON.stringify(f).slice(0, 900)}`);
            facts.emails = f;
            await signOut(page).catch(() => {});
        }

        // ================================================================ scratch seed (OJS, OMP)
        const needScratch = app.name !== 'ops' && (on('inuse') || on('section') || on('lang') || on('rolesw'));
        if (needScratch && !scratch.path) {
            const t = tag('u29k7');
            const U = {mgr: `${t}mgr`, ed: `${t}ed`, au: `${t}au`, rev1: `${t}rev1`, rev2: `${t}rev2`};
            const ctx = await app.api.createContext({tag: t, users: [
                {username: U.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: U.ed, roles: ['editor'], givenName: 'Edda', familyName: 'Editor'},
                {username: U.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: U.rev1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
                {username: U.rev2, roles: ['externalReviewer'], givenName: 'Sasha', familyName: 'Second'}],
            reviewForms: [
                {title: 'K7 In Use', active: true, elements: [{question: 'Q1 in use', type: 'textarea'}]},
                {title: 'K7 Spare', active: true, elements: [{question: 'Q1 spare', type: 'textarea'}]},
                {title: 'K7 Off', active: false, elements: [{question: 'Q1 off', type: 'textarea'}]}]});
            const s1 = await app.api.createSubmission({tag: `${t}s1`, context: ctx.path || t, submitter: U.au, title: `K7 sub ${t}`, decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: U.rev1, status: 'accepted', reviewForm: 'K7 In Use'}]}]});
            Object.assign(scratch, {tag: t, path: ctx.path || t, users: U, sub1: s1.submissionId}); saveScratch();
            log(`[seed ${app.name}] ctx=${scratch.path} sub1=${scratch.sub1}`);
        }
        const S = scratch;

        // ================================================================ inuse (OJS, OMP)
        if (on('inuse') && app.name !== 'ops') {
            const f = {accounts: {}};
            try {
                for (const who of [S.users.ed, 'admin']) {
                    const a = {};
                    await signIn(page, who, {contextPath: S.path}); await idle(page);
                    await openFormsGrid(S.path);
                    a.rows = await formRows();
                    await full(`inuse-${who === 'admin' ? 'admin' : 'ed'}-forms`);
                    if (who !== 'admin') {
                        a.inUseWindow = await formAction('K7 In Use', 'Preview');
                        await full('inuse-ed-inuse-window');
                        await closeWindow();
                        a.spareWindow = await formAction('K7 Spare', 'Edit');
                        await full('inuse-ed-spare-window');
                        await closeWindow();
                    }
                    if (app.name === 'ojs') {
                        await openRecTab(S.path);
                        a.recs = await recTable();
                        a.recMenu = await openRecMenu('Accept Submission');
                        await page.keyboard.press('Escape').catch(() => {});
                        await full(`inuse-${who === 'admin' ? 'admin' : 'ed'}-recs-before`);
                    }
                    f.accounts[who] = a;
                    log(`[inuse ${app.name}] ${who}: rows=${JSON.stringify(a.rows)} inUseTabs=${JSON.stringify(a.inUseWindow?.tabs)} spareTabs=${JSON.stringify(a.spareWindow?.tabs)} recMenu=${JSON.stringify(a.recMenu)}`);
                    await signOut(page).catch(() => {});
                }
                if (app.name === 'ojs') {
                    // rev1 submits the review choosing "Accept Submission" → that recommendation is in use
                    await signIn(page, S.users.rev1, {contextPath: S.path}); await idle(page);
                    await page.goto(app.url(`/index.php/${S.path}/reviewer/submission/${S.sub1}?step=3`)); await idle(page);
                    await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 20000}).catch(() => {});
                    const onStep = async () => (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim();
                    if (!(await onStep()).startsWith('3')) {
                        for (const name of ['Save and continue', /Continue to Step #3/]) { const b = page.getByRole('button', {name}); if (await b.count()) { await b.first().click(); await idle(page); } }
                        await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('3'), null, {timeout: 30000}).catch(() => {});
                    }
                    const main = page.locator('main');
                    const ta = main.locator('textarea:visible').first();
                    if (await ta.count()) await ta.fill('K7 review form answer.');
                    else { await page.frameLocator('main iframe').first().locator('body').click(); await page.keyboard.type('K7 review form answer.'); }
                    const rec = main.locator('select[name="reviewerRecommendationId"]').first();
                    await rec.selectOption({label: 'Accept Submission'});
                    await full('inuse-rev1-step3');
                    await page.getByRole('button', {name: 'Submit Review'}).first().click();
                    await waitModal();
                    f.submitConfirm = await modalInfo();
                    if (f.submitConfirm) { await dlg().getByRole('button', {name: 'OK', exact: true}).last().click(); await idle(page); }
                    await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('4'), null, {timeout: 30000}).catch(() => {});
                    await full('inuse-rev1-after-submit');
                    f.afterSubmit = {step: await onStep(), url: page.url()};
                    await signOut(page).catch(() => {});
                    for (const who of [S.users.ed, 'admin']) {
                        await signIn(page, who, {contextPath: S.path}); await idle(page);
                        await openRecTab(S.path);
                        const a = f.accounts[who];
                        a.recsAfter = await recTable();
                        a.recMenuAfter = await openRecMenu('Accept Submission');
                        a.recMenuOtherAfter = await openRecMenu('Decline Submission');
                        await page.keyboard.press('Escape').catch(() => {});
                        await full(`inuse-${who === 'admin' ? 'admin' : 'ed'}-recs-after`);
                        // the Review Forms row now counts 0 / 1 for "K7 In Use": still no "Edit" / "Delete"
                        await openFormsGrid(S.path);
                        a.rowsAfter = await formRows();
                        await full(`inuse-${who === 'admin' ? 'admin' : 'ed'}-forms-after`);
                        log(`[inuse ${app.name}] ${who} after submit: recRow=${JSON.stringify(a.recsAfter.rows.find((r) => r.title === 'Accept Submission'))} menu=${JSON.stringify(a.recMenuAfter)} other=${JSON.stringify(a.recMenuOtherAfter)} rows=${JSON.stringify(a.rowsAfter)}`);
                        await signOut(page).catch(() => {});
                    }
                }
            } catch (e) { f.error = String(e.message).slice(0, 400); await full('inuse-error').catch(() => {}); log(`[inuse ${app.name}] ERR ${f.error}`); }
            facts.inuse = f;
        }

        // ================================================================ section (OJS)
        if (on('section') && app.name === 'ojs') {
            const f = {};
            try {
                await signIn(page, S.users.mgr, {contextPath: S.path}); await idle(page);
                await page.goto(app.url(`/index.php/${S.path}/management/settings/context`)); await idle(page);
                await clickTab('Sections');
                const grid = page.locator('#sectionsGridContainer');
                await grid.locator('tbody tr.gridRow').first().waitFor({timeout: 20000});
                const row = grid.locator('tbody tr.gridRow').first();
                f.sectionRow = (await row.innerText()).trim().replace(/\s+/g, ' ');
                const controls = row.locator('xpath=following-sibling::tr[1][contains(@class,"row_controls")]');
                if (!(await controls.isVisible().catch(() => false))) { await row.locator('.show_extras').first().click(); await idle(page); }
                await controls.getByRole('link', {name: 'Edit', exact: true}).first().click();
                await waitModal(); await idle(page);
                const sel = dlg().locator('select#reviewFormId, select[name="reviewFormId"]').first();
                await sel.waitFor({timeout: 15000});
                f.selectBefore = await sel.evaluate((s) => ({label: (document.querySelector(`label[for="${s.id}"]`) || {}).innerText, options: [...s.options].map((o) => ({value: o.value, text: o.text, selected: o.selected}))}));
                await loc(page, 'Section form: "Review Form" list', sel);
                await full('section-edit-window');
                await sel.selectOption({label: 'K7 Spare'});
                await dlg().getByRole('button', {name: 'Save', exact: true}).last().click();
                await noModal(); await idle(page);
                f.notice = await texts(page.locator('.pkpNotification, .pkp_notification, [role="alert"], [role="status"]').filter({visible: true})).catch(() => []);
                await full('section-saved');
                // Add Reviewer on the submission in that section
                await page.goto(app.url(`/index.php/${S.path}/dashboard/editorial?workflowSubmissionId=${S.sub1}`)); await idle(page);
                await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {}); await idle(page);
                const revTable = page.getByRole('table', {name: 'Reviewers', exact: true});
                await revTable.waitFor({timeout: 30000});
                await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                const d = page.getByRole('dialog').filter({hasText: 'Add Reviewer'}).last(); await d.waitFor({timeout: 30000});
                const entry = d.locator('.listPanel__item').filter({hasText: 'Sasha'}).first(); await entry.waitFor({timeout: 30000});
                await entry.getByRole('button', {name: /Select/}).first().click(); await idle(page);
                await d.locator('#regularReviewerForm').waitFor({state: 'visible', timeout: 30000});
                const rf = d.locator('#regularReviewerForm select[name="reviewFormId"]').first();
                f.addReviewer = {reviewFormSelects: await rf.count(), select: (await rf.count()) ? await rf.evaluate((s) => ({options: [...s.options].map((o) => ({value: o.value, text: o.text, selected: o.selected}))})) : null};
                await loc(page, 'Add Reviewer window: "Review Form" list', rf);
                await full('section-add-reviewer');
                await d.getByRole('button', {name: 'Close'}).first().click(); await noModal(); await idle(page);
            } catch (e) { f.error = String(e.message).slice(0, 400); await full('section-error').catch(() => {}); }
            log(`[section ${app.name}] ${JSON.stringify(f).slice(0, 1200)}`);
            facts.section = f;
            await signOut(page).catch(() => {});
        }

        // ================================================================ lang (OJS, OMP)
        if (on('lang') && app.name !== 'ops') {
            const f = {};
            try {
                await signIn(page, S.users.mgr, {contextPath: S.path}); await idle(page);
                await page.goto(app.url(`/index.php/${S.path}/management/settings/website`)); await idle(page);
                const setupTab = page.locator('#setup-button');
                if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
                await clickTab('Languages');
                await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000});
                const gridRows = () => page.locator('#languageGridContainer').evaluate((c) => ({columns: [...c.querySelectorAll('thead th')].map((t) => t.innerText.trim()), rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))}))}));
                f.gridBefore = await gridRows();
                await full('lang-grid-before');
                const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
                f.formsBoxes = await formsBox.count();
                if (f.formsBoxes && !(await formsBox.isChecked())) {
                    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/.test(r.url()), {timeout: 10000}).catch(() => null);
                    await formsBox.click();
                    const resp = await w; f.post = resp ? resp.status() : null;
                    await idle(page);
                    await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
                }
                f.gridAfter = await gridRows();
                await full('lang-grid-after');
                await page.goto(workflowUrl(S.path)); await idle(page);
                await clickTab('Review'); await clickTab('Reviewer Guidance');
                const g = panel('Reviewer Guidance');
                f.guidance = {
                    localeControls: await texts(g.locator('.pkpFormLocales button, .pkpFormLocales span')),
                    tabsInForm: await g.locator('form').getByRole('tab').count(),
                    perBoxLocaleLabels: await texts(g.locator('.pkpFormField__heading, .pkpFormFieldLabel, .pkpFormGroup__locale, .pkpFormField__localeLabel, [class*="locale"]')),
                    iframes: await g.locator('iframe').count(),
                };
                await full('lang-guidance');
                await clickTab('Setup');
                f.setupLocaleControls = await texts(panel('Setup').locator('.pkpFormLocales button, .pkpFormLocales span'));
            } catch (e) { f.error = String(e.message).slice(0, 400); await full('lang-error').catch(() => {}); }
            log(`[lang ${app.name}] ${JSON.stringify(f).slice(0, 1200)}`);
            facts.lang = f;
            await signOut(page).catch(() => {});
        }

        // ================================================================ rolesw (OJS, OMP) — LAST: mutates the editor group
        if (on('rolesw') && app.name !== 'ops') {
            const f = {};
            try {
                await signIn(page, S.users.mgr, {contextPath: S.path}); await idle(page);
                await page.goto(app.url(`/index.php/${S.path}/management/settings/access`)); await idle(page);
                await clickTab('Roles');
                const grid = page.locator('#roleGridContainer');
                await grid.locator('tbody tr.gridRow').first().waitFor({timeout: 20000});
                f.roleRows = (await grid.locator('tbody tr.gridRow').allInnerTexts()).map((s) => s.trim().replace(/\s+/g, ' '));
                await full('rolesw-roles-grid');
                const row = grid.locator('tbody tr.gridRow').filter({hasText: /(Journal|Press) editor/i}).first();   // the row text starts with the "Settings" control
                f.editorRow = (await row.innerText()).trim().replace(/\s+/g, ' ');
                const controls = row.locator('xpath=following-sibling::tr[1][contains(@class,"row_controls")]');
                if (!(await controls.isVisible().catch(() => false))) { await row.locator('.show_extras').first().click(); await idle(page); }
                await controls.getByRole('link', {name: 'Edit', exact: true}).first().click();
                await waitModal(); await idle(page);
                const box = dlg().locator('input[name="permitSettings"]').first();
                await box.waitFor({timeout: 15000});
                f.permitByName = await dlg().getByRole('checkbox', {name: 'Permit changes to Settings'}).count();
                f.permitBefore = await box.isChecked();
                f.windowButtons = await texts(dlg().locator('button:visible'));
                await loc(page, 'Roles › edit window: "Permit changes to Settings"', box);
                await full('rolesw-edit-window');
                if (f.permitBefore) await box.click();
                await dlg().getByRole('button', {name: 'OK', exact: true}).last().click();   // the legacy form's submit reads "OK"
                await noModal(); await idle(page);
                f.notice = await texts(page.locator('.pkpNotification, .pkp_notification, [role="alert"], [role="status"]').filter({visible: true})).catch(() => []);
                await full('rolesw-saved');
                await signOut(page).catch(() => {});
                await signIn(page, S.users.ed, {contextPath: S.path}); await idle(page);
                f.ed = {landing: page.url(), sidebar: await sidebar(false)};
                await full('rolesw-ed-landing');
                await page.goto(workflowUrl(S.path)); await idle(page);
                f.ed.workflow = {topTabs: await topTabs(), ...(await denied())};
                await full('rolesw-ed-workflow');
                await signOut(page).catch(() => {});
                await signIn(page, S.users.mgr, {contextPath: S.path}); await idle(page);
                f.mgrStill = {sidebar: await sidebar(false)};
            } catch (e) { f.error = String(e.message).slice(0, 400); await full('rolesw-error').catch(() => {}); }
            log(`[rolesw ${app.name}] ${JSON.stringify(f).slice(0, 1200)}`);
            facts.rolesw = f;
            await signOut(page).catch(() => {});
        }
    } finally {
        record(`k7-facts-${ONLY.join('_')}-${app.name}`, facts);
        await close();
    }
});
