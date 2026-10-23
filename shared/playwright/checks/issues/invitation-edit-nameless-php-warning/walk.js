// Issue report U06 A17: "Edit Invitation" on an invitation sent with no Given Name writes
// `PHP Warning: Trying to access array offset on null` (UserRoleAssignmentInviteUIController.php)
// to the server's error log, beside the four `Undefined array key "invitation_id"` lines of A14.
//
// Mode `walk` (default) takes the report's Steps on PKP's default dataset as `rvaca`: three
// newcomer invitations sent through "Invite to a role" (Author, today, "Does not appear on the
// masthead"): `nameless.hkq23o@mailinator.com` with no names (the Steps), `family.hkq23o@…`
// with a Family Name only (the variant) and `both.hkq23o@…` with "Ines" "Both" (the control);
// then each one's Invitations row › "Edit" › "Edit Invitation". Each opening marks the fleet's
// server log first and records the PHP messages written since, pinned on the request after
// them, with the page's heading. The stored names of each invitation are read from the
// database as evidence of what the wizard saved.
//
// Mode `nb` (neighbour, for the fix trial; runs alone): the named invitation (`both.hkq23o@…`,
// "Ines" "Both") sent the same way, its "Edit Invitation" opened in English, then the
// interface switched to French from the user menu on that page: the headings the fix must keep
// and what each opening logs.
//
// Run (main through the slot's app lock, one app per call; reset the fleet first):
//   npm run fleet-prep -- --feature issues-q23o --dataset 2 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q23o PROBE_AGENT=q23o \
//       node bin/probe.js ojs shared/playwright/checks/issues/invitation-edit-nameless-php-warning/walk.js
//   MODE=nb PROBE_RUN=nb-out … (the neighbour)
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-q23o-3_5 PROBE_RUN=r35 … node bin/probe.js all …
const fs = require('fs');
const {forEachApp, launch, signIn, switchLanguage, screen, shot, record, idle, serverLog, sql} = require('../../../probe');

const T = 30_000;
const MODE = process.env.MODE || 'walk';
const CASES = MODE === 'nb'
    ? {both: {given: 'Ines', family: 'Both'}}
    : {nameless: {}, family: {family: 'Onlyfamily'}, both: {given: 'Ines', family: 'Both'}};
const address = (key) => `${key}.hkq23o@mailinator.com`;
const flat = (s, n = 4000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const today = () => new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const strip = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '?…');

/** The server log since `from`: each PHP message, pinned on the request line after it. */
function logSince(log, from) {
    if (!fs.existsSync(log.file)) return [];
    const lines = fs.readFileSync(log.file).subarray(from).toString('utf8').split('\n');
    const out = [];
    let pending = [];
    for (const l of lines) {
        if (/PHP (Warning|Notice|Deprecated|Fatal error|Parse error)/.test(l)) {
            pending.push(l.replace(/^\[[^\]]+\]\s*/, '').replace(/\/home\/e2e\/[^ ]*?checkouts\/(stable-3_5_0\/)?/, '').trim());
            continue;
        }
        const m = l.match(/\[(\d{3})\]: (\w+) (\S+)/);
        if (m && (pending.length || Number(m[1]) >= 500)) {
            out.push({request: `${m[1]} ${m[2]} ${strip(m[3])}`, warnings: pending});
            pending = [];
        }
    }
    if (pending.length) out.push({request: null, warnings: pending});
    return out;
}

/** Warnings grouped by message and line, A14's apart from the rest. */
function tally(entries) {
    const g = {};
    for (const e of entries) {
        for (const w of e.warnings) {
            const m = w.match(/PHP (\w+(?: error)?):\s+(.*?) in (\S+) on line (\d+)/);
            const k = m ? `${m[1]}: ${m[2]} @ ${m[3].replace(/^.*\//, '')}:${m[4]}` : flat(w, 160);
            g[k] = (g[k] || 0) + 1;
        }
    }
    return g;
}

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, run: process.env.PROBE_RUN || null, sent: {}, edit: {}, stored: {}, errors: {}};
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const access = async () => {
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/access`));
        await page.locator('main h1').first().waitFor({timeout: T});
        await idle(page);
    };
    const newRow = () => page.getByRole('row').filter({has: page.locator('select[name="userGroupId"]')}).last();
    const send = async (key, {given, family}) => {
        await access();
        await page.locator('main').getByRole('button').filter({hasText: /Invite to a role/}).first().click();
        await page.locator('input[name="search"]').waitFor({timeout: T});
        await idle(page);
        await page.locator('input[name="search"]').fill(address(key));
        await page.getByRole('button', {name: /^Search User/}).last().click();
        await page.getByRole('button', {name: /Save And Continue/i}).waitFor({timeout: T});
        await idle(page);
        if (given) await page.getByLabel(/^Given Name/).first().fill(given);
        if (family) await page.getByLabel(/^Family Name/).first().fill(family);
        await newRow().locator('select[name="userGroupId"]').selectOption({label: 'Author'});
        await newRow().getByRole('textbox').fill(today());
        const ms = newRow().locator('select[name="masthead"]');
        if (await ms.count()) await ms.selectOption({label: 'Does not appear on the masthead'});
        await page.getByRole('button', {name: /Save And Continue/i}).click();
        await page.locator('input[name="subject"]').waitFor({timeout: T});
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
        await page.getByRole('button', {name: 'Invite user to the role'}).click();
        const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
        await sent.waitFor({timeout: T});
        const text = flat(await sent.innerText(), 300);
        await sent.getByRole('button', {name: 'View All Users'}).click();
        await page.waitForURL(/management\/settings\/access/, {timeout: T}).catch(() => {});
        await idle(page);
        return {address: address(key), dialog: text};
    };
    const heading = async () => {
        const s = await screen(page);
        return {s, url: strip(page.url()), title: s.title, h1: flat(await page.locator('main h1').first().innerText().catch(() => null), 200),
            main: flat(s.text && s.text.main, 300)};
    };
    const openEdit = async (key) => {
        const table = page.getByRole('table', {name: /^Invitations \(/});
        await table.waitFor({timeout: T});
        const row = table.locator('tbody tr').filter({hasText: address(key)}).first();
        const rowText = flat(await row.innerText().catch(() => null), 300);
        await row.getByRole('button').last().click();
        await page.getByRole('menuitem', {name: /^Edit/}).click();
        const dlg = page.getByRole('dialog').filter({hasText: 'Edit Invitation'});
        await dlg.waitFor({timeout: T});
        const from = log.mark();
        await dlg.getByRole('button', {name: 'Edit Invitation', exact: true}).click();
        await page.waitForURL(/invitation\/edit\/\d+/, {timeout: T});
        await page.getByRole('button', {name: /Save And Continue/i}).waitFor({timeout: T});
        await idle(page);
        await new Promise((r) => setTimeout(r, 800));
        const h = await heading();
        const entries = logSince(log, from);
        record(`edit-${key}`, h.s);
        await shot(page, `edit-${key}`);
        return {rowText, url: h.url, title: h.title, h1: h.h1, main: h.main, warnings: tally(entries), log: entries};
    };
    const stored = () => {
        try {
            return sql(app, `select email, payload->'givenName', payload->'familyName' from invitations where email like '%.hkq23o@mailinator.com' order by invitation_id`)
                .split('\n').filter(Boolean);
        } catch (e) {
            return [flat(String(e.message), 300)];
        }
    };
    try {
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        for (const [key, names] of Object.entries(CASES)) {
            try {
                facts.sent[key] = await send(key, names);
            } catch (e) {
                facts.errors[`send-${key}`] = flat(String(e.stack || e), 800);
                record(`send-${key}-error`, await screen(page).catch(() => null));
            }
        }
        facts.stored = stored();
        for (const key of Object.keys(CASES)) {
            if (!facts.sent[key]) continue;
            try {
                await access();
                facts.edit[key] = await openEdit(key);
            } catch (e) {
                facts.errors[`edit-${key}`] = flat(String(e.stack || e), 800);
            }
        }
        if (MODE === 'nb' && facts.edit.both) {
            // The same page in French, switched from the user menu.
            try {
                const from = log.mark();
                await switchLanguage(page, 'fr_CA');
                await new Promise((r) => setTimeout(r, 800));
                const h = await heading();
                const entries = logSince(log, from);
                record('edit-both-fr', h.s);
                await shot(page, 'edit-both-fr');
                facts.edit['both-fr'] = {url: h.url, title: h.title, h1: h.h1, main: h.main, warnings: tally(entries), log: entries};
                await switchLanguage(page, 'en').catch(() => {});
            } catch (e) {
                facts.errors['edit-both-fr'] = flat(String(e.stack || e), 800);
            }
        }
    } catch (e) {
        facts.errors.top = flat(String(e.stack || e), 1500);
    } finally {
        record(MODE === 'nb' ? 'neighbour' : 'walk', facts);
        await close();
    }
});
