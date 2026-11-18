// PR review check — pkp/healthSciences#283 (stable-3_5_0) and #284 (main): "Fix ALTCHA on the Health
// Sciences login modal". The theme is a gallery plugin, not on the e2e installs: the session copies the
// theme's tree at the ref under review into `plugins/themes/healthSciences` of the line's OJS checkout
// and registers it (`lib/pkp/tools/installPluginVersion.php`), then runs, OJS only:
//
//   HS_PHASE=base|head [HS_EXTRA=<origin>[,<origin>]] PROBE_FEATURE=hs-review PROBE_AGENT=<id> \
//     [PKP_E2E_LINE=stable-3_5_0] node bin/probe.js ojs shared/playwright/checks/sync/healthSciences-283-284/modal.js
//
//   mkdir -p <app>/plugins/themes/healthSciences && git -C <hs clone> archive <sha> | tar -x -C <that dir>
//   (cd <app> && PKP_CONFIG_FILE=$PWD/config.test.inc.php php lib/pkp/tools/installPluginVersion.php \
//     plugins/themes/healthSciences/version.xml)
// HS_EXTRA names servers the session starts by hand (`PKP_CONFIG_FILE=… php -S 127.0.0.1:<base+95|96>`)
// on copies of config.test.validation.inc.php: +95 with `altcha_on_register` and
// `altcha_on_lost_password` off (the Register and lost-password legs), +96 with `altcha` off and
// `recaptcha` on with `captcha_on_login` (the reCAPTCHA question). On `main` the theme's init() fails
// at `HookRegistry::add` (no such class there), so `loadTemplateData` never runs; HS_PHASE=head-hookfix
// is #284's head with that one call made `\PKP\plugins\Hook::add`. The theme, the configs and the
// servers are removed and the DBs reset afterwards. Run 2026-11-18: 3.5 base d5cf33456c, head
// 4c0ad06410; main base 1e8cf3da98, head 667c7cf606.
// Setup (idempotent, SQL): publicknowledge's theme set to healthSciences and enabled, Static Pages
// enabled with one page at `hs-review`, the app's data caches cleared.
// Legs, each on a fresh anonymous browser, on the validation variant (+90: `altcha` on, every per-form
// switch on) and on each HS_EXTRA origin (a server the session starts on another config):
//   modal-home    journal home › the menu's "Login" › the modal, signed in as reader.rosa
//   modal-static  the same from the Static Pages page (the template name does not start with frontend/)
//   page-login    the Login page's own form (the page now carries the theme's challenge too)
//   register      the Register page: is an ALTCHA widget or a reCAPTCHA box on it
//   lost          the lost-password page: the same
// No assertions: facts per leg (widgets in the modal, the POSTed field names, where the sign-in landed,
// the error shown, signed in or not) go to result-<app>-<phase>.json.
const {forEachApp, launch, signOut, shot, idle, sql, users} = require('../../../probe');
const fs = require('fs');
const path = require('path');

const PHASE = process.env.HS_PHASE || 'head';
const EXTRA = (process.env.HS_EXTRA || '').split(',').map((s) => s.trim()).filter(Boolean);
const USER = 'reader.rosa';
const fold = (s) => (s || '').replace(/\s+/g, ' ').trim();

function setup(app) {
    sql(app, `UPDATE journal_settings SET setting_value='healthSciences' WHERE journal_id=1 AND setting_name='themePluginPath'`);
    for (const plugin of ['healthsciencesthemeplugin', 'staticpagesplugin']) {
        sql(app, `INSERT INTO plugin_settings (plugin_name, context_id, setting_name, setting_value, setting_type)
            SELECT '${plugin}', 1, 'enabled', '1', 'bool'
            WHERE NOT EXISTS (SELECT 1 FROM plugin_settings WHERE plugin_name='${plugin}' AND context_id=1 AND setting_name='enabled')`);
    }
    sql(app, `INSERT INTO static_pages (path, context_id) SELECT 'hs-review', 1
        WHERE NOT EXISTS (SELECT 1 FROM static_pages WHERE path='hs-review' AND context_id=1)`);
    const id = sql(app, `SELECT static_page_id FROM static_pages WHERE path='hs-review' AND context_id=1`).trim();
    for (const [name, value] of [['title', 'About the review'], ['content', '<p>A static page.</p>']]) {
        sql(app, `INSERT INTO static_page_settings (static_page_id, locale, setting_name, setting_value, setting_type)
            SELECT ${id}, 'en', '${name}', '${value}', 'string'
            WHERE NOT EXISTS (SELECT 1 FROM static_page_settings WHERE static_page_id=${id} AND setting_name='${name}')`);
    }
    const cache = path.join(app.root, 'cache');
    for (const dir of [path.join(cache, 'opcache'), path.join(cache, '_db')]) {
        if (fs.existsSync(dir)) {
            for (const e of fs.readdirSync(dir)) if (!e.startsWith('.')) fs.rmSync(path.join(dir, e), {recursive: true, force: true});
        }
    }
    for (const e of fs.readdirSync(cache)) {
        if (/\.php$/.test(e) || /^fc-/.test(e)) fs.rmSync(path.join(cache, e), {force: true});
    }
}

async function signedIn(page, origin, contextPath) {
    await page.goto(`${origin}/index.php/${contextPath}`);
    return (await page.locator('.nmi_type_user_login').count()) === 0;
}

async function widgets(page, scope) {
    const s = page.locator(scope);
    return {
        altchaWidgets: await s.locator('altcha-widget').count(),
        recaptchaBoxes: await s.locator('.g-recaptcha').count(),
        altchaScript: await page.locator('script[src*="altcha"]').count(),
        recaptchaScript: await page.locator('script[src*="recaptcha"]').count(),
    };
}

/** Submit a login form and wait for where it lands; the POSTed field names and the page's error. */
async function submit(page, form, button) {
    const posted = [];
    const onReq = (r) => {
        if (r.method() === 'POST' && /login\/signIn/.test(r.url())) {
            posted.push(Object.fromEntries([...new URLSearchParams(r.postData() || '')].map(([k, v]) => [k, k === 'password' ? '…' : (k === 'altcha' ? `${v.length} chars` : v.slice(0, 40))])));
        }
    };
    page.on('request', onReq);
    const nav = page.waitForEvent('framenavigated', {predicate: (f) => f === page.mainFrame(), timeout: 30_000}).catch(() => null);
    await button.click();
    await nav;
    await page.waitForLoadState('load').catch(() => {});
    await idle(page).catch(() => {});
    page.off('request', onReq);
    const err = await page.locator('.alert, .pkp_form_error, [role="alert"], .form-error, .error').allInnerTexts().catch(() => []);
    return {posted, landed: page.url(), error: err.map(fold).filter(Boolean).join(' | ')};
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    setup(app);
    const origins = [{name: 'validation', origin: app.variant('validation')}, ...EXTRA.map((o, i) => ({name: `extra${i + 1}`, origin: o}))];
    const result = {phase: PHASE, line: process.env.PKP_E2E_LINE || 'main', legs: []};
    const cp = app.contextPath;
    for (const {name, origin} of origins) {
        for (const leg of ['modal-home', 'modal-static', 'page-login', 'register', 'lost']) {
            const {page, close} = await launch(app);
            const out = {origin: name, leg};
            try {
                if (leg === 'register' || leg === 'lost') {
                    await page.goto(`${origin}/index.php/${cp}/${leg === 'register' ? 'user/register' : 'login/lostPassword'}`);
                    await idle(page).catch(() => {});
                    Object.assign(out, await widgets(page, 'main, .pkp_structure_main, body'));
                    out.inPageForm = await page.locator(`form:not(#loginModalForm) altcha-widget`).count();
                    await shot(page, `${PHASE}-${name}-${leg}`).catch(() => {});
                } else if (leg === 'page-login') {
                    await page.goto(`${origin}/index.php/${cp}/login`);
                    await idle(page).catch(() => {});
                    out.pageForm = await widgets(page, '#login');
                    out.modal = await widgets(page, '#loginModal');
                    await page.locator('#username').fill(USER);
                    await page.locator('#password').fill(users.getPassword(USER));
                    Object.assign(out, await submit(page, page.locator('#login'), page.locator('#login button[type="submit"]')));
                    out.signedIn = await signedIn(page, origin, cp);
                } else {
                    await page.goto(`${origin}/index.php/${cp}${leg === 'modal-static' ? '/hs-review' : ''}`);
                    await idle(page).catch(() => {});
                    out.pageTitle = await page.title();
                    out.modal = await widgets(page, '#loginModal');
                    await page.locator('.nmi_type_user_login:visible').first().click();
                    await page.locator('#loginModal').waitFor({state: 'visible', timeout: 10_000});
                    await page.locator('#usernameModal').fill(USER);
                    await page.locator('#passwordModal').fill(users.getPassword(USER));
                    await shot(page, `${PHASE}-${name}-${leg}-modal`).catch(() => {});
                    Object.assign(out, await submit(page, page.locator('#loginModalForm'), page.locator('#loginModalForm button[type="submit"]')));
                    await shot(page, `${PHASE}-${name}-${leg}-after`).catch(() => {});
                    out.signedIn = await signedIn(page, origin, cp);
                }
            } catch (e) {
                out.failure = fold(String(e && e.message)).slice(0, 300);
            } finally {
                await signOut(page, {origin}).catch(() => {});
                await close();
            }
            result.legs.push(out);
            console.log(JSON.stringify(out));
        }
    }
    const dir = path.join(process.cwd(), '.reports', process.env.PROBE_FEATURE || 'hs-review', process.env.PROBE_AGENT || 'x');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, `result-${app.name}-${result.line}-${PHASE}.json`), JSON.stringify(result, null, 2));
});
