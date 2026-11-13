// Helpers for the U14 K13a check (k13a.js). Requiring this file runs nothing.
const fs = require('fs');
const {sql} = require('../../../probe');

/** Remove every ORCID setting of a dataset user (so a phase can run twice). */
function clearOrcid(app, username) {
    sql(app, `DELETE FROM user_settings WHERE setting_name LIKE 'orcid%' AND user_id = (SELECT user_id FROM users WHERE username = '${username}');`);
}

/**
 * The precondition only ORCID's service creates: a user whose ORCID iD is
 * stored but not verified (the one setting `orcid` RegistrationForm writes
 * after "Create or Connect your ORCID iD", no `orcidIsVerified`).
 */
function setUnverifiedOrcid(app, username, orcid = 'https://orcid.org/0000-0001-5109-3700') {
    clearOrcid(app, username);
    const q =
        `INSERT INTO user_settings (user_id, locale, setting_name, setting_value) ` +
        `SELECT user_id, '', 'orcid', '${orcid}' FROM users WHERE username = '${username}';`;
    sql(app, q);
    return q;
}

/** A verified iD: the six rows VerifyIdentityWithOrcid::setIdentityData() writes. */
function connectOrcid(app, username, orcid = 'https://orcid.org/0000-0002-1825-0097') {
    const rows = [
        ['orcid', orcid],
        ['orcidIsVerified', '1'],
        ['orcidAccessToken', 'k13a-access-token'],
        ['orcidAccessScope', '/activities/update'],
        ['orcidRefreshToken', 'k13a-refresh-token'],
        ['orcidAccessExpiresOn', '2046-10-02 00:00:00'],
    ];
    clearOrcid(app, username);
    const q =
        `INSERT INTO user_settings (user_id, locale, setting_name, setting_value) ` +
        `SELECT u.user_id, '', v.name, v.value FROM users u, (VALUES ` +
        rows.map(([n, v]) => `('${n}', '${v}')`).join(', ') +
        `) AS v(name, value) WHERE u.username = '${username}';`;
    sql(app, q);
    return q;
}

/** A user's affiliation rows, to take away and put back (the no-affiliation end). */
function takeAffiliation(app, username) {
    const rows = sql(app, `SELECT locale, setting_value FROM user_settings WHERE setting_name = 'affiliation' AND user_id = (SELECT user_id FROM users WHERE username = '${username}')`);
    sql(app, `DELETE FROM user_settings WHERE setting_name = 'affiliation' AND user_id = (SELECT user_id FROM users WHERE username = '${username}');`);
    return rows ? rows.split('\n').map((l) => l.split('|')) : [];
}

function restoreAffiliation(app, username, rows) {
    for (const [locale, value] of rows) {
        sql(app,
            `INSERT INTO user_settings (user_id, locale, setting_name, setting_value) ` +
            `SELECT user_id, '${locale}', 'affiliation', '${value.replace(/'/g, "''")}' FROM users WHERE username = '${username}';`);
    }
}

/**
 * Press an ORCID link that opens in a new tab; return the address the tab
 * opened. orcid.org is answered by a stand-in page (no outside network).
 */
async function pressOrcidLink(page, link) {
    const context = page.context();
    if (!context.__orcidStandIn) {
        await context.route(/^https:\/\/(sandbox\.)?orcid\.org\//, (route) =>
            route.fulfill({status: 200, contentType: 'text/html', body: '<title>orcid stand-in</title>'})
        );
        context.__orcidStandIn = true;
    }
    const opened = context.waitForEvent('page', {timeout: 30_000});
    await link.click();
    const tab = await opened;
    await tab.waitForLoadState('domcontentloaded').catch(() => {});
    const url = tab.url();
    await tab.close();
    return url;
}

/** Every ORCID link in a scope: text, address, name, target. */
async function readOrcidLinks(scope) {
    return scope.locator('a[href*="orcid"]').evaluateAll((els) =>
        els.map((a) => ({
            text: a.textContent.replace(/\s+/g, ' ').trim(),
            href: a.getAttribute('href'),
            name: a.getAttribute('aria-label'),
            title: a.getAttribute('title'),
            target: a.getAttribute('target'),
            uses: [...a.querySelectorAll('use')].map((u) => u.getAttribute('href')),
        }))
    );
}

const STATIC = /\.(js|css|png|svg|jpe?g|gif|woff2?|ttf|ico|map)(\?|$)/i;

/**
 * The fleet's server log since `from`, cut into requests. The dataset fleet's
 * php -S runs one worker, so a PHP message printed while a request runs sits
 * between that request's "Accepted" line and its "[status]: METHOD url" line:
 * each message is pinned on the next status line. Static files are left out
 * of `requests` unless they carry a message.
 *
 * @returns {{requests: string[], warned: {request: string, messages: string[]}[], trailing: string[]}}
 */
function logRequests(file, from) {
    if (!fs.existsSync(file)) return {requests: [], warned: [], trailing: []};
    const lines = fs.readFileSync(file).subarray(from).toString('utf8').split('\n');
    const requests = [];
    const warned = [];
    let pending = [];
    for (const line of lines) {
        const m = line.match(/\[(\d{3})\]: (\w+) (\S+)/);
        if (m) {
            const request = `${m[1]} ${m[2]} ${m[3]}`;
            if (pending.length) warned.push({request, messages: pending});
            if (!STATIC.test(m[3]) || pending.length) requests.push(request);
            pending = [];
        } else if (/^\[[^\]]+\] PHP /.test(line)) {
            // a PHP message; its "Stack trace:" and "thrown in" lines are left out
            pending.push(line.replace(/^\[[^\]]+\] /, ''));
        }
    }
    return {requests, warned, trailing: pending};
}

module.exports = {clearOrcid, setUnverifiedOrcid, connectOrcid, takeAffiliation, restoreAffiliation, pressOrcidLink, readOrcidLinks, logRequests};
