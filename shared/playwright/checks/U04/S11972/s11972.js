// U04 claim check S11972 (upstream sync of pkp/pkp-lib#11972 "Make author email optional for organizations and
// anonymous contributors"; pkp-lib d03b7729f6 + 73bb87216e, ui-library 72ec3278). Spec:
// docs/specs/U04-orcid-integration.md: the Fields rows of the contributor's ORCID iD field, Rule 8 (verification
// requests), Rule 11 (deposits), Rule 13 (automatic author emails), the Side effects lines on request emails and
// deposits, scenarios 4 and 5. What the change adds: ORCID requests, request emails and deposits for persons only;
// the contributor-type switch away from Person refused while the contributor has an iD and ORCID is on; with ORCID
// off the switch saves and removes the iD and its tokens. Records; asserts nothing: the reader judges. OJS carries
// the change; OMP and OPS are the controls until their lib/pkp and ui-library pointers move past the merges.
//
// Run (scenario fleet, all three apps in one process; two runs, each seeding its own scratch contexts, tag prefix
// u04s; publicknowledge and the roster are never touched; the parts drain the fleet's job queue):
//   PROBE_FEATURE=sync PROBE_AGENT=ccS04 PROBE_NOTES_FEATURE=U04 PROBE_RUN=r1 \
//       node bin/probe.js all shared/playwright/checks/U04/S11972/s11972.js
//   PROBE_RUN=r2 …   PART=field,off,rule13,deposit narrows (default: all four).
// No file is read from another script. The rest of the chunk's lines (the request, resend and delete of scenarios 4
// and 5, the request log, the publish window and its deposits, the Rule 11 token states, Rule 13's decisions and
// Rule 14's subjects, A23) are re-driven by the earlier kept scripts, run beside this one with the same env:
//   PHASES=contrib,publish  … shared/playwright/checks/U04/SW3/sw3.js
//   PHASES=rule13,deposit   … shared/playwright/checks/U04/SW1/sw1.js
//   PART=edit               … shared/playwright/checks/sync/pkp-lib-8920/metadata-changed.js   (ojs, ops)
// and the PR review's kept walks shared/playwright/checks/sync/pkp-lib-13624/walk.js and same-type.js (the type
// switch through the API, ORCID on and off).
// Outputs: .reports/<feature>/<agent>/<part>-<step>-<run>-<app>.{json,png} (screen snapshots),
// s04-<part>-<run>-<app>.json (one key per step), run-<run>-<app>-*.json (the kit's run record).
//
//   field    ORCID on (Public Sandbox), the scratch manager: "Add Contributor" per type (the ORCID iD field);
//            "Request verification" pressed for a Person being added, then the type switched to Organization or
//            Anonymous and saved; a person without an email (data from before the change) asked; a person with an
//            unauthenticated iD switched to Organization (refused), then the way out on the same form (back to
//            Person, "Delete", Organization, Save); a person with a pending request switched to Organization (the
//            stored request); "Resend Verification Email" pressed before the first email left (A24).
//   off      a second context: ORCID turned off on Settings › Users & Roles › ORCID, a person with a verified iD
//            switched to Organization and another to Anonymous on the form (same page, reload, stored rows, jobs);
//            the queued token cancellations drained while ORCID is off; ORCID turned on again and the switched
//            contributor reopened.
//   rule13   {OJS OMP} the author-email toggle on, a submission in review with a Person, an Organization and an
//            Anonymous contributor (each with an email, added on the form) and a person without an email; "Accept
//            Submission" recorded; the jobs queued and each mailbox after the drain. OPS: skipped (no Accept, OPS1;
//            SW1's rule13 phase reads its toggle and decisions).
//   deposit  Member Sandbox: a submission whose Person, Organization and Anonymous contributors each hold a
//            verified iD with a live member token (the latter two as data from before the change), and an
//            Organization holding a public-scope token; published on screen; the DepositOrcidSubmission jobs (the
//            iD each carries) and the drain's attempts; OJS also one scheduled into a future issue.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, sql, note, drainJobs, serverLog} = require('../../../probe');

const ALL = ['field', 'off', 'rule13', 'deposit'];
const PARTS = (process.env.PART || ALL.join(',')).split(',');
const RUN = process.env.PROBE_RUN || 'r0';
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const IDS = {
    person: 'https://sandbox.orcid.org/0000-0002-1825-0097',
    org: 'https://sandbox.orcid.org/0000-0001-5109-3700',
    anon: 'https://sandbox.orcid.org/0000-0002-9079-593X',
    orgPublic: 'https://sandbox.orcid.org/0000-0003-1419-2405',
    unauth: 'https://sandbox.orcid.org/0000-0002-1694-233X',
};

forEachApp(async (app) => {
    const A = app.name;
    const log = (...a) => console.log(`[s04 ${RUN} ${A}]`, ...a);
    const q = (s) => sql(app, s);
    const ctxT = app.contextTables;
    const facts = {};
    let part = '';
    const fact = (k, v) => {
        facts[part] = facts[part] || {};
        facts[part][k] = v;
        log(`${part}.${k}: ${flat(JSON.stringify(v), 2500)}`);
        record(`s04-${part}`, facts[part]);
    };
    const step = async (k, fn) => {
        try { fact(k, await fn()); } catch (e) { fact(k, {error: flat(e.stack || e.message, 900)}); await shot(page, `${part}-${k}-error`).catch(() => {}); }
    };
    const cu = (ctx, p = '') => `/index.php/${ctx}/en${p}`;
    const {page, close} = await launch(app);
    const CR = [];
    page.on('response', (r) => { if (r.status() >= 500) CR.push(`server ${r.status()} ${r.request().method()} ${rel(r.url()).slice(0, 160)}`); });
    page.on('pageerror', (e) => CR.push(`script ${flat(e.message, 200)}`));
    const snap = async (name, p = page) => {
        const s = await screen(p).catch((e) => ({error: flat(e.message, 300)}));
        record(`${part}-${name}`, s);
        await shot(p, `${part}-${name}`).catch(() => {});
        return s;
    };
    const mkContext = async (suffix, extra = {}) => {
        const t = tag(`u04s${suffix}`);
        await app.api.createContext({tag: t, context: {contactName: `ORCID Contact ${t}`, contactEmail: `contact-${t}@mail.test`}, ...extra, users: [
            {username: `${t}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`},
            {username: `${t}au`, roles: ['author'], givenName: 'Cleo', familyName: 'Writer', email: `${t}au@mail.test`},
        ]});
        return t;
    };
    const mkSub = async (t, k, extra = {}) => {
        const s = await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: `${t}au`, title: `S04 ${k} ${t}`, ...extra});
        return {...s, id: s.submissionId, pub: s.publicationId};
    };
    const ctxId = (t) => q(`select ${ctxT.id} from ${ctxT.table} where path='${t}'`);
    const maxJob = () => Number(q('select coalesce(max(id),0) from jobs') || 0);
    const maxFailed = () => Number(q('select coalesce(max(id),0) from failed_jobs') || 0);
    // ORCID jobs queued since a mark, kept to one scratch context (its path is in the serialized context); the fleet
    // is shared with other checkers.
    const jobsSince = (id, ctx) => q(`select id || ' ' || coalesce(substring(payload from 'orcid[\\\\]+([A-Za-z]+)'),'?') || ' ' || coalesce(substring(payload from 'authorOrcid[^0-9]*([0-9X-]{19})'),'') from jobs where id > ${id} and payload like '%orcid%'${ctx ? ` and payload like '%${ctx}%'` : ''} order by id`).split('\n').filter(Boolean);
    const failedSince = (id, ctx) => q(`select id || ' ' || coalesce(substring(payload from 'orcid[\\\\]+([A-Za-z]+)'),'?') || ' :: ' || coalesce(substring(exception from 'for (https?:[^ ]+)'), substring(exception from 1 for 160)) from failed_jobs where id > ${id} and payload like '%orcid%'${ctx ? ` and payload like '%${ctx}%'` : ''} order by id`).split('\n').filter(Boolean).map((x) => flat(x, 300));
    const rows = (pub) => q(`select a.author_id || ' ' || a.contributor_type || ' ' || coalesce(a.email,'(null)') || ' ' || coalesce((select string_agg(s.setting_name || '=' || case when s.setting_name like '%Token' then '(set)' else left(coalesce(s.setting_value,''),45) end, ',' order by s.setting_name) from author_settings s where s.author_id=a.author_id and (s.setting_name like 'orcid%' or s.setting_name = 'organizationName')),'') from authors a where a.publication_id=${pub} order by a.seq, a.author_id`).split('\n').filter(Boolean);
    const mailsTo = async (to, since) => {
        const r = await app.mail._search({to, since}).catch(() => null);
        return ((r && (r.messages || r.Messages)) || []).map((m) => ({subject: m.Subject, from: m.From && m.From.Address}));
    };
    const L = serverLog(app);

    // ---------------------------------------------------------------- the contributor form
    const panel = () => page.locator('.listPanel--contributor').first();
    const FORM = /^(Add Contributor|Edit)$/;
    const formDlg = () => page.getByRole('dialog', {name: FORM}).last();
    const openWorkflow = async (ctx, sub) => {
        await page.goto('about:blank');
        await page.goto(app.url(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_contributors`)));
        await idle(page);
        await panel().locator('li.listPanel__item').first().waitFor({timeout: T});
        await idle(page);
    };
    const listItems = async () => (await panel().locator('li.listPanel__item').allInnerTexts().catch(() => [])).map((x) => flat(x, 140));
    const openAdd = async () => {
        await panel().getByRole('button', {name: 'Add Contributor', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Add Contributor', exact: true});
        await d.locator('input[name="email"]').waitFor({timeout: T});
        await idle(page); await sleep(400);
        return d;
    };
    const openEdit = async (text) => {
        await panel().locator('li.listPanel__item').filter({hasText: text}).first().getByRole('button', {name: 'Edit', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Edit', exact: true});
        await d.locator('input[name="contributorType"]').first().waitFor({timeout: T});
        await idle(page); await sleep(600);
        return d;
    };
    const setType = async (d, label) => { await d.getByRole('radio', {name: label, exact: true}).check(); await sleep(500); };
    const fieldOf = (d) => d.locator('.pkpFormField').filter({has: page.locator('.pkpFormFieldLabel', {hasText: /ORCID/})}).first();
    const formRead = async (d) => d.evaluate((el) => {
        const t = (n) => (n ? n.innerText.replace(/\s+/g, ' ').trim() : null);
        const orcid = [...el.querySelectorAll('.pkpFormField')].find((f) => /ORCID/.test(t(f.querySelector('.pkpFormFieldLabel')) || ''));
        return {
            type: (el.querySelector('input[name="contributorType"]:checked') || {}).value || null,
            orcidField: orcid ? {
                text: t(orcid).replace(/ORCID is an independent.*?orcid\.org\.?/, '[tooltip]').slice(0, 400),
                links: [...orcid.querySelectorAll('a')].map((a) => t(a)).filter(Boolean),
                buttons: [...orcid.querySelectorAll('button')].map((b) => ({t: t(b), disabled: b.disabled})).filter((b) => b.t),
                icons: [...orcid.querySelectorAll('img, svg')].map((e) => (e.getAttribute('src') || e.getAttribute('class') || e.tagName)).slice(0, 4),
                errors: [...orcid.querySelectorAll('.pkpFieldError')].map(t),
            } : null,
            fieldErrors: [...el.querySelectorAll('.pkpFieldError')].map((e) => {
                let n = e; while (n && !n.querySelector('.pkpFormFieldLabel, legend')) n = n.parentElement;
                return {field: n ? t(n.querySelector('.pkpFormFieldLabel, legend')) : null, error: t(e)};
            }),
            errorList: [...el.querySelectorAll('button, a')].map((b) => t(b) || '').filter((s) => /^Go to |^Jump to next error$|^Please correct/.test(s)),
            foot: (t(el).match(/Please correct[^]*?(Jump to next error|Save)$/) || t(el).match(/Please correct[^.]*\./) || [null])[0],
        };
    }).catch((e) => ({error: flat(e.message, 200)}));
    // A field control pressed and its question answered; the requests it sent, the question, the field after.
    const pressField = async (d, control, answer, name) => {
        const reqs = [];
        const onR = (r) => { if (/\/orcid\/|\/contributors/.test(r.url()) && r.request().method() !== 'GET') reqs.push(r); };
        page.on('response', onR);
        const f = fieldOf(d);
        await f.getByRole('button', {name: control}).or(f.getByRole('link', {name: control})).or(f.getByText(control, {exact: true})).first().click();
        await sleep(700);
        const s = await snap(`${name}-question`);
        const qd = page.getByRole('dialog').filter({hasText: /Would you like to send|Are you sure you want to remove/}).last();
        const question = (await qd.count()) ? {text: flat(await qd.innerText(), 500), buttons: (await qd.getByRole('button').allInnerTexts()).map((x) => flat(x, 40)).filter(Boolean)} : null;
        if (question && answer) await qd.getByRole('button', {name: answer, exact: true}).click();
        await sleep(1500); await idle(page).catch(() => {});
        const after = await snap(`${name}-after`);
        const errDlg = page.getByRole('dialog').filter({hasText: /Error/}).last();
        const errorWindow = (await errDlg.count()) ? flat(await errDlg.innerText(), 300) : null;
        if (errorWindow) {
            await errDlg.getByRole('button', {name: /^(OK|Close)$/}).first().click().catch(() => {});
            await sleep(600);
        }
        page.off('response', onR);
        const answers = [];
        for (const r of reqs) answers.push({req: `${r.request().method()} ${rel(r.url()).replace(/^.*\/api\/v1\//, '')}`, status: r.status(), body: flat(await r.text().catch(() => ''), 300)});
        return {question, answers, notices: [...(s.notices || []), ...(after.notices || [])], errorWindow, form: await formRead(d)};
    };
    const saveForm = async (d, name) => {
        const reqs = [];
        const onR = (r) => { if (/\/contributors|\/orcid\//.test(r.url()) && r.request().method() !== 'GET') reqs.push(r); };
        page.on('response', onR);
        await d.getByRole('button', {name: 'Save', exact: true}).last().click();
        await sleep(2200); await idle(page).catch(() => {});
        page.off('response', onR);
        const s = await snap(`${name}-saved`);
        const out = {requests: [], notices: s.notices, formOpen: await d.count()};
        for (const r of reqs) {
            const sent = new URLSearchParams(r.request().postData() || '');
            out.requests.push({req: `${r.request().method()} ${rel(r.url()).replace(/^.*\/api\/v1\//, '')}`, status: r.status(),
                sent: {contributorType: sent.get('contributorType'), orcid: sent.get('orcid'), email: sent.get('email')},
                body: r.status() >= 400 ? flat(await r.text().catch(() => ''), 400) : undefined});
        }
        if (out.formOpen) out.form = await formRead(d);
        return out;
    };
    const closeForm = async (d) => {
        if (await d.count()) await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(900);
    };
    const fillOrg = async (d, name, email) => {
        await d.locator('input[name="organizationName-en"]').fill(name);
        if (email != null) await d.locator('input[name="email"]').fill(email);
        if (!(await d.locator('select[name="country"]').inputValue().catch(() => ''))) await d.locator('select[name="country"]').selectOption({label: 'Canada'}).catch(() => {});
    };
    const tickAuthor = async (d) => {
        const c = d.getByRole('checkbox', {name: 'Author', exact: true});
        if ((await c.count()) && !(await c.isChecked())) await c.check();
    };
    // The journal's ORCID tab: "Enable ORCID functionality" set and saved.
    const orcidSwitch = async (ctx, on, name) => {
        await page.goto(app.url(cu(ctx, '/management/settings/access')));
        await idle(page);
        await page.locator('#orcidSettings-button').first().click();
        const p = page.locator('#orcidSettings');
        const box = p.locator('input[name="orcidEnabled"]');
        await box.waitFor({timeout: T});
        await idle(page); await sleep(300);
        if (on) await box.check(); else await box.uncheck();
        await sleep(300);
        const ans = page.waitForResponse((r) => r.url().includes('/api/v1/contexts/') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await p.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await ans;
        await idle(page); await sleep(500);
        const s = await snap(name);
        return {status: r && r.status(), notices: s.notices, stored: q(`select coalesce(setting_value,'') from ${ctxT.settings} where setting_name='orcidEnabled' and ${ctxT.id}=${ctxId(ctx)}`)};
    };
    const addOnForm = async (ctx, sub, kind, label, email, name) => {
        await openWorkflow(ctx, sub);
        const d = await openAdd();
        if (kind === 'person') {
            await d.locator('input[name="givenName-en"]').fill(label);
            await d.locator('input[name="email"]').fill(email);
            await d.locator('select[name="country"]').selectOption({label: 'Canada'});
        } else {
            await setType(d, kind === 'org' ? 'Organization or group' : 'Anonymous');
            if (kind === 'org') await fillOrg(d, label, email);
            else {
                if (email != null) await d.locator('input[name="email"]').fill(email);
                await d.locator('select[name="country"]').selectOption({label: 'Canada'}).catch(() => {});
            }
        }
        await tickAuthor(d);
        const s = await saveForm(d, name);
        await closeForm(d);
        return s;
    };

    try {
        // ============================================================ field
        if (PARTS.includes('field')) {
            part = 'field';
            const t = await mkContext('f', {orcid: {}});
            const sF = await mkSub(t, 'f');
            const sN = await mkSub(t, 'n');
            const sU = await mkSub(t, 'u', {author: {orcid: IDS.unauth, orcidIsVerified: false}});
            const sP = await mkSub(t, 'p');
            const sR = await mkSub(t, 'r');
            q(`update authors set email = null where publication_id = ${sN.pub}`);
            const since = new Date(Date.now() - 5000);
            fact('seed', {ctx: t, subs: {sF: sF.id, sN: sN.id, sU: sU.id, sP: sP.id, sR: sR.id}, rowsN: rows(sN.pub), rowsU: rows(sU.pub)});
            await signIn(page, `${t}mg`, {contextPath: t});

            // Fields rows: the ORCID iD field per type on "Add Contributor"
            await step('addTypes', async () => {
                await openWorkflow(t, sF);
                const d = await openAdd();
                const out = {};
                for (const [k, label] of [['person', 'Person'], ['org', 'Organization or group'], ['anon', 'Anonymous']]) {
                    await setType(d, label);
                    await snap(`add-${k}`);
                    out[k] = await formRead(d);
                }
                await closeForm(d);
                return out;
            });
            // Rule 8's deferred request, then the type switched before the save
            for (const [k, label, email] of [['deferOrg', 'Organization or group', `dorg-${t}@mail.test`], ['deferAnon', 'Anonymous', `danon-${t}@mail.test`]]) {
                await step(k, async () => {
                    const j0 = maxJob();
                    await openWorkflow(t, sF);
                    const d = await openAdd();
                    await setType(d, 'Person');
                    const req = await pressField(d, 'Request verification', 'Yes', `${k}-request`);
                    await setType(d, label);
                    const switched = await formRead(d);
                    await snap(`${k}-switched`);
                    if (label === 'Anonymous') {
                        await d.locator('input[name="email"]').fill(email);
                        await d.locator('select[name="country"]').selectOption({label: 'Canada'}).catch(() => {});
                    } else await fillOrg(d, `Deferred Org ${RUN}`, email);
                    await tickAuthor(d);
                    const saved = await saveForm(d, k);
                    let saveAgain = null, backToPerson = null, retried = null;
                    if (saved.formOpen) {
                        // Save pressed again as it stands, then the way out a manager would try: back to Person (is
                        // the request still there?), the type chosen again, Save.
                        // the footer's "Jump to next error" pressed: where does it take the manager?
                        const jump = d.getByRole('button', {name: 'Jump to next error'}).or(d.getByRole('link', {name: 'Jump to next error'})).first();
                        let jumped = null;
                        if (await jump.count()) {
                            await jump.click().catch(() => {});
                            await sleep(800);
                            jumped = await page.evaluate(() => {
                                const a = document.activeElement;
                                return a ? {tag: a.tagName, name: a.getAttribute('name'), id: a.id, text: (a.innerText || a.value || '').replace(/\s+/g, ' ').trim().slice(0, 80), visible: !!(a.offsetWidth || a.offsetHeight)} : null;
                            });
                            await snap(`${k}-jumped`);
                        }
                        const btn = d.getByRole('button', {name: 'Save', exact: true}).last();
                        saveAgain = {jumped, disabled: await btn.isDisabled().catch(() => null)};
                        if (!saveAgain.disabled) saveAgain = {...saveAgain, ...(await saveForm(d, `${k}-again`))};
                        await setType(d, 'Person');
                        backToPerson = await formRead(d);
                        await snap(`${k}-back-to-person`);
                        await setType(d, label);
                        if (label !== 'Anonymous') await fillOrg(d, `Deferred Org ${RUN}`, email);
                        retried = await saveForm(d, `${k}-retried`);
                        await closeForm(d);
                    }
                    await page.reload(); await idle(page);
                    await panel().locator('li.listPanel__item').first().waitFor({timeout: T});
                    const list = await listItems();
                    await snap(`${k}-reload`);
                    const queued = jobsSince(j0, t);
                    const drain = (await drainJobs(app)).counts;
                    return {req: {question: req.question, answers: req.answers, form: req.form.orcidField}, switched, saved, saveAgain, backToPerson, retried, list, stored: rows(sF.pub), queued, drain, mail: await mailsTo(email, since)};
                });
            }
            // a person without an email (data from before the change): "Request verification"
            await step('noEmail', async () => {
                await openWorkflow(t, sN);
                const d = await openEdit('Cleo');
                const before = await formRead(d);
                await snap('noemail-form');
                const j0 = maxJob();
                const yes = await pressField(d, 'Request verification', 'Yes', 'noemail-request');
                await closeForm(d);
                await page.reload(); await idle(page);
                await panel().locator('li.listPanel__item').first().waitFor({timeout: T});
                const again = await openEdit('Cleo');
                const reopened = await formRead(again);
                await snap('noemail-reopen');
                await closeForm(again);
                const queued = jobsSince(j0, t), f0 = maxFailed();
                const drain = (await drainJobs(app)).counts;
                return {before: before.orcidField, emailBox: before.fieldErrors, yes, reopened: reopened.orcidField, queued, drain, failed: failedSince(f0, t), stored: rows(sN.pub)};
            });
            // an unauthenticated iD and the switch to Organization (ORCID on), then the way out on the same form
            await step('unauthSwitch', async () => {
                await openWorkflow(t, sU);
                const d = await openEdit('Cleo');
                const before = await formRead(d);
                await setType(d, 'Organization or group');
                await fillOrg(d, `Unauth Org ${RUN}`);
                const refused = await saveForm(d, 'unauth-switch');
                // Before pkp-lib#11972 (OMP and OPS until their pointers move) the switch saves and the form closes.
                let asPerson = null, del = null, resaved = null;
                if (refused.formOpen) {
                    await setType(d, 'Person');
                    asPerson = await formRead(d);
                    await snap('unauth-back-to-person');
                }
                if (asPerson && asPerson.orcidField && asPerson.orcidField.buttons.some((b) => b.t === 'Delete')) {
                    del = await pressField(d, 'Delete', 'Yes', 'unauth-delete');
                    await setType(d, 'Organization or group');
                    await fillOrg(d, `Unauth Org ${RUN}`);
                    resaved = await saveForm(d, 'unauth-resave');
                }
                await closeForm(d);
                await page.reload(); await idle(page);
                await panel().locator('li.listPanel__item').first().waitFor({timeout: T});
                const list = await listItems();
                await snap('unauth-reload');
                return {before: before.orcidField, refused, asPerson, del: del && {answers: del.answers, field: del.form.orcidField}, resaved, list, stored: rows(sU.pub)};
            });
            // a person with a pending request switched to Organization (no iD, so allowed?)
            await step('pendingSwitch', async () => {
                await openWorkflow(t, sP);
                let d = await openEdit('Cleo');
                const req = await pressField(d, 'Request verification', 'Yes', 'pending-request');
                await closeForm(d);
                const drain1 = (await drainJobs(app)).counts;
                const storedBefore = rows(sP.pub);
                await openWorkflow(t, sP);
                d = await openEdit('Cleo');
                await setType(d, 'Organization or group');
                await fillOrg(d, `Pending Org ${RUN}`);
                const saved = await saveForm(d, 'pending-switch');
                await closeForm(d);
                await openWorkflow(t, sP);
                d = await openEdit('Pending Org');
                const reopenedOrg = await formRead(d);
                await setType(d, 'Person');
                const reopenedAsPerson = await formRead(d);
                await snap('pending-reopen-person');
                await closeForm(d);
                return {req: req.answers, drain1, storedBefore, saved, storedAfter: rows(sP.pub), reopenedOrg, reopenedAsPerson, mail: await mailsTo(`${t}au@mail.test`, since)};
            });
            // A24: request, resend before the queue runs, then one drain
            await step('resendQueued', async () => {
                const s0 = new Date(Date.now() - 1000);
                await openWorkflow(t, sR);
                const d = await openEdit('Cleo');
                const req = await pressField(d, 'Request verification', 'Yes', 'a24-request');
                const resend = await pressField(d, 'Resend Verification Email', 'Yes', 'a24-resend');
                await closeForm(d);
                const queued = q(`select count(*) from jobs where payload like '%SendAuthorMail%' and payload like '%${t}%'`);
                const drain = (await drainJobs(app)).counts;
                await sleep(1500);
                return {req: req.answers, resend: {question: resend.question, answers: resend.answers, field: resend.form.orcidField}, queuedSendAuthorMail: queued, drain, mail: await mailsTo(`${t}au@mail.test`, s0)};
            });
        }

        // ============================================================ off
        if (PARTS.includes('off')) {
            part = 'off';
            const t = await mkContext('o', {orcid: {}});
            const sV = await mkSub(t, 'v', {author: {orcid: IDS.person, orcidIsVerified: true}});
            const sW = await mkSub(t, 'w', {author: {orcid: IDS.org, orcidIsVerified: true}});
            fact('seed', {ctx: t, rowsV: rows(sV.pub), rowsW: rows(sW.pub)});
            await signIn(page, `${t}mg`, {contextPath: t});
            await step('turnOff', () => orcidSwitch(t, false, 'orcid-off'));
            for (const [k, sub, label] of [['toOrg', sV, 'Organization or group'], ['toAnon', sW, 'Anonymous']]) {
                await step(k, async () => {
                    const j0 = maxJob(), m = L.mark();
                    await openWorkflow(t, sub);
                    const d = await openEdit('Cleo');
                    const before = await formRead(d);
                    await snap(`${k}-form`);
                    await setType(d, label);
                    if (label !== 'Anonymous') await fillOrg(d, `Off Org ${RUN}`);
                    const saved = await saveForm(d, k);
                    const atOnce = saved.formOpen ? null : await listItems();
                    await closeForm(d);
                    await page.reload(); await idle(page);
                    await panel().locator('li.listPanel__item').first().waitFor({timeout: T});
                    const list = await listItems();
                    await snap(`${k}-reload`);
                    return {before: before.orcidField, saved, atOnce, list, stored: rows(sub.pub), queued: jobsSince(j0, t), serverLog: L.since(m).slice(0, 6)};
                });
            }
            // the queued token cancellations run while ORCID is still off (as the end-of-request job runner would)
            await step('drainWhileOff', async () => {
                const f0 = maxFailed(), m = L.mark();
                const queuedBefore = q(`select count(*) from jobs where payload like '%RevokeOrcidToken%' and payload like '%${t}%'`);
                const d = await drainJobs(app);
                return {queuedBefore, drain: d.counts, queuedAfter: q(`select count(*) from jobs where payload like '%RevokeOrcidToken%' and payload like '%${t}%'`), failed: failedSince(f0, t), serverLog: L.since(m).filter((l) => /orcid|revoke/i.test(l)).slice(0, 6)};
            });
            await step('turnOn', () => orcidSwitch(t, true, 'orcid-on'));
            await step('reopen', async () => {
                await openWorkflow(t, sV);
                const d = await openEdit(`Off Org ${RUN}`);
                const asOrg = await formRead(d);
                await setType(d, 'Person');
                const asPerson = await formRead(d);
                await snap('reopen-as-person');
                await closeForm(d);
                return {asOrg, asPerson};
            });
            await step('drain', async () => { const f0 = maxFailed(); const d = await drainJobs(app); return {drain: d.counts, failed: failedSince(f0, t)}; });
        }

        // ============================================================ rule13
        if (PARTS.includes('rule13')) {
            part = 'rule13';
            if (A === 'ops') fact('skipped', 'no Accept decision on a preprint server (OPS1); SW1 rule13 reads the toggle and the decisions');
            else {
                const t = await mkContext('m', {orcid: {sendMailToAuthorsOnPublication: true}});
                const to = {cora: `cora-${t}@mail.test`, org: `org-${t}@mail.test`, anon: `anon-${t}@mail.test`, nemo: `nemo-${t}@mail.test`, au: `${t}au@mail.test`};
                const s = await mkSub(t, 'a', {decisions: ['sendExternalReview'], contributors: [{givenName: 'Cora', familyName: 'Person', email: to.cora}, {givenName: 'Nemo', familyName: 'Nomail', email: to.nemo}]});
                q(`update authors set email = null where publication_id = ${s.pub} and email = '${to.nemo}'`);
                await signIn(page, `${t}mg`, {contextPath: t});
                await step('addOrg', () => addOnForm(t, s, 'org', `Mail Org ${RUN}`, to.org, 'add-org'));
                await step('addAnon', () => addOnForm(t, s, 'anon', null, to.anon, 'add-anon'));
                fact('rows', rows(s.pub));
                const since = new Date(Date.now() - 2000);
                const j0 = maxJob();
                await step('accept', async () => {
                    await page.goto('about:blank');
                    await page.goto(app.url(cu(t, `/dashboard/editorial?workflowSubmissionId=${s.id}`)));
                    await idle(page); await sleep(1000);
                    await page.getByRole('button', {name: 'Accept Submission'}).first().click();
                    const out = {steps: []};
                    for (let i = 0; i < 8; i++) {
                        await page.locator('.composer__loadingTemplateMask').first().waitFor({state: 'detached', timeout: T}).catch(() => {});
                        await idle(page); await sleep(700);
                        const rec = page.getByRole('button', {name: /^Record (Editorial )?Decision$/});
                        if ((await rec.count()) && (await rec.first().isVisible())) {
                            const posted = page.waitForResponse((r) => r.url().includes('/decisions') && r.request().method() === 'POST', {timeout: 60_000}).catch(() => null);
                            await rec.first().click();
                            const r = await posted;
                            out.status = r && r.status();
                            await sleep(1500);
                            await snap('accept-recorded');
                            return out;
                        }
                        out.steps.push(flat(await page.locator('h1, h2').first().innerText().catch(() => null), 80));
                        await page.getByRole('button', {name: 'Continue', exact: true}).first().click();
                    }
                    out.error = 'no Record Decision';
                    return out;
                });
                await step('mail', async () => {
                    const queued = q(`select count(*) from jobs where id > ${j0} and payload like '%SendAuthorMail%' and payload like '%${t}%'`);
                    const f0 = maxFailed();
                    const drain = (await drainJobs(app)).counts;
                    await sleep(1500);
                    const out = {queuedSendAuthorMail: queued, drain, failed: failedSince(f0, t)};
                    for (const [k, addr] of Object.entries(to)) out[k] = (await mailsTo(addr, since)).filter((m) => /ORCID/.test(m.subject));
                    return out;
                });
            }
        }

        // ============================================================ deposit
        if (PARTS.includes('deposit')) {
            part = 'deposit';
            const issues = A === 'ojs' ? {issues: [{volume: 9, number: 1, year: 2026, published: true}, {volume: 9, number: 2, year: 2027, published: false}]} : {};
            const t = await mkContext('d', {orcid: {apiType: 'memberSandbox', city: 'Burnaby'}, ...issues});
            const s1 = await mkSub(t, '1', {author: {orcid: IDS.person, orcidIsVerified: true}});
            await signIn(page, `${t}mg`, {contextPath: t});
            await step('addOrg', () => addOnForm(t, s1, 'org', `Deposit Org ${RUN}`, `dorg-${t}@mail.test`, 'add-org'));
            await step('addAnon', () => addOnForm(t, s1, 'anon', null, `danon-${t}@mail.test`, 'add-anon'));
            await step('addOrgPublic', () => addOnForm(t, s1, 'org', `Public Org ${RUN}`, `porg-${t}@mail.test`, 'add-org-public'));
            // the iD and token as data from before the change (ORCID's sign-in is the outside service that makes it)
            const person = q(`select author_id from authors where publication_id=${s1.pub} and email='${t}au@mail.test'`);
            const copy = (email, overrides) => {
                const to = q(`select author_id from authors where publication_id=${s1.pub} and email='${email}'`);
                if (!to) return null;
                q(`insert into author_settings (author_id, locale, setting_name, setting_value) select ${to}, locale, setting_name, setting_value from author_settings where author_id=${person} and setting_name in ('orcid','orcidIsVerified','orcidAccessToken','orcidAccessScope','orcidRefreshToken','orcidAccessExpiresOn')`);
                for (const [k, v] of Object.entries(overrides)) q(`update author_settings set setting_value='${v}' where author_id=${to} and setting_name='${k}'`);
                return to;
            };
            fact('seeded', {org: copy(`dorg-${t}@mail.test`, {orcid: IDS.org}), anon: copy(`danon-${t}@mail.test`, {orcid: IDS.anon}), orgPublic: copy(`porg-${t}@mail.test`, {orcid: IDS.orgPublic, orcidAccessScope: '/authenticate'}), rows: rows(s1.pub)});
            const s2 = A === 'ojs' ? await mkSub(t, '2', {author: {orcid: IDS.person, orcidIsVerified: true}}) : null;
            const publish = async (sub, name, {future} = {}) => {
                const out = {};
                const answers = [];
                const onR = (r) => { if (/\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET') answers.push(r.status()); };
                page.on('response', onR);
                const j0 = maxJob();
                try {
                    await page.goto('about:blank');
                    if (A === 'ojs') {
                        await page.goto(app.url(cu(t, `/dashboard/editorial?workflowSubmissionId=${sub.id}`))); await idle(page);
                        const path = require('path');
                        const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
                        const ps = new PublicationScreen(page, t);
                        await ps.openEntry('Title & Abstract'); await idle(page);
                        if (future) await ps.scheduleToFutureIssue(/Vol\. 9 No\. 2 \(2027\)/);
                        else await ps.publish({backIssueLabel: /Vol\. 9 No\. 1 \(2026\)/});
                    } else if (A === 'ops') {
                        await page.goto(app.url(cu(t, `/dashboard/editorial?workflowSubmissionId=${sub.id}`))); await idle(page);
                        const path = require('path');
                        const {postPreprint} = require(path.join(app.suiteDir, 'pages', 'PublicationPages.js'));
                        await postPreprint(page);
                    } else {
                        await page.goto(app.url(cu(t, `/dashboard/editorial?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_titleAbstract`))); await idle(page);
                        const path = require('path');
                        const {publishFromWorkflow} = require(path.join(app.suiteDir, 'pages', 'CatalogPages.js'));
                        await publishFromWorkflow(page);
                    }
                } catch (e) { out.error = flat(e.message, 400); }
                page.off('response', onR);
                await idle(page).catch(() => {});
                const s = await snap(name);
                out.notices = s.notices;
                out.answers = answers;
                out.status = q(`select status from publications where publication_id=${sub.pub}`);
                out.queued = jobsSince(j0, t);
                return out;
            };
            await step('publish', () => publish(s1, 'published'));
            if (s2) await step('schedule', () => publish(s2, 'scheduled', {future: true}));
            await step('drain', async () => {
                const f0 = maxFailed(), since = new Date(Date.now() - 300_000);
                const d = await drainJobs(app);
                await sleep(1500);
                return {drain: d.counts, failed: failedSince(f0, t), rowsAfter: rows(s1.pub), mailOrgPublic: await mailsTo(`porg-${t}@mail.test`, since), mailPerson: await mailsTo(`${t}au@mail.test`, since)};
            });
        }
    } finally {
        record(`s04-crashes`, {run: RUN, crashes: CR});
        await close();
    }
});
