/**
 * @file shared/playwright/checks/sync/pkp-lib-13857/walk.js
 *
 * PR review of the stable-3_4_0 PRs of pkp/pkp-lib#13847 ("ORCID
 * identifier validation not correct"): pkp/pkp-lib#13857 (core `orcid`
 * rule), pkp/orcidProfile#344 (a registration validator in the ORCID
 * Profile plugin, escapes in its templates), pkp/ojs#6105, pkp/omp#2591,
 * pkp/ops#1523 (pointer bumps).
 *
 * What a person with a real ORCID iD meets, per app, on the 3.4 dataset
 * fleet (`publicknowledge`), as `dbarnes`:
 *   core (plugin off, every app)
 *     profile-<case>   Profile › Public, ORCID field filled, Save
 *     contrib-<case>   the contributor form's save request (PUT
 *                      …/contributors/<id>, what the Vue form sends) with
 *                      the iD, on a submission whose current version is
 *                      not published
 *   plugin (OJS, OPS: the bundled ORCID Profile plugin enabled by
 *   plugin_settings rows, made-up member-sandbox credentials)
 *     register-<case>  signed out, the registration form with its hidden
 *                      `orcid` field set as the ORCID pop-up sets it
 *     profile-link     a stored iD on Profile › Public: the plugin's link
 *     profile-resave   Save on that tab without changing anything
 *   cases: valid (https://orcid.org/0000-0002-1825-0097), x (a valid iD
 *   with an X check digit), sandbox (the valid iD on sandbox.orcid.org),
 *   none (empty).
 * Each step records what the screen said and the stored value.
 *
 *   PKP_E2E_LINE=stable-3_4_0 npm run fleet-prep -- --feature sync-13857-ds --dataset --reset
 *   WALK_REF=head PROBE_FEATURE=sync-13857-ds PROBE_AGENT=w13857 \
 *     node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13857/walk.js
 */
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, record, idle, sql, serverLog} = require('../../../probe');

const REF = process.env.WALK_REF || 'head';
const IDS = {
    valid: 'https://orcid.org/0000-0002-1825-0097',
    x: 'https://orcid.org/0000-0002-1694-233X',
    sandbox: 'https://sandbox.orcid.org/0000-0002-1825-0097',
    none: '',
};
const PLUGIN = 'orcidprofileplugin';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const from = log.mark();
    const out = {ref: REF, steps: {}};
    const ctx = '/index.php/publicknowledge';
    const userId = sql(app, "SELECT user_id FROM users WHERE username='dbarnes'");
    const storedOrcid = (uid) =>
        sql(app, `SELECT setting_value FROM user_settings WHERE user_id=${uid} AND setting_name='orcid'`);
    const setOrcid = (uid, v) => {
        sql(app, `DELETE FROM user_settings WHERE user_id=${uid} AND setting_name='orcid'`);
        if (v) sql(app, `INSERT INTO user_settings (user_id, locale, setting_name, setting_value) VALUES (${uid}, '', 'orcid', ${q(v)})`);
    };
    const clearPluginCache = () => {
        for (const dir of [path.join(app.root, 'cache')]) {
            for (const f of fs.readdirSync(dir)) if (/^fc-pluginSettings-.*orcidprofileplugin/.test(f)) fs.rmSync(path.join(dir, f));
        }
    };
    const errorsOn = async (scope) =>
        page.evaluate((scope) => {
            const root = document.querySelector(scope) || document;
            return [...root.querySelectorAll('.pkp_form_error, #formErrors, .error, .cmp_notification, label.error')]
                .map((e) => e.innerText.trim())
                .filter(Boolean);
        }, scope);

    const openPublicTab = async () => {
        await page.goto(app.url(`${ctx}/user/profile`));
        await idle(page);
        await page.locator('a[name="publicProfile"]').click();
        await page.locator('#publicProfileForm').waitFor({state: 'visible', timeout: 20000});
        await idle(page);
    };
    const savePublicTab = async () => {
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /save-public-profile/i.test(r.url()), {timeout: 20000});
        await page.locator('#publicProfileForm button.submitFormButton').click();
        const r = await resp;
        await page.waitForTimeout(800);
        const body = await r.json().catch(() => null);
        const errors = await errorsOn('#publicProfileForm');
        return {http: r.status(), saved: !!body?.status && errors.length === 0, errors};
    };

    try {
        const originalOrcid = storedOrcid(userId);
        await signIn(page, 'dbarnes', {contextPath: 'publicknowledge'});

        // --- core: plugin off
        sql(app, `DELETE FROM plugin_settings WHERE plugin_name='${PLUGIN}'`);
        clearPluginCache();
        for (const c of ['valid', 'x', 'none']) {
            await openPublicTab();
            await page.locator('#publicProfileForm input[name="orcid"]').fill(IDS[c]);
            out.steps[`profile-${c}`] = {...(await savePublicTab()), stored: storedOrcid(userId)};
        }

        const [sub] = sql(app, `SELECT s.submission_id || '|' || p.publication_id || '|' || a.author_id FROM submissions s
            JOIN publications p ON p.publication_id = s.current_publication_id
            JOIN authors a ON a.publication_id = p.publication_id
            WHERE p.status <> 3 AND s.context_id = (SELECT ${app.contextTables.id} FROM ${app.contextTables.table} WHERE path='publicknowledge')
            ORDER BY s.submission_id, a.seq LIMIT 1`).split('\n');
        const [sid, pid, aid] = sub.split('|');
        const authorOrcid = () => sql(app, `SELECT setting_value FROM author_settings WHERE author_id=${aid} AND setting_name='orcid'`);
        const authorBefore = authorOrcid();
        await page.goto(app.url(`${ctx}/workflow/access/${sid}`));
        await idle(page);
        for (const c of ['valid', 'x', 'sandbox']) {
            // 3.4's workflow page carries no pkp.context.apiBaseUrl (apiAs), so the token is read as the page's own forms read it
            const csrf = await page.evaluate(() => (window.pkp && pkp.currentUser && pkp.currentUser.csrfToken) || ($.pkp && $.pkp.currentUser && $.pkp.currentUser.csrfToken));
            const r = await page.request.fetch(app.url(`${ctx}/api/v1/submissions/${sid}/publications/${pid}/contributors/${aid}`), {
                method: 'PUT', headers: {'X-Csrf-Token': csrf}, data: {orcid: IDS[c]}, failOnStatusCode: false,
            });
            out.steps[`contrib-${c}`] = {submission: +sid, author: +aid, http: r.status(), body: (await r.text()).slice(0, 300), stored: authorOrcid()};
        }
        sql(app, `DELETE FROM author_settings WHERE author_id=${aid} AND setting_name='orcid'`);
        if (authorBefore) sql(app, `INSERT INTO author_settings (author_id, locale, setting_name, setting_value) VALUES (${aid}, '', 'orcid', ${q(authorBefore)})`);

        // --- plugin on (OJS, OPS bundle it)
        if (fs.existsSync(path.join(app.root, 'plugins/generic/orcidProfile'))) {
            const [cid] = sql(app, `SELECT ${app.contextTables.id} FROM ${app.contextTables.table} WHERE path='publicknowledge'`).split('\n');
            for (const [k, v, t] of [['enabled', '1', 'bool'], ['orcidProfileAPIPath', 'https://api.sandbox.orcid.org/', 'string'], ['orcidClientId', 'APP-SEC13857TEST0000', 'string'], ['orcidClientSecret', '0123456789abcdef-0123456789abcdef-0123', 'string']]) {
                sql(app, `INSERT INTO plugin_settings (plugin_name, context_id, setting_name, setting_value, setting_type) VALUES ('${PLUGIN}', ${cid}, '${k}', ${q(v)}, '${t}')`);
            }
            clearPluginCache();
            await signOut(page);
            for (const c of ['none', 'valid', 'x', 'sandbox']) {
                const username = `w13857${REF[0]}${c}`;
                await page.goto(app.url(`${ctx}/user/register`));
                await idle(page);
                const hasOrcidField = (await page.locator('#register input[name="orcid"]').count()) > 0;
                await page.evaluate(({username, orcid}) => {
                    const f = document.getElementById('register');
                    const set = (sel, v) => f.querySelectorAll(sel).forEach((e) => (e.value = v));
                    set('input[name^="givenName"]', 'Walk');
                    set('input[name^="familyName"]', 'Orcid');
                    set('input[name^="affiliation"]', 'PKP');
                    set('input[name="email"]', `${username}@example.org`);
                    set('input[name="username"]', username);
                    set('input[name="password"], input[name="password2"]', `${username}${username}`);
                    const country = f.querySelector('select[name="country"]');
                    if (country) country.value = 'CA';
                    f.querySelectorAll('input[name^="privacyConsent"]').forEach((e) => (e.checked = true));
                    const o = f.querySelector('input[name="orcid"]');
                    if (o) o.value = orcid;
                }, {username, orcid: IDS[c]});
                const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/user\/register/.test(r.url()), {timeout: 30000});
                await page.locator('#register button[type="submit"]').first().click();
                const http = (await posted).status();
                await page.waitForLoadState('load');
                await idle(page);
                const [row] = sql(app, `SELECT user_id FROM users WHERE username=${q(username)}`).split('\n');
                out.steps[`register-${c}`] = {
                    hasOrcidField, http, url: page.url().replace(/^https?:\/\/[^/]+/, ''), created: !!row, stored: row ? storedOrcid(row) : null,
                    errors: await errorsOn('#register'), page: http >= 500 ? (await page.locator('body').innerText()).slice(0, 160) : undefined,
                };
                await signOut(page);
            }
            await signIn(page, 'dbarnes', {contextPath: 'publicknowledge'});
            setOrcid(userId, IDS.valid);
            await openPublicTab();
            out.steps['profile-link'] = await page.evaluate(() => {
                const a = [...document.querySelectorAll('#publicProfileForm a')].find((e) => /orcid/i.test(e.outerHTML) && e.target === '_blank');
                return a ? {outerHTML: a.outerHTML.slice(0, 300), href: a.getAttribute('href'), resolved: a.href} : null;
            });
            out.steps['profile-resave'] = {...(await savePublicTab()), stored: storedOrcid(userId)};
            sql(app, `DELETE FROM plugin_settings WHERE plugin_name='${PLUGIN}'`);
            clearPluginCache();
        }
        setOrcid(userId, originalOrcid);
        out.serverLog = log.since(from);
        record(`walk-${REF}`, out);
        console.log(app.name, REF, JSON.stringify(out, null, 1));
    } finally {
        await close();
    }
});
