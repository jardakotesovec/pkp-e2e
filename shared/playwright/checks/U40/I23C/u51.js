// U40 claim check I23C (housekeeping 2026-10-23), the U51 incidental row: on a journal in
// subscription mode, an article published with "Don't Assign To An Issue": is its galley
// refused signed out, and does any screen offer an access ("Open Access") choice for it?
// OJS main, dataset fleet; rvaca (Journal manager). Article 17 (published in Vol. 1 No. 2
// (2014), with a PDF galley) is unpublished and published again with "Don't Assign To An
// Issue". Reset the fleet before each run (the run publishes and changes the access mode).
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc23a PKP_E2E_DATASET=6 \
//     PROBE_NOTES_FEATURE=U40 PROBE_AGENT=cc23a PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U40/I23C/u51.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const T = 30000;
const SUB = 17;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim();

async function controls(page, scope) {
    return scope.evaluate((root) => {
        const vis = (e) => !!e.getClientRects().length;
        const lab = (e) => {
            const l = (e.labels && e.labels[0]) || e.closest('label');
            return (l ? l.innerText : e.getAttribute('aria-label') || e.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        };
        return {
            buttons: [...root.querySelectorAll('button')].filter(vis).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
            checkboxes: [...root.querySelectorAll('input[type=checkbox]')].filter(vis).map((e) => `${lab(e)}${e.checked ? ' [x]' : ' [ ]'}`),
            radios: [...root.querySelectorAll('input[type=radio]')].filter(vis).map((e) => `${e.name}: ${lab(e)}${e.checked ? ' (o)' : ''}`),
            selects: [...root.querySelectorAll('select')].filter(vis).map((e) => `${e.name}: ${[...e.options].map((o) => o.text.trim()).join(' / ').slice(0, 200)}`),
            mentionsAccess: /open access|access/i.test(root.innerText),
            accessLines: root.innerText.split('\n').filter((l) => /access/i.test(l)).map((l) => l.trim()).slice(0, 10),
        };
    });
}

async function setMode(page, app, pattern, S, key) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/distribution`));
    await idle(page);
    const tab = page.locator('[id="access-button"]');
    if (await tab.count()) { await tab.first().click(); await idle(page); await sleep(400); }
    const radios = page.locator('input[name="publishingMode"]');
    await radios.first().waitFor({state: 'attached', timeout: T});
    const labels = await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
    record(`u51-access-tab-${key}`, await screen(page));
    const i = labels.findIndex((r) => pattern.test(r.label));
    await radios.nth(i).check({force: true});
    const form = page.locator('form').filter({has: page.locator('input[name="publishingMode"]')}).first();
    const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    await idle(page);
    S[key] = {radios: labels, picked: labels[i] && labels[i].label, saveStatus: resp && resp.status(),
        db: sql(app, "select setting_value from journal_settings where journal_id=1 and setting_name='publishingMode'")};
}

async function publicationMenu(page) {
    return page.getByRole('dialog').evaluate((d) => {
        const out = [];
        for (const a of d.querySelectorAll('a, button')) {
            const t = a.innerText.replace(/\s+/g, ' ').trim();
            if (t && a.getClientRects().length) out.push(t);
        }
        return out;
    }).catch(() => []);
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const S = {run: RUN, errors: {}};
    const pubId = +sql(app, `select current_publication_id from submissions where submission_id=${SUB}`);
    S.before = sql(app, `select status, coalesce(issue_id::text,'NULL'), access_status from publications where publication_id=${pubId}`);
    S.galley = sql(app, `select galley_id, submission_file_id, label from publication_galleys where publication_id=${pubId}`);
    const galleyId = +S.galley.split('|')[0];
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        await signIn(page, 'rvaca');
        await setMode(page, app, /subscription/i, S, 'modeSubscription');
        // unpublish, then publish with "Don't Assign To An Issue"
        const {PublicationScreen} = require(`${process.env.PKP_SUITE_DIR}/pages/PublicationMetadataPages.js`);
        const pub = new PublicationScreen(page, app.contextPath);
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${SUB}&workflowMenuKey=publication_${pubId}_titleAbstract`));
        await idle(page);
        try {
            await pub.unpublish();
            S.unpublished = sql(app, `select status, coalesce(issue_id::text,'NULL') from publications where publication_id=${pubId}`);
            const panel = await pub.openPublishPanel();
            S.publishPanel = {controls: await controls(page, panel), text: flat(await panel.innerText()).slice(0, 900)};
            record('u51-publish-panel', await screen(page));
            await shot(page, 'u51-publish-panel');
            if (await panel.locator('select[name="versionStage"]').count()) await pub.fillVersionDetails(panel).catch(() => {});
            await panel.getByRole('radio', {name: "Don't Assign To An Issue"}).check();
            await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
            const done = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
            const r = await done;
            S.publishStatus = r && r.status();
            await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({timeout: T}).catch(() => {});
            await idle(page);
            S.after = sql(app, `select status, coalesce(issue_id::text,'NULL'), access_status from publications where publication_id=${pubId}`);
        } catch (e) { S.errors.publish = String(e.stack || e).slice(0, 600); record('u51-publish-failed', await screen(page)); }
        // every Publication page of the published version
        S.pages = {};
        const menu = await publicationMenu(page);
        S.menu = menu;
        const keys = ['titleAbstract', 'contributors', 'metadata', 'references', 'identifiers', 'galleys', 'license', 'issue', 'jats', 'bodyText', 'funding', 'media'];
        for (const k of keys) {
            await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${SUB}&workflowMenuKey=publication_${pubId}_${k}`));
            await idle(page);
            await sleep(1500);
            await idle(page);
            const s = await screen(page);
            record(`u51-pub-${k}`, s);
            const dlg = page.getByRole('dialog').last();
            S.pages[k] = {heading: (flat(s.text.dialog).match(/Publication: [^\n]*?(?= Status| Unpublish| Current|$)/) || [null])[0], controls: await controls(page, dlg).catch((e) => String(e.message).slice(0, 100))};
        }
        await shot(page, 'u51-pub-issue');
        // issue tables of contents
        S.issues = sql(app, 'select issue_id, published from issues order by 1');
        S.toc = {};
        for (const line of S.issues.split('\n')) {
            const [iid] = line.split('|');
            await page.goto(app.url(`/index.php/${app.contextPath}/en/manageIssues`));
            await idle(page);
            const s0 = await screen(page);
            record(`u51-manage-issues`, s0);
            // open the issue's edit window through its grid link
            const res = await page.goto(app.url(`/index.php/${app.contextPath}/$$$call$$$/grid/toc/toc-grid/fetch-grid?issueId=${iid}`)).catch(() => null);
            const body = res ? await res.text().catch(() => '') : '';
            S.toc[iid] = {status: res && res.status(), listsArticle17: /Antimicrobial/.test(body), openAccessBoxes: (body.match(/accessStatus|Open Access/gi) || []).length, html: body.slice(0, 200)};
        }
        await signOut(page);
        // signed out: the article page and its galley
        const view = await page.goto(app.url(`/index.php/${app.contextPath}/en/article/view/${SUB}`));
        await idle(page);
        S.signedOut = {viewStatus: view && view.status()};
        record('u51-article-signed-out', await screen(page));
        await shot(page, 'u51-article-signed-out');
        const link = page.locator('a.obj_galley_link').first();
        S.signedOut.galleyLink = {count: await link.count(), cls: await link.getAttribute('class').catch(() => null), text: flat(await link.innerText().catch(() => null))};
        if (S.signedOut.galleyLink.count) {
            await link.click();
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            await idle(page).catch(() => {});
            S.signedOut.afterGalley = page.url().replace(/^https?:\/\/[^/]+/, '');
            record('u51-galley-signed-out', await screen(page));
        }
        const dl = await page.request.get(app.url(`/index.php/${app.contextPath}/en/article/download/${SUB}/${galleyId}`), {maxRedirects: 0}).catch(() => null);
        S.signedOut.download = dl && {status: dl.status(), location: dl.headers().location, type: dl.headers()['content-type']};
        // control: the same article with the journal back on open access
        await signIn(page, 'rvaca');
        await setMode(page, app, /open access/i, S, 'modeOpen');
        await signOut(page);
        await page.goto(app.url(`/index.php/${app.contextPath}/en/article/view/${SUB}`));
        await idle(page);
        record('u51-article-signed-out-open', await screen(page));
        const dl2 = await page.request.get(app.url(`/index.php/${app.contextPath}/en/article/download/${SUB}/${galleyId}`), {maxRedirects: 0}).catch(() => null);
        S.signedOutOpen = {galleyClass: await page.locator('a.obj_galley_link').first().getAttribute('class').catch(() => null), download: dl2 && {status: dl2.status(), location: dl2.headers().location, type: dl2.headers()['content-type']}};
    } finally {
        await close();
    }
    record('u51-summary', S);
    console.log(JSON.stringify({run: RUN, before: S.before, mode: S.modeSubscription && S.modeSubscription.db, after: S.after, publish: S.publishStatus, signedOut: S.signedOut, open: S.signedOutOpen, errors: S.errors}, null, 1));
    for (const [k, v] of Object.entries(S.pages || {})) console.log(k, JSON.stringify(v).slice(0, 600));
    console.log('toc', JSON.stringify(S.toc));
});
