// U06 drift sweep SW22, the last lines no kept check reaches, per app on a scratch
// journal of this run's own:
//   fields   the newcomer's "Enter details" boxes (Fields: Email / Given / Family / Affiliation);
//   deadline Rule 2: the expiry the Users & Roles page's own invitations request answers
//            (its response read as the page loads; no request of our own);
//   template Fields "Email subject & body": the compose step's "Find Template" with
//            another template's name, and what picking a result does to Subject;
//   consent  accept wizard: "Save and continue" with the privacy consent unticked;
//   masthead OMP1 body: Manage Emails (publicknowledge, manager.maya, read only) searched
//            for the masthead email, its Edit pressed (no save).
// Run twice (PROBE_RUN r1, r2), one app per lock call:
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U06 PROBE_AGENT=ccSW22 PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U06/SW22/extra.js
const {forEachApp, launch, signIn, screen, record, idle, tag} = require('../../../probe');

const ROLE = {ojs: 'Copyeditor', omp: 'Author', ops: 'Moderator'};

function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

forEachApp(async (app) => {
    const {expect} = require('@playwright/test');
    const T = tag('u06sw22x');
    const facts = {app: app.name, run: process.env.PROBE_RUN || null, tag: T, errors: {}};
    const snap = async (page, name) => { const s = await screen(page); record(name, s); return s; };
    const step = async (name, fn) => {
        try { await fn(); } catch (e) { facts.errors[name] = String(e.message || e).split('\n')[0]; console.log(`[${app.name}] ${name} FAILED: ${facts.errors[name]}`); }
        record('extra', facts);
    };
    await app.api.createContext({tag: T, users: [{username: `mgr${T}`, roles: ['manager']}]});
    const to = `rcpt${T}@mail.test`;
    const newRow = (page) => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
    const {page, close} = await launch(app);
    const {page: vp, close: closeV} = await launch(app);
    let accept = null;
    try {
        await signIn(page, `mgr${T}`);
        await step('send', async () => {
            await page.goto(`/index.php/${T}/management/settings/access`);
            await page.getByRole('button', {name: 'Invite to a role'}).click();
            await page.getByLabel(/Search for a user by email address/).fill(to);
            await page.getByRole('button', {name: 'Search User', exact: true}).click();
            await expect(page.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(page);
            const d = await snap(page, 'extra-details');
            facts.fields = {
                textboxes: (d.aria.main.match(/textbox "[^"]*"/g) || []),
                affiliation: await page.getByLabel(/Affiliation/).count(),
                labels: await page.locator('main label').evaluateAll((ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)),
            };
            await page.getByLabel(/^Given Name/).first().fill('Nova');
            await newRow(page).getByLabel(/^Select a new role/).selectOption({label: ROLE[app.name]});
            await newRow(page).getByRole('textbox').fill(today());
            await newRow(page).getByRole('combobox').last().selectOption({label: 'Appear on the masthead'});
            await page.getByRole('button', {name: 'Save And Continue'}).click();
            const subject = page.getByLabel(/^Subject/);
            await expect(subject).toBeVisible({timeout: 30_000});
            await expect(subject).not.toHaveValue('', {timeout: 30_000});
            await idle(page);
            await snap(page, 'extra-compose');
            facts.template = {subjectBefore: await subject.inputValue()};
            const find = page.getByRole('searchbox', {name: 'Find Template'});
            facts.template.resultsBefore = await page.getByRole('list', {name: 'Search Results'}).getByRole('button').allInnerTexts().catch(() => null);
            await find.pressSequentially('Password', {delay: 20});
            await page.waitForTimeout(2000);
            await idle(page);
            await snap(page, 'extra-compose-find-password');
            facts.template.resultsPassword = await page.getByRole('list', {name: 'Search Results'}).getByRole('button').allInnerTexts().catch(() => null);
            const firstResult = page.getByRole('list', {name: 'Search Results'}).getByRole('button').first();
            if (await firstResult.count()) {
                await firstResult.click();
                await page.waitForTimeout(1500);
                await idle(page);
                const p = await snap(page, 'extra-compose-picked');
                facts.template.subjectAfterPick = await subject.inputValue();
                facts.template.dialogAfterPick = p.text.dialog;
                if (p.text.dialog) {
                    facts.template.dialogButtons = await page.getByRole('dialog').last().getByRole('button').allInnerTexts();
                    await page.getByRole('dialog').last().getByRole('button').first().click().catch(() => {});
                    await page.waitForTimeout(1000);
                    facts.template.subjectAfterDialog = await subject.inputValue();
                }
            }
            await subject.fill(`Invitation${T}`);
            await page.getByRole('button', {name: 'Invite user to the role'}).click();
            const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
            await expect(sent).toBeVisible({timeout: 30_000});
            const deadline = page.waitForResponse((r) => /\/api\/v1\/invitations\/userRoleAssignment/.test(r.url()) && r.request().method() === 'GET', {timeout: 30_000});
            await sent.getByRole('button', {name: 'View All Users'}).click();
            const resp = await deadline;
            const body = await resp.json().catch(() => null);
            const items = (body && (body.items || body.data || body)) || [];
            const mine = Array.isArray(items) ? items.find((x) => JSON.stringify(x).includes(to)) : null;
            facts.deadline = {status: resp.status(),
                dates: mine ? Object.fromEntries(Object.entries(mine).filter(([k]) => /^(createdAt|updatedAt|expiryDate)$/.test(k))) : null};
            const summary = await app.mail.find({to, contains: `Invitation${T}`, timeoutMs: 30_000});
            const full = await app.mail.fullMessage(summary.ID);
            facts.mailSubject = full.Subject;
            const m = (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
            accept = m ? m[1].replace(/&amp;/g, '&') : null;
        });
        if (accept) await step('consent', async () => {
            await vp.goto(accept);
            await expect(vp.getByRole('heading', {name: /Create .* account/})).toBeVisible({timeout: 30_000});
            await vp.getByLabel(/^Username/).fill(`acc${T}`);
            await vp.getByLabel(/^Password/).fill(`Password${T}`);
            await vp.getByRole('button', {name: 'Save and continue'}).click();
            await vp.waitForTimeout(1500);
            await idle(vp);
            const c = await snap(vp, 'extra-consent-unticked');
            facts.consent = {stayed: await vp.getByRole('heading', {name: /Create .* account/}).count(),
                message: (c.text.main.match(/Please confirm[^\n]*/) || [null])[0], notices: c.notices};
        });
        await step('masthead', async () => {
            const {page: ep, close: closeE} = await launch(app);
            try {
                await signIn(ep, 'manager.maya');
                await ep.goto(`/index.php/${app.contextPath}/management/settings/manageEmails`);
                await expect(ep.getByRole('heading', {name: 'Manage Emails'})).toBeVisible({timeout: 30_000});
                await idle(ep);
                const sb = ep.getByRole('searchbox');
                await sb.pressSequentially('masthead', {delay: 20});
                await sb.press('Enter');
                await ep.waitForTimeout(1500);
                await idle(ep);
                const s = await snap(ep, 'extra-emails-masthead');
                const edits = ep.locator('main').getByRole('button', {name: /^Edit /});
                facts.masthead = {rows: await edits.allInnerTexts(), names: await edits.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.textContent.trim())),
                    noItems: s.text.main.includes('No items found.')};
                if (await edits.count()) {
                    await edits.first().click();
                    await ep.waitForTimeout(5000);
                    await idle(ep).catch(() => {});
                    const e = await snap(ep, 'extra-emails-masthead-edit');
                    facts.masthead.afterEdit = {url: e.url, dialog: (e.text.dialog || '').slice(0, 400), main: (e.text.main || '').replace(/\s+/g, ' ').slice(0, 300),
                        spinner: await ep.locator('.pkpSpinner, [class*="spinner"]').filter({visible: true}).count().catch(() => null)};
                }
            } finally {
                await closeE();
            }
        });
    } finally {
        record('extra', facts);
        await close();
        await closeV();
    }
});
