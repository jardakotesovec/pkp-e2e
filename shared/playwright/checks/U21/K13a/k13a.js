// U21 claim check, housekeeping chunk K13a (2026-11-13): incidentals row for U21 (Rule 6, Rule 10 and fn-f, fn-j).
// Does an unfinished draft reopen at the step "Save for Later" was pressed on, or at the furthest step reached?
// As the Author of seeded drafts (and the scratch Journal Manager for one) on a scratch context per run:
//   same      reach "Contributors", header "Save for Later" there (the furthest step reached = the step saved from);
//             reopened also by a reload of the wizard opened at the recorded step, and by the mail's link
//   earlier   reach "Review", rail back to "Details", footer "Save for Later" there; then, in a second visit opened at
//             the recorded step, rail back to "Upload Files" and the header "Save for Later" (earlier2)
//   back      reach "For the Editors"/"For Readers", footer "Back" to "Details", a new Title typed and the footer
//             "Save for Later" pressed at once (the save in flight is finished first?)
//   never     reach "Contributors" by "Continue" only, leave for My Submissions without "Save for Later"
//   hash      the "same" draft (recorded "Contributors") opened by its wizard address carrying "#details" (a bookmark
//             taken from the address bar), then the header "Save for Later" there, then reopened bare
//   fail      reach "Details", footer "Save for Later" with its …/saveForLater request aborted once by a Playwright
//             route (a dropped-connection stand-in; the server never sees it), then reopened bare
//   manager   the scratch Journal Manager opens the author's draft by its address, reaches "Details", header "Save for
//             Later": the screen's note and the mail; then the author reopens it from My Submissions
//   submitted a seeded submitted submission's wizard address, as its Author
// Every reopen is read from My Submissions' "Complete submission", from the bare wizard address, and (same) from the
// Saved for Later screen's link; each Saved for Later screen is read on landing and after a reload.
//
//   PROBE_FEATURE=U21 PROBE_AGENT=ccK13a PROBE_RUN=r1 PROBE_NOTES_FEATURE=U21 node bin/probe.js all shared/playwright/checks/U21/K13a/k13a.js
//   (then PROBE_RUN=r2 for the second run). VARIANTS narrows (comma list). No other script or file; each run seeds its
//   own scratch context (tag prefix u21ccK13a); publicknowledge is never touched. Run on demand, never in CI.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} = require('../../../probe');
const {waitForEditorReady} = require('../../../support/richtext.js');

const RUN = process.env.PROBE_RUN || 'r1';
const T = 30_000;
const TITLE_ID = 'titleAbstract-title-control-en';
const log = (...a) => console.log(`[k13a ${RUN}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const endAnchored = (name) => new RegExp(`${esc(name)}\\s*$`);
const ALL = ['same', 'earlier', 'back', 'never', 'hash', 'fail', 'manager', 'submitted'];

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const VARIANTS = (process.env.VARIANTS ? process.env.VARIANTS.split(',') : ALL).filter((v) => ALL.includes(v));
    const fact = (name, data) => record(`facts-${name}`, data, {merge: true});
    const t = tag('u21ccK13a');
    const body = {tag: t, context: {name: `U21 K13a ${t}`, contactName: 'K13a Contact', contactEmail: `${t}c@mail.test`},
        users: [{username: `${t}mg`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}]};
    if (isOJS) body.sections = [{abbrev: 'ART', title: 'Articles'}];
    if (isOPS) body.sections = [{abbrev: 'PRE', title: 'Preprints', path: 'preprints'}];
    const C = await app.api.createContext(body);
    const ctx = C.path || t;
    const author = `${t}au`;
    const manager = `${t}mg`;
    const editorsStep = isOPS ? 'For Readers' : 'For the Editors';
    const seed = async (k, extra = {}) => {
        const spec = {tag: `${t}${k}`, context: ctx, submitter: author, title: `K13a ${k} draft ${t}`, submitted: false, ...extra};
        const D = isOPS ? await app.api.createSubmission({...spec, galleys: [{label: 'PDF', file: 'preprint.pdf'}]})
            : await app.api.createSubmission({...spec, files: [{file: 'article.pdf'}]});
        return {id: D.submissionId, title: spec.title};
    };
    fact('context', {ctx, run: RUN, author, manager});

    const wizardUrl = (id, hash = '') => app.url(`/index.php/${ctx}/submission?id=${id}${hash}`);
    const mySubsUrl = () => app.url(`/index.php/${ctx}/dashboard/mySubmissions`);

    async function session(user) {
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', async (d) => {
            dialogs.push({at: new Date().toISOString(), type: d.type(), message: flat(d.message(), 300)});
            if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
        });
        const sfl = [];
        page.on('request', (r) => {
            if (/\/saveForLater$/.test(r.url().split('?')[0])) sfl.push({at: new Date().toISOString(), method: r.method(), override: r.headers()['x-http-method-override'], post: flat(r.postData(), 200)});
        });
        page.on('response', (r) => {
            if (/\/saveForLater$/.test(r.url().split('?')[0])) sfl.push({at: new Date().toISOString(), status: r.status()});
        });
        await signIn(page, user, {contextPath: ctx});
        await idle(page).catch(() => {});
        return {page, close, dialogs, sfl};
    }

    async function drive(S, v) {
        const {page, dialogs, sfl} = S;
        const o = {variant: v, app: app.name, run: RUN};
        let n = 0;
        const snap = async (name, extra) => {
            let s;
            try { s = await screen(page); } catch (e) { s = {url: page.url(), error: flat(e.message, 300), text: {}}; }
            if (extra) s.facts = extra;
            const id = `${RUN}-${v}-${String(++n).padStart(2, '0')}-${name}`;
            record(id, s);
            await shot(page, id).catch(() => {});
            return id;
        };
        const cur = () => page.locator('.pkpSteps__step__label--current');
        const curText = async () => flat(await cur().innerText().catch(() => ''), 80);
        const curName = async () => (await curText()).replace(/^\d+\s*/, '');
        const rail = () => page.locator('.pkpSteps__step__label').evaluateAll((els) => els.map((e) => ({tag: e.tagName.toLowerCase(), text: e.textContent.replace(/\s+/g, ' ').trim(), current: e.classList.contains('pkpSteps__step__label--current')})));
        const footer = () => page.locator('.submissionWizard__footer');
        async function wizardLoaded() {
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page).catch(() => {});
            await sleep(500);
            return {step: await curName(), url: page.url().replace(/^https?:\/\/[^/]+/, ''), title: await page.title(), rail: await rail()};
        }
        async function openBare(id, hash = '') {
            await page.goto(wizardUrl(id, hash));
            return wizardLoaded();
        }
        async function nextStepName() {
            const labels = (await page.locator('.pkpSteps__step__label').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
            const c = await curText();
            const k = labels.findIndex((l) => l === c);
            return k >= 0 && labels[k + 1] ? labels[k + 1].replace(/^\d+\s*/, '') : null;
        }
        async function pressContinue() {
            const next = await nextStepName();
            await footer().getByRole('button', {name: 'Continue', exact: true}).click({timeout: 10000});
            if (next) await cur().filter({hasText: endAnchored(next)}).waitFor({timeout: 10000}).catch(() => {});
            await idle(page).catch(() => {});
            return next;
        }
        async function continueUntil(label) {
            for (let i = 0; i < 8 && !endAnchored(label).test(await curText()); i++) await pressContinue();
            await idle(page).catch(() => {});
            return curName();
        }
        async function railTo(label) {
            for (let attempt = 0; attempt < 3; attempt++) {
                if (await page.locator('.pkpSteps--collapsed').count()) await page.locator('.pkpSteps__controls button').click().catch(() => {});
                await page.locator('button.pkpSteps__step__label').filter({hasText: endAnchored(label)}).first().click();
                try { await cur().filter({hasText: endAnchored(label)}).waitFor({timeout: 5000}); await idle(page).catch(() => {}); return; } catch (e) { if (attempt === 2) throw e; }
            }
        }
        async function sflButtons() {
            const all = page.getByRole('button', {name: 'Save for Later', exact: true});
            const where = await all.evaluateAll((els) => els.map((e) => ({inFooter: !!e.closest('.submissionWizard__footer'), disabled: e.disabled})));
            return {all, where};
        }
        async function pressSaveForLater(which) {
            const {all, where} = await sflButtons();
            o[`sflButtons_${n}`] = where;
            const idx = where.findIndex((w) => (which === 'footer' ? w.inFooter : !w.inFooter));
            if (idx < 0) throw new Error(`no ${which} Save for Later`);
            const before = sfl.length;
            await all.nth(idx).click();
            return before;
        }
        async function savedScreen(name) {
            await page.getByRole('heading', {name: 'Saved for Later'}).waitFor({timeout: 45_000});
            await idle(page).catch(() => {});
            const main = page.locator('main').first();
            const links = await main.locator('a').evaluateAll((els) => els.map((a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')})));
            const r = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), links, buttons: await main.getByRole('button').allInnerTexts().catch(() => [])};
            r.snap = await snap(name, r);
            await page.reload();
            await idle(page).catch(() => {});
            r.afterReload = {heading: await page.getByRole('heading', {name: 'Saved for Later'}).count(), snap: await snap(`${name}-reload`)};
            return r;
        }
        async function fromMySubmissions(sub, name) {
            await page.goto(mySubsUrl());
            await idle(page).catch(() => {});
            let row = page.getByRole('row').filter({hasText: sub.title});
            try { await row.first().waitFor({timeout: 15000}); } catch (e) {
                const box = page.getByRole('searchbox', {name: /Search submissions, ID/}).or(page.getByRole('textbox', {name: /Search submissions, ID/})).first();
                await box.fill(`${t}`); await box.press('Enter'); await idle(page).catch(() => {});
                row = page.getByRole('row').filter({hasText: sub.title});
                await row.first().waitFor({timeout: 15000});
            }
            const r = {rowText: flat(await row.first().innerText(), 300), heading: flat(await page.locator('main h1, main h2').first().innerText().catch(() => null), 120)};
            r.snapList = await snap(`${name}-mysubs`, r);
            const btn = row.first().getByRole('button', {name: 'Complete submission', exact: true});
            await loc(page, 'My Submissions draft row "Complete submission"', btn);
            await btn.click();
            await page.waitForURL(/\/submission\?id=/, {timeout: T});
            r.reopen = await wizardLoaded();
            r.snap = await snap(`${name}-reopen`, r.reopen);
            return r;
        }
        async function typeTitle(text) {
            await page.locator(`#${TITLE_ID}_ifr`).waitFor({state: 'visible', timeout: T});
            await waitForEditorReady(page, TITLE_ID);
            await page.frameLocator(`#${TITLE_ID}_ifr`).locator('body').click();
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Delete');
            await page.keyboard.type(text);
        }
        const titleValue = () => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent({format: 'text'}) : null), TITLE_ID).catch(() => null);

        const since = new Date(Date.now() - 1000);
        const dlg0 = dialogs.length;
        const sfl0 = sfl.length;
        try {
            if (v === 'same') {
                const D = S.D1 = await seed('same');
                o.id = D.id;
                o.open = await openBare(D.id);
                await snap('open', o.open);
                o.reached = await continueUntil('Contributors');
                o.beforeSave = {rail: await rail(), url: page.url().replace(/^https?:\/\/[^/]+/, '')};
                await snap('contributors', o.beforeSave);
                await loc(page, 'wizard header "Save for Later" (outside the footer)', page.getByRole('button', {name: 'Save for Later', exact: true}));
                await pressSaveForLater('header');
                o.saved = await savedScreen('saved');
                try {
                    const m = await app.mail.find({to: `${author}@mail.test`, since, timeoutMs: 20000});
                    const full = await app.mail.fullMessage(m.ID).catch(() => null);
                    o.mail = {subject: m.Subject, to: (m.To || []).map((x) => x.Address), links: full ? ((full.Text || '').match(/https?:\/\/\S+/g) || []) : null};
                } catch (e) { o.mail = {error: flat(e.message, 200)}; }
                o.mailToManager = await app.mail.count({to: `${manager}@mail.test`, since}).catch((e) => String(e.message));
                o.mySubs = await fromMySubmissions(D, 'same');
                o.bare = await openBare(D.id);
                await snap('bare', o.bare);
                // a reload of the wizard opened at the recorded step (its address now ends in "#contributors")
                await page.reload();
                o.bareReload = await wizardLoaded();
                await snap('bare-reload', o.bareReload);
                const link = (o.saved.links || []).find((l) => l.href && /submission\?id=/.test(l.href));
                if (link) {
                    await page.goto(link.href.startsWith('http') ? link.href : app.url(link.href));
                    o.savedLink = await wizardLoaded();
                    await snap('savedlink', o.savedLink);
                }
                if (o.mail && o.mail.links) {
                    const ml = o.mail.links.find((l) => /submission\?id=/.test(l));
                    if (ml) {
                        const u = new URL(ml.replace(/[)>.,]+$/, ''));
                        await page.goto(app.url(u.pathname + u.search + u.hash));
                        o.mailLink = await wizardLoaded();
                        await snap('maillink', o.mailLink);
                    }
                }
            } else if (v === 'earlier') {
                const D = await seed('earlier');
                o.id = D.id;
                o.open = await openBare(D.id);
                await snap('open', o.open);
                o.reached = await continueUntil('Review');
                await snap('review', {rail: await rail()});
                await railTo('Details');
                o.beforeSave = {step: await curName(), rail: await rail(), url: page.url().replace(/^https?:\/\/[^/]+/, '')};
                await snap('details', o.beforeSave);
                await pressSaveForLater('footer');
                o.saved = await savedScreen('saved');
                o.mySubs = await fromMySubmissions(D, 'earlier');
                o.bare = await openBare(D.id);
                await snap('bare', o.bare);
                // second visit: opened at the recorded step, rail back to Upload Files, header Save for Later
                await railTo('Upload Files');
                o.second = {beforeSave: {step: await curName(), rail: await rail()}};
                await snap('second-files', o.second.beforeSave);
                await pressSaveForLater('header');
                o.second.saved = await savedScreen('second-saved');
                o.second.mySubs = await fromMySubmissions(D, 'earlier2');
                o.second.bare = await openBare(D.id);
                await snap('second-bare', o.second.bare);
            } else if (v === 'back') {
                const D = await seed('back');
                o.id = D.id;
                o.open = await openBare(D.id);
                await snap('open', o.open);
                o.reached = await continueUntil(editorsStep);
                await footer().getByRole('button', {name: 'Back', exact: true}).click();
                await cur().filter({hasText: endAnchored('Contributors')}).waitFor({timeout: 10000}).catch(() => {});
                await footer().getByRole('button', {name: 'Back', exact: true}).click();
                await cur().filter({hasText: endAnchored('Details')}).waitFor({timeout: 10000});
                await idle(page).catch(() => {});
                const NEW = `K13a back retitled ${t}`;
                o.newTitle = NEW;
                await typeTitle(NEW);
                o.beforeSave = {step: await curName(), rail: await rail(), footer: flat(await page.locator('.submissionWizard__lastSaved').innerText().catch(() => null), 120)};
                await snap('details-typed', o.beforeSave);
                const tPress = Date.now();
                await pressSaveForLater('footer');
                o.saved = await savedScreen('saved');
                o.saved.pressToLandMs = null;
                o.saved.linkHasNewTitle = (o.saved.links || []).some((l) => l.text.includes(NEW));
                o.mySubs = await fromMySubmissions({...D, title: NEW}, 'back').catch(async (e) => ({error: flat(e.message, 200), fallback: await fromMySubmissions(D, 'back-old').catch((x) => ({error: flat(x.message, 200)}))}));
                o.bare = await openBare(D.id);
                await snap('bare', o.bare);
                if (await page.locator('button.pkpSteps__step__label').filter({hasText: endAnchored('Details')}).count()) {
                    await railTo('Details');
                    await waitForEditorReady(page, TITLE_ID).catch(() => {});
                    o.titleAfterReopen = await titleValue();
                    await snap('bare-details', {title: o.titleAfterReopen});
                }
                o.tPress = tPress;
            } else if (v === 'never') {
                const D = await seed('never');
                o.id = D.id;
                o.open = await openBare(D.id);
                await snap('open', o.open);
                o.reached = await continueUntil('Contributors');
                await snap('contributors', {rail: await rail()});
                await railTo('Details');
                await typeTitle(`K13a never unsaved title ${t}`);
                await snap('details-typed-unsaved', {rail: await rail()});
                o.mySubs = await fromMySubmissions(D, 'never');
                o.bare = await openBare(D.id);
                await snap('bare', o.bare);
                await waitForEditorReady(page, TITLE_ID).catch(() => {});
            } else if (v === 'hash') {
                const D = S.D1;
                if (!D) throw new Error('hash needs same first');
                o.id = D.id;
                await page.goto(mySubsUrl());
                await idle(page).catch(() => {});
                o.hashOpen = await openBare(D.id, '#details');
                await snap('hash-details', o.hashOpen);
                o.reload = await (async () => { await page.reload(); return wizardLoaded(); })();
                await snap('hash-reload', o.reload);
                o.hashReview = await (async () => { await page.goto(mySubsUrl()); await idle(page).catch(() => {}); return openBare(D.id, '#review'); })();
                await snap('hash-review', o.hashReview);
                await pressSaveForLater('header');
                o.saved = await savedScreen('saved');
                o.mySubs = await fromMySubmissions(D, 'hash');
                o.bare = await openBare(D.id);
                await snap('bare', o.bare);
            } else if (v === 'fail') {
                const D = await seed('fail');
                o.id = D.id;
                o.open = await openBare(D.id);
                await snap('open', o.open);
                o.reached = await continueUntil('Details');
                let used = false;
                await page.route((url) => /\/saveForLater$/.test(url.pathname), async (route) => {
                    if (used) return route.continue();
                    used = true;
                    return route.abort('connectionreset');
                });
                await pressSaveForLater('footer');
                const dlg = page.getByRole('dialog').filter({hasText: /saved|connect/i});
                await dlg.first().waitFor({timeout: 20000}).catch(() => {});
                await sleep(500);
                o.failDialog = {count: await page.getByRole('dialog').count(), text: flat(await page.getByRole('dialog').first().innerText().catch(() => null), 400),
                    buttons: await page.getByRole('dialog').first().getByRole('button').allInnerTexts().catch(() => [])};
                await snap('fail-dialog', o.failDialog);
                await loc(page, 'Save for Later failure dialog', page.getByRole('dialog').first());
                const okBtn = page.getByRole('dialog').first().getByRole('button').first();
                if (await okBtn.count()) await okBtn.click().catch(() => {});
                await sleep(700);
                o.afterDialog = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), step: await curName(), sfl: await sflButtons().then((x) => x.where)};
                await snap('after-dialog', o.afterDialog);
                await page.unroute((url) => /\/saveForLater$/.test(url.pathname)).catch(() => {});
                await page.unrouteAll({behavior: 'ignoreErrors'}).catch(() => {});
                o.bare = await openBare(D.id);
                await snap('bare', o.bare);
            } else if (v === 'manager') {
                const D = await seed('manager');
                o.id = D.id;
                const M = await session(manager);
                try {
                    const mp = M.page;
                    S.mgrPage = mp;
                    await mp.goto(wizardUrl(D.id));
                    await mp.locator('.pkpSteps').waitFor({timeout: T});
                    await idle(mp).catch(() => {});
                    const curM = async () => flat(await mp.locator('.pkpSteps__step__label--current').innerText().catch(() => ''), 80).replace(/^\d+\s*/, '');
                    o.mgrOpen = {step: await curM()};
                    let s = await screen(mp); record(`${RUN}-manager-01-mgr-open`, s); await shot(mp, `${RUN}-manager-01-mgr-open`).catch(() => {});
                    await mp.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click();
                    await mp.locator('.pkpSteps__step__label--current').filter({hasText: endAnchored('Details')}).waitFor({timeout: 10000});
                    await idle(mp).catch(() => {});
                    const all = mp.getByRole('button', {name: 'Save for Later', exact: true});
                    const where = await all.evaluateAll((els) => els.map((e) => ({inFooter: !!e.closest('.submissionWizard__footer'), disabled: e.disabled})));
                    o.mgrSflButtons = where;
                    const mSince = new Date(Date.now() - 1000);
                    await all.nth(Math.max(0, where.findIndex((w) => !w.inFooter))).click();
                    await mp.getByRole('heading', {name: 'Saved for Later'}).waitFor({timeout: 45_000});
                    await idle(mp).catch(() => {});
                    const main = mp.locator('main').first();
                    o.mgrSaved = {url: mp.url().replace(/^https?:\/\/[^/]+/, ''), text: flat(await main.innerText(), 600),
                        links: await main.locator('a').evaluateAll((els) => els.map((a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')})))};
                    s = await screen(mp); s.facts = o.mgrSaved; record(`${RUN}-manager-02-mgr-saved`, s); await shot(mp, `${RUN}-manager-02-mgr-saved`).catch(() => {});
                    o.mgrMail = await app.mail.find({to: `${manager}@mail.test`, since: mSince, timeoutMs: 20000}).then((m) => ({subject: m.Subject, to: (m.To || []).map((x) => x.Address)})).catch((e) => ({error: flat(e.message, 200)}));
                    o.authorMailCount = await app.mail.count({to: `${author}@mail.test`, since: mSince}).catch((e) => String(e.message));
                    o.mgrDialogs = M.dialogs;
                    o.mgrSfl = M.sfl;
                } finally { await M.close(); }
                o.mySubs = await fromMySubmissions(D, 'manager');
            } else if (v === 'submitted') {
                const D = await seed('submitted', {submitted: true});
                o.id = D.id;
                await page.goto(wizardUrl(D.id));
                await idle(page).catch(() => {});
                o.screen = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), headings: await page.getByRole('heading').allInnerTexts().catch(() => []), steps: await page.locator('.pkpSteps').count()};
                await snap('complete', o.screen);
                await page.goto(wizardUrl(D.id, '#details'));
                await idle(page).catch(() => {});
                o.hashScreen = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), headings: await page.getByRole('heading').allInnerTexts().catch(() => []), steps: await page.locator('.pkpSteps').count()};
                await snap('complete-hash', o.hashScreen);
            }
        } catch (e) {
            o.error = flat(e.stack || e.message, 800);
            await snap('error').catch(() => {});
        }
        o.dialogs = dialogs.slice(dlg0);
        o.saveForLaterTraffic = sfl.slice(sfl0);
        fact(v, {[v]: o});
        log(app.name, v, o.error ? `ERROR ${o.error.slice(0, 200)}` : 'done');
        return o;
    }

    const S = await session(author);
    try {
        // "hash" reuses the "same" draft; run same first when hash is asked for
        const order = VARIANTS.includes('hash') && !VARIANTS.includes('same') ? ['same', ...VARIANTS] : VARIANTS;
        for (const v of order) await drive(S, v);
    } finally {
        await signOut(S.page).catch(() => {});
        await S.close();
    }
});
