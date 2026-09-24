// U44 claim check, chunk K3: URNs on the "Identifiers" tabs, on issues and at publishing {OJS OMP}, with a
// read-only control on OPS (a preprint server has no URN plugin).
// Spec: docs/specs/U44-identifiers.md — Rules 12–17 (202–266), register A7 (513–520), OMP2–OMP4 (560–585);
// footnotes c, e, f, q9, q12, q14, q16, q20, q22 (the OMP2/OMP3 part), q23, q25, f-a7, f-omp2, f-omp3, f-omp4.
//
//   PROBE_FEATURE=U44 PROBE_AGENT=ccK3 node bin/probe.js <all|ojs|omp|ops> shared/playwright/checks/U44/K3/k3.js
//   PHASES=seed,galley,art,art2,issue,q12,cus,unres,reader (OJS, in that order) · seed,press,mpub,mb,mcus,mnan,munres,ctl (OMP)
//   · seed,ctl (OPS)
//   Default: every phase of the app. Later phases read k3-state-<app>.json (FRESH=1 seeds new contexts).
//   A full run outlasts the Bash cap: launch it detached (nohup … &) and poll the pid.
//
// Scratch contexts (OJS; acronym JPK, prefix urn:nbn:de:0000-, resolver https://nbn-resolving.de/):
//   A  default patterns, Issues + Articles + Galleys, no check number, Publisher ID on for galleys and issues;
//      future issues Vol 1 No 1/2/3 (2026); a1…a5 each with a "PDF" galley.
//      galley: a1 (no issue: a piece missing), a2/a3 (Vol 1 No 2: the preview, A7), the window left unsaved,
//              q14 (a Publisher ID + "Save" with the box as it arrives), the unticked box (other end), the stored
//              URN after the article moves to Vol 1 No 1 and after a prefix change (Rule 13), "Clear" (Rule 14, q25).
//      art:    a4 (Articles + Galleys: the confirmation table), published into Vol 1 No 1; a new version.
//      issue:  Vol 1 No 3's "Identifiers" tab (Rule 15, Rule 12 for an issue), "Save", "Clear"; "Clear Issue
//              Objects URNs" on Vol 1 No 1 (every version, every galley; a5 in Vol 1 No 2 the control);
//              "Publish Issue" (Rule 16, q20): stored (No 3), the ticked box (No 2), the box unticked (No 1).
//   B  Articles only, no Publisher IDs; Vol 1 No 1/2. art: Rule 17 / q16 (with a URN and scheduled, none and
//      published, none and scheduled, a PMUR version: requirements unmet). q12: the issue window, then "Issues"
//      ticked on screen.
//   N  no URN plugin, no Publisher ID; P  no URN plugin, Publisher ID on for issues (q12's other ends).
//   C  individual suffix, Check Number on, Issues + Articles + Galleys, Publisher ID on for galleys (Rule 12
//      third state, q23, A1's duplicate suffix; the issue tab; "Publish Issue" with no suffix).
//   D  individual suffix, Check Number off, Galleys only (no "Add Check Number"; the other end).
//   E  own patterns: issues "%j.%x", galleys "%j.%a.g%g"; Issues + Galleys (the unresolved issue URN on the tab and
//      in "Publish Issue"; a Galleys-only confirmation table).
// OMP (acronym PKP):
//   MA default patterns, all four kinds, Publisher ID on for chapters; m1 in Production with two chapters and two
//      formats with a file each (built on screen). press: the chapter/format/file tabs (Rules 12–14). mpub: the
//      monograph's URN, the format's approval window, availability, publishing (the table, OMP4), the book page
//      (OMP2, OMP3).
//   MB Monographs only: mb1 with a URN, mb2 without, mb3 declined (OMP4, the requirements end).
//   MC individual suffix + Check Number, Monographs + Chapters (Rule 12 third state, A1 on chapters).
//   MD own chapter pattern "%p.%x" (a piece missing).
// OPS (control): a preprint's galley "Identifiers" tab and its "Post" window carry no URN; the Issues address.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const PREFIX = 'urn:nbn:de:0000-';
const RESOLVER = 'https://nbn-resolving.de/';
const PHASE_ENV = (process.env.PHASES || 'all').split(',').map((s) => s.trim());
const on = (p) => PHASE_ENV.includes('all') || PHASE_ENV.includes(p);
const log = (...a) => console.log('[k3]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 3000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const vis = '[role="dialog"]:visible';
const topWin = (page) => page.locator(vis).last();
const wf = (page) => page.locator(vis).first();

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const sf = path.join(outDir(), `k3-state-${app.name}.json`);
    const S = (!process.env.FRESH && fs.existsSync(sf)) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k3-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const FILE = isOPS ? 'preprint.pdf' : 'article.pdf';
    const FIXTURE = path.resolve('apps', app.name, 'playwright/fixtures/files', FILE);
    const urn = (settings) => ({urnpubidplugin: {enabled: true, settings: {urnPrefix: PREFIX, urnResolver: RESOLVER, urnNamespace: 'urn:nbn:de', urnCheckNo: false, ...settings}}});
    const people = (p) => [{username: `${p}mg`, roles: ['manager'], givenName: 'Kai', familyName: 'Manager'}, {username: `${p}au`, roles: ['author'], givenName: 'Ari', familyName: 'Author'}];

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u44k3');
        S.t = t;
        const ctx = async (k, spec) => {
            const c = await app.api.createContext({tag: `${t}${k}`, users: people(`${t}${k}`), ...spec});
            S[k] = {path: c.path, mg: `${t}${k}mg`, au: `${t}${k}au`, issues: c.issues || null, subs: {}};
            return S[k];
        };
        const sub = async (k, s, extra = {}) => {
            const r = await app.api.createSubmission({tag: `${t}${k}${s}`, context: S[k].path, submitter: S[k].au, title: `K3 ${k}${s} ${t}`, ...extra});
            S[k].subs[s] = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys || null};
        };
        if (isOJS) {
            const three = [{volume: 1, number: 1, year: 2026}, {volume: 1, number: 2, year: 2026}, {volume: 1, number: 3, year: 2026}];
            const gal = {galleys: [{label: 'PDF', file: FILE}]};
            await ctx('A', {context: {acronym: 'JPK'}, issues: three, enablePublisherId: ['galley', 'issue'],
                plugins: urn({enableIssueURN: true, enablePublicationURN: true, enableRepresentationURN: true, urnSuffix: 'default'})});
            for (const s of ['1', '2', '3', '4', '5']) await sub('A', s, gal);
            await ctx('B', {context: {acronym: 'JPK'}, issues: three.slice(0, 2), plugins: urn({enablePublicationURN: true, urnSuffix: 'default'})});
            for (const s of ['1', '2', '3', '4']) await sub('B', s);
            await ctx('N', {context: {acronym: 'JPK'}, issues: three.slice(0, 1)});
            await ctx('P', {context: {acronym: 'JPK'}, issues: three.slice(0, 1), enablePublisherId: ['issue']});
            await ctx('C', {context: {acronym: 'JPK'}, issues: three.slice(0, 1), enablePublisherId: ['galley'],
                plugins: urn({enableIssueURN: true, enablePublicationURN: true, enableRepresentationURN: true, urnSuffix: 'customId', urnCheckNo: true})});
            for (const s of ['1', '2']) await sub('C', s, gal);
            await ctx('D', {context: {acronym: 'JPK'}, plugins: urn({enableRepresentationURN: true, urnSuffix: 'customId', urnCheckNo: false})});
            await sub('D', '1', gal);
            await ctx('E', {context: {acronym: 'JPK'}, issues: three.slice(0, 1),
                plugins: urn({enableIssueURN: true, enableRepresentationURN: true, urnSuffix: 'pattern', urnIssueSuffixPattern: '%j.%x', urnRepresentationSuffixPattern: '%j.%a.g%g'})});
            await sub('E', '1', gal);
        }
        if (isOMP) {
            const prod = {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
            await ctx('MA', {context: {acronym: 'PKP'}, enablePublisherId: ['chapter'],
                plugins: urn({enablePublicationURN: true, enableChapterURN: true, enableRepresentationURN: true, enableSubmissionFileURN: true, urnSuffix: 'default'})});
            await sub('MA', '1', prod);
            await ctx('MB', {context: {acronym: 'PKP'}, plugins: urn({enablePublicationURN: true, urnSuffix: 'default'})});
            await sub('MB', '1');
            await sub('MB', '2');
            try { await sub('MB', '3', {decisions: ['initialDecline']}); } catch (e) { S.MB.declineError = String(e.message).slice(0, 600); log('decline seed', S.MB.declineError); }
            await ctx('MC', {context: {acronym: 'PKP'}, plugins: urn({enablePublicationURN: true, enableChapterURN: true, urnSuffix: 'customId', urnCheckNo: true})});
            await sub('MC', '1');
            await ctx('MD', {context: {acronym: 'PKP'}, plugins: urn({enablePublicationURN: true, enableChapterURN: true, urnSuffix: 'pattern', urnPublicationSuffixPattern: '%p.%m', urnChapterSuffixPattern: '%p.%x'})});
            await sub('MD', '1');
        }
        if (isOPS) {
            await ctx('X', {context: {acronym: 'PKPX'}, enablePublisherId: ['publication', 'galley']});
            await sub('X', '1', {galleys: [{label: 'PDF', file: FILE}]});
        }
        S.seeded = true;
        save();
        log('seeded', JSON.stringify(S));
    }
    if (!S.seeded) { log('no state: run the seed phase'); return; }

    const cUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, id, key) => cUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', async (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message()});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    const posts = [];
    page.on('response', async (r) => {
        const m = r.request().method();
        if (m === 'GET') return;
        const u = r.url();
        if (!/identifiers|clear|publish|set-approved|set-available|\/publications\/\d+|\/version|update|approve|decision/i.test(u)) return;
        let body = '';
        try { body = (await r.text()).slice(0, 1200); } catch { /* ignore */ }
        posts.push({at: Date.now(), method: m, status: r.status(), url: u.replace(/^.*\/index\.php/, '').slice(0, 200), req: flat(decodeURIComponent(r.request().postData() || ''), 500), body: flat(body, 300)});
    });
    const postsSince = (t0) => posts.filter((p) => p.at >= t0).map(({at, ...p}) => p);
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map(({at, ...d}) => d);

    async function snap(name, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        if (extra) Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    let who = null;
    const as = async (k) => {
        const c = S[k];
        if (who === k) return;
        await signIn(page, c.mg, {contextPath: c.path});
        await idle(page);
        who = k;
    };

    // ---------------------------------------------------------------- workflow
    async function openWf(ctx, id, key, name) {
        await page.goto(wfUrl(ctx, id, key));
        await idle(page);
        await wf(page).waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        await sleep(300);
        if (name) return snap(name);
        return null;
    }
    const pubFor = (c, s) => (s.cur || s.pub);

    /** Publication › "Publication Settings": "Assign To Current/Back Issue" + the issue, Save {OJS}. */
    async function assignIssue(k, s, labelRe, name) {
        const c = S[k], sub = c.subs[s];
        await openWf(c.path, sub.id, `publication_${pubFor(c, sub)}_issue`);
        const d = wf(page);
        // "Current/Back" lists published issues only; a journal with future issues alone offers the future choices
        await d.getByRole('radio', {name: "Don't Assign To An Issue"}).waitFor({state: 'visible', timeout: T});
        await d.locator('input[name="assignment"]:checked').first().waitFor({timeout: T}).catch(() => {});
        const back = d.getByRole('radio', {name: 'Assign To Current/Back Issue'});
        const future = d.getByRole('radio', {name: 'Assign To Future Issue and Schedule Only'});
        const radio = (await back.count()) ? back : future;
        await radio.check();
        const sel = d.locator('select[name="issueId"]');
        await sel.waitFor({state: 'visible', timeout: T});
        const opt = sel.locator('option').filter({hasText: labelRe});
        await opt.first().waitFor({state: 'attached', timeout: T});
        await sel.selectOption((await opt.first().getAttribute('value')) || '');
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).catch(() => {});
        await idle(page);
        if (name) await snap(name);
        return {status: r ? r.status() : null, posts: postsSince(t0)};
    }

    /** The version's "Identifiers" page: its URN field. `act`: 'assign' presses "Assign" then "Save". */
    async function idPage(k, s, name, {act, pubId} = {}) {
        const c = S[k], sub = c.subs[s];
        await openWf(c.path, sub.id, `publication_${pubId || pubFor(c, sub)}_identifiers`);
        const field = wf(page).locator('.pkpFormField').filter({hasText: 'URN'}).first();
        await field.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
        await idle(page);
        const read = async () => ({
            value: (await field.locator('input').count()) ? await field.locator('input').first().inputValue() : null,
            text: flat(await field.innerText().catch(() => null), 500),
            buttons: await field.getByRole('button').allInnerTexts().catch(() => []),
        });
        const out = {before: await read()};
        if (act === 'assign') {
            const b = field.getByRole('button', {name: 'Assign', exact: true});
            if (await b.count()) {
                await b.click();
                await sleep(300);
                const t0 = Date.now();
                const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await wf(page).getByRole('button', {name: 'Save', exact: true}).click();
                const r = await w;
                await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).catch(() => {});
                await idle(page);
                out.save = {status: r ? r.status() : null, posts: postsSince(t0)};
            } else out.save = 'no Assign button';
            out.after = await read();
        }
        if (name) await snap(name, {idPage: out});
        return out;
    }

    // ------------------------------------------------------ legacy windows & the "Identifiers" tab
    async function openGalleyEdit(k, s, name, {pubId} = {}) {
        const c = S[k], sub = c.subs[s];
        await openWf(c.path, sub.id, `publication_${pubId || pubFor(c, sub)}_galleys`);
        const row = wf(page).locator('tbody tr').filter({hasText: 'PDF'}).first();
        await row.waitFor({timeout: 20000});
        await row.locator('button').last().click();
        await idle(page);
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click();
        await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab], .ui-tabs-nav'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        await sleep(300);
        const tabs = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
        if (name) await snap(name, {tabs});
        return {tabs};
    }
    const idForm = () => topWin(page).locator('#publicIdentifiersForm').first();
    async function openIdTab(name) {
        const t = topWin(page).getByRole('tab', {name: 'Identifiers', exact: true});
        if (!(await t.count())) { if (name) await snap(name, {idTab: 'absent'}); return {absent: true}; }
        await t.click();
        await idle(page);
        await idForm().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        await sleep(300);
        return readTab(name);
    }
    async function readTab(name) {
        const f = idForm();
        const out = {formPresent: (await f.count()) > 0};
        if (out.formPresent) {
            Object.assign(out, await f.evaluate((el) => {
                const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
                const block = (a) => (a ? {title: t(a.querySelector('legend, .label, h3')), text: t(a), paras: [...a.querySelectorAll('p')].map(t).filter(Boolean), raw: a.textContent.replace(/[\t\n]+/g, '\n').replace(/\n+/g, '\n').trim()} : null);
                const inputs = [...el.querySelectorAll('input, button, select')].filter((i) => i.type !== 'hidden').map((i) => {
                    const l = i.id ? el.querySelector(`label[for="${i.id}"]`) : null;
                    return {tag: i.tagName.toLowerCase(), type: i.type, name: i.name, id: i.id, value: i.value, disabled: i.disabled, checked: i.checked, labelRaw: l ? l.textContent : null, text: i.tagName === 'BUTTON' ? t(i) : undefined};
                });
                return {
                    text: t(el),
                    urnArea: block(el.querySelector('[id^="pubIdURNFormArea"]')),
                    objArea: block(el.querySelector('[id^="pubIdURNIssueobjectsFormArea"]')),
                    inputs,
                    links: [...el.querySelectorAll('a')].filter((a) => a.getClientRects().length).map(t),
                    errors: [...el.querySelectorAll('.error, label.error, #formErrors, .pkp_form_error')].filter((e) => e.getClientRects().length).map(t).filter(Boolean),
                };
            }));
            const assign = out.inputs.find((i) => i.name === 'assignURN');
            out.assignLabelRaw = assign ? assign.labelRaw : null;
            out.assignChecked = assign ? assign.checked : null;
            const pid = out.inputs.find((i) => i.name === 'publisherId');
            out.publisherId = pid ? pid.value : null;
        }
        if (name) await snap(name, {idTab: out});
        return out;
    }
    const winCount = async () => page.locator(vis).count();
    /** Fill the tab, set the assign box, press "Save". */
    async function saveTab({publisherId, suffix, assign} = {}, name) {
        const f = idForm();
        if (publisherId !== undefined) { await f.locator('input[name="publisherId"]').fill(publisherId); }
        if (suffix !== undefined) { await f.locator('input[name="urnSuffix"]').fill(suffix); }
        const box = f.locator('input[name="assignURN"]');
        const boxAsArrived = (await box.count()) ? await box.isChecked() : null;
        if (assign !== undefined && (await box.count())) { if (assign) await box.check(); else await box.uncheck(); }
        const n0 = await winCount();
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /update-identifiers|updateIdentifiers/i.test(r.url()), {timeout: 20000}).catch(() => null);
        await f.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await idle(page);
        await sleep(900);
        await idle(page);
        const n1 = await winCount();
        const notices = await page.locator('.app__notifications, .pkp_notification, [role="alert"], [role="status"]').allInnerTexts().catch(() => []);
        const out = {boxAsArrived, status: r ? r.status() : null, windowsBefore: n0, windowsAfter: n1, posts: postsSince(t0), notices: notices.map((x) => flat(x, 200)).filter(Boolean)};
        if (n1 >= n0 && (await idForm().count())) out.tab = await readTab(name ? `${name}-still-open` : null);
        if (name) await snap(name, {saveTab: out});
        return out;
    }
    async function closeTopWin() {
        const w = topWin(page);
        const c = w.getByRole('button', {name: /^Close/}).first();
        if (await c.count()) await c.click().catch(() => {});
        await idle(page);
        await sleep(700);
    }
    /** "Clear" on a tab: the question, then `choice` ("Cancel" | "Delete"); reads the tab at once. */
    async function clearOnTab(linkName, choice, name) {
        const f = idForm();
        const link = f.getByRole('link', {name: linkName, exact: true}).first();
        const out = {offered: (await link.count()) > 0};
        if (!out.offered) return out;
        await loc(page, `"Identifiers" tab: the "${linkName}" link`, link);
        const n0 = await winCount();
        const t0 = Date.now();
        await link.click();
        const q = page.locator(vis).filter({hasText: 'Are you sure'}).last();
        await q.waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        out.question = flat(await q.innerText().catch(() => null), 500);
        out.questionButtons = await q.getByRole('button').allInnerTexts().catch(() => []);
        await snap(`${name}-question`, {question: out.question});
        const w = page.waitForResponse((r) => /clear/i.test(r.url()) && r.request().method() === 'POST', {timeout: 15000}).catch(() => null);
        // the question's confirm button reads "OK" (not "Delete"): "Delete" here means the confirming button
        await q.getByRole('button', {name: choice === 'Cancel' ? /^Cancel$/ : /^(Delete|OK)$/}).first().click();
        const r = choice === 'Cancel' ? null : await w;
        await idle(page);
        await sleep(1200);
        await idle(page);
        out.status = r ? r.status() : null;
        out.posts = postsSince(t0);
        out.windowsBefore = n0;
        out.windowsAfter = await winCount();
        out.jsDialogs = dialogsSince(t0);
        out.tabNow = (await idForm().count()) ? await readTab(`${name}-now`) : 'form gone';
        return out;
    }

    // ------------------------------------------------------------------ issues {OJS}
    const ilabel = (n) => `Vol. 1 No. ${n} (2026)`;
    async function gotoIssues(k, which = 'future') {
        await page.goto(cUrl(S[k].path, '/manageIssues'));
        await idle(page);
        if (which === 'back') {
            await page.getByRole('tab', {name: 'Back Issues'}).or(page.getByRole('link', {name: 'Back Issues'})).first().click();
            await idle(page);
            await sleep(800);
        }
        await page.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function issueRowLink(k, n, linkName, which) {
        await gotoIssues(k, which);
        const row = page.locator('tr.gridRow').filter({hasText: ilabel(n)}).filter({visible: true}).first();
        await row.waitFor({timeout: 20000});
        await row.locator('a.show_extras').first().click();
        await sleep(400);
        const id = await row.getAttribute('id');
        const ctl = page.locator(`[id="${id}-control-row"]`);
        const links = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        const a = ctl.getByRole('link', {name: linkName, exact: true}).first();
        const found = (await a.count()) > 0;
        if (found) await a.click();
        else await page.getByRole('link', {name: linkName, exact: true}).filter({visible: true}).first().click();
        await idle(page);
        return {rowLinks: links};
    }
    async function openIssueEdit(k, n, name, which) {
        const r = await issueRowLink(k, n, 'Edit', which);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        await sleep(300);
        const tabs = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
        if (name) await snap(name, {tabs, rowLinks: r.rowLinks});
        return {tabs, rowLinks: r.rowLinks};
    }
    /** "Publish Issue": the window's text and boxes; `urnBox` true/false sets the URN box; `go` presses OK. */
    async function publishIssue(k, n, name, {urnBox, go = true} = {}) {
        const r = await issueRowLink(k, n, 'Publish Issue');
        const d = page.locator(vis).filter({hasText: 'Are you sure you want to publish the new issue?'}).last();
        await d.waitFor({timeout: T});
        await d.locator('#sendIssueNotification, input[name="sendIssueNotification"]').first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        await sleep(300);
        const read = await d.evaluate((el) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const inputs = [...el.querySelectorAll('input, button')].filter((i) => i.type !== 'hidden').map((i) => {
                const l = i.id ? el.querySelector(`label[for="${i.id}"]`) : null;
                return {type: i.type, name: i.name, id: i.id, checked: i.checked, disabled: i.disabled, labelRaw: l ? l.textContent : null, text: i.tagName === 'BUTTON' ? t(i) : undefined};
            });
            const area = el.querySelector('[id^="pubIdURNFormArea"]');
            return {text: t(el), urnArea: area ? {text: t(area), raw: area.textContent.replace(/\s*\n\s*/g, '\n').trim()} : null, inputs, paras: [...el.querySelectorAll('p')].map(t).filter(Boolean)};
        });
        const out = {rowLinks: r.rowLinks, ...read};
        await snap(`${name}-window`, {publishIssue: out});
        const box = d.locator('input[name="assignURN"]');
        if (urnBox !== undefined && (await box.count())) { if (urnBox) await box.check(); else await box.uncheck(); }
        const mail = d.locator('#sendIssueNotification, input[name="sendIssueNotification"]').first();
        if ((await mail.count()) && (await mail.isChecked())) await mail.uncheck();
        if (!go) {
            const cancel = d.getByRole('link', {name: 'Cancel', exact: true}).or(d.getByRole('button', {name: 'Cancel', exact: true})).first();
            await cancel.click().catch(() => {});
            await idle(page);
            await sleep(700);
            return out;
        }
        const t0 = Date.now();
        const w = page.waitForResponse((res) => /publish-issue|publishIssue/i.test(res.url()) && res.request().method() === 'POST', {timeout: T}).catch(() => null);
        await d.getByRole('button', {name: 'OK', exact: true}).click();
        const res = await w;
        await d.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page);
        out.ok = {status: res ? res.status() : null, posts: postsSince(t0)};
        await snap(name, {publishIssue: out});
        return out;
    }
    async function issuePage(k, n, name) {
        const iss = (S[k].issues || []).find((i) => String(i.number) === String(n));
        await page.goto(cUrl(S[k].path, `/issue/view/${iss.id}`));
        await idle(page);
        const body = (await page.locator('body').innerText().catch(() => '')) || '';
        const urnLines = body.split('\n').map((l) => l.trim()).filter((l) => /urn/i.test(l));
        const links = await page.locator('a[href*="urn:"]').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), href: e.getAttribute('href')}))).catch(() => []);
        await snap(name, {urnLines, urnLinks: links});
        return {urnLines, links};
    }
    /** The URN plugin's settings window (Plugins grid › URN › Settings); `change(form)` edits it, then "Save". */
    async function urnSettings(k, name, change) {
        await page.goto(cUrl(S[k].path, '/management/settings/website'));
        await idle(page);
        await page.locator('#plugins-button').click();
        const row = page.locator('#pluginGridContainer tr.gridRow[id$="-row-urnpubidplugin"]');
        await row.waitFor({timeout: T});
        await idle(page);
        await row.locator('a.show_extras').first().click();
        await sleep(400);
        await page.locator('#pluginGridContainer tr[id$="-row-urnpubidplugin"] + tr').getByRole('link', {name: 'Settings', exact: true}).first().click();
        const form = page.locator('#urnSettingsForm');
        await form.locator('input[name="urnPrefix"]').waitFor({state: 'visible', timeout: T});
        await idle(page);
        await sleep(400);
        await change(form);
        const t0 = Date.now();
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await form.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
        await sleep(600);
        const out = {closed: !(await form.isVisible().catch(() => false)), posts: postsSince(t0)};
        if (name) await snap(name, {settings: out});
        return out;
    }

    // ------------------------------------------------------------------ publishing
    /** OJS: the publish button › "Review Publishing Details" › Confirm › the confirmation window. */
    async function publishOJS(k, s, name, {mode = 'none', issueRe, stage = 'VoR', go = true} = {}) {
        const c = S[k], sub = c.subs[s];
        await openWf(c.path, sub.id, `publication_${pubFor(c, sub)}_titleAbstract`);
        const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Schedule For Publication|Publish)$/});
        await button.waitFor({timeout: T});
        await button.click();
        const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
        const stageSel = panel.locator('select[name="versionStage"]');
        if (!(await stageSel.waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false))) { await button.click(); await stageSel.waitFor({state: 'visible', timeout: T}); }
        await idle(page);
        if (stage === 'VoR') await stageSel.selectOption('VoR');
        else await stageSel.selectOption({label: 'Published Manuscript Under Review (PMUR)'});
        await panel.locator('select[name="versionIsMinor"]').selectOption('false').catch(() => {});
        const radioName = {none: "Don't Assign To An Issue", back: 'Assign To Current/Back Issue', futurePublish: 'Assign To Future Issue and Publish Immediately', futureSchedule: 'Assign To Future Issue and Schedule Only'}[mode];
        const radio = panel.getByRole('radio', {name: radioName});
        if (await radio.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
            await panel.locator('input[name="assignment"]:checked').first().waitFor({timeout: T}).catch(() => {});
            // U49 OJS2: the first pick of "Schedule Only" misfires; another choice first, then this one
            if (mode === 'futureSchedule') { await panel.getByRole('radio', {name: 'Assign To Future Issue and Publish Immediately'}).check(); await sleep(400); }
            await radio.check();
            if (issueRe) {
                const sel = panel.locator('select[name="issueId"]');
                await sel.waitFor({state: 'visible', timeout: T});
                const opt = sel.locator('option').filter({hasText: issueRe});
                await opt.first().waitFor({state: 'attached', timeout: T});
                await sel.selectOption((await opt.first().getAttribute('value')) || '');
            }
        }
        await sleep(300);
        await snap(`${name}-panel`);
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const win = page.getByRole('dialog').filter({hasText: /Are you sure you want to|requirements must be met|requirements have been met/}).last();
        await win.waitFor({timeout: T});
        await idle(page);
        await sleep(600);
        const out = await readPublishWindow(win);
        await snap(`${name}-window`, {publishWindow: out});
        if (go && out.confirmButtons.length) {
            const t0 = Date.now();
            const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: out.confirmButtons[0], exact: true}).click();
            const r = await w;
            await page.getByRole('button', {name: /^(Unpublish|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            out.go = {status: r ? r.status() : null, posts: postsSince(t0)};
            await snap(name, {publishWindow: out});
        } else {
            await win.getByRole('button', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            await idle(page);
            await sleep(700);
        }
        return out;
    }
    async function readPublishWindow(win) {
        const r = await win.evaluate((el) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const tables = [...el.querySelectorAll('table')].map((tb) => ({head: [...tb.querySelectorAll('thead th')].map(t), rows: [...tb.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => ({text: t(td), warningIcon: !!td.querySelector('.fa-exclamation-triangle')})))}));
            const warnings = [...el.querySelectorAll('.pkpNotification--warning')].map((w) => ({text: t(w), icon: !!w.querySelector('.fa-exclamation-triangle')}));
            return {text: t(el), tables, warnings, buttons: [...el.querySelectorAll('button')].filter((b) => b.getClientRects().length).map(t).filter(Boolean)};
        });
        r.urnLines = (r.text || '').split(/(?<=\.)\s+/).filter((l) => /URN/.test(l));
        r.confirmButtons = r.buttons.filter((b) => /^(Publish|Schedule For Publication|Post)$/.test(b));
        return r;
    }
    /** OMP: the "Publish" button › the "Schedule For Publication" window. */
    async function publishOMP(k, s, name, {go = true} = {}) {
        const c = S[k], sub = c.subs[s];
        await openWf(c.path, sub.id, `publication_${pubFor(c, sub)}_titleAbstract`);
        const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Publish|Schedule For Publication)$/});
        await button.waitFor({timeout: T});
        await button.click();
        const win = page.getByRole('dialog', {name: /Schedule For Publication|Publish/}).last();
        await win.waitFor({timeout: T});
        await idle(page);
        await sleep(800);
        const stage = win.locator('select[name="versionStage"]');
        if (await stage.isVisible().catch(() => false)) { if (!(await stage.inputValue())) await stage.selectOption('VoR'); }
        const minor = win.locator('select[name="versionIsMinor"]');
        if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
        await sleep(300);
        const out = await readPublishWindow(win);
        await snap(`${name}-window`, {publishWindow: out});
        if (go && out.confirmButtons.length) {
            const t0 = Date.now();
            const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: out.confirmButtons[0], exact: true}).click();
            const r = await w;
            await page.getByRole('button', {name: /^(Unpublish|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            out.go = {status: r ? r.status() : null, posts: postsSince(t0)};
            await snap(name, {publishWindow: out});
        } else {
            await win.getByRole('button', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            await idle(page);
            await sleep(700);
        }
        return out;
    }
    async function newVersion(k, s, name) {
        const c = S[k], sub = c.subs[s];
        await openWf(c.path, sub.id, `publication_${pubFor(c, sub)}_titleAbstract`);
        await page.getByRole('link', {name: 'Create New Version', exact: true}).click();
        const dlg = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
        await dlg.locator('select[name="versionStage"]').waitFor({timeout: T});
        await idle(page);
        await sleep(1200);
        const st = dlg.locator('select[name="versionStage"]');
        if (!(await st.inputValue())) await st.selectOption('VoR');
        const minor = dlg.locator('select[name="versionIsMinor"]');
        if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
        const w = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name: 'Confirm', exact: true}).click();
        const r = await w;
        let id = null;
        try { id = (await r.json()).id; } catch { /* */ }
        await idle(page);
        if (name) await snap(name, {newVersion: id});
        return id;
    }

    // ------------------------------------------------------------------ the press's windows {OMP}
    const pressGo = async (k, s, key) => openWf(S[k].path, S[k].subs[s].id, `publication_${pubFor(S[k], S[k].subs[s])}_${key}`);
    async function waitTabs() {
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 8000}).catch(() => {});
        await idle(page);
        await sleep(400);
        return (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
    }
    async function formatRow(label) {
        return wf(page).locator('tr.gridRow').filter({has: page.locator('.onix_code')}).filter({hasText: label}).first();
    }
    async function rowAction(kind, rowText, fileIndex = 0) {
        const panel = wf(page);
        if (kind === 'chapter') {
            const a = panel.locator('a.pkp_linkaction_editChapter').filter({hasText: rowText}).first();
            await a.waitFor({timeout: 20000});
            await a.click();
            await idle(page);
            return {links: ['(title link)']};
        }
        const row = kind === 'file'
            ? panel.locator('tr.gridRow').filter({has: page.locator('a.pkp_linkaction_downloadFile')}).nth(fileIndex)
            : await formatRow(rowText);
        await row.waitFor({timeout: 20000});
        const id = await row.getAttribute('id');
        await row.locator('a.show_extras').first().click();
        await sleep(500);
        const ctl = page.locator(`[id="${id}-control-row"]`);
        const links = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        const a = ctl.getByRole('link', {name: 'Edit', exact: true}).first();
        if (!(await a.count())) return {links, missing: 'Edit'};
        await a.click();
        await idle(page);
        return {links};
    }
    const PRESS = {chapter: ['K3 Chapter One', 'K3 Chapter Two'], format: ['PDF', 'EPUB']};
    async function openPressEdit(k, s, kind, i, name) {
        await pressGo(k, s, kind === 'chapter' ? 'chapters' : 'publicationFormats');
        const r = await rowAction(kind, kind === 'file' ? '' : PRESS[kind][i], i);
        if (r.missing) { await snap(name, {rowLinks: r.links}); return {rowLinks: r.links, tabs: []}; }
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); return d.length >= 2 && d.pop().querySelector('form, [role=tab]'); }, null, {timeout: 20000}).catch(() => {});
        const tabs = await waitTabs();
        const title = await topWin(page).locator('h1').first().innerText().catch(() => null);
        if (name) await snap(name, {rowLinks: r.links, tabs, title});
        return {rowLinks: r.links, tabs, title};
    }
    async function addChapters(k, s, titles) {
        await pressGo(k, s, 'chapters');
        for (const t of titles) {
            await wf(page).getByRole('link', {name: 'Add Chapter'}).first().click();
            await topWin(page).locator('input[name^="title"]').first().waitFor({timeout: 20000});
            await idle(page);
            await topWin(page).locator('input[name^="title"]').first().fill(t);
            await topWin(page).getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page);
            await sleep(1200);
            await idle(page);
        }
    }
    async function addFormats(k, s) {
        const out = {};
        await pressGo(k, s, 'publicationFormats');
        for (const [i, f] of PRESS.format.entries()) {
            await wf(page).getByRole('link', {name: 'Add publication format'}).first().click();
            await topWin(page).locator('input[name^="name"]').first().waitFor({timeout: 20000});
            await idle(page);
            out[`addTabs${i}`] = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
            await topWin(page).locator('input[name^="name"]').first().fill(f);
            await topWin(page).getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page);
            await sleep(1500);
            await idle(page);
            const cat = wf(page).locator('tr').filter({hasText: f}).filter({has: page.locator('.onix_code')}).first();
            await cat.getByRole('link', {name: 'Change File', exact: true}).first().click();
            const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
            await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
            await idle(page);
            const genre = wiz.locator('select[id^="genreId"]');
            if (await genre.count()) {
                const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({v: o.value, t: o.text.trim()})).filter((o) => o.v));
                await genre.selectOption(opts[0].v);
            }
            await wiz.locator('input[type="file"]').setInputFiles(FIXTURE);
            await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: T});
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length); return b && !b.disabled; }, null, {timeout: T}).catch(() => {});
            await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
            await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
            await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page); await sleep(1500); await idle(page);
        }
        out.grid = await wf(page).locator('tr').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        await snap('press-setup-formats', {grid: out.grid});
        return out;
    }
    async function bookPage(k, s, name) {
        await page.goto(cUrl(S[k].path, `/catalog/book/${S[k].subs[s].id}`));
        await idle(page);
        const data = await page.evaluate(() => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            return {
                pubids: [...document.querySelectorAll('.sub_item.pubid, .pubid')].map((e) => ({cls: e.className, label: t(e.querySelector('.label')), value: t(e.querySelector('.value')), links: [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')), html: e.innerHTML.replace(/\s+/g, ' ').slice(0, 400)})),
                formats: [...document.querySelectorAll('.item.publication_format')].map(t),
                urnLines: document.body.innerText.split('\n').map((l) => l.trim()).filter((l) => /urn/i.test(l)),
                urnLinks: [...document.querySelectorAll('a[href*="urn:"]')].map((a) => ({text: t(a), href: a.getAttribute('href')})),
            };
        });
        await snap(name, {book: data});
        return data;
    }

    // ================================================================== phases
    try {
        // ================================================================ OJS galley (Rules 12–14 on a galley)
        if (isOJS && on('galley')) {
            await as('A');
            const out = {};
            // a piece missing: a1 has no issue
            out.a1Tabs = (await openGalleyEdit('A', '1', 'g-01-a1-galley-window')).tabs;
            out.a1 = await openIdTab('g-02-a1-tab-no-issue');
            await closeTopWin();
            // a2 and a3 in Vol 1 No 2
            out.assignA2 = await assignIssue('A', '2', /Vol\. 1 No\. 2/, 'g-03-a2-issue-saved');
            out.assignA3 = await assignIssue('A', '3', /Vol\. 1 No\. 2/);
            await openGalleyEdit('A', '2', 'g-04-a2-galley-window');
            out.a2Preview = await openIdTab('g-05-a2-tab-preview');
            await loc(page, 'galley window › "Identifiers": the assign box', idForm().locator('input[name="assignURN"]'));
            await loc(page, 'galley window › "Identifiers": the URN area', idForm().locator('[id^="pubIdURNFormArea"]'));
            // leave the window once with something changed and unsaved
            const t0 = Date.now();
            await idForm().locator('input[name="publisherId"]').fill('pid-unsaved');
            await idForm().locator('input[name="assignURN"]').uncheck().catch(() => {});
            await idForm().locator('input[name="publisherId"]').blur().catch(() => {});
            await snap('g-06-a2-changed-unsaved');
            await closeTopWin();
            out.leave = {jsDialogs: dialogsSince(t0), windowsAfter: await winCount(), posts: postsSince(t0), vueQuestion: flat(await page.locator(vis).filter({hasText: /unsaved|leave|discard/i}).last().innerText().catch(() => null), 300)};
            await snap('g-07-a2-after-close', {leave: out.leave});
            if (out.leave.vueQuestion) await page.locator(vis).filter({hasText: /unsaved|leave|discard/i}).last().getByRole('button').last().click().catch(() => {});
            await openGalleyEdit('A', '2');
            out.a2AfterLeave = await openIdTab('g-08-a2-reopened-after-leave');
            // q14: a Publisher ID typed, the box as it arrives, "Save"
            out.q14Save = await saveTab({publisherId: 'pid-g3'}, 'g-09-a2-save-pid');
            if (out.q14Save.windowsAfter >= out.q14Save.windowsBefore) await closeTopWin();
            await openGalleyEdit('A', '2');
            out.a2Stored = await openIdTab('g-10-a2-reopened-stored');
            await closeTopWin();
            // the other end: the box unticked
            await openGalleyEdit('A', '3');
            out.a3Before = await openIdTab('g-11-a3-tab-preview');
            out.a3Save = await saveTab({publisherId: 'pid-g4', assign: false}, 'g-12-a3-save-unticked');
            if (out.a3Save.windowsAfter >= out.a3Save.windowsBefore) await closeTopWin();
            await openGalleyEdit('A', '3');
            out.a3After = await openIdTab('g-13-a3-reopened');
            await closeTopWin();
            // Rule 13: the article moves to Vol 1 No 1 (item data), then the prefix changes (settings)
            out.moveA2 = await assignIssue('A', '2', /Vol\. 1 No\. 1/, 'g-14-a2-moved');
            out.moveA3 = await assignIssue('A', '3', /Vol\. 1 No\. 1/);
            await openGalleyEdit('A', '2');
            out.a2AfterMove = await openIdTab('g-15-a2-after-move');
            await closeTopWin();
            await openGalleyEdit('A', '3');
            out.a3AfterMove = await openIdTab('g-16-a3-after-move');
            await closeTopWin();
            out.prefixChange = await urnSettings('A', 'g-17-prefix-0001', async (f) => { await f.locator('input[name="urnPrefix"]').fill('urn:nbn:de:0001-'); });
            await openGalleyEdit('A', '2');
            out.a2AfterPrefix = await openIdTab('g-18-a2-after-prefix');
            await closeTopWin();
            await openGalleyEdit('A', '3');
            out.a3AfterPrefix = await openIdTab('g-19-a3-after-prefix');
            await closeTopWin();
            out.prefixBack = await urnSettings('A', 'g-20-prefix-0000', async (f) => { await f.locator('input[name="urnPrefix"]').fill(PREFIX); });
            // Rule 14 / q25: "Clear" › Cancel, then › Delete
            await openGalleyEdit('A', '2');
            await openIdTab('g-21-a2-before-clear');
            out.clearCancel = await clearOnTab('Clear', 'Cancel', 'g-22-a2-clear-cancel');
            out.clearDelete = await clearOnTab('Clear', 'Delete', 'g-23-a2-clear-delete');
            await closeTopWin();
            await openGalleyEdit('A', '2');
            out.a2AfterClear = await openIdTab('g-24-a2-reopened-after-clear');
            await closeTopWin();
            fact('galley', out);
        }

        // ================================================================ OJS art (Rule 17 / q16)
        if (isOJS && on('art')) {
            const out = {};
            await as('B');
            // b1: a URN saved, then scheduled into Vol 1 No 1
            out.b1Issue = await assignIssue('B', '1', /Vol\. 1 No\. 1/);
            out.b1Urn = await idPage('B', '1', 'a-01-b1-idpage-assign', {act: 'assign'});
            out.b1Window = await publishOJS('B', '1', 'a-02-b1-schedule', {mode: 'futureSchedule', issueRe: /Vol\. 1 No\. 1/});
            out.b1After = await idPage('B', '1', 'a-03-b1-idpage-after');
            // b2: no URN, published at once into Vol 1 No 2
            out.b2Before = await idPage('B', '2', 'a-04-b2-idpage-before');
            out.b2Window = await publishOJS('B', '2', 'a-05-b2-publish', {mode: 'futurePublish', issueRe: /Vol\. 1 No\. 2/});
            out.b2After = await idPage('B', '2', 'a-06-b2-idpage-after');
            // b3: no URN, scheduled
            out.b3Window = await publishOJS('B', '3', 'a-07-b3-schedule', {mode: 'futureSchedule', issueRe: /Vol\. 1 No\. 1/});
            out.b3After = await idPage('B', '3', 'a-08-b3-idpage-after');
            // b4: requirements unmet (a PMUR version with no review round)
            out.b4Window = await publishOJS('B', '4', 'a-09-b4-pmur', {mode: 'none', stage: 'PMUR', go: false});
            // E: Galleys (and Issues) ticked, Articles not
            await as('E');
            out.e1Window = await publishOJS('E', '1', 'a-10-e1-galleys-only', {mode: 'none', go: false});
            // A: Articles + Galleys: a4 with the article's URN, the galley's not; published into Vol 1 No 1
            await as('A');
            out.a4Issue = await assignIssue('A', '4', /Vol\. 1 No\. 1/);
            out.a4Urn = await idPage('A', '4', 'a-11-a4-idpage-assign', {act: 'assign'});
            out.a4Window = await publishOJS('A', '4', 'a-12-a4-publish', {mode: 'futurePublish', issueRe: /Vol\. 1 No\. 1/});
            await openGalleyEdit('A', '4');
            out.a4GalleyAfter = await openIdTab('a-13-a4-galley-after-publish');
            await closeTopWin();
            // a new version of a4 (for the issue objects' clear)
            const v2 = await newVersion('A', '4', 'a-14-a4-new-version');
            S.A.subs['4'].v2 = v2;
            save();
            out.a4v2 = v2 ? await idPage('A', '4', 'a-15-a4-v2-idpage', {pubId: v2}) : null;
            fact('art', out);
        }

        // ================================================================ OJS art2 (Rule 17: scheduled with no URN)
        if (isOJS && on('art2')) {
            const out = {};
            if (!S.B.subs['5']) {
                const r = await app.api.createSubmission({tag: `${S.t}B5`, context: S.B.path, submitter: S.B.au, title: `K3 B5 ${S.t}`});
                S.B.subs['5'] = {id: r.submissionId, pub: r.publicationId};
                save();
            }
            await as('B');
            out.b5Window = await publishOJS('B', '5', 'a-16-b5-schedule', {mode: 'futureSchedule', issueRe: /Vol\. 1 No\. 1/});
            out.b5After = await idPage('B', '5', 'a-17-b5-idpage-after');
            fact('art2', out);
        }

        // ================================================================ OJS issue (Rules 12, 14, 15, 16)
        if (isOJS && on('issue')) {
            await as('A');
            const out = {};
            out.no3Edit = await openIssueEdit('A', 3, 'i-01-no3-edit-window');
            out.no3Tab = await openIdTab('i-02-no3-identifiers');
            await loc(page, 'issue window › "Identifiers": the "Clear Issue Objects URNs" link', idForm().getByRole('link', {name: 'Clear Issue Objects URNs', exact: true}));
            out.no3Save = await saveTab({publisherId: 'pid-i3'}, 'i-03-no3-save');
            if (out.no3Save.windowsAfter >= out.no3Save.windowsBefore) await closeTopWin();
            await openIssueEdit('A', 3);
            out.no3Stored = await openIdTab('i-04-no3-reopened-stored');
            out.no3Clear = await clearOnTab('Clear', 'Delete', 'i-05-no3-clear');
            await closeTopWin();
            await openIssueEdit('A', 3);
            out.no3AfterClear = await openIdTab('i-06-no3-after-clear');
            out.no3Resave = await saveTab({}, 'i-07-no3-save-again');
            if (out.no3Resave.windowsAfter >= out.no3Resave.windowsBefore) await closeTopWin();
            // URNs on Vol 1 No 1's articles (a2, a3, a4 v1 + v2) and galleys; a5 in Vol 1 No 2 the control
            const readAll = async (lbl) => {
                const r = {};
                r.a2 = (await idPage('A', '2', `i-${lbl}-a2-idpage`)).before;
                r.a4v1 = (await idPage('A', '4', `i-${lbl}-a4v1-idpage`, {pubId: S.A.subs['4'].pub})).before;
                if (S.A.subs['4'].v2) r.a4v2 = (await idPage('A', '4', `i-${lbl}-a4v2-idpage`, {pubId: S.A.subs['4'].v2})).before;
                r.a5 = (await idPage('A', '5', `i-${lbl}-a5-idpage`)).before;
                for (const [s, pubId] of [['2'], ['3'], ['4', S.A.subs['4'].pub], ['4', S.A.subs['4'].v2], ['5']]) {
                    if (s === '4' && !pubId) continue;
                    await openGalleyEdit('A', s, null, {pubId});
                    const g = await openIdTab(`i-${lbl}-galley-a${s}${pubId ? `-p${pubId}` : ''}`);
                    r[`galley-a${s}${pubId ? `-p${pubId}` : ''}`] = g.urnArea ? g.urnArea.text : g;
                    await closeTopWin();
                }
                return r;
            };
            out.a2Urn = await idPage('A', '2', 'i-08-a2-assign', {act: 'assign'});
            out.a5Issue = await assignIssue('A', '5', /Vol\. 1 No\. 2/);
            out.a5Urn = await idPage('A', '5', 'i-09-a5-assign', {act: 'assign'});
            for (const [s, pubId] of [['2'], ['3'], ['4', S.A.subs['4'].pub], ['5']]) {
                await openGalleyEdit('A', s, null, {pubId});
                await openIdTab(null);
                out[`gsave${s}`] = await saveTab({assign: true}, `i-10-galley-a${s}-save`);
                if (out[`gsave${s}`].windowsAfter >= out[`gsave${s}`].windowsBefore) await closeTopWin();
            }
            out.before = await readAll('11-before');
            await openIssueEdit('A', 1, 'i-12-no1-edit-window');
            out.no1Tab = await openIdTab('i-13-no1-identifiers');
            out.objCancel = await clearOnTab('Clear Issue Objects URNs', 'Cancel', 'i-14-no1-objects-cancel');
            out.objDelete = await clearOnTab('Clear Issue Objects URNs', 'Delete', 'i-15-no1-objects-delete');
            await closeTopWin();
            out.after = await readAll('16-after');
            // "Publish Issue": No 3 with a stored URN
            out.pubNo3 = await publishIssue('A', 3, 'i-17-publish-no3-stored');
            // No 2 with the box as it arrives (q20)
            out.pubNo2 = await publishIssue('A', 2, 'i-18-publish-no2-box');
            await openIssueEdit('A', 2, 'i-19-no2-back-edit', 'back');
            out.no2After = await openIdTab('i-20-no2-identifiers-after-publish');
            await closeTopWin();
            out.no2Page = await issuePage('A', 2, 'i-21-no2-issue-page');
            // No 1 with the box unticked
            out.pubNo1 = await publishIssue('A', 1, 'i-22-publish-no1-unticked', {urnBox: false});
            await openIssueEdit('A', 1, 'i-23-no1-back-edit', 'back');
            out.no1After = await openIdTab('i-24-no1-identifiers-after-publish');
            await closeTopWin();
            out.no1Page = await issuePage('A', 1, 'i-25-no1-issue-page');
            fact('issue', out);
        }

        // ================================================================ OJS q12 (Rule 15's first sentence)
        if (isOJS && on('q12')) {
            const out = {};
            await as('N');
            out.N = await openIssueEdit('N', 1, 'q-01-N-no-plugin-no-pid');
            out.Ntab = await openIdTab('q-02-N-tab');
            await closeTopWin();
            await as('P');
            out.P = await openIssueEdit('P', 1, 'q-03-P-pid-issue-only');
            out.Ptab = await openIdTab('q-04-P-tab');
            await closeTopWin();
            await as('B');
            out.B = await openIssueEdit('B', 1, 'q-05-B-articles-only');
            out.Btab = await openIdTab('q-06-B-tab');
            await closeTopWin();
            out.tickIssues = await urnSettings('B', 'q-07-B-tick-issues', async (f) => { await f.locator('input[name="enableIssueURN"]').check(); });
            out.B2 = await openIssueEdit('B', 1, 'q-08-B-issues-ticked');
            out.B2tab = await openIdTab('q-09-B-tab-issues-ticked');
            await closeTopWin();
            // E: Issues + Galleys (Articles unticked)
            await as('E');
            out.E = await openIssueEdit('E', 1, 'q-10-E-issues-galleys');
            out.Etab = await openIdTab('q-11-E-tab');
            await closeTopWin();
            fact('q12', out);
        }

        // ================================================================ OJS cus (Rule 12 third state, q23, A1)
        if (isOJS && on('cus')) {
            const out = {};
            await as('C');
            await openGalleyEdit('C', '1', 'c-01-c1-galley-window');
            out.c1Empty = await openIdTab('c-02-c1-tab-individual-empty');
            await loc(page, 'galley window › "Identifiers": "URN Suffix" box', idForm().locator('input[name="urnSuffix"]'));
            await loc(page, 'galley window › "Identifiers": "Add Check Number"', idForm().getByRole('button', {name: 'Add Check Number'}));
            // sweep: "Add Check Number" with the box empty, then with "g1"
            await idForm().getByRole('button', {name: 'Add Check Number'}).click().catch(() => {});
            await sleep(400);
            out.checkEmpty = await idForm().locator('input[name="urnSuffix"]').inputValue().catch(() => null);
            await idForm().locator('input[name="urnSuffix"]').fill('g1');
            await idForm().getByRole('button', {name: 'Add Check Number'}).click().catch(() => {});
            await sleep(400);
            out.checkG1 = await idForm().locator('input[name="urnSuffix"]').inputValue().catch(() => null);
            await snap('c-03-c1-add-check-number', {checkEmpty: out.checkEmpty, checkG1: out.checkG1});
            // q23: "g1", Save; reopen; Save again
            out.q23Save1 = await saveTab({suffix: 'g1'}, 'c-04-c1-save-g1');
            if (out.q23Save1.windowsAfter >= out.q23Save1.windowsBefore) await closeTopWin();
            await openGalleyEdit('C', '1');
            out.c1AfterSuffix = await openIdTab('c-05-c1-reopened-after-suffix');
            out.q23Save2 = await saveTab({}, 'c-06-c1-save-again');
            if (out.q23Save2.windowsAfter >= out.q23Save2.windowsBefore) await closeTopWin();
            await openGalleyEdit('C', '1');
            out.c1Stored = await openIdTab('c-07-c1-reopened-stored');
            await closeTopWin();
            // A1: c2 takes "g1" (c1 has it stored), then "g2"
            await openGalleyEdit('C', '2');
            await openIdTab('c-08-c2-tab');
            out.dupSave = await saveTab({suffix: 'g1'}, 'c-09-c2-save-dup-g1');
            if (out.dupSave.windowsAfter >= out.dupSave.windowsBefore) await closeTopWin();
            await openGalleyEdit('C', '2');
            out.c2AfterDup = await openIdTab('c-10-c2-reopened-after-dup');
            out.dupSave2 = await saveTab({suffix: 'g1', assign: true}, 'c-11-c2-save-dup-g1-with-box');
            if (out.dupSave2.windowsAfter >= out.dupSave2.windowsBefore) await closeTopWin();
            await openGalleyEdit('C', '2');
            out.c2AfterDup2 = await openIdTab('c-12-c2-reopened-after-dup2');
            out.okSave = await saveTab({suffix: 'g2'}, 'c-13-c2-save-g2');
            if (out.okSave.windowsAfter >= out.okSave.windowsBefore) await closeTopWin();
            await openGalleyEdit('C', '2');
            out.c2AfterG2 = await openIdTab('c-14-c2-reopened-after-g2');
            await closeTopWin();
            // the issue tab, individual
            await openIssueEdit('C', 1, 'c-15-issue-edit');
            out.issueTab = await openIdTab('c-16-issue-tab-individual');
            await closeTopWin();
            // "Publish Issue" with no suffix
            out.publish = await publishIssue('C', 1, 'c-17-publish-no-suffix');
            await openIssueEdit('C', 1, 'c-18-issue-back-edit', 'back');
            out.issueAfter = await openIdTab('c-19-issue-tab-after-publish');
            await closeTopWin();
            // D: Check Number off
            await as('D');
            await openGalleyEdit('D', '1', 'c-20-d1-galley-window');
            out.d1 = await openIdTab('c-21-d1-tab-no-check-number');
            await closeTopWin();
            fact('cus', out);
        }

        // ================================================================ OJS unres (E: the unresolved issue URN)
        if (isOJS && on('unres')) {
            const out = {};
            await as('E');
            await openIssueEdit('E', 1, 'u-01-E-issue-edit');
            out.tab = await openIdTab('u-02-E-issue-tab-unresolved');
            await closeTopWin();
            await openGalleyEdit('E', '1', 'u-03-E-galley-window');
            out.galley = await openIdTab('u-04-E-galley-tab');
            await closeTopWin();
            out.publish = await publishIssue('E', 1, 'u-05-E-publish-unresolved');
            await openIssueEdit('E', 1, 'u-06-E-back-edit', 'back');
            out.after = await openIdTab('u-07-E-tab-after-publish');
            await closeTopWin();
            fact('unres', out);
        }

        // ================================================================ OJS reader (OMP2/OMP3's journal side: the article page's URN block)
        // B's Vol 1 No 1 is published on screen, which publishes the scheduled b1 (URN stored) with it.
        if (isOJS && on('reader')) {
            await as('B');
            const out = {};
            out.publish = await publishIssue('B', 1, 'r-01-B-publish-no1');
            await page.goto(cUrl(S.B.path, `/article/view/${S.B.subs['1'].id}`));
            await idle(page);
            out.article = await page.evaluate(() => {
                const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
                return {
                    urnBlocks: [...document.querySelectorAll('.item')].filter((e) => /URN/.test(e.innerText)).map((e) => ({cls: e.className, text: t(e), html: e.innerHTML.replace(/\s+/g, ' ').slice(0, 400)})),
                    urnLinks: [...document.querySelectorAll('a[href*="urn:"]')].map((a) => ({text: t(a), href: a.getAttribute('href')})),
                };
            });
            await snap('r-02-B-b1-article-page', {article: out.article});
            fact('reader', out);
        }

        // ================================================================ OMP press (Rules 12–14 on chapter, format, file)
        if (isOMP && on('press')) {
            await as('MA');
            const out = {};
            if (!S.MA.built) {
                await addChapters('MA', '1', PRESS.chapter);
                out.setup = await addFormats('MA', '1');
                S.MA.built = true;
                save();
            }
            for (const [kind, i] of [['chapter', 0], ['format', 0], ['file', 0]]) {
                const w = await openPressEdit('MA', '1', kind, i, `p-01-${kind}-window`);
                out[`${kind}Tabs`] = w.tabs;
                out[`${kind}Preview`] = await openIdTab(`p-02-${kind}-tab-preview`);
                await closeTopWin();
            }
            // leave the chapter window changed and unsaved
            await openPressEdit('MA', '1', 'chapter', 0);
            await openIdTab(null);
            const t0 = Date.now();
            await idForm().locator('input[name="publisherId"]').fill('pid-unsaved').catch(() => {});
            await idForm().locator('input[name="assignURN"]').uncheck().catch(() => {});
            await idForm().locator('input[name="publisherId"]').blur().catch(() => {});
            await closeTopWin();
            out.leave = {jsDialogs: dialogsSince(t0), windowsAfter: await winCount(), posts: postsSince(t0)};
            await snap('p-03-chapter-after-close', {leave: out.leave});
            await openPressEdit('MA', '1', 'chapter', 0);
            out.chapterAfterLeave = await openIdTab('p-04-chapter-reopened-after-leave');
            // Rule 13: a Publisher ID + Save with the box as it arrives (chapter one); the box unticked (chapter two)
            out.ch1Save = await saveTab({publisherId: 'pid-c3'}, 'p-05-chapter1-save-pid');
            if (out.ch1Save.windowsAfter >= out.ch1Save.windowsBefore) await closeTopWin();
            await openPressEdit('MA', '1', 'chapter', 0);
            out.ch1Stored = await openIdTab('p-06-chapter1-reopened');
            await closeTopWin();
            await openPressEdit('MA', '1', 'chapter', 1);
            await openIdTab('p-07-chapter2-tab');
            out.ch2Save = await saveTab({publisherId: 'pid-c4', assign: false}, 'p-08-chapter2-save-unticked');
            if (out.ch2Save.windowsAfter >= out.ch2Save.windowsBefore) await closeTopWin();
            await openPressEdit('MA', '1', 'chapter', 1);
            out.ch2After = await openIdTab('p-09-chapter2-reopened');
            await closeTopWin();
            // format PDF and the file: Save with the box
            for (const kind of ['format', 'file']) {
                await openPressEdit('MA', '1', kind, 0);
                await openIdTab(null);
                out[`${kind}Save`] = await saveTab({}, `p-10-${kind}-save`);
                if (out[`${kind}Save`].windowsAfter >= out[`${kind}Save`].windowsBefore) await closeTopWin();
                await openPressEdit('MA', '1', kind, 0);
                out[`${kind}Stored`] = await openIdTab(`p-11-${kind}-reopened-stored`);
                await closeTopWin();
            }
            // Rule 14 on the chapter: Clear › Cancel, › Delete
            await openPressEdit('MA', '1', 'chapter', 0);
            await openIdTab(null);
            out.clearCancel = await clearOnTab('Clear', 'Cancel', 'p-12-chapter1-clear-cancel');
            out.clearDelete = await clearOnTab('Clear', 'Delete', 'p-13-chapter1-clear-delete');
            await closeTopWin();
            await openPressEdit('MA', '1', 'chapter', 0);
            out.ch1AfterClear = await openIdTab('p-14-chapter1-reopened-after-clear');
            await closeTopWin();
            fact('press', out);
        }

        // ================================================================ OMP mpub (the format's approval, publishing, the book page)
        if (isOMP && on('mpub')) {
            await as('MA');
            const out = {};
            out.monoUrn = await idPage('MA', '1', 'm-01-idpage-assign', {act: 'assign'});
            // the EPUB format's approval window (its URN not stored): record, then approve
            const approve = async (label, name) => {
                await pressGo('MA', '1', 'publicationFormats');
                const row = await formatRow(label);
                await row.waitFor({timeout: 20000});
                const links = await row.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                const a = row.getByRole('link', {name: /Awaiting Approval|Incomplete|Approve/}).first();
                const r = {rowLinks: links, offered: (await a.count()) > 0};
                if (!r.offered) { await snap(name, r); return r; }
                await loc(page, `Publication Formats: the format row's approval link (${label})`, a);
                const n0 = await winCount();
                await a.click();
                await page.waitForFunction((n) => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length > n, n0, {timeout: 20000}).catch(() => {});
                await idle(page);
                await sleep(800);
                const w = topWin(page);
                r.window = await w.evaluate((el) => {
                    const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
                    return {text: t(el), inputs: [...el.querySelectorAll('input, button')].filter((i) => i.type !== 'hidden').map((i) => { const l = i.id ? el.querySelector(`label[for="${i.id}"]`) : null; return {type: i.type, name: i.name, checked: i.checked, labelRaw: l ? l.textContent : null, text: i.tagName === 'BUTTON' ? t(i) : undefined}; })};
                });
                await snap(`${name}-window`, {approve: r});
                const t0 = Date.now();
                const ok = w.getByRole('button', {name: /^(OK|Save|Approve|Yes)$/}).first();
                const resp = page.waitForResponse((x) => /set-approved|setApproved/i.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
                await ok.click();
                const x = await resp;
                await idle(page);
                await sleep(1000);
                r.ok = {status: x ? x.status() : null, posts: postsSince(t0)};
                await snap(name, {approve: r});
                return r;
            };
            out.approveEpub = await approve('EPUB', 'm-02-approve-epub');
            await openPressEdit('MA', '1', 'format', 1);
            out.epubAfterApprove = await openIdTab('m-03-epub-tab-after-approve');
            await closeTopWin();
            out.approvePdf = await approve('PDF', 'm-04-approve-pdf');
            // availability of PDF
            await pressGo('MA', '1', 'publicationFormats');
            const row = await formatRow('PDF');
            const avail = row.getByRole('link', {name: /Not Available/}).first();
            out.availOffered = (await avail.count()) > 0;
            if (out.availOffered) {
                await avail.click();
                const q = page.locator(vis).last();
                await sleep(800);
                out.availQuestion = flat(await q.innerText().catch(() => null), 400);
                const t0 = Date.now();
                const resp = page.waitForResponse((x) => /set-available|setAvailable/i.test(x.url()), {timeout: T}).catch(() => null);
                await q.getByRole('button', {name: /^(OK|Yes|Confirm)$/}).first().click().catch(() => {});
                const x = await resp;
                await idle(page);
                await sleep(800);
                out.avail = {status: x ? x.status() : null, posts: postsSince(t0)};
            }
            out.formatsGrid = await wf(page).locator('tr').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            await snap('m-05-formats-after-approval', {grid: out.formatsGrid});
            // publish: the table with every kind (OMP4 end: all four)
            out.publish = await publishOMP('MA', '1', 'm-06-publish');
            await openPressEdit('MA', '1', 'chapter', 1);
            out.ch2AfterPublish = await openIdTab('m-07-chapter2-after-publish');
            await closeTopWin();
            out.book = await bookPage('MA', '1', 'm-08-book-page');
            fact('mpub', out);
        }

        // ================================================================ OMP mb (Monographs only: OMP4; requirements unmet)
        if (isOMP && on('mb')) {
            await as('MB');
            const out = {};
            out.mb1Urn = await idPage('MB', '1', 'b-01-mb1-idpage-assign', {act: 'assign'});
            out.mb1Window = await publishOMP('MB', '1', 'b-02-mb1-publish');
            out.mb1After = await idPage('MB', '1', 'b-03-mb1-idpage-after');
            out.mb2Window = await publishOMP('MB', '2', 'b-04-mb2-publish');
            out.mb2After = await idPage('MB', '2', 'b-05-mb2-idpage-after');
            if (S.MB.subs['3']) out.mb3Window = await publishOMP('MB', '3', 'b-06-mb3-declined', {go: false});
            else out.mb3 = S.MB.declineError;
            fact('mb', out);
        }

        // ================================================================ OMP mcus (individual suffix on a chapter; A1)
        if (isOMP && on('mcus')) {
            await as('MC');
            const out = {};
            if (!S.MC.built) { await addChapters('MC', '1', PRESS.chapter); S.MC.built = true; save(); }
            await openPressEdit('MC', '1', 'chapter', 0, 'mc-01-chapter1-window');
            out.ch1Empty = await openIdTab('mc-02-chapter1-tab-individual');
            out.save1 = await saveTab({suffix: 'c1'}, 'mc-03-chapter1-save-c1');
            if (out.save1.windowsAfter >= out.save1.windowsBefore) await closeTopWin();
            await openPressEdit('MC', '1', 'chapter', 0);
            out.ch1AfterSuffix = await openIdTab('mc-04-chapter1-reopened');
            out.save2 = await saveTab({}, 'mc-05-chapter1-save-again');
            if (out.save2.windowsAfter >= out.save2.windowsBefore) await closeTopWin();
            await openPressEdit('MC', '1', 'chapter', 0);
            out.ch1Stored = await openIdTab('mc-06-chapter1-stored');
            await closeTopWin();
            await openPressEdit('MC', '1', 'chapter', 1);
            await openIdTab('mc-07-chapter2-tab');
            out.dup = await saveTab({suffix: 'c1'}, 'mc-08-chapter2-save-dup');
            if (out.dup.windowsAfter >= out.dup.windowsBefore) await closeTopWin();
            await openPressEdit('MC', '1', 'chapter', 1);
            out.ch2AfterDup = await openIdTab('mc-09-chapter2-reopened');
            await closeTopWin();
            fact('mcus', out);
        }

        // ================================================================ OMP mnan ("Add Check Number" on a chapter tab, box empty then "c9"; sweep)
        if (isOMP && on('mnan')) {
            await as('MC');
            const out = {};
            await openPressEdit('MC', '1', 'chapter', 1);
            await openIdTab(null);
            const sfx = idForm().locator('input[name="urnSuffix"]');
            await sfx.fill('');
            await idForm().getByRole('button', {name: 'Add Check Number'}).click();
            await sleep(400);
            out.empty = await sfx.inputValue();
            await sfx.fill('c9');
            await idForm().getByRole('button', {name: 'Add Check Number'}).click();
            await sleep(400);
            out.c9 = await sfx.inputValue();
            await snap('mc-10-chapter2-add-check-number', {checkNumber: out});
            await closeTopWin();
            fact('mnan', out);
        }

        // ================================================================ OMP munres (own chapter pattern with %x: a piece missing)
        if (isOMP && on('munres')) {
            await as('MD');
            const out = {};
            if (!S.MD.built) { await addChapters('MD', '1', PRESS.chapter.slice(0, 1)); S.MD.built = true; save(); }
            await openPressEdit('MD', '1', 'chapter', 0, 'md-01-chapter-window');
            out.ch = await openIdTab('md-02-chapter-tab-unresolved');
            await closeTopWin();
            fact('munres', out);
        }

        // ================================================================ controls: the Issues address on a press / preprint server
        if ((isOMP || isOPS) && on('ctl')) {
            const out = {};
            const k = isOMP ? 'MB' : 'X';
            await as(k);
            const r = await page.goto(cUrl(S[k].path, '/manageIssues'));
            await idle(page);
            out.manageIssues = {status: r ? r.status() : null, url: page.url()};
            await snap('x-01-manageIssues-address', out);
            if (isOPS) {
                await openGalleyEdit('X', '1', 'x-02-ops-galley-window');
                out.galleyTab = await openIdTab('x-03-ops-galley-tab');
                await closeTopWin();
                // the "Post" window
                const c = S.X, sub = c.subs['1'];
                await openWf(c.path, sub.id, `publication_${sub.pub}_titleAbstract`);
                const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Post|Publish)$/});
                await button.waitFor({timeout: T});
                await button.click();
                const win = page.getByRole('dialog', {name: /Post|Publish/}).last();
                await win.waitFor({timeout: T});
                await idle(page);
                await sleep(800);
                out.postWindow = await readPublishWindow(win);
                await snap('x-04-ops-post-window', {publishWindow: out.postWindow});
                await win.getByRole('button', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            }
            fact('ctl', out);
        }
    } catch (e) {
        log('ERROR', e.stack || e.message);
        await snap('error-state', {error: String(e.stack || e.message).slice(0, 1500)}).catch(() => {});
        record('k3-error', {error: String(e.stack || e.message)}, {merge: true});
    } finally {
        record('k3-js-dialogs', {dialogs: jsDialogs});
        await close();
    }
});
