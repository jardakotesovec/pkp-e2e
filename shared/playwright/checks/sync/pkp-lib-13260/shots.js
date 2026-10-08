// PR review of pkp/pkp-lib#13242: the screenshots of the report's findings 3
// to 6 and 8 to 10, the same pages on both sides. Run once on the apps' tips
// (SIDE=before) and once at the PR heads (SIDE=after), each on a freshly
// loaded default dataset (OJS, `fleet-prep --dataset --reset`); the Default
// theme throughout, "Eidos" never enabled.
// Run: SIDE=before PROBE_FEATURE=pr13242 PROBE_AGENT=shots node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13260/shots.js
// Writes <side>-<nn>-<name>-ojs.png and facts-<side>-ojs.json to .reports/pr13242/shots/.
const path = require('path');
const {forEachApp, launch, signIn, record, serverLog, sql, outDir} = require('../../../probe');

const SIDE = process.env.SIDE || 'after';
const J = '/index.php/publicknowledge/en';
const flat = (t, n = 300) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const file = (app, name) => path.join(outDir(), `${SIDE}-${name}-${app.name}.png`);

async function open(page, address) {
    const response = await page.goto(address, {waitUntil: 'load'}).catch(() => null);
    await page.waitForTimeout(1500);
    return {
        address,
        status: response ? response.status() : null,
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        title: await page.title().catch(() => null),
        h1: await page.locator('h1').allInnerTexts().catch(() => []),
        main: flat(await page.locator('.pkp_structure_main, main').first().innerText().catch(() => page.locator('body').innerText().catch(() => '')), 400),
    };
}
const snap = (app, page, name) => page.screenshot({path: file(app, name)});
async function snapPart(app, page, name, locator) {
    if (!(await locator.count())) return 'absent';
    await locator.first().scrollIntoViewIfNeeded().catch(() => {});
    await locator.first().screenshot({path: file(app, name)});
    return 'shot';
}
async function api(page, method, address, body) {
    return page.evaluate(async ({method, address, body}) => {
        const res = await fetch(address, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.pkp?.currentUser?.csrfToken ?? ''},
            body: body ? JSON.stringify(body) : undefined,
        });
        return {status: res.status, body: (await res.text()).slice(0, 200)};
    }, {method, address, body});
}

forEachApp(async (app) => {
    const out = {side: SIDE};
    const log = serverLog(app);
    const from = log.mark();
    const visitor = await launch(app);
    const editor = await launch(app);
    const author = await launch(app);
    visitor.page.setViewportSize({width: 1280, height: 760});
    author.page.setViewportSize({width: 1280, height: 560});
    try {
        // 10: the journal's home page; 8: article 1
        out.home = await open(visitor.page, J);
        await snap(app, visitor.page, '10-home');
        out.article = await open(visitor.page, `${J}/article/view/1`);
        out.galleys = await visitor.page.locator('a.obj_galley_link').evaluateAll((links) => links.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
        await snap(app, visitor.page, '08-article');

        // 4: the refusal page
        await signIn(author.page, 'amwandenga', {contextPath: 'publicknowledge'});
        out.denied = await open(author.page, `${J}/management/settings/website`);
        await snap(app, author.page, '04-denied');

        // 6: the login page's message, a key on both sides; a typed sentence after only
        visitor.page.setViewportSize({width: 1280, height: 620});
        out.loginKey = await open(visitor.page, `${J}/login?loginMessage=user.login.loginError`);
        await snap(app, visitor.page, '06-login-key');
        if (SIDE === 'after') {
            out.loginHtml = await open(visitor.page, `${J}/login?loginMessage=${encodeURIComponent('Your session has expired. <a href="https://example.org/">Sign in here</a> instead.')}`);
            out.loginHtmlLink = await visitor.page.locator('.page_login a[href="https://example.org/"]').count();
            await snap(app, visitor.page, '06-login-html');
        }
        out.resetLink = await open(visitor.page, `${J}/login/resetPassword/dbarnes?confirm=abc`);

        // 5: registration closed
        await signIn(editor.page, 'dbarnes', {contextPath: 'publicknowledge'});
        await editor.page.goto(`${J}/management/settings/website`, {waitUntil: 'load'});
        out.regOff = (await api(editor.page, 'PUT', '/index.php/publicknowledge/api/v1/contexts/1', {disableUserReg: true})).status;
        out.closed = await open(visitor.page, `${J}/user/register`);
        await snap(app, visitor.page, '05-registration-closed');
        out.regOn = (await api(editor.page, 'PUT', '/index.php/publicknowledge/api/v1/contexts/1', {disableUserReg: false})).status;

        // 9: comments on the Default theme
        out.commentsOn = (await api(editor.page, 'PUT', '/index.php/publicknowledge/api/v1/contexts/1', {enablePublicComments: true})).status;
        await open(editor.page, `${J}/article/view/1`);
        const box = editor.page.locator('#public-comments textarea').first();
        if (await box.count()) {
            await box.fill('Is the dataset behind table 2 available?');
            const wrote = editor.page.waitForResponse((r) => /\/api\/v1\/comments/.test(r.url()) && r.request().method() === 'POST', {timeout: 20_000}).catch(() => null);
            await editor.page.locator('#public-comments button').filter({hasText: /submit|comment/i}).last().click().catch((e) => { out.commentClick = e.message.slice(0, 120); });
            const res = await wrote;
            out.commentPost = res ? res.status() : 'no POST seen';
            sql(app, 'update user_comments set is_approved = true');
        }
        visitor.page.setViewportSize({width: 1280, height: 900});
        out.commentsArticle = await open(visitor.page, `${J}/article/view/1`);
        out.sidebar = flat(await visitor.page.locator('.entry_details .item.comments').innerText().catch(() => 'absent'));
        out.sidebarShot = await snapPart(app, visitor.page, '09-comments-sidebar', visitor.page.locator('.entry_details .item.comments'));
        out.part = flat(await visitor.page.locator('#public-comments').innerText().catch(() => 'absent'), 500);
        out.partShot = await snapPart(app, visitor.page, '09-comments-part', visitor.page.locator('#public-comments'));
        await visitor.page.locator('.entry_details').first().scrollIntoViewIfNeeded().catch(() => {});
        await snap(app, visitor.page, '09-comments-page');

        // 3: the site's home page with two journals (last: it changes the site)
        const admin = await launch(app);
        await signIn(admin.page, 'admin', {password: 'admin'});
        await admin.page.goto('/index.php/index/en/admin', {waitUntil: 'load'});
        out.secondJournal = await api(admin.page, 'POST', '/index.php/index/api/v1/contexts', {
            urlPath: 'second', name: {en: 'Second Journal'}, primaryLocale: 'en', supportedLocales: ['en'],
            contactName: 'Site Admin', contactEmail: 'pkpadmin@mailinator.com', enabled: true,
        });
        await admin.close();
        visitor.page.setViewportSize({width: 1280, height: 620});
        out.siteHome = await open(visitor.page, '/index.php/index');
        await snap(app, visitor.page, '03-site-home');
        out.log = log.since(from).filter((l) => !/plugin-gallery|pkp\.sfu\.ca|PluginGalleryDAO/.test(l)).map((l) => flat(l, 400)).slice(0, 10);
    } finally {
        record(`facts-${SIDE}`, out);
        await visitor.close();
        await editor.close();
        await author.close();
    }
});
