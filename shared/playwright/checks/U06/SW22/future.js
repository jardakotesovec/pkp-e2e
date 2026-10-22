// U06 drift sweep SW22, Rule 8's axis: an existing Author invited to a further role
// with a start date in the future (2026-12-01) and one in the past (2026-10-01),
// both accepted signed out; the start date the users list and the member's Edit
// page show afterwards (the past end is also in sw22.js "past").
// Run twice (PROBE_RUN r1, r2), one app per lock call:
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U06 PROBE_AGENT=ccSW22 PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U06/SW22/future.js
const {forEachApp, launch, signIn, screen, record, idle, tag} = require('../../../probe');

const ROLE = {ojs: 'Copyeditor', omp: 'Copyeditor', ops: 'Moderator'};
const ACR = {ojs: 'OJS', omp: 'OMP', ops: 'OPS'};

forEachApp(async (app) => {
    const {expect} = require('@playwright/test');
    const T = tag('u06sw22f');
    const facts = {app: app.name, run: process.env.PROBE_RUN || null, tag: T, dates: {}};
    const people = {fut: '2026-12-01', pas: '2026-10-01'};
    await app.api.createContext({tag: T, users: [{username: `mgr${T}`, roles: ['manager']},
        ...Object.keys(people).map((k) => ({username: `${k}${T}`, givenName: k, familyName: 'Member', roles: ['author']}))]});
    const newRow = (page) => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
    const usersTable = (page) => page.getByRole('table', {name: /^Current Users \(/});
    const {page, close} = await launch(app);
    try {
        await signIn(page, `mgr${T}`);
        for (const [k, date] of Object.entries(people)) {
            const to = `${k}${T}@mail.test`;
            await page.goto(`/index.php/${T}/management/settings/access`);
            await page.getByRole('button', {name: 'Invite to a role'}).click();
            await page.getByLabel(/Search for a user by email address/).fill(to);
            await page.getByRole('button', {name: 'Search User', exact: true}).click();
            await expect(page.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await newRow(page).getByLabel(/^Select a new role/).selectOption({label: ROLE[app.name]});
            await newRow(page).getByRole('textbox').fill(date);
            await newRow(page).getByRole('combobox').last().selectOption({label: 'Appear on the masthead'});
            await page.getByRole('button', {name: 'Save And Continue'}).click();
            const subject = page.getByLabel(/^Subject/);
            await expect(subject).not.toHaveValue('', {timeout: 30_000});
            await subject.fill(`Invitation${T}${k}`);
            await page.getByRole('button', {name: 'Invite user to the role'}).click();
            const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
            await expect(sent).toBeVisible({timeout: 30_000});
            await sent.getByRole('button', {name: 'View All Users'}).click();
            const summary = await app.mail.find({to, contains: `Invitation${T}${k}`, timeoutMs: 30_000});
            const full = await app.mail.fullMessage(summary.ID);
            const link = (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i)[1].replace(/&amp;/g, '&');
            facts.dates[k] = {sent: date, mail: ((full.Text || '').match(/Starting from \S+/g) || [])};
            const {page: vp, close: closeV} = await launch(app);
            try {
                await vp.goto(link);
                await vp.getByRole('button', {name: new RegExp(`^Accept And Continue to ${ACR[app.name]}`)}).click();
                await expect(vp.getByRole('dialog')).toBeVisible({timeout: 30_000});
                record(`future-${k}-accepted`, await screen(vp));
            } finally {
                await closeV();
            }
            await page.goto(`/index.php/${T}/management/settings/access`);
            await expect(usersTable(page).locator('tbody tr').first()).toBeVisible({timeout: 30_000});
            await idle(page);
            facts.dates[k].userRow = (await usersTable(page).locator('tbody tr').filter({hasText: to}).innerText()).replace(/\s+/g, ' ');
            await usersTable(page).getByRole('row').filter({hasText: to}).getByRole('button', {name: /management.options|^More Actions$/i}).click();
            await page.getByRole('menuitem', {name: /^Edit$/}).click();
            await expect(page.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(page);
            record(`future-${k}-edit`, await screen(page));
            facts.dates[k].editRow = (await page.getByRole('row').filter({hasText: ROLE[app.name]}).filter({hasNot: page.getByLabel(/^Select a new role/)}).innerText()).replace(/\s+/g, ' ').slice(0, 160);
        }
    } finally {
        record('future', facts);
        await close();
    }
});
