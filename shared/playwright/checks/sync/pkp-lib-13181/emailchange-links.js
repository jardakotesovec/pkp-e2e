// Regression re-check for pkp/pkp-lib#13181 (commits 4d9ec3cbd0, aeac6f75cf), kept from the 2026-09-17 sync
// (docs/tracking/ci-triage.md "Open regressions", docs/reports/2026-09-17-pkp-lib-13181.md). The email-change
// links on OJS, through the screens, in three scratch journals made here (re-runnable from a fresh database):
//   s2  a one-journal account: confirm, reject, signed-out confirm (the control: all land on the journal's Contact tab)
//   s3  an account with roles in two journals, signed in at journal A: "confirm" and "reject" land on
//       index/<locale>/user/profile#contact (the site-level profile); fixed when both land on {A}/user/profile#contact
//   s4  a pending request's "reject" link in the shape the pre-change code mailed ({journal}/invitation/decline),
//       one-language journal on a two-language site: "Confirm Decline Invitation" ends in GET 500, request still
//       pending; fixed when s4.chain ends on the Contact tab and s4.stillPending is 0
// Verdict from check-13181-emailchange-<app>.json in the agent's output folder. No assertions: the script records.
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13181/emailchange-links.js
const {forEachApp, launch, signIn, screen, shot, record, note, idle, tag} =
    require('../../../probe');

const SUBJECT = 'Confirm account contact email change request';

/** Main-frame document responses, so a redirect chain reads as data. */
function trackChain(page, app) {
    const chain = [];
    page.on('response', (res) => {
        if (res.request().resourceType() !== 'document' || res.frame() !== page.mainFrame()) return;
        chain.push(`${res.request().method()} ${res.status()} ${res.url().replace(app.baseURL, '').replace(/key=[^&]+/, 'key=…')}`);
    });
    return {take: () => chain.splice(0, chain.length)};
}

async function links(mail, {to, contains}) {
    const summary = await mail.find({to, contains, timeoutMs: 30000});
    const full = await mail.fullMessage(summary.ID);
    const grab = (op) => {
        const m = full.HTML.match(new RegExp(`href=['"]([^'"]*/invitation/${op}\\?[^'"]+)['"]`, 'i'));
        return m ? m[1].replace(/&amp;/g, '&') : null;
    };
    return {subject: full.Subject, confirm: grab('accept'), reject: grab('decline')};
}

const mask = (u) => (u || '').replace(/key=[^&]+/, 'key=…');

forEachApp(async (app) => {
    const {ProfilePage} = require('../../../pages/ProfilePage.js');
    const {LoginPage} = require('../../../pages/LoginPage.js');

    const one = tag('rr10e1'); // S2, S4: the one-journal account's journal (one language)
    const a = tag('rr10ea'); // S3: journal A
    const b = tag('rr10eb'); // S3: journal B
    const u1 = `${one}au`;
    const u2 = `${a}au`;
    await app.api.createContext({tag: one, users: [{username: u1, givenName: 'Una', familyName: 'Single', roles: ['author']}]});
    await app.api.createContext({tag: a, users: [{username: u2, givenName: 'Dua', familyName: 'Double', roles: ['author']}]});
    await app.api.createContext({tag: b, users: [{username: u2, roles: ['author']}]});

    const out = {journals: {one, a, b}, s2: {}, s3: {}, s4: {}};
    const first = await launch(app);
    const anon = await launch(app);
    const page = first.page;
    const chain = trackChain(page, app);
    const anonChain = trackChain(anon.page, app);

    async function requestChange(profile, newEmail) {
        await profile.goto('contact');
        await profile.country().selectOption({label: 'Canada'});
        await profile.email().fill(newEmail);
        await profile.save();
        await profile.pendingEmailNotice().waitFor({state: 'visible', timeout: 30000});
    }

    async function landing(p, profile) {
        await idle(p).catch(() => {});
        const s = await screen(p);
        const header = (s.text.header || '').replace(/\s+/g, ' ').slice(0, 300);
        return {
            url: mask(p.url().replace(app.baseURL, '')),
            title: s.title,
            header,
            contactFormVisible: await profile.form('contact').isVisible().catch(() => false),
            email: await profile.email().inputValue().catch(() => null),
            pendingNotice: await profile.pendingEmailNotice().count().catch(() => null),
            toast: await profile.toast.innerText().catch(() => null),
            mainStart: (s.text.main || '').replace(/\s+/g, ' ').slice(0, 300),
        };
    }

    try {
        // ---- S2: one-journal account -------------------------------------------------
        await signIn(page, u1, {contextPath: one});
        const p1 = new ProfilePage(page, one);
        const e1 = `${u1}n1@mail.test`;
        await requestChange(p1, e1);
        const l1 = await links(app.mail, {to: `${u1}@mail.test`, contains: e1});
        out.s2.links = {confirm: mask(l1.confirm), reject: mask(l1.reject)};

        // (a) confirm, signed in
        chain.take();
        await page.goto(l1.confirm);
        out.s2.a = {landing: await landing(page, p1), chain: chain.take()};
        await shot(page, 's2a-confirm-signed-in');

        // (b) reject, signed in
        const e2 = `${u1}n2@mail.test`;
        await requestChange(p1, e2);
        const l2 = await links(app.mail, {to: e1, contains: e2});
        chain.take();
        const rejectResponse = await page.goto(l2.reject);
        const declineScreen = await screen(page);
        out.s2.b = {
            declineStatus: rejectResponse && rejectResponse.status(),
            declineUrl: mask(page.url().replace(app.baseURL, '')),
            declineMain: (declineScreen.text.main || '').replace(/\s+/g, ' ').slice(0, 300),
            formAction: mask(await page.locator('form[method="post"]').first().getAttribute('action').catch(() => null)),
        };
        await shot(page, 's2b-decline-page');
        const confirmButton = page.getByRole('button', {name: 'Confirm Decline Invitation', exact: true});
        if (await confirmButton.count()) {
            await confirmButton.click();
            await page.waitForLoadState('load').catch(() => {});
            out.s2.b.landing = await landing(page, p1);
        }
        out.s2.b.chain = chain.take();
        await shot(page, 's2b-after-decline');

        // (c) confirm, signed out, then sign in
        const e3 = `${u1}n3@mail.test`;
        await requestChange(p1, e3);
        const l3 = await links(app.mail, {to: e1, contains: e3});
        anonChain.take();
        await anon.page.goto(l3.confirm);
        const loginScreen = await screen(anon.page);
        out.s2.c = {
            loginUrl: mask(anon.page.url().replace(app.baseURL, '')),
            loginHeader: (loginScreen.text.header || '').replace(/\s+/g, ' ').slice(0, 200),
            loginFormVisible: await anon.page.locator('form#login').isVisible().catch(() => false),
        };
        await shot(anon.page, 's2c-login-page');
        if (out.s2.c.loginFormVisible) {
            await new LoginPage(anon.page).signIn(u1, `${u1}${u1}`);
            await anon.page.waitForLoadState('load').catch(() => {});
            out.s2.c.landing = await landing(anon.page, new ProfilePage(anon.page, one));
        }
        out.s2.c.chain = anonChain.take();
        await shot(anon.page, 's2c-after-sign-in');

        // (d) a used confirm link, signed out: the two buttons' addresses
        await anon.page.goto(`${app.baseURL}/index.php/index/login/signOut`);
        anonChain.take();
        await anon.page.goto(l1.confirm);
        const used = await screen(anon.page);
        out.s2.d = {
            url: mask(anon.page.url().replace(app.baseURL, '')),
            main: (used.text.main || '').replace(/\s+/g, ' ').slice(0, 300),
            buttons: await anon.page.locator('.page_invitation_unavailable a').evaluateAll((els) => els.map((el) => `${el.textContent.trim()} -> ${el.getAttribute('href')}`)),
            chain: anonChain.take(),
        };
        await shot(anon.page, 's2d-used-link');

        // ---- S4: a pre-change "reject" link (journal path where the new code writes index) ----
        const e4 = `${u1}n4@mail.test`;
        await requestChange(p1, e4);
        const l4 = await links(app.mail, {to: e3, contains: e4});
        const oldShape = l4.reject.replace(/\/index\.php\/index\/(?:[a-z]{2}(?:_[A-Za-z]+)?\/)?invitation\//, `/index.php/${one}/invitation/`);
        out.s4.mailed = mask(l4.reject);
        out.s4.opened = mask(oldShape);
        chain.take();
        const r4 = await page.goto(oldShape);
        out.s4.declineStatus = r4 && r4.status();
        out.s4.formAction = mask(await page.locator('form[method="post"]').first().getAttribute('action').catch(() => null));
        await shot(page, 's4-decline-page');
        const confirm4 = page.getByRole('button', {name: 'Confirm Decline Invitation', exact: true});
        if (await confirm4.count()) {
            await confirm4.click();
            await page.waitForLoadState('load').catch(() => {});
            await page.waitForTimeout(1500);
            const after = await screen(page);
            out.s4.after = {
                url: mask(page.url().replace(app.baseURL, '')),
                title: after.title,
                main: (after.text.main || '').replace(/\s+/g, ' ').slice(0, 400),
            };
            await shot(page, 's4-after-confirm');
        }
        out.s4.chain = chain.take();
        await p1.goto('contact');
        out.s4.stillPending = await p1.pendingEmailNotice().count();
        out.s4.emailAfter = await p1.email().inputValue();
        // Control: the same request's mailed (new-shape) reject link, unrewritten.
        if (out.s4.stillPending) {
            chain.take();
            await page.goto(l4.reject);
            const c = page.getByRole('button', {name: 'Confirm Decline Invitation', exact: true});
            if (await c.count()) {
                await c.click();
                await page.waitForLoadState('load').catch(() => {});
            }
            out.s4.control = {landing: await landing(page, p1), chain: chain.take()};
        }

        // ---- S3: two-journal account, signed in at journal A ---------------------------
        await signIn(page, u2, {contextPath: a});
        const pa = new ProfilePage(page, a);
        const f1 = `${u2}n1@mail.test`;
        await requestChange(pa, f1);
        out.s3.requestedAt = page.url().replace(app.baseURL, '');
        const m1 = await links(app.mail, {to: `${u2}@mail.test`, contains: f1});
        out.s3.links = {confirm: mask(m1.confirm), reject: mask(m1.reject)};
        chain.take();
        await page.goto(m1.confirm);
        out.s3.confirm = {landing: await landing(page, pa), chain: chain.take()};
        await shot(page, 's3-confirm-signed-in');
        const f2 = `${u2}n2@mail.test`;
        await requestChange(pa, f2);
        const m2 = await links(app.mail, {to: f1, contains: f2});
        chain.take();
        await page.goto(m2.reject);
        const c3 = page.getByRole('button', {name: 'Confirm Decline Invitation', exact: true});
        if (await c3.count()) {
            await c3.click();
            await page.waitForLoadState('load').catch(() => {});
        }
        out.s3.reject = {landing: await landing(page, pa), chain: chain.take()};
        await shot(page, 's3-reject-signed-in');
    } catch (e) {
        out.error = String((e && e.stack) || e);
        await shot(page, 'emailchange-error').catch(() => {});
    } finally {
        record('check-13181-emailchange', out);
        await first.close();
        await anon.close();
    }
    note(`rr10 13181 email change: scratch journals ${one}, ${a}, ${b}; see .reports/sync/rr10/check-13181-emailchange-${app.name}.json`);
    console.log(JSON.stringify(out, null, 1));
});
