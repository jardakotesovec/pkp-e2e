// U29 claim check, chunk K4: the "Review Forms" list and the form window,
// on OJS and OMP (OPS has no "Review" tab; nothing to drive there).
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Fields "Review
// Forms" (lines 89–107), Rules 12–13 (253–308), Side effects "Review form
// actions" (381–386), scenarios 6 and 8 (506–521, 531–539).
//
// Seeds two scratch contexts per app:
//   A — forms "Gamma" (active, in use: sub1 carries it with an accepted
//       reviewer, sub2 with a declined one) and "Delta" (inactive, with a
//       description and two items); sub3 in review with no reviewer.
//   B — no forms, one submission in review, for scenarios 6 and 8 and the
//       "Create Review Form" / "Create New Item" windows.
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U29/K4/k4.js
//   PHASES=seed,a1,a1b,a2,a3,b,c,d,e   (default: all; later phases reuse k4-scratch-<app>.json)
//
// Order matters in A: a1 ends with "Gamma" (in use) deactivated, a2 has its
// reviewer submit on the wizard's step 3, a3 reads the counts and reactivates.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'a1', 'a1b', 'a2', 'a3', 'b', 'c', 'd', 'e'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratchFile = (app) => path.join(outDir(), `k4-scratch-${app.name}.json`);
const texts = async (l) => (await l.allInnerTexts()).map((s) => s.trim()).filter(Boolean);

forEachApp(async (app) => {
    if (app.name === 'ops') return;
    let sc = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : {};
    const saveScratch = () => fs.writeFileSync(scratchFile(app), JSON.stringify(sc, null, 2));
    const facts = {app: app.name, steps: {}, browserDialogs: [], errors: {}};
    const done = (label, data) => { facts.steps[label] = data; log(`[${label}]`, app.name, JSON.stringify(data).slice(0, 1800)); };

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.A) {
        const tA = tag('u29k4a');
        const A = {mgr: `${tA}mgr`, au: `${tA}au`, rev1: `${tA}rev1`, rev2: `${tA}rev2`, rev3: `${tA}rev3`};
        const ctxA = await app.api.createContext({
            tag: tA,
            users: [
                {username: A.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: A.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: A.rev1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
                {username: A.rev2, roles: ['externalReviewer'], givenName: 'Sparrow', familyName: 'Declined'},
                {username: A.rev3, roles: ['externalReviewer'], givenName: 'Robin', familyName: 'Spare'},
            ],
            reviewForms: [
                {title: 'Gamma', description: 'Gamma instructions for the reviewer.', elements: [
                    {question: 'Is the sample adequate?', description: 'Consider the sampling frame.', type: 'radiobuttons', required: true, options: ['Yes', 'No']},
                    {question: 'Further remarks', type: 'textarea'},
                ]},
                {title: 'Delta', description: 'Delta description.', active: false, elements: [
                    {question: 'D one', type: 'textfield'},
                    {question: 'D two', type: 'checkboxes', required: true, options: ['Alpha', 'Beta']},
                ]},
            ],
        });
        const pA = ctxA.path || tA;
        const s1 = await app.api.createSubmission({tag: `${tA}s1`, context: pA, submitter: A.au, title: `K4 sub1 ${tA}`,
            decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: A.rev1, status: 'accepted', reviewForm: 'Gamma'}]}]});
        const s2 = await app.api.createSubmission({tag: `${tA}s2`, context: pA, submitter: A.au, title: `K4 sub2 ${tA}`,
            decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: A.rev2, status: 'declined', reviewForm: 'Gamma'}]}]});
        const s3 = await app.api.createSubmission({tag: `${tA}s3`, context: pA, submitter: A.au, title: `K4 sub3 ${tA}`,
            decisions: ['sendExternalReview']});
        const tB = tag('u29k4b');
        const B = {mgr: `${tB}mgr`, au: `${tB}au`, rev: `${tB}rev`};
        const ctxB = await app.api.createContext({
            tag: tB,
            users: [
                {username: B.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: B.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: B.rev, roles: ['externalReviewer'], givenName: 'Casey', familyName: 'Reviewer'},
            ],
        });
        const pB = ctxB.path || tB;
        const sB = await app.api.createSubmission({tag: `${tB}s1`, context: pB, submitter: B.au, title: `K4 B sub ${tB}`, decisions: ['sendExternalReview']});
        sc = {A: {tag: tA, path: pA, users: A, sub1: s1.submissionId, sub2: s2.submissionId, sub3: s3.submissionId},
            B: {tag: tB, path: pB, users: B, sub: sB.submissionId}};
        saveScratch();
        log('[seed]', app.name, JSON.stringify({A: [pA, s1.submissionId, s2.submissionId, s3.submissionId], B: [pB, sB.submissionId]}));
    }

    const mailOf = (u) => `${u}@mail.test`;
    const mailCounts = async (users) => {
        const out = {};
        for (const u of Object.values(users)) out[u] = await app.mail.count({to: mailOf(u)}).catch((e) => `err ${e.message}`);
        return out;
    };

    // ---- per-context helpers (bound to a page) ----------------------------------
    function bind(page, ctx) {
        const url = (p) => app.url(`/index.php/${ctx.path}${p}`);
        const H = {};
        H.full = async (name) => {
            let data;
            try { data = await screen(page); } catch (e) { data = {url: page.url(), error: String(e.message).slice(0, 200)}; }
            record(`${name}-${app.name}`, data);
            await shot(page, `${name}-${app.name}`).catch(() => {});
            return data;
        };
        H.panel = () => page.getByRole('tabpanel', {name: 'Review Forms', exact: true});
        H.grid = () => H.panel().locator('.pkp_controllers_grid').first();
        H.dlg = () => page.locator('[role="dialog"]:visible').last();
        H.openForms = async () => {
            await page.goto(url('/management/settings/workflow#review/reviewForms')); await idle(page);
            if (!(await H.panel().isVisible().catch(() => false))) {
                await page.getByRole('tab', {name: 'Review', exact: true}).click();
                await page.getByRole('tabpanel', {name: 'Review', exact: true}).getByRole('tab', {name: 'Review Forms', exact: true}).click();
                await idle(page);
            }
            await H.grid().locator('tbody tr').first().waitFor({timeout: 20000});
            await idle(page);
        };
        H.readGrid = (g) => g.evaluate((root) => {
            const vis = (e) => e.getClientRects().length > 0;
            const rows = [...root.querySelectorAll('tbody tr.gridRow')].map((tr) => ({
                title: (tr.querySelector('td') || {}).innerText?.trim().split('\n').pop(),
                cells: [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\n/g, ' / ')),
                active: [...tr.querySelectorAll('input[type=checkbox]')].map((c) => ({checked: c.checked, disabled: c.disabled})),
                moveIcon: !!tr.querySelector('.pkp_helpers_moveicon, .ordering'),
                actions: [...(tr.nextElementSibling?.classList.contains('row_controls') ? tr.nextElementSibling.querySelectorAll('a') : [])].map((a) => a.innerText.trim()).filter(Boolean),
            }));
            return {
                heading: (root.querySelector('.pkp_controllers_grid_header h4, h4, .grid_header h4, .pkp_grid_title') || {}).innerText?.trim(),
                rows,
                gridActions: [...root.querySelectorAll('.actions a, .pkp_linkactions a')].filter(vis).map((a) => a.innerText.trim()),
                finishControls: [...root.querySelectorAll('.order_finish_controls a')].filter(vis).map((a) => a.innerText.trim()),
                columns: [...root.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
                empty: [...root.querySelectorAll('tbody .no_items, tbody tr.empty')].filter(vis).map((e) => e.innerText.trim()),
            };
        });
        H.notices = async (ms = 5000) => {
            const seen = new Set(); const end = Date.now() + ms;
            while (Date.now() < end) {
                for (const s of await page.locator('.pkpNotification, .pkp_notification, [role="alert"], [role="status"]').allInnerTexts().catch(() => [])) {
                    if (s.trim()) seen.add(s.trim().replace(/\n×\nClose$/, '').replace(/\s+/g, ' '));
                }
                await sleep(400);
            }
            return [...seen];
        };
        H.rowOf = (g, title, nth = 0) => g.locator('tbody tr.gridRow').filter({hasText: new RegExp(`^\\s*(Settings\\s*)?${title}\\s*$`, 'm')}).nth(nth);
        H.expandRow = async (row) => {
            const controls = row.locator('xpath=following-sibling::tr[1][contains(@class,"row_controls")]');
            if (!(await controls.isVisible().catch(() => false))) { await row.locator('.show_extras').first().click(); await idle(page); }
            return controls;
        };
        H.rowActions = async (g, title, nth = 0) => texts((await H.expandRow(H.rowOf(g, title, nth))).locator('a'));
        H.readDialog = async () => {
            const d = H.dlg();
            await d.waitFor({timeout: 15000});
            await sleep(300);
            return d.evaluate((el) => ({
                title: (el.querySelector('h1, h2, h3, .modal__title, .pkp_modal_title, [class*="title"]') || {}).innerText?.trim(),
                text: el.innerText.trim().slice(0, 1200),
                buttons: [...el.querySelectorAll('button, a.pkp_button, .pkp_button')].filter((b) => b.getClientRects().length).map((b) => b.innerText.trim()).filter(Boolean),
            }));
        };
        H.pressDialog = async (name) => {
            const n = H.notices(4000);
            await H.dlg().getByRole('button', {name, exact: true}).first().click();
            const seen = await n; await idle(page); await sleep(500);
            return seen;
        };
        H.toggleActive = async (title, press, label, nth = 0) => {
            const row = H.rowOf(H.grid(), title, nth);
            const box = row.locator('input[type=checkbox]').first();
            const before = await box.isChecked();
            await loc(page, `Review Forms row "${title}": the Active box`, box);
            await box.click();
            const confirm = await H.readDialog();
            await H.full(`${label}-confirm`);
            const seen = await H.pressDialog(press);
            await H.grid().locator('tbody tr.gridRow').first().waitFor({timeout: 20000});
            const after = await H.readGrid(H.grid());
            await H.full(`${label}-after`);
            return {before, confirm, pressed: press, notices: seen, rows: after.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active}))};
        };
        H.dragRowAbove = async (g, movingTitle, targetTitle) => {
            const mb = await H.rowOf(g, movingTitle).boundingBox(); const tb = await H.rowOf(g, targetTitle).boundingBox();
            await page.mouse.move(mb.x + 40, mb.y + mb.height / 2);
            await page.mouse.down();
            await page.mouse.move(mb.x + 40, mb.y + mb.height / 2 - 6, {steps: 4});
            await page.mouse.move(tb.x + 40, tb.y + 4, {steps: 20});
            await page.mouse.move(tb.x + 40, tb.y - 8, {steps: 6});
            await sleep(200);
            await page.mouse.up();
            await sleep(400);
        };
        // the form window
        H.openFormWindow = async (title, action = 'Edit', nth = 0) => {
            const controls = await H.expandRow(H.rowOf(H.grid(), title, nth));
            await controls.getByRole('link', {name: action, exact: true}).first().click();
            await H.dlg().locator('#editReviewFormTabs li').first().waitFor({timeout: 15000});
            await idle(page); await sleep(300);
            return H.dlg();
        };
        H.windowInfo = async () => H.dlg().evaluate((el) => ({
            heading: (el.querySelector('h1, h2, h3, .modal__title, [class*="title"]') || {}).innerText?.trim(),
            tabs: [...el.querySelectorAll('#editReviewFormTabs li')].map((li) => ({text: li.innerText.trim(), selected: li.getAttribute('aria-selected') || li.classList.contains('ui-tabs-active'), disabled: li.classList.contains('ui-state-disabled') || li.getAttribute('aria-disabled') === 'true'})),
            panelHead: (el.querySelector('.ui-tabs-panel:not([style*="display: none"])') || {}).innerText?.trim().slice(0, 300),
        }));
        H.clickFormTab = async (label) => {
            await H.dlg().locator('#editReviewFormTabs a').filter({hasText: label}).first().click();
            await H.dlg().locator('.ui-tabs-panel:visible .pkp_controllers_grid tbody tr, .ui-tabs-panel:visible form, .ui-tabs-panel:visible input, .ui-tabs-panel:visible textarea').first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page); await sleep(400);
        };
        H.itemsGrid = () => H.dlg().locator('.ui-tabs-panel:visible .pkp_controllers_grid').first();
        H.closeWindow = async () => {
            const d = H.dlg();
            const close = d.getByRole('button', {name: /Close/}).first();
            if (await close.count()) await close.click(); else await d.locator('.pkpModalCloseButton, .close').first().click();
            await sleep(400); await idle(page);
        };
        // Preview Form panel as data: the order of questions, marks, descriptions and controls
        H.readPreview = async () => H.dlg().locator('.ui-tabs-panel:visible').first().evaluate((p) => {
            const walk = [];
            const it = document.createTreeWalker(p, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let n;
            while ((n = it.nextNode())) {
                if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) walk.push(`T:${t.slice(0, 80)}`); }
                else if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) walk.push(`C:${n.tagName.toLowerCase()}[${n.type || ''}]${n.name ? ' ' + n.name : ''}`);
                else if (n.tagName === 'IFRAME') walk.push('C:iframe');
                else if (n.classList.contains('req')) walk.push(`M:${n.textContent.trim()}`);
            }
            return {text: p.innerText.trim().slice(0, 1500), walk: walk.slice(0, 80)};
        });
        // review stage / Add Reviewer
        H.revTable = () => page.getByRole('table', {name: 'Reviewers', exact: true});
        H.openRound = async (id, label) => {
            await page.goto(url(`/dashboard/editorial?workflowSubmissionId=${id}`)); await idle(page);
            await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click({timeout: 8000}).catch(() => {});
            await H.revTable().waitFor({timeout: 30000}).catch(() => {}); await idle(page);
            await H.full(`${label}-review-stage`);
        };
        H.addReviewerList = async (label, who) => {
            await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            const d = page.getByRole('dialog').filter({hasText: 'Add Reviewer'}).last(); await d.waitFor({timeout: 30000});
            const entry = d.locator('.listPanel__item').filter({hasText: who}).first(); await entry.waitFor({timeout: 30000});
            await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: 30000}).catch(() => {});
            await entry.getByRole('button', {name: /Select/}).first().click(); await idle(page);
            await d.locator('#regularReviewerForm').waitFor({state: 'visible', timeout: 30000});
            const form = await d.locator('#regularReviewerForm').evaluate((f) => {
                const sel = f.querySelector('select[name="reviewFormId"]');
                return {reviewFormListPresent: !!sel, labelText: /Review Form/.test(f.innerText), options: sel ? [...sel.options].map((o) => ({value: o.value, text: o.text, selected: o.selected})) : null};
            });
            record(`${label}-add-reviewer-${app.name}`, {form, aria: await d.ariaSnapshot(), text: await d.innerText()});
            await shot(page, `${label}-add-reviewer-${app.name}`).catch(() => {});
            await loc(page, 'Add Reviewer window: "Review Form" list', d.locator('#regularReviewerForm select[name="reviewFormId"]'));
            await d.getByRole('button', {name: 'Close'}).first().click();
            await page.locator('#regularReviewerForm').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page);
            return form;
        };
        H.editAssignmentWindow = async (who, label) => {
            const row = H.revTable().getByRole('row').filter({hasText: who}).first();
            await row.getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
            await edit.locator('form#editReviewForm input[name="isReviewPubliclyVisible"]').waitFor({timeout: 30000}); await idle(page); await sleep(400);
            const info = await edit.locator('form#editReviewForm').evaluate((f) => {
                const sel = f.querySelector('select[name="reviewFormId"]');
                return {reviewFormListPresent: !!sel, labelText: /Review Form/.test(f.innerText), options: sel ? [...sel.options].map((o) => ({value: o.value, text: o.text, selected: o.selected})) : null};
            });
            record(`${label}-edit-assignment-${app.name}`, {info, heading: await edit.locator('h1, h2, h3').first().innerText().catch(() => null), text: await edit.innerText()});
            await shot(page, `${label}-edit-assignment-${app.name}`).catch(() => {});
            await loc(page, 'Edit Review window: "Review Form" list', edit.locator('select[name="reviewFormId"]'));
            const cancel = edit.getByRole('link', {name: 'Cancel', exact: true});
            if (await cancel.count()) await cancel.first().click(); else await page.getByRole('dialog').last().getByRole('button', {name: 'Close'}).first().click();
            await page.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page);
            return info;
        };
        // the item window
        H.itemForm = () => page.locator('form#reviewFormElementForm');
        H.lbState = async () => ({
            addLink: await H.itemForm().locator('.pkp_linkaction_addItem').evaluateAll((els) => els.map((e) => ({tag: e.tagName, text: e.innerText.trim(), disabled: e.disabled, aria: e.getAttribute('aria-disabled')}))),
            columns: await texts(H.itemForm().locator('#elementOptions thead th')),
            headerRows: await H.itemForm().locator('#elementOptions thead tr').count(),
            rows: await H.itemForm().locator('#elementOptions tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.offsetParent !== null).map((tr) => ({
                text: tr.innerText.trim(), inputs: [...tr.querySelectorAll('input:not([type=hidden])')].map((i) => ({type: i.type, value: i.value, visible: i.offsetParent !== null})),
            }))),
        });
        H.addOption = async (text) => {
            await H.itemForm().locator('.pkp_linkaction_addItem').first().dispatchEvent('mousedown');
            await H.itemForm().locator('#elementOptions tbody tr input[type=text]:visible').last().waitFor({timeout: 8000});
            const afterAdd = await H.lbState();
            await H.itemForm().locator('#elementOptions tbody tr input[type=text]:visible').last().fill(text);
            return afterAdd;
        };
        H.typeSel = () => H.itemForm().locator('select#elementType, select[name=elementType]').first();
        H.selectType = async (label) => { await H.typeSel().selectOption({label}); await sleep(400); };
        H.fillFrame = async (nth, text) => {
            const frame = H.itemForm().frameLocator('iframe').nth(nth);
            await frame.locator('body').click();
            await frame.locator('body').fill(text);
        };
        H.openCreateItem = async () => {
            await H.dlg().getByText('Create New Item', {exact: true}).first().click();
            await H.itemForm().waitFor({timeout: 10000});
            await H.itemForm().locator('#elementOptions table').first().waitFor({timeout: 10000}).catch(() => {});
            await H.itemForm().locator('.tox-toolbar__primary').first().waitFor({timeout: 10000}).catch(() => {});
            await idle(page); await sleep(300);
        };
        H.itemWindowInfo = async () => {
            const d = H.dlg();
            return {
                heading: await d.locator('h1, h2, h3, [class*="title"]').first().innerText().catch(() => null),
                labels: await d.locator('label').evaluateAll((els) => els.filter((l) => l.getClientRects().length).map((l) => l.innerText.trim()).filter(Boolean)),
                checkboxes: await H.itemForm().locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked}))),
                typeOptions: await H.typeSel().locator('option').evaluateAll((els) => els.map((e) => ({value: e.value, text: e.innerText.trim(), selected: e.selected}))),
                listbuilder: await H.lbState(),
                buttons: await texts(d.locator('button:visible, a.pkp_button:visible, .pkp_button:visible')),
                errors: await texts(d.locator('.error, label.error, .pkp_form_error, .formError')),
            };
        };
        H.saveItem = async (ms = 6000) => {
            const p = H.notices(ms);
            await H.itemForm().getByRole('button', {name: 'Save', exact: true}).first().click();
            const n = await p; await idle(page); await sleep(400);
            return n;
        };
        H.openItemEdit = async (question) => {
            const g = H.itemsGrid();
            const controls = await H.expandRow(H.rowOf(g, question));
            const actions = await texts(controls.locator('a'));
            await controls.getByRole('link', {name: 'Edit', exact: true}).first().click();
            await H.itemForm().waitFor({timeout: 10000});
            await H.itemForm().locator('.tox-toolbar__primary').first().waitFor({timeout: 10000}).catch(() => {});
            await idle(page); await sleep(300);
            return actions;
        };
        H.url = url;
        return H;
    }

    const sect = async (label, fn) => { try { await fn(); } catch (e) { facts.errors[label] = String(e.stack || e).slice(0, 900); log(`[ERROR ${label}]`, app.name, facts.errors[label].slice(0, 400)); } };

    // =========================== A1: manager on context A ===========================
    if (on('a1')) {
        const ctx = sc.A;
        facts.steps.a_mail_before = await mailCounts(ctx.users);
        const {page, close} = await launch(app);
        page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
        const H = bind(page, ctx);
        try {
            await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
            await sect('a1_list', async () => {
                await H.openForms();
                await H.full('a1-list');
                const g = await H.readGrid(H.grid());
                done('a1_list', {url: page.url(), heading: g.heading, columns: g.columns, gridActions: g.gridActions, rows: g.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active}))});
                done('a1_gamma_actions', await H.rowActions(H.grid(), 'Gamma'));
                done('a1_delta_actions', await H.rowActions(H.grid(), 'Delta'));
                await H.full('a1-row-actions');
            });
            // Rule 12/13: the in-use form's Preview window
            await sect('a1_gamma_preview', async () => {
                await H.openFormWindow('Gamma', 'Preview');
                const info = await H.windowInfo();
                await H.full('a1-gamma-preview-window');
                const preview = await H.readPreview();
                const greyed = H.dlg().locator('#editReviewFormTabs li').filter({hasText: 'Form Items'}).first();
                await loc(page, 'Preview window (form in use): greyed "Form Items" tab', greyed);
                await greyed.locator('a').first().click({force: true, timeout: 5000}).catch(() => {});
                await sleep(500);
                const afterPress = await H.windowInfo();
                const greyed2 = H.dlg().locator('#editReviewFormTabs li').filter({hasText: 'Review Form'}).first();
                await greyed2.locator('a').first().click({force: true, timeout: 5000}).catch(() => {});
                await sleep(500);
                const afterPress2 = await H.windowInfo();
                await H.full('a1-gamma-preview-after-grey-press');
                done('a1_gamma_preview', {window: info, preview, afterPressFormItems: afterPress, afterPressReviewForm: afterPress2});
                await H.closeWindow();
            });
            // Rule 13: Delta's Edit window, tabs, Preview Form, save on "Review Form"
            await sect('a1_delta_edit', async () => {
                await H.openFormWindow('Delta', 'Edit');
                const info = await H.windowInfo();
                const labels = await H.dlg().locator('label').evaluateAll((els) => els.filter((l) => l.getClientRects().length).map((l) => l.innerText.trim()).filter(Boolean));
                await H.full('a1-delta-edit-window');
                await H.clickFormTab('Form Items');
                const items = await H.readGrid(H.itemsGrid());
                await H.full('a1-delta-items');
                await H.clickFormTab('Preview Form');
                const preview = await H.readPreview();
                // the controls can be typed into
                const box = H.dlg().locator('.ui-tabs-panel:visible input[type=text]').first();
                let typed = null;
                if (await box.count()) { await box.fill('typed in preview'); typed = await box.inputValue(); }
                const reqCount = await page.locator('main').evaluate(() => 0).catch(() => 0);
                await H.full('a1-delta-preview-typed');
                done('a1_delta_window', {window: info, labels, items: {columns: items.columns, gridActions: items.gridActions, rows: items.rows.map((r) => r.cells)}, preview, typed, reqCount});
                await H.clickFormTab('Review Form');
                const title = H.dlg().locator('input[name^="title"]').first();
                await title.fill('Delta v2');
                const n = H.notices(6000);
                await H.dlg().locator('form').getByRole('button', {name: 'Save', exact: true}).first().click();
                const saved = await n; await idle(page); await sleep(500);
                const g = await H.readGrid(H.grid());
                await H.full('a1-delta-saved');
                done('a1_delta_save', {notices: saved, dialogsOpen: await page.locator('[role="dialog"]:visible').count(), rows: g.rows.map((r) => ({title: r.title, cells: r.cells}))});
            });
            // Rule 12d: order
            await sect('a1_order', async () => {
                await H.grid().locator('.pkp_linkaction_orderItems').first().click(); await sleep(500);
                const ordering = await H.readGrid(H.grid());
                await H.full('a1-ordering-mode');
                await H.dragRowAbove(H.grid(), 'Delta v2', 'Gamma');
                const dragged = await H.readGrid(H.grid());
                const n = H.notices(4000);
                await H.grid().locator('.order_finish_controls .saveButton').click();
                const doneNotices = await n; await idle(page); await sleep(500);
                await page.reload(); await idle(page); await H.openForms();
                const reloaded = await H.readGrid(H.grid());
                await H.full('a1-order-after-done-reload');
                await H.grid().locator('.pkp_linkaction_orderItems').first().click(); await sleep(500);
                await H.dragRowAbove(H.grid(), 'Gamma', 'Delta v2');
                const dragged2 = await H.readGrid(H.grid());
                await H.grid().locator('.order_finish_controls .cancelFormButton').click(); await idle(page); await sleep(500);
                const afterCancel = await H.readGrid(H.grid());
                await page.reload(); await idle(page); await H.openForms();
                const reloaded2 = await H.readGrid(H.grid());
                await H.full('a1-order-after-cancel-reload');
                done('a1_order', {orderingMode: {gridActions: ordering.gridActions, finishControls: ordering.finishControls, moveIcons: ordering.rows.map((r) => r.moveIcon)},
                    afterDrag: dragged.rows.map((r) => r.title), doneNotices, afterDoneReload: reloaded.rows.map((r) => r.title),
                    cancel: {afterDrag: dragged2.rows.map((r) => r.title), afterCancel: afterCancel.rows.map((r) => r.title), afterReload: reloaded2.rows.map((r) => r.title)}});
                // put Gamma back first for the editors' list order check
                await H.grid().locator('.pkp_linkaction_orderItems').first().click(); await sleep(500);
                await H.dragRowAbove(H.grid(), 'Gamma', 'Delta v2');
                await H.grid().locator('.order_finish_controls .saveButton').click(); await idle(page); await sleep(500);
            });
            // Rule 12b/12c: copy Delta v2, read the copy, delete it
            await sect('a1_copy_delete', async () => {
                await page.reload(); await idle(page); await H.openForms();
                const controls = await H.expandRow(H.rowOf(H.grid(), 'Delta v2'));
                await controls.getByRole('link', {name: 'Copy', exact: true}).first().click();
                const confirm = await H.readDialog();
                await H.full('a1-copy-confirm');
                const copyNotices = await H.pressDialog('OK');
                const after = await H.readGrid(H.grid());
                await H.full('a1-after-copy');
                const copyActions = await H.rowActions(H.grid(), 'Delta v2', 1);
                await H.openFormWindow('Delta v2', 'Edit', 1);
                const winTitle = await H.dlg().locator('input[name^="title"]').first().inputValue().catch(() => null);
                const winDesc = await H.dlg().frameLocator('iframe').first().locator('body').innerText().catch(() => null);
                await H.clickFormTab('Form Items');
                const items = await H.readGrid(H.itemsGrid());
                await H.full('a1-copy-items');
                await H.closeWindow();
                done('a1_copy', {confirm, notices: copyNotices, rows: after.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active})), copyActions, copyWindow: {title: winTitle, description: winDesc, items: items.rows.map((r) => r.title)}});
                await page.reload(); await idle(page); await H.openForms();
                const c2 = await H.expandRow(H.rowOf(H.grid(), 'Delta v2', 1));
                await c2.getByRole('link', {name: 'Delete', exact: true}).first().click();
                const delConfirm = await H.readDialog();
                await H.full('a1-delete-confirm');
                const delNotices = await H.pressDialog('OK');
                const afterDel = await H.readGrid(H.grid());
                await H.full('a1-after-delete');
                done('a1_delete', {confirm: delConfirm, notices: delNotices, rows: afterDel.rows.map((r) => ({title: r.title, cells: r.cells}))});
            });
            // Rule 12: editors' lists with Gamma active, Delta inactive
            await sect('a1_lists_active', async () => {
                await H.openRound(ctx.sub3, 'a1-gamma-on');
                done('a1_add_reviewer_gamma_on', await H.addReviewerList('a1-gamma-on', 'Robin'));
                await H.openRound(ctx.sub1, 'a1-sub1');
                done('a1_edit_assignment_gamma_on', await H.editAssignmentWindow('Rowan', 'a1-gamma-on'));
            });
            if (app.name === 'ojs') await sect('a1_section', async () => {
                await page.goto(H.url('/management/settings/context#sections')); await idle(page);
                let sPanel = page.getByRole('tabpanel', {name: 'Sections', exact: true});
                if (!(await sPanel.isVisible().catch(() => false))) { await page.getByRole('tab', {name: 'Sections', exact: true}).click(); await idle(page); }
                const sGrid = sPanel.locator('.pkp_controllers_grid').first();
                await sGrid.locator('tbody tr.gridRow').first().waitFor({timeout: 20000}); await idle(page);
                const row = sGrid.locator('tbody tr.gridRow').first();
                await row.locator('.show_extras').first().click(); await idle(page);
                await row.locator('xpath=following-sibling::tr[1][contains(@class,"row_controls")]').getByRole('link', {name: 'Edit', exact: true}).first().click();
                const d = H.dlg();
                await d.locator('select[name="reviewFormId"]').first().waitFor({timeout: 20000}); await idle(page); await sleep(400);
                await H.full('a1-section-edit');
                const opts = await d.locator('select[name="reviewFormId"]').first().evaluate((s) => [...s.options].map((o) => ({value: o.value, text: o.text, selected: o.selected})));
                done('a1_section_review_form_list', {options: opts, labelText: /Review Form/.test(await d.innerText())});
                await H.closeWindow();
            });
            // Rule 12/12a/A2: deactivate the form in use
            await sect('a1_deactivate_in_use', async () => {
                await H.openForms();
                done('a1_deactivate_gamma', await H.toggleActive('Gamma', 'OK', 'a1-deactivate-gamma'));
                done('a1_gamma_actions_after_deactivate', await H.rowActions(H.grid(), 'Gamma'));
                await H.openRound(ctx.sub3, 'a1-none-active');
                done('a1_add_reviewer_none_active', await H.addReviewerList('a1-none-active', 'Robin'));
                await H.openRound(ctx.sub1, 'a1-sub1-none-active');
                done('a1_edit_assignment_none_active', await H.editAssignmentWindow('Rowan', 'a1-none-active'));
            });
            await signOut(page);
            // OMP control: the seeded press's series window has no "Review Form" list (read-only, nothing saved)
            if (app.name === 'omp') await sect('a1_series_control', async () => {
                await signIn(page, 'manager.maya'); await idle(page);
                await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/context#series`)); await idle(page);
                let sPanel = page.getByRole('tabpanel', {name: 'Series', exact: true});
                if (!(await sPanel.isVisible().catch(() => false))) { await page.getByRole('tab', {name: 'Series', exact: true}).click(); await idle(page); }
                const sGrid = sPanel.locator('.pkp_controllers_grid').first();
                await sGrid.locator('tbody tr.gridRow').first().waitFor({timeout: 20000}); await idle(page);
                const row = sGrid.locator('tbody tr.gridRow').first();
                await row.locator('.show_extras').first().click(); await idle(page);
                await row.locator('xpath=following-sibling::tr[1][contains(@class,"row_controls")]').getByRole('link', {name: 'Edit', exact: true}).first().click();
                const d = H.dlg();
                await d.locator('form input[name^="title"]').first().waitFor({timeout: 20000}); await idle(page); await sleep(600);
                await H.full('a1-series-edit-control');
                done('a1_series_control', {reviewFormListPresent: await d.locator('select[name="reviewFormId"]').count(), textHasReviewForm: /Review Form/.test(await d.innerText()), selects: await d.locator('select').evaluateAll((els) => els.map((e) => e.name))});
                await H.closeWindow();
                await signOut(page);
            });
        } finally { record(`a1-facts-${app.name}`, {steps: facts.steps, errors: facts.errors, browserDialogs: facts.browserDialogs}); await close(); }
    }

    // =========================== A1b: the assignment's Edit window with no active form ===========================
    if (on('a1b')) {
        const ctx = sc.A;
        const {page, close} = await launch(app);
        const H = bind(page, ctx);
        try {
            await sect('a1b_edit_assignment_none_active', async () => {
                await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
                await H.openRound(ctx.sub1, 'a1b-sub1-none-active');
                done('a1b_edit_assignment_none_active', await H.editAssignmentWindow('Rowan', 'a1b-none-active'));
                await signOut(page);
            });
        } finally { record(`a1b-facts-${app.name}`, {steps: facts.steps, errors: facts.errors}); await close(); }
    }

    // =========================== A2: the reviewer on the deactivated form ===========================
    if (on('a2')) {
        const ctx = sc.A;
        const {page, close} = await launch(app);
        page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
        const H = bind(page, ctx);
        try {
            await sect('a2_wizard', async () => {
                await signIn(page, ctx.users.rev1, {contextPath: ctx.path}); await idle(page);
                await page.goto(H.url(`/reviewer/submission/${ctx.sub1}`)); await idle(page);
                await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 20000}).catch(() => {});
                const onStep = async () => (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim();
                await H.full('a2-landing');
                const landing = await onStep();
                if (!/^3\./.test(landing)) {
                    for (const name of ['Save and continue', /Continue to Step #3/]) {
                        const b = page.getByRole('button', {name}); if (await b.count()) { await b.first().click(); await idle(page); }
                    }
                }
                await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('3.'), null, {timeout: 30000}).catch(() => {});
                await idle(page);
                const s3 = await H.full('a2-step3');
                const main = page.locator('main');
                const mainText = s3.text?.main || '';
                const order = ['Gamma instructions for the reviewer.', 'Is the sample adequate?', 'Consider the sampling frame.', 'Further remarks'].map((s) => ({s, at: mainText.indexOf(s)}));
                done('a2_step3', {landing, step: await onStep(), order, hasTitle: /Gamma/.test(mainText),
                    radios: await main.locator('input[type=radio]:visible').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, label: (e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText?.trim()})))});
                const yes = main.getByRole('radio', {name: 'Yes', exact: true}).first();
                await yes.check();
                const ta = main.locator('textarea:visible').first();
                if (await ta.count()) await ta.fill('Remarks from K4.');
                else { const body = page.frameLocator('main iframe').first().locator('body'); await body.click(); await page.keyboard.type('Remarks from K4.'); }
                const rec = main.locator('select').filter({has: page.locator('option', {hasText: /Accept/})}).first();
                let recChosen = null;
                if (await rec.count()) { await rec.selectOption({index: 1}); recChosen = await rec.evaluate((s) => ({name: s.name, chosen: s.options[s.selectedIndex]?.text})); }
                await H.full('a2-step3-filled');
                done('a2_filled', {recChosen});
                await page.getByRole('button', {name: 'Submit Review'}).first().click();
                await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null && /sure|submit/i.test(e.innerText)), null, {timeout: 8000}).catch(() => {});
                await H.full('a2-submit-confirm');
                const confirm = await H.readDialog().catch(() => null);
                if (confirm) await H.dlg().getByRole('button', {name: /^(OK|Submit Review|Yes)$/}).first().click();
                await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('4.'), null, {timeout: 30000}).catch(() => {});
                await idle(page);
                await H.full('a2-after-submit');
                done('a2_submitted', {confirm, step: await onStep(), url: page.url()});
                await signOut(page);
            });
        } finally { record(`a2-facts-${app.name}`, {steps: facts.steps, errors: facts.errors, browserDialogs: facts.browserDialogs}); await close(); }
    }

    // =========================== A3: counts after submission, reactivate ===========================
    if (on('a3')) {
        const ctx = sc.A;
        const {page, close} = await launch(app);
        const H = bind(page, ctx);
        try {
            await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
            await sect('a3_counts', async () => {
                await H.openForms();
                const g = await H.readGrid(H.grid());
                await H.full('a3-list-after-submit');
                done('a3_counts', {rows: g.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active}))});
                done('a3_gamma_actions', await H.rowActions(H.grid(), 'Gamma'));
                done('a3_reactivate_gamma', await H.toggleActive('Gamma', 'OK', 'a3-reactivate-gamma'));
                done('a3_cancel_on_deactivate', await H.toggleActive('Gamma', 'Cancel', 'a3-cancel-deactivate'));
            });
            await sect('a3_edit_assignment_active', async () => {
                await H.openRound(ctx.sub1, 'a3-sub1-gamma-on');
                done('a3_edit_assignment_gamma_on', await H.editAssignmentWindow('Rowan', 'a3-gamma-on'));
            });
            await signOut(page);
            facts.steps.a_mail_after = await mailCounts(ctx.users);
            done('a_mail', {before: facts.steps.a_mail_before, after: facts.steps.a_mail_after});
        } finally { record(`a3-facts-${app.name}`, {steps: facts.steps, errors: facts.errors}); await close(); }
    }

    // =========================== B: scenarios 6 and 8 on an empty context ===========================
    if (on('b')) {
        const ctx = sc.B;
        const mailBefore = await mailCounts(ctx.users);
        const {page, close} = await launch(app);
        page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
        const H = bind(page, ctx);
        try {
            await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
            await sect('b_empty_list', async () => {
                await page.goto(H.url('/management/settings/workflow#review/reviewForms')); await idle(page);
                if (!(await H.panel().isVisible().catch(() => false))) {
                    await page.getByRole('tab', {name: 'Review', exact: true}).click();
                    await page.getByRole('tabpanel', {name: 'Review', exact: true}).getByRole('tab', {name: 'Review Forms', exact: true}).click();
                    await idle(page);
                }
                await H.grid().waitFor({timeout: 20000}); await idle(page); await sleep(500);
                await H.full('b-list-empty');
                const g = await H.readGrid(H.grid());
                done('b_list_empty', {heading: g.heading, columns: g.columns, gridActions: g.gridActions, empty: g.empty, rows: g.rows.length, panelText: (await H.panel().innerText()).trim().slice(0, 400)});
            });
            // Scenario 6: create the form, refused save first
            await sect('b_create', async () => {
                await H.panel().getByText('Create Review Form', {exact: true}).first().click();
                const d = H.dlg();
                await d.locator('input[name^="title"]').first().waitFor({timeout: 15000}); await idle(page); await sleep(400);
                await H.full('b-create-window');
                const heading = await d.locator('h1, h2, h3, [class*="title"]').first().innerText().catch(() => null);
                const labels = await d.locator('label').evaluateAll((els) => els.filter((l) => l.getClientRects().length).map((l) => l.innerText.trim()).filter(Boolean));
                const n0 = H.notices(3000);
                await d.getByRole('button', {name: 'Save', exact: true}).last().click();
                const refusedNotices = await n0; await idle(page);
                await H.full('b-create-empty-save');
                const refused = {dialogsOpen: await page.locator('[role="dialog"]:visible').count(), errors: await texts(d.locator('.error, label.error, .pkp_form_error, .formError')), titleName: await d.locator('input[name^="title"]').first().evaluate((e) => e.getAttribute('aria-label') || e.labels?.[0]?.innerText || '').catch(() => null), notices: refusedNotices};
                await d.locator('input[name^="title"]').first().fill('Method check');
                const n = H.notices(6000);
                await d.getByRole('button', {name: 'Save', exact: true}).last().click();
                const saved = await n; await idle(page); await sleep(500);
                await H.grid().locator('tbody tr.gridRow').first().waitFor({timeout: 15000});
                const g = await H.readGrid(H.grid());
                await H.full('b-after-create');
                done('b_create', {heading, labels, refused, saved: {notices: saved, dialogsOpen: await page.locator('[role="dialog"]:visible').count(), rows: g.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active})), gridActions: g.gridActions}});
            });
            // Scenario 6: the items
            await sect('b_items', async () => {
                await H.openFormWindow('Method check', 'Edit');
                const editHeading = (await H.windowInfo()).heading;
                await H.clickFormTab('Form Items');
                const itemsEmpty = await H.readGrid(H.itemsGrid());
                await H.full('b-items-empty');
                await H.openCreateItem();
                const opened = await H.itemWindowInfo();
                await H.full('b-item-window');
                // refused: everything empty
                const refusedEmpty = {notices: await H.saveItem(3000), errors: await texts(H.dlg().locator('.error, label.error, .pkp_form_error, .formError')), open: await H.itemForm().isVisible()};
                await H.full('b-item-empty-save');
                // refused: question typed, type still "Choose item type"
                await H.fillFrame(0, 'Is the method sound?');
                const refusedNoType = {notices: await H.saveItem(3000), errors: await texts(H.dlg().locator('.error, label.error, .pkp_form_error, .formError')), open: await H.itemForm().isVisible(), typeSelected: await H.typeSel().evaluate((s) => s.options[s.selectedIndex]?.text)};
                await H.full('b-item-no-type-save');
                // Add Item before a type is chosen, then a second row
                const addBeforeType = await H.addOption('Yes');
                const afterFirst = await H.lbState();
                const addSecond = await H.addOption('No');
                const afterSecond = await H.lbState();
                await H.full('b-item-two-options');
                await H.itemForm().locator('input[name="required"]').check();
                await H.selectType('Radio buttons (you can only choose one)');
                const afterType = await H.lbState();
                const saved1 = await H.saveItem();
                const rows1 = await H.readGrid(H.itemsGrid());
                await H.full('b-item1-saved');
                done('b_item1', {editHeading, itemsEmpty: {gridActions: itemsEmpty.gridActions, columns: itemsEmpty.columns, empty: itemsEmpty.empty}, opened, refusedEmpty, refusedNoType, addBeforeType, afterFirst, addSecond, afterSecond, afterType, saved1: {notices: saved1, windowOpen: await H.itemForm().isVisible().catch(() => false), rows: rows1.rows.map((r) => r.cells)}, browserDialogs: facts.browserDialogs.slice()});
                // second item
                await H.openCreateItem();
                await H.fillFrame(0, 'Other remarks');
                await H.selectType('Extended text box');
                const saved2 = await H.saveItem();
                // third item: required, with a description, one option; later switched to a text type
                await H.openCreateItem();
                await H.fillFrame(0, 'Temp choice');
                await H.fillFrame(1, 'Pick one.');
                await H.itemForm().locator('input[name="required"]').check();
                await H.selectType('Drop-down box');
                await H.addOption('A');
                const saved3 = await H.saveItem();
                const rows3 = await H.readGrid(H.itemsGrid());
                await H.full('b-items-three');
                done('b_items_2_3', {saved2, saved3, rows: rows3.rows.map((r) => r.cells)});
                // Preview Form
                await H.clickFormTab('Preview Form');
                const preview = await H.readPreview();
                const radios = await H.dlg().locator('.ui-tabs-panel:visible input[type=radio]').evaluateAll((els) => els.map((e) => ({value: e.value, label: (e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText?.trim()})));
                const textareaCount = await H.dlg().locator('.ui-tabs-panel:visible textarea, .ui-tabs-panel:visible iframe').count();
                await H.full('b-preview');
                done('b_preview', {preview, radios, textareaCount});
                // the item's Edit window: heading, then switch Temp choice to a text type
                await H.clickFormTab('Form Items');
                const itemActions = await H.openItemEdit('Temp choice');
                const editInfo = await H.itemWindowInfo();
                await H.full('b-item-edit-window');
                const dlgsBefore = facts.browserDialogs.length;
                await H.selectType('Extended text box');
                const afterSwitch = {listbuilder: await H.lbState(), browserDialogs: facts.browserDialogs.slice(dlgsBefore), windowText: (await H.dlg().innerText()).slice(0, 600)};
                await H.full('b-item-switched');
                const savedSwitch = await H.saveItem();
                await H.openItemEdit('Temp choice');
                const reopened = {type: await H.typeSel().evaluate((s) => s.options[s.selectedIndex]?.text), listbuilder: await H.lbState()};
                await H.full('b-item-reopened');
                done('b_item_edit', {itemActions, editHeading: editInfo.heading, checkboxes: editInfo.checkboxes, afterSwitch, savedSwitch, reopened});
                // close the item window and the form window
                const closeItem = H.dlg().getByRole('button', {name: /Close/}).first();
                if (await closeItem.count()) await closeItem.click(); await sleep(400); await idle(page);
                await H.closeWindow();
            });
            // Scenario 6: Add Reviewer without and with an active form
            await sect('b_activate', async () => {
                await H.openRound(ctx.sub, 'b-before');
                done('b_add_reviewer_before', await H.addReviewerList('b-before', 'Casey'));
                await H.openForms();
                done('b_activate', await H.toggleActive('Method check', 'OK', 'b-activate'));
                await H.openRound(ctx.sub, 'b-active');
                done('b_add_reviewer_active', await H.addReviewerList('b-active', 'Casey'));
            });
            // Scenario 8: deactivate, then delete
            await sect('b_s8', async () => {
                await H.openForms();
                done('b_deactivate', await H.toggleActive('Method check', 'OK', 'b-deactivate'));
                await H.openRound(ctx.sub, 'b-deactivated');
                done('b_add_reviewer_deactivated', await H.addReviewerList('b-deactivated', 'Casey'));
                await H.openForms();
                const controls = await H.expandRow(H.rowOf(H.grid(), 'Method check'));
                done('b_actions_before_delete', await texts(controls.locator('a')));
                await controls.getByRole('link', {name: 'Delete', exact: true}).first().click();
                const confirm = await H.readDialog();
                await H.full('b-delete-confirm');
                const notices = await H.pressDialog('OK');
                await sleep(500);
                const g = await H.readGrid(H.grid());
                await H.full('b-after-delete');
                done('b_delete', {confirm, notices, rows: g.rows.map((r) => r.title), empty: g.empty, gridActions: g.gridActions});
            });
            await signOut(page);
            const mailAfter = await mailCounts(ctx.users);
            done('b_mail', {before: mailBefore, after: mailAfter});
        } finally { record(`b-facts-${app.name}`, {steps: facts.steps, errors: facts.errors, browserDialogs: facts.browserDialogs}); await close(); }
    }
    // =========================== C: follow-ups ===========================
    // (1) the assignment's Edit window on an in-progress review with an active form (sub4, seeded here);
    // (2) "Cancel" on a confirmation with a clean notice window; (3) when "Order" appears: 0, 1, 2 rows.
    if (on('c')) {
        if (!sc.A.sub4) {
            const A = sc.A;
            const s4 = await app.api.createSubmission({tag: `${A.tag}s4`, context: A.path, submitter: A.users.au, title: `K4 sub4 ${A.tag}`,
                decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: A.users.rev3, status: 'accepted', reviewForm: 'Gamma'}]}]});
            sc.A.sub4 = s4.submissionId; saveScratch();
        }
        const {page, close} = await launch(app);
        page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
        try {
            const HA = bind(page, sc.A);
            await sect('c_edit_assignment_in_progress', async () => {
                await signIn(page, sc.A.users.mgr, {contextPath: sc.A.path}); await idle(page);
                await HA.openRound(sc.A.sub4, 'c-sub4');
                done('c_edit_assignment_in_progress_gamma_on', await HA.editAssignmentWindow('Robin', 'c-in-progress-gamma-on'));
            });
            await sect('c_cancel_clean', async () => {
                await HA.openForms();
                const residual = await HA.notices(1500);
                done('c_cancel_on_deactivate', {residualNoticesBefore: residual, ...(await HA.toggleActive('Gamma', 'Cancel', 'c-cancel-deactivate'))});
                await signOut(page);
            });
            const HB = bind(page, sc.B);
            const orderState = async () => HB.grid().evaluate((root) => {
                const a = [...root.querySelectorAll('.pkp_linkaction_orderItems')];
                return {rows: root.querySelectorAll('tbody tr.gridRow').length, orderLinks: a.map((e) => ({text: e.innerText.trim(), visible: e.getClientRects().length > 0, display: getComputedStyle(e).display})),
                    visibleActions: [...root.querySelectorAll('.actions a, .pkp_linkactions a')].filter((e) => e.getClientRects().length > 0).map((e) => e.innerText.trim())};
            });
            await sect('c_order_visibility', async () => {
                await signIn(page, sc.B.users.mgr, {contextPath: sc.B.path}); await idle(page);
                await page.goto(HB.url('/management/settings/workflow#review/reviewForms')); await idle(page);
                if (!(await HB.panel().isVisible().catch(() => false))) {
                    await page.getByRole('tab', {name: 'Review', exact: true}).click();
                    await page.getByRole('tabpanel', {name: 'Review', exact: true}).getByRole('tab', {name: 'Review Forms', exact: true}).click();
                    await idle(page);
                }
                await HB.grid().waitFor({timeout: 20000}); await idle(page); await sleep(500);
                const zero = await orderState();
                await HB.full('c-order-0-rows');
                await HB.panel().getByText('Create Review Form', {exact: true}).first().click();
                await HB.dlg().locator('input[name^="title"]').first().waitFor({timeout: 15000}); await idle(page); await sleep(300);
                await HB.dlg().locator('input[name^="title"]').first().fill('Solo');
                await HB.dlg().getByRole('button', {name: 'Save', exact: true}).last().click(); await idle(page); await sleep(800);
                await HB.grid().locator('tbody tr.gridRow').first().waitFor({timeout: 15000});
                const one = await orderState();
                await HB.full('c-order-1-row');
                const controls = await HB.expandRow(HB.rowOf(HB.grid(), 'Solo'));
                await controls.getByRole('link', {name: 'Copy', exact: true}).first().click();
                await HB.readDialog();
                await HB.pressDialog('OK');
                await HB.grid().locator('tbody tr.gridRow').nth(1).waitFor({timeout: 15000});
                const two = await orderState();
                await HB.full('c-order-2-rows');
                done('c_order_visibility', {zero, one, two});
                await signOut(page);
            });
        } finally { record(`c-facts-${app.name}`, {steps: facts.steps, errors: facts.errors, browserDialogs: facts.browserDialogs}); await close(); }
    }
    // =========================== D: Rule 12d's last sentence — the editors' list follows the grid order ===========================
    if (on('d')) {
        const {page, close} = await launch(app);
        const H = bind(page, sc.A);
        try {
            await sect('d_list_order', async () => {
                await signIn(page, sc.A.users.mgr, {contextPath: sc.A.path}); await idle(page);
                await H.openForms();
                const g0 = await H.readGrid(H.grid());
                if (!g0.rows.find((r) => r.title === 'Delta v2').active[0].checked) await H.toggleActive('Delta v2', 'OK', 'd-activate-delta');
                const gridOrder1 = (await H.readGrid(H.grid())).rows.map((r) => r.title);
                await H.openRound(sc.A.sub3, 'd-order1');
                const list1 = await H.addReviewerList('d-order1', 'Robin');
                await H.openForms();
                await H.grid().locator('.pkp_linkaction_orderItems').first().click(); await sleep(500);
                await H.dragRowAbove(H.grid(), 'Delta v2', 'Gamma');
                await H.grid().locator('.order_finish_controls .saveButton').click(); await idle(page); await sleep(500);
                await page.reload(); await idle(page); await H.openForms();
                const gridOrder2 = (await H.readGrid(H.grid())).rows.map((r) => r.title);
                await H.full('d-grid-reordered');
                await H.openRound(sc.A.sub3, 'd-order2');
                const list2 = await H.addReviewerList('d-order2', 'Robin');
                done('d_list_order', {gridOrder1, list1: list1.options?.map((o) => o.text), gridOrder2, list2: list2.options?.map((o) => o.text)});
                await signOut(page);
            });
        } finally { record(`d-facts-${app.name}`, {steps: facts.steps, errors: facts.errors}); await close(); }
    }
    // =========================== E: the "Item" box empty with a type chosen ===========================
    if (on('e')) {
        const {page, close} = await launch(app);
        const H = bind(page, sc.B);
        try {
            await sect('e_item_empty_with_type', async () => {
                await signIn(page, sc.B.users.mgr, {contextPath: sc.B.path}); await idle(page);
                await H.openForms();
                await H.openFormWindow('Solo', 'Edit');
                await H.clickFormTab('Form Items');
                await H.openCreateItem();
                await H.selectType('Extended text box');
                const notices = await H.saveItem(3000);
                await H.full('e-item-empty-with-type-save');
                const d = H.dlg();
                const aria = await d.ariaSnapshot();
                done('e_item_empty_with_type', {notices, windowOpen: await H.itemForm().isVisible(), requiredMessages: (aria.match(/This field is required\./g) || []).length,
                    errors: await texts(d.locator('.error, label.error, .pkp_form_error, .formError')), itemsRows: (await H.readGrid(H.itemsGrid()).catch(() => ({rows: []}))).rows.map((r) => r.title)});
                await signOut(page);
            });
        } finally { record(`e-facts-${app.name}`, {steps: facts.steps, errors: facts.errors}); await close(); }
    }
    if (Object.keys(facts.errors).length) log('[errors]', app.name, JSON.stringify(facts.errors).slice(0, 3000));
});
