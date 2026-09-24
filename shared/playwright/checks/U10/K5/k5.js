// U10 claim check, chunk K5: purpose, who may do what, the Settings Wizard's
// "Appearance", side effects, "Publishing Mode", cross-feature pointers,
// the Canonical-scenarios preamble and Coverage. All three apps.
// Spec: docs/specs/U10-appearance-and-theming.md lines 1–39, 419–432,
// 440–454, 511–514, 524–648, register OJS4 (753–765); footnotes a, b, c
// (side-effect lines), d (public-file lines), o (Settings 25), x, sc,
// f-ojs4, td1, td2, td36.
//
// Seeds per app (scratch, tag prefix u10k5):
//   S  every level of the roster as throwaway users (manager, OJS/OMP editor
//      and production editor, section editor, an assistant-level role, author,
//      OJS/OMP reviewer, reader); one published item (OJS: no issue). td1 saves,
//      the side effects, the public files, the visitor's pages.
//   Z  never saves "Theme" on its own tab; one published item (OJS: no issue):
//      the Settings Wizard's "Appearance" (td2, td36, OJS4).
//   W  {OJS} a published issue with an article in it: the wizard's other end
//      (an issue exists) and "Publishing Mode" (Settings 25).
//   X  admin holds Reader beside the manager role, then ends the manager role
//      on screen: the Site Administrator without a manager role (Settings pages
//      and the wizard).
//   R  restricted on screen by its manager ("Users must be registered…"); N
//      not enabled (seeded `enabled: false`): Actors row 3.
// publicknowledge and the roster are only read (levels phase).
//
// Phases (PHASES=a,b,…; default all; later phases reuse k5-state-<app>.json):
//   seed, levels, scratchlevels, saves, sweep, wizard, noadmin, pubmode,
//   files, visitor, site, xfeat, coverage
// Run: PROBE_FEATURE=U10 PROBE_AGENT=ccK5 node bin/probe.js <app|all> shared/playwright/checks/U10/K5/k5.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'levels', 'scratchlevels', 'saves', 'sweep', 'wizard', 'noadmin', 'pubmode', 'files', 'visitor', 'site', 'xfeat', 'coverage'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const log = (...a) => console.log('[k5]', new Date().toISOString().slice(11, 19), ...a);
const stateFile = (app) => path.join(outDir(), `k5-state-${app.name}.json`);
const REPO = path.resolve(__dirname, '../../../../..');
const DENIED_ROLE = /does not have access to this operation/i;

// ---- files -----------------------------------------------------------------
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
};
const png = (w, h, [r, g, b]) => {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 3 + 1)] = 0;
        for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const FILES = {
    logo: {name: 'k5-logo.png', mimeType: 'image/png', buffer: png(120, 40, [200, 40, 40])},
    css: {name: 'k5-sheet.css', mimeType: 'text/css', buffer: Buffer.from('.pkp_structure_footer { outline: 3px solid rgb(0, 128, 0); }\n')},
};

// ---- reading helpers ---------------------------------------------------------
async function snap(page, name, extra = {}) {
    const s = await screen(page).catch((e) => ({url: page.url(), screenError: String(e.message || e).slice(0, 300)}));
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

async function bodyText(page) {
    return (await page.locator('body').innerText().catch(() => '')) || '';
}

/** What a typed address answered. */
async function classify(page, resp) {
    const text = await bodyText(page);
    const url = page.url();
    return {
        httpStatus: resp ? resp.status() : null,
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        title: await page.title().catch(() => null),
        h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((h) => flat(h, 120)),
        loginForm: /\/login/.test(url) && (await page.locator('input[name="username"], #username').count()) > 0,
        deniedRole: DENIED_ROLE.test(text),
        notFound: /404 Not Found|could not be found/i.test(text),
        tabs: (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((t) => flat(t, 60)),
        snippet: flat(text, 300),
    };
}

/** The editorial side menu (PrimeVue panelmenu), read without clicking. */
async function readNav(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count().catch(() => 0))) return {present: false, groups: []};
    const groups = await nav.locator('[role="button"][aria-controls]').evaluateAll((els) => els.map((e) => {
        const region = document.getElementById(e.getAttribute('aria-controls') || '');
        return {
            label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(),
            items: region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim()) : [],
        };
    })).catch(() => []);
    return {present: true, groups: groups.map((g) => `${g.label}${g.items.length ? ' › ' + g.items.join(', ') : ''}`)};
}

async function go(page, url) {
    const resp = await page.goto(url).catch(() => null);
    await idle(page);
    return resp;
}

async function tabStrips(page) {
    return page.evaluate(() => {
        const lists = [...document.querySelectorAll('[role="tablist"]')];
        return lists.map((l) => [...l.querySelectorAll('[role="tab"]')].filter((t) => t.closest('[role="tablist"]') === l).map((t) => ({id: t.id, text: t.innerText.trim(), selected: t.getAttribute('aria-selected'), visible: t.offsetParent !== null})));
    }).catch(() => []);
}

/** A Vue form's fields as data. */
async function formFields(panel) {
    return panel.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            fields: [...root.querySelectorAll('.pkpFormField')].map((f) => ({
                label: txt(f.querySelector('.pkpFormFieldLabel, legend, .pkpFormField__heading, label')),
                description: txt(f.querySelector('.pkpFormField__description')),
                visible: f.offsetParent !== null,
                options: [...f.querySelectorAll('input[type=radio], input[type=checkbox]')].map((i) => ({type: i.type, name: i.name, value: i.value, checked: i.checked, label: txt(i.closest('label'))})),
                texts: [...f.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=hidden])')].slice(0, 2).map((i) => ({id: i.id, value: i.value})),
            })),
            buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({text: txt(b), disabled: b.disabled})),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

async function saveForm(page, panel) {
    const resp = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()) && !/temporaryFiles/.test(r.url()), {timeout: T}).catch(() => null);
    await panel.getByRole('button', {name: /^Save$/}).last().click();
    const r = await resp;
    const saved = await page.locator('[role="status"]').filter({hasText: /Saved/}).first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    await idle(page);
    const errBar = (await page.locator('.pkpNotification, [role=alert], .pkpFieldError').allInnerTexts().catch(() => [])).map((e) => flat(e, 200)).filter(Boolean);
    return r ? {status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, saved, errBar} : {status: null, saved, errBar};
}

const fieldByLabel = (panel, re) => panel.locator('.pkpFormField').filter({hasText: re}).first();

async function typeColour(panel, value) {
    const f = fieldByLabel(panel, /Colour/);
    const hex = f.locator('input').first();
    const before = await hex.inputValue().catch(() => null);
    await hex.click();
    await hex.fill(value);
    await hex.press('Enter').catch(() => {});
    await hex.blur().catch(() => {});
    await sleep(400);
    return {before, after: await hex.inputValue().catch(() => null)};
}

/** The home page as a visitor sees its parts. */
async function pubRead(page) {
    return page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const head = document.querySelector('.pkp_structure_head');
        const main = document.querySelector('.pkp_structure_main');
        return {
            url: location.pathname,
            title: document.title,
            headerBg: head ? getComputedStyle(head).backgroundColor : null,
            siteName: txt(document.querySelector('.pkp_site_name')),
            headings: main ? [...main.querySelectorAll('h1, h2, h3')].map(txt).slice(0, 20) : [],
            logo: [...document.querySelectorAll('.pkp_site_name img')].map((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth})),
            stylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')),
            loginForm: !!document.querySelector('form.cmp_form.login, #login, input[name="username"]'),
            mainText: txt(main).slice(0, 400),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    const fact = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(app.name, k, JSON.stringify(v).slice(0, 1500)); };
    const itemPath = (id) => (isOjs ? `/article/view/${id}` : isOmp ? `/catalog/book/${id}` : `/preprint/view/${id}`);
    const listPath = isOjs ? '/issue/archive' : isOmp ? '/catalog' : '/preprints';

    // ---- seed ------------------------------------------------------------------
    if (on('seed') || !st) {
        const t = tag('u10k5');
        const u = (tg, key, roles, given, family) => ({username: `${tg}${key}`, roles, givenName: given, familyName: family});
        const tS = `${t}s`, tZ = `${t}z`, tW = `${t}w`, tX = `${t}x`, tR = `${t}r`, tN = `${t}n`;
        const usersS = [u(tS, 'm', ['manager'], 'Mia', 'K5Manager'), u(tS, 'se', ['sectionEditor'], 'Sid', 'K5Section'),
            u(tS, 'as', [isOps ? 'editorialBoardMember' : 'funding'], 'Ari', 'K5Assistant'), u(tS, 'au', ['author'], 'Abe', 'K5Author'), u(tS, 'rd', ['reader'], 'Rae', 'K5Reader')];
        if (!isOps) usersS.push(u(tS, 'e', ['editor'], 'Eda', 'K5Editor'), u(tS, 'pe', ['productionEditor'], 'Pat', 'K5Production'), u(tS, 'rv', ['externalReviewer'], 'Rex', 'K5Reviewer'));
        const S = await app.api.createContext({tag: tS, context: {name: `U10 K5 S ${t}`, acronym: 'K5S'}, users: usersS});
        const sS = await app.api.createSubmission({tag: `${tS}p`, context: tS, submitter: `${tS}au`, title: `K5 S item ${t}`, published: true});
        const Z = await app.api.createContext({tag: tZ, context: {name: `U10 K5 Z ${t}`, acronym: 'K5Z'}, users: [u(tZ, 'm', ['manager'], 'Zoe', 'K5ZManager'), u(tZ, 'au', ['author'], 'Zak', 'K5ZAuthor')]});
        const sZ = await app.api.createSubmission({tag: `${tZ}p`, context: tZ, submitter: `${tZ}au`, title: `K5 Z item ${t}`, published: true});
        st = {t, S: tS, Z: tZ, idS: S.contextId, idZ: Z.contextId, itemS: sS.submissionId, itemZ: sZ.submissionId, nameS: `U10 K5 S ${t}`, nameZ: `U10 K5 Z ${t}`};
        if (isOjs) {
            const W = await app.api.createContext({tag: tW, context: {name: `U10 K5 W ${t}`, acronym: 'K5W'}, users: [u(tW, 'm', ['manager'], 'Wes', 'K5WManager'), u(tW, 'au', ['author'], 'Wil', 'K5WAuthor')], issues: [{volume: 1, number: 1, year: 2026, published: true}]});
            const sW = await app.api.createSubmission({tag: `${tW}p`, context: tW, submitter: `${tW}au`, title: `K5 W item ${t}`, published: true, issue: {volume: 1, number: 1, year: 2026}});
            Object.assign(st, {W: tW, idW: W.contextId, itemW: sW.submissionId, nameW: `U10 K5 W ${t}`});
        }
        const X = await app.api.createContext({tag: tX, context: {name: `U10 K5 X ${t}`, acronym: 'K5X'}, users: [u(tX, 'm', ['manager'], 'Xia', 'K5XManager'), {username: 'admin', roles: ['reader'], givenName: 'Site', familyName: 'Admin'}]});
        const R = await app.api.createContext({tag: tR, context: {name: `U10 K5 R ${t}`, acronym: 'K5R'}, users: [u(tR, 'm', ['manager'], 'Rob', 'K5RManager'), u(tR, 'rd', ['reader'], 'Ren', 'K5RReader')]});
        const N = await app.api.createContext({tag: tN, context: {name: `U10 K5 N ${t}`, acronym: 'K5N', enabled: false}, users: [u(tN, 'm', ['manager'], 'Ned', 'K5NManager')]});
        Object.assign(st, {X: tX, idX: X.contextId, nameX: `U10 K5 X ${t}`, R: tR, idR: R.contextId, N: tN, idN: N.contextId, usersS: usersS.map((x) => x.username)});
        saveState();
        fact('seed', st);
        note(`ccK5 [${app.name}]: K5 ${app.name}: S ${tS} (every level, one published item), Z ${tZ} (never saves Theme; wizard)${isOjs ? `, W ${tW} (published issue 1/1 with an article)` : ''}, X ${tX} (admin ends manager role), R ${tR} (restricted on screen), N ${tN} (not enabled)`);
    }

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const vis = await launch(app);   // a second browser: the signed-out visitor
    const vpage = vis.page;
    const as = async (user, ctx) => { if (user) { await signIn(page, user, {contextPath: ctx}); await idle(page); } else { await signOut(page).catch(() => {}); } };

    const openWebsite = async (ctx, topId, sideId) => {
        await go(page, cu(ctx, '/management/settings/website'));
        const top = page.locator(`#${topId}-button`).first();
        await top.waitFor({timeout: T});
        if ((await top.getAttribute('aria-selected')) !== 'true') { await top.click(); await idle(page); }
        if (sideId) {
            const side = page.locator(`#${sideId}-button`).first();
            await side.waitFor({timeout: T});
            if ((await side.getAttribute('aria-selected')) !== 'true') { await side.click(); await idle(page); }
        }
        await sleep(400);
        return page.locator(`[role="tabpanel"]#${sideId || topId}`).first();
    };

    const phase = async (name, fn) => {
        if (!on(name)) return;
        log(app.name, '== phase', name);
        try { await fn(); } catch (e) {
            fact(`${name}-error`, String(e.stack || e).slice(0, 1200));
            await snap(page, `err-${name}`).catch(() => {});
        }
    };

    try {
        // ---- levels: the roster on publicknowledge (read only) ------------------
        await phase('levels', async () => {
            const roster = isOps
                ? [['admin', 'admin'], ['manager', 'manager.maya'], ['sectionEditor', 'sectioneditor.ana'], ['assistant', 'assistant.rita'], ['author', 'author.alex'], ['reader', 'reader.rosa']]
                : [['admin', 'admin'], ['manager', 'manager.maya'], ['editor', 'editor.diana'], ['sectionEditor', 'sectioneditor.ana'], ['assistant', 'assistant.rita'], ['reviewer', 'reviewer.julia'], ['author', 'author.alex'], ['reader', 'reader.rosa']];
            const out = {};
            // the publicknowledge id from the admin's Hosted Journals row
            await as('admin', 'publicknowledge');
            await go(page, app.url('/index.php/index/admin/contexts'));
            await sleep(500);
            const pkName = {ojs: 'Journal of Public Knowledge', omp: 'Public Knowledge Press', ops: 'Public Knowledge Preprint Server'}[app.name];
            const pkRow = page.locator('tr.gridRow').filter({hasText: pkName}).first();
            const rowId = await pkRow.getAttribute('id').catch(() => null);
            st.pkId = rowId ? Number((rowId.match(/-row-(\d+)$/) || [])[1]) || 1 : 1;
            saveState();
            const addrs = [
                ['website', cu('publicknowledge', '/management/settings/website')],
                ['contexts', app.url('/index.php/index/admin/contexts')],
                ['wizard', app.url(`/index.php/index/admin/wizard/${st.pkId}`)],
                ['siteSettings', app.url('/index.php/index/admin/settings')],
            ];
            for (const [lvl, user] of [...roster, ['signedOut', null]]) {
                const r = {};
                if (user) { await as(user, 'publicknowledge'); r.landing = page.url().replace(/^https?:\/\/[^/]+/, ''); await go(page, cu('publicknowledge', '/dashboard')).catch(() => {}); r.nav = await readNav(page); await snap(page, `l-${lvl}-nav`, {nav: r.nav}); } else { await as(null); }
                for (const [k, url] of addrs) {
                    const resp = await go(page, url);
                    await sleep(300);
                    r[k] = await classify(page, resp);
                    await snap(page, `l-${lvl}-${k}`, {classified: r[k]});
                }
                out[lvl] = r;
                log(app.name, lvl, JSON.stringify({nav: r.nav && r.nav.groups, website: r.website && [r.website.httpStatus, r.website.deniedRole, r.website.loginForm, r.website.tabs.slice(0, 3)], contexts: r.contexts && [r.contexts.deniedRole, r.contexts.loginForm, r.contexts.h1], wizard: r.wizard && [r.wizard.deniedRole, r.wizard.loginForm, r.wizard.h1]}));
            }
            fact('levels', out);
        });

        // ---- scratchlevels: every level on S (manager-level rows, production editor, admin) --
        await phase('scratchlevels', async () => {
            const who = [['admin', 'admin'], ['manager', `${st.S}m`], ['sectionEditor', `${st.S}se`], ['assistant', `${st.S}as`], ['author', `${st.S}au`], ['reader', `${st.S}rd`]];
            if (!isOps) who.push(['editor', `${st.S}e`], ['productionEditor', `${st.S}pe`], ['reviewer', `${st.S}rv`]);
            const out = {};
            for (const [lvl, user] of who) {
                await as(user, st.S);
                const r = {landing: page.url().replace(/^https?:\/\/[^/]+/, '')};
                await go(page, cu(st.S, '/dashboard'));
                r.nav = await readNav(page);
                const resp = await go(page, cu(st.S, '/management/settings/website'));
                await sleep(500);
                r.website = await classify(page, resp);
                r.strips = await tabStrips(page);
                await snap(page, `sl-${lvl}-website`, {nav: r.nav, classified: r.website, strips: r.strips});
                const w = await go(page, app.url(`/index.php/index/admin/wizard/${st.idS}`));
                r.wizard = await classify(page, w);
                await snap(page, `sl-${lvl}-wizard`, {classified: r.wizard});
                out[lvl] = r;
                log(app.name, lvl, JSON.stringify({nav: r.nav.groups, website: [r.website.httpStatus, r.website.deniedRole, r.website.tabs.length], wizard: [r.wizard.httpStatus, r.wizard.deniedRole, r.wizard.loginForm, r.wizard.h1]}));
            }
            fact('scratchlevels', out);
        });

        // ---- saves (td1): one change and "Save" on each tab, by each level that opens the page --
        await phase('saves', async () => {
            const o = {};
            const mailsFor = async () => { const r = {}; for (const un of st.usersS) r[un] = await app.mail.count({to: `${un}@mail.test`}).catch((e) => `err ${String(e.message).slice(0, 80)}`); return r; };
            o.mailBefore = await mailsFor();
            await as(`${st.S}m`, st.S);
            await go(page, cu(st.S, '/dashboard'));
            o.headerBefore = (await snap(page, 's-00-dashboard-before')).text;
            const tabs = [
                ['theme', 'appearance', 'theme', async (pn) => typeColour(pn, '#7a1f1f')],
                ['setup', 'appearance', 'appearance-setup', async (pn) => {
                    const boxes = pn.locator('input[name="sidebar"]');
                    const states = await boxes.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked})));
                    const idx = states.findIndex((s) => !s.checked);
                    await boxes.nth(idx).check();
                    return {ticked: states[idx] && states[idx].value, states};
                }],
                ['masthead', 'appearance', 'appearance-masthead', async (pn) => {
                    const arrows = pn.getByRole('button', {name: /(Increase|Decrease) position of/});
                    const names = await arrows.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText.trim()));
                    await arrows.nth(1).click();
                    await sleep(300);
                    return {pressed: names[1], arrows: names.length};
                }],
                ['advanced', 'appearance', 'advanced', async (pn) => {
                    const frame = pn.locator('iframe').first();
                    const fid = await frame.getAttribute('id').catch(() => null);
                    const edId = fid ? fid.replace(/_ifr$/, '') : null;
                    if (edId) await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, edId, {timeout: T}).catch(() => {});
                    const body = pn.frameLocator('iframe').first().locator('body');
                    await body.click();
                    await page.keyboard.type('K5 additional content.');
                    await sleep(300);
                    return {editor: edId, content: edId ? await page.evaluate((id) => window.tinymce.get(id).getContent(), edId).catch(() => null) : null};
                }],
                ['lists', 'setup', 'lists', async (pn) => { const i = fieldByLabel(pn, /Items per page/).locator('input').first(); const before = await i.inputValue(); await i.fill('30'); return {before, after: '30'}; }],
                ['dateTime', 'setup', 'dateTime', async (pn) => {
                    const radios = pn.locator('.pkpFormField').first().locator('input[type=radio]');
                    const labels = await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
                    await radios.nth(2).check();
                    return {picked: labels[2], labels};
                }],
            ];
            o.manager = {};
            for (const [key, top, side, change] of tabs) {
                const pn = await openWebsite(st.S, top, side);
                const ch = await change(pn).catch((e) => ({error: String(e.message).slice(0, 200)}));
                const sv = await saveForm(page, pn).catch((e) => ({error: String(e.message).slice(0, 200)}));
                await snap(page, `s-01-${key}-saved`, {change: ch, save: sv});
                o.manager[key] = {change: ch, save: sv};
                log(app.name, 'save', key, JSON.stringify(sv));
            }
            // editor, production editor, admin (manager in S): one save each
            const others = isOps ? [['admin', 'admin', 'lists', '33']] : [['editor', `${st.S}e`, 'lists', '31'], ['productionEditor', `${st.S}pe`, 'lists', '32'], ['admin', 'admin', 'lists', '33']];
            for (const [lvl, user, , val] of others) {
                await as(user, st.S);
                const pn = await openWebsite(st.S, 'setup', 'lists');
                await fieldByLabel(pn, /Items per page/).locator('input').first().fill(val);
                const sv = await saveForm(page, pn).catch((e) => ({error: String(e.message).slice(0, 200)}));
                await snap(page, `s-02-${lvl}-lists-saved`, {save: sv});
                o[lvl] = sv;
                log(app.name, 'save by', lvl, JSON.stringify(sv));
            }
            // the theme tab by the editor too (a PUT to the theme endpoint by a non-Journal-Manager manager-level role)
            if (!isOps) {
                await as(`${st.S}e`, st.S);
                const pn = await openWebsite(st.S, 'appearance', 'theme');
                const ch = await typeColour(pn, '#1f3a7a');
                const sv = await saveForm(page, pn);
                await snap(page, 's-03-editor-theme-saved', {change: ch, save: sv});
                o.editorTheme = {change: ch, save: sv};
                // back to the manager's colour for the later phases
                await as(`${st.S}m`, st.S);
                const pn2 = await openWebsite(st.S, 'appearance', 'theme');
                await typeColour(pn2, '#7a1f1f');
                o.managerThemeAgain = await saveForm(page, pn2);
            }
            // Side effects: mail, the manager's header / notifications after the saves
            await sleep(3000);
            o.mailAfter = await mailsFor();
            await as(`${st.S}m`, st.S);
            await go(page, cu(st.S, '/dashboard'));
            o.headerAfter = (await snap(page, 's-04-dashboard-after')).text;
            const bell = page.getByRole('button', {name: /Notifications|Tasks/i}).first();
            o.bell = {count: await page.getByRole('button', {name: /Notifications|Tasks/i}).count(), name: await bell.getAttribute('aria-label').catch(() => null), text: flat(await bell.innerText().catch(() => ''), 100)};
            if (o.bell.count) { await bell.click().catch(() => {}); await idle(page); await sleep(800); await snap(page, 's-05-notifications-open'); o.bell.panel = flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => ''), 600); }
            fact('saves', o);
        });

        // ---- sweep: the Website page left with an unsaved change; the editor's and admin's tab list --
        await phase('sweep', async () => {
            const o = {};
            await as(`${st.S}m`, st.S);
            let pn = await openWebsite(st.S, 'setup', 'lists');
            await fieldByLabel(pn, /Items per page/).locator('input').first().fill('44');
            const nd = dialogs.length;
            await go(page, cu(st.S, '/dashboard'));
            o.leaveDialogs = dialogs.slice(nd);
            pn = await openWebsite(st.S, 'setup', 'lists');
            o.itemsAfterLeave = await fieldByLabel(pn, /Items per page/).locator('input').first().inputValue();
            await snap(page, 'w-01-lists-after-leave', o);
            o.strips = await tabStrips(page);
            fact('sweep', o);
        });

        // ---- wizard (td2, td36, OJS4) ---------------------------------------------
        const openWizard = async (name, prefix) => {
            await go(page, app.url('/index.php/index/admin/contexts'));
            await sleep(500);
            const r = {};
            r.gridHeadings = await page.locator('h1, h2, .pkp_controllers_grid .header h4').allInnerTexts().catch(() => []);
            const row = page.locator('tr.gridRow').filter({hasText: name}).first();
            r.rowFound = await row.count();
            if (r.rowFound) {
                await row.locator('a.show_extras').click(); await idle(page); await sleep(400);
                const actions = row.locator('xpath=following-sibling::tr[1]');
                r.rowActions = (await actions.locator('a').allInnerTexts().catch(() => [])).map((a) => flat(a, 60)).filter(Boolean);
                await snap(page, `${prefix}-hosted-row`, r);
                await loc(page, 'Hosted Journals: the row\'s "Settings wizard" link (after a.show_extras)', actions.getByRole('link', {name: 'Settings wizard', exact: true}));
                await actions.getByRole('link', {name: 'Settings wizard', exact: true}).click();
                await page.waitForURL(/admin\/wizard\//, {timeout: T}).catch(() => {});
                await idle(page);
            }
            r.url = page.url().replace(/^https?:\/\/[^/]+/, '');
            r.strips = await tabStrips(page);
            await snap(page, `${prefix}-wizard-landing`, r);
            return r;
        };
        const wizardAppearance = async () => {
            const tabBtn = page.getByRole('tab', {name: 'Appearance', exact: true}).first();
            await tabBtn.click(); await idle(page); await sleep(500);
            const id = await tabBtn.getAttribute('aria-controls').catch(() => null);
            return {panel: id ? page.locator(`[id="${id}"]`).first() : page.locator('[role="tabpanel"]:visible').last(), tabId: await tabBtn.getAttribute('id').catch(() => null), controls: id};
        };
        const orgBoxes = async (panel) => panel.locator('input[name="journalContentOrganization"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()}))).catch(() => []);

        await phase('wizard', async () => {
            const o = {};
            // Z's own Theme tab and home page before (its manager)
            await as(`${st.Z}m`, st.Z);
            let own = await openWebsite(st.Z, 'appearance', 'theme');
            o.ownBefore = {fields: await formFields(own), org: await orgBoxes(own)};
            await snap(page, 'z-01-own-theme-before', o.ownBefore);
            await go(vpage, cu(st.Z));
            o.homeBefore = await pubRead(vpage);
            await snap(vpage, 'z-02-home-before', {pub: o.homeBefore});
            // exclusivity: Z's manager types the wizard address and the Hosted Journals address
            let resp = await go(page, app.url(`/index.php/index/admin/wizard/${st.idZ}`));
            o.managerWizard = await classify(page, resp);
            await snap(page, 'z-03-manager-wizard-typed', {classified: o.managerWizard});
            // the admin's wizard
            await as('admin', 'index');
            o.wizard = await openWizard(st.nameZ, 'z-04');
            const topTabs = o.wizard.strips;
            const ap = await wizardAppearance();
            o.appearanceTab = {id: ap.tabId, controls: ap.controls};
            o.wizardFields = await formFields(ap.panel);
            o.wizardOrg = await orgBoxes(ap.panel);
            o.stripsOnAppearance = await tabStrips(page);
            await snap(page, 'z-05-wizard-appearance', {fields: o.wizardFields, org: o.wizardOrg, strips: o.stripsOnAppearance});
            void topTabs;
            // each other side tab of the wizard (names only, plus a screen)
            const sideTabs = (o.stripsOnAppearance.find((s) => s.some((t) => t.text === 'Appearance')) || []).map((t) => t.text);
            o.sideTabs = sideTabs;
            // unsaved change: colour typed, another side tab and back, then a reload
            let pnl = (await wizardAppearance()).panel;
            o.unsaved = {typed: await typeColour(pnl, '#225522')};
            const other = sideTabs.find((t) => t !== 'Appearance');
            if (other) { await page.getByRole('tab', {name: other, exact: true}).first().click(); await idle(page); await sleep(400); await snap(page, `z-06-wizard-${other.replace(/\W+/g, '')}`); }
            pnl = (await wizardAppearance()).panel;
            o.unsaved.afterSideSwitch = await fieldByLabel(pnl, /Colour/).locator('input').first().inputValue().catch(() => null);
            const nd = dialogs.length;
            await page.reload(); await idle(page);
            o.unsaved.reloadDialogs = dialogs.slice(nd);
            pnl = (await wizardAppearance()).panel;
            o.unsaved.afterReload = await fieldByLabel(pnl, /Colour/).locator('input').first().inputValue().catch(() => null);
            await snap(page, 'z-07-wizard-after-reload', o.unsaved);
            // the save: colour changed, nothing else
            o.saveColour = await typeColour(pnl, '#1b5e20');
            o.save = await saveForm(page, pnl);
            await snap(page, 'z-08-wizard-saved', {save: o.save});
            log(app.name, 'wizard save', JSON.stringify(o.save));
            // after: the journal's own tab, the home page
            await as(`${st.Z}m`, st.Z);
            own = await openWebsite(st.Z, 'appearance', 'theme');
            o.ownAfter = {org: await orgBoxes(own), colour: await fieldByLabel(own, /Colour/).locator('input').first().inputValue().catch(() => null)};
            await snap(page, 'z-09-own-theme-after', o.ownAfter);
            await go(vpage, cu(st.Z));
            o.homeAfter = await pubRead(vpage);
            await snap(vpage, 'z-10-home-after', {pub: o.homeAfter});
            // OJS: the other end, a journal with a published issue (W), read only
            if (isOjs) {
                await as(`${st.W}m`, st.W);
                own = await openWebsite(st.W, 'appearance', 'theme');
                o.wOwn = await orgBoxes(own);
                await snap(page, 'z-11-w-own-theme', {org: o.wOwn});
                await as('admin', 'index');
                await openWizard(st.nameW, 'z-12-w');
                const wp = (await wizardAppearance()).panel;
                o.wWizard = await orgBoxes(wp);
                await snap(page, 'z-13-w-wizard-appearance', {org: o.wWizard});
            }
            fact('wizard', o);
        });

        // ---- noadmin: the Site Administrator without a manager role in X --------------
        await phase('noadmin', async () => {
            const o = {};
            await as('admin', st.X);
            // end the manager role on admin's own edit page
            await go(page, cu(st.X, '/management/settings/access'));
            const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
            await table.waitFor({state: 'visible', timeout: T}).catch(() => {});
            const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
            await adminRow.locator('button').last().click(); await idle(page);
            await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T}).catch(() => {});
            await idle(page);
            await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
            o.rolesBefore = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
            if (await roleRow.count()) {
                await roleRow.getByRole('button', {name: /Remove Role/i}).click(); await idle(page);
                const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
                await dlg.waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/v1\//.test(r.url()), {timeout: 15_000}).catch(() => null);
                await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                const rr = await w;
                o.removeRole = rr ? rr.status() : 'no request';
                await idle(page); await sleep(1200);
            }
            o.rolesAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            await snap(page, 'x-01-admin-roles-after', o);
            // signed in again
            await as('admin', 'index');
            await go(page, cu(st.X, '/dashboard'));
            o.nav = await readNav(page);
            let resp = await go(page, cu(st.X, '/management/settings/website'));
            o.website = await classify(page, resp);
            await snap(page, 'x-02-admin-website', {nav: o.nav, classified: o.website});
            o.wizard = await openWizard(st.nameX, 'x-03');
            const ap = (await wizardAppearance()).panel;
            o.wizardFields = (await formFields(ap)).fields ? (await formFields(ap)).fields.map((f) => f.label) : null;
            o.colour = await typeColour(ap, '#4a148c');
            o.save = await saveForm(page, ap).catch((e) => ({error: String(e.message).slice(0, 200)}));
            await snap(page, 'x-04-wizard-saved', {save: o.save, fields: o.wizardFields});
            await go(vpage, cu(st.X));
            o.home = await pubRead(vpage);
            await snap(vpage, 'x-05-home-after', {pub: o.home});
            fact('noadmin', o);
        });

        // ---- pubmode: Settings 25 on OJS; the Distribution tabs on OMP/OPS as controls --
        await phase('pubmode', async () => {
            const o = {};
            if (isOjs) {
                await go(vpage, cu(st.W));
                o.homeBefore = await pubRead(vpage);
                await snap(vpage, 'p-01-w-home-before', {pub: o.homeBefore});
                await as(`${st.W}m`, st.W);
                await go(page, cu(st.W, '/management/settings/distribution'));
                o.strips = await tabStrips(page);
                const accessTab = page.getByRole('tab', {name: 'Access', exact: true}).first();
                await accessTab.click(); await idle(page); await sleep(500);
                const panel = page.locator(`[id="${await accessTab.getAttribute('aria-controls')}"]`).first();
                o.options = await panel.locator('input[type=radio]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
                await snap(page, 'p-02-w-access-before', {options: o.options, strips: o.strips});
                await panel.getByRole('radio', {name: /OJS will not be used to publish the journal's contents online\./}).check();
                o.save = await saveForm(page, panel);
                await snap(page, 'p-03-w-access-saved', {save: o.save});
                await go(vpage, cu(st.W));
                o.homeAfter = await pubRead(vpage);
                await snap(vpage, 'p-04-w-home-after', {pub: o.homeAfter});
            } else {
                await as(`${st.S}m`, st.S);
                await go(page, cu(st.S, '/management/settings/distribution'));
                o.strips = await tabStrips(page);
                const texts = {};
                for (const t of (o.strips.find((s) => s.length) || [])) {
                    await page.locator(`[id="${t.id}"]`).first().click().catch(() => {});
                    await idle(page); await sleep(300);
                    const id = await page.locator(`[id="${t.id}"]`).first().getAttribute('aria-controls').catch(() => null);
                    texts[t.text] = id ? flat(await page.locator(`[id="${id}"]`).first().innerText().catch(() => ''), 600) : null;
                }
                o.tabTexts = texts;
                o.publishingModeText = /Publishing Mode|will not be used to publish/i.test(JSON.stringify(texts));
                await snap(page, 'p-05-distribution-control', o);
            }
            fact('pubmode', o);
        });

        // ---- files: the public files of a logo and a style sheet (Side effects bullet 2) --
        await phase('files', async () => {
            const o = {};
            const fetchAs = async (url) => { const r = await vpage.goto(url).catch(() => null); return r ? r.status() : null; };
            await as(`${st.S}m`, st.S);
            let pn = await openWebsite(st.S, 'appearance', 'appearance-setup');
            const w = page.waitForResponse((r) => /temporaryFiles/.test(r.url()), {timeout: 10_000}).catch(() => null);
            await page.locator('#appearanceSetup-pageHeaderLogoImage-hiddenFileId-en').setInputFiles(FILES.logo);
            o.logoUpload = ((await w) || {status: () => null}).status();
            await sleep(1200); await idle(page);
            await page.locator('#appearanceSetup-pageHeaderLogoImage-altText-en').fill('K5 logo').catch(() => {});
            o.logoSave = await saveForm(page, pn);
            await go(vpage, cu(st.S));
            o.homeWithLogo = await pubRead(vpage);
            const src = o.homeWithLogo.logo && o.homeWithLogo.logo[0] && o.homeWithLogo.logo[0].src;
            o.logoSrc = src ? src.replace(/^https?:\/\/[^/]+/, '') : null;
            o.logoFetchSignedOut = src ? await fetchAs(src) : null;
            await snap(vpage, 'f-01-home-logo', {pub: o.homeWithLogo, fetch: o.logoFetchSignedOut});
            pn = await openWebsite(st.S, 'appearance', 'appearance-setup');
            await page.locator('[id="appearanceSetup-pageHeaderLogoImage-control-en"]').locator('xpath=ancestor::div[contains(@class,"pkpFormField")][1]').getByRole('button', {name: 'Remove', exact: true}).first().click();
            await sleep(600);
            o.logoRemoveSave = await saveForm(page, pn);
            await snap(page, 'f-02-logo-removed-saved', {save: o.logoRemoveSave});
            o.logoFetchAfterRemove = src ? await fetchAs(src) : null;
            // the style sheet
            pn = await openWebsite(st.S, 'appearance', 'advanced');
            const w2 = page.waitForResponse((r) => /temporaryFiles/.test(r.url()), {timeout: 10_000}).catch(() => null);
            await page.locator('[id="appearanceAdvanced-styleSheet-hiddenFileId"]').setInputFiles(FILES.css);
            o.cssUpload = ((await w2) || {status: () => null}).status();
            await sleep(1200); await idle(page);
            o.cssSave = await saveForm(page, pn);
            await go(vpage, cu(st.S));
            const sheets = (await pubRead(vpage)).stylesheets || [];
            const css = sheets.find((h) => /styleSheet|k5-sheet|\.css/.test(h || '') && /public\//.test(h || ''));
            o.cssHref = css ? css.replace(/^https?:\/\/[^/]+/, '') : null;
            o.cssFetchSignedOut = css ? await fetchAs(css) : null;
            await snap(vpage, 'f-03-home-css', {sheets, fetch: o.cssFetchSignedOut});
            pn = await openWebsite(st.S, 'appearance', 'advanced');
            await page.locator('[id^="appearanceAdvanced-styleSheet-control"]').first().locator('xpath=ancestor::div[contains(@class,"pkpFormField")][1]').getByRole('button', {name: 'Remove', exact: true}).first().click();
            await sleep(600);
            o.cssRemoveSave = await saveForm(page, pn);
            await go(vpage, cu(st.S));
            o.cssLinkedAfterRemove = ((await pubRead(vpage)).stylesheets || []).some((h) => o.cssHref && (h || '').includes(o.cssHref));
            o.cssFetchAfterRemove = css ? await fetchAs(css) : null;
            await snap(page, 'f-04-css-removed-saved', {save: o.cssRemoveSave});
            fact('files', o);
        });

        // ---- visitor: Actors row 3 and Purpose "every public page" ------------------
        await phase('visitor', async () => {
            const o = {};
            const pages = [['home', ''], ['about', '/about'], ['item', itemPath(st.itemS)], ['list', listPath], ['search', '/search'], ['login', '/login'], ['masthead', '/about/editorialMasthead']];
            o.signedOut = {};
            for (const [k, p] of pages) { await go(vpage, cu(st.S, p)); const r = await pubRead(vpage); o.signedOut[k] = {bg: r.headerBg, title: r.title, url: r.url}; await snap(vpage, `v-out-${k}`, {pub: r}); }
            await signIn(vpage, `${st.S}rd`, {contextPath: st.S});
            o.reader = {};
            for (const [k, p] of pages.filter(([k]) => k !== 'login')) { await go(vpage, cu(st.S, p)); const r = await pubRead(vpage); o.reader[k] = {bg: r.headerBg, title: r.title}; await snap(vpage, `v-rd-${k}`, {pub: r}); }
            await signOut(vpage).catch(() => {});
            // R: restricted on screen by its manager
            await as(`${st.R}m`, st.R);
            await go(page, cu(st.R, '/management/settings/access'));
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the (journal|press|server) site\./});
            await box.check();
            const form = page.locator('form').filter({has: page.locator('input[name="restrictSiteAccess"]')}).first();
            o.restrictSave = await saveForm(page, form);
            await snap(page, 'v-r-restricted-saved', {save: o.restrictSave});
            await go(vpage, cu(st.R));
            o.rOut = await classify(vpage, null);
            await snap(vpage, 'v-r-out-home', {classified: o.rOut});
            await signIn(vpage, `${st.R}rd`, {contextPath: st.R});
            await go(vpage, cu(st.R));
            o.rReader = await pubRead(vpage);
            await snap(vpage, 'v-r-reader-home', {pub: o.rReader});
            await signOut(vpage).catch(() => {});
            // N: not enabled
            const rn = await go(vpage, cu(st.N));
            o.nOut = await classify(vpage, rn);
            await snap(vpage, 'v-n-out-home', {classified: o.nOut});
            await signIn(vpage, `${st.N}m`, {contextPath: st.N}).catch((e) => { o.nSignInError = String(e.message).slice(0, 200); });
            await go(vpage, cu(st.N));
            o.nManager = await pubRead(vpage);
            await snap(vpage, 'v-n-manager-home', {pub: o.nManager});
            await signOut(vpage).catch(() => {});
            fact('visitor', o);
        });

        // ---- site: Administration › Site Settings (Purpose: the site's own look) -----
        await phase('site', async () => {
            const o = {};
            await as('admin', 'index');
            await go(page, app.url('/index.php/index/admin/settings'));
            o.strips = await tabStrips(page);
            await snap(page, 'site-01-settings', {strips: o.strips});
            const appTab = page.getByRole('tab', {name: 'Appearance', exact: true}).first();
            o.hasAppearance = await appTab.count();
            if (o.hasAppearance) {
                await appTab.click(); await idle(page); await sleep(500);
                o.stripsAppearance = await tabStrips(page);
                await snap(page, 'site-02-appearance', {strips: o.stripsAppearance});
            }
            await go(vpage, app.url('/index.php/index'));
            o.siteHome = await pubRead(vpage);
            await snap(vpage, 'site-03-site-home', {pub: o.siteHome});
            await go(vpage, cu(st.S));
            o.sHome = {bg: (await pubRead(vpage)).headerBg};
            fact('site', o);
        });

        // ---- xfeat: the pages the cross-feature bullets name, on S ---------------------
        await phase('xfeat', async () => {
            const o = {};
            await as(`${st.S}m`, st.S);
            const pn = await openWebsite(st.S, 'appearance', 'appearance-setup');
            o.sidebarChoices = await pn.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await snap(page, 'xf-01-setup-sidebar', {sidebar: o.sidebarChoices});
            o.pages = {};
            for (const [k, p] of [['masthead', '/about/editorialMasthead'], ['history', '/about/editorialHistory'], ['search', '/search'], ['list', listPath]]) {
                const r = await go(vpage, cu(st.S, p));
                o.pages[k] = {status: r ? r.status() : null, title: await vpage.title()};
                await snap(vpage, `xf-02-${k}`);
            }
            // the spec files and anchors the bullets link to
            const specDir = path.join(REPO, 'docs/specs');
            o.links = {};
            for (const f of ['U07-journal-identity-and-about-pages.md', 'U08-navigation-menus-and-site-chrome.md', 'U09-custom-pages-and-blocks.md', 'U11-highlights.md', 'U12-announcements.md', 'U15-search.md', 'U21-submission-wizard.md']) {
                const p = path.join(specDir, f);
                o.links[f] = fs.existsSync(p) ? {exists: true, settingsAccessAnchor: f.startsWith('U07') ? fs.readFileSync(p, 'utf8').includes('<a id="settings-access"></a>') : undefined} : {exists: false};
            }
            fact('xfeat', o);
        });

        // ---- coverage: which themes a manager can reach ("Another theme"; "No seed") ----
        await phase('coverage', async () => {
            const o = {};
            await as(`${st.S}m`, st.S);
            await go(page, cu(st.S, '/management/settings/website'));
            await page.locator('#plugins-button').first().click().catch(() => {});
            await idle(page); await sleep(800);
            await page.locator('tr.gridRow[id*="settingsplugingrid"]').first().waitFor({timeout: T}).catch(() => {});
            o.themeRows = await page.locator('tr.gridRow[id*="settingsplugingrid"]').evaluateAll((trs) => trs.map((tr) => {
                const tb = tr.closest('tbody');
                const box = tr.querySelector('input[type=checkbox]');
                return {id: tr.id.replace(/^.*-row-/, ''), category: tb ? tb.id.replace(/^.*-category-/, '').replace(/-.*$/, '') : null, text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 100), checked: box ? box.checked : null};
            }).filter((r) => /theme/i.test(r.category || '') || /theme/i.test(r.id)));
            o.pluginTabs = (await tabStrips(page)).map((s) => s.map((t) => t.text));
            await snap(page, 'cv-01-plugins-themes', o);
            // the theme list on the Theme tab
            const pn = await openWebsite(st.S, 'appearance', 'theme');
            o.themeSelect = await pn.locator('select').first().evaluate((s) => [...s.options].map((x) => x.label)).catch(() => null);
            await snap(page, 'cv-02-theme-list', {themeSelect: o.themeSelect});
            fact('coverage', o);
        });
    } finally {
        record('dialogs', {dialogs});
        await vis.close();
        await close();
    }
});
