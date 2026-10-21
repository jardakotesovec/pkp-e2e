// Helpers of walk.js here (U03 A27). Requiring this file runs nothing. Copied in part from
// ../../U03/SW3/lib.js and ../../U03/H19/h19.js so the folder stands alone.
const fs = require('fs');
const path = require('path');
const {idle, screen, shot, record, serverLog} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const b64url = (s) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Set (or put back) `[security] api_key_secret` in the fleet's config; the line before and after. */
function setSecret(app, value) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(REPO, app.configFile);
    const before = fs.readFileSync(file, 'utf8');
    const was = (before.match(/^api_key_secret\s*=.*$/m) || [])[0];
    fs.writeFileSync(file, before.replace(/^api_key_secret\s*=.*$/m, `api_key_secret = "${value}"`));
    return {was, now: (fs.readFileSync(file, 'utf8').match(/^api_key_secret\s*=.*$/m) || [])[0]};
}

/** Snapshot: the kit's screen() into `<name>`, plus a PNG. */
async function snap(page, name) {
    const s = await screen(page);
    record(name, s);
    await shot(page, name).catch(() => {});
    return {file: name, notices: s.notices, url: s.url};
}

/** The Profile page by its address, on the named tab. */
async function openProfile(page, contextPath, tab = 'apiKey') {
    const {ProfilePage} = require(path.join(__dirname, '../../../pages', 'ProfilePage.js'));
    const profile = new ProfilePage(page, contextPath);
    await profile.goto(tab);
    await idle(page).catch(() => {});
    return profile;
}

/** The API Key tab as it stands: the key shown, the buttons, the tab's text. */
async function apiKeyState(profile) {
    const f = profile.form('apiKey');
    if (!(await f.isVisible().catch(() => false))) return {open: false};
    const value = await profile.apiKeyBox().inputValue().catch(() => null);
    return {
        open: true,
        value,
        length: value ? value.length : 0,
        buttons: await f.locator('button').allInnerTexts().then((a) => a.map((t) => flat(t))).catch(() => null),
        text: flat(await f.innerText().catch(() => null), 600),
    };
}

/**
 * One cookie-less `GET {context}/api/v1/submissions`, as the curl of the Steps sends it: the token
 * as a bearer header (or `?apiToken=`). Status, content type, the error body (or the list's keys),
 * and the server log lines it wrote.
 */
async function rest(app, token, {how = 'bearer'} = {}) {
    const {request} = require('@playwright/test');
    const log = serverLog(app);
    const from = log.mark();
    const ctx = await request.newContext({baseURL: app.baseURL, storageState: {cookies: [], origins: []}});
    try {
        let url = `/index.php/${app.contextPath}/api/v1/submissions`;
        const headers = {Accept: 'application/json'};
        if (token != null && how === 'bearer') headers.Authorization = `Bearer ${token}`;
        if (token != null && how === 'param') url += `?apiToken=${encodeURIComponent(token)}`;
        const res = await ctx.get(url, {headers, maxRedirects: 0});
        const text = await res.text().catch(() => '');
        let body;
        try {
            const j = JSON.parse(text);
            body = j && typeof j === 'object' && !Array.isArray(j) && 'error' in j ? j : {keys: Object.keys(j || {}).slice(0, 5), itemsMax: j && j.itemsMax};
        } catch {
            body = {raw: flat(text, 400)};
        }
        await sleep(300);
        return {how: token == null ? 'none' : how, status: res.status(), type: res.headers()['content-type'] || null, body, log: log.since(from).map((l) => flat(l, 300))};
    } finally {
        await ctx.dispose();
    }
}

module.exports = {sleep, flat, b64url, setSecret, snap, openProfile, apiKeyState, rest};
