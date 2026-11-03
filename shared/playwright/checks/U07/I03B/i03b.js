// U07 claim check, chunk I03B (housekeeping 2026-11-03): incidentals rows on OPS4's reach (the role
// invitation email on a French-primary context) and on U07's Fields paragraph (which language's
// boxes a multilingual Settings form opens on arrival, and what each language button does).
// Spec: docs/specs/U07-journal-identity-and-about-pages.md Fields (lines 79-87, notes f, td4),
// register OPS4 (note f-ops4); docs/specs/U06-user-invitations.md Side effects "On send" (note j).
//
// Runs on a DATASET fleet (PKP's default test dataset; docs/process/dataset.md), one app per call,
// each run under its own PROBE_RUN (r1, r2), each run making its own scratch context:
//   bin/app-lock.sh shared ojs -- env PROBE_RUN=r1 PROBE_FEATURE=issues-cc5 PROBE_NOTES_FEATURE=U07 \
//       PROBE_AGENT=ccI03B node bin/probe.js ojs shared/playwright/checks/U07/I03B/i03b.js
//   (then omp, ops; then PROBE_RUN=r2 for each app). PHASES=make,invite,fields,control,ops4 narrows
//   (default all five); a run without "make" reads the scratch context from the state file
//   outFile('i03b-state.json') a "make" phase of the same PROBE_RUN wrote.
// No other script; nothing else is read. Outputs: .reports/<PROBE_FEATURE>/ccI03B/, the facts in
// i03b-facts-<run>-<app>.json, snapshots i03b-<name>-<run>-<app>.json|png.
//
// Phases:
//   make     `admin`, Administration › Hosted Journals/Presses/Servers › "Create …": a scratch context
//            (tag u07i03b) with English and French (Canada), French primary; then its Settings ›
//            Website › Setup › Languages (screens in English, `/en/`), "Forms" ticked for English.
//   invite   `admin` (enrolled as the new context's manager), `/en/` Settings › Users & Roles ›
//            "Invite to a role": a new address, the Section editor / Series editor / Moderator role,
//            "Appear on the masthead"; the compose step's body; "Invite user to the role"; the email
//            in Mailpit (text and HTML), its role lines.
//   fields   `admin` on the scratch context under `/en/`: Settings › Journal (Press, Server) "Masthead"
//            and "Contact", Settings › Website › Setup › "Privacy Statement": which language's boxes
//            are open on arrival, each language button pressed (and again), a tab switch and back, a
//            reload; the French (primary) title emptied and saved, the English title emptied and saved
//            (then restored); an unsaved change left by a top tab and then by the side menu.
//   control  the dataset's `publicknowledge` (English primary, French a form language), read only:
//            `rvaca` (Journal manager) and `dbarnes` (Journal editor) under `/en/`, `rvaca` under
//            `/fr_CA/`: the same arrival / press / tab / reload reads, nothing saved.
//   ops4     register OPS4's own claims on `publicknowledge`, read only: signed out, "Editorial Masthead"
//            under `/fr_CA/` and `/en/` (headings, `##key##`); `rvaca` under `/fr_CA/`, Settings › Website ›
//            Appearance › "Entête" (the order list and its buttons) and Settings › Users & Roles.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const {forEachApp, launch, signIn, signOut, screen, shot, record, note, idle, tag, outFile} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const PHASES = (process.env.PHASES || 'make,invite,fields,control,ops4').split(',').map((s) => s.trim());
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');

const LABELS = {
    ojs: {hosted: 'Hosted Journals', role: 'Section editor', ctxTab: 'Journal'},
    omp: {hosted: 'Hosted Presses', role: 'Series editor', ctxTab: 'Press'},
    ops: {hosted: 'Hosted Servers', role: 'Moderator', ctxTab: 'Server'},
};

forEachApp(async (app) => {
    const L = LABELS[app.name];
    const log = (...a) => console.log(`[i03b ${RUN} ${app.name}]`, ...a);
    const fact = (k, v) => {
        record('i03b-facts', {[k]: v}, {merge: true});
        log(k, JSON.stringify(v).slice(0, 2000));
    };
    const cu = (ctx, p = '', lang = 'en') => app.url(`/index.php/${ctx}/${lang}${p}`);
    const stateFile = outFile('i03b-state.json');
    let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({t: Date.now(), type: d.type(), msg: d.message(), url: rel(page.url())});
        await d.accept().catch(() => {});
    });
    const bad = [];
    page.on('response', (r) => {
        if (r.status() >= 400) bad.push({t: Date.now(), status: r.status(), method: r.request().method(), url: rel(r.url()).slice(0, 200)});
    });
    const since = (arr, t0) => arr.filter((x) => x.t >= t0).map(({t, ...x}) => x);

    const snap = async (name, extra = {}) => {
        let s;
        try {
            s = await screen(page);
        } catch (e) {
            s = {url: page.url(), error: flat(e.message, 200)};
        }
        record(`i03b-${name}`, {...s, extra});
        await shot(page, `i03b-${name}`).catch(() => {});
        return s;
    };
    const go = async (url) => {
        const r = await page.goto(url).catch((e) => ({error: flat(e.message, 200)}));
        await idle(page).catch(() => {});
        await sleep(600);
        return r && r.status ? r.status() : r;
    };
    const as = async (u) => {
        await signIn(page, u);
        await idle(page).catch(() => {});
    };

    /** Every visible form in the visible tab panels: its language buttons and each multilingual box's state. */
    const readForms = () =>
        page.evaluate(() => {
            const vis = (e) => !!(e && e.getClientRects().length);
            const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const forms = [...document.querySelectorAll('form')].filter((f) => vis(f) && f.querySelector('.pkpFormGroup'));
            return forms.map((f) => {
                const groups = [...f.querySelectorAll('.pkpFormGroup__localeGroup')].map((g) =>
                    [...g.querySelectorAll(':scope > .pkpFormGroup__locale')].map((l) => {
                        const ctl = l.querySelector('[id*="-control-"]');
                        const label = l.querySelector('.pkpFormFieldLabel');
                        return {
                            id: ctl ? ctl.id : null,
                            label: label ? txt(label) : null,
                            isVisibleClass: l.classList.contains('pkpFormGroup__locale--isVisible'),
                            shown: vis(l),
                            value: ctl && 'value' in ctl ? String(ctl.value || '').slice(0, 60) : null,
                            progress: txt(l.querySelector('.pkpFormField__multilingualProgress, [class*="ultilingualProgress"]')),
                        };
                    })
                );
                const progress = (f.innerText.match(/\d+\/\d+ languages? completed/g) || []);
                return {
                    id: f.id || null,
                    locales: [...f.querySelectorAll('.pkpFormLocales > *')].map((b) => ({
                        tag: b.tagName,
                        text: txt(b),
                        active: b.classList.contains('pkpFormLocales__locale--isActive'),
                        primary: b.classList.contains('pkpFormLocales__locale--isPrimary'),
                    })),
                    groups,
                    progress,
                    status: txt(f.querySelector('.pkpFormPage__status')),
                    errors: [...f.querySelectorAll('.pkpFieldError')].filter(vis).map((e) => `${e.id}: ${txt(e)}`),
                    footer: txt(f.querySelector('.pkpFormPage__footer')),
                };
            });
        });
    /** The one visible form whose boxes carry `prefix` (`masthead-`, `contact-`, `privacy-`). */
    const formRead = async (prefix) => {
        const all = await readForms();
        const f = all.find((x) => x.groups.some((g) => g.some((b) => (b.id || '').startsWith(prefix))));
        return f || {missing: prefix, ids: all.map((x) => x.id)};
    };
    /** A compact view: per language, the boxes shown. */
    const brief = (f) => {
        if (!f || f.missing) return f;
        const by = {};
        for (const g of f.groups) for (const b of g) {
            const loc = (b.id || '').replace(/^.*-control-/, '');
            by[loc] = by[loc] || {shown: [], hidden: []};
            (b.shown ? by[loc].shown : by[loc].hidden).push(b.label || b.id);
        }
        return {buttons: f.locales, progress: [...new Set(f.progress)], perLanguage: by};
    };
    const pressLocale = async (formPrefix, text) => {
        const form = page.locator('form').filter({has: page.locator(`[id^="${formPrefix}"]`)}).first();
        // each context here has one language besides the primary one: its button is the form's only one
        // (worded by the screens' language: "English"/"French" in English); `text` is what is expected
        const buttons = form.locator('.pkpFormLocales button');
        const n = await buttons.count();
        if (!n) return {pressed: false, buttons: 0};
        const btn = buttons.first();
        const label = flat(await btn.innerText().catch(() => ''));
        await btn.click();
        await sleep(500);
        return {pressed: true, buttons: n, label, expected: text};
    };
    const pressTab = async (id) => {
        const t = page.locator(`#${id}-button`).first();
        if (!(await t.count())) return false;
        await t.click();
        await idle(page).catch(() => {});
        await sleep(500);
        return true;
    };

    /** The Fields drive on one context: arrival, presses, a tab switch, a reload; read-only unless `writes`. */
    const fieldsDrive = async (key, ctx, lang, {writes = false, other = 'English'} = {}) => {
        const out = {};
        const t0 = Date.now();
        out.status = await go(cu(ctx, '/management/settings/context', lang));
        await page.locator('[id^="masthead-name-control-"]').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await idle(page).catch(() => {});
        await snap(`${key}-masthead-arrival`);
        out.mastheadArrival = brief(await formRead('masthead-'));
        out.press1 = await pressLocale('masthead-', other);
        await snap(`${key}-masthead-press1`);
        out.mastheadAfterPress1 = brief(await formRead('masthead-'));
        out.press2 = await pressLocale('masthead-', other);
        out.mastheadAfterPress2 = brief(await formRead('masthead-'));
        // leave the boxes in the state after press 1 (pressed once more), then move between tabs
        out.press3 = await pressLocale('masthead-', other);
        out.mastheadAfterPress3 = brief(await formRead('masthead-'));
        out.contactTab = await pressTab('contact');
        await snap(`${key}-contact-arrival`);
        out.contactArrival = brief(await formRead('contact-'));
        out.contactPress1 = await pressLocale('contact-', other);
        out.contactAfterPress1 = brief(await formRead('contact-'));
        await pressTab('masthead');
        out.mastheadBackFromContact = brief(await formRead('masthead-'));
        await page.reload().catch(() => {});
        await page.locator('[id^="masthead-name-control-"]').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await idle(page).catch(() => {});
        await sleep(600);
        await snap(`${key}-masthead-reload`);
        out.mastheadAfterReload = brief(await formRead('masthead-'));
        // Settings › Website › Setup › Privacy Statement: another page's per-language form
        await go(cu(ctx, '/management/settings/website', lang));
        await pressTab('setup');
        const priv = (await page.locator('#privacy-button').count()) ? 'privacy' : null;
        if (priv) await pressTab(priv);
        await snap(`${key}-privacy-arrival`);
        out.privacyArrival = brief(await formRead('privacy-'));
        out.privacyPress1 = await pressLocale('privacy-', other);
        out.privacyAfterPress1 = brief(await formRead('privacy-'));
        out.bad = since(bad, t0);
        out.dialogs = since(dialogs, t0);
        if (!writes) return out;

        // Writes (scratch only): required title per language, then an unsaved change left two ways.
        const w = {};
        const t1 = Date.now();
        await go(cu(ctx, '/management/settings/context', lang));
        await page.locator('[id^="masthead-name-control-"]').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await idle(page).catch(() => {});
        const form = page.locator('form').filter({has: page.locator('[id^="masthead-name-control-"]')}).first();
        const fr = page.locator('[id="masthead-name-control-fr_CA"]');
        const en = page.locator('[id="masthead-name-control-en"]');
        const save = async (name) => {
            const ts = Date.now();
            const resp = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: 10_000}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            const r = await resp;
            await sleep(1200);
            const s = await snap(`${key}-save-${name}`);
            return {answer: r ? r.status() : 'none sent', notices: s.notices, form: await formRead('masthead-').then((f) => ({status: f.status, errors: f.errors, footer: f.footer})), bad: since(bad, ts)};
        };
        const frWas = await fr.inputValue().catch(() => null);
        const enWas = await en.inputValue().catch(() => null);
        w.before = {fr: frWas, en: enWas, enShown: await en.isVisible().catch(() => null), frShown: await fr.isVisible().catch(() => null)};
        if (!(await en.isVisible().catch(() => false))) await pressLocale('masthead-', other);
        await en.fill('');
        await en.blur();
        w.enEmptied = await save('en-emptied');
        await page.reload();
        await page.locator('[id^="masthead-name-control-"]').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await idle(page).catch(() => {});
        w.afterReloadEn = await en.inputValue().catch(() => null);
        await fr.fill('');
        await fr.blur();
        w.frEmptied = await save('fr-emptied');
        await fr.fill(frWas || 'u07i03b titre');
        await fr.blur();
        if (!(await en.isVisible().catch(() => false))) await pressLocale('masthead-', other);
        await en.fill(enWas || 'u07i03b title');
        await en.blur();
        w.restored = await save('restored');
        // unsaved change, then a top tab and back
        await fr.fill(`${frWas || 'titre'} unsaved`);
        await fr.blur();
        await pressTab('contact');
        await pressTab('masthead');
        w.afterTopTab = {fr: await fr.inputValue().catch(() => null)};
        // then the side menu's "Website"
        const td = Date.now();
        const side = page.locator('nav a[href*="/management/settings/website"]').first();
        w.sideLink = await side.count();
        if (w.sideLink) {
            await side.click().catch(() => {});
            await page.waitForURL(/settings\/website/, {timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
        }
        w.leaveDialogs = since(dialogs, td);
        await go(cu(ctx, '/management/settings/context', lang));
        w.afterLeave = {fr: await fr.inputValue().catch(() => null)};
        w.bad = since(bad, t1);
        out.writes = w;
        return out;
    };

    try {
        // ------------------------------------------------------------------ make
        if (PHASES.includes('make')) {
            const t0 = Date.now();
            const path = tag('u07i03b');
            await as('admin');
            await go(app.url('/index.php/index/en/admin/contexts'));
            await page.locator('#contextGridContainer tr.gridRow').first().waitFor({timeout: T});
            await snap('make-hosted');
            await page.locator('#contextGridContainer .header a[id*="createContext"]').first().click();
            await page.locator('[id^="context-name-control"]').first().waitFor({state: 'visible', timeout: T});
            await idle(page).catch(() => {});
            await sleep(800);
            const cf = page.locator('form').filter({has: page.locator('[id^="context-name-control"]')}).last();
            const createArrival = brief(await formRead('context-'));
            await snap('make-create-arrival');
            const setText = async (id, v) => {
                const i = cf.locator(`[id="${id}"]`).first();
                await i.fill(v);
                await i.blur().catch(() => {});
            };
            await setText('context-name-control-en', `${path} EN`);
            const frBtn = cf.locator('.pkpFormLocales button').filter({hasText: /^\s*French/}).first();
            if (await cf.locator('[id="context-name-control-fr_CA"]').first().isHidden().catch(() => true)) await frBtn.click().catch(() => {});
            await sleep(400);
            await setText('context-name-control-fr_CA', `${path} FR`);
            await setText('context-acronym-control-en', 'UIB');
            await setText('context-acronym-control-fr_CA', 'UIB');
            await setText('context-contactName-control', 'Ina Tester');
            await setText('context-contactEmail-control', `${path}@example.org`);
            await cf.locator('select[name="country"]').first().selectOption({label: 'Canada'}).catch(() => {});
            await setText('context-urlPath-control', path);
            for (const code of ['en', 'fr_CA']) {
                const b = cf.locator(`input[name="supportedLocales"][value="${code}"]`).first();
                if ((await b.count()) && !(await b.isChecked())) await b.click();
            }
            const prim = cf.locator('input[name="primaryLocale"][value="fr_CA"]').first();
            if (await prim.count()) await prim.click();
            await sleep(300);
            const answered = page.waitForResponse((r) => /\/api\/v1\/contexts(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000});
            await cf.getByRole('button', {name: 'Save', exact: true}).click();
            const resp = await answered;
            let body = null;
            try {
                body = await resp.json();
            } catch (e) {
                body = null;
            }
            await idle(page).catch(() => {});
            await sleep(1500);
            await snap('make-after-create');
            state = {path, id: body && body.id, primaryLocale: body && body.primaryLocale, supportedLocales: body && body.supportedLocales, supportedFormLocales: body && body.supportedFormLocales};
            saveState();
            fact('make', {createArrival, answer: resp.status(), state, landedOn: rel(page.url())});

            // Settings › Website › Setup › Languages: "Forms" for English
            await go(cu(path, '/management/settings/website', 'en'));
            await pressTab('setup');
            await pressTab('languages');
            await page.locator('#languageGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            await snap('make-languages');
            const cellRead = () =>
                page.evaluate(() =>
                    [...document.querySelectorAll('#languageGridContainer tr.gridRow')].map((tr) => ({
                        id: tr.id.replace(/^.*-row-/, ''),
                        cells: [...tr.querySelectorAll('input')].map((i) => `${i.id.replace(/^select-cell-/, '').replace(/-[^-]*$/, '')}:${i.checked ? 'X' : '-'}`),
                    }))
                );
            const langBefore = await cellRead();
            const {withLocaleInstall} = require('../../../support/locale-install.js');
            const cell = page.locator('#languageGridContainer input[id^="select-cell-en-formLocale"]').first();
            let formAnswer = null;
            if ((await cell.count()) && !(await cell.isChecked())) {
                formAnswer = await withLocaleInstall(async () => {
                    const a = page.waitForResponse((r) => r.request().method() === 'POST' && /language-grid\//.test(r.url()), {timeout: 60_000});
                    await cell.click();
                    return (await a).status();
                });
                await idle(page).catch(() => {});
                await sleep(800);
            }
            const langAfter = await cellRead();
            fact('makeLanguages', {langBefore, formAnswer, langAfter, bad: since(bad, t0), dialogs: since(dialogs, t0)});
        }
        if (!state.path) throw new Error(`no scratch context in ${stateFile}: run PHASES=make first`);
        const ctx = state.path;

        // ------------------------------------------------------------------ invite
        if (PHASES.includes('invite')) {
            const t0 = Date.now();
            const email = `${ctx}-inv@example.org`;
            await as('admin');
            await go(cu(ctx, '/management/settings/access', 'en'));
            await snap('invite-users-roles');
            await page.getByRole('button', {name: 'Invite to a role'}).click();
            await page.waitForURL(/invitation\/create/, {timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            await page.getByLabel(/Search for a user by email address/).fill(email);
            await page.getByRole('button', {name: 'Search User', exact: true}).click();
            await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
            await idle(page).catch(() => {});
            await sleep(600);
            await snap('invite-details');
            const detailsForm = brief((await readForms())[0]);
            await page.getByLabel(/^Given Name/).first().fill('Ivo');
            await page.getByLabel(/^Family Name/).first().fill('Invitee');
            const row = page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
            const roleSelect = row.getByLabel(/^Select a new role/);
            const roleOptions = await roleSelect.locator('option').allInnerTexts().then((a) => a.map((x) => flat(x)));
            await roleSelect.selectOption({label: L.role});
            await row.getByRole('textbox').fill(new Date().toISOString().slice(0, 10));
            await row.getByRole('combobox').last().selectOption({label: 'Appear on the masthead'});
            await page.getByRole('button', {name: 'Save And Continue'}).click();
            await page.getByLabel(/^Subject/).waitFor({timeout: T});
            await page.waitForFunction(() => {
                const s = [...document.querySelectorAll('input')].find((i) => /subject/i.test(i.id + i.name));
                return !s || s.value !== '';
            }, null, {timeout: T}).catch(() => {});
            await sleep(1500);
            await snap('invite-compose');
            const subject = await page.getByLabel(/^Subject/).inputValue().catch(() => null);
            const composeBody = flat(await page.frameLocator('iframe').first().locator('body').innerText().catch(() => ''), 3000);
            const sentAt = new Date(Date.now() - 2000);
            await page.getByRole('button', {name: 'Invite user to the role'}).click();
            await page.getByRole('dialog').filter({hasText: 'Invitation Sent'}).waitFor({timeout: T}).catch(() => {});
            await snap('invite-sent');
            let mail = null;
            try {
                const m = await app.mail.find({to: email, since: sentAt, timeoutMs: 60_000});
                const full = await app.mail.fullMessage(m.ID);
                const text = String(full.Text || '');
                mail = {
                    subject: full.Subject,
                    from: (full.From || {}).Address,
                    to: (full.To || []).map((x) => `${x.Name} <${x.Address}>`),
                    text: text.slice(0, 4000),
                    roleLines: text.split('\n').filter((l) => /##|Moderator|editor|Rédact|masthead|Entête|rôle|role/i.test(l)).map((l) => flat(l, 300)),
                    rawKeysText: [...new Set(text.match(/##[^#\s]+##/g) || [])],
                    rawKeysHtml: [...new Set(String(full.HTML || '').match(/##[^#\s]+##/g) || [])],
                };
                fs.writeFileSync(outFile('i03b-mail.html'), String(full.HTML || ''));
            } catch (e) {
                mail = {error: flat(e.message, 300)};
            }
            fact('invite', {email, role: L.role, roleOptions, detailsForm, subject, composeBody, composeRawKeys: [...new Set(composeBody.match(/##[^#\s]+##/g) || [])], mail, bad: since(bad, t0), dialogs: since(dialogs, t0)});
        }

        // ------------------------------------------------------------------ fields (scratch, French primary)
        if (PHASES.includes('fields')) {
            await as('admin');
            fact('fieldsScratchEn', await fieldsDrive('scratch-en', ctx, 'en', {writes: true, other: 'English'}));
        }

        // ------------------------------------------------------------------ control (publicknowledge, English primary)
        if (PHASES.includes('control')) {
            for (const [user, lang, other] of [['rvaca', 'en', 'French'], ['dbarnes', 'en', 'French'], ['rvaca', 'fr_CA', 'French']]) {
                await as(user);
                fact(`control-${user}-${lang}`, await fieldsDrive(`pk-${user}-${lang}`, app.contextPath, lang, {other}));
            }
            // the French screens set the session's language: back to English for the next sign-in
            await go(cu(app.contextPath, '/management/settings/context', 'en'));
        }

        // ------------------------------------------------------------------ ops4 (OPS4's own claims; OJS, OMP the control)
        if (PHASES.includes('ops4')) {
            const t0 = Date.now();
            const heads = () => page.evaluate(() => {
                const m = document.querySelector('.pkp_structure_main') || document.body;
                return [...m.querySelectorAll('h1, h2, h3, h4')].map((h) => `${h.tagName}:${h.innerText.replace(/\s+/g, ' ').trim()}`);
            });
            const keys = (sel) => page.evaluate((s) => {
                const root = document.querySelector(s) || document.body;
                const re = /##[^#\s]+##/g;
                const attrs = [...root.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.value)).join(' ');
                return {text: [...new Set(root.innerText.match(re) || [])], attrs: [...new Set(attrs.match(re) || [])]};
            }, sel);
            const out = {};
            await signOut(page).catch(() => {});
            for (const lang of ['fr_CA', 'en']) {
                out[`masthead-${lang}`] = {status: await go(cu(app.contextPath, '/about/editorialMasthead', lang))};
                await snap(`ops4-masthead-${lang}`);
                out[`masthead-${lang}`].heads = await heads();
                out[`masthead-${lang}`].keys = await keys('.pkp_structure_main');
            }
            await as('rvaca');
            await go(cu(app.contextPath, '/management/settings/website', 'fr_CA'));
            await pressTab('appearance');
            const tab = page.locator('#appearance [role="tab"]').filter({hasText: /Entête|Editorial Masthead/}).first();
            out.appearanceTabs = (await page.locator('#appearance [role="tab"]').allInnerTexts().catch(() => [])).map((x) => flat(x));
            if (await tab.count()) {
                await tab.click();
                await idle(page).catch(() => {});
                await sleep(600);
            }
            await snap('ops4-appearance-masthead-fr_CA');
            const form = page.locator('#appearance [role="tabpanel"]:visible form').first();
            out.appearanceForm = flat(await form.innerText().catch(() => ''), 1500);
            out.appearanceButtons = await form.locator('button').evaluateAll((bs) => bs.map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter((t) => /position|##/.test(t))).catch(() => []);
            out.appearanceKeys = await keys('#appearance');
            await go(cu(app.contextPath, '/management/settings/access', 'fr_CA'));
            await page.locator('table').first().waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            await snap('ops4-users-fr_CA');
            out.usersKeys = await keys('main');
            await go(cu(app.contextPath, '/management/settings/access', 'en'));
            out.bad = since(bad, t0);
            fact('ops4', out);
        }
    } finally {
        await close();
    }
});
