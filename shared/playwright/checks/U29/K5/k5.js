// U29 claim check, chunk K5: items, what an item does for the reviewer, and
// languages, on OJS and OMP (OPS has no "Review" tab; nothing to drive there).
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Rules 14–16 (lines
// 309–340), scenario 7 (522–530), register A2 (596–607) and A5 (627–634).
//
// Seeds two scratch contexts per app:
//   A — open review; form "Method check" (active, in use: sub1 carries it with an
//       accepted reviewer) with one item of each of the six types, the textarea
//       item seeded with "Included in message to author" off; a spare reviewer.
//   B — forms "Blank form" (no items) and "Lang form" (English-only items), sub
//       carried by an accepted reviewer, for the "No Items" list and Rule 16
//       (French ticked under "Forms" through Settings › Website › Languages).
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U29/K5/k5.js
//   PHASES=seed,a1,a2,a3,b1,c1,c2   (default: all; later phases reuse k5-scratch-<app>.json; b2 is kept
//   as a record of the one-locale attempt: a context without fr_CA as a UI locale drops the /fr_CA/ segment)
//
// Order matters in A: a1 ends with "Method check" (in use) deactivated, a2 has its
// reviewer submit on the wizard's step 3, a3 reactivates and reads the review as
// the editor (Read Review, the "Request Revisions" email) and as the author.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'a1', 'a2', 'a3', 'b1', 'c1', 'c2'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratchFile = (app) => path.join(outDir(), `k5-scratch-${app.name}.json`);
const factsFile = (app) => path.join(outDir(), `k5-facts-${app.name}.json`);
const texts = async (l) => (await l.allInnerTexts()).map((s) => s.trim()).filter(Boolean);

forEachApp(async (app) => {
    if (app.name === 'ops') return;
    let sc = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : {};
    const saveScratch = () => fs.writeFileSync(scratchFile(app), JSON.stringify(sc, null, 2));
    // facts merge on a partial rerun (PHASES=…), as ccK3's note asks
    const facts = fs.existsSync(factsFile(app)) ? JSON.parse(fs.readFileSync(factsFile(app), 'utf8')) : {app: app.name, steps: {}, browserDialogs: [], errors: {}};
    facts.browserDialogs = facts.browserDialogs || [];
    const done = (label, data) => { facts.steps[label] = data; log(`[${label}]`, app.name, JSON.stringify(data).slice(0, 1600)); };
    const saveFacts = () => fs.writeFileSync(factsFile(app), JSON.stringify(facts, null, 2));

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.A) {
        const tA = tag('u29k5a');
        const A = {mgr: `${tA}mgr`, au: `${tA}au`, rev1: `${tA}rev1`, rev3: `${tA}rev3`};
        const ctxA = await app.api.createContext({
            tag: tA,
            users: [
                {username: A.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: A.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: A.rev1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
                {username: A.rev3, roles: ['externalReviewer'], givenName: 'Robin', familyName: 'Spare'},
            ],
            review: {defaultReviewMode: 'open'},
            reviewForms: [
                {title: 'Method check', description: 'Checks the method section.', elements: [
                    {question: 'Is the method sound?', description: 'Judge the design.', type: 'radiobuttons', required: true, options: ['Yes', 'No']},
                    {question: 'Other remarks', type: 'textarea', included: false},
                    {question: 'One word, please', type: 'smalltextfield'},
                    {question: 'One line summary', type: 'textfield'},
                    {question: 'Which sections need work?', type: 'checkboxes', options: ['Intro', 'Methods', 'Results']},
                    {question: 'Overall rating', type: 'dropdownbox', options: ['Good', 'Poor']},
                ]},
            ],
        });
        const pA = ctxA.path || tA;
        const s1 = await app.api.createSubmission({tag: `${tA}s1`, context: pA, submitter: A.au, title: `K5 sub1 ${tA}`,
            decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: A.rev1, status: 'accepted', reviewForm: 'Method check'}]}]});
        const tB = tag('u29k5b');
        const B = {mgr: `${tB}mgr`, au: `${tB}au`, rev: `${tB}rev`};
        const formsB = [
            {title: 'Lang form', description: 'Lang form description.', elements: [
                {question: 'Q one', type: 'textfield'},
                {question: 'Q two', type: 'textarea'},
                {question: 'Q three', type: 'radiobuttons', options: ['Oui', 'Non']},
            ]},
        ];
        let blankSeeded = true;
        let ctxB;
        try {
            ctxB = await app.api.createContext({tag: tB, users: [
                {username: B.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: B.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: B.rev, roles: ['externalReviewer'], givenName: 'Casey', familyName: 'Reviewer'},
            ], reviewForms: [{title: 'Blank form', elements: []}, ...formsB]});
        } catch (e) {
            blankSeeded = false;
            facts.errors.seed_blank = String(e.message || e).slice(0, 400);
            ctxB = await app.api.createContext({tag: tB, users: [
                {username: B.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: B.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: B.rev, roles: ['externalReviewer'], givenName: 'Casey', familyName: 'Reviewer'},
            ], reviewForms: formsB});
        }
        const pB = ctxB.path || tB;
        const sB = await app.api.createSubmission({tag: `${tB}s1`, context: pB, submitter: B.au, title: `K5 B sub ${tB}`,
            decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: B.rev, status: 'accepted', reviewForm: 'Lang form'}]}]});
        sc = {A: {tag: tA, path: pA, users: A, sub1: s1.submissionId}, B: {tag: tB, path: pB, users: B, sub: sB.submissionId, blankSeeded}};
        saveScratch();
        log('[seed]', app.name, JSON.stringify(sc));
    }

    // ---- per-context helpers (bound to a page) ----------------------------------
    function bind(page, ctx) {
        const url = (p) => app.url(`/index.php/${ctx.path}${p}`);
        const H = {url};
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
            // a hash-only goto does not reload: leave to the journal index first (ccK3's note), so open windows are gone
            await page.goto(url('/index')); await idle(page);
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
            const rows = [...root.querySelectorAll('tbody tr.gridRow')].filter(vis).map((tr) => ({
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
        H.rowOf = (g, title, nth = 0) => g.locator('tbody tr.gridRow').filter({hasText: title}).nth(nth);
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
        H.dragRowAbove = async (g, movingRow, targetRow) => {
            const mb = await movingRow.boundingBox(); const tb = await targetRow.boundingBox();
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
        H.ensureItemsTab = async (title, nth) => {
            if (await H.itemsGrid().isVisible().catch(() => false) && /Form Items/.test(await H.itemsGrid().innerText().catch(() => ''))) return;
            await H.openForms();
            await H.openFormWindow(title, 'Edit', nth);
            await H.clickFormTab('Form Items');
        };
        H.closeWindow = async () => {
            const d = H.dlg();
            const close = d.getByRole('button', {name: /Close/}).first();
            if (await close.count()) await close.click(); else await d.locator('.pkpModalCloseButton, .close').first().click();
            await sleep(400); await idle(page);
        };
        // the item window
        H.itemForm = () => page.locator('form#reviewFormElementForm');
        H.lbState = async () => ({
            addLink: await H.itemForm().locator('.pkp_linkaction_addItem').evaluateAll((els) => els.map((e) => ({tag: e.tagName, text: e.innerText.trim(), disabled: e.disabled, aria: e.getAttribute('aria-disabled')}))),
            columns: await texts(H.itemForm().locator('#elementOptions thead th')),
            rows: await H.itemForm().locator('#elementOptions tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.offsetParent !== null).map((tr) => ({
                text: tr.innerText.trim(), inputs: [...tr.querySelectorAll('input:not([type=hidden])')].map((i) => ({type: i.type, name: i.name, value: i.value, visible: i.offsetParent !== null})),
            }))),
        });
        H.typeSel = () => H.itemForm().locator('select#elementType, select[name=elementType]').first();
        H.selectType = async (label) => { await H.typeSel().selectOption({label}); await sleep(400); };
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
                type: await H.typeSel().evaluate((s) => s.options[s.selectedIndex]?.text).catch(() => null),
                iframes: await H.itemForm().locator('iframe').evaluateAll((els) => els.map((e) => e.id)),
                localeLabels: await H.itemForm().locator('.localizable, .pkp_form_localeToggle, label[for*="fr_CA"], [id*="fr_CA"]').evaluateAll((els) => els.map((e) => `${e.tagName}#${e.id}.${e.className}`).slice(0, 20)),
                listbuilder: await H.lbState(),
                buttons: await texts(d.locator('button:visible, a.pkp_button:visible, .pkp_button:visible')),
                errors: await texts(d.locator('.error, label.error, .pkp_form_error, .formError')),
            };
        };
        H.saveItem = async (ms = 6000) => {
            const p = H.notices(ms);
            await H.itemForm().getByRole('button', {name: 'Save', exact: true}).first().click();
            const n = await p; await idle(page); await sleep(400);
            return {notices: n, itemWindowOpen: await H.itemForm().isVisible().catch(() => false)};
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
        H.fillFrame = async (frameLoc, text) => {
            await frameLoc.locator('body').click();
            await frameLoc.locator('body').fill(text);
        };
        H.itemQuestionFrame = async (locale) => {
            const sel = locale ? `iframe[id*="question"][id*="${locale}"]` : 'iframe[id*="question"]';
            return H.itemForm().frameLocator((await H.itemForm().locator(sel).count()) ? sel : 'iframe').first();
        };
        // walk of a panel: text nodes, controls and required marks in order
        H.walk = (root) => root.evaluate((p) => {
            const out = [];
            const it = document.createTreeWalker(p, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let n;
            while ((n = it.nextNode())) {
                if (n.nodeType === 3) { const t = n.textContent.trim(); if (t && n.parentElement.closest('select, script, style') === null) out.push(`T:${t.slice(0, 70)}`); }
                else if (/^(INPUT|TEXTAREA)$/.test(n.tagName)) { if (n.type !== 'hidden' && n.getClientRects().length) out.push(`C:${n.tagName.toLowerCase()}[${n.type || ''}]${n.name ? ' ' + n.name : ''}${n.tagName === 'TEXTAREA' ? ` rows=${n.rows}` : ''}`); }
                else if (n.tagName === 'SELECT') out.push(`C:select ${n.name} [${[...n.options].map((o) => o.text.trim()).join('|')}]`);
                else if (n.tagName === 'IFRAME') out.push(`C:iframe#${n.id}`);
                else if (n.classList.contains('req')) out.push(`M:${n.textContent.trim()}`);
            }
            return out.slice(0, 140);
        });
        // review stage
        H.revTable = () => page.getByRole('table', {name: 'Reviewers', exact: true});
        H.openRound = async (id, label, view = 'editorial') => {
            await page.goto(url(`/dashboard/${view}?workflowSubmissionId=${id}`)); await idle(page);
            await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click({timeout: 8000}).catch(() => {});
            await page.getByRole('table', {name: /Reviewers|Reviews/}).first().waitFor({timeout: 30000}).catch(() => {}); await idle(page);
            return H.full(label);
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
        // the reviewer's wizard
        H.wizardTo3 = async (id, label, locale = '') => {
            await page.goto(url(`${locale ? '/' + locale : ''}/reviewer/submission/${id}`)); await idle(page);
            await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 20000}).catch(() => {});
            const onStep = async () => (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim();
            const landing = await onStep();
            if (!/^3\./.test(landing)) {
                const priv = page.getByRole('checkbox', {name: /privacy statement|confidentialit/i}); if (await priv.count()) await priv.first().check().catch(() => {});
                for (let i = 0; i < 2; i++) {
                    const b = page.locator('main').getByRole('button', {name: /continue|continu|étape|step/i}).first();
                    if (await b.count()) { await b.click(); await idle(page); await sleep(400); }
                }
            }
            await page.waitForFunction(() => /^3/.test(document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim() || ''), null, {timeout: 30000}).catch(() => {});
            await idle(page);
            const s3 = await H.full(`${label}-step3`);
            return {landing, step: await onStep(), text: (s3.text?.main || '').slice(0, 3000), walk: await H.walk(page.locator('main'))};
        };
        H.submitReview = async (label) => {
            const out = {};
            await page.getByRole('button', {name: 'Submit Review'}).first().click();
            await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null && /sure/i.test(e.innerText)), null, {timeout: 8000}).catch(() => {});
            out.confirm = await H.readDialog().catch(() => null);
            if (out.confirm) await H.dlg().getByRole('button', {name: 'OK', exact: true}).last().click();
            await page.waitForFunction(() => /^4/.test(document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim() || '') || /required|obligatoire/i.test(document.querySelector('main')?.innerText || ''), null, {timeout: 30000}).catch(() => {});
            await idle(page); await sleep(500);
            const s = await H.full(`${label}-after-submit`);
            out.step = (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim();
            out.errors = await texts(page.locator('main .error, main label.error, main .pkp_form_error, main .formError, main [class*="error"]:visible'));
            out.head = (s.text?.main || '').slice(0, 600);
            return out;
        };
        return H;
    }

    const REDO = (process.env.REDO || '').split(',').filter(Boolean);
    const sect = async (label, fn) => {
        if (process.env.SKIP_DONE === '1' && facts.steps[label] !== undefined && !facts.errors[label] && !REDO.includes(label)) { log(`[skip ${label}]`, app.name); return; }
        delete facts.errors[label];
        try { await fn(); } catch (e) { facts.errors[label] = String(e.stack || e).slice(0, 900); log(`[ERROR ${label}]`, app.name, facts.errors[label].slice(0, 400)); } };
    const withPage = async (ctx, fn) => {
        const {page, close} = await launch(app);
        page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
        const H = bind(page, ctx);
        try { await fn(page, H); } finally { await signOut(page).catch(() => {}); await close(); saveFacts(); }
    };

    // =========================== A1: manager on context A ===========================
    if (on('a1')) await withPage(sc.A, async (page, H) => {
        const ctx = sc.A;
        await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
        // scenario 7: the row of a form in use, and its Preview window
        await sect('a1_list', async () => {
            await H.openForms();
            await H.full('a1-list');
            const g = await H.readGrid(H.grid());
            done('a1_list', {columns: g.columns, gridActions: g.gridActions, rows: g.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active}))});
            done('a1_row_actions', await H.rowActions(H.grid(), 'Method check'));
            await H.full('a1-row-actions');
        });
        await sect('a1_preview', async () => {
            await H.openFormWindow('Method check', 'Preview');
            const info = await H.windowInfo();
            await H.full('a1-preview-window');
            const walk = await H.walk(H.dlg().locator('.ui-tabs-panel:visible').first());
            done('a1_preview', {window: info, walk});
            await H.closeWindow();
        });
        // scenario 7: Copy › OK; the copy's row, its Edit › Form Items
        await sect('a1_copy', async () => {
            const controls = await H.expandRow(H.rowOf(H.grid(), 'Method check', 0));
            await controls.getByRole('link', {name: 'Copy', exact: true}).first().click();
            const confirm = await H.readDialog();
            await H.full('a1-copy-confirm');
            const notices = await H.pressDialog('OK');
            await H.grid().locator('tbody tr.gridRow').nth(1).waitFor({timeout: 20000});
            const g = await H.readGrid(H.grid());
            await H.full('a1-after-copy');
            const copyActions = await H.rowActions(H.grid(), 'Method check', 1);
            await H.full('a1-copy-row-actions');
            done('a1_copy', {confirm, notices, rows: g.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active})), copyActions});
        });
        // Rule 14 on the copy: the items list, row actions, the "Edit" item window (seeded included=false item)
        await sect('a1_items', async () => {
            await H.openFormWindow('Method check', 'Edit', 1);
            const win = await H.windowInfo();
            await H.clickFormTab('Form Items');
            const items = await H.readGrid(H.itemsGrid());
            await H.full('a1-copy-items');
            const actions = await H.openItemEdit('Other remarks');
            const info = await H.itemWindowInfo();
            await H.full('a1-item-edit-other-remarks');
            await loc(page, 'Item window: "Included in message to author" box', H.itemForm().locator('input[type=checkbox][name="included"]'));
            await loc(page, 'Item window: "Reviewers required to complete item" box', H.itemForm().locator('input[type=checkbox][name="required"]'));
            await H.itemForm().getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            await H.itemForm().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            done('a1_items', {window: win, items: {heading: items.heading, columns: items.columns, gridActions: items.gridActions, empty: items.empty, rows: items.rows.map((r) => r.cells)}, otherRemarksActions: actions, otherRemarksWindow: {heading: info.heading, labels: info.labels, checkboxes: info.checkboxes, type: info.type, listbuilder: info.listbuilder, buttons: info.buttons}});
        });
        // Rule 14: Delete an item of the copy
        await sect('a1_delete_item', async () => {
            const g = H.itemsGrid();
            const controls = await H.expandRow(H.rowOf(g, 'One word, please'));
            await loc(page, 'Form Items row: "Delete"', controls.getByRole('link', {name: 'Delete', exact: true}));
            await controls.getByRole('link', {name: 'Delete', exact: true}).first().click();
            const confirm = await H.readDialog();
            await H.full('a1-item-delete-confirm');
            const notices = await H.pressDialog('OK');
            await sleep(800); await idle(page);
            const after = await H.readGrid(H.itemsGrid());
            await H.full('a1-items-after-delete');
            done('a1_delete_item', {confirm, notices, rows: after.rows.map((r) => r.cells)});
        });
        // Rule 14: Create New Item lands at the bottom; the window closes with the notice
        await sect('a1_create_item', async () => {
            await H.openCreateItem();
            const before = await H.itemWindowInfo();
            await H.fillFrame(await H.itemQuestionFrame(), 'Extra word');
            await H.selectType('Single word text box');
            const saved = await H.saveItem();
            const after = await H.readGrid(H.itemsGrid());
            await H.full('a1-items-after-create');
            done('a1_create_item', {heading: before.heading, saved, dialogsOpen: await page.locator('[role="dialog"]:visible').count(), rows: after.rows.map((r) => r.cells)});
        });
        // Rule 14: Order inside the window
        await sect('a1_order_items', async () => {
            await H.ensureItemsTab('Method check', 1);
            const g = H.itemsGrid();
            await loc(page, 'Form Items: "Order"', g.locator('.pkp_linkaction_orderItems'));
            await g.locator('.pkp_linkaction_orderItems').first().click(); await sleep(500);
            const ordering = await H.readGrid(g);
            await H.full('a1-items-ordering');
            await H.dragRowAbove(g, H.rowOf(g, 'Extra word'), H.rowOf(g, 'Is the method sound'));
            const dragged = await H.readGrid(g);
            const n = H.notices(3000);
            await g.locator('.order_finish_controls .saveButton').click();
            const notices = await n; await idle(page); await sleep(500);
            await H.closeWindow();
            await H.openFormWindow('Method check', 'Edit', 1);
            await H.clickFormTab('Form Items');
            const reopened = await H.readGrid(H.itemsGrid());
            await H.full('a1-items-after-order');
            done('a1_order_items', {orderingControls: ordering.finishControls, moveIcons: ordering.rows.map((r) => r.moveIcon), dragged: dragged.rows.map((r) => r.cells[0]), notices, reopened: reopened.rows.map((r) => r.cells[0])});
        });
        // A5: a saved radio item switched to a text type, saved, reopened
        await sect('a1_a5', async () => {
            await H.ensureItemsTab('Method check', 1);
            await H.openItemEdit('Is the method sound');
            const before = await H.itemWindowInfo();
            const dialogsBefore = facts.browserDialogs.length;
            await H.selectType('Extended text box');
            const afterSwitch = await H.lbState();
            await H.full('a1-a5-after-switch');
            const saved = await H.saveItem();
            await H.openItemEdit('Is the method sound');
            const reopened = await H.itemWindowInfo();
            await H.full('a1-a5-reopened');
            await H.itemForm().getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            await H.itemForm().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            done('a1_a5', {before: {type: before.type, rows: before.listbuilder.rows.map((r) => r.text)}, browserDialogsDuringSwitch: facts.browserDialogs.slice(dialogsBefore), afterSwitchRows: afterSwitch.rows.map((r) => r.text), saved, reopened: {type: reopened.type, rows: reopened.listbuilder.rows.map((r) => r.text), errors: reopened.errors}});
            await H.closeWindow();
        });
        // A2: deactivate the form in use; Add Reviewer afterwards
        await sect('a1_a2_deactivate', async () => {
            await H.openForms();
            done('a1_a2_deactivate', await H.toggleActive('Method check', 'OK', 'a1-a2-deactivate', 0));
            await page.reload(); await idle(page); await H.openForms();
            const g = await H.readGrid(H.grid());
            await H.full('a1-a2-after-reload');
            done('a1_a2_after_reload', g.rows.map((r) => ({title: r.title, cells: r.cells, active: r.active})));
        });
        await sect('a1_a2_add_reviewer', async () => {
            await H.openRound(ctx.sub1, 'a1-a2-review-stage');
            done('a1_a2_add_reviewer', await H.addReviewerList('a1-a2', 'Robin'));
        });
    });

    // =========================== A2: the reviewer on context A ===========================
    if (on('a2')) await withPage(sc.A, async (page, H) => {
        const ctx = sc.A;
        await signIn(page, ctx.users.rev1, {contextPath: ctx.path}); await idle(page);
        await sect('a2_step3', async () => {
            const s3 = await H.wizardTo3(ctx.sub1, 'a2');
            done('a2_step3', {landing: s3.landing, step: s3.step, walk: s3.walk, freeTextBoxes: (s3.text.match(/For author and editor|For editor only|Review Text|Comments for the editor/gi) || [])});
        });
        // Rule 15: "Submit Review" with the required item unanswered
        await sect('a2_required', async () => {
            done('a2_required', await H.submitReview('a2-required'));
        });
        // then answer everything and submit
        await sect('a2_submit', async () => {
            const main = page.locator('main');
            await main.getByRole('radio', {name: 'Yes', exact: true}).first().check();
            for (const ta of await main.locator('textarea[name^="reviewFormResponses"]:visible').all()) await ta.fill('Remarks from ccK5 (excluded from the author).');
            for (const tb of await main.locator('input[type=text][name^="reviewFormResponses"]:visible').all()) await tb.fill('word');
            const cb = main.locator('input[type=checkbox][name^="reviewFormResponses"]').first(); if (await cb.count()) await cb.check();
            const sel = main.locator('select[name^="reviewFormResponses"]').first(); if (await sel.count()) await sel.selectOption({index: 1});
            const rec = main.locator('select[name="reviewerRecommendationId"]'); if (await rec.count()) await rec.selectOption({label: 'Accept Submission'});
            await H.full('a2-step3-filled');
            done('a2_submit', await H.submitReview('a2-submit'));
        });
    });

    // =========================== A3: manager and author on context A ===========================
    if (on('a3')) await withPage(sc.A, async (page, H) => {
        const ctx = sc.A;
        await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
        // A2: re-tick Active (the activation warning)
        await sect('a3_reactivate', async () => {
            await H.openForms();
            done('a3_reactivate', await H.toggleActive('Method check', 'OK', 'a3-reactivate', 0));
        });
        // Rule 15: the editor reads the review in full
        await sect('a3_read_review', async () => {
            await H.openRound(ctx.sub1, 'a3-review-stage');
            const row = H.revTable().getByRole('row').filter({hasText: /Rowan/}).first();
            const rowText = (await row.innerText()).replace(/\s+/g, ' ');
            const btn = row.getByRole('button', {name: 'Read Review'});
            if (await btn.count()) { await btn.first().click(); } else {
                await row.getByRole('button', {name: 'More Actions'}).click();
                await page.getByRole('menuitem', {name: /Review Details|Read Review/}).first().click();
            }
            await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null && /Method check/.test(e.innerText)), null, {timeout: 20000}).catch(() => {});
            await idle(page);
            await H.full('a3-read-review-manager');
            const d = await H.readDialog();
            done('a3_read_review', {rowText, dialog: d.title, hasItem1: /Is the method sound/.test(d.text), hasOtherRemarks: /Other remarks/.test(d.text), hasRemarkAnswer: /Remarks from ccK5/.test(d.text), buttons: d.buttons, text: d.text.slice(0, 1200)});
            await H.dlg().getByRole('button', {name: /^Cancel$|^Close$/}).last().click().catch(() => {});
            await idle(page);
        });
        // Rule 15: the decision email's reviews ("Request Revisions", left unsent)
        await sect('a3_decision_email', async () => {
            await H.openRound(ctx.sub1, 'a3-review-stage-decision');
            const btn = page.getByRole('button', {name: /Request Revisions/}).first();
            await loc(page, 'Review stage: "Request Revisions"', btn);
            await btn.click(); await idle(page); await sleep(800);
            const readFrames = async () => {
                const bodies = [];
                for (const f of page.frames()) { if (f === page.mainFrame()) continue; const t = await f.locator('body').innerText().catch(() => ''); if (t.trim()) bodies.push(t.trim().slice(0, 3000)); }
                return bodies;
            };
            const steps = [];
            let bodies = [];
            for (let i = 0; i < 4; i++) {
                const d = H.dlg();
                const info = await d.evaluate((el) => ({heading: (el.querySelector('h1, h2, h3') || {}).innerText?.trim(), stepsText: el.innerText.trim().slice(0, 500), buttons: [...el.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => b.innerText.trim()).filter(Boolean)})).catch(() => null);
                await H.full(`a3-request-revisions-step${i + 1}`);
                bodies = await readFrames();
                steps.push({info, frames: bodies.length});
                if (bodies.some((b) => /Method check|Is the method sound/.test(b))) break;
                const next = d.getByRole('button', {name: /^Next$|^Continue$/}).first();
                if (!(await next.count())) break;
                await next.click(); await idle(page);
                await page.waitForFunction(() => !!(window.tinyMCE || window.tinymce)?.activeEditor?.initialized, null, {timeout: 15000}).catch(() => {});
                await sleep(1200);
            }
            const all = bodies.join('\n');
            done('a3_decision_email', {steps, hasItem1: /Is the method sound/.test(all), hasYes: /\bYes\b/.test(all), hasOtherRemarks: /Other remarks/.test(all), hasRemarkAnswer: /Remarks from ccK5/.test(all), hasOneWord: /One word, please/.test(all), bodies: bodies.map((b) => b.slice(0, 1500))});
            // leave without recording the decision
            const cancel = H.dlg().getByRole('button', {name: /^Cancel$/}).first();
            if (await cancel.count()) await cancel.click().catch(() => {});
            await sleep(600);
            const confirm = page.locator('[role="dialog"]:visible').last();
            const yes = confirm.getByRole('button', {name: /^Yes$|^OK$|^Leave$/}).first();
            if (await yes.count()) await yes.click().catch(() => {});
            await idle(page);
            await H.full('a3-after-cancel-decision');
        });
        // Rule 15: the author's own reading
        await sect('a3_author_read', async () => {
            await signIn(page, ctx.users.au, {contextPath: ctx.path}); await idle(page);
            await H.openRound(ctx.sub1, 'a3-author-stage', 'mySubmissions');
            const readBtns = page.locator('[role="dialog"]:visible, main').getByRole('button', {name: /Read Review/});
            const count = await readBtns.count();
            let dialog = null;
            if (count) {
                await readBtns.first().click();
                await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.offsetParent !== null).length > 1, null, {timeout: 20000}).catch(() => {});
                await idle(page);
                await H.full('a3-read-review-author');
                dialog = await H.readDialog();
            }
            done('a3_author_read', {readButtons: count, dialog: dialog && {title: dialog.title, buttons: dialog.buttons, hasItem1: /Is the method sound/.test(dialog.text), hasOtherRemarks: /Other remarks/.test(dialog.text), hasRemarkAnswer: /Remarks from ccK5/.test(dialog.text), hasOneWord: /One word, please/.test(dialog.text), text: dialog.text.slice(0, 1200)}});
        });
    });

    // =========================== B1: manager on context B ===========================
    if (on('b1')) await withPage(sc.B, async (page, H) => {
        const ctx = sc.B;
        await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
        // Rule 14: the empty items list
        await sect('b1_empty_items', async () => {
            await H.openForms();
            const g = await H.readGrid(H.grid());
            done('b1_list', g.rows.map((r) => ({title: r.title, cells: r.cells})));
            if (!ctx.blankSeeded) {
                await H.grid().getByText('Create Review Form', {exact: true}).first().click();
                await H.dlg().locator('input[name^="title"]').first().waitFor({timeout: 15000});
                await H.dlg().locator('input[name^="title"]').first().fill('Blank form');
                await H.dlg().locator('form').getByRole('button', {name: 'Save', exact: true}).first().click();
                await idle(page); await sleep(800);
            }
            await H.openFormWindow('Blank form', 'Edit');
            await H.clickFormTab('Form Items');
            const items = await H.readGrid(H.itemsGrid());
            await H.full('b1-blank-items');
            done('b1_empty_items', {heading: items.heading, columns: items.columns, gridActions: items.gridActions, empty: items.empty, rows: items.rows.length, panelText: (await H.dlg().locator('.ui-tabs-panel:visible').first().innerText()).trim().slice(0, 400)});
            await H.closeWindow();
        });
        // Rule 16: one form language — the Create Review Form and item windows before French
        await sect('b1_before_french', async () => {
            await H.grid().getByText('Create Review Form', {exact: true}).first().click();
            await H.dlg().locator('input[name^="title"]').first().waitFor({timeout: 15000}); await sleep(500);
            const titleInputs = await H.dlg().locator('input[name^="title"]').evaluateAll((els) => els.map((e) => ({name: e.name, visible: e.offsetParent !== null})));
            const descFrames = await H.dlg().locator('iframe').evaluateAll((els) => els.map((e) => e.id));
            await H.full('b1-create-form-one-language');
            await H.closeWindow();
            done('b1_before_french', {titleInputs, descFrames});
        });
        // tick French under "Forms" (Settings › Website › Setup › Languages), ccK3's locators
        await sect('b1_tick_french', async () => {
            await page.goto(H.url('/management/settings/website')); await idle(page);
            await page.locator('#setup-button').click(); await idle(page);
            await page.getByRole('tab', {name: 'Languages', exact: true}).click();
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000}); await idle(page);
            const box = page.locator('input[id*="fr_CA-formLocale"]').first();
            await loc(page, 'Languages: French row "Forms" box', box);
            const before = await box.isChecked();
            if (!before) { await box.click(); await idle(page); await sleep(1000); }
            await H.full('b1-languages');
            done('b1_tick_french', {before, after: await box.isChecked()});
        });
        // Rule 16 with two form languages: the Create Review Form window (the item window and the reviewer are phase c1/c2 on context C)
        await sect('b1_two_languages_form', async () => {
            await H.openForms();
            await H.grid().getByText('Create Review Form', {exact: true}).first().click();
            await H.dlg().locator('input[name^="title"]').first().waitFor({timeout: 15000}); await sleep(500);
            const titleInputs = await H.dlg().locator('input[name^="title"]').evaluateAll((els) => els.map((e) => ({name: e.name, visible: e.offsetParent !== null})));
            const descFrames = await H.dlg().locator('iframe').evaluateAll((els) => els.map((e) => e.id));
            const labels = await H.dlg().locator('label').evaluateAll((els) => els.filter((l) => l.getClientRects().length).map((l) => l.innerText.trim()).filter(Boolean));
            await H.full('b1-create-form-two-languages');
            await H.closeWindow();
            done('b1_two_languages_form', {titleInputs, descFrames, labels});
        });
    });

    // =========================== B2: the reviewer on context B, French and English ===========================
    if (on('b2')) await withPage(sc.B, async (page, H) => {
        const ctx = sc.B;
        await signIn(page, ctx.users.rev, {contextPath: ctx.path}); await idle(page);
        await sect('b2_fr', async () => {
            const s = await H.wizardTo3(ctx.sub, 'b2-fr', 'fr_CA');
            done('b2_fr', {url: page.url(), step: s.step, hasQun: /Q un \(fr\)/.test(s.text), hasQone: /Q one/.test(s.text), hasQtwo: /Q two/.test(s.text), hasQthree: /Q three/.test(s.text), title: /Lang form/.test(s.text), walk: s.walk.filter((w) => /^T:/.test(w)).slice(0, 40)});
        });
        await sect('b2_en', async () => {
            const s = await H.wizardTo3(ctx.sub, 'b2-en', 'en');
            done('b2_en', {url: page.url(), step: s.step, hasQun: /Q un \(fr\)/.test(s.text), hasQone: /Q one/.test(s.text), hasQtwo: /Q two/.test(s.text), walk: s.walk.filter((w) => /^T:/.test(w)).slice(0, 40)});
        });
    });

    // =========================== C1: manager on context C (en + fr_CA UI locales) ===========================
    if (on('c1') && !sc.C) {
        const tC = tag('u29k5c');
        const C = {mgr: `${tC}mgr`, au: `${tC}au`, rev: `${tC}rev`};
        const ctxC = await app.api.createContext({tag: tC, context: {supportedLocales: ['en', 'fr_CA']}, users: [
            {username: C.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: C.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: C.rev, roles: ['externalReviewer'], givenName: 'Casey', familyName: 'Reviewer'},
        ], reviewForms: [{title: 'Lang form', description: 'Lang form description.', elements: [
            {question: 'Q one', type: 'textfield'},
            {question: 'Q two', type: 'textarea'},
            {question: 'Q three', type: 'radiobuttons', options: ['Oui', 'Non']},
        ]}]});
        sc.C = {tag: tC, path: ctxC.path || tC, users: C};
        saveScratch();
        log('[seed C]', app.name, JSON.stringify(sc.C));
    }
    if (on('c1')) await withPage(sc.C, async (page, H) => {
        const ctx = sc.C;
        await signIn(page, ctx.users.mgr, {contextPath: ctx.path}); await idle(page);
        await sect('c1_tick_french', async () => {
            await page.goto(H.url('/management/settings/website')); await idle(page);
            await page.locator('#setup-button').click(); await idle(page);
            await page.getByRole('tab', {name: 'Languages', exact: true}).click();
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000}); await idle(page);
            const box = page.locator('input[id*="fr_CA-formLocale"]').first();
            const before = await box.isChecked();
            if (!before) { await box.click(); await idle(page); await sleep(1000); }
            await H.full('c1-languages');
            done('c1_tick_french', {before, after: await box.isChecked()});
        });
        // Rule 16: the item window with two form languages ("Q three": Item, Description, Response Options)
        await sect('c1_item_q3', async () => {
            await H.openForms();
            await H.openFormWindow('Lang form', 'Edit');
            await H.clickFormTab('Form Items');
            await H.openItemEdit('Q three');
            const info = await H.itemWindowInfo();
            const frameVis = await H.itemForm().locator('iframe').evaluateAll((els) => els.map((e) => ({id: e.id, visible: e.getClientRects().length > 0})));
            const localeUi = await H.itemForm().evaluate((f) => [...f.querySelectorAll('.localizable, .pkp_form_localeToggle, .pkp_helpers_dropdown, .locale, [class*="locale"], [class*="Locale"]')].map((e) => `${e.tagName}.${e.className}:${(e.innerText || '').trim().slice(0, 40)}`).slice(0, 20));
            await H.full('c1-item-q3-two-languages');
            done('c1_item_q3', {labels: info.labels, iframes: frameVis, localeUi, listbuilder: info.listbuilder});
            await H.itemForm().getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            await H.itemForm().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        });
        // Rule 16: type a French question on "Q one" and save
        await sect('c1_french_q1', async () => {
            await H.ensureItemsTab('Lang form', 0);
            await H.openItemEdit('Q one');
            const frFrame = H.itemForm().locator('iframe[id*="question"][id*="fr_CA"]');
            const frIds = await frFrame.evaluateAll((els) => els.map((e) => ({id: e.id, visible: e.getClientRects().length > 0})));
            // a hidden French box sits behind a locale switch: try the toggles the legacy form uses
            // the French editor sits in the box's localization popover, shown while the English editor has focus
            // (MultilingualInputHandler focus/blur); the globe icon beside the toolbar is decorative
            let toggled = null;
            if (frIds.length && !frIds[0].visible) {
                await H.itemForm().frameLocator('iframe[id*="question"][id*="en"]').first().locator('body').click();
                await frFrame.first().waitFor({state: 'visible', timeout: 8000}).catch(() => {});
                await sleep(400);
                toggled = {
                    frVisibleAfterEnFocus: await frFrame.first().isVisible().catch(() => false),
                    frLabel: await H.itemForm().locator('label.locale_textarea').first().innerText().catch(() => null),
                    popover: await H.itemForm().locator('.localization_popover_container').evaluateAll((els) => els.map((e) => ({cls: e.className, visible: e.getClientRects().length > 0}))),
                };
                await loc(page, 'Item window: the French "Item" editor (popover under the English one)', frFrame.first());
                await H.full('c1-item-q1-french-shown');
            }
            const frVisible = await frFrame.first().isVisible().catch(() => false);
            if (frIds.length) await H.fillFrame(H.itemForm().frameLocator('iframe[id*="question"][id*="fr_CA"]').first(), 'Q un (fr)');
            await H.full('c1-item-q1-french-typed');
            const saved = await H.saveItem();
            await H.openItemEdit('Q one');
            const frText = await H.itemForm().frameLocator('iframe[id*="question"][id*="fr_CA"]').first().locator('body').innerText().catch(() => null);
            const enText = await H.itemForm().frameLocator('iframe[id*="question"]').first().locator('body').innerText().catch(() => null);
            await H.full('c1-item-q1-reopened');
            await H.itemForm().getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            await H.itemForm().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await H.closeWindow();
            done('c1_french_q1', {frIds, toggled, frVisible, saved, reopened: {en: enText, fr: frText}});
        });
        await sect('c1_title_popover', async () => {
            await H.openForms();
            await H.grid().getByText('Create Review Form', {exact: true}).first().click();
            const en = H.dlg().locator('input[name="title[en]"]').first();
            await en.waitFor({timeout: 15000}); await sleep(400);
            const fr = H.dlg().locator('input[name="title[fr_CA]"]').first();
            const before = await fr.isVisible().catch(() => false);
            await en.click(); await sleep(600);
            const after = await fr.isVisible().catch(() => false);
            const frLabel = await H.dlg().locator('label.locale').first().innerText().catch(() => null);
            const popover = await H.dlg().locator('.localization_popover_container, .localizationPopover, [class*="popover"]').evaluateAll((els) => els.map((e) => ({cls: e.className, visible: e.getClientRects().length > 0, text: e.innerText.trim().slice(0, 80)})));
            await H.full('c1-create-form-title-focused');
            await H.closeWindow();
            done('c1_title_popover', {frVisibleBeforeFocus: before, frVisibleAfterFocus: after, frLabel, popover});
        });
        // the submission is seeded only once the French text is saved: a form in use has no "Edit"
        if (!ctx.sub && !facts.errors.c1_french_q1) {
            const sC = await app.api.createSubmission({tag: `${ctx.tag}s1`, context: ctx.path, submitter: ctx.users.au, title: `K5 C sub ${ctx.tag}`,
                decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: ctx.users.rev, status: 'accepted', reviewForm: 'Lang form'}]}]});
            sc.C.sub = sC.submissionId; saveScratch();
            log('[seed C sub]', app.name, sc.C.sub);
        }
    });

    // =========================== C2: the reviewer on context C, French and English ===========================
    if (on('c2')) await withPage(sc.C, async (page, H) => {
        const ctx = sc.C;
        await signIn(page, ctx.users.rev, {contextPath: ctx.path}); await idle(page);
        const pick = (s) => ({url: page.url(), step: s.step, hasQun: /Q un \(fr\)/.test(s.text), hasQone: /Q one/.test(s.text), hasQtwo: /Q two/.test(s.text), hasQthree: /Q three/.test(s.text), hasOui: /Oui/.test(s.text), title: /Lang form/.test(s.text), formText: (s.text.match(/Lang form[\s\S]{0,400}/) || [''])[0]});
        await sect('c2_fr', async () => done('c2_fr', pick(await H.wizardTo3(ctx.sub, 'c2-fr', 'fr_CA'))));
        await sect('c2_en', async () => done('c2_en', pick(await H.wizardTo3(ctx.sub, 'c2-en', 'en'))));
    });

    saveFacts();
    log(`[k5 ${app.name}] done; errors: ${Object.keys(facts.errors).join(', ') || 'none'}`);
});
