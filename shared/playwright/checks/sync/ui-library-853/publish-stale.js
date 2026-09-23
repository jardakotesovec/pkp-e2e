// Pre-merge check for pkp/pkp-lib#13359 (ui-library#853, companion `optimize-table-reloads`): the OJS publish
// confirmation window (legacy PublishHandler opened by workflowScheduleForPublication) no longer reloads the
// workflow after "Publish". Its form is a <pkp-form> mounted by pkp.registry.init as a separate Vue app, so
// Form.vue's injected markDataChanged is null there, it saves via $.ajax (not useFetch) and sends no jQuery
// formSubmitted; the window closes itself (form-success, 1 s) with the modal flagged unchanged, and the
// workflow wrapper's triggerDataChange({dataChanged:false}) returns without a refetch.
//   P  workflow › Publication: "Status: …" and the right controls after the window closes, against the same
//      after a page reload (the truth); plus the GETs sent after the close
//      (on this path the panel's own Form success marks the publish window by slot reuse, so it reloads anyway)
//   D  the path without the panel: the confirmation closed unpublished, "Schedule For Publication" pressed again
//      opens it directly (.D.direct), then "Publish"; same reads as P
//   Fixed when result-ojs.json .D.stale is false (expected false at ui-library 2034439a; .P.stale false on both).
//   U853_PARTS=D runs one part (default P,D).
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ui-library-853/publish-stale.js
const {forEachApp, launch, signIn, record, idle, tag} = require('../../../probe');
const log = (...a) => console.log(...a);

function watchGets(page) {
    const urls = [];
    const on = (req) => {
        if (req.method() === 'GET' && /\/api\/v1\//.test(req.url())) {
            urls.push(new URL(req.url()).pathname.replace(/^.*\/api\/v1/, ''));
        }
    };
    page.on('request', on);
    return () => { page.off('request', on); return urls; };
}

forEachApp(async (app) => {
    const {expect} = require('@playwright/test');
    const {PublishScreen} = require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js');
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('u853p');
    await app.api.createContext({tag: T, users: [
        {username: `${T}mgr`, roles: ['manager'], givenName: 'Meg', familyName: `Mgr${T}`},
        {username: `${T}aut`, roles: ['author'], givenName: 'Au', familyName: `Thor${T}`},
    ]});
    const PARTS = (process.env.U853_PARTS || 'P,D').split(',');
    const results = {T};
    const readState = async (pub) => ({
        status: (await pub.leftControls().innerText()).replace(/\s+/g, ' ').trim(),
        right: (await pub.rightControls().getByRole('button').allInnerTexts()).map((x) => x.trim()).filter(Boolean),
    });
    const confirmOf = (page) => page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'}).last();
    const passPanel = async (pub) => {
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
        if (await dontAssign.waitFor({state: 'visible', timeout: 5_000}).then(() => true).catch(() => false)) {
            await pub.awaitAssignmentPreselected(panel);
            await dontAssign.check();
        }
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    };
    const publishAndRead = async (page, pub, out) => {
        const confirm = confirmOf(page);
        await expect(confirm.getByRole('button', {name: 'Publish', exact: true})).toBeVisible({timeout: 30_000});
        const published = page.waitForResponse((r) => /\/publish$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: 30_000});
        const stopGets = watchGets(page);
        await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
        out.publishStatus = (await published).status();
        // The window closes itself 1 s after form-success; wait it out, then let any reload land.
        await expect(page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'}))
            .toHaveCount(0, {timeout: 30_000});
        await idle(page);
        await page.waitForTimeout(5000);
        out.getsAfterClose = stopGets();
        out.afterClose = await readState(pub);
        await page.reload();
        await expect(page.getByRole('link', {name: 'Publication', exact: true})).toBeVisible({timeout: 30_000});
        await pub.openEntry('Title & Abstract');
        await idle(page);
        await expect(pub.leftControls()).toContainText('Status:', {timeout: 30_000});
        out.afterReload = await readState(pub);
        out.stale = JSON.stringify(out.afterClose) !== JSON.stringify(out.afterReload);
    };
    const seed = (x) => app.api.createSubmission({tag: `${T}${x}`, context: T, submitter: `${T}aut`,
        title: `U853 publish ${x} ${T}`, decisions: ['skipExternalReview', 'sendToProduction']});

    const {page, close} = await launch(app);
    try {
        await signIn(page, `${T}mgr`, {contextPath: T});
        const pub = new PublishScreen(page, T);

        if (PARTS.includes('P')) {
            const s = await seed('p');
            const out = {submissionId: s.submissionId};
            await pub.gotoWorkflow(s.submissionId);
            await pub.openEntry('Title & Abstract');
            await idle(page);
            out.before = await readState(pub);
            await passPanel(pub);
            await publishAndRead(page, pub, out);
            results.P = out;
            log('P', JSON.stringify(out, null, 1));
        }

        if (PARTS.includes('D')) {
            const s = await seed('d');
            const out = {submissionId: s.submissionId};
            await pub.gotoWorkflow(s.submissionId);
            await pub.openEntry('Title & Abstract');
            await idle(page);
            out.before = await readState(pub);
            await passPanel(pub);
            // Close the confirmation unpublished through its header "Close".
            const first = confirmOf(page);
            await expect(first.getByRole('button', {name: 'Publish', exact: true})).toBeVisible({timeout: 30_000});
            await first.getByRole('button', {name: 'Close', exact: true}).first().click();
            await expect(page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'}))
                .toHaveCount(0, {timeout: 30_000});
            await idle(page);
            await page.waitForTimeout(2000);
            out.afterCancel = await readState(pub);
            // Second press: the confirmation should open directly, without the panel.
            await pub.publishButton().click();
            const confirmSeen = confirmOf(page).getByRole('button', {name: 'Publish', exact: true})
                .waitFor({state: 'visible', timeout: 30_000}).then(() => 'confirm', () => new Promise(() => {}));
            const panelSeen = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'})
                .locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: 30_000}).then(() => 'panel', () => new Promise(() => {}));
            const first2 = await Promise.race([confirmSeen, panelSeen, page.waitForTimeout(31_000).then(() => 'none', () => 'none')]);
            out.direct = first2 === 'confirm';
            if (!out.direct) {
                out.note = `second press opened ${first2}, not the confirmation`;
            } else {
                await publishAndRead(page, pub, out);
            }
            results.D = out;
            log('D', JSON.stringify(out, null, 1));
        }
    } finally {
        await close();
    }
    record('result', results);
    return results;
});
