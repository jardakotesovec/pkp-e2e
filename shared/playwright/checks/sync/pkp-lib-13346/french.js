// rr13263 S4: the History and Review Details labels in the fr_CA UI after a reminder (OJS scratch journal).
const path = require('path');
const {forEachApp, launch, signIn, record, shot, idle, tag} = require('../../../probe');

forEachApp(async (app) => {
    const P = require(path.join(__dirname, '../../../../../apps/ojs/playwright/pages/ReviewStagePages.js'));
    const {expect} = require('@playwright/test');
    const t = tag('f');
    const editor = `${t}ed`;
    const author = `${t}au`;
    const rev = {username: `${t}r0`, givenName: `R0${t}`, familyName: 'Rappel'};
    const rev2 = {username: `${t}r1`, givenName: `R1${t}`, familyName: 'Merci'};
    await app.api.createContext({
        tag: t,
        context: {supportedLocales: ['en', 'fr_CA']},
        users: [
            {username: editor, givenName: 'Ed', familyName: t, roles: ['editor']},
            {username: author, roles: ['author']},
            {...rev, roles: ['externalReviewer']},
            {...rev2, roles: ['externalReviewer']},
        ],
    });
    const sub = await app.api.createSubmission({
        tag: `${t}s`, context: t, submitter: author, title: `Sub F ${t}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: rev.username, status: 'invited'}, {username: rev2.username, status: 'completed'}]}],
    });
    const {page, close} = await launch(app);
    const out = {};
    const pause = () => page.waitForTimeout(700);
    try {
        await signIn(page, editor, {contextPath: t});
        const wf = new P.WorkflowPage(page, t);
        const row = (r) => wf.panelRow('Reviewers', `${r.givenName} ${r.familyName}`);
        await wf.gotoEditorial(sub.submissionId);
        await idle(page);
        const ed = await P.openEditReview(page, row(rev));
        const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x; };
        await P.pickDate(page, ed, 'responseDueDate', d(-2));
        await P.pickDate(page, ed, 'reviewDueDate', d(-1));
        await P.saveEditReview(page, ed);
        await wf.gotoEditorial(sub.submissionId);
        const rm = await P.openSendReminder(page, row(rev));
        await P.submitSendReminder(page, rm);

        // Switch the UI to French the way the header's language menu does.
        await page.goto(`/index.php/${t}/user/setLocale/fr_CA?source=${encodeURIComponent(`/index.php/${t}/fr_CA/dashboard/editorial?workflowSubmissionId=${sub.submissionId}`)}`);
        await page.goto(`/index.php/${t}/fr_CA/dashboard/editorial?workflowSubmissionId=${sub.submissionId}`);
        await idle(page);
        await page.getByRole('row').filter({hasText: `${rev.givenName} ${rev.familyName}`}).first().waitFor({timeout: 30_000});
        out.url = page.url();
        const menuOf = async (r) => {
            await page.getByRole('row').filter({hasText: `${r.givenName} ${r.familyName}`}).locator('button[aria-haspopup]').last().click();
            const menu = page.getByRole('menu');
            await expect(menu.getByRole('menuitem').first()).toBeVisible({timeout: 30_000});
            return menu;
        };
        for (const r of [rev, rev2]) {
            const key = r.familyName;
            let menu = await menuOf(r);
            out[`${key}-menu`] = await menu.getByRole('menuitem').allInnerTexts();
            await menu.getByRole('menuitem', {name: 'Historique', exact: true}).click();
            const hm = page.getByRole('dialog').filter({has: page.locator('.pkp_review_history')});
            await expect(hm.locator('.pkp_review_history')).toBeVisible({timeout: 30_000});
            out[`${key}-history`] = (await hm.locator('.pkp_review_history > div').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
            await shot(page, `fr-history-${key}`);
            await hm.getByRole('button').first().click();
            await expect(hm).toBeHidden({timeout: 30_000});
            await pause();
            await page.goto(`/index.php/${t}/fr_CA/dashboard/editorial?workflowSubmissionId=${sub.submissionId}`);
            await idle(page);
            await page.getByRole('row').filter({hasText: `${r.givenName} ${r.familyName}`}).first().waitFor({timeout: 30_000});
            menu = await menuOf(r);
            await menu.getByRole('menuitem', {name: "Renseignements sur l'évaluation", exact: true}).click();
            const modal = page.getByRole('dialog').filter({has: page.locator('h2.text-lg-bold')}).last();
            await modal.locator('h2.text-lg-bold').first().waitFor({timeout: 30_000});
            await idle(page);
            const lines = [];
            for (const h of await modal.locator('h2.text-lg-bold').all()) lines.push((await h.locator('xpath=..').innerText()).replace(/\s+/g, ' ').trim());
            out[`${key}-details`] = lines;
            await shot(page, `fr-details-${key}`);
            await page.goto(`/index.php/${t}/fr_CA/dashboard/editorial?workflowSubmissionId=${sub.submissionId}`);
            await idle(page);
            await page.getByRole('row').filter({hasText: `${rev2.givenName} ${rev2.familyName}`}).first().waitFor({timeout: 30_000});
        }
        out.localeKey = await page.evaluate(() => (window.pkp && pkp.localeKeys) ? {
            reviewerReminded: pkp.localeKeys['editor.review.reviewerReminded'],
            requestSent: pkp.localeKeys['editor.review.requestSent'],
            reviewerThanked: pkp.localeKeys['editor.review.reviewerThanked'],
        } : null);
    } catch (e) {
        out.error = String(e && e.stack || e);
        await shot(page, 'fr-error').catch(() => {});
    } finally {
        console.log(JSON.stringify(out, null, 1));
        record('french', out);
        await close();
    }
});
