// Kept regression reproduction for pkp/pkp-lib#13273 (issue #13109), from the 2026-09-09 sync's
// regression read rr3 (docs/tracking/ci-triage.md "Open regressions"). Run:
//   PROBE_FEATURE=sync PROBE_AGENT=rr3 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13109/regressions.js
// Fixed when: S3 four stats rows, S4 no "Done" column (or locked like the other stages), S5 four stages in the picker and in `stages`.
// One OJS process on a scratch journal (manager + author, one submitted submission):
//   S2a manager makes an API key on her own profile screen (Profile › API Key)
//   S3  Statistics › Editorial Activity rows                       (s3-*)
//   S4  Settings › Users & Roles › Roles grid + Author "Edit" form  (s4-*)
//   S5  workflow › Discussions › Add › Attach Files › Attach Workflow Files › stage select (s5-*)
//   S2b bare client GETs _submissions, submissions/{id}, .../publications/{pid} with the key (s2-*)
const {request: pwRequest} = require('playwright');
const {forEachApp, launch, signIn, screen, shot, record, note, idle, settled, tag} =
    require('../../../probe');
const log = (...a) => console.log(...a);

async function snap(page, name) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const visibleButtons = (page) => page.evaluate(() =>
    [...document.querySelectorAll('button, a[role=button], a.pkp_button')].filter((b) => b.offsetParent !== null)
        .map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean).slice(0, 150));

// The workflow modal's menu link by exact label.
const wfDialog = (page) => page.getByRole('dialog').filter({has: page.getByRole('navigation')}).first();
const menuLink = (page, label) => wfDialog(page).getByRole('navigation').getByRole('link', {name: label, exact: true});

async function openTitleAbstract(page) {
    const ta = menuLink(page, 'Title & Abstract');
    if ((await ta.count()) === 0) {
        const pub = menuLink(page, 'Publication');
        if (await pub.count()) { await pub.click(); await idle(page); }
    }
    if ((await ta.count()) === 0) {
        const nodes = wfDialog(page).getByRole('navigation').getByRole('link', {name: /^(Unassigned version|Version of Record|Author Original)\b/});
        if (await nodes.count()) { await nodes.last().click(); await idle(page); }
    }
    await ta.first().waitFor({state: 'visible', timeout: 30_000});
    await ta.first().click();
    await idle(page);
}

async function legacyRowControls(page, row) {
    const toggle = row.locator('a.show_extras');
    if (await toggle.count()) { await toggle.click(); }
    const controls = row.locator('xpath=following-sibling::tr[contains(@class, "row_controls")][1]');
    await controls.waitFor({state: 'visible', timeout: 30_000});
    return controls;
}

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('rr3md');
    const mgr = `${T}mgr`, au = `${T}aut`;
    const ctx = await app.api.createContext({tag: T, users: [
        {username: mgr, roles: ['manager'], givenName: 'Meg', familyName: 'Rrthree'},
        {username: au, roles: ['author'], givenName: 'Au', familyName: 'Thor'},
    ]});
    const sub = await app.api.createSubmission({tag: T, context: T, submitter: au, title: `RR3 ${T}`});
    record('seed', {ctx, sub});
    const sid = sub.submissionId;
    log('seeded', T, 'submission', sid);

    const {page, close} = await launch(app);
    let apiKey = null;
    try {
        await signIn(page, mgr, {contextPath: T});

        // ---------- S2a: API key from the profile screen ----------
        await page.goto(app.url(`/index.php/${T}/user/profile`));
        await idle(page);
        await page.locator('#profileTabs > ul > li > a[name="apiSettings"]').click();
        await idle(page);
        const form = page.locator('form#apiProfileForm');
        await form.waitFor({state: 'visible', timeout: 30_000});
        const create = form.getByRole('button', {name: 'Create API Key', exact: true});
        if (await create.count()) {
            const saved = page.waitForResponse((r) => r.url().includes('profile-tab') && r.request().method() === 'POST', {timeout: 30_000});
            await create.click();
            await saved;
            await idle(page);
        }
        apiKey = await settled(page, page.locator('form#apiProfileForm input[name="apiKey"]'));
        record('s2-apikey-screen', {hasKey: !!apiKey && apiKey !== 'None', length: (apiKey || '').length});
        log('S2a api key length', (apiKey || '').length);

        // ---------- S3: Statistics › Editorial Activity ----------
        await page.goto(app.url(`/index.php/${T}/stats/editorial`));
        await idle(page);
        const s3 = await snap(page, 's3-stats-editorial');
        const rows = await page.locator('table').first().locator('tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.innerText.trim())));
        record('s3-stats-rows', rows);
        log('S3 rows', JSON.stringify(rows));

        // ---------- S4: Settings › Users & Roles › Roles ----------
        await page.goto(app.url(`/index.php/${T}/management/settings/access`));
        await idle(page);
        await page.locator('#roles-button').click();
        await idle(page);
        const grid = page.locator('#roleGridContainer table').first();
        await grid.waitFor({state: 'visible', timeout: 30_000});
        await idle(page);
        const headers = await grid.locator('thead th').evaluateAll((ths) => ths.map((t) => t.innerText.trim()));
        const roleRows = await grid.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => ({
            id: tr.id,
            cells: [...tr.querySelectorAll('td')].map((td) => ({
                text: td.innerText.trim().slice(0, 60),
                links: [...td.querySelectorAll('a')].map((a) => ({title: a.getAttribute('title') || a.innerText.trim(), cls: a.className, href: (a.getAttribute('href') || '').slice(0, 160)})),
                inputs: [...td.querySelectorAll('input')].map((i) => ({type: i.type, checked: i.checked, disabled: i.disabled, name: i.name})),
                imgs: [...td.querySelectorAll('img, span[class*=icon], i[class*=fa]')].map((i) => (i.getAttribute('alt') || i.className || '').slice(0, 80)),
                html: td.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 300),
            })),
        })));
        record('s4-roles-grid', {headers, rows: roleRows});
        log('S4 headers', JSON.stringify(headers));
        for (const r of roleRows) log('S4 row', r.cells[0]?.text, '|', r.cells.slice(2).map((c) => `${c.text}:${c.links.map((l) => l.title).join('/') || (c.inputs[0] ? `input ${c.inputs[0].checked ? 'checked' : 'unchecked'}${c.inputs[0].disabled ? ' disabled' : ''}` : '-')}`).join(' ; '));
        await snap(page, 's4-roles-grid');
        // Author row › Edit
        const authorRow = grid.locator('tr.gridRow').filter({hasText: /^\s*Author\b/}).first();
        if (await authorRow.count()) {
            const controls = await legacyRowControls(page, authorRow);
            await controls.getByRole('link', {name: 'Edit', exact: true}).click();
            await idle(page);
            const modal = page.locator('[role="dialog"]:visible').filter({hasText: /Stage assignment|Permission/i}).last();
            await modal.waitFor({state: 'visible', timeout: 30_000});
            await settled(page, modal.locator('input[name="name[en]"], input[name^="name"]').first());
            const boxes = await modal.locator('input[type="checkbox"]').evaluateAll((is) => is.map((i) => ({name: i.name, value: i.value, checked: i.checked, disabled: i.disabled, label: (i.closest('label') || i.parentElement)?.innerText.trim().slice(0, 60)})));
            record('s4-author-role-form', {boxes, text: await modal.innerText().catch(() => null)});
            log('S4 author form stage boxes', JSON.stringify(boxes.filter((b) => /assignedStages/.test(b.name))));
            await snap(page, 's4-author-role-form');
            const cancel = modal.locator('a:visible, button:visible').filter({hasText: /^Cancel$/}).first();
            if (await cancel.count()) { await cancel.click(); await idle(page); }
        }

        // ---------- S5: Discussions › Add › Attach Files › Attach Workflow Files ----------
        await page.goto(app.url(`/index.php/${T}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        await wfDialog(page).waitFor({state: 'visible', timeout: 30_000});
        const addBtn = page.getByRole('button', {name: 'Add', exact: true}).first();
        await addBtn.waitFor({state: 'visible', timeout: 30_000});
        await addBtn.click();
        await idle(page);
        const pick = page.getByRole('menuitem', {name: /Discussion/i}).first();
        if (await pick.isVisible().catch(() => false)) { await pick.click(); await idle(page); }
        record('s5-add-buttons', await visibleButtons(page));
        const attach = page.locator('.tox-tbtn').filter({hasText: /Attach Files/i}).first();
        await attach.waitFor({state: 'visible', timeout: 30_000});
        await attach.click();
        await idle(page);
        const wfFiles = page.getByRole('button', {name: /Attach Workflow Files/i}).first();
        await wfFiles.waitFor({state: 'visible', timeout: 30_000});
        await wfFiles.click();
        await idle(page);
        const sel = page.locator('[role=dialog]:visible').filter({hasText: /Select submission stage/i}).locator('select').last();
        await sel.waitFor({state: 'visible', timeout: 30_000});
        const options = await sel.locator('option').evaluateAll((os) => os.map((o) => ({value: o.value, text: o.textContent.trim(), disabled: o.disabled})));
        record('s5-stage-options', options);
        log('S5 stage options', JSON.stringify(options));
        await snap(page, 's5-stage-select');

        // ---------- S2b + S5b: the API as a documented client ----------
        if (apiKey && apiKey !== 'None') {
            const client = await pwRequest.newContext({baseURL: app.baseURL, extraHTTPHeaders: {Authorization: `Bearer ${apiKey}`}});
            const base = `/index.php/${T}/api/v1`;
            const get = async (p) => { const r = await client.get(`${base}${p}`); let body = null; try { body = await r.json(); } catch (e) { body = (await r.text()).slice(0, 300); } return {status: r.status(), body}; };
            const list = await get('/_submissions?status=1');
            const one = await get(`/submissions/${sid}`);
            const pubId = one.body?.currentPublicationId;
            const pub = pubId ? await get(`/submissions/${sid}/publications/${pubId}`) : null;
            const item = (list.body?.items || []).find((i) => i.id === sid) || list.body?.items?.[0] || null;
            const out = {
                list: {status: list.status, itemCount: list.body?.itemsMax, item: item && {id: item.id, keys: Object.keys(item), canCurrentUserChangeMetadata: item.canCurrentUserChangeMetadata, hasKey: 'canCurrentUserChangeMetadata' in item, publications: (item.publications || []).map((p) => ({id: p.id, status: p.status, canCurrentUserChangeMetadata: p.canCurrentUserChangeMetadata, hasKey: 'canCurrentUserChangeMetadata' in p}))}},
                one: {status: one.status, hasKey: !!one.body && 'canCurrentUserChangeMetadata' in one.body, value: one.body?.canCurrentUserChangeMetadata, stageId: one.body?.stageId, stages: (one.body?.stages || []).map((s) => ({id: s.id, label: s.label, isActiveStage: s.isActiveStage, roles: s.currentUserAssignedRoles})), publications: (one.body?.publications || []).map((p) => ({id: p.id, status: p.status, canCurrentUserChangeMetadata: p.canCurrentUserChangeMetadata}))},
                pub: pub && {status: pub.status, hasKey: !!pub.body && 'canCurrentUserChangeMetadata' in pub.body, value: pub.body?.canCurrentUserChangeMetadata, status_: pub.body?.status},
            };
            record('s2-api', out);
            log('S2/S5 api', JSON.stringify(out));
            await client.dispose();
        } else {
            record('s2-api', {skipped: 'no api key'});
        }

    } finally {
        await close();
    }
});
