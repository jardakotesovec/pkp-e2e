// PR review of pkp/omp#2502 and pkp/ops#1443 (pkp/pkp-lib#13189; U42 A20, retired by them): on a
// press's book page and a preprint server's preprint page, an item with no references showed the
// heading "References" with nothing under it; with the fix it shows no "References" block, as an
// article page does. The walk came from A20's issue report (pkp-e2e#871).
// Takes the report's Steps on PKP's default test dataset (whose published items hold no
// references), signed out, and changes nothing:
//   OJS (the control): /index.php/publicknowledge/article/view/17
//   OMP:               /index.php/publicknowledge/catalog/book/5
//   OPS:               /index.php/publicknowledge/preprint/view/2
// NB=1 runs the neighbour check alone (OMP and OPS): dbarnes creates a new version of OMP 14 /
// OPS 3, adds one reference on its "References" page and publishes (posts) it; signed out, the
// page must show "References" with that reference, with the fix in and out. It changes the dataset.
// Run (reset the dataset fleet first for NB=1):
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/sync/omp-2502/walk.js
//   (NB=1 ... omp|ops for the neighbour)
// 2026-10-09, each side on a fresh load: OMP c07d91ced2 and OPS 6614af8281 show the empty heading
// (verdict emptyHeadingShown true); OMP c07d91ced2 with pkp/omp#2502 (52cf201a96) merged in and
// OPS dafd9b3263 show no block (false); NB=1 shows the heading and the reference on both sides.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle} = require('../../../probe');
const {readHeading} = require('./lib');

const EMPTY = {ojs: 'article/view/17', omp: 'catalog/book/5', ops: 'preprint/view/2'};
const NB_SUBMISSION = {omp: 14, ops: 3};
const NB_LANDING = {omp: 'catalog/book/14', ops: 'preprint/view/3'};
const REFERENCE = 'Ridge, A. (2021). Tide tables u42r9.';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const ctx = app.contextPath;
    const facts = {app: app.name, line: app.line || 'main'};
    const fact = (k, v) => { facts[k] = v; console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`); };

    if (process.env.NB) {
        if (!NB_SUBMISSION[app.name]) { console.log(`[nb ${app.name}] no neighbour on this app`); return; }
        const sid = NB_SUBMISSION[app.name];
        {
            const {page, close} = await launch(app);
            try {
                const {workflowFrame, createNewVersion, publishShownVersion} = require('../../issues/older-version-tab-current-title/lib');
                const {addReferences} = require('../../issues/reference-link-takes-closing-parenthesis/lib');
                await signIn(page, 'dbarnes');
                const frame = workflowFrame(page, app);
                await frame.gotoEditorial(sid);
                await idle(page);
                try { fact('nbNewVersion', await createNewVersion(page, app)); } catch (e) { fact('nbNewVersion', {threw: e.message.slice(0, 300)}); }
                try { fact('nbReference', await addReferences(page, app, frame, [REFERENCE])); } catch (e) { fact('nbReference', {threw: e.message.slice(0, 300)}); }
                try { fact('nbPublish', await publishShownVersion(page)); } catch (e) { fact('nbPublish', {threw: e.message.slice(0, 300)}); }
                await signOut(page);
            } finally {
                await close();
            }
        }
        const {page, close} = await launch(app);
        try {
            await page.goto(app.url(`/index.php/${ctx}/${NB_LANDING[app.name]}`));
            await idle(page);
            record('nb-landing', await screen(page));
            await shot(page, 'nb-landing');
            const read = await readHeading(page);
            fact('nbLanding', read);
            fact('nbVerdict', {headingShown: read.heading === 'References', referenceShown: read.paragraphs.some((p) => p.includes('Tide tables u42r9'))});
        } finally {
            await close();
        }
        record('a20-nb-facts', facts);
        return;
    }

    // Steps 1-2, signed out.
    const {page, close} = await launch(app);
    try {
        const path = `/index.php/${ctx}/${EMPTY[app.name]}`;
        const resp = await page.goto(app.url(path));
        await idle(page);
        record('step1-landing', await screen(page));
        await shot(page, 'step1-landing');
        const read = await readHeading(page);
        fact('step1', {status: resp && resp.status(), ...read});
        fact('verdict', {emptyHeadingShown: read.blocks > 0 && read.heading === 'References' && read.paragraphs.length === 0 && !read.valueText});
    } finally {
        await close();
    }
    record('a20-facts', facts);
});
