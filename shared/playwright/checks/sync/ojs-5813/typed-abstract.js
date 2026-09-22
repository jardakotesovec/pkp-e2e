// Companion to default-jats.js for pkp/ojs#5813: the literal-tag abstract typed through the real editor, not seeded.
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ojs-5813/typed-abstract.js
// One process on OJS, a scratch journal (manager, author) and one submitted submission:
//   t1  manager: workflow › Publication › Title & Abstract; the Abstract's text replaced by keyboard with the sentence
//       that names tags as text; the editor's own serialization read (getContent) before Save            (t1-typed)
//   t2  Save; the PUT's status and abstract; the publication read back through the API                   (t2-saved)
//   t3  GET …/publications/{pid}/jats: the <abstract> of the default JATS                                 (t3-jats)
// No assertions: the session judges. Marker for the finding: `<italic>species names</italic>` in the JATS abstract
// while the stored abstract reads `&lt;i&gt;species names&lt;/i&gt;`.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag} = require('../../../probe');
const log = (...a) => console.log('[5813t]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;
const SENTENCE = 'Write <i>species names</i> in italics and H<sub>2</sub>O with a subscript; a <br> tag breaks the line and <p>text</p> is a paragraph.';

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
        try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 4000); }
        return {status: res.status, body};
    }, {method, path, data});
}

const wf = (page) => page.locator('[role="dialog"]:visible').first();
const saveButton = (page) => wf(page).getByRole('button', {name: 'Save', exact: true});

async function editorIds(page) {
    return page.evaluate(() => [...document.querySelectorAll('iframe[id^="titleAbstract-"]')].map((f) => f.id.replace(/_ifr$/, '')));
}

async function formReady(page) {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
        if (await saveButton(page).count()) break;
        await sleep(250);
    }
    await idle(page);
    for (const id of await editorIds(page)) {
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
    }
}

async function gotoWorkflow(page, app, ctx, id) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}`));
    await idle(page);
    await wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Submission|Production)$/}).first()
        .waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
}

async function openTitleAbstract(page) {
    const dialog = wf(page);
    const entry = dialog.getByRole('link', {name: 'Title & Abstract', exact: true});
    if (!(await entry.first().isVisible().catch(() => false))) {
        const group = dialog.getByRole('link', {name: 'Publication', exact: true}).first();
        if (await group.count()) await group.click();
        await idle(page);
    }
    await entry.first().click();
    await dialog.getByRole('heading', {name: /^Publication: Title & Abstract$/i}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    await formReady(page);
}

forEachApp(async (app) => {
    const T_ = tag('t5813');
    const manager = `${T_}mgr`;
    const author = `${T_}au`;
    const ctxRes = await app.api.createContext({tag: T_, users: [
        {username: manager, roles: ['manager']},
        {username: author, roles: ['author']},
    ]});
    const sub = await app.api.createSubmission({tag: T_, context: T_, submitter: author, submitted: true,
        title: `Typed ${T_}`, abstract: `Seeded abstract for ${T_}.`});
    record('seed', {app: app.name, context: ctxRes, submission: sub});
    log('seeded', T_, 'submission', sub.submissionId);

    const {page, close} = await launch(app);
    try {
        await signIn(page, manager, {contextPath: T_});
        await gotoWorkflow(page, app, T_, sub.submissionId);
        await openTitleAbstract(page);

        // t1: replace the abstract by keyboard with the literal sentence.
        const abstractId = (await editorIds(page)).find((i) => /^titleAbstract-abstract-control/.test(i));
        const body = page.frameLocator(`#${abstractId}_ifr`).locator('body');
        await body.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.type(SENTENCE, {delay: 5});
        await sleep(300);
        const typed = await page.evaluate((i) => window.tinymce.get(i).getContent(), abstractId).catch(() => null);
        const visible = await body.innerText().catch(() => null);
        await snap(page, 't1-typed', {abstractId, typedSentence: SENTENCE, editorContent: typed, editorVisibleText: visible});
        log('editor getContent:', typed);
        log('editor visible text:', visible);

        // t2: Save, then the API's copy.
        const saved = page.waitForResponse((r) => r.request().method() !== 'GET' && /\/publications\/\d+$/.test(r.url()), {timeout: T}).catch(() => null);
        await saveButton(page).click();
        const res = await saved;
        let resBody = null;
        try { resBody = res ? await res.json() : null; } catch (e) { resBody = null; }
        await idle(page);
        const api = await sessionApi(page, 'GET', app.url(`/index.php/${T_}/api/v1/submissions/${sub.submissionId}/publications/${sub.publicationId}`));
        await snap(page, 't2-saved', {putStatus: res ? res.status() : null, abstractFromResponse: resBody?.abstract ?? null,
            apiStatus: api.status, apiAbstract: api.body?.abstract ?? null});
        log('save PUT', res ? res.status() : 'no response', '| stored abstract:', JSON.stringify(api.body?.abstract ?? null));

        // t3: the default JATS.
        const jats = await sessionApi(page, 'GET', app.url(`/index.php/${T_}/api/v1/submissions/${sub.submissionId}/publications/${sub.publicationId}/jats`));
        const content = jats.body?.jatsContent ?? (typeof jats.body === 'string' ? jats.body : null);
        const m = content ? content.match(/<abstract[^>]*>[\s\S]*?<\/abstract>/) : null;
        record('t3-jats', {status: jats.status, abstractElement: m ? m[0] : null, contentLength: content ? content.length : null});
        log('jats', jats.status, '| abstract element:', m ? m[0].replace(/\s+/g, ' ') : '(none)');
    } finally {
        await close();
    }
});
