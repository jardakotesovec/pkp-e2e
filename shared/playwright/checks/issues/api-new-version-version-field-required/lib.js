// Helpers of walk.js here (U49 A17). Requiring this file runs nothing.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {expect} = require('@playwright/test');
const {sql} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** The published submission each app's steps use, its title and the side menu's group label. */
const CASES = {
    ojs: {id: 17, title: 'Antimicrobial, heavy metal resistance and plasmid profile of coliforms isolated from nosocomial infections in a hospital in Isfahan, Iran', group: 'Publication', required: 'sectionId'},
    omp: {id: 14, title: 'From Bricks to Brains: The Embodied Cognitive Science of LEGO Robots', group: 'Publication', required: null},
    ops: {id: 2, title: 'The Facets Of Job Satisfaction: A Nine-Nation Comparative Study Of Construct Equivalence', group: 'Preprint', required: 'sectionId'},
};

/**
 * Set `api_key_secret` in the dataset fleet's config (the dataset leaves it empty, so no API key can be
 * made); every reset rewrites the config, so call it after each reset. A team install sets it in
 * config.inc.php ([security]).
 */
function setApiKeySecret(app, secret = 'hkq23n-api-key-secret-for-testing') {
    const REPO = path.resolve(__dirname, '../../../../..');
    const file = path.resolve(REPO, app.configFile);
    const before = fs.readFileSync(file, 'utf8');
    const after = /^api_key_secret\s*=/m.test(before)
        ? before.replace(/^api_key_secret\s*=.*$/m, `api_key_secret = "${secret}"`)
        : before.replace(/^\[security\]\s*$/m, `[security]\napi_key_secret = "${secret}"`);
    fs.writeFileSync(file, after);
    return (after.match(/^api_key_secret\s*=.*$/m) || [])[0] || null;
}

/** Profile › "API Key": the key shown, created first when there is none. */
async function apiKey(page, app) {
    const {ProfilePage} = require('../../../pages/ProfilePage.js');
    const prof = new ProfilePage(page, app.contextPath);
    await prof.goto('apiKey');
    if (!(await prof.apiKeyBox().inputValue().catch(() => '')).includes('.')) await prof.createApiKey();
    return prof.apiKeyBox().inputValue();
}

/** One REST API call with curl, as a developer would send it: Bearer token, JSON body. */
function curl(method, url, token, body = null) {
    const args = ['-s', '-o', '-', '-w', '\n%{http_code}', '-X', method, '-H', `Authorization: Bearer ${token}`, '-H', 'Accept: application/json'];
    if (body) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body));
    args.push(url);
    const out = execFileSync('curl', args, {encoding: 'utf8', timeout: 60_000});
    const i = out.lastIndexOf('\n');
    const text = out.slice(0, i);
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {}
    return {status: Number(out.slice(i + 1)), json, text: json ? null : text.slice(0, 600)};
}

/**
 * An answer as kept in the facts. A 500's body carries the exception's own text (a known, separately
 * tracked matter), so a body with database or PHP error markers is kept as its kind only.
 */
function answer(r) {
    const raw = r.json ? JSON.stringify(r.json) : r.text || '';
    if (/SQLSTATE|Connection:|\.php|Exception|Error\b/.test(raw) && r.status >= 500) {
        const kind = {};
        const st = raw.match(/SQLSTATE\[(\w+)\]/);
        if (st) kind.sqlstate = st[1];
        const c = raw.match(/check constraint \\?"([a-z_]+)\\?"/i);
        if (c) kind.constraint = c[1];
        return {status: r.status, body: '[error text withheld]', errorKind: kind};
    }
    if (!r.json) return {status: r.status, body: flat(r.text)};
    const j = JSON.stringify(r.json);
    return {status: r.status, body: j.length <= 500 ? r.json : {id: r.json.id, versionStage: r.json.versionStage, versionString: r.json.versionString, version: r.json.version}};
}

/** A server-log line kept to its head: the level and the error up to the constraint, no SQL text. */
function logHead(line) {
    const s = String(line);
    const m = s.match(/(\w+\.(?:ERROR|CRITICAL|WARNING)):\s*(SQLSTATE\[\w+\]:[^:]*:\s*\d*\s*ERROR:\s*[^(]*?check constraint "[a-z_]+")/i);
    if (m) return `${m[1]}: ${m[2]}`;
    return flat(s.replace(/\/[\w./-]+\.php/g, '<file>').replace(/\(Connection:.*$/, ''), 220);
}

/** The submission's versions as stored: id, stage and number (3.5: the one version number), status. */
function versions(app, sid) {
    const legacy = (app.line || 'main') !== 'main';
    const v = legacy ? `p.version::text` : `coalesce(p.version_stage, '-') || ' ' || coalesce(p.version_major::text, '-') || '.' || coalesce(p.version_minor::text, '-')`;
    return sql(app, `select p.publication_id || ' ' || ${v} || ' status ' || p.status from publications p where p.submission_id = ${Number(sid)} order by p.publication_id`)
        .split('\n')
        .filter(Boolean);
}

/** The workflow of a submission by the address its "View" opens; the side menu's text. */
async function workflowMenu(page, app, sid, idle) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
    await idle(page).catch(() => {});
    await page.waitForTimeout(1500);
    const nav = page.locator('[role="dialog"] nav').first();
    return flat(await nav.innerText({timeout: 5000}).catch(() => null), 1500);
}

/**
 * "Create New Version" on the open workflow, "Revision Significance" chosen by label; returns
 * {status, id, version, selects} from the window and the version request's answer.
 */
async function createVersion(page, frame, significance) {
    const item = await frame.revealPublicationEntry('Create New Version');
    await frame.expectVersionLoaded().catch(() => {});
    await item.click();
    const dialog = page.getByRole('dialog').filter({has: page.locator('select[name="versionIsMinor"]')}).last();
    await expect(dialog.locator('select[name="versionIsMinor"]')).toBeVisible({timeout: T});
    const out = {};
    out.selects = await dialog
        .locator('select')
        .evaluateAll((ss) => ss.map((s) => ({name: s.name, value: s.value, options: [...s.options].map((o) => o.text.trim())})));
    await dialog.getByLabel('Revision Significance').selectOption({label: significance});
    const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
    await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
    const r = await created;
    out.status = r.status();
    if (r.ok()) {
        const j = await r.json();
        out.id = j.id;
        out.version = `${j.versionStage} ${j.versionMajor}.${j.versionMinor}`;
    }
    await expect(dialog).toHaveCount(0, {timeout: T});
    return out;
}

module.exports = {T, flat, CASES, setApiKeySecret, apiKey, curl, answer, logHead, versions, workflowMenu, createVersion};
