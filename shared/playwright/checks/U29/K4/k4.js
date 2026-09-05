// U29 claim check, chunk K4: Settings › Workflow › Review › "Review Forms" —
// the list and authoring: create, the form window's three tabs, Form Items,
// response options, preview, languages; what each item type gives the
// reviewer on step 3. Spec: docs/specs/U29-review-setup-and-review-forms.md —
// Fields "Review Form" and "Form Item" tables (93–114), Rules 10, 13, 15, 16
// (211–221, 244–250, 258–280), scenario 6 (467–481), footnotes f and g.
//
// Seeds its own scratch context per app (en + fr_CA; throwaway manager,
// author, two external reviewers; two active review forms, one carrying all
// six item types; one submission in external review with the first reviewer
// accepted on that form). Records every screen. Nothing on the seeded
// context is touched. OPS has no Review tab: skipped with a record.
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U29/K4/k4.js
//   PHASES=seed,list,items,preview,addrev,reviewer,lang   (default: all; later phases reuse k4-scratch-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'list', 'items', 'preview', 'addrev', 'reviewer', 'lang'];
const on = (p) => PHASES.includes(p);
const scratchFile = (app) => path.join(outDir(), `k4-scratch-${app.name}.json`);
const log = (...a) => console.log(`[${process.env.PKP_APP_NAME}]`, ...a);
const flat = (s, n = 500) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const G = '#reviewFormGridContainer';
const IG = '#reviewFormElementsGridContainer';

async function full(page, name, extra = {}) {
    const data = await screen(page);
    data.notifications = await page.evaluate(() => [...document.querySelectorAll('.pkp_notification, [role=status], [role=alert], .pkpNotification')]
        .filter((e) => e.innerText && e.innerText.trim()).map((e) => ({cls: e.className.slice(0, 80), text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300), visible: e.getClientRects().length > 0})));
    Object.assign(data, extra);
    record(name, data);
    await shot(page, name);
    return data;
}

const dlgWith = (page, sel) => page.locator('[role=dialog]').filter({has: page.locator(sel)}).last();
const vis = (el) => el.getClientRects().length > 0;

async function dialogInfo(dlg) {
    return dlg.evaluate((d) => {
        const vis = (el) => el.getClientRects().length > 0;
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        return {
            title: t(d.querySelector('h1, h2, h3, .modal__header, [class*="title"]')),
            text: d.innerText.trim(),
            buttons: [...d.querySelectorAll('button, a.pkp_button, input[type=submit]')].filter(vis).map((b) => ({text: t(b) || b.value, id: b.id, disabled: b.disabled})),
            links: [...d.querySelectorAll('a')].filter(vis).map((a) => t(a)).filter(Boolean),
            tabs: [...d.querySelectorAll('[role=tab]')].map((a) => ({text: t(a), selected: a.getAttribute('aria-selected') || (a.parentElement.classList.contains('ui-tabs-active') ? 'true' : 'false'), disabled: a.closest('li') ? a.closest('li').classList.contains('ui-state-disabled') || a.closest('li').getAttribute('aria-disabled') === 'true' : null})),
            inputs: [...d.querySelectorAll('input, select, textarea, iframe')].filter((i) => i.type !== 'hidden').map((i) => ({tag: i.tagName, type: i.type, id: i.id, name: i.name, value: i.tagName === 'SELECT' ? i.value : (i.value || '').slice(0, 80), checked: i.checked, visible: vis(i), options: i.tagName === 'SELECT' ? [...i.options].map((o) => `${o.value}=${o.text}${o.selected ? '*' : ''}`) : undefined})),
            labels: [...d.querySelectorAll('label, legend')].filter(vis).map((l) => t(l)).filter(Boolean),
            errors: [...d.querySelectorAll('.error, label.error, .pkp_form_error, .formError, [class*="error"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 60), text: t(e)})),
            flags: [...d.querySelectorAll('.flag, .localization_popover, .localization_popover_container, .multilingual_extra, .multilingual_primary')].map((e) => ({cls: e.className.slice(0, 80), title: e.title, text: t(e).slice(0, 120), visible: vis(e)})),
        };
    });
}

async function openForms(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/workflow#review/reviewForms`));
    await idle(page);
    const reviewTab = page.getByRole('tab', {name: 'Review', exact: true});
    if ((await reviewTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await reviewTab.click();
    const side = page.getByRole('tab', {name: 'Review Forms', exact: true});
    if ((await side.getAttribute('aria-selected').catch(() => null)) !== 'true') await side.click();
    await page.locator(`${G} .pkp_controllers_grid`).waitFor({timeout: 20000});
    await idle(page);
}

async function gridRows(page, sel) {
    return page.evaluate((sel) => {
        const c = document.querySelector(sel);
        if (!c) return null;
        const vis = (el) => el.getClientRects().length > 0;
        const t = (el) => el.innerText.trim().replace(/\s+/g, ' ');
        return {
            heading: t(c.querySelector('h4') || c).slice(0, 120),
            actionsAbove: [...c.querySelectorAll('.pkp_linkaction, .actions a')].filter(vis).map((a) => ({text: t(a), cls: a.className.slice(0, 60)})),
            columns: [...c.querySelectorAll('thead th')].map(t),
            rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({id: r.id, cells: [...r.querySelectorAll('td')].map(t), checkboxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({name: b.name, checked: b.checked})), sortable: r.classList.contains('ui-sortable-handle')})),
            controlRows: [...c.querySelectorAll('tr.row_controls')].map((r) => ({visible: vis(r), links: [...r.querySelectorAll('a')].map((a) => t(a) || a.title || a.className)})),
            emptyText: [...c.querySelectorAll('tbody tr:not(.gridRow):not(.row_controls) td')].map(t).filter(Boolean),
            belowLinks: [...c.querySelectorAll('a')].filter(vis).map(t).filter((x) => /Done|Cancel ordering/.test(x)),
            text: t(c).slice(0, 1500),
        };
    }, sel);
}

async function openRowControls(page, sel, rowIndex) {
    const row = page.locator(`${sel} tbody tr.gridRow`).nth(rowIndex);
    const ctrl = page.locator(`${sel} tr.row_controls`).nth(rowIndex);
    if (!(await ctrl.isVisible().catch(() => false))) await row.locator('a.show_extras').first().click();
    await ctrl.waitFor({state: 'visible', timeout: 10000}).catch(() => {});
    return ctrl;
}
async function rowAction(page, sel, rowIndex, actionName) {
    const ctrl = await openRowControls(page, sel, rowIndex);
    await ctrl.getByRole('link', {name: actionName, exact: true}).first().click();
}
const rowIndexByTitle = async (page, sel, re) => (await gridRows(page, sel)).rows.findIndex((r) => re.test(r.cells[0]));

async function typeRich(page, dlg, idPrefix, text) {
    await dlg.locator(`iframe[id^="${idPrefix}-"]`).first().waitFor({timeout: 15000});
    const body = page.frameLocator(`iframe[id^="${idPrefix}-"]`).first().locator('body');
    await body.click();
    await body.fill(text);
}

async function waitDialogGone(page, sel, ms = 15000) {
    await page.locator('[role=dialog]').filter({has: page.locator(sel)}).waitFor({state: 'hidden', timeout: ms}).catch(() => {});
}

async function confirmDialog(page) {
    await page.waitForFunction(() => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getClientRects().length > 0); const d = ds[ds.length - 1]; return d && /Confirm/.test(d.innerText); }, null, {timeout: 10000}).catch(() => {});
    return page.locator('[role=dialog]:visible').last();
}

async function openEditWindow(page, titleRe) {
    const idx = await rowIndexByTitle(page, G, titleRe);
    await rowAction(page, G, idx, 'Edit');
    const dlg = dlgWith(page, '#editReviewFormTabs');
    await dlg.locator('#editReviewFormTabs').waitFor({timeout: 15000});
    await dlg.locator('form#reviewFormForm').waitFor({timeout: 15000}).catch(() => {});
    await page.locator('.ui-tabs-loading').waitFor({state: 'detached', timeout: 15000}).catch(() => {});
    await idle(page);
    return dlg;
}
async function openItemsTab(page, dlg) {
    await dlg.getByRole('tab', {name: 'Form Items'}).click();
    await dlg.locator(`${IG} .pkp_controllers_grid`).waitFor({timeout: 15000});
    await idle(page);
}
async function openItemWindow(page, dlg, action = 'new', rowIndex = 0) {
    if (action === 'new') await dlg.locator(IG).getByRole('link', {name: 'Create New Item'}).click();
    else await rowAction(page, IG, rowIndex, 'Edit');
    const d = dlgWith(page, 'form#reviewFormElementForm');
    await d.locator('select#elementType').waitFor({timeout: 15000});
    await idle(page);
    return d;
}
async function optionsArea(d) {
    return d.locator('#elementOptions').evaluate((e) => {
        const vis = (el) => el.getClientRects().length > 0;
        return {text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 400), visible: vis(e), columns: [...e.querySelectorAll('th')].map((h) => h.innerText.trim()), links: [...e.querySelectorAll('a, button')].filter(vis).map((a) => a.innerText.trim() || a.className.slice(0, 40)), rows: [...e.querySelectorAll('tbody tr')].filter(vis).map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' ').slice(0, 120), inputs: [...r.querySelectorAll('input, textarea')].filter((i) => i.type !== 'hidden').map((i) => ({name: i.name, value: i.value, visible: vis(i)}))}))};
    });
}
async function addOptions(d, choices) {
    // "Add Item" appends a row; wait for the new row's box before filling, or the fill lands in the previous row
    for (const c of choices) {
        const before = await d.locator('#elementOptions tbody tr').evaluateAll((rs) => rs.filter((r) => r.getClientRects().length > 0 && r.querySelector('input')).length);
        await d.locator('#elementOptions').getByRole('link', {name: 'Add Item'}).first().click();
        await d.locator('#elementOptions tbody tr').evaluateAll((rs) => rs.filter((r) => r.getClientRects().length > 0 && r.querySelector('input')).length).then(async (n) => { if (n <= before) await d.page().waitForFunction((b) => [...document.querySelectorAll('[role=dialog] #elementOptions tbody tr')].filter((r) => r.getClientRects().length > 0 && r.querySelector('input')).length > b, before, {timeout: 10000}).catch(() => {}); });
        const inputs = d.locator('#elementOptions input[type=text]:visible');
        await inputs.last().waitFor({timeout: 10000});
        await inputs.last().fill(c);
        await inputs.last().press('Tab').catch(() => {});
    }
}
async function clearOptions(d) {
    // each row carries a remove icon (a link with no text, class pkp_linkaction_delete)
    for (let i = 0; i < 6; i++) {
        const del = d.locator('#elementOptions tbody tr a.pkp_linkaction_delete').first();
        if (!(await del.count()) || !(await del.isVisible().catch(() => false))) break;
        await del.click();
        await d.page().waitForFunction(() => true, null, {timeout: 200}).catch(() => {});
    }
}
async function saveItem(page, d) {
    const w = page.waitForResponse((r) => /update-review-form-element/.test(r.url()), {timeout: 15000}).catch(() => null);
    await d.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await w;
    return r ? r.status() : null;
}
async function waitRows(page, sel, n) {
    await page.waitForFunction(([s, n]) => document.querySelectorAll(`${s} tbody tr.gridRow`).length === n, [sel, n], {timeout: 15000}).catch(() => {});
    await idle(page);
}

async function readPreview(dlg) {
    return dlg.locator('form#previewReviewForm').evaluate((f) => {
        const t = (el) => el.innerText.trim().replace(/\s+/g, ' ');
        return {
            title: f.querySelector('h3') && t(f.querySelector('h3')),
            text: f.innerText.trim(),
            controls: [...f.querySelectorAll('input, select, textarea')].filter((i) => i.type !== 'hidden').map((i) => ({type: i.type, tag: i.tagName, name: i.name, value: i.value, checked: i.checked, label: ((i.id && f.querySelector(`label[for="${i.id}"]`)) || i.closest('label') || i.parentElement).innerText.trim().replace(/\s+/g, ' ').slice(0, 80), options: i.tagName === 'SELECT' ? [...i.options].map((o) => JSON.stringify(o.text)) : undefined})),
            buttons: [...f.querySelectorAll('button, input[type=submit], a.pkp_button')].map((b) => t(b) || b.value),
            reqMarks: [...f.querySelectorAll('.req')].map((e) => ({text: t(e), section: t(e.closest('.section') || e.parentElement).slice(0, 80)})),
        };
    });
}

async function readReviewerStep3(page) {
    return page.evaluate(() => {
        const t = (el) => el.innerText.trim().replace(/\s+/g, ' ');
        const form = document.querySelector('form#reviewForm') || document.querySelector('[name^="reviewFormResponses"]')?.closest('form') || document.querySelector('main') || document.body;
        return {
            url: location.href, lang: document.documentElement.lang,
            text: (document.querySelector('main') || document.body).innerText.trim().slice(0, 4000),
            headings: [...form.querySelectorAll('h1,h2,h3,h4,h5')].map(t),
            controls: [...form.querySelectorAll('[name^="reviewFormResponses"]')].map((i) => ({type: i.type, tag: i.tagName, name: i.name, value: i.value, label: ((i.id && form.querySelector(`label[for="${i.id}"]`)) || i.closest('label') || i.parentElement).innerText.trim().replace(/\s+/g, ' ').slice(0, 80), options: i.tagName === 'SELECT' ? [...i.options].map((o) => JSON.stringify(o.text)) : undefined, sectionText: (i.closest('.section') || i.parentElement.parentElement).innerText.trim().replace(/\s+/g, ' ').slice(0, 200)})),
            reqMarks: [...form.querySelectorAll('.req')].map((e) => ({text: t(e), section: t(e.closest('.section') || e.parentElement).slice(0, 100)})),
            buttons: [...form.querySelectorAll('button, input[type=submit], a.pkp_button')].filter((b) => b.getClientRects().length > 0).map((b) => t(b) || b.value),
            errors: [...document.querySelectorAll('.pkp_form_error, .error, .pkp_notification, .formError, [class*="error"]')].filter((e) => e.getClientRects().length > 0 && e.innerText.trim()).map((e) => ({cls: e.className.slice(0, 60), text: t(e).slice(0, 300)})),
        };
    });
}

async function walkToStep3(page, app, ctx, subId, locale = 'en') {
    await page.goto(app.url(`/index.php/${ctx}/${locale}/reviewer/submission/${subId}?step=3`));
    await idle(page);
    for (let i = 0; i < 3; i++) {
        if (await page.locator('[name^="reviewFormResponses"]').count()) break;
        const btn = page.getByRole('button', {name: /Save and continue|Continue to Step|Sauvegarder et continuer|Enregistrer et continuer|Poursuivre/i}).first();
        if (!(await btn.count())) break;
        const noCI = page.locator('input[name="competingInterestOption"]').first();
        if (await noCI.count()) await noCI.check().catch(() => {});
        const label = await btn.innerText();
        await btn.click();
        await idle(page);
        log('[wizard] pressed', flat(label), '→', page.url());
    }
    await page.locator('[name^="reviewFormResponses"]').first().waitFor({timeout: 15000}).catch(() => {});
    await idle(page);
}

forEachApp(async (app) => {
    const out = {app: app.name};
    if (app.name === 'ops') { record('k4-results', {app: 'ops', skipped: 'OPS has no Review tab and no review forms; the spec covers OJS and OMP'}); return; }
    let scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : null;

    if (on('seed')) {
        const t = tag('u29k4');
        scratch = {tag: t, mgr: `${t}mgr`, rev: `${t}rev`, rev2: `${t}rev2`, au: `${t}au`, formA: `Types form ${t}`, formB: `Order form ${t}`, formC: `Scenario form ${t}`, formD: `Inactive form ${t}`};
        const ctx = await app.api.createContext({
            tag: t,
            context: {name: `U29 K4 ${t}`, acronym: 'U29K4', supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']},
            users: [
                {username: scratch.mgr, roles: ['manager'], givenName: 'Kfour', familyName: 'Manager'},
                {username: scratch.au, roles: ['author'], givenName: 'Kfour', familyName: 'Author'},
                {username: scratch.rev, roles: ['externalReviewer'], givenName: 'Kfour', familyName: 'Reviewer'},
                {username: scratch.rev2, roles: ['externalReviewer'], givenName: 'Kfour', familyName: 'Spare'},
            ],
            reviewForms: [
                {title: {en: scratch.formA}, description: {en: 'Types form description under the title.'}, elements: [
                    {question: {en: 'Q1 one word'}, description: {en: 'Q1 description under the question'}, type: 'smalltextfield'},
                    {question: {en: 'Q2 one line'}, type: 'textfield'},
                    {question: {en: 'Q3 many lines'}, type: 'textarea', required: true},
                    {question: {en: 'Q4 tick several'}, type: 'checkboxes', options: ['Alpha', 'Beta', 'Gamma']},
                    {question: {en: 'Q5 choose one'}, type: 'radiobuttons', required: true, options: ['Yes', 'No']},
                    {question: {en: 'Q6 pick from list'}, type: 'dropdownbox', options: ['First', 'Second', 'Third']},
                ]},
                {title: {en: scratch.formB}, elements: [{question: {en: 'B1 one line'}, type: 'textfield'}]},
            ],
        });
        scratch.contextId = ctx.contextId; scratch.path = ctx.path;
        const sub = await app.api.createSubmission({tag: `${t}s`, context: ctx.path, submitter: scratch.au, title: `U29K4 in review ${t}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: scratch.rev, status: 'accepted', reviewForm: scratch.formA}]}]});
        scratch.submissionId = sub.submissionId || sub.id;
        fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
        log('seeded', JSON.stringify(scratch));
    }

    const {page, close} = await launch(app);
    const browserDialogs = [];
    const toasts = [];
    page.on('response', async (r) => { if (/fetchNotification/.test(r.url())) { try { const j = await r.json(); const texts = []; const walk = (o) => { if (!o) return; if (typeof o === 'string') texts.push(o.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); else if (typeof o === 'object') Object.values(o).forEach(walk); }; walk(j && j.content); if (texts.length) { toasts.push({at: new Date().toISOString(), texts}); log('[toast]', JSON.stringify(texts)); } } catch (e) {} } });
    page.on('dialog', (d) => { browserDialogs.push({type: d.type(), message: d.message()}); log('[browser dialog]', d.type(), d.message()); d.accept().catch(() => {}); });
    const toastsSince = (n) => toasts.slice(n).map((x) => x.texts);
    try {
        if (on('list')) {
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openForms(page, app, scratch.path);
            out.listSeeded = await gridRows(page, G);
            await full(page, 'list-seeded', {grid: out.listSeeded});
            log('[list seeded]', JSON.stringify(out.listSeeded.columns), JSON.stringify(out.listSeeded.actionsAbove), JSON.stringify(out.listSeeded.rows));
            await loc(page, 'Review Forms grid', page.locator(G));
            await loc(page, 'Review Forms › Order link', page.locator(`${G} a.pkp_linkaction_orderItems`));
            // 93–95, 99: the create window; empty title refused
            await page.locator(G).getByRole('link', {name: 'Create Review Form'}).click();
            const cd = dlgWith(page, 'form#reviewFormForm');
            await cd.locator('input[id^="title-"]').first().waitFor({timeout: 15000});
            await idle(page);
            out.createWindow = await dialogInfo(cd);
            await full(page, 'create-window', {dialog: out.createWindow});
            log('[create window]', out.createWindow.title, JSON.stringify(out.createWindow.labels), JSON.stringify(out.createWindow.buttons.map((b) => b.text)), JSON.stringify(out.createWindow.links));
            const w0 = page.waitForResponse((r) => /update-review-form/.test(r.url()), {timeout: 6000}).catch(() => null);
            await cd.getByRole('button', {name: 'Save', exact: true}).click();
            const r0 = await w0;
            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] .error, [role=dialog] label.error')].some((e) => e.getClientRects().length > 0), null, {timeout: 6000}).catch(() => {});
            out.createEmpty = {request: r0 ? r0.status() : 'no request (client-side)', errors: (await dialogInfo(cd)).errors};
            await full(page, 'create-empty-refused', out.createEmpty);
            log('[create empty]', JSON.stringify(out.createEmpty));
            // scenario 6: title + description → row at the bottom, 0 / 0, Active unticked
            await cd.locator('input[id^="title-"]').first().fill(scratch.formC);
            await typeRich(page, cd, 'description', 'Scenario form description.');
            let tn = toasts.length;
            const w1 = page.waitForResponse((r) => /update-review-form/.test(r.url()), {timeout: 15000}).catch(() => null);
            await cd.getByRole('button', {name: 'Save', exact: true}).click();
            const r1 = await w1;
            await waitDialogGone(page, 'form#reviewFormForm');
            await waitRows(page, G, 3);
            out.listAfterC = {status: r1 && r1.status(), toasts: toastsSince(tn), grid: await gridRows(page, G)};
            await full(page, 'list-after-c', out.listAfterC);
            log('[list after C]', JSON.stringify(out.listAfterC.toasts), JSON.stringify(out.listAfterC.grid.rows));
            // control form D, left inactive
            await page.locator(G).getByRole('link', {name: 'Create Review Form'}).click();
            const cd2 = dlgWith(page, 'form#reviewFormForm');
            await cd2.locator('input[id^="title-"]').first().waitFor({timeout: 15000});
            await cd2.locator('input[id^="title-"]').first().fill(scratch.formD);
            await cd2.getByRole('button', {name: 'Save', exact: true}).click();
            await waitDialogGone(page, 'form#reviewFormForm');
            await waitRows(page, G, 4);
            out.listAfterD = await gridRows(page, G);
            await full(page, 'list-after-d', {grid: out.listAfterD});
            log('[list after D]', JSON.stringify(out.listAfterD.rows.map((r) => r.cells)));
            // 219–220: the row's arrow → actions
            const ctrl = await openRowControls(page, G, 2);
            out.rowActions = await ctrl.locator('a').evaluateAll((as) => as.filter((a) => a.getClientRects().length > 0).map((a) => a.innerText.trim()));
            await full(page, 'row-actions', {rowActions: out.rowActions});
            log('[row actions]', JSON.stringify(out.rowActions));
            // (the arrow is not clicked again: a second click never closes the controls row — pC1 note)
            // 216–217: Order → drag B above A → Done (no notice)
            await page.locator(`${G} a.pkp_linkaction_orderItems`).first().click();
            await page.waitForFunction((s) => document.querySelector(`${s} tbody tr.gridRow.ui-sortable-handle`), G, {timeout: 10000}).catch(() => {});
            out.orderMode = await gridRows(page, G);
            await full(page, 'list-order-mode', {grid: out.orderMode});
            log('[order mode]', JSON.stringify(out.orderMode.belowLinks), JSON.stringify(out.orderMode.rows.map((r) => [r.cells[0], r.sortable])));
            const rows = page.locator(`${G} tbody tr.gridRow`);
            const src = await rows.nth(1).boundingBox();
            const dst = await rows.nth(0).boundingBox();
            await page.mouse.move(src.x + 40, src.y + src.height / 2);
            await page.mouse.down();
            await page.mouse.move(src.x + 40, src.y + src.height / 2 - 5, {steps: 3});
            await page.mouse.move(dst.x + 40, dst.y + 4, {steps: 25});
            await page.mouse.up();
            await idle(page);
            tn = toasts.length;
            const ws = page.waitForResponse((r) => /save-sequence/.test(r.url()), {timeout: 10000}).catch(() => null);
            await page.locator(G).getByRole('link', {name: 'Done', exact: true}).click();
            const rs = await ws;
            await idle(page);
            out.listAfterOrder = {saveSequence: rs && rs.status(), toasts: toastsSince(tn), notifications: [], grid: await gridRows(page, G)};
            await full(page, 'list-after-order', out.listAfterOrder);
            log('[after order]', out.listAfterOrder.saveSequence, JSON.stringify(out.listAfterOrder.toasts), JSON.stringify(out.listAfterOrder.grid.rows.map((r) => r.cells[0])));
            // the order after leaving the page
            await openForms(page, app, scratch.path);
            out.listReloaded = await gridRows(page, G);
            await full(page, 'list-reloaded', {grid: out.listReloaded});
            log('[reloaded]', JSON.stringify(out.listReloaded.rows.map((r) => r.cells[0])));
        }

        if (on('items')) {
            if (!on('list')) { await signIn(page, scratch.mgr, {contextPath: scratch.path}); await openForms(page, app, scratch.path); }
            // 244–246: the Edit window
            const dlg = await openEditWindow(page, /^Settings Scenario form|Scenario form/);
            out.editWindow = await dialogInfo(dlg);
            await full(page, 'edit-window', {dialog: out.editWindow});
            log('[edit window]', out.editWindow.title, JSON.stringify(out.editWindow.tabs), JSON.stringify(out.editWindow.labels), JSON.stringify(out.editWindow.inputs.filter((i) => i.visible || i.tag === 'IFRAME').map((i) => [i.tag, i.id, i.value])));
            await loc(page, 'Edit review form window', dlg);
            // 258–261: Form Items, empty
            await openItemsTab(page, dlg);
            out.itemsEmpty = await gridRows(page, IG);
            await full(page, 'items-empty', {grid: out.itemsEmpty});
            log('[items empty]', JSON.stringify(out.itemsEmpty.columns), JSON.stringify(out.itemsEmpty.actionsAbove), JSON.stringify(out.itemsEmpty.emptyText));
            // 102–112: the item window
            let d = await openItemWindow(page, dlg, 'new');
            out.itemWindow = await dialogInfo(d);
            out.itemWindow.options = await optionsArea(d);
            await full(page, 'item-window', {dialog: out.itemWindow});
            log('[item window]', out.itemWindow.title, JSON.stringify(out.itemWindow.labels), JSON.stringify(out.itemWindow.inputs.filter((i) => i.type === 'checkbox' || i.tag === 'SELECT')), JSON.stringify(out.itemWindow.options));
            await loc(page, 'Item window', d);
            await loc(page, 'Item type select', d.locator('select#elementType'));
            // everything empty → client-side refusal at Item type
            const w0 = page.waitForResponse((r) => /update-review-form-element/.test(r.url()), {timeout: 6000}).catch(() => null);
            await d.getByRole('button', {name: 'Save', exact: true}).click();
            const r0 = await w0;
            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] .error, [role=dialog] label.error')].some((e) => e.getClientRects().length > 0), null, {timeout: 6000}).catch(() => {});
            out.itemEmpty = {request: r0 ? r0.status() : 'no request (client-side)', errors: (await dialogInfo(d)).errors};
            await full(page, 'item-empty-refused', out.itemEmpty);
            log('[item empty]', JSON.stringify(out.itemEmpty));
            // a type, no question → server-side toast
            await d.locator('select#elementType').selectOption({label: 'Single word text box'});
            let tn = toasts.length;
            const st = await saveItem(page, d);
            await page.waitForFunction((n) => document.querySelectorAll('.pkp_notification').length > 0 || n, tn, {timeout: 4000}).catch(() => {});
            out.itemNoQuestion = {status: st, toasts: toastsSince(tn), stillOpen: await d.isVisible().catch(() => false), errors: (await dialogInfo(d)).errors};
            await full(page, 'item-noquestion-refused', out.itemNoQuestion);
            log('[item no question]', JSON.stringify(out.itemNoQuestion));
            // scenario 6 item 1: radio Yes/No, required
            await typeRich(page, d, 'question', 'S1 radio yes/no');
            await d.locator('select#elementType').selectOption({label: 'Radio buttons (you can only choose one)'});
            await addOptions(d, ['Yes', 'No']);
            await d.locator('input#required').check();
            out.item1Filled = {options: await optionsArea(d), required: await d.locator('input#required').isChecked(), included: await d.locator('input#included').isChecked()};
            await full(page, 'item1-filled', out.item1Filled);
            await saveItem(page, d);
            await waitDialogGone(page, 'form#reviewFormElementForm');
            await waitRows(page, IG, 1);
            out.itemsAfter1 = await gridRows(page, IG);
            await full(page, 'items-after-1', {grid: out.itemsAfter1});
            log('[items after 1]', JSON.stringify(out.itemsAfter1.rows.map((r) => r.cells[0])), JSON.stringify(out.itemsAfter1.controlRows));
            // item 2: Extended text box
            d = await openItemWindow(page, dlg, 'new');
            await typeRich(page, d, 'question', 'S2 extended text');
            await d.locator('select#elementType').selectOption({label: 'Extended text box'});
            await saveItem(page, d);
            await waitDialogGone(page, 'form#reviewFormElementForm');
            await waitRows(page, IG, 2);
            // item 3: radio with rows, saved; then switched to a text type and saved again (112, footnote g's open question)
            d = await openItemWindow(page, dlg, 'new');
            await typeRich(page, d, 'question', 'S3 rows then text');
            await d.locator('select#elementType').selectOption({label: 'Radio buttons (you can only choose one)'});
            await addOptions(d, ['Orphan A', 'Orphan B']);
            await saveItem(page, d);
            await waitDialogGone(page, 'form#reviewFormElementForm');
            await waitRows(page, IG, 3);
            d = await openItemWindow(page, dlg, 'edit', 2);
            out.item3Before = {title: (await dialogInfo(d)).title, type: await d.locator('select#elementType').inputValue(), options: await optionsArea(d)};
            const bd = browserDialogs.length;
            await d.locator('select#elementType').selectOption({label: 'Single line text box'});
            await page.waitForFunction(() => true, null, {timeout: 300}).catch(() => {});
            out.item3Switched = {browserDialogs: browserDialogs.slice(bd), options: await optionsArea(d), errors: (await dialogInfo(d)).errors};
            await full(page, 'item3-type-switched', {before: out.item3Before, after: out.item3Switched});
            log('[item3 switched]', JSON.stringify(out.item3Switched));
            await saveItem(page, d);
            await waitDialogGone(page, 'form#reviewFormElementForm');
            await idle(page);
            d = await openItemWindow(page, dlg, 'edit', 2);
            out.item3Reopened = {title: (await dialogInfo(d)).title, type: await d.locator('select#elementType').evaluate((s) => s.options[s.selectedIndex].text), options: await optionsArea(d)};
            await full(page, 'item3-reopened', out.item3Reopened);
            log('[item3 reopened]', JSON.stringify(out.item3Reopened));
            await d.getByRole('link', {name: 'Cancel'}).first().click();
            await waitDialogGone(page, 'form#reviewFormElementForm');
            // item 4, then delete it (260)
            d = await openItemWindow(page, dlg, 'new');
            await typeRich(page, d, 'question', 'S4 throwaway');
            await d.locator('select#elementType').selectOption({label: 'Single word text box'});
            await saveItem(page, d);
            await waitDialogGone(page, 'form#reviewFormElementForm');
            await waitRows(page, IG, 4);
            out.itemsBeforeDelete = await gridRows(page, IG);
            log('[items 4]', JSON.stringify(out.itemsBeforeDelete.rows.map((r) => r.cells[0])), JSON.stringify(out.itemsBeforeDelete.actionsAbove));
            await rowAction(page, IG, 3, 'Delete');
            const cdlg = await confirmDialog(page);
            out.itemDeleteConfirm = await dialogInfo(cdlg);
            await full(page, 'item-delete-confirm', {dialog: out.itemDeleteConfirm});
            log('[item delete confirm]', flat(out.itemDeleteConfirm.text, 300), JSON.stringify(out.itemDeleteConfirm.buttons.map((b) => b.text)));
            tn = toasts.length;
            const wd = page.waitForResponse((r) => /delete-review-form-element/.test(r.url()), {timeout: 10000}).catch(() => null);
            await cdlg.getByRole('button', {name: 'OK', exact: true}).click();
            const rd = await wd;
            await waitRows(page, IG, 3);
            out.itemsAfterDelete = {status: rd && rd.status(), toasts: toastsSince(tn), grid: await gridRows(page, IG)};
            await full(page, 'items-after-delete', out.itemsAfterDelete);
            log('[items after delete]', out.itemsAfterDelete.status, JSON.stringify(out.itemsAfterDelete.toasts), JSON.stringify(out.itemsAfterDelete.grid.rows.map((r) => r.cells[0])));
            // 262: Order on the items list, S3 above S1 → Done; preview follows
            await dlg.locator(IG).getByRole('link', {name: 'Order', exact: true}).click();
            await page.waitForFunction((s) => document.querySelector(`${s} tbody tr.gridRow.ui-sortable-handle`), IG, {timeout: 10000}).catch(() => {});
            out.itemsOrderMode = await gridRows(page, IG);
            await full(page, 'items-order-mode', {grid: out.itemsOrderMode});
            const irows = dlg.locator(`${IG} tbody tr.gridRow`);
            const s = await irows.nth(2).boundingBox(); const t0 = await irows.nth(0).boundingBox();
            await page.mouse.move(s.x + 40, s.y + s.height / 2); await page.mouse.down();
            await page.mouse.move(s.x + 40, s.y + s.height / 2 - 5, {steps: 3});
            await page.mouse.move(t0.x + 40, t0.y + 4, {steps: 25}); await page.mouse.up();
            await idle(page);
            tn = toasts.length;
            const wo = page.waitForResponse((r) => /save-sequence/.test(r.url()), {timeout: 10000}).catch(() => null);
            await dlg.locator(IG).getByRole('link', {name: 'Done', exact: true}).click();
            const ro = await wo;
            await idle(page);
            out.itemsAfterOrder = {saveSequence: ro && ro.status(), toasts: toastsSince(tn), grid: await gridRows(page, IG)};
            await full(page, 'items-after-order', out.itemsAfterOrder);
            log('[items after order]', out.itemsAfterOrder.saveSequence, JSON.stringify(out.itemsAfterOrder.toasts), JSON.stringify(out.itemsAfterOrder.grid.rows.map((r) => r.cells[0])));
            await dlg.getByRole('button', {name: 'Close'}).first().click();
            await waitDialogGone(page, '#editReviewFormTabs');
            await idle(page);
        }

        if (on('preview')) {
            if (!on('items')) { await signIn(page, scratch.mgr, {contextPath: scratch.path}); await openForms(page, app, scratch.path); }
            // repair S1's rows (a filler race on the first run left a blank row): Edit S1 → clear → "Yes", "No" → Save
            let dlg = await openEditWindow(page, /Scenario form/);
            await openItemsTab(page, dlg);
            {
                const i1 = (await gridRows(page, IG)).rows.findIndex((r) => /S1 radio/.test(r.cells[0]));
                const d = await openItemWindow(page, dlg, 'edit', i1);
                const rowsNow = (await optionsArea(d)).rows.map((r) => r.text);
                if (JSON.stringify(rowsNow) !== JSON.stringify(['Yes', 'No'])) {
                    await clearOptions(d);
                    await addOptions(d, ['Yes', 'No']);
                    out.s1Repaired = await optionsArea(d);
                    await saveItem(page, d);
                    await waitDialogGone(page, 'form#reviewFormElementForm');
                    await idle(page);
                } else { await d.getByRole('link', {name: 'Cancel'}).first().click(); await waitDialogGone(page, 'form#reviewFormElementForm'); }
                // the item window's title, from the aria snapshot (the nested dialogs share the DOM)
            }
            // 247–248, 476–477: Preview Form inside Edit
            await dlg.getByRole('tab', {name: 'Preview Form'}).click();
            await dlg.locator('form#previewReviewForm').waitFor({timeout: 15000});
            await idle(page);
            out.preview = await readPreview(dlg);
            out.preview.tabs = (await dialogInfo(dlg)).tabs;
            out.preview.windowButtons = (await dialogInfo(dlg)).buttons.map((b) => b.text);
            await full(page, 'preview-in-edit', {preview: out.preview});
            log('[preview]', out.preview.title, JSON.stringify(out.preview.controls.map((c) => [c.type, c.label])), JSON.stringify(out.preview.reqMarks), JSON.stringify(out.preview.buttons), JSON.stringify(out.preview.windowButtons));
            await loc(page, 'Preview Form form', dlg.locator('form#previewReviewForm'));
            await dlg.getByRole('button', {name: 'Close'}).first().click();
            await waitDialogGone(page, '#editReviewFormTabs');
            await idle(page);
            // 249–250: the row's "Preview"
            const idx = await rowIndexByTitle(page, G, /Scenario form/);
            await rowAction(page, G, idx, 'Preview');
            dlg = dlgWith(page, '#editReviewFormTabs');
            await dlg.locator('form#previewReviewForm').waitFor({timeout: 20000});
            await page.locator('.ui-tabs-loading').waitFor({state: 'detached', timeout: 15000}).catch(() => {});
            await idle(page);
            out.previewWindow = await dialogInfo(dlg);
            out.previewWindow.preview = await readPreview(dlg);
            await full(page, 'preview-window', {dialog: out.previewWindow});
            log('[preview window]', out.previewWindow.title, JSON.stringify(out.previewWindow.tabs), out.previewWindow.preview.title);
            await dlg.getByRole('button', {name: 'Close'}).first().click();
            await waitDialogGone(page, '#editReviewFormTabs');
            await idle(page);
            // the seeded six-type form's preview (265–268): it is in use, so its row offers "Preview", not "Edit" (Rule 12)
            await rowAction(page, G, await rowIndexByTitle(page, G, /Types form/), 'Preview');
            dlg = dlgWith(page, '#editReviewFormTabs');
            await dlg.locator('form#previewReviewForm').waitFor({timeout: 20000});
            await page.locator('.ui-tabs-loading').waitFor({state: 'detached', timeout: 15000}).catch(() => {});
            await idle(page);
            out.previewTypes = await readPreview(dlg);
            await full(page, 'preview-types', {preview: out.previewTypes});
            log('[preview types]', JSON.stringify(out.previewTypes.controls.map((c) => [c.type, c.name, c.label, c.options])), JSON.stringify(out.previewTypes.reqMarks));
            await dlg.getByRole('button', {name: 'Close'}).first().click();
            await waitDialogGone(page, '#editReviewFormTabs');
            await idle(page);
            // 478–479: tick Active on the scenario form → Confirm → OK → stays ticked
            const row = page.locator(`${G} tbody tr.gridRow`).nth(await rowIndexByTitle(page, G, /Scenario form/));
            await row.locator('input[type=checkbox]').click();
            const cdlg = await confirmDialog(page);
            out.activateConfirm = await dialogInfo(cdlg);
            await full(page, 'activate-confirm', {dialog: out.activateConfirm});
            log('[activate confirm]', flat(out.activateConfirm.text, 300), JSON.stringify(out.activateConfirm.buttons.map((b) => b.text)));
            const tn = toasts.length;
            const wa = page.waitForResponse((r) => /activate-review-form|activateReviewForm/.test(r.url()), {timeout: 10000}).catch(() => null);
            await cdlg.getByRole('button', {name: 'OK', exact: true}).click();
            const ra = await wa;
            await idle(page);
            await page.waitForFunction(() => true, null, {timeout: 500}).catch(() => {});
            out.afterActivate = {status: ra && ra.status(), url: ra && ra.url(), toasts: toastsSince(tn), grid: await gridRows(page, G)};
            await full(page, 'list-after-activate', out.afterActivate);
            await openForms(page, app, scratch.path);
            out.afterActivateReloaded = await gridRows(page, G);
            await full(page, 'list-after-activate-reloaded', {grid: out.afterActivateReloaded});
            log('[after activate]', out.afterActivate.status, JSON.stringify(out.afterActivate.toasts), JSON.stringify(out.afterActivateReloaded.rows.map((r) => [r.cells[0], r.cells[1], r.cells[2], r.checkboxes[0] && r.checkboxes[0].checked])));
        }

        if (on('addrev')) {
            if (!(on('items') || on('preview'))) await signIn(page, scratch.mgr, {contextPath: scratch.path});
            // 218, 479–481: the Add Reviewer window's "Review Form" list
            await page.goto(app.url(`/index.php/${scratch.path}/en/dashboard/editorial?workflowSubmissionId=${scratch.submissionId}`));
            await idle(page);
            const addBtn = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
            await addBtn.waitFor({timeout: 30000});
            await addBtn.click();
            const dlg = page.getByRole('dialog').last();
            const entry = dlg.locator('.listPanel__item').filter({hasText: /Spare/}).first();
            await entry.waitFor({timeout: 30000});
            await entry.getByRole('button', {name: /^Select /}).first().click();
            await dlg.locator('input.datepicker').first().waitFor({timeout: 30000});
            await idle(page);
            out.addReviewer = await dlg.evaluate((d) => ({selects: [...d.querySelectorAll('select')].map((s) => ({id: s.id, name: s.name, value: s.value, label: (d.querySelector(`label[for="${s.id}"]`) || {}).innerText, options: [...s.options].map((o) => o.text), visible: s.getClientRects().length > 0}))}));
            await full(page, 'add-reviewer-form-list', out.addReviewer);
            log('[add reviewer]', JSON.stringify(out.addReviewer));
            await loc(page, 'Add Reviewer › Review Form list', dlg.locator('select#reviewFormId'));
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).last().click().catch(() => {});
            await idle(page);
            await signOut(page);
        }

        if (on('reviewer')) {
            // 100, 108, 263, 265–269: the reviewer's step 3 on the six-type form
            await signIn(page, scratch.rev, {contextPath: scratch.path});
            await walkToStep3(page, app, scratch.path, scratch.submissionId, 'en');
            out.rev3 = await readReviewerStep3(page);
            await full(page, 'rev-step3', {read: out.rev3});
            log('[rev step3]', JSON.stringify(out.rev3.headings), JSON.stringify(out.rev3.controls.map((c) => [c.type, c.name, c.label, c.options])), JSON.stringify(out.rev3.reqMarks), JSON.stringify(out.rev3.buttons));
            await loc(page, 'Reviewer step 3 form controls', page.locator('[name^="reviewFormResponses"]'));
            // 269: Submit Review with the required questions unanswered
            const submit = page.getByRole('button', {name: 'Submit Review', exact: true}).first();
            if (await submit.count()) {
                await submit.click();
                await idle(page);
                const c = page.locator('[role=dialog]:visible').last();
                out.rev3SubmitAsk = (await c.count()) ? await dialogInfo(c) : {browserDialogs: [...browserDialogs]};
                await full(page, 'rev-step3-submit-ask', {dialog: out.rev3SubmitAsk});
                log('[rev submit ask]', flat(out.rev3SubmitAsk.text, 300), JSON.stringify((out.rev3SubmitAsk.buttons || []).map((b) => b.text)));
                const ok = c.getByRole('button', {name: 'OK', exact: true}).first();
                if (await ok.count()) { await ok.click(); await idle(page); }
                await page.waitForFunction(() => [...document.querySelectorAll('.pkp_form_error, .error, .formError, [class*="error"]')].some((e) => e.getClientRects().length > 0 && e.innerText.trim()), null, {timeout: 8000}).catch(() => {});
                out.rev3Refused = await readReviewerStep3(page);
                await full(page, 'rev-step3-refused', {read: out.rev3Refused});
                log('[rev refused]', page.url(), JSON.stringify(out.rev3Refused.errors), JSON.stringify(out.rev3Refused.reqMarks.length));
            }
            await signOut(page);
        }

        if (on('lang')) {
            // 274–280: tick "Forms" for French, then the windows and the reviewer's French step 3
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await page.goto(app.url(`/index.php/${scratch.path}/en/management/settings/website#setup/languages`));
            await idle(page);
            const setupTab = page.getByRole('tab', {name: 'Setup', exact: true});
            if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
            const langTab = page.getByRole('tab', {name: 'Languages', exact: true});
            if ((await langTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await langTab.click();
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000});
            await idle(page);
            const readLang = () => page.locator('#languageGridContainer').evaluate((c) => ({columns: [...c.querySelectorAll('thead th')].map((h) => h.innerText.trim()), rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))}))}));
            out.langBefore = await readLang();
            await full(page, 'lang-grid-before', {grid: out.langBefore});
            const frRow = page.locator('#languageGridContainer tbody tr.gridRow').filter({hasText: /Fran|French/});
            const formsBox = frRow.locator('input[type=checkbox][id*="formLocale"]').first();
            if (!(await formsBox.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && !/fetchNotification/.test(r.url()), {timeout: 10000}).catch(() => null);
                await formsBox.click();
                await w;
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
                await idle(page);
            }
            out.langAfter = await readLang();
            await full(page, 'lang-grid-after', {grid: out.langAfter});
            log('[lang grid]', JSON.stringify(out.langAfter));
            await openForms(page, app, scratch.path);
            await page.locator(G).getByRole('link', {name: 'Create Review Form'}).click();
            const cd = dlgWith(page, 'form#reviewFormForm');
            await cd.locator('input[id^="title-"]').first().waitFor({timeout: 15000});
            await idle(page);
            out.langCreate = await dialogInfo(cd);
            await full(page, 'lang-create-window', {dialog: out.langCreate});
            await cd.locator('input[id^="title-en"]').first().click().catch(() => {});
            await page.waitForFunction(() => { const i = document.querySelector('[role=dialog] input[id^="title-fr_CA"]'); return i && i.getClientRects().length > 0; }, null, {timeout: 4000}).catch(() => {});
            out.langCreateRevealed = await cd.evaluate((d) => ({titleInputs: [...d.querySelectorAll('input[id^="title-"]')].map((e) => ({id: e.id, visible: e.getClientRects().length > 0, label: (d.querySelector(`label[for="${e.id}"]`) || {}).innerText})), iframes: [...d.querySelectorAll('iframe')].map((f) => ({id: f.id, visible: f.getClientRects().length > 0})), popover: [...d.querySelectorAll('.localization_popover')].map((e) => ({text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 120), visible: e.getClientRects().length > 0})), flags: [...d.querySelectorAll('.flag')].map((e) => ({cls: e.className, title: e.title, visible: e.getClientRects().length > 0}))}));
            await full(page, 'lang-create-window-revealed', out.langCreateRevealed);
            log('[lang create]', JSON.stringify(out.langCreateRevealed));
            await loc(page, 'Create Review Form › French title box', cd.locator('input[id^="title-fr_CA"]').first());
            await cd.getByRole('button', {name: 'Close'}).first().click();
            await waitDialogGone(page, 'form#reviewFormForm');
            await idle(page);
            const dlg = await openEditWindow(page, /Inactive form/);
            await openItemsTab(page, dlg);
            const d = await openItemWindow(page, dlg, 'new');
            await d.locator('select#elementType').selectOption({label: 'Radio buttons (you can only choose one)'});
            await addOptions(d, ['Un']);
            out.langItem = {iframes: await d.locator('iframe').evaluateAll((fs) => fs.map((f) => ({id: f.id, visible: f.getClientRects().length > 0}))), options: await optionsArea(d), flags: (await dialogInfo(d)).flags};
            await full(page, 'lang-item-window', out.langItem);
            log('[lang item]', JSON.stringify(out.langItem));
            await d.getByRole('button', {name: 'Close'}).first().click();
            await waitDialogGone(page, 'form#reviewFormElementForm');
            await dlg.getByRole('button', {name: 'Close'}).first().click().catch(() => {});
            await waitDialogGone(page, '#editReviewFormTabs');
            await idle(page);
            await signOut(page);
            // the reviewer reading in French: the English texts where the French is empty
            await signIn(page, scratch.rev, {contextPath: scratch.path});
            await walkToStep3(page, app, scratch.path, scratch.submissionId, 'fr_CA');
            out.rev3fr = await readReviewerStep3(page);
            await full(page, 'rev-step3-fr', {read: out.rev3fr});
            log('[rev step3 fr]', out.rev3fr.lang, JSON.stringify(out.rev3fr.headings), JSON.stringify(out.rev3fr.controls.map((c) => [c.type, c.label, c.options])));
            await signOut(page);
        }
    } finally {
        out.browserDialogs = browserDialogs; out.toasts = toasts;
        record('k4-results', out);
        await signOut(page).catch(() => {});
        await close();
    }
});
