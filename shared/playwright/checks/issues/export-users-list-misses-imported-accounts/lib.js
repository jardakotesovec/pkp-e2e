// Helpers for Tools › Import/Export › "Users XML Plugin" {OJS OMP} on a dataset fleet: the users file the issue
// report's Steps give in full, the tool's "Import Users" upload and press, and the "Export Users" tab's
// "Current Users" list read as the screen shows it. The file and the tool helpers are copied from
// checks/issues/users-import-unreadable-file-empty-results/lib.js (kept self-contained). Requiring this file runs nothing.
const fs = require('fs');
const {screen, shot, record, idle, outFile} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

// ------------------------------------------------------------------------------------------------ the file
// 3.5's format requires <show_title> in a group, which main's refuses (the one difference of the Steps' file).
const groups = (line) => `  <user_groups>
    <user_group>
      <role_id>1048576</role_id>
      <context_id>1</context_id>
      <is_default>true</is_default>
${line === 'stable-3_5_0' ? '      <show_title>true</show_title>\n' : ''}      <permit_self_registration>true</permit_self_registration>
      <permit_metadata_edit>false</permit_metadata_edit>
      <name locale="en">Reader</name>
      <abbrev locale="en">Read</abbrev>
      <stage_assignments></stage_assignments>
      <masthead>false</masthead>
    </user_group>
  </user_groups>
`;
const userXml = (u) => `    <user>
      <givenname locale="en">${u.given}</givenname>
      <familyname locale="en">${u.family}</familyname>
      <email>${u.username}@mailinator.com</email>
      <username>${u.username}</username>
      <password must_change="false">
        <value>${u.username}${u.username}</value>
      </password>
      <date_registered>2026-01-15 10:00:00</date_registered>
      <user_user_group>
        <user_group_ref>Reader</user_group_ref>
        <masthead>false</masthead>
      </user_user_group>
    </user>
`;
const NEW_USERS = [
    {username: 'u63n16ga', given: 'Avery', family: 'Quill'},
    {username: 'u63n16gb', given: 'Blair', family: 'Sage'},
];
/** The Steps' file on a line (main unless `line` is 'stable-3_5_0'), exactly as the Steps give it. */
const usersFile = (line) => `<?xml version="1.0" encoding="UTF-8"?>
<PKPUsers xmlns="http://pkp.sfu.ca" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://pkp.sfu.ca pkp-users.xsd">
${groups(line)}  <users>
${NEW_USERS.map(userXml).join('')}  </users>
</PKPUsers>
`;
/** Write the Steps' file into the run folder; returns its path. */
function writeFile(app) {
    const f = outFile('u63n16g-users.xml');
    fs.writeFileSync(f, usersFile(app.line));
    return f;
}

// ------------------------------------------------------------------------------------------------ the screens
const toolTabs = (page) => page.locator('#importExportTabs > ul > li').evaluateAll((ls) => ls.map((l) => `${l.textContent.replace(/\s+/g, ' ').trim()}${l.getAttribute('aria-selected') === 'true' ? '*' : ''}`)).catch(() => []);
const panelText = async (page) => flat(await page.locator('#importExportTabs > [role="tabpanel"]:visible').first().innerText().catch(() => null), 3000);

/** Steps 1-2 (after sign-in): the left menu's "Tools", then "Users XML Plugin" on "Import/Export". */
async function openUsersTool(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/submissions`));
    await idle(page).catch(() => {});
    const tools = page.getByRole('navigation', {name: 'Site Navigation'}).getByRole('link', {name: 'Tools', exact: true});
    await Promise.all([page.waitForURL(/management\/tools/, {timeout: T}), tools.first().click()]);
    await idle(page).catch(() => {});
    const link = page.getByRole('link', {name: 'Users XML Plugin', exact: true}).first();
    await Promise.all([page.waitForURL(/importexport\/plugin/, {timeout: T}), link.click()]);
    await page.locator('#importXmlForm').waitFor({timeout: T});
    await page.locator('#usersGridContainer tr.gridRow').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await sleep(400);
}

/** Press a tab of the tool by its name ("Import Users", "Export Users"). */
async function openTab(page, name) {
    await page.locator('#importExportTabs > ul > li').filter({has: page.getByRole('link', {name, exact: true})}).last().getByRole('link', {name, exact: true}).click();
    await idle(page).catch(() => {});
    await sleep(600);
}

/** Steps 4-5: upload the file into "File" on "Import Users" and press "Import Users"; returns what shows. */
async function importUsers(page, file) {
    const idBox = page.locator('#importXmlForm #temporaryFileId');
    const before = (await idBox.count()) ? await idBox.inputValue().catch(() => '') : '';
    const up = page.waitForResponse((r) => r.url().includes('uploadImportXML'), {timeout: T}).catch(() => null);
    await page.locator('#importXmlForm input[type=file]').first().setInputFiles(file);
    const u = await up;
    await page.waitForFunction((old) => { const v = (document.querySelector('#importXmlForm #temporaryFileId') || {}).value; return v && v !== old; }, before, {timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    const tabsBefore = (await toolTabs(page)).length;
    const answered = page.waitForResponse((r) => /UserImportExportPlugin\/import\?/.test(r.url()) && r.request().method() === 'GET', {timeout: 120_000}).catch(() => null);
    await page.locator('#importXmlForm').getByRole('button', {name: 'Import Users', exact: true}).click();
    const r = await answered;
    for (let i = 0; i < 40 && (await toolTabs(page)).length === tabsBefore; i++) await sleep(300);
    await idle(page).catch(() => {});
    let text = '';
    for (let i = 0; i < 12; i++) { text = await panelText(page); if (text && text.length > 5) break; await sleep(500); }
    await sleep(800); // a reload the import answer may start
    await idle(page).catch(() => {});
    return {upload: u ? u.status() : null, status: r ? r.status() : null, tabs: await toolTabs(page), results: text};
}

/** Count the users grid's own fetches (`fetchGrid` / `fetch-grid` of ExportableUsersGridHandler) from now on. */
function gridFetches(page) {
    const seen = [];
    const on = (req) => { if (/exportable-users-grid|exportableUsers|ExportableUsersGridHandler/i.test(req.url()) && /fetch-?grid/i.test(req.url())) seen.push(req.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 200)); };
    page.on('request', on);
    return {count: () => seen.length, urls: () => [...seen], stop: () => page.off('request', on)};
}

/** "Current Users" as the screen shows it: the line under the list, the rows' text, the Steps' accounts present. */
async function readList(page) {
    const grid = page.locator('#usersGridContainer');
    const text = flat(await grid.innerText().catch(() => ''), 8000) || '';
    const m = text.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+items/);
    const rows = await grid.locator('tr.gridRow').evaluateAll((trs) => trs.filter((tr) => tr.offsetParent !== null).map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    const ticked = await grid.locator('input[name="selectedUsers[]"]:checked').evaluateAll((bs) => bs.map((b) => b.value)).catch(() => []);
    return {
        pagingLine: m ? m[0] : null,
        total: m ? Number(m[3]) : null,
        rowCount: rows.length,
        firstRow: rows[0] || null,
        lastRow: rows[rows.length - 1] || null,
        newAccountsShown: NEW_USERS.filter((u) => rows.some((r) => r.includes(`${u.username}@`))).map((u) => u.username),
        ticked,
    };
}

/** The control: the list's header "Search", the term, the filter's "Search". */
async function searchList(page, term) {
    const grid = page.locator('#usersGridContainer');
    const form = grid.locator('form#userSearchForm');
    if (!(await form.isVisible().catch(() => false))) await grid.locator('a.pkp_linkaction_search').first().click();
    await form.waitFor({state: 'visible', timeout: T});
    await form.locator('input[name="search"]').fill(term);
    const fetched = page.waitForResponse((r) => /fetch-?grid/i.test(r.url()), {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Search', exact: true}).click();
    await fetched;
    await idle(page).catch(() => {});
    await sleep(600);
}

/** A recorder of numbered screens: `snap(page, name)` writes `<prefix>-NN-name` and returns the label. */
function snapper(prefix) {
    let n = 0;
    return async (page, name) => {
        const label = `${prefix}-${String(++n).padStart(2, '0')}-${name}`;
        const s = await screen(page).catch((e) => ({url: page.url(), screenError: flat(e.message, 300)}));
        record(label, s);
        await shot(page, label).catch(() => {});
        return label;
    };
}

module.exports = {T, sleep, flat, NEW_USERS, usersFile, writeFile, toolTabs, openUsersTool, openTab, importUsers, gridFetches, readList, searchList, snapper};
