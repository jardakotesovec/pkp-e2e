// U42 claim check, chunk K3: data citations (docs/specs/U42-citations-and-references.md, body lines 94–109,
// Rules 18–25 at 275–339, register A8–A10 at 600–623). All three apps; the Reviewer parts on OJS and OMP.
// Kept check: no assertions, the session judges the snapshots. Each part seeds its own scratch context(s).
//   PROBE_FEATURE=U42 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U42/K3/k3.js
//   K3_PARTS=roles,panel,order,version,wizard,leave,require,levels,off,reviewer (default: all)
// Parts:
//   roles     Rule 18–20, q2: the workflow's "Data" page per permission level (manager, admin, section editor
//             with and without "Permit metadata edit", funding coordinator on OJS/OMP, the author; on OPS the
//             author of an unposted preprint adds and deletes one), the row menu, "View Data Citation".
//   panel     Fields table 94–108, Rules 21–22, q16, q17: the "Add/Edit Data Citation" panel, its refusals,
//             identifiers stored bare, Edit prefilled, Delete's confirmation, leaving with unsaved input.
//   order     Rule 23, A8, q18: added order, an edit and reload, "Order"/"Save Order", a later add, reload.
//   version   line 278: a published version with one data citation, "Create New Version", an add on one version only.
//   wizard    Rule 24, A10, q20: the "Details" step's Data section at "Ask", an add, the Review step before
//             and after a reload, Edit in the wizard, leaving the step with unsaved input.
//   leave     the Details step left with typed text in the References box: by leaving the page, and by the rail.
//   require   A9, q19 (data citations required, none given: warning and Submit) and the references control.
//   levels    Rule 18/24 at "Do not request" (enable): no wizard section, the workflow page has the list.
//   off       Rule 18 line 288: switched off with stored data citations (workflow, wizard, Reviewer), then the
//             manager switches it on in Settings and the kept citations show again.
//   reviewer  Rule 25, q21 (OJS, OMP): "View All Submission Details" under the three review types and with none.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} = require('../../../probe');
const log = (...a) => console.log(...a);
const T = 30_000;
const PARTS = (process.env.K3_PARTS || 'roles,panel,order,version,wizard,leave,require,levels,off,reviewer').split(',');
const on = (p) => PARTS.includes(p);

const REL = {
    supporting: 'Supporting data without specifying whether they were generated or analyzed (supporting).',
    generated: 'Supporting data that were generated for the study (generated).',
    analyzed: 'Supporting data that were analyzed but not generated for the study (analyzed).',
    'non-analyzed': 'Referenced data that were neither generated nor analyzed for the study (non-analyzed).',
};
const REFS = 'K3 reference text one, Journal of Things 2020.\nK3 reference text two, Book of Stuff 2019.';
const DC_ALPHA = {title: 'K3 Dataset Alpha', relationshipType: 'generated', identifierType: 'DOI', identifier: 'https://doi.org/10.1234/k3alpha',
    repository: 'Zenodo', year: 2023, authors: [{givenName: 'Ada', familyName: 'Lovelace'}], url: 'https://example.org/alpha'};
const DC_BETA = {title: 'K3 Dataset Beta', relationshipType: 'analyzed'};

// ---------------------------------------------------------------------------
// Reading helpers

async function snap(page, name) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 300)}; }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

/** The workflow dialog (the page itself is a dialog over the dashboard). */
const wf = (page) => page.locator('[role="dialog"]:visible').first();

/** The Data Citations table, by CSS so a stale aria-hidden shell (pitfall 4) does not hide it. */
const dcTable = (page) => page.locator('table[aria-label="Data Citations"]:visible, table:visible:has(caption:text-is("Data Citations"))').first();

async function tableRows(page) {
    const t = page.locator('table:visible').filter({hasText: /No data citations have been added|MORE ACTIONS|More Actions/i})
        .filter({hasNot: page.locator('th', {hasText: /Funder name/i})}).first();
    if (!(await t.count())) return {table: false};
    const rows = await t.locator('tbody tr').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    return {table: true, rows};
}

async function gotoWorkflow(page, app, ctx, id, {author = false} = {}) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${id}`));
    await idle(page);
    await wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production|Metadata)$/}).first()
        .waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
}

/** The Publication area's entry names the workflow menu offers. */
async function menuEntries(page) {
    return wf(page).getByRole('link').evaluateAll((els) => els.filter((e) => e.offsetParent !== null)
        .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
}

async function openData(page) {
    const dialog = wf(page);
    const entry = dialog.getByRole('link', {name: 'Data', exact: true});
    if (!(await entry.count())) return false;
    if (!(await entry.first().isVisible().catch(() => false))) {
        const group = dialog.getByRole('link', {name: /^(Publication|Preprint)$/}).first();
        if (await group.count()) await group.click();
        await idle(page);
    }
    await entry.first().click();
    await dialog.getByRole('heading', {name: /^(Publication|Preprint): Data$/}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    await page.locator('table:visible').filter({hasText: /No data citations have been added|MORE ACTIONS|More Actions/i}).first()
        .waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
    return true;
}

/** What the Data Citations block offers this viewer. */
async function dataBlock(page, scope) {
    const sc = scope || wf(page);
    const txt = (await sc.innerText().catch(() => '')) || '';
    const btn = async (name) => {
        const b = sc.getByRole('button', {name, exact: true});
        const n = await b.count();
        return {count: n, visible: n ? await b.first().isVisible() : false, disabled: n ? await b.first().isDisabled() : null};
    };
    const moreActions = sc.locator('table:visible').filter({hasText: /MORE ACTIONS|More Actions|No data citations/i}).first().locator('button');
    const iDC = txt.indexOf('Data Citations');
    const iDAS = txt.indexOf('Data Availability Statement');
    return {
        heading: (txt.match(/(Publication|Preprint): Data/i) || [null])[0],
        hasDataCitations: iDC >= 0,
        dataCitationsBeforeDAS: iDC >= 0 && iDAS >= 0 ? iDC < iDAS : null,
        hasDAS: iDAS >= 0,
        descriptionLine: txt.includes('Add formal data citations, ensuring datasets are properly credited and appear alongside other references in the publication.'),
        emptyText: txt.includes('No data citations have been added.'),
        order: await btn('Order'),
        saveOrder: await btn('Save Order'),
        add: await btn('Add Data Citation'),
        rowButtons: await moreActions.evaluateAll((els) => els.map((e) => ({label: (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim(), hidden: e.offsetParent === null, disabled: e.disabled}))).catch(() => []),
        rows: (await tableRows(page)).rows || null,
    };
}

/** Open a row's "More Actions" menu and return the item names (then close it with Escape). */
async function rowMenu(page, title, {keepOpen = false} = {}) {
    const table = page.locator('table:visible').filter({hasText: /MORE ACTIONS|More Actions/i}).first();
    const row = table.locator('tbody tr').filter({hasText: title}).first();
    const more = row.getByRole('button', {name: /More Actions/i});
    if (!(await more.count())) {
        const any = row.locator('button');
        return {button: false, rowButtons: await any.count()};
    }
    const visible = await more.first().isVisible();
    if (!visible) return {button: true, visible: false};
    await more.first().click();
    const items = page.getByRole('menuitem');
    await items.first().waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
    const names = await items.evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    if (!keepOpen) { await page.keyboard.press('Escape'); await items.first().waitFor({state: 'hidden', timeout: 5000}).catch(() => {}); }
    return {button: true, visible: true, items: names};
}

async function rowAction(page, title, action) {
    const m = await rowMenu(page, title, {keepOpen: true});
    if (!m.items || !m.items.includes(action)) { await page.keyboard.press('Escape').catch(() => {}); return m; }
    try {
        await page.getByRole('menuitem', {name: action, exact: true}).click({timeout: 8000});
    } catch {
        // The table re-rendered under the open menu (a refresh after a save): open it again once.
        await page.keyboard.press('Escape').catch(() => {});
        await idle(page);
        const again = await rowMenu(page, title, {keepOpen: true});
        m.retried = true;
        if (again.items && again.items.includes(action)) await page.getByRole('menuitem', {name: action, exact: true}).click({timeout: 8000}).catch((e) => { m.error = String(e.message).slice(0, 150); });
    }
    await idle(page);
    return m;
}

/** Bounded wait for a row to show (or go): whether the table updates in place. */
async function waitRow(page, title, state = 'visible') {
    return page.locator('table:visible tbody tr').filter({hasText: title}).first().waitFor({state, timeout: 10_000}).then(() => true).catch(() => false);
}

const panelOf = (page, title) => page.getByRole('dialog', {name: title, exact: true});

async function panelRead(page, panel) {
    await panel.waitFor({state: 'visible', timeout: T});
    await idle(page);
    return panel.evaluate((d) => {
        const out = {title: (d.querySelector('h1, h2') || {}).textContent?.trim() || null, fields: [], buttons: [], links: [], text: d.innerText};
        for (const el of d.querySelectorAll('input, select, textarea')) {
            if (el.type === 'hidden') continue;
            const id = el.id;
            const lab = id ? d.querySelector(`label[for="${id}"]`) : null;
            out.fields.push({label: lab ? lab.innerText.replace(/\s+/g, ' ').trim() : (el.getAttribute('aria-label') || el.name || null), tag: el.tagName.toLowerCase(), type: el.type || null,
                value: el.value, selectedIndex: el.tagName === 'SELECT' ? el.selectedIndex : undefined,
                selectedText: el.tagName === 'SELECT' && el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : undefined,
                disabled: el.disabled, readOnly: el.readOnly || false, visible: el.offsetParent !== null});
        }
        for (const b of d.querySelectorAll('button')) if (b.offsetParent !== null) out.buttons.push({text: (b.getAttribute('aria-label') || b.textContent).replace(/\s+/g, ' ').trim(), disabled: b.disabled});
        for (const a of d.querySelectorAll('a')) if (a.offsetParent !== null) out.links.push({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')});
        return out;
    });
}

async function panelErrors(panel) {
    return panel.evaluate((d) => {
        const out = [];
        for (const e of d.querySelectorAll('.pkpFieldError, [class*="FieldError"], .pkpFormError, [role="alert"]')) {
            if (e.offsetParent === null) continue;
            const f = e.closest('.pkpFormField, fieldset, tr');
            const lab = f ? f.querySelector('label, legend') : null;
            out.push({field: lab ? lab.innerText.replace(/\s+/g, ' ').trim() : null, message: e.innerText.replace(/\s+/g, ' ').trim()});
        }
        const footer = d.querySelector('.pkpFormPage__footer, .pkpFormPage__status, [role="status"]');
        return {errors: out, footer: footer ? footer.innerText.replace(/\s+/g, ' ').trim() : null};
    });
}

async function pressSave(page, panel, {expectClose = true} = {}) {
    const resp = page.waitForResponse((r) => /\/dataCitations(\/\d+)?$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    const status = r ? r.status() : null;
    let closed = false;
    if (expectClose) closed = await panel.waitFor({state: 'detached', timeout: 10_000}).then(() => true).catch(() => false);
    else await idle(page);
    if (!closed) closed = !(await panel.isVisible().catch(() => false));
    await idle(page);
    return {status, method: r ? r.request().method() : null, override: r ? r.request().headers()['x-http-method-override'] || null : null, closed};
}

async function fillPanel(panel, d) {
    if (d.title !== undefined) await panel.getByRole('textbox', {name: /^Title/}).fill(d.title);
    if (d.identifierType) await panel.getByRole('combobox', {name: 'Identifier type', exact: true}).selectOption({label: d.identifierType});
    if (d.identifier !== undefined) await panel.getByRole('textbox', {name: 'Identifier', exact: true}).fill(d.identifier);
    if (d.relationshipType) await panel.getByRole('combobox', {name: /^Relationship type/}).selectOption({label: REL[d.relationshipType]});
    if (d.repository !== undefined) await panel.getByRole('textbox', {name: 'Repository', exact: true}).fill(d.repository);
    if (d.year !== undefined) await panel.getByRole('textbox', {name: 'Year', exact: true}).fill(String(d.year));
    for (const a of d.authors || []) {
        await panel.getByRole('button', {name: 'Add', exact: true}).click();
        const row = panel.locator('table').filter({hasText: /Given Name/i}).locator('tbody tr').last();
        const boxes = row.locator('input');
        await boxes.first().waitFor({state: 'visible', timeout: 10_000});
        if (a.givenName !== undefined) await boxes.nth(0).fill(a.givenName);
        if (a.familyName !== undefined) await boxes.nth(1).fill(a.familyName);
        if (a.orcid !== undefined) await boxes.nth(2).fill(a.orcid);
    }
    if (d.url !== undefined) await panel.getByRole('textbox', {name: 'URL', exact: true}).fill(d.url);
}

async function addViaPanel(page, d, name) {
    await page.getByRole('button', {name: 'Add Data Citation', exact: true}).first().click();
    const panel = panelOf(page, 'Add Data Citation');
    await panel.waitFor({state: 'visible', timeout: T});
    await idle(page);
    await fillPanel(panel, d);
    const saved = await pressSave(page, panel);
    if (saved.closed && d.title) {
        // Does the row show in place (no reload)? Bounded wait on the row itself.
        saved.inPlace = await page.locator('table:visible tbody tr').filter({hasText: d.title}).first()
            .waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false);
    }
    if (name) record(name, {saved, after: await tableRows(page)});
    return saved;
}

async function closePanel(page, panel) {
    const close = panel.getByRole('button', {name: 'Close', exact: true});
    if (await close.count()) await close.first().click(); else await page.keyboard.press('Escape');
    await panel.waitFor({state: 'detached', timeout: 10_000}).catch(() => {});
    await idle(page);
}

// The wizard ------------------------------------------------------------------

async function wizardTo(page, app, ctxPath, id, stepName) {
    if (!page.url().includes(`submission?id=${id}`)) { await page.goto(app.url(`/index.php/${ctxPath}/submission?id=${id}`)); await idle(page); }
    await page.locator('.pkpSteps').waitFor({timeout: T});
    const current = page.locator('.pkpSteps__step__label--current');
    for (let i = 0; i < 5 && !((await current.innerText()).trim().endsWith(stepName)); i++) {
        if (await page.locator('.pkpSteps--collapsed').count()) await page.locator('.pkpSteps__controls button').click().catch(() => {});
        const rail = page.locator('button.pkpSteps__step__label').filter({hasText: new RegExp(`${stepName}$`)});
        if (await rail.count()) await rail.first().click().catch(() => {});
        else await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click();
        await current.filter({hasText: new RegExp(`${stepName}\\s*$`)}).waitFor({timeout: 8000}).catch(() => {});
    }
    await idle(page);
    return (await current.innerText()).trim();
}

/** The Review step's data-citations item: the lines from "Data Citations" to the next item. */
function reviewItem(text, label = 'Data Citations') {
    if (!text) return null;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const i = lines.findIndex((l) => l === label);
    if (i < 0) return null;
    return lines.slice(i, i + 6);
}

async function reviewWarnings(page) {
    return page.locator('.pkpNotification, [class*="notification"], [class*="Notification"], .submissionWizard__reviewPanel__item__value--error, [role="alert"]')
        .evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
}

// Settings -------------------------------------------------------------------------

async function setDataCitations(page, app, ctxPath, level) {
    await page.goto(app.url(`/index.php/${ctxPath}/management/settings/workflow`)); await idle(page);
    await page.locator('#metadata-button').click(); await idle(page);
    const group = page.getByRole('group', {name: 'Data Citations', exact: true});
    await group.waitFor({state: 'visible', timeout: T});
    const box = group.getByRole('checkbox', {name: 'Enable data citation metadata', exact: true});
    if (level === 'off') await box.uncheck(); else {
        await box.check();
        const labels = {enable: /^Do not request/, request: /^Ask the author/, require: /^Require the author/};
        await group.getByRole('radio', {name: labels[level]}).check();
    }
    const form = page.locator('form').filter({has: group});
    const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 10_000}).catch(() => {});
    return r ? r.status() : null;
}

// The Reviewer's window ---------------------------------------------------------------

async function reviewerWindow(page, app, ctxPath, sid, name) {
    await page.goto(app.url(`/index.php/${ctxPath}/reviewer/submission/${sid}`));
    await idle(page);
    const out = {url: page.url()};
    const step1 = await page.locator('#reviewStep1Form').innerText().catch(() => null);
    out.reviewType = step1 ? (step1.match(/Review Type\s*\n?\s*([^\n]+)/) || [])[1] || null : null;
    const pub = page.waitForResponse((r) => /\/api\/v1\/submissions\/\d+\/publications\/\d+(\?.*)?$/.test(r.url()) && r.request().method() === 'GET', {timeout: T}).catch(() => null);
    const link = page.getByRole('link', {name: 'View All Submission Details'});
    await link.first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    if (!(await link.count())) { out.link = false; await snap(page, `${name}-page`); record(name, out); return out; }
    await link.first().click();
    const r = await pub;
    if (r) {
        out.publicationGet = {status: r.status()};
        try { const b = await r.json(); out.publicationGet.dataCitationsCount = Array.isArray(b.dataCitations) ? b.dataCitations.length : typeof b.dataCitations; } catch { /* not json */ }
    }
    await page.waitForFunction(() => { const ds = document.querySelectorAll('[role="dialog"]'); const l = ds[ds.length - 1]; return l && l.innerText.length > 120; }, undefined, {timeout: T}).catch(() => {});
    await idle(page);
    const dlg = page.getByRole('dialog').last();
    const s = await snap(page, `${name}-window`);
    const text = s.text && s.text.dialog || '';
    out.hasDataCitations = /Data Citations/.test(text);
    out.hasRefText = /K3 reference text/.test(text);
    out.hasReferencesLabel = /\bReferences\b/.test(text);
    out.rowsText = await dlg.locator('table').filter({hasText: /MORE ACTIONS|More Actions|No data citations/i}).first().locator('tbody tr')
        .evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => null);
    out.block = out.hasDataCitations ? await dataBlock(page, dlg) : null;
    if (out.hasDataCitations) {
        out.menu = await rowMenu(page, 'K3 Dataset', {keepOpen: true});
        if (out.menu.items && out.menu.items.includes('View')) {
            await page.getByRole('menuitem', {name: 'View', exact: true}).click();
            const view = panelOf(page, 'View Data Citation');
            out.view = await panelRead(page, view).catch((e) => ({error: String(e.message).slice(0, 200)}));
            await snap(page, `${name}-view`);
            await closePanel(page, view);
        } else await page.keyboard.press('Escape').catch(() => {});
    }
    record(name, out);
    log(name, JSON.stringify({type: out.reviewType, dc: out.hasDataCitations, rows: out.rowsText, menu: out.menu && out.menu.items, ref: out.hasRefText, api: out.publicationGet}));
    const close = dlg.getByRole('button', {name: 'Close', exact: true});
    if (await close.count()) await close.first().click().catch(() => {});
    return out;
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOps = app.name === 'ops';
    const hasReview = !isOps;
    const {page, close} = await launch(app);
    page.on('dialog', (d) => { log(app.name, 'browser dialog:', d.type(), JSON.stringify(d.message())); record(`browser-dialog-${Date.now()}`, {type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
    const who = async (u, ctxPath) => { await signIn(page, u, {contextPath: ctxPath}); await idle(page); };
    try {
        // ------------------------------------------------------------------ roles
        if (on('roles')) {
            const t = tag('u42k3r');
            const users = [
                {username: `${t}mg`, roles: ['manager'], givenName: 'Meg', familyName: 'Manager'},
                {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Sectioned'},
                {username: `${t}sn`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Noedit'},
                {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            ];
            if (hasReview) users.push({username: `${t}fc`, roles: ['funding'], givenName: 'Fay', familyName: 'Funding'});
            const C = await app.api.createContext({tag: t, users, metadata: {dataCitations: 'request', dataAvailability: 'request'}});
            const participants = [{username: `${t}se`, role: 'sectionEditor', canChangeMetadata: true}, {username: `${t}sn`, role: 'sectionEditor', canChangeMetadata: false}];
            if (hasReview) participants.push({username: `${t}fc`, role: 'funding'});
            const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K3 roles ${t}`, citationsRaw: REFS,
                dataCitations: [DC_ALPHA, DC_BETA], participants});
            record('roles-seed', {ctx: C.path, S: S.submissionId, dc: S.dataCitations});
            const levels = [['mg', `${t}mg`, false], ['admin', 'admin', false], ['se', `${t}se`, false], ['sn', `${t}sn`, false]];
            if (hasReview) levels.push(['fc', `${t}fc`, false]);
            levels.push(['au', `${t}au`, true]);
            for (const [key, u, author] of levels) {
                await who(u, C.path);
                await gotoWorkflow(page, app, C.path, S.submissionId, {author});
                const menu = await menuEntries(page);
                const opened = await openData(page);
                const s = await snap(page, `roles-${key}-data`);
                const out = {user: key, menu, opened, block: opened ? await dataBlock(page) : null};
                if (opened) {
                    out.menuAlpha = await rowMenu(page, 'K3 Dataset Alpha');
                    const v = await rowAction(page, 'K3 Dataset Alpha', 'View');
                    if (v.items && v.items.includes('View')) {
                        const view = panelOf(page, 'View Data Citation');
                        out.view = await panelRead(page, view).catch((e) => ({error: String(e.message).slice(0, 200)}));
                        await snap(page, `roles-${key}-view`);
                        await closePanel(page, view);
                    }
                    if (key === 'mg') {
                        await loc(page, 'Data page: "Add Data Citation"', wf(page).getByRole('button', {name: 'Add Data Citation', exact: true}));
                        await loc(page, 'Data page: "Order"', wf(page).getByRole('button', {name: 'Order', exact: true}));
                        await loc(page, 'Data page: Data Citations table', page.getByRole('table', {name: 'Data Citations'}));
                        await loc(page, 'Data page: row "More Actions"', page.getByRole('table', {name: 'Data Citations'}).getByRole('button', {name: /More Actions/}));
                    }
                    // A viewer who may edit (or seems to be offered it): does an add go through? (OPS author: q2's "every control is live").
                    if ((key === 'admin' || key === 'sn' || (key === 'au' && isOps) || key === 'fc') && out.block && out.block.add.count && out.block.add.visible) {
                        out.addTry = await addViaPanel(page, {title: `K3 added by ${key}`, relationshipType: 'supporting'});
                        out.addPanelAfter = await panelOf(page, 'Add Data Citation').isVisible().catch(() => false);
                        if (out.addPanelAfter) { out.addPanelErrors = await panelErrors(panelOf(page, 'Add Data Citation')); await snap(page, `roles-${key}-add-refused`); await closePanel(page, panelOf(page, 'Add Data Citation')); }
                        out.afterAdd = await tableRows(page);
                        if (key === 'au' && isOps) {
                            const e = await rowAction(page, `K3 added by ${key}`, 'Edit');
                            if (e.items && e.items.includes('Edit')) {
                                const ep = panelOf(page, 'Edit Data Citation');
                                await ep.waitFor({state: 'visible', timeout: T});
                                await fillPanel(ep, {title: `K3 added by ${key} edited`});
                                out.editTry = await pressSave(page, ep);
                            }
                            out.afterEdit = await tableRows(page);
                            const d = await rowAction(page, `K3 added by ${key}`, 'Delete');
                            if (d.items && d.items.includes('Delete')) {
                                const conf = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'Are you sure'}).last();
                                await conf.waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
                                const del = page.waitForResponse((r) => /\/dataCitations\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
                                await conf.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
                                const r = await del; out.deleteTry = r ? r.status() : null; await idle(page);
                            }
                            out.afterDelete = await tableRows(page);
                            out.orderMode = await (async () => {
                                const ob = wf(page).getByRole('button', {name: 'Order', exact: true});
                                if (!(await ob.count())) return null;
                                await ob.click(); await idle(page);
                                const b = await dataBlock(page);
                                const so = wf(page).getByRole('button', {name: 'Save Order', exact: true});
                                const sr = page.waitForResponse((r) => /\/dataCitations\/order/.test(r.url()), {timeout: 15_000}).catch(() => null);
                                if (await so.count()) await so.click();
                                const r = await sr; await idle(page);
                                return {inMode: b, saveStatus: r ? r.status() : null};
                            })();
                        }
                    }
                }
                record(`roles-${key}`, out);
                log(app.name, 'roles', key, JSON.stringify({opened, desc: out.block && out.block.descriptionLine, order: out.block && out.block.order.count, add: out.block && out.block.add.count, menu: out.menuAlpha && out.menuAlpha.items, view: out.view && out.view.title, viewButtons: out.view && out.view.buttons, addTry: out.addTry, afterAdd: out.afterAdd && out.afterAdd.rows}));
            }
        }

        // ------------------------------------------------------------------ panel
        if (on('panel')) {
            const t = tag('u42k3p');
            const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
                metadata: {dataCitations: 'request'}});
            const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K3 panel ${t}`});
            await who(`${t}mg`, C.path);
            await gotoWorkflow(page, app, C.path, S.submissionId);
            await openData(page);
            const out = {empty: await dataBlock(page)};
            process.on('exit', () => { if (!out.recorded) try { record('panel-partial', out); } catch { /* best effort */ } });
            await snap(page, 'panel-data-empty');
            // 1. The Add panel as it arrives.
            await wf(page).getByRole('button', {name: 'Add Data Citation', exact: true}).click();
            let panel = panelOf(page, 'Add Data Citation');
            out.arrive = await panelRead(page, panel);
            await snap(page, 'panel-add-arrive');
            await loc(page, 'Add Data Citation panel: "Identifier type"', panel.getByRole('combobox', {name: 'Identifier type', exact: true}));
            await loc(page, 'Add Data Citation panel: "Relationship type"', panel.getByRole('combobox', {name: /^Relationship type/}));
            await loc(page, 'Add Data Citation panel: "Save"', panel.getByRole('button', {name: 'Save', exact: true}));
            // 2. Save empty.
            out.saveEmpty = await pressSave(page, panel, {expectClose: false});
            out.saveEmptyErrors = await panelErrors(panel);
            await snap(page, 'panel-save-empty');
            // 3. The q16 sequence, one refusal at a time.
            await fillPanel(panel, {title: 'Ocean temperature records', relationshipType: 'supporting', identifierType: 'DOI'});
            out.typeNoId = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await snap(page, 'panel-type-no-identifier');
            out.typeOptionsAfterPick = await panel.getByRole('combobox', {name: 'Identifier type', exact: true}).evaluate((s) => ({n: s.options.length, first: s.options[0].text, value: s.value}));
            await fillPanel(panel, {identifier: 'not-a-doi'});
            out.badDoi = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await snap(page, 'panel-bad-doi');
            await fillPanel(panel, {identifier: '10.1234/k3ocean', year: '20a4'});
            out.badYear = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await snap(page, 'panel-bad-year');
            await fillPanel(panel, {year: '202'});
            out.badYear3 = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await fillPanel(panel, {year: '2024', authors: [{givenName: 'Grace', familyName: 'Hopper', orcid: '123'}]});
            out.badOrcid = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await snap(page, 'panel-bad-orcid');
            const orcidBox = panel.locator('table').filter({hasText: /Given Name/i}).locator('tbody tr').last().locator('input').nth(2);
            const saveBtn = panel.getByRole('button', {name: 'Save', exact: true});
            // After the ORCID refusal: does correcting the ORCID box alone re-enable "Save"?
            await orcidBox.fill('https://orcid.org/0000-0002-1825-0097');
            await orcidBox.blur();
            out.saveDisabledAfterOrcidFix = await saveBtn.isDisabled();
            await snap(page, 'panel-orcid-corrected');
            await orcidBox.fill('0000-0002-1825-0097');
            await fillPanel(panel, {repository: 'K3 Repo'});
            out.saveDisabledAfterOtherField = await saveBtn.isDisabled();
            out.bareOrcid = await saveBtn.isDisabled() ? {skipped: 'Save disabled'} : {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await snap(page, 'panel-bare-orcid');
            await fillPanel(panel, {year: '20245', repository: ''});
            out.saveDisabledAfterYearChange = await saveBtn.isDisabled();
            await orcidBox.fill('https://orcid.org/0000-0002-1825-0097');
            out.saveDisabledAfterOrcidUri = await saveBtn.isDisabled();
            out.badYear5 = await saveBtn.isDisabled() ? {skipped: 'Save disabled'} : {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await fillPanel(panel, {year: '2024'});
            await fillPanel(panel, {url: 'example'});
            out.badUrl = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await snap(page, 'panel-bad-url');
            await fillPanel(panel, {url: 'https://example.org/ocean'});
            out.valid = await pressSave(page, panel);
            out.validInPlace = await waitRow(page, 'Ocean temperature records');
            out.afterValid = await tableRows(page);
            await snap(page, 'panel-after-valid');
            // 4. Identifier without a type (a fresh panel).
            await wf(page).getByRole('button', {name: 'Add Data Citation', exact: true}).click();
            panel = panelOf(page, 'Add Data Citation');
            await panel.waitFor({state: 'visible', timeout: T}); await idle(page);
            out.reopen = await panelRead(page, panel);
            await fillPanel(panel, {title: 'K3 identifier without type', relationshipType: 'non-analyzed', identifier: '10.1234/k3notype'});
            out.idNoType = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel)};
            await snap(page, 'panel-identifier-no-type');
            // 5. q17: a DOI typed as an address (then prefixes on two more types).
            await fillPanel(panel, {title: 'K3 DOI as address', identifierType: 'DOI', identifier: 'https://doi.org/10.1234/abcd'});
            out.doiAddress = await pressSave(page, panel);
            out.afterDoiAddress = await tableRows(page);
            for (const [ttl, type, id] of [['K3 DOI with prefix', 'DOI', 'doi:10.1234/efgh'], ['K3 Handle as address', 'Handle', 'https://hdl.handle.net/20.1000/100'],
                ['K3 ARXIV as address', 'ARXIV', 'https://arxiv.org/abs/1234.12345v2'], ['K3 ARXIV with prefix', 'ARXIV', 'arxiv:2345.23456v3'],
                ['K3 ARXIV bare', 'ARXIV', '3456.34567v4'], ['K3 ARXIV bare unversioned', 'ARXIV', '4567.45678'], ['K3 DOI bare', 'DOI', '10.1234/bare']]) {
                out[ttl] = await addViaPanel(page, {title: ttl, relationshipType: 'supporting', identifierType: type, identifier: id});
                if (!out[ttl].closed) { out[`${ttl} errs`] = await panelErrors(panelOf(page, 'Add Data Citation')); await closePanel(page, panelOf(page, 'Add Data Citation')); }
            }
            out.afterIdentifiers = await tableRows(page);
            await snap(page, 'panel-identifiers');
            // 6. Edit: title, prefill, save in place.
            const em = await rowAction(page, 'K3 DOI as address', 'Edit');
            out.editMenu = em.items;
            panel = panelOf(page, 'Edit Data Citation');
            out.editArrive = await panelRead(page, panel).catch((e) => ({error: String(e.message).slice(0, 200)}));
            await snap(page, 'panel-edit-arrive');
            if (!out.editArrive.error) {
                await fillPanel(panel, {title: 'K3 DOI as address (edited)'});
                out.editSave = await pressSave(page, panel);
                out.editInPlace = await waitRow(page, 'K3 DOI as address (edited)');
                out.afterEdit = await tableRows(page);
                await snap(page, 'panel-after-edit');
            }
            // Edit of the fully filled one: prefill of every field.
            await rowAction(page, 'Ocean temperature records', 'Edit');
            panel = panelOf(page, 'Edit Data Citation');
            out.editFull = await panelRead(page, panel).catch((e) => ({error: String(e.message).slice(0, 200)}));
            // Leave with a change unsaved: type, then Close.
            await panel.getByRole('textbox', {name: /^Title/}).fill('K3 unsaved change');
            await closePanel(page, panel);
            out.afterUnsavedClose = await tableRows(page);
            out.panelStillOpen = await panelOf(page, 'Edit Data Citation').isVisible().catch(() => false);
            await snap(page, 'panel-after-unsaved-close');
            // An identifier once saved: clear it on Edit and save (the type list has no empty choice).
            await rowAction(page, 'K3 DOI with prefix', 'Edit');
            panel = panelOf(page, 'Edit Data Citation');
            await panel.waitFor({state: 'visible', timeout: T}); await idle(page);
            await panel.getByRole('textbox', {name: 'Identifier', exact: true}).fill('');
            out.clearIdentifier = {save: await pressSave(page, panel, {expectClose: false}), errs: await panelErrors(panel),
                typeOptions: await panel.getByRole('combobox', {name: 'Identifier type', exact: true}).evaluate((x) => [...x.options].map((o) => o.text))};
            await snap(page, 'panel-clear-identifier');
            if (await panel.isVisible().catch(() => false)) await closePanel(page, panel);
            // View as the manager.
            await rowAction(page, 'Ocean temperature records', 'View');
            const view = panelOf(page, 'View Data Citation');
            out.viewMgr = await panelRead(page, view).catch((e) => ({error: String(e.message).slice(0, 200)}));
            await snap(page, 'panel-view-manager');
            await closePanel(page, view);
            // 7. Delete: Cancel, then OK.
            const conf = () => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'Are you sure'}).last();
            await rowAction(page, 'K3 DOI bare', 'Delete');
            await conf().waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
            out.deleteDialog = {text: await conf().innerText().catch(() => null), buttons: await conf().getByRole('button').allTextContents().catch(() => [])};
            await snap(page, 'panel-delete-dialog');
            await conf().getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
            await idle(page);
            out.afterCancel = await tableRows(page);
            await rowAction(page, 'K3 DOI bare', 'Delete');
            await conf().waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
            const del = page.waitForResponse((r) => /\/dataCitations\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
            await conf().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            const dr = await del; out.deleteStatus = dr ? dr.status() : null;
            await idle(page);
            out.deleteInPlace = await waitRow(page, 'K3 DOI bare', 'detached');
            out.afterOk = await tableRows(page);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.afterReload = await tableRows(page);
            await snap(page, 'panel-after-delete-reload');
            // 8. Leaving the page with the Add panel open and typed in.
            await wf(page).getByRole('button', {name: 'Add Data Citation', exact: true}).click();
            panel = panelOf(page, 'Add Data Citation');
            await panel.waitFor({state: 'visible', timeout: T}); await idle(page);
            await panel.getByRole('textbox', {name: /^Title/}).fill('K3 typed then left');
            await panel.getByRole('textbox', {name: /^Title/}).blur();
            out.leave = await page.goto(app.url(`/index.php/${C.path}/dashboard/editorial`)).then((r) => (r ? r.status() : null)).catch((e) => String(e.message).slice(0, 120));
            await idle(page);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.afterLeave = await tableRows(page);
            out.recorded = true;
            record('panel', out);
            log(app.name, 'panel', JSON.stringify({arriveTitle: out.arrive.title, fields: out.arrive.fields.map((f) => `${f.label}=${JSON.stringify(f.value)}/${f.selectedIndex}`), buttons: out.arrive.buttons, links: out.arrive.links}));
            log(app.name, 'panel errors', JSON.stringify({empty: out.saveEmptyErrors, typeNoId: out.typeNoId, badDoi: out.badDoi.errs, badYear: out.badYear.errs, badYear3: out.badYear3.errs, badOrcid: out.badOrcid.errs, badUrl: out.badUrl.errs, idNoType: out.idNoType.errs}));
            log(app.name, 'panel rows', JSON.stringify({valid: out.valid, afterValid: out.afterValid, doi: out.afterDoiAddress, ids: out.afterIdentifiers, edit: out.afterEdit, editBox: out.editArrive && out.editArrive.fields, unsaved: out.afterUnsavedClose, del: out.deleteDialog, afterCancel: out.afterCancel, afterOk: out.afterOk, reload: out.afterReload, leave: out.leave, afterLeave: out.afterLeave}));
        }

        // ------------------------------------------------------------------ order
        if (on('order')) {
            const t = tag('u42k3o');
            const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
                metadata: {dataCitations: 'request'}});
            const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K3 order ${t}`});
            await who(`${t}mg`, C.path);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            const out = {};
            for (const x of ['A', 'B', 'C']) await addViaPanel(page, {title: `Dataset ${x}`, relationshipType: 'supporting'});
            out.added = await tableRows(page);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.addedReload = await tableRows(page);
            await rowAction(page, 'Dataset A', 'Edit');
            const ep = panelOf(page, 'Edit Data Citation');
            await ep.waitFor({state: 'visible', timeout: T}); await idle(page);
            await fillPanel(ep, {title: 'Dataset A1'});
            out.editA = await pressSave(page, ep);
            out.afterEditInPlace = await tableRows(page);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.afterEditReload = await tableRows(page);
            await snap(page, 'order-after-edit-reload');
            // Ordering mode.
            await wf(page).getByRole('button', {name: 'Order', exact: true}).click(); await idle(page);
            out.mode = await dataBlock(page);
            await snap(page, 'order-mode');
            const rowC = page.locator('table:visible').filter({hasText: 'Dataset C'}).first().locator('tbody tr').filter({hasText: 'Dataset C'});
            out.rowCButtons = await rowC.locator('button').evaluateAll((els) => els.map((e) => ({label: (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim(), disabled: e.disabled})));
            await loc(page, 'Order mode: row "Dataset C" buttons', rowC.locator('button'));
            // The arrows carry no accessible name: the first button of a row moves it up.
            for (let i = 0; i < 2; i++) {
                await page.locator('table:visible tbody tr').filter({hasText: 'Dataset C'}).locator('button').first().click().catch((e) => { out.upErr = String(e.message).slice(0, 200); });
            }
            out.inModeAfterMoves = await tableRows(page);
            out.firstRowUpDisabled = await page.locator('table:visible tbody tr').first().locator('button').evaluateAll((els) => els.map((e) => e.disabled));
            const so = page.waitForResponse((r) => /\/dataCitations\/order/.test(r.url()), {timeout: 15_000}).catch(() => null);
            await wf(page).getByRole('button', {name: 'Save Order', exact: true}).click().catch((e) => { out.saveOrderErr = String(e.message).slice(0, 200); });
            const sr = await so; out.saveOrder = sr ? {status: sr.status(), method: sr.request().method(), override: sr.request().headers()['x-http-method-override'] || null} : null;
            await idle(page);
            out.leftModeAfterSave = await wf(page).getByRole('button', {name: 'Order', exact: true}).waitFor({state: 'visible', timeout: 10_000}).then(() => true).catch(() => false);
            out.afterSaveOrder = {block: await dataBlock(page)};
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.afterSaveOrderReload = await tableRows(page);
            await snap(page, 'order-after-save');
            await addViaPanel(page, {title: 'Dataset D', relationshipType: 'supporting'});
            out.afterAddD = await tableRows(page);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.afterAddDReload = await tableRows(page);
            await snap(page, 'order-after-add-d-reload');
            // "until the order is saved again": Order › Save Order with no move.
            await wf(page).getByRole('button', {name: 'Order', exact: true}).click(); await idle(page);
            out.modeAgain = await tableRows(page);
            await wf(page).getByRole('button', {name: 'Save Order', exact: true}).click().catch(() => {});
            await idle(page);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.afterResaveReload = await tableRows(page);
            // Ordering mode left without saving: a move, then reload.
            await wf(page).getByRole('button', {name: 'Order', exact: true}).click(); await idle(page);
            await page.locator('table:visible tbody tr').filter({hasText: 'Dataset B'}).locator('button').first().click().catch(() => {});
            out.unsavedMoveInMode = await tableRows(page);
            await gotoWorkflow(page, app, C.path, S.submissionId); await openData(page);
            out.afterUnsavedMoveReload = await tableRows(page);
            record('order', out);
            log(app.name, 'order', JSON.stringify(out));
        }

        // ------------------------------------------------------------------ wizard (Ask)
        if (on('wizard')) {
            const t = tag('u42k3w');
            const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
                metadata: {dataCitations: 'request', dataAvailability: 'request'}});
            const D = await app.api.createSubmission({tag: `${t}d`, context: C.path, submitter: `${t}au`, title: `K3 wizard ${t}`, submitted: false});
            await who(`${t}au`, C.path);
            const out = {};
            out.stepDetails = await wizardTo(page, app, C.path, D.submissionId, 'Details');
            const s0 = await snap(page, 'wizard-details-arrive');
            const main = s0.text && s0.text.main || '';
            out.dataSection = {
                heading: /\nData\n/.test(main), description: main.includes('Information about the research data associated with your submission.'),
                dcBeforeDAS: main.indexOf('Data Citations') >= 0 && main.indexOf('Data Availability Statement') >= 0 ? main.indexOf('Data Citations') < main.indexOf('Data Availability Statement') : null,
            };
            out.block0 = await dataBlock(page, page.locator('main'));
            // Review before any add.
            await wizardTo(page, app, C.path, D.submissionId, 'Review');
            let rs = await snap(page, 'wizard-review-empty');
            out.reviewEmpty = reviewItem(rs.text && rs.text.main);
            // Back to Details, add one.
            await wizardTo(page, app, C.path, D.submissionId, 'Details');
            out.add = await addViaPanel(page, {title: 'K3 Wizard Dataset', relationshipType: 'generated', identifierType: 'DOI', identifier: '10.1234/k3wiz'});
            await page.waitForTimeout(0);
            out.tableAfterAdd = await tableRows(page);
            await snap(page, 'wizard-details-after-add');
            await wizardTo(page, app, C.path, D.submissionId, 'Review');
            rs = await snap(page, 'wizard-review-after-add');
            out.reviewAfterAdd = reviewItem(rs.text && rs.text.main);
            await page.reload(); await idle(page);
            out.afterReloadStep = await wizardTo(page, app, C.path, D.submissionId, 'Review');
            rs = await snap(page, 'wizard-review-after-reload');
            out.reviewAfterReload = reviewItem(rs.text && rs.text.main);
            await wizardTo(page, app, C.path, D.submissionId, 'Details');
            out.tableAfterReload = await tableRows(page);
            out.blockAfterReload = await dataBlock(page, page.locator('main'));
            out.menu = await rowMenu(page, 'K3 Wizard Dataset');
            // Edit in the wizard (in-place update?).
            await rowAction(page, 'K3 Wizard Dataset', 'Edit');
            const ep = panelOf(page, 'Edit Data Citation');
            if (await ep.isVisible().catch(() => false) || await ep.waitFor({state: 'visible', timeout: 10_000}).then(() => true).catch(() => false)) {
                await fillPanel(ep, {title: 'K3 Wizard Dataset edited'});
                out.edit = await pressSave(page, ep);
                out.editInPlace = await waitRow(page, 'K3 Wizard Dataset edited');
            }
            out.tableAfterEdit = await tableRows(page);
            // A second add, then Order in the wizard.
            out.add2 = await addViaPanel(page, {title: 'K3 Wizard Second', relationshipType: 'supporting'});
            out.tableAfterAdd2 = await tableRows(page);
            const ob = page.locator('main').getByRole('button', {name: 'Order', exact: true}).first();
            if (await ob.count()) { await ob.click(); await idle(page); out.orderMode = await dataBlock(page, page.locator('main')); await page.locator('main').getByRole('button', {name: 'Save Order', exact: true}).first().click().catch(() => {}); await idle(page); }
            // Leave the step with an unsaved change (the References box), by the rail and by leaving the page.
            const das = page.locator('main').getByRole('textbox', {name: 'References', exact: true});
            out.dasBox = await das.count();
            if (out.dasBox) {
                await das.first().click().catch(() => {});
                await page.keyboard.type('K3 unsaved reference typed on Details');
                await page.locator('main h1').first().click().catch(() => {});
            }
            out.leaveToReview = await wizardTo(page, app, C.path, D.submissionId, 'Review');
            rs = await snap(page, 'wizard-review-after-unsaved');
            out.reviewDAS = reviewItem(rs.text && rs.text.main, 'References');
            await wizardTo(page, app, C.path, D.submissionId, 'Details');
            if (out.dasBox) { await das.first().click().catch(() => {}); await page.keyboard.type(' more'); await page.locator('main h1').first().click().catch(() => {}); }
            out.leavePage = await page.goto(app.url(`/index.php/${C.path}/dashboard/mySubmissions`)).then((r) => (r ? r.status() : null)).catch((e) => String(e.message).slice(0, 120));
            await idle(page);
            await wizardTo(page, app, C.path, D.submissionId, 'Details');
            out.dasAfterLeave = out.dasBox ? await das.first().inputValue().catch(async () => das.first().innerText().catch(() => null)) : null;
            await snap(page, 'wizard-details-after-leave');
            record('wizard', out);
            log(app.name, 'wizard', JSON.stringify(out));
        }

        // ------------------------------------------------------------------ version: each version carries its own list (line 278)
        if (on('version')) {
            const t = tag('u42k3v');
            const spec = {tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}], metadata: {dataCitations: 'request'}};
            if (app.name === 'ojs') spec.issues = [{volume: 1, number: 1, year: 2026, published: true}];
            const C = await app.api.createContext(spec);
            const sub = {tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K3 version ${t}`, dataCitations: [DC_ALPHA], published: true};
            if (app.name === 'ojs') sub.issue = {volume: 1, number: 1, year: 2026};
            let S;
            try { S = await app.api.createSubmission(sub); } catch (e) { delete sub.issue; log(app.name, 'issue key refused:', String(e.message).slice(0, 300)); S = await app.api.createSubmission(sub); }
            await who(`${t}mg`, C.path);
            await gotoWorkflow(page, app, C.path, S.submissionId);
            const out = {before: await menuEntries(page)};
            const dialog = wf(page);
            let link = dialog.getByRole('link', {name: 'Create New Version', exact: true}).first();
            if (!(await link.isVisible().catch(() => false))) { const g = dialog.getByRole('link', {name: /^(Publication|Preprint)$/}).first(); if (await g.count()) await g.click(); await idle(page); }
            out.offered = await link.isVisible().catch(() => false);
            if (out.offered) {
                await link.click();
                const win = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
                await win.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
                const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await win.getByRole('button', {name: 'Confirm', exact: true}).click().catch((e) => { out.confirmErr = String(e.message).slice(0, 150); });
                const r = await created; out.createStatus = r ? r.status() : null;
                await win.waitFor({state: 'detached', timeout: T}).catch(() => {});
                await idle(page);
            }
            out.menuAfter = await menuEntries(page);
            out.nav = await wf(page).locator('nav').first().ariaSnapshot().catch(() => null);
            const labels = out.menuAfter.filter((n) => /version|Version of Record|Author Original|Author Accepted|\d+\.\d+$/i.test(n) && !/Create New Version/.test(n));
            out.labels = labels;
            const perVersion = async (label) => {
                const item = wf(page).getByRole('treeitem', {name: label, exact: true});
                const data = item.getByRole('link', {name: 'Data', exact: true});
                if (!(await data.isVisible().catch(() => false))) { await item.getByRole('link', {name: label, exact: true}).click({timeout: 5000}).catch(() => {}); await idle(page); }
                await data.click({timeout: 5000}).catch((e) => { out.navErr = String(e.message).slice(0, 150); });
                await idle(page);
                await page.locator('table:visible').filter({hasText: /No data citations have been added|MORE ACTIONS|More Actions/i}).first().waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
                const b = await dataBlock(page);
                b.status = ((await wf(page).innerText().catch(() => '')).match(/Status:\s*\n?\s*([^\n]+)/) || [])[1] || null;
                return {label, block: b};
            };
            out.v = [];
            for (const l of labels) out.v.push(await perVersion(l));
            await snap(page, 'version-data');
            const editable = out.v.filter((x) => x.block.add.count && x.block.add.visible);
            out.addOn = editable.length ? editable[editable.length - 1].label : null;
            if (out.addOn) {
                await perVersion(out.addOn);
                out.add = await addViaPanel(page, {title: 'K3 on one version only', relationshipType: 'supporting'});
                out.after = [];
                await gotoWorkflow(page, app, C.path, S.submissionId);
                for (const l of labels) out.after.push({l, rows: (await perVersion(l)).block.rows});
                await snap(page, 'version-after-add');
            }
            record('version', out);
            log(app.name, 'version', JSON.stringify({offered: out.offered, create: out.createStatus, labels: out.labels, v: out.v.map((x) => [x.label, x.block.status, x.block.rows, x.block.add.count]), addOn: out.addOn, after: out.after, navErr: out.navErr}));
        }

        // ------------------------------------------------------------------ leave: the Details step left with typed, unsaved text
        if (on('leave')) {
            const t = tag('u42k3l');
            const C = await app.api.createContext({tag: t, users: [{username: `${t}au`, roles: ['author']}], metadata: {dataCitations: 'request'}});
            const out = {};
            await who(`${t}au`, C.path);
            for (const how of ['page', 'rail']) {
                const D = await app.api.createSubmission({tag: `${t}${how[0]}`, context: C.path, submitter: `${t}au`, title: `K3 leave ${how} ${t}`, submitted: false});
                await wizardTo(page, app, C.path, D.submissionId, 'Details');
                const box = page.locator('main').getByRole('textbox', {name: 'References', exact: true});
                await box.click();
                await page.keyboard.type(`K3 typed then left by ${how}`);
                await page.locator('main h1').first().click().catch(() => {});
                const o = {};
                if (how === 'page') {
                    o.leave = await page.goto(app.url(`/index.php/${C.path}/dashboard/mySubmissions`)).then((r) => (r ? r.status() : null)).catch((e) => String(e.message).slice(0, 120));
                } else {
                    o.step = await wizardTo(page, app, C.path, D.submissionId, 'Review');
                    const rs = await snap(page, `leave-${how}-review`);
                    o.review = reviewItem(rs.text && rs.text.main, 'References');
                    await page.goto(app.url(`/index.php/${C.path}/dashboard/mySubmissions`)); await idle(page);
                }
                await wizardTo(page, app, C.path, D.submissionId, 'Details');
                o.boxAfter = await page.locator('main').getByRole('textbox', {name: 'References', exact: true}).inputValue().catch(() => null);
                await snap(page, `leave-${how}-details-after`);
                out[how] = o;
            }
            record('leave', out);
            log(app.name, 'leave', JSON.stringify(out));
        }

        // ------------------------------------------------------------------ require (A9) and the references control
        if (on('require')) {
            const t = tag('u42k3q');
            const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
                metadata: {dataCitations: 'require', citations: 'request'}});
            // The draft carries its main file, so the only thing missing is the required item.
            const withFile = async (spec) => {
                if (!isOps) return app.api.createSubmission({...spec, files: [{file: 'article.pdf'}]});
                try { return await app.api.createSubmission({...spec, galleys: [{label: 'PDF', file: 'preprint.pdf'}]}); } catch (e) { log(app.name, 'galley on a draft refused:', String(e.message).slice(0, 300)); return app.api.createSubmission(spec); }
            };
            const D = await withFile({tag: `${t}d`, context: C.path, submitter: `${t}au`, title: `K3 require ${t}`, submitted: false});
            const t2 = tag('u42k3c');
            const C2 = await app.api.createContext({tag: t2, users: [{username: `${t2}au`, roles: ['author']}], metadata: {citations: 'require'}});
            const D2 = await withFile({tag: `${t2}d`, context: C2.path, submitter: `${t2}au`, title: `K3 refs required ${t2}`, submitted: false});
            const out = {};
            for (const [key, ctx, d, u] of [['dc', C.path, D, `${t}au`], ['refs', C2.path, D2, `${t2}au`]]) {
                await who(u, ctx);
                await wizardTo(page, app, ctx, d.submissionId, 'Details');
                const sd = await snap(page, `require-${key}-details`);
                const m = sd.text && sd.text.main || '';
                const o = {dataSection: m.includes('Information about the research data associated with your submission.'), requiredMark: (m.match(/Data Citations[^\n]*\n[^\n]*/) || [null])[0]};
                o.review = await wizardTo(page, app, ctx, d.submissionId, 'Review');
                const rs = await snap(page, `require-${key}-review`);
                o.item = reviewItem(rs.text && rs.text.main, key === 'dc' ? 'Data Citations' : 'References');
                o.warnings = await reviewWarnings(page);
                o.hasWarningText = (rs.text && rs.text.main || '').includes(key === 'dc' ? 'Data citations are required.' : 'required');
                const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
                o.submitButton = {count: await submit.count(), disabled: (await submit.count()) ? await submit.isDisabled() : null};
                if (o.submitButton.count && !o.submitButton.disabled) {
                    const sub = page.waitForResponse((r) => /\/submissions\/\d+\/submit/.test(r.url()), {timeout: T}).catch(() => null);
                    await submit.click();
                    const confirm = page.locator('[role="dialog"]:visible').filter({has: page.getByRole('button', {name: 'Submit', exact: true})}).last();
                    if (await confirm.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
                        o.confirmText = await confirm.innerText().catch(() => null);
                        await confirm.getByRole('button', {name: 'Submit', exact: true}).click().catch(() => {});
                    }
                    const r = await sub; o.submitStatus = r ? r.status() : null;
                    await idle(page);
                    const after = await snap(page, `require-${key}-after-submit`);
                    o.afterUrl = after.url; o.afterHeading = (after.text && after.text.main || '').split('\n').slice(0, 6);
                    o.afterWarnings = await reviewWarnings(page);
                    await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions`)); await idle(page);
                    const dash = await snap(page, `require-${key}-dashboard`);
                    o.dashboardListsIt = (dash.text && dash.text.main || '').includes(key === 'dc' ? `K3 require ${t}` : `K3 refs required ${t2}`);
                }
                out[key] = o;
            }
            record('require', out);
            log(app.name, 'require', JSON.stringify(out));
        }

        // ------------------------------------------------------------------ levels: "Do not request" (enable)
        if (on('levels')) {
            const t = tag('u42k3e');
            const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
                metadata: {dataCitations: 'enable'}});
            const D = await app.api.createSubmission({tag: `${t}d`, context: C.path, submitter: `${t}au`, submitted: false});
            const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, dataCitations: [DC_BETA]});
            const out = {};
            await who(`${t}au`, C.path);
            await wizardTo(page, app, C.path, D.submissionId, 'Details');
            let s = await snap(page, 'enable-wizard-details');
            out.wizardHasData = /Data Citations|Information about the research data/.test(s.text && s.text.main || '');
            await wizardTo(page, app, C.path, D.submissionId, 'Review');
            s = await snap(page, 'enable-wizard-review');
            out.reviewItem = reviewItem(s.text && s.text.main);
            await who(`${t}mg`, C.path);
            await gotoWorkflow(page, app, C.path, S.submissionId);
            out.menu = await menuEntries(page);
            out.opened = await openData(page);
            await snap(page, 'enable-workflow-data');
            out.block = out.opened ? await dataBlock(page) : null;
            record('levels', out);
            log(app.name, 'levels(enable)', JSON.stringify(out));
        }

        // ------------------------------------------------------------------ off, stored, then switched on
        if (on('off')) {
            const t = tag('u42k3f');
            const users = [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}];
            if (hasReview) users.push({username: `${t}rv`, roles: ['externalReviewer']});
            const spec = {tag: t, users, metadata: {dataCitations: 'off'}};
            if (hasReview) spec.review = {defaultReviewMode: 'anonymous'};
            const C = await app.api.createContext(spec);
            const sub = {tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K3 off ${t}`, citationsRaw: REFS, dataCitations: [DC_ALPHA]};
            if (hasReview) Object.assign(sub, {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: `${t}rv`, status: 'accepted'}]}]});
            const S = await app.api.createSubmission(sub);
            const D = await app.api.createSubmission({tag: `${t}d`, context: C.path, submitter: `${t}au`, submitted: false, dataCitations: [DC_BETA]});
            const out = {};
            await who(`${t}au`, C.path);
            await wizardTo(page, app, C.path, D.submissionId, 'Details');
            let s = await snap(page, 'off-wizard-details');
            out.wizardHasData = /Data Citations|Information about the research data/.test(s.text && s.text.main || '');
            await wizardTo(page, app, C.path, D.submissionId, 'Review');
            s = await snap(page, 'off-wizard-review');
            out.reviewItem = reviewItem(s.text && s.text.main);
            if (hasReview) { await who(`${t}rv`, C.path); out.reviewerOff = await reviewerWindow(page, app, C.path, S.submissionId, 'off-reviewer'); }
            await who(`${t}mg`, C.path);
            await gotoWorkflow(page, app, C.path, S.submissionId);
            out.menuOff = await menuEntries(page);
            out.dataEntryOff = await wf(page).getByRole('link', {name: 'Data', exact: true}).count();
            await snap(page, 'off-workflow');
            out.settingsSave = await setDataCitations(page, app, C.path, 'request');
            await snap(page, 'off-settings-after-save');
            await gotoWorkflow(page, app, C.path, S.submissionId);
            out.openedOn = await openData(page);
            await snap(page, 'off-then-on-workflow-data');
            out.blockOn = out.openedOn ? await dataBlock(page) : null;
            if (hasReview) { await who(`${t}rv`, C.path); out.reviewerOn = await reviewerWindow(page, app, C.path, S.submissionId, 'off-then-on-reviewer'); }
            await who(`${t}au`, C.path);
            await wizardTo(page, app, C.path, D.submissionId, 'Details');
            out.wizardOnRows = await tableRows(page);
            await snap(page, 'off-then-on-wizard-details');
            record('off', out);
            log(app.name, 'off', JSON.stringify({wizardHasData: out.wizardHasData, reviewItem: out.reviewItem, reviewerOff: out.reviewerOff && out.reviewerOff.hasDataCitations, dataEntryOff: out.dataEntryOff, save: out.settingsSave, blockOn: out.blockOn && out.blockOn.rows, reviewerOn: out.reviewerOn && out.reviewerOn.rowsText, wizardOnRows: out.wizardOnRows}));
        }

        // ------------------------------------------------------------------ reviewer (OJS, OMP)
        if (on('reviewer') && hasReview) {
            const out = {};
            for (const mode of ['anonymous', 'doubleAnonymous', 'open']) {
                const t = tag(`u42k3${mode[0]}`);
                const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}, {username: `${t}rv`, roles: ['externalReviewer']}],
                    metadata: {dataCitations: 'request'}, review: {defaultReviewMode: mode}});
                const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K3 reviewer ${mode} ${t}`, citationsRaw: REFS,
                    dataCitations: [DC_ALPHA], decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: `${t}rv`, status: 'accepted'}]}]});
                await who(`${t}rv`, C.path);
                out[mode] = await reviewerWindow(page, app, C.path, S.submissionId, `reviewer-${mode}`);
                if (mode === 'anonymous') {
                    const S0 = await app.api.createSubmission({tag: `${t}z`, context: C.path, submitter: `${t}au`, title: `K3 reviewer none ${t}`, citationsRaw: REFS,
                        decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: `${t}rv`, status: 'accepted'}]}]});
                    out.none = await reviewerWindow(page, app, C.path, S0.submissionId, 'reviewer-none');
                }
            }
            record('reviewer', out);
        }
    } catch (e) {
        log('[error]', app.name, String(e.stack || e.message).slice(0, 2000));
        await snap(page, 'error').catch(() => {});
    } finally {
        await close();
    }
});
