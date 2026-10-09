// U63 claim check I09 (housekeeping hk09): shared helpers of i09.js and its row modules.
// The kit is the only source of browsers and records; nothing here asserts.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {screen, shot, record, idle, sql, outFile, serverLog} = require('../../../probe');

const T = 30_000;
const REPO = path.resolve(__dirname, '../../../../..');
const RUN = process.env.PROBE_RUN || 'r0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

/** One bag per app and run: state, facts, snapshots, the fleet's server log, SQL reads, the command line. */
function makeCtx(app, page, name) {
    const statePath = outFile(`${name}-state.json`);
    const S = fs.existsSync(statePath) && process.env.RESEED !== '1' ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath, JSON.stringify(S, null, 1));
    const T0 = Date.now();
    const log = (...a) => console.log(`[u63i09 ${RUN} ${app.name} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
    const fact = (k, v) => { record(`${name}-facts`, {[k]: v}, {merge: true}); log(k, flat(JSON.stringify(v), 3000)); };
    let n = 0;
    /** The kit's screen() under a numbered name, with a screenshot; returns the snapshot and its label. */
    const snap = async (label, extra = {}) => {
        const full = `${name}-${String(++n).padStart(3, '0')}-${label}`;
        const s = await screen(page).catch((e) => ({url: page.url(), screenError: flat(e.message, 300)}));
        record(full, {...s, ...extra});
        await shot(page, full).catch(() => {});
        return {...s, label: full};
    };
    const slog = serverLog(app);
    /** The fleet's server log lines since `from`, cut short (a line is pinned on a request by its time). */
    const logSince = (from) => slog.since(from).map((l) => flat(l, 320)).slice(0, 20);
    const q = (s) => { try { return sql(app, s).split('\n').filter(Boolean); } catch (e) { return [`sql error: ${flat(e.message, 300)}`]; } };
    const cli = (args, timeout = 300_000) => {
        try {
            return flat(execFileSync('php', args, {cwd: path.resolve(REPO, app.root), env: {...process.env, PKP_CONFIG_FILE: path.resolve(REPO, app.configFile)}, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024}), 3000);
        } catch (e) { return `ERR ${flat(`${e.stdout || ''} ${e.stderr || ''} ${e.message}`, 2500)}`; }
    };
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const go = async (u) => { let st = null; try { const r = await page.goto(u); st = r && r.status(); } catch (e) { st = flat(e.message, 120); } await idle(page).catch(() => {}); return st; };
    return {app, page, S, save, log, fact, snap, slog, logSince, q, cli, cu, go, RUN};
}

/** A tool page's jQuery UI tab names, in order, "*" on the open one. */
async function toolTabs(page) {
    return page.locator('#importExportTabs > ul > li').evaluateAll((ls) => ls.map((l) => `${l.textContent.replace(/\s+/g, ' ').trim()}${l.getAttribute('aria-selected') === 'true' ? '*' : ''}`)).catch(() => []);
}

/** The open tab's panel text. */
async function panelText(page, n = 3000) {
    return flat(await page.locator('#importExportTabs > [role="tabpanel"]:visible').first().innerText().catch(() => null), n);
}

module.exports = {T, REPO, RUN, sleep, flat, rel, makeCtx, toolTabs, panelText};
