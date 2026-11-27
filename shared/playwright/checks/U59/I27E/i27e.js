// U59 claim check, chunk I27E (docs/tracking/incidentals.md row I27E): POST index/api/v1/contexts (the
// contexts API's add) as the Site Administrator with no `urlPath` key, against the screen's own
// "Create Journal" ("Create Press", "Create Server") save.
// Spec: docs/specs/U59-hosted-journals.md — Fields (Required column of "Path", the title, contact
// rows), Rule 4 (a refused save), Rule 5 (an accepted save), footnote d (PKPContextService::validate,
// ValidatorFactory::required), footnote e's "fills primaryLocale and supportedLocales when none sent",
// Reference rows "Create Journal" and the contexts requests.
//
// Run (one entry script, no other script or state file; each run under its own PROBE_RUN):
//   PROBE_FEATURE=U59 PROBE_AGENT=ccI27E PROBE_RUN=r1 PROBE_NOTES_FEATURE=U59 node bin/probe.js all shared/playwright/checks/U59/I27E/i27e.js
//   PROBE_FEATURE=U59 PROBE_AGENT=ccI27E PROBE_RUN=r2 PROBE_NOTES_FEATURE=U59 node bin/probe.js all shared/playwright/checks/U59/I27E/i27e.js
// Facts land in i27e-facts-<run>-<app>.json; snapshots under the names below.
//
// What it does, per app, as `admin` (the roster's Site Administrator), tag prefix u59i27e:
//   1. Hosted Journals list; "Create Journal": "Save" on the empty form (refused before sending), then a
//      full form with the path "publicknowledge" (refused by the server), then the path changed to a
//      scratch one and saved (the user's path: the body the screen sends is recorded, keys only).
//   2. The screen's own body replayed through the API (the Frame's one exception, the incidental's
//      request) with: no `urlPath` key (the claim), `urlPath: ""` (the other end of the key's axis), a
//      fresh `urlPath` (the control), and, for footnote d's other required props, no `name` key and no
//      `contactName`/`contactEmail` keys (each with a fresh `urlPath`). Each answer: status, body head,
//      the server log lines since, the context table's row count before and after.
//   3. The list read after the requests (and after a reload); every scratch context this run created
//      is removed with its row's "Remove" (the screen), falling back to DELETE contexts/{id}.
// publicknowledge and the seeded users are only read.
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, sql, serverLog, outFile} = require('../../../probe');
const fs = require('fs');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

async function landList(page, app) {
    const r = await page.goto(app.url('/index.php/index/en/admin/contexts'));
    await idle(page).catch(() => {});
    await page.locator('#contextGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    return r && r.status();
}
async function readRows(page) {
    return page.locator('#contextGridContainer tbody tr.gridRow').evaluateAll((rs) => rs.map((r) => ({
        id: r.id.replace(/^.*-row-/, ''),
        cells: [...r.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim()),
    }))).catch(() => []);
}
const formOf = (page) => page.locator('form').filter({has: page.locator('[id^="context-name-control"]')}).last();
async function readForm(cf) {
    return cf.evaluate((f) => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            errors: [...f.querySelectorAll('.pkpFormField')].map((g) => ({
                label: txt(g.querySelector('.pkpFormFieldLabel, legend')),
                errors: [...g.querySelectorAll('.pkpFormField__error, .pkpFieldError')].filter((e) => e.getClientRects().length).map(txt).filter(Boolean),
            })).filter((x) => x.errors.length).map((x) => `${x.label}: ${x.errors.join(' / ')}`),
            errorsLine: txt(f.querySelector('.pkpFormPage__errors, .pkpFormErrors, [class*="errors"]')),
            goTo: [...f.querySelectorAll('a, button')].filter((a) => /^Go to/.test((a.innerText || '').trim())).map(txt),
            saveDisabled: [...f.querySelectorAll('button')].filter((b) => /^Save$/.test(b.innerText.trim())).map((b) => b.disabled),
        };
    }).catch((e) => ({error: flat(e.message, 200)}));
}
async function setText(cf, id, v) { const i = cf.locator(`[id="${id}"]`).first(); await i.fill(v); await i.blur().catch(() => {}); }

forEachApp(async (app) => {
    const {table, id: idCol, settings} = app.contextTables;
    const noun = {ojs: 'Journal', omp: 'Press', ops: 'Server'}[app.name];
    const t = tag('u59i27e');
    const facts = {tag: t};
    const fact = (k, v) => { facts[k] = v; record('i27e-facts', {[k]: v}, {merge: true}); };
    const count = () => Number(sql(app, `select count(*) from ${table}`));
    const rowsByTag = () => sql(app, `select ${idCol}, coalesce(path,'<null>'), seq, enabled from ${table} where path like '${t}%' order by ${idCol}`).split('\n').filter(Boolean);
    const created = []; // {id, path}
    const log = serverLog(app);

    const {page, close} = await launch(app);
    const posts = [];
    page.on('request', (r) => { if (/\/api\/v1\/contexts/.test(r.url()) && r.method() !== 'GET') posts.push({m: r.method(), u: r.url().replace(/^https?:\/\/[^/]+/, ''), body: r.postData(), ct: r.headers()['content-type'] || null, o: r.headers()['x-http-method-override'] || null}); });
    const snap = async (name, extra) => { const s = await screen(page); record(name, extra ? {...s, extra} : s); await shot(page, name).catch(() => {}); return s; };
    try {
        await signIn(page, 'admin');
        await idle(page).catch(() => {});

        // ---------------------------------------------------------------- 1. the screen's own path
        fact('listStatus', await landList(page, app));
        fact('rowsBefore', (await readRows(page)).length);
        await snap('l-01-list-before');
        const createBtn = page.locator('#contextGridContainer .header a[id*="createContext"]').first();
        await loc(page, `Hosted ${noun}s: "Create ${noun}"`, createBtn);
        fact('createLabel', flat(await createBtn.innerText().catch(() => null), 60));
        await createBtn.click();
        await page.locator('[id^="context-name-control"]').first().waitFor({state: 'visible', timeout: T});
        await idle(page); await sleep(800);
        const cf = formOf(page);
        await snap('c-01-create-window');
        const saveBtn = cf.getByRole('button', {name: 'Save', exact: true});
        await loc(page, `Create ${noun}: "Save"`, saveBtn);

        // 1a. "Save" on the empty form: refused before sending
        let n0 = posts.length;
        await saveBtn.click(); await sleep(1200); await idle(page).catch(() => {});
        fact('emptySave', {sent: posts.length - n0, form: await readForm(cf)});
        await snap('c-02-empty-save');

        // fill every field the screen asks for
        await setText(cf, 'context-name-control-en', `U59 I27E ${t}`);
        await setText(cf, 'context-acronym-control-en', 'I27E');
        await setText(cf, 'context-contactName-control', 'I27E Contact');
        await setText(cf, 'context-contactEmail-control', `${t}c@mail.test`);
        await cf.locator('select[name="country"]').first().selectOption({label: 'Iceland'}).catch(() => {});
        await cf.locator('input[name="supportedLocales"][value="en"]').first().check().catch(() => {});
        await cf.locator('input[name="primaryLocale"][value="en"]').first().check().catch(() => {});

        // 1b. a path another journal has: refused by the server
        await setText(cf, 'context-urlPath-control', 'publicknowledge');
        n0 = posts.length;
        let w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() === 'POST', {timeout: 15000}).catch(() => null);
        await saveBtn.click();
        let resp = await w; await idle(page).catch(() => {}); await sleep(900);
        const s1b = await snap('c-03-path-in-use');
        fact('pathInUse', {status: resp && resp.status(), body: resp ? flat(await resp.text().catch(() => null), 400) : null, sent: posts.length - n0, form: await readForm(cf), notices: s1b.notices});

        // 1c. the path changed to a scratch one: the accepted save
        const pScreen = `${t}scr`;
        await setText(cf, 'context-urlPath-control', pScreen);
        await sleep(300);
        fact('afterPathChange', await readForm(cf));   // Rule 4: the message goes, "Save" comes back
        await snap('c-03b-path-changed');
        const urlBefore = page.url();
        n0 = posts.length;
        w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() === 'POST', {timeout: 20000}).catch(() => null);
        await saveBtn.click();
        resp = await w;
        await page.waitForURL((u) => String(u) !== urlBefore, {timeout: 20000}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(900);
        const screenPost = posts.slice(n0).find((p) => p.m === 'POST');
        let screenBody = null;
        const rawBody = screenPost ? screenPost.body : null;
        try { screenBody = JSON.parse(rawBody); } catch (e) { screenBody = null; }
        if (!screenBody && rawBody) {
            // a urlencoded body: rebuild the object (name[en]=… → {name: {en: …}}, supportedLocales[]=…)
            screenBody = {};
            for (const [k, v] of new URLSearchParams(rawBody)) {
                const m = k.match(/^([^[]+)(?:\[([^\]]*)\])?$/);
                if (!m) continue;
                if (m[2] === undefined) screenBody[m[1]] = v;
                else if (m[2] === '') (screenBody[m[1]] = screenBody[m[1]] || []).push(v);
                else (screenBody[m[1]] = screenBody[m[1]] || {})[m[2]] = v;
            }
        }
        const s1c = await snap('c-04-screen-save-landing');
        const r1c = rowsByTag();
        fact('screenSave', {status: resp && resp.status(), url: page.url().replace(/^https?:\/\/[^/]+/, ''), left: page.url() !== urlBefore,
            postUrl: screenPost && screenPost.u, bodyKeys: screenBody ? Object.keys(screenBody) : null,
            contentType: screenPost && screenPost.ct, override: screenPost && screenPost.o, enabledSent: screenBody ? screenBody.enabled : undefined, h1: flat(s1c.text && s1c.text.main, 200), db: r1c});
        for (const r of r1c) { const [id, p] = r.split('|'); if (p === pScreen) created.push({id, path: p, via: 'screen'}); }

        // ---------------------------------------------------------------- 2. the incidental's request and its controls
        await landList(page, app);
        const csrf = await page.evaluate(() => (window.pkp && pkp.currentUser && pkp.currentUser.csrfToken) || null);
        const apiBase = await page.evaluate(() => (window.pkp && pkp.context && pkp.context.apiBaseUrl) || null);
        fact('apiBaseOnList', apiBase);
        const endpoint = app.url('/index.php/index/api/v1/contexts');
        const base = screenBody || {name: {en: ''}, acronym: {en: 'I27E'}, contactName: 'I27E Contact', contactEmail: `${t}c@mail.test`, country: 'IS', supportedLocales: ['en'], primaryLocale: 'en', enabled: false};
        const variants = [
            ['noUrlPath', (b) => { delete b.urlPath; }],
            ['emptyUrlPath', (b) => { b.urlPath = ''; }],
            ['control', (b) => { b.urlPath = `${t}ctl`; }],
            ['noName', (b) => { delete b.name; b.urlPath = `${t}nn`; }],
            ['noContact', (b) => { delete b.contactName; delete b.contactEmail; b.urlPath = `${t}nc`; }],
            ['noUrlPathAgain', (b) => { delete b.urlPath; }],
        ];
        const api = {};
        for (const [k, mut] of variants) {
            const b = JSON.parse(JSON.stringify(base));
            b.name = b.name ? {...b.name, en: `U59 I27E ${k} ${t}`} : b.name;
            mut(b);
            const before = count();
            const from = log.mark();
            const at = new Date().toISOString();
            const r = await page.request.fetch(endpoint, {method: 'POST', headers: {'X-Csrf-Token': csrf, 'Content-Type': 'application/json'}, data: b, failOnStatusCode: false});
            const text = await r.text().catch(() => '');
            await sleep(400);
            const after = count();
            let json = null; try { json = JSON.parse(text); } catch (e) { json = null; }
            // a 5xx answer's text is never kept: only whether it carried database error text
            const bodyOut = r.status() >= 500 ? {kind: /SQLSTATE|Connection:|insert into/i.test(text) ? 'database error text' : (json && json.error ? 'error text' : 'other')} : flat(text, 300);
            api[k] = {at, status: r.status(), keys: Object.keys(b), body: bodyOut,
                errorKeys: json && r.status() === 400 ? Object.keys(json) : undefined,
                created: json && json.id ? {id: json.id, urlPath: json.urlPath, name: json.name, contactName: json.contactName, contactEmail: json.contactEmail, primaryLocale: json.primaryLocale, supportedLocales: json.supportedLocales, enabled: json.enabled} : undefined,
                rowsBefore: before, rowsAfter: after,
                log: log.since(from).map((l) => (/SQLSTATE|Connection:/.test(l) ? '[a database exception line]' : flat(l, 200))).slice(0, 6)};
            if (json && json.id) created.push({id: String(json.id), path: json.urlPath, via: k});
            fact(`api.${k}`, api[k]);
        }
        fact('nullPathRows', sql(app, `select count(*) from ${table} where path is null or path = ''`));

        // ---------------------------------------------------------------- 3. the list after the requests, a reload, then cleanup
        await landList(page, app);
        const rowsA = await readRows(page);
        fact('rowsAfterRequests', rowsA.filter((r) => created.some((c) => c.id === r.id)).map((r) => `${r.id}: ${r.cells.join(' | ')}`));
        fact('rowsAfterCount', rowsA.length);
        const scr = created.find((c) => c.via === 'screen');
        fact('screenRowIndex', scr ? {index: rowsA.findIndex((r) => r.id === scr.id), of: rowsA.length, lastIds: rowsA.slice(-6).map((r) => r.id)} : null);
        await snap('l-02-list-after-requests');
        await page.reload(); await idle(page).catch(() => {});
        await page.locator('#contextGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        fact('rowsAfterReload', (await readRows(page)).length);
        await snap('l-03-list-after-reload');
        // Rule 5: the screen-created journal is not on the site's home page (not enabled)
        await page.goto(app.url('/index.php/index/en')); await idle(page).catch(() => {});
        const home = await snap('h-01-site-home');
        fact('homeListsScreenJournal', /U59 I27E u59i27e/.test(String(home.text && home.text.main)));
        fact('homeUrl', page.url().replace(/^https?:\/\/[^/]+/, ''));

        // sweep: the journal created with no name, on its Settings wizard
        const nn = created.find((c) => c.via === 'noName');
        if (nn) {
            await page.goto(app.url(`/index.php/index/en/admin/wizard/${nn.id}`)); await idle(page).catch(() => {});
            await page.locator('[id^="context-name-control"]').first().waitFor({timeout: T}).catch(() => {});
            const w1 = await snap('w-01-noname-wizard');
            fact('noNameWizard', {url: page.url().replace(/^https?:\/\/[^/]+/, ''), head: flat(w1.text && w1.text.main, 300)});
        }

        // cleanup: each created row's "Remove" on screen
        const removed = [];
        for (const c of created) {
            await landList(page, app);
            const row = page.locator(`#contextGridContainer tr.gridRow[id$="-row-${c.id}"]`).first();
            const out = {id: c.id, path: c.path, via: c.via};
            if (await row.count()) {
                out.cells = flat(await row.innerText().catch(() => null), 200);
                await row.locator('a.show_extras').first().click().catch(() => {});
                await sleep(400);
                const ctl = page.locator(`[id="${await row.getAttribute('id')}-control-row"]`);
                await ctl.getByRole('link', {name: 'Remove', exact: true}).click().catch((e) => { out.removeClick = flat(e.message, 120); });
                const d = page.locator('[role=dialog]:visible').last();
                await d.waitFor({timeout: 8000}).catch(() => {});
                out.question = flat(await d.innerText().catch(() => null), 300);
                if (removed.length === 0) await snap('r-01-remove-confirm');
                const ww = page.waitForResponse((r) => r.request().method() !== 'GET' && /delete-context|deleteContext|api\/v1\/contexts/.test(r.url()), {timeout: 60000}).catch(() => null);
                await d.getByRole('button', {name: /^(OK|Yes|Remove|Delete)$/}).first().click().catch(() => {});
                const rr = await ww; out.status = rr && rr.status();
                await idle(page).catch(() => {}); await sleep(1200);
            }
            out.gone = !sql(app, `select 1 from ${table} where ${idCol} = ${Number(c.id)}`);
            if (!out.gone) {
                const r = await page.request.fetch(app.url(`/index.php/index/api/v1/contexts/${c.id}`), {method: 'DELETE', headers: {'X-Csrf-Token': csrf}, failOnStatusCode: false});
                out.apiDelete = r.status();
                out.gone = !sql(app, `select 1 from ${table} where ${idCol} = ${Number(c.id)}`);
            }
            removed.push(out);
        }
        fact('removed', removed);
        fact('leftWithTag', rowsByTag());
        fact('settingsLeft', sql(app, `select count(*) from ${settings} where setting_value like '%${t}%'`));
        await landList(page, app);
        await snap('l-04-list-after-cleanup');
    } finally {
        fs.writeFileSync(outFile("i27e-created.json"), JSON.stringify(created, null, 1));
        await close();
    }
});
