// PR review check — pkp/pkp-lib#9906 on stable-3_5_0, the pkp-lib half (pkp/pkp-lib#13301) on OJS and OPS, which
// get it only as the pointer bumps pkp/ojs#5809 and pkp/ops#1395: the workflow "Metadata" form (now built through
// the overridable getMetadataForm()), a subjects/keywords save, and the author dashboard page that builds the same
// form. PKP's default test dataset, read-mostly (one publication's subjects and keywords rewritten).
//
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature r9906 --dataset --reset --apps ojs,ops
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=r9906 PROBE_AGENT=<base|head>-other node bin/probe.js all shared/playwright/checks/sync/pkp-lib-9906/other-apps.js
//
// Facts go to facts-other-<app>.json; no assertions.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, idle, shot, outDir} = require('../../../probe');

const CTX = {ojs: 'publicknowledge', ops: 'publicknowledge'};
// a submission, its editor and its author account (docs/process/dataset.md)
const PICK = {ojs: {sid: 2, editor: 'dbarnes', author: 'ccorino'}, ops: {sid: 1, editor: 'dbuskins', author: 'ccorino'}};

async function sessionApi(page, method, url, data) {
    return page.evaluate(async ({method, url, data}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''},
            body: data === undefined ? undefined : JSON.stringify(data),
            credentials: 'same-origin',
        });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 1500); }
        return {status: res.status, body};
    }, {method, url, data});
}

forEachApp(async (app) => {
    if (!PICK[app.name]) return;
    if (!app.dataset) throw new Error('other-apps.js runs on a dataset fleet only (fleet-prep --dataset)');
    const ctx = CTX[app.name];
    const {sid, editor, author} = PICK[app.name];
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const api = (p) => app.url(`/index.php/${ctx}/api/v1/${p}`);
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin', {contextPath: ctx});
        await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`));
        await idle(page);
        fact('context', await (async () => {
            const r = await sessionApi(page, 'PUT', api('contexts/1'), {subjects: 'enable', keywords: 'enable'});
            return {status: r.status, subjects: r.body?.subjects, keywords: r.body?.keywords, thema: r.body?.thema};
        })());
        await page.context().clearCookies();
        await signIn(page, editor, {contextPath: ctx});
        await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`));
        await idle(page);
        const pid = (await sessionApi(page, 'GET', api(`submissions/${sid}`))).body.currentPublicationId;
        const form = await sessionApi(page, 'GET', api(`submissions/${sid}/publications/${pid}/_components/metadata`));
        fact('metadata form', {status: form.status, fields: (form.body?.fields || []).map((f) => `${f.name}:${f.component}:allowCustom=${f.allowCustom}`),
            error: form.status >= 400 ? form.body : undefined});
        const put = await sessionApi(page, 'PUT', api(`submissions/${sid}/publications/${pid}`),
            {subjects: {en: [{name: 'Free subject'}, {name: 'Coded', source: 'thema', identifier: 'FJ'}, {name: 'Coded child', source: 'thema', identifier: 'FJH'}]}, keywords: {en: [{name: 'kw'}]}});
        fact('subjects save (free text, and Thema-shaped FJ+FJH)', {status: put.status, subjects: put.status === 200 ? put.body.subjects?.en : put.body});
        const vocab = await sessionApi(page, 'GET', api('vocabs?vocab=submissionSubject&term=Free&locale=en'));
        fact('subjects suggestions term=Free', {status: vocab.status, items: Array.isArray(vocab.body) ? vocab.body.map((e) => e.name) : vocab.body});

        await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').first();
        await dlg.getByRole('link', {name: 'Metadata', exact: true}).first().click({timeout: 30_000}).catch(() => {});
        await idle(page);
        await page.waitForTimeout(1500);
        const input = dlg.locator('input[id*="subjects"][id*="en"]').first();
        if (await input.isVisible().catch(() => false)) {
            await input.click();
            await input.pressSequentially('Typed here', {delay: 40});
            await page.waitForTimeout(2000);
            fact('workflow form: options for typed text', (await dlg.locator('.autosuggest__results-item').allInnerTexts().catch(() => [])).map((t) => t.trim()));
            await shot(page, `workflow-metadata-${app.name}`).catch(() => {});
        } else fact('workflow form', {notDone: 'no subjects input'});

        await page.context().clearCookies();
        await signIn(page, author, {contextPath: ctx});
        const res = await page.goto(app.url(`/index.php/${ctx}/authorDashboard/submission/${sid}`));
        await idle(page);
        const text = await page.locator('body').innerText().catch(() => '');
        fact('author dashboard page', {status: res?.status(), url: page.url().replace(app.url(''), ''), phpError: /Fatal error|TypeError|Stack trace/.test(text)});
    } finally {
        fs.writeFileSync(path.join(outDir(), `facts-other-${app.name}.json`), JSON.stringify(facts, null, 2));
        await close();
    }
});
