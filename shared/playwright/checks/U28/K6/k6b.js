// U28 claim check, chunk K6b — the remainder of K6 (docs/process/briefs/claim-check.md): what an OPS account holding a home-made "Reviewer"-level role
// gets (K6-2 of .reports/U28/cc-K6.md).
//
// Starts from K6's scratch server (scratch.json in ../ccK6/, copied into this
// agent's folder): the manager created the role "Scratch Reviewer" (level
// "Reviewer") and invited the author "rev" to it; the invitation email is in
// Mailpit. This script, on OPS only:
//   1. signs in as rev, opens the email's "Accept Invitation" link and walks
//      the acceptance wizard, recording every step;
//   2. as rev: the post-acceptance landing, `dashboard/editorial`, the typed
//      list address `dashboard/reviewAssignments` and the typed wizard
//      address `reviewer/submission/{id}` of the scratch preprint;
//   3. as the manager: the Roles grid and the Users row of rev.
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK6b node bin/probe.js ops shared/playwright/checks/U28/K6/k6b.js
//   Needs K6's scratch.json (run k6.js first: PHASES=accounts,roles). On a
//   re-run with roleAssigned already set, step 1 is skipped.
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, outDir} =
    require('../../../probe');

const OWN_SCRATCH = path.join(outDir(), 'scratch.json');
const K6_SCRATCH = path.join(outDir(), '..', 'ccK6', 'scratch.json');
const readJSON = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const scratchAll = readJSON(OWN_SCRATCH) || readJSON(K6_SCRATCH) || {};
const saveScratch = () => {
    fs.writeFileSync(OWN_SCRATCH, JSON.stringify(scratchAll, null, 2));
    // K6's phased script keys its `rev` phase on the same flag.
    const k6 = readJSON(K6_SCRATCH);
    if (k6 && k6.ops) { k6.ops.roleAssigned = scratchAll.ops.roleAssigned; fs.writeFileSync(K6_SCRATCH, JSON.stringify(k6, null, 2)); }
};
const log = (...a) => console.log(...a);
const squash = (s, n = 400) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function full(page, name, extra = {}) {
    const data = await screen(page);
    data.bodyText = await page.locator('body').innerText().catch(() => null);
    Object.assign(data, extra);
    record(name, data);
    await shot(page, name);
    return data;
}

/** Typed address: status, final URL, title, h1s, header/nav landmarks, body text. */
async function typed(page, app, pathname, name) {
    const resp = await page.goto(app.url(pathname), {waitUntil: 'domcontentloaded'});
    await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
    await page.locator('main table tbody tr, main .pkpTable, main [role="alert"], main h1').first().waitFor({timeout: 8000}).catch(() => {});
    const status = resp ? resp.status() : null;
    const h1 = await page.locator('h1').allInnerTexts().catch(() => []);
    const headerCount = await page.locator('header, [role="banner"]').count().catch(() => null);
    const navCount = await page.locator('nav, [role="navigation"]').count().catch(() => null);
    const nav = await sidebar(page);
    const listHeaders = await page.locator('main table thead th').allInnerTexts().catch(() => []);
    const data = await full(page, name, {typedPath: pathname, status, h1, headerCount, navCount, sidebar: nav, listHeaders});
    log(`  ${app.name} ${pathname} -> ${status} ${page.url()} title=${JSON.stringify(data.title)} h1=${JSON.stringify(h1)} header=${headerCount} nav=${navCount}`);
    log(`     sidebar: ${JSON.stringify(nav.flatMap((n) => n.items.map((i) => i.text)).filter(Boolean))}`);
    log(`     list headers: ${JSON.stringify(listHeaders)}`);
    log(`     text: ${squash(data.bodyText, 400)}`);
    return data;
}

/** Sidebar: every navigation landmark's links, grouped by nav name. */
async function sidebar(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('nav, [role="navigation"]')].map((nav) => ({
            name: nav.getAttribute('aria-label') || nav.className,
            items: [...nav.querySelectorAll('a')].map((a) => ({text: a.innerText.trim().replace(/\s+/g, ' '), href: a.getAttribute('href')})),
        })),
    );
}

/** Settings › Users & Roles › Roles: the grid's headers and rows. */
async function rolesGrid(page, app, base, name) {
    await page.goto(app.url(`${base}/management/settings/access`), {waitUntil: 'domcontentloaded'});
    const tab = page.getByRole('tab', {name: 'Roles', exact: true});
    await tab.click();
    const grid = page.locator('#roleGridContainer');
    await grid.locator('table tbody tr').first().waitFor({timeout: 20000});
    const data = await grid.evaluate((el) => {
        const table = el.querySelector('table');
        const headers = [...table.querySelectorAll('thead th')].map((th) => th.innerText.trim());
        const rows = [...table.querySelectorAll('tbody tr')]
            .map((tr) => [...tr.querySelectorAll('td, th')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))
            .filter((cells) => cells.some((c) => c));
        return {headers, rows};
    });
    await full(page, name, {roles: data});
    log(`  ${app.name} Roles headers: ${JSON.stringify(data.headers)}`);
    for (const r of data.rows) log(`    ${JSON.stringify(r)}`);
    return data;
}

const NEVER = /Decline|Cancel|Back|Verify ORCID iD|Privacy Statement|Log ?out/i;
const PREFER = [/^Skip ORCID verification$/i, /^Save and continue$/i, /^Accept/i, /^Continue/i];

/** Walk the acceptance wizard: record each step, press the safest "next" control. */
async function acceptWizard(page, app) {
    for (let i = 1; i <= 7; i++) {
        await page.locator('main, [role="dialog"]').first().waitFor({timeout: 10000}).catch(() => {});
        await page.locator('main button, main a, [role="dialog"] button').first().waitFor({timeout: 10000}).catch(() => {});
        const st = await full(page, `rev-accept-step${i}`);
        const dialogs = st.dialogs || [];
        log(`     step ${i}: ${page.url()} title=${JSON.stringify(st.title)}; main: ${squash(st.text && st.text.main, 350)}`);
        if (dialogs.length) log(`     dialogs: ${JSON.stringify(dialogs.map((d) => squash(typeof d === 'string' ? d : JSON.stringify(d), 300)))}`);
        const dialog = page.locator('[role="dialog"]').last();
        if (await dialog.isVisible().catch(() => false)) {
            const dText = await dialog.innerText().catch(() => '');
            if (/logged in as a different user/i.test(dText)) return {ok: false, reason: 'shouldBeAnonymous'};
            const done = dialog.getByRole('button', {name: /View All Submissions|Dashboard|Continue/i}).first();
            if (await done.isVisible().catch(() => false)) {
                log(`     acceptance dialog: ${squash(dText, 300)}; pressing "${await done.innerText()}"`);
                await done.click();
                await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
                await page.locator('main').first().waitFor({timeout: 10000}).catch(() => {});
                await full(page, 'rev-accept-done');
                log(`     after acceptance: ${page.url()}`);
                return {ok: true};
            }
        }
        // A privacy-consent checkbox on the review step must be ticked first.
        const boxes = page.locator('main input[type="checkbox"]');
        for (let b = 0; b < await boxes.count(); b++) {
            const box = boxes.nth(b);
            if (await box.isVisible().catch(() => false) && !(await box.isChecked().catch(() => true))) {
                await box.check().catch(() => {});
                log('     ticked a checkbox on this step');
            }
        }
        const controls = page.locator('main button:not([disabled]), main a.pkpButton, main [role="button"]');
        const names = (await controls.allInnerTexts()).map((n) => n.trim());
        log(`     controls: ${JSON.stringify(names)}`);
        let idx = -1;
        for (const re of PREFER) { idx = names.findIndex((n) => re.test(n)); if (idx >= 0) break; }
        if (idx < 0) idx = names.findLastIndex((n) => n && !NEVER.test(n));
        if (idx < 0) return {ok: false, reason: `no next control among ${JSON.stringify(names)}`};
        log(`     pressing "${names[idx]}"`);
        await controls.nth(idx).click();
        await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
    }
    return {ok: false, reason: 'wizard did not finish in 7 steps'};
}

forEachApp(async (app) => {
    if (app.name !== 'ops') return;
    const sc = scratchAll.ops;
    if (!sc || !sc.path || !sc.roleInvited) { log('no K6 scratch server with a pending invitation; run k6.js first'); return; }
    const base = `/index.php/${sc.path}`;
    const u = sc.users;
    const id = sc.subId;
    const revEmail = `${u.rev}@mail.test`;
    const {page, close} = await launch(app);
    page.on('dialog', (d) => { log(`  [browser dialog] ${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
    try {
        // 1. Accept the invitation from the email, signed in as rev.
        if (!sc.roleAssigned) {
            const msg = await app.mail.find({to: revEmail, subject: 'You are invited to new roles', timeoutMs: 5000});
            const fullMsg = await app.mail.fullMessage(msg.ID);
            const acceptLink = app.mail.extractLink(fullMsg.HTML, 'Accept Invitation');
            log(`  email "${msg.Subject}" to ${revEmail}; accept link path: ${acceptLink && new URL(acceptLink).pathname}`);
            await signIn(page, u.rev);
            await page.locator('main, body').first().waitFor({timeout: 10000}).catch(() => {});
            const after = await full(page, 'rev-after-login');
            log(`  rev signed in, landed on ${page.url()} title=${JSON.stringify(after.title)}`);
            let resp = await page.goto(acceptLink, {waitUntil: 'domcontentloaded'});
            await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
            log(`  accept link -> ${resp && resp.status()} ${page.url()}`);
            let result = await acceptWizard(page, app);
            if (!result.ok && result.reason === 'shouldBeAnonymous') {
                log('  the page refuses a signed-in user; retrying signed out');
                await signOut(page);
                resp = await page.goto(acceptLink, {waitUntil: 'domcontentloaded'});
                await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
                log(`  accept link (signed out) -> ${resp && resp.status()} ${page.url()}`);
                result = await acceptWizard(page, app);
            }
            log(`  acceptance result: ${JSON.stringify(result)}`);
            if (!result.ok) { await full(page, 'rev-accept-stuck'); return; }
            sc.roleAssigned = true; saveScratch();
            await signOut(page);
        }

        // 2. rev with the home-made role: landing, the typed list address, the typed wizard address.
        await signIn(page, u.rev);
        {   // The accept link opened again once the role is held (a re-run lands here).
            const msg = await app.mail.find({to: revEmail, subject: 'You are invited to new roles', timeoutMs: 5000}).catch(() => null);
            const link = msg && app.mail.extractLink((await app.mail.fullMessage(msg.ID)).HTML, 'Accept Invitation');
            if (link) {
                const resp = await page.goto(link, {waitUntil: 'domcontentloaded'});
                await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
                await page.locator('main h1, main h2, main p, [role="dialog"]').first().waitFor({timeout: 8000}).catch(() => {});
                const again = await full(page, 'rev-accept-link-revisit');
                log(`  accept link revisited -> ${resp && resp.status()} ${page.url()} title=${JSON.stringify(again.title)}; text: ${squash(again.bodyText, 300)}`);
            }
        }
        await page.locator('main, body').first().waitFor({timeout: 10000}).catch(() => {});
        const landed = await full(page, 'rev-landing-after-signin', {sidebar: await sidebar(page)});
        log(`  rev sign-in landing: ${page.url()} title=${JSON.stringify(landed.title)}`);
        const editorial = await typed(page, app, `${base}/dashboard/editorial`, 'rev-landing');
        const texts = (editorial.sidebar || []).flatMap((n) => n.items.map((i) => i.text));
        log(`     reviewer group present: ${texts.some((t) => /Assignments as Reviewer/i.test(t))}; reviewAssignments href: ${(editorial.sidebar || []).some((n) => n.items.some((i) => /reviewAssignments/.test(i.href || '')))}`);
        const list = await typed(page, app, `${base}/dashboard/reviewAssignments`, 'rev-reviewAssignments');
        const lTexts = (list.sidebar || []).flatMap((n) => n.items.map((i) => i.text));
        log(`     reviewer group present: ${lTexts.some((t) => /Assignments as Reviewer/i.test(t))}; reviewAssignments href: ${(list.sidebar || []).some((n) => n.items.some((i) => /reviewAssignments/.test(i.href || '')))}`);
        const revNav = page.locator('nav a').filter({hasText: /Assignments as Reviewer|All assignments|Action required/i}).first();
        if (await revNav.count()) await loc(page, 'sidebar: a reviewer-list link', revNav);
        await typed(page, app, `${base}/reviewer/submission/${id}`, 'rev-reviewer-submission');
        await signOut(page);

        // 3. The manager's view: the Roles grid and rev's Users row.
        await signIn(page, u.mgr);
        await rolesGrid(page, app, base, 'roles-ops-scratch-k6b');
        await page.goto(app.url(`${base}/management/settings/access`), {waitUntil: 'domcontentloaded'});
        const search = page.getByPlaceholder(/Enter a user/).or(page.getByRole('searchbox')).first();
        await search.waitFor({timeout: 15000});
        await search.fill(u.rev);
        await search.press('Enter');
        const row = page.locator('main table tbody tr').filter({hasText: u.rev}).first();
        await row.waitFor({timeout: 15000});
        const cells = await row.locator('td, th').allInnerTexts();
        const headers = await page.locator('main table thead th').allInnerTexts().catch(() => []);
        await full(page, 'users-rev-after', {row: cells, headers});
        log(`  Users row for rev: headers ${JSON.stringify(headers)} cells ${JSON.stringify(cells.map((c) => squash(c, 120)))}`);
        await signOut(page);

        note(`ccK6b [ops]: ${new Date().toISOString().slice(0, 10)} — the role-invitation email ("You are invited to new roles", to <username>@mail.test) links invitation/accept?id=N&key=…; opened while signed in as the invitee it opens the acceptance wizard (see rev-accept-step*.json in .reports/U28/ccK6b/). See .reports/U28/cc-K6b.md.`);
    } finally {
        await close();
    }
});
