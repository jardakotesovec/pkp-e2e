// U08 claim check K1, companion (read only): Rule 1b — which pages carry the
// site's own menus: the site home, the site-level Login and Register pages,
// signed out, and the site home signed in as admin.
// Run: PROBE_FEATURE=U08 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U08/K1/k1-sitepages.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle} = require('../../../probe');
forEachApp(async (app) => {
    const {page, close} = await launch(app);
    try {
        const read = () => page.evaluate(() => ({url: location.pathname, primary: [...document.querySelectorAll('#navigationPrimary > li > a')].map((a) => a.innerText.trim()), user: [...document.querySelectorAll('#navigationUser a')].map((a) => a.innerText.trim().split('\n')[0] + ' ' + a.getAttribute('href').replace(/^https?:\/\/[^/]+/, ''))}));
        const out = {};
        for (const p of ['/index.php/index', '/index.php/index/login', '/index.php/index/user/register']) {
            await page.goto(app.url(p)); await idle(page);
            out[p] = await read();
            record(`g0-sitepage-${p.split('/').pop()}`, {...(await screen(page)), read: out[p]});
        }
        await signIn(page, 'admin');
        await page.goto(app.url('/index.php/index')); await idle(page);
        out.admin = await read();
        await shot(page, 'g1-sitepage-home-admin');
        console.log(`[site] ${app.name}`, JSON.stringify(out));
        await signOut(page);
    } finally { await close(); }
});
