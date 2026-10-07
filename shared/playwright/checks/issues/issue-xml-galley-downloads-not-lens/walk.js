// Issue report docs/issues/U13-OJS15-issue-xml-galley-downloads-not-lens.md (U13 OJS15): with
// "eLife Lens Article Viewer" on, an issue's XML galley downloads instead of opening in the Lens
// reader. Takes the report's Steps through the screens on PKP's default test dataset (a dataset
// fleet, harness.md "Dataset fleets"). The kit builds nothing; OJS only (issue galleys and the Lens
// reader are a journal's).
//   steps 1–4  as `dbarnes`: Issues › "Back Issues" › "Vol. 1 No. 2 (2014)" › "Edit" › "Issue
//              Galleys" › "Create Issue Galley": issue.xml (beside this script) as "XML", then a
//              PDF as "PDF"
//   steps 5–6  signed out: the issue's page › "Full Issue" › "XML"
//   control    the same page › "PDF"
//   `neighbour` as the script's argument, on a fresh reset (the fix's reach; read with the fix in
//   and out):
//     N1  an issue galley that is neither XML nor PDF ("Text"): pressed signed out
//     N2  an article's XML galley (submission 1's version 1.1, published): its "XML"
//     N3  "eLife Lens Article Viewer" unticked: the issue's "XML"
//
// Reset first:  npm run fleet-prep -- --feature issues-re --dataset 6 --reset
// Run (main):   PROBE_FEATURE=issues-re PROBE_AGENT=re node bin/probe.js ojs shared/playwright/checks/issues/issue-xml-galley-downloads-not-lens/walk.js [neighbour]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-re-3_5 --dataset 6 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-re-3_5 PROBE_AGENT=re node bin/probe.js ojs shared/playwright/checks/issues/issue-xml-galley-downloads-not-lens/walk.js
// Facts: .reports/<feature>/re/ojs15-facts[-<run>]-ojs.json
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle} = require('../../../probe');
const L = require('./lib');

const NEIGHBOUR = process.argv[2] === 'neighbour';
const ISSUE = 'Vol. 1 No. 2 (2014)';
const ISSUE_ID = 1;
const SUBMISSION = 1;
const FILE = path.join(__dirname, 'issue.xml');
const LENS_ROW = 'lensgalleyplugin';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (app.name !== 'ojs') {
        console.log(`[ojs15] ${app.name}: no issue galleys and no Lens reader; skipped`);
        return;
    }
    const ctx = app.contextPath;
    const name = NEIGHBOUR ? 'ojs15-nb-facts' : 'ojs15-facts';
    const fact = (k, v) => { record(name, {[k]: v}, {merge: true}); console.log('[ojs15]', k, JSON.stringify(v).slice(0, 2500)); };
    fact('run', {line: app.line || 'main', mode: NEIGHBOUR ? 'neighbour' : 'steps', at: new Date().toISOString()});
    const issuePage = app.url(`/index.php/${ctx}/issue/view/${ISSUE_ID}`);

    /** Signed out: the issue's page, then the "Full Issue" link `label`; reads what it opens. */
    async function reader(label, key) {
        const {page, close} = await launch(app);
        const errors = L.watchErrors(page);
        try {
            await page.goto(issuePage);
            await idle(page);
            record(`${name}-${key}-issue-page`, await screen(page));
            const out = {issuePage: await L.readIssuePage(page)};
            out.press = await L.pressGalley(page, app, L.galleyLink(page, '.galleys a.obj_galley_link', label));
            if (out.press.listed && !out.press.download && !out.press.stayed) {
                if (await page.locator('#pdfCanvasContainer').count()) out.pdfReader = await L.readPdfReader(page);
                else out.lens = await L.readLensPage(page, errors);
            }
            await shot(page, `${name}-${key}`).catch(() => {});
            fact(key, out);
        } finally {
            await close();
        }
    }

    // Steps 1–4 (and the neighbour's setup): dbarnes adds the issue galleys.
    {
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'dbarnes', {contextPath: ctx});
            const win = await L.openIssueGalleys(page, app, 'Back Issues', ISSUE);
            fact('list-before', await require('../issue-galley-interface-language-refused/lib').galleyList(win));
            fact('add-xml', await L.addIssueGalley(page, win, {label: 'XML', file: FILE}));
            if (!NEIGHBOUR) fact('add-pdf', await L.addIssueGalley(page, win, {label: 'PDF', file: L.PDF('hkre-issue.pdf')}));
            else fact('add-text', await L.addIssueGalley(page, win, {label: 'Text', file: L.TXT('hkre-issue.txt')}));
            record(`${name}-issue-galleys`, await screen(page));
            await shot(page, `${name}-issue-galleys`).catch(() => {});
            if (NEIGHBOUR) {
                // N2's setup: an XML galley on submission 1's unpublished version 1.1, then publish it.
                const {addGalleyToLatestVersion} = require('../lens-formulas-not-typeset/lib');
                const {publishLatestVersion} = require('../older-version-pdf-reader-empty/lib');
                const galleys = await addGalleyToLatestVersion(page, app, SUBMISSION, {label: 'XML', component: 'Article Text', file: FILE, name: 'issue.xml'});
                const publish = await publishLatestVersion(page, app, SUBMISSION);
                fact('n2-setup', {galleys, publish: {button: publish.button, publish: publish.publish}});
            }
            await signOut(page);
        } finally {
            await close();
        }
    }

    if (!NEIGHBOUR) {
        // Steps 5–6, signed out: the issue's page › "Full Issue" › "XML".
        await reader('XML', 'step6-xml');
        // Control: the same page › "PDF".
        await reader('PDF', 'control-pdf');
        return;
    }

    // N1: the issue's "Text" galley.
    await reader('Text', 'n1-text');

    // N2: the article's "XML" galley.
    {
        const {page, close} = await launch(app);
        const errors = L.watchErrors(page);
        try {
            await page.goto(app.url(`/index.php/${ctx}/article/view/${SUBMISSION}`));
            await idle(page);
            const out = {articlePage: L.rel(page.url())};
            out.press = await L.pressGalley(page, app, L.galleyLink(page, 'a.obj_galley_link', 'XML'));
            if (out.press.listed && !out.press.download && !out.press.stayed) out.lens = await L.readLensPage(page, errors);
            await shot(page, `${name}-n2-article-xml`).catch(() => {});
            fact('n2-article-xml', out);
        } finally {
            await close();
        }
    }

    // N3: dbarnes unticks "eLife Lens Article Viewer"; signed out, the issue's "XML".
    {
        const P = require('../doaj-tool-stays-on-plugins-list-when-off/lib');
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'dbarnes', {contextPath: ctx});
            await P.openPlugins(app, page);
            const before = await P.rowState(app, page, LENS_ROW);
            const pressed = before.listed && before.ticked ? await P.setEnabled(app, page, LENS_ROW, false) : null;
            await P.openPlugins(app, page);
            fact('n3-plugin-off', {before, pressed, after: await P.rowState(app, page, LENS_ROW)});
            await signOut(page);
        } finally {
            await close();
        }
    }
    await reader('XML', 'n3-xml-plugin-off');
});
