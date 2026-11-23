/**
 * @file shared/playwright/checks/sync/pkp-lib-13857/walk-3_5.js
 *
 * PR review of the stable-3_5_0 PRs of pkp/pkp-lib#13847 ("ORCID
 * identifier validation not correct"): pkp/pkp-lib#13863 (the core
 * `orcid` rule, an ORCID check on the registration form, escapes in
 * `form/orcidProfile.tpl` and the verify page), pkp/ojs#6110,
 * pkp/omp#2592, pkp/ops#1524 (pointer bumps). The 3.4 walk is walk.js;
 * 3.5 has ORCID in core, so the pieces sit elsewhere.
 *
 * Per app, on the 3.5 dataset fleet (`publicknowledge`), as `dbarnes`:
 *   contrib-<case>    the contributor form's save request (PUT
 *                     …/contributors/<id>) with the iD, ORCID off
 *   ORCID on (the context's orcidEnabled, orcidApiType memberSandbox,
 *   made-up client id and secret; nothing calls ORCID):
 *     register-<case> signed out, the registration form with its hidden
 *                     `orcid` field set as the ORCID pop-up sets it
 *     identity-link   a stored iD on Profile › Identity: the link
 *     identity-resave Save on that tab without changing anything
 *   cases: valid, x (X check digit), sandbox, none.
 *
 *   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature sync-13863-ds --dataset --reset
 *   WALK_REF=head PROBE_FEATURE=sync-13863-ds PROBE_AGENT=w13863 \
 *     node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13857/walk-3_5.js
 */
const {forEachApp, launch, signIn, signOut, record, idle, sql, serverLog} = require('../../../probe');

const REF = process.env.WALK_REF || 'head';
const IDS = {
    valid: 'https://orcid.org/0000-0002-1825-0097',
    x: 'https://orcid.org/0000-0002-1694-233X',
    sandbox: 'https://sandbox.orcid.org/0000-0002-1825-0097',
    none: '',
};
const ORCID_SETTINGS = [['orcidEnabled', '1'], ['orcidApiType', 'memberSandbox'], ['orcidClientId', 'APP-SEC13863TEST0000'], ['orcidClientSecret', '0123456789abcdef-0123456789abcdef-0123']];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const from = log.mark();
    const out = {ref: REF, steps: {}};
    const ctx = '/index.php/publicknowledge';
    const {table, id, settings} = app.contextTables;
    const cid = sql(app, `SELECT ${id} FROM ${table} WHERE path='publicknowledge'`);
    const userId = sql(app, "SELECT user_id FROM users WHERE username='dbarnes'");
    const storedOrcid = (uid) => sql(app, `SELECT setting_value FROM user_settings WHERE user_id=${uid} AND setting_name='orcid'`);
    const setOrcid = (uid, v) => {
        sql(app, `DELETE FROM user_settings WHERE user_id=${uid} AND setting_name='orcid'`);
        if (v) sql(app, `INSERT INTO user_settings (user_id, locale, setting_name, setting_value) VALUES (${uid}, '', 'orcid', ${q(v)})`);
    };
    const orcidOff = () => sql(app, `DELETE FROM ${settings} WHERE ${id}=${cid} AND setting_name IN (${ORCID_SETTINGS.map(([k]) => q(k)).join(',')})`);
    const errorsIn = (scope) =>
        page.evaluate((scope) => [...(document.querySelector(scope) || document).querySelectorAll('.pkp_form_error, #formErrors, label.error, .error')].map((e) => e.innerText.trim()).filter(Boolean), scope);
    const openIdentity = async () => {
        await page.goto(app.url(`${ctx}/user/profile`));
        await idle(page);
        await page.locator('a[name="identity"]').click();
        await page.locator('#identityForm').waitFor({state: 'visible', timeout: 20000});
        await idle(page);
    };

    const originalOrcid = storedOrcid(userId);
    try {
        orcidOff();
        await signIn(page, 'dbarnes', {contextPath: 'publicknowledge'});

        const [sid, pid, aid] = sql(app, `SELECT s.submission_id || '|' || p.publication_id || '|' || a.author_id FROM submissions s
            JOIN publications p ON p.publication_id = s.current_publication_id
            JOIN authors a ON a.publication_id = p.publication_id
            WHERE p.status <> 3 AND s.context_id = ${cid} ORDER BY s.submission_id, a.seq LIMIT 1`).split('|');
        const authorOrcid = () => sql(app, `SELECT setting_value FROM author_settings WHERE author_id=${aid} AND setting_name='orcid'`);
        const authorBefore = authorOrcid();
        await page.goto(app.url(`${ctx}/workflow/access/${sid}`));
        await idle(page);
        const csrf = await page.evaluate(() => (window.pkp && pkp.currentUser && pkp.currentUser.csrfToken) || null);
        for (const c of ['valid', 'x', 'sandbox']) {
            const r = await page.request.fetch(app.url(`${ctx}/api/v1/submissions/${sid}/publications/${pid}/contributors/${aid}`), {
                method: 'PUT', headers: {'X-Csrf-Token': csrf}, data: {orcid: IDS[c]}, failOnStatusCode: false,
            });
            out.steps[`contrib-${c}`] = {submission: +sid, author: +aid, http: r.status(), body: r.status() === 200 ? undefined : (await r.text()).slice(0, 300), stored: authorOrcid()};
        }
        sql(app, `DELETE FROM author_settings WHERE author_id=${aid} AND setting_name='orcid'`);
        if (authorBefore) sql(app, `INSERT INTO author_settings (author_id, locale, setting_name, setting_value) VALUES (${aid}, '', 'orcid', ${q(authorBefore)})`);

        for (const [k, v] of ORCID_SETTINGS) sql(app, `INSERT INTO ${settings} (${id}, locale, setting_name, setting_value) VALUES (${cid}, '', '${k}', ${q(v)})`);
        await signOut(page);
        for (const c of ['none', 'valid', 'x', 'sandbox']) {
            const username = `w13863${REF[0]}${c}`;
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
            const row = sql(app, `SELECT user_id FROM users WHERE username=${q(username)}`);
            out.steps[`register-${c}`] = {hasOrcidField, http, created: !!row, stored: row ? storedOrcid(row) : null, errors: await errorsIn('#register')};
            await signOut(page);
        }

        await signIn(page, 'dbarnes', {contextPath: 'publicknowledge'});
        setOrcid(userId, IDS.valid);
        await openIdentity();
        out.steps['identity-link'] = await page.evaluate(() => {
            const a = [...document.querySelectorAll('#identityForm a[target="_blank"]')].find((e) => /orcid\.org/.test(e.getAttribute('href') || '') || /orcid/i.test(e.className + e.id));
            return a ? {outerHTML: a.outerHTML.slice(0, 300), href: a.getAttribute('href'), text: a.innerText.trim()} : null;
        });
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /save-identity/i.test(r.url()), {timeout: 20000});
        await page.locator('#identityForm button.submitFormButton').click();
        const r = await resp;
        await page.waitForTimeout(800);
        const errors = await errorsIn('#identityForm');
        out.steps['identity-resave'] = {http: r.status(), saved: errors.length === 0, errors, stored: storedOrcid(userId)};
    } finally {
        orcidOff();
        setOrcid(userId, originalOrcid);
        out.serverLog = [...new Set(log.since(from).map((l) => l.replace(/^\[[^\]]*\] /, '').replace(/127\.0\.0\.1:\d+ /, '').slice(0, 200)))];
        record(`walk35-${REF}`, out);
        console.log(app.name, REF, JSON.stringify(out));
        await close();
    }
});
