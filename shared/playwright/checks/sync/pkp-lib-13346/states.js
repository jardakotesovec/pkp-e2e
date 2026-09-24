// rr13263: S1, S2, S3, S5 on a scratch journal (OJS). Reads Review Details' latest-activity line and
// History per reviewer state; captures the window's own GET of the assignment for exact timestamps.
const path = require('path');
const {forEachApp, launch, signIn, record, shot, note, idle, tag} = require('../../../probe');

forEachApp(async (app) => {
    const P = require(path.join(__dirname, '../../../../../apps/ojs/playwright/pages/ReviewStagePages.js'));
    const {expect} = require('@playwright/test');
    const t = tag('a');
    const editor = `${t}ed`;
    const author = `${t}au`;
    const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo'];
    const revs = {};
    names.forEach((n, i) => (revs[n] = {username: `${t}r${i}`, givenName: `R${i}${t}`, familyName: n}));
    const full = (n) => `${revs[n].givenName} ${revs[n].familyName}`;
    await app.api.createContext({
        tag: t,
        users: [
            {username: editor, givenName: 'Ed', familyName: t, roles: ['editor']},
            {username: author, roles: ['author']},
            ...Object.values(revs).map((r) => ({...r, roles: ['externalReviewer']})),
        ],
    });
    // Sub A: the state matrix + S1/S2. Alpha invited, Bravo reminded, Charlie declined, Delta accepted,
    // Echo submitted, Foxtrot completed, Golf thanked, Hotel reverted, India S1/S2.
    const subA = await app.api.createSubmission({
        tag: `${t}a`, context: t, submitter: author, title: `Sub A ${t}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [
            {username: revs.Alpha.username, status: 'invited'},
            {username: revs.Bravo.username, status: 'invited'},
            {username: revs.Charlie.username, status: 'declined'},
            {username: revs.Delta.username, status: 'accepted'},
            {username: revs.Echo.username, status: 'completed'},
            {username: revs.Foxtrot.username, status: 'completed'},
            {username: revs.Golf.username, status: 'completed'},
            {username: revs.Hotel.username, status: 'completed'},
            {username: revs.India.username, status: 'completed'},
        ]}],
    });
    // Sub B: S3. Juliet thanked then reverted, Kilo submitted only; then Request Revisions notifies both.
    const subB = await app.api.createSubmission({
        tag: `${t}b`, context: t, submitter: author, title: `Sub B ${t}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [
            {username: revs.Juliet.username, status: 'completed'},
            {username: revs.Kilo.username, status: 'completed'},
        ]}],
    });
    record('seed', {t, subA, subB});

    const {page, close} = await launch(app);
    const apiSeen = {};
    page.on('response', async (r) => {
        if (r.request().method() === 'GET' && /\/reviewAssignments\/\d+(\?|$)/.test(r.url())) {
            try {
                const j = await r.json();
                apiSeen[j.id] = (apiSeen[j.id] || []).concat([{
                    at: new Date().toISOString(),
                    reviewerFullName: j.reviewerFullName,
                    ...Object.fromEntries(['considered', 'declined', 'dateAssigned', 'dateNotified', 'dateReminded',
                        'dateConfirmed', 'dateCompleted', 'dateConsidered', 'dateAcknowledged', 'statusId', 'status']
                        .map((k) => [k, j[k]])),
                }]);
            } catch (e) { /* ignore */ }
        }
    });
    const out = {};
    const pause = () => page.waitForTimeout(700); // the modal store's 450 ms slot after any close
    try {
        await signIn(page, editor, {contextPath: t});
        const wf = new P.WorkflowPage(page, t);
        const open = async (sub) => { await wf.gotoEditorial(sub.submissionId); await idle(page); };
        const row = (n) => wf.panelRow('Reviewers', full(n));

        async function readDetails(n, key) {
            await P.clickRowAction(page, row(n), 'Review Details');
            const modal = P.reviewDetailsModal(page);
            await expect(modal).toBeVisible({timeout: 30_000});
            await idle(page);
            const heads = modal.locator('h2.text-lg-bold');
            await heads.first().waitFor({timeout: 20_000}).catch(() => {});
            await idle(page);
            const lines = [];
            for (const h of await heads.all()) lines.push((await h.locator('xpath=..').innerText()).replace(/\s+/g, ' ').trim());
            await shot(page, `details-${key}`);
            await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await expect(modal).toBeHidden({timeout: 30_000});
            await pause();
            return lines;
        }
        async function readHistory(n, key) {
            await P.clickRowAction(page, row(n), 'History');
            const hm = page.getByRole('dialog').filter({has: page.locator('.pkp_review_history')});
            await expect(hm.locator('.pkp_review_history')).toBeVisible({timeout: 30_000});
            const lines = (await hm.locator('.pkp_review_history > div').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
            await shot(page, `history-${key}`);
            await P.closeSideWindow(hm);
            await pause();
            return lines;
        }
        async function readBoth(n, key) {
            const status = (await P.statusTitle(row(n)).innerText().catch(() => '?')).trim();
            out[key] = {reviewer: full(n), rowStatus: status, details: await readDetails(n, key), history: await readHistory(n, key)};
            console.log(key, JSON.stringify(out[key]));
        }
        async function complete(n) {
            const m = await P.openReviewDetails(page, row(n));
            await P.markReviewComplete(page, m);
            await P.closeReviewDetails(page, m);
            await pause();
        }
        async function thank(n, {skipEmail}) {
            await row(n).getByRole('button', {name: 'Thank Reviewer', exact: true}).click();
            const tm = P.legacyModal(page, 'sendThankYouForm');
            await expect(tm.locator('form#sendThankYouForm')).toBeVisible({timeout: 30_000});
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: 30_000}).catch(() => {});
            if (skipEmail) await tm.locator('input[name="skipEmail"]').check();
            await tm.locator('form#sendThankYouForm').getByRole('button', {name: 'Thank Reviewer', exact: true}).click();
            await expect(tm.locator('form#sendThankYouForm')).toBeHidden({timeout: 30_000});
            await P.waitForJQueryIdle(page);
            await pause();
        }

        // --- Sub A setup
        await open(subA);
        const ed = await P.openEditReview(page, row('Bravo'));
        const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x; };
        await P.pickDate(page, ed, 'responseDueDate', d(-2));
        await P.pickDate(page, ed, 'reviewDueDate', d(-1));
        await P.saveEditReview(page, ed);
        await open(subA);
        const rm = await P.openSendReminder(page, row('Bravo'));
        await P.submitSendReminder(page, rm);
        await open(subA);
        await complete('Foxtrot');
        await complete('Golf');
        await open(subA);
        await thank('Golf', {skipEmail: true});
        await open(subA);
        await complete('Hotel');
        await P.revertReviewDecision(page, row('Hotel'));
        await pause();
        await open(subA);
        await complete('India');
        await open(subA);
        await thank('India', {skipEmail: false});
        await open(subA);
        await readBoth('India', 'india-1-thanked');
        await P.revertReviewDecision(page, row('India'));
        await pause();
        await open(subA);
        await readBoth('India', 'india-2-reverted');

        // --- Sub B setup (S3)
        await open(subB);
        await complete('Juliet');
        await open(subB);
        await thank('Juliet', {skipEmail: false});
        await open(subB);
        await readBoth('Juliet', 'juliet-1-thanked');
        await P.revertReviewDecision(page, row('Juliet'));
        await pause();
        await open(subB);
        await readBoth('Juliet', 'juliet-2-reverted');
        await readBoth('Kilo', 'kilo-1-submitted');

        // --- Matrix read (S5)
        await open(subA);
        for (const [n, k] of [['Alpha', 'invited'], ['Bravo', 'reminded'], ['Charlie', 'declined'], ['Delta', 'accepted'],
            ['Echo', 'submitted'], ['Foxtrot', 'completed'], ['Golf', 'thanked'], ['Hotel', 'reverted-from-complete']]) {
            await readBoth(n, `matrix-${k}`);
        }

        // --- a minute later: S1 re-mark complete, S3 decision
        note('rr13263 states.js: waiting 65 s so T2/T3 differ from T1 on minute-resolution screens');
        await page.waitForTimeout(65_000);
        await open(subA);
        await complete('India');
        await open(subA);
        await readBoth('India', 'india-3-recompleted');

        await open(subB);
        const win = await wf.openRequestRevisionsWindow();
        await wf.pressNext(win);
        const dp = new P.DecisionPage(page);
        const steps = [];
        for (let i = 0; i < 6; i++) {
            await dp.awaitComposerLoaded();
            steps.push(await page.getByRole('heading', {level: 1}).first().innerText().catch(() => '?'));
            if (/Notify Reviewers/.test(steps[steps.length - 1])) {
                await shot(page, 'decision-notify-reviewers');
                steps.push('to: ' + (await page.locator('.composer__recipients, [class*="recipient"]').first().innerText().catch(() => '?')).replace(/\s+/g, ' '));
            }
            if (await dp.recordButton.isVisible()) { await dp.record(); break; }
            await dp.continueButton.click();
        }
        out.decisionSteps = steps;
        await open(subB);
        await readBoth('Juliet', 'juliet-3-after-decision');
        await readBoth('Kilo', 'kilo-2-after-decision');
    } catch (e) {
        out.error = String(e && e.stack || e);
        await shot(page, 'error').catch(() => {});
        console.log('ERROR', e);
    } finally {
        record('result', {out, apiSeen});
        await close();
    }
});
