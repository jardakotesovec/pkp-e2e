// U07 drift sweep 2026-10-26, chunk SW2, PART=mail: the Side effects (spec lines 472–494): the journal's
// own emails from the principal contact, the password reset from the site, the account-validation email
// from the technical support contact, and the silence of a Contact/Masthead save. Adapted from the build's
// K2 claim check phases contact, ojsissue and mail2 (shared/playwright/checks/U07/K2/k2.js).
// Entry script: sw2.js (PART=mail). Run twice, one process per app:
//   PART=mail PROBE_RUN=r1 PROBE_FEATURE=U07 PROBE_AGENT=ccSW2 bin/app-lock.sh shared ojs -- \
//       node bin/probe.js ojs shared/playwright/checks/U07/SW2/sw2.js      (then omp, ops; then PROBE_RUN=r2)
// Seeds per app (tag prefix hksw2e): a context with two managers and an author. Steps:
//   1  [OJS] an issue made on screen and published with a seeded article in it ("Publication Published"
//      before the change); [OMP/OPS] the author completes a seeded draft in the wizard (the acknowledgement)
//   2  the author asks for a password reset (sender before)
//   3  the manager fills the Contact tab (principal and support contact) and saves; the Tasks bell before
//      and after; the Contact page read signed out
//   4  the same journal email and the password reset again (senders after); the silence of the save
//      (no mail to the new contacts or the managers)
//   5  a visitor registers on the validation-variant server: the "Validate Your Account" sender
//   6  the manager saves the Masthead tab (a title change): the silence again
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot: shot0, record: rec0, idle, tag} = require('../../../probe');
const {runJobs} = require('../../../support/jobs.js');

const record = (n, d, o) => rec0(`ml-${n}`, d, o);
const shot = (p, n) => shot0(p, `ml-${n}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 3000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const cUrl = (app, ctx, p = '') => app.url(`/index.php/${ctx}${p}`);

async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message || e).slice(0, 200)}; }
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}
async function mailsSince(app, to, since) {
    const r = await app.mail._search({to});
    return (r.messages || []).filter((m) => new Date(m.Created) >= since).map((m) => ({id: m.ID, created: m.Created, from: m.From, subject: m.Subject}));
}
async function waitMail(app, to, since, {ms = 25_000, subject} = {}) {
    const end = Date.now() + ms;
    let jobsRun = false;
    for (;;) {
        let list = await mailsSince(app, to, since);
        if (subject) list = list.filter((m) => subject.test(m.subject));
        if (list.length) return list;
        if (!jobsRun && Date.now() > end - ms / 2) {
            try {
                process.env.PKP_CONFIG_FILE = app.configFile;
                process.env.TEST_API_KEY = app.testApiKey || process.env.TEST_API_KEY;
                process.env.PLAYWRIGHT_BASE_PORT = String(app.basePort);
                runJobs({appRoot: path.resolve(process.cwd(), app.root), timeoutMs: 60_000});
            } catch (e) { /* keep polling */ }
            jobsRun = true;
        }
        if (Date.now() > end) return [];
        await sleep(700);
    }
}
async function lostPassword(page, app, ctx, email, name) {
    await signOut(page).catch(() => {});
    await page.goto(cUrl(app, ctx, '/login/lostPassword'));
    await idle(page);
    await page.locator('input#email').fill(email);
    await page.locator('form#lostPasswordForm button[type="submit"]').click();
    await idle(page).catch(() => {});
    await snap(page, name);
}
async function bell(page, app, ctx) {
    await page.goto(cUrl(app, ctx, '/submissions'));
    await idle(page);
    const b = page.getByRole('button', {name: /^Tasks/}).first();
    return flat(await b.innerText().catch(() => ''), 60) + ' | ' + (await b.getAttribute('aria-label').catch(() => ''));
}
async function saveVue(page, form) {
    const w = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    await sleep(500);
    const errors = await form.locator('.pkpFieldError').allInnerTexts().catch(() => []);
    return {status: resp ? resp.status() : null, saved, errors};
}
async function publishIssueOjs(page, app, ctx, au, t, number, title) {
    const o = {};
    await page.goto(cUrl(app, ctx, '/manageIssues'));
    await idle(page);
    await page.getByRole('link', {name: 'Create Issue', exact: true}).first().click();
    const fm = page.locator('form#issueForm');
    await fm.waitFor({state: 'visible', timeout: T});
    await fm.locator('input[name="volume"]').fill('1');
    await fm.locator('input[name="number"]').fill(String(number));
    await fm.locator('input[name="year"]').fill('2026');
    await fm.locator('input[name="title[en]"]').fill(title);
    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /\/update-issue/.test(r.url()), {timeout: T});
    await fm.getByRole('button', {name: 'Save', exact: true}).click();
    o.issueCreate = (await w).status();
    await idle(page);
    await app.api.createSubmission({tag: `${t}p${number}`, context: ctx, submitter: au, title: `${title} article`, submitted: true, published: true, issue: {volume: 1, number, year: 2026}});
    await page.goto(cUrl(app, ctx, '/manageIssues'));
    await idle(page);
    const row = page.locator('tr.gridRow').filter({hasText: title});
    await row.first().waitFor({state: 'visible', timeout: T});
    await row.first().locator('a.show_extras').click();
    await page.getByRole('link', {name: 'Publish Issue', exact: true}).click();
    const dlg = page.locator('[role="dialog"]:visible').last();
    await dlg.locator('#sendIssueNotification').waitFor({state: 'visible', timeout: T});
    o.dialog = flat(await dlg.innerText(), 600);
    await dlg.locator('#sendIssueNotification').uncheck().catch(() => {});
    const w2 = page.waitForResponse((r) => r.request().method() === 'POST' && /\/publish-issue/.test(r.url()), {timeout: T});
    await dlg.getByRole('button', {name: 'OK', exact: true}).click();
    o.publish = (await w2).status();
    await idle(page);
    return o;
}


/** The author completes a seeded draft in the submission wizard on screen; the acknowledgement follows. */
async function submitOnScreen(page, app, ctx, author, tag, title) {
    const dir = process.env.PKP_SUITE_DIR || path.join(process.cwd(), 'apps', app.name, 'playwright');
    const {submissionId} = await app.api.createSubmission({tag, context: ctx, submitter: author, title, submitted: false, participants: []});
    await signIn(page, author, {contextPath: ctx});
    if (app.name === 'ojs') {
        const {SubmissionWizardPage} = require(path.join(dir, 'pages', 'SubmissionWizardPage.js'));
        const wizard = new SubmissionWizardPage(page, ctx);
        await wizard.goto(submissionId);
        await wizard.expectStep('Upload Files');
        await wizard.uploadFile();
        await wizard.continueTo('Details');
        await wizard.continueTo('Contributors');
        await wizard.continueTo('For the Editors');
        await wizard.continueToReview(submissionId);
        await wizard.submitAndConfirm();
    } else {
        const W = require(path.join(dir, 'pages', 'SubmissionWizardPages.js'));
        await page.goto(app.url(W.wizardUrl(ctx, submissionId)));
        await W.expectWizardOpen(page);
        if (app.name === 'omp') await W.completeAndSubmitDraft(page, `ms-${tag}.txt`); else await W.completeAndSubmitDraft(page);
    }
    await idle(page);
    return submissionId;
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const o = {app: app.name};
    const t = tag('hksw2e');
    const P = (s) => `${t}${s}`;
    const ctx = P('c');
    const made = await app.api.createContext({tag: ctx, context: {name: `U07 SW2 E ${t}`, acronym: 'SWE'}, users: [
        {username: P('mm'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: P('m2'), roles: ['manager'], givenName: 'Solo', familyName: 'Manager'},
        {username: P('au'), roles: ['author'], givenName: 'Aria', familyName: 'Author'},
        {username: P('r1'), roles: ['reader'], givenName: 'Rae', familyName: 'Before'},
        {username: P('r2'), roles: ['reader'], givenName: 'Ron', familyName: 'After'},
    ]});
    o.ctx = ctx; o.contextId = made.contextId;
    const auMail = `${P('au')}@mail.test`;
    const C = {name: 'Pat Principal', email: `${t}pat@mail.test`, phone: '+1 555 0100', aff: 'Principal University', addr: '1 Probe Street\nProbe City',
        sname: 'Sam Support', semail: `${t}sam@mail.test`, sphone: '+1 555 0199'};
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const fullOf = async (list) => {
        if (!list || !list[0]) return null;
        const f = await app.mail.fullMessage(list[0].id);
        return {subject: f.Subject, from: f.From, replyTo: f.ReplyTo, text: flat(f.Text, 800)};
    };
    try {
        // 1. a journal email before the change
        const since1 = new Date(Date.now() - 1000);
        await signIn(page, P('mm'), {contextPath: ctx});
        if (isOJS) {
            o.issue1 = await publishIssueOjs(page, app, ctx, P('au'), t, 1, `Issue before ${t}`);
            await snap(page, '01-issue1-published', o.issue1);
            const sinceA = new Date(Date.now() - 1000);
            try { o.sub1 = await submitOnScreen(page, app, ctx, P('au'), P('s1'), `Submitted before ${t}`); } catch (e) { o.sub1Error = String(e.message).slice(0, 300); }
            o.ackBefore = await fullOf(await waitMail(app, auMail, sinceA, {ms: 30_000, subject: /Thank you/i}));
        } else {
            o.sub1 = await submitOnScreen(page, app, ctx, P('au'), P('s1'), `Submitted before ${t}`);
            await snap(page, '01-submitted-before');
        }
        o.pubBefore = await fullOf(await waitMail(app, auMail, since1, {ms: 30_000, subject: isOJS ? /Publi|published/i : /Submission|Thank/i}));
        o.allBefore = await mailsSince(app, auMail, since1);
        // 2. password reset before
        const since2 = new Date(Date.now() - 1000);
        await lostPassword(page, app, ctx, auMail, '02-lostpassword-before');
        o.resetBefore = await fullOf(await waitMail(app, auMail, since2, {subject: /Password/i}));
        // 3. the Contact tab filled and saved
        await signIn(page, P('mm'), {contextPath: ctx});
        o.bellBefore = {mm: await bell(page, app, ctx)};
        await page.goto(cUrl(app, ctx, '/management/settings/context#contact')); await idle(page);
        await page.getByRole('tab', {name: 'Contact', exact: true}).click().catch(() => {});
        await page.locator('#contact-contactName-control').waitFor({state: 'visible', timeout: T});
        await snap(page, '03-contact-arrival');
        await page.locator('#contact-contactName-control').fill(C.name);
        await page.locator('#contact-contactEmail-control').fill(C.email);
        await page.locator('#contact-contactPhone-control').fill(C.phone);
        await page.locator('[id^="contact-contactAffiliation-control"]').first().fill(C.aff);
        await page.locator('#contact-mailingAddress-control').fill(C.addr);
        await page.locator('#contact-supportName-control').fill(C.sname);
        await page.locator('#contact-supportEmail-control').fill(C.semail);
        await page.locator('#contact-supportPhone-control').fill(C.sphone);
        const since3 = new Date(Date.now() - 1000);
        o.contactSave = await saveVue(page, page.locator('form').filter({has: page.locator('#contact-contactName-control')}).first());
        await snap(page, '04-contact-saved', {save: o.contactSave});
        await page.reload(); await idle(page);
        o.contactReload = {name: await page.locator('#contact-contactName-control').inputValue().catch(() => null), email: await page.locator('#contact-contactEmail-control').inputValue().catch(() => null), support: await page.locator('#contact-supportEmail-control').inputValue().catch(() => null)};
        o.bellAfter = {mm: await bell(page, app, ctx)};
        await signOut(page);
        await page.goto(cUrl(app, ctx, '/about/contact')); await idle(page);
        const cs = await snap(page, '05-contact-page');
        o.contactPage = flat(cs.text.main, 800);
        // 4. the journal email and the password reset after
        const since4 = new Date(Date.now() - 1000);
        await signIn(page, P('mm'), {contextPath: ctx});
        if (isOJS) {
            o.issue2 = await publishIssueOjs(page, app, ctx, P('au'), t, 2, `Issue after ${t}`);
            await snap(page, '06-issue2-published', o.issue2);
            const sinceB = new Date(Date.now() - 1000);
            try { o.sub2 = await submitOnScreen(page, app, ctx, P('au'), P('s2'), `Submitted after ${t}`); } catch (e) { o.sub2Error = String(e.message).slice(0, 300); }
            o.ackAfter = await fullOf(await waitMail(app, auMail, sinceB, {ms: 30_000, subject: /Thank you/i}));
        } else {
            o.sub2 = await submitOnScreen(page, app, ctx, P('au'), P('s2'), `Submitted after ${t}`);
            await snap(page, '06-submitted-after');
        }
        o.pubAfter = await fullOf(await waitMail(app, auMail, since4, {ms: 30_000, subject: isOJS ? /Publi|published/i : /Submission|Thank/i}));
        o.allAfter = await mailsSince(app, auMail, since4);
        const since5 = new Date(Date.now() - 1000);
        await lostPassword(page, app, ctx, auMail, '07-lostpassword-after');
        o.resetAfter = await fullOf(await waitMail(app, auMail, since5, {subject: /Password/i}));
        o.silenceContact = {};
        for (const a of [C.email, C.semail, `${P('mm')}@mail.test`, `${P('m2')}@mail.test`]) o.silenceContact[a] = (await mailsSince(app, a, since3)).map((m) => m.subject);
        // 5. "Validate Your Account" on the validation-variant server
        const v = app.variant('validation');
        const regUser = P('reg');
        const regMail = `${regUser}@mail.test`;
        try {
            await page.goto(`${v}/index.php/${ctx}/user/register`);
            await idle(page).catch(() => {});
            const fr = page.locator('form#register');
            await fr.locator('input[name="givenName"]').fill('Reggie');
            await fr.locator('input[name="familyName"]').fill('Register');
            const aff = fr.locator('input[name="affiliation"]'); if (await aff.count()) await aff.fill('Probe U');
            const ctry = fr.locator('select[name="country"]'); if (await ctry.count()) await ctry.selectOption({label: 'Canada'});
            await fr.locator('input[name="email"]').fill(regMail);
            await fr.locator('input[name="username"]').fill(regUser);
            await fr.locator('input[name="password"]').fill(`${regUser}${regUser}`);
            await fr.locator('input[name="password2"]').fill(`${regUser}${regUser}`);
            const pc = fr.locator('input[name="privacyConsent"]'); if (await pc.count()) await pc.check();
            await page.waitForFunction(() => !window.customElements || !document.querySelector('altcha-widget') || !!customElements.get('altcha-widget'), undefined, {timeout: 30_000}).catch(() => {});
            const since6 = new Date(Date.now() - 1000);
            await fr.locator('button.submit').click();
            await page.waitForLoadState('load').catch(() => {});
            await idle(page).catch(() => {});
            await snap(page, '08-register-validation');
            o.validation = await fullOf(await waitMail(app, regMail, since6, {ms: 30_000}));
        } catch (e) { o.validationError = String(e.message || e).slice(0, 400); }
        await signOut(page, {origin: v}).catch(() => {});
        // 6. the Masthead tab saved: silence
        await signIn(page, P('mm'), {contextPath: ctx});
        o.bellBeforeMasthead = {mm: await bell(page, app, ctx)};
        await page.goto(cUrl(app, ctx, '/management/settings/context')); await idle(page);
        const title = page.locator('[id^="masthead-name-control"]').first();
        await title.waitFor({state: 'visible', timeout: T});
        await title.fill(`U07 SW2 E renamed ${t}`);
        const country = page.locator('#masthead-country-control');
        if ((await country.count()) && !(await country.inputValue())) await country.selectOption('CA');
        const since7 = new Date(Date.now() - 1000);
        o.mastheadSave = await saveVue(page, page.locator('form').filter({has: title}).first());
        await snap(page, '09-masthead-saved', {save: o.mastheadSave});
        o.bellAfterMasthead = {mm: await bell(page, app, ctx)};
        await sleep(4000);
        o.silenceMasthead = {};
        for (const a of [C.email, C.semail, `${P('mm')}@mail.test`, `${P('m2')}@mail.test`, auMail]) o.silenceMasthead[a] = (await mailsSince(app, a, since7)).map((m) => m.subject);
    } catch (e) {
        o.error = String(e.stack || e).slice(0, 1500);
        await shot(page, 'error').catch(() => {});
    } finally {
        o.dialogs = dialogs;
        record('mail', o);
        await close();
    }
});
