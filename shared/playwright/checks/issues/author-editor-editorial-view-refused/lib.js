// Helpers for walk.js (U24 A12, A13, OPS6 issue report). Runs nothing when required.
// inviteToRole / acceptInvitation / wfInfo copied from shared/playwright/checks/U24/H19/h19.js
// (kept scripts stand alone).
const {launch, screen, idle} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** The workflow panel as data: header, heading, primary/secondary/action items, side menu, dialogs. */
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => !!(e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
    const txt = (e) => (e ? e.innerText.trim().replace(/\s+/g, ' ') : null);
    const header = document.querySelector('[data-cy="sidemodal-header"]');
    const root = header ? header.closest('[role=dialog]') || header.parentElement : null;
    const dialogs = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')]
        .filter((d) => vis(d) && d !== root && !(root && d.contains(root))).map((d) => txt(d).slice(0, 400));
    if (!root) return {panel: false, dialogs};
    const nav = root.querySelector('nav');
    const prim = root.querySelector('[data-cy="workflow-primary-items"]');
    const sec = root.querySelector('[data-cy="workflow-secondary-items"]');
    const act = root.querySelector('[data-cy="workflow-action-items"]');
    return {
        panel: true,
        headerButtons: header ? [...header.querySelectorAll('button')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label')).filter(Boolean) : [],
        heading: txt(root.querySelector('.pkp-modal-scroll-container h2')),
        primary: prim ? txt(prim).slice(0, 700) : null,
        secondary: sec ? txt(sec).slice(0, 300) : null,
        actions: act ? [...act.querySelectorAll('button, a')].filter(vis).map(txt).filter(Boolean) : [],
        menu: nav ? [...nav.querySelectorAll('a')].filter(vis).map((a) => (a.textContent || '').trim().replace(/\s+/g, ' ')) : [],
        dialogs,
    };
}).catch((e) => ({error: String(e.message)}));

/** Wait for the workflow panel (when one opens) to finish loading. */
async function settle(page) {
    await page.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: 20_000}).catch(() => {});
    await page.waitForFunction(() => {
        const h = document.querySelector('[data-cy="sidemodal-header"]');
        const d = h && h.closest('[role=dialog]');
        return !d || !/Loading|Refreshing data/.test(d.innerText);
    }, null, {timeout: 15_000}).catch(() => {});
    await idle(page); await sleep(1000); await idle(page);
}

/** The "Error" dialog over the panel, if any: its text, then "OK". */
async function dismissError(page) {
    const d = page.locator('[role=dialog]:visible, [role=alertdialog]:visible').filter({hasText: /^\s*Error/}).last();
    if (!(await d.isVisible().catch(() => false))) return null;
    const text = flat(await d.innerText(), 300);
    await d.getByRole('button', {name: 'OK', exact: true}).click({timeout: 5000}).catch(() => {});
    await idle(page); await sleep(600);
    return text;
}

/** The text of the "Files for Review" panel (its heading's nearest list container). */
async function filesForReview(page) {
    return page.evaluate(() => {
        const h = [...document.querySelectorAll('h2, h3, h4')].find((e) => /^\s*Files for Review\s*$/.test(e.textContent || ''));
        if (!h) return null;
        let box = h.parentElement;
        for (let i = 0; i < 4 && box && !/No Items|\.pdf|\.docx?|\.odt/i.test(box.innerText || ''); i++) box = box.parentElement;
        return box ? box.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
    }).catch(() => null);
}

/**
 * Settings › Users & Roles › "Invite to a role": search the address, choose the role in the new role
 * row (start today), "Save And Continue", subject tagged, "Invite user to the role".
 */
async function inviteToRole(page, app, {email, role, subject}) {
    const out = {};
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/access`));
    await page.getByRole('heading', {name: 'Users & Roles'}).first().waitFor({timeout: T});
    await idle(page);
    await page.getByRole('button', {name: 'Invite to a role'}).click();
    const search = page.getByLabel(/Search for a user by email address/);
    await search.waitFor({timeout: T});
    await search.fill(email);
    await page.getByRole('button', {name: 'Search User', exact: true}).click();
    await page.getByRole('heading', {name: /Enter details/}).first().waitFor({timeout: T});
    await idle(page);
    let newRow = page.getByRole('row').filter({hasText: 'Select a new role'}).last();
    if (!(await newRow.count())) { await page.getByRole('button', {name: 'Add Another Role'}).click(); await sleep(500); newRow = page.getByRole('row').filter({hasText: 'Select a new role'}).last(); }
    await newRow.getByRole('combobox').first().selectOption({label: role});
    await newRow.getByRole('textbox').fill(new Date().toISOString().slice(0, 10));
    await newRow.getByRole('combobox').last().selectOption({label: 'Appear on the masthead'}).catch(() => {});
    await page.getByRole('button', {name: 'Save And Continue'}).click();
    const subj = page.locator('input[name="subject"]');
    await subj.waitFor({timeout: T});
    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page); await sleep(500);
    await subj.fill(subject);
    await page.getByRole('button', {name: 'Invite user to the role'}).click();
    const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
    out.sent = await sent.waitFor({timeout: T}).then(() => true).catch(() => false);
    await sent.getByRole('button', {name: 'View All Users'}).click().catch(() => {});
    await idle(page);
    return out;
}

/** Open the invitation email's accept link in a browser of its own and accept (ORCID skipped). */
async function acceptInvitation(app, {email, subject, since}) {
    const out = {};
    const summary = await app.fleetMail.find({to: email, contains: subject, since, timeoutMs: 60_000});
    const full = await app.fleetMail.fullMessage(summary.ID);
    const m = (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
    out.subject = summary.Subject;
    out.link = !!m;
    if (!m) return out;
    const inv = await launch(app);
    try {
        const ip = inv.page;
        await ip.goto(m[1].replace(/&amp;/g, '&'));
        await idle(ip);
        const skip = ip.getByRole('button', {name: 'Skip ORCID verification'});
        if (await skip.isVisible().catch(() => false)) { out.orcidSkipped = true; await skip.click(); await idle(ip); }
        const button = ip.getByRole('button', {name: /^Accept And Continue to/});
        await button.waitFor({timeout: T});
        await button.click();
        const done = ip.getByRole('dialog').filter({hasText: /assigned a new role/});
        out.accepted = await done.waitFor({timeout: T}).then(() => true).catch(() => false);
        if (out.accepted) out.acceptedText = flat(await done.innerText(), 300);
        else out.after = await screen(ip).catch(() => null);
    } finally { await inv.close(); }
    return out;
}

module.exports = {T, sleep, flat, wfInfo, settle, dismissError, filesForReview, inviteToRole, acceptInvitation};
