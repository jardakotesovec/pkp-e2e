// Kept verification probe for pkp/pkp-lib#13325 (PR #13326, lib/pkp 3964db27b5: `TitleAbstractForm` gives the
// Abstract and Plain Language Summary editors the toolbar `bold italic superscript subscript | link | bullist numlist`
// with the `link` and `lists` plugins). Run:
//   PROBE_FEATURE=sync PROBE_AGENT=s15-13325 node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13325/abstract-lists.js
// One process per app on a scratch context (manager, author; Plain Language Summary switched on through the
// context API at "request"; one submitted, unpublished submission):
//   seed      the context, the setting and the submission                                          (seed)
//   m1        manager: workflow › Publication › Title & Abstract; every editor's toolbar buttons    (m1-toolbars)
//   m2        manager: a bullet list typed into the Abstract, Save, the PUT's status                (m2-*)
//   m3        manager: the form re-opened after a reload; the publication read back through the API (m3-*)
// No assertions: the session judges. Expected: the Abstract and Plain Language Summary toolbars list Bold, Italic,
// Superscript, Subscript, Insert/edit link, Bullet list, Numbered list (the Title keeps its "Formatting" menu);
// the saved abstract carries `<ul><li>…</li></ul>` in the editor after the reload and in the API body.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag} =
    require('../../../probe');
const log = (...a) => console.log('[13325]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;

async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

async function sessionApi(page, method, path, data) {
    return page.evaluate(async ({method, path, data}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const res = await fetch(path, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''},
            body: data === undefined ? undefined : JSON.stringify(data),
            credentials: 'same-origin',
        });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 500); }
        return {status: res.status, body};
    }, {method, path, data});
}

const wf = (page) => page.locator('[role="dialog"]:visible').first();
const saveButton = (page) => wf(page).getByRole('button', {name: 'Save', exact: true});

async function editorIds(page) {
    return page.evaluate(() => [...document.querySelectorAll('iframe[id^="titleAbstract-"]')].map((f) => f.id.replace(/_ifr$/, '')));
}

async function editorReady(page, id) {
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
}

async function formReady(page) {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
        if (await saveButton(page).count()) break;
        await sleep(250);
    }
    await idle(page);
    for (const id of await editorIds(page)) await editorReady(page, id);
}

/** Per editor on the form: the field key, the toolbar/plugins the editor was configured with, the visible toolbar
 *  buttons' accessible names, and whether the toolbar is a "Formatting" menu (the one-line editors). */
async function readToolbars(page) {
    return page.evaluate(() => {
        const out = [];
        for (const f of document.querySelectorAll('iframe[id^="titleAbstract-"]')) {
            const id = f.id.replace(/_ifr$/, '');
            const ed = window.tinymce && window.tinymce.get(id);
            const box = f.closest('.tox-tinymce');
            const buttons = box ? [...box.querySelectorAll('.tox-toolbar__group button, .tox-toolbar-overlord button')]
                .map((b) => b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent.trim()) : [];
            let toolbar = null;
            let plugins = null;
            try { toolbar = ed.options.get('toolbar'); } catch (e) { toolbar = ed && ed.settings ? ed.settings.toolbar : null; }
            try { plugins = ed.options.get('plugins'); } catch (e) { plugins = ed && ed.settings ? ed.settings.plugins : null; }
            out.push({field: id.replace(/^titleAbstract-/, '').replace(/-control.*$/, ''), id, toolbar, plugins, buttons});
        }
        return out;
    });
}

async function gotoWorkflow(page, app, ctx, id) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}`));
    await idle(page);
    await wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production)$/}).first()
        .waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
}

async function openTitleAbstract(page) {
    const dialog = wf(page);
    let entry = dialog.getByRole('link', {name: 'Title & Abstract', exact: true});
    if (!(await entry.first().isVisible().catch(() => false))) {
        const group = dialog.getByRole('link', {name: /^(Publication|Preprint)$/, exact: true}).first();
        if (await group.count()) await group.click();
        await idle(page);
    }
    await entry.first().click();
    await dialog.getByRole('heading', {name: /^(Publication|Preprint): Title & Abstract$/i}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    await formReady(page);
}

forEachApp(async (app) => {
    const T_ = tag('l13325');
    const manager = `${T_}mgr`;
    const author = `${T_}au`;
    const ctxRes = await app.api.createContext({tag: T_, users: [
        {username: manager, roles: ['manager']},
        {username: author, roles: ['author']},
    ]});
    const ctxId = ctxRes.contextId ?? ctxRes.id;
    const sub = await app.api.createSubmission({tag: T_, context: T_, submitter: author, submitted: true,
        title: `Lists ${T_}`, abstract: `Seeded abstract for ${T_}.`});
    record('seed', {app: app.name, context: ctxRes, submission: sub});
    log(app.name, 'seeded context', ctxId, 'submission', sub.submissionId);

    const {page, close} = await launch(app);
    try {
        await signIn(page, manager, {contextPath: T_});
        await page.goto(app.url(`/index.php/${T_}/dashboard/editorial`));
        await idle(page);
        // Plain Language Summary "request" so its editor is on the form without blocking the save (U40 A1 is the "require" case).
        const put = await sessionApi(page, 'PUT', app.url(`/index.php/${T_}/api/v1/contexts/${ctxId}`), {plainLanguageSummary: 'request'});
        record('seed-pls-setting', {status: put.status, plainLanguageSummary: put.body?.plainLanguageSummary ?? put.body});
        log(app.name, 'PLS setting PUT', put.status);

        // m1: the toolbars.
        await gotoWorkflow(page, app, T_, sub.submissionId);
        await openTitleAbstract(page);
        const toolbars = await readToolbars(page);
        await snap(page, 'm1-toolbars', {toolbars});
        log(app.name, 'toolbars', JSON.stringify(toolbars.map((t) => ({field: t.field, toolbar: t.toolbar, buttons: t.buttons}))));

        // m2: a bullet list in the Abstract, then Save.
        const abstractId = (await editorIds(page)).find((i) => /^titleAbstract-abstract-control/.test(i));
        const before = await page.evaluate((i) => window.tinymce.get(i).getContent(), abstractId).catch(() => null);
        const body = page.frameLocator(`#${abstractId}_ifr`).locator('body');
        await body.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        const box = page.locator(`#${abstractId}_ifr`).locator('xpath=ancestor::div[contains(@class,"tox-tinymce")]');
        const bullet = box.locator('button[aria-label="Bullet list"]');
        const bulletCount = await bullet.count();
        if (bulletCount) await bullet.first().click();
        await page.keyboard.type('First item');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Second item');
        await sleep(300);
        const typed = await page.evaluate((i) => window.tinymce.get(i).getContent(), abstractId).catch(() => null);
        record('m2-typed', {abstractId, bulletButtonFound: bulletCount, before, typed});
        log(app.name, 'typed', typed);
        const saved = page.waitForResponse((r) => r.request().method() !== 'GET' && /\/publications\/\d+$/.test(r.url()), {timeout: T}).catch(() => null);
        await saveButton(page).click();
        const res = await saved;
        let resBody = null;
        try { resBody = res ? await res.json() : null; } catch (e) { resBody = null; }
        await idle(page);
        await snap(page, 'm2-saved', {putStatus: res ? res.status() : null, abstractFromResponse: resBody?.abstract ?? null});
        log(app.name, 'save PUT', res ? res.status() : 'no response');

        // m3: reload, re-open, read back; the API body.
        await gotoWorkflow(page, app, T_, sub.submissionId);
        await openTitleAbstract(page);
        const abstractId2 = (await editorIds(page)).find((i) => /^titleAbstract-abstract-control/.test(i));
        const after = await page.evaluate((i) => window.tinymce.get(i).getContent(), abstractId2).catch(() => null);
        const api = await sessionApi(page, 'GET', app.url(`/index.php/${T_}/api/v1/submissions/${sub.submissionId}/publications/${sub.publicationId}`));
        await snap(page, 'm3-reloaded', {after, apiStatus: api.status, apiAbstract: api.body?.abstract ?? null, apiPls: api.body?.plainLanguageSummary ?? null});
        log(app.name, 'after reload', after, '| api', JSON.stringify(api.body?.abstract));
    } finally {
        await close();
    }
});
