// U06 drift sweep SW22, Rule 15 "Back": a Given Name and a role row entered for one
// newcomer, "Back" to "Search User", another newcomer's address searched: what
// "Enter details" holds, and, sent as it stands (Start Date and masthead set if
// empty), what the Invitations row and the email carry. Control: a walk with no
// "Back" (the second address's own send in sw22.js / ks27.js).
// Run twice (PROBE_RUN r1, r2), one app per lock call:
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U06 PROBE_AGENT=ccSW22 PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U06/SW22/back.js
const {forEachApp, launch, signIn, screen, record, idle, tag} = require('../../../probe');

const ROLE = {ojs: 'Copyeditor', omp: 'Author', ops: 'Moderator'};

function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

forEachApp(async (app) => {
    const {expect} = require('@playwright/test');
    const T = tag('u06sw22b');
    const facts = {app: app.name, run: process.env.PROBE_RUN || null, tag: T};
    await app.api.createContext({tag: T, users: [{username: `mgr${T}`, roles: ['manager']}]});
    const first = `first${T}@mail.test`;
    const second = `second${T}@mail.test`;
    const newRow = (page) => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
    const snap = async (page, name) => { const s = await screen(page); record(name, s); return s; };
    const {page, close} = await launch(app);
    try {
        await signIn(page, `mgr${T}`);
        await page.goto(`/index.php/${T}/management/settings/access`);
        await page.getByRole('button', {name: 'Invite to a role'}).click();
        await expect(page.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
        const search = async (to) => {
            await page.getByLabel(/Search for a user by email address/).fill(to);
            await page.getByRole('button', {name: 'Search User', exact: true}).click();
            await expect(page.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(page);
        };
        await search(first);
        await page.getByLabel(/^Given Name/).first().fill('Fey');
        await page.getByLabel(/^Family Name/).first().fill('Firstperson');
        await page.getByLabel(/^Affiliation/).first().fill('First Institute').catch(() => {});
        await newRow(page).getByLabel(/^Select a new role/).selectOption({label: ROLE[app.name]});
        await newRow(page).getByRole('textbox').fill(today());
        await newRow(page).getByRole('combobox').last().selectOption({label: 'Does not appear on the masthead'}).catch(() => {});
        await snap(page, 'back-first-filled');
        await page.getByRole('button', {name: 'Back', exact: true}).click();
        await expect(page.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
        await idle(page);
        facts.searchBox = await page.getByLabel(/Search for a user by email address/).inputValue();
        await search(second);
        await snap(page, 'back-second-details');
        facts.second = {
            email: await page.getByLabel(/^Email address/).inputValue().catch(() => null),
            given: await page.getByLabel(/^Given Name/).first().inputValue(),
            family: await page.getByLabel(/^Family Name/).first().inputValue(),
            affiliation: await page.getByLabel(/^Affiliation/).first().inputValue().catch(() => null),
            rows: await page.getByLabel(/^Select a new role/).count(),
            role: await newRow(page).getByLabel(/^Select a new role/).locator('option:checked').innerText().catch(() => null),
            date: await newRow(page).getByRole('textbox').inputValue().catch(() => null),
            masthead: await newRow(page).getByRole('combobox').last().locator('option:checked').innerText().catch(() => null),
        };
        // Send it as it stands, filling only what is empty.
        if (!facts.second.date) await newRow(page).getByRole('textbox').fill(today());
        if (!facts.second.masthead) await newRow(page).getByRole('combobox').last().selectOption({label: 'Appear on the masthead'}).catch(() => {});
        await page.getByRole('button', {name: 'Save And Continue'}).click();
        const subject = page.getByLabel(/^Subject/);
        await expect(subject).toBeVisible({timeout: 30_000});
        await expect(subject).not.toHaveValue('', {timeout: 30_000});
        await idle(page);
        await snap(page, 'back-second-compose');
        await subject.fill(`Invitation${T}`);
        await page.getByRole('button', {name: 'Invite user to the role'}).click();
        const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
        await expect(sent).toBeVisible({timeout: 30_000});
        facts.sentDialog = (await snap(page, 'back-second-sent')).text.dialog;
        await sent.getByRole('button', {name: 'View All Users'}).click();
        await page.waitForURL(/management\/settings\/access/, {timeout: 30_000});
        await expect(page.getByRole('table', {name: /^Current Users \(/}).locator('tbody tr').first()).toBeVisible({timeout: 30_000});
        await idle(page);
        await snap(page, 'back-after');
        facts.invitationRows = (await page.getByRole('table', {name: /^Invitations \(/}).locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
        const summary = await app.mail.find({to: second, contains: `Invitation${T}`, timeoutMs: 30_000});
        const full = await app.mail.fullMessage(summary.ID);
        const text = (full.Text || '').replace(/\r/g, '');
        facts.mail = {to: full.To, greeting: (text.match(/Dear[^\n]*/) || [null])[0],
            roles: (text.match(/Newly assigned roles[\s\S]*?On accepting/) || [''])[0].replace(/\s+/g, ' ').slice(0, 300)};
        facts.firstMailed = await app.mail.count({to: first, contains: `Invitation${T}`});
        const link = (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
        if (link) {
            const {page: vp, close: closeV} = await launch(app);
            try {
                await vp.goto(link[1].replace(/&amp;/g, '&'));
                await expect(vp.getByRole('heading', {name: /Create .* account/})).toBeVisible({timeout: 30_000});
                await snap(vp, 'back-second-accept');
                facts.acceptEmail = (await vp.locator('main').innerText()).match(/Email address\s+(\S+)/)?.[1] || null;
            } finally {
                await closeV();
            }
        }
    } finally {
        record('back', facts);
        await close();
    }
});
