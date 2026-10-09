// U17 claim check, chunk I09 (housekeeping 2026-10-09): three incidental rows of docs/tracking/incidentals.md.
//
//   L17  {OMP} a series whose "Path" holds "/": the window saves it; where its address and its books' link lead.
//        - on a dataset fleet, as `rvaca`: "Add Series" "u17i09 Slashed <run>" with the path "psy/u17i09<run>"
//          ("psy" is the path of the dataset's "Psychology", which holds one published book) and "u17i09 Nowhere
//          <run>" with "u17i09<run>/nowhere" (no series has the first part); then, signed out, the three addresses.
//        - on a campaign fleet, on a scratch press, as its manager: three seeded series, each with one published
//          book ("I09 Base" u17b, "I09 Slashed" u17s, "I09 Lone" u17l); on screen "I09 Slashed" gets the path
//          "u17b/deep", "I09 Lone" "u17x/lone", and a fourth series "I09 Paged" is added with "u17b/2"; then,
//          signed out, the addresses and the "Series" link on each book's page (on a stable line: the addresses
//          only, read by the page's heading; no book is seeded there).
//   L18  {OMP} a series' "Cover Image" with a PNG whose data is damaged (a 2×3 picture, IDAT checksum wrong), on a
//        dataset fleet, as `rvaca`, on two series the run adds itself: A (no cover; a subtitle typed in the same
//        save) and B (a sound PNG saved first, the control; then the damaged one with a subtitle).
//        B ends with the way back (a sound PNG again). On a stable line's campaign fleet (a control) the same on a
//        scratch press as its manager.
//        CAT (for U16, not this spec): the same file as a new category's "Cover Image".
//   L37  {OJS} a section whose default review form is deactivated, saved with nothing changed, the form activated
//        again: on a campaign fleet, two scratch journals, as each one's manager. Journal "two" has two active
//        forms (one stays active, so the window keeps its "Review Form" list), journal "one" has one (the list goes
//        while it is inactive). In each, "Articles" and "Reviews" both get "I09 Form A" as default; "Articles" is
//        saved while the form is inactive, "Reviews" is never saved in between (the control).
//
// The row set follows the fleet: a dataset fleet's OMP takes L17, L18 and CAT; a campaign fleet's OMP takes L17 (the
// scratch press; on a stable line also L18), its OJS L37. ROWS=L17,L18 narrows. Every run under its own PROBE_RUN.
//
// Run (dataset fleet 5 of feature issues-c2, reloaded first with
//      `npm run fleet-prep -- --feature issues-c2 --dataset 5 --reset`):
//   PKP_E2E_DATASET=5 PROBE_RUN=r1 PROBE_FEATURE=U17 PROBE_AGENT=ccI09 node bin/probe.js omp shared/playwright/checks/U17/I09/i09.js
// Run (campaign fleet):
//   PROBE_RUN=r1 PROBE_FEATURE=U17 PROBE_AGENT=ccI09 node bin/probe.js ojs shared/playwright/checks/U17/I09/i09.js
//   PROBE_RUN=r1 PROBE_FEATURE=U17 PROBE_AGENT=ccI09 node bin/probe.js omp shared/playwright/checks/U17/I09/i09.js
// Control on 3.5 (no app lock; the campaign fleet of the line, scratch contexts only):
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=s1 PROBE_FEATURE=U17 PROBE_AGENT=ccI09 node bin/probe.js ojs,omp shared/playwright/checks/U17/I09/i09.js
// Facts: .reports/U17/ccI09/facts-<row>-<run>-<app>.json; screens beside them.
const fs = require('fs');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag, sql, serverLog, outFile} = require('../../../probe');

const T = 30_000;
const RUN = process.env.PROBE_RUN || 'r0';
const ONLY = (process.env.ROWS || '').split(',').filter(Boolean);
// A 2×3 red PNG; `damaged()` flips the last byte of its IDAT checksum.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/egAAAAABJRU5ErkJggg==', 'base64');
function damaged() {
    const b = Buffer.from(PNG);
    const at = b.indexOf('IDAT');
    const len = b.readUInt32BE(at - 4);
    const crcEnd = at + 4 + len + 3;
    b[crcEnd] ^= 0xff;
    return b;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tidy = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

forEachApp(async (app) => {
    const rows = [];
    if (app.name === 'omp' && app.dataset) rows.push('L17', 'L18', 'CAT');
    if (app.name === 'omp' && !app.dataset) rows.push('L17');
    if (app.name === 'omp' && !app.dataset && (app.line || 'main') !== 'main') rows.push('L18');
    if (app.name === 'ojs' && !app.dataset) rows.push('L37');
    const todo = rows.filter((r) => !ONLY.length || ONLY.includes(r));
    if (!todo.length) { console.log(`[i09 ${app.name}] nothing to drive on this fleet`); return; }

    const {SectionsTab} = require('../../../pages/SectionsPages.js');
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => null); });

    let facts = null;
    const fact = (k, v) => { facts.steps[k] = v; console.log(`[fact] ${app.name} ${facts.row} ${k}: ${JSON.stringify(v).slice(0, 1800)}`); };
    const step = async (label, action) => {
        try { const out = await action(); fact(label, out === undefined ? 'done' : out); return out; } catch (e) {
            fact(`${label} THREW`, String(e.message).split('\n').slice(0, 3).join(' | ').slice(0, 500));
            record(`threw-${facts.row}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`, await screen(page).catch(() => ({url: page.url()})));
            return null;
        } finally { await idle(page).catch(() => null); }
    };
    const snap = async (name, {png = false} = {}) => { record(name, await screen(page)); if (png) await shot(page, name).catch(() => null); };
    const begin = (row, extra = {}) => { facts = {row, app: app.name, line: app.line || 'main', dataset: app.dataset || null, run: RUN, ...extra, steps: {}}; };
    const end = () => { if (!facts) return; facts.dialogs = dialogs.splice(0); record(`facts-${facts.row}`, facts); facts = null; };

    const noticeSel = '.app__notifications .pkpNotification';
    const markNotices = () => page.evaluate((sel) => document.querySelectorAll(sel).forEach((n) => n.setAttribute('data-i09-seen', '1')), noticeSel);
    const freshNotices = async (ms) => {
        const fresh = page.locator(`${noticeSel}:not([data-i09-seen])`);
        await fresh.first().waitFor({state: 'visible', timeout: ms}).catch(() => null);
        return (await fresh.allInnerTexts()).map(tidy);
    };
    // A section / series window after a save: open or not, the messages in it, its current cover.
    const windowState = (formId) => page.evaluate((id) => {
        const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const form = document.querySelector(`form#${id}`);
        if (!form || !visible(form)) return {windowOpen: false};
        const under = [...form.querySelectorAll('label.error')].filter(visible).map((l) => ({for: l.getAttribute('for'), text: l.textContent.trim()}));
        const inForm = [...form.querySelectorAll('#formErrors li, .notifyFormError, .pkp_form_error')].filter(visible).map((e) => e.textContent.replace(/\s+/g, ' ').trim());
        const img = form.querySelector('#coverImagePreview img, img');
        const save = form.querySelector('button.submitFormButton, button[type=submit]');
        const spinner = form.querySelector('.pkp_spinner');
        const foot = {saveDisabled: save ? save.disabled : null, spinnerShown: spinner ? visible(spinner) && getComputedStyle(spinner).opacity !== '0' && getComputedStyle(spinner).visibility !== 'hidden' : null, spinnerClass: spinner ? spinner.className : null};
        return {windowOpen: true, ...foot, under, inForm, currentImage: img ? {alt: img.getAttribute('alt'), shown: visible(img), src: (img.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), naturalWidth: img.naturalWidth} : null};
    }, formId);
    // "Save" in a legacy window: the answer (status, body's start, what was posted for `posted`), the window, the notices, the log.
    const legacySave = async (win, formId, {posted = []} = {}) => {
        await markNotices();
        const from = log.mark();
        const answered = page.waitForResponse((r) => r.request().method() === 'POST' && /update-(section|series)/.test(r.url()), {timeout: T});
        answered.catch(() => null);
        await win.saveButton().click();
        const response = await answered;
        const body = (await response.text().catch(() => '')).slice(0, 300);
        const params = new URLSearchParams(response.request().postData() || '');
        const sent = Object.fromEntries(posted.map((k) => [k, params.has(k) ? params.get(k) : '(not posted)']));
        const notices = await freshNotices(6_000);
        await idle(page).catch(() => null);
        await sleep(800);
        return {status: response.status(), body, sent, ...(await windowState(formId)), notices, serverLog: log.since(from).map((l) => l.slice(0, 400)).slice(0, 12)};
    };
    const closeWindow = async (win) => {
        if (await win.form().isVisible().catch(() => false)) {
            await win.cancelLink().click().catch(() => null);
            await win.form().waitFor({state: 'hidden', timeout: 10_000}).catch(() => null);
        }
        await sleep(600); // the closed window's slot (patterns.md pitfall 4)
        return 'closed';
    };

    // ------------------------------------------------------------------ the reader's side of a press
    const readPublic = async (path, name) => {
        const url = app.url(`/index.php/${path}`);
        let response = null;
        try { response = await page.goto(url); } catch (e) {
            if (!/net::ERR_/.test(String(e.message))) throw e;
            await sleep(5_000); response = await page.goto(url);
        }
        await idle(page).catch(() => null);
        if (name) await snap(name);
        const data = await page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const q = (s) => document.querySelector(s);
            const img = q('.about_section .cover img');
            return {
                docTitle: document.title,
                pageClass: (q('.page') || {}).className || null,
                h1: q('h1') ? t(q('h1').innerText) : null,
                breadcrumb: [...document.querySelectorAll('.cmp_breadcrumbs li')].map((li) => t(li.innerText)),
                count: q('.monograph_count') ? t(q('.monograph_count').innerText) : null,
                books: [...document.querySelectorAll('.obj_monograph_summary .title')].map((e) => t(e.innerText)),
                noTitles: [...document.querySelectorAll('.page p')].map((p) => t(p.innerText)).filter((x) => /No titles/i.test(x)),
                cover: img ? {src: (img.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), naturalWidth: img.naturalWidth, complete: img.complete} : null,
                notices: [...document.querySelectorAll('.cmp_notification, [role=alert]')].map((n) => t(n.innerText)).filter(Boolean),
                seriesItem: q('.item.series') ? t(q('.item.series').innerText) : null,
                seriesLinks: [...document.querySelectorAll('.item.series a')].map((a) => ({text: t(a.innerText), href: a.getAttribute('href').replace(/^https?:\/\/[^/]+/, '')})),
            };
        });
        return {asked: `/index.php/${path}`, status: response ? response.status() : null, landed: page.url().replace(/^https?:\/\/[^/]+/, ''), ...data};
    };
    const followSeriesLink = async (bookPath, name) => {
        const book = await readPublic(bookPath, `${name}-book`);
        const link = page.locator('.item.series a').first();
        if (!(await link.count())) return {book, followed: null};
        const nav = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().frame() === page.mainFrame(), {timeout: T});
        nav.catch(() => null);
        await link.click();
        const first = await nav;
        await page.waitForLoadState('load').catch(() => null);
        await idle(page).catch(() => null);
        await snap(`${name}-followed`);
        const landed = await page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return {
                h1: document.querySelector('h1') ? t(document.querySelector('h1').innerText) : null,
                pageClass: (document.querySelector('.page') || {}).className || null,
                count: document.querySelector('.monograph_count') ? t(document.querySelector('.monograph_count').innerText) : null,
                books: [...document.querySelectorAll('.obj_monograph_summary .title')].map((e) => t(e.innerText)),
                notices: [...document.querySelectorAll('.cmp_notification, [role=alert]')].map((n) => t(n.innerText)).filter(Boolean),
            };
        });
        return {book: {seriesItem: book.seriesItem, seriesLinks: book.seriesLinks, h1: book.h1, status: book.status}, followed: {firstStatus: first.status(), landed: page.url().replace(/^https?:\/\/[^/]+/, ''), ...landed}};
    };

    const seriesTab = (ctx) => new SectionsTab(page, ctx, {tab: 'Series', addLabel: 'Add Series', formId: 'seriesForm'});
    const addSeries = async (tab, title, path) => {
        await tab.goto();
        const win = await tab.openAdd();
        await win.type('title[en]', title);
        await win.box('path').fill(path);
        const out = await legacySave(win, 'seriesForm');
        await closeWindow(win);
        return {title, path, ...out};
    };
    const editSeriesPath = async (tab, title, path) => {
        await tab.goto();
        const win = await tab.openEdit(title);
        const before = await win.box('path').inputValue();
        const help = tidy(await win.form().locator('input[name="path"]').evaluate((i) => { const s = i.closest('.section') || i.parentElement; return s ? s.innerText : ''; }).catch(() => ''));
        await win.box('path').fill(path);
        const out = await legacySave(win, 'seriesForm');
        await closeWindow(win);
        return {title, before, path, help, ...out};
    };
    const readSeriesPath = async (tab, title) => {
        await tab.goto();
        const win = await tab.openEdit(title);
        const path = await win.box('path').inputValue();
        await closeWindow(win);
        return {title, path};
    };

    try {
        // ================================================================== L17 on a dataset fleet (OMP)
        if (todo.includes('L17') && app.dataset) {
            begin('L17-dataset');
            const ctx = app.contextPath;
            const tab = seriesTab(ctx);
            const slashed = {title: `u17i09 Slashed ${RUN}`, path: `psy/u17i09${RUN}`};
            const nowhere = {title: `u17i09 Nowhere ${RUN}`, path: `u17i09${RUN}/nowhere`};
            fact('series before (database)', sql(app, "select s.series_id, s.path, (select string_agg(p.submission_id::text||':'||p.status, ',') from publications p where p.series_id = s.series_id) from series s order by 1").split('\n'));
            await step('sign in as rvaca', () => signIn(page, 'rvaca'));
            await step('Series tab', async () => { await tab.goto(); await snap('l17d-01-series-tab'); return (await tab.titleCells().allInnerTexts()).map(tidy); });
            await step(`Add Series "${slashed.title}", Path "${slashed.path}", Save`, () => addSeries(tab, slashed.title, slashed.path));
            await step(`Add Series "${nowhere.title}", Path "${nowhere.path}", Save`, () => addSeries(tab, nowhere.title, nowhere.path));
            await step('Series tab after', async () => { await tab.goto(); await snap('l17d-02-series-tab-after', {png: true}); return (await tab.titleCells().allInnerTexts()).map(tidy); });
            await step('reopened after a reload: Slashed', () => readSeriesPath(tab, slashed.title));
            await step('reopened after a reload: Nowhere', () => readSeriesPath(tab, nowhere.title));
            fact('series after (database)', sql(app, 'select series_id, path from series order by 1').split('\n'));
            await step('sign out', () => signOut(page));
            await step('visitor: catalog/series/psy (control, Psychology)', () => readPublic(`${ctx}/catalog/series/psy`, 'l17d-03-psy'));
            await step(`visitor: catalog/series/${slashed.path}`, async () => { const r = await readPublic(`${ctx}/catalog/series/${slashed.path}`, 'l17d-04-slashed'); await shot(page, 'l17d-04-slashed').catch(() => null); return r; });
            await step(`visitor: catalog/series/${nowhere.path}`, async () => { const r = await readPublic(`${ctx}/catalog/series/${nowhere.path}`, 'l17d-05-nowhere'); await shot(page, 'l17d-05-nowhere').catch(() => null); return r; });
            await step('visitor: catalog/series/u17i09none (control, no such series)', () => readPublic(`${ctx}/catalog/series/u17i09none`, 'l17d-06-none'));
            end();
        }

        // ================================================================== L17 on a scratch press (OMP, campaign fleet)
        if (todo.includes('L17') && !app.dataset) {
            begin('L17-scratch');
            const p = tag('u17i09');
            facts.press = p;
            const mg = `${p}mg`, au = `${p}au`;
            await step('seed the press', async () => {
                await app.api.createContext({tag: p, context: {name: `U17 I09 press ${p}`, acronym: 'ININE'},
                    series: [{path: 'u17b', title: 'I09 Base'}, {path: 'u17s', title: 'I09 Slashed'}, {path: 'u17l', title: 'I09 Lone'}],
                    users: [{username: mg, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'}, {username: au, roles: ['author'], givenName: 'Amy', familyName: 'Author'}]});
                return p;
            });
            const books = {};
            // A stable line's scenario API publishes no book (400 without decisions, 500 with them; friction 2026-10-09, U63):
            // there the pages are told apart by their headings, which 3.5 prints, and the book pages are not driven.
            const withBooks = (app.line || 'main') === 'main';
            if (!withBooks) fact('books', 'not seeded on this line: the addresses are read by their headings, the book pages are not driven');
            for (const [key, series, title] of withBooks ? [['base', 'u17b', 'I09 Base Book'], ['slashed', 'u17s', 'I09 Slashed Book'], ['lone', 'u17l', 'I09 Lone Book']] : []) {
                await step(`seed "${title}" in ${series}, published`, async () => {
                    const r = await app.api.createSubmission({tag: `${p}${key}`.slice(0, 32), context: p, submitter: au, series, title, decisions: ['skipExternalReview', 'sendToProduction'], published: true, files: [{file: 'article.pdf'}]});
                    books[key] = r.submissionId;
                    return r.submissionId;
                });
            }
            const tab = seriesTab(p);
            await step('sign in as the press manager', () => signIn(page, mg));
            await step('Series tab', async () => { await tab.goto(); await snap('l17s-01-series-tab'); return (await tab.titleCells().allInnerTexts()).map(tidy); });
            await step('Edit "I09 Slashed": Path "u17b/deep", Save', () => editSeriesPath(tab, 'I09 Slashed', 'u17b/deep'));
            await snap('l17s-02-after-slashed-save');
            await step('Edit "I09 Lone": Path "u17x/lone", Save', () => editSeriesPath(tab, 'I09 Lone', 'u17x/lone'));
            await step('Add Series "I09 Paged", Path "u17b/2", Save', () => addSeries(tab, 'I09 Paged', 'u17b/2'));
            await step('reopened after a reload: I09 Slashed', async () => { const r = await readSeriesPath(tab, 'I09 Slashed'); return r; });
            await step('reopened after a reload: I09 Lone', () => readSeriesPath(tab, 'I09 Lone'));
            await step('Series tab after', async () => { await tab.goto(); await snap('l17s-03-series-tab-after', {png: true}); await loc(page, 'Series tab: a row by its title cell', tab.titleCells().first()); return (await tab.titleCells().allInnerTexts()).map(tidy); });
            fact('series (database)', sql(app, `select s.series_id, s.path from series s join presses c on c.press_id = s.press_id where c.path = '${p}' order by 1`).split('\n'));

            for (const who of ['manager', 'visitor']) {
                if (who === 'visitor') await step('sign out', () => signOut(page));
                const k = who === 'manager' ? 'm' : 'v';
                await step(`${who}: catalog/series/u17b (control, I09 Base)`, () => readPublic(`${p}/catalog/series/u17b`, `l17s-${k}1-base`));
                await step(`${who}: catalog/series/u17b/deep (I09 Slashed's path)`, async () => { const r = await readPublic(`${p}/catalog/series/u17b/deep`, `l17s-${k}2-slashed`); await shot(page, `l17s-${k}2-slashed`).catch(() => null); return r; });
                await step(`${who}: catalog/series/u17x/lone (I09 Lone's path)`, async () => { const r = await readPublic(`${p}/catalog/series/u17x/lone`, `l17s-${k}3-lone`); await shot(page, `l17s-${k}3-lone`).catch(() => null); return r; });
                await step(`${who}: catalog/series/u17b/2 (I09 Paged's path)`, () => readPublic(`${p}/catalog/series/u17b/2`, `l17s-${k}4-paged`));
                await step(`${who}: catalog/series/u17s (I09 Slashed's old path)`, () => readPublic(`${p}/catalog/series/u17s`, `l17s-${k}5-old`));
                if (!withBooks) continue;
                await step(`${who}: "I09 Base Book" › Series link (control)`, () => followSeriesLink(`${p}/catalog/book/${books.base}`, `l17s-${k}6-base`));
                await step(`${who}: "I09 Slashed Book" › Series link`, () => followSeriesLink(`${p}/catalog/book/${books.slashed}`, `l17s-${k}7-slashed`));
                await step(`${who}: "I09 Lone Book" › Series link`, () => followSeriesLink(`${p}/catalog/book/${books.lone}`, `l17s-${k}8-lone`));
            }
            await loc(page, 'Book page: the Series line and its link', page.locator('.item.series a'));
            end();
        }

        // ================================================================== L18 on a dataset fleet (OMP)
        if (todo.includes('L18')) {
            begin('L18');
            // A dataset fleet: `publicknowledge` as rvaca. A campaign fleet (a stable line's control): a scratch press as its manager.
            const scratch = app.dataset ? null : tag('u17i09');
            const ctx = scratch || app.contextPath;
            const who = scratch ? `${scratch}mg` : 'rvaca';
            const mark = scratch ? scratch.slice(-6) : RUN;
            if (scratch) {
                facts.press = scratch;
                await step('seed the press', async () => {
                    await app.api.createContext({tag: scratch, context: {name: `U17 I09 cover press ${scratch}`, acronym: 'ININE'},
                        users: [{username: who, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'}]});
                    return scratch;
                });
            }
            const tab = seriesTab(ctx);
            const file = (n, body) => { const f = outFile(n); fs.writeFileSync(f, body); return f; };
            const files = {damaged: file('u17i09-damaged.png', damaged()), sound: file('u17i09-sound.png', PNG)};
            facts.files = {damagedBytes: damaged().length, soundBytes: PNG.length};
            const A = {title: `u17i09 Cover A ${mark}`, path: `u17i09ca${mark}`};
            const B = {title: `u17i09 Cover B ${mark}`, path: `u17i09cb${mark}`};
            let win = null;
            const openEdit = async (title) => {
                await tab.goto();
                win = await tab.openEdit(title);
                await idle(page);
                return {heading: tidy(await win.heading().innerText().catch(() => '')), subtitle: await win.box('subtitle[en]').inputValue().catch(() => null), ...(await windowState('seriesForm'))};
            };
            const upload = async (path) => {
                const button = win.form().locator('.pkp_uploader_button').first();
                const input = win.form().locator('input[type=file]').first();
                const chooserP = page.waitForEvent('filechooser', {timeout: 15_000});
                await button.click({timeout: 3_000}).catch(() => input.click({force: true}));
                const chooser = await chooserP;
                const accept = await chooser.element().getAttribute('accept');
                const uploaded = page.waitForResponse((r) => r.request().method() === 'POST' && /upload-image/.test(r.url()), {timeout: 15_000})
                    .then(async (r) => ({status: r.status(), body: (await r.text()).slice(0, 300)})).catch(() => null);
                await chooser.setFiles(path);
                const answer = await uploaded;
                await sleep(1000);
                await idle(page).catch(() => null);
                return {pickerAccepts: accept, uploadAnswer: answer, box: tidy(await win.form().locator('#coverImage, #plupload').first().innerText().catch(() => '')).slice(0, 200),
                    temporaryFileId: await win.form().locator('input[name="temporaryFileId"]').inputValue().catch(() => null)};
            };
            const stored = (path) => sql(app, `select s.series_id, s.image, (select setting_value from series_settings ss where ss.series_id = s.series_id and ss.setting_name = 'subtitle' and ss.locale = 'en') from series s where s.path = '${path}'`);
            const thumb = async (src) => {
                if (!src) return null;
                const r = await page.request.get(app.url(src.replace(/&amp;/g, '&')));
                return {status: r.status(), type: r.headers()['content-type'] || null, bytes: (await r.body().catch(() => Buffer.alloc(0))).length};
            };

            await step(`sign in as ${scratch ? 'the press manager' : 'rvaca'}`, () => signIn(page, who));
            await step(`Add Series "${A.title}"`, () => addSeries(tab, A.title, A.path));
            await step(`Add Series "${B.title}"`, () => addSeries(tab, B.title, B.path));

            // A: no cover, the damaged PNG and a subtitle in one save
            await step('A1 Edit', () => openEdit(A.title));
            await snap('l18-a1-window');
            await step('A2 Subtitle "damaged save"', async () => { await win.type('subtitle[en]', 'damaged save'); return 'typed'; });
            await step('A3 Upload File: the damaged PNG', () => upload(files.damaged));
            await snap('l18-a3-uploaded', {png: true});
            await step('A4 Save', () => legacySave(win, 'seriesForm', {posted: ['temporaryFileId', 'subtitle[en]']}));
            await snap('l18-a4-after-save', {png: true});
            fact('A4 stored (database: id | image | subtitle)', stored(A.path));
            await step('A5 Cancel', () => closeWindow(win));
            await step('A6 Edit again (after a reload)', () => openEdit(A.title));
            await snap('l18-a6-reopened');
            await step('A6a Cancel', () => closeWindow(win));

            // B: the control (a sound PNG saves), then the damaged PNG over it
            await step('B1 Edit', () => openEdit(B.title));
            await step('B2 Upload File: the sound PNG', () => upload(files.sound));
            await step('B3 Save (control)', () => legacySave(win, 'seriesForm', {posted: ['temporaryFileId']}));
            await snap('l18-b3-after-save');
            await step('B3a Cancel if open', () => closeWindow(win));
            fact('B3 stored (database)', stored(B.path));
            const b4 = await step('B4 Edit again (after a reload)', () => openEdit(B.title));
            await snap('l18-b4-reopened', {png: true});
            await step('B4a the cover the window shows', () => thumb(b4 && b4.currentImage && b4.currentImage.src));
            await step('B5 Subtitle "second damaged save"', async () => { await win.type('subtitle[en]', 'second damaged save'); return 'typed'; });
            await step('B6 Upload File: the damaged PNG', () => upload(files.damaged));
            await step('B7 Save', () => legacySave(win, 'seriesForm', {posted: ['temporaryFileId', 'subtitle[en]']}));
            await snap('l18-b7-after-save', {png: true});
            fact('B7 stored (database)', stored(B.path));
            await step('B8 Cancel', () => closeWindow(win));
            const b9 = await step('B9 Edit again (after a reload)', () => openEdit(B.title));
            await snap('l18-b9-reopened', {png: true});
            await step('B9a the cover the window shows', () => thumb(b9 && b9.currentImage && b9.currentImage.src));
            await step('B9b Cancel', () => closeWindow(win));
            await step('B10 the series page (catalog/series/…)', async () => { const r = await readPublic(`${ctx}/catalog/series/${B.path}`, 'l18-b10-series-page'); return {...r, coverAnswer: await thumb(r.cover && r.cover.src)}; });
            // B11: does the series still save at all (a plain change, no file)?
            await step('B11 Edit, Subtitle "plain save", Save', async () => { await openEdit(B.title); await win.type('subtitle[en]', 'plain save'); const r = await legacySave(win, 'seriesForm', {posted: ['temporaryFileId', 'subtitle[en]']}); await closeWindow(win); return r; });
            fact('B11 stored (database)', stored(B.path));
            // B12-B14: the way back, a sound PNG again
            await step('B12 Edit', () => openEdit(B.title));
            await step('B12 Upload File: the sound PNG', () => upload(files.sound));
            await step('B13 Save', () => legacySave(win, 'seriesForm', {posted: ['temporaryFileId']}));
            await step('B13a Cancel if open', () => closeWindow(win));
            const b14 = await step('B14 Edit again (after a reload)', () => openEdit(B.title));
            await snap('l18-b14-reopened');
            await step('B14a the cover the window shows', () => thumb(b14 && b14.currentImage && b14.currentImage.src));
            await step('B14b Cancel', () => closeWindow(win));
            await loc(page, 'Series window: Cover Image "Upload File" button', page.locator('form#seriesForm .pkp_uploader_button'));
            end();
        }

        // ================================================================== CAT (U16's screen), the same file as a category's cover
        if (todo.includes('CAT') && app.dataset) {
            begin('CAT');
            const {CategoriesTab} = require('../../../pages/CategoriesPages.js');
            const cats = new CategoriesTab(page, app.contextPath);
            const f = outFile('u17i09-damaged-cat.png');
            fs.writeFileSync(f, damaged());
            const name = `u17i09 Cat ${RUN}`;
            await step('sign in as rvaca', () => signIn(page, 'rvaca'));
            await step('Categories › Add Category, the damaged PNG as "Cover Image", Save', async () => {
                await cats.goto();
                const win = await cats.openAdd();
                await win.nameBox('en').fill(name);
                await win.pathBox().fill(`u17i09cat${RUN}`);
                const up = await win.uploadCover(f).then((r) => ({status: r.status()})).catch((e) => ({threw: String(e.message).split('\n')[0]}));
                await snap('cat-1-uploaded');
                await markNotices();
                const from = log.mark();
                const response = await win.save();
                const body = (await response.text().catch(() => '')).slice(0, 300);
                await idle(page).catch(() => null);
                const notices = await freshNotices(5_000);
                const open = await win.root().isVisible().catch(() => false);
                await snap('cat-2-after-save', {png: true});
                return {upload: up, status: response.status(), body, windowOpen: open, notices, serverLog: log.since(from).map((l) => l.slice(0, 400)).slice(0, 12)};
            });
            await step('Categories after a reload', async () => { await cats.goto(); return (await cats.nameCells().allInnerTexts()).map(tidy).filter((n) => /u17i09/.test(n)); });
            fact('stored (database)', sql(app, `select category_id, path, image from categories where path = 'u17i09cat${RUN}'`));
            end();
        }

        // ================================================================== L37 on two scratch journals (OJS, campaign fleet)
        if (todo.includes('L37')) {
            const R = require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
            const {ReviewSettingsPage} = require('../../../pages/ReviewSettingsPages.js');
            const FORM_A = 'I09 Form A', FORM_B = 'I09 Form B', NONE = 'None / Free Form Review';
            const base = tag('u17i09');
            for (const kind of ['two', 'one']) {
                begin(`L37-${kind}`);
                const j = `${base}${kind === 'two' ? 'a' : 'b'}`;
                facts.journal = j;
                const mg = `${j}mg`, au = `${j}au`;
                const subs = {};
                await step('seed the journal', async () => {
                    const item = [{question: 'Comments', type: 'textarea'}];
                    await app.api.createContext({tag: j, context: {name: `U17 I09 journal ${kind} ${j}`},
                        sections: [{abbrev: 'ART', title: 'Articles', policy: 'Articles policy'}, {abbrev: 'REV', title: 'Reviews', policy: 'Reviews policy'}],
                        users: [{username: mg, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}, {username: au, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
                            {username: `${j}rv`, roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'}],
                        reviewForms: kind === 'two' ? [{title: FORM_A, elements: item}, {title: FORM_B, elements: item}] : [{title: FORM_A, elements: item}]});
                    for (const [abbrev, title] of [['ART', 'I09 Articles paper'], ['REV', 'I09 Reviews paper']]) {
                        const r = await app.api.createSubmission({tag: `${j}${abbrev.toLowerCase()}`.slice(0, 32), context: j, submitter: au, title, section: abbrev, decisions: ['sendExternalReview']});
                        subs[abbrev] = r.submissionId;
                    }
                    return {journal: j, subs};
                });
                const tab = new SectionsTab(page, j);
                const settings = new ReviewSettingsPage(page, j);
                const forms = settings.forms;
                const stored = () => sql(app, `select s.section_id, (select setting_value from section_settings ss where ss.section_id = s.section_id and ss.setting_name = 'abbrev' and ss.locale = 'en'), s.review_form_id from sections s join journals c on c.journal_id = s.journal_id where c.path = '${j}' order by 1`).split('\n');
                const readList = async (win) => {
                    const select = win.reviewFormSelect();
                    if (!(await select.count())) return {listShown: false, labels: (await win.form().locator('label').allInnerTexts()).map(tidy).filter((l) => /review form/i.test(l))};
                    return {listShown: true, options: (await select.locator('option').allInnerTexts()).map(tidy), selected: tidy(await select.locator('option:checked').innerText())};
                };
                // "Edit" on a section's row: the "Review Form" list; then choose (when asked), "Save" or "Cancel".
                const editSection = async (title, {choose = null, press = 'Cancel', name = null} = {}) => {
                    await tab.goto();
                    const win = await tab.openEdit(title);
                    await idle(page);
                    const list = await readList(win);
                    if (name) await snap(name, {png: true});
                    let save = null;
                    if (choose) await win.reviewFormSelect().selectOption({label: choose});
                    if (press === 'Save') save = await legacySave(win, 'sectionForm', {posted: ['reviewFormId']});
                    await closeWindow(win);
                    return {title, ...list, chosen: choose, press, save};
                };
                const formsList = async (name = null) => {
                    await settings.goto('Review Forms');
                    await idle(page);
                    const out = [];
                    const n = await forms.rows().count();
                    for (let i = 0; i < n; i++) {
                        const row = forms.rows().nth(i);
                        out.push({title: tidy(await row.locator('td').first().innerText()), active: await forms.activeBox(row).isChecked()});
                    }
                    if (name) await snap(name);
                    return out;
                };
                const toggleForm = async (title) => {
                    await settings.goto('Review Forms');
                    await idle(page);
                    const row = forms.row(title).first();
                    await markNotices();
                    await forms.activeBox(row).click();
                    const dialog = page.getByRole('dialog').filter({hasText: /review form/i}).last();
                    await dialog.waitFor({timeout: T});
                    const question = tidy(await dialog.innerText()).slice(0, 300);
                    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
                    await dialog.waitFor({state: 'hidden', timeout: T});
                    await idle(page);
                    const notices = await freshNotices(4_000);
                    return {title, question, activeAfter: await forms.activeBox(forms.row(title).first()).isChecked(), notices};
                };
                // "Add Reviewer" on a submission at Review, "Select Reviewer" on Rex Reviewer: the "Review Form" list.
                const addReviewer = async (abbrev, name = null) => {
                    const workflow = new R.WorkflowPage(page, j);
                    await workflow.gotoEditorial(subs[abbrev]);
                    await idle(page);
                    const modal = await R.openAddReviewerModal(page);
                    await R.selectReviewer(page, modal, 'Rex Reviewer');
                    await idle(page);
                    const select = R.reviewFormSelect(modal);
                    const out = {section: abbrev, submission: subs[abbrev], listShown: (await select.count()) > 0};
                    if (out.listShown) {
                        out.visible = await select.first().isVisible();
                        out.options = (await select.first().locator('option').allInnerTexts()).map(tidy);
                        out.selected = tidy(await select.first().locator('option:checked').innerText());
                    }
                    if (name) await snap(name, {png: true});
                    return out;
                };

                await step('sign in as the journal manager', () => signIn(page, mg));
                await step('0 Review Forms', () => formsList());
                await step('1 Articles › Edit: choose "I09 Form A", Save', () => editSection('Articles', {choose: FORM_A, press: 'Save', name: 'l37-' + kind + '-01-articles-first-edit'}));
                await step('1 Reviews › Edit: choose "I09 Form A", Save', () => editSection('Reviews', {choose: FORM_A, press: 'Save'}));
                fact('1 stored (database: id | abbrev | review form)', stored());
                await step('2 Articles › Edit (after a reload), Cancel', () => editSection('Articles'));
                await step('2 Add Reviewer on the Articles paper (baseline)', () => addReviewer('ART', `l37-${kind}-02-add-reviewer-baseline`));
                await step('3 Review Forms: untick "I09 Form A" Active, OK', () => toggleForm(FORM_A));
                await step('3 Review Forms after', () => formsList(`l37-${kind}-03-forms-inactive`));
                await step('4 Articles › Edit with the form inactive: the list, then Save with nothing changed', () => editSection('Articles', {press: 'Save', name: `l37-${kind}-04-articles-form-inactive`}));
                fact('4 stored (database)', stored());
                await step('4 Reviews › Edit with the form inactive: the list, then Cancel (control, never saved)', () => editSection('Reviews', {name: `l37-${kind}-04-reviews-form-inactive`}));
                await step('4 Add Reviewer on the Articles paper, form inactive', () => addReviewer('ART', `l37-${kind}-04-add-reviewer-inactive`));
                await step('4 Add Reviewer on the Reviews paper, form inactive', () => addReviewer('REV'));
                await step('5 Review Forms: tick "I09 Form A" Active, OK', () => toggleForm(FORM_A));
                await step('5 Review Forms after', () => formsList());
                await step('6 Articles › Edit, form active again', () => editSection('Articles', {name: `l37-${kind}-06-articles-form-active-again`}));
                await step('6 Reviews › Edit, form active again (control)', () => editSection('Reviews', {name: `l37-${kind}-06-reviews-form-active-again`}));
                fact('6 stored (database)', stored());
                await step('7 Add Reviewer on the Articles paper', () => addReviewer('ART', `l37-${kind}-07-add-reviewer-articles`));
                await step('7 Add Reviewer on the Reviews paper (control)', () => addReviewer('REV', `l37-${kind}-07-add-reviewer-reviews`));
                await loc(page, 'Add Reviewer: the "Review Form" list', page.locator('select[name="reviewFormId"]'));
                facts.names = {FORM_A, FORM_B, NONE};
                end();
            }
        }
    } finally {
        end();
        await close();
    }
});
