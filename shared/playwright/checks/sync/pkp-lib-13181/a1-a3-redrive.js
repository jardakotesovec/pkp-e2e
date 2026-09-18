// Re-drive of U03 register entries A1 and A3 after pkp/pkp-lib#13181 (4d9ec3cbd0, aeac6f75cf) reached OMP and OPS
// (2026-09-18 sync). Sibling of emailchange-links.js (whose key `s3` carries A18). Scratch contexts made here:
//   a3  an account with roles in two scratch contexts requests an email change on the SITE-LEVEL profile's Contact
//       tab (index/user/profile/contact): "reject" signed in (Decline Invitation page, Confirm Decline Invitation,
//       landing), "confirm" on a second request (the control), "reject" signed out on a third. A3 is fixed when
//       a3.reject.declineStatus is 200, a3.reject.landing shows the Contact tab and pendingNotice 0.
//   a1  a one-context account opens index/user/profile/{roles,contact,notificationSettings}, index/en/user/profile/roles,
//       the site-level registration page's "Login" link (source=…/user/profile/roles) and the site-level completion
//       page's "Edit My Profile"; the two-context account is the control. A1 is fixed when every one-context landing
//       reads {context}/user/profile#<tab> with that tab open and no "?0=" in the address.
// No assertions: the script records. Verdict from a1-a3-redrive-<app>.json in the agent's output folder.
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13181/a1-a3-redrive.js
const {forEachApp, launch, signIn, screen, shot, record, note, idle, tag} =
    require('../../../probe');

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
const flat = (s, n = 300) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

forEachApp(async (app) => {
    const {ProfilePage} = require('../../../pages/ProfilePage.js');
    const {LoginPage} = require('../../../pages/LoginPage.js');

    const one = tag('s18c1');
    const a = tag('s18ca');
    const b = tag('s18cb');
    const u1 = `${one}au`;
    const u2 = `${a}au`;
    await app.api.createContext({tag: one, users: [{username: u1, givenName: 'Una', familyName: 'Single', roles: ['author']}]});
    await app.api.createContext({tag: a, users: [{username: u2, givenName: 'Dua', familyName: 'Double', roles: ['author']}]});
    await app.api.createContext({tag: b, users: [{username: u2, roles: ['author']}]});

    const out = {contexts: {one, a, b}, a3: {}, a1: {one: {}, two: {}}};
    const first = await launch(app);
    const anon = await launch(app);
    const page = first.page;
    const chain = trackChain(page, app);
    const anonChain = trackChain(anon.page, app);
    const rel = (p) => mask(p.url().replace(app.baseURL, ''));

    async function requestChange(profile, newEmail) {
        await profile.goto('contact');
        await profile.country().selectOption({label: 'Canada'});
        await profile.email().fill(newEmail);
        await profile.save();
        await profile.pendingEmailNotice().waitFor({state: 'visible', timeout: 30000});
    }

    /** The profile page as landed: address, title, header, open tab, Contact-tab facts. Saves the screen() snapshot. */
    async function landing(p, profile, name) {
        await idle(p).catch(() => {});
        await p.waitForTimeout(500);
        const s = await screen(p);
        record(name, s);
        await shot(p, name);
        return {
            snapshot: `${name}-${app.name}.json`,
            url: rel(p),
            title: s.title,
            header: flat(s.text.header),
            activeTab: await p.locator('#profileTabs > ul > li.ui-tabs-active > a').innerText().catch(() => null),
            visibleForm: await p.locator('#profileTabs .ui-tabs-panel:visible form').first().getAttribute('id').catch(() => null),
            email: await profile.email().inputValue({timeout: 2000}).catch(() => null),
            pendingNotice: await profile.pendingEmailNotice().count().catch(() => null),
            pendingText: flat(await profile.pendingEmailNotice().first().innerText({timeout: 1000}).catch(() => ''), 200),
            toast: flat(await profile.toast.innerText({timeout: 2000}).catch(() => ''), 100),
        };
    }

    async function declinePage(p, name) {
        const s = await screen(p);
        record(name, s);
        await shot(p, name);
        return {
            snapshot: `${name}-${app.name}.json`,
            url: rel(p),
            title: s.title,
            heading: await p.getByRole('heading', {level: 1}).first().innerText({timeout: 2000}).catch(() => null),
            main: flat(s.text.main, 400),
            buttons: await p.getByRole('button').evaluateAll((els) => els.filter((el) => el.offsetParent).map((el) => el.textContent.trim())).catch(() => []),
            formAction: mask(await p.locator('form[method="post"]').first().getAttribute('action', {timeout: 2000}).catch(() => null)),
        };
    }

    try {
        // ---- A3: a site-level request by the two-context account ---------------------------
        await signIn(page, u2);
        out.a3.signInLanding = rel(page);
        const site = new ProfilePage(page, null);
        const f1 = `${u2}n1@mail.test`;
        await requestChange(site, f1);
        out.a3.requestedAt = await landing(page, site, 'a3-request-pending');
        const m1 = await links(app.mail, {to: `${u2}@mail.test`, contains: f1});
        out.a3.links = {subject: m1.subject, confirm: mask(m1.confirm), reject: mask(m1.reject)};

        // reject, signed in
        chain.take();
        const r1 = await page.goto(m1.reject);
        out.a3.reject = {declineStatus: r1 && r1.status(), decline: await declinePage(page, 'a3-reject-decline-page')};
        const c1 = page.getByRole('button', {name: 'Confirm Decline Invitation', exact: true});
        if (await c1.count()) {
            await c1.click();
            await page.waitForLoadState('load').catch(() => {});
            out.a3.reject.landing = await landing(page, site, 'a3-reject-landing');
        }
        out.a3.reject.chain = chain.take();
        await site.goto('contact');
        out.a3.reject.afterReload = {
            pendingNotice: await site.pendingEmailNotice().count(),
            email: await site.email().inputValue(),
            emailEditable: await site.email().isEditable(),
        };
        // the used reject link, opened again
        chain.take();
        const r1b = await page.goto(m1.reject);
        out.a3.rejectUsedAgain = {status: r1b && r1b.status(), page: await declinePage(page, 'a3-reject-used-again'), chain: chain.take()};

        // confirm, signed in (the control, a second request)
        const f2 = `${u2}n2@mail.test`;
        await requestChange(site, f2);
        const m2 = await links(app.mail, {to: `${u2}@mail.test`, contains: f2});
        chain.take();
        await page.goto(m2.confirm);
        out.a3.confirm = {link: mask(m2.confirm), landing: await landing(page, site, 'a3-confirm-landing'), chain: chain.take()};

        // reject, signed out (a third request)
        const f3 = `${u2}n3@mail.test`;
        await requestChange(site, f3);
        const m3 = await links(app.mail, {to: f2, contains: f3});
        anonChain.take();
        const r3 = await anon.page.goto(m3.reject);
        out.a3.rejectSignedOut = {declineStatus: r3 && r3.status(), decline: await declinePage(anon.page, 'a3-reject-signedout-decline-page')};
        const c3 = anon.page.getByRole('button', {name: 'Confirm Decline Invitation', exact: true});
        if (await c3.count()) {
            await c3.click();
            await anon.page.waitForLoadState('load').catch(() => {});
            const s = await screen(anon.page);
            record('a3-reject-signedout-after', s);
            await shot(anon.page, 'a3-reject-signedout-after');
            out.a3.rejectSignedOut.after = {
                snapshot: `a3-reject-signedout-after-${app.name}.json`,
                url: rel(anon.page),
                title: s.title,
                loginFormVisible: await anon.page.locator('form#login').isVisible().catch(() => false),
            };
        }
        out.a3.rejectSignedOut.chain = anonChain.take();
        await site.goto('contact');
        out.a3.rejectSignedOut.signedInTabAfter = {
            pendingNotice: await site.pendingEmailNotice().count(),
            email: await site.email().inputValue(),
        };

        // ---- A1 control: the two-context account stays at the site level ---------------------
        for (const [key, path] of [
            ['roles', 'index/user/profile/roles'],
            ['contact', 'index/user/profile/contact'],
            ['notificationSettings', 'index/user/profile/notificationSettings'],
            ['roles-en', 'index/en/user/profile/roles'],
        ]) {
            chain.take();
            await page.goto(`/index.php/${path}`);
            out.a1.two[key] = {opened: path, landing: await landing(page, site, `a1-two-${key}`), chain: chain.take()};
        }

        // ---- A1: the one-context account ------------------------------------------------------
        await signIn(page, u1);
        out.a1.one.signInLanding = rel(page);
        const p1 = new ProfilePage(page, one);
        for (const [key, path] of [
            ['roles', 'index/user/profile/roles'],
            ['contact', 'index/user/profile/contact'],
            ['notificationSettings', 'index/user/profile/notificationSettings'],
            ['publicProfile', 'index/user/profile/publicProfile'],
            ['roles-en', 'index/en/user/profile/roles'],
            ['no-tab', 'index/user/profile'],
        ]) {
            chain.take();
            await page.goto(`/index.php/${path}`);
            out.a1.one[key] = {opened: path, landing: await landing(page, p1, `a1-one-${key}`), chain: chain.take()};
        }

        // the site-level completion page (what index/user/register shows a signed-in user) and its "Edit My Profile"
        chain.take();
        await page.goto('/index.php/index/user/register');
        const comp = await screen(page);
        record('a1-one-completion-page', comp);
        await shot(page, 'a1-one-completion-page');
        const edit = page.getByRole('link', {name: 'Edit My Profile', exact: true});
        out.a1.one.completion = {
            snapshot: `a1-one-completion-page-${app.name}.json`,
            url: rel(page),
            title: comp.title,
            links: await page.locator('ul.registration_complete_actions a, .page_register_complete a, .registration_complete_actions a').evaluateAll((els) => els.map((el) => `${el.textContent.trim()} -> ${el.getAttribute('href')}`)).catch(() => []),
            editHref: await edit.first().getAttribute('href', {timeout: 2000}).catch(() => null),
        };
        if (await edit.count()) {
            await edit.first().click();
            await page.waitForLoadState('load').catch(() => {});
            out.a1.one.completion.landing = await landing(page, p1, 'a1-one-completion-edit-my-profile');
        }
        out.a1.one.completion.chain = chain.take();

        // the site-level registration page's "Login" link (source = …/user/profile/roles), signed out, then sign in
        anonChain.take();
        await anon.page.goto('/index.php/index/user/register');
        const reg = await screen(anon.page);
        record('a1-registration-page', reg);
        const loginLink = anon.page.locator('form#register a.login, form.cmp_form.register a.login, a.login').first();
        out.a1.one.registrationLogin = {
            snapshot: `a1-registration-page-${app.name}.json`,
            url: rel(anon.page),
            loginHref: await loginLink.getAttribute('href', {timeout: 3000}).catch(() => null),
        };
        if (out.a1.one.registrationLogin.loginHref) {
            await loginLink.click();
            await anon.page.waitForLoadState('load').catch(() => {});
            out.a1.one.registrationLogin.loginUrl = rel(anon.page);
            record('a1-registration-login-page', await screen(anon.page));
            await new LoginPage(anon.page).signIn(u1, `${u1}${u1}`);
            await anon.page.waitForLoadState('load').catch(() => {});
            out.a1.one.registrationLogin.landing = await landing(anon.page, new ProfilePage(anon.page, one), 'a1-one-registration-login-landing');
        }
        out.a1.one.registrationLogin.chain = anonChain.take();
    } catch (e) {
        out.error = String((e && e.stack) || e);
        await shot(page, 'a1-a3-error').catch(() => {});
    } finally {
        record('a1-a3-redrive', out);
        await first.close();
        await anon.close();
    }
    note(`a1-a3-redrive (U03 A1/A3 after pkp-lib#13181): scratch contexts ${one}, ${a}, ${b}; site-level profile is new ProfilePage(page, null); see a1-a3-redrive-${app.name}.json`);
    console.log(JSON.stringify(out, null, 1));
});
