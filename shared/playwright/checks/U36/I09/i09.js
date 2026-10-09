// U36 claim check, chunk I09 (housekeeping 2026-10-09): incidentals row L20, clauses (1) and (3),
// on the submission wizard's "Files" panel (Rules 17, 17a, 18; A25). OJS and OMP; OPS is the
// read-only control (its "Upload Files" step has no such panel).
//
// Per app one scratch context (tag u36i09…) with its own author, and three drafts of that author:
//   d1  one stored file (article.pdf, seeded)                      phase `stale`
//   d3  empty                                                      phase `status`
//   d2  one stored file                                            phase `signedout` (last: it ends the session)
//
// (1) phase `stale`: tab A (the kit's page) holds d1's "Upload Files" step, with a second file
//     (notes.md) added there on screen, so one row has a component and one still asks "What kind of
//     file is this?". Tab B opens the same draft and removes both ("Remove" › "Yes": the control, a
//     removal that works). Back in tab A, on rows that are no longer on the server: "Remove" › "Yes"
//     on article.pdf (the row's claim), "Yes" again, "No"; then the sweep of the other row's
//     controls: a component link, "Edit" › a radio › "Save", "Edit" closed with a radio changed.
//     Then a reload. Each press records the request and its status, the windows open, the panel,
//     the page notices, browser dialogs and the console.
//     phase `signedout`: the same "Remove" › "Yes" after the session was ended in tab B (a second
//     kind of refusal).
// (3) phase `status`: the panel's screen-reader status (`role="status"` inside the panel) read
//     before any upload, then, each on a reloaded panel: after a file over the size limit is
//     refused and its row cleared; after "Cancel upload" pressed while the file is on its way (the
//     upload held back to 64 bytes a second); after "Cancel upload" pressed once the whole file has
//     been sent (the answer held back: what the server sends throttled to 125 bytes a second
//     through the DevTools protocol, as the kept walk
//     checks/issues/cancel-upload-after-sent-keeps-file/walk.js does), read at once, 1 s and 5 s
//     after the row is gone; after uploads left alone (the control); after "Remove" of every
//     stored file; after a reload. An in-page clock keeps every change of the status text and rows.
//     The campaign fleets take uploads up to 2 MiB (PHP's default), so no upload is slow enough
//     there to be cancelled part-way without the throttle.
//
//   PROBE_RUN=r1 PROBE_FEATURE=U36 PROBE_AGENT=ccI09 node bin/probe.js ojs shared/playwright/checks/U36/I09/i09.js
//   (one app per call: omp, ops the same; PHASES=stale,status,signedout narrows; a second run as PROBE_RUN=r2)
//   Facts: .reports/U36/ccI09/i09-facts-<run>-<app>.json; screens i09-…-<run>-<app>.json
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const REPO = path.resolve(__dirname, '../../../../..');
const FIX = path.join(REPO, 'apps/ojs/playwright/fixtures/files');
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['stale', 'status', 'signedout'];
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const bounded = (p, ms, fallback) => Promise.race([p, sleep(ms).then(() => fallback)]);

/** A file of `bytes` named `name` that takes no disk (the browser's size check never reads it). */
function sparse(dir, name, bytes) {
    fs.mkdirSync(dir, {recursive: true});
    const f = path.join(dir, name);
    const fd = fs.openSync(f, 'w');
    fs.ftruncateSync(fd, bytes);
    fs.closeSync(fd);
    return f;
}
/** A file of `bytes` of real data (a PDF header, then filler). */
function dense(dir, name, bytes) {
    fs.mkdirSync(dir, {recursive: true});
    const f = path.join(dir, name);
    if (!fs.existsSync(f) || fs.statSync(f).size !== bytes) {
        const b = Buffer.alloc(bytes, 0x20);
        b.write('%PDF-1.4\n%u36i09\n', 0);
        fs.writeFileSync(f, b);
    }
    return f;
}
function copyAs(dir, name) {
    fs.mkdirSync(dir, {recursive: true});
    const f = path.join(dir, name);
    fs.copyFileSync(path.join(FIX, 'article.pdf'), f);
    return f;
}

/** The DevTools network throttling for one page, bytes a second (-1: none). */
async function throttle(page, {down = -1, up = -1}, cdp = null) {
    const s = cdp || (await page.context().newCDPSession(page));
    if (!cdp) await s.send('Network.enable');
    await s.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: down, uploadThroughput: up});
    return s;
}

const panel = (page) => page.locator('.submissionFilesListPanel').first();
const row = (page, name) => panel(page).locator('li.listPanel__item').filter({hasText: name}).first();

/** The "Files" panel as data; `status` is every role="status" inside the panel, with how it is exposed. */
async function panelState(page) {
    return panel(page).evaluate((p) => {
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const empty = p.querySelector('.listPanel__empty');
        return {
            rows: [...p.querySelectorAll('li.listPanel__item')].map((li) => {
                const bar = li.querySelector('[role=progressbar]');
                const link = li.querySelector('a.listPanel__item--submissionFile__link');
                return {
                    text: clean(li.innerText).slice(0, 300),
                    link: link ? clean(link.innerText) : null,
                    buttons: [...li.querySelectorAll('button')].map((b) => clean(b.innerText)).filter(Boolean),
                    progress: bar ? Number(bar.getAttribute('aria-valuenow')) : null,
                };
            }),
            empty: empty ? clean(empty.innerText) : null,
            status: [...p.querySelectorAll('[role=status]')].map((s) => ({
                text: clean(s.textContent),
                cls: s.className,
                ariaLive: s.getAttribute('aria-live'),
                hiddenFromReaders: !!s.closest('[aria-hidden=true], [hidden], [inert]') || getComputedStyle(s).display === 'none' || getComputedStyle(s).visibility === 'hidden',
            })),
        };
    }).catch((e) => ({error: String(e.message).slice(0, 200)}));
}
const statusText = (st) => (st.status || []).map((s) => s.text).join(' | ') || null;

/** The visible windows (role="dialog") on the page: name, text, buttons. */
const windows = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) => els.map((d) => ({
    name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
    text: d.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
    buttons: [...d.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim() + (b.disabled ? ' [disabled]' : '')).filter(Boolean),
    // a spinner on show in the window (the "Remove" window turns one beside "No" once "Yes" is pressed)
    spinners: [...d.querySelectorAll('.pkpSpinner')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').length,
}))).catch(() => []);

async function pick(page, file) {
    const add = panel(page).getByRole('button', {name: 'Add File', exact: true}).first();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', {timeout: T}), add.click()]);
    await chooser.setFiles(file);
}
async function waitRow(page, name, test, timeout = T, every = 25) {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeout) {
        const st = await panelState(page);
        last = (st.rows || []).find((r) => r.text.includes(name)) || null;
        if (last && test(last)) return {...last, ms: Date.now() - t0};
        await sleep(every);
    }
    return {...(last || {}), timedOut: true, ms: Date.now() - t0};
}
async function waitNoRow(page, name, timeout = 10_000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const st = await panelState(page);
        if (!(st.rows || []).some((r) => r.text.includes(name))) return Date.now() - t0;
        await sleep(20);
    }
    return null;
}
const sentNotAnswered = (r) => r.buttons.includes('Cancel upload') && r.progress === 100 && !r.link;

/** An in-page clock (every 5 ms) keeping each change of the panel's status text and rows. */
async function startClock(page) {
    await page.evaluate(() => {
        if (window.__i09) clearInterval(window.__i09.timer);
        const t0 = performance.now();
        const log = [];
        let last = null;
        const tick = () => {
            const p = document.querySelector('.submissionFilesListPanel');
            if (!p) return;
            const status = [...p.querySelectorAll('[role=status]')].map((s) => s.textContent.replace(/\s+/g, ' ').trim()).join(' | ') || null;
            const rows = [...p.querySelectorAll('li.listPanel__item')].map((li) => {
                const bar = li.querySelector('[role=progressbar]');
                const name = (li.querySelector('.listPanel__itemTitle, .listPanel__item--submissionFile__link') || li).innerText.replace(/\s+/g, ' ').trim().slice(0, 40);
                return `${name}${bar ? ` [${bar.getAttribute('aria-valuenow')}]` : ''}${[...li.querySelectorAll('button')].some((b) => /Cancel upload/.test(b.innerText)) ? ' (Cancel upload)' : ''}`;
            });
            const v = JSON.stringify({status, rows});
            if (v !== last && log.length < 300) { last = v; log.push({ms: Math.round(performance.now() - t0), status, rows}); }
        };
        window.__i09 = {log, timer: setInterval(tick, 5)};
        tick();
    });
    return {read: () => page.evaluate(() => window.__i09.log.slice()).catch((e) => [{error: String(e.message).slice(0, 120)}])};
}

forEachApp(async (app) => {
    const isOPS = app.name === 'ops';
    const MAIN = app.name === 'omp' ? 'Book Manuscript' : 'Article Text';
    const files = path.join(outDir(), 'files');
    const fact = (k, v) => { record('i09-facts', {[k]: v}, {merge: true}); console.log('[i09]', app.name, k, JSON.stringify(v).slice(0, 1200)); };
    const step = async (k, fn) => {
        try { return await fn(); } catch (e) {
            fact(`${k}-FAILED`, String(e.stack || e).split('\n').slice(0, 5).join(' | '));
            return null;
        }
    };

    // ---- seed: a scratch context, its author, the drafts
    const t = tag('u36i09');
    const au = `${t}au`;
    const ctx = await app.api.createContext({tag: t, context: {name: `U36 I09 ${t}`, acronym: 'U36I09', contactName: 'I09 Contact', contactEmail: `${t}contact@mail.test`}, users: [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'}, {username: au, roles: ['author'], givenName: 'Ava', familyName: 'Author'}]});
    const ctxPath = ctx.path || t;
    const sub = async (k, spec) => (await app.api.createSubmission({tag: `${t}${k}`, context: ctxPath, submitter: au, title: `I09 ${k} draft`, submitted: false, ...spec})).submissionId;
    const ids = {};
    if (isOPS) ids.d1 = await sub('d1', {});
    else {
        ids.d1 = await sub('d1', {files: [{file: 'article.pdf'}]});
        ids.d2 = await sub('d2', {files: [{file: 'article.pdf'}]});
        ids.d3 = await sub('d3', {});
    }
    fact('seed', {context: ctxPath, author: au, drafts: ids});

    const {page, context} = await launch(app);
    const jsDialogs = [];
    const hear = (pg, who) => pg.on('dialog', (d) => { jsDialogs.push({tab: who, type: d.type(), message: d.message().slice(0, 300)}); d.accept().catch(() => {}); });
    hear(page, 'A');
    const consoleA = [];
    page.on('console', (m) => { if (consoleA.length < 400) consoleA.push({type: m.type(), text: m.text().slice(0, 200)}); });
    page.on('pageerror', (e) => consoleA.push({type: 'pageerror', text: String(e.message || e).slice(0, 300)}));
    // the browser's own traffic to the files endpoint (uploads, and the tunnelled PUT and DELETE)
    const traffic = [];
    const t00 = Date.now();
    const what = (q) => `${q.headers()['x-http-method-override'] || q.method()} ${q.url().replace(/^.*\/api\/v1/, '').replace(/\?.*$/, '')}`;
    const mine = (q) => /\/submissions\/\d+\/files/.test(q.url()) && (q.method() !== 'GET');
    const tabOf = (q) => { try { return q.frame().page() === page ? 'A' : 'B'; } catch (e) { return '?'; } };
    context.on('request', (q) => { if (mine(q)) traffic.push({ms: Date.now() - t00, tab: tabOf(q), event: 'sent', call: what(q)}); });
    context.on('requestfailed', (q) => { if (mine(q)) traffic.push({ms: Date.now() - t00, tab: tabOf(q), event: 'failed', call: what(q), why: q.failure() && q.failure().errorText}); });
    context.on('response', async (r) => {
        const q = r.request();
        if (!mine(q)) return;
        const e = {ms: Date.now() - t00, tab: tabOf(q), event: 'answered', call: what(q), status: r.status()};
        traffic.push(e);
        if (r.status() >= 400) e.body = flat(await r.text().catch(() => null), 300);
    });
    const mark = () => ({r: traffic.length, c: consoleA.length, d: jsDialogs.length});
    const since = (m) => ({requests: traffic.slice(m.r), console: consoleA.slice(m.c).filter((c) => c.type !== 'log' && c.type !== 'info' && c.type !== 'debug'), browserDialogs: jsDialogs.slice(m.d)});

    const wizUrl = (id) => app.url(`/index.php/${ctxPath}/submission?id=${id}`);
    async function openUploadFiles(pg, id) {
        await pg.goto(wizUrl(id));
        const current = pg.locator('.pkpSteps__step__label--current');
        await current.waitFor({timeout: T});
        await idle(pg);
        if (!/Upload Files/.test(await current.innerText())) {
            await pg.locator('.pkpSteps').getByRole('button', {name: /Upload Files/}).first().click();
            await current.filter({hasText: 'Upload Files'}).waitFor({timeout: T});
            await idle(pg);
        }
        if (!isOPS) await panel(pg).waitFor({timeout: T});
    }
    const snap = async (pg, name, extra = {}) => {
        const s = await bounded(screen(pg), 45_000, null) || {url: pg.url(), error: 'screen() did not settle in 45 s'};
        record(name, {...s, ...extra});
        await shot(pg, name).catch(() => {});
        return s;
    };
    const removeAsk = (pg) => pg.getByRole('dialog').filter({hasText: 'Are you sure you want to remove this file?'}).last();
    const editWin = (pg) => pg.getByRole('dialog').filter({hasText: 'What kind of file is this?'}).last();
    /** What the page shows after a press: at once (settled) and 2 s on. */
    const after = async (pg, m, name) => {
        await bounded(idle(pg), 35_000);
        const first = {windows: await windows(pg), panel: await panelState(pg)};
        const s = await snap(pg, name);
        await sleep(2000);
        return {...since(m), atOnce: first, notices: s.notices || null, twoSecondsOn: {windows: await windows(pg), panel: await panelState(pg)}};
    };

    await signIn(page, au, {contextPath: ctxPath});

    // ---------------------------------------------------------------- OPS: the control
    if (isOPS) {
        await step('ops', async () => {
            await openUploadFiles(page, ids.d1);
            const s = await snap(page, 'i09-ops-upload-files');
            fact('ops-upload-files', {
                filesPanels: await page.locator('.submissionFilesListPanel').count(),
                cancelUpload: await page.getByRole('button', {name: 'Cancel upload'}).count(),
                statusRegions: await page.locator('main [role=status], .submissionWizard [role=status]').evaluateAll((els) => els.map((e) => ({text: e.textContent.replace(/\s+/g, ' ').trim(), cls: e.className}))),
                stepText: flat((s.text && s.text.main) || '', 900),
            });
        });
        await page.close();
        return;
    }

    // ---------------------------------------------------------------- (1) rows the server no longer has
    if (on('stale')) {
        await step('stale', async () => {
            await openUploadFiles(page, ids.d1);
            await loc(page, 'wizard "Files" panel', panel(page));
            await pick(page, path.join(FIX, 'notes.md'));
            await waitRow(page, 'notes.md', (r) => !!r.link, T);
            await idle(page);
            fact('stale-0-tabA-before', await panelState(page));
            await snap(page, 'i09-stale-0-tabA-two-rows');
            await loc(page, 'row "Remove" (article.pdf)', row(page, 'article.pdf').getByRole('button', {name: 'Remove', exact: true}));

            // tab B: the same draft; "Remove" › "Yes" on both rows (the control: a removal that works)
            const tabB = await context.newPage();
            hear(tabB, 'B');
            await openUploadFiles(tabB, ids.d1);
            const control = {};
            for (const name of ['article.pdf', 'notes.md']) {
                const m = mark();
                await row(tabB, name).getByRole('button', {name: 'Remove', exact: true}).click();
                const ask = removeAsk(tabB);
                await ask.waitFor({timeout: T});
                if (name === 'article.pdf') { await snap(tabB, 'i09-stale-1-tabB-remove-window'); await loc(tabB, '"Remove" window', ask); }
                await ask.getByRole('button', {name: 'Yes', exact: true}).click();
                const closed = await ask.waitFor({state: 'hidden', timeout: 15_000}).then(() => true).catch(() => false);
                await idle(tabB);
                control[name] = {windowClosed: closed, ...since(m), panel: await panelState(tabB)};
            }
            fact('stale-1-tabB-control-remove', control);
            await snap(tabB, 'i09-stale-1-tabB-after-remove');
            await tabB.close();

            // tab A: "Remove" › "Yes" on the row that is gone from the server
            await page.bringToFront();
            let m = mark();
            await row(page, 'article.pdf').getByRole('button', {name: 'Remove', exact: true}).click();
            const ask = removeAsk(page);
            await ask.waitFor({timeout: T});
            await ask.getByRole('button', {name: 'Yes', exact: true}).click();
            fact('stale-2-tabA-remove-yes', await after(page, m, 'i09-stale-2-tabA-remove-yes'));
            // "Yes" a second time, when the window is still there
            if (await ask.isVisible().catch(() => false)) {
                m = mark();
                await ask.getByRole('button', {name: 'Yes', exact: true}).click({timeout: 5000}).catch((e) => fact('stale-3-yes-again-click', String(e.message).split('\n')[0]));
                fact('stale-3-tabA-remove-yes-again', await after(page, m, 'i09-stale-3-tabA-remove-yes-again'));
                m = mark();
                await ask.getByRole('button', {name: 'No', exact: true}).click({timeout: 5000}).catch((e) => fact('stale-4-no-click', String(e.message).split('\n')[0]));
                await ask.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
                fact('stale-4-tabA-remove-no', await after(page, m, 'i09-stale-4-tabA-remove-no'));
            } else fact('stale-3-tabA-remove-window', 'closed after the first "Yes"');

            // the sweep: the other stale row's controls
            m = mark();
            const link = row(page, 'notes.md').locator('.listPanel--submissionFiles__setGenreButton').filter({hasText: new RegExp(`^\\s*${MAIN}\\s*$`)}).first();
            if (await link.count()) {
                await link.click();
                await sleep(300);
                const spinner = await row(page, 'notes.md').locator('.listPanel--submissionFiles__genreSpinner, .pkpSpinner').count().catch(() => -1);
                const r = await after(page, m, 'i09-stale-5-tabA-component-link');
                fact('stale-5-tabA-component-link', {pressed: MAIN, spinnerAt300ms: spinner, spinner2sOn: await row(page, 'notes.md').locator('.listPanel--submissionFiles__genreSpinner, .pkpSpinner').count().catch(() => -1), ...r});
            } else fact('stale-5-tabA-component-link', `no "${MAIN}" link on the row`);

            // close whatever window the press left open, then "Edit" › a radio › "Save"
            const strayOk = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(OK|Ok|Close)/}).first();
            if ((await windows(page)).length && await strayOk.count()) { await strayOk.click().catch(() => {}); await sleep(800); }
            m = mark();
            const editBtn = row(page, 'notes.md').getByRole('button', {name: /^Edit/}).first();
            if (await editBtn.count()) {
                await editBtn.click();
                const win = editWin(page);
                await win.waitFor({timeout: T});
                await idle(page);
                await snap(page, 'i09-stale-6-tabA-edit-window');
                await win.getByRole('radio').first().check();
                await win.getByRole('button', {name: 'Save', exact: true}).click();
                fact('stale-6-tabA-edit-save', await after(page, m, 'i09-stale-6-tabA-edit-save'));
                // the way out with something changed: another radio, then the window's close control
                const ok = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(OK|Ok)$/}).first();
                if (await ok.count()) { await ok.click().catch(() => {}); await sleep(800); }
                if (await win.isVisible().catch(() => false)) {
                    m = mark();
                    const radios = win.getByRole('radio');
                    if (await radios.count() > 1) await radios.nth(1).check();
                    const closeBtn = win.getByRole('button', {name: /^Close/}).first();
                    if (await closeBtn.count()) await closeBtn.click(); else await page.keyboard.press('Escape');
                    await sleep(800);
                    fact('stale-7-tabA-edit-closed-changed', await after(page, m, 'i09-stale-7-tabA-edit-closed-changed'));
                }
            } else fact('stale-6-tabA-edit-save', 'no "Edit" on the row');

            // a reload: what the panel lists
            await page.reload();
            await page.locator('.pkpSteps__step__label--current').waitFor({timeout: T});
            await idle(page);
            await panel(page).waitFor({timeout: T}).catch(() => {});
            fact('stale-8-tabA-after-reload', {step: flat(await page.locator('.pkpSteps__step__label--current').innerText(), 60), panel: await panelState(page)});
            await snap(page, 'i09-stale-8-tabA-after-reload');
        });
    }

    // ---------------------------------------------------------------- (3) the screen-reader status
    if (on('status')) {
        const read = async (k, extra = {}) => { const st = await panelState(page); fact(k, {status: st.status, statusText: statusText(st), rows: st.rows.map((r) => r.text), empty: st.empty, ...extra}); return st; };
        const aria = () => panel(page).ariaSnapshot().catch((e) => String(e.message));
        const reload = async () => {
            await page.reload();
            await page.locator('.pkpSteps__step__label--current').waitFor({timeout: T});
            await idle(page);
            await panel(page).waitFor({timeout: T});
        };
        const logLines = (m) => consoleA.slice(m.c).filter((c) => c.type === 'log').map((c) => c.text);
        /** Press the row's "Cancel upload" and read the status at once, 1 s and 5 s after the row is gone. */
        const cancelAndRead = async (name, k, m, clock, extra = {}) => {
            const before = await panelState(page);
            await row(page, name).getByRole('button', {name: 'Cancel upload'}).click({timeout: 5000});
            const gone = await waitNoRow(page, name);
            const at0 = await panelState(page);
            await sleep(1000);
            const at1 = await panelState(page);
            const aria1 = await aria();
            await shot(page, `i09-${k}-one-second-on`).catch(() => {});
            await sleep(4000);
            const at5 = await panelState(page);
            fact(k, {...extra, statusBeforePress: statusText(before), rowGoneAfterMs: gone, statusAtOnce: statusText(at0), statusOneSecondOn: statusText(at1), statusFiveSecondsOn: statusText(at5),
                statusDetail: at1.status, rowsOneSecondOn: at1.rows.map((r) => r.text), emptyOneSecondOn: at1.empty, ...since(m), clock: await clock.read()});
            return aria1;
        };

        await step('status-fresh', async () => {
            await openUploadFiles(page, ids.d3);
            await read('status-0-before-any-upload');
            await snap(page, 'i09-status-0-before-any-upload', {panelAria: await aria()});
        });

        // s1: on a panel that has uploaded nothing, a file over the size limit is refused in its row; "Cancel upload" clears the row
        await step('status-1', async () => {
            const clock = await startClock(page);
            const m = mark();
            const tooBig = sparse(files, 'too-big.pdf', 300 * 1024 * 1024);
            await pick(page, tooBig);
            const refused = await waitRow(page, 'too-big.pdf', (r) => /too big/i.test(r.text), 15_000);
            await snap(page, 'i09-status-1-refused-row', {panelAria: await aria()});
            const aria1 = await cancelAndRead('too-big.pdf', 'status-1-refused-row-cleared', m, clock, {row: refused});
            await snap(page, 'i09-status-1-refused-row-cleared', {panelAria: aria1});
            fs.unlinkSync(tooBig);
        });

        // s2: "Cancel upload" while the file is on its way (the upload itself held back to 64 bytes a second)
        await step('status-2', async () => {
            await reload();
            await read('status-2-fresh');
            const clock = await startClock(page);
            const m = mark();
            const cdp = await throttle(page, {up: 64});
            try {
                await pick(page, copyAs(files, 'held.pdf'));
                const onItsWay = await waitRow(page, 'held.pdf', (r) => r.buttons.includes('Cancel upload'), 20_000);
                await shot(page, 'i09-status-2-row-on-its-way').catch(() => {});
                const aria1 = await cancelAndRead('held.pdf', 'status-2-cancel-on-its-way', m, clock, {rowAtPress: onItsWay});
                record('i09-status-2-after-cancel-on-its-way', {url: page.url(), panelAria: aria1, panel: await panelState(page)});
            } finally {
                await throttle(page, {}, cdp).catch(() => {});
            }
            await sleep(2000);
        });

        // s3: "Cancel upload" once the whole file has been sent, the answer held back (the kept walk's profile)
        await step('status-3', async () => {
            await reload();
            await read('status-3-fresh');
            const clock = await startClock(page);
            const m = mark();
            const cdp = await throttle(page, {down: 125});
            let aria1 = null;
            try {
                await pick(page, copyAs(files, 'sent.pdf'));
                const sent = await waitRow(page, 'sent.pdf', sentNotAnswered, 20_000);
                await shot(page, 'i09-status-3-row-sent').catch(() => {});
                await loc(page, 'row "Cancel upload"', row(page, 'sent.pdf').getByRole('button', {name: 'Cancel upload'}));
                aria1 = await cancelAndRead('sent.pdf', 'status-3-cancel-after-sent', m, clock, {rowAtPress: sent});
            } finally {
                await throttle(page, {}, cdp).catch(() => {});
            }
            await sleep(1500);
            await snap(page, 'i09-status-3-after-cancel-sent', {panelAria: aria1});
            await loc(page, 'the panel\'s screen-reader status', panel(page).locator('[role=status]'));
        });

        // s4: uploads left alone (the control): a small file, then 1.9 MiB; then "Cancel upload" pressed on 1.9 MiB as soon as its row offers it
        await step('status-4', async () => {
            await reload();
            await read('status-4-fresh');
            let clock = await startClock(page);
            let m = mark();
            await pick(page, path.join(FIX, 'article.pdf'));
            await waitRow(page, 'article.pdf', (r) => !!r.link, T);
            await idle(page);
            await read('status-4a-upload-finished');
            await sleep(5000);
            await read('status-4a-upload-finished-5s-on', {...since(m), clock: await clock.read(), logLines: logLines(m)});
            await snap(page, 'i09-status-4a-upload-finished', {panelAria: await aria()});

            clock = await startClock(page);
            m = mark();
            await pick(page, dense(files, 'large.pdf', Math.floor(1.9 * 1024 * 1024)));
            await waitRow(page, 'large.pdf', (r) => !!r.link, T, 5);
            await idle(page);
            await read('status-4b-large-upload-finished', {...since(m), clock: await clock.read()});

            clock = await startClock(page);
            m = mark();
            const second = path.join(files, 'partway.pdf');
            fs.copyFileSync(path.join(files, 'large.pdf'), second);
            await pick(page, second);
            const offered = await waitRow(page, 'partway.pdf', (r) => r.buttons.includes('Cancel upload'), 10_000, 3);
            const pressed = await row(page, 'partway.pdf').getByRole('button', {name: 'Cancel upload'}).click({timeout: 1500}).then(() => true).catch((e) => String(e.message).split('\n')[0].slice(0, 160));
            await sleep(1000);
            await idle(page);
            await read('status-4c-press-as-soon-as-offered', {rowWhenOffered: offered, pressed, ...since(m), clock: await clock.read()});
        });

        // s5: "Remove" › "Yes" on every stored row: the empty panel
        await step('status-5', async () => {
            const m = mark();
            const removed = [];
            for (let i = 0; i < 6; i++) {
                const st = await panelState(page);
                const next = st.rows.find((r) => r.link && r.buttons.includes('Remove'));
                if (!next) break;
                await row(page, next.link).getByRole('button', {name: 'Remove', exact: true}).click();
                await removeAsk(page).getByRole('button', {name: 'Yes', exact: true}).click();
                const closed = await removeAsk(page).waitFor({state: 'hidden', timeout: 15_000}).then(() => true).catch(() => false);
                await idle(page);
                removed.push({name: next.link, windowClosed: closed});
            }
            await sleep(1000);
            await read('status-5-after-remove-all', {removed, ...since(m)});
            await snap(page, 'i09-status-5-after-remove-all', {panelAria: await aria()});
        });

        // s6: a reload
        await step('status-6', async () => {
            await reload();
            await read('status-6-after-reload');
            await snap(page, 'i09-status-6-after-reload', {panelAria: await aria()});
        });
    }

    // ---------------------------------------------------------------- (1) a second refusal: the session ended elsewhere
    if (on('signedout')) {
        await step('signedout', async () => {
            await openUploadFiles(page, ids.d2);
            fact('signedout-0-tabA-before', await panelState(page));
            const tabB = await context.newPage();
            hear(tabB, 'B');
            await tabB.goto(app.url(`/index.php/${ctxPath}/login/signOut`)).catch((e) => fact('signedout-goto', String(e.message).split('\n')[0]));
            await sleep(1500);
            fact('signedout-1-tabB', {url: tabB.url(), heading: flat(await tabB.locator('h1').first().innerText().catch(() => null), 80)});
            await tabB.close();
            await page.bringToFront();
            const m = mark();
            await row(page, 'article.pdf').getByRole('button', {name: 'Remove', exact: true}).click();
            const ask = removeAsk(page);
            await ask.waitFor({timeout: T});
            await ask.getByRole('button', {name: 'Yes', exact: true}).click();
            await sleep(3000);
            const first = {windows: await windows(page), panel: await panelState(page), url: page.url()};
            const s = await snap(page, 'i09-signedout-2-tabA-remove-yes');
            await sleep(2000);
            fact('signedout-2-tabA-remove-yes', {...since(m), atOnce: first, notices: s.notices || null, twoSecondsOn: {windows: await windows(page), panel: await panelState(page), url: page.url()}});
        });
    }

    fact('browser-dialogs', jsDialogs);
    fact('console-not-log', consoleA.filter((c) => c.type !== 'log' && c.type !== 'info' && c.type !== 'debug').slice(0, 60));
    fact('console-log-lines', Object.entries(consoleA.filter((c) => c.type === 'log').reduce((a, c) => { a[c.text] = (a[c.text] || 0) + 1; return a; }, {})).slice(0, 20));
    await page.close();
});
