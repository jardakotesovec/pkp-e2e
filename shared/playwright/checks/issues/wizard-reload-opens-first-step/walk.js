// U21 A24 issue walk: reloading the submission wizard opens the first step with the later steps locked,
// and "Save for Later" pressed there records the first step.
// Steps (docs/issues/U21-A24-wizard-reload-opens-first-step.md), on the default dataset:
//   ccorino (OMP aclark): Make a Submission "u21n16d reload", Begin Submission; Continue twice (Contributors);
//   Save for Later; My Submissions, "Complete submission" (control: Contributors); reload; Save for Later;
//   My Submissions, "Complete submission".
// AFTER=bookmark (the fix trial): then the wizard's own address with "#details" (a bookmark to an earlier step than
//   the one recorded), Save for Later, "Complete submission": the recorded step must survive.
// MODE=neighbour: a draft never saved for later ("u21n16d never saved"): Begin Submission, Continue twice,
//   My Submissions, "Complete submission", reload. It must open on the first step with every later step unreached,
//   fix in and fix out alike.
// MODE=wayround: steps 1 to 6, then the browser's Back; then a second reload, "Continue" twice and "Save for Later"
//   (what each way round gives back).
//
//   npm run fleet-prep -- --feature issues-n16d --dataset 2 --reset
//   PROBE_FEATURE=issues-n16d PROBE_AGENT=n16d node bin/probe.js all shared/playwright/checks/issues/wizard-reload-opens-first-step/walk.js
//   (MODE=neighbour in front for the neighbour check; PKP_E2E_LINE=stable-3_5_0 and the line's fleet for 3.5)
const {forEachApp, launch, signIn, screen, shot, record, sql} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.MODE || 'walk';
const AFTER = process.env.AFTER || '';

forEachApp(async (app) => {
    const author = app.name === 'omp' ? 'aclark' : 'ccorino';
    const title = MODE === 'neighbour' ? 'u21n16d never saved' : 'u21n16d reload';
    const o = {app: app.name, line: app.line || 'main', mode: MODE, after: AFTER || null, author, title};
    const {page, close} = await launch(app);
    page.on('dialog', async (d) => { if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {}); });
    let n = 0;
    const snap = async (name, facts) => {
        const s = await screen(page).catch((e) => ({url: page.url(), error: L.flat(e.message)}));
        if (facts) s.facts = facts;
        const id = `${MODE}-${String(++n).padStart(2, '0')}-${name}`;
        record(id, s);
        await shot(page, id).catch(() => {});
        return s;
    };
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) { o[key] = {error: L.flat(e.message, 300)}; }
        await snap(key, o[key]);
        return o[key];
    };
    try {
        await signIn(page, author, {contextPath: app.contextPath});
        o.submissionId = await L.beginSubmission(page, app, {title, section: app.name === 'ojs' ? 'Articles' : null});
        await step('s2-begun', () => L.readWizard(page));
        await step('s3-continued', async () => {
            o.pressed = [await L.pressContinue(page), await L.pressContinue(page)];
            return L.readWizard(page);
        });
        if (MODE === 'wayround') {
            await step('s4-save-for-later', () => L.saveForLater(page));
            await step('s5-complete-submission', async () => ({...(await L.completeSubmission(page, app, title)), ...(await L.readWizard(page))}));
            await step('s6-reload', async () => { await page.reload(); return L.readWizard(page); });
            await step('w1-browser-back', async () => { await page.goBack(); return L.readWizard(page); });
            await step('w2-reload-again', async () => { await page.reload(); return L.readWizard(page); });
            await step('w3-continue-twice', async () => { await L.pressContinue(page); await L.pressContinue(page); return L.readWizard(page); });
            await step('w4-save-for-later', () => L.saveForLater(page));
            await step('w5-complete-submission', async () => ({...(await L.completeSubmission(page, app, title)), ...(await L.readWizard(page))}));
        } else if (MODE === 'neighbour') {
            await step('n1-complete-submission', async () => ({...(await L.completeSubmission(page, app, title)), ...(await L.readWizard(page))}));
            await step('n2-reload', async () => { await page.reload(); return L.readWizard(page); });
        } else {
            await step('s4-save-for-later', () => L.saveForLater(page));
            await step('s5-complete-submission', async () => ({...(await L.completeSubmission(page, app, title)), ...(await L.readWizard(page))}));
            await step('s6-reload', async () => { await page.reload(); return L.readWizard(page); });
            await step('s7-save-for-later', () => L.saveForLater(page));
            await step('s8-complete-submission', async () => ({...(await L.completeSubmission(page, app, title)), ...(await L.readWizard(page))}));
            if (AFTER === 'bookmark') {
                await step('b1-bookmark-details', async () => {
                    await page.goto('about:blank');
                    await page.goto(app.url(`/index.php/${app.contextPath}${L.localeSeg(app)}/submission?id=${o.submissionId}#details`));
                    return L.readWizard(page);
                });
                await step('b2-save-for-later', () => L.saveForLater(page));
                await step('b3-complete-submission', async () => ({...(await L.completeSubmission(page, app, title)), ...(await L.readWizard(page))}));
            }
        }
        o.progressInDb = sql(app, `SELECT submission_progress FROM submissions WHERE submission_id = ${Number(o.submissionId)}`).trim();
    } catch (e) {
        o.error = L.flat(e.stack || e.message, 600);
        await snap('error').catch(() => {});
    } finally {
        record(`summary-${MODE}${AFTER ? '-' + AFTER : ''}`, o);
        await close();
    }
});
