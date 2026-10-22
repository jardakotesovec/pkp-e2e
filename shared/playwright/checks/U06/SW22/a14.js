// U06 drift sweep SW22, A14's axis: how many `Undefined array key "invitation_id"`
// warnings one load of the send wizard writes, on a scratch journal with one form
// language and on one with two (en + fr_CA). Each load marks the fleet's server log
// and keeps the PHP messages written before the request line of that load's own
// address (the slot fleet's log is shared, so a line is pinned on its request).
// Run twice (PROBE_RUN r1, r2), one app per lock call:
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U06 PROBE_AGENT=ccSW22 PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U06/SW22/a14.js
const fs = require('fs');
const {forEachApp, launch, signIn, screen, record, idle, tag, serverLog} = require('../../../probe');

forEachApp(async (app) => {
    const {expect} = require('@playwright/test');
    const T = tag('u06sw22l');
    const ctx = {one: `${T}a`, two: `${T}b`};
    await app.api.createContext({tag: ctx.one, users: [{username: `mgr${T}`, roles: ['manager']}]});
    await app.api.createContext({tag: ctx.two, context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
        users: [{username: `mgr${T}`, roles: ['manager']}]});
    const log = serverLog(app);
    const facts = {app: app.name, run: process.env.PROBE_RUN || null, tag: T, loads: {}};
    const {page, close} = await launch(app);
    try {
        await signIn(page, `mgr${T}`);
        for (const [k, c] of Object.entries(ctx)) {
            facts.loads[k] = [];
            for (let i = 0; i < 2; i++) {
                const from = log.mark();
                await page.goto(`/index.php/${c}/invitation/create/userRoleAssignment`);
                await expect(page.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
                await idle(page);
                await new Promise((r) => setTimeout(r, 700));
                const s = await screen(page);
                record(`a14-${k}-${i}`, s);
                const lines = fs.existsSync(log.file) ? fs.readFileSync(log.file).subarray(from).toString('utf8').split('\n') : [];
                let pending = [];
                let mine = null;
                for (const l of lines) {
                    if (/PHP (Warning|Notice|Deprecated|Fatal)/.test(l)) {
                        pending.push(l.replace(/^\[[^\]]+\]\s*/, '').replace(/ in \S+ on line \d+/, ''));
                        continue;
                    }
                    const m = l.match(/\[(\d{3})\]: GET (\S+)/);
                    if (m) {
                        // A multilingual journal 302s the bare address to its /en/ one: keep reading.
                        if (m[1].startsWith('3')) continue;
                        if (m[2].includes(`/${c}/`) && m[2].includes('/invitation/create/userRoleAssignment')) {
                            mine = {status: m[1], warnings: pending};
                            break;
                        }
                        pending = [];
                    }
                }
                facts.loads[k].push(mine);
                facts.formLanguages = facts.formLanguages || {};
                facts.formLanguages[k] = c === ctx.two ? ['en', 'fr_CA'] : 'default';
            }
        }
    } finally {
        record('a14', facts);
        await close();
    }
});
