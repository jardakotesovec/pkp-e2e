// U40 claim check I23C (housekeeping 2026-10-23), the U40 incidental row:
// the preprint's "Title & Abstract" when the submission's section stores no
// word limit (null), OPS stable-3_5_0 against main, OJS 3.5 as a quick check.
//
// Runs on a dataset fleet (PKP's default test dataset):
//   bin/app-lock.sh shared ops -- env PROBE_FEATURE=issues-cc23a PKP_E2E_DATASET=6 \
//     PROBE_NOTES_FEATURE=U40 PROBE_AGENT=cc23a PROBE_RUN=r1 node bin/probe.js ops shared/playwright/checks/U40/I23C/u40.js
//   (3.5: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc23a-3_5, PROBE_RUN=s1)
// Steps per app:
//   A. read what the dataset's sections store (abstract_word_count) before anything changes;
//   B. dbarnes opens "Title & Abstract" of a dataset submission (the dataset's own section);
//   C. dbarnes: Settings › Sections › Edit the first section, empty "Word Count", Save; read the DB
//      and open the same Title & Abstract again;
//   D. admin creates a new context on Administration › Hosted Servers/Journals, the default
//      section the app makes is read from the DB; a submission is seeded there (scenario API,
//      submitter admin, the context's manager) and its "Title & Abstract" opened as admin.
// Every "Title & Abstract" open records the _components/titleAbstract answer and the server log.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, serverLog, tag, note} = require('../../../probe');

const T = 30000;
const RUN = process.env.PROBE_RUN || 'r0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim();

const CTX = {ojs: ['journals', 'journal_id'], omp: ['presses', 'press_id'], ops: ['servers', 'server_id']};
const WORD = {ojs: 'Journal', omp: 'Press', ops: 'Server'};

function sections(app, where = '') {
    const col = app.name === 'omp' ? null : CTX[app.name][1];
    if (!col) return [];
    where = where.replace('context_id', col);
    return sql(app, `select section_id, ${col}, coalesce(abstract_word_count::text,'NULL'), abstracts_not_required from sections ${where} order by 1`)
        .split('\n').filter(Boolean).map((l) => {
            const [id, ctx, wc, anr] = l.split('|');
            return {sectionId: +id, contextId: +ctx, abstractWordCount: wc, abstractsNotRequired: anr};
        });
}

async function openTitleAbstract(page, app, contextPath, submissionId, name) {
    const pubId = sql(app, `select current_publication_id from submissions where submission_id=${submissionId}`);
    const sectionId = sql(app, `select section_id from publications where publication_id=${pubId}`);
    const log = serverLog(app);
    const from = log.mark();
    const answers = [];
    const onResp = async (r) => {
        if (/_components\/titleAbstract/.test(r.url())) {
            let body = null;
            try { body = (await r.text()).slice(0, 700); } catch (e) { /* closed */ }
            answers.push({status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), body: r.status() >= 400 ? body : `(ok, ${body ? body.length : 0} chars)`});
        }
    };
    page.on('response', onResp);
    const url = `/index.php/${contextPath}/dashboard/editorial?workflowSubmissionId=${submissionId}&workflowMenuKey=publication_${pubId}_titleAbstract`;
    await page.goto(app.url(url));
    await idle(page).catch(() => {});
    // 3.5 ignores the menu key on landing (it opens the stage view): press the menu entry
    if (!answers.length) {
        const entry = page.getByRole('dialog').getByRole('link', {name: 'Title & Abstract', exact: true}).first();
        await entry.waitFor({timeout: 15000}).catch(() => {});
        if (await entry.count()) { await entry.click(); await idle(page).catch(() => {}); }
    }
    // the form renders after its own fetch: wait for the Save button or a failure
    await page.getByRole('dialog').getByRole('button', {name: 'Save', exact: true}).first().waitFor({timeout: 15000}).catch(() => {});
    await idle(page).catch(() => {});
    await sleep(800);
    const s = await screen(page);
    page.off('response', onResp);
    const dialogText = flat(s.text && s.text.dialog);
    const out = {
        submissionId, publicationId: +pubId, sectionId: +sectionId,
        sectionWordCount: sql(app, `select coalesce(abstract_word_count::text,'NULL') from sections where section_id=${sectionId}`),
        answers,
        saveButtons: await page.getByRole('dialog').getByRole('button', {name: 'Save', exact: true}).count(),
        abstractEditor: await page.locator('[id^="titleAbstract-abstract-control"]').count(),
        wordCountLine: await page.locator('.pkpFormField--richTextarea__wordLimit').allInnerTexts().catch(() => []),
        heading: (dialogText.match(/(Preprint|Publication): Title & Abstract/) || [null])[0],
        dialogTail: dialogText.slice(-500),
        serverLog: log.since(from).slice(0, 8).map((l) => l.slice(0, 400)),
    };
    record(`${name}`, {...out, screen: s});
    await shot(page, name);
    return out;
}

async function editSectionClearWordCount(page, app, contextPath, out) {
    await page.goto(app.url(`/index.php/${contextPath}/management/settings/context`));
    await idle(page);
    await page.getByRole('tab', {name: /^Sections$/}).first().click();
    await idle(page);
    const grid = page.locator('#sectionsGridContainer').first();
    await grid.waitFor({timeout: T});
    out.grid = flat(await grid.innerText()).slice(0, 400);
    record('u40-sections-grid', await screen(page));
    await grid.locator('tr.gridRow a.show_extras').first().click();
    await idle(page);
    await grid.getByRole('link', {name: 'Edit', exact: true}).first().click();
    const form = page.locator('form#sectionForm');
    await form.waitFor({timeout: T});
    await idle(page);
    const wc = form.locator('input[name="wordCount"]');
    await wc.waitFor({timeout: T});
    out.wordCountBefore = await wc.inputValue();
    out.wordCountLabel = flat(await form.locator('label[for^="wordCount"]').first().innerText().catch(() => null));
    out.formFields = await form.locator('input:not([type=hidden]), select, textarea').evaluateAll((els) =>
        els.filter((e) => e.getClientRects().length).map((e) => `${e.name || e.id}${e.type === 'checkbox' ? (e.checked ? ':X' : ':-') : '=' + String(e.value).slice(0, 30)}`));
    record('u40-section-form', await screen(page));
    await shot(page, 'u40-section-form');
    await wc.fill('');
    await wc.blur();
    const saved = page.waitForResponse((r) => /update-section/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await saved;
    out.saveStatus = resp ? resp.status() : null;
    out.saveBody = resp ? (await resp.text().catch(() => '')).slice(0, 300) : null;
    await form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    out.formClosed = !(await form.isVisible().catch(() => false));
    record('u40-section-saved', await screen(page));
    // reopen: what the form now shows
    await grid.locator('tr.gridRow a.show_extras').first().click().catch(() => {});
    await idle(page);
    const edit = grid.getByRole('link', {name: 'Edit', exact: true}).first();
    if (!(await edit.isVisible().catch(() => false))) {
        await grid.locator('tr.gridRow a.show_extras').first().click().catch(() => {});
        await idle(page);
    }
    await edit.click().catch(() => {});
    await form.locator('input[name="wordCount"]').waitFor({timeout: T}).catch(() => {});
    out.wordCountReopened = await form.locator('input[name="wordCount"]').inputValue().catch(() => null);
    record('u40-section-reopened', await screen(page));
}

async function createContextAsAdmin(page, app, path, out) {
    await page.goto(app.url('/index.php/index/en/admin/contexts'));
    await idle(page);
    const create = page.locator('#contextGridContainer .header a[id*="createContext"]').first();
    out.createLabel = flat(await create.innerText().catch(() => null));
    await create.click();
    await page.locator('[id^="context-name-control"]').first().waitFor({state: 'visible', timeout: T});
    await idle(page);
    await sleep(700);
    const cf = page.locator('form').filter({has: page.locator('[id^="context-name-control"]')}).last();
    const fill = async (id, v) => {
        const i = cf.locator(`[id="${id}"]`).first();
        if (await i.count()) { await i.fill(v); await i.blur().catch(() => {}); return true; }
        return false;
    };
    out.filled = {
        name: await fill('context-name-control-en', `Word limit ${path}`),
        acronym: await fill('context-acronym-control-en', path.slice(-6).toUpperCase()),
        contactName: await fill('context-contactName-control', 'Ada Admin'),
        contactEmail: await fill('context-contactEmail-control', `${path}@example.com`),
        path: await fill('context-urlPath-control', path),
    };
    const country = cf.locator('select[name="country"]').first();
    if (await country.count()) await country.selectOption({label: 'Iceland'}).catch(() => {});
    const en = cf.locator('input[name="supportedLocales"][value="en"]').first();
    if (await en.count() && !(await en.isChecked())) await en.click().catch(() => {});
    const pen = cf.locator('input[name="primaryLocale"][value="en"]').first();
    if (await pen.count()) await pen.click().catch(() => {});
    record('u40-create-context-form', await screen(page));
    const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await cf.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    out.createStatus = resp ? resp.status() : null;
    let body = null;
    if (resp) body = await resp.json().catch(() => null);
    out.contextId = body && body.id;
    if (!out.contextId) out.createBody = body;
    await page.waitForURL(/admin\/wizard/, {timeout: 20000}).catch(() => {});
    await idle(page).catch(() => {});
    out.afterCreateUrl = page.url().replace(/^https?:\/\/[^/]+/, '');
    if (!out.contextId) { const m = out.afterCreateUrl.match(/admin\/wizard\/(\d+)/); if (m) out.contextId = +m[1]; }
    record('u40-after-create', await screen(page));
}

forEachApp(async (app) => {
    const S = {app: app.name, line: app.line || 'main', run: RUN, errors: {}};
    const ctxPath = app.contextPath;
    S.datasetSectionsBefore = sections(app);
    const subId = app.name === 'ops' ? 1 : 3; // OPS preprint 1 (Production); OJS 3 (Copyediting), section 1
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        // B. the dataset's own section
        await signIn(page, 'dbarnes');
        try { S.taDataset = await openTitleAbstract(page, app, ctxPath, subId, `u40-ta-dataset`); } catch (e) { S.errors.B = String(e.stack || e).slice(0, 600); }
        // C. Edit Section, empty Word Count, Save (OPS; OJS keeps its dataset sections)
        if (app.name === 'ops') {
            S.sectionEdit = {};
            try {
                await editSectionClearWordCount(page, app, ctxPath, S.sectionEdit);
                S.sectionEdit.dbAfter = sections(app, 'where context_id=1');
                S.taAfterEdit = await openTitleAbstract(page, app, ctxPath, subId, `u40-ta-after-edit`);
            } catch (e) { S.errors.C = String(e.stack || e).slice(0, 600); }
        }
        await signOut(page);
        // D. a context made on the admin screen, its default section, a submission in it
        await signIn(page, 'admin');
        const path = tag('u40i23c');
        S.newContext = {path};
        try {
            await createContextAsAdmin(page, app, path, S.newContext);
            if (S.newContext.contextId) {
                S.newContext.sections = sections(app, `where context_id=${S.newContext.contextId}`);
                const sub = await app.api.createSubmission({tag: path, context: path, submitter: 'admin', title: `Word limit null ${path}`});
                S.newContext.submission = {id: sub && (sub.submissionId || sub.id), keys: sub ? Object.keys(sub).slice(0, 12) : null};
                const id = S.newContext.submission.id;
                if (id) S.taNewContext = await openTitleAbstract(page, app, path, id, `u40-ta-new-context`);
            }
        } catch (e) { S.errors.D = String(e.stack || e).slice(0, 800); }
        await signOut(page).catch(() => {});
    } finally {
        await close();
    }
    record('u40-summary', S);
    const brief = (t) => t && `${t.answers.map((a) => a.status).join(',') || 'no answer'} save=${t.saveButtons} section=${t.sectionWordCount}`;
    console.log(`[${app.name} ${S.line} ${RUN}] dataset sections ${JSON.stringify(S.datasetSectionsBefore)}; TA dataset ${brief(S.taDataset)}; section edit ${S.sectionEdit ? `${S.sectionEdit.wordCountBefore}→save ${S.sectionEdit.saveStatus} db ${JSON.stringify(S.sectionEdit.dbAfter)} reopened '${S.sectionEdit.wordCountReopened}'` : '-'}; TA after ${brief(S.taAfterEdit)}; new context ${S.newContext.createStatus} sections ${JSON.stringify(S.newContext.sections)} TA ${brief(S.taNewContext)}; errors ${JSON.stringify(S.errors)}`);
    if (S.taNewContext && S.taNewContext.answers.some((a) => a.status >= 500) && RUN.endsWith('1')) {
        note(`cc23a I23C: [${app.name} ${S.line}] Title & Abstract of a submission in a section storing a NULL word limit: the _components/titleAbstract GET answers ${S.taNewContext.answers.map((a) => a.status).join(',')}; a context created on Administration › Hosted contexts gets a default section whose abstract_word_count is ${JSON.stringify(S.newContext.sections && S.newContext.sections.map((x) => x.abstractWordCount))}; Settings › Sections "Edit" with an emptied Word Count stores ${JSON.stringify(S.sectionEdit && S.sectionEdit.dbAfter && S.sectionEdit.dbAfter.map((x) => x.abstractWordCount))}.`);
    }
});
