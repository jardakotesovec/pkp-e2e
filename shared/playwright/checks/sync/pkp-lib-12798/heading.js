// pkp/pkp-lib#12798 (2026-11-05 re-check after the issue was closed): the decision page that
// "Move to Review" opens on a submission at Copyediting through a review round. Records the
// button pressed, the page's h1 and the breadcrumb's last item, and a screenshot. Fixed when the
// h1 reads "Move to Review" like the button and the breadcrumb.
// Run: PROBE_FEATURE=sync PROBE_AGENT=<id> node bin/probe.js ojs|omp|all <this file>
const {forEachApp, launch, signIn, record, idle, shot, tag} = require('../../../probe');

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('hd12798');
    await app.api.createContext({tag: T, users: [
        {username: `${T}mgr`, roles: ['manager'], givenName: 'Meg', familyName: `Mgr${T}`},
        {username: `${T}aut`, roles: ['author'], givenName: 'Au', familyName: `Thor${T}`},
    ]});
    const sub = await app.api.createSubmission({tag: `${T}s`, context: T, submitter: `${T}aut`, title: `HD12798 ${T}`,
        decisions: ['sendExternalReview', 'accept']});
    const sid = sub.submissionId || sub.id || (sub.submission && sub.submission.id);
    const {page, close} = await launch(app);
    try {
        await signIn(page, `${T}mgr`, {contextPath: T});
        await page.goto(app.url(`/index.php/${T}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        const btn = page.getByRole('button', {name: /^(Move to Review|Move to Submission)$/}).first();
        await btn.waitFor({timeout: 30_000});
        const pressed = (await btn.innerText()).trim();
        await shot(page, 'workflow');
        await btn.click();
        await page.waitForURL(/decision/, {timeout: 30_000});
        await idle(page);
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
        await idle(page);
        const h1 = (await page.locator('h1.app__pageHeading').innerText()).trim();
        const crumbs = (await page.locator('nav[aria-label*="readcrumb"] li, .app__breadcrumbs li').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
        const out = {tag: T, submissionId: sid, url: page.url(), pressed, h1, breadcrumbLast: crumbs[crumbs.length - 1] || null, title: await page.title(),
            fixed: h1 === 'Move to Review'};
        out.screenshot = await shot(page, 'decision-page');
        record('heading', out);
        console.log(JSON.stringify(out, null, 1));
    } finally {
        await close();
    }
});
