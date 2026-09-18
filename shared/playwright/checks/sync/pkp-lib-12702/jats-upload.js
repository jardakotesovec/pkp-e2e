// Kept from the 2026-09-18 sync (regression read rr11 of pkp/pkp-lib#12702, PR #13054): the issue's own case through the
// screens on OJS. An assigned Section editor, then `admin` holding an Author role, then the Journal Manager upload a JATS
// file under Publication > JATS XML (each POST …/jats 200 since the change, 401 before for the first two). The public
// box and "Delete" were driven by rr11 on 2026-09-18 and are not kept here. No assertions: the script records calls[] and steps{} in check-jats-<app>.json.
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-12702/jats-upload.js
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, note, idle, tag} =
    require('../../../probe');

const XML = path.join(__dirname, 'sample-jats.xml');

forEachApp(async (app) => {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const t = tag('rr11j');
    const mgr = `${t}mgr`, se = `${t}se`, au = `${t}au`;
    const out = {tag: t, calls: [], steps: {}};

    let adminSeeded = true;
    try {
        await app.api.createContext({tag: t, users: [
            {username: mgr, roles: ['manager']},
            {username: se, roles: ['sectionEditor']},
            {username: au, roles: ['author']},
            {username: 'admin', roles: ['author']},
        ]});
    } catch (e) {
        adminSeeded = false;
        out.adminSeedError = String(e.message).slice(0, 600);
        const t2 = `${t}b`;
        out.tag = t2;
        await app.api.createContext({tag: t2, users: [
            {username: mgr, roles: ['manager']},
            {username: se, roles: ['sectionEditor']},
            {username: au, roles: ['author']},
        ]});
    }
    const ctx = out.tag;
    out.adminSeeded = adminSeeded;
    const sub = await app.api.createSubmission({
        tag: `${t}s1`, context: ctx, submitter: au,
        decisions: ['skipExternalReview', 'sendToProduction'],
        participants: [{username: se, role: 'sectionEditor'}],
    }).catch(async (e) => {
        out.subSeedError = String(e.message).slice(0, 600);
        return app.api.createSubmission({
            tag: `${t}s1`, context: ctx, submitter: au,
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
            participants: [{username: se, role: 'sectionEditor'}],
        });
    });
    out.submission = sub;
    const submissionId = sub.id || sub.submissionId || (sub.submission && sub.submission.id);

    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept());
    page.on('response', async (res) => {
        const url = res.url();
        if (!/\/(jats|bodyText|mediaFiles)(\/|\?|$)/.test(url)) return;
        let body = null;
        if (res.status() >= 400) {
            try { body = (await res.text()).slice(0, 400); } catch (e) { body = null; }
        }
        out.calls.push({who: out.who, method: res.request().method(), url: url.replace(app.baseURL, ''), status: res.status(), body});
    });

    async function openJats(user) {
        out.who = user;
        await signIn(page, user, {contextPath: ctx});
        const workflow = new WorkflowPage(page, ctx);
        await workflow.gotoEditorial(submissionId);
        await workflow.selectPage('JATS XML');
        await idle(page);
        await page.locator('.jatsPanel .filePanel__ready').waitFor({state: 'visible', timeout: 30000});
        return workflow;
    }
    async function buttons() {
        return page.locator('.jatsPanel .filePanel__header button').allInnerTexts();
    }
    async function upload(name) {
        const before = await buttons();
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', {timeout: 15000}),
            page.locator('.jatsPanel').getByRole('button', {name: 'Upload', exact: true}).click(),
        ]);
        const resp = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000}).catch(() => null);
        await chooser.setFiles(XML);
        const r = await resp;
        await idle(page);
        await page.waitForTimeout(1000);
        const s = await screen(page);
        await shot(page, `${name}-after-upload`);
        return {
            before, after: await buttons(), postStatus: r ? r.status() : null,
            showsMarker: /rr11 uploaded JATS marker/.test(s.text.dialog || ''),
            footer: await page.locator('.jatsPanel .filePanel__fileContentFooter, .jatsPanel .filePanel__defaultContentFooter').allInnerTexts(),
        };
    }
    async function del(name) {
        await page.locator('.jatsPanel').getByRole('button', {name: 'Delete', exact: true}).click();
        const dlg = page.getByRole('dialog').filter({hasText: /delete/i}).last();
        await dlg.waitFor({state: 'visible', timeout: 10000});
        out.steps[`${name}-delete-dialog`] = (await dlg.innerText()).slice(0, 400);
        const labels = await dlg.getByRole('button').allInnerTexts();
        const resp = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() === 'DELETE', {timeout: 30000}).catch(() => null);
        const yes = labels.find((l) => /^(yes|ok|delete)/i.test(l.trim()));
        await dlg.getByRole('button', {name: yes.trim(), exact: true}).click();
        const r = await resp;
        await idle(page);
        await page.waitForTimeout(1000);
        await shot(page, `${name}-after-delete`);
        return {
            labels, deleteStatus: r ? r.status() : null, after: await buttons(),
            footer: await page.locator('.jatsPanel .filePanel__fileContentFooter, .jatsPanel .filePanel__defaultContentFooter').allInnerTexts(),
        };
    }

    try {
        // S1a: the assigned section editor
        await openJats(se);
        out.steps.s1a = await upload('s1a-se');
        await signOut(page);

        // S1b: the site administrator who also holds Author here
        await openJats('admin');
        out.steps.s1b = await upload('s1b-admin');
        await signOut(page);

        // S2: the journal manager's upload, the control
        await openJats(mgr);
        out.steps.s2upload = await upload('s2-mgr');
        await signOut(page);
    } catch (e) {
        out.error = String(e.stack || e).slice(0, 1500);
        await shot(page, 'error-jats').catch(() => {});
        try { out.errorScreen = (await screen(page)).text; } catch (e2) { /* ignore */ }
    } finally {
        record('check-jats', out);
        await close();
    }
});
