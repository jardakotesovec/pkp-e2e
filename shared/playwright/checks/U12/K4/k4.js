// U12 claim check, chunk K4: the reader's side of Announcements on all three
// apps — the public Announcements page, an announcement's page, the home page
// list, the header item, the skip link, the breadcrumbs, the "Edit" link per
// role, everything with the box unticked, "Date (Short)", the Navigation
// editor's warning, A8 and A10.
// Spec: docs/specs/U12-announcements.md — Actors rows 4–5 (42–43), Rules 9–12
// (159–196), Settings bullet 7 (315–319), Cross-feature and the scenario
// preamble (337–372), register A8 (503–511) and A10 (519–525); footnotes e, p,
// q, k, f-a8, f-a10.
//
// Seeds three scratch contexts per app through POST scenarios/context:
//   A  announcements on, an introduction, "Display on Homepage" 2, an "About"
//      text, one expired announcement and two live ones (the second with an
//      empty "Announcement"); a third live one is added by hand with an image
//      (phase newest) so its posted date is the newest and the image claim
//      has a screen; one throwaway account per permission level
//   B  on, an introduction, count 3, one expired announcement only (A10, the
//      empty page, the home page with no unexpired announcement)
//   C  off, count 2, two live announcements (Actors row 4, Rule 12's off end,
//      A8); ticked on by hand in phase tickon
// Phases (PHASES=a,b,…; default all; seed only without a state file or RESEED=1):
//   seed     the contexts (state file k4-state-<app>.json)
//   newest   A as the manager: "Newest event" with a PNG through the panel
//   public   signed out: A's list, both openers of an announcement's page, the
//            empty-"Announcement" page, the expired / unknown / foreign ids, the
//            home page (block, skip links, block order, header); B's empty page
//            and block-less home; C's 404s and header; the site's pages
//   roles    A, every level (admin, manager, editor, section editor, assistant,
//            reviewer, author, reader): the "Edit" link, where it lands, the
//            announcement's page and the home page
//   count    A as the manager: "Display on Homepage" 5, 0, empty, back to 2,
//            the home page read signed out after each save
//   dateshort A: "Date (Short)" d-m-Y, the three public pages, restored
//   nav      C (off) and A (on): Settings › Website › Setup › Navigation, the
//            "Announcements" item's warning icon and its dialog
//   a8       C while off: the management page by address, an add with "Send
//            Email" ticked, the queue drained, the mail catcher, the public 404
//   tickon   C: tick "Enable announcements", the public pages and header after
//   site     the site's home page and index/announcement, read as found; on a
//            site with announcements off: the site's box ticked, one site
//            announcement, the site home page, then removed and unticked
// Run: PROBE_FEATURE=U12 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U12/K4/k4.js
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'newest', 'public', 'roles', 'count', 'dateshort', 'nav', 'a8', 'tickon', 'site'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k4]', ...a);
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAADwAAAAoEAIAAAB9SdLrAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCREJDig6WX40AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA5LTE3VDA5OjE0OjQwKzAwOjAwEcvpMQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOS0xN1QwOToxNDo0MCswMDowMGCWUY0AAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDktMTdUMDk6MTQ6NDArMDA6MDA3g3BSAAAAq0lEQVRo3u3ZwQnDMBAF0RVsjq7LhbjNpKTgEr4PrkEjEPMqWMRnLhrJdZ1nabKu6v78Vp+xv67q7u/qM/bnoiHvQ7vo6d50uOjpXDTERkNcNMRGQ1w0xEZDXDTERkNcNMRGQ1w0xEZDXDTERkNcNMRGQ1w0xEZD/AWHuGiIjYa4aIiNhrhoiI2GuGiIjYa4aIiNhozkvv/H6jP2Z6MhNhpioyEjSZLVZ+zvAbdfK88pZb8oAAAAAElFTkSuQmCC';
const pngFile = () => ({name: 'poster.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64')});

const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------------------
// Reading helpers

const ctxUrl = (app, ctxPath, p = '', locale = '') => app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

async function as(page, user, ctxPath) {
    await signIn(page, user, {contextPath: ctxPath});
    await idle(page);
}

/** Open a public address; the response status, whether the bare 404 page answered, the title. */
async function open(page, url) {
    const resp = await page.goto(url).catch(() => null);
    await idle(page).catch(() => {});
    const body = await page.locator('body').innerText().catch(() => '');
    return {requested: url, url: page.url(), status: resp ? resp.status() : null, title: await page.title().catch(() => null), is404: /404 Not Found/i.test(body), bodyHead: body.replace(/\s+/g, ' ').slice(0, 300)};
}

/** The frontend chrome: the primary navigation's top-level items in order, the skip links, the block order of the page's main column. */
async function chrome(page) {
    return page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const nav = document.querySelector('#navigationPrimary, .pkp_navigation_primary');
        const primary = nav ? [...nav.querySelectorAll('li')].filter((li) => !li.parentElement.closest('li')).map((li) => ({text: txt(li.querySelector(':scope > a') || li), href: li.querySelector(':scope > a')?.getAttribute('href') ?? null})) : null;
        const skip = [...document.querySelectorAll('.cmp_skip_to_content a')].map((a) => ({text: txt(a), href: a.getAttribute('href')}));
        const main = document.querySelector('.pkp_structure_main');
        const pageDiv = main ? [...main.children].find((c) => c.tagName === 'DIV') : null;
        const blocks = pageDiv ? [...pageDiv.children].map((c) => ({tag: c.tagName.toLowerCase(), cls: (c.className || '').toString().slice(0, 60), id: c.id || null, heading: txt(c.querySelector('h1,h2,h3'))?.slice(0, 60) ?? null, text: txt(c)?.slice(0, 80), visible: c.getBoundingClientRect().height > 0})) : null;
        const bc = document.querySelector('.cmp_breadcrumbs');
        const breadcrumb = bc ? {text: txt(bc), items: [...bc.querySelectorAll('li')].map((li) => ({text: txt(li), href: li.querySelector('a')?.getAttribute('href') ?? null, current: li.classList.contains('current') || !!li.querySelector('[aria-current]')})), classes: bc.className} : null;
        const edit = document.querySelector('.cmp_edit_link');
        const editLink = edit ? {innerText: txt(edit), textContent: edit.textContent.replace(/\s+/g, ' ').trim(), sr: txt(edit.querySelector('.pkp_screen_reader')), srTextContent: edit.querySelector('.pkp_screen_reader')?.textContent.replace(/\s+/g, ' ').trim() ?? null, href: edit.getAttribute('href'), visible: edit.getBoundingClientRect().height > 0} : null;
        return {primary, primaryText: primary ? primary.map((p) => p.text).join(' | ') : null, skip, blocks, breadcrumb, editLink, title: document.title, h1: [...document.querySelectorAll('h1')].map(txt)};
    }).catch((e) => ({error: String(e.message || e)}));
}

/** The public Announcements page as data. */
async function listPage(page) {
    const c = await chrome(page);
    const data = await page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const pg = document.querySelector('.page_announcements');
        if (!pg) return {present: false};
        const h1 = pg.querySelector('h1');
        const ul = pg.querySelector('ul.cmp_announcements');
        // the introduction: whatever sits between the heading (or the edit link) and the list
        const between = [];
        let n = h1 ? h1.nextSibling : null;
        while (n && n !== ul) { if (n.nodeType === 1 && !n.classList.contains('cmp_edit_link')) between.push({tag: n.tagName.toLowerCase(), cls: n.className || null, text: txt(n)}); else if (n.nodeType === 3 && n.textContent.trim()) between.push({tag: '#text', text: n.textContent.trim()}); n = n.nextSibling; }
        const items = ul ? [...ul.querySelectorAll(':scope > li')].map((li) => {
            const a = li.querySelector('article');
            const heading = a.querySelector('h2, h3, h4');
            const link = heading ? heading.querySelector('a') : null;
            const img = a.querySelector('img');
            const rm = a.querySelector('a.read_more');
            return {
                classes: a.className, headingTag: heading ? heading.tagName : null, title: txt(link), titleHref: link ? link.getAttribute('href') : null,
                date: txt(a.querySelector('.date')), summaryText: txt(a.querySelector('.summary')), summaryHtml: a.querySelector('.summary')?.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 400) ?? null,
                image: img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), naturalWidth: img.naturalWidth, complete: img.complete, cls: img.className} : null,
                readMore: rm ? {visible: txt(rm.querySelector('[aria-hidden]')), sr: txt(rm.querySelector('.pkp_screen_reader')), srTextContent: rm.querySelector('.pkp_screen_reader')?.textContent.replace(/\s+/g, ' ').trim(), href: rm.getAttribute('href'), textContent: rm.textContent.replace(/\s+/g, ' ').trim()} : null,
                childOrder: [...a.querySelectorAll(':scope > *, :scope > div > *')].map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '')),
            };
        }) : null;
        const controls = [...pg.querySelectorAll('a, button, input, select')].map((e) => ({tag: e.tagName.toLowerCase(), text: txt(e) || e.textContent.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href'), cls: e.className || null}));
        return {present: true, h1: txt(h1), between, listPresent: !!ul, count: items ? items.length : 0, items, controls, pageText: txt(pg), noneSentence: /No announcements have been published/i.test(pg.innerText)};
    }).catch((e) => ({error: String(e.message || e)}));
    return {...c, list: data};
}

/** An announcement's own page as data. */
async function viewPage(page) {
    const c = await chrome(page);
    const data = await page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const pg = document.querySelector('.page_announcement');
        if (!pg) return {present: false, pageClasses: document.querySelector('.page')?.className ?? null};
        const art = pg.querySelector('.obj_announcement_full');
        const img = art ? art.querySelector('img') : null;
        return {
            present: true, h1: txt(pg.querySelector('h1')), date: txt(art?.querySelector('.date')),
            image: img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), naturalWidth: img.naturalWidth, cls: img.className} : null,
            description: txt(art?.querySelector('.description')), descriptionHtml: art?.querySelector('.description')?.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 400) ?? null,
            childOrder: art ? [...art.children].map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '')) : null,
            controls: [...pg.querySelectorAll('a, button, input, select')].map((e) => ({tag: e.tagName.toLowerCase(), text: txt(e) || e.textContent.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href'), cls: e.className || null})),
            pageText: txt(pg),
        };
    }).catch((e) => ({error: String(e.message || e)}));
    return {...c, view: data};
}

/** The home page's announcements block as data. */
async function homePage(page) {
    const c = await chrome(page);
    const data = await page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const sec = document.querySelector('section.cmp_announcements');
        const anchor = document.getElementById('homepageAnnouncements');
        if (!sec) return {present: false, anchor: !!anchor, headingsOnPage: [...document.querySelectorAll('.pkp_structure_main h2')].map(txt), noneSentence: /No announcements have been published/i.test(document.body.innerText)};
        const arts = [...sec.querySelectorAll('article')].map((a) => {
            const heading = a.querySelector('h2, h3, h4');
            const link = heading ? heading.querySelector('a') : null;
            const rm = a.querySelector('a.read_more');
            const img = a.querySelector('img');
            return {headingTag: heading ? heading.tagName : null, title: txt(link), href: link ? link.getAttribute('href') : null, date: txt(a.querySelector('.date')), summary: txt(a.querySelector('.summary')), readMore: rm ? {visible: txt(rm.querySelector('[aria-hidden]')), sr: txt(rm.querySelector('.pkp_screen_reader')), href: rm.getAttribute('href')} : null, image: img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), naturalWidth: img.naturalWidth} : null, inMore: !!a.closest('.more'), classes: a.className};
        });
        return {present: true, anchor: !!anchor, heading: txt(sec.querySelector('h2')), headingTag: sec.querySelector('h2, h3') ? sec.querySelector('h2, h3').tagName : null, classes: sec.className, count: arts.length, articles: arts, text: txt(sec), controls: [...sec.querySelectorAll('a, button')].map((e) => ({tag: e.tagName.toLowerCase(), text: e.textContent.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href')}))};
    }).catch((e) => ({error: String(e.message || e)}));
    return {...c, block: data};
}

// ---------------------------------------------------------------------------
// Backend helpers (K1/K2 idioms)

const settingsForm = (page) => page.locator('#setup [role="tabpanel"]:visible').filter({has: page.getByRole('checkbox', {name: 'Enable announcements'})}).first();
const enableBox = (page) => settingsForm(page).getByRole('checkbox', {name: 'Enable announcements'});
const homepageInput = (page) => settingsForm(page).locator('input[name=numAnnouncementsHomepage]').first();

async function openAnnouncementsSettings(page, app, ctxPath) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website'));
    await idle(page);
    await page.locator('#setup-button').click();
    await idle(page);
    await page.locator('#setup').getByRole('tab', {name: 'Announcements', exact: true}).click();
    await idle(page);
    await sleep(300);
}

async function settingsState(page) {
    const f = settingsForm(page);
    if (!(await f.count().catch(() => 0))) return {present: false};
    return f.evaluate((root) => ({
        present: true,
        enabled: root.querySelector('input[type=checkbox]')?.checked ?? null,
        count: root.querySelector('input[name=numAnnouncementsHomepage]')?.value ?? null,
        countPresent: !!root.querySelector('input[name=numAnnouncementsHomepage]'),
        status: [...root.querySelectorAll('[role="status"], .pkpFormPage__status')].map((e) => e.innerText.trim()).filter(Boolean),
        errors: [...root.querySelectorAll('.pkpFieldError, .pkpForm__errors')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    })).catch((e) => ({error: String(e.message || e)}));
}

async function saveSettings(page) {
    const f = settingsForm(page);
    await f.getByRole('button', {name: 'Save', exact: true}).click();
    await idle(page);
    let savedSeen = false;
    await Promise.race([
        f.locator('[role="status"]').filter({hasText: /Saved/}).first().waitFor({timeout: 8_000}).then(() => { savedSeen = true; }),
        f.locator('.pkpForm__errors, .pkpFieldError').first().waitFor({timeout: 8_000}),
    ]).catch(() => {});
    await sleep(300);
    return {savedSeen, ...(await settingsState(page))};
}

async function setHomepageCount(page, app, ctxPath, value) {
    await openAnnouncementsSettings(page, app, ctxPath);
    const before = await settingsState(page);
    await homepageInput(page).fill(String(value));
    await sleep(200);
    const after = await saveSettings(page);
    return {before, typed: String(value), after};
}

// the Announcements page's panel
const field = (page, label, index = 0) => dialog(page).locator('.pkpFormField').filter({hasText: new RegExp(`(^|\\s)${label}`)}).nth(index);
const textInput = (page, label) => field(page, label).locator('input.pkpFormField__input, input[type=text]').first();

async function richBody(page, label) {
    const f = field(page, label);
    const frame = f.locator('iframe').first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    await body.waitFor({timeout: T});
    await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frame.elementHandle(), {timeout: T}).catch(() => {});
    return body;
}
async function setRich(page, label, text) {
    const body = await richBody(page, label);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    if (text) await body.pressSequentially(text);
    await sleep(150);
}

async function openAnnouncementsPage(page, app, ctxPath) {
    const resp = await page.goto(ctxUrl(app, ctxPath, '/management/settings/announcements')).catch(() => null);
    await idle(page);
    await page.locator('main .listPanel').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    const rows = await page.locator('main .listPanel .listPanel__item .listPanel__itemTitle').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []);
    return {status: resp ? resp.status() : null, url: page.url(), h1: await page.locator('main h1').first().innerText().catch(() => null), rows, empty: await page.locator('main .listPanel .listPanel__empty').innerText().catch(() => null)};
}
async function openAddPanel(page) {
    await page.locator('main .listPanel').first().getByRole('button', {name: 'Add Announcement', exact: true}).click();
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
async function openEditPanel(page, rowTitle) {
    const row = page.locator('main .listPanel .listPanel__item').filter({hasText: rowTitle}).first();
    await row.getByRole('button', {name: 'Edit', exact: true}).click();
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
async function savePanel(page) {
    const d = dialog(page);
    const btn = d.getByRole('button', {name: 'Save', exact: true});
    if (await btn.isDisabled().catch(() => null)) return {saveDisabled: true};
    await btn.click();
    await idle(page);
    await sleep(600);
    await idle(page);
    const stillOpen = (await page.locator('[role="dialog"]:visible').count()) > 0;
    return {saveDisabled: false, stillOpen, errors: stillOpen ? await d.locator('.pkpFieldError, .pkpForm__errors').allInnerTexts().catch(() => []) : []};
}
async function closePanel(page) {
    const d = dialog(page);
    if (!(await d.count())) return;
    const c = d.getByRole('button', {name: 'Close', exact: true}).first();
    if (await c.count()) await c.click(); else await page.keyboard.press('Escape');
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
}
async function upload(page, f) {
    const input = dialog(page).locator('input[type=file]').first();
    const resp = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: 8000}).catch(() => null);
    await input.setInputFiles(f);
    const r = await resp;
    await idle(page);
    await sleep(800);
    return r ? {status: r.status()} : {status: null, noRequest: true};
}

async function drain(app, timeoutMs = 90_000) {
    const env = {...process.env, PKP_CONFIG_FILE: app.configFile};
    const run = () => { try { return execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: app.root, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024}); } catch (e) { return typeof e.stdout === 'string' ? e.stdout : String(e.message || e); } };
    const out = {runs: 1, output: String(run()).slice(-300)};
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        let counts = null;
        try { const r = await app.api.context.get('/index.php/index/api/v1/_test/jobs', {failOnStatusCode: false}); counts = r.ok() ? await r.json() : {status: r.status()}; } catch (e) { counts = {error: String(e.message || e)}; }
        out.counts = counts;
        if (counts && counts.queued === 0 && counts.reserved === 0) return {ok: true, ...out};
        if (Date.now() > deadline) return {ok: false, ...out};
        await sleep(500);
        if (counts && counts.queued > 0) { run(); out.runs++; }
    }
}

/** Settings › Website › Setup › Date & Time: the "Date (Short)" radios. */
async function openDateTab(page, app, ctxPath) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website'));
    await idle(page);
    await page.locator('#setup-button').click();
    await idle(page);
    await page.locator('#setup').getByRole('tab', {name: /Date/}).first().click();
    await idle(page);
    await sleep(400);
    return page.locator('#setup [role="tabpanel"]:visible').first();
}
const readDateForm = (panel) => panel.evaluate((root) => ({
    groups: [...root.querySelectorAll('.pkpFormField')].map((f) => ({label: f.querySelector('.pkpFormFieldLabel, legend')?.innerText.trim() ?? null, radios: [...f.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: r.labels && r.labels[0] ? r.labels[0].innerText.trim() : null})), texts: [...f.querySelectorAll('input[type=text]')].map((i) => ({name: i.name, value: i.value}))})),
    status: root.querySelector('.pkpFormPage__status')?.innerText.trim() ?? null,
}));
async function pickDateShort(page, panel, value) {
    const radio = panel.locator(`input[type=radio][name^="dateFormatShort"][value="${value}"]`).first();
    await radio.check({force: true}).catch(async () => { await panel.locator('label').filter({hasText: value}).first().click(); });
    await sleep(300);
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    await panel.locator('[role="status"]:has-text("Saved"), .pkpFormPage__status:has-text("Saved")').first().waitFor({timeout: T}).catch(() => {});
    await sleep(500);
    return readDateForm(panel);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOps = app.name === 'ops';
    const kind = app.name === 'ojs' ? 'journal' : app.name === 'omp' ? 'press' : 'server';
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

    // ---- seed ---------------------------------------------------------------
    if ((on('seed') && (process.env.RESEED === '1' || !st)) || !st) {
        const t = tag('u12k4');
        const usersA = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sonia', familyName: 'Section'},
            {username: `${t}ast`, roles: [isOps ? 'editorialBoardMember' : 'copyeditor'], givenName: 'Ari', familyName: 'Assistant'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            {username: `${t}rd`, roles: ['reader'], givenName: 'Rex', familyName: 'Reader'},
        ];
        if (!isOps) {
            usersA.push({username: `${t}ed`, roles: ['editor'], givenName: 'Edith', familyName: 'Editor'});
            usersA.push({username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewer'});
        }
        const seedOne = async (spec) => {
            for (let attempt = 1; ; attempt++) {
                try { return await app.api.createContext(spec); } catch (e) { log('seed failed', attempt, String(e.message || e)); if (attempt === 2) throw e; await sleep(3000); }
            }
        };
        const A = await seedOne({
            tag: `${t}a`, context: {name: `U12 K4 A ${t}`, acronym: 'U12K4A', description: {en: '<p>The K4 about text for the home page.</p>'}},
            users: usersA,
            enableAnnouncements: true, announcementsIntroduction: {en: '<p>Welcome to the K4 introduction paragraph.</p>'}, numAnnouncementsHomepage: 2,
            announcements: [
                {title: {en: 'Expired workshop'}, descriptionShort: {en: '<p>Short of the expired one.</p>'}, description: {en: '<p>Full text of the expired one.</p>'}, dateExpire: dayOffset(-3)},
                {title: {en: 'Oldest call'}, descriptionShort: {en: '<p>Short text of the oldest call.</p>'}, description: {en: '<p>Full text of the oldest call, with more detail.</p>'}, dateExpire: dayOffset(60)},
                {title: {en: 'Middle notice'}, descriptionShort: {en: '<p>Short text of the middle notice, and nothing more.</p>'}},
            ],
        });
        const B = await seedOne({
            tag: `${t}b`, context: {name: `U12 K4 B ${t}`, acronym: 'U12K4B'},
            users: [{username: `${t}bmgr`, roles: ['manager'], givenName: 'Bea', familyName: 'Manager'}, {username: `${t}brd`, roles: ['reader'], givenName: 'Ben', familyName: 'Reader'}],
            enableAnnouncements: true, announcementsIntroduction: {en: '<p>The B introduction: nothing is announced yet.</p>'}, numAnnouncementsHomepage: 3,
            announcements: [{title: {en: 'Gone already'}, descriptionShort: {en: '<p>Short of the gone one.</p>'}, dateExpire: dayOffset(-1)}],
        });
        const C = await seedOne({
            tag: `${t}c`, context: {name: `U12 K4 C ${t}`, acronym: 'U12K4C'},
            users: [{username: `${t}cmgr`, roles: ['manager'], givenName: 'Cara', familyName: 'Manager'}, {username: `${t}crd`, roles: ['reader'], givenName: 'Cal', familyName: 'Reader'}],
            enableAnnouncements: false, numAnnouncementsHomepage: 2,
            announcements: [{title: {en: 'Hidden first'}, descriptionShort: {en: '<p>Short of hidden first.</p>'}}, {title: {en: 'Hidden second'}, descriptionShort: {en: '<p>Short of hidden second.</p>'}}],
        });
        const ids = (ctx) => Object.fromEntries((ctx.announcements || []).map((a) => [typeof a.title === 'string' ? a.title : (a.title && a.title.en) || String(a.id), a.id]));
        st = {
            tag: t,
            A: {path: A.path || `${t}a`, id: A.contextId, users: Object.fromEntries(usersA.map((u) => [u.username.slice(t.length), u.username])), ids: ids(A)},
            B: {path: B.path || `${t}b`, id: B.contextId, users: {mgr: `${t}bmgr`, rd: `${t}brd`}, ids: ids(B)},
            C: {path: C.path || `${t}c`, id: C.contextId, users: {mgr: `${t}cmgr`, rd: `${t}crd`}, ids: ids(C)},
        };
        saveState();
        log('seeded', JSON.stringify({A: st.A.path, B: st.B.path, C: st.C.path, ids: [st.A.ids, st.B.ids, st.C.ids]}));
        note(`K4 ${app.name}: scratch A ${st.A.path} (id ${st.A.id}, on, intro, count 2, ids ${JSON.stringify(st.A.ids)}); B ${st.B.path} (id ${st.B.id}, on, one expired only); C ${st.C.path} (id ${st.C.id}, off, two announcements)`);
    }
    const {A, B, C} = st;
    const U = A.users;

    // ---- newest: "Newest event" with an image, through the panel (A, manager) ----
    if (on('newest') && !st.newestDone) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, A.path);
            const ls = await openAnnouncementsPage(page, app, A.path);
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Newest event');
            await setRich(page, 'Short Description', 'Short text of the newest event.');
            await setRich(page, 'Announcement', 'Full text of the newest event, the long version.');
            const up = await upload(page, pngFile());
            const alt = field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput, input[id*="altText"]').first();
            if (await alt.count()) await alt.fill('The newest event poster');
            const r = await savePanel(page);
            const after = await openAnnouncementsPage(page, app, A.path);
            const viewHref = await page.locator('main .listPanel .listPanel__item').filter({hasText: 'Newest event'}).first().getByRole('link', {name: 'View', exact: true}).getAttribute('href').catch(() => null);
            const m = viewHref && viewHref.match(/announcement\/view\/(\d+)/);
            if (m) { A.ids['Newest event'] = Number(m[1]); }
            st.newestDone = !r.stillOpen; saveState();
            await snap(page, '01-newest-added', {listBefore: ls, upload: up, save: r, listAfter: after, viewHref, ids: A.ids});
            log('newest added', JSON.stringify({save: r, rows: after.rows, viewHref}));
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- public: signed out --------------------------------------------------------
    if (on('public')) {
        const {page, close} = await launch(app);
        try {
            // A: the list
            let o = await open(page, ctxUrl(app, A.path, '/announcement'));
            let l = await listPage(page);
            await snap(page, '10-a-list', {open: o, ...l});
            await loc(page, 'public Announcements page: the breadcrumb', page.locator('.cmp_breadcrumbs'));
            await loc(page, 'public Announcements page: the list', page.locator('ul.cmp_announcements'));
            await loc(page, 'public Announcements page: a summary\'s title link', page.locator('ul.cmp_announcements article h2 a'));
            await loc(page, 'public Announcements page: a summary\'s "Read More" link', page.locator('ul.cmp_announcements a.read_more'));
            await loc(page, 'public Announcements page: the "Edit" link (manager-level only)', page.locator('.cmp_edit_link'));
            log(app.name, 'A list', JSON.stringify({h1: l.list.h1, order: (l.list.items || []).map((i) => i.title), between: l.list.between, bc: l.breadcrumb && l.breadcrumb.text, edit: !!l.editLink, primary: l.primaryText}));
            // the title link → the announcement's page
            const first = page.locator('ul.cmp_announcements article').first();
            await first.locator('h2 a, h3 a').first().click();
            await idle(page);
            let v = await viewPage(page);
            await snap(page, '11-a-view-by-title', {landed: page.url(), ...v});
            await loc(page, 'announcement page: the breadcrumb', page.locator('.cmp_breadcrumbs_announcement'));
            await loc(page, 'announcement page: the article', page.locator('.obj_announcement_full'));
            log(app.name, 'view by title', JSON.stringify({h1: v.view.h1, date: v.view.date, img: !!v.view.image, desc: v.view.description, title: v.title, bc: v.breadcrumb && v.breadcrumb.text, controls: (v.view.controls || []).length}));
            // back, "Read More" → the same page
            await open(page, ctxUrl(app, A.path, '/announcement'));
            await page.locator('ul.cmp_announcements article').first().locator('a.read_more').click();
            await idle(page);
            v = await viewPage(page);
            record('12-a-view-by-readmore', {landed: page.url(), ...v});
            // the one with an empty "Announcement"
            o = await open(page, ctxUrl(app, A.path, `/announcement/view/${A.ids['Middle notice']}`));
            v = await viewPage(page);
            await snap(page, '13-a-view-empty-announcement', {open: o, ...v});
            log(app.name, 'view empty Announcement', JSON.stringify({h1: v.view.h1, desc: v.view.description}));
            // the expired id, an unknown id, another context's id
            for (const [key, id] of [['expired', A.ids['Expired workshop']], ['unknown', 999999], ['foreign', B.ids['Gone already'] || C.ids['Hidden first']]]) {
                o = await open(page, ctxUrl(app, A.path, `/announcement/view/${id}`));
                const lp = await listPage(page);
                record(`14-a-view-${key}`, {open: o, landedList: lp.list && lp.list.present, h1: lp.h1, count: lp.list && lp.list.count});
                log(app.name, 'view', key, JSON.stringify({status: o.status, landed: o.url, is404: o.is404, list: lp.list && lp.list.present}));
            }
            // the home page (count 2, three live)
            o = await open(page, ctxUrl(app, A.path, ''));
            let h = await homePage(page);
            await snap(page, '15-a-home-count2', {open: o, ...h});
            await loc(page, 'home page: the announcements block', page.locator('section.cmp_announcements'));
            await loc(page, 'home page: the "Skip to announcements" link', page.locator('.cmp_skip_to_content a[href="#homepageAnnouncements"]'));
            await loc(page, 'header: the primary navigation', page.locator('#navigationPrimary'));
            log(app.name, 'A home', JSON.stringify({heading: h.block.heading, arts: (h.block.articles || []).map((a) => [a.headingTag, a.title, a.inMore]), skip: h.skip.map((s) => s.text), blocks: (h.blocks || []).map((b) => b.cls)}));
            // the header item opens the Announcements page
            const item = page.locator('#navigationPrimary a').filter({hasText: /^\s*Announcements\s*$/}).first();
            if (await item.count()) { await item.click(); await idle(page); record('16-a-header-item-click', {landed: page.url(), h1: await page.locator('h1').first().innerText().catch(() => null)}); }
            else record('16-a-header-item-click', {absent: true});
            // B: the empty page and the block-less home
            o = await open(page, ctxUrl(app, B.path, '/announcement'));
            l = await listPage(page);
            await snap(page, '20-b-list-empty', {open: o, ...l});
            log(app.name, 'B empty list', JSON.stringify({h1: l.list.h1, between: l.list.between, listPresent: l.list.listPresent, count: l.list.count, none: l.list.noneSentence, pageText: l.list.pageText}));
            o = await open(page, ctxUrl(app, B.path, `/announcement/view/${B.ids['Gone already']}`));
            record('21-b-view-expired', {open: o, landedList: (await listPage(page)).list.present});
            o = await open(page, ctxUrl(app, B.path, ''));
            h = await homePage(page);
            await snap(page, '22-b-home-no-live', {open: o, ...h});
            log(app.name, 'B home', JSON.stringify({present: h.block.present, skip: h.skip.map((s) => s.text), primary: h.primaryText}));
            // C: off
            for (const [key, p] of [['list', '/announcement'], ['view', `/announcement/view/${C.ids['Hidden first']}`], ['home', '']]) {
                o = await open(page, ctxUrl(app, C.path, p));
                const c = await chrome(page);
                const h2 = key === 'home' ? await homePage(page) : null;
                await snap(page, `30-c-off-${key}`, {open: o, ...c, block: h2 && h2.block});
                log(app.name, 'C off', key, JSON.stringify({status: o.status, is404: o.is404, title: o.title, primary: c.primaryText, skip: (c.skip || []).map((s) => s.text), block: h2 && h2.block.present}));
            }
            // the site's pages as found
            for (const [key, p] of [['home', '/index.php/index'], ['list', '/index.php/index/announcement']]) {
                o = await open(page, app.url(p));
                const h3 = await homePage(page);
                await snap(page, `40-site-${key}-asfound`, {open: o, ...h3});
                log(app.name, 'site', key, JSON.stringify({status: o.status, is404: o.is404, block: h3.block.present, primary: h3.primaryText}));
            }
        } finally { await close(); }
    }

    // ---- roles: the "Edit" link per level (A) -----------------------------------
    if (on('roles')) {
        const {page, close} = await launch(app);
        try {
            const levels = [['admin', 'admin (site administrator, enrolled manager)'], ['mgr', 'manager'], ['ed', 'editor (manager-level)'], ['se', 'sectionEditor'], ['ast', isOps ? 'editorialBoardMember' : 'copyeditor'], ['rev', 'externalReviewer'], ['au', 'author'], ['rd', 'reader']];
            const summary = {};
            for (const [key, label] of levels) {
                const user = key === 'admin' ? 'admin' : U[key];
                if (!user) { summary[key] = {absent: true}; continue; }
                await as(page, user, A.path);
                const o = await open(page, ctxUrl(app, A.path, '/announcement'));
                const l = await listPage(page);
                const out = {user, label, open: o, editLink: l.editLink, controls: l.list.controls, h1: l.list.h1};
                if (l.editLink) {
                    const link = page.locator('.cmp_edit_link').first();
                    out.role = await link.evaluate((e) => ({role: e.getAttribute('role'), ariaLabel: e.getAttribute('aria-label'), title: e.getAttribute('title')}));
                    await link.click();
                    await idle(page);
                    out.landed = {url: page.url(), h1: await page.locator('main h1').first().innerText().catch(() => null), tab: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => [])};
                }
                await snap(page, `50-roles-${key}-list`, out);
                await open(page, ctxUrl(app, A.path, `/announcement/view/${A.ids['Oldest call']}`));
                const v = await viewPage(page);
                record(`51-roles-${key}-view`, {user, editLink: v.editLink, controls: v.view.controls});
                await open(page, ctxUrl(app, A.path, ''));
                const h = await homePage(page);
                record(`52-roles-${key}-home`, {user, editLink: h.editLink, blockControls: h.block.controls, blockPresent: h.block.present});
                summary[key] = {edit: !!l.editLink, text: l.editLink && l.editLink.textContent, landed: out.landed && out.landed.url, viewEdit: !!v.editLink, homeEdit: !!h.editLink};
                log(app.name, 'role', key, JSON.stringify(summary[key]));
            }
            record('53-roles-summary', summary);
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- count: "Display on Homepage" 5 / 0 / empty / 2 (A) --------------------
    if (on('count')) {
        const mgr = await launch(app);
        const pub = await launch(app);
        try {
            await as(mgr.page, U.mgr, A.path);
            const results = {};
            for (const [key, value] of [['5', 5], ['0', 0], ['empty', ''], ['2', 2]]) {
                const set = await setHomepageCount(mgr.page, app, A.path, value);
                await snap(mgr.page, `60-count-${key}-settings`, set);
                const o = await open(pub.page, ctxUrl(app, A.path, ''));
                const h = await homePage(pub.page);
                await snap(pub.page, `61-count-${key}-home`, {open: o, ...h});
                results[key] = {saved: set.after.savedSeen, stored: set.after.count, errors: set.after.errors, block: h.block.present, heading: h.block.heading, arts: (h.block.articles || []).map((a) => [a.headingTag, a.title, a.inMore]), skip: h.skip.map((s) => s.text)};
                log(app.name, 'count', key, JSON.stringify(results[key]));
            }
            record('62-count-summary', results);
            await signOut(mgr.page).catch(() => {});
        } finally { await mgr.close(); await pub.close(); }
    }

    // ---- dateshort: "Date (Short)" d-m-Y on the three public pages (A) -----------
    if (on('dateshort')) {
        const mgr = await launch(app);
        const pub = await launch(app);
        try {
            await as(mgr.page, U.mgr, A.path);
            let panel = await openDateTab(mgr.page, app, A.path);
            const before = await readDateForm(panel);
            const shortGroup = before.groups.find((g) => g.radios.some((r) => /dateFormatShort/i.test(r.name || '')));
            const original = shortGroup && shortGroup.radios.find((r) => r.checked);
            const changed = await pickDateShort(mgr.page, panel, 'd-m-Y');
            await snap(mgr.page, '70-dateshort-changed', {before, changed, original});
            const reads = {};
            for (const [key, p, fn] of [['list', '/announcement', listPage], ['view', `/announcement/view/${A.ids['Oldest call']}`, viewPage], ['home', '', homePage]]) {
                const o = await open(pub.page, ctxUrl(app, A.path, p));
                const d = await fn(pub.page);
                await snap(pub.page, `71-dateshort-${key}`, {open: o, ...d});
                reads[key] = key === 'list' ? (d.list.items || []).map((i) => i.date) : key === 'view' ? d.view.date : (d.block.articles || []).map((a) => a.date);
            }
            log(app.name, 'dateshort d-m-Y', JSON.stringify(reads));
            // restore
            panel = await openDateTab(mgr.page, app, A.path);
            const restored = await pickDateShort(mgr.page, panel, original ? original.value : 'Y-m-d');
            const o = await open(pub.page, ctxUrl(app, A.path, '/announcement'));
            const l = await listPage(pub.page);
            record('72-dateshort-restored', {restored, listDates: (l.list.items || []).map((i) => i.date), open: o});
            record('73-dateshort-summary', {original, reads, restoredShort: restored.groups.find((g) => g.radios.some((r) => /dateFormatShort/i.test(r.name || '')))?.radios.filter((r) => r.checked), datetimeShortTexts: restored.groups.filter((g) => /Date & Time|dateTimeFormatShort/i.test(g.label || '') || g.texts.some((t) => /dateTimeFormatShort/.test(t.name))).map((g) => ({label: g.label, radios: g.radios.filter((r) => r.checked), texts: g.texts}))});
            await signOut(mgr.page).catch(() => {});
        } finally { await mgr.close(); await pub.close(); }
    }

    // ---- nav: the Navigation editor's warning on the "Announcements" item (C off, A on) ----
    if (on('nav')) {
        const {page, close} = await launch(app);
        try {
            for (const [key, ctx, user] of [['c-off', C, C.users.mgr], ['a-on', A, U.mgr]]) {
                await as(page, user, ctx.path);
                await page.goto(ctxUrl(app, ctx.path, '/management/settings/website'));
                await idle(page);
                await page.locator('#setup-button').click();
                await idle(page);
                const navTab = page.locator('#setup').getByRole('tab', {name: /Navigation/}).first();
                const tabName = await navTab.innerText().catch(() => null);
                await navTab.click();
                await idle(page);
                await sleep(500);
                const panel = page.locator('#setup [role="tabpanel"]:visible').first();
                const out = {tabName, panelText: (await panel.innerText().catch(() => '')).slice(0, 600)};
                // the "Primary Navigation Menu" row's "Settings" opens the menu's editor (a legacy side window holding the Vue editor)
                const menuRow = panel.locator('tr.gridRow').filter({hasText: 'Primary Navigation Menu'}).first();
                out.menuRowText = await menuRow.innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => null);
                // the row's "Settings" is the grid's show_extras toggle (pitfall 10); the menu's title link opens its editor
                await menuRow.locator('a.pkp_linkaction_edit').first().click();
                const win = page.locator('[data-cy="active-modal"]:visible, [role="dialog"]:visible').first();
                await win.waitFor({timeout: T});
                await win.locator('[data-menu-item-title]').first().waitFor({timeout: T}).catch(() => {});
                await idle(page);
                await sleep(500);
                out.windowTitle = await win.locator('h1, h2, .pkp_modal_title, [class*=title]').first().innerText().then((t) => t.trim()).catch(() => null);
                out.items = await win.evaluate((root) => [...root.querySelectorAll('[data-menu-item-title]')].map((el) => ({title: el.getAttribute('data-menu-item-title'), buttons: [...el.querySelectorAll('button[title]')].map((b) => ({title: b.getAttribute('title'), cls: b.className.slice(0, 40)})), headingAbove: el.closest('[data-cy], section, .pkpFormField, div[class*=panel]')?.querySelector('h3, h4, legend, [class*=title]')?.innerText.trim().slice(0, 60) ?? null}))).catch((e) => ({error: String(e.message || e)}));
                out.windowText = (await win.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1500);
                const annItem = win.locator('[data-menu-item-title="Announcements"]').first();
                out.annItem = (await annItem.count()) > 0;
                if (out.annItem) {
                    const warn = annItem.locator('button[title]').first();
                    out.warnPresent = (await warn.count()) > 0;
                    if (out.warnPresent) {
                        out.warnTitle = await warn.getAttribute('title');
                        out.warnAria = await warn.evaluate((b) => ({ariaLabel: b.getAttribute('aria-label'), text: b.innerText.trim(), svgLabel: b.querySelector('svg')?.getAttribute('aria-label') ?? null}));
                        await loc(page, 'Navigation menu editor: the "Announcements" item\'s conditional-display icon', warn);
                        await snap(page, `80-nav-${key}-editor`, out);
                        await warn.click();
                        await idle(page);
                        await sleep(400);
                        const d = page.locator('[role="dialog"]:visible').last();
                        out.dialog = (await page.locator('[role="dialog"]:visible').count()) > 1 ? {text: await d.innerText().then((t) => t.replace(/\s+/g, ' ').trim()), buttons: await d.getByRole('button').allInnerTexts().catch(() => [])} : {stacked: false, dialogs: await page.locator('[role="dialog"]:visible').count()};
                        await snap(page, `81-nav-${key}-dialog`, out);
                        const ok = d.getByRole('button', {name: /^(OK|Ok)$/}).first();
                        if (await ok.count()) await ok.click(); else await page.keyboard.press('Escape');
                        await sleep(300);
                    }
                }
                // leave the editor without saving (the FBV "Cancel" is a link)
                const cancel = win.getByRole('link', {name: 'Cancel', exact: true}).or(win.getByRole('button', {name: /^(Cancel|Close)$/})).first();
                if (await cancel.count()) await cancel.click(); else await page.keyboard.press('Escape');
                await sleep(500);
                out.dialogsAfterCancel = await page.locator('[data-cy="active-modal"]:visible, [role="dialog"]:visible').count();
                // the "Navigation Menu Items" grid's "Settings" on the "Announcements" item: the item's own form
                const itemRow = panel.locator('tr.gridRow').filter({hasText: /^\s*Settings\s+Announcements\s*$/}).first();
                out.itemRowPresent = (await itemRow.count()) > 0;
                if (out.itemRowPresent) {
                    await itemRow.locator('a.show_extras').first().click();
                    await sleep(400);
                    const itemControls = itemRow.locator('xpath=following-sibling::tr[1]');
                    out.itemRowControls = await itemControls.locator('a').evaluateAll((els) => els.map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                    await itemControls.getByRole('link', {name: 'Edit', exact: true}).first().click();
                    const w2 = page.locator('[data-cy="active-modal"]:visible, [role="dialog"]:visible').first();
                    await w2.waitFor({timeout: T});
                    await w2.locator('form').first().waitFor({timeout: T}).catch(() => {});
                    await idle(page);
                    await sleep(800);
                    out.itemForm = await w2.evaluate((root) => ({
                        text: root.innerText.replace(/\s+/g, ' ').trim().slice(0, 1200),
                        selects: [...root.querySelectorAll('select')].map((s) => ({name: s.name, value: s.value, label: s.options[s.selectedIndex]?.text.trim()})),
                        warnings: [...root.querySelectorAll('.pkp_form_error, .warning, [class*=warning], [class*=Warning], .description, .pkpFormField__description')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
                    })).catch((e) => ({error: String(e.message || e)}));
                    await snap(page, `82-nav-${key}-item-form`, out);
                    const c2 = w2.getByRole('link', {name: 'Cancel', exact: true}).or(w2.getByRole('button', {name: /^(Cancel|Close)$/})).first();
                    if (await c2.count()) await c2.click(); else await page.keyboard.press('Escape');
                    await sleep(400);
                }
                record(`83-nav-${key}-summary`, out);
                log(app.name, 'nav', key, JSON.stringify({tabName, annItem: out.annItem, warn: out.warnTitle, dialog: out.dialog && out.dialog.text, items: Array.isArray(out.items) ? out.items.map((i) => [i.title, i.buttons.map((b) => b.title)]) : out.items, itemFormWarnings: out.itemForm && out.itemForm.warnings}));
                await signOut(page).catch(() => {});
            }
        } finally { await close(); }
    }

    // ---- a8: C while off — the management page by address, an add with "Send Email", the queue, the mail catcher ----
    if (on('a8') && !st.a8Done) {
        const {page, close} = await launch(app);
        try {
            await as(page, C.users.mgr, C.path);
            const ls = await openAnnouncementsPage(page, app, C.path);
            const menu = await page.getByRole('navigation', {name: 'Site Navigation'}).locator('[role="button"]').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            await snap(page, '90-a8-page-off', {list: ls, sideMenu: menu, announcementsEntry: menu.some((m) => /^Announcements$/.test(m))});
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Off-switch notice');
            const send = dialog(page).locator('input[name=sendEmail]').first();
            const sendBefore = await send.isChecked().catch(() => null);
            await send.check({force: true});
            const r = await savePanel(page);
            const after = await openAnnouncementsPage(page, app, C.path);
            const q = await drain(app);
            const rdEmail = `${C.users.rd}@mail.test`;
            const mail = await app.mail.find({to: rdEmail, contains: 'Off-switch notice', timeoutMs: 15_000}).catch((e) => ({notFound: String(e.message || e)}));
            const mailSummary = mail && mail.Subject !== undefined ? {subject: mail.Subject, to: (mail.To || []).map((t) => t.Address), snippet: (mail.Snippet || '').slice(0, 200)} : mail;
            st.a8Done = !r.stillOpen; saveState();
            await snap(page, '91-a8-added-off', {sendBefore, save: r, listAfter: after, queue: q, mail: mailSummary});
            log(app.name, 'a8', JSON.stringify({rows: after.rows, queue: q.ok, mail: mailSummary}));
            await signOut(page).catch(() => {});
            const o = await open(page, ctxUrl(app, C.path, '/announcement'));
            record('92-a8-public-still-404', {open: o, ...(await chrome(page))});
        } finally { await close(); }
    }

    // ---- tickon: C ticked on by hand; the public pages and header after ------------
    if (on('tickon')) {
        const mgr = await launch(app);
        const pub = await launch(app);
        try {
            await as(mgr.page, C.users.mgr, C.path);
            await openAnnouncementsSettings(mgr.page, app, C.path);
            const before = await settingsState(mgr.page);
            if (!before.enabled) await enableBox(mgr.page).check();
            await sleep(300);
            const saved = await saveSettings(mgr.page);
            await snap(mgr.page, '95-tickon-settings', {before, saved});
            const out = {};
            for (const [key, p] of [['list', '/announcement'], ['view', `/announcement/view/${C.ids['Hidden first']}`], ['home', '']]) {
                const o = await open(pub.page, ctxUrl(app, C.path, p));
                const d = key === 'list' ? await listPage(pub.page) : key === 'view' ? await viewPage(pub.page) : await homePage(pub.page);
                await snap(pub.page, `96-tickon-${key}`, {open: o, ...d});
                out[key] = {status: o.status, is404: o.is404, primary: d.primaryText, primaryIndex: (d.primary || []).findIndex((i) => /^Announcements$/.test(i.text || '')), skip: (d.skip || []).map((s) => s.text), h1: d.h1, block: d.block && d.block.present, count: d.list && d.list.count};
            }
            record('97-tickon-summary', out);
            log(app.name, 'tickon', JSON.stringify(out));
            await signOut(mgr.page).catch(() => {});
        } finally { await mgr.close(); await pub.close(); }
    }

    // ---- site: the site's home page block, on a site found with announcements off ----
    if (on('site')) {
        const adm = await launch(app);
        const pub = await launch(app);
        try {
            await as(adm.page, 'admin', A.path);
            await adm.page.goto(app.url('/index.php/index/admin/settings'));
            await idle(adm.page);
            const annTab = adm.page.locator('#announcements-button').or(adm.page.getByRole('tab', {name: 'Announcements', exact: true})).first();
            const out = {tabPresent: (await annTab.count()) > 0};
            if (out.tabPresent) {
                await annTab.click(); await idle(adm.page);
                const panel = adm.page.locator('#announcements').first();
                const settingsSide = panel.getByRole('tab', {name: 'Settings', exact: true}).first();
                if (await settingsSide.count()) { await settingsSide.click(); await idle(adm.page); await sleep(300); }
                const form = panel.locator('[role="tabpanel"]:visible').filter({has: adm.page.getByRole('checkbox', {name: 'Enable announcements'})}).first();
                const box = form.getByRole('checkbox', {name: 'Enable announcements'});
                out.siteEnabledBefore = await box.isChecked().catch(() => null);
                const listSide = panel.getByRole('tab', {name: 'Announcements', exact: true}).first();
                if (out.siteEnabledBefore) {
                    out.skipped = 'the site had announcements on when read (another agent\'s state); read-only';
                } else {
                    await box.check();
                    await sleep(300);
                    await form.locator('input[name=numAnnouncementsHomepage]').fill('1');
                    await form.getByRole('button', {name: 'Save', exact: true}).click();
                    await form.locator('[role="status"]').filter({hasText: /Saved/}).first().waitFor({timeout: 8_000}).catch(() => {});
                    out.siteSaved = await form.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => []);
                    // one site announcement through the site's panel
                    if (await listSide.count()) { await listSide.click(); await idle(adm.page); await sleep(300); }
                    const lp = panel.locator('.listPanel').first();
                    await lp.getByRole('button', {name: 'Add Announcement', exact: true}).click();
                    await dialog(adm.page).waitFor({timeout: T});
                    await dialog(adm.page).locator('.pkpFormPage__footer').waitFor({timeout: T});
                    await idle(adm.page); await sleep(400);
                    await textInput(adm.page, 'Title').fill('K4 site notice');
                    await setRich(adm.page, 'Short Description', 'Short text of the site notice.');
                    out.siteAdd = await savePanel(adm.page);
                    await idle(adm.page); await sleep(500);
                    out.siteRows = await lp.locator('.listPanel__item .listPanel__itemTitle').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []);
                    await snap(adm.page, '100-site-tab-on', out);
                    // the site's pages signed out
                    for (const [key, p] of [['home', '/index.php/index'], ['list', '/index.php/index/announcement']]) {
                        const o = await open(pub.page, app.url(p));
                        const d = key === 'home' ? await homePage(pub.page) : await listPage(pub.page);
                        await snap(pub.page, `101-site-${key}-on`, {open: o, ...d});
                        out[key] = {status: o.status, block: d.block && d.block.present, heading: d.block && d.block.heading, arts: d.block && (d.block.articles || []).map((a) => [a.headingTag, a.title]), count: d.list && d.list.count, skip: (d.skip || []).map((s) => s.text), blocks: (d.blocks || []).map((b) => b.cls), primary: d.primaryText};
                    }
                    // remove and untick
                    const row = lp.locator('.listPanel__item').filter({hasText: 'K4 site notice'}).first();
                    if (await row.count()) {
                        await row.getByRole('button', {name: 'Delete', exact: true}).click();
                        await sleep(300);
                        const confirm = adm.page.locator('[role="dialog"]:visible').last();
                        const yes = confirm.getByRole('button', {name: /^(Delete|Yes|OK)$/}).first();
                        if (await yes.count()) await yes.click();
                        await idle(adm.page); await sleep(500);
                        out.siteRowsAfterDelete = await lp.locator('.listPanel__item .listPanel__itemTitle').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []);
                    }
                    await settingsSide.click(); await idle(adm.page); await sleep(300);
                    await box.uncheck();
                    await sleep(300);
                    await form.getByRole('button', {name: 'Save', exact: true}).click();
                    await form.locator('[role="status"]').filter({hasText: /Saved/}).first().waitFor({timeout: 8_000}).catch(() => {});
                    out.siteEnabledAfter = await box.isChecked().catch(() => null);
                    const o = await open(pub.page, app.url('/index.php/index'));
                    out.homeAfter = {status: o.status, block: (await homePage(pub.page)).block.present};
                }
            }
            record('102-site-summary', out);
            log(app.name, 'site', JSON.stringify(out));
            await signOut(adm.page).catch(() => {});
        } finally { await adm.close(); await pub.close(); }
    }
});
