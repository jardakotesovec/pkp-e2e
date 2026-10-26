// U07 drift sweep 2026-10-26, chunk SW2, PART=site: the site's own "Privacy Statement" (Rule 18,
// Settings bullets 9–10, note ac's default end). It changes a site-wide setting and puts it back in
// `finally`, so it runs ONLY under the slot's exclusive app lock, one app per call:
//   PART=site PROBE_RUN=r1 PROBE_FEATURE=U07 PROBE_AGENT=ccSW2 bin/app-lock.sh exclusive ojs -- \
//       node bin/probe.js ojs shared/playwright/checks/U07/SW2/sw2.js      (then omp, ops; then PROBE_RUN=r2)
// Seeds a scratch context (tag prefix hksw2s) whose manager empties its own statement on screen; then
// `admin` reads Administration › Site Settings › "Site Setup" › "Information", saves a site statement,
// and a signed-out visitor reads index/about/privacy, the scratch context's page (its own statement
// empty) and publicknowledge's page (its own statement kept); the site statement is emptied again and
// the site page read once more. Refuses to start when the site already holds a statement.
const {forEachApp, launch, signIn, signOut, screen, shot: shot0, record: rec0, loc, idle, tag} = require('../../../probe');

const record = (n, d, o) => rec0(`st-${n}`, d, o);
const shot = (p, n) => shot0(p, `st-${n}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 3000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function pub(page, url, name) {
    let resp = null;
    try { resp = await page.goto(url); } catch (e) { return {error: String(e.message || e)}; }
    await idle(page).catch(() => {});
    const s = await screen(page);
    const data = await page.evaluate(() => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('.pkp_structure_main') || document.body;
        return {h1: [...document.querySelectorAll('h1')].map(txt), crumbs: txt(document.querySelector('.cmp_breadcrumbs')),
            edit: main.querySelectorAll('a.cmp_edit_link').length, mainText: txt(main).slice(0, 1500),
            nav: [...document.querySelectorAll('#navigationPrimary a')].map((a) => txt(a))};
    }).catch((e) => ({error: String(e.message || e)}));
    const out = {status: resp ? resp.status() : null, url: page.url(), title: await page.title().catch(() => null), ...data};
    record(name, {...s, extracted: out});
    await shot(page, name).catch(() => {});
    return out;
}
async function waitMce(page, id) {
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
}
const mceGet = (page, id) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id).catch(() => null);
async function mceSet(page, id, text) {
    await waitMce(page, id);
    await page.frameLocator(`#${id}_ifr`).locator('body').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    if (text) await page.keyboard.type(text);
    await sleep(300);
    return mceGet(page, id);
}
async function saveForm(page, inner) {
    const form = page.locator('form').filter({has: page.locator(inner)}).first();
    const w = page.waitForResponse((r) => /\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    return {status: resp ? resp.status() : null, url: resp ? resp.url().replace(/^https?:\/\/[^/]+/, '') : null, saved};
}

forEachApp(async (app) => {
    const o = {app: app.name};
    const t = tag('hksw2s');
    await app.api.createContext({tag: t, context: {name: `U07 SW2 S ${t}`, acronym: 'SWS'}, users: [{username: `${t}m`, roles: ['manager'], givenName: 'Sal', familyName: 'Site'}]});
    o.ctx = t;
    const {page, close} = await launch(app);
    let siteId = null;
    let changed = false;
    try {
        // the scratch context's own statement emptied on screen
        await signIn(page, `${t}m`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/management/settings/website`)); await idle(page);
        await page.locator('#setup-button').first().click(); await idle(page);
        await page.locator('#setup').getByRole('tab', {name: 'Privacy Statement', exact: true}).click(); await idle(page); await sleep(500);
        await mceSet(page, 'privacy-privacyStatement-control-en', '');
        o.ctxEmpty = await saveForm(page, '#privacy-privacyStatement-control-en');
        await signOut(page);
        o.siteBefore = await pub(page, app.url('/index.php/index/about/privacy'), '01-site-privacy-before');
        o.ctxBefore = await pub(page, app.url(`/index.php/${t}/about/privacy`), '02-ctx-privacy-before');
        // admin: Site Settings › Site Setup › Information
        await signIn(page, 'admin');
        await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
        await page.locator('#setup-button').first().click(); await idle(page); await sleep(500);
        await page.getByRole('tab', {name: 'Information', exact: true}).filter({visible: true}).first().click(); await idle(page); await sleep(800);
        const ids = await page.locator('textarea').evaluateAll((els) => els.map((e) => e.id).filter((id) => /privacyStatement/.test(id)));
        siteId = ids.find((x) => /-en$/.test(x)) || ids[0];
        o.siteFieldIds = ids;
        if (!siteId) throw new Error('no site privacy box');
        await waitMce(page, siteId);
        o.siteValueBefore = await mceGet(page, siteId);
        const form = page.locator('form').filter({has: page.locator(`#${siteId}`)}).first();
        o.siteForm = flat(await form.innerText().catch(() => ''), 1500);
        record('03-admin-site-information', {...(await screen(page)), siteValueBefore: o.siteValueBefore, ids});
        await shot(page, '03-admin-site-information');
        await loc(page, 'Administration › Site Settings › Site Setup › Information: the site "Privacy Statement" box', page.locator(`#${siteId}`));
        if (o.siteValueBefore) { o.refused = 'the site already holds a statement'; return; }
        changed = true;
        o.typed = await mceSet(page, siteId, 'Site probe privacy statement SW2.');
        o.siteSave = await saveForm(page, `#${siteId}`);
        await page.reload(); await idle(page);
        await page.locator('#setup-button').first().click(); await idle(page); await sleep(500);
        await page.getByRole('tab', {name: 'Information', exact: true}).filter({visible: true}).first().click(); await idle(page); await sleep(800);
        await waitMce(page, siteId).catch(() => {});
        o.siteValueReload = await mceGet(page, siteId);
        await signOut(page);
        o.siteSet = await pub(page, app.url('/index.php/index/about/privacy'), '04-site-privacy-set');
        o.ctxWithSite = await pub(page, app.url(`/index.php/${t}/about/privacy`), '05-ctx-privacy-site-set');
        o.pkWithSite = await pub(page, app.url(`/index.php/${app.contextPath}/about/privacy`), '06-pk-privacy-site-set');
        o.siteHome = await pub(page, app.url('/index.php/index'), '07-site-home-site-set');
        await signIn(page, 'admin');
        o.siteSetAdmin = await pub(page, app.url('/index.php/index/about/privacy'), '08-site-privacy-set-admin');
    } catch (e) {
        o.error = String(e.stack || e).slice(0, 1500);
    } finally {
        if (changed && siteId) {
            try {
                await signIn(page, 'admin');
                await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
                await page.locator('#setup-button').first().click(); await idle(page); await sleep(500);
                await page.getByRole('tab', {name: 'Information', exact: true}).filter({visible: true}).first().click(); await idle(page); await sleep(800);
                await mceSet(page, siteId, '');
                o.restore = await saveForm(page, `#${siteId}`);
                await signOut(page);
                o.siteRestored = await pub(page, app.url('/index.php/index/about/privacy'), '09-site-privacy-restored');
            } catch (e) { o.restoreError = String(e.stack || e).slice(0, 800); }
        }
        record('site', o);
        await close();
    }
});
