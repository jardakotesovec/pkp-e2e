// Helpers for the U01 A17 issue walk (the security audit log's line for a
// session ended by a password change in another browser), on PKP's default
// test dataset. Copied in part from ../../U01/H19/cc19l.js so this folder
// stands alone. Requiring this file runs nothing.
//   docs/issues/U01-A17-password-change-logout-audited-as-ip-change.md
const fs = require('fs');
const path = require('path');
const {record, screen, shot, idle} = require('../../../probe');

const strip = (u) => String(u).replace(/^https?:\/\/[^/]+/, '');
exports.strip = strip;

/**
 * Turn the security audit log on in the fleet's own config: `[logs] log_audit = On`,
 * as a team member sets it in config.inc.php (a reset writes the config afresh).
 * A config with no [logs] section (stable-3_5_0) gets one at the end.
 */
function ensureAudit(app) {
    if (!app.dataset) throw new Error('drives a dataset fleet only (fleet-prep --dataset)');
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(__dirname, '../../../../..', app.configFile);
    const text = fs.readFileSync(file, 'utf8');
    if (/^log_audit\s*=\s*On\s*$/m.test(text)) return {file: path.basename(file), was: 'On'};
    let next = text.replace(/^\[logs\]\s*$/m, '[logs]\nlog_audit = On');
    const added = next === text;
    if (added) next = `${text.replace(/\s*$/, '\n')}\n[logs]\nlog_audit = On\n`;
    fs.writeFileSync(file, next);
    return {file: path.basename(file), was: added ? 'no [logs] section' : 'off (commented out)', now: 'On'};
}
exports.ensureAudit = ensureAudit;

/** The audit entries the server log gained since `from` (Monolog's errorlog lines). */
function auditSince(log, from) {
    return log.since(from).map((l) => {
        const m = l.match(/\] \w+\.(\w+): (.*?) (\{.*\})\s*$/);
        if (!m) return {raw: l.slice(0, 400)};
        let ctx = {};
        try {
            ctx = JSON.parse(m[3]);
        } catch {
            ctx = {unparsed: m[3].slice(0, 300)};
        }
        return {level: m[1], message: m[2], event: ctx.event, status: ctx.status, reason: ctx.reason, userId: ctx.userId,
            oldIp: ctx.oldIp, newIp: ctx.newIp, ip: ctx.ip, requestUrl: ctx.requestUrl && strip(ctx.requestUrl)};
    });
}
exports.auditSince = auditSince;

/** Where the page is: its address, whether it shows the Login form or the user menu. */
async function where(page) {
    return {url: strip(page.url()), title: await page.title().catch(() => null), loginForm: await page.locator('form#login').count(),
        userMenu: await page.locator('[data-cy="app-user-nav"]').count()};
}
exports.where = where;

async function snap(page, name) {
    await idle(page).catch(() => {});
    record(name, await screen(page));
    await shot(page, name);
}
exports.snap = snap;

/** Profile › "Password": current, new twice, "Save"; returns the tab's notice and the toast. */
async function changeOwnPassword(app, page, current, next) {
    const {ProfilePage} = require('../../../pages/ProfilePage.js');
    const profile = new ProfilePage(page, app.contextPath);
    await profile.goto('password');
    await profile.fillPasswords({current, next});
    await profile.save();
    return {notice: await profile.inTabNotice('password').innerText().catch(() => null),
        toast: await profile.toast.innerText().catch(() => null)};
}
exports.changeOwnPassword = changeOwnPassword;

/** The user menu's "Logout"; waits for the Login page. */
async function logout(page) {
    const nav = page.locator('[data-cy="app-user-nav"] button').first();
    await nav.click({timeout: 8000});
    const link = page.locator('[data-cy="app-user-nav"]').getByRole('link', {name: 'Logout', exact: true});
    await Promise.all([page.waitForURL(/\/login/, {timeout: 15000}), link.click({timeout: 5000})]);
}
exports.logout = logout;
