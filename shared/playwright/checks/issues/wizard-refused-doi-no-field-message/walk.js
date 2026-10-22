// U75 A7 issue walk: the submission wizard refuses a DOI written on its own and never says which box or why.
// Steps (docs/issues/U75-A7-wizard-refused-doi-no-field-message.md), on the default dataset, OPS:
//   ccorino: Make a Submission, Continue to the "Relation status" question, "This preprint has been published
//   elsewhere.", "10.1234/u75r3" in "DOI of the published preprint", Continue; OK in the dialog; Back to the step.
// MODE=submit: the same refusal, then the reload the window asks for, "Review" and "Submit" (with a file and an
//   abstract, so "Submit" can be offered); then dbarnes reads the submitted preprint's "Relations".
// MODE=wordlimit (OPS main): the fix's reach to another form, the "Details" save refused naming its own field: dbarnes
//   enables the plain language summary ("Ask") and gives "Preprints" a word count of 10; ccorino types a summary over
//   the limit on "Details" and presses Continue (U21 A16).
// MODE=again: the refusal, then "Continue" pressed again with the box unchanged, then the rail's "Review" and, when
//   offered, "Submit"; dbarnes reads the submitted preprint's "Relations" (with a file and an abstract).
// MODE=neighbour: what a fix must leave alone. (a) The same wizard step with the full address
//   "https://doi.org/10.1234/u75r3": saved, no dialog, no message; (c) then "Details" from the rail and Continue, with
//   "Review"'s problems on that form: the wizard moves on. (b) The control: dbarnes, submission 1,
//   "Relations", the same bare DOI, "Save": the panel's own field message.
//
//   npm run fleet-prep -- --feature issues-h22b --dataset 2 --apps ops --reset
//   PROBE_FEATURE=issues-h22b PROBE_AGENT=h22b node bin/probe.js ops shared/playwright/checks/issues/wizard-refused-doi-no-field-message/walk.js
//   (MODE=neighbour in front for the neighbour check; PKP_E2E_LINE=stable-3_5_0 and the line's fleet for 3.5)
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle} = require('../../../probe');
const L = require('../wizard-refused-save-hangs-saving/lib.js');
const P = require('../plain-summary-required-refuses-other-saves/lib.js');

const MODE = process.env.MODE || 'walk';
const BARE_DOI = '10.1234/u75r3';
const DOI_URL = 'https://doi.org/10.1234/u75r3';
const PUBLISHED = 'This preprint has been published elsewhere.';
const ABS_ID = 'titleAbstract-abstract-control-en';
const PLS_ID = 'titleAbstract-plainLanguageSummary-control-en';
const LONG_SUMMARY = 'u75r3 this plain language summary runs past the section word limit of ten words so the server refuses it.';

forEachApp(async (app) => {
    const o = {app: app.name, line: app.line || 'main', mode: MODE};
    const {page, close} = await launch(app);
    await page.addInitScript(L.watchFooter);
    const traffic = [];
    const errs = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/\/api\/v1\//.test(u) || r.request().method() === 'GET') return;
        const e = {at: Date.now(), op: r.request().headers()['x-http-method-override'] || r.request().method(), url: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], status: r.status()};
        traffic.push(e);
        if (r.status() >= 400) e.body = L.flat(await r.text().catch(() => null), 300);
    });
    page.on('pageerror', (e) => errs.push({at: Date.now(), text: L.flat(e.message, 200)}));
    let t0 = Date.now();
    const rel = (x) => Math.round((x - t0) / 100) / 10;
    const writes = (from) => traffic.filter((x) => x.at >= from).map((x) => ({op: x.op, url: x.url, status: x.status, atS: rel(x.at), body: x.body}));
    const footerLog = async (from) => (await page.evaluate(() => window.__footer || []).catch(() => [])).filter((x) => x.at >= from).map((x) => ({atS: rel(x.at), text: x.text}));
    const errsSince = (from) => errs.filter((x) => x.at >= from).map((x) => ({atS: rel(x.at), text: x.text}));
    let n = 0;
    const snap = async (name, facts) => {
        const s = await screen(page).catch((e) => ({url: page.url(), error: L.flat(e.message)}));
        if (facts) s.facts = facts;
        const id = `a7-${MODE}-${String(++n).padStart(2, '0')}-${name}`;
        record(id, s);
        await shot(page, id).catch(() => {});
        return s;
    };
    const errDialog = () => page.getByRole('dialog').filter({hasText: /An unexpected error has occurred/});
    const published = page.getByRole('radio', {name: PUBLISHED, exact: true});
    const doiBox = page.getByRole('textbox', {name: 'DOI of the published preprint'});
    // The box's field: its value, its messages (field errors), any page notice.
    const readField = async () => page.evaluate(() => {
        const box = [...document.querySelectorAll('input[name="vorDoi"]')].find((x) => x.getClientRects().length);
        const field = box ? box.closest('.pkpFormField') : null;
        const notices = [...document.querySelectorAll('[role="status"], .pkpNotify, .vue-notification, [data-cy="notification"]')]
            .map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
        return {visible: !!box, value: box ? box.value : null,
            fieldErrors: field ? [...field.querySelectorAll('.pkpFormFieldError, .pkpFieldError, [id$="-error"]')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean) : null,
            ariaInvalid: box ? box.getAttribute('aria-invalid') : null, notices};
    }).catch((e) => ({err: L.flat(e.message, 200)}));

    // Steps 1-4 (and the neighbour's wizard part): a new submission, on to the relation question, the answer typed.
    async function toRelationStep(title, doi, {file = false, abstract = false} = {}) {
        await signIn(page, 'ccorino');
        o.submissionId = await L.beginSubmission(page, app, {title});
        o.firstStep = await L.currentStep(page);
        o.stepsPassed = [];
        for (let i = 0; i < 5 && !(await published.isVisible().catch(() => false)); i++) {
            const cur = await L.currentStep(page);
            if (file && /Upload Files\s*$/.test(cur)) await P.uploadFile(app, page);
            if (abstract && /Details\s*$/.test(cur)) await L.typeRich(page, ABS_ID, 'u75r3 abstract typed by the author.');
            o.stepsPassed.push(await L.pressContinue(page));
        }
        o.relationStep = (await L.currentStep(page)).replace(/^\d+\s*/, '');
        await loc(page, 'wizard: "This preprint has been published elsewhere." radio', published);
        await published.check();
        await loc(page, 'wizard: "DOI of the published preprint" box', doiBox);
        await doiBox.fill(doi);
        await snap('typed', await readField());
    }

    // The "Relations" dropdown of a submission's workflow, as dbarnes: the ticked answer and the DOI.
    async function readRelations(sid) {
        await signOut(page);
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}${app.line && /3_[34]/.test(app.line) ? '' : '/en'}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await page.locator('[data-cy="sidemodal-header"]').waitFor({timeout: L.T}).catch(() => {});
        await idle(page).catch(() => {});
        const dlg = page.getByRole('dialog').filter({has: page.locator('[data-cy="sidemodal-header"]')}).first();
        await dlg.getByRole('navigation').getByRole('link', {name: 'Title & Abstract', exact: true}).first().click().catch(() => {});
        await idle(page).catch(() => {});
        await L.sleep(1500);
        await page.getByRole('button', {name: 'Relations', exact: true}).first().click().catch((e) => { o.relationsButton = L.flat(e.message, 200); });
        await L.sleep(700);
        return page.evaluate(() => {
            const radios = [...document.querySelectorAll('input[name="relationStatus"]')].filter((r) => r.getClientRects().length);
            const doi = [...document.querySelectorAll('input[name="vorDoi"]')].find((r) => r.getClientRects().length);
            return {ticked: radios.filter((r) => r.checked).map((r) => (r.closest('label') || r.parentElement).innerText.trim()), doi: doi ? doi.value : null};
        }).catch((e) => ({err: L.flat(e.message, 200)}));
    }

    try {
        if (MODE === 'submit') {
            await toRelationStep('u75r3 DOI written on its own, submitted', BARE_DOI, {file: true, abstract: true});
            t0 = Date.now();
            await L.pressContinue(page);
            o.errorDialog = await errDialog().waitFor({timeout: 10_000}).then(() => true).catch(() => false);
            if (o.errorDialog) await errDialog().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await L.sleep(6000);
            o.beforeReload = {step: await L.currentStep(page), controls: await L.readControls(page), writes: writes(t0)};
            await snap('refused-before-reload', o.beforeReload);
            // The reload the window asks for; "Unsaved Changes" answered "Yes" when it asks.
            const t1 = Date.now();
            o.reloadAsked = await P.reloadWizard(page, 'Yes');
            await L.sleep(3000);
            o.reloadWrites = writes(t1);
            await P.goToStep(page, o.relationStep);
            await L.sleep(1000);
            o.afterReload = {step: await L.currentStep(page), ticked: await page.locator('input[name="relationStatus"]:checked').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.trim())).catch(() => null), field: await readField()};
            await snap('relation-step-after-reload', o.afterReload);
            await P.goToStep(page, 'Review');
            await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20_000}).catch(() => {});
            await L.sleep(3000);
            const rv = await snap('review-after-reload');
            const main = (rv.text && rv.text.main) || '';
            o.review = {relationText: L.flat((main.match(/Relation status[\s\S]{0,120}/) || [])[0], 160), problems: /one or more problems/.test(main), controls: await L.readControls(page)};
            const submit = L.footer(page).getByRole('button', {name: 'Submit', exact: true});
            o.review.submitDisabled = await submit.isDisabled().catch(() => null);
            if (o.review.submitDisabled === false) {
                await submit.click();
                const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
                await d.waitFor({timeout: L.T});
                await d.getByRole('button', {name: 'Submit', exact: true}).click();
                o.complete = await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45_000}).then(() => true).catch(() => false);
                await snap('submitted', {complete: o.complete});
            }
            o.relationsAfter = await readRelations(o.submissionId);
            await snap('relations-after-submit', o.relationsAfter);
            return;
        }

        if (MODE === 'wordlimit') {
            // A refusal of the "Details" form naming its own field: dbarnes enables the summary ("Ask") and gives
            // "Preprints" a word count of 10; ccorino types a summary over that limit on "Details" and presses Continue.
            await signIn(page, 'dbarnes');
            o.plsSetting = await L.enablePlainLanguageSummary(page, app);
            if (o.plsSetting.absent) { o.stopped = 'no plain language summary on this line'; return; }
            o.wordCount = await L.setSectionWordCount(page, app, 'Preprints', 10);
            await signOut(page);
            await signIn(page, 'ccorino');
            o.submissionId = await L.beginSubmission(page, app, {title: 'u75r3 summary over the limit'});
            if (/Upload Files\s*$/.test(await L.currentStep(page))) await L.pressContinue(page);
            await L.typeRich(page, ABS_ID, 'u75r3 abstract typed by the author.');
            await L.typeRich(page, PLS_ID, LONG_SUMMARY);
            t0 = Date.now();
            o.details = {next: await L.pressContinue(page)};
            o.details.errorDialog = await errDialog().waitFor({timeout: 10_000}).then(() => true).catch(() => false);
            o.details.errorDialogText = o.details.errorDialog ? L.flat(await errDialog().innerText().catch(() => null), 200) : null;
            await L.sleep(1500);
            o.details.step = await L.currentStep(page);
            o.details.writes = writes(t0);
            o.details.summaryField = await page.evaluate(() => {
                const f = document.querySelector('#titleAbstract-plainLanguageSummary-control-en_ifr')?.closest('.pkpFormField');
                return f ? {errors: [...f.querySelectorAll('.pkpFormFieldError, .pkpFieldError, [id$="-error"]')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
                    visible: !!f.getClientRects().length} : null;
            }).catch((e) => ({err: L.flat(e.message, 200)}));
            o.details.notices = await page.locator('[role="status"], .pkpNotify, .vue-notification').allInnerTexts().then((a) => a.map((x) => L.flat(x, 200)).filter(Boolean)).catch(() => null);
            await snap('wordlimit-continue', o.details);
            if (o.details.errorDialog) await errDialog().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await L.sleep(6000);
            o.details.after = {step: await L.currentStep(page), controls: await L.readControls(page), pageErrors: errsSince(t0), footer: await footerLog(t0)};
            await snap('wordlimit-after', o.details.after);
            return;
        }

        if (MODE === 'again') {
            // The refusal, then "Continue" pressed again with the box left as it is, then on to "Review" and "Submit"
            // (a file and an abstract, so that "Submit" can be offered); dbarnes reads the preprint's "Relations".
            await toRelationStep('u75r3 Continue pressed again', BARE_DOI, {file: true, abstract: true});
            t0 = Date.now();
            o.first = {next: await L.pressContinue(page)};
            o.first.errorDialog = await errDialog().waitFor({timeout: 8000}).then(() => true).catch(() => false);
            if (o.first.errorDialog) await errDialog().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await L.sleep(3000);
            o.first.step = await L.currentStep(page);
            o.first.field = await readField();
            o.first.writes = writes(t0);
            await snap('again-refused', o.first);
            // Back on the relation step (the fix brings the author there; without it, "Back").
            if (!L.endAnchored(o.relationStep).test(await L.currentStep(page))) await L.pressBack(page, o.relationStep).catch((e) => { o.first.backError = L.flat(e.message, 200); });
            // "Continue" again, the box unchanged.
            const t1 = Date.now();
            await L.footer(page).getByRole('button', {name: 'Continue', exact: true}).click({timeout: 10_000}).catch((e) => { o.againClickError = L.flat(e.message, 200); });
            await L.sleep(4000);
            o.again = {step: await L.currentStep(page), writes: writes(t1), field: await readField(), controls: await L.readControls(page),
                errorDialog: await errDialog().isVisible().catch(() => false), pageErrors: errsSince(t1)};
            await snap('again-continue', o.again);
            if (o.again.errorDialog) await errDialog().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            // The rail's "Review", as an author would try next.
            await P.goToStep(page, 'Review').catch((e) => { o.railError = L.flat(e.message, 200); });
            await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20_000}).catch(() => {});
            await L.sleep(3000);
            const rv = await snap('again-review');
            const main = (rv.text && rv.text.main) || '';
            o.review = {step: await L.currentStep(page), relationText: L.flat((main.match(/Relation status[\s\S]{0,120}/) || [])[0], 160),
                problems: /one or more problems/.test(main), controls: await L.readControls(page), writes: writes(t1)};
            const submit = L.footer(page).getByRole('button', {name: 'Submit', exact: true});
            o.review.submitVisible = await submit.isVisible().catch(() => false);
            o.review.submitDisabled = o.review.submitVisible ? await submit.isDisabled().catch(() => null) : null;
            if (o.review.submitDisabled === false) {
                await submit.click();
                const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
                await d.waitFor({timeout: L.T});
                await d.getByRole('button', {name: 'Submit', exact: true}).click();
                o.complete = await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45_000}).then(() => true).catch(() => false);
                await snap('again-submitted', {complete: o.complete});
                o.relationsAfter = await readRelations(o.submissionId);
                await snap('again-relations', o.relationsAfter);
                return;
            }
            // Held: the author corrects the box and goes on.
            if (L.endAnchored(o.relationStep).test(await L.currentStep(page)) && (await doiBox.isVisible().catch(() => false))) {
                await doiBox.fill(DOI_URL);
                const t2 = Date.now();
                await L.pressContinue(page);
                await L.sleep(5000);
                const rv2 = await snap('again-corrected');
                o.corrected = {step: await L.currentStep(page), writes: writes(t2), controls: await L.readControls(page),
                    relationText: L.flat((((rv2.text && rv2.text.main) || '').match(/Relation status[\s\S]{0,120}/) || [])[0], 160)};
            }
            return;
        }

        if (MODE === 'neighbour') {
            // (a) the full address on the same wizard step.
            await toRelationStep('u75r3 full DOI address', DOI_URL);
            t0 = Date.now();
            o.full = {next: await L.pressContinue(page)};
            await L.sleep(6000);
            o.full.errorDialog = await errDialog().isVisible().catch(() => false);
            o.full.step = await L.currentStep(page);
            o.full.writes = writes(t0);
            o.full.footer = await footerLog(t0);
            o.full.controls = await L.readControls(page);
            o.full.pageErrors = errsSince(t0);
            const rv = await snap('full-address-continue', o.full);
            o.full.reviewRelationText = L.flat(((rv.text && rv.text.main) || '').match(/Relation status[\s\S]{0,200}/)?.[0], 220);
            await L.pressBack(page, o.relationStep).catch((e) => { o.full.backError = L.flat(e.message, 200); });
            o.full.field = await readField();
            await snap('full-address-back', o.full.field);
            // (c) "Review" has copied its check's problems (no file, no abstract) onto the "Details" form: open
            // "Details" from the rail and press Continue; the wizard must move on (a fix must hold only a refused form).
            await P.goToStep(page, 'Details').catch((e) => { o.reviewErrorsMove = {railError: L.flat(e.message, 200)}; });
            await L.sleep(800);
            o.reviewErrorsMove = {...(o.reviewErrorsMove || {}), from: await L.currentStep(page),
                fieldErrors: await page.locator('.pkpFormFieldError:visible, .pkpFieldError:visible').allInnerTexts().then((a) => a.map((x) => L.flat(x, 160))).catch(() => null)};
            await L.pressContinue(page).catch((e) => { o.reviewErrorsMove.continueError = L.flat(e.message, 200); });
            await L.sleep(1500);
            o.reviewErrorsMove.to = await L.currentStep(page);
            await snap('review-errors-continue', o.reviewErrorsMove);
            await signOut(page);

            // (b) the control: "Relations" on submission 1 in the workflow, as dbarnes.
            await signIn(page, 'dbarnes');
            await page.goto(app.url(`/index.php/${app.contextPath}${app.line && /3_[34]/.test(app.line) ? '' : '/en'}/dashboard/editorial?workflowSubmissionId=1`));
            await page.locator('[data-cy="sidemodal-header"]').waitFor({timeout: L.T}).catch(() => {});
            await idle(page).catch(() => {});
            const dlg = page.getByRole('dialog').filter({has: page.locator('[data-cy="sidemodal-header"]')}).first();
            await dlg.getByRole('navigation').getByRole('link', {name: 'Title & Abstract', exact: true}).first().click().catch((e) => { o.titleAbstractLink = L.flat(e.message, 200); });
            await idle(page).catch(() => {});
            await L.sleep(1500);
            const relButton = page.getByRole('button', {name: 'Relations', exact: true}).first();
            await loc(page, 'workflow: "Relations" button', relButton);
            await relButton.click();
            await L.sleep(700);
            const panel = page.locator('.pkpWorkflow__publicationRelation .pkpDropdown__content');
            await panel.getByRole('radio', {name: PUBLISHED, exact: true}).check();
            await panel.locator('input[name="vorDoi"]').fill(BARE_DOI);
            t0 = Date.now();
            const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000}).catch(() => null);
            await panel.getByRole('button', {name: 'Save', exact: true}).click();
            await w;
            await L.sleep(1200);
            o.control = {writes: writes(t0), field: await readField(), panelText: L.flat(await panel.innerText().catch(() => null), 600), pageErrors: errsSince(t0)};
            await snap('control-relations', o.control);
            return;
        }

        // Steps 1-4.
        await toRelationStep('u75r3 DOI written on its own', BARE_DOI);
        // 5: Continue.
        t0 = Date.now();
        o.step5 = {next: await L.pressContinue(page)};
        o.step5.errorDialog = await errDialog().waitFor({timeout: 10_000}).then(() => true).catch(() => false);
        o.step5.errorDialogText = o.step5.errorDialog ? L.flat(await errDialog().innerText().catch(() => null), 200) : null;
        await L.sleep(1500);
        o.step5.step = await L.currentStep(page);
        o.step5.field = await readField();
        o.step5.writes = writes(t0);
        await snap('continue', o.step5);
        // 6: OK in the dialog (when there is one).
        if (o.step5.errorDialog) await errDialog().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await page.waitForTimeout(Math.max(0, t0 + 10_000 - Date.now()));
        o.step6 = {step: await L.currentStep(page), footer: await footerLog(t0), controls: await L.readControls(page), pageErrors: errsSince(t0)};
        const s6 = await snap('after-ok', o.step6);
        o.step6.reviewChecking = /Checking your submission/.test((s6.text && s6.text.main) || '');
        o.step6.reviewRelationText = L.flat((((s6.text && s6.text.main) || '').match(/Relation status[\s\S]{0,200}/) || [])[0], 220);
        // 7: Back to the relation step (a fix may have brought the author there already).
        if (L.endAnchored(o.relationStep).test(await L.currentStep(page))) o.step7 = {alreadyOnStep: true};
        else {
            o.step7 = {alreadyOnStep: false};
            await L.pressBack(page, o.relationStep).catch((e) => { o.step7.backError = L.flat(e.message, 200); });
        }
        await L.sleep(1000);
        o.step7.step = await L.currentStep(page);
        o.step7.published = await published.isChecked().catch(() => null);
        o.step7.field = await readField();
        o.step7.controls = await L.readControls(page);
        await snap('back-on-step', o.step7);
    } catch (e) {
        o.error = L.flat(e.stack || e.message, 800);
        await snap('error').catch(() => {});
    } finally {
        o.allWrites = writes(0);
        o.allPageErrors = errs.map((x) => x.text);
        record(`a7-facts-${MODE}`, o);
        console.log(`[u75r3 ${app.name} ${MODE}]`, JSON.stringify(o).slice(0, 4000));
        await close();
    }
});
