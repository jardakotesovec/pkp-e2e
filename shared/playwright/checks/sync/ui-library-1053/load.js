// PR review pkp/pkp-lib#13767, round 5 (ui-library#1053 d20333a447): the editor's new load guard
// (loadDocument() checks the stored JSON against the configured schema; "Save", "Export to HTML" and
// "Preview: PDF" stay disabled and "Unable to load the document." shows when the check fails).
// A fresh tagged submission in Production per scenario, as manager.maya; never a reset.
//   L1 a version with no Body Text stored yet: the page opens, typing and "Save" work, the text comes back on reload
//   L2 a stored document the editor accepts (one paragraph): loads, no error line
//   L3 a stored document with a node type the schema does not know: the error line, "Save" disabled, Export's items disabled
//   L4 a stored body text that is not JSON: as L3
//   L5 an empty stored doc ({type: 'doc', content: []}, the server's default shape, PUT as a file)
// Run: PROBE_FEATURE=pr-13767 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs shared/playwright/checks/sync/ui-library-1053/load.js
const path = require('path');
const {forEachApp, launch, signIn, record, sql, outDir, tag} = require('../../../probe');

const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const side = process.env.PROBE_RUN || 'run';
    const fact = (k, v) => { record(`${side}-${k.split(' ')[0]}`, v); console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 2400)}`); };
    const shot = (name) => path.join(outDir(), `${side}-${name}.png`);
    const t = tag('r5l');

    const seed = async (n) => {
        const s = await app.api.createSubmission({tag: `${t}${n}`, context: app.contextPath, submitter: 'author.alex', title: `Load ${n} ${t}`,
            citationsRaw: ['Alpha, A. (2020). First reference.'], files: [{file: 'article.docx'}], decisions: ['sendExternalReview', 'accept', 'sendToProduction']});
        const publicationId = Number(String(sql(app, `select current_publication_id from submissions where submission_id = ${s.submissionId}`)).trim());
        return {sub: s.submissionId, publicationId};
    };

    const {page, close} = await launch(app);
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(flat(m.text(), 300)); });
    try {
        await signIn(page, 'manager.maya');
        const frame = new WorkflowPage(page, app.contextPath);
        const body = new BodyTextPage(page, frame);
        const state = async () => {
            await page.waitForTimeout(2500);
            const alert = body.root().locator('p[role="alert"]');
            const exportBtn = page.getByRole('button', {name: 'Export', exact: true});
            let items = null;
            if (await exportBtn.isVisible().catch(() => false)) {
                await exportBtn.click();
                items = await page.getByRole('menuitem').evaluateAll((ms) => ms.map((m) => ({text: m.textContent.trim(), disabled: m.disabled || m.getAttribute('aria-disabled') === 'true'})));
                await page.keyboard.press('Escape');
            }
            return {
                alert: (await alert.isVisible().catch(() => false)) ? flat(await alert.innerText()) : null,
                saveDisabled: await body.saveButton().isDisabled().catch(() => null),
                exportItems: items,
                text: await body.editor().innerText({timeout: 2000}).then((x) => flat(x)).catch(() => null),
            };
        };
        const putRaw = (api, serialized) => page.evaluate(async ({url, serialized}) => {
            const fd = new FormData();
            fd.append('bodyText', serialized);
            const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
            return r.status;
        }, {url: api, serialized});
        const apiOf = ({sub, publicationId}) => app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${publicationId}/bodyText`);
        const getRaw = (api) => page.evaluate(async (url) => { const r = await fetch(url); return {status: r.status, body: await r.text()}; }, api);

        // L1
        const s1 = await seed(1);
        const g1 = await getRaw(apiOf(s1));
        fact('L1 GET before', {status: g1.status, body: flat(g1.body, 300)});
        await body.open(s1.sub, s1.publicationId);
        fact('L1 state on open', await state());
        await page.screenshot({path: shot('L1-open')});
        await body.typeAtEnd('Fresh text L1.');
        fact('L1 save', (await body.save()).status());
        await body.reload();
        fact('L1 state after reload', await state());

        // L2..L5: stored content PUT, then the page opened
        const stored = {
            L2: JSON.stringify({type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Stored L2.'}]}]}),
            L3: JSON.stringify({type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Before.'}]}, {type: 'mysteryBlock', content: [{type: 'text', text: 'Unknown.'}]}]}),
            L4: 'this is not json',
            L5: JSON.stringify({type: 'doc', content: []}),
        };
        for (const [k, serialized] of Object.entries(stored)) {
            const s = await seed(k);
            fact(`${k} PUT`, await putRaw(apiOf(s), serialized));
            const g = await getRaw(apiOf(s));
            fact(`${k} GET`, {status: g.status, body: flat(g.body, 300)});
            const fetched = body.loaded();
            await frame.gotoEditorial(s.sub, {menuKey: `publication_${s.publicationId}_bodyText`});
            await fetched;
            await frame.expectPageHeading('Body Text');
            fact(`${k} state`, {...(await state()), editorVisible: await body.editor().isVisible().catch(() => null),
                saveVisible: await body.saveButton().isVisible().catch(() => null)});
            await page.screenshot({path: shot(`${k}-open`)});
        }
        fact('console errors', consoleErrors);
    } finally {
        await close();
    }
});
