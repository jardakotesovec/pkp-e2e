// rr1023b S1: on the invitation accept page, the ORCID callback's event (`orcidAddedToInvitation`,
// pkp-lib#13538 / ui-library#1018) makes the page re-read the invitation (receiveInvitation), which
// resets the typed password and the privacy tick. Scratch context with ORCID on (Public Sandbox, dummy
// credentials); a new-email invitation made by the scratch manager through the invitations API; the
// invitee drives the accept page signed out. The ORCID popup's server side is not driven (no token
// stand-in on this fleet); the event is emitted exactly as the callback page runs it in its opener.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, sql, note} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    const t = tag('rrb');
    const ctx = await app.api.createContext({tag: t, orcid: {}, users: [{username: `${t}mgr`, roles: ['manager']}]});
    record(`context-${app.name}`, ctx);
    const cp = (ctx && (ctx.path || ctx.urlPath || (ctx.context && ctx.context.path))) || t;
    const {table, id} = app.contextTables;
    const cid = sql(app, `select ${id} from ${table} where path = '${cp}'`).trim();
    const ug = sql(app, `select user_group_id from user_groups where context_id = ${cid} and role_id in (4096, 65536) order by role_id, user_group_id limit 1`).trim();
    const invitee = `${t}inv@mail.test`;
    const since = new Date();

    const {page, close} = await launch(app);
    try {
        await signIn(page, `${t}mgr`, {contextPath: cp});
        await page.goto(app.url(`/index.php/${cp}/en/management/settings/access`));
        await idle(page);
        const api = await page.evaluate(async ({cp, ug, invitee}) => {
            const base = `/index.php/${cp}/api/v1/invitations`;
            const h = {'Content-Type': 'application/json', 'X-Csrf-Token': pkp.currentUser.csrfToken};
            const call = async (method, url, body) => {
                const r = await fetch(url, {method, headers: h, body: body ? JSON.stringify(body) : undefined});
                let j = null;
                try { j = await r.json(); } catch (e) {}
                return {status: r.status, body: j};
            };
            const out = {};
            out.add = await call('POST', `${base}/add/userRoleAssignment`, {invitationData: {inviteeEmail: invitee}});
            const iid = out.add.body && (out.add.body.invitationId || out.add.body.id);
            out.iid = iid;
            const today = new Date().toISOString().slice(0, 10);
            out.populate = await call('PUT', `${base}/${iid}/populate`, {invitationData: {
                givenName: {en: 'Ina'}, familyName: {en: 'Nonce'},
                userGroupsToAdd: [{userGroupId: Number(ug), masthead: false, dateStart: today}],
            }});
            out.invite = await call('PUT', `${base}/${iid}/invite`, {});
            return out;
        }, {cp, ug, invitee});
        record(`invitation-api-${app.name}`, {status: [api.add.status, api.populate.status, api.invite.status], iid: api.iid, errors: [api.add.body, api.populate.status >= 400 ? api.populate.body : null, api.invite.status >= 400 ? api.invite.body : null]});
    } finally {
        await close();
    }

    const summary = await app.mail.find({to: invitee, since, timeoutMs: 40000});
    const full = await app.mail.fullMessage(summary.ID);
    const m = (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
    const accept = m ? m[1].replace(/&amp;/g, '&') : null;
    note(`accept link found: ${!!accept}`);
    if (!accept) return;

    const b = await launch(app);
    const p = b.page;
    const refines = [];
    p.on('request', (r) => {
        if (/\/refine/.test(r.url())) {
            let body = r.postData() || '';
            try { const j = JSON.parse(body); const d = (j.invitationData || {}); body = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'password' ? (v === null ? null : `len ${String(v).length}`) : v])); } catch (e) {}
            refines.push({at: refines.length, body});
        }
    });
    try {
        await p.goto(accept.replace(/^https?:\/\/[^/]+/, app.baseURL));
        await idle(p);
        await sleep(1500);
        const state = await p.evaluate(() => {
            const s = (window.pkp && pkp.registry && pkp.registry._instances) ? null : null;
            const html = document.documentElement.innerHTML;
            const mm = html.match(/orcidOAuthUrl[^,]{0,600}/);
            return mm ? mm[0].slice(0, 600) : null;
        });
        record(`s1before-${app.name}-01-orcid-step`, {oauthUrlInState: state && state.replace(/invitationNonce(%3D|=)[A-Za-z0-9]+/, 'invitationNonce=<40 chars>'), hasNonce: /invitationNonce/.test(state || ''), screen: await screen(p)});
        await shot(p, `s1before-${app.name}-01-orcid-step`);

        await p.getByRole('button', {name: 'Skip ORCID verification'}).click();
        await idle(p);
        await p.getByLabel('Username', {exact: false}).first().fill(`${t}inv`);
        await p.locator('input[type="password"]').first().fill('Passw0rd!Passw0rd');
        await p.locator('input[type="checkbox"]').first().check();
        await sleep(300);
        await p.locator('button:has-text("Next"), button:has-text("Save and continue")').last().click();
        await idle(p);
        await sleep(1500);
        record(`s1before-${app.name}-02-after-next`, await screen(p));

        const back = () => p.getByRole('button', {name: 'Back', exact: true}).click();
        await back();
        await idle(p);
        await sleep(500);
        const accountBefore = await p.evaluate(() => ({
            pw: (document.querySelector('input[type="password"]') || {}).value || '',
            privacy: (document.querySelector('input[type="checkbox"]') || {}).checked,
            user: ([...document.querySelectorAll('input[type="text"]')][0] || {}).value || '',
        }));
        record(`s1before-${app.name}-03-account-after-back`, {fields: {pwLength: accountBefore.pw.length, privacy: accountBefore.privacy, user: accountBefore.user}, screen: await screen(p)});
        await back();
        await idle(p);
        await sleep(500);
        record(`s1before-${app.name}-04-orcid-step-again`, await screen(p));

        // What the ORCID callback page runs in its opener on success (AuthorizeUserData, targetOp=invitation).
        if (process.env.RRB_BEFORE) {
            // Pre-change page (main lacks the change): the callback emitted addOrcidInvitationData with the data; null = no iD.
            await p.evaluate(() => pkp.eventBus.$emit('addOrcidInvitationData', null));
        } else {
            await p.evaluate(() => pkp.eventBus.$emit('orcidAddedToInvitation'));
        }
        await idle(p);
        await sleep(2500);
        const accountAfter = await p.evaluate(() => ({
            pw: (document.querySelector('input[type="password"]') || {}).value || '',
            privacy: (document.querySelector('input[type="checkbox"]') || {}).checked,
            user: ([...document.querySelectorAll('input[type="text"]')][0] || {}).value || '',
        }));
        record(`s1before-${app.name}-05-after-orcid-event`, {fields: {pwLength: accountAfter.pw.length, privacy: accountAfter.privacy, user: accountAfter.user}, screen: await screen(p)});
        await shot(p, `s1before-${app.name}-05-after-orcid-event`);

        await p.locator('button:has-text("Next"), button:has-text("Save and continue")').last().click();
        await idle(p);
        await sleep(2000);
        const errs = await p.evaluate(() => [...document.querySelectorAll('.pkpFormFieldLabel, [id$="-error"], .pkpFormField__error, .pkpFieldError, [role="alert"]')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 20));
        record(`s1before-${app.name}-06-next-after-event`, {refines, errs, screen: await screen(p)});
        await shot(p, `s1before-${app.name}-06-next-after-event`);

        // Untick and tick the box again (the screen showed it ticked), then Save and continue.
        const box = p.locator('input[type="checkbox"]').first();
        if (!(await box.isVisible().catch(() => false))) return; // moved on past "Account details" (the pre-change outcome)
        await box.uncheck();
        await box.check();
        await sleep(300);
        await p.locator('button:has-text("Next"), button:has-text("Save and continue")').last().click();
        await idle(p);
        await sleep(2000);
        const errs2 = await p.evaluate(() => [...document.querySelectorAll('.pkpFormField__error, [role="alert"], .pkpFormFieldError, .pkpFormField--error')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 20));
        const pw2 = await p.evaluate(() => ((document.querySelector('input[type="password"]') || {}).value || '').length);
        record(`s1before-${app.name}-07-retick-next`, {refines, errs2, pwLengthOnScreen: pw2, screen: await screen(p)});
        await shot(p, `s1before-${app.name}-07-retick-next`);
    } finally {
        await b.close();
    }
});
