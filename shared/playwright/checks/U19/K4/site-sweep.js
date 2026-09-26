// U19 claim check K4, follow-up: Rule 24 "No screen changes it" — every Administration page read as the Site
// Administrator for an OAI field (the page state carries every tab's form), plus the site's Plugins list rows
// that name OAI. Read only.
//   PROBE_FEATURE=U19 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U19/K4/site-sweep.js
const {forEachApp, launch, signIn, screen, record, idle} = require('../../../probe');

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const out = {};
    try {
        await signIn(page, 'admin');
        for (const p of ['admin/settings', 'admin/contexts', 'admin/systemInfo', 'admin']) {
            const r = await page.goto(app.url(`/index.php/index/en/${p}`)).catch(() => null);
            await idle(page).catch(() => {});
            const html = await page.content().catch(() => '');
            const hits = [...html.matchAll(/.{0,60}\b(oai|OAI)\b.{0,60}/g)].map((m) => m[0].replace(/\s+/g, ' ')).slice(0, 12);
            out[p] = {status: r && r.status(), url: page.url().replace(app.baseURL, ''), hits, enableOai: (html.match(/enableOai|Enable OAI/g) || []).length};
            record(`ss-${p.replace(/\//g, '-')}`, await screen(page));
        }
    } finally {
        record('ss-facts', out);
        console.log(app.name, JSON.stringify(out).slice(0, 3000));
        await close();
    }
});
