// PR review of pkp/pkp-lib#13242 (pkp-lib#13260, ui-library#972, ojs#5784,
// crossref-ojs#107: the Blade theme "Eidos"). What a journal that stays on
// the Default theme shows with the change in place, and what switching one
// journal to Eidos does. OJS, PKP's default test dataset (a dataset fleet).
//
// Phases (PHASES=a,b; default `default`):
//   default   a visitor on the Default theme: the journal's home page, article
//             1 (its galley links, its style sheets, its Vue elements), the
//             login page with a `loginMessage` in the address, the
//             access-denied page as an author, a closed-registration message
//   comments  public comments switched on (dbarnes), the article page's
//             comments part on the Default theme, one comment written
//   eidos     "Eidos" enabled under Plugins and selected as the theme
//             (dbarnes), then the home page, article 1, the login page and
//             the access-denied page; the theme back to Default at the end
// Each phase records what the server log gained (errors, 5xx).
// Run: PROBE_FEATURE=pr13242 PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13260/default-theme.js
const {forEachApp, launch, signIn, shot, record, serverLog, sql} = require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['default'];
const on = (p) => PHASES.includes(p);
const T = 20_000;
const flat = (t, n = 600) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const J = '/index.php/publicknowledge/en';

// What a page shows: status, heading, main text, style sheets, unknown custom elements.
async function read(page, address, name) {
    const response = await page.goto(address, {waitUntil: 'load'}).catch((e) => ({status: () => `failed: ${e.message.slice(0, 80)}`}));
    await page.waitForTimeout(1500);
    const facts = await page.evaluate(() => {
        const text = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('.pkp_structure_main, main, .system-main');
        return {
            title: document.title,
            h1: [...document.querySelectorAll('h1')].map((h) => text(h)),
            main: text(main)?.slice(0, 700) ?? text(document.body)?.slice(0, 700),
            sheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href').replace(/^.*\/index\.php/, '').replace(/^https?:\/\/[^/]+/, '')),
            bodyClass: document.body.className,
            unresolved: [...document.querySelectorAll('*')].filter((e) => e.tagName.includes('-') && e.tagName.startsWith('PKP-')).map((e) => e.tagName.toLowerCase()),
            galleys: [...document.querySelectorAll('a.obj_galley_link')].map((a) => ({text: text(a), cls: a.className, href: a.getAttribute('href')})),
            categories: [...document.querySelectorAll('.categories_listing a, .categoryHeader a')].map((a) => text(a)),
        };
    });
    const file = name ? await shot(page, name) : null;
    return {address, status: typeof response?.status === 'function' ? response.status() : null, url: page.url().replace(/^https?:\/\/[^/]+/, ''), ...facts, shot: file};
}

async function api(page, method, path, body) {
    return page.evaluate(async ({method, path, body}) => {
        const res = await fetch(path, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.pkp?.currentUser?.csrfToken ?? ''},
            body: body ? JSON.stringify(body) : undefined,
        });
        return {status: res.status, body: (await res.text()).slice(0, 400)};
    }, {method, path, body});
}

forEachApp(async (app) => {
    const out = {};
    const log = serverLog(app);
    const consoleLines = [];
    const visitor = await launch(app);
    visitor.page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLines.push(flat(m.text(), 240)); });
    const editor = await launch(app);
    try {
        if (on('default')) {
            const from = log.mark();
            out.home = await read(visitor.page, `${J}`, 'default-home');
            out.article = await read(visitor.page, `${J}/article/view/1`, 'default-article');
            out.loginMessage = await read(visitor.page, `${J}/login?loginMessage=${encodeURIComponent('Your session has expired. <a href="https://example.org/">Sign in here</a> instead.')}`, 'default-login-message');
            out.loginMessageKey = await read(visitor.page, `${J}/login?loginMessage=user.login.loginError`);
            const author = await launch(app);
            await signIn(author.page, 'amwandenga', {contextPath: 'publicknowledge'});
            out.denied = await read(author.page, `${J}/management/settings/website`, 'default-denied');
            out.deniedFree = await read(author.page, `${J}/user/authorizationDenied?message=any.words.typed.here`);
            await author.close();
            out.defaultConsole = [...new Set(consoleLines)].slice(0, 12);
            out.defaultLog = log.since(from).map((l) => flat(l, 300)).slice(0, 12);
        }
        if (on('comments') || on('eidos')) {
            await signIn(editor.page, 'dbarnes', {contextPath: 'publicknowledge'});
            await editor.page.goto(`${J}/management/settings/website`, {waitUntil: 'load'});
        }
        if (on('comments')) {
            const from = log.mark();
            out.commentsOn = await api(editor.page, 'PUT', '/index.php/publicknowledge/api/v1/contexts/1', {enablePublicComments: true});
            consoleLines.length = 0;
            out.commentsVisitor = await read(visitor.page, `${J}/article/view/1`, 'default-comments-visitor');
            out.commentsVisitorPart = await visitor.page.evaluate(() => {
                const part = document.querySelector('#public-comments, .PkpComments, [class*="PkpComments"]');
                const item = document.querySelector('.entry_details .item.comments');
                const t = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim().slice(0, 500) : null);
                return {part: t(part), partHtml: part ? part.outerHTML.slice(0, 600) : null, sidebarItem: t(item), sidebarHtml: item ? item.innerHTML.replace(/\s+/g, ' ').slice(0, 400) : null};
            });
            out.commentsEditor = await read(editor.page, `${J}/article/view/1`, 'default-comments-editor');
            const box = editor.page.locator('#public-comments textarea, .PkpComments textarea, [class*="PkpComment"] textarea').first();
            out.commentBox = await box.count();
            if (out.commentBox) {
                await box.fill('A comment written during the PR review of pkp-lib#13242.');
                const wrote = editor.page.waitForResponse((r) => /\/api\/v1\/comments/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await editor.page.locator('#public-comments button, .PkpComments button, [class*="PkpComment"] button').filter({hasText: /submit|comment|post|send/i}).first().click().catch((e) => { out.commentClick = e.message.slice(0, 120); });
                const res = await wrote;
                out.commentPost = res ? {status: res.status(), body: flat(await res.text().catch(() => ''), 300), sent: flat(res.request().postData(), 200)} : 'no POST seen';
                await editor.page.waitForTimeout(1500);
                out.commentsAfter = await shot(editor.page, 'default-comments-after');
            }
            out.commentRows = sql(app, 'select user_comment_id, publication_id, is_approved, left(comment_text, 60) from user_comments order by 1');
            out.commentsConsole = [...new Set(consoleLines)].slice(0, 12);
            out.commentsLog = log.since(from).map((l) => flat(l, 300)).slice(0, 12);
        }
        if (on('eidos')) {
            const from = log.mark();
            await editor.page.goto(`${J}/management/settings/website#plugins`, {waitUntil: 'load'});
            const row = editor.page.locator('tr.gridRow, tr').filter({hasText: /Eidos/}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            out.eidosRow = flat(await row.innerText().catch(() => 'no row reading "Eidos"'), 200);
            const tick = row.locator('input[type=checkbox]').first();
            if (await tick.count() && !(await tick.isChecked())) {
                await tick.click();
                await editor.page.waitForTimeout(2500);
            }
            out.eidosEnabled = sql(app, "select plugin_name, context_id, setting_value from plugin_settings where plugin_name ilike 'eidos%' and setting_name = 'enabled'");
            await editor.page.goto(`${J}/management/settings/website`, {waitUntil: 'load'});
            out.themeOptions = await api(editor.page, 'GET', '/index.php/publicknowledge/api/v1/contexts/1/theme');
            out.themeSet = await api(editor.page, 'PUT', '/index.php/publicknowledge/api/v1/contexts/1/theme', {themePluginPath: 'eidos'});
            consoleLines.length = 0;
            try {
                out.eidosHome = await read(visitor.page, `${J}`, 'eidos-home');
                out.eidosArticle = await read(visitor.page, `${J}/article/view/1`, 'eidos-article');
                out.eidosLogin = await read(visitor.page, `${J}/login`, 'eidos-login');
                out.eidosSearch = await read(visitor.page, `${J}/search?query=signalling`, 'eidos-search');
                out.eidosDashboard = await read(editor.page, `${J}/dashboard/editorial`, 'eidos-dashboard');
                const author = await launch(app);
                await signIn(author.page, 'amwandenga', {contextPath: 'publicknowledge'}).catch((e) => { out.eidosSignIn = e.message.slice(0, 200); });
                out.eidosDenied = await read(author.page, `${J}/management/settings/website`, 'eidos-denied');
                await author.close();
            } finally {
                await editor.page.goto(`${J}/management/settings/website`, {waitUntil: 'load'}).catch(() => {});
                out.themeBack = await api(editor.page, 'PUT', '/index.php/publicknowledge/api/v1/contexts/1/theme', {themePluginPath: 'default'}).catch((e) => e.message);
            }
            out.eidosConsole = [...new Set(consoleLines)].slice(0, 12);
            out.eidosLog = log.since(from).map((l) => flat(l, 400)).slice(0, 16);
        }
    } finally {
        record(`result-${PHASES.join('-')}`, out);
        await visitor.close();
        await editor.close();
    }
});
